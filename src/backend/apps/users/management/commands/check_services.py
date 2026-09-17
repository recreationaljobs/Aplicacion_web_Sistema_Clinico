"""Explicit operational checks, separate from public readiness probes."""
from uuid import uuid4

from django.core.cache import cache
from django.core.files.base import ContentFile
from django.core.files.storage import storages
from django.core.mail import get_connection
from django.core.management.base import BaseCommand, CommandError
from django.db import connection


class Command(BaseCommand):
    help = "Check database, cache, storage and SMTP without sending messages."

    def add_arguments(self, parser):
        parser.add_argument(
            "--storage-write", action="store_true",
            help="Also save/read/delete a unique synthetic probe in both media stores.",
        )

    def handle(self, *args, **options):
        checks = (
            ("PostgreSQL", self.check_database),
            ("Redis", lambda: cache.get("health:operational")),
            ("S3 public", lambda: self.check_storage("default", options["storage_write"])),
            ("S3 private", lambda: self.check_storage("private", options["storage_write"])),
            ("SMTP", self.check_mail),
        )
        failures = []
        for name, check in checks:
            try:
                check()
            except Exception:
                # Provider messages can contain credentials or endpoint details.
                failures.append(name)
                self.stdout.write(f"{name}: no disponible")
            else:
                self.stdout.write(f"{name}: OK")
        if failures:
            raise CommandError("Dependencias no disponibles: " + ", ".join(failures)) from None

    @staticmethod
    def check_database():
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()

    @staticmethod
    def check_storage(alias, write):
        storage = storages[alias]
        name = f"operational-probes/{uuid4().hex}.txt"
        if not write:
            storage.exists(name)
            return
        saved = storage.save(name, ContentFile(b"synthetic-operational-probe"))
        try:
            with storage.open(saved, "rb") as probe:
                if probe.read() != b"synthetic-operational-probe":
                    raise ValueError("Probe content mismatch")
        finally:
            storage.delete(saved)

    @staticmethod
    def check_mail():
        mail = get_connection(fail_silently=False)
        try:
            mail.open()
        finally:
            mail.close()
