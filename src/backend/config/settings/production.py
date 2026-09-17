import os
from urllib.parse import urlparse

import dj_database_url
from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403


def required(name):
    value = os.getenv(name, "").strip()
    if not value:
        raise ImproperlyConfigured(f"La variable {name} es obligatoria en producción.")
    return value


def csv_required(name):
    return [item.strip() for item in required(name).split(",") if item.strip()]


def https_url(name):
    value = required(name)
    parsed = urlparse(value)
    if (
        parsed.scheme != "https" or not parsed.hostname
        or parsed.username or parsed.password or "*" in parsed.netloc
        or parsed.query or parsed.fragment
    ):
        raise ImproperlyConfigured(f"La variable {name} debe contener una URL HTTPS.")
    return value


def https_origins(name, required_value=False):
    raw_value = required(name) if required_value else os.getenv(name, "").strip()
    origins = [item.strip() for item in raw_value.split(",") if item.strip()]
    if any(
        parsed.scheme != "https" or not parsed.hostname
        or parsed.username or parsed.password or "*" in parsed.netloc
        or parsed.path or parsed.query or parsed.fragment
        for parsed in map(urlparse, origins)
    ):
        raise ImproperlyConfigured(f"La variable {name} sólo admite orígenes HTTPS.")
    return origins


SECRET_KEY = required("DJANGO_SECRET_KEY")
if len(SECRET_KEY) < 50 or len(set(SECRET_KEY)) < 5 or SECRET_KEY.startswith("django-insecure-") or SECRET_KEY in {"replace-with-a-secret-manager-value", "replace-me"}:
    raise ImproperlyConfigured("DJANGO_SECRET_KEY debe ser una clave fuerte y exclusiva de producción.")
DEBUG = False
REQUIRE_EDIT_VERSION = True
ALLOWED_HOSTS = csv_required("ALLOWED_HOSTS")
if any("*" in host or "/" in host or "@" in host for host in ALLOWED_HOSTS):
    raise ImproperlyConfigured("ALLOWED_HOSTS no puede contener comodines en producción.")
CSRF_TRUSTED_ORIGINS = https_origins("CSRF_TRUSTED_ORIGINS", required_value=True)
FRONTEND_URL = https_url("FRONTEND_URL")
CORS_ALLOWED_ORIGINS = https_origins("CORS_ALLOWED_ORIGINS")
CORS_ALLOW_CREDENTIALS = True

database = dj_database_url.parse(
    required("DATABASE_URL"),
    conn_max_age=60,
    conn_health_checks=True,
)
if database["ENGINE"] != "django.db.backends.postgresql":
    raise ImproperlyConfigured("DATABASE_URL debe utilizar PostgreSQL en producción.")
DATABASES = {"default": database}
database.setdefault("OPTIONS", {}).setdefault("connect_timeout", 3)
CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": required("REDIS_URL"),
        "OPTIONS": {"CLIENT_CLASS": "django_redis.client.DefaultClient", "SOCKET_CONNECT_TIMEOUT": 3, "SOCKET_TIMEOUT": 3},
        "TIMEOUT": 900,
    }
}

EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = required("EMAIL_HOST")
EMAIL_PORT = int(required("EMAIL_PORT"))
EMAIL_HOST_USER = required("EMAIL_HOST_USER")
EMAIL_HOST_PASSWORD = required("EMAIL_HOST_PASSWORD")
EMAIL_USE_TLS = True
EMAIL_TIMEOUT = 10
DEFAULT_FROM_EMAIL = required("DEFAULT_FROM_EMAIL")

AWS_STORAGE_BUCKET_NAME = required("AWS_STORAGE_BUCKET_NAME")
AWS_PRIVATE_STORAGE_BUCKET_NAME = required("AWS_PRIVATE_STORAGE_BUCKET_NAME")
AWS_PUBLIC_MEDIA_PREFIX = required("AWS_PUBLIC_MEDIA_PREFIX")
AWS_PRIVATE_MEDIA_PREFIX = required("AWS_PRIVATE_MEDIA_PREFIX")
AWS_S3_REGION_NAME = required("AWS_S3_REGION_NAME")
AWS_S3_ENDPOINT_URL = os.getenv("AWS_S3_ENDPOINT_URL") or None
AWS_QUERYSTRING_EXPIRE = 60
STORAGES = {
    "default": {"BACKEND": "config.storage.PublicMediaStorage"},
    "private": {"BACKEND": "config.storage.PrivateMediaStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}
PRIVATE_MEDIA_STORAGE_BACKEND = "config.storage.PrivateMediaStorage"
PRIVATE_AVATAR_STORAGE_BACKEND = "config.storage.PrivateMediaStorage"

SECURE_SSL_REDIRECT = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = True
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SAMESITE = "Lax"
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
REFRESH_COOKIE_SECURE = True
ENABLE_DJANGO_ADMIN = os.getenv("ENABLE_DJANGO_ADMIN", "false").lower() == "true"
LOGIN_TRUSTED_PROXY_IPS = csv_required("LOGIN_TRUSTED_PROXY_IPS")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {"()": "config.logging.JsonLogFormatter"},
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json",
        },
        "null": {"class": "logging.NullHandler"},
    },
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "dentalclinic.request": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "django.request": {
            "handlers": ["null"],
            "level": "WARNING",
            "propagate": False,
        },
    },
}
