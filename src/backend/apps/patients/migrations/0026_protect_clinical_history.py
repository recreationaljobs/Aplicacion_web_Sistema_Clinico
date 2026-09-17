from django.db import migrations

TABLES = ("patients_clinicalrevision", "patients_consultationamendment", "audit_auditevent")


def protect_history(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute("""
        CREATE FUNCTION dentalclinic_protect_history() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN
            RAISE EXCEPTION 'Immutable history cannot be modified or deleted'
                USING ERRCODE = 'integrity_constraint_violation';
        END; $$;
    """)
    for table in TABLES:
        schema_editor.execute(f'CREATE TRIGGER protect_history BEFORE UPDATE OR DELETE ON "{table}" FOR EACH ROW EXECUTE FUNCTION dentalclinic_protect_history()')


def unprotect_history(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    for table in TABLES:
        schema_editor.execute(f'DROP TRIGGER IF EXISTS protect_history ON "{table}"')
    schema_editor.execute('DROP FUNCTION IF EXISTS dentalclinic_protect_history()')


class Migration(migrations.Migration):
    dependencies = [("patients", "0025_consultationamendment_clinicalrevision"), ("audit", "0001_initial")]
    operations = [migrations.RunPython(protect_history, unprotect_history)]
