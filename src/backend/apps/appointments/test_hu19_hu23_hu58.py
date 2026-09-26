from apps.common.test_utils import start_test_attendance
from datetime import date, time

from django.apps import apps
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.audit.models import AuditEvent
from apps.common.test_utils import open_clinic_days
from apps.patients.models import Consultation, OdontogramVersion, Patient
from apps.users.models import User

from .models import Appointment


class AppointmentAgendaOperationsApiTests(APITestCase):
    list_url = "/api/appointments/"

    def setUp(self):
        open_clinic_days()
        self.admin = User.objects.create_user(
            email="agenda-admin@example.test",
            password="SyntheticOnly123!",
            role=User.Role.ADMINISTRADOR,
        )
        self.receptionist = User.objects.create_user(
            email="agenda-reception@example.test",
            password="SyntheticOnly123!",
            role=User.Role.RECEPCIONISTA,
        )
        self.dentist = User.objects.create_user(
            email="agenda-dentist@example.test",
            password="SyntheticOnly123!",
            role=User.Role.ODONTOLOGO,
            first_name="Elena",
            last_name="Vargas",
        )
        self.other_dentist = User.objects.create_user(
            email="agenda-other@example.test",
            password="SyntheticOnly123!",
            role=User.Role.ODONTOLOGO,
            first_name="Mario",
            last_name="Ruiz",
        )
        self.patient = Patient.objects.create(
            first_name="Ana",
            last_name="Pérez",
            birth_place="Managua",
            phone="8888-2323",
            gender=Patient.Gender.FEMENINO,
            date_of_birth=date(1990, 1, 1),
            registered_by=self.receptionist,
        )

    def create_appointment(self, **overrides):
        values = {
            "patient": self.patient,
            "dentist": self.dentist,
            "date": date(2026, 9, 2),
            "start_time": time(9, 0),
            "duration_minutes": 60,
            "reason": "Control preventivo",
            "created_by": self.receptionist,
        }
        values.update(overrides)
        return Appointment.objects.create(**values)

    def test_reschedule_reason_is_rejected_when_creating_an_appointment(self):
        self.client.force_authenticate(self.receptionist)

        response = self.client.post(
            self.list_url,
            {
                "patient": self.patient.pk,
                "dentist": self.dentist.pk,
                "date": "2026-09-02",
                "start_time": "09:00",
                "duration_minutes": 60,
                "reason": "Control preventivo",
                "reschedule_reason": "Todavía no existe una cita que reprogramar",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400, getattr(response, "data", None))
        self.assertIn("reschedule_reason", response.data)
        self.assertEqual(Appointment.objects.count(), 0)

    def test_check_in_moves_scheduled_or_confirmed_without_creating_clinical_records(self):
        for index, initial_status in enumerate((
            Appointment.Status.SCHEDULED,
            Appointment.Status.CONFIRMED,
        )):
            with self.subTest(initial_status=initial_status):
                appointment = self.create_appointment(
                    status=initial_status,
                    date=date(2026, 9, 2 + index),
                )
                self.client.force_authenticate(self.receptionist)

                response = self.client.post(
                    f"{self.list_url}{appointment.pk}/check-in/",
                    format="json",
                )

                self.assertEqual(response.status_code, 201, getattr(response, "data", None))
                self.assertTrue(response.data["changed"])
                self.assertEqual(
                    response.data["appointment"]["status"],
                    "PRESENTE",
                )
                appointment.refresh_from_db()
                self.assertEqual(appointment.status, "PRESENTE")
                self.assertIsNone(appointment.consultation_id)
                self.assertIsNone(appointment.attendance_started_at)
        self.assertEqual(Consultation.objects.count(), 0)
        self.assertEqual(OdontogramVersion.objects.count(), 0)

    def test_check_in_is_idempotent_and_checked_in_can_start_normal_attendance(self):
        appointment = self.create_appointment()
        self.client.force_authenticate(self.receptionist)
        first = self.client.post(f"{self.list_url}{appointment.pk}/check-in/", format="json")
        second = self.client.post(f"{self.list_url}{appointment.pk}/check-in/", format="json")

        self.assertEqual(first.status_code, 201, getattr(first, "data", None))
        self.assertEqual(second.status_code, 200, getattr(second, "data", None))
        self.assertTrue(first.data["changed"])
        self.assertFalse(second.data["changed"])
        self.assertEqual(Consultation.objects.count(), 0)

        self.client.force_authenticate(self.dentist)
        started = start_test_attendance(self.client, appointment)

        self.assertEqual(started.status_code, 201, started.data)
        self.assertEqual(
            started.data["appointment"]["status"],
            Appointment.Status.IN_ATTENDANCE,
        )
        self.assertEqual(Consultation.objects.count(), 1)
        self.assertEqual(OdontogramVersion.objects.count(), 1)

    def test_check_in_rejects_invalid_states_direct_patch_and_inactive_patient(self):
        self.client.force_authenticate(self.admin)
        for index, invalid_status in enumerate((
            Appointment.Status.CANCELLED,
            Appointment.Status.NO_SHOW,
            Appointment.Status.COMPLETED,
            Appointment.Status.IN_ATTENDANCE,
        )):
            with self.subTest(invalid_status=invalid_status):
                appointment = self.create_appointment(
                    status=invalid_status,
                    date=date(2026, 9, 7 + index),
                )
                response = self.client.post(
                    f"{self.list_url}{appointment.pk}/check-in/",
                    format="json",
                )
                self.assertEqual(response.status_code, 409, getattr(response, "data", None))
                self.assertEqual(
                    response.data["code"],
                    "appointment_cannot_check_in",
                )

        editable = self.create_appointment(date=date(2026, 9, 14))
        direct = self.client.patch(
            f"{self.list_url}{editable.pk}/",
            {"status": "PRESENTE"},
            format="json",
        )
        self.assertEqual(direct.status_code, 400, direct.data)

        self.patient.is_active = False
        self.patient.save(update_fields=("is_active",))
        inactive = self.client.post(
            f"{self.list_url}{editable.pk}/check-in/",
            format="json",
        )
        self.assertEqual(inactive.status_code, 409, getattr(inactive, "data", None))
        self.assertEqual(inactive.data["code"], "patient_inactive")
        editable.refresh_from_db()
        self.assertEqual(editable.status, Appointment.Status.SCHEDULED)

    def test_check_in_uses_appointment_edit_permission_scope_and_audit_action(self):
        own = self.create_appointment()
        other = self.create_appointment(
            dentist=self.other_dentist,
            date=date(2026, 9, 3),
        )
        self.client.force_authenticate(self.dentist)
        denied = self.client.post(f"{self.list_url}{own.pk}/check-in/", format="json")
        self.assertEqual(denied.status_code, 403)

        self.client.force_authenticate(self.receptionist)
        allowed = self.client.post(
            f"{self.list_url}{other.pk}/check-in/",
            format="json",
            HTTP_X_REQUEST_ID="appointment-check-in-audit",
        )
        self.assertEqual(allowed.status_code, 201, getattr(allowed, "data", None))
        event = AuditEvent.objects.get(request_id="appointment-check-in-audit")
        self.assertEqual(event.action, "APPOINTMENT_CHECK_IN")
        self.assertEqual(event.actor_id, self.receptionist.pk)
        self.assertEqual(event.resource_id, str(other.pk))
        self.assertEqual(event.patient_id, self.patient.pk)

    def test_real_reschedule_creates_one_event_and_reschedule_audit_action(self):
        appointment = self.create_appointment()
        self.client.force_authenticate(self.receptionist)

        response = self.client.patch(
            f"{self.list_url}{appointment.pk}/",
            {
                "date": "2026-09-03",
                "start_time": "10:30",
                "duration_minutes": 45,
                "reschedule_reason": "Paciente solicitó otro horario.",
            },
            format="json",
            HTTP_X_REQUEST_ID="appointment-reschedule-audit",
        )

        self.assertEqual(response.status_code, 200, getattr(response, "data", None))
        event_model = apps.all_models["appointments"].get("appointmentrescheduleevent")
        self.assertIsNotNone(event_model, "La reprogramación debe conservar un evento histórico.")
        event = event_model.objects.get(appointment=appointment)
        self.assertEqual(event.previous_date, date(2026, 9, 2))
        self.assertEqual(event.previous_start_time, time(9, 0))
        self.assertEqual(event.previous_duration_minutes, 60)
        self.assertEqual(event.new_date, date(2026, 9, 3))
        self.assertEqual(event.new_start_time, time(10, 30))
        self.assertEqual(event.new_duration_minutes, 45)
        self.assertEqual(event.reason, "Paciente solicitó otro horario.")
        self.assertEqual(event.changed_by, self.receptionist)
        self.assertLessEqual(event.created_at, timezone.now())
        audit = AuditEvent.objects.get(request_id="appointment-reschedule-audit")
        self.assertEqual(audit.action, "APPOINTMENT_RESCHEDULE")
        self.assertEqual(audit.metadata["appointment_id"], appointment.pk)
        self.assertNotIn("previous_date", audit.metadata)

    def test_non_temporal_update_does_not_create_history_or_reschedule_audit(self):
        appointment = self.create_appointment()
        self.client.force_authenticate(self.receptionist)

        response = self.client.patch(
            f"{self.list_url}{appointment.pk}/",
            {
                "reason": "Control actualizado",
                "notes": "Sin cambio de horario.",
                "reschedule_reason": "No debe persistirse.",
            },
            format="json",
            HTTP_X_REQUEST_ID="appointment-update-audit",
        )

        self.assertEqual(response.status_code, 200, response.data)
        event_model = apps.get_model("appointments", "AppointmentRescheduleEvent")
        self.assertFalse(event_model.objects.exists())
        audit = AuditEvent.objects.get(request_id="appointment-update-audit")
        self.assertEqual(audit.action, "APPOINTMENT_UPDATE")

    def test_multiple_reschedules_are_ordered_and_history_endpoint_is_read_only_and_scoped(self):
        appointment = self.create_appointment()
        self.client.force_authenticate(self.receptionist)
        first = self.client.patch(
            f"{self.list_url}{appointment.pk}/",
            {"start_time": "10:00", "reschedule_reason": "Primera"},
            format="json",
        )
        second = self.client.patch(
            f"{self.list_url}{appointment.pk}/",
            {"start_time": "11:00", "reschedule_reason": "Segunda"},
            format="json",
        )
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(second.status_code, 200, second.data)

        history_url = f"{self.list_url}{appointment.pk}/reschedule-history/"
        history = self.client.get(history_url)
        write = self.client.post(history_url, {}, format="json")

        self.assertEqual(history.status_code, 200, getattr(history, "data", None))
        self.assertEqual(history.data["count"], 2)
        self.assertEqual(
            [item["reason"] for item in history.data["results"]],
            ["Segunda", "Primera"],
        )
        self.assertEqual(
            history.data["results"][0]["changed_by_name"],
            "agenda-reception@example.test",
        )
        self.assertEqual(write.status_code, 405)

        self.client.force_authenticate(self.other_dentist)
        hidden = self.client.get(history_url)
        self.assertEqual(hidden.status_code, 404)

    def test_reschedule_events_cannot_be_modified_or_deleted(self):
        appointment = self.create_appointment()
        self.client.force_authenticate(self.receptionist)
        response = self.client.patch(
            f"{self.list_url}{appointment.pk}/",
            {"start_time": "10:00", "reschedule_reason": "Original"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        event_model = apps.get_model("appointments", "AppointmentRescheduleEvent")
        event = event_model.objects.get()

        event.reason = "Intento de edición"
        with self.assertRaises(ValidationError):
            event.save()
        event.refresh_from_db()
        with self.assertRaises(ValidationError):
            event.delete()
