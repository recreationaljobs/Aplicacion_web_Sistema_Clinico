from datetime import date

from rest_framework.test import APITestCase

from apps.users.models import RolePermissionPreset, User

from .models import ClinicalRecord, Patient


class PatientQuickCreateApiTests(APITestCase):
    url = "/api/patients/?mode=quick"

    def setUp(self):
        self.admin = User.objects.create_user(
            email="quick-patient-admin@example.test",
            password="SyntheticOnly123!",
            role=User.Role.ADMINISTRADOR,
        )
        self.receptionist = User.objects.create_user(
            email="quick-patient-reception@example.test",
            password="SyntheticOnly123!",
            role=User.Role.RECEPCIONISTA,
        )
        self.dentist = User.objects.create_user(
            email="quick-patient-dentist@example.test",
            password="SyntheticOnly123!",
            role=User.Role.ODONTOLOGO,
        )
        self.client.force_authenticate(self.receptionist)

    def payload(self, **overrides):
        values = {
            "first_name": "Ana",
            "last_name": "López",
            "date_of_birth": "1990-05-10",
            "phone": "8888-1111",
        }
        values.update(overrides)
        return values

    def test_name_surname_birth_and_phone_create_real_patient_with_minimal_response(self):
        response = self.client.post(self.url, self.payload(), format="json")

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(
            set(response.data),
            {
                "id",
                "code",
                "full_name",
                "phone",
                "date_of_birth",
                "profile_complete",
            },
        )
        patient = Patient.objects.get(pk=response.data["id"])
        self.assertEqual(patient.first_name, "Ana")
        self.assertEqual(patient.last_name, "López")
        self.assertEqual(patient.birth_place, "")
        self.assertEqual(patient.gender, "")
        self.assertIsNone(patient.identification_type)
        self.assertIsNone(patient.identification_number)
        self.assertEqual(patient.registered_by, self.receptionist)
        self.assertTrue(ClinicalRecord.objects.filter(patient=patient).exists())
        self.assertTrue(response.data["profile_complete"])

    def test_name_surname_birth_and_identification_allow_missing_phone(self):
        response = self.client.post(
            self.url,
            self.payload(
                phone="",
                identification_type=Patient.IdentificationType.PASAPORTE,
                identification_number="PA-520013",
            ),
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)
        patient = Patient.objects.get(pk=response.data["id"])
        self.assertEqual(patient.phone, "")
        self.assertEqual(patient.identification_type, Patient.IdentificationType.PASAPORTE)
        self.assertEqual(patient.identification_number, "PA-520013")
        self.assertFalse(response.data["profile_complete"])

    def test_each_hu53_identification_type_is_supported(self):
        for index, identification_type in enumerate(Patient.IdentificationType.values, start=1):
            with self.subTest(identification_type=identification_type):
                response = self.client.post(
                    self.url,
                    self.payload(
                        first_name=f"Paciente {index}",
                        phone="",
                        identification_type=identification_type,
                        identification_number=("001-010190-1001A" if identification_type == "CEDULA" else f"ID-{identification_type}-{index}"),
                    ),
                    format="json",
                )
                self.assertEqual(response.status_code, 201, response.data)

    def test_missing_phone_and_identification_is_rejected(self):
        response = self.client.post(
            self.url,
            self.payload(phone="", identification_type=None, identification_number=None),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("non_field_errors", response.data)
        self.assertEqual(Patient.objects.count(), 0)

    def test_birth_date_remains_required_by_the_current_model_contract(self):
        response = self.client.post(
            self.url,
            self.payload(date_of_birth=None),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("date_of_birth", response.data)

    def test_exact_identity_stays_blocked_but_same_number_with_other_type_is_allowed(self):
        Patient.objects.create(
            first_name="Existente",
            last_name="Identidad",
            birth_place="Managua",
            identification_type=Patient.IdentificationType.CEDULA,
            identification_number="001-010190-0052A",
            phone="7777-0000",
            gender=Patient.Gender.OTRO,
            date_of_birth=date(1990, 1, 1),
            registered_by=self.admin,
        )

        duplicate = self.client.post(
            self.url,
            self.payload(
                phone="",
                identification_type=Patient.IdentificationType.CEDULA,
                identification_number="001 010190 0052a",
            ),
            format="json",
        )
        other_type = self.client.post(
            self.url,
            self.payload(
                first_name="Distinto",
                phone="",
                identification_type=Patient.IdentificationType.PASAPORTE,
                identification_number="001 010190 0052a",
            ),
            format="json",
        )

        self.assertEqual(duplicate.status_code, 400)
        self.assertIn("identification_number", duplicate.data)
        self.assertEqual(other_type.status_code, 201, other_type.data)

    def test_quick_create_requires_patient_create_permission(self):
        preset = RolePermissionPreset.objects.get(role=User.Role.ODONTOLOGO)
        preset.permissions = ["appointments.create"]
        preset.save(update_fields=["permissions"])
        self.client.force_authenticate(self.dentist)

        response = self.client.post(self.url, self.payload(), format="json")

        self.assertEqual(response.status_code, 403)
        self.assertEqual(Patient.objects.count(), 0)

    def test_normal_create_contract_does_not_silently_switch_to_quick_mode(self):
        response = self.client.post("/api/patients/", self.payload(), format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("birth_place", response.data)
        self.assertIn("gender", response.data)
