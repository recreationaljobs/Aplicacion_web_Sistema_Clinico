from django.db import migrations


TABLES = ("appointments_appointmentcheckincorrection", "appointments_appointmentrescheduleevent")


def protect(apps, schema_editor):
    if schema_editor.connection.vendor == "postgresql":
        for table in TABLES:
            schema_editor.execute(
                f'CREATE TRIGGER protect_history BEFORE UPDATE OR DELETE ON "{table}" '
                'FOR EACH ROW EXECUTE FUNCTION dentalclinic_protect_history()'
            )


def unprotect(apps, schema_editor):
    if schema_editor.connection.vendor == "postgresql":
        for table in TABLES:
            schema_editor.execute(f'DROP TRIGGER IF EXISTS protect_history ON "{table}"')


class Migration(migrations.Migration):
    dependencies = [
        ("appointments", "0009_appointmentcheckincorrection"),
        ("patients", "0026_protect_clinical_history"),
    ]
    operations = [migrations.RunPython(protect, unprotect)]
