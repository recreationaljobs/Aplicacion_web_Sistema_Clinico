from datetime import UTC, date, datetime, time, timedelta
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.test import SimpleTestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.clinics.models import (
    BusinessBreak,
    BusinessHour,
    ClinicProfile,
    ClinicService,
    HolidayClosure,
    ServiceCategory,
)
from apps.audit.models import AuditEvent
from apps.common.test_utils import open_clinic_days
from apps.patients.models import Consultation, OdontogramVersion, Patient
from apps.users.models import RolePermissionPreset, User

from apps.common.test_utils import assign_test_patient
from . import models as appointment_models
from .models import Appointment


class AppointmentRangeTests(SimpleTestCase):
    def test_builds_a_timezone_aware_half_open_scheduled_range(self):
        range_builder = getattr(
            appointment_models,
            "appointment_scheduled_range",
            None,
        )
        self.assertIsNotNone(range_builder)

        scheduled_range = range_builder(
            date(2026, 8, 12),
            time(9, 0),
            60,
        )

        self.assertEqual(scheduled_range.lower, datetime(2026, 8, 12, 9, 0, tzinfo=UTC))
        self.assertEqual(scheduled_range.upper, datetime(2026, 8, 12, 10, 0, tzinfo=UTC))
        self.assertEqual(scheduled_range.bounds, "[)")

    def test_normalizes_model_field_strings_before_building_the_range(self):
        scheduled_range = appointment_models.appointment_scheduled_range(
            "2026-08-12",
            "09:00:00",
            60,
        )

        self.assertEqual(scheduled_range.lower, datetime(2026, 8, 12, 9, 0, tzinfo=UTC))
        self.assertEqual(scheduled_range.upper, datetime(2026, 8, 12, 10, 0, tzinfo=UTC))


class AppointmentApiTests(APITestCase):
    list_url = "/api/appointments/"

    def setUp(self):
        clock = patch("django.utils.timezone.now", return_value=datetime(2026, 8, 12, 15, 0, tzinfo=UTC))
        clock.start()
        self.addCleanup(clock.stop)
        open_clinic_days()
        self.receptionist = User.objects.create_user(
            email="recepcion-citas@dentalclinic.com",
            password="ContraseñaRecepcion123!",
            role=User.Role.RECEPCIONISTA,
            first_name="Rosa",
            last_name="López",
        )
        self.dentist = User.objects.create_user(
            email="odontologa@dentalclinic.com",
            password="ContraseñaOdontologa123!",
            role=User.Role.ODONTOLOGO,
            first_name="Elena",
            last_name="Vargas",
        )
        self.other_dentist = User.objects.create_user(
            email="odontologo2@dentalclinic.com",
            password="ContraseñaOdontologo123!",
            role=User.Role.ODONTOLOGO,
            first_name="Mario",
            last_name="Ruiz",
        )
        self.admin = User.objects.create_user(
            email="admin-citas@dentalclinic.com",
            password="ContraseñaAdmin123!",
            role=User.Role.ADMINISTRADOR,
        )
        self.patient = self.create_patient("001-010190-0001A", "Ana")
        self.other_patient = self.create_patient("001-020290-0002B", "Luis")

    def create_patient(self, identification_number, first_name, **overrides):
        values = {
            "first_name": first_name,
            "last_name": "Pérez",
            "birth_place": "Managua",
            "identification_type": Patient.IdentificationType.CEDULA,
            "identification_number": identification_number,
            "phone": "+505 8000 0000",
            "gender": Patient.Gender.FEMENINO,
            "date_of_birth": date(1990, 1, 1),
            "registered_by": self.receptionist,
        }
        values.update(overrides)
        return Patient.objects.create(**values)

    def payload(self, **overrides):
        values = {
            "patient": self.patient.pk,
            "dentist": self.dentist.pk,
            "date": "2026-08-12",
            "start_time": "09:00",
            "duration_minutes": 60,
            "reason": "Valoración para tratamiento de ortodoncia",
            "notes": "Paciente refiere sensibilidad.",
        }
        values.update(overrides)
        return values

    def create_appointment(self, **overrides):
        values = {
            "patient": self.patient,
            "dentist": self.dentist,
            "date": date(2026, 8, 12),
            "start_time": time(9, 0),
            "duration_minutes": 60,
            "reason": "Valoración para tratamiento de ortodoncia",
            "created_by": self.receptionist,
        }
        values.update(overrides)
        return Appointment.objects.create(**values)

    def test_receptionist_creates_a_scheduled_appointment(self):
        self.client.force_authenticate(self.receptionist)

        response = self.client.post(self.list_url, self.payload(), format="json")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["status"], Appointment.Status.SCHEDULED)
        self.assertEqual(response.data["patient_name"], "Ana Pérez")
        self.assertEqual(response.data["dentist_name"], "Elena Vargas")
        self.assertEqual(response.data["end_time"], "10:00:00")
        self.assertEqual(response.data["created_by"], self.receptionist.pk)

    def test_create_requires_capability_and_administrator_keeps_implicit_access(self):
        self.client.force_authenticate(self.dentist)
        self.assertEqual(self.client.post(self.list_url, self.payload(), format="json").status_code, 403)

        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(self.list_url, self.payload(), format="json").status_code, 201)

    def test_create_rejects_inactive_patient_or_invalid_dentist(self):
        inactive_patient = self.create_patient(
            "001-030390-0003C", "Marta", is_active=False,
        )
        inactive_dentist = User.objects.create_user(
            email="inactiva@dentalclinic.com",
            password="ContraseñaInactiva123!",
            role=User.Role.ODONTOLOGO,
            is_active=False,
        )
        self.client.force_authenticate(self.receptionist)

        patient_response = self.client.post(
            self.list_url, self.payload(patient=inactive_patient.pk), format="json",
        )
        dentist_response = self.client.post(
            self.list_url, self.payload(dentist=inactive_dentist.pk), format="json",
        )
        receptionist_response = self.client.post(
            self.list_url, self.payload(dentist=self.receptionist.pk), format="json",
        )

        self.assertEqual(patient_response.status_code, 400)
        self.assertIn("patient", patient_response.data)
        self.assertEqual(dentist_response.status_code, 400)
        self.assertIn("dentist", dentist_response.data)
        self.assertEqual(receptionist_response.status_code, 400)

    def test_rejects_overlaps_for_dentist_and_patient_but_allows_adjacent_slots(self):
        self.create_appointment()
        self.client.force_authenticate(self.receptionist)

        dentist_overlap = self.client.post(
            self.list_url,
            self.payload(patient=self.other_patient.pk, start_time="09:30", duration_minutes=30),
            format="json",
        )
        patient_overlap = self.client.post(
            self.list_url,
            self.payload(dentist=self.other_dentist.pk, start_time="08:30", duration_minutes=60),
            format="json",
        )
        adjacent = self.client.post(
            self.list_url,
            self.payload(patient=self.other_patient.pk, start_time="10:00", duration_minutes=30),
            format="json",
        )

        self.assertEqual(dentist_overlap.status_code, 400)
        self.assertIn("El odontólogo ya tiene", str(dentist_overlap.data))
        self.assertEqual(patient_overlap.status_code, 400)
        self.assertIn("El paciente ya tiene", str(patient_overlap.data))
        self.assertEqual(adjacent.status_code, 201)

    def test_cancelled_appointments_do_not_block_availability(self):
        self.create_appointment(status=Appointment.Status.CANCELLED)
        self.client.force_authenticate(self.receptionist)

        response = self.client.post(self.list_url, self.payload(), format="json")

        self.assertEqual(response.status_code, 201)

    def test_list_filters_by_day_dentist_and_status(self):
        expected = self.create_appointment(status=Appointment.Status.CONFIRMED)
        self.create_appointment(
            patient=self.other_patient,
            dentist=self.other_dentist,
            date=date(2026, 8, 13),
        )
        self.client.force_authenticate(self.dentist)

        response = self.client.get(
            f"{self.list_url}?date=2026-08-12&dentist={self.dentist.pk}&status=CONFIRMADA",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["id"] for item in response.data["results"]], [expected.pk])

    def test_appointment_list_is_paginated(self):
        self.create_appointment()
        self.create_appointment(
            patient=self.other_patient,
            dentist=self.other_dentist,
            start_time=time(11, 0),
        )
        self.client.force_authenticate(self.receptionist)

        response = self.client.get(self.list_url, {"page_size": 1})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertIsNotNone(response.data["next"])

    def test_dentist_without_view_all_only_lists_own_appointments(self):
        own = self.create_appointment(dentist=self.dentist)
        self.create_appointment(
            patient=self.other_patient,
            dentist=self.other_dentist,
            start_time=time(11, 0),
        )
        self.client.force_authenticate(self.dentist)

        response = self.client.get(
            f"{self.list_url}?date=2026-08-12&dentist={self.other_dentist.pk}",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"], [])

        response = self.client.get(f"{self.list_url}?date=2026-08-12")
        self.assertEqual([item["id"] for item in response.data["results"]], [own.pk])

    def test_dentist_with_view_all_still_lists_only_own_appointments(self):
        first = self.create_appointment(dentist=self.dentist)
        second = self.create_appointment(
            patient=self.other_patient,
            dentist=self.other_dentist,
            start_time=time(11, 0),
        )
        RolePermissionPreset.objects.update_or_create(
            role=User.Role.ODONTOLOGO,
            defaults={"permissions": ["appointments.view", "appointments.view_all"]},
        )
        self.client.force_authenticate(self.dentist)

        response = self.client.get(f"{self.list_url}?date=2026-08-12")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [item["id"] for item in response.data["results"]],
            [first.pk],
        )

    def test_dentist_without_view_all_cannot_retrieve_another_dentists_appointment(self):
        appointment = self.create_appointment(dentist=self.other_dentist)
        self.client.force_authenticate(self.dentist)

        response = self.client.get(f"{self.list_url}{appointment.pk}/")

        self.assertEqual(response.status_code, 404)

    def test_list_filters_an_inclusive_date_range_for_calendar_views(self):
        first = self.create_appointment(date=date(2026, 8, 10))
        second = self.create_appointment(
            patient=self.other_patient,
            dentist=self.other_dentist,
            date=date(2026, 8, 16),
        )
        self.create_appointment(date=date(2026, 8, 17))
        self.client.force_authenticate(self.receptionist)

        response = self.client.get(
            f"{self.list_url}?date_from=2026-08-10&date_to=2026-08-16",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [item["id"] for item in response.data["results"]],
            [first.pk, second.pk],
        )

    def test_availability_returns_only_active_non_overlapping_dentists(self):
        self.create_appointment()
        User.objects.create_user(
            email="odontologo-inactivo@dentalclinic.com",
            password="ContraseñaInactivo123!",
            role=User.Role.ODONTOLOGO,
            is_active=False,
        )
        self.client.force_authenticate(self.receptionist)

        response = self.client.get(
            f"{self.list_url}dentists/availability/"
            "?date=2026-08-12&start_time=09:30&duration_minutes=30",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["id"] for item in response.data], [self.other_dentist.pk])
        self.assertEqual(response.data[0]["full_name"], "Mario Ruiz")

    def test_availability_for_a_restricted_dentist_only_returns_their_account(self):
        self.client.force_authenticate(self.dentist)

        response = self.client.get(
            f"{self.list_url}dentists/availability/"
            "?date=2026-08-12&start_time=11:00&duration_minutes=30",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["id"] for item in response.data], [self.dentist.pk])

    def test_patch_excludes_current_appointment_from_conflicts(self):
        appointment = self.create_appointment()
        self.client.force_authenticate(self.receptionist)

        response = self.client.patch(
            f"{self.list_url}{appointment.pk}/",
            {"start_time": "09:15", "duration_minutes": 45},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["end_time"], "10:00:00")

    def test_status_transitions_follow_the_appointment_lifecycle(self):
        appointment = self.create_appointment()
        self.client.force_authenticate(self.receptionist)
        detail_url = f"{self.list_url}{appointment.pk}/"

        confirmed = self.client.patch(detail_url, {"status": "CONFIRMADA"}, format="json")
        completed = self.client.patch(detail_url, {"status": "COMPLETADA"}, format="json")
        terminal_edit = self.client.patch(detail_url, {"reason": "Cambio tardío"}, format="json")

        self.assertEqual(confirmed.status_code, 200)
        self.assertEqual(completed.status_code, 400)
        self.assertEqual(terminal_edit.status_code, 200)
        self.assertIn("acción clínica", str(completed.data))

    def test_invalid_transition_is_rejected_and_cancellation_reason_is_optional(self):
        scheduled = self.create_appointment()
        other = self.create_appointment(
            patient=self.other_patient,
            dentist=self.other_dentist,
            start_time=time(11, 0),
        )
        self.client.force_authenticate(self.receptionist)

        invalid = self.client.patch(
            f"{self.list_url}{scheduled.pk}/", {"status": "COMPLETADA"}, format="json",
        )
        cancelled = self.client.patch(
            f"{self.list_url}{other.pk}/", {"status": "CANCELADA"}, format="json",
        )

        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(cancelled.status_code, 200)
        self.assertEqual(cancelled.data["cancellation_reason"], "")

    def test_edit_requires_edit_capability_and_delete_is_not_exposed(self):
        appointment = self.create_appointment()
        detail_url = f"{self.list_url}{appointment.pk}/"
        self.client.force_authenticate(self.dentist)

        self.assertEqual(
            self.client.patch(detail_url, {"reason": "Sin permiso"}, format="json").status_code,
            403,
        )
        self.client.force_authenticate(self.receptionist)
        self.assertEqual(self.client.delete(detail_url).status_code, 405)

        preset = RolePermissionPreset.objects.get(role=User.Role.RECEPCIONISTA)
        preset.permissions = [code for code in preset.permissions if code != "appointments.edit"]
        preset.save(update_fields=["permissions"])
        self.client.force_authenticate(self.receptionist)
        self.assertEqual(
            self.client.patch(detail_url, {"reason": "Sin permiso"}, format="json").status_code,
            403,
        )

    def test_restricted_dentist_can_only_create_and_edit_their_own_appointments(self):
        assign_test_patient(self.patient, self.dentist)
        RolePermissionPreset.objects.update_or_create(
            role=User.Role.ODONTOLOGO,
            defaults={
                "permissions": [
                    "appointments.view",
                    "appointments.create",
                    "appointments.edit",
                ],
            },
        )
        self.client.force_authenticate(self.dentist)

        other_create = self.client.post(
            self.list_url,
            self.payload(dentist=self.other_dentist.pk),
            format="json",
        )
        own_create = self.client.post(
            self.list_url,
            self.payload(dentist=self.dentist.pk),
            format="json",
        )

        self.assertEqual(other_create.status_code, 403)
        self.assertEqual(own_create.status_code, 201)

        reassign = self.client.patch(
            f"{self.list_url}{own_create.data['id']}/",
            {"dentist": self.other_dentist.pk},
            format="json",
        )
        self.assertEqual(reassign.status_code, 403)

        other_appointment = self.create_appointment(
            patient=self.other_patient,
            dentist=self.other_dentist,
            start_time=time(13, 0),
        )
        other_edit = self.client.patch(
            f"{self.list_url}{other_appointment.pk}/",
            {"dentist": self.other_dentist.pk, "reason": "Intento de edición"},
            format="json",
        )
        self.assertEqual(other_edit.status_code, 404)

    def test_accepts_15_minute_blocks_and_optional_active_service(self):
        category = ServiceCategory.objects.create(name="Ortodoncia")
        service = ClinicService.objects.create(
            category=category,
            name="Control de ortodoncia",
            duration_minutes=15,
            price="450.00",
        )
        self.client.force_authenticate(self.receptionist)

        minimum = self.client.post(
            self.list_url,
            self.payload(service=service.pk, duration_minutes=15),
            format="json",
        )
        maximum = self.client.post(
            self.list_url,
            self.payload(
                patient=self.other_patient.pk,
                dentist=self.other_dentist.pk,
                start_time="12:00",
                duration_minutes=240,
            ),
            format="json",
        )
        invalid = self.client.post(
            self.list_url,
            self.payload(start_time="15:00", duration_minutes=20),
            format="json",
        )

        self.assertEqual(minimum.status_code, 201)
        self.assertEqual(minimum.data["service"], service.pk)
        self.assertEqual(minimum.data["service_name"], "Control de ortodoncia")
        self.assertEqual(maximum.status_code, 201)
        self.assertEqual(invalid.status_code, 400)
        self.assertIn("15", str(invalid.data))

    def test_archived_service_cannot_be_selected_but_remains_on_historical_appointment(self):
        category = ServiceCategory.objects.create(name="General")
        service = ClinicService.objects.create(
            category=category,
            name="Limpieza",
            duration_minutes=45,
            price="650.00",
        )
        appointment = self.create_appointment(service=service)
        service.is_active = False
        service.save(update_fields=("is_active",))
        self.client.force_authenticate(self.receptionist)

        rejected = self.client.post(
            self.list_url,
            self.payload(service=service.pk, start_time="11:00"),
            format="json",
        )
        retained = self.client.patch(
            f"{self.list_url}{appointment.pk}/",
            {"notes": "Conservar servicio archivado"},
            format="json",
        )

        self.assertEqual(rejected.status_code, 400)
        self.assertEqual(retained.status_code, 200)
        self.assertEqual(retained.data["service"], service.pk)
        self.assertEqual(retained.data["service_name"], "Limpieza")

    def test_closed_day_rejects_booking_before_first_hours_save(self):
        profile = ClinicProfile.load()
        self.assertFalse(profile.schedule_configured)
        BusinessHour.objects.update_or_create(
            weekday=5, defaults={"is_open": False, "opens_at": None, "closes_at": None},
        )
        self.client.force_authenticate(self.receptionist)
        response = self.client.post(
            self.list_url, self.payload(date="2026-09-19"), format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("cerrada", str(response.data).lower())
        self.assertFalse(Appointment.objects.exists())

    def test_closed_day_rejects_availability_before_first_hours_save(self):
        self.assertFalse(ClinicProfile.load().schedule_configured)
        BusinessHour.objects.update_or_create(
            weekday=5, defaults={"is_open": False, "opens_at": None, "closes_at": None},
        )
        self.client.force_authenticate(self.receptionist)
        response = self.client.get(
            f"{self.list_url}dentists/availability/"
            "?date=2026-09-19&start_time=09:00&duration_minutes=30",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("cerrada", str(response.data).lower())

    def test_existing_closed_day_appointment_can_be_cancelled(self):
        BusinessHour.objects.update_or_create(
            weekday=5, defaults={"is_open": False, "opens_at": None, "closes_at": None},
        )
        appointment = self.create_appointment(date=date(2026, 9, 19))
        self.client.force_authenticate(self.receptionist)
        response = self.client.patch(
            f"{self.list_url}{appointment.pk}/",
            {"status": "CANCELADA", "cancellation_reason": "Horario cerrado"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        appointment.refresh_from_db()
        self.assertEqual(appointment.status, Appointment.Status.CANCELLED)

    def test_configured_schedule_rejects_closed_hours_breaks_and_holidays(self):
        appointment_date = date(2027, 8, 9)  # Monday.
        profile = ClinicProfile.load()
        profile.schedule_configured = True
        profile.save(update_fields=("schedule_configured",))
        monday = BusinessHour.objects.get(weekday=0)
        monday.is_open = True
        monday.opens_at = time(8, 0)
        monday.closes_at = time(17, 0)
        monday.save()
        BusinessBreak.objects.create(
            business_hour=monday,
            starts_at=time(12, 0),
            ends_at=time(13, 0),
        )
        self.client.force_authenticate(self.receptionist)

        valid = self.client.post(
            self.list_url,
            self.payload(date=appointment_date.isoformat(), start_time="09:00"),
            format="json",
        )
        outside = self.client.post(
            self.list_url,
            self.payload(
                patient=self.other_patient.pk,
                dentist=self.other_dentist.pk,
                date=appointment_date.isoformat(),
                start_time="16:30",
                duration_minutes=60,
            ),
            format="json",
        )
        on_break = self.client.post(
            self.list_url,
            self.payload(
                patient=self.other_patient.pk,
                dentist=self.other_dentist.pk,
                date=appointment_date.isoformat(),
                start_time="12:30",
                duration_minutes=30,
            ),
            format="json",
        )
        HolidayClosure.objects.create(
            name="Fiesta local",
            date=date(2026, 8, 10),
            repeats_annually=True,
        )
        holiday = self.client.post(
            self.list_url,
            self.payload(
                patient=self.other_patient.pk,
                dentist=self.other_dentist.pk,
                date="2027-08-10",
                start_time="09:00",
            ),
            format="json",
        )

        self.assertEqual(valid.status_code, 201)
        self.assertEqual(outside.status_code, 400)
        self.assertIn("jornada", str(outside.data).lower())
        self.assertEqual(on_break.status_code, 400)
        self.assertIn("pausa", str(on_break.data).lower())
        self.assertEqual(holiday.status_code, 400)
        self.assertIn("cerrada", str(holiday.data).lower())

    def test_availability_applies_the_clinic_schedule(self):
        next_day = timezone.localdate() + timedelta(days=1)
        profile = ClinicProfile.load()
        profile.schedule_configured = True
        profile.save(update_fields=("schedule_configured",))
        business_hour = BusinessHour.objects.get(weekday=next_day.weekday())
        business_hour.is_open = False
        business_hour.save()
        self.client.force_authenticate(self.receptionist)

        response = self.client.get(
            f"{self.list_url}dentists/availability/"
            f"?date={next_day.isoformat()}&start_time=09:00&duration_minutes=30",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("cerrada", str(response.data).lower())

    def test_start_attendance_creates_and_links_the_clinical_context(self):
        category = ServiceCategory.objects.create(name="Odontología general")
        service = ClinicService.objects.create(
            category=category,
            name="Valoración clínica",
            duration_minutes=60,
            price="700.00",
        )
        appointment = self.create_appointment(service=service)
        self.client.force_authenticate(self.dentist)
        started_after = timezone.now()

        response = self.client.post(
            f"{self.list_url}{appointment.pk}/start-attendance/",
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["created"])
        appointment.refresh_from_db()
        consultation = Consultation.objects.get(pk=appointment.consultation_id)
        self.assertEqual(appointment.status, Appointment.Status.IN_ATTENDANCE)
        self.assertGreaterEqual(appointment.attendance_started_at, started_after)
        self.assertEqual(consultation.patient, self.patient)
        self.assertEqual(consultation.professional, self.dentist)
        self.assertEqual(consultation.status, Consultation.Status.IN_PROGRESS)
        self.assertEqual(consultation.consultation_type, Consultation.Type.GENERAL)
        self.assertEqual(consultation.summary, appointment.reason)
        self.assertEqual(consultation.chief_complaint, appointment.reason)
        self.assertEqual(consultation.dental_service, service.name)
        local_start = appointment.attendance_started_at.astimezone(
            ZoneInfo(ClinicProfile.load().timezone)
        )
        self.assertEqual(consultation.date, local_start.date())
        self.assertEqual(consultation.time, local_start.time().replace(microsecond=0))
        self.assertEqual(
            OdontogramVersion.objects.filter(consultation=consultation).count(),
            1,
        )
        self.assertEqual(response.data["appointment"]["consultation"], consultation.pk)
        self.assertEqual(response.data["consultation"]["id"], consultation.pk)
        detail = self.client.get(f"{self.list_url}{appointment.pk}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["patient"], self.patient.pk)
        self.assertEqual(detail.data["patient_code"], self.patient.code)
        self.assertEqual(detail.data["dentist"], self.dentist.pk)
        self.assertEqual(detail.data["service"], service.pk)
        self.assertEqual(detail.data["service_name"], service.name)
        self.assertEqual(detail.data["reason"], appointment.reason)
        self.assertEqual(detail.data["consultation"], consultation.pk)
        self.assertIsNotNone(detail.data["attendance_started_at"])

    def test_start_attendance_is_sequentially_idempotent(self):
        appointment = self.create_appointment(status=Appointment.Status.CONFIRMED)
        self.client.force_authenticate(self.dentist)
        url = f"{self.list_url}{appointment.pk}/start-attendance/"

        first = self.client.post(url, format="json")
        second = self.client.post(url, format="json")

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertFalse(second.data["created"])
        self.assertEqual(
            first.data["consultation"]["id"],
            second.data["consultation"]["id"],
        )
        self.assertEqual(Consultation.objects.count(), 1)
        self.assertEqual(OdontogramVersion.objects.count(), 1)

    def test_start_attendance_rejects_invalid_states_with_a_stable_error(self):
        self.client.force_authenticate(self.admin)
        for days, invalid_status in enumerate((
            Appointment.Status.CANCELLED,
            Appointment.Status.NO_SHOW,
            Appointment.Status.COMPLETED,
        )):
            with self.subTest(status=invalid_status):
                appointment = self.create_appointment(
                    date=date(2026, 8, 12) + timedelta(days=days),
                    status=invalid_status,
                )
                response = self.client.post(
                    f"{self.list_url}{appointment.pk}/start-attendance/",
                    format="json",
                )
                self.assertEqual(response.status_code, 409)
                self.assertEqual(
                    response.data["code"],
                    "appointment_cannot_start_attendance",
                )
                appointment.refresh_from_db()
                self.assertIsNone(appointment.consultation_id)
                self.assertIsNone(appointment.attendance_started_at)
        self.assertEqual(Consultation.objects.count(), 0)

    def test_start_attendance_enforces_clinical_permission_and_appointment_scope(self):
        appointment = self.create_appointment()
        self.client.force_authenticate(self.receptionist)

        denied = self.client.post(
            f"{self.list_url}{appointment.pk}/start-attendance/",
            format="json",
        )

        self.assertEqual(denied.status_code, 403)
        self.client.force_authenticate(self.other_dentist)
        hidden = self.client.post(
            f"{self.list_url}{appointment.pk}/start-attendance/",
            format="json",
        )
        self.assertEqual(hidden.status_code, 404)
        self.assertEqual(Consultation.objects.count(), 0)

    def test_generic_patch_cannot_enter_or_leave_the_clinical_attendance_state(self):
        appointment = self.create_appointment()
        self.client.force_authenticate(self.receptionist)
        detail_url = f"{self.list_url}{appointment.pk}/"

        direct_start = self.client.patch(
            detail_url,
            {"status": "EN_ATENCION"},
            format="json",
        )

        self.assertEqual(direct_start.status_code, 400)
        self.client.force_authenticate(self.admin)
        started = self.client.post(
            f"{detail_url}start-attendance/",
            format="json",
        )
        self.assertEqual(started.status_code, 201)
        for forbidden_status in (
            Appointment.Status.COMPLETED,
            Appointment.Status.CANCELLED,
            Appointment.Status.NO_SHOW,
        ):
            with self.subTest(status=forbidden_status):
                response = self.client.patch(
                    detail_url,
                    {"status": forbidden_status},
                    format="json",
                )
                self.assertEqual(response.status_code, 400)

    def test_start_attendance_records_actor_appointment_consultation_and_patient(self):
        appointment = self.create_appointment()
        self.client.force_authenticate(self.dentist)

        response = self.client.post(
            f"{self.list_url}{appointment.pk}/start-attendance/",
            format="json",
            HTTP_X_REQUEST_ID="appointment-start-audit",
        )

        self.assertEqual(response.status_code, 201)
        event = AuditEvent.objects.get(request_id="appointment-start-audit")
        self.assertEqual(event.action, "APPOINTMENT_START_ATTENDANCE")
        self.assertEqual(event.actor_id, self.dentist.pk)
        self.assertEqual(event.resource_type, "appointment")
        self.assertEqual(event.resource_id, str(appointment.pk))
        self.assertEqual(event.patient_id, self.patient.pk)
        self.assertEqual(event.metadata["appointment_id"], appointment.pk)
        self.assertEqual(
            event.metadata["consultation_id"],
            response.data["consultation"]["id"],
        )

    def test_start_attendance_rolls_back_every_record_when_odontogram_creation_fails(self):
        appointment = self.create_appointment()
        self.client.force_authenticate(self.dentist)

        with patch(
            "apps.appointments.services.create_initial_odontogram_version",
            side_effect=RuntimeError("synthetic odontogram failure"),
        ):
            with self.assertRaisesRegex(RuntimeError, "synthetic odontogram failure"):
                self.client.post(
                    f"{self.list_url}{appointment.pk}/start-attendance/",
                    format="json",
                )

        appointment.refresh_from_db()
        self.assertEqual(appointment.status, Appointment.Status.SCHEDULED)
        self.assertIsNone(appointment.consultation_id)
        self.assertIsNone(appointment.attendance_started_at)
        self.assertEqual(Consultation.objects.count(), 0)
        self.assertEqual(OdontogramVersion.objects.count(), 0)
