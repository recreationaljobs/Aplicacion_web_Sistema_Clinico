from io import StringIO
from unittest.mock import MagicMock, patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase


class OperationalChecksTests(TestCase):
    def test_checks_dependencies_without_sending_mail(self):
        mail = MagicMock()
        mail.open.return_value = True
        with patch("apps.users.management.commands.check_services.cache") as cache, patch(
            "apps.users.management.commands.check_services.get_connection", return_value=mail
        ), patch("apps.users.management.commands.check_services.storages") as storages:
            cache.get.return_value = None
            storages.__getitem__.return_value.exists.return_value = False
            output = StringIO()
            call_command("check_services", stdout=output)
        self.assertIn("SMTP: OK", output.getvalue())
        mail.send_messages.assert_not_called()
        mail.close.assert_called_once()

    def test_failure_never_exposes_provider_exception(self):
        with patch("apps.users.management.commands.check_services.cache.get", side_effect=ConnectionError("private-provider-secret")):
            with self.assertRaises(CommandError) as raised:
                call_command("check_services", stdout=StringIO())
        self.assertNotIn("private-provider-secret", str(raised.exception))
