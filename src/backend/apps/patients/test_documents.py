from apps.common.test_utils import assigned_test_consultation
import shutil
import tempfile
from datetime import date, time
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db.models.deletion import ProtectedError
from django.test import override_settings
from PIL import Image
from rest_framework.test import APITestCase

from apps.common.test_utils import close_test_response
from apps.users.models import RolePermissionPreset, User

from .models import Consultation, Patient, PatientDocument


def png_file(name="radiografia.png", color="white"):
    content = BytesIO()
    Image.new("RGB", (4, 4), color).save(content, format="PNG")
    return SimpleUploadedFile(name, content.getvalue(), content_type="image/png")


def pdf_file(name="informe.pdf", padding=b""):
    from pypdf import PdfWriter
    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    content = BytesIO()
    writer.write(content)
    return SimpleUploadedFile(name, content.getvalue() + padding, content_type="application/pdf")


def corrupt_png_file(name="corrupta.png"):
    valid = png_file(name)
    content = bytearray(valid.read())
    idat_payload = content.index(b"IDAT") + 4
    content[idat_payload] ^= 0xFF
    return SimpleUploadedFile(name, bytes(content), content_type="image/png")


class PatientDocumentApiTests(APITestCase):
    def test_audit_failure_rolls_back_upload_and_removes_the_new_file(self):
        self.client.force_authenticate(self.receptionist)
        with patch("apps.audit.middleware.AuditEvent.objects.create", side_effect=RuntimeError("Audit unavailable")):
            with self.assertRaises(RuntimeError):
                self.client.post(self.list_url(), {
                    "files": [png_file()], "category": "Prueba", "document_date": "2026-08-09",
                }, format="multipart")
        self.assertFalse(PatientDocument.objects.exists())
        self.assertEqual([path for path in self.private_root.rglob("*") if path.is_file()], [])

    def setUp(self):
        self.private_root = Path(tempfile.mkdtemp(prefix="patient-documents-"))
        self.settings_override = override_settings(PRIVATE_MEDIA_ROOT=self.private_root)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.addCleanup(shutil.rmtree, self.private_root, True)

        self.receptionist = User.objects.create_user(
            email="recepcion-documentos@dentalclinic.com",
            password="ContraseñaRecepcion123!",
            role=User.Role.RECEPCIONISTA,
            first_name="Rosa",
            last_name="López",
        )
        self.dentist = User.objects.create_user(
            email="odontologa-documentos@dentalclinic.com",
            password="ContraseñaOdontologa123!",
            role=User.Role.ODONTOLOGO,
            first_name="Elena",
            last_name="Vargas",
        )
        self.admin = User.objects.create_user(
            email="admin-documentos@dentalclinic.com",
            password="ContraseñaAdmin123!",
            role=User.Role.ADMINISTRADOR,
            first_name="Ada",
        )
        self.patient = self.create_patient("001-140190-0001A", "Ana")
        self.other_patient = self.create_patient("001-150190-0002B", "Luis")
        self.consultation = self.create_consultation(self.patient, date(2026, 9, 1))
        self.other_consultation = self.create_consultation(
            self.other_patient,
            date(2026, 9, 2),
        )

    def create_patient(self, identification_number, first_name, **overrides):
        values = {
            "first_name": first_name,
            "last_name": "Pérez",
            "birth_place": "Managua",
            "identification_type": Patient.IdentificationType.CEDULA,
            "identification_number": identification_number,
            "gender": Patient.Gender.FEMENINO,
            "date_of_birth": date(1990, 1, 14),
            "registered_by": self.receptionist,
        }
        values.update(overrides)
        return Patient.objects.create(**values)

    def list_url(self, patient=None):
        return f"/api/patients/{(patient or self.patient).pk}/documents/"

    def create_consultation(self, patient, consultation_date):
        return assigned_test_consultation(
            patient=patient,
            professional=self.dentist,
            date=consultation_date,
            time=time(9, 0),
            consultation_type=Consultation.Type.GENERAL,
            summary="Resumen que no debe exponerse en documentos",
            status=Consultation.Status.COMPLETED,
            dental_diagnoses="Diagnóstico que no debe exponerse",
        )

    def upload(self, *files, patient=None, category="Radiografía dental", **metadata):
        payload = {
            "files": list(files),
            "category": category,
            "document_date": metadata.get("document_date", "2026-08-09"),
            "notes": metadata.get("notes", "Control radiográfico"),
        }
        if "consultation_id" in metadata:
            payload["consultation_id"] = metadata["consultation_id"]
        if "tooth_code" in metadata:
            payload["tooth_code"] = metadata["tooth_code"]
        response = self.client.post(
            self.list_url(patient),
            payload,
            format="multipart",
        )
        self.assertEqual(response.status_code, 201, getattr(response, "data", response.content))
        return response.data

    def test_optional_context_supports_patient_consultation_tooth_and_both(self):
        self.client.force_authenticate(self.receptionist)
        cases = (
            ({}, None, None),
            (
                {"consultation_id": self.consultation.pk},
                {"id": self.consultation.pk, "date": "2026-09-01"},
                None,
            ),
            ({"tooth_code": "16"}, None, "16"),
            (
                {"consultation_id": self.consultation.pk, "tooth_code": "16"},
                {"id": self.consultation.pk, "date": "2026-09-01"},
                "16",
            ),
        )

        for index, (metadata, expected_consultation, expected_tooth) in enumerate(cases):
            with self.subTest(metadata=metadata):
                created = self.upload(
                    png_file(f"contexto-{index}.png"),
                    category="Documento clínico",
                    **metadata,
                )[0]
                self.assertEqual(created["consultation"], expected_consultation)
                self.assertEqual(created["tooth_code"], expected_tooth)
                if expected_consultation:
                    self.assertEqual(set(created["consultation"]), {"id", "date"})

        self.assertEqual(PatientDocument.objects.count(), 4)

    def test_rejects_consultation_from_another_patient_and_invalid_fdi_tooth(self):
        self.client.force_authenticate(self.receptionist)

        wrong_consultation = self.client.post(
            self.list_url(),
            {
                "files": [png_file("ajena.png")],
                "category": "Documento clínico",
                "consultation_id": self.other_consultation.pk,
            },
            format="multipart",
        )
        invalid_tooth = self.client.post(
            self.list_url(),
            {
                "files": [png_file("pieza-invalida.png")],
                "category": "Documento clínico",
                "tooth_code": "19",
            },
            format="multipart",
        )

        self.assertEqual(wrong_consultation.status_code, 400)
        self.assertIn("mismo paciente", str(wrong_consultation.data).lower())
        self.assertEqual(invalid_tooth.status_code, 400)
        self.assertIn("FDI", str(invalid_tooth.data))
        self.assertEqual(PatientDocument.objects.count(), 0)

    def test_clinical_photo_is_an_image_category_in_the_existing_repository(self):
        self.client.force_authenticate(self.receptionist)
        created = self.upload(
            png_file("frontal-clinica.png"),
            category="Fotografía clínica",
        )[0]

        listed = self.client.get(
            self.list_url(),
            {"category": "Fotografía clínica"},
        )
        content = self.client.get(created["content_url"])
        invalid_pdf = self.client.post(
            self.list_url(),
            {
                "files": [pdf_file("no-es-foto.pdf")],
                "category": "Fotografía clínica",
            },
            format="multipart",
        )

        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.data["count"], 1)
        self.assertEqual(listed.data["results"][0]["category"], "Fotografía clínica")
        self.assertEqual(listed.data["results"][0]["mime_type"], "image/png")
        self.assertEqual(content.status_code, 200)
        self.assertEqual(content["Content-Type"], "image/png")
        self.assertEqual(invalid_pdf.status_code, 400)
        self.assertIn("imagen", str(invalid_pdf.data).lower())
        close_test_response(content)

    def test_filters_by_consultation_and_keeps_patient_only_documents_visible(self):
        self.client.force_authenticate(self.receptionist)
        self.upload(png_file("general.png"), category="Documento clínico")
        self.upload(
            png_file("consulta.png"),
            category="Documento clínico",
            consultation_id=self.consultation.pk,
        )

        all_documents = self.client.get(self.list_url())
        filtered = self.client.get(
            self.list_url(),
            {"consultation_id": self.consultation.pk},
        )

        self.assertEqual(all_documents.data["count"], 2)
        self.assertEqual(filtered.status_code, 200)
        self.assertEqual(filtered.data["count"], 1)
        self.assertEqual(filtered.data["results"][0]["original_name"], "consulta.png")

    def test_updates_context_on_existing_url_and_keeps_inactive_patient_read_only(self):
        self.client.force_authenticate(self.receptionist)
        created = self.upload(png_file("editable.png"), category="Documento clínico")[0]
        detail_url = f"{self.list_url()}{created['id']}/"

        updated = self.client.patch(
            detail_url,
            {
                "category": "Fotografía clínica",
                "consultation_id": self.consultation.pk,
                "tooth_code": "16",
            },
            format="json",
        )

        self.assertEqual(updated.status_code, 200, getattr(updated, "data", None))
        self.assertEqual(updated.data["category"], "Fotografía clínica")
        self.assertEqual(
            updated.data["consultation"],
            {"id": self.consultation.pk, "date": "2026-09-01"},
        )
        self.assertEqual(updated.data["tooth_code"], "16")

        self.patient.is_active = False
        self.patient.save(update_fields=("is_active",))
        blocked = self.client.patch(
            detail_url,
            {"consultation_id": None, "tooth_code": None},
            format="json",
        )
        self.assertEqual(blocked.status_code, 400)
        self.assertIn("inactivo", str(blocked.data).lower())

    def test_context_requires_consultation_permission_and_is_hidden_without_it(self):
        self.client.force_authenticate(self.admin)
        created = self.upload(
            png_file("privado.png"),
            category="Documento clínico",
            consultation_id=self.consultation.pk,
            tooth_code="16",
        )[0]
        preset = RolePermissionPreset.objects.get(role=User.Role.RECEPCIONISTA)
        preset.permissions = [
            code for code in preset.permissions if code != "consultations.view"
        ]
        preset.save(update_fields=("permissions",))
        self.client.force_authenticate(self.receptionist)

        listed = self.client.get(self.list_url())
        filtered = self.client.get(
            self.list_url(),
            {"consultation_id": self.consultation.pk},
        )
        attempted_update = self.client.patch(
            f"{self.list_url()}{created['id']}/",
            {"consultation_id": self.consultation.pk},
            format="json",
        )

        self.assertEqual(listed.status_code, 200)
        self.assertIsNone(listed.data["results"][0]["consultation"])
        self.assertIsNone(listed.data["results"][0]["tooth_code"])
        self.assertEqual(filtered.status_code, 403)
        self.assertEqual(attempted_update.status_code, 403)

    def test_linked_consultation_is_protected_from_deletion(self):
        document = PatientDocument.objects.create(
            patient=self.patient,
            consultation=self.consultation,
            original_name="contexto.pdf",
            category="Informe",
            document_date=date(2026, 9, 1),
            mime_type="application/pdf",
            size_bytes=42,
            file=pdf_file("contexto.pdf"),
            uploaded_by=self.dentist,
        )

        with self.assertRaises(ProtectedError):
            self.consultation.delete()

        self.assertTrue(PatientDocument.objects.filter(pk=document.pk).exists())

    def test_default_roles_view_and_create_but_delete_is_not_assigned(self):
        self.client.force_authenticate(self.receptionist)
        created = self.upload(png_file())[0]
        self.assertEqual(self.client.get(self.list_url()).status_code, 200)
        self.assertEqual(
            self.client.delete(f"{self.list_url()}{created['id']}/").status_code,
            403,
        )

        self.client.force_authenticate(self.dentist)
        self.assertEqual(self.client.get(self.list_url()).status_code, 200)
        self.assertEqual(self.upload(pdf_file())[0]["mime_type"], "application/pdf")

    def test_document_list_is_paginated(self):
        self.client.force_authenticate(self.receptionist)
        self.upload(png_file("primero.png"), pdf_file("segundo.pdf"))

        response = self.client.get(self.list_url(), {"page_size": 1})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertIsNotNone(response.data["next"])

    def test_batch_upload_normalizes_metadata_and_never_exposes_private_path(self):
        self.client.force_authenticate(self.receptionist)
        created = self.upload(
            png_file("frontal.png"),
            pdf_file("evaluacion.pdf"),
            category="  Radiografía   Dental  ",
        )

        self.assertEqual(len(created), 2)
        self.assertEqual({item["category"] for item in created}, {"Radiografía Dental"})
        self.assertEqual({item["uploaded_by_name"] for item in created}, {"Rosa López"})
        self.assertTrue(all(item["content_url"].startswith("/api/patients/") for item in created))
        self.assertTrue(all("file" not in item and "private" not in str(item) for item in created))
        stored = [path for path in self.private_root.rglob("*") if path.is_file()]
        self.assertEqual(len(stored), 2)
        self.assertTrue(all(path.name not in {"frontal.png", "evaluacion.pdf"} for path in stored))

    def test_batch_is_atomic_when_one_file_is_invalid(self):
        self.client.force_authenticate(self.receptionist)
        invalid = SimpleUploadedFile("script.pdf", b"not a pdf", content_type="application/pdf")
        response = self.client.post(
            self.list_url(),
            {
                "files": [png_file(), invalid],
                "category": "Informe",
                "document_date": "2026-08-09",
                "notes": "",
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("PDF", str(response.data))
        self.assertEqual(self.client.get(self.list_url()).data["results"], [])
        self.assertEqual([path for path in self.private_root.rglob("*") if path.is_file()], [])

    def test_corrupted_png_returns_validation_error_without_leaving_files(self):
        self.client.force_authenticate(self.receptionist)

        response = self.client.post(
            self.list_url(),
            {
                "files": [corrupt_png_file()],
                "category": "Radiografía",
                "document_date": "2026-08-09",
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("imagen no es válido", str(response.data))
        self.assertEqual(self.client.get(self.list_url()).data["results"], [])
        self.assertEqual([path for path in self.private_root.rglob("*") if path.is_file()], [])

    def test_image_pixel_bomb_returns_validation_error(self):
        self.client.force_authenticate(self.receptionist)

        with patch("PIL.Image.MAX_IMAGE_PIXELS", 1):
            response = self.client.post(
                self.list_url(),
                {
                    "files": [png_file()],
                    "category": "Radiografía",
                    "document_date": "2026-08-09",
                },
                format="multipart",
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.get(self.list_url()).data["results"], [])

    def test_rejects_unsupported_content_extension_size_count_and_batch_size(self):
        self.client.force_authenticate(self.receptionist)
        cases = [
            [SimpleUploadedFile("archivo.svg", b"<svg/>", content_type="image/svg+xml")],
            [png_file("extension-falsa.jpg")],
            [SimpleUploadedFile("imagen.jpg", b"not an image", content_type="image/jpeg")],
            [SimpleUploadedFile("grande.pdf", b"%PDF" + b"x" * (10 * 1024 * 1024) + b"%%EOF", content_type="application/pdf")],
            [png_file(f"foto-{index}.png") for index in range(11)],
            [pdf_file(f"informe-{index}.pdf", b"x" * (9 * 1024 * 1024)) for index in range(6)],
        ]

        for files in cases:
            response = self.client.post(
                self.list_url(),
                {"files": files, "category": "Prueba", "document_date": "2026-08-09"},
                format="multipart",
            )
            self.assertEqual(response.status_code, 400)

    def test_list_search_filter_and_global_category_suggestions(self):
        self.client.force_authenticate(self.receptionist)
        self.upload(png_file("panoramica.png"), category="Radiografía")
        self.upload(pdf_file("consentimiento.pdf"), category="Consentimiento")
        self.upload(png_file("otra.png"), patient=self.other_patient, category="radiografía")

        filtered = self.client.get(f"{self.list_url()}?category=Radiograf%C3%ADa&search=panoramica")
        categories = self.client.get("/api/patients/document-categories/")

        self.assertEqual(filtered.status_code, 200)
        self.assertEqual(
            [item["original_name"] for item in filtered.data["results"]],
            ["panoramica.png"],
        )
        self.assertEqual(categories.status_code, 200)
        self.assertEqual(categories.data, ["Consentimiento", "Radiografía"])

    def test_category_suggestions_preserve_the_first_used_casing(self):
        self.client.force_authenticate(self.receptionist)
        self.upload(png_file("primera.png"), category="radiografía")
        self.upload(png_file("segunda.png"), category="Radiografía")

        categories = self.client.get("/api/patients/document-categories/")

        self.assertEqual(categories.status_code, 200)
        self.assertEqual(categories.data, ["radiografía"])

    def test_content_is_authenticated_patient_scoped_and_uses_private_headers(self):
        self.client.force_authenticate(self.receptionist)
        created = self.upload(pdf_file())[0]
        content_url = created["content_url"]

        inline = self.client.get(content_url)
        download = self.client.get(f"{content_url}?download=true")
        wrong_patient = self.client.get(
            content_url.replace(f"/{self.patient.pk}/", f"/{self.other_patient.pk}/"),
        )
        self.client.force_authenticate(None)
        anonymous = self.client.get(content_url)

        self.assertEqual(inline.status_code, 200)
        self.assertEqual(inline["Content-Type"], "application/pdf")
        self.assertIn("inline", inline["Content-Disposition"])
        self.assertEqual(inline["Cache-Control"], "private, no-store")
        self.assertEqual(inline["X-Content-Type-Options"], "nosniff")
        self.assertIn("attachment", download["Content-Disposition"])
        self.assertEqual(wrong_patient.status_code, 404)
        self.assertEqual(anonymous.status_code, 401)

    def test_inactive_patient_is_read_only_for_documents(self):
        self.client.force_authenticate(self.receptionist)
        created = self.upload(png_file())[0]
        self.patient.is_active = False
        self.patient.save(update_fields=("is_active",))

        listed = self.client.get(self.list_url())
        upload = self.client.post(
            self.list_url(),
            {"files": [png_file("nueva.png")], "category": "Fotografía"},
            format="multipart",
        )
        self.client.force_authenticate(self.admin)
        deleted = self.client.delete(f"{self.list_url()}{created['id']}/")

        self.assertEqual(listed.status_code, 200)
        self.assertEqual(upload.status_code, 400)
        self.assertIn("inactivo", str(upload.data).lower())
        self.assertEqual(deleted.status_code, 400)

    def test_configurable_delete_preserves_file_and_supports_admin_restore(self):
        self.client.force_authenticate(self.receptionist)
        created = self.upload(png_file())[0]
        stored_path = next(path for path in self.private_root.rglob("*") if path.is_file())
        preset = RolePermissionPreset.objects.get(role=User.Role.RECEPCIONISTA)
        preset.permissions = [*preset.permissions, "documents.delete"]
        preset.save(update_fields=("permissions",))

        response = self.client.delete(
            f"{self.list_url()}{created['id']}/", {"reason": "Documento duplicado"}, format="json",
        )

        self.assertEqual(response.status_code, 204)
        self.assertTrue(stored_path.exists())
        self.assertEqual(self.client.get(self.list_url()).data["results"], [])
        self.assertEqual(self.client.get(f"{self.list_url()}?retired=true").status_code, 403)
        self.assertEqual(self.client.get(created["content_url"]).status_code, 404)
        restore_url = f"{self.list_url()}{created['id']}/restore/"
        self.assertEqual(self.client.post(restore_url).status_code, 403)
        self.client.force_authenticate(self.admin)
        retired = self.client.get(f"{self.list_url()}?retired=true")
        self.assertEqual([item["id"] for item in retired.data["results"]], [created["id"]])
        self.assertEqual(self.client.post(restore_url).status_code, 200)
        self.assertEqual(self.client.get(created["content_url"]).status_code, 200)

    def test_missing_capability_is_denied_even_when_patient_exists(self):
        preset = RolePermissionPreset.objects.get(role=User.Role.RECEPCIONISTA)
        preset.permissions = [
            code for code in preset.permissions if code not in {"documents.view", "documents.create"}
        ]
        preset.save(update_fields=("permissions",))
        self.client.force_authenticate(self.receptionist)

        self.assertEqual(self.client.get(self.list_url()).status_code, 403)
        self.assertEqual(
            self.client.post(
                self.list_url(),
                {"files": [png_file()], "category": "Radiografía"},
                format="multipart",
            ).status_code,
            403,
        )
