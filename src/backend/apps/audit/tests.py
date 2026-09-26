from apps.common.test_utils import start_test_attendance
import shutil
import tempfile
from copy import deepcopy
from datetime import date, time
from pathlib import Path
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, override_settings
from django.urls import resolve, reverse
from rest_framework.test import APITestCase

from apps.appointments.models import Appointment
from apps.common.test_utils import close_test_response
from apps.patients.models import Consultation, Patient, PatientDocument, TreatmentItem
from apps.users.models import User

from .models import AuditEvent


class AuditRouteResolutionTests(SimpleTestCase):
    def test_clinical_routes_resolve_with_stable_namespaces_and_public_paths(self):
        cases = (
            ("/api/patients/7/", "patients", "patient-detail", "patients:patient-detail"),
            (
                "/api/patients/7/consultations/9/odontogram/",
                "patients",
                "consultation-odontogram",
                "patients:consultation-odontogram",
            ),
            (
                "/api/patients/7/documents/3/content/",
                "patients",
                "patient-document-content",
                "patients:patient-document-content",
            ),
            (
                "/api/patients/7/consultations/9/treatment-items/3/",
                "patients",
                "consultation-treatment-item-detail",
                "patients:consultation-treatment-item-detail",
            ),
            (
                "/api/appointments/5/",
                "appointments",
                "appointment-detail",
                "appointments:appointment-detail",
            ),
            (
                "/api/clinics/profile/",
                "clinics",
                "clinic-profile",
                "clinics:clinic-profile",
            ),
        )

        for path, namespace, url_name, view_name in cases:
            with self.subTest(path=path):
                match = resolve(path)
                self.assertEqual(match.namespace, namespace)
                self.assertEqual(match.url_name, url_name)
                self.assertEqual(match.view_name, view_name)
                self.assertEqual(reverse(view_name, kwargs=match.kwargs), path)


class AuditEventClassificationTests(APITestCase):
    def setUp(self):
        from apps.common.test_utils import open_clinic_days

        open_clinic_days()
        self.private_root = Path(tempfile.mkdtemp(prefix="audit-documents-"))
        self.settings_override = override_settings(PRIVATE_MEDIA_ROOT=self.private_root)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.addCleanup(shutil.rmtree, self.private_root, True)

        self.admin = User.objects.create_user(
            email="audit-classification-admin@example.test",
            password="ContraseñaSegura123!",
            role=User.Role.ADMINISTRADOR,
        )
        self.dentist = User.objects.create_user(
            email="audit-classification-dentist@example.test",
            password="ContraseñaSegura123!",
            role=User.Role.ODONTOLOGO,
            first_name="Elena",
            last_name="Rivera",
        )
        self.patient = Patient.objects.create(
            first_name="Paciente",
            last_name="Auditoría",
            birth_place="Managua",
            identification_type=Patient.IdentificationType.CEDULA,
            identification_number="001-010190-9001A",
            phone="+505 8000 0000",
            gender=Patient.Gender.FEMENINO,
            date_of_birth=date(1990, 1, 1),
            registered_by=self.admin,
        )
        self.client.force_authenticate(self.admin)

    def assert_audit_event(
        self,
        response,
        *,
        action,
        resource_type,
        resource_id="",
        patient_id=None,
    ):
        self.assertIn("X-Request-ID", response)
        event = AuditEvent.objects.get(request_id=response["X-Request-ID"])
        self.assertEqual(event.action, action)
        self.assertEqual(event.resource_type, resource_type)
        self.assertEqual(event.resource_id, str(resource_id))
        self.assertEqual(event.patient_id, patient_id)
        return event

    def patient_payload(self):
        return {
            "first_name": "Nueva",
            "last_name": "Paciente",
            "birth_place": "León",
            "address": "Dirección de prueba",
            "identification_type": Patient.IdentificationType.CEDULA,
            "identification_number": "001-020290-9002B",
            "phone": "+505 8888 1000",
            "email": "nueva-paciente@example.test",
            "emergency_contact_name": "Contacto",
            "emergency_relationship": "Familiar",
            "emergency_phone": "+505 8888 1001",
            "gender": Patient.Gender.FEMENINO,
            "date_of_birth": "1990-02-02",
            "is_active": True,
        }

    def consultation_payload(self):
        return {
            "date": "2026-08-30",
            "time": "09:30:00",
            "consultation_type": "GENERAL",
            "summary": "Consulta de clasificación de auditoría.",
            "status": "EN_PROGRESO",
        }

    def appointment_payload(self):
        return {
            "patient": self.patient.pk,
            "dentist": self.dentist.pk,
            "date": "2027-09-07",
            "start_time": "09:00",
            "duration_minutes": 60,
            "reason": "Control de auditoría",
            "notes": "Sin observaciones clínicas.",
        }

    @staticmethod
    def hours_payload():
        return {
            "days": [
                {
                    "weekday": weekday,
                    "is_open": True,
                    "opens_at": "08:00",
                    "closes_at": "17:00",
                    "breaks": [],
                }
                for weekday in range(7)
            ],
        }

    def test_patient_create_read_and_update_use_specific_events_and_ids(self):
        created = self.client.post("/api/patients/", self.patient_payload(), format="json")
        self.assertEqual(created.status_code, 201)
        patient_id = created.data["id"]
        self.assert_audit_event(
            created,
            action="PATIENT_CREATE",
            resource_type="patient",
            resource_id=patient_id,
            patient_id=patient_id,
        )

        read = self.client.get(f"/api/patients/{patient_id}/")
        self.assertEqual(read.status_code, 200)
        self.assert_audit_event(
            read,
            action="PATIENT_READ",
            resource_type="patient",
            resource_id=patient_id,
            patient_id=patient_id,
        )

        updated = self.client.patch(
            f"/api/patients/{patient_id}/",
            {"phone": "+505 8888 2000"},
            format="json",
        )
        self.assertEqual(updated.status_code, 200)
        self.assert_audit_event(
            updated,
            action="PATIENT_UPDATE",
            resource_type="patient",
            resource_id=patient_id,
            patient_id=patient_id,
        )

    def test_patient_identity_and_guardian_audit_records_fields_without_values(self):
        identification_number = "PASSPORT-SENSITIVE-53"
        guardian_name = "Responsible Sensitive 53"
        response = self.client.patch(
            f"/api/patients/{self.patient.pk}/",
            {
                "identification_type": Patient.IdentificationType.PASAPORTE,
                "identification_number": identification_number,
                "guardian_name": guardian_name,
                "guardian_relationship": "Tutor",
                "guardian_phone": "+505 8555 0053",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        event = self.assert_audit_event(
            response,
            action="PATIENT_UPDATE",
            resource_type="patient",
            resource_id=self.patient.pk,
            patient_id=self.patient.pk,
        )
        self.assertEqual(
            event.changed_fields,
            [
                "guardian_name",
                "guardian_phone",
                "guardian_relationship",
                "identification_number",
                "identification_type",
            ],
        )
        serialized_audit = f"{event.changed_fields} {event.metadata}"
        self.assertNotIn(identification_number, serialized_audit)
        self.assertNotIn(guardian_name, serialized_audit)
        self.assertNotIn("+505 8555 0053", serialized_audit)

    def test_patient_duplicate_check_has_a_non_mutating_action_and_no_pii_values(self):
        sensitive_phone = "+505 8555 1313"
        response = self.client.post(
            "/api/patients/duplicate-check/",
            {
                "first_name": "Paciente",
                "first_last_name": "Auditoría",
                "date_of_birth": "1990-01-01",
                "phone": sensitive_phone,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        event = self.assert_audit_event(
            response,
            action="PATIENT_DUPLICATE_CHECK",
            resource_type="patient",
        )
        self.assertEqual(
            event.changed_fields,
            ["date_of_birth", "first_last_name", "first_name", "phone"],
        )
        self.assertNotIn(sensitive_phone, str(event.metadata))
        self.assertNotIn(sensitive_phone, str(event.changed_fields))

    def test_consultation_and_odontogram_events_keep_nested_resource_ids(self):
        consultation_url = f"/api/patients/{self.patient.pk}/consultations/"
        created = self.client.post(consultation_url, self.consultation_payload(), format="json")
        self.assertEqual(created.status_code, 201)
        consultation_id = created.data["id"]
        self.assert_audit_event(
            created,
            action="CONSULTATION_CREATE",
            resource_type="consultation",
            resource_id=consultation_id,
            patient_id=self.patient.pk,
        )

        detail_url = f"{consultation_url}{consultation_id}/"
        read = self.client.get(detail_url)
        self.assertEqual(read.status_code, 200)
        self.assert_audit_event(
            read,
            action="CONSULTATION_READ",
            resource_type="consultation",
            resource_id=consultation_id,
            patient_id=self.patient.pk,
        )

        updated = self.client.patch(
            detail_url,
            {"summary": "Consulta actualizada para TEC-02."},
            format="json",
        )
        self.assertEqual(updated.status_code, 200)
        self.assert_audit_event(
            updated,
            action="CONSULTATION_UPDATE",
            resource_type="consultation",
            resource_id=consultation_id,
            patient_id=self.patient.pk,
        )

        odontogram_url = f"{detail_url}odontogram/"
        odontogram = self.client.get(odontogram_url)
        self.assertEqual(odontogram.status_code, 200)
        self.assert_audit_event(
            odontogram,
            action="ODONTOGRAM_READ",
            resource_type="odontogram",
            resource_id=consultation_id,
            patient_id=self.patient.pk,
        )

        teeth = deepcopy(odontogram.data["teeth"])
        teeth["14"] = {
            "reviewed": True,
            "note": "Seguimiento",
            "current": {"whole": ["CROWN"], "surfaces": {}},
            "planned": {"whole": [], "surfaces": {"MESIAL": ["RESTORATION"]}},
        }
        revision = self.client.post(
            f"{odontogram_url}versions/",
            {
                "base_version_id": odontogram.data["id"],
                "dentition": odontogram.data["dentition"],
                "teeth": teeth,
                "note": "Nueva versión de auditoría.",
            },
            format="json",
        )
        self.assertEqual(revision.status_code, 201, getattr(revision, "data", None))
        self.assert_audit_event(
            revision,
            action="ODONTOGRAM_CREATE",
            resource_type="odontogram",
            resource_id=revision.data["id"],
            patient_id=self.patient.pk,
        )

    def test_treatment_item_create_and_update_identify_full_clinical_context(self):
        consultation = self.client.post(
            f"/api/patients/{self.patient.pk}/consultations/",
            self.consultation_payload(),
            format="json",
        )
        consultation_id = consultation.data["id"]
        list_url = (
            f"/api/patients/{self.patient.pk}/consultations/"
            f"{consultation_id}/treatment-items/"
        )

        created = self.client.post(
            list_url,
            {"description": "Procedimiento trazable"},
            format="json",
        )

        self.assertEqual(created.status_code, 201)
        item_id = created.data["id"]
        event = self.assert_audit_event(
            created,
            action="TREATMENT_ITEM_CREATE",
            resource_type="treatment_item",
            resource_id=item_id,
            patient_id=self.patient.pk,
        )
        self.assertEqual(event.actor_id, self.admin.pk)
        self.assertEqual(event.metadata["consultation_id"], consultation_id)
        self.assertEqual(event.metadata["treatment_item_id"], item_id)

        updated = self.client.patch(
            f"{list_url}{item_id}/",
            {"description": "Procedimiento trazable actualizado"},
            format="json",
        )

        self.assertEqual(updated.status_code, 200)
        event = self.assert_audit_event(
            updated,
            action="TREATMENT_ITEM_UPDATE",
            resource_type="treatment_item",
            resource_id=item_id,
            patient_id=self.patient.pk,
        )
        self.assertEqual(event.actor_id, self.admin.pk)
        self.assertEqual(event.metadata["consultation_id"], consultation_id)
        self.assertEqual(event.metadata["treatment_item_id"], item_id)
        self.assertEqual(TreatmentItem.objects.get(pk=item_id).proposed_in_id, consultation_id)

    def test_consultation_complete_and_cancel_have_explicit_audit_events(self):
        consultation_url = f"/api/patients/{self.patient.pk}/consultations/"
        created = self.client.post(consultation_url, self.consultation_payload(), format="json")
        consultation_id = created.data["id"]

        completed = self.client.post(
            f"{consultation_url}{consultation_id}/complete/",
            format="json",
            HTTP_X_REQUEST_ID="consultation-complete-audit",
        )

        self.assertEqual(completed.status_code, 200)
        complete_event = self.assert_audit_event(
            completed,
            action="CONSULTATION_COMPLETE",
            resource_type="consultation",
            resource_id=consultation_id,
            patient_id=self.patient.pk,
        )
        self.assertEqual(complete_event.actor_id, self.admin.pk)
        self.assertEqual(complete_event.metadata["consultation_id"], consultation_id)

        second = self.client.post(consultation_url, self.consultation_payload(), format="json")
        cancelled = self.client.post(
            f"{consultation_url}{second.data['id']}/cancel/",
            format="json",
            HTTP_X_REQUEST_ID="consultation-cancel-audit",
        )
        self.assertEqual(cancelled.status_code, 200)
        cancel_event = self.assert_audit_event(
            cancelled,
            action="CONSULTATION_CANCEL",
            resource_type="consultation",
            resource_id=second.data["id"],
            patient_id=self.patient.pk,
        )
        self.assertEqual(cancel_event.actor_id, self.admin.pk)

    def test_linked_completion_audit_identifies_the_appointment(self):
        appointment = self.client.post(
            "/api/appointments/",
            self.appointment_payload(),
            format="json",
        )
        started = start_test_attendance(self.client, Appointment.objects.get(pk=appointment.data["id"]))
        consultation_id = started.data["consultation"]["id"]

        completed = self.client.post(
            f"/api/patients/{self.patient.pk}/consultations/{consultation_id}/complete/",
            format="json",
            HTTP_X_REQUEST_ID="linked-consultation-complete-audit",
        )

        self.assertEqual(completed.status_code, 200)
        event = AuditEvent.objects.get(request_id="linked-consultation-complete-audit")
        self.assertEqual(event.action, "CONSULTATION_COMPLETE")
        self.assertEqual(event.resource_id, str(consultation_id))
        self.assertEqual(event.patient_id, self.patient.pk)
        self.assertEqual(event.metadata["appointment_id"], appointment.data["id"])

    def test_document_metadata_view_and_download_use_document_events(self):
        content = b"%PDF-1.4\n1 0 obj\n%%EOF"
        document = PatientDocument.objects.create(
            patient=self.patient,
            category="Radiografía",
            document_date=date(2026, 8, 30),
            original_name="auditoria.pdf",
            mime_type="application/pdf",
            size_bytes=len(content),
            file=SimpleUploadedFile("auditoria.pdf", content, content_type="application/pdf"),
            uploaded_by=self.admin,
        )

        metadata = self.client.get(f"/api/patients/{self.patient.pk}/documents/")
        self.assertEqual(metadata.status_code, 200)
        self.assert_audit_event(
            metadata,
            action="DOCUMENT_LIST",
            resource_type="document",
            patient_id=self.patient.pk,
        )

        content_url = f"/api/patients/{self.patient.pk}/documents/{document.pk}/content/"
        viewed = self.client.get(content_url)
        self.assertEqual(viewed.status_code, 200)
        self.assert_audit_event(
            viewed,
            action="DOCUMENT_VIEW",
            resource_type="document",
            resource_id=document.pk,
            patient_id=self.patient.pk,
        )
        close_test_response(viewed)

        downloaded = self.client.get(f"{content_url}?download=true")
        self.assertEqual(downloaded.status_code, 200)
        self.assert_audit_event(
            downloaded,
            action="DOCUMENT_DOWNLOAD",
            resource_type="document",
            resource_id=document.pk,
            patient_id=self.patient.pk,
        )
        close_test_response(downloaded)

    def test_document_context_update_records_safe_changed_fields(self):
        consultation = Consultation.objects.create(
            patient=self.patient,
            professional=self.dentist,
            date=date(2026, 9, 1),
            time=time(9, 0),
            consultation_type=Consultation.Type.GENERAL,
            summary="Resumen privado",
            status=Consultation.Status.COMPLETED,
            dental_diagnoses="Diagnóstico privado",
        )
        content = b"synthetic image bytes"
        document = PatientDocument.objects.create(
            patient=self.patient,
            category="Documento clínico",
            document_date=date(2026, 9, 1),
            original_name="contexto.png",
            mime_type="image/png",
            size_bytes=len(content),
            file=SimpleUploadedFile("contexto.png", content, content_type="image/png"),
            uploaded_by=self.admin,
        )

        response = self.client.patch(
            f"/api/patients/{self.patient.pk}/documents/{document.pk}/",
            {
                "category": "Fotografía clínica",
                "consultation_id": consultation.pk,
                "tooth_code": "16",
                "notes": "Contenido clínico que no debe llegar a auditoría",
            },
            format="json",
            HTTP_X_REQUEST_ID="document-context-update-audit",
        )

        self.assertEqual(response.status_code, 200, getattr(response, "data", None))
        event = AuditEvent.objects.get(request_id="document-context-update-audit")
        self.assertEqual(event.action, "DOCUMENT_UPDATE")
        self.assertEqual(event.resource_id, str(document.pk))
        self.assertEqual(event.patient_id, self.patient.pk)
        self.assertEqual(
            event.changed_fields,
            ["category", "consultation_id", "tooth_code"],
        )
        self.assertNotIn("Contenido clínico", str(event.metadata))
        self.assertNotIn("Diagnóstico", str(event.metadata))

    def test_appointment_create_read_and_update_use_specific_events(self):
        created = self.client.post("/api/appointments/", self.appointment_payload(), format="json")
        self.assertEqual(created.status_code, 201, getattr(created, "data", None))
        appointment_id = created.data["id"]
        self.assert_audit_event(
            created,
            action="APPOINTMENT_CREATE",
            resource_type="appointment",
            resource_id=appointment_id,
        )

        detail_url = f"/api/appointments/{appointment_id}/"
        read = self.client.get(detail_url)
        self.assertEqual(read.status_code, 200)
        self.assert_audit_event(
            read,
            action="APPOINTMENT_READ",
            resource_type="appointment",
            resource_id=appointment_id,
        )

        updated = self.client.patch(detail_url, {"reason": "Control actualizado"}, format="json")
        self.assertEqual(updated.status_code, 200)
        self.assert_audit_event(
            updated,
            action="APPOINTMENT_UPDATE",
            resource_type="appointment",
            resource_id=appointment_id,
        )

    def test_clinic_profile_services_hours_and_closures_use_clinic_events(self):
        profile = self.client.get("/api/clinics/profile/")
        self.assertEqual(profile.status_code, 200)
        self.assert_audit_event(
            profile,
            action="CLINIC_CONFIGURATION_READ",
            resource_type="clinic_configuration",
        )

        updated_profile = self.client.patch(
            "/api/clinics/profile/",
            {"name": "Clínica auditada"},
            format="json",
        )
        self.assertEqual(updated_profile.status_code, 200)
        self.assert_audit_event(
            updated_profile,
            action="CLINIC_CONFIGURATION_UPDATE",
            resource_type="clinic_configuration",
        )

        category = self.client.post(
            "/api/clinics/service-categories/",
            {"name": "Auditoría", "position": 1},
            format="json",
        )
        self.assertEqual(category.status_code, 201)
        service = self.client.post(
            "/api/clinics/services/",
            {
                "category": category.data["id"],
                "name": "Servicio auditado",
                "duration_minutes": 30,
                "price": "500.00",
                "position": 1,
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(service.status_code, 201)
        self.assert_audit_event(
            service,
            action="CLINIC_CONFIGURATION_CREATE",
            resource_type="clinic_configuration",
            resource_id=service.data["id"],
        )

        services = self.client.get("/api/clinics/services/")
        self.assertEqual(services.status_code, 200)
        self.assert_audit_event(
            services,
            action="CLINIC_CONFIGURATION_LIST",
            resource_type="clinic_configuration",
        )

        hours = self.client.get("/api/clinics/business-hours/")
        self.assertEqual(hours.status_code, 200)
        self.assert_audit_event(
            hours,
            action="CLINIC_CONFIGURATION_READ",
            resource_type="clinic_configuration",
        )
        updated_hours = self.client.put(
            "/api/clinics/business-hours/",
            self.hours_payload(),
            format="json",
        )
        self.assertEqual(updated_hours.status_code, 200)
        self.assert_audit_event(
            updated_hours,
            action="CLINIC_CONFIGURATION_UPDATE",
            resource_type="clinic_configuration",
        )

        closure = self.client.post(
            "/api/clinics/closures/",
            {
                "name": "Cierre auditado",
                "date": "2028-01-01",
                "repeats_annually": False,
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(closure.status_code, 201)
        self.assert_audit_event(
            closure,
            action="CLINIC_CONFIGURATION_CREATE",
            resource_type="clinic_configuration",
            resource_id=closure.data["id"],
        )

    def test_authentication_routes_keep_their_special_actions(self):
        self.client.force_authenticate(None)
        requests = (
            (
                self.client.post(
                    reverse("users:login"),
                    {"email": "unknown@example.test", "password": "incorrecta"},
                    format="json",
                ),
                "AUTH_LOGIN",
            ),
            (self.client.post(reverse("users:token-refresh"), {}, format="json"), "AUTH_REFRESH"),
            (self.client.post(reverse("users:logout"), {}, format="json"), "AUTH_LOGOUT"),
            (
                self.client.post(
                    reverse("users:password-reset"),
                    {"email": "unknown@example.test"},
                    format="json",
                ),
                "PASSWORD_RESET_REQUEST",
            ),
            (
                self.client.post(
                    reverse("users:password-reset-confirm"),
                    {},
                    format="json",
                ),
                "PASSWORD_RESET_CONFIRM",
            ),
        )

        for response, action in requests:
            with self.subTest(action=action):
                event = AuditEvent.objects.get(request_id=response["X-Request-ID"])
                self.assertEqual(event.action, action)

    def test_patient_appointment_and_clinic_never_fall_back_to_generic_api_actions(self):
        appointment = Appointment.objects.create(
            patient=self.patient,
            dentist=self.dentist,
            date=date(2027, 9, 8),
            start_time=time(10, 0),
            duration_minutes=30,
            reason="Regresión TEC-02",
            created_by=self.admin,
        )
        responses = (
            self.client.get(f"/api/patients/{self.patient.pk}/"),
            self.client.get(f"/api/appointments/{appointment.pk}/"),
            self.client.get("/api/clinics/profile/"),
        )

        for response in responses:
            event = AuditEvent.objects.get(request_id=response["X-Request-ID"])
            self.assertNotIn(event.action, {"API_READ", "API_CREATE", "API_UPDATE"})


class AuditEventImmutabilityTests(APITestCase):
    def setUp(self):
        self.event = AuditEvent.objects.create(
            request_id="request-original",
            action="PATIENT_READ",
            outcome=AuditEvent.Outcome.SUCCESS,
            resource_type="patient",
            resource_id="12",
        )

    def test_existing_event_cannot_be_saved_updated_or_deleted(self):
        self.event.action = "TAMPERED"
        with self.assertRaises(ValidationError):
            self.event.save()
        with self.assertRaises(ValidationError):
            AuditEvent.objects.filter(pk=self.event.pk).update(action="TAMPERED")
        with self.assertRaises(ValidationError):
            AuditEvent.objects.filter(pk=self.event.pk).delete()
        with self.assertRaises(ValidationError):
            self.event.delete()


class AuditEventApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="audit-admin@example.test",
            password="ContraseñaSegura123!",
            role=User.Role.ADMINISTRADOR,
        )
        self.receptionist = User.objects.create_user(
            email="audit-reception@example.test",
            password="ContraseñaSegura123!",
            role=User.Role.RECEPCIONISTA,
        )
        AuditEvent.objects.create(
            request_id="request-filter",
            actor_id=self.admin.pk,
            actor_role=self.admin.role,
            action="PATIENT_READ",
            outcome=AuditEvent.Outcome.SUCCESS,
            resource_type="patient",
            resource_id="21",
            patient_id=21,
        )

    def test_only_administration_can_list_and_filter_events(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(
            reverse("audit:event-list"),
            {"action": "PATIENT_READ", "patient_id": 21},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["request_id"], "request-filter")

        self.client.force_authenticate(self.receptionist)
        self.assertEqual(self.client.get(reverse("audit:event-list")).status_code, 403)

    def test_audit_endpoint_is_read_only(self):
        self.client.force_authenticate(self.admin)
        url = reverse("audit:event-list")
        self.assertEqual(self.client.post(url, {}).status_code, 405)
        self.assertEqual(self.client.patch(url, {}).status_code, 405)
        self.assertEqual(self.client.delete(url).status_code, 405)

    def test_api_request_receives_request_id_and_creates_one_event(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(
            reverse("users:current-user"),
            HTTP_X_REQUEST_ID="qa-request-123",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["X-Request-ID"], "qa-request-123")
        event = AuditEvent.objects.get(request_id="qa-request-123")
        self.assertEqual(event.actor_id, self.admin.pk)
        self.assertEqual(event.outcome, AuditEvent.Outcome.SUCCESS)
        self.assertEqual(event.action, "PROFILE_READ")

    def test_failed_login_is_redacted_in_audit_metadata(self):
        response = self.client.post(
            reverse("users:login"),
            {"email": "known@example.test", "password": "secret-value"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        event = AuditEvent.objects.get(request_id=response["X-Request-ID"])
        serialized = str(event.metadata)
        self.assertNotIn("known@example.test", serialized)
        self.assertNotIn("secret-value", serialized)
        self.assertEqual(event.action, "AUTH_LOGIN")
        self.assertEqual(event.outcome, AuditEvent.Outcome.FAILURE)

    def test_failed_audit_rolls_back_a_clinical_mutation(self):
        self.client.force_authenticate(self.admin)
        payload = {
            "first_name": "Paciente",
            "last_name": "Transaccional",
            "birth_place": "Managua",
            "address": "Dirección sintética QA",
            "identification_type": Patient.IdentificationType.CEDULA,
            "identification_number": "001-010190-0001A",
            "phone": "+505 8888 0000",
            "email": "atomic-patient@example.test",
            "emergency_contact_name": "Contacto QA",
            "emergency_relationship": "Familiar",
            "emergency_phone": "+505 8888 0001",
            "gender": "FEMENINO",
            "date_of_birth": "1990-01-01",
            "is_active": True,
        }

        with patch.object(AuditEvent.objects, "create", side_effect=RuntimeError("audit unavailable")):
            with self.assertRaises(RuntimeError):
                self.client.post("/api/patients/", payload, format="json")

        self.assertFalse(Patient.objects.filter(email=payload["email"]).exists())
