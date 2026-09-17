from django.db import migrations, models


SYSTEM_FIELDS = (
    "respiratory", "cardiovascular", "hepatic_renal", "gastrointestinal",
    "neurological", "blood_system", "reproductive_organs",
)


def copy_checks(apps, schema_editor):
    consultation = apps.get_model("patients", "Consultation")
    consultation.objects.using(schema_editor.connection.alias).update(**{
        f"{field}_check": models.Case(
            models.When(**{field: ""}, then=models.Value(False)),
            default=models.Value(True),
            output_field=models.BooleanField(),
        )
        for field in SYSTEM_FIELDS
    })


def restore_marks(apps, schema_editor):
    consultation = apps.get_model("patients", "Consultation")
    consultation.objects.using(schema_editor.connection.alias).update(**{
        field: models.Case(
            models.When(**{f"{field}_check": True}, then=models.Value("✓")),
            default=models.Value(""),
            output_field=models.TextField(),
        )
        for field in SYSTEM_FIELDS
    })


class Migration(migrations.Migration):
    dependencies = [("patients", "0018_document_retirement")]

    operations = [
        migrations.AddField(
            model_name="consultation",
            name=f"{field}_check",
            field=models.BooleanField(default=False),
        )
        for field in SYSTEM_FIELDS
    ] + [migrations.RunPython(copy_checks, restore_marks)] + [
        migrations.RemoveField(model_name="consultation", name=field)
        for field in SYSTEM_FIELDS
    ] + [
        migrations.RenameField(
            model_name="consultation", old_name=f"{field}_check", new_name=field,
        )
        for field in SYSTEM_FIELDS
    ]
