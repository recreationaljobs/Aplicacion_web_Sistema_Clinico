from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from apps.common.versioning import VersionedModel
from apps.common.immutable import ImmutableModel

from .documents import patient_document_path, private_document_storage
from .identifiers import identification_key_expression


class Patient(VersionedModel):
    class Gender(models.TextChoices):
        FEMENINO = "FEMENINO", "Femenino"
        MASCULINO = "MASCULINO", "Masculino"
        OTRO = "OTRO", "Otro"

    class IdentificationType(models.TextChoices):
        CEDULA = "CEDULA", "Cédula"
        PASAPORTE = "PASAPORTE", "Pasaporte"
        OTRO = "OTRO", "Otro"

    code = models.CharField(max_length=16, unique=True, null=True, blank=True, editable=False)
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=100)
    second_last_name = models.CharField(max_length=100, blank=True)
    birth_place = models.CharField(max_length=150)
    origin = models.CharField(max_length=150, blank=True)
    religion = models.CharField(max_length=100, blank=True)
    education = models.CharField(max_length=150, blank=True)
    profession = models.CharField(max_length=150, blank=True)
    address = models.TextField(blank=True)
    father_name = models.CharField(max_length=200, blank=True)
    mother_name = models.CharField(max_length=200, blank=True)
    information_source = models.CharField(max_length=150, blank=True)
    information_reliability = models.CharField(max_length=100, blank=True)
    identification_type = models.CharField(
        max_length=16,
        choices=IdentificationType.choices,
        null=True,
        blank=True,
    )
    identification_number = models.CharField(max_length=64, null=True, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    email = models.EmailField(blank=True)
    emergency_contact_name = models.CharField(max_length=150, blank=True)
    emergency_relationship = models.CharField(max_length=80, blank=True)
    emergency_phone = models.CharField(max_length=32, blank=True)
    guardian_name = models.CharField(max_length=200, null=True, blank=True)
    guardian_relationship = models.CharField(max_length=80, null=True, blank=True)
    guardian_phone = models.CharField(max_length=32, null=True, blank=True)
    gender = models.CharField(max_length=16, choices=Gender.choices)
    date_of_birth = models.DateField()
    is_active = models.BooleanField(default=True)
    registered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="registered_patients",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = (
            models.CheckConstraint(
                condition=(
                    models.Q(
                        identification_type__isnull=True,
                        identification_number__isnull=True,
                    )
                    | (
                        models.Q(
                            identification_type__in=("CEDULA", "PASAPORTE", "OTRO"),
                            identification_type__isnull=False,
                            identification_number__isnull=False,
                        )
                        & ~models.Q(identification_number="")
                    )
                ),
                name="patient_ident_pair_valid",
            ),
            models.UniqueConstraint(
                models.F("identification_type"),
                identification_key_expression(),
                condition=(
                    models.Q(identification_number__isnull=False)
                    & ~models.Q(identification_number="")
                ),
                name="patient_ident_type_num_uniq",
            ),
        )

    @property
    def full_name(self):
        return " ".join(
            part for part in (self.first_name, self.last_name, self.second_last_name) if part
        )

    def is_minor_on(self, reference_date):
        if not self.date_of_birth:
            return False
        age = reference_date.year - self.date_of_birth.year
        if (reference_date.month, reference_date.day) < (
            self.date_of_birth.month,
            self.date_of_birth.day,
        ):
            age -= 1
        return age < 18

    def missing_profile_fields_on(self, reference_date):
        required_fields = ["first_name", "last_name", "date_of_birth", "phone"]
        if self.is_minor_on(reference_date):
            required_fields.extend((
                "guardian_name",
                "guardian_relationship",
                "guardian_phone",
            ))
        missing_fields = []
        for field in required_fields:
            value = getattr(self, field, None)
            if value is None or (isinstance(value, str) and not value.strip()):
                missing_fields.append(field)
        return missing_fields

    @property
    def is_minor(self):
        from apps.clinics.availability import clinic_today

        return self.is_minor_on(clinic_today())

    @property
    def missing_profile_fields(self):
        from apps.clinics.availability import clinic_today

        return self.missing_profile_fields_on(clinic_today())

    @property
    def profile_complete(self):
        return not self.missing_profile_fields

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        super().save(*args, **kwargs)
        if is_new and not self.code:
            self.code = f"PAC-{self.pk:05d}"
            type(self).objects.filter(pk=self.pk).update(code=self.code)

    def __str__(self):
        return f"{self.code or 'PAC-pendiente'} · {self.full_name}"


class ClinicalRecord(models.Model):
    patient = models.OneToOneField(
        Patient,
        on_delete=models.CASCADE,
        related_name="clinical_record",
    )

    examiner_name = models.CharField(max_length=200, blank=True)
    examiner_national_id = models.CharField(max_length=32, blank=True)
    consultation_date = models.DateField(null=True, blank=True)
    consultation_time = models.TimeField(null=True, blank=True)
    dental_service = models.CharField(max_length=200, blank=True)

    chief_complaint = models.TextField(blank=True)
    present_illness_history = models.TextField(blank=True)
    respiratory = models.TextField(blank=True)
    cardiovascular = models.TextField(blank=True)
    hepatic_renal = models.TextField(blank=True)
    gastrointestinal = models.TextField(blank=True)
    neurological = models.TextField(blank=True)
    blood_system = models.TextField(blank=True)
    reproductive_organs = models.TextField(blank=True)

    family_history = models.TextField(blank=True)
    allergies = models.TextField(max_length=2000, blank=True)
    current_medications = models.TextField(max_length=2000, blank=True)
    relevant_conditions = models.TextField(max_length=2000, blank=True)
    other_clinical_alerts = models.TextField(max_length=2000, blank=True)
    infectious_diseases = models.JSONField(default=dict, blank=True)
    hereditary_diseases = models.JSONField(default=dict, blank=True)

    heart_rate = models.PositiveSmallIntegerField(null=True, blank=True)
    respiratory_rate = models.PositiveSmallIntegerField(null=True, blank=True)
    blood_pressure = models.CharField(max_length=20, blank=True)
    temperature = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    weight = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    height = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    body_surface_area = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    bmi = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    general_appearance = models.TextField(blank=True)
    skin_and_mucosa = models.TextField(blank=True)

    dental_diagnoses = models.TextField(blank=True)
    treatment_plan = models.TextField(blank=True)
    budget = models.TextField(blank=True)
    radiographic_exams = models.JSONField(default=list, blank=True)
    clinical_photographs = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Expediente · {self.patient}"


class Consultation(VersionedModel):
    class Type(models.TextChoices):
        INITIAL_ASSESSMENT = "VALORACION_INICIAL", "Valoración inicial"
        GENERAL = "GENERAL", "Consulta general"
        FOLLOW_UP = "SEGUIMIENTO", "Seguimiento"
        EMERGENCY = "URGENCIA", "Urgencia"

    class Status(models.TextChoices):
        COMPLETED = "COMPLETADA", "Completada"
        IN_PROGRESS = "EN_PROGRESO", "En progreso"
        CANCELLED = "CANCELADA", "Cancelada"

    patient = models.ForeignKey(
        Patient,
        on_delete=models.CASCADE,
        related_name="consultations",
    )
    professional = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="patient_consultations",
    )
    professional_name_snapshot = models.CharField(max_length=200, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="completed_consultations",
    )
    date = models.DateField()
    time = models.TimeField(null=True, blank=True)
    consultation_type = models.CharField(max_length=24, choices=Type.choices)
    summary = models.TextField()
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.COMPLETED,
    )
    examiner_national_id = models.CharField(max_length=32, blank=True)
    dental_service = models.CharField(max_length=200, blank=True)
    chief_complaint = models.TextField(blank=True)
    respiratory = models.BooleanField(default=False)
    cardiovascular = models.BooleanField(default=False)
    hepatic_renal = models.BooleanField(default=False)
    gastrointestinal = models.BooleanField(default=False)
    neurological = models.BooleanField(default=False)
    blood_system = models.BooleanField(default=False)
    reproductive_organs = models.BooleanField(default=False)
    heart_rate = models.PositiveSmallIntegerField(null=True, blank=True)
    respiratory_rate = models.PositiveSmallIntegerField(null=True, blank=True)
    blood_pressure = models.CharField(max_length=20, blank=True)
    temperature = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    weight = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    height = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    body_surface_area = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    bmi = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    general_appearance = models.TextField(blank=True)
    skin_and_mucosa = models.TextField(blank=True)
    dental_diagnoses = models.TextField(blank=True)
    treatment_plan = models.TextField(blank=True)
    budget = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-date", "-created_at")
        indexes = (
            models.Index(fields=("patient", "-date")),
            models.Index(
                fields=("status", "patient", "-date", "-time"),
                name="consult_st_pat_dt_tm_idx",
            ),
        )

    def save(self, *args, **kwargs):
        if not self.professional_name_snapshot and self.professional_id:
            self.professional_name_snapshot = (
                self.professional.get_full_name().strip() or self.professional.email
            )
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.get_consultation_type_display()} · {self.patient} · {self.date}"


class TreatmentItem(VersionedModel):
    class Status(models.TextChoices):
        PROPOSED = "PROPUESTO", "Propuesto"
        ACCEPTED = "ACEPTADO", "Aceptado"
        PERFORMED = "REALIZADO", "Realizado"
        CANCELLED = "CANCELADO", "Cancelado"

    proposed_in = models.ForeignKey(
        Consultation,
        on_delete=models.PROTECT,
        related_name="treatment_items",
    )
    performed_in = models.ForeignKey(
        Consultation,
        on_delete=models.PROTECT,
        related_name="performed_treatment_items",
        null=True,
        blank=True,
    )
    performed_at = models.DateTimeField(null=True, blank=True)
    resulting_odontogram_version = models.OneToOneField(
        "OdontogramVersion",
        on_delete=models.PROTECT,
        related_name="resulting_treatment_item",
        null=True,
        blank=True,
    )
    status_reason = models.TextField(blank=True, max_length=1000)
    service = models.ForeignKey(
        "clinics.ClinicService",
        on_delete=models.PROTECT,
        related_name="treatment_items",
        null=True,
        blank=True,
    )
    description = models.CharField(max_length=255)
    diagnosis_text = models.TextField(blank=True)
    tooth_code = models.CharField(max_length=2, null=True, blank=True)
    surfaces = models.JSONField(default=list, blank=True)
    planned_finding = models.CharField(max_length=24, blank=True)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PROPOSED,
    )
    unit_price_snapshot = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("created_at", "id")

    def clean(self):
        super().clean()
        from .odontograms import (
            PERMANENT_TEETH,
            PLANNED_SURFACE_FINDINGS,
            PLANNED_WHOLE_FINDINGS,
            PRIMARY_TEETH,
            allowed_surfaces,
        )

        errors = {}
        self.description = self.description.strip()
        self.tooth_code = self.tooth_code.strip() if self.tooth_code else None
        if not self.service_id and not self.description:
            errors["description"] = "Selecciona un servicio o escribe un procedimiento."
        valid_teeth = PERMANENT_TEETH | PRIMARY_TEETH
        if self.tooth_code and self.tooth_code not in valid_teeth:
            errors["tooth_code"] = "Indica una pieza válida en formato FDI."
        if not isinstance(self.surfaces, list) or any(not isinstance(surface, str) for surface in self.surfaces):
            errors["surfaces"] = "Las superficies deben enviarse como una lista."
        elif not self.tooth_code and self.surfaces:
            errors["surfaces"] = "No se pueden indicar superficies sin una pieza dental."
        elif self.tooth_code and self.tooth_code in valid_teeth:
            invalid = set(self.surfaces) - allowed_surfaces(self.tooth_code)
            if invalid:
                errors["surfaces"] = "Una o más superficies no aplican a la pieza indicada."
            elif len(self.surfaces) != len(set(self.surfaces)):
                errors["surfaces"] = "No repitas superficies dentales."
        planned_findings = PLANNED_SURFACE_FINDINGS | PLANNED_WHOLE_FINDINGS
        if self.planned_finding and self.planned_finding not in planned_findings:
            errors["planned_finding"] = "Selecciona un hallazgo planificado válido."
        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return f"{self.description} · {self.proposed_in}"


class OdontogramVersion(models.Model):
    class Dentition(models.TextChoices):
        PRIMARY = "PRIMARY", "Temporal"
        MIXED = "MIXED", "Mixta"
        PERMANENT = "PERMANENT", "Permanente"

    patient = models.ForeignKey(
        Patient,
        on_delete=models.PROTECT,
        related_name="odontogram_versions",
    )
    consultation = models.ForeignKey(
        Consultation,
        on_delete=models.PROTECT,
        related_name="odontogram_versions",
    )
    version_number = models.PositiveIntegerField()
    schema_version = models.PositiveSmallIntegerField(default=1, editable=False)
    dentition = models.CharField(max_length=16, choices=Dentition.choices)
    teeth = models.JSONField(default=dict)
    changed_teeth = models.JSONField(default=list, editable=False)
    note = models.TextField(blank=True)
    based_on = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="derived_versions",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_odontogram_versions",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-version_number",)
        constraints = (
            models.UniqueConstraint(
                fields=("patient", "version_number"),
                name="unique_patient_odontogram_version",
            ),
        )

    def save(self, *args, **kwargs):
        if self.pk:
            raise ValidationError("Las versiones del odontograma son inmutables.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Las versiones del odontograma no se pueden eliminar.")

    def __str__(self):
        return f"Odontograma {self.patient} · versión {self.version_number}"


class ActiveDocumentManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(deleted_at__isnull=True)


class PatientDocument(models.Model):
    objects = ActiveDocumentManager()
    all_objects = models.Manager()
    deleted_at = models.DateTimeField(null=True, blank=True, editable=False)
    deleted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True,
        related_name="retired_patient_documents", editable=False,
    )
    deletion_reason = models.CharField(max_length=1000, blank=True, editable=False)
    patient = models.ForeignKey(
        Patient,
        on_delete=models.PROTECT,
        related_name="documents",
    )
    consultation = models.ForeignKey(
        Consultation,
        on_delete=models.PROTECT,
        related_name="documents",
        null=True,
        blank=True,
    )
    tooth_code = models.CharField(max_length=2, null=True, blank=True)
    category = models.CharField(max_length=80)
    document_date = models.DateField()
    notes = models.TextField(blank=True)
    original_name = models.CharField(max_length=255)
    mime_type = models.CharField(max_length=64)
    size_bytes = models.PositiveBigIntegerField()
    file = models.FileField(
        storage=private_document_storage,
        upload_to=patient_document_path,
        max_length=255,
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="uploaded_patient_documents",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-document_date", "-created_at")
        indexes = (
            models.Index(
                fields=("patient", "-document_date"),
                name="patient_doc_patient_date_idx",
            ),
            models.Index(fields=("category",), name="patient_doc_category_idx"),
            models.Index(
                fields=("patient", "consultation"),
                name="patient_doc_consult_idx",
            ),
        )

    def __str__(self):
        return f"{self.original_name} · {self.patient}"


class ClinicalRevision(ImmutableModel):
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="clinical_revisions")
    consultation = models.ForeignKey(Consultation, on_delete=models.PROTECT, null=True, blank=True, related_name="clinical_revisions")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="clinical_revisions")
    author_name = models.CharField(max_length=255, blank=True)
    resource_version = models.PositiveIntegerField()
    snapshot = models.JSONField()
    reason = models.CharField(max_length=1000)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-id",)
        constraints = [
            models.UniqueConstraint(fields=("patient", "resource_version"), condition=models.Q(consultation__isnull=True), name="clinical_record_revision_uniq"),
            models.UniqueConstraint(fields=("consultation", "resource_version"), condition=models.Q(consultation__isnull=False), name="consultation_revision_uniq"),
        ]


class ConsultationAmendment(ImmutableModel):
    consultation = models.ForeignKey(Consultation, on_delete=models.PROTECT, related_name="amendments")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="consultation_amendments")
    author_name = models.CharField(max_length=255)
    reason = models.CharField(max_length=1000)
    content = models.TextField(max_length=10000)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at", "id")
