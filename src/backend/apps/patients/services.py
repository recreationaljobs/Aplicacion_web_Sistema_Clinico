from dataclasses import dataclass
from copy import deepcopy

from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError as RestFrameworkValidationError

from apps.appointments.models import Appointment
from apps.users.permissions import user_has_permission

from .models import Consultation, OdontogramVersion, Patient, TreatmentItem
from .traceability import record_revision
from .odontograms import (
    CURRENT_SURFACE_FINDINGS,
    CURRENT_WHOLE_FINDINGS,
    TEETH_BY_DENTITION,
    allowed_surfaces,
    normalize_teeth_snapshot,
)


class ConsultationOperationError(Exception):
    def __init__(self, code, detail, *, missing_fields=()):
        super().__init__(detail)
        self.code = code
        self.detail = detail
        self.missing_fields = tuple(missing_fields)


class TreatmentItemOperationError(Exception):
    def __init__(self, code, detail):
        super().__init__(detail)
        self.code = code
        self.detail = detail


def require_active_patient(
    patient,
    *,
    error_class=ConsultationOperationError,
):
    if patient.is_active:
        return
    raise error_class(
        "patient_inactive",
        "El paciente está inactivo; no se pueden iniciar nuevas operaciones clínicas.",
    )


def require_complete_patient_profile(
    patient,
    *,
    error_class=ConsultationOperationError,
):
    missing_fields = tuple(patient.missing_profile_fields)
    if not missing_fields:
        return
    raise error_class(
        "patient_profile_incomplete",
        "Completa los datos obligatorios del perfil antes de continuar con la atención clínica.",
        missing_fields=missing_fields,
    )


@dataclass(frozen=True)
class ConsultationOperationResult:
    consultation: Consultation
    appointment: Appointment | None


def _require_clinical_edit_permission(actor):
    if not user_has_permission(actor, "consultations.edit"):
        raise PermissionDenied("No tienes permiso para gestionar el cierre clínico.")


def _require_treatment_edit_permission(actor):
    if not user_has_permission(actor, "consultations.edit"):
        raise PermissionDenied("No tienes permiso para gestionar tratamientos clínicos.")


def _locked_treatment_item(treatment_item_id):
    return (
        TreatmentItem.objects.select_for_update(of=("self",))
        .select_related("proposed_in", "proposed_in__patient", "performed_in")
        .get(pk=treatment_item_id)
    )


def _invalid_treatment_transition(item, target):
    raise TreatmentItemOperationError(
        "treatment_invalid_transition",
        f"El tratamiento no puede pasar de {item.status} a {target}.",
    )


def accept_treatment_item(*, treatment_item_id, actor):
    _require_treatment_edit_permission(actor)
    with transaction.atomic():
        item = _locked_treatment_item(treatment_item_id)
        previous_status = item.status
        if item.status == TreatmentItem.Status.ACCEPTED:
            item._transition_from = previous_status
            return item
        if item.status != TreatmentItem.Status.PROPOSED:
            _invalid_treatment_transition(item, TreatmentItem.Status.ACCEPTED)
        item.status = TreatmentItem.Status.ACCEPTED
        item.save(update_fields=("status", "updated_at"))
        item._transition_from = previous_status
        return item


def cancel_treatment_item(*, treatment_item_id, actor, reason=""):
    _require_treatment_edit_permission(actor)
    normalized_reason = (reason or "").strip()
    if len(normalized_reason) > 1000:
        raise TreatmentItemOperationError(
            "treatment_cancel_reason_too_long",
            "El motivo de cancelación no puede exceder 1000 caracteres.",
        )
    with transaction.atomic():
        item = _locked_treatment_item(treatment_item_id)
        previous_status = item.status
        if item.status == TreatmentItem.Status.CANCELLED:
            item._transition_from = previous_status
            return item
        if item.status not in (
            TreatmentItem.Status.PROPOSED,
            TreatmentItem.Status.ACCEPTED,
        ):
            _invalid_treatment_transition(item, TreatmentItem.Status.CANCELLED)
        item.status = TreatmentItem.Status.CANCELLED
        item.status_reason = normalized_reason
        item.save(update_fields=("status", "status_reason", "updated_at"))
        item._transition_from = previous_status
        return item


def _odontogram_result_error(code, detail):
    raise TreatmentItemOperationError(code, detail)


def _validate_odontogram_result(item, latest, result):
    if not isinstance(result, dict):
        _odontogram_result_error(
            "odontogram_result_invalid",
            "El resultado odontológico debe ser un objeto.",
        )
    if not item.tooth_code:
        _odontogram_result_error(
            "odontogram_result_requires_tooth",
            "El tratamiento no tiene una pieza dental asociada.",
        )
    tooth_code = result.get("tooth_code")
    if tooth_code != item.tooth_code:
        _odontogram_result_error(
            "odontogram_result_tooth_mismatch",
            "La pieza del resultado debe coincidir con la del tratamiento.",
        )
    if tooth_code not in TEETH_BY_DENTITION[latest.dentition]:
        _odontogram_result_error(
            "odontogram_result_dentition_mismatch",
            "La pieza no corresponde a la dentición del odontograma vigente.",
        )
    surfaces = result.get("surfaces")
    if (
        not isinstance(surfaces, list)
        or any(not isinstance(surface, str) for surface in surfaces)
        or len(surfaces) != len(set(surfaces))
    ):
        _odontogram_result_error(
            "odontogram_result_invalid_surfaces",
            "Las superficies del resultado deben ser una lista sin repeticiones.",
        )
    finding = result.get("finding")
    if finding not in CURRENT_SURFACE_FINDINGS | CURRENT_WHOLE_FINDINGS:
        _odontogram_result_error(
            "odontogram_result_invalid_finding",
            "Selecciona un hallazgo actual válido.",
        )
    if finding in CURRENT_SURFACE_FINDINGS:
        if not surfaces:
            _odontogram_result_error(
                "odontogram_result_surface_required",
                "El hallazgo seleccionado requiere al menos una superficie.",
            )
        if set(surfaces) - allowed_surfaces(tooth_code):
            _odontogram_result_error(
                "odontogram_result_invalid_surface",
                "Una o más superficies no aplican a la pieza indicada.",
            )
    elif surfaces:
        _odontogram_result_error(
            "odontogram_result_whole_has_surfaces",
            "Un hallazgo de pieza completa no admite superficies.",
        )
    return tooth_code, surfaces, finding


def _create_resulting_odontogram_version(*, item, performed_in, actor, result):
    patient = Patient.objects.select_for_update().get(pk=performed_in.patient_id)
    latest = (
        OdontogramVersion.objects.filter(patient=patient)
        .order_by("-version_number")
        .first()
    )
    if latest is None:
        _odontogram_result_error(
            "odontogram_result_requires_version",
            "El paciente no tiene un odontograma vigente para registrar el resultado.",
        )
    tooth_code, surfaces, finding = _validate_odontogram_result(item, latest, result)
    teeth = deepcopy(latest.teeth)
    tooth = teeth.setdefault(tooth_code, {
        "reviewed": True,
        "note": "",
        "current": {"whole": [], "surfaces": {}},
        "planned": {"whole": [], "surfaces": {}},
    })
    tooth["reviewed"] = True
    current = tooth.setdefault("current", {"whole": [], "surfaces": {}})
    if finding in CURRENT_SURFACE_FINDINGS:
        current_surfaces = current.setdefault("surfaces", {})
        for surface in surfaces:
            current_surfaces.setdefault(surface, []).append(finding)
    else:
        current.setdefault("whole", []).append(finding)
    try:
        normalized_teeth = normalize_teeth_snapshot(teeth, latest.dentition)
    except RestFrameworkValidationError as error:
        raise TreatmentItemOperationError(
            "odontogram_snapshot_incompatible",
            "El odontograma vigente no puede recibir el resultado sin una revisión clínica.",
        ) from error
    return OdontogramVersion.objects.create(
        patient=patient,
        consultation=performed_in,
        version_number=latest.version_number + 1,
        dentition=latest.dentition,
        teeth=normalized_teeth,
        changed_teeth=[tooth_code],
        note=f"Resultado registrado al realizar el tratamiento #{item.pk}.",
        based_on=latest,
        created_by=actor,
    )


def perform_treatment_item(
    *,
    treatment_item_id,
    performed_in_id,
    actor,
    odontogram_result=None,
):
    _require_treatment_edit_permission(actor)
    with transaction.atomic():
        item = _locked_treatment_item(treatment_item_id)
        previous_status = item.status
        if item.status == TreatmentItem.Status.PERFORMED:
            if item.performed_in_id == performed_in_id:
                item._transition_from = previous_status
                return item
            _invalid_treatment_transition(item, TreatmentItem.Status.PERFORMED)
        if item.status != TreatmentItem.Status.ACCEPTED:
            _invalid_treatment_transition(item, TreatmentItem.Status.PERFORMED)

        performed_in = (
            Consultation.objects.select_for_update(of=("self",))
            .select_related("patient")
            .get(pk=performed_in_id)
        )
        if performed_in.patient_id != item.proposed_in.patient_id:
            raise TreatmentItemOperationError(
                "treatment_patient_mismatch",
                "La consulta de realización pertenece a otro paciente.",
            )
        if performed_in.status != Consultation.Status.IN_PROGRESS:
            raise TreatmentItemOperationError(
                "treatment_perform_requires_active_consultation",
                "La realización exige una consulta en progreso.",
            )

        resulting_version = None
        if odontogram_result is not None:
            resulting_version = _create_resulting_odontogram_version(
                item=item,
                performed_in=performed_in,
                actor=actor,
                result=odontogram_result,
            )
        item.status = TreatmentItem.Status.PERFORMED
        item.performed_in = performed_in
        item.performed_at = timezone.now()
        item.resulting_odontogram_version = resulting_version
        item.status_reason = ""
        item.save(
            update_fields=(
                "status",
                "performed_in",
                "performed_at",
                "resulting_odontogram_version",
                "status_reason",
                "updated_at",
            )
        )
        item._transition_from = previous_status
        return item


def _locked_consultation_and_appointment(consultation_id):
    appointment_id = (
        Appointment.objects.filter(consultation_id=consultation_id)
        .values_list("pk", flat=True)
        .first()
    )
    appointment = None
    if appointment_id is not None:
        appointment = (
            Appointment.objects.select_for_update(of=("self",))
            .select_related("patient", "dentist", "service")
            .get(pk=appointment_id)
        )
    consultation = (
        Consultation.objects.select_for_update(of=("self",))
        .select_related("patient", "professional", "completed_by")
        .get(pk=consultation_id)
    )
    if appointment is not None and appointment.consultation_id != consultation.pk:
        raise ConsultationOperationError(
            "consultation_appointment_link_changed",
            "La relación entre la consulta y la cita cambió durante la operación.",
        )
    return consultation, appointment


def _validate_existing_clinical_minimum(consultation):
    missing = [
        field
        for field in ("date", "time", "consultation_type")
        if not getattr(consultation, field)
    ]
    if not consultation.summary.strip():
        missing.append("summary")
    if missing:
        raise ConsultationOperationError(
            "consultation_missing_required_data",
            "La consulta no contiene todos los datos obligatorios para completar: "
            + ", ".join(missing),
        )


def complete_consultation(*, consultation_id, actor):
    _require_clinical_edit_permission(actor)
    with transaction.atomic():
        consultation, appointment = _locked_consultation_and_appointment(consultation_id)
        if consultation.status == Consultation.Status.COMPLETED:
            if appointment is not None and appointment.status != Appointment.Status.COMPLETED:
                raise ConsultationOperationError(
                    "consultation_appointment_state_mismatch",
                    "La consulta está completada pero su cita vinculada no lo está.",
                )
            return ConsultationOperationResult(consultation, appointment)
        if consultation.status != Consultation.Status.IN_PROGRESS:
            raise ConsultationOperationError(
                "consultation_cannot_be_completed",
                "La consulta no está en progreso y no puede completarse.",
            )
        _validate_existing_clinical_minimum(consultation)
        if appointment is not None and appointment.status != Appointment.Status.IN_ATTENDANCE:
            raise ConsultationOperationError(
                "appointment_cannot_be_completed_from_consultation",
                "La cita vinculada no está en atención.",
            )
        require_complete_patient_profile(consultation.patient)

        record_revision(patient=consultation.patient, instance=consultation, consultation=consultation, reason="Estado previo al cierre")
        consultation.status = Consultation.Status.COMPLETED
        consultation.completed_at = timezone.now()
        consultation.completed_by = actor
        consultation.save(
            update_fields=("status", "completed_at", "completed_by", "updated_at")
        )
        record_revision(patient=consultation.patient, instance=consultation, consultation=consultation, author=actor, reason="Cierre de consulta")
        if appointment is not None:
            appointment.status = Appointment.Status.COMPLETED
            appointment.save(update_fields=("status", "updated_at"))
        return ConsultationOperationResult(consultation, appointment)


def cancel_consultation(*, consultation_id, actor):
    _require_clinical_edit_permission(actor)
    with transaction.atomic():
        consultation, appointment = _locked_consultation_and_appointment(consultation_id)
        if consultation.status == Consultation.Status.CANCELLED:
            return ConsultationOperationResult(consultation, appointment)
        if consultation.status != Consultation.Status.IN_PROGRESS:
            raise ConsultationOperationError(
                "consultation_cannot_be_cancelled",
                "La consulta no está en progreso y no puede cancelarse.",
            )
        if appointment is not None:
            raise ConsultationOperationError(
                "consultation_linked_cancellation_unsupported",
                "No es posible cancelar una consulta vinculada sin una regla segura para la cita.",
            )
        record_revision(patient=consultation.patient, instance=consultation, consultation=consultation, reason="Estado previo a cancelación")
        consultation.status = Consultation.Status.CANCELLED
        consultation.save(update_fields=("status", "updated_at"))
        record_revision(patient=consultation.patient, instance=consultation, consultation=consultation, author=actor, reason="Cancelación de consulta")
        return ConsultationOperationResult(consultation, None)
