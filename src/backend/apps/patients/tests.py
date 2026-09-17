from unittest.mock import patch

from django.apps import apps
from django.db import IntegrityError, connection, transaction
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase

from apps.appointments.models import Appointment
from apps.users.models import RolePermissionPreset, User

from .models import Consultation, Patient


class PatientApiTests(APITestCase):
    list_url = "/api/patients/"

    def setUp(self):
        self.receptionist = User.objects.create_user(
            email="recepcion-patients@dentalclinic.com",
            password="ContraseñaRecepcion123!",
            role=User.Role.RECEPCIONISTA,
        )
        self.dentist = User.objects.create_user(
            email="dentist-patients@dentalclinic.com",
            password="ContraseñaDentist123!",
            role=User.Role.ODONTOLOGO,
        )
        self.admin = User.objects.create_user(
            email="admin-patients@dentalclinic.com",
            password="ContraseñaAdmin123!",
            role=User.Role.ADMINISTRADOR,
        )

    def payload(self, **overrides):
        data = {
            "first_name": "María Fernanda",
            "last_name": "García",
            "second_last_name": "López",
            "birth_place": "Managua",
            "address": "Colonia Roma Norte",
            "identification_type": Patient.IdentificationType.CEDULA,
            "identification_number": "001-160498-0001A",
            "phone": "+505 8888 1111",
            "email": "maria@example.com",
            "emergency_contact_name": "Carlos García",
            "emergency_relationship": "Hermano",
            "emergency_phone": "+505 8888 2222",
            "gender": "FEMENINO",
            "date_of_birth": "1998-04-16",
            "is_active": True,
        }
        data.update(overrides)
        return data

    def complete_record_payload(self):
        return self.payload(
            origin="Chinandega",
            religion="Católica",
            education="Universitaria",
            profession="Docente",
            father_name="José García",
            mother_name="Ana López",
            information_source="Paciente",
            information_reliability="Confiable",
            clinical_record={
                "allergies": "Penicilina — urticaria",
                "current_medications": "Losartán 50 mg",
                "relevant_conditions": "Hipertensión controlada",
                "other_clinical_alerts": "Antecedente de síncope durante procedimientos",
                "examiner_name": "Dra. Elena Ruiz",
                "examiner_national_id": "001-010180-0003C",
                "consultation_date": "2026-08-08",
                "consultation_time": "09:30:00",
                "dental_service": "Valoración odontológica",
                "chief_complaint": "Dolor en molar inferior derecho.",
                "present_illness_history": "Dolor pulsátil de tres días de evolución.",
                "respiratory": "Sin disnea.",
                "cardiovascular": "Sin dolor precordial.",
                "hepatic_renal": "Sin alteraciones referidas.",
                "gastrointestinal": "Apetito conservado.",
                "neurological": "Sin cefalea.",
                "blood_system": "Sin sangrado anormal.",
                "reproductive_organs": "Sin alteraciones referidas.",
                "family_history": "Madre con hipertensión arterial.",
                "infectious_diseases": {"hepatitis": False, "varicella": True, "other": ""},
                "hereditary_diseases": {"diabetes_mellitus": True, "allergies": False, "other": ""},
                "heart_rate": 72,
                "respiratory_rate": 16,
                "blood_pressure": "118/76",
                "temperature": "36.6",
                "weight": "68.40",
                "height": "1.65",
                "body_surface_area": "1.76",
                "bmi": "25.12",
                "general_appearance": "Consciente y orientada.",
                "skin_and_mucosa": "Normocoloreadas.",
                "dental_diagnoses": "Pulpitis irreversible en pieza 46.",
                "treatment_plan": "Tratamiento endodóntico y corona.",
                "budget": "Endodoncia: C$ 4,500; corona: C$ 6,000.",
                "radiographic_exams": ["periapical-46.pdf"],
                "clinical_photographs": ["pieza-46-frontal.jpg"],
            },
        )

    def test_hu10_registers_complete_clinical_record(self):
        self.client.force_authenticate(self.receptionist)

        response = self.client.post(self.list_url, self.complete_record_payload(), format="json")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["origin"], "Chinandega")
        self.assertEqual(response.data["information_reliability"], "Confiable")
        record = response.data["clinical_record"]
        self.assertNotIn("observations_analysis", record)
        self.assertNotIn("treatment_performed", record)
        self.assertNotIn("inss_number", record)
        self.assertNotIn("cema_number", record)
        self.assertEqual(record["examiner_name"], "Dra. Elena Ruiz")
        self.assertEqual(record["allergies"], "Penicilina — urticaria")
        self.assertEqual(record["current_medications"], "Losartán 50 mg")
        self.assertEqual(record["relevant_conditions"], "Hipertensión controlada")
        self.assertEqual(
            record["other_clinical_alerts"],
            "Antecedente de síncope durante procedimientos",
        )
        self.assertEqual(record["chief_complaint"], "Dolor en molar inferior derecho.")
        self.assertEqual(record["present_illness_history"], "Dolor pulsátil de tres días de evolución.")
        self.assertEqual(record["cardiovascular"], "Sin dolor precordial.")
        self.assertTrue(record["infectious_diseases"]["varicella"])
        self.assertTrue(record["hereditary_diseases"]["diabetes_mellitus"])
        self.assertEqual(record["blood_pressure"], "118/76")
        self.assertEqual(record["general_appearance"], "Consciente y orientada.")
        self.assertEqual(record["dental_diagnoses"], "Pulpitis irreversible en pieza 46.")
        self.assertEqual(record["clinical_photographs"], ["pieza-46-frontal.jpg"])

        detail = self.client.get(f"{self.list_url}{response.data['id']}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["clinical_record"]["treatment_plan"], "Tratamiento endodóntico y corona.")

    def test_hu28_updates_longitudinal_clinical_alerts(self):
        self.client.force_authenticate(self.receptionist)
        created = self.client.post(self.list_url, self.complete_record_payload(), format="json")
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            f"{self.list_url}{created.data['id']}/",
            {
                "clinical_record": {
                    "allergies": "Látex — dermatitis de contacto",
                    "current_medications": "Metformina 850 mg\nLosartán 50 mg",
                    "relevant_conditions": "Diabetes tipo 2 controlada",
                    "other_clinical_alerts": "Requiere citas matutinas",
                }
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data["clinical_record"]["allergies"],
            "Látex — dermatitis de contacto",
        )
        self.assertEqual(
            response.data["clinical_record"]["current_medications"],
            "Metformina 850 mg\nLosartán 50 mg",
        )
        self.assertEqual(
            response.data["clinical_record"]["relevant_conditions"],
            "Diabetes tipo 2 controlada",
        )
        self.assertEqual(
            response.data["clinical_record"]["other_clinical_alerts"],
            "Requiere citas matutinas",
        )

    def test_hu28_patient_without_alerts_returns_empty_strings(self):
        self.client.force_authenticate(self.receptionist)

        created = self.client.post(self.list_url, self.payload(), format="json")
        detail = self.client.get(f"{self.list_url}{created.data['id']}/")

        self.assertEqual(detail.status_code, 200)
        self.assertEqual(
            {
                field: detail.data["clinical_record"][field]
                for field in (
                    "allergies",
                    "current_medications",
                    "relevant_conditions",
                    "other_clinical_alerts",
                )
            },
            {
                "allergies": "",
                "current_medications": "",
                "relevant_conditions": "",
                "other_clinical_alerts": "",
            },
        )

    def test_hu28_rejects_alert_text_longer_than_technical_limit(self):
        self.client.force_authenticate(self.receptionist)

        response = self.client.post(
            self.list_url,
            self.payload(clinical_record={"allergies": "x" * 2001}),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("allergies", response.data["clinical_record"])

    def test_hu10_receptionist_registers_patient_and_can_open_created_record(self):
        self.client.force_authenticate(self.receptionist)

        response = self.client.post(self.list_url, self.payload(), format="json")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["code"], f"PAC-{response.data['id']:05d}")
        self.assertEqual(response.data["full_name"], "María Fernanda García López")
        self.assertEqual(response.data["registered_by"], self.receptionist.pk)
        detail = self.client.get(f"{self.list_url}{response.data['id']}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["identification_type"], "CEDULA")
        self.assertEqual(detail.data["identification_number"], "001-160498-0001A")
        self.assertEqual(detail.data["emergency_contact_name"], "Carlos García")

    def test_hu10_a_user_without_create_permission_cannot_register_patients(self):
        self.client.force_authenticate(self.dentist)

        response = self.client.post(self.list_url, self.payload(), format="json")

        self.assertEqual(response.status_code, 403)

    def test_hu10_removing_role_permission_blocks_every_receptionist(self):
        preset = RolePermissionPreset.objects.get(role=User.Role.RECEPCIONISTA)
        preset.permissions = ["patients.view"]
        preset.save(update_fields=["permissions"])
        self.client.force_authenticate(self.receptionist)

        response = self.client.post(self.list_url, self.payload(), format="json")

        self.assertEqual(response.status_code, 403)

    def test_hu10_administrator_keeps_implicit_patient_registration_access(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(self.list_url, self.payload(), format="json")

        self.assertEqual(response.status_code, 201)

    def test_hu10_rejects_future_birth_date_and_duplicate_national_id(self):
        self.client.force_authenticate(self.receptionist)

        future = self.client.post(
            self.list_url,
            self.payload(date_of_birth="2999-01-01"),
            format="json",
        )
        created = self.client.post(self.list_url, self.payload(), format="json")
        duplicate = self.client.post(
            self.list_url,
            self.payload(
                identification_number="001-160498-0001a",
                email="otra@example.com",
            ),
            format="json",
        )

        self.assertEqual(future.status_code, 400)
        self.assertIn("date_of_birth", future.data)
        self.assertEqual(created.status_code, 201)
        self.assertEqual(duplicate.status_code, 400)
        self.assertIn("identification_number", duplicate.data)

    def test_hu13_rejects_duplicate_national_id_with_different_separators(self):
        self.client.force_authenticate(self.receptionist)
        created = self.client.post(self.list_url, self.payload(), format="json")

        duplicate = self.client.post(
            self.list_url,
            self.payload(
                identification_number=" 001 160498 0001a ",
                email="duplicado@example.com",
            ),
            format="json",
        )

        self.assertEqual(created.status_code, 201)
        self.assertEqual(duplicate.status_code, 400)
        self.assertEqual(
            duplicate.data,
            {
                "identification_number": [
                    "Ya existe un paciente con este tipo y número de identificación."
                ]
            },
        )
        self.assertEqual(Patient.objects.count(), 1)

    def test_hu13_allows_reformatting_the_same_patients_national_id(self):
        self.client.force_authenticate(self.admin)
        created = self.client.post(self.list_url, self.payload(), format="json")

        response = self.client.patch(
            f"{self.list_url}{created.data['id']}/",
            {"identification_number": " 001 160498 0001a "},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data["identification_number"],
            "001-160498-0001A",
        )
        patient = Patient.objects.get(pk=created.data["id"])
        self.assertEqual(patient.identification_number, "001-160498-0001A")

    def test_cedula_input_is_saved_with_hyphens_and_uppercase_letter(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            self.list_url,
            self.payload(identification_number="2810904031006k"),
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["identification_number"], "281-090403-1006K")
        self.assertEqual(
            Patient.objects.get(pk=response.data["id"]).identification_number,
            "281-090403-1006K",
        )

    def test_cedula_rejects_incomplete_or_invalid_structure(self):
        self.client.force_authenticate(self.admin)
        for number in ("32423553245345", "2810904031006", "281090403100KK", "281.090403.1006K"):
            with self.subTest(number=number):
                response = self.client.post(
                    self.list_url, self.payload(identification_number=number), format="json",
                )
                self.assertEqual(response.status_code, 400)
                self.assertIn("identification_number", response.data)
        self.assertEqual(Patient.objects.count(), 0)

    def test_hu13_allows_a_genuinely_distinct_national_id(self):
        self.client.force_authenticate(self.receptionist)
        first = self.client.post(self.list_url, self.payload(), format="json")
        second = self.client.post(
            self.list_url,
            self.payload(
                identification_number="001-160498-0002A",
                email="distinto@example.com",
            ),
            format="json",
        )

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(Patient.objects.count(), 2)

    def test_hu13_model_enforces_the_normalized_key_for_direct_saves(self):
        Patient.objects.create(
            registered_by=self.admin,
            **self.payload(),
        )

        with self.assertRaises(IntegrityError), transaction.atomic():
            Patient.objects.create(
                registered_by=self.admin,
                **self.payload(
                    identification_number="0011604980001a",
                    email="directo@example.com",
                ),
            )

        self.assertEqual(Patient.objects.count(), 1)

    def test_hu13_translates_a_concurrent_duplicate_conflict(self):
        self.client.force_authenticate(self.admin)
        self.client.post(self.list_url, self.payload(), format="json")

        with patch(
            "django.db.models.query.QuerySet.exists",
            side_effect=[False, True],
        ):
            response = self.client.post(
                self.list_url,
                self.payload(
                    identification_number="0011604980001a",
                    email="concurrente@example.com",
                ),
                format="json",
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data,
            {
                "identification_number": [
                    "Ya existe un paciente con este tipo y número de identificación."
                ]
            },
        )
        self.assertEqual(Patient.objects.count(), 1)

    def test_hu10_read_only_fields_cannot_be_impersonated(self):
        self.client.force_authenticate(self.receptionist)

        response = self.client.post(
            self.list_url,
            self.payload(code="PAC-99999", registered_by=self.dentist.pk),
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["code"], f"PAC-{response.data['id']:05d}")
        self.assertEqual(response.data["registered_by"], self.receptionist.pk)

    def test_hu10_authorized_user_lists_and_searches_patient_records(self):
        self.client.force_authenticate(self.admin)
        self.client.post(self.list_url, self.payload(), format="json")
        self.client.post(
            self.list_url,
            self.payload(
                first_name="Juan",
                last_name="Pérez",
                second_last_name="",
                identification_number="001-010190-0002B",
                phone="555-1234",
                email="juan@example.com",
            ),
            format="json",
        )
        self.client.force_authenticate(self.dentist)

        response = self.client.get(f"{self.list_url}?search=Juan")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["full_name"], "Juan Pérez")

    def test_patient_list_uses_the_minimal_administrative_summary_contract(self):
        self.client.force_authenticate(self.admin)
        created = self.client.post(
            self.list_url,
            self.complete_record_payload(),
            format="json",
        )

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        summary = response.data["results"][0]
        self.assertEqual(summary["id"], created.data["id"])
        self.assertEqual(set(summary), {
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
        })
        self.assertNotIn("clinical_record", summary)
        self.assertNotIn("address", summary)
        self.assertNotIn("emergency_contact_name", summary)
        self.assertNotIn("identification_number", summary)

    def test_patient_detail_keeps_the_complete_record_contract(self):
        self.client.force_authenticate(self.admin)
        created = self.client.post(
            self.list_url,
            self.complete_record_payload(),
            format="json",
        )

        response = self.client.get(f"{self.list_url}{created.data['id']}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["address"], "Colonia Roma Norte")
        self.assertEqual(response.data["identification_type"], "CEDULA")
        self.assertEqual(response.data["identification_number"], "001-160498-0001A")
        self.assertEqual(
            response.data["clinical_record"]["chief_complaint"],
            "Dolor en molar inferior derecho.",
        )
        self.assertEqual(
            response.data["clinical_record"]["allergies"],
            "Penicilina — urticaria",
        )

    def test_patient_summary_does_not_query_one_clinical_record_per_patient(self):
        self.client.force_authenticate(self.admin)
        self.client.post(self.list_url, self.complete_record_payload(), format="json")

        with CaptureQueriesContext(connection) as first_queries:
            first_response = self.client.get(self.list_url)

        for index in range(2, 6):
            self.client.post(
                self.list_url,
                self.payload(
                    first_name=f"Paciente {index}",
                    identification_number=f"001-010190-{index:04d}A",
                    email=f"paciente-{index}@example.test",
                ),
                format="json",
            )

        with CaptureQueriesContext(connection) as many_queries:
            many_response = self.client.get(self.list_url)

        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(many_response.status_code, 200)
        self.assertEqual(len(first_queries), len(many_queries))
        self.assertFalse(any(
            "patients_clinicalrecord" in query["sql"].lower()
            for query in many_queries.captured_queries
        ))

    def test_patient_list_is_paginated_and_caps_the_requested_page_size(self):
        self.client.force_authenticate(self.admin)
        self.client.post(self.list_url, self.payload(), format="json")
        self.client.post(
            self.list_url,
            self.payload(
                identification_number="001-010190-0002B",
                email="segundo@example.com",
            ),
            format="json",
        )

        response = self.client.get(self.list_url, {"page_size": 1})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertIsNotNone(response.data["next"])

    def test_authenticated_unsupported_patient_method_returns_405(self):
        self.client.force_authenticate(self.admin)
        created = self.client.post(self.list_url, self.payload(), format="json")

        response = self.client.delete(f"{self.list_url}{created.data['id']}/")

        self.assertEqual(response.status_code, 405)

    def test_hu10_role_with_edit_permission_updates_patient_and_preserves_audit_fields(self):
        self.client.force_authenticate(self.admin)
        created = self.client.post(self.list_url, self.payload(), format="json")
        patient_url = f"{self.list_url}{created.data['id']}/"
        preset = RolePermissionPreset.objects.get(role=User.Role.RECEPCIONISTA)
        preset.permissions = ["patients.view", "patients.edit"]
        preset.save(update_fields=["permissions"])
        self.client.force_authenticate(self.receptionist)

        response = self.client.patch(
            patient_url,
            {
                "address": "Residencial Las Colinas",
                "emergency_phone": "+505 7777 3333",
                "identification_number": "001-160498-0001a",
                "code": "PAC-99999",
                "registered_by": self.receptionist.pk,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["address"], "Residencial Las Colinas")
        self.assertEqual(response.data["emergency_phone"], "+505 7777 3333")
        self.assertEqual(response.data["identification_number"], "001-160498-0001A")
        self.assertEqual(response.data["code"], f"PAC-{response.data['id']:05d}")
        self.assertEqual(response.data["registered_by"], self.admin.pk)

    def test_hu10_user_without_edit_permission_cannot_modify_patient(self):
        self.client.force_authenticate(self.admin)
        created = self.client.post(self.list_url, self.payload(), format="json")
        self.client.force_authenticate(self.dentist)

        response = self.client.patch(
            f"{self.list_url}{created.data['id']}/",
            {"address": "Cambio no autorizado"},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.client.force_authenticate(self.admin)
        detail = self.client.get(f"{self.list_url}{created.data['id']}/")
        self.assertEqual(detail.data["address"], "Colonia Roma Norte")

    def test_patient_consultations_returns_an_empty_history_for_an_authorized_user(self):
        self.client.force_authenticate(self.admin)
        created = self.client.post(self.list_url, self.payload(), format="json")
        self.client.force_authenticate(self.dentist)

        response = self.client.get(
            f"{self.list_url}{created.data['id']}/consultations/"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 0)
        self.assertEqual(response.data["results"], [])

    def test_patient_consultations_requires_consultation_view_permission(self):
        self.client.force_authenticate(self.admin)
        created = self.client.post(self.list_url, self.payload(), format="json")
        preset = RolePermissionPreset.objects.get(role=User.Role.RECEPCIONISTA)
        preset.permissions = ["patients.create"]
        preset.save(update_fields=["permissions"])
        self.client.force_authenticate(self.receptionist)

        response = self.client.get(
            f"{self.list_url}{created.data['id']}/consultations/"
        )

        self.assertEqual(response.status_code, 403)

    def test_patient_consultations_returns_persisted_rows_newest_first(self):
        self.client.force_authenticate(self.admin)
        created = self.client.post(self.list_url, self.payload(), format="json")
        patient = apps.get_model("patients", "Patient").objects.get(
            pk=created.data["id"]
        )
        try:
            consultation_model = apps.get_model("patients", "Consultation")
        except LookupError:
            self.fail("The persisted Consultation model is missing.")
        self.dentist.first_name = "Elena"
        self.dentist.last_name = "Rivera"
        self.dentist.save(update_fields=["first_name", "last_name"])
        consultation_model.objects.create(
            patient=patient,
            professional=self.dentist,
            date="2026-08-01",
            consultation_type="GENERAL",
            summary="Revisión de signos vitales.",
            status="COMPLETADA",
        )
        consultation_model.objects.create(
            patient=patient,
            professional=self.dentist,
            date="2026-08-08",
            consultation_type="SEGUIMIENTO",
            summary="Paciente estable y continúa el tratamiento.",
            status="COMPLETADA",
        )

        response = self.client.get(
            f"{self.list_url}{created.data['id']}/consultations/"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 2)
        results = response.data["results"]
        self.assertEqual(results[0]["date"], "2026-08-08")
        self.assertEqual(results[0]["consultation_type"], "SEGUIMIENTO")
        self.assertEqual(results[0]["consultation_type_display"], "Seguimiento")
        self.assertEqual(results[0]["professional_name"], "Elena Rivera")
        self.assertEqual(results[0]["status_display"], "Completada")
        self.assertEqual(results[1]["date"], "2026-08-01")


class PatientOptionApiTests(APITestCase):
    options_url = "/api/patients/options/"
    list_url = "/api/patients/"

    def setUp(self):
        self.admin = User.objects.create_user(
            email="admin-patient-options@example.test",
            password="SyntheticOnly123!",
            role=User.Role.ADMINISTRADOR,
        )
        self.receptionist = User.objects.create_user(
            email="reception-patient-options@example.test",
            password="SyntheticOnly123!",
            role=User.Role.RECEPCIONISTA,
        )
        self.dentist = User.objects.create_user(
            email="dentist-patient-options@example.test",
            password="SyntheticOnly123!",
            role=User.Role.ODONTOLOGO,
        )

    def create_patient(self, index, **overrides):
        values = {
            "first_name": f"Paciente {index}",
            "last_name": "Opciones",
            "birth_place": "Managua",
            "identification_type": Patient.IdentificationType.CEDULA,
            "identification_number": f"001-010190-{index:04d}A",
            "phone": f"+505 8800 {index:04d}",
            "email": f"opcion-{index}@example.test",
            "gender": Patient.Gender.OTRO,
            "date_of_birth": "1990-01-01",
            "registered_by": self.admin,
        }
        values.update(overrides)
        return Patient.objects.create(**values)

    def test_search_below_two_characters_returns_an_empty_list(self):
        self.create_patient(1, first_name="Ana")
        self.client.force_authenticate(self.receptionist)

        empty = self.client.get(self.options_url)
        one_character = self.client.get(self.options_url, {"search": " A "})

        self.assertEqual(empty.status_code, 200)
        self.assertEqual(empty.data, [])
        self.assertEqual(one_character.status_code, 200)
        self.assertEqual(one_character.data, [])

    def test_options_searches_active_patients_and_returns_only_minimal_fields(self):
        active = self.create_patient(1, first_name="María", last_name="García")
        self.create_patient(
            2,
            first_name="María",
            last_name="Inactiva",
            is_active=False,
        )
        self.client.force_authenticate(self.receptionist)

        response = self.client.get(self.options_url, {"search": "María"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], active.pk)
        self.assertEqual(set(response.data[0]), {
            "id",
            "code",
            "full_name",
            "phone",
            "date_of_birth",
            "profile_complete",
        })
        self.assertNotIn("identification_number", response.data[0])
        self.assertNotIn("clinical_record", response.data[0])

    def test_options_searches_by_code_phone_and_existing_identification(self):
        patient = self.create_patient(
            7,
            first_name="Único",
            identification_number="001-150595-4321Z",
            phone="+505 7777 4321",
        )
        self.client.force_authenticate(self.receptionist)

        for search in (patient.code, "7777 4321", "150595"):
            with self.subTest(search=search):
                response = self.client.get(self.options_url, {"search": search})
                self.assertEqual(response.status_code, 200)
                self.assertEqual([item["id"] for item in response.data], [patient.pk])

    def test_options_are_limited_to_twenty_results(self):
        for index in range(1, 26):
            self.create_patient(index, first_name=f"Coincidencia {index:02d}")
        self.client.force_authenticate(self.receptionist)

        response = self.client.get(self.options_url, {"search": "Coincidencia"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 20)

    def test_appointment_creation_permission_does_not_grant_patient_record_access(self):
        patient = self.create_patient(1, first_name="Permiso")
        preset = RolePermissionPreset.objects.get(role=User.Role.ODONTOLOGO)
        preset.permissions = ["appointments.create"]
        preset.save(update_fields=["permissions"])
        self.client.force_authenticate(self.dentist)

        options = self.client.get(self.options_url, {"search": "Permiso"})
        records = self.client.get(self.list_url)
        detail = self.client.get(f"{self.list_url}{patient.pk}/")

        self.assertEqual(options.status_code, 200)
        self.assertEqual([item["id"] for item in options.data], [patient.pk])
        self.assertNotIn("allergies", options.data[0])
        self.assertNotIn("current_medications", options.data[0])
        self.assertEqual(records.status_code, 403)
        self.assertEqual(detail.status_code, 403)

    def test_options_require_appointment_creation_permission(self):
        self.create_patient(1, first_name="Restringido")

        unauthenticated = self.client.get(self.options_url, {"search": "Restringido"})
        self.client.force_authenticate(self.dentist)
        unauthorized = self.client.get(self.options_url, {"search": "Restringido"})

        self.assertEqual(unauthenticated.status_code, 401)
        self.assertEqual(unauthorized.status_code, 403)


class RecentConsultationApiTests(APITestCase):
    url = "/api/patients/consultations/recent/"

    def setUp(self):
        self.admin = User.objects.create_user(
            email="admin-recent-consultations@dentalclinic.com",
            password="ContraseñaAdmin123!",
            role=User.Role.ADMINISTRADOR,
        )
        self.dentist = User.objects.create_user(
            email="dentist-recent-consultations@dentalclinic.com",
            password="ContraseñaDentist123!",
            role=User.Role.ODONTOLOGO,
            first_name="Elena",
            last_name="Rivera",
        )
        self.other_dentist = User.objects.create_user(
            email="other-recent-consultations@dentalclinic.com",
            password="ContraseñaDentist123!",
            role=User.Role.ODONTOLOGO,
            first_name="Pablo",
            last_name="Suárez",
        )
        self.receptionist = User.objects.create_user(
            email="reception-recent-consultations@dentalclinic.com",
            password="ContraseñaRecepcion123!",
            role=User.Role.RECEPCIONISTA,
        )
        self.patient = Patient.objects.create(
            first_name="María",
            last_name="García",
            birth_place="Managua",
            identification_type=Patient.IdentificationType.CEDULA,
            identification_number="001-160498-0001A",
            phone="+505 8888 1111",
            gender="FEMENINO",
            date_of_birth="1998-04-16",
            registered_by=self.admin,
        )

    def create_consultation(self, professional, date, time="09:00:00"):
        return Consultation.objects.create(
            patient=self.patient,
            professional=professional,
            date=date,
            time=time,
            consultation_type=Consultation.Type.GENERAL,
            summary="Control clínico.",
            status=Consultation.Status.COMPLETED,
        )

    def test_requires_consultation_view_permission(self):
        preset = RolePermissionPreset.objects.get(role=User.Role.RECEPCIONISTA)
        preset.permissions = ["patients.view"]
        preset.save(update_fields=["permissions"])
        self.client.force_authenticate(self.receptionist)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 403)

    def test_without_view_all_returns_only_the_authenticated_professionals_rows(self):
        own = self.create_consultation(self.dentist, "2026-08-09")
        self.create_consultation(self.other_dentist, "2026-08-10")
        self.client.force_authenticate(self.dentist)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["id"] for item in response.data], [own.pk])
        self.assertEqual(
            set(response.data[0]),
            {
                "id", "patient", "patient_name", "patient_code",
                "professional_name", "date", "time", "consultation_type",
                "consultation_type_display", "status", "status_display",
            },
        )
        self.assertEqual(response.data[0]["patient_name"], "María García")
        self.assertEqual(response.data[0]["patient_code"], self.patient.code)
        self.assertEqual(response.data[0]["professional_name"], "Elena Rivera")

    def test_administrator_receives_only_the_four_most_recent_rows(self):
        created = [
            self.create_consultation(self.dentist, f"2026-08-{day:02d}")
            for day in range(6, 11)
        ]
        self.client.force_authenticate(self.admin)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [item["id"] for item in response.data],
            [consultation.pk for consultation in reversed(created[1:])],
        )

    def test_view_all_returns_consultations_from_the_whole_team(self):
        first = self.create_consultation(self.dentist, "2026-08-09")
        second = self.create_consultation(self.other_dentist, "2026-08-10")
        preset = RolePermissionPreset.objects.get(role=User.Role.RECEPCIONISTA)
        preset.permissions = ["consultations.view", "consultations.view_all"]
        preset.save(update_fields=["permissions"])
        self.client.force_authenticate(self.receptionist)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [item["id"] for item in response.data],
            [second.pk, first.pk],
        )


class PatientDashboardSummaryApiTests(APITestCase):
    url = "/api/patients/dashboard-summary/"

    def setUp(self):
        self.admin = User.objects.create_user(
            email="admin-patient-summary@dentalclinic.com",
            password="ContraseñaAdmin123!",
            role=User.Role.ADMINISTRADOR,
        )
        self.receptionist = User.objects.create_user(
            email="reception-patient-summary@dentalclinic.com",
            password="ContraseñaRecepcion123!",
            role=User.Role.RECEPCIONISTA,
        )
        self.dentist = User.objects.create_user(
            email="dentist-patient-summary@dentalclinic.com",
            password="ContraseñaDentist123!",
            role=User.Role.ODONTOLOGO,
        )
        self.patient_counter = 0

    def create_patient(self, first_name, *, is_active=True):
        self.patient_counter += 1
        return Patient.objects.create(
            first_name=first_name,
            last_name="Paciente",
            birth_place="Managua",
            identification_type=Patient.IdentificationType.CEDULA,
            identification_number=f"001-010190-{self.patient_counter:04d}A",
            phone="+505 8888 1111",
            gender=Patient.Gender.FEMENINO,
            date_of_birth="1990-01-01",
            registered_by=self.admin,
            is_active=is_active,
        )

    def create_consultation(
        self,
        patient,
        date,
        *,
        time="09:00:00",
        status=Consultation.Status.COMPLETED,
        professional=None,
    ):
        return Consultation.objects.create(
            patient=patient,
            professional=professional or self.dentist,
            date=date,
            time=time,
            consultation_type=Consultation.Type.GENERAL,
            summary="Atención clínica.",
            status=status,
        )

    def test_returns_total_and_a_compact_recently_attended_patient_contract(self):
        attended = self.create_patient("Ana")
        self.create_patient("Sin consulta")
        self.create_consultation(attended, "2001-01-10", time="10:30:00")
        self.client.force_authenticate(self.admin)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total_patients"], 2)
        self.assertEqual(len(response.data["recently_attended"]), 1)
        summary = response.data["recently_attended"][0]
        self.assertEqual(
            set(summary),
            {
                "id", "code", "first_name", "last_name", "full_name",
                "last_attended_date", "last_attended_time",
            },
        )
        self.assertEqual(summary["id"], attended.pk)
        self.assertEqual(summary["code"], attended.code)
        self.assertEqual(summary["full_name"], "Ana Paciente")
        self.assertEqual(summary["last_attended_date"], "2001-01-10")
        self.assertEqual(summary["last_attended_time"], "10:30:00")

    def test_uses_only_each_patients_latest_non_future_completed_consultation(self):
        repeated = self.create_patient("Repetida")
        completed = self.create_patient("Completada")
        in_progress = self.create_patient("En progreso")
        cancelled = self.create_patient("Cancelada")
        future = self.create_patient("Futura")
        self.create_consultation(repeated, "2001-01-05", time="15:00:00")
        self.create_consultation(repeated, "2001-01-10", time=None)
        self.create_consultation(repeated, "2001-01-10", time="08:00:00")
        self.create_consultation(completed, "2001-01-09", time="12:00:00")
        self.create_consultation(
            in_progress,
            "2001-01-12",
            status=Consultation.Status.IN_PROGRESS,
        )
        self.create_consultation(
            cancelled,
            "2001-01-13",
            status=Consultation.Status.CANCELLED,
        )
        self.create_consultation(future, "2999-01-01")
        self.client.force_authenticate(self.admin)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        summaries = response.data["recently_attended"]
        self.assertEqual([item["id"] for item in summaries], [repeated.pk, completed.pk])
        self.assertEqual(summaries[0]["last_attended_date"], "2001-01-10")
        self.assertEqual(summaries[0]["last_attended_time"], "08:00:00")

    def test_limits_results_to_four_and_keeps_recently_attended_inactive_patients(self):
        patients = []
        for day in range(1, 6):
            patient = self.create_patient(
                f"Paciente {day}",
                is_active=day != 5,
            )
            self.create_consultation(patient, f"2001-01-{day:02d}")
            patients.append(patient)
        self.client.force_authenticate(self.admin)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [item["id"] for item in response.data["recently_attended"]],
            [patient.pk for patient in reversed(patients[1:])],
        )

    def test_patients_view_grants_global_summary_without_consultation_scope(self):
        first = self.create_patient("Primera")
        second = self.create_patient("Segunda")
        other_dentist = User.objects.create_user(
            email="other-dentist-summary@dentalclinic.com",
            password="ContraseñaDentist123!",
            role=User.Role.ODONTOLOGO,
        )
        self.create_consultation(first, "2001-01-01", professional=self.dentist)
        self.create_consultation(second, "2001-01-02", professional=other_dentist)
        preset = RolePermissionPreset.objects.get(role=User.Role.RECEPCIONISTA)
        preset.permissions = ["patients.view"]
        preset.save(update_fields=["permissions"])
        self.client.force_authenticate(self.receptionist)

        allowed = self.client.get(self.url)

        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(
            [item["id"] for item in allowed.data["recently_attended"]],
            [second.pk, first.pk],
        )

        preset.permissions = []
        preset.save(update_fields=["permissions"])
        denied = self.client.get(self.url)
        self.assertEqual(denied.status_code, 403)

        self.client.force_authenticate(user=None)
        unauthenticated = self.client.get(self.url)
        self.assertEqual(unauthenticated.status_code, 401)


class ConsultationApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="admin-consultations@dentalclinic.com",
            password="ContraseñaAdmin123!",
            role=User.Role.ADMINISTRADOR,
        )
        self.dentist = User.objects.create_user(
            email="dentist-consultations@dentalclinic.com",
            password="ContraseñaDentist123!",
            role=User.Role.ODONTOLOGO,
            first_name="Elena",
            last_name="Rivera",
        )
        self.receptionist = User.objects.create_user(
            email="reception-consultations@dentalclinic.com",
            password="ContraseñaRecepcion123!",
            role=User.Role.RECEPCIONISTA,
        )
        patient_model = apps.get_model("patients", "Patient")
        self.patient = patient_model.objects.create(
            first_name="María",
            last_name="García",
            birth_place="Managua",
            identification_type=Patient.IdentificationType.CEDULA,
            identification_number="001-160498-0001A",
            phone="+505 8888 1111",
            gender="FEMENINO",
            date_of_birth="1998-04-16",
            registered_by=self.admin,
        )
        self.other_patient = patient_model.objects.create(
            first_name="Juan",
            last_name="Pérez",
            birth_place="León",
            identification_type=Patient.IdentificationType.CEDULA,
            identification_number="001-010190-0002B",
            phone="+505 8888 2222",
            gender="MASCULINO",
            date_of_birth="1990-01-01",
            registered_by=self.admin,
        )
        self.list_url = f"/api/patients/{self.patient.pk}/consultations/"

    def payload(self, **overrides):
        data = {
            "date": "2026-08-08",
            "time": "09:30:00",
            "consultation_type": "GENERAL",
            "summary": "Valoración clínica integral.",
            "status": "EN_PROGRESO",
            "examiner_national_id": "001-010180-0003C",
            "dental_service": "Valoración odontológica",
            "chief_complaint": "Dolor en molar inferior derecho.",
            "respiratory": True,
            "cardiovascular": True,
            "hepatic_renal": True,
            "gastrointestinal": True,
            "neurological": True,
            "blood_system": True,
            "reproductive_organs": True,
            "heart_rate": 72,
            "respiratory_rate": 16,
            "blood_pressure": "118/76",
            "temperature": "36.6",
            "weight": "68.40",
            "height": "1.65",
            "body_surface_area": "1.76",
            "bmi": "25.12",
            "general_appearance": "Consciente y orientada.",
            "skin_and_mucosa": "Normocoloreadas.",
            "dental_diagnoses": "Pulpitis irreversible en pieza 46.",
            "treatment_plan": "Tratamiento endodóntico y corona.",
            "budget": "C$ 10,500.",
        }
        data.update(overrides)
        return data

    def create_consultation(self, **overrides):
        self.client.force_authenticate(self.dentist)
        return self.client.post(self.list_url, self.payload(**overrides), format="json")

    def test_compact_consultation_options_are_patient_scoped_and_minimal(self):
        first = Consultation.objects.create(
            patient=self.patient,
            professional=self.dentist,
            date="2026-08-08",
            time="09:00:00",
            consultation_type=Consultation.Type.GENERAL,
            summary="Privado uno",
            status=Consultation.Status.COMPLETED,
        )
        second = Consultation.objects.create(
            patient=self.patient,
            professional=self.dentist,
            date="2026-09-01",
            time="10:00:00",
            consultation_type=Consultation.Type.FOLLOW_UP,
            summary="Privado dos",
            status=Consultation.Status.COMPLETED,
        )
        Consultation.objects.create(
            patient=self.other_patient,
            professional=self.dentist,
            date="2026-09-02",
            time="11:00:00",
            consultation_type=Consultation.Type.GENERAL,
            summary="Paciente ajeno",
            status=Consultation.Status.COMPLETED,
        )
        self.client.force_authenticate(self.dentist)

        response = self.client.get(
            self.list_url,
            {"compact": "true", "page_size": 100},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(
            response.data["results"],
            [
                {"id": second.pk, "date": "2026-09-01"},
                {"id": first.pk, "date": "2026-08-08"},
            ],
        )
        self.assertEqual(set(response.data["results"][0]), {"id", "date"})

    def test_system_checks_persist_as_booleans_when_created_and_updated(self):
        checks = {
            "respiratory": True,
            "cardiovascular": False,
            "hepatic_renal": True,
            "gastrointestinal": False,
            "neurological": True,
            "blood_system": False,
            "reproductive_organs": True,
        }
        created = self.create_consultation(**checks)
        self.assertEqual(created.status_code, 201)
        consultation = Consultation.objects.get(pk=created.data["id"])
        for field, expected in checks.items():
            with self.subTest(field=field):
                self.assertIs(getattr(consultation, field), expected)
                self.assertIs(created.data[field], expected)

        updated_checks = {field: not checked for field, checked in checks.items()}
        detail_url = f"{self.list_url}{consultation.pk}/"
        updated = self.client.patch(detail_url, updated_checks, format="json")
        self.assertEqual(updated.status_code, 200)
        retrieved = self.client.get(detail_url)
        self.assertEqual(retrieved.status_code, 200)
        consultation.refresh_from_db()
        for field, expected in updated_checks.items():
            with self.subTest(field=field):
                self.assertIs(getattr(consultation, field), expected)
                self.assertIs(retrieved.data[field], expected)

    def test_system_checks_reject_narrative_text(self):
        checks = {
            "respiratory": False, "cardiovascular": False, "hepatic_renal": False,
            "gastrointestinal": False, "neurological": False, "blood_system": False,
            "reproductive_organs": False,
        }
        for field in checks:
            with self.subTest(field=field):
                response = self.create_consultation(**{**checks, field: "Sin alteraciones."})
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data)

    def test_creates_complete_consultation_and_assigns_authenticated_professional(self):
        self.client.force_authenticate(self.dentist)
        profile = self.client.patch(
            "/api/auth/me/",
            {
                "specialty": "Implantología",
                "professional_registration_number": "9669",
                "phone": "+505 8888 4321",
            },
            format="json",
        )
        self.assertEqual(profile.status_code, 200)
        self.dentist.refresh_from_db()
        response = self.create_consultation(
            professional=self.admin.pk,
            patient=self.other_patient.pk,
            professional_phone="000",
            professional_specialty="Falso",
            professional_registration_number="Falso",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["patient"], self.patient.pk)
        self.assertEqual(response.data["professional"], self.dentist.pk)
        self.assertEqual(response.data["professional_name"], "Elena Rivera")
        self.assertEqual(response.data["professional_specialty"], "Implantología")
        self.assertEqual(response.data["professional_registration_number"], "9669")
        self.assertEqual(response.data["professional_phone"], "+505 8888 4321")
        self.assertEqual(response.data["time"], "09:30:00")
        self.assertEqual(response.data["chief_complaint"], "Dolor en molar inferior derecho.")
        self.assertNotIn("present_illness_history", response.data)
        self.assertNotIn("observations_analysis", response.data)
        self.assertNotIn("treatment_performed", response.data)
        self.assertNotIn("inss_number", response.data)
        self.assertNotIn("cema_number", response.data)
        self.assertIs(response.data["cardiovascular"], True)
        self.assertEqual(response.data["heart_rate"], 72)
        self.assertEqual(response.data["blood_pressure"], "118/76")
        for field in (
            "thorax", "rib_cage", "breasts", "lung_fields", "cardiac",
            "abdomen_pelvis", "rectal_exam", "musculoskeletal", "upper_extremities",
            "lower_extremities", "genitourinary", "gynecological_exam", "neurological_exam",
        ):
            with self.subTest(removed_field=field):
                self.assertNotIn(field, response.data)
        self.assertEqual(response.data["general_appearance"], "Consciente y orientada.")
        self.assertEqual(response.data["skin_and_mucosa"], "Normocoloreadas.")
        self.assertEqual(response.data["treatment_plan"], "Tratamiento endodóntico y corona.")
        self.assertFalse(
            Appointment.objects.filter(consultation_id=response.data["id"]).exists()
        )

    def test_new_consultation_must_start_in_progress(self):
        response = self.create_consultation(status="COMPLETADA")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Consultation.objects.count(), 0)

    def test_rejects_each_required_consultation_metadata_field(self):
        self.client.force_authenticate(self.dentist)

        for field in ("date", "time", "consultation_type", "summary", "status"):
            with self.subTest(field=field):
                payload = self.payload()
                payload.pop(field)
                response = self.client.post(self.list_url, payload, format="json")
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data)

    def test_retrieves_and_updates_in_progress_consultation_with_edit_permission(self):
        created = self.create_consultation()
        detail_url = f"{self.list_url}{created.data['id']}/"

        response = self.client.patch(
            detail_url,
            {
                "summary": "Control completado y actualizado.",
                "dental_diagnoses": "Diagnóstico actualizado.",
                "professional": self.admin.pk,
                "patient": self.other_patient.pk,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["summary"], "Control completado y actualizado.")
        self.assertEqual(response.data["dental_diagnoses"], "Diagnóstico actualizado.")
        self.assertEqual(response.data["professional"], self.dentist.pk)
        self.assertEqual(response.data["patient"], self.patient.pk)

    def test_generic_patch_rejects_status_transitions(self):
        created = self.create_consultation()
        detail_url = f"{self.list_url}{created.data['id']}/"

        for status in ("COMPLETADA", "CANCELADA"):
            with self.subTest(status=status):
                response = self.client.patch(detail_url, {"status": status}, format="json")
                self.assertEqual(response.status_code, 400)

        consultation = Consultation.objects.get(pk=created.data["id"])
        self.assertEqual(consultation.status, Consultation.Status.IN_PROGRESS)

    def test_complete_manual_consultation_is_idempotent_and_makes_it_immutable(self):
        created = self.create_consultation()
        detail_url = f"{self.list_url}{created.data['id']}/"
        complete_url = f"{detail_url}complete/"

        first = self.client.post(complete_url, format="json")

        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.data["consultation"]["status"], "COMPLETADA")
        self.assertEqual(first.data["consultation"]["completed_by"], self.dentist.pk)
        self.assertIsNotNone(first.data["consultation"]["completed_at"])
        self.assertIsNone(first.data["appointment"])
        completed_at = first.data["consultation"]["completed_at"]

        repeated = self.client.post(complete_url, format="json")
        self.assertEqual(repeated.status_code, 200)
        self.assertEqual(repeated.data["consultation"]["completed_at"], completed_at)
        self.assertEqual(repeated.data["consultation"]["completed_by"], self.dentist.pk)
        self.assertEqual(Appointment.objects.count(), 0)

        blocked_content = self.client.patch(
            detail_url,
            {"summary": "No debe cambiar"},
            format="json",
        )
        blocked_status = self.client.patch(
            detail_url,
            {"status": "EN_PROGRESO"},
            format="json",
        )
        read = self.client.get(detail_url)
        self.assertEqual(blocked_content.status_code, 400)
        self.assertEqual(blocked_status.status_code, 400)
        self.assertEqual(read.status_code, 200)
        self.assertEqual(read.data["summary"], "Valoración clínica integral.")

    def test_complete_linked_consultation_completes_appointment_atomically(self):
        appointment = Appointment.objects.create(
            patient=self.patient,
            dentist=self.dentist,
            date="2026-08-08",
            start_time="09:30:00",
            duration_minutes=60,
            reason="Cierre vinculado",
            status=Appointment.Status.SCHEDULED,
            created_by=self.admin,
        )
        self.client.force_authenticate(self.admin)
        started = self.client.post(
            f"/api/appointments/{appointment.pk}/start-attendance/",
            format="json",
        )
        consultation_id = started.data["consultation"]["id"]

        response = self.client.post(
            f"{self.list_url}{consultation_id}/complete/",
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["consultation"]["status"], "COMPLETADA")
        self.assertEqual(response.data["appointment"]["id"], appointment.pk)
        self.assertEqual(response.data["appointment"]["status"], "COMPLETADA")
        appointment.refresh_from_db()
        self.assertEqual(appointment.status, Appointment.Status.COMPLETED)

    def test_complete_requires_edit_permission_and_valid_linked_state(self):
        created = self.create_consultation()
        complete_url = f"{self.list_url}{created.data['id']}/complete/"
        receptionist_preset = RolePermissionPreset.objects.get(
            role=User.Role.RECEPCIONISTA
        )
        receptionist_preset.permissions = ["consultations.view"]
        receptionist_preset.save(update_fields=["permissions"])
        self.client.force_authenticate(self.receptionist)

        denied = self.client.post(complete_url, format="json")

        self.assertEqual(denied.status_code, 403)
        self.assertEqual(
            Consultation.objects.get(pk=created.data["id"]).status,
            Consultation.Status.IN_PROGRESS,
        )

    def test_complete_reuses_only_the_existing_required_clinical_contract(self):
        consultation = Consultation.objects.create(
            patient=self.patient,
            professional=self.dentist,
            date="2026-08-08",
            time=None,
            consultation_type=Consultation.Type.GENERAL,
            summary="Resumen existente",
            status=Consultation.Status.IN_PROGRESS,
        )
        self.client.force_authenticate(self.dentist)

        response = self.client.post(
            f"{self.list_url}{consultation.pk}/complete/",
            format="json",
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "consultation_missing_required_data")
        consultation.refresh_from_db()
        self.assertEqual(consultation.status, Consultation.Status.IN_PROGRESS)

    def test_linked_cancelled_or_no_show_appointment_cannot_complete_consultation(self):
        self.client.force_authenticate(self.dentist)
        for offset, appointment_status in enumerate((
            Appointment.Status.CANCELLED,
            Appointment.Status.NO_SHOW,
        )):
            with self.subTest(status=appointment_status):
                consultation = Consultation.objects.create(
                    patient=self.patient,
                    professional=self.dentist,
                    date=f"2026-08-{20 + offset}",
                    time="09:30:00",
                    consultation_type=Consultation.Type.GENERAL,
                    summary="Estado de cita no clínico",
                    status=Consultation.Status.IN_PROGRESS,
                )
                appointment = Appointment.objects.create(
                    patient=self.patient,
                    dentist=self.dentist,
                    date=f"2026-08-{20 + offset}",
                    start_time="09:30:00",
                    duration_minutes=60,
                    reason="Estado no clínico",
                    status=appointment_status,
                    consultation=consultation,
                    created_by=self.admin,
                )

                response = self.client.post(
                    f"{self.list_url}{consultation.pk}/complete/",
                    format="json",
                )

                self.assertEqual(response.status_code, 409)
                self.assertEqual(
                    response.data["code"],
                    "appointment_cannot_be_completed_from_consultation",
                )
                appointment.refresh_from_db()
                consultation.refresh_from_db()
                self.assertEqual(appointment.status, appointment_status)
                self.assertEqual(consultation.status, Consultation.Status.IN_PROGRESS)

    def test_complete_rolls_back_when_linked_appointment_save_fails(self):
        appointment = Appointment.objects.create(
            patient=self.patient,
            dentist=self.dentist,
            date="2026-08-09",
            start_time="09:30:00",
            duration_minutes=60,
            reason="Rollback de cierre",
            status=Appointment.Status.SCHEDULED,
            created_by=self.admin,
        )
        self.client.force_authenticate(self.admin)
        started = self.client.post(
            f"/api/appointments/{appointment.pk}/start-attendance/",
            format="json",
        )
        consultation_id = started.data["consultation"]["id"]

        with patch.object(Appointment, "save", side_effect=RuntimeError("synthetic sync failure")):
            with self.assertRaisesRegex(RuntimeError, "synthetic sync failure"):
                self.client.post(
                    f"{self.list_url}{consultation_id}/complete/",
                    format="json",
                )

        consultation = Consultation.objects.get(pk=consultation_id)
        appointment.refresh_from_db()
        self.assertEqual(consultation.status, Consultation.Status.IN_PROGRESS)
        self.assertIsNone(consultation.completed_at)
        self.assertIsNone(consultation.completed_by_id)
        self.assertEqual(appointment.status, Appointment.Status.IN_ATTENDANCE)

    def test_cancel_manual_consultation_is_safe_and_linked_consultation_is_rejected(self):
        manual = self.create_consultation()
        manual_url = f"{self.list_url}{manual.data['id']}/cancel/"

        cancelled = self.client.post(manual_url, format="json")

        self.assertEqual(cancelled.status_code, 200)
        self.assertEqual(cancelled.data["consultation"]["status"], "CANCELADA")
        self.assertIsNone(cancelled.data["appointment"])
        repeated = self.client.post(manual_url, format="json")
        self.assertEqual(repeated.status_code, 200)

        appointment = Appointment.objects.create(
            patient=self.patient,
            dentist=self.dentist,
            date="2026-08-10",
            start_time="09:30:00",
            duration_minutes=60,
            reason="Cancelación vinculada",
            status=Appointment.Status.SCHEDULED,
            created_by=self.admin,
        )
        self.client.force_authenticate(self.admin)
        started = self.client.post(
            f"/api/appointments/{appointment.pk}/start-attendance/",
            format="json",
        )
        linked_id = started.data["consultation"]["id"]
        linked = self.client.post(
            f"{self.list_url}{linked_id}/cancel/",
            format="json",
        )
        self.assertEqual(linked.status_code, 409)
        self.assertEqual(linked.data["code"], "consultation_linked_cancellation_unsupported")
        appointment.refresh_from_db()
        self.assertEqual(appointment.status, Appointment.Status.IN_ATTENDANCE)
        self.assertEqual(
            Consultation.objects.get(pk=linked_id).status,
            Consultation.Status.IN_PROGRESS,
        )

    def test_completed_consultation_cannot_be_cancelled(self):
        created = self.create_consultation()
        detail_url = f"{self.list_url}{created.data['id']}/"
        self.client.post(f"{detail_url}complete/", format="json")

        response = self.client.post(f"{detail_url}cancel/", format="json")

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "consultation_cannot_be_cancelled")

    def test_detail_is_scoped_to_patient_and_delete_is_not_allowed(self):
        created = self.create_consultation()
        wrong_patient_url = (
            f"/api/patients/{self.other_patient.pk}/consultations/{created.data['id']}/"
        )
        own_detail_url = f"{self.list_url}{created.data['id']}/"

        self.assertEqual(self.client.get(wrong_patient_url).status_code, 404)
        self.assertEqual(self.client.patch(wrong_patient_url, {"summary": "No"}).status_code, 404)
        self.assertEqual(self.client.delete(own_detail_url).status_code, 405)

    def test_consultation_capabilities_are_independent(self):
        receptionist_preset = RolePermissionPreset.objects.get(
            role=User.Role.RECEPCIONISTA
        )
        receptionist_preset.permissions = ["consultations.view"]
        receptionist_preset.save(update_fields=["permissions"])
        self.client.force_authenticate(self.receptionist)

        self.assertEqual(self.client.get(self.list_url).status_code, 200)
        self.assertEqual(
            self.client.post(self.list_url, self.payload(), format="json").status_code,
            403,
        )

        created = self.create_consultation()
        dentist_preset = RolePermissionPreset.objects.get(role=User.Role.ODONTOLOGO)
        dentist_preset.permissions = ["consultations.view"]
        dentist_preset.save(update_fields=["permissions"])
        detail_url = f"{self.list_url}{created.data['id']}/"
        self.assertEqual(self.client.get(detail_url).status_code, 200)
        self.assertEqual(
            self.client.patch(detail_url, {"summary": "Sin permiso"}, format="json").status_code,
            403,
        )
