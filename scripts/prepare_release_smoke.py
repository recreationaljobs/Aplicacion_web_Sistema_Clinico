"""Synthetic fixture for an explicitly isolated, disposable PostgreSQL database."""
import os
import sys
from datetime import date, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src/backend"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.release_smoke")
import django
django.setup()

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction
from apps.clinics.models import ClinicProfile
from apps.common.test_utils import open_clinic_days
from apps.patients.models import ClinicalRecord, Consultation, Patient, PatientDocument
from apps.patients.traceability import record_revision
from apps.users.models import RolePermissionPreset, User

if settings.SETTINGS_MODULE != "config.settings.release_smoke" or settings.DATABASES["default"]["NAME"] != "clinic_smoke":
    raise SystemExit("Only the disposable clinic_smoke database is allowed.")
if User.objects.exists() or Patient.objects.exists():
    raise SystemExit("Use a new empty clinic_smoke database; existing data will not be changed.")
password = os.environ.get("RELEASE_SMOKE_PASSWORD")
if not password:
    raise SystemExit("RELEASE_SMOKE_PASSWORD is required and must not be a production password.")

with transaction.atomic():
    accounts = {}
    for prefix, role in (("admin", "ADMINISTRADOR"), ("dentist", "ODONTOLOGO"), ("reception", "RECEPCIONISTA")):
        accounts[prefix] = User.objects.create_user(
            email=f"{prefix}@release.example.test", password=password,
            role=role, first_name="Synthetic", last_name=prefix.capitalize(),
        )
    preset = RolePermissionPreset.objects.get(role="RECEPCIONISTA")
    preset.permissions = list(set(preset.permissions + ["patients.edit"]))
    preset.save()
    open_clinic_days()
    patient = Patient.objects.create(
        first_name="Synthetic", last_name="Patient", phone="88881111", birth_place="Managua",
        date_of_birth=date(1990, 1, 1), gender="FEMENINO", registered_by=accounts["admin"],
    )
    record = ClinicalRecord.objects.create(patient=patient, allergies="Synthetic allergy")
    record_revision(patient=patient, instance=record, author=accounts["admin"], reason="Synthetic fixture")
    consultation = Consultation.objects.create(
        patient=patient, professional=accounts["dentist"], date=date.today(), time=time(9),
        consultation_type="GENERAL", summary="Synthetic original summary", status="COMPLETADA",
    )
    record_revision(patient=patient, instance=consultation, consultation=consultation,
                    author=accounts["dentist"], reason="Synthetic fixture")
    from io import BytesIO
    from PIL import Image
    image = BytesIO()
    Image.new("RGB", (10, 10), "white").save(image, format="PNG")
    image_bytes = image.getvalue()
    document = PatientDocument(patient=patient, original_name="synthetic.png", category="Synthetic",
                               mime_type="image/png", size_bytes=len(image_bytes), document_date=date.today(),
                               uploaded_by=accounts["admin"])
    document.file.save("synthetic.png", ContentFile(image_bytes), save=True)
print(f"Synthetic fixture ready: patient={patient.pk}, consultation={consultation.pk}")
