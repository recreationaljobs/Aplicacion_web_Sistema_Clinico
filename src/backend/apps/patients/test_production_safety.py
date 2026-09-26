from apps.common.test_utils import assigned_test_consultation
from datetime import date
from unittest.mock import patch
from django.test import override_settings

from rest_framework.exceptions import ValidationError
from rest_framework.test import APITestCase

from apps.users.models import RolePermissionPreset, User
from .models import Consultation, Patient, TreatmentItem
from .odontograms import create_initial_odontogram_version, create_odontogram_revision
from .serializers import ConsultationSerializer, TreatmentItemSerializer


class ClinicalSafetyTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="safety@example.test", role=User.Role.ODONTOLOGO)
        self.patient = Patient.objects.create(
            first_name="Demo", last_name="Paciente", birth_place="Managua",
            date_of_birth=date(1990, 1, 1), gender="FEMENINO", registered_by=self.user,
        )
        self.consultation = assigned_test_consultation(
            patient=self.patient, professional=self.user, date=date(2026, 9, 1),
            time="09:00", consultation_type="GENERAL", summary="Control",
            status=Consultation.Status.IN_PROGRESS,
        )
        self.client.force_authenticate(self.user)

    def test_odontogram_rechecks_closed_state_under_lock(self):
        initial = create_initial_odontogram_version(self.consultation)
        Consultation.objects.filter(pk=self.consultation.pk).update(status=Consultation.Status.COMPLETED)
        with self.assertRaises(ValidationError):
            create_odontogram_revision(
                consultation=self.consultation, author=self.user, base_version_id=initial.pk,
                dentition=initial.dentition, note="Cambio tardío",
                teeth={"11": {"reviewed": True, "current": {"whole": ["CROWN"]}}},
            )
        self.assertEqual(self.consultation.odontogram_versions.count(), 1)

    def test_stale_consultation_patch_cannot_reopen_closed_consultation(self):
        serializer = ConsultationSerializer(self.consultation, data={"summary": "Edición"}, partial=True)
        serializer.is_valid(raise_exception=True)
        Consultation.objects.filter(pk=self.consultation.pk).update(status=Consultation.Status.COMPLETED)
        with self.assertRaises(ValidationError):
            serializer.save()
        self.consultation.refresh_from_db()
        self.assertEqual(self.consultation.status, Consultation.Status.COMPLETED)

    def test_treatment_patch_rechecks_parent_after_validation(self):
        item = TreatmentItem.objects.create(proposed_in=self.consultation, description="Control")
        serializer = TreatmentItemSerializer(
            item, data={"description": "Cambio"}, partial=True,
            context={"consultation": self.consultation},
        )
        serializer.is_valid(raise_exception=True)
        Consultation.objects.filter(pk=self.consultation.pk).update(status=Consultation.Status.CANCELLED)
        with self.assertRaises(ValidationError):
            serializer.save()
        item.refresh_from_db()
        self.assertEqual(item.description, "Control")

    def test_pdf_export_passes_document_permission(self):
        RolePermissionPreset.objects.update_or_create(role=self.user.role, defaults={
            "permissions": ["patients.view", "consultations.view"],
        })
        with patch("apps.patients.views.build_clinical_record_pdf", return_value=b"PDF") as build:
            response = self.client.get(f"/api/patients/{self.patient.pk}/clinical-record/export/")
        self.assertEqual(response.status_code, 200)
        self.assertIs(build.call_args.kwargs.get("include_documents"), False)

    @override_settings(REQUIRE_EDIT_VERSION=True)
    def test_two_editors_cannot_overwrite_each_other(self):
        url = f"/api/patients/{self.patient.pk}/consultations/{self.consultation.pk}/"
        snapshot = self.client.get(url).data
        first = self.client.patch(url, {"summary": "Primero", "expected_version": snapshot.get("version", 1)})
        second = self.client.patch(url, {"summary": "Segundo", "expected_version": snapshot.get("version", 1)})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 409)
        self.assertEqual(second.data["code"], "edit_conflict")
        self.consultation.refresh_from_db()
        self.assertEqual(self.consultation.summary, "Primero")

    @override_settings(REQUIRE_EDIT_VERSION=True)
    def test_version_is_required_for_patient_edits(self):
        self.user.role = User.Role.ADMINISTRADOR
        response = self.client.patch(f"/api/patients/{self.patient.pk}/", {"phone": "88881111"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("expected_version", response.data)
