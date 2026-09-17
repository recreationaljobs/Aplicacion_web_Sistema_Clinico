from datetime import date, datetime, time, timezone
from unittest.mock import patch
from django.db import connection
from django.test.utils import CaptureQueriesContext

from django.test import override_settings
from rest_framework.test import APITestCase

from apps.clinics.models import ClinicProfile
from apps.common.test_utils import open_clinic_days
from apps.patients.models import Patient
from apps.users.models import User
from .models import Appointment
from .services import start_attendance


class AppointmentProductionTests(APITestCase):
    def setUp(self):
        open_clinic_days()
        self.reception = User.objects.create_user(email="agenda-prod@example.test", password="Synthetic123!", role="RECEPCIONISTA")
        self.dentist = User.objects.create_user(email="agenda-dentist-prod@example.test", password="Synthetic123!", role="ODONTOLOGO")
        self.patient = Patient.objects.create(first_name="Ana", last_name="Perez", birth_place="Managua", phone="88881111", gender="FEMENINO", date_of_birth=date(1990, 1, 1), registered_by=self.reception)
        self.appointment = Appointment.objects.create(patient=self.patient, dentist=self.dentist, date=date(2026, 9, 15), start_time=time(21), duration_minutes=30, reason="Synthetic appointment", created_by=self.reception)
        self.url = f"/api/appointments/{self.appointment.pk}/"
        self.client.force_authenticate(self.reception)

    def test_attendance_uses_clinic_date_across_utc_midnight(self):
        self.appointment.status = "PRESENTE"
        self.appointment.save()
        instant = datetime(2026, 9, 16, 3, tzinfo=timezone.utc)
        with patch("apps.appointments.services.timezone.now", return_value=instant):
            result = start_attendance(appointment_id=self.appointment.pk, actor=self.dentist)
        self.assertEqual(result.consultation.date, date(2026, 9, 15))
        self.assertEqual(result.consultation.time, time(21))

    @override_settings(REQUIRE_EDIT_VERSION=True)
    def test_stale_edit_is_rejected_and_keeps_latest_change(self):
        original = self.client.get(self.url).data
        self.assertIn("version", original)
        first = self.client.patch(self.url, {"reason": "Latest", "expected_version": original["version"]}, format="json")
        self.assertEqual(first.status_code, 200)
        second = self.client.patch(self.url, {"reason": "Obsolete", "expected_version": original["version"]}, format="json")
        self.assertEqual(second.status_code, 409)
        self.appointment.refresh_from_db()
        self.assertEqual(self.appointment.reason, "Latest")

    def test_arrival_can_be_undone_before_attendance(self):
        arrived = self.client.post(self.url + "check-in/")
        self.assertIn(arrived.status_code, (200, 201))
        response = self.client.post(self.url + "undo-check-in/", {"reason": "Wrong patient selected", "expected_version": arrived.data["appointment"].get("version", 1)}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "PROGRAMADA")
        correction = self.appointment.check_in_corrections.get()
        self.assertEqual(correction.reason, "Wrong patient selected")
        self.assertEqual(correction.changed_by_id, self.reception.pk)

    def test_availability_queries_do_not_grow_per_dentist(self):
        url = "/api/appointments/dentists/availability/?date=2030-01-01&start_time=09:00&duration_minutes=30"
        with CaptureQueriesContext(connection) as initial:
            response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        for index in range(5):
            User.objects.create_user(email=f"availability-{index}@example.test", password="Synthetic123!", role="ODONTOLOGO")
        with CaptureQueriesContext(connection) as expanded:
            response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertLessEqual(len(expanded), len(initial) + 1)

    def test_schedule_changes_respect_arrived_patients(self):
        from apps.clinics.availability import future_appointment_conflicts
        self.appointment.date = date(2030, 1, 1)
        self.appointment.status = "PRESENTE"
        self.appointment.save()
        conflicts = future_appointment_conflicts(closure={"date": date(2030, 1, 1)})
        self.assertEqual([item["id"] for item in conflicts], [self.appointment.pk])
