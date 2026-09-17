"""Local, synthetic verification only. Never use this profile for production."""
from .postgres_test import *  # noqa: F403
from .base import BASE_DIR

if DATABASES["default"]["NAME"] != "clinic_smoke":
    raise ImproperlyConfigured("Release smoke requires the disposable clinic_smoke database.")
REQUIRE_EDIT_VERSION = True
MEDIA_ROOT = BASE_DIR.parents[1] / ".tmp/production-check/media/public"
PRIVATE_MEDIA_ROOT = BASE_DIR.parents[1] / ".tmp/production-check/media/private"
FRONTEND_URL = "http://127.0.0.1:5190"
CSRF_TRUSTED_ORIGINS = [FRONTEND_URL]
CORS_ALLOWED_ORIGINS = [FRONTEND_URL]
