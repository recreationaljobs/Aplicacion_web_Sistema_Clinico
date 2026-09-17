"""Clinical content stays in the protected clinical domain, never in general logs."""
import json

from django.core.serializers.json import DjangoJSONEncoder

from .models import ClinicalRevision


def clinical_snapshot_value(value):
    return json.loads(json.dumps(value, cls=DjangoJSONEncoder))


def clinical_snapshot(instance):
    excluded = {"id", "patient", "version", "created_at", "updated_at"}
    values = {
        field.name: getattr(instance, field.attname)
        for field in instance._meta.concrete_fields
        if field.name not in excluded
    }
    return json.loads(json.dumps(values, cls=DjangoJSONEncoder))


def record_revision(*, patient, instance, author=None, reason, consultation=None):
    # Callers hold the patient/consultation row lock and an atomic transaction.
    resource_version = consultation.version if consultation else patient.version
    if ClinicalRevision.objects.filter(patient=patient, consultation=consultation, resource_version=resource_version).exists():
        return
    ClinicalRevision.objects.create(
        patient=patient,
        consultation=consultation,
        author=author,
        author_name=(author.get_full_name().strip() or author.email) if author else "Estado previo / sistema",
        resource_version=resource_version,
        snapshot=clinical_snapshot(instance),
        reason=reason,
    )
