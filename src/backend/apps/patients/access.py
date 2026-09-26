"""Row-level scope; views still enforce their existing capability requirements."""
from zoneinfo import ZoneInfo

from django.db.models import Exists, OuterRef, Q, Subquery
from django.utils import timezone

from apps.appointments.models import Appointment
from apps.clinics.models import ClinicProfile
from apps.users.models import User
from apps.users.permissions import user_has_permission
from .models import Consultation, OdontogramVersion, Patient, PatientDocument, TreatmentItem


def patients_visible_to(user, queryset=None):
    queryset = Patient.objects.all() if queryset is None else queryset
    if user.role == User.Role.ODONTOLOGO:
        return queryset.filter(Exists(Appointment.objects.filter(
            patient_id=OuterRef("pk"), dentist_id=user.pk,
        )))
    return queryset


def consultations_visible_to(user, queryset=None):
    queryset = Consultation.objects.all() if queryset is None else queryset
    if user.role == User.Role.ODONTOLOGO:
        return queryset.filter(
            professional=user, patient_id__in=patients_visible_to(user).values("pk"),
        ).filter(Q(appointment__isnull=True) | Q(appointment__dentist=user))
    return queryset


def odontograms_visible_to(user, queryset=None):
    queryset = OdontogramVersion.objects.all() if queryset is None else queryset
    if user.role == User.Role.ODONTOLOGO:
        return queryset.filter(consultation_id__in=consultations_visible_to(user).values("pk"))
    return queryset


def treatments_visible_to(user, queryset=None):
    queryset = TreatmentItem.objects.all() if queryset is None else queryset
    if user.role == User.Role.ODONTOLOGO:
        consultations = consultations_visible_to(user).values("pk")
        return queryset.filter(proposed_in_id__in=consultations).filter(
            Q(performed_in__isnull=True) | Q(performed_in_id__in=consultations),
        )
    return queryset


def documents_visible_to(user, queryset=None):
    queryset = PatientDocument.objects.all() if queryset is None else queryset
    if user.role == User.Role.ODONTOLOGO:
        return queryset.filter(patient_id__in=patients_visible_to(user).values("pk")).filter(
            Q(consultation__isnull=True)
            | Q(consultation_id__in=consultations_visible_to(user).values("pk")),
        )
    return queryset


def with_dentist_summary(queryset, user):
    now = timezone.now().astimezone(ZoneInfo(ClinicProfile.load().timezone))
    upcoming = Appointment.objects.filter(
        patient_id=OuterRef("pk"), dentist=user,
        status__in=("PROGRAMADA", "CONFIRMADA", "PRESENTE"),
    ).filter(
        Q(date__gt=now.date())
        | Q(date=now.date(), start_time__gte=now.time().replace(tzinfo=None))
    )
    upcoming = upcoming.order_by("date", "start_time", "pk")
    latest = consultations_visible_to(user).filter(
        patient_id=OuterRef("pk"),
    ).order_by("-date", "-time", "-pk")
    can_appointments = user_has_permission(user, "appointments.view")
    can_consultations = user_has_permission(user, "consultations.view")
    if not can_appointments:
        upcoming = upcoming.none()
    if not can_consultations:
        latest = latest.none()
    return queryset.annotate(
        next_appointment_date=Subquery(upcoming.values("date")[:1]),
        next_appointment_time=Subquery(upcoming.values("start_time")[:1]),
        next_appointment_status=Subquery(upcoming.values("status")[:1]),
        last_consultation_date=Subquery(latest.values("date")[:1]),
    )
