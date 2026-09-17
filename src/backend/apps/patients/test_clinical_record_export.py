import re
import shutil
import tempfile
from datetime import date, datetime, time, timezone as datetime_timezone
from io import BytesIO
from pathlib import Path

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image
from rest_framework.test import APITestCase

from apps.appointments.models import Appointment
from apps.audit.models import AuditEvent
from apps.clinics.models import ClinicProfile
from apps.users.models import RolePermissionPreset, User

from .models import (
    ClinicalRecord,
    Consultation,
    OdontogramVersion,
    Patient,
    PatientDocument,
    TreatmentItem,
)


def image_file(name="clinic.png", color="navy"):
    content = BytesIO()
    Image.new("RGB", (180, 60), color).save(content, format="PNG")
    return SimpleUploadedFile(name, content.getvalue(), content_type="image/png")


def pdf_text(content):
    """Extract literal text from deliberately uncompressed ReportLab test output."""
    literals = re.findall(rb"\(((?:\\.|[^\\)])*)\)\s*Tj", content)
    decoded = []
    for literal in literals:
        value = re.sub(
            rb"\\([0-7]{1,3})",
            lambda match: bytes((int(match.group(1), 8),)),
            literal,
        )
        value = value.replace(rb"\(", b"(").replace(rb"\)", b")")
        value = value.replace(rb"\\", bytes((92,)))
        decoded.append(value.decode("latin-1", errors="replace"))
    return " ".join(decoded)


@override_settings(
    PRIVATE_MEDIA_STORAGE_BACKEND="apps.patients.documents.PrivateDocumentStorage",
)
class ClinicalRecordExportApiTests(APITestCase):
    def setUp(self):
        self.media_root = Path(tempfile.mkdtemp(prefix="clinical-export-media-"))
        self.private_root = Path(tempfile.mkdtemp(prefix="clinical-export-private-"))
        self.settings_override = override_settings(
            MEDIA_ROOT=self.media_root,
            PRIVATE_MEDIA_ROOT=self.private_root,
        )
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.addCleanup(shutil.rmtree, self.media_root, True)
        self.addCleanup(shutil.rmtree, self.private_root, True)

        self.dentist = User.objects.create_user(
            email="dentist-export@example.test",
            password="SyntheticOnly123!",
            role=User.Role.ODONTOLOGO,
            first_name="Elena",
            last_name="Rivera",
            specialty="Endodoncia",
            professional_registration_number="REG-2048",
        )
        self.receptionist = User.objects.create_user(
            email="reception-export@example.test",
            password="SyntheticOnly123!",
            role=User.Role.RECEPCIONISTA,
        )
        self.patient = Patient.objects.create(
            first_name="Ana",
            last_name="Perez",
            second_last_name="Lopez",
            birth_place="Managua",
            identification_type=Patient.IdentificationType.CEDULA,
            identification_number="001-010190-0001A",
            phone="8888-1111",
            email="ana@example.test",
            address="Barrio Central",
            gender=Patient.Gender.FEMENINO,
            date_of_birth=date(1990, 1, 1),
            registered_by=self.receptionist,
        )
        ClinicalRecord.objects.create(
            patient=self.patient,
            chief_complaint="Dolor dental persistente",
            present_illness_history="Historia longitudinal del paciente",
            family_history="Antecedente familiar controlado",
            allergies="Alergia a penicilina",
            current_medications="Losartan 50 mg",
            relevant_conditions="Hipertension controlada",
            other_clinical_alerts="Atencion con anestesico alternativo",
            dental_diagnoses="Caries profunda en pieza 16",
            treatment_plan="Restauracion y seguimiento",
        )
        self.late_consultation = self.create_consultation(
            date(2026, 8, 20),
            "Consulta posterior control de restauracion",
            status=Consultation.Status.COMPLETED,
        )
        self.early_consultation = self.create_consultation(
            date(2026, 7, 10),
            "Consulta temprana valoracion inicial " + ("detalle clinico " * 260),
            status=Consultation.Status.COMPLETED,
        )
        TreatmentItem.objects.create(
            proposed_in=self.early_consultation,
            description="Restauracion pendiente",
            diagnosis_text="Caries oclusal",
            tooth_code="16",
            surfaces=["OCCLUSAL"],
            status=TreatmentItem.Status.ACCEPTED,
            unit_price_snapshot="850.00",
        )
        TreatmentItem.objects.create(
            proposed_in=self.early_consultation,
            performed_in=self.late_consultation,
            performed_at=datetime(2026, 8, 20, 16, 0, tzinfo=datetime_timezone.utc),
            description="Profilaxis realizada",
            status=TreatmentItem.Status.PERFORMED,
        )
        TreatmentItem.objects.create(
            proposed_in=self.late_consultation,
            description="Extraccion cancelada",
            tooth_code="18",
            status=TreatmentItem.Status.CANCELLED,
            status_reason="Paciente decide conservar la pieza",
        )
        OdontogramVersion.objects.create(
            patient=self.patient,
            consultation=self.late_consultation,
            version_number=1,
            dentition=OdontogramVersion.Dentition.PERMANENT,
            teeth={
                "16": {
                    "reviewed": True,
                    "note": "Sensibilidad",
                    "current": {
                        "whole": ["CROWN"],
                        "surfaces": {"OCCLUSAL": ["CARIES"]},
                    },
                    "planned": {
                        "whole": [],
                        "surfaces": {"OCCLUSAL": ["RESTORATION"]},
                    },
                },
            },
            created_by=self.dentist,
        )
        PatientDocument.objects.create(
            patient=self.patient,
            consultation=self.early_consultation,
            tooth_code="16",
            category="Radiografia",
            document_date=date(2026, 7, 10),
            notes="",
            original_name="periapical-16.pdf",
            mime_type="application/pdf",
            size_bytes=42,
            file=SimpleUploadedFile(
                "periapical-16.pdf",
                b"%PDF-1.4\n%%EOF",
                content_type="application/pdf",
            ),
            uploaded_by=self.dentist,
        )
        self.clinic, _ = ClinicProfile.objects.update_or_create(
            pk=1,
            defaults={
                "name": "Clinica Horizonte A",
                "phone": "2222-3333",
                "email": "contacto@horizonte.test",
                "address": "Avenida Central 123",
                "timezone": "America/Managua",
                "logo": "",
            },
        )
        self.url = f"/api/patients/{self.patient.pk}/clinical-record/export/"
        self.client.force_authenticate(self.dentist)

    def create_consultation(self, consultation_date, summary, *, status):
        return Consultation.objects.create(
            patient=self.patient,
            professional=self.dentist,
            professional_name_snapshot="Dra. Elena Rivera",
            date=consultation_date,
            time=time(9, 30),
            consultation_type=Consultation.Type.GENERAL,
            summary=summary,
            status=status,
            chief_complaint="Molestia al masticar",
            dental_diagnoses="Diagnostico de consulta",
        )

    def export(self, **headers):
        return self.client.get(self.url, **headers)

    def test_authorized_export_is_printable_complete_chronological_and_read_only(self):
        self.patient.is_active = False
        self.patient.save(update_fields=("is_active",))
        counts_before = {
            model.__name__: model.objects.count()
            for model in (
                Patient,
                ClinicalRecord,
                Consultation,
                Appointment,
                OdontogramVersion,
                PatientDocument,
            )
        }
        clinical_snapshot = ClinicalRecord.objects.values().get(patient=self.patient)

        response = self.export(HTTP_X_REQUEST_ID="clinical-export-complete")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertIn("attachment", response["Content-Disposition"])
        self.assertIn(self.patient.code, response["Content-Disposition"])
        self.assertNotIn("Ana", response["Content-Disposition"])
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertEqual(response["Pragma"], "no-cache")
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")
        self.assertTrue(response.content.startswith(b"%PDF-"))
        self.assertTrue(response.content.rstrip().endswith(b"%%EOF"))
        self.assertGreater(len(response.content), 5000)
        self.assertGreaterEqual(response.content.count(b"/Type /Page"), 2)
        text = pdf_text(response.content)
        for expected in (
            "Clinica Horizonte A",
            "Ana Perez Lopez",
            self.patient.code,
            "Alergia a penicilina",
            "Historia longitudinal del paciente",
            "Hipertension controlada",
            "Restauracion pendiente",
            "Profilaxis realizada",
            "Extraccion cancelada",
            "Pieza 16",
            "Caries",
            "Radiografia",
            "periapical-16.pdf",
        ):
            self.assertIn(expected, text)
        self.assertLess(
            text.index("Consulta temprana valoracion inicial"),
            text.index("Consulta posterior control de restauracion"),
        )
        self.assertEqual(
            {
                model.__name__: model.objects.count()
                for model in (
                    Patient,
                    ClinicalRecord,
                    Consultation,
                    Appointment,
                    OdontogramVersion,
                    PatientDocument,
                )
            },
            counts_before,
        )
        self.assertEqual(
            ClinicalRecord.objects.values().get(patient=self.patient),
            clinical_snapshot,
        )

    def test_export_requires_authentication_and_both_clinical_read_capabilities(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.export().status_code, 401)

        preset = RolePermissionPreset.objects.get(role=User.Role.RECEPCIONISTA)
        self.client.force_authenticate(self.receptionist)
        for permissions in (["patients.view"], ["consultations.view"]):
            with self.subTest(permissions=permissions):
                preset.permissions = permissions
                preset.save(update_fields=("permissions",))
                self.assertEqual(self.export().status_code, 403)

        preset.permissions = ["patients.view", "consultations.view"]
        preset.save(update_fields=("permissions",))
        self.assertEqual(self.export().status_code, 200)
        self.assertEqual(
            self.client.get("/api/patients/999999/clinical-record/export/").status_code,
            404,
        )

    def test_export_audit_contains_identity_only_and_no_clinical_content(self):
        response = self.export(HTTP_X_REQUEST_ID="clinical-record-export-audit")

        self.assertEqual(response.status_code, 200)
        event = AuditEvent.objects.get(request_id="clinical-record-export-audit")
        self.assertEqual(event.action, "CLINICAL_RECORD_EXPORT")
        self.assertEqual(event.actor_id, self.dentist.pk)
        self.assertEqual(event.patient_id, self.patient.pk)
        self.assertEqual(event.changed_fields, [])
        self.assertEqual(event.metadata, {})
        self.assertNotIn("Alergia", str(event.__dict__))

    def test_current_institutional_profile_and_logo_are_used_without_snapshots(self):
        self.clinic.logo.save("clinic-a.png", image_file("clinic-a.png", "navy"), save=True)
        first = self.export()
        first_bytes = bytes(first.content)
        first_text = pdf_text(first_bytes)

        self.clinic.name = "Clinica Horizonte B"
        self.clinic.phone = "5555-9999"
        self.clinic.logo.save("clinic-b.png", image_file("clinic-b.png", "green"), save=False)
        self.clinic.save(update_fields=("name", "phone", "logo", "updated_at"))
        second = self.export()
        second_text = pdf_text(second.content)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertIn("Clinica Horizonte A", first_text)
        self.assertNotIn("Clinica Horizonte B", first_text)
        self.assertIn("Clinica Horizonte B", second_text)
        self.assertIn("5555-9999", second_text)
        self.assertIn(b"/Subtype /Image", first_bytes)
        self.assertIn(b"/Subtype /Image", second.content)
        self.assertNotEqual(first_bytes, second.content)
        self.assertEqual(PatientDocument.objects.count(), 1)

    def test_absent_missing_or_corrupt_logo_falls_back_without_leaking_paths(self):
        without_logo = self.export()
        self.assertEqual(without_logo.status_code, 200)
        self.assertNotIn(b"/Subtype /Image", without_logo.content)

        self.clinic.logo.save("missing.png", image_file("missing.png"), save=True)
        stored_name = self.clinic.logo.name
        self.clinic.logo.storage.delete(stored_name)
        missing = self.export()
        self.assertEqual(missing.status_code, 200)

        self.clinic.logo.save(
            "corrupt.png",
            SimpleUploadedFile("corrupt.png", b"not-an-image", content_type="image/png"),
            save=True,
        )
        corrupt = self.export()
        self.assertEqual(corrupt.status_code, 200)
        self.assertIn("Clinica Horizonte A", pdf_text(corrupt.content))
        for content in (without_logo.content, missing.content, corrupt.content):
            self.assertNotIn(str(self.media_root).encode(), content)
            self.assertNotIn(stored_name.encode(), content)

    def test_current_professional_credentials_are_read_without_pdf_snapshots(self):
        first = self.export()
        first_bytes = bytes(first.content)
        first_text = pdf_text(first_bytes)

        self.dentist.specialty = "Rehabilitacion oral"
        self.dentist.professional_registration_number = "REG-4096"
        self.dentist.save(update_fields=(
            "specialty",
            "professional_registration_number",
        ))
        second = self.export()
        second_text = pdf_text(second.content)

        self.assertIn("Endodoncia", first_text)
        self.assertIn("REG-2048", first_text)
        self.assertNotIn("Rehabilitacion oral", first_text)
        self.assertEqual(first.content, first_bytes)
        self.assertIn("Rehabilitacion oral", second_text)
        self.assertIn("REG-4096", second_text)
