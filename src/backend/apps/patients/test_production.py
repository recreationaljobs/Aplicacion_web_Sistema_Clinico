from datetime import date

from django.apps import apps
from django.db import connection, DatabaseError, transaction
from unittest import skipUnless
from django.core.exceptions import ValidationError
from django.test import override_settings
from rest_framework.test import APITestCase

from apps.users.models import RolePermissionPreset, User
from .models import ClinicalRecord, Consultation, Patient


class ClinicalTraceabilityTests(APITestCase):
    def test_malformed_odontogram_findings_return_validation_error(self):
        from rest_framework.exceptions import ValidationError as ApiValidationError
        from .odontograms import normalize_teeth_snapshot
        from .models import OdontogramVersion

        for layer in ({"whole": [{}]}, {"surfaces": {"MESIAL": [["CARIES"]]}}):
            with self.subTest(layer=layer), self.assertRaises(ApiValidationError):
                normalize_teeth_snapshot(
                    {"11": {"reviewed": True, "current": layer}},
                    OdontogramVersion.Dentition.PERMANENT,
                )

    def setUp(self):
        self.actor = User.objects.create_user(email="trace@example.test", password="Synthetic123!", role="RECEPCIONISTA")
        self.dentist = User.objects.create_user(email="trace-dentist@example.test", password="Synthetic123!", role="ODONTOLOGO")
        self.patient = Patient.objects.create(first_name="Ana", last_name="Perez", birth_place="Managua", phone="88881111", gender="FEMENINO", date_of_birth=date(1990, 1, 1), registered_by=self.actor)
        ClinicalRecord.objects.create(patient=self.patient, allergies="Original allergy")
        self.url = f"/api/patients/{self.patient.pk}/"
        self.client.force_authenticate(self.actor)
        preset = RolePermissionPreset.objects.get(role="RECEPCIONISTA")
        preset.permissions = list(set(preset.permissions + ["patients.edit"]))
        preset.save()

    @override_settings(REQUIRE_EDIT_VERSION=True)
    def test_clinical_changes_require_reason_without_writing(self):
        response = self.client.patch(self.url, {"expected_version": self.patient.version, "clinical_record": {"allergies": "Changed"}}, format="json")
        self.assertEqual(response.status_code, 400)
        self.patient.clinical_record.refresh_from_db()
        self.assertEqual(self.patient.clinical_record.allergies, "Original allergy")

    def test_revisions_preserve_original_and_new_content_with_author(self):
        response = self.client.patch(self.url, {"expected_version": self.patient.version, "clinical_change_reason": "Patient clarified allergy", "clinical_record": {"allergies": "Updated allergy"}}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        history = self.client.get(self.url + "clinical-record/revisions/")
        self.assertEqual(history.status_code, 200)
        snapshots = history.data["results"]
        self.assertEqual(len(snapshots), 2)
        self.assertEqual(snapshots[0]["snapshot"]["allergies"], "Updated allergy")
        self.assertEqual(snapshots[0]["author_id"], self.actor.pk)
        self.assertEqual(snapshots[1]["snapshot"]["allergies"], "Original allergy")

    def test_administrative_changes_do_not_require_clinical_reason(self):
        response = self.client.patch(self.url, {"phone": "88882222"}, format="json")
        self.assertEqual(response.status_code, 200)

    def test_completed_consultation_accepts_immutable_addendum_without_changing_original(self):
        consultation = Consultation.objects.create(patient=self.patient, professional=self.dentist, date=date(2026, 9, 16), time="09:00", consultation_type="GENERAL", summary="Original summary", status="COMPLETADA")
        self.client.force_authenticate(self.dentist)
        url = self.url + f"consultations/{consultation.pk}/amendments/"
        response = self.client.post(url, {"reason": "Correct transcription", "content": "Corrected clinical note"}, format="json")
        self.assertEqual(response.status_code, 201)
        consultation.refresh_from_db()
        self.assertEqual(consultation.summary, "Original summary")
        self.assertEqual(consultation.status, "COMPLETADA")
        history = self.client.get(url)
        self.assertEqual(history.status_code, 200)
        self.assertEqual(history.data["results"][0]["content"], "Corrected clinical note")
        amendment = apps.get_model("patients", "ConsultationAmendment").objects.get(pk=response.data["id"])
        with self.assertRaises(ValidationError):
            amendment.delete()

    def test_reception_cannot_create_clinical_addendum(self):
        consultation = Consultation.objects.create(patient=self.patient, professional=self.dentist, date=date(2026, 9, 16), time="09:00", consultation_type="GENERAL", summary="Original", status="COMPLETADA")
        response = self.client.post(self.url + f"consultations/{consultation.pk}/amendments/", {"reason": "Correction", "content": "Note"}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_malformed_surfaces_return_validation_errors(self):
        consultation = Consultation.objects.create(patient=self.patient, professional=self.dentist, date=date(2026, 9, 16), time="09:00", consultation_type="GENERAL", summary="Original", status="EN_PROGRESO")
        self.client.force_authenticate(self.dentist)
        for surfaces in ([{}], [["MESIAL"]]):
            with self.subTest(surfaces=surfaces):
                response = self.client.post(self.url + f"consultations/{consultation.pk}/treatment-items/", {"description": "Synthetic procedure", "tooth_code": "11", "surfaces": surfaces}, format="json")
                self.assertEqual(response.status_code, 400)

    @skipUnless(connection.vendor == "postgresql", "Requires PostgreSQL")
    def test_database_rejects_direct_history_and_audit_updates(self):
        from apps.audit.models import AuditEvent
        response = self.client.patch(self.url, {"clinical_change_reason": "Clarification", "clinical_record": {"allergies": "Updated"}}, format="json")
        self.assertEqual(response.status_code, 200)
        for table in ("patients_clinicalrevision", "audit_auditevent"):
            with self.subTest(table=table), self.assertRaises(DatabaseError), transaction.atomic():
                with connection.cursor() as cursor:
                    column = "reason" if table == "patients_clinicalrevision" else "action"
                    cursor.execute(f'UPDATE "{table}" SET "{column}" = %s', ["tampered"])
