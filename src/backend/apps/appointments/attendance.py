"""One server-side decision shared by serialization and the locked start service."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from django.utils import timezone

from .models import Appointment


def attendance_availability(appointment, *, now, clinic_timezone):
    start = timezone.make_aware(
        datetime.combine(appointment.date, appointment.start_time), ZoneInfo(clinic_timezone),
    )
    end = start + timedelta(minutes=appointment.duration_minutes)
    code, detail = "available", "La consulta está disponible."
    if appointment.consultation_id:
        code, detail = "existing_consultation", "La cita ya tiene una consulta asociada."
    elif appointment.status not in (
        Appointment.Status.SCHEDULED,
        Appointment.Status.CONFIRMED,
        Appointment.Status.CHECKED_IN,
    ):
        code = "appointment_cannot_start_attendance"
        detail = (
            "No se puede iniciar una consulta para una cita cancelada."
            if appointment.status == Appointment.Status.CANCELLED
            else "La cita no está en un estado que permita iniciar la atención."
        )
    elif now < start:
        code = "appointment_not_due"
        detail = "La consulta estará disponible a partir de la hora programada de la cita."
    elif now >= end:
        code = "appointment_window_closed"
        detail = (
            "El horario de atención de la cita ha finalizado. "
            "Reprograma la cita para iniciar una consulta."
        )
    elif not appointment.patient.is_active:
        code = "patient_inactive"
        detail = "El paciente está inactivo; no se pueden iniciar nuevas operaciones clínicas."
    return {
        "can_start": code == "available",
        "code": code,
        "detail": detail,
        "starts_at": start.isoformat(),
        "ends_at": end.isoformat(),
        "server_now": now.isoformat(),
    }
