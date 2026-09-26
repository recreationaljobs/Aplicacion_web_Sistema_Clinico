from apps.common.test_utils import assigned_test_consultation
from datetime import date, datetime, time, timezone as datetime_timezone

from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase

from apps.clinics.models import ClinicService, ServiceCategory
from apps.users.models import RolePermissionPreset, User

from .models import Consultation, Patient, TreatmentItem


class LongitudinalTreatmentPlanApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="admin-longitudinal-plan@example.test",
            password="SyntheticOnly123!",
            role=User.Role.ADMINISTRADOR,
        )
        self.dentist = User.objects.create_user(
            email="dentist-longitudinal-plan@example.test",
            password="SyntheticOnly123!",
            role=User.Role.ODONTOLOGO,
        )
        self.receptionist = User.objects.create_user(
            email="reception-longitudinal-plan@example.test",
            password="SyntheticOnly123!",
            role=User.Role.RECEPCIONISTA,
        )
        self.patient = self.create_patient("1")
        self.other_patient = self.create_patient("2")
        self.origin = self.create_consultation(self.patient, date(2026, 8, 20))
        self.execution = self.create_consultation(self.patient, date(2026, 8, 31))
        self.other_origin = self.create_consultation(self.other_patient, date(2026, 8, 21))
        category = ServiceCategory.objects.create(name="Restauraciones longitudinales")
        self.inactive_service = ClinicService.objects.create(
            category=category,
            name="Nombre actual archivado",
            duration_minutes=60,
            price="9999.00",
            is_active=False,
        )
        self.url = f"/api/patients/{self.patient.pk}/treatment-items/"
        self.client.force_authenticate(self.dentist)

    def create_patient(self, suffix):
        return Patient.objects.create(
            first_name="Paciente",
            last_name=f"Longitudinal {suffix}",
            birth_place="Managua",
            identification_type=Patient.IdentificationType.CEDULA,
            identification_number=f"001-010190-92{int(suffix):02d}A",
            gender=Patient.Gender.OTRO,
            date_of_birth=date(1990, 1, 1),
            registered_by=self.admin,
        )

    def create_consultation(self, patient, consultation_date):
        return assigned_test_consultation(
            patient=patient,
            professional=self.dentist,
            professional_name_snapshot="Odontóloga longitudinal",
            date=consultation_date,
            time=time(9, 0),
            consultation_type=Consultation.Type.GENERAL,
            summary="Consulta longitudinal mínima.",
            status=Consultation.Status.IN_PROGRESS,
        )

    def create_item(self, status, *, origin=None, **overrides):
        defaults = {
            "proposed_in": origin or self.origin,
            "description": f"Snapshot {status}",
            "diagnosis_text": "Diagnóstico snapshot",
            "tooth_code": "16",
            "surfaces": ["OCCLUSAL"],
            "planned_finding": "RESTORATION",
            "status": status,
            "unit_price_snapshot": "850.00",
            "notes": "Nota estructurada",
        }
        defaults.update(overrides)
        return TreatmentItem.objects.create(**defaults)

    def results(self, response):
        return response.data["results"]

    def test_returns_only_patient_items_with_minimal_consultation_context_and_snapshots(self):
        proposed = self.create_item(
            TreatmentItem.Status.PROPOSED,
            service=self.inactive_service,
            description="Restauración histórica",
            unit_price_snapshot="850.00",
        )
        performed_at = datetime(2026, 8, 31, 15, 30, tzinfo=datetime_timezone.utc)
        performed = self.create_item(
            TreatmentItem.Status.PERFORMED,
            performed_in=self.execution,
            performed_at=performed_at,
        )
        cancelled = self.create_item(
            TreatmentItem.Status.CANCELLED,
            status_reason="Paciente decidió posponer.",
        )
        self.create_item(TreatmentItem.Status.ACCEPTED, origin=self.other_origin)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        payload = {item["id"]: item for item in self.results(response)}
        self.assertEqual(set(payload), {proposed.pk, performed.pk, cancelled.pk})
        self.assertEqual(
            payload[proposed.pk]["proposed_in"],
            {"id": self.origin.pk, "date": "2026-08-20"},
        )
        self.assertIsNone(payload[proposed.pk]["performed_in"])
        self.assertEqual(payload[proposed.pk]["description"], "Restauración histórica")
        self.assertEqual(payload[proposed.pk]["unit_price_snapshot"], "850.00")
        self.assertEqual(payload[proposed.pk]["tooth_code"], "16")
        self.assertEqual(payload[proposed.pk]["surfaces"], ["OCCLUSAL"])
        self.assertEqual(payload[proposed.pk]["service"]["id"], self.inactive_service.pk)
        self.assertEqual(payload[proposed.pk]["service"]["duration_minutes"], 60)
        self.assertFalse(payload[proposed.pk]["service"]["is_active"])
        self.assertNotIn("clinical_record", payload[proposed.pk])
        self.assertNotIn("odontogram", payload[proposed.pk])
        self.assertNotIn("documents", payload[proposed.pk])
        self.assertEqual(
            payload[performed.pk]["performed_in"],
            {"id": self.execution.pk, "date": "2026-08-31"},
        )
        self.assertEqual(payload[performed.pk]["performed_at"], "2026-08-31T15:30:00Z")
        self.assertEqual(
            payload[cancelled.pk]["status_reason"],
            "Paciente decidió posponer.",
        )

    def test_supports_every_status_and_pending_history_scopes(self):
        items = {
            status: self.create_item(status)
            for status in TreatmentItem.Status.values
        }

        for status, item in items.items():
            with self.subTest(status=status):
                response = self.client.get(self.url, {"status": status})
                self.assertEqual(response.status_code, 200)
                self.assertEqual([row["id"] for row in self.results(response)], [item.pk])

        pending = self.client.get(self.url, {"scope": "pending"})
        history = self.client.get(self.url, {"scope": "history"})

        self.assertEqual(pending.status_code, 200)
        self.assertEqual(history.status_code, 200)
        self.assertEqual(
            {row["status"] for row in self.results(pending)},
            {TreatmentItem.Status.PROPOSED, TreatmentItem.Status.ACCEPTED},
        )
        self.assertEqual(
            {row["status"] for row in self.results(history)},
            {TreatmentItem.Status.PERFORMED, TreatmentItem.Status.CANCELLED},
        )

    def test_rejects_invalid_or_ambiguous_filters(self):
        invalid_status = self.client.get(self.url, {"status": "PENDIENTE"})
        invalid_scope = self.client.get(self.url, {"scope": "all"})
        ambiguous = self.client.get(
            self.url,
            {"status": TreatmentItem.Status.PROPOSED, "scope": "pending"},
        )

        self.assertEqual(invalid_status.status_code, 400)
        self.assertIn("status", invalid_status.data)
        self.assertEqual(invalid_scope.status_code, 400)
        self.assertIn("scope", invalid_scope.data)
        self.assertEqual(ambiguous.status_code, 400)
        self.assertIn("detail", ambiguous.data)

    def test_pending_and_history_have_explicit_stable_order(self):
        early_origin = self.create_consultation(self.patient, date(2026, 8, 1))
        accepted_late = self.create_item(TreatmentItem.Status.ACCEPTED)
        accepted_early = self.create_item(
            TreatmentItem.Status.ACCEPTED,
            origin=early_origin,
        )
        proposed = self.create_item(
            TreatmentItem.Status.PROPOSED,
            origin=early_origin,
        )
        performed_old = self.create_item(
            TreatmentItem.Status.PERFORMED,
            performed_in=self.execution,
            performed_at=datetime(2026, 8, 5, 12, tzinfo=datetime_timezone.utc),
        )
        performed_recent = self.create_item(
            TreatmentItem.Status.PERFORMED,
            performed_in=self.execution,
            performed_at=datetime(2026, 8, 30, 12, tzinfo=datetime_timezone.utc),
        )

        pending = self.client.get(self.url, {"scope": "pending"})
        history = self.client.get(self.url, {"scope": "history"})

        self.assertEqual(pending.status_code, 200)
        self.assertEqual(history.status_code, 200)
        self.assertEqual(
            [row["id"] for row in self.results(pending)],
            [accepted_early.pk, accepted_late.pk, proposed.pk],
        )
        self.assertEqual(
            [row["id"] for row in self.results(history)],
            [performed_recent.pk, performed_old.pk],
        )

    @override_settings(REST_FRAMEWORK={"PAGE_SIZE": 25})
    def test_uses_standard_pagination(self):
        for index in range(3):
            self.create_item(
                TreatmentItem.Status.PROPOSED,
                description=f"Procedimiento {index}",
            )

        first = self.client.get(self.url, {"scope": "pending", "page_size": 2})
        second = self.client.get(
            self.url,
            {"scope": "pending", "page_size": 2, "page": 2},
        )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.data["count"], 3)
        self.assertEqual(len(first.data["results"]), 2)
        self.assertIsNotNone(first.data["next"])
        self.assertEqual(len(second.data["results"]), 1)

    def test_requires_clinical_read_permission_and_existing_patient_scope(self):
        preset = RolePermissionPreset.objects.get(role=User.Role.RECEPCIONISTA)
        preset.permissions = ["appointments.view", "appointments.edit"]
        preset.save(update_fields=("permissions",))
        self.client.force_authenticate(self.receptionist)

        denied = self.client.get(self.url)

        self.assertEqual(denied.status_code, 403)
        preset.permissions = ["consultations.view"]
        preset.save(update_fields=("permissions",))
        self.assertEqual(self.client.get(self.url).status_code, 200)
        self.assertEqual(
            self.client.get("/api/patients/999999/treatment-items/").status_code,
            404,
        )

    def test_query_count_is_constant_and_does_not_load_unrelated_clinical_tables(self):
        self.client.force_authenticate(self.admin)
        self.create_item(TreatmentItem.Status.ACCEPTED)

        with CaptureQueriesContext(connection) as one_context:
            one = self.client.get(self.url, {"scope": "pending"})
        for index in range(7):
            extra_origin = self.create_consultation(
                self.patient,
                date(2026, 7, index + 1),
            )
            self.create_item(TreatmentItem.Status.PROPOSED, origin=extra_origin)
        with CaptureQueriesContext(connection) as many_context:
            many = self.client.get(self.url, {"scope": "pending"})

        self.assertEqual(one.status_code, 200)
        self.assertEqual(many.status_code, 200)
        self.assertEqual(len(one_context), len(many_context))
        combined_sql = " ".join(query["sql"].lower() for query in many_context)
        self.assertNotIn("patients_clinicalrecord", combined_sql)
        self.assertNotIn("patients_odontogramversion", combined_sql)
        self.assertNotIn("patients_patientdocument", combined_sql)
