from datetime import datetime, timedelta
from io import BytesIO
import os
import shutil
import tempfile
from unittest.mock import patch

from django.contrib.auth.tokens import default_token_generator
from django.core.cache import cache
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APIClient, APITestCase
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from PIL import Image

from apps.audit.models import AuditEvent
from apps.patients.models import Patient

from .models import User


def profile_image(name="avatar.png", image_format="PNG"):
    content = BytesIO()
    Image.new("RGB", (24, 24), "#1d4ed8").save(content, format=image_format)
    return SimpleUploadedFile(name, content.getvalue(), content_type="image/png")


def oversized_profile_image():
    content = BytesIO()
    pixels = os.urandom(900 * 900 * 3)
    Image.frombytes("RGB", (900, 900), pixels).save(content, format="PNG")
    return SimpleUploadedFile(
        "oversized-avatar.png",
        content.getvalue(),
        content_type="image/png",
    )


class LoginApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="admin@dentalclinic.com",
            password="ContraseñaSegura123!",
            role=User.Role.ADMINISTRADOR,
            first_name="Ana",
        )
        self.url = reverse("users:login")

    def test_valid_credentials_return_access_and_safe_user_data(self):
        response = self.client.post(
            self.url,
            {"email": self.user.email, "password": "ContraseñaSegura123!"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        self.assertNotIn("refresh", response.data)
        self.assertIn("dentalclinic_refresh", response.cookies)
        self.assertEqual(response.data["user"]["role"], User.Role.ADMINISTRADOR)
        self.assertEqual(
            response.data["user"]["permissions"],
            [
                "patients.view",
                "patients.create",
                "patients.edit",
                "consultations.view",
                "consultations.view_all",
                "consultations.create",
                "consultations.edit",
                "appointments.view",
                "appointments.view_all",
                "appointments.create",
                "appointments.edit",
                "documents.view",
                "documents.create",
                "documents.delete",
                "clinic.manage",
                "users.manage",
            ],
        )
        self.assertNotIn("password", response.data["user"])
        self.assertEqual(response.data["user"]["last_name"], "")
        self.assertEqual(response.data["user"]["phone"], "")
        self.assertEqual(response.data["user"]["avatar_url"], "")

    def test_invalid_credentials_return_generic_error(self):
        response = self.client.post(
            self.url,
            {"email": self.user.email, "password": "incorrecta"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"][0], "Correo electrónico o contraseña incorrectos.")

    def test_unknown_email_returns_the_same_generic_error(self):
        response = self.client.post(
            self.url,
            {"email": "unknown@dentalclinic.com", "password": "incorrecta"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"][0], "Correo electrónico o contraseña incorrectos.")

    def test_profile_requires_a_valid_token(self):
        url = reverse("users:current-user")
        self.assertEqual(self.client.get(url).status_code, 401)
        self.client.credentials(HTTP_AUTHORIZATION="Bearer invalid-token")
        self.assertEqual(self.client.get(url).status_code, 401)

    def test_logout_without_session_is_idempotent(self):
        response = self.client.post(
            reverse("users:logout"),
            {"refresh": "invalid-token"},
            format="json",
        )

        self.assertEqual(response.status_code, 204)

    def test_logout_blacklists_the_refresh_token(self):
        login_response = self.client.post(
            self.url,
            {"email": self.user.email, "password": "ContraseñaSegura123!"},
            format="json",
        )
        access = login_response.data["access"]
        refresh = login_response.cookies["dentalclinic_refresh"].value
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

        response = self.client.post(
            reverse("users:logout"),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, 204)
        with self.assertRaises(TokenError):
            RefreshToken(refresh).check_blacklist()

        profile_response = self.client.get(reverse("users:current-user"))
        self.assertEqual(profile_response.status_code, 401)

    def test_refresh_token_issues_a_new_access_token_for_protected_requests(self):
        login_response = self.client.post(
            self.url,
            {"email": self.user.email, "password": "ContraseñaSegura123!"},
            format="json",
        )

        refresh_response = self.client.post(
            reverse("users:token-refresh"),
            {},
            format="json",
        )

        self.assertEqual(refresh_response.status_code, 200)
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {refresh_response.data['access']}"
        )
        self.assertEqual(
            self.client.get(reverse("users:current-user")).status_code,
            200,
        )


class LoginRateLimitTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            email="limite@dentalclinic.com",
            password="ContraseñaSegura123!",
            role=User.Role.ADMINISTRADOR,
        )
        self.url = reverse("users:login")

    def tearDown(self):
        cache.clear()

    def test_sixth_failed_attempt_for_same_account_is_throttled(self):
        for _ in range(5):
            response = self.client.post(
                self.url,
                {"email": self.user.email, "password": "incorrecta"},
                format="json",
            )
            self.assertEqual(response.status_code, 400)

        blocked = self.client.post(
            self.url,
            {"email": self.user.email, "password": "incorrecta"},
            format="json",
        )

        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked["Retry-After"], "900")

    def test_successful_login_clears_account_failure_counter(self):
        for _ in range(4):
            self.client.post(
                self.url,
                {"email": self.user.email, "password": "incorrecta"},
                format="json",
            )

        success = self.client.post(
            self.url,
            {"email": self.user.email, "password": "ContraseñaSegura123!"},
            format="json",
        )
        after_success = self.client.post(
            self.url,
            {"email": self.user.email, "password": "incorrecta"},
            format="json",
        )

        self.assertEqual(success.status_code, 200)
        self.assertEqual(after_success.status_code, 400)

    def test_ip_limit_counts_failures_across_distinct_accounts(self):
        for index in range(20):
            response = self.client.post(
                self.url,
                {"email": f"unknown-{index}@example.test", "password": "incorrecta"},
                format="json",
                REMOTE_ADDR="192.0.2.25",
            )
            self.assertEqual(response.status_code, 400)

        blocked = self.client.post(
            self.url,
            {"email": "another@example.test", "password": "incorrecta"},
            format="json",
            REMOTE_ADDR="192.0.2.25",
        )

        self.assertEqual(blocked.status_code, 429)

    def test_untrusted_forwarded_for_header_does_not_define_client_ip(self):
        for index in range(21):
            response = self.client.post(
                self.url,
                {"email": f"spoof-{index}@example.test", "password": "incorrecta"},
                format="json",
                REMOTE_ADDR=f"192.0.2.{index + 1}",
                HTTP_X_FORWARDED_FOR="198.51.100.99",
            )
            self.assertEqual(response.status_code, 400)


class SecureSessionApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            email="sesion-segura@dentalclinic.com",
            password="ContraseñaSegura123!",
            role=User.Role.ADMINISTRADOR,
        )
        self.client = APIClient(enforce_csrf_checks=True)

    def csrf_headers(self):
        response = self.client.get(reverse("users:csrf"))
        self.assertEqual(response.status_code, 204)
        token = self.client.cookies["csrftoken"].value
        return {"HTTP_X_CSRFTOKEN": token}

    def login(self):
        return self.client.post(
            reverse("users:login"),
            {"email": self.user.email, "password": "ContraseñaSegura123!"},
            format="json",
            **self.csrf_headers(),
        )

    def test_login_requires_csrf_and_keeps_refresh_out_of_json(self):
        rejected = self.client.post(
            reverse("users:login"),
            {"email": self.user.email, "password": "ContraseñaSegura123!"},
            format="json",
        )
        accepted = self.login()

        self.assertEqual(rejected.status_code, 403)
        self.assertEqual(accepted.status_code, 200)
        self.assertIn("access", accepted.data)
        self.assertNotIn("refresh", accepted.data)
        cookie = accepted.cookies["dentalclinic_refresh"]
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["samesite"], "Lax")
        self.assertEqual(cookie["path"], "/api/auth/")
        self.assertEqual(cookie["max-age"], 28800)

    def test_refresh_uses_cookie_rotates_it_and_rejects_reuse(self):
        login = self.login()
        previous_refresh = login.cookies["dentalclinic_refresh"].value
        absolute_expiry = RefreshToken(previous_refresh)["session_expires_at"]

        refreshed = self.client.post(
            reverse("users:token-refresh"),
            {},
            format="json",
            **self.csrf_headers(),
        )

        self.assertEqual(refreshed.status_code, 200)
        self.assertIn("access", refreshed.data)
        self.assertNotIn("refresh", refreshed.data)
        self.assertNotEqual(
            refreshed.cookies["dentalclinic_refresh"].value,
            previous_refresh,
        )
        rotated = RefreshToken(refreshed.cookies["dentalclinic_refresh"].value)
        self.assertEqual(rotated["exp"], absolute_expiry)
        with self.assertRaises(TokenError):
            RefreshToken(previous_refresh).check_blacklist()

    def test_refresh_and_logout_reject_missing_csrf(self):
        login = self.login()

        rejected_refresh = self.client.post(
            reverse("users:token-refresh"),
            {},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")
        rejected_logout = self.client.post(
            reverse("users:logout"),
            {},
            format="json",
        )

        self.assertEqual(rejected_refresh.status_code, 403)
        self.assertEqual(rejected_logout.status_code, 403)

    def test_refresh_rejects_revoked_token_version(self):
        self.login()
        self.user.token_version += 1
        self.user.save(update_fields=["token_version"])

        response = self.client.post(
            reverse("users:token-refresh"),
            {},
            format="json",
            **self.csrf_headers(),
        )

        self.assertEqual(response.status_code, 401)

    def test_refresh_rejects_an_inactive_user(self):
        self.login()
        self.user.is_active = False
        self.user.save(update_fields=["is_active"])

        response = self.client.post(
            reverse("users:token-refresh"),
            {},
            format="json",
            **self.csrf_headers(),
        )

        self.assertEqual(response.status_code, 401)

    def test_logout_uses_cookie_without_body_and_revokes_access(self):
        login = self.login()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

        response = self.client.post(
            reverse("users:logout"),
            {},
            format="json",
            **self.csrf_headers(),
        )

        self.assertEqual(response.status_code, 204)
        self.assertEqual(response.cookies["dentalclinic_refresh"]["max-age"], 0)
        self.assertEqual(self.client.get(reverse("users:current-user")).status_code, 401)

    def test_password_change_clears_the_refresh_cookie(self):
        login = self.login()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

        response = self.client.post(
            reverse("users:password-change"),
            {
                "current_password": "ContraseñaSegura123!",
                "new_password": "ContraseñaNueva456!",
                "confirm_password": "ContraseñaNueva456!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.cookies["dentalclinic_refresh"]["max-age"], 0)


class CurrentUserProfileApiTests(APITestCase):
    def setUp(self):
        self.private_root = tempfile.mkdtemp()
        self.settings_override = override_settings(PRIVATE_MEDIA_ROOT=self.private_root)
        self.settings_override.enable()
        self.user = User.objects.create_user(
            email="perfil@dentalclinic.com",
            password="ContraseñaPerfil123!",
            role=User.Role.ODONTOLOGO,
            first_name="Elena",
            last_name="Vargas",
        )
        self.other = User.objects.create_user(
            email="otro@dentalclinic.com",
            password="ContraseñaOtro123!",
            role=User.Role.RECEPCIONISTA,
        )
        self.admin = User.objects.create_user(
            email="admin-perfil@dentalclinic.com",
            password="ContraseñaAdmin123!",
            role=User.Role.ADMINISTRADOR,
        )
        self.client.force_authenticate(self.user)

    def tearDown(self):
        self.settings_override.disable()
        shutil.rmtree(self.private_root, ignore_errors=True)

    def test_hu11_updates_own_identity_without_allowing_privilege_changes(self):
        response = self.client.patch(
            reverse("users:current-user"),
            {
                "first_name": "Elena María",
                "last_name": "Rivera",
                "phone": "+505 8888 1111",
                "role": User.Role.ADMINISTRADOR,
                "is_active": False,
                "permissions": ["appointments.view_all"],
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, "Elena María")
        self.assertEqual(self.user.last_name, "Rivera")
        self.assertEqual(self.user.phone, "+505 8888 1111")
        self.assertEqual(self.user.role, User.Role.ODONTOLOGO)
        self.assertTrue(self.user.is_active)
        self.assertEqual(response.data["phone"], "+505 8888 1111")
        self.assertNotIn("password", response.data)

    def test_hu11_requires_current_password_only_when_email_changes(self):
        without_password = self.client.patch(
            reverse("users:current-user"),
            {"email": "nuevo@dentalclinic.com"},
            format="multipart",
        )
        wrong_password = self.client.patch(
            reverse("users:current-user"),
            {"email": "nuevo@dentalclinic.com", "current_password": "incorrecta"},
            format="multipart",
        )

        self.assertEqual(without_password.status_code, 400)
        self.assertIn("current_password", without_password.data)
        self.assertEqual(wrong_password.status_code, 400)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "perfil@dentalclinic.com")

        updated = self.client.patch(
            reverse("users:current-user"),
            {
                "email": " NUEVO@dentalclinic.com ",
                "current_password": "ContraseñaPerfil123!",
            },
            format="multipart",
        )
        self.assertEqual(updated.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "nuevo@dentalclinic.com")

    def test_hu11_uploads_replaces_and_removes_a_private_avatar(self):
        uploaded = self.client.patch(
            reverse("users:current-user"),
            {"avatar": profile_image()},
            format="multipart",
        )

        self.assertEqual(uploaded.status_code, 200)
        self.user.refresh_from_db()
        first_name = self.user.avatar.name
        self.assertTrue(first_name.startswith(f"users/{self.user.pk}/avatars/"))
        self.assertTrue(self.user.avatar.storage.exists(first_name))
        self.assertTrue(uploaded.data["avatar_url"].startswith(
            f'{reverse("users:current-user-avatar")}?v=',
        ))
        first_url = uploaded.data["avatar_url"]

        with self.captureOnCommitCallbacks(execute=True):
            replaced = self.client.patch(
                reverse("users:current-user"),
                {"avatar": profile_image("replacement.png")},
                format="multipart",
            )
        self.assertEqual(replaced.status_code, 200)
        self.user.refresh_from_db()
        self.assertNotEqual(self.user.avatar.name, first_name)
        self.assertFalse(self.user.avatar.storage.exists(first_name))
        self.assertNotEqual(replaced.data["avatar_url"], first_url)

        with self.captureOnCommitCallbacks(execute=True):
            removed = self.client.patch(
                reverse("users:current-user"),
                {"remove_avatar": True},
                format="multipart",
            )
        self.assertEqual(removed.status_code, 200)
        self.user.refresh_from_db()
        self.assertFalse(self.user.avatar)
        self.assertEqual(removed.data["avatar_url"], "")

    def test_hu11_avatar_content_is_limited_to_owner_and_administrator(self):
        self.user.avatar = profile_image()
        self.user.save(update_fields=["avatar"])
        url = reverse("users:user-avatar", kwargs={"pk": self.user.pk})

        own_response = self.client.get(url)
        self.assertEqual(own_response.status_code, 200)
        self.assertEqual(own_response["X-Content-Type-Options"], "nosniff")

        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(url).status_code, 403)

        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get(url).status_code, 200)

    def test_hu11_rejects_duplicate_email_and_unsafe_avatar_content(self):
        duplicate = self.client.patch(
            reverse("users:current-user"),
            {
                "email": self.other.email.upper(),
                "current_password": "ContraseñaPerfil123!",
            },
            format="multipart",
        )
        unsafe_avatar = self.client.patch(
            reverse("users:current-user"),
            {
                "avatar": SimpleUploadedFile(
                    "avatar.png",
                    b"not-a-real-image",
                    content_type="image/png",
                ),
            },
            format="multipart",
        )

        self.assertEqual(duplicate.status_code, 400)
        self.assertIn("email", duplicate.data)
        self.assertEqual(unsafe_avatar.status_code, 400)
        self.assertIn("avatar", unsafe_avatar.data)

    def test_hu11_rejects_an_avatar_larger_than_two_megabytes(self):
        response = self.client.patch(
            reverse("users:current-user"),
            {
                "avatar": oversized_profile_image(),
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("2 MB", str(response.data["avatar"]))

    def test_hu11_administrator_updates_the_complete_profile_of_a_staff_member(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            reverse("users:user-detail", kwargs={"pk": self.other.pk}),
            {"phone": "+505 7777 2222", "avatar": profile_image()},
            format="multipart",
        )

        self.assertEqual(response.status_code, 200)
        self.other.refresh_from_db()
        self.assertEqual(self.other.phone, "+505 7777 2222")
        self.assertTrue(self.other.avatar)
        self.assertEqual(
            response.data["avatar_url"].split("?", maxsplit=1)[0],
            reverse("users:user-avatar", kwargs={"pk": self.other.pk}),
        )

    def test_hu11_administrator_creates_a_staff_member_with_phone_and_avatar(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            reverse("users:user-list"),
            {
                "email": "nuevo-perfil@dentalclinic.com",
                "first_name": "Sara",
                "last_name": "López",
                "phone": "+505 8666 3333",
                "avatar": profile_image(),
                "role": User.Role.RECEPCIONISTA,
                "password": "ContraseñaNueva123!",
                "confirm_password": "ContraseñaNueva123!",
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        created = User.objects.get(email="nuevo-perfil@dentalclinic.com")
        self.assertEqual(created.phone, "+505 8666 3333")
        self.assertTrue(created.avatar)


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class PasswordResetApiTests(APITestCase):
    generic_message = "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña."

    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            email="odontologo@dentalclinic.com",
            password="ContraseñaAnterior123!",
            role=User.Role.ODONTOLOGO,
            first_name="Lucía",
        )

    def reset_payload(self, password="NuevaContraseña123!"):
        return {
            "uid": urlsafe_base64_encode(force_bytes(self.user.pk)),
            "token": default_token_generator.make_token(self.user),
            "new_password": password,
            "confirm_password": password,
        }

    def test_registered_email_receives_a_time_limited_reset_link(self):
        response = self.client.post(
            reverse("users:password-reset"),
            {"email": " ODONTOLOGO@dentalclinic.com "},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["detail"], self.generic_message)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [self.user.email])
        self.assertIn("/restablecer-contrasena/", mail.outbox[0].body)

    def test_unknown_email_returns_the_same_response_without_sending_mail(self):
        response = self.client.post(
            reverse("users:password-reset"),
            {"email": "unknown@dentalclinic.com"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["detail"], self.generic_message)
        self.assertEqual(len(mail.outbox), 0)

    def test_valid_token_changes_password_and_is_single_use(self):
        payload = self.reset_payload()

        response = self.client.post(reverse("users:password-reset-confirm"), payload, format="json")

        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NuevaContraseña123!"))
        reused_response = self.client.post(
            reverse("users:password-reset-confirm"), payload, format="json"
        )
        self.assertEqual(reused_response.status_code, 400)

    def test_confirmation_rejects_mismatched_passwords(self):
        payload = self.reset_payload()
        payload["confirm_password"] = "OtraContraseña123!"

        response = self.client.post(reverse("users:password-reset-confirm"), payload, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("confirm_password", response.data)

    def test_confirmation_rejects_a_weak_password(self):
        response = self.client.post(
            reverse("users:password-reset-confirm"),
            self.reset_payload(password="123"),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("new_password", response.data)

    def test_confirmation_rejects_an_expired_token(self):
        issued_at = datetime(2026, 8, 7, 12, 0, 0)
        with patch.object(default_token_generator, "_now", return_value=issued_at):
            payload = self.reset_payload()

        with patch.object(
            default_token_generator,
            "_now",
            return_value=issued_at + timedelta(minutes=61),
        ):
            response = self.client.post(
                reverse("users:password-reset-confirm"), payload, format="json"
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn("token", response.data)


class ChangePasswordApiTests(APITestCase):
    current_password = "ContraseñaActual123!"
    new_password = "NuevaContraseña456!"

    def setUp(self):
        self.user = User.objects.create_user(
            email="recepcion@dentalclinic.com",
            password=self.current_password,
            role=User.Role.RECEPCIONISTA,
            first_name="Marta",
        )

    def authenticate(self):
        response = self.client.post(
            reverse("users:login"),
            {"email": self.user.email, "password": self.current_password},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        return response.data["access"]

    def payload(self, **overrides):
        data = {
            "current_password": self.current_password,
            "new_password": self.new_password,
            "confirm_password": self.new_password,
        }
        data.update(overrides)
        return data

    def test_password_change_requires_authentication(self):
        response = self.client.post(
            reverse("users:password-change"), self.payload(), format="json"
        )

        self.assertEqual(response.status_code, 401)

    def test_correct_current_password_updates_password_and_revokes_access(self):
        old_access = self.authenticate()

        response = self.client.post(
            reverse("users:password-change"), self.payload(), format="json"
        )

        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(self.new_password))
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {old_access}")
        self.assertEqual(self.client.get(reverse("users:current-user")).status_code, 401)

    def test_incorrect_current_password_is_rejected(self):
        self.authenticate()

        response = self.client.post(
            reverse("users:password-change"),
            self.payload(current_password="incorrecta"),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("current_password", response.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(self.current_password))

    def test_mismatched_confirmation_is_rejected(self):
        self.authenticate()

        response = self.client.post(
            reverse("users:password-change"),
            self.payload(confirm_password="ContraseñaDistinta456!"),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("confirm_password", response.data)

    def test_reusing_current_password_is_rejected(self):
        self.authenticate()

        response = self.client.post(
            reverse("users:password-change"),
            self.payload(
                new_password=self.current_password,
                confirm_password=self.current_password,
            ),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("new_password", response.data)

    def test_weak_password_explains_the_missing_requirements(self):
        self.authenticate()

        response = self.client.post(
            reverse("users:password-change"),
            self.payload(new_password="123", confirm_password="123"),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("new_password", response.data)
        self.assertGreaterEqual(len(response.data["new_password"]), 2)


class UserRegistrationApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="admin-users@dentalclinic.com",
            password="ContraseñaAdmin123!",
            role=User.Role.ADMINISTRADOR,
            first_name="Admin",
        )
        self.url = reverse("users:user-list")

    def payload(self, **overrides):
        data = {
            "email": "nuevo@dentalclinic.com",
            "first_name": "Lucía",
            "last_name": "Méndez",
            "role": User.Role.ODONTOLOGO,
            "password": "ContraseñaSegura123!",
            "confirm_password": "ContraseñaSegura123!",
        }
        data.update(overrides)
        return data

    def test_hu09_administrator_lists_every_user_with_role_and_status(self):
        User.objects.create_user(
            email="activo@dentalclinic.com",
            password="ContraseñaSegura123!",
            first_name="Ana",
            role=User.Role.ODONTOLOGO,
        )
        User.objects.create_user(
            email="inactivo@dentalclinic.com",
            password="ContraseñaSegura123!",
            first_name="Bruno",
            role=User.Role.RECEPCIONISTA,
            is_active=False,
        )
        self.client.force_authenticate(self.admin)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 3)
        for user in response.data["results"]:
            self.assertIn("role", user)
            self.assertIn("is_active", user)
        users_by_email = {user["email"]: user for user in response.data["results"]}
        self.assertEqual(
            users_by_email["activo@dentalclinic.com"]["role"],
            User.Role.ODONTOLOGO,
        )
        self.assertTrue(users_by_email["activo@dentalclinic.com"]["is_active"])
        self.assertEqual(
            users_by_email["inactivo@dentalclinic.com"]["role"],
            User.Role.RECEPCIONISTA,
        )
        self.assertFalse(users_by_email["inactivo@dentalclinic.com"]["is_active"])
        self.assertIn("admin-users@dentalclinic.com", users_by_email)

    def test_staff_list_is_paginated(self):
        User.objects.create_user(
            email="uno@dentalclinic.com",
            password="ContraseñaSegura123!",
            role=User.Role.ODONTOLOGO,
        )
        User.objects.create_user(
            email="dos@dentalclinic.com",
            password="ContraseñaSegura123!",
            role=User.Role.RECEPCIONISTA,
        )
        self.client.force_authenticate(self.admin)

        response = self.client.get(self.url, {"page_size": 2})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 3)
        self.assertEqual(len(response.data["results"]), 2)
        self.assertIsNotNone(response.data["next"])

    def test_staff_list_filters_active_archived_and_all_users(self):
        active = User.objects.create_user(
            email="activo-filtro@dentalclinic.com",
            password="ContraseñaSegura123!",
            role=User.Role.ODONTOLOGO,
        )
        archived = User.objects.create_user(
            email="archivado-filtro@dentalclinic.com",
            password="ContraseñaSegura123!",
            role=User.Role.RECEPCIONISTA,
            is_active=False,
        )
        self.client.force_authenticate(self.admin)

        active_response = self.client.get(self.url, {"status": "active"})
        archived_response = self.client.get(self.url, {"status": "archived"})
        all_response = self.client.get(self.url, {"status": "all"})

        self.assertEqual(active_response.status_code, 200)
        self.assertEqual(
            {item["id"] for item in active_response.data["results"]},
            {self.admin.pk, active.pk},
        )
        self.assertEqual(archived_response.status_code, 200)
        self.assertEqual(
            [item["id"] for item in archived_response.data["results"]],
            [archived.pk],
        )
        self.assertEqual(all_response.status_code, 200)
        self.assertEqual(all_response.data["count"], 3)

    def test_staff_status_filter_is_applied_before_pagination(self):
        for index in range(4):
            User.objects.create_user(
                email=f"archivado-{index}@dentalclinic.com",
                password="ContraseñaSegura123!",
                role=User.Role.RECEPCIONISTA,
                is_active=False,
            )
        for index in range(2):
            User.objects.create_user(
                email=f"activo-{index}@dentalclinic.com",
                password="ContraseñaSegura123!",
                role=User.Role.ODONTOLOGO,
            )
        self.client.force_authenticate(self.admin)

        response = self.client.get(
            self.url,
            {"status": "active", "page": 2, "page_size": 2},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 3)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertTrue(all(item["is_active"] for item in response.data["results"]))

    def test_staff_search_is_combined_with_the_active_status_filter(self):
        active_match = User.objects.create_user(
            email="ana.activa@dentalclinic.com",
            password="ContraseñaSegura123!",
            first_name="Ana",
            last_name="Activa",
            role=User.Role.ODONTOLOGO,
        )
        User.objects.create_user(
            email="ana.archivada@dentalclinic.com",
            password="ContraseñaSegura123!",
            first_name="Ana",
            last_name="Archivada",
            role=User.Role.RECEPCIONISTA,
            is_active=False,
        )
        User.objects.create_user(
            email="bruno@dentalclinic.com",
            password="ContraseñaSegura123!",
            first_name="Bruno",
            role=User.Role.ODONTOLOGO,
        )
        self.client.force_authenticate(self.admin)

        response = self.client.get(
            self.url,
            {"status": "active", "search": "Ana"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], active_match.pk)

    def test_administrator_creates_a_login_ready_user_without_exposing_password(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(self.url, self.payload(), format="json")

        self.assertEqual(response.status_code, 201)
        created = User.objects.get(email="nuevo@dentalclinic.com")
        self.assertTrue(created.check_password("ContraseñaSegura123!"))
        self.assertNotIn("password", response.data)
        self.assertNotIn("confirm_password", response.data)
        login = self.client.post(
            reverse("users:login"),
            {"email": created.email, "password": "ContraseñaSegura123!"},
            format="json",
        )
        self.assertEqual(login.status_code, 200)

    def test_existing_email_is_rejected_case_insensitively(self):
        User.objects.create_user(
            email="existente@dentalclinic.com",
            password="OtraContraseña123!",
            role=User.Role.RECEPCIONISTA,
        )
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            self.url,
            self.payload(email="EXISTENTE@dentalclinic.com"),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.data)
        self.assertEqual(User.objects.filter(email__iexact="existente@dentalclinic.com").count(), 1)

    def test_weak_password_is_rejected(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(
            self.url,
            self.payload(password="123", confirm_password="123"),
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("password", response.data)

    def test_non_administrator_cannot_create_or_list_users(self):
        receptionist = User.objects.create_user(
            email="recepcion-users@dentalclinic.com",
            password="ContraseñaRecepcion123!",
            role=User.Role.RECEPCIONISTA,
        )
        self.client.force_authenticate(receptionist)

        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.assertEqual(self.client.post(self.url, self.payload(), format="json").status_code, 403)

    def test_hu06_and_hu08_update_information_and_role_without_changing_password(self):
        member = User.objects.create_user(
            email="editar@dentalclinic.com",
            password="ContraseñaOriginal123!",
            role=User.Role.RECEPCIONISTA,
        )
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            reverse("users:user-detail", kwargs={"pk": member.pk}),
            {
                "email": "EDITADO@dentalclinic.com",
                "first_name": "Elena",
                "last_name": "Vargas",
                "role": User.Role.ODONTOLOGO,
                "is_superuser": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        member.refresh_from_db()
        self.assertEqual(member.email, "editado@dentalclinic.com")
        self.assertEqual(member.first_name, "Elena")
        self.assertEqual(member.role, User.Role.ODONTOLOGO)
        self.assertTrue(member.is_active)
        self.assertFalse(member.is_superuser)
        self.assertTrue(member.check_password("ContraseñaOriginal123!"))
        self.assertNotIn("password", response.data)

    def test_hu06_administrator_changes_password_and_revokes_existing_sessions(self):
        member = User.objects.create_user(
            email="cambiar-clave@dentalclinic.com",
            password="ContraseñaOriginal123!",
            role=User.Role.RECEPCIONISTA,
        )
        login = self.client.post(
            reverse("users:login"),
            {"email": member.email, "password": "ContraseñaOriginal123!"},
            format="json",
        )
        old_access = login.data["access"]
        old_refresh = login.cookies["dentalclinic_refresh"].value
        original_token_version = member.token_version
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            reverse("users:user-detail", kwargs={"pk": member.pk}),
            {
                "new_password": "NuevaClaveSegura456!",
                "confirm_password": "NuevaClaveSegura456!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        member.refresh_from_db()
        self.assertTrue(member.check_password("NuevaClaveSegura456!"))
        self.assertEqual(member.token_version, original_token_version + 1)
        self.assertNotIn("new_password", response.data)
        self.assertNotIn("confirm_password", response.data)

        self.client.force_authenticate(user=None)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {old_access}")
        revoked_session = self.client.get(reverse("users:current-user"))
        self.assertEqual(revoked_session.status_code, 401)

        self.client.credentials()
        refreshed = self.client.post(
            reverse("users:token-refresh"),
            {},
            format="json",
        )
        self.assertEqual(refreshed.status_code, 401)

    def test_hu06_password_change_rejects_mismatch_without_mutating_user(self):
        member = User.objects.create_user(
            email="clave-distinta@dentalclinic.com",
            password="ContraseñaOriginal123!",
            role=User.Role.ODONTOLOGO,
        )
        original_token_version = member.token_version
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            reverse("users:user-detail", kwargs={"pk": member.pk}),
            {
                "new_password": "NuevaClaveSegura456!",
                "confirm_password": "OtraClaveSegura789!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("confirm_password", response.data)
        member.refresh_from_db()
        self.assertTrue(member.check_password("ContraseñaOriginal123!"))
        self.assertEqual(member.token_version, original_token_version)

    def test_hu06_password_change_rejects_weak_or_incomplete_credentials(self):
        member = User.objects.create_user(
            email="clave-invalida@dentalclinic.com",
            password="ContraseñaOriginal123!",
            role=User.Role.ODONTOLOGO,
        )
        self.client.force_authenticate(self.admin)
        url = reverse("users:user-detail", kwargs={"pk": member.pk})

        weak_response = self.client.patch(
            url,
            {"new_password": "123", "confirm_password": "123"},
            format="json",
        )
        incomplete_response = self.client.patch(
            url,
            {"new_password": "NuevaClaveSegura456!"},
            format="json",
        )

        self.assertEqual(weak_response.status_code, 400)
        self.assertIn("new_password", weak_response.data)
        self.assertEqual(incomplete_response.status_code, 400)
        self.assertIn("confirm_password", incomplete_response.data)
        member.refresh_from_db()
        self.assertTrue(member.check_password("ContraseñaOriginal123!"))

    def test_hu07_deactivation_preserves_user_and_blocks_login(self):
        password = "ContraseñaOriginal123!"
        member = User.objects.create_user(
            email="desactivar@dentalclinic.com",
            password=password,
            first_name="Elena",
            last_name="Vargas",
            role=User.Role.RECEPCIONISTA,
        )
        original_id = member.pk
        patient = Patient.objects.create(
            first_name="Paciente",
            last_name="Histórico",
            birth_place="Managua",
            gender=Patient.Gender.FEMENINO,
            date_of_birth=datetime(1990, 1, 1).date(),
            registered_by=member,
        )
        original_values = (
            member.email,
            member.first_name,
            member.last_name,
            member.role,
            member.token_version,
        )
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            reverse("users:user-detail", kwargs={"pk": original_id}),
            {"is_active": False},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        member.refresh_from_db()
        self.assertFalse(member.is_active)
        self.assertEqual(
            (
                member.email,
                member.first_name,
                member.last_name,
                member.role,
                member.token_version,
            ),
            (*original_values[:-1], original_values[-1] + 1),
        )
        patient.refresh_from_db()
        self.assertEqual(patient.registered_by_id, original_id)
        self.assertTrue(
            User.objects.filter(
                pk=original_id,
                email="desactivar@dentalclinic.com",
                first_name="Elena",
                last_name="Vargas",
                role=User.Role.RECEPCIONISTA,
            ).exists()
        )
        event = AuditEvent.objects.get(request_id=response["X-Request-ID"])
        self.assertEqual(event.action, "USER_ARCHIVED")

        self.client.force_authenticate(user=None)
        login = self.client.post(
            reverse("users:login"),
            {"email": member.email, "password": password},
            format="json",
        )

        self.assertEqual(login.status_code, 400)
        self.assertEqual(
            login.data["detail"][0],
            "Correo electrónico o contraseña incorrectos.",
        )

    def test_administrator_reactivates_the_same_archived_user(self):
        member = User.objects.create_user(
            email="reactivar@dentalclinic.com",
            password="ContraseñaOriginal123!",
            role=User.Role.ODONTOLOGO,
            is_active=False,
        )
        original_id = member.pk
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            reverse("users:user-detail", kwargs={"pk": member.pk}),
            {"is_active": True},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        member.refresh_from_db()
        self.assertEqual(member.pk, original_id)
        self.assertTrue(member.is_active)
        event = AuditEvent.objects.get(request_id=response["X-Request-ID"])
        self.assertEqual(event.action, "USER_REACTIVATED")

    def test_administrator_cannot_archive_their_own_account(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            reverse("users:user-detail", kwargs={"pk": self.admin.pk}),
            {"is_active": False},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("is_active", response.data)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_active)

    def test_administrator_deletes_an_unreferenced_user(self):
        member = User.objects.create_user(
            email="eliminar@dentalclinic.com",
            password="ContraseñaOriginal123!",
            role=User.Role.ODONTOLOGO,
        )
        self.client.force_authenticate(self.admin)

        response = self.client.delete(
            reverse("users:user-detail", kwargs={"pk": member.pk}),
        )

        self.assertEqual(response.status_code, 204)
        self.assertFalse(User.objects.filter(pk=member.pk).exists())

    def test_administrator_cannot_delete_their_own_account(self):
        self.client.force_authenticate(self.admin)

        response = self.client.delete(
            reverse("users:user-detail", kwargs={"pk": self.admin.pk}),
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.data["detail"],
            "No puedes eliminar tu propia cuenta.",
        )
        self.assertTrue(User.objects.filter(pk=self.admin.pk).exists())

    def test_administrator_cannot_delete_a_user_with_clinical_history(self):
        member = User.objects.create_user(
            email="con-historial@dentalclinic.com",
            password="ContraseñaOriginal123!",
            role=User.Role.RECEPCIONISTA,
        )
        Patient.objects.create(
            first_name="Ana",
            last_name="Pérez",
            birth_place="Managua",
            gender=Patient.Gender.FEMENINO,
            date_of_birth=datetime(1990, 1, 1).date(),
            registered_by=member,
        )
        self.client.force_authenticate(self.admin)

        response = self.client.delete(
            reverse("users:user-detail", kwargs={"pk": member.pk}),
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.data["detail"],
            "Este usuario tiene historial asociado y no puede eliminarse. Desactívalo para conservar la trazabilidad.",
        )
        self.assertTrue(User.objects.filter(pk=member.pk).exists())

    def test_non_administrator_cannot_delete_a_user(self):
        receptionist = User.objects.create_user(
            email="recepcion-eliminar@dentalclinic.com",
            password="ContraseñaRecepcion123!",
            role=User.Role.RECEPCIONISTA,
        )
        member = User.objects.create_user(
            email="objetivo-eliminar@dentalclinic.com",
            password="ContraseñaOriginal123!",
            role=User.Role.ODONTOLOGO,
        )
        self.client.force_authenticate(receptionist)

        response = self.client.delete(
            reverse("users:user-detail", kwargs={"pk": member.pk}),
        )

        self.assertEqual(response.status_code, 403)
        self.assertTrue(User.objects.filter(pk=member.pk).exists())

    def test_update_rejects_an_email_used_by_another_user(self):
        member = User.objects.create_user(
            email="editar@dentalclinic.com",
            password="ContraseñaOriginal123!",
        )
        User.objects.create_user(
            email="ocupado@dentalclinic.com",
            password="ContraseñaOcupada123!",
        )
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            reverse("users:user-detail", kwargs={"pk": member.pk}),
            {"email": "OCUPADO@dentalclinic.com"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.data)
        member.refresh_from_db()
        self.assertEqual(member.email, "editar@dentalclinic.com")

    def test_non_administrator_cannot_update_users(self):
        receptionist = User.objects.create_user(
            email="recepcion-edit@dentalclinic.com",
            password="ContraseñaRecepcion123!",
            role=User.Role.RECEPCIONISTA,
        )
        self.client.force_authenticate(receptionist)

        response = self.client.patch(
            reverse("users:user-detail", kwargs={"pk": self.admin.pk}),
            {"is_active": False},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_active)


class RolePermissionPresetApiTests(APITestCase):
    list_url = "/api/auth/role-permissions/"

    def setUp(self):
        self.admin = User.objects.create_user(
            email="admin-permissions@dentalclinic.com",
            password="ContraseñaAdmin123!",
            role=User.Role.ADMINISTRADOR,
        )
        self.receptionist = User.objects.create_user(
            email="recepcion-permissions@dentalclinic.com",
            password="ContraseñaRecepcion123!",
            role=User.Role.RECEPCIONISTA,
        )

    def test_hu09_administrator_lists_editable_role_presets_and_catalog(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [item["code"] for item in response.data["available_permissions"]],
            [
                "patients.view",
                "patients.create",
                "patients.edit",
                "consultations.view",
                "consultations.view_all",
                "consultations.create",
                "consultations.edit",
                "appointments.view",
                "appointments.view_all",
                "appointments.create",
                "appointments.edit",
                "documents.view",
                "documents.create",
                "documents.delete",
            ],
        )
        self.assertEqual(
            {preset["role"] for preset in response.data["presets"]},
            {User.Role.RECEPCIONISTA, User.Role.ODONTOLOGO},
        )

    def test_hu01_administrative_capabilities_are_effective_but_not_delegable(self):
        self.client.force_authenticate(self.admin)

        profile = self.client.get(reverse("users:current-user"))
        catalog = self.client.get(self.list_url)
        delegated = self.client.patch(
            f"{self.list_url}{User.Role.RECEPCIONISTA}/",
            {"permissions": ["clinic.manage", "users.manage"]},
            format="json",
        )

        self.assertEqual(profile.status_code, 200)
        self.assertIn("clinic.manage", profile.data["permissions"])
        self.assertIn("users.manage", profile.data["permissions"])
        self.assertNotIn(
            "clinic.manage",
            [item["code"] for item in catalog.data["available_permissions"]],
        )
        self.assertNotIn(
            "users.manage",
            [item["code"] for item in catalog.data["available_permissions"]],
        )
        self.assertEqual(delegated.status_code, 400)

        self.client.force_authenticate(self.receptionist)
        operational_profile = self.client.get(reverse("users:current-user"))
        self.assertNotIn("clinic.manage", operational_profile.data["permissions"])
        self.assertNotIn("users.manage", operational_profile.data["permissions"])

    def test_hu09_administrator_replaces_a_role_permission_preset(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            f"{self.list_url}{User.Role.ODONTOLOGO}/",
            {"permissions": ["patients.view", "patients.create"]},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data,
            {
                "role": User.Role.ODONTOLOGO,
                "permissions": ["patients.view", "patients.create"],
            },
        )

    def test_view_all_requires_the_base_appointment_view_permission(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            f"{self.list_url}{User.Role.ODONTOLOGO}/",
            {"permissions": ["appointments.view_all"]},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("appointments.view_all", str(response.data))

    def test_consultation_view_all_requires_the_base_consultation_view_permission(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            f"{self.list_url}{User.Role.ODONTOLOGO}/",
            {"permissions": ["consultations.view_all"]},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn(
            "consultations.view_all requiere el permiso consultations.view",
            str(response.data),
        )

    def test_consultation_view_all_is_not_enabled_by_default(self):
        self.client.force_authenticate(self.admin)

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, 200)
        for preset in response.data["presets"]:
            self.assertNotIn("consultations.view_all", preset["permissions"])

    def test_hu09_effective_permissions_follow_the_global_role_preset(self):
        self.client.force_authenticate(self.admin)
        self.client.patch(
            f"{self.list_url}{User.Role.RECEPCIONISTA}/",
            {"permissions": ["patients.view", "patients.create"]},
            format="json",
        )
        self.client.force_authenticate(self.receptionist)

        profile = self.client.get(reverse("users:current-user"))

        self.assertEqual(profile.status_code, 200)
        self.assertIn("permissions", profile.data)
        self.assertEqual(
            profile.data["permissions"],
            ["patients.view", "patients.create"],
        )

    def test_hu09_rejects_unknown_permission_codes_without_changing_preset(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            f"{self.list_url}{User.Role.RECEPCIONISTA}/",
            {"permissions": ["users.become_admin"]},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        current = self.client.get(self.list_url)
        receptionist = next(
            preset
            for preset in current.data["presets"]
            if preset["role"] == User.Role.RECEPCIONISTA
        )
        self.assertNotIn("users.become_admin", receptionist["permissions"])

    def test_hu09_non_administrator_cannot_read_or_change_role_presets(self):
        self.client.force_authenticate(self.receptionist)

        self.assertEqual(self.client.get(self.list_url).status_code, 403)
        self.assertEqual(
            self.client.patch(
                f"{self.list_url}{User.Role.ODONTOLOGO}/",
                {"permissions": ["patients.view"]},
                format="json",
            ).status_code,
            403,
        )

    def test_hu09_administrator_role_is_not_an_editable_preset(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            f"{self.list_url}{User.Role.ADMINISTRADOR}/",
            {"permissions": []},
            format="json",
        )

        self.assertEqual(response.status_code, 404)
