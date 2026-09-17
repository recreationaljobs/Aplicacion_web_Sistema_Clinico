from datetime import UTC, date, datetime, time
from threading import Barrier, Lock, Thread
from unittest import skipUnless
from unittest.mock import patch

from django.db import IntegrityError, close_old_connections, connection, transaction
from django.test import TransactionTestCase
from rest_framework.test import APIClient

from apps.clinics.models import ClinicProfile
from apps.common.test_utils import open_clinic_days
from apps.patients.models import Consultation, OdontogramVersion, Patient
from apps.users.models import User

from .models import Appointment, AppointmentRescheduleEvent
from .serializers import AppointmentSerializer
from .services import check_in_appointment, start_attendance


POSTGRES_ONLY = skipUnless(
    connection.vendor == "postgresql",
    "Requiere PostgreSQL real.",
)


@POSTGRES_ONLY
class PostgresAppointmentTestBase(TransactionTestCase):
    reset_sequences = True
    list_url = "/api/appointments/"

    def setUp(self):
        super().setUp()
        open_clinic_days()
        self.client = APIClient()
        ClinicProfile.objects.get_or_create(pk=1)
        self.admin = User.objects.create_user(
            email="postgres-appointments-admin@example.test",
            password="SyntheticOnly123!",
            role=User.Role.ADMINISTRADOR,
        )
        self.dentist = User.objects.create_user(
            email="postgres-dentist-one@example.test",
            password="SyntheticOnly123!",
            role=User.Role.ODONTOLOGO,
        )
        self.other_dentist = User.objects.create_user(
            email="postgres-dentist-two@example.test",
            password="SyntheticOnly123!",
            role=User.Role.ODONTOLOGO,
        )
        self.patient = self.create_patient("001-010190-9001A", "Paciente Uno")
        self.other_patient = self.create_patient("001-020290-9002B", "Paciente Dos")

    def create_patient(self, identification_number, first_name):
        return Patient.objects.create(
            first_name=first_name,
            last_name="PostgreSQL",
            birth_place="Managua",
            identification_type=Patient.IdentificationType.CEDULA,
            identification_number=identification_number,
            phone="+505 8000 0000",
            gender=Patient.Gender.OTRO,
            date_of_birth=date(1990, 1, 1),
            registered_by=self.admin,
        )

    def appointment_values(self, **overrides):
        values = {
            "patient": self.patient,
            "dentist": self.dentist,
            "date": date(2027, 1, 11),
            "start_time": time(9, 0),
            "duration_minutes": 60,
            "reason": "Prueba PostgreSQL",
            "created_by": self.admin,
        }
        values.update(overrides)
        return values

    def create_appointment(self, **overrides):
        return Appointment.objects.create(**self.appointment_values(**overrides))

    def payload(self, **overrides):
        values = {
            "patient": self.patient.pk,
            "dentist": self.dentist.pk,
            "date": "2027-01-11",
            "start_time": "09:00",
            "duration_minutes": 60,
            "reason": "Prueba PostgreSQL",
            "notes": "",
        }
        values.update(overrides)
        return values

    def constraint_name(self, error):
        return error.exception.__cause__.diag.constraint_name


@POSTGRES_ONLY
class PostgresAppointmentConstraintTests(PostgresAppointmentTestBase):
    def assert_overlap_constraint(self, expected_name, **overrides):
        self.create_appointment()

        with self.assertRaises(IntegrityError) as error:
            with transaction.atomic():
                self.create_appointment(**overrides)

        self.assertEqual(self.constraint_name(error), expected_name)
        self.assertEqual(Appointment.objects.count(), 1)

    def test_direct_create_populates_the_canonical_half_open_range(self):
        appointment = self.create_appointment()

        self.assertTrue(hasattr(appointment, "scheduled_range"))
        appointment.refresh_from_db()
        self.assertEqual(
            appointment.scheduled_range.lower,
            datetime(2027, 1, 11, 9, 0, tzinfo=UTC),
        )
        self.assertEqual(
            appointment.scheduled_range.upper,
            datetime(2027, 1, 11, 10, 0, tzinfo=UTC),
        )
        self.assertEqual(appointment.scheduled_range.bounds, "[)")

    def test_same_dentist_and_same_start_conflict(self):
        self.assert_overlap_constraint(
            "appointment_dentist_schedule_excl",
            patient=self.other_patient,
            duration_minutes=30,
        )

    def test_same_dentist_and_partial_overlap_conflict(self):
        self.assert_overlap_constraint(
            "appointment_dentist_schedule_excl",
            patient=self.other_patient,
            start_time=time(9, 59),
        )

    def test_same_dentist_and_contained_range_conflict(self):
        self.create_appointment(duration_minutes=180)

        with self.assertRaises(IntegrityError) as error:
            with transaction.atomic():
                self.create_appointment(
                    patient=self.other_patient,
                    start_time=time(10, 0),
                    duration_minutes=60,
                )

        self.assertEqual(
            self.constraint_name(error),
            "appointment_dentist_schedule_excl",
        )

    def test_same_patient_with_another_dentist_conflicts(self):
        self.assert_overlap_constraint(
            "appointment_patient_schedule_excl",
            dentist=self.other_dentist,
        )

    def test_different_patient_and_dentist_can_share_the_range(self):
        self.create_appointment()

        second = self.create_appointment(
            patient=self.other_patient,
            dentist=self.other_dentist,
        )

        self.assertIsNotNone(second.pk)
        self.assertEqual(Appointment.objects.count(), 2)

    def test_adjacent_ranges_are_allowed(self):
        self.create_appointment()

        adjacent = self.create_appointment(start_time=time(10, 0))

        self.assertIsNotNone(adjacent.pk)
        self.assertEqual(Appointment.objects.count(), 2)

    def test_cancelled_appointment_releases_dentist_and_patient(self):
        self.create_appointment(status=Appointment.Status.CANCELLED)

        replacement = self.create_appointment()

        self.assertIsNotNone(replacement.pk)
        self.assertEqual(Appointment.objects.count(), 2)

    def test_completed_appointment_keeps_blocking_the_dentist(self):
        self.create_appointment(status=Appointment.Status.COMPLETED)

        with self.assertRaises(IntegrityError) as error:
            with transaction.atomic():
                self.create_appointment(patient=self.other_patient)

        self.assertEqual(
            self.constraint_name(error),
            "appointment_dentist_schedule_excl",
        )

    def test_no_show_appointment_keeps_blocking_the_patient(self):
        self.create_appointment(status=Appointment.Status.NO_SHOW)

        with self.assertRaises(IntegrityError) as error:
            with transaction.atomic():
                self.create_appointment(dentist=self.other_dentist)

        self.assertEqual(
            self.constraint_name(error),
            "appointment_patient_schedule_excl",
        )

    def test_in_attendance_appointment_keeps_blocking_the_slot(self):
        self.create_appointment(status=Appointment.Status.IN_ATTENDANCE)

        with self.assertRaises(IntegrityError) as error:
            with transaction.atomic():
                self.create_appointment(patient=self.other_patient)

        self.assertEqual(
            self.constraint_name(error),
            "appointment_dentist_schedule_excl",
        )

    def test_checked_in_appointment_keeps_blocking_dentist_and_patient(self):
        self.create_appointment(status=Appointment.Status.CHECKED_IN)

        with self.assertRaises(IntegrityError) as error:
            with transaction.atomic():
                self.create_appointment(patient=self.other_patient)
        self.assertEqual(
            self.constraint_name(error),
            "appointment_dentist_schedule_excl",
        )

        with self.assertRaises(IntegrityError) as error:
            with transaction.atomic():
                self.create_appointment(dentist=self.other_dentist)
        self.assertEqual(
            self.constraint_name(error),
            "appointment_patient_schedule_excl",
        )


@POSTGRES_ONLY
class PostgresAppointmentApiConflictTests(PostgresAppointmentTestBase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.admin)

    def test_create_returns_typed_409_for_dentist_constraint(self):
        self.create_appointment()

        with patch("apps.appointments.serializers.has_overlap", return_value=False):
            response = self.client.post(
                self.list_url,
                self.payload(patient=self.other_patient.pk),
                format="json",
            )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data, {
            "code": "appointment_overlap",
            "conflict": "dentist",
            "detail": "El odontólogo ya tiene una cita en ese horario.",
        })
        self.assertEqual(Appointment.objects.count(), 1)

    def test_create_returns_typed_409_for_patient_constraint(self):
        self.create_appointment()

        with patch("apps.appointments.serializers.has_overlap", return_value=False):
            response = self.client.post(
                self.list_url,
                self.payload(dentist=self.other_dentist.pk),
                format="json",
            )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "appointment_overlap")
        self.assertEqual(response.data["conflict"], "patient")
        self.assertEqual(
            response.data["detail"],
            "El paciente ya tiene una cita en ese horario.",
        )
        self.assertEqual(Appointment.objects.count(), 1)

    def test_conflicting_reschedule_returns_409_and_preserves_original_slot(self):
        self.create_appointment()
        editable = self.create_appointment(
            patient=self.other_patient,
            dentist=self.other_dentist,
            start_time=time(11, 0),
        )

        with patch("apps.appointments.serializers.has_overlap", return_value=False):
            response = self.client.patch(
                f"{self.list_url}{editable.pk}/",
                {
                    "dentist": self.dentist.pk,
                    "start_time": "09:30",
                    "reschedule_reason": "No debe sobrevivir al conflicto",
                },
                format="json",
            )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["conflict"], "dentist")
        editable.refresh_from_db()
        self.assertEqual(editable.dentist_id, self.other_dentist.pk)
        self.assertEqual(editable.start_time, time(11, 0))
        self.assertEqual(Appointment.objects.count(), 2)
        self.assertEqual(AppointmentRescheduleEvent.objects.count(), 0)

    def test_unknown_integrity_error_is_not_converted_to_overlap(self):
        with patch.object(
            AppointmentSerializer,
            "create",
            side_effect=IntegrityError("unknown synthetic integrity error"),
        ):
            with self.assertRaises(IntegrityError):
                self.client.post(self.list_url, self.payload(), format="json")


@POSTGRES_ONLY
class PostgresAppointmentConcurrencyTests(PostgresAppointmentTestBase):
    def concurrent_posts(self, payloads):
        barrier = Barrier(2)
        result_lock = Lock()
        responses = []
        errors = []
        def post(payload):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(User.objects.get(pk=self.admin.pk))
                # Synchronize before the shared clinic lock, never inside it.
                barrier.wait(timeout=10)
                response = client.post(self.list_url, payload, format="json")
                with result_lock:
                    responses.append((response.status_code, response.data))
            except Exception as error:  # pragma: no cover - asserted below.
                with result_lock:
                    errors.append(error)
            finally:
                close_old_connections()

        threads = [Thread(target=post, args=(payload,)) for payload in payloads]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=15)

        self.assertTrue(all(not thread.is_alive() for thread in threads))
        self.assertEqual(errors, [])
        return responses

    def assert_single_concurrent_winner(self, responses, conflict):
        # The shared lock exposes the winner to ordinary validation (400).
        # Direct concurrent database writes still exercise the exclusion constraint.
        self.assertEqual(sorted(status for status, _ in responses), [201, 400])
        conflict_payload = next(data for status, data in responses if status == 400)
        expected = (
            "El odontólogo ya tiene una cita en ese horario."
            if conflict == "dentist" else "El paciente ya tiene una cita en ese horario."
        )
        self.assertEqual([str(item) for item in conflict_payload["non_field_errors"]], [expected])
        self.assertEqual(Appointment.objects.count(), 1)
        self.assertEqual(Appointment.objects.filter(reason="Prueba PostgreSQL").count(), 1)

    def test_two_concurrent_requests_reserve_the_dentist_only_once(self):
        responses = self.concurrent_posts([
            self.payload(),
            self.payload(patient=self.other_patient.pk),
        ])

        self.assert_single_concurrent_winner(responses, "dentist")

    def test_two_concurrent_requests_reserve_the_patient_only_once(self):
        responses = self.concurrent_posts([
            self.payload(),
            self.payload(dentist=self.other_dentist.pk),
        ])

        self.assert_single_concurrent_winner(responses, "patient")

    def test_two_concurrent_attendance_starts_share_one_consultation(self):
        appointment = self.create_appointment()
        barrier = Barrier(2)
        result_lock = Lock()
        responses = []
        errors = []

        def synchronized_start(*args, **kwargs):
            barrier.wait(timeout=10)
            return start_attendance(*args, **kwargs)

        def post():
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(User.objects.get(pk=self.admin.pk))
                response = client.post(
                    f"{self.list_url}{appointment.pk}/start-attendance/",
                    format="json",
                )
                with result_lock:
                    responses.append((response.status_code, response.data))
            except Exception as error:  # pragma: no cover - asserted below.
                with result_lock:
                    errors.append(error)
            finally:
                close_old_connections()

        with patch("apps.appointments.views.start_attendance", synchronized_start):
            threads = [Thread(target=post) for _ in range(2)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=15)

        self.assertTrue(all(not thread.is_alive() for thread in threads))
        self.assertEqual(errors, [])
        self.assertEqual(sorted(status for status, _ in responses), [200, 201])
        consultation_ids = {
            payload["consultation"]["id"]
            for _, payload in responses
        }
        self.assertEqual(len(consultation_ids), 1)
        self.assertEqual(Consultation.objects.count(), 1)
        self.assertEqual(OdontogramVersion.objects.count(), 1)
        appointment.refresh_from_db()
        self.assertEqual(appointment.status, Appointment.Status.IN_ATTENDANCE)
        self.assertEqual(appointment.consultation_id, consultation_ids.pop())

    def test_two_concurrent_check_ins_share_one_state_transition(self):
        appointment = self.create_appointment()
        barrier = Barrier(2)
        result_lock = Lock()
        responses = []
        errors = []

        def synchronized_check_in(*args, **kwargs):
            barrier.wait(timeout=10)
            return check_in_appointment(*args, **kwargs)

        def post():
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(User.objects.get(pk=self.admin.pk))
                response = client.post(
                    f"{self.list_url}{appointment.pk}/check-in/",
                    format="json",
                )
                with result_lock:
                    responses.append((response.status_code, response.data))
            except Exception as error:  # pragma: no cover - asserted below.
                with result_lock:
                    errors.append(error)
            finally:
                close_old_connections()

        with patch("apps.appointments.views.check_in_appointment", synchronized_check_in):
            threads = [Thread(target=post) for _ in range(2)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=15)

        self.assertTrue(all(not thread.is_alive() for thread in threads))
        self.assertEqual(errors, [])
        self.assertEqual(sorted(status for status, _ in responses), [200, 201])
        self.assertEqual(
            sorted(payload["changed"] for _, payload in responses),
            [False, True],
        )
        appointment.refresh_from_db()
        self.assertEqual(appointment.status, Appointment.Status.CHECKED_IN)
        self.assertIsNone(appointment.consultation_id)
        self.assertIsNone(appointment.attendance_started_at)
        self.assertEqual(Consultation.objects.count(), 0)
        self.assertEqual(OdontogramVersion.objects.count(), 0)
