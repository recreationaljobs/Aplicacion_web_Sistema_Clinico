from django.contrib.auth import get_user_model
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

from apps.common.test_utils import MigrationTestCase


class IllnessHistoryMigrationTests(MigrationTestCase):
    before = [('patients', '0020_remove_unused_examination_fields')]
    after = [('patients', '0021_move_illness_history_to_clinical_record')]

    def migrate(self, targets):
        executor = MigrationExecutor(connection)
        executor.migrate(targets)
        return executor.loader.project_state(targets).apps

    def test_latest_nonempty_history_moves_without_overwriting_existing_summary(self):
        apps = self.migrate(self.before)
        user = get_user_model().objects.create_user(email='history-migration@example.com')
        Patient = apps.get_model('patients', 'Patient')
        Record = apps.get_model('patients', 'ClinicalRecord')
        Consultation = apps.get_model('patients', 'Consultation')
        patients = [Patient.objects.create(
            first_name='Paciente', last_name=str(index), code=f'PAC-{index:05}',
            registered_by_id=user.pk, date_of_birth='1990-01-01', gender='MASCULINO',
        ) for index in range(1, 4)]
        Record.objects.create(patient=patients[0], allergies='Penicilina')
        Record.objects.create(patient=patients[1], present_illness_history='Resumen existente')
        for patient in patients:
            for day, history in [(1, 'Historia anterior'), (2, 'Historia reciente'), (3, '   ')]:
                Consultation.objects.create(
                    patient=patient, professional_id=user.pk, date=f'2026-09-{day:02}',
                    consultation_type='GENERAL', summary='Consulta de prueba',
                    present_illness_history=history,
                )

        apps = self.migrate(self.after)
        Record = apps.get_model('patients', 'ClinicalRecord')
        self.assertEqual(Record.objects.get(patient_id=patients[0].pk).present_illness_history, 'Historia reciente')
        self.assertEqual(Record.objects.get(patient_id=patients[0].pk).allergies, 'Penicilina')
        self.assertEqual(Record.objects.get(patient_id=patients[1].pk).present_illness_history, 'Resumen existente')
        self.assertEqual(Record.objects.get(patient_id=patients[2].pk).present_illness_history, 'Historia reciente')
        self.assertNotIn('present_illness_history', {
            field.name for field in apps.get_model('patients', 'Consultation')._meta.fields
        })
