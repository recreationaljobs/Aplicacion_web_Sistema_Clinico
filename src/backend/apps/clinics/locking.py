from contextlib import contextmanager
from django.db import transaction
from .models import ClinicProfile


@contextmanager
def serialized_schedule():
    """Schedule changes and bookings share the same first lock."""
    with transaction.atomic():
        ClinicProfile.load()
        ClinicProfile.objects.select_for_update().get(pk=1)
        yield
