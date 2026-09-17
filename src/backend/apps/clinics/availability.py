from datetime import datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.utils import timezone

from .models import BusinessHour, ClinicProfile, HolidayClosure


def minutes(value):
    return value.hour * 60 + value.minute


def clinic_today():
    profile = ClinicProfile.load()
    try:
        clinic_zone = ZoneInfo(profile.timezone)
    except ZoneInfoNotFoundError:
        clinic_zone = ZoneInfo("America/Managua")
    return timezone.now().astimezone(clinic_zone).date()


def closure_for_date(appointment_date):
    for closure in HolidayClosure.objects.filter(is_active=True):
        if closure.date == appointment_date:
            return closure
        if closure.repeats_annually and (
            closure.date.month,
            closure.date.day,
        ) == (appointment_date.month, appointment_date.day):
            return closure
    return None


def schedule_error(appointment_date, start_time, duration_minutes):
    closure = closure_for_date(appointment_date)
    if closure:
        return f"La clínica está cerrada por {closure.name}."
    try:
        business_hour = BusinessHour.objects.prefetch_related("breaks").get(
            weekday=appointment_date.weekday(),
        )
    except BusinessHour.DoesNotExist:
        return "La clínica está cerrada ese día."
    if not business_hour.is_open:
        return "La clínica está cerrada ese día."
    start = minutes(start_time)
    end = start + duration_minutes
    if (
        business_hour.opens_at is None
        or business_hour.closes_at is None
        or start < minutes(business_hour.opens_at)
        or end > minutes(business_hour.closes_at)
    ):
        return "La cita debe estar completamente dentro de la jornada de atención."
    for business_break in business_hour.breaks.all():
        if minutes(business_break.starts_at) < end and minutes(business_break.ends_at) > start:
            return "La cita se solapa con una pausa de atención."
    return None


def _prospective_hours_error(appointment, days_by_weekday):
    day = days_by_weekday[appointment.date.weekday()]
    if not day["is_open"]:
        return True
    start = minutes(appointment.start_time)
    end = start + appointment.duration_minutes
    if start < minutes(day["opens_at"]) or end > minutes(day["closes_at"]):
        return True
    return any(
        minutes(item["starts_at"]) < end and minutes(item["ends_at"]) > start
        for item in day.get("breaks", [])
    )


def future_appointment_conflicts(*, days=None, closure=None):
    from apps.appointments.models import Appointment

    appointments = Appointment.objects.select_related("patient").filter(
        date__gte=clinic_today(),
        status__in=(
            Appointment.Status.SCHEDULED, Appointment.Status.CONFIRMED,
            Appointment.Status.CHECKED_IN, Appointment.Status.IN_ATTENDANCE,
        ),
    )
    if days is not None:
        days_by_weekday = {day["weekday"]: day for day in days}
        appointments = [
            item for item in appointments if _prospective_hours_error(item, days_by_weekday)
        ]
    elif closure is not None and closure.get("is_active", True):
        closure_date = closure["date"]
        recurring = closure.get("repeats_annually", False)
        appointments = [
            item for item in appointments
            if item.date == closure_date
            or recurring and (item.date.month, item.date.day) == (closure_date.month, closure_date.day)
        ]
    else:
        appointments = []
    return [
        {
            "id": item.pk,
            "date": item.date,
            "start_time": item.start_time,
            "patient_name": item.patient.full_name,
        }
        for item in appointments
    ]


def conflict_validation_error(conflicts):
    return {
        "detail": "La configuración afecta citas futuras.",
        "conflicting_appointments": conflicts,
    }
