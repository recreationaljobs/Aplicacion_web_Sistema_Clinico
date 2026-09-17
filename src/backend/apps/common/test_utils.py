from datetime import time

from django.core.signals import request_finished
from django.db import close_old_connections, connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase


def open_clinic_days():
    """Explicit open-hours fixture for tests that expect successful bookings."""
    from apps.clinics.models import BusinessHour

    for weekday in range(7):
        BusinessHour.objects.update_or_create(
            weekday=weekday,
            defaults={"is_open": True, "opens_at": time(0), "closes_at": time(23, 59)},
        )


class MigrationTestCase(TransactionTestCase):
    """Restore the complete migration graph before Django flushes the test DB."""

    def _post_teardown(self):
        try:
            executor = MigrationExecutor(connection)
            executor.migrate(executor.loader.graph.leaf_nodes())
        finally:
            super()._post_teardown()


def close_test_response(response):
    """Close a streaming response without closing a TestCase transaction."""

    disconnected = request_finished.disconnect(close_old_connections)
    try:
        response.close()
    finally:
        if disconnected:
            request_finished.connect(close_old_connections)
