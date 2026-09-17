from dataclasses import dataclass

from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.utils import timezone
from zoneinfo import ZoneInfo

from apps.clinics.models import ClinicProfile
from apps.common.versioning import EditConflict
from apps.patients.traceability import record_revision

from apps.patients.models import Consultation
from apps.patients.odontograms import create_initial_odontogram_version
from apps.patients.services import require_active_patient, require_complete_patient_profile
from apps.users.models import User
from apps.users.permissions import user_has_permission

from .models import Appointment, AppointmentCheckInCorrection, AppointmentRescheduleEvent


class AppointmentAttendanceError(Exception):
    def __init__(self, code, detail, *, missing_fields=()):
        super().__init__(detail)
        self.code = code
        self.detail = detail
        self.missing_fields = tuple(missing_fields)


class AppointmentCheckInError(Exception):
    def __init__(self, code, detail):
        super().__init__(detail)
        self.code = code
        self.detail = detail


@dataclass(frozen=True)
class AttendanceStartResult:
    appointment: Appointment
    consultation: Consultation
    created: bool


@dataclass(frozen=True)
class AppointmentCheckInResult:
    appointment: Appointment
    changed: bool


@dataclass(frozen=True)
class AppointmentUpdateResult:
    appointment: Appointment
    reschedule_event: AppointmentRescheduleEvent | None


def _attendance_queryset_for_actor(actor):
    queryset = Appointment.objects.select_for_update(of=("self",)).select_related(
        "patient",
        "dentist",
        "service",
    )
    if user_has_permission(actor, "appointments.view_all"):
        return queryset
    return queryset.filter(dentist=actor)


def check_in_appointment(*, appointment_id, actor):
    if not user_has_permission(actor, "appointments.edit"):
        raise PermissionDenied("No tienes permiso para registrar la llegada del paciente.")

    with transaction.atomic():
        appointment = _attendance_queryset_for_actor(actor).get(pk=appointment_id)
        if appointment.status == Appointment.Status.CHECKED_IN:
            return AppointmentCheckInResult(appointment=appointment, changed=False)
        if appointment.status not in (
            Appointment.Status.SCHEDULED,
            Appointment.Status.CONFIRMED,
        ):
            raise AppointmentCheckInError(
                "appointment_cannot_check_in",
                "La cita no está en un estado que permita registrar la llegada.",
            )
        require_active_patient(
            appointment.patient,
            error_class=AppointmentCheckInError,
        )
        appointment.check_in_previous_status = appointment.status
        appointment.status = Appointment.Status.CHECKED_IN
        appointment.save(update_fields=("status", "check_in_previous_status", "updated_at"))
        return AppointmentCheckInResult(appointment=appointment, changed=True)


@transaction.atomic
def update_appointment_with_history(*, appointment, changes, actor, reason=""):
    previous_interval = (
        appointment.date,
        appointment.start_time,
        appointment.duration_minutes,
    )
    for field, value in changes.items():
        setattr(appointment, field, value)
    appointment.save()
    new_interval = (
        appointment.date,
        appointment.start_time,
        appointment.duration_minutes,
    )
    event = None
    if new_interval != previous_interval:
        event = AppointmentRescheduleEvent.objects.create(
            appointment=appointment,
            previous_date=previous_interval[0],
            previous_start_time=previous_interval[1],
            previous_duration_minutes=previous_interval[2],
            new_date=new_interval[0],
            new_start_time=new_interval[1],
            new_duration_minutes=new_interval[2],
            reason=reason,
            changed_by=actor,
        )
    return AppointmentUpdateResult(
        appointment=appointment,
        reschedule_event=event,
    )


def undo_check_in(*, appointment_id, actor, reason, expected_version):
    if not user_has_permission(actor, "appointments.edit"):
        raise PermissionDenied("No tienes permiso para corregir una llegada.")
    with transaction.atomic():
        appointment = _attendance_queryset_for_actor(actor).get(pk=appointment_id)
        if appointment.version != expected_version:
            raise EditConflict(appointment.version)
        if appointment.status != Appointment.Status.CHECKED_IN or appointment.consultation_id:
            raise AppointmentCheckInError("appointment_cannot_undo_check_in", "Solo puede corregirse una llegada antes de iniciar la atención.")
        if appointment.check_in_previous_status not in (Appointment.Status.SCHEDULED, Appointment.Status.CONFIRMED):
            raise AppointmentCheckInError("appointment_check_in_origin_unknown", "Esta llegada antigua no conserva su estado anterior.")
        appointment.status = appointment.check_in_previous_status
        appointment.check_in_previous_status = ""
        appointment.save(update_fields=("status", "check_in_previous_status", "updated_at"))
        AppointmentCheckInCorrection.objects.create(
            appointment=appointment, changed_by=actor, reason=reason,
            restored_status=appointment.status,
        )
        return appointment


def start_attendance(*, appointment_id, actor):
    if not user_has_permission(actor, "consultations.create"):
        raise PermissionDenied("No tienes permiso para iniciar atenciones clínicas.")
    if actor.role != User.Role.ADMINISTRADOR and actor.role != User.Role.ODONTOLOGO:
        raise PermissionDenied("Sólo un profesional clínico puede iniciar la atención.")

    with transaction.atomic():
        appointment = _attendance_queryset_for_actor(actor).get(pk=appointment_id)
        if appointment.consultation_id:
            return AttendanceStartResult(
                appointment=appointment,
                consultation=Consultation.objects.get(pk=appointment.consultation_id),
                created=False,
            )
        if appointment.status not in (
            Appointment.Status.SCHEDULED,
            Appointment.Status.CONFIRMED,
            Appointment.Status.CHECKED_IN,
        ):
            raise AppointmentAttendanceError(
                "appointment_cannot_start_attendance",
                "La cita no está en un estado que permita iniciar la atención.",
            )
        require_active_patient(
            appointment.patient,
            error_class=AppointmentAttendanceError,
        )
        require_complete_patient_profile(
            appointment.patient,
            error_class=AppointmentAttendanceError,
        )

        started_at = timezone.now()
        local_started_at = started_at.astimezone(ZoneInfo(ClinicProfile.load().timezone))
        consultation = Consultation.objects.create(
            patient=appointment.patient,
            professional=appointment.dentist,
            date=local_started_at.date(),
            time=local_started_at.time().replace(microsecond=0),
            consultation_type=Consultation.Type.GENERAL,
            summary=appointment.reason,
            status=Consultation.Status.IN_PROGRESS,
            dental_service=appointment.service.name if appointment.service_id else "",
            chief_complaint=appointment.reason,
        )
        create_initial_odontogram_version(consultation)
        record_revision(patient=consultation.patient, instance=consultation, consultation=consultation, author=actor, reason="Inicio de atención desde cita")
        appointment.consultation = consultation
        appointment.status = Appointment.Status.IN_ATTENDANCE
        appointment.attendance_started_at = started_at
        appointment.save(
            update_fields=(
                "consultation",
                "status",
                "attendance_started_at",
                "updated_at",
            )
        )
        return AttendanceStartResult(
            appointment=appointment,
            consultation=consultation,
            created=True,
        )
