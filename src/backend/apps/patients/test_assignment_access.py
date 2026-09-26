from datetime import UTC, date, datetime, time, timedelta
from unittest.mock import patch

from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase

from apps.appointments.models import Appointment
from apps.clinics.models import ClinicProfile
from apps.common.test_utils import open_clinic_days
from apps.users.models import RolePermissionPreset, User
from apps.users.permissions import PERMISSION_CODES
from .models import Consultation, OdontogramVersion, Patient, PatientDocument, TreatmentItem
from .odontograms import create_initial_odontogram_version


class DentistAssignmentTests(APITestCase):
    def setUp(self):
        open_clinic_days()
        ClinicProfile.objects.update_or_create(pk=1, defaults={"timezone": "America/Managua"})
        self.admin = User.objects.create_user(email="admin@assignment.test", role="ADMINISTRADOR")
        self.reception = User.objects.create_user(email="reception@assignment.test", role="RECEPCIONISTA")
        self.yader = User.objects.create_user(email="yader@assignment.test", role="ODONTOLOGO")
        self.bryan = User.objects.create_user(email="bryan@assignment.test", role="ODONTOLOGO")
        self.patient = self.make_patient("Juan")
        self.unassigned = self.make_patient("Sin asignar")
        self.client.force_authenticate(self.yader)
        self.now = datetime(2026, 9, 26, 16, 0, tzinfo=UTC)

    def make_patient(self, name):
        return Patient.objects.create(first_name=name, last_name="Pérez", birth_place="Managua",
            phone="88888888", gender="MASCULINO", date_of_birth=date(1990, 1, 1), registered_by=self.admin)

    def book(self, dentist=None, patient=None, **changes):
        values = dict(patient=patient or self.patient, dentist=dentist or self.yader,
            date=date(2026, 9, 26), start_time=time(10), duration_minutes=30,
            reason="Revisión", created_by=self.reception)
        values.update(changes)
        return Appointment.objects.create(**values)

    def start(self, appointment, now=None):
        with patch("django.utils.timezone.now", return_value=now or self.now):
            return self.client.post(f"/api/appointments/{appointment.pk}/start-attendance/")

    def clinical(self, dentist, appointment):
        consultation = Consultation.objects.create(patient=appointment.patient, professional=dentist,
            date=appointment.date, time=appointment.start_time, consultation_type="GENERAL",
            summary=f"Privado {dentist.email}", status="EN_PROGRESO")
        appointment.consultation = consultation
        appointment.status = "EN_ATENCION"
        appointment.save()
        create_initial_odontogram_version(consultation)
        return consultation

    def test_unassigned_patient_denied_even_with_all_capabilities(self):
        RolePermissionPreset.objects.update_or_create(role="ODONTOLOGO", defaults={"permissions": list(PERMISSION_CODES)})
        self.assertEqual(self.client.get(f"/api/patients/{self.patient.pk}/").status_code, 404)
        self.assertEqual(self.client.get("/api/patients/").data["count"], 0)

    def test_own_current_and_historical_patients_are_distinct(self):
        self.book(date=date(2020, 1, 1), status="COMPLETADA")
        self.book()
        self.book(self.bryan, self.unassigned)
        result = self.client.get("/api/patients/").data
        self.assertEqual([p["id"] for p in result["results"]], [self.patient.pk])
        self.client.force_authenticate(self.bryan)
        self.assertEqual([p["id"] for p in self.client.get("/api/patients/").data["results"]], [self.unassigned.pk])

    def test_administrator_and_reception_keep_patient_registration_and_booking(self):
        for actor in (self.admin, self.reception):
            self.client.force_authenticate(actor)
            self.assertEqual(self.client.get("/api/patients/").data["count"], 2)
        created = self.client.post("/api/patients/?mode=quick", {
            "first_name": "María", "last_name": "López", "phone": "88887777",
            "date_of_birth": "1990-01-01", "gender": "FEMENINO", "birth_place": "Managua",
        }, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        booked = self.client.post("/api/appointments/", {
            "patient": created.data["id"], "dentist": self.yader.pk, "date": "2026-09-26",
            "start_time": "10:00", "duration_minutes": 30, "reason": "Revisión",
        }, format="json")
        self.assertEqual(booked.status_code, 201, booked.data)
        self.client.force_authenticate(self.yader)
        self.assertEqual(self.client.get(f'/api/patients/{created.data["id"]}/').status_code, 200)

    def test_other_dentist_appointment_hidden_even_with_view_all(self):
        RolePermissionPreset.objects.update_or_create(role="ODONTOLOGO", defaults={"permissions": list(PERMISSION_CODES)})
        appointment = self.book(self.bryan)
        self.assertEqual(self.client.get("/api/appointments/").data["count"], 0)
        self.assertEqual(self.client.get(f"/api/appointments/{appointment.pk}/").status_code, 404)
        self.assertEqual(self.start(appointment).status_code, 404)

    def test_start_time_boundaries_and_cancelled_states(self):
        for offset, state, expected in [(-86400, "PROGRAMADA", 409), (-1, "CONFIRMADA", 409),
                (1800, "PRESENTE", 409), (0, "CANCELADA", 409), (0, "NO_ASISTIO", 409),
                (0, "COMPLETADA", 409), (0, "PROGRAMADA", 201)]:
            with self.subTest(offset=offset, state=state):
                appointment = self.book(status=state)
                response = self.start(appointment, self.now + timedelta(seconds=offset))
                self.assertEqual(response.status_code, expected, response.data)
                if expected == 201:
                    self.assertEqual(response.data["consultation"]["time"], "10:00:00")
                # Release overlapping fixture slots, keeping clinical data intact.
                Appointment.objects.filter(pk=appointment.pk).update(status="CANCELADA")

    def test_repeated_start_returns_existing_consultation_after_window(self):
        appointment = self.book()
        first = self.start(appointment)
        second = self.start(appointment, self.now + timedelta(days=1))
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.data["consultation"]["id"], second.data["consultation"]["id"])
        self.assertEqual(Consultation.objects.count(), 1)

    def test_direct_creation_cannot_bypass_appointment(self):
        self.book()
        response = self.client.post(f"/api/patients/{self.patient.pk}/consultations/", {
            "date": "2026-09-26", "time": "10:00", "consultation_type": "GENERAL",
            "summary": "Bypass", "status": "EN_PROGRESO",
        }, format="json")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(Consultation.objects.count(), 0)

    def test_shared_patient_nested_ids_are_isolated(self):
        RolePermissionPreset.objects.update_or_create(
            role="ODONTOLOGO", defaults={"permissions": list(PERMISSION_CODES)},
        )
        self.book()
        other = self.clinical(self.bryan, self.book(self.bryan, start_time=time(11)))
        version = other.odontogram_versions.first()
        base = f"/api/patients/{self.patient.pk}"
        for path in [f"/consultations/{other.pk}/", f"/consultations/{other.pk}/odontogram/",
                f"/consultations/{other.pk}/revisions/", f"/consultations/{other.pk}/amendments/",
                f"/consultations/{other.pk}/treatment-items/", f"/odontogram-versions/{version.pk}/"]:
            with self.subTest(path=path):
                self.assertEqual(self.client.get(base + path).status_code, 404)
        self.assertEqual(self.client.get(base + "/consultations/").data["count"], 0)
        self.assertEqual(self.client.get(base + "/odontogram-versions/").data["count"], 0)
        self.assertEqual(self.client.post(base + f"/consultations/{other.pk}/complete/").status_code, 404)
        self.client.force_authenticate(self.bryan)
        self.assertEqual(self.client.get(base + "/").status_code, 200)
        self.assertEqual(self.client.get(base + "/consultations/").data["count"], 1)

    def test_next_appointment_and_last_consultation_are_own_with_bounded_queries(self):
        self.book(start_time=time(12))
        self.clinical(self.bryan, self.book(self.bryan, start_time=time(11)))
        with patch("django.utils.timezone.now", return_value=self.now):
            first = self.client.get("/api/patients/").data["results"][0]
        self.assertEqual(first["next_appointment_time"], "12:00:00")
        self.assertIsNone(first["last_consultation_date"])
        with CaptureQueriesContext(connection) as small:
            self.client.get("/api/patients/")
        for index in range(5):
            self.book(patient=self.make_patient(str(index)), date=date(2026, 10, index + 1))
        with CaptureQueriesContext(connection) as large:
            self.client.get("/api/patients/")
        self.assertLessEqual(len(large), len(small) + 1)

    def test_odontogram_initial_copy_does_not_leak_other_professional(self):
        other = self.clinical(self.bryan, self.book(self.bryan, start_time=time(11)))
        version = other.odontogram_versions.first()
        OdontogramVersion.objects.filter(pk=version.pk).update(teeth={"11": {"note": "Privado"}})
        own = self.start(self.book())
        self.assertEqual(own.status_code, 201)
        initial = OdontogramVersion.objects.get(consultation_id=own.data["consultation"]["id"])
        self.assertEqual(initial.teeth, {})
        self.assertIsNone(initial.based_on_id)

    def test_capabilities_remain_required_and_status_is_server_calculated(self):
        appointment = self.book()
        with patch("django.utils.timezone.now", return_value=self.now - timedelta(seconds=1)):
            response = self.client.get(f"/api/appointments/{appointment.pk}/")
        self.assertFalse(response.data["attendance"]["can_start"])
        with patch("django.utils.timezone.now", return_value=self.now):
            self.assertTrue(self.client.get(f"/api/appointments/{appointment.pk}/").data["attendance"]["can_start"])
        RolePermissionPreset.objects.update_or_create(role="ODONTOLOGO", defaults={"permissions": []})
        self.assertEqual(self.client.get(f"/api/patients/{self.patient.pk}/").status_code, 403)
        self.assertEqual(self.start(appointment).status_code, 403)

    def test_unassigned_nested_patient_endpoints_and_search_are_closed(self):
        RolePermissionPreset.objects.update_or_create(role="ODONTOLOGO", defaults={"permissions": list(PERMISSION_CODES)})
        base = f"/api/patients/{self.unassigned.pk}"
        for path in ("/consultations/", "/clinical-record/revisions/", "/clinical-record/export/",
                "/documents/", "/odontogram-versions/", "/treatment-items/", "/odontogram/planned-overlay/"):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(base + path).status_code, 404)
        self.assertEqual(self.client.patch(base + "/", {"phone": "123"}).status_code, 404)
        self.assertEqual(self.client.get("/api/patients/options/?search=Pérez").data, [])
        duplicates = self.client.post("/api/patients/duplicate-check/", {"phone": "88888888"}, format="json")
        self.assertEqual(duplicates.data["matches"], [])
        self.assertEqual(self.client.get("/api/patients/dashboard-summary/").data["total_patients"], 0)

    def test_appointment_creation_cannot_self_assign_an_unrelated_patient_by_id(self):
        RolePermissionPreset.objects.update_or_create(role="ODONTOLOGO", defaults={"permissions": list(PERMISSION_CODES)})
        response = self.client.post("/api/appointments/", {
            "patient": self.unassigned.pk, "dentist": self.yader.pk,
            "date": "2026-09-26", "start_time": "10:00", "duration_minutes": 30, "reason": "Bypass",
        }, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Appointment.objects.exists())

    def test_shared_patient_documents_treatments_and_pdf_do_not_leak(self):
        from .test_clinical_record_export import pdf_text

        own = self.clinical(self.yader, self.book())
        other = self.clinical(self.bryan, self.book(self.bryan, start_time=time(11)))
        document = PatientDocument.objects.create(patient=self.patient, consultation=other,
            uploaded_by=self.bryan, original_name="secreto-bryan.pdf", file="not-opened.pdf",
            mime_type="application/pdf", size_bytes=100, document_date=date(2026, 9, 26), category="Privado Bryan")
        item = TreatmentItem.objects.create(proposed_in=other, description="Tratamiento secreto Bryan", status="ACEPTADO")
        base = f"/api/patients/{self.patient.pk}"
        self.assertEqual(self.client.get(base + "/documents/").data["count"], 0)
        self.assertEqual(self.client.get(base + f"/documents/{document.pk}/content/").status_code, 404)
        self.assertEqual(self.client.patch(base + f"/documents/{document.pk}/", {"notes": "Cambio"}).status_code, 404)
        self.assertNotIn("Privado Bryan", self.client.get("/api/patients/document-categories/").data)
        self.assertEqual(self.client.get(base + "/treatment-items/").data["count"], 0)
        self.assertEqual(self.client.post(base + f"/consultations/{other.pk}/treatment-items/{item.pk}/accept/").status_code, 404)
        own_item = TreatmentItem.objects.create(proposed_in=own, description="Propio", status="ACEPTADO")
        cross = self.client.post(base + f"/consultations/{own.pk}/treatment-items/{own_item.pk}/perform/",
            {"performed_in": other.pk}, format="json")
        self.assertEqual(cross.status_code, 404)
        exported = self.client.get(base + "/clinical-record/export/")
        self.assertEqual(exported.status_code, 200)
        text = pdf_text(exported.content)
        self.assertIn("yader@assignment.test", text)
        self.assertNotIn("bryan@assignment.test", text)
        self.assertNotIn("secreto-bryan", text)
        self.assertNotIn("Tratamiento secreto Bryan", text)

    def test_document_cannot_be_attached_to_another_dentists_consultation(self):
        self.book()
        other = self.clinical(self.bryan, self.book(self.bryan, start_time=time(11)))
        document = PatientDocument.objects.create(
            patient=self.patient, uploaded_by=self.yader, original_name="general.pdf",
            file="not-opened.pdf", mime_type="application/pdf", size_bytes=100,
            document_date=date(2026, 9, 26), category="General",
        )
        response = self.client.patch(
            f"/api/patients/{self.patient.pk}/documents/{document.pk}/",
            {"consultation_id": other.pk}, format="json",
        )
        self.assertEqual(response.status_code, 403)
        document.refresh_from_db()
        self.assertIsNone(document.consultation_id)

    def test_clinic_zone_controls_the_start_even_when_django_zone_is_utc(self):
        ClinicProfile.objects.filter(pk=1).update(timezone="America/New_York")
        appointment = self.book()
        self.assertEqual(self.start(appointment, datetime(2026, 9, 26, 13, 59, tzinfo=UTC)).status_code, 409)
        self.assertEqual(self.start(appointment, datetime(2026, 9, 26, 14, 0, tzinfo=UTC)).status_code, 201)
