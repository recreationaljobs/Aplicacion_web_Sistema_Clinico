from apps.common.test_utils import assigned_test_consultation
from datetime import date, time
from unittest.mock import patch

from django.core.exceptions import PermissionDenied
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.audit.models import AuditEvent
from apps.users.models import RolePermissionPreset, User

from .models import Consultation, OdontogramVersion, Patient, TreatmentItem
from .services import (
    TreatmentItemOperationError,
    accept_treatment_item,
    cancel_treatment_item,
    perform_treatment_item,
)


class TreatmentLifecycleMixin:
    def create_user(self, email, role=User.Role.ODONTOLOGO):
        return User.objects.create_user(
            email=email,
            password="ContraseñaSegura123!",
            role=role,
            first_name="Elena",
            last_name="Rivera",
        )

    def create_patient(self, suffix="1"):
        return Patient.objects.create(
            first_name="Paciente",
            last_name=f"Ciclo {suffix}",
            birth_place="Managua",
            identification_type=Patient.IdentificationType.CEDULA,
            identification_number=f"001-010190-91{int(suffix):02d}A",
            gender=Patient.Gender.FEMENINO,
            date_of_birth=date(1990, 1, 1),
            registered_by=self.admin,
        )

    def create_consultation(self, *, patient=None, status=Consultation.Status.IN_PROGRESS):
        return assigned_test_consultation(
            patient=patient or self.patient,
            professional=self.dentist,
            professional_name_snapshot="Elena Rivera",
            date=date(2026, 8, 31),
            time=time(10, 0),
            consultation_type=Consultation.Type.GENERAL,
            summary="Consulta para ciclo de tratamiento.",
            status=status,
        )

    def create_item(
        self,
        *,
        status=TreatmentItem.Status.PROPOSED,
        consultation=None,
        **overrides,
    ):
        values = {
            "proposed_in": consultation or self.origin,
            "description": "Restauración con resina",
            "diagnosis_text": "Caries oclusal",
            "tooth_code": "16",
            "surfaces": ["OCCLUSAL"],
            "planned_finding": "RESTORATION",
            "status": status,
            "notes": "Aislamiento absoluto",
        }
        values.update(overrides)
        return TreatmentItem.objects.create(**values)

    def create_odontogram(self, *, consultation=None, teeth=None, version_number=1):
        return OdontogramVersion.objects.create(
            patient=self.patient,
            consultation=consultation or self.origin,
            version_number=version_number,
            dentition=OdontogramVersion.Dentition.PERMANENT,
            teeth=teeth or {
                "16": {
                    "reviewed": True,
                    "note": "Hallazgo previo",
                    "current": {
                        "whole": [],
                        "surfaces": {"MESIAL": ["CARIES"]},
                    },
                    "planned": {
                        "whole": ["CROWN"],
                        "surfaces": {"OCCLUSAL": ["RESTORATION"]},
                    },
                }
            },
            changed_teeth=[],
            created_by=self.dentist,
        )


class TreatmentLifecycleServiceTests(TreatmentLifecycleMixin, TestCase):
    def setUp(self):
        self.admin = self.create_user("admin-treatment-lifecycle@example.test", User.Role.ADMINISTRADOR)
        self.dentist = self.create_user("dentist-treatment-lifecycle@example.test")
        self.receptionist = self.create_user(
            "reception-treatment-lifecycle@example.test",
            User.Role.RECEPCIONISTA,
        )
        self.patient = self.create_patient()
        self.other_patient = self.create_patient("2")
        self.origin = self.create_consultation()
        self.execution = self.create_consultation()

    def test_accepts_a_proposal_even_when_origin_consultation_is_completed(self):
        self.origin.status = Consultation.Status.COMPLETED
        self.origin.save(update_fields=("status", "updated_at"))
        item = self.create_item()

        accepted = accept_treatment_item(treatment_item_id=item.pk, actor=self.dentist)

        self.assertEqual(accepted.status, TreatmentItem.Status.ACCEPTED)
        self.origin.refresh_from_db()
        self.assertEqual(self.origin.status, Consultation.Status.COMPLETED)

    def test_accept_is_idempotent_and_terminal_states_reject_it(self):
        accepted = self.create_item(status=TreatmentItem.Status.ACCEPTED)

        first = accept_treatment_item(treatment_item_id=accepted.pk, actor=self.dentist)
        second = accept_treatment_item(treatment_item_id=accepted.pk, actor=self.dentist)

        self.assertEqual(first.pk, second.pk)
        for terminal in (TreatmentItem.Status.PERFORMED, TreatmentItem.Status.CANCELLED):
            item = self.create_item(status=terminal)
            with self.subTest(terminal=terminal), self.assertRaises(TreatmentItemOperationError) as error:
                accept_treatment_item(treatment_item_id=item.pk, actor=self.dentist)
            self.assertEqual(error.exception.code, "treatment_invalid_transition")

    def test_cancel_trims_reason_and_repeated_cancel_preserves_original(self):
        item = self.create_item(status=TreatmentItem.Status.ACCEPTED)

        cancelled = cancel_treatment_item(
            treatment_item_id=item.pk,
            actor=self.dentist,
            reason="  El paciente pospuso el procedimiento.  ",
        )
        repeated = cancel_treatment_item(
            treatment_item_id=item.pk,
            actor=self.dentist,
            reason="No debe sobrescribir",
        )

        self.assertEqual(cancelled.status, TreatmentItem.Status.CANCELLED)
        self.assertEqual(repeated.status_reason, "El paciente pospuso el procedimiento.")
        self.assertIsNone(repeated.performed_in)
        self.assertIsNone(repeated.performed_at)

    def test_perform_requires_accepted_item_and_active_same_patient_consultation(self):
        proposed = self.create_item()
        with self.assertRaises(TreatmentItemOperationError) as direct_error:
            perform_treatment_item(
                treatment_item_id=proposed.pk,
                performed_in_id=self.execution.pk,
                actor=self.dentist,
            )
        self.assertEqual(direct_error.exception.code, "treatment_invalid_transition")

        item = self.create_item(status=TreatmentItem.Status.ACCEPTED)
        other_execution = self.create_consultation(patient=self.other_patient)
        with self.assertRaises(TreatmentItemOperationError) as mismatch_error:
            perform_treatment_item(
                treatment_item_id=item.pk,
                performed_in_id=other_execution.pk,
                actor=self.dentist,
            )
        self.assertEqual(mismatch_error.exception.code, "treatment_patient_mismatch")

        completed_execution = self.create_consultation(status=Consultation.Status.COMPLETED)
        with self.assertRaises(TreatmentItemOperationError) as active_error:
            perform_treatment_item(
                treatment_item_id=item.pk,
                performed_in_id=completed_execution.pk,
                actor=self.dentist,
            )
        self.assertEqual(
            active_error.exception.code,
            "treatment_perform_requires_active_consultation",
        )

        cancelled_execution = self.create_consultation(status=Consultation.Status.CANCELLED)
        with self.assertRaises(TreatmentItemOperationError) as cancelled_error:
            perform_treatment_item(
                treatment_item_id=item.pk,
                performed_in_id=cancelled_execution.pk,
                actor=self.dentist,
            )
        self.assertEqual(
            cancelled_error.exception.code,
            "treatment_perform_requires_active_consultation",
        )

    def test_perform_records_server_metadata_once_and_is_idempotent_for_same_consultation(self):
        item = self.create_item(status=TreatmentItem.Status.ACCEPTED)
        before = timezone.now()

        performed = perform_treatment_item(
            treatment_item_id=item.pk,
            performed_in_id=self.execution.pk,
            actor=self.dentist,
        )
        original_timestamp = performed.performed_at
        repeated = perform_treatment_item(
            treatment_item_id=item.pk,
            performed_in_id=self.execution.pk,
            actor=self.dentist,
        )

        self.assertEqual(performed.status, TreatmentItem.Status.PERFORMED)
        self.assertEqual(performed.performed_in, self.execution)
        self.assertGreaterEqual(performed.performed_at, before)
        self.assertEqual(repeated.performed_at, original_timestamp)
        self.assertEqual(repeated.status_reason, "")

        other_execution = self.create_consultation()
        with self.assertRaises(TreatmentItemOperationError) as error:
            perform_treatment_item(
                treatment_item_id=item.pk,
                performed_in_id=other_execution.pk,
                actor=self.dentist,
            )
        self.assertEqual(error.exception.code, "treatment_invalid_transition")

    def test_perform_can_atomically_record_a_confirmed_surface_result(self):
        base = self.create_odontogram()
        item = self.create_item(status=TreatmentItem.Status.ACCEPTED)

        performed = perform_treatment_item(
            treatment_item_id=item.pk,
            performed_in_id=self.execution.pk,
            actor=self.dentist,
            odontogram_result={
                "tooth_code": "16",
                "surfaces": ["OCCLUSAL"],
                "finding": "RESTORATION",
            },
        )

        result = performed.resulting_odontogram_version
        self.assertEqual(result.patient, self.patient)
        self.assertEqual(result.consultation, self.execution)
        self.assertEqual(result.version_number, 2)
        self.assertEqual(result.based_on, base)
        self.assertEqual(result.changed_teeth, ["16"])
        self.assertEqual(
            result.teeth["16"]["current"]["surfaces"],
            {"MESIAL": ["CARIES"], "OCCLUSAL": ["RESTORATION"]},
        )
        self.assertEqual(result.teeth["16"]["planned"], base.teeth["16"]["planned"])
        self.assertEqual(performed.status, TreatmentItem.Status.PERFORMED)

    def test_perform_validates_confirmed_result_against_item_and_latest_dentition(self):
        self.create_odontogram()
        cases = (
            (
                {"tooth_code": "15", "surfaces": ["OCCLUSAL"], "finding": "RESTORATION"},
                "odontogram_result_tooth_mismatch",
            ),
            (
                {"tooth_code": "16", "surfaces": [], "finding": "RESTORATION"},
                "odontogram_result_surface_required",
            ),
            (
                {"tooth_code": "16", "surfaces": ["INCISAL"], "finding": "RESTORATION"},
                "odontogram_result_invalid_surface",
            ),
            (
                {"tooth_code": "16", "surfaces": ["OCCLUSAL"], "finding": "MISSING"},
                "odontogram_result_whole_has_surfaces",
            ),
            (
                {"tooth_code": "16", "surfaces": [], "finding": "EXTRACTION"},
                "odontogram_result_invalid_finding",
            ),
        )

        for index, (result, expected_code) in enumerate(cases):
            with self.subTest(expected_code=expected_code):
                item = self.create_item(
                    status=TreatmentItem.Status.ACCEPTED,
                    description=f"Caso inválido {index}",
                )
                with self.assertRaises(TreatmentItemOperationError) as error:
                    perform_treatment_item(
                        treatment_item_id=item.pk,
                        performed_in_id=self.execution.pk,
                        actor=self.dentist,
                        odontogram_result=result,
                    )
                self.assertEqual(error.exception.code, expected_code)
                item.refresh_from_db()
                self.assertEqual(item.status, TreatmentItem.Status.ACCEPTED)
                self.assertIsNone(item.resulting_odontogram_version_id)

        no_tooth = self.create_item(
            status=TreatmentItem.Status.ACCEPTED,
            tooth_code=None,
            surfaces=[],
            planned_finding="",
        )
        with self.assertRaises(TreatmentItemOperationError) as no_tooth_error:
            perform_treatment_item(
                treatment_item_id=no_tooth.pk,
                performed_in_id=self.execution.pk,
                actor=self.dentist,
                odontogram_result={
                    "tooth_code": "16",
                    "surfaces": [],
                    "finding": "CROWN",
                },
            )
        self.assertEqual(no_tooth_error.exception.code, "odontogram_result_requires_tooth")

    def test_perform_result_is_idempotent_and_never_adds_a_second_version(self):
        self.create_odontogram()
        item = self.create_item(status=TreatmentItem.Status.ACCEPTED)
        result_payload = {
            "tooth_code": "16",
            "surfaces": ["OCCLUSAL"],
            "finding": "RESTORATION",
        }

        first = perform_treatment_item(
            treatment_item_id=item.pk,
            performed_in_id=self.execution.pk,
            actor=self.dentist,
            odontogram_result=result_payload,
        )
        repeated = perform_treatment_item(
            treatment_item_id=item.pk,
            performed_in_id=self.execution.pk,
            actor=self.dentist,
            odontogram_result={
                "tooth_code": "16",
                "surfaces": [],
                "finding": "CROWN",
            },
        )

        self.assertEqual(OdontogramVersion.objects.count(), 2)
        self.assertEqual(
            repeated.resulting_odontogram_version_id,
            first.resulting_odontogram_version_id,
        )

    def test_perform_rolls_back_both_item_and_version_on_either_write_failure(self):
        self.create_odontogram()
        payload = {
            "tooth_code": "16",
            "surfaces": ["OCCLUSAL"],
            "finding": "RESTORATION",
        }

        version_failure_item = self.create_item(status=TreatmentItem.Status.ACCEPTED)
        with patch(
            "apps.patients.services.OdontogramVersion.objects.create",
            side_effect=RuntimeError("synthetic version failure"),
        ), self.assertRaises(RuntimeError):
            perform_treatment_item(
                treatment_item_id=version_failure_item.pk,
                performed_in_id=self.execution.pk,
                actor=self.dentist,
                odontogram_result=payload,
            )
        version_failure_item.refresh_from_db()
        self.assertEqual(version_failure_item.status, TreatmentItem.Status.ACCEPTED)
        self.assertEqual(OdontogramVersion.objects.count(), 1)

        item_failure_item = self.create_item(status=TreatmentItem.Status.ACCEPTED)
        with patch.object(
            TreatmentItem,
            "save",
            side_effect=RuntimeError("synthetic item failure"),
        ), self.assertRaises(RuntimeError):
            perform_treatment_item(
                treatment_item_id=item_failure_item.pk,
                performed_in_id=self.execution.pk,
                actor=self.dentist,
                odontogram_result=payload,
            )
        item_failure_item.refresh_from_db()
        self.assertEqual(item_failure_item.status, TreatmentItem.Status.ACCEPTED)
        self.assertEqual(OdontogramVersion.objects.count(), 1)

    def test_services_enforce_clinical_edit_permission(self):
        item = self.create_item()

        for operation in (
            lambda: accept_treatment_item(treatment_item_id=item.pk, actor=self.receptionist),
            lambda: cancel_treatment_item(
                treatment_item_id=item.pk,
                actor=self.receptionist,
                reason="",
            ),
            lambda: perform_treatment_item(
                treatment_item_id=item.pk,
                performed_in_id=self.execution.pk,
                actor=self.receptionist,
            ),
        ):
            with self.assertRaises(PermissionDenied):
                operation()

    def test_terminal_operations_never_create_odontogram_versions(self):
        accepted = self.create_item(status=TreatmentItem.Status.ACCEPTED)
        cancelled = self.create_item(status=TreatmentItem.Status.CANCELLED)
        before = OdontogramVersion.objects.count()

        perform_treatment_item(
            treatment_item_id=accepted.pk,
            performed_in_id=self.execution.pk,
            actor=self.dentist,
        )
        with self.assertRaises(TreatmentItemOperationError) as perform_cancelled:
            perform_treatment_item(
                treatment_item_id=cancelled.pk,
                performed_in_id=self.execution.pk,
                actor=self.dentist,
            )
        with self.assertRaises(TreatmentItemOperationError) as cancel_performed:
            cancel_treatment_item(
                treatment_item_id=accepted.pk,
                actor=self.dentist,
                reason="No permitido",
            )

        self.assertEqual(perform_cancelled.exception.code, "treatment_invalid_transition")
        self.assertEqual(cancel_performed.exception.code, "treatment_invalid_transition")
        self.assertEqual(OdontogramVersion.objects.count(), before)


class TreatmentLifecycleApiTests(TreatmentLifecycleMixin, APITestCase):
    def setUp(self):
        self.admin = self.create_user("admin-treatment-action@example.test", User.Role.ADMINISTRADOR)
        self.dentist = self.create_user("dentist-treatment-action@example.test")
        self.receptionist = self.create_user(
            "reception-treatment-action@example.test",
            User.Role.RECEPCIONISTA,
        )
        self.patient = self.create_patient()
        self.other_patient = self.create_patient("2")
        self.origin = self.create_consultation()
        self.execution = self.create_consultation()
        self.client.force_authenticate(self.dentist)

    def action_url(self, item, action, *, patient=None, consultation=None):
        return (
            f"/api/patients/{(patient or self.patient).pk}/consultations/"
            f"{(consultation or self.origin).pk}/treatment-items/{item.pk}/{action}/"
        )

    def test_action_endpoints_return_updated_item_and_stable_audit_context(self):
        accepted_item = self.create_item()
        accepted = self.client.post(
            self.action_url(accepted_item, "accept"),
            format="json",
            HTTP_X_REQUEST_ID="treatment-accept-audit",
        )
        self.assertEqual(accepted.status_code, 200, accepted.data)
        self.assertEqual(accepted.data["status"], TreatmentItem.Status.ACCEPTED)
        accept_event = AuditEvent.objects.get(request_id="treatment-accept-audit")
        self.assertEqual(accept_event.action, "TREATMENT_ITEM_ACCEPT")
        self.assertEqual(accept_event.actor_id, self.dentist.pk)
        self.assertEqual(accept_event.patient_id, self.patient.pk)
        self.assertEqual(accept_event.resource_id, str(accepted_item.pk))
        self.assertEqual(accept_event.metadata["origin_consultation_id"], self.origin.pk)
        self.assertEqual(accept_event.metadata["transition"], "PROPUESTO->ACEPTADO")

        performed = self.client.post(
            self.action_url(accepted_item, "perform"),
            {"performed_in": self.execution.pk},
            format="json",
            HTTP_X_REQUEST_ID="treatment-perform-audit",
        )
        self.assertEqual(performed.status_code, 200, performed.data)
        self.assertEqual(performed.data["status"], TreatmentItem.Status.PERFORMED)
        self.assertEqual(performed.data["performed_in"], self.execution.pk)
        self.assertIsNotNone(performed.data["performed_at"])
        perform_event = AuditEvent.objects.get(request_id="treatment-perform-audit")
        self.assertEqual(perform_event.action, "TREATMENT_ITEM_PERFORM")
        self.assertEqual(perform_event.metadata["performed_in_id"], self.execution.pk)
        self.assertEqual(perform_event.metadata["transition"], "ACEPTADO->REALIZADO")

        cancelled_item = self.create_item()
        cancelled = self.client.post(
            self.action_url(cancelled_item, "cancel"),
            {"reason": "Plan clínico revisado"},
            format="json",
            HTTP_X_REQUEST_ID="treatment-cancel-audit",
        )
        self.assertEqual(cancelled.status_code, 200, cancelled.data)
        self.assertEqual(cancelled.data["status_reason"], "Plan clínico revisado")
        cancel_event = AuditEvent.objects.get(request_id="treatment-cancel-audit")
        self.assertEqual(cancel_event.action, "TREATMENT_ITEM_CANCEL")
        self.assertEqual(cancel_event.metadata["transition"], "PROPUESTO->CANCELADO")

    def test_perform_api_accepts_explicit_result_and_returns_auditable_version_link(self):
        self.create_odontogram()
        item = self.create_item(status=TreatmentItem.Status.ACCEPTED)

        response = self.client.post(
            self.action_url(item, "perform"),
            {
                "performed_in": self.execution.pk,
                "odontogram_result": {
                    "tooth_code": "16",
                    "surfaces": ["OCCLUSAL"],
                    "finding": "RESTORATION",
                },
            },
            format="json",
            HTTP_X_REQUEST_ID="treatment-result-audit",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertIsInstance(response.data["resulting_odontogram_version"], int)
        item.refresh_from_db()
        self.assertEqual(
            response.data["resulting_odontogram_version"],
            item.resulting_odontogram_version_id,
        )
        event = AuditEvent.objects.get(request_id="treatment-result-audit")
        self.assertEqual(
            event.metadata["resulting_odontogram_version_id"],
            item.resulting_odontogram_version_id,
        )
        self.assertTrue(event.metadata["odontogram_result_registered"])

    def test_perform_api_rejects_malformed_result_without_changing_item(self):
        self.create_odontogram()
        item = self.create_item(status=TreatmentItem.Status.ACCEPTED)

        response = self.client.post(
            self.action_url(item, "perform"),
            {
                "performed_in": self.execution.pk,
                "odontogram_result": {
                    "tooth_code": "16",
                    "surfaces": "OCCLUSAL",
                    "finding": "RESTORATION",
                },
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("odontogram_result", response.data)
        item.refresh_from_db()
        self.assertEqual(item.status, TreatmentItem.Status.ACCEPTED)

    def test_payload_permissions_scope_and_domain_errors_have_expected_statuses(self):
        item = self.create_item(status=TreatmentItem.Status.ACCEPTED)

        missing_payload = self.client.post(self.action_url(item, "perform"), {}, format="json")
        self.assertEqual(missing_payload.status_code, 400)
        self.assertIn("performed_in", missing_payload.data)

        missing_consultation = self.client.post(
            self.action_url(item, "perform"),
            {"performed_in": 999999},
            format="json",
        )
        self.assertEqual(missing_consultation.status_code, 404)

        other_execution = self.create_consultation(patient=self.other_patient)
        mismatch = self.client.post(
            self.action_url(item, "perform"),
            {"performed_in": other_execution.pk},
            format="json",
        )
        self.assertEqual(mismatch.status_code, 409)
        self.assertEqual(mismatch.data["code"], "treatment_patient_mismatch")

        wrong_scope = self.client.post(
            self.action_url(item, "accept", patient=self.other_patient),
            format="json",
        )
        self.assertEqual(wrong_scope.status_code, 404)

        self.client.force_authenticate(self.receptionist)
        denied = self.client.post(self.action_url(item, "cancel"), {}, format="json")
        self.assertEqual(denied.status_code, 403)

    def test_ordinary_patch_rejects_every_lifecycle_field_and_freezes_accepted_items(self):
        proposed = self.create_item()
        detail_url = self.action_url(proposed, "").rstrip("/") + "/"
        lifecycle_fields = {
            "status": TreatmentItem.Status.ACCEPTED,
            "performed_in": self.execution.pk,
            "performed_at": timezone.now().isoformat(),
            "status_reason": "No permitido",
        }

        response = self.client.patch(detail_url, lifecycle_fields, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(set(lifecycle_fields), set(response.data))
        proposed.refresh_from_db()
        self.assertEqual(proposed.status, TreatmentItem.Status.PROPOSED)
        self.assertIsNone(proposed.performed_in)

        for item_status in (
            TreatmentItem.Status.ACCEPTED,
            TreatmentItem.Status.PERFORMED,
            TreatmentItem.Status.CANCELLED,
        ):
            with self.subTest(item_status=item_status):
                frozen_item = self.create_item(status=item_status)
                frozen_url = self.action_url(frozen_item, "").rstrip("/") + "/"
                frozen = self.client.patch(
                    frozen_url,
                    {"description": "No debe cambiar"},
                    format="json",
                )
                self.assertEqual(frozen.status_code, 400)
                frozen_item.refresh_from_db()
                self.assertEqual(frozen_item.description, "Restauración con resina")

    def test_accept_and_cancel_remain_available_after_origin_closes(self):
        accepted_item = self.create_item()
        cancelled_item = self.create_item()
        self.origin.status = Consultation.Status.COMPLETED
        self.origin.save(update_fields=("status", "updated_at"))

        accepted = self.client.post(self.action_url(accepted_item, "accept"), format="json")
        cancelled = self.client.post(
            self.action_url(cancelled_item, "cancel"),
            {"reason": "No continuará"},
            format="json",
        )

        self.assertEqual(accepted.status_code, 200, accepted.data)
        self.assertEqual(cancelled.status_code, 200, cancelled.data)
        self.origin.refresh_from_db()
        self.assertEqual(self.origin.status, Consultation.Status.COMPLETED)
