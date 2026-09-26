from apps.common.test_utils import assigned_test_consultation
from datetime import date, time

from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase

from apps.users.models import RolePermissionPreset, User

from .models import Consultation, Patient, TreatmentItem


class PlannedOdontogramOverlayApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="admin-planned-overlay@example.test",
            password="SyntheticOnly123!",
            role=User.Role.ADMINISTRADOR,
        )
        self.dentist = User.objects.create_user(
            email="dentist-planned-overlay@example.test",
            password="SyntheticOnly123!",
            role=User.Role.ODONTOLOGO,
        )
        self.receptionist = User.objects.create_user(
            email="reception-planned-overlay@example.test",
            password="SyntheticOnly123!",
            role=User.Role.RECEPCIONISTA,
        )
        self.patient = self.create_patient("1")
        self.other_patient = self.create_patient("2")
        self.origin = self.create_consultation(self.patient, date(2026, 8, 20))
        self.earlier_origin = self.create_consultation(
            self.patient,
            date(2026, 8, 10),
        )
        self.other_origin = self.create_consultation(
            self.other_patient,
            date(2026, 8, 15),
        )
        self.url = f"/api/patients/{self.patient.pk}/odontogram/planned-overlay/"
        self.client.force_authenticate(self.dentist)

    def create_patient(self, suffix):
        return Patient.objects.create(
            first_name="Paciente",
            last_name=f"Overlay {suffix}",
            birth_place="Managua",
            identification_type=Patient.IdentificationType.CEDULA,
            identification_number=f"001-010190-93{int(suffix):02d}A",
            gender=Patient.Gender.OTRO,
            date_of_birth=date(1990, 1, 1),
            registered_by=self.admin,
        )

    def create_consultation(self, patient, consultation_date):
        return assigned_test_consultation(
            patient=patient,
            professional=self.dentist,
            professional_name_snapshot="Odontóloga overlay",
            date=consultation_date,
            time=time(9, 0),
            consultation_type=Consultation.Type.GENERAL,
            summary="Consulta overlay mínima.",
            status=Consultation.Status.IN_PROGRESS,
        )

    def create_item(self, *, origin=None, **overrides):
        values = {
            "proposed_in": origin or self.origin,
            "description": "Restauración planificada",
            "tooth_code": "16",
            "surfaces": ["OCCLUSAL"],
            "planned_finding": "RESTORATION",
            "status": TreatmentItem.Status.PROPOSED,
        }
        values.update(overrides)
        return TreatmentItem.objects.create(**values)

    def test_returns_only_pending_dental_items_with_a_minimal_stable_contract(self):
        accepted = self.create_item(
            origin=self.earlier_origin,
            status=TreatmentItem.Status.ACCEPTED,
            description="Sellante aceptado",
            surfaces=["BUCCAL"],
            planned_finding="SEALANT",
        )
        proposed = self.create_item()
        self.create_item(status=TreatmentItem.Status.PERFORMED)
        self.create_item(status=TreatmentItem.Status.CANCELLED)
        self.create_item(tooth_code=None, surfaces=[], planned_finding="")
        self.create_item(origin=self.other_origin)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [row["treatment_item_id"] for row in response.data],
            [accepted.pk, proposed.pk],
        )
        self.assertEqual(
            response.data[0],
            {
                "treatment_item_id": accepted.pk,
                "status": TreatmentItem.Status.ACCEPTED,
                "status_display": "Aceptado",
                "tooth_code": "16",
                "surfaces": ["BUCCAL"],
                "planned_finding": "SEALANT",
                "description": "Sellante aceptado",
                "proposed_in": {
                    "id": self.earlier_origin.pk,
                    "date": "2026-08-10",
                },
            },
        )

    def test_keeps_every_item_when_multiple_plans_share_tooth_surface_and_finding(self):
        first = self.create_item(description="Primera restauración")
        second = self.create_item(description="Segunda restauración")

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [row["treatment_item_id"] for row in response.data],
            [first.pk, second.pk],
        )
        self.assertEqual(
            [row["description"] for row in response.data],
            ["Primera restauración", "Segunda restauración"],
        )

    def test_requires_clinical_read_permission_and_existing_patient_scope(self):
        preset = RolePermissionPreset.objects.get(role=User.Role.RECEPCIONISTA)
        preset.permissions = ["appointments.view"]
        preset.save(update_fields=("permissions",))
        self.client.force_authenticate(self.receptionist)

        denied = self.client.get(self.url)

        self.assertEqual(denied.status_code, 403)
        preset.permissions = ["consultations.view"]
        preset.save(update_fields=("permissions",))
        self.assertEqual(self.client.get(self.url).status_code, 200)
        self.assertEqual(
            self.client.get(
                "/api/patients/999999/odontogram/planned-overlay/"
            ).status_code,
            404,
        )

    def test_query_count_is_constant_and_avoids_unrelated_clinical_tables(self):
        self.create_item()

        with CaptureQueriesContext(connection) as one_context:
            one = self.client.get(self.url)
        for index in range(7):
            origin = self.create_consultation(
                self.patient,
                date(2026, 7, index + 1),
            )
            self.create_item(origin=origin, description=f"Plan {index}")
        with CaptureQueriesContext(connection) as many_context:
            many = self.client.get(self.url)

        self.assertEqual(one.status_code, 200)
        self.assertEqual(many.status_code, 200)
        self.assertEqual(len(one_context), len(many_context))
        sql = " ".join(query["sql"].lower() for query in many_context.captured_queries)
        self.assertNotIn("patients_odontogramversion", sql)
        self.assertNotIn("patients_patientdocument", sql)
        self.assertNotIn("patients_consultationalert", sql)
