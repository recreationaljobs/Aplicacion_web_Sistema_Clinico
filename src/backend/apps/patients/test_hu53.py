from apps.common.test_utils import start_test_attendance
from datetime import date, time, timedelta

from django.utils import timezone
from rest_framework.test import APITestCase

from apps.appointments.models import Appointment
from apps.clinics.availability import clinic_today
from apps.users.models import User
from apps.common.test_utils import open_clinic_days

from .models import Consultation, OdontogramVersion, Patient


class Hu53PatientTestMixin:
    patients_url = "/api/patients/"

    def patient_payload(self, **overrides):
        values = {
            "first_name": "María",
            "last_name": "García",
            "second_last_name": "López",
            "birth_place": "Managua",
            "phone": "+505 8888 1000",
            "email": "maria.hu53@example.test",
            "gender": "FEMENINO",
            "date_of_birth": "1990-05-12",
            "is_active": True,
        }
        values.update(overrides)
        return values

    def create_patient(self, **overrides):
        values = {
            "first_name": "Paciente",
            "last_name": "HU53",
            "birth_place": "Managua",
            "phone": "+505 8888 1000",
            "gender": Patient.Gender.OTRO,
            "date_of_birth": date(1990, 5, 12),
            "registered_by": self.admin,
            "identification_type": None,
            "identification_number": None,
        }
        values.update(overrides)
        return Patient.objects.create(**values)


class FlexiblePatientIdentificationApiTests(Hu53PatientTestMixin, APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="admin-hu53-identity@example.test",
            password="SyntheticOnly123!",
            role=User.Role.ADMINISTRADOR,
        )
        self.client.force_authenticate(self.admin)

    def test_registers_each_supported_identification_type_and_normalizes_safely(self):
        cases = (
            ("CEDULA", "  001-010190-0001a  ", "001-010190-0001A"),
            ("PASAPORTE", "  pa-00 17-x  ", "PA-00 17-X"),
            ("OTRO", "  seguro-00042  ", "SEGURO-00042"),
        )

        for index, (identification_type, raw_number, expected_number) in enumerate(cases):
            with self.subTest(identification_type=identification_type):
                response = self.client.post(
                    self.patients_url,
                    self.patient_payload(
                        first_name=f"Paciente {index}",
                        email=f"identity-{index}@example.test",
                        identification_type=identification_type,
                        identification_number=raw_number,
                    ),
                    format="json",
                )

                self.assertEqual(response.status_code, 201, response.data)
                self.assertEqual(response.data["identification_type"], identification_type)
                self.assertEqual(response.data["identification_number"], expected_number)
                self.assertNotIn("national_id", response.data)

    def test_allows_multiple_patients_without_identification(self):
        for index in range(2):
            response = self.client.post(
                self.patients_url,
                self.patient_payload(
                    first_name=f"Sin identificación {index}",
                    email=f"without-id-{index}@example.test",
                ),
                format="json",
            )

            self.assertEqual(response.status_code, 201, response.data)
            self.assertIsNone(response.data["identification_type"])
            self.assertIsNone(response.data["identification_number"])

        self.assertEqual(Patient.objects.count(), 2)

    def test_requires_identification_type_and_number_as_a_pair(self):
        number_without_type = self.client.post(
            self.patients_url,
            self.patient_payload(
                email="number-without-type@example.test",
                identification_number="PA-0042",
            ),
            format="json",
        )
        type_without_number = self.client.post(
            self.patients_url,
            self.patient_payload(
                email="type-without-number@example.test",
                identification_type="PASAPORTE",
            ),
            format="json",
        )

        self.assertEqual(number_without_type.status_code, 400)
        self.assertIn("identification_type", number_without_type.data)
        self.assertEqual(type_without_number.status_code, 400)
        self.assertIn("identification_number", type_without_number.data)
        self.assertEqual(Patient.objects.count(), 0)

    def test_duplicate_is_rejected_within_type_but_allowed_between_types(self):
        first = self.client.post(
            self.patients_url,
            self.patient_payload(
                first_name="Primera",
                email="first-typed-id@example.test",
                identification_type="CEDULA",
                identification_number="  2810904031006k  ",
            ),
            format="json",
        )
        duplicate = self.client.post(
            self.patients_url,
            self.patient_payload(
                first_name="Duplicada",
                email="duplicate-typed-id@example.test",
                identification_type="CEDULA",
                identification_number="281-090403-1006K",
            ),
            format="json",
        )
        other_type = self.client.post(
            self.patients_url,
            self.patient_payload(
                first_name="Otro tipo",
                email="other-type-id@example.test",
                identification_type="PASAPORTE",
                identification_number="281-090403-1006k",
            ),
            format="json",
        )

        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(duplicate.status_code, 400)
        self.assertIn("identification_number", duplicate.data)
        self.assertEqual(other_type.status_code, 201, other_type.data)
        self.assertEqual(Patient.objects.count(), 2)


class PatientProfileCompletenessTests(Hu53PatientTestMixin, APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="admin-hu53-profile@example.test",
            password="SyntheticOnly123!",
            role=User.Role.ADMINISTRADOR,
        )

    def test_adult_profile_reports_only_missing_administrative_fields(self):
        patient = Patient(
            first_name="",
            last_name="",
            birth_place="Managua",
            phone="",
            gender=Patient.Gender.OTRO,
            date_of_birth=None,
            registered_by=self.admin,
        )

        self.assertFalse(patient.profile_complete)
        self.assertEqual(
            patient.missing_profile_fields,
            ["first_name", "last_name", "date_of_birth", "phone"],
        )
        self.assertNotIn("identification_type", patient.missing_profile_fields)
        self.assertNotIn("identification_number", patient.missing_profile_fields)

    def test_exactly_eighteen_is_adult_but_one_day_younger_requires_guardian(self):
        today = clinic_today()
        exact_eighteen = self.create_patient(
            first_name="Adulta",
            date_of_birth=date(today.year - 18, today.month, today.day),
        )
        minor = self.create_patient(
            first_name="Menor",
            date_of_birth=date(today.year - 18, today.month, today.day) + timedelta(days=1),
        )

        self.assertTrue(exact_eighteen.profile_complete)
        self.assertEqual(exact_eighteen.missing_profile_fields, [])
        self.assertFalse(minor.profile_complete)
        self.assertEqual(
            minor.missing_profile_fields,
            ["guardian_name", "guardian_relationship", "guardian_phone"],
        )

        minor.guardian_name = "Laura Pérez"
        minor.guardian_relationship = "Madre"
        minor.guardian_phone = "+505 8888 2000"

        self.assertTrue(minor.profile_complete)
        self.assertEqual(minor.missing_profile_fields, [])


class IncompleteProfileSchedulingAndClinicalGateTests(Hu53PatientTestMixin, APITestCase):
    def setUp(self):
        open_clinic_days()
        self.admin = User.objects.create_user(
            email="admin-hu53-gates@example.test",
            password="SyntheticOnly123!",
            role=User.Role.ADMINISTRADOR,
        )
        self.dentist = User.objects.create_user(
            email="dentist-hu53-gates@example.test",
            password="SyntheticOnly123!",
            role=User.Role.ODONTOLOGO,
            first_name="Elena",
            last_name="Vargas",
        )
        self.patient = self.create_patient(
            first_name="Perfil",
            last_name="Incompleto",
            phone="",
        )
        self.client.force_authenticate(self.admin)

    def appointment_payload(self):
        return {
            "patient": self.patient.pk,
            "dentist": self.dentist.pk,
            "date": "2030-08-12",
            "start_time": "09:00",
            "duration_minutes": 60,
            "reason": "Valoración clínica",
            "notes": "",
        }

    def create_appointment(self):
        return Appointment.objects.create(
            patient=self.patient,
            dentist=self.dentist,
            date=date(2030, 8, 12),
            start_time=time(9, 0),
            duration_minutes=60,
            reason="Valoración clínica",
            created_by=self.admin,
        )

    def consultation_payload(self):
        return {
            "date": "2030-08-12",
            "time": "09:00:00",
            "consultation_type": Consultation.Type.GENERAL,
            "summary": "Valoración clínica",
            "status": Consultation.Status.IN_PROGRESS,
        }

    def assert_incomplete_profile_error(self, response):
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(response.data["code"], "patient_profile_incomplete")
        self.assertEqual(response.data["missing_fields"], ["phone"])
        self.assertTrue(response.data["detail"])

    def test_incomplete_patient_can_be_scheduled(self):
        response = self.client.post(
            "/api/appointments/",
            self.appointment_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["patient"], self.patient.pk)
        self.assertEqual(response.data["status"], Appointment.Status.SCHEDULED)

    def test_start_attendance_returns_structured_error_and_rolls_back(self):
        appointment = self.create_appointment()

        response = start_test_attendance(self.client, appointment)

        self.assert_incomplete_profile_error(response)
        appointment.refresh_from_db()
        self.assertEqual(appointment.status, Appointment.Status.SCHEDULED)
        self.assertIsNone(appointment.consultation_id)
        self.assertIsNone(appointment.attendance_started_at)
        self.assertEqual(Consultation.objects.count(), 0)
        self.assertEqual(OdontogramVersion.objects.count(), 0)

    def test_manual_consultation_cannot_bypass_profile_validation(self):
        response = self.client.post(
            f"/api/patients/{self.patient.pk}/consultations/",
            self.consultation_payload(),
            format="json",
        )

        self.assert_incomplete_profile_error(response)
        self.assertEqual(Consultation.objects.count(), 0)

    def test_in_progress_consultation_cannot_complete_with_incomplete_profile(self):
        consultation = Consultation.objects.create(
            patient=self.patient,
            professional=self.dentist,
            professional_name_snapshot="Elena Vargas",
            date=date(2030, 8, 12),
            time=time(9, 0),
            consultation_type=Consultation.Type.GENERAL,
            summary="Valoración clínica",
            status=Consultation.Status.IN_PROGRESS,
        )

        response = self.client.post(
            f"/api/patients/{self.patient.pk}/consultations/{consultation.pk}/complete/",
            format="json",
        )

        self.assert_incomplete_profile_error(response)
        consultation.refresh_from_db()
        self.assertEqual(consultation.status, Consultation.Status.IN_PROGRESS)
        self.assertIsNone(consultation.completed_at)
        self.assertIsNone(consultation.completed_by_id)

    def test_historical_completed_consultation_remains_idempotent(self):
        completed_at = timezone.now()
        consultation = Consultation.objects.create(
            patient=self.patient,
            professional=self.dentist,
            professional_name_snapshot="Elena Vargas",
            completed_at=completed_at,
            completed_by=self.admin,
            date=date(2030, 8, 12),
            time=time(9, 0),
            consultation_type=Consultation.Type.GENERAL,
            summary="Consulta histórica",
            status=Consultation.Status.COMPLETED,
        )

        response = self.client.post(
            f"/api/patients/{self.patient.pk}/consultations/{consultation.pk}/complete/",
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["consultation"]["status"], Consultation.Status.COMPLETED)
        consultation.refresh_from_db()
        self.assertEqual(consultation.completed_at, completed_at)
        self.assertEqual(consultation.completed_by_id, self.admin.pk)


class PatientMinimizedContractTests(Hu53PatientTestMixin, APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="admin-hu53-contracts@example.test",
            password="SyntheticOnly123!",
            role=User.Role.ADMINISTRADOR,
        )
        self.patient = self.create_patient(
            first_name="Contrato",
            last_name="Mínimo",
            identification_type="PASAPORTE",
            identification_number="PA-0042",
            guardian_name="Responsable Privado",
            guardian_relationship="Tutor",
            guardian_phone="+505 8999 0000",
        )
        self.client.force_authenticate(self.admin)

    def test_summary_exposes_completeness_without_identification_or_guardian_data(self):
        response = self.client.get(self.patients_url)

        self.assertEqual(response.status_code, 200)
        result = response.data["results"][0]
        self.assertEqual(
            set(result),
            {
                "id",
                "code",
                "first_name",
                "last_name",
                "second_last_name",
                "full_name",
                "phone",
                "email",
                "date_of_birth",
                "is_active",
                "profile_complete",
                "created_at",
            },
        )
        self.assertTrue(result["profile_complete"])
        self.assertNotIn("identification_type", result)
        self.assertNotIn("identification_number", result)
        self.assertNotIn("guardian_name", result)
        self.assertNotIn("missing_profile_fields", result)

    def test_option_exposes_only_selection_data_and_completeness(self):
        response = self.client.get("/api/patients/options/", {"search": "Contrato"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        result = response.data[0]
        self.assertEqual(
            set(result),
            {
                "id",
                "code",
                "full_name",
                "phone",
                "date_of_birth",
                "profile_complete",
            },
        )
        self.assertTrue(result["profile_complete"])
        self.assertNotIn("identification_type", result)
        self.assertNotIn("identification_number", result)
        self.assertNotIn("guardian_name", result)
        self.assertNotIn("missing_profile_fields", result)
