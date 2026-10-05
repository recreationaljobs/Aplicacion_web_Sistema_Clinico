from django.db import migrations


SQL = """
-- ==========================================================
-- 1. Campos que deben aceptar NULL según el modelo actual
-- ==========================================================

ALTER TABLE patients_patient
    ALTER COLUMN code DROP NOT NULL;

ALTER TABLE patients_patient
    ALTER COLUMN date_of_birth DROP NOT NULL;

ALTER TABLE patients_patient
    ALTER COLUMN identification_type DROP NOT NULL;

ALTER TABLE patients_patient
    ALTER COLUMN identification_number DROP NOT NULL;


-- ==========================================================
-- 2. Limpiar representaciones vacías de identificación
--    para que la pareja quede coherente.
-- ==========================================================

UPDATE patients_patient
SET identification_type = NULL
WHERE identification_type = '';

UPDATE patients_patient
SET identification_number = NULL
WHERE identification_number = '';

UPDATE patients_patient
SET identification_type = NULL,
    identification_number = NULL
WHERE identification_type IS NULL
   OR identification_number IS NULL;


-- ==========================================================
-- 3. Volver a crear el CHECK actual del modelo.
-- ==========================================================

ALTER TABLE patients_patient
    DROP CONSTRAINT IF EXISTS patient_ident_pair_valid;

ALTER TABLE patients_patient
    ADD CONSTRAINT patient_ident_pair_valid
    CHECK (
        (
            identification_type IS NULL
            AND identification_number IS NULL
        )
        OR
        (
            identification_type IN ('CEDULA', 'PASAPORTE', 'OTRO')
            AND identification_type IS NOT NULL
            AND identification_number IS NOT NULL
            AND identification_number <> ''
        )
    );
"""


class Migration(migrations.Migration):

    dependencies = [
        ("patients", "0028_fix_patient_nullable_fields"),
    ]

    operations = [
        migrations.RunSQL(
            sql=SQL,
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]