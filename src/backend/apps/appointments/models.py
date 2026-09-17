from datetime import datetime, timedelta

from django.conf import settings
from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import RangeOperators
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import DEFAULT_DB_ALIAS, connections, models, transaction
from django.db.backends.postgresql.psycopg_any import DateTimeTZRange
from django.db.models import Q
from django.utils import timezone

from .fields import PostgresDateTimeRangeField
from apps.common.versioning import VersionedModel
from apps.common.immutable import ImmutableModel


BLOCKING_APPOINTMENT_STATUSES = (
    "PROGRAMADA",
    "CONFIRMADA",
    "PRESENTE",
    "EN_ATENCION",
    "COMPLETADA",
    "NO_ASISTIO",
)


def appointment_scheduled_range(appointment_date, start_time, duration_minutes):
    appointment_date = models.DateField().to_python(appointment_date)
    start_time = models.TimeField().to_python(start_time)
    start = datetime.combine(appointment_date, start_time)
    if settings.USE_TZ and timezone.is_naive(start):
        start = timezone.make_aware(start, timezone.get_default_timezone())
    end = start + timedelta(minutes=duration_minutes)
    return DateTimeTZRange(start, end, bounds="[)")


class Appointment(VersionedModel):
    class Status(models.TextChoices):
        SCHEDULED = "PROGRAMADA", "Programada"
        CONFIRMED = "CONFIRMADA", "Confirmada"
        CHECKED_IN = "PRESENTE", "Presente"
        IN_ATTENDANCE = "EN_ATENCION", "En atención"
        COMPLETED = "COMPLETADA", "Completada"
        CANCELLED = "CANCELADA", "Cancelada"
        NO_SHOW = "NO_ASISTIO", "No asistió"

    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.PROTECT,
        related_name="appointments",
    )
    dentist = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="dental_appointments",
    )
    service = models.ForeignKey(
        "clinics.ClinicService",
        on_delete=models.PROTECT,
        related_name="appointments",
        null=True,
        blank=True,
    )
    consultation = models.OneToOneField(
        "patients.Consultation",
        on_delete=models.PROTECT,
        related_name="appointment",
        null=True,
        blank=True,
    )
    date = models.DateField()
    start_time = models.TimeField()
    duration_minutes = models.PositiveSmallIntegerField(
        validators=(MinValueValidator(15), MaxValueValidator(240)),
    )
    scheduled_range = PostgresDateTimeRangeField(editable=False)
    reason = models.CharField(max_length=240)
    notes = models.TextField(blank=True)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.SCHEDULED,
    )
    cancellation_reason = models.TextField(blank=True)
    attendance_started_at = models.DateTimeField(null=True, blank=True)
    check_in_previous_status = models.CharField(max_length=16, blank=True, default="", editable=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_appointments",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("date", "start_time", "dentist__first_name", "dentist__last_name")
        indexes = (
            models.Index(fields=("date", "start_time")),
            models.Index(fields=("dentist", "date")),
            models.Index(fields=("patient", "date")),
        )
        constraints = (
            ExclusionConstraint(
                name="appointment_dentist_schedule_excl",
                expressions=(
                    ("dentist", RangeOperators.EQUAL),
                    ("scheduled_range", RangeOperators.OVERLAPS),
                ),
                condition=Q(status__in=BLOCKING_APPOINTMENT_STATUSES),
            ),
            ExclusionConstraint(
                name="appointment_patient_schedule_excl",
                expressions=(
                    ("patient", RangeOperators.EQUAL),
                    ("scheduled_range", RangeOperators.OVERLAPS),
                ),
                condition=Q(status__in=BLOCKING_APPOINTMENT_STATUSES),
            ),
        )

    def save(self, *args, **kwargs):
        database_alias = kwargs.get("using") or self._state.db or DEFAULT_DB_ALIAS
        if connections[database_alias].vendor == "postgresql":
            self.scheduled_range = appointment_scheduled_range(
                self.date,
                self.start_time,
                self.duration_minutes,
            )
            update_fields = kwargs.get("update_fields")
            if update_fields is not None and {
                "date",
                "start_time",
                "duration_minutes",
            }.intersection(update_fields):
                kwargs["update_fields"] = {*update_fields, "scheduled_range"}
            if self.status in BLOCKING_APPOINTMENT_STATUSES:
                with transaction.atomic(using=database_alias):
                    with connections[database_alias].cursor() as cursor:
                        for resource in sorted((
                            f"appointment:dentist:{self.dentist_id}",
                            f"appointment:patient:{self.patient_id}",
                        )):
                            cursor.execute(
                                "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
                                [resource],
                            )
                    return super().save(*args, **kwargs)
        return super().save(*args, **kwargs)

    @property
    def end_time(self):
        start = datetime.combine(self.date, self.start_time)
        return (start + timedelta(minutes=self.duration_minutes)).time()

    def __str__(self):
        return f"{self.patient} · {self.date} {self.start_time:%H:%M}"


class AppointmentCheckInCorrection(ImmutableModel):
    appointment = models.ForeignKey(
        Appointment, on_delete=models.PROTECT, related_name="check_in_corrections"
    )
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    reason = models.CharField(max_length=1000)
    restored_status = models.CharField(max_length=16)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at", "-pk")


class ImmutableRescheduleEventQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise ValidationError("Los eventos de reprogramación no pueden modificarse.")

    def delete(self):
        raise ValidationError("Los eventos de reprogramación no pueden eliminarse.")


class AppointmentRescheduleEvent(models.Model):
    appointment = models.ForeignKey(
        Appointment,
        on_delete=models.PROTECT,
        related_name="reschedule_events",
    )
    previous_date = models.DateField()
    previous_start_time = models.TimeField()
    previous_duration_minutes = models.PositiveSmallIntegerField()
    new_date = models.DateField()
    new_start_time = models.TimeField()
    new_duration_minutes = models.PositiveSmallIntegerField()
    reason = models.CharField(max_length=500, blank=True)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="appointment_reschedule_events",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    objects = ImmutableRescheduleEventQuerySet.as_manager()

    class Meta:
        ordering = ("-created_at", "-pk")
        indexes = (
            models.Index(
                fields=("appointment", "-created_at"),
                name="appt_reschedule_history_idx",
            ),
        )

    def save(self, *args, **kwargs):
        if self.pk is not None:
            raise ValidationError("Los eventos de reprogramación no pueden modificarse.")
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Los eventos de reprogramación no pueden eliminarse.")

    def __str__(self):
        return f"Reprogramación de cita #{self.appointment_id} · {self.created_at}"
