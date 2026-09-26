from datetime import time

from django.core.signals import request_finished
from django.db import close_old_connections, connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase


def open_clinic_days():
    """Explicit open-hours fixture for tests that expect successful bookings."""
    from apps.clinics.models import BusinessHour

    for weekday in range(7):
        BusinessHour.objects.update_or_create(
            weekday=weekday,
            defaults={"is_open": True, "opens_at": time(0), "closes_at": time(23, 59)},
        )


def assign_test_patient(patient, dentist):
    """Explicit historical assignment for tests of existing clinical records."""
    from datetime import date, timedelta
    from apps.appointments.models import Appointment

    if not Appointment.objects.filter(patient=patient, dentist=dentist).exists():
        Appointment.objects.create(
            patient=patient, dentist=dentist, created_by=patient.registered_by,
            date=date(2000, 1, 1) + timedelta(days=patient.pk + dentist.pk * 100),
            start_time=time(9), duration_minutes=30, reason="Asignación histórica de prueba",
            status=Appointment.Status.COMPLETED,
        )


def assigned_test_consultation(**values):
    """Legacy consultation fixture with an explicit, independent appointment."""
    from apps.patients.models import Consultation

    assign_test_patient(values["patient"], values["professional"])
    return Consultation.objects.create(**values)


def start_test_attendance(client, appointment):
    """Exercise the real endpoint with server time inside this fixture's booking."""
    from datetime import datetime
    from unittest.mock import patch
    from zoneinfo import ZoneInfo
    from django.db import models
    from apps.clinics.models import ClinicProfile

    now = datetime.combine(models.DateField().to_python(appointment.date),
        models.TimeField().to_python(appointment.start_time), ZoneInfo(ClinicProfile.load().timezone))
    with patch("django.utils.timezone.now", return_value=now):
        return client.post(f"/api/appointments/{appointment.pk}/start-attendance/", format="json")


def legacy_consultation_response(patient, professional, data):
    """Build legacy clinical fixtures via the serializer; never bypass an API guard."""
    from rest_framework.response import Response
    from apps.patients.serializers import ConsultationSerializer

    serializer = ConsultationSerializer(data=data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)
    assign_test_patient(patient, professional)
    serializer.save(patient=patient, professional=professional)
    return Response(serializer.data, status=201)


class MigrationTestCase(TransactionTestCase):
    """Restore the complete migration graph before Django flushes the test DB."""

    def _post_teardown(self):
        try:
            executor = MigrationExecutor(connection)
            executor.migrate(executor.loader.graph.leaf_nodes())
        finally:
            super()._post_teardown()


def close_test_response(response):
    """Close a streaming response without closing a TestCase transaction."""

    disconnected = request_finished.disconnect(close_old_connections)
    try:
        response.close()
    finally:
        if disconnected:
            request_finished.connect(close_old_connections)
