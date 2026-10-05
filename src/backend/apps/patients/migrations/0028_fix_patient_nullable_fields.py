from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("patients", "0027_alter_patient_birth_place_and_more"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                ALTER TABLE patients_patient
                ALTER COLUMN date_of_birth DROP NOT NULL;
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]