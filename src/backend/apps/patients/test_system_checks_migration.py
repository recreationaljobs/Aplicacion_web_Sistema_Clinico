from django.contrib.auth import get_user_model
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase


class SystemChecksMigrationTests(TransactionTestCase):
    before = [("patients", "0018_document_retirement")]
    after = [("patients", "0019_consultation_system_checks")]

    def migrate(self, targets):
        executor = MigrationExecutor(connection)
        executor.migrate(targets)
        return executor.loader.project_state(targets).apps

    def test_existing_marks_and_empty_fields_convert_to_booleans_and_back(self):
        self.addCleanup(self.migrate, MigrationExecutor(connection).loader.graph.leaf_nodes())
        old_apps = self.migrate(self.before)
        user = get_user_model().objects.create_user(
            email="checks-migration@example.com", role="ODONTOLOGO",
        )
        patient = old_apps.get_model("patients", "Patient").objects.create(
            first_name="Paciente", last_name="Migración", registered_by_id=user.pk,
            date_of_birth="1990-01-01", gender="MASCULINO", code="PAC-00001",
        )
        original = old_apps.get_model("patients", "Consultation").objects.create(
            patient_id=patient.pk, professional_id=user.pk, date="2026-09-16",
            consultation_type="GENERAL", summary="Prueba de migración",
            respiratory="✓", cardiovascular="", hepatic_renal="Nota anterior",
            gastrointestinal="", neurological="✓", blood_system="",
            reproductive_organs="Texto previo",
        )

        new_apps = self.migrate(self.after)
        migrated = new_apps.get_model("patients", "Consultation").objects.get(pk=original.pk)
        expected_checks = {
            "respiratory": True, "cardiovascular": False, "hepatic_renal": True,
            "gastrointestinal": False, "neurological": True, "blood_system": False,
            "reproductive_organs": True,
        }
        for field, expected in expected_checks.items():
            with self.subTest(field=field):
                self.assertIs(getattr(migrated, field), expected)
        self.assertEqual(migrated.summary, "Prueba de migración")

        reversed_apps = self.migrate(self.before)
        reversed_row = reversed_apps.get_model("patients", "Consultation").objects.get(pk=original.pk)
        for field, checked in expected_checks.items():
            with self.subTest(reverse_field=field):
                self.assertEqual(getattr(reversed_row, field), "✓" if checked else "")
