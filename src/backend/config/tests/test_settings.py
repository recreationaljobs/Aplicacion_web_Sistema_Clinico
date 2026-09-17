import json
import os
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

from django.test import SimpleTestCase


BACKEND_ROOT = Path(__file__).resolve().parents[2]


class DevelopmentDatabaseSettingsTests(SimpleTestCase):
    def run_development(self, *args, database_url):
        env = {
            **os.environ,
            "DJANGO_SETTINGS_MODULE": "config.settings.development",
            "DATABASE_URL": database_url,
        }
        return subprocess.run(
            [sys.executable, "manage.py", *args],
            cwd=BACKEND_ROOT,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )

    def test_development_requires_database_url(self):
        result = self.run_development("check", database_url="")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("DATABASE_URL", result.stderr)

    def test_development_rejects_a_non_postgresql_database_url(self):
        result = self.run_development("check", database_url="sqlite:///:memory:")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("PostgreSQL", result.stderr)

    def test_development_parses_the_postgresql_database_url(self):
        result = self.run_development(
            "shell",
            "-c",
            (
                "from django.conf import settings; "
                "database = settings.DATABASES['default']; "
                "print(database['ENGINE'], database['NAME'], database['HOST'], database['PORT'])"
            ),
            database_url=(
                "postgresql://clinic:password@db.example.test:5544/clinic_development"
            ),
        )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(
            "django.db.backends.postgresql clinic_development db.example.test 5544",
            result.stdout,
        )

    def test_development_loads_database_url_from_a_controlled_dotenv_file(self):
        with TemporaryDirectory() as temporary_directory:
            dotenv_path = Path(temporary_directory) / ".env"
            dotenv_path.write_text(
                "DATABASE_URL=postgresql://dotenv_user:synthetic@dotenv.example.test:5544/dotenv_database\n",
                encoding="utf-8",
            )
            env = {**os.environ}
            env.pop("DATABASE_URL", None)
            result = subprocess.run(
                [
                    sys.executable,
                    "-c",
                    (
                        "import sys; from pathlib import Path; "
                        "import config.settings.base as base; "
                        "base.BASE_DIR = Path(sys.argv[1]); "
                        "import config.settings.development as development; "
                        "database = development.DATABASES['default']; "
                        "print(database['ENGINE'], database['NAME'], database['HOST'], database['PORT'])"
                    ),
                    temporary_directory,
                ],
                cwd=BACKEND_ROOT,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(
            "django.db.backends.postgresql dotenv_database dotenv.example.test 5544",
            result.stdout,
        )

    def test_settings_package_alias_does_not_load_empty_settings(self):
        env = {
            **os.environ,
            "DJANGO_SETTINGS_MODULE": "config.settings",
            "DATABASE_URL": "",
        }

        result = subprocess.run(
            [sys.executable, "manage.py", "check"],
            cwd=BACKEND_ROOT,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("DATABASE_URL", result.stderr)


class TestDatabaseSettingsTests(SimpleTestCase):
    def test_test_profile_is_isolated_from_the_legacy_sqlite_database(self):
        env = {
            **os.environ,
            "DJANGO_SETTINGS_MODULE": "config.settings.test",
        }
        result = subprocess.run(
            [
                sys.executable,
                "manage.py",
                "shell",
                "-c",
                (
                    "from django.conf import settings; "
                    "database = settings.DATABASES['default']; "
                    "print(database['ENGINE'], database['NAME'], database['TEST']['NAME'])"
                ),
            ],
            cwd=BACKEND_ROOT,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("django.db.backends.sqlite3", result.stdout)
        self.assertIn("test.sqlite3 :memory:", result.stdout)
        self.assertNotIn("db.sqlite3 :memory:", result.stdout)


class PostgresTestSettingsTests(SimpleTestCase):
    def run_django(self, *args, test_database_url):
        env = {
            **os.environ,
            "DJANGO_SETTINGS_MODULE": "config.settings.postgres_test",
            "TEST_DATABASE_URL": test_database_url,
        }
        return subprocess.run(
            [sys.executable, "manage.py", *args],
            cwd=BACKEND_ROOT,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )

    def test_postgres_test_settings_require_an_explicit_url(self):
        result = self.run_django("check", test_database_url="")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("TEST_DATABASE_URL", result.stderr)

    def test_postgres_test_settings_reject_sqlite(self):
        result = self.run_django("check", test_database_url="sqlite:///:memory:")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("PostgreSQL", result.stderr)

    def test_postgres_test_settings_reject_the_development_database(self):
        result = self.run_django(
            "check",
            test_database_url=(
                "postgresql://clinic_test:synthetic@db.example.test:5544/clinica_dental"
            ),
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("clinica_dental", result.stderr)

    def test_postgres_test_settings_parse_an_isolated_database(self):
        result = self.run_django(
            "shell",
            "-c",
            (
                "from django.conf import settings; "
                "database = settings.DATABASES['default']; "
                "print(database['ENGINE'], database['NAME'], database['HOST'], database['PORT'])"
            ),
            test_database_url=(
                "postgresql://clinic_test:synthetic@db.example.test:5544/clinic_test"
            ),
        )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn(
            "django.db.backends.postgresql clinic_test db.example.test 5544",
            result.stdout,
        )


class ProductionSettingsTests(SimpleTestCase):
    def test_rejects_ambiguous_origins_hosts_and_placeholder_key(self):
        for variable, value in (
            ("CSRF_TRUSTED_ORIGINS", "https://clinic.example.test/path"),
            ("CORS_ALLOWED_ORIGINS", "https://user:password@clinic.example.test"),
            ("ALLOWED_HOSTS", "*.example.test"),
            ("DJANGO_SECRET_KEY", "replace-me"),
        ):
            with self.subTest(variable=variable):
                env = self.production_environment()
                env[variable] = value
                result = self.run_django("check", extra_env=env)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(variable, result.stderr)

    def run_django(self, *args, extra_env=None):
        env = {
            **os.environ,
            "DJANGO_SETTINGS_MODULE": "config.settings.production",
            **(extra_env or {}),
        }
        return subprocess.run(
            [sys.executable, "manage.py", *args],
            cwd=BACKEND_ROOT,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )

    def production_environment(self):
        return {
            "DJANGO_SECRET_KEY": "qa-only-secret-key-with-more-than-fifty-characters-1234567890",
            "DATABASE_URL": "postgresql://clinic:password@db.example.test:5432/clinic?sslmode=require",
            "REDIS_URL": "redis://cache.example.test:6379/0",
            "ALLOWED_HOSTS": "clinic.example.test",
            "CSRF_TRUSTED_ORIGINS": "https://clinic.example.test",
            "FRONTEND_URL": "https://clinic.example.test",
            "EMAIL_HOST": "smtp.example.test",
            "EMAIL_PORT": "587",
            "EMAIL_HOST_USER": "mailer@example.test",
            "EMAIL_HOST_PASSWORD": "qa-mail-password",
            "DEFAULT_FROM_EMAIL": "no-reply@example.test",
            "AWS_STORAGE_BUCKET_NAME": "clinic-public-test",
            "AWS_PRIVATE_STORAGE_BUCKET_NAME": "clinic-private-test",
            "AWS_PUBLIC_MEDIA_PREFIX": "public",
            "AWS_PRIVATE_MEDIA_PREFIX": "private",
            "AWS_S3_REGION_NAME": "us-east-1",
            "LOGIN_TRUSTED_PROXY_IPS": "10.0.0.10",
        }

    def test_production_settings_fail_fast_when_required_values_are_missing(self):
        env = {key: "" for key in self.production_environment()}

        result = self.run_django("check", extra_env=env)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("DJANGO_SECRET_KEY", result.stderr)

    def test_production_settings_require_database_url_independently(self):
        env = self.production_environment()
        env["DATABASE_URL"] = ""

        result = self.run_django("check", extra_env=env)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("DATABASE_URL", result.stderr)

    def test_production_settings_reject_non_postgresql_database(self):
        env = self.production_environment()
        env["DATABASE_URL"] = "sqlite:///runtime.sqlite3"

        result = self.run_django("check", extra_env=env)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("PostgreSQL", result.stderr)

    def test_production_settings_reject_wildcard_hosts(self):
        env = self.production_environment()
        env["ALLOWED_HOSTS"] = "*"

        result = self.run_django("check", extra_env=env)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("ALLOWED_HOSTS", result.stderr)

    def test_production_settings_require_https_origins(self):
        for variable in ("CSRF_TRUSTED_ORIGINS", "FRONTEND_URL", "CORS_ALLOWED_ORIGINS"):
            with self.subTest(variable=variable):
                env = self.production_environment()
                env[variable] = "http://clinic.example.test"

                result = self.run_django("check", extra_env=env)

                self.assertNotEqual(result.returncode, 0)
                self.assertIn(variable, result.stderr)

    def test_production_runtime_uses_secure_static_logging_and_cookie_settings(self):
        result = self.run_django(
            "shell",
            "-c",
            (
                "import json; from django.conf import settings; "
                "print(json.dumps({"
                "'debug': settings.DEBUG, "
                "'database': settings.DATABASES['default']['ENGINE'], "
                "'csrf_secure': settings.CSRF_COOKIE_SECURE, "
                "'session_secure': settings.SESSION_COOKIE_SECURE, "
                "'refresh_secure': settings.REFRESH_COOKIE_SECURE, "
                "'static_backend': settings.STORAGES['staticfiles']['BACKEND'], "
                "'whitenoise_middleware': 'whitenoise.middleware.WhiteNoiseMiddleware' in settings.MIDDLEWARE, "
                "'json_formatter': settings.LOGGING['formatters']['json']['()'], "
                "'django_request_handlers': settings.LOGGING['loggers']['django.request']['handlers']"
                "}))"
            ),
            extra_env=self.production_environment(),
        )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        payload = json.loads(next(
            line for line in result.stdout.splitlines() if line.startswith("{")
        ))
        self.assertEqual(payload, {
            "debug": False,
            "database": "django.db.backends.postgresql",
            "csrf_secure": True,
            "session_secure": True,
            "refresh_secure": True,
            "static_backend": "whitenoise.storage.CompressedManifestStaticFilesStorage",
            "whitenoise_middleware": True,
            "json_formatter": "config.logging.JsonLogFormatter",
            "django_request_handlers": ["null"],
        })

    def test_production_settings_pass_deploy_check_with_safe_values(self):
        result = self.run_django(
            "check",
            "--deploy",
            extra_env=self.production_environment(),
        )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("System check identified no issues", result.stdout)
