from django.core.exceptions import ValidationError
from django.db import models


class ImmutableQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise ValidationError("El historial no puede modificarse.")

    def delete(self):
        raise ValidationError("El historial no puede eliminarse.")

    def bulk_update(self, objs, fields, batch_size=None):
        raise ValidationError("El historial no puede modificarse.")


class ImmutableModel(models.Model):
    objects = ImmutableQuerySet.as_manager()

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("El historial no puede modificarse.")
        if kwargs.get("force_update"):
            raise ValidationError("El historial no puede modificarse.")
        kwargs["force_insert"] = True
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("El historial no puede eliminarse.")
