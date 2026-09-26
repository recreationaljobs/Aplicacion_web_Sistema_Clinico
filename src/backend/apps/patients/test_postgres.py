from datetime import UTC, date, datetime, time
from threading import Barrier, Lock, Thread
from unittest import skipUnless
from unittest.mock import patch

from django.db import close_old_connections, connection
from django.test import TransactionTestCase
from rest_framework.test import APIClient

from apps.appointments.models import Appointment
from apps.appointments.services import start_attendance
from apps.clinics.models import ClinicProfile
from apps.users.models import User

from .models import Consultation, OdontogramVersion, Patient, TreatmentItem
from .services import (
    accept_treatment_item,
    cancel_treatment_item,
    complete_consultation,
    perform_treatment_item,
)


POSTGRES_ONLY = skipUnless(
    connection.vendor == "postgresql",
    "Requiere PostgreSQL real.",
)


@POSTGRES_ONLY
class PostgresConsultationCompletionTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        super().setUp()
        # The fixture starts at 09:00 Managua; exercise the real time guard.
        clock = patch("django.utils.timezone.now", return_value=datetime(2027, 1, 11, 15, 0, tzinfo=UTC))
        clock.start()
        self.addCleanup(clock.stop)
        ClinicProfile.objects.get_or_create(pk=1)
        self.admin = User.objects.create_user(
            email="postgres-completion-admin@example.test",
            password="SyntheticOnly123!",
            role=User.Role.ADMINISTRADOR,
        )
        self.dentist = User.objects.create_user(
            email="postgres-completion-dentist@example.test",
            password="SyntheticOnly123!",
            role=User.Role.ODONTOLOGO,
        )
        self.patient = Patient.objects.create(
            first_name="Paciente",
            last_name="Cierre concurrente",
            birth_place="Managua",
            identification_type=Patient.IdentificationType.CEDULA,
            identification_number="001-010190-9099A",
            phone="+505 8000 0000",
            gender=Patient.Gender.OTRO,
            date_of_birth=date(1990, 1, 1),
            registered_by=self.admin,
        )
        self.appointment = Appointment.objects.create(
            patient=self.patient,
            dentist=self.dentist,
            date=date(2027, 1, 11),
            start_time=time(9, 0),
            duration_minutes=60,
            reason="Cierre concurrente PostgreSQL",
            created_by=self.admin,
        )
        result = start_attendance(appointment_id=self.appointment.pk, actor=self.admin)
        self.consultation_id = result.consultation.pk

    def _concurrent_posts(self, urls, patches):
        barrier = Barrier(2)
        result_lock = Lock()
        responses = []
        errors = []

        def wrap(operation):
            def synchronized(*args, **kwargs):
                barrier.wait(timeout=10)
                return operation(*args, **kwargs)
            return synchronized

        def post(request_spec):
            close_old_connections()
            try:
                if isinstance(request_spec, tuple):
                    url, payload = request_spec
                else:
                    url, payload = request_spec, {}
                client = APIClient()
                client.force_authenticate(User.objects.get(pk=self.admin.pk))
                response = client.post(url, payload, format="json")
                with result_lock:
                    responses.append((response.status_code, response.data))
            except Exception as error:  # pragma: no cover - asserted below.
                with result_lock:
                    errors.append(error)
            finally:
                close_old_connections()

        contexts = [
            patch(
                target,
                staticmethod(wrap(operation)) if is_static else wrap(operation),
            )
            for target, operation, is_static in patches
        ]
        for context in contexts:
            context.start()
        try:
            threads = [Thread(target=post, args=(request_spec,)) for request_spec in urls]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=20)
        finally:
            for context in reversed(contexts):
                context.stop()

        self.assertTrue(all(not thread.is_alive() for thread in threads))
        self.assertEqual(errors, [], responses)
        return responses

    def test_two_simultaneous_completions_share_closure_metadata(self):
        complete_url = (
            f"/api/patients/{self.patient.pk}/consultations/"
            f"{self.consultation_id}/complete/"
        )

        responses = self._concurrent_posts(
            [complete_url, complete_url],
            [(
                "apps.patients.views.PatientConsultationCompleteView.operation",
                complete_consultation,
                True,
            )],
        )

        self.assertEqual([status for status, _ in responses], [200, 200])
        completed_at_values = {
            payload["consultation"]["completed_at"] for _, payload in responses
        }
        completed_by_values = {
            payload["consultation"]["completed_by"] for _, payload in responses
        }
        self.assertEqual(len(completed_at_values), 1)
        self.assertEqual(completed_by_values, {self.admin.pk})
        consultation = Consultation.objects.get(pk=self.consultation_id)
        self.appointment.refresh_from_db()
        self.assertEqual(consultation.status, Consultation.Status.COMPLETED)
        self.assertEqual(self.appointment.status, Appointment.Status.COMPLETED)

    def test_repeated_start_racing_with_completion_never_leaves_impossible_states(self):
        start_url = f"/api/appointments/{self.appointment.pk}/start-attendance/"
        complete_url = (
            f"/api/patients/{self.patient.pk}/consultations/"
            f"{self.consultation_id}/complete/"
        )

        responses = self._concurrent_posts(
            [start_url, complete_url],
            [
                ("apps.appointments.views.start_attendance", start_attendance, False),
                (
                    "apps.patients.views.PatientConsultationCompleteView.operation",
                    complete_consultation,
                    True,
                ),
            ],
        )

        self.assertEqual([status for status, _ in responses], [200, 200])
        consultation = Consultation.objects.get(pk=self.consultation_id)
        self.appointment.refresh_from_db()
        self.assertEqual(consultation.status, Consultation.Status.COMPLETED)
        self.assertEqual(self.appointment.status, Appointment.Status.COMPLETED)

    def _treatment_url(self, item, action):
        return (
            f"/api/patients/{self.patient.pk}/consultations/"
            f"{self.consultation_id}/treatment-items/{item.pk}/{action}/"
        )

    def test_two_simultaneous_accepts_are_idempotent(self):
        item = TreatmentItem.objects.create(
            proposed_in_id=self.consultation_id,
            description="Aceptación concurrente",
        )
        url = self._treatment_url(item, "accept")

        responses = self._concurrent_posts(
            [url, url],
            [(
                "apps.patients.views.ConsultationTreatmentItemAcceptView.operation",
                accept_treatment_item,
                True,
            )],
        )

        self.assertEqual(sorted(status for status, _ in responses), [200, 200])
        item.refresh_from_db()
        self.assertEqual(item.status, TreatmentItem.Status.ACCEPTED)
        self.assertIsNone(item.performed_in)
        self.assertIsNone(item.performed_at)

    def test_two_simultaneous_performs_preserve_one_execution_metadata_pair(self):
        item = TreatmentItem.objects.create(
            proposed_in_id=self.consultation_id,
            description="Realización concurrente",
            status=TreatmentItem.Status.ACCEPTED,
        )
        url = self._treatment_url(item, "perform")
        request = (url, {"performed_in": self.consultation_id})

        responses = self._concurrent_posts(
            [request, request],
            [(
                "apps.patients.views.ConsultationTreatmentItemPerformView.operation",
                perform_treatment_item,
                True,
            )],
        )

        self.assertEqual(sorted(status for status, _ in responses), [200, 200])
        metadata_pairs = {
            (payload["performed_in"], payload["performed_at"])
            for _, payload in responses
        }
        self.assertEqual(len(metadata_pairs), 1)
        item.refresh_from_db()
        self.assertEqual(item.status, TreatmentItem.Status.PERFORMED)
        self.assertEqual(item.performed_in_id, self.consultation_id)
        self.assertIsNotNone(item.performed_at)
        self.assertEqual(item.status_reason, "")

    def test_cancel_racing_with_perform_produces_exactly_one_terminal_state(self):
        item = TreatmentItem.objects.create(
            proposed_in_id=self.consultation_id,
            description="Carrera terminal",
            status=TreatmentItem.Status.ACCEPTED,
        )
        cancel_request = (
            self._treatment_url(item, "cancel"),
            {"reason": "Cancelación concurrente"},
        )
        perform_request = (
            self._treatment_url(item, "perform"),
            {"performed_in": self.consultation_id},
        )

        responses = self._concurrent_posts(
            [cancel_request, perform_request],
            [
                (
                    "apps.patients.views.ConsultationTreatmentItemCancelView.operation",
                    cancel_treatment_item,
                    True,
                ),
                (
                    "apps.patients.views.ConsultationTreatmentItemPerformView.operation",
                    perform_treatment_item,
                    True,
                ),
            ],
        )

        self.assertEqual(sorted(status for status, _ in responses), [200, 409])
        conflict = next(payload for status, payload in responses if status == 409)
        self.assertEqual(conflict["code"], "treatment_invalid_transition")
        item.refresh_from_db()
        self.assertIn(
            item.status,
            (TreatmentItem.Status.PERFORMED, TreatmentItem.Status.CANCELLED),
        )
        if item.status == TreatmentItem.Status.PERFORMED:
            self.assertEqual(item.performed_in_id, self.consultation_id)
            self.assertIsNotNone(item.performed_at)
            self.assertEqual(item.status_reason, "")
        else:
            self.assertIsNone(item.performed_in)
            self.assertIsNone(item.performed_at)
            self.assertEqual(item.status_reason, "Cancelación concurrente")

    def test_two_simultaneous_performs_with_result_create_one_attributed_version(self):
        item = TreatmentItem.objects.create(
            proposed_in_id=self.consultation_id,
            description="Restauración concurrente con resultado",
            tooth_code="16",
            surfaces=["OCCLUSAL"],
            planned_finding="RESTORATION",
            status=TreatmentItem.Status.ACCEPTED,
        )
        before = OdontogramVersion.objects.filter(patient=self.patient).count()
        url = self._treatment_url(item, "perform")
        request = (url, {
            "performed_in": self.consultation_id,
            "odontogram_result": {
                "tooth_code": "16",
                "surfaces": ["OCCLUSAL"],
                "finding": "RESTORATION",
            },
        })

        responses = self._concurrent_posts(
            [request, request],
            [(
                "apps.patients.views.ConsultationTreatmentItemPerformView.operation",
                perform_treatment_item,
                True,
            )],
        )

        self.assertEqual(sorted(status for status, _ in responses), [200, 200])
        version_ids = {
            payload["resulting_odontogram_version"] for _, payload in responses
        }
        performed_pairs = {
            (payload["performed_in"], payload["performed_at"])
            for _, payload in responses
        }
        self.assertEqual(len(version_ids), 1)
        self.assertEqual(len(performed_pairs), 1)
        self.assertEqual(
            OdontogramVersion.objects.filter(patient=self.patient).count(),
            before + 1,
        )
        item.refresh_from_db()
        self.assertEqual(item.status, TreatmentItem.Status.PERFORMED)
        self.assertEqual(item.resulting_odontogram_version_id, version_ids.pop())

    def test_result_perform_racing_with_cancel_never_leaves_an_orphan_version(self):
        item = TreatmentItem.objects.create(
            proposed_in_id=self.consultation_id,
            description="Carrera terminal con odontograma",
            tooth_code="16",
            surfaces=["OCCLUSAL"],
            planned_finding="RESTORATION",
            status=TreatmentItem.Status.ACCEPTED,
        )
        before = OdontogramVersion.objects.filter(patient=self.patient).count()
        cancel_request = (
            self._treatment_url(item, "cancel"),
            {"reason": "Cancelación concurrente"},
        )
        perform_request = (
            self._treatment_url(item, "perform"),
            {
                "performed_in": self.consultation_id,
                "odontogram_result": {
                    "tooth_code": "16",
                    "surfaces": ["OCCLUSAL"],
                    "finding": "RESTORATION",
                },
            },
        )

        responses = self._concurrent_posts(
            [cancel_request, perform_request],
            [
                (
                    "apps.patients.views.ConsultationTreatmentItemCancelView.operation",
                    cancel_treatment_item,
                    True,
                ),
                (
                    "apps.patients.views.ConsultationTreatmentItemPerformView.operation",
                    perform_treatment_item,
                    True,
                ),
            ],
        )

        self.assertEqual(sorted(status for status, _ in responses), [200, 409])
        item.refresh_from_db()
        version_count = OdontogramVersion.objects.filter(patient=self.patient).count()
        if item.status == TreatmentItem.Status.PERFORMED:
            self.assertEqual(version_count, before + 1)
            self.assertIsNotNone(item.resulting_odontogram_version_id)
        else:
            self.assertEqual(item.status, TreatmentItem.Status.CANCELLED)
            self.assertEqual(version_count, before)
            self.assertIsNone(item.resulting_odontogram_version_id)
