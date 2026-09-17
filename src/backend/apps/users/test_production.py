from smtplib import SMTPException
from unittest.mock import patch

from rest_framework.test import APITestCase
from .models import User


class PasswordResetFailureTests(APITestCase):
    def test_provider_failure_keeps_generic_response_without_leaking_existence(self):
        user = User.objects.create_user(email="reset-provider@example.test", password="Synthetic123!", role="ODONTOLOGO")
        with patch("apps.users.views.send_mail", side_effect=SMTPException("private-provider-password")):
            existing = self.client.post("/api/auth/password-reset/", {"email": user.email}, format="json")
        missing = self.client.post("/api/auth/password-reset/", {"email": "not-registered@example.test"}, format="json")
        self.assertEqual(existing.status_code, 200)
        self.assertEqual(existing.data, missing.data)
