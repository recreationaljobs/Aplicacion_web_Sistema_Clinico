from datetime import date

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.urls import reverse
from django.conf import settings
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from apps.clinics.availability import clinic_today
from apps.clinics.models import ClinicService
from apps.users.permissions import user_has_permission
from apps.common.versioning import VersionedSerializer
from apps.common.upload_cleanup import cleanup_created_uploads, save_tracked_upload

from .documents import (
    MAX_BATCH_FILES,
    MAX_BATCH_SIZE,
    is_clinical_photo_category,
    normalize_category,
    safe_original_name,
    validate_document_file,
)
from .models import (
    ClinicalRecord,
    Consultation,
    OdontogramVersion,
    Patient,
    PatientDocument,
    TreatmentItem,
)
from .duplicates import PossiblePatientDuplicate
from .traceability import clinical_snapshot, clinical_snapshot_value, record_revision
from .identifiers import (
    format_cedula,
    identification_key_expression,
    normalize_identification_key,
    normalize_identification_number,
)
from .odontograms import (
    PERMANENT_TEETH,
    PRIMARY_TEETH,
    create_initial_odontogram_version,
    create_odontogram_revision,
    normalize_teeth_snapshot,
)


class ClinicalRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClinicalRecord
        exclude = ("patient",)
        read_only_fields = ("id", "created_at", "updated_at")


class PatientProfileSerializationMixin:
    def _profile_reference_date(self):
        if not hasattr(self, "_hu53_profile_reference_date"):
            self._hu53_profile_reference_date = clinic_today()
        return self._hu53_profile_reference_date

    def get_profile_complete(self, patient):
        return not patient.missing_profile_fields_on(self._profile_reference_date())

    def get_missing_profile_fields(self, patient):
        return patient.missing_profile_fields_on(self._profile_reference_date())


class PatientSummarySerializer(PatientProfileSerializationMixin, serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    profile_complete = serializers.SerializerMethodField()

    class Meta:
        model = Patient
        fields = (
            "id",
            "code",
            "first_name",
            "last_name",
            "second_last_name",
            "full_name",
            "phone",
            "email",
            "date_of_birth",
            "is_active",
            "profile_complete",
            "created_at",
        )
        read_only_fields = fields


class PatientOptionSerializer(PatientProfileSerializationMixin, serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    profile_complete = serializers.SerializerMethodField()

    class Meta:
        model = Patient
        fields = (
            "id",
            "code",
            "full_name",
            "phone",
            "date_of_birth",
            "profile_complete",
        )
        read_only_fields = fields


class PatientDuplicateCheckSerializer(serializers.Serializer):
    first_name = serializers.CharField(required=False, allow_blank=True, default="")
    first_last_name = serializers.CharField(required=False, allow_blank=True, default="")
    date_of_birth = serializers.DateField(required=False, allow_null=True, default=None)
    phone = serializers.CharField(required=False, allow_blank=True, default="")
    exclude_patient_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=1,
        default=None,
    )


class PossiblePatientDuplicateSerializer(serializers.Serializer):
    id = serializers.IntegerField(source="patient.pk", read_only=True)
    code = serializers.CharField(source="patient.code", read_only=True, allow_null=True)
    full_name = serializers.CharField(source="patient.full_name", read_only=True)
    date_of_birth = serializers.DateField(source="patient.date_of_birth", read_only=True)
    phone = serializers.CharField(source="patient.phone", read_only=True)
    is_active = serializers.BooleanField(source="patient.is_active", read_only=True)
    matched_on = serializers.ListField(
        child=serializers.ChoiceField(
            choices=("phone", "name_and_date_of_birth"),
        ),
        read_only=True,
    )

    def to_representation(self, instance: PossiblePatientDuplicate):
        return super().to_representation(instance)


class PatientDetailSerializer(PatientProfileSerializationMixin, VersionedSerializer):
    full_name = serializers.CharField(read_only=True)
    clinical_record = ClinicalRecordSerializer(required=False)
    clinical_change_reason = serializers.CharField(max_length=1000, allow_blank=False, required=False, write_only=True)
    profile_complete = serializers.SerializerMethodField()
    missing_profile_fields = serializers.SerializerMethodField()

    class Meta:
        model = Patient
        fields = (
            "id",
            "code",
            "first_name",
            "last_name",
            "second_last_name",
            "full_name",
            "birth_place",
            "origin",
            "religion",
            "education",
            "profession",
            "address",
            "father_name",
            "mother_name",
            "information_source",
            "information_reliability",
            "identification_type",
            "identification_number",
            "phone",
            "email",
            "emergency_contact_name",
            "emergency_relationship",
            "emergency_phone",
            "guardian_name",
            "guardian_relationship",
            "guardian_phone",
            "gender",
            "date_of_birth",
            "is_active",
            "profile_complete",
            "missing_profile_fields",
            "clinical_record", "clinical_change_reason",
            "version", "expected_version",
            "registered_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "code",
            "full_name",
            "profile_complete",
            "missing_profile_fields",
            "registered_by",
            "created_at",
            "updated_at",
        )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.context.get("quick_create"):
            self.fields["birth_place"].required = False
            self.fields["gender"].required = False

    def validate_date_of_birth(self, value):
        if value > date.today():
            raise serializers.ValidationError("La fecha de nacimiento no puede ser futura.")
        return value

    def validate_email(self, value):
        return value.strip().lower()

    def to_internal_value(self, data):
        mutable_data = data.copy()
        legacy_number = mutable_data.pop("national_id", None)
        if isinstance(legacy_number, (list, tuple)):
            legacy_number = legacy_number[-1] if legacy_number else None
        if legacy_number is not None and "identification_number" not in mutable_data:
            mutable_data["identification_type"] = Patient.IdentificationType.CEDULA
            mutable_data["identification_number"] = legacy_number
        return super().to_internal_value(mutable_data)

    def _identity_conflict_exists(self, identification_type, identification_number):
        key = normalize_identification_key(
            identification_type,
            identification_number,
        )
        if key is None:
            return False
        matching_patients = (
            Patient.objects.annotate(
                _normalized_identification=identification_key_expression(),
            )
            .filter(
                identification_type=identification_type,
                _normalized_identification=key,
            )
        )
        if self.instance:
            matching_patients = matching_patients.exclude(pk=self.instance.pk)
        return matching_patients.exists()

    def validate(self, attrs):
        attrs = super().validate(attrs)
        current_type = self.instance.identification_type if self.instance else None
        current_number = self.instance.identification_number if self.instance else None
        identification_type = attrs.get("identification_type", current_type)
        identification_number = attrs.get("identification_number", current_number)

        if identification_type == "":
            identification_type = None
        identification_number = normalize_identification_number(identification_number)
        if identification_type == Patient.IdentificationType.CEDULA and identification_number:
            formatted_number = format_cedula(identification_number)
            identity_changed = (
                not self.instance
                or "identification_type" in attrs
                or "identification_number" in attrs
            )
            if identity_changed and formatted_number is None:
                raise serializers.ValidationError({
                    "identification_number": [
                        "Usa el formato de cédula 281-090403-1006K: "
                        "tres dígitos, seis dígitos y cuatro dígitos más una letra."
                    ],
                })
            identification_number = formatted_number or identification_number

        if identification_number and not identification_type:
            raise serializers.ValidationError({
                "identification_type": [
                    "Selecciona el tipo correspondiente al número de identificación."
                ],
            })
        if identification_type and not identification_number:
            raise serializers.ValidationError({
                "identification_number": [
                    "Indica el número o deja también vacío el tipo de identificación."
                ],
            })

        if "identification_type" in attrs or not self.instance:
            attrs["identification_type"] = identification_type
        if "identification_number" in attrs or "identification_type" in attrs or not self.instance:
            attrs["identification_number"] = identification_number

        for field in ("guardian_name", "guardian_relationship", "guardian_phone"):
            if field in attrs:
                value = attrs[field]
                attrs[field] = value.strip() if value and value.strip() else None

        if self.context.get("quick_create"):
            phone = attrs.get("phone", "")
            if not str(phone or "").strip() and not identification_number:
                raise serializers.ValidationError(
                    "Indica un teléfono o una identificación para registrar al paciente."
                )

        if self._identity_conflict_exists(identification_type, identification_number):
            raise serializers.ValidationError({
                "identification_number": [
                    "Ya existe un paciente con este tipo y número de identificación."
                ],
            })
        return attrs

    def create(self, validated_data):
        record_data = validated_data.pop("clinical_record", {})
        validated_data.pop("clinical_change_reason", None)
        if self.context.get("quick_create"):
            validated_data.setdefault("birth_place", "")
            validated_data.setdefault("gender", "")
        identification_type = validated_data.get("identification_type")
        identification_number = validated_data.get("identification_number")
        try:
            with transaction.atomic():
                patient = super().create(validated_data)
                record = ClinicalRecord.objects.create(patient=patient, **record_data)
                record_revision(patient=patient, instance=record, author=patient.registered_by, reason="Creación del expediente")
                return patient
        except IntegrityError:
            if self._identity_conflict_exists(
                identification_type,
                identification_number,
            ):
                raise serializers.ValidationError(
                    {
                        "identification_number": [
                            "Ya existe un paciente con este tipo y número de identificación."
                        ]
                    }
                )
            raise

    def update(self, instance, validated_data):
        record_data = validated_data.pop("clinical_record", None)
        reason = validated_data.pop("clinical_change_reason", "")
        identification_type = validated_data.get(
            "identification_type",
            instance.identification_type,
        )
        identification_number = validated_data.get(
            "identification_number",
            instance.identification_number,
        )
        try:
            with transaction.atomic():
                locked = Patient.objects.select_for_update().get(pk=instance.pk)
                self.check_version(locked, validated_data)
                instance = locked
                self.instance = instance
                record, _ = ClinicalRecord.objects.get_or_create(patient=locked)
                before = clinical_snapshot(record)
                changed = record_data is not None and any(before.get(field) != clinical_snapshot_value(value) for field, value in record_data.items())
                if changed and settings.REQUIRE_EDIT_VERSION and not reason:
                    raise serializers.ValidationError({"clinical_change_reason": "Indica el motivo del cambio clínico."})
                if changed:
                    record_revision(patient=locked, instance=record, reason="Estado previo a la modificación")
                patient = super().update(instance, validated_data)
                if record_data is not None:
                    record, _ = ClinicalRecord.objects.get_or_create(patient=patient)
                    for field, value in record_data.items():
                        setattr(record, field, value)
                    record.save()
                    if changed:
                        request = self.context.get("request")
                        record_revision(patient=patient, instance=record, author=getattr(request, "user", None), reason=reason or "Actualización en desarrollo")
                return patient
        except IntegrityError:
            if self._identity_conflict_exists(
                identification_type,
                identification_number,
            ):
                raise serializers.ValidationError(
                    {
                        "identification_number": [
                            "Ya existe un paciente con este tipo y número de identificación."
                        ]
                    }
                )
            raise


class ConsultationSerializer(VersionedSerializer):
    consultation_type_display = serializers.CharField(
        source="get_consultation_type_display",
        read_only=True,
    )
    professional_name = serializers.SerializerMethodField()
    professional_specialty = serializers.CharField(
        source="professional.specialty",
        read_only=True,
    )
    professional_phone = serializers.CharField(source="professional.phone", read_only=True)
    professional_registration_number = serializers.CharField(
        source="professional.professional_registration_number",
        read_only=True,
    )
    completed_by_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Consultation
        fields = (
            "id", "patient", "professional", "professional_name",
            "version", "expected_version",
            "professional_specialty", "professional_registration_number", "professional_phone", "completed_at",
            "completed_by", "completed_by_name", "date", "time",
            "consultation_type", "consultation_type_display", "summary", "status",
            "status_display", "examiner_national_id",
            "dental_service", "chief_complaint", "respiratory",
            "cardiovascular", "hepatic_renal", "gastrointestinal", "neurological",
            "blood_system", "reproductive_organs", "heart_rate", "respiratory_rate",
            "blood_pressure", "temperature", "weight", "height", "body_surface_area",
            "bmi", "general_appearance", "skin_and_mucosa",
            "dental_diagnoses", "treatment_plan", "budget",
            "created_at", "updated_at",
        )
        read_only_fields = (
            "id", "patient", "professional", "professional_name",
            "professional_specialty", "professional_registration_number", "professional_phone", "completed_at",
            "completed_by", "completed_by_name",
            "consultation_type_display", "status_display", "created_at", "updated_at",
        )
        extra_kwargs = {
            "date": {"required": True},
            "time": {"required": True, "allow_null": False},
            "consultation_type": {"required": True},
            "summary": {"required": True, "allow_blank": False},
            "status": {"required": True},
        }

    def get_professional_name(self, consultation):
        return consultation.professional.get_full_name().strip() or consultation.professional.email

    def get_completed_by_name(self, consultation):
        if not consultation.completed_by_id:
            return ""
        return (
            consultation.completed_by.get_full_name().strip()
            or consultation.completed_by.email
        )

    def validate(self, attrs):
        attrs = super().validate(attrs)
        instance = self.instance
        requested_status = attrs.get("status")
        if instance is None and requested_status != Consultation.Status.IN_PROGRESS:
            raise serializers.ValidationError(
                {"status": "Las consultas nuevas deben iniciar en progreso."}
            )
        if instance and instance.status in (
            Consultation.Status.COMPLETED,
            Consultation.Status.CANCELLED,
        ) and attrs:
            raise serializers.ValidationError(
                "La consulta cerrada es inmutable mediante el flujo ordinario."
            )
        if instance and requested_status not in (None, instance.status):
            raise serializers.ValidationError(
                {"status": "Utiliza la acción clínica explícita para cambiar el estado."}
            )
        return attrs

    def create(self, validated_data):
        with transaction.atomic():
            consultation = super().create(validated_data)
            create_initial_odontogram_version(consultation)
            record_revision(patient=consultation.patient, instance=consultation, consultation=consultation, author=consultation.professional, reason="Creación de consulta")
            return consultation

    @transaction.atomic
    def update(self, instance, validated_data):
        locked = Consultation.objects.select_for_update().get(pk=instance.pk)
        # Check the clinical state before reporting a revision conflict.
        if locked.status != Consultation.Status.IN_PROGRESS:
            raise serializers.ValidationError("La consulta cerrada es de solo lectura.")
        self.check_version(locked, validated_data)
        self.instance = locked
        before = clinical_snapshot(locked)
        record_revision(patient=locked.patient, instance=locked, consultation=locked, reason="Estado previo a la modificación")
        result = super().update(self.instance, validated_data)
        if before != clinical_snapshot(result):
            request = self.context.get("request")
            record_revision(patient=result.patient, instance=result, consultation=result, author=getattr(request, "user", None), reason="Edición de consulta en progreso")
        return result


class TreatmentItemServiceSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = ClinicService
        fields = (
            "id",
            "name",
            "category_name",
            "duration_minutes",
            "price",
            "is_active",
        )
        read_only_fields = fields


class TreatmentItemConsultationSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Consultation
        fields = ("id", "date")
        read_only_fields = fields


class PlannedOdontogramOverlayItemSerializer(serializers.ModelSerializer):
    treatment_item_id = serializers.IntegerField(source="pk", read_only=True)
    proposed_in = TreatmentItemConsultationSummarySerializer(read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = TreatmentItem
        fields = (
            "treatment_item_id",
            "status",
            "status_display",
            "tooth_code",
            "surfaces",
            "planned_finding",
            "description",
            "proposed_in",
        )
        read_only_fields = fields


class LongitudinalTreatmentItemSerializer(serializers.ModelSerializer):
    service = TreatmentItemServiceSerializer(read_only=True)
    proposed_in = TreatmentItemConsultationSummarySerializer(read_only=True)
    performed_in = TreatmentItemConsultationSummarySerializer(read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = TreatmentItem
        fields = (
            "id",
            "service",
            "description",
            "diagnosis_text",
            "tooth_code",
            "surfaces",
            "planned_finding",
            "status",
            "status_display",
            "unit_price_snapshot",
            "notes",
            "proposed_in",
            "performed_in",
            "performed_at",
            "resulting_odontogram_version",
            "status_reason",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class TreatmentItemSerializer(VersionedSerializer):
    service = TreatmentItemServiceSerializer(read_only=True)
    service_id = serializers.PrimaryKeyRelatedField(
        source="service",
        queryset=ClinicService.objects.select_related("category"),
        allow_null=True,
        required=False,
        write_only=True,
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = TreatmentItem
        fields = (
            "id", "proposed_in", "service", "service_id", "description",
            "version", "expected_version",
            "diagnosis_text", "tooth_code", "surfaces", "planned_finding",
            "status", "status_display", "unit_price_snapshot", "notes",
            "performed_in", "performed_at", "status_reason", "created_at", "updated_at",
            "resulting_odontogram_version",
        )
        read_only_fields = (
            "id", "proposed_in", "service", "status", "status_display",
            "unit_price_snapshot", "performed_in", "performed_at", "status_reason",
            "resulting_odontogram_version",
            "created_at", "updated_at",
        )
        extra_kwargs = {
            "description": {"required": False, "allow_blank": True},
            "tooth_code": {"required": False, "allow_null": True, "allow_blank": True},
        }

    def validate(self, attrs):
        attrs = super().validate(attrs)
        protected = {}
        for field in (
            "proposed_in",
            "status",
            "performed_in",
            "performed_at",
            "resulting_odontogram_version",
            "status_reason",
        ):
            if field in self.initial_data:
                protected[field] = "Este campo es controlado por el flujo clínico."
        if protected:
            raise serializers.ValidationError(protected)

        consultation = self.context["consultation"]
        if consultation.status != Consultation.Status.IN_PROGRESS:
            raise serializers.ValidationError(
                {"detail": "La consulta cerrada no permite modificar tratamientos."}
            )
        if self.instance and self.instance.status != TreatmentItem.Status.PROPOSED:
            raise serializers.ValidationError(
                {"status": "Sólo las propuestas pueden editarse mediante este flujo."}
            )

        service_was_supplied = "service_id" in self.initial_data
        service = attrs.get("service", self.instance.service if self.instance else None)
        service_changed = service_was_supplied and (
            not self.instance
            or (service.pk if service else None) != self.instance.service_id
        )
        if service_changed and service and not service.is_active:
            raise serializers.ValidationError(
                {"service_id": "Selecciona un servicio activo."}
            )

        description_was_supplied = "description" in self.initial_data
        current_description = self.instance.description if self.instance else ""
        description = attrs.get("description", current_description).strip()
        if service_changed:
            if service:
                description = description if description_was_supplied and description else service.name
                attrs["unit_price_snapshot"] = service.price
            else:
                attrs["unit_price_snapshot"] = None
        elif self.instance is None and service:
            description = description or service.name
            attrs["unit_price_snapshot"] = service.price
        elif self.instance and service and description_was_supplied and not description:
            description = current_description

        if not service and not description:
            raise serializers.ValidationError(
                {"description": "Selecciona un servicio o escribe un procedimiento."}
            )
        attrs["description"] = description

        candidate = TreatmentItem(
            proposed_in=consultation,
            service=service,
            description=description,
            diagnosis_text=attrs.get(
                "diagnosis_text",
                self.instance.diagnosis_text if self.instance else "",
            ),
            tooth_code=attrs.get(
                "tooth_code",
                self.instance.tooth_code if self.instance else None,
            ),
            surfaces=attrs.get("surfaces", self.instance.surfaces if self.instance else []),
            planned_finding=attrs.get(
                "planned_finding",
                self.instance.planned_finding if self.instance else "",
            ),
            status=self.instance.status if self.instance else TreatmentItem.Status.PROPOSED,
            unit_price_snapshot=attrs.get(
                "unit_price_snapshot",
                self.instance.unit_price_snapshot if self.instance else None,
            ),
            notes=attrs.get("notes", self.instance.notes if self.instance else ""),
        )
        try:
            candidate.clean()
        except DjangoValidationError as error:
            raise serializers.ValidationError(error.message_dict) from error
        attrs["tooth_code"] = candidate.tooth_code
        return attrs

    def _lock_consultation(self):
        self.context["consultation"] = Consultation.objects.select_for_update().get(
            pk=self.context["consultation"].pk,
        )

    @transaction.atomic
    def create(self, validated_data):
        self._lock_consultation()
        validated_data = self.validate(validated_data)
        return super().create(validated_data)

    @transaction.atomic
    def update(self, instance, validated_data):
        # Same lock order as treatment transitions: item, consultation, patient.
        locked = TreatmentItem.objects.select_for_update().get(pk=instance.pk)
        self._lock_consultation()
        # Revalidate against current state, then consume expected_version.
        previous = self.instance
        self.instance = locked
        validated_data = self.validate(validated_data)
        self.instance = previous
        self.check_version(locked, validated_data)
        self.instance = locked
        return super().update(self.instance, validated_data)


class TreatmentOdontogramResultSerializer(serializers.Serializer):
    tooth_code = serializers.CharField(max_length=2)
    surfaces = serializers.ListField(
        child=serializers.CharField(max_length=16),
        allow_empty=True,
    )
    finding = serializers.CharField(max_length=24)


class TreatmentItemPerformSerializer(serializers.Serializer):
    performed_in = serializers.IntegerField(min_value=1)
    odontogram_result = TreatmentOdontogramResultSerializer(
        allow_null=True,
        required=False,
    )


class TreatmentItemCancelSerializer(serializers.Serializer):
    reason = serializers.CharField(
        allow_blank=True,
        max_length=1000,
        required=False,
        trim_whitespace=True,
    )


class RecentConsultationSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    patient_code = serializers.CharField(source="patient.code", read_only=True)
    professional_name = serializers.CharField(
        source="professional_name_snapshot",
        read_only=True,
    )
    consultation_type_display = serializers.CharField(
        source="get_consultation_type_display",
        read_only=True,
    )
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Consultation
        fields = (
            "id", "patient", "patient_name", "patient_code", "professional_name",
            "date", "time", "consultation_type", "consultation_type_display",
            "status", "status_display",
        )
        read_only_fields = fields


class RecentlyAttendedPatientSerializer(serializers.Serializer):
    id = serializers.IntegerField(source="patient_id", read_only=True)
    code = serializers.CharField(source="patient.code", read_only=True)
    first_name = serializers.CharField(source="patient.first_name", read_only=True)
    last_name = serializers.CharField(source="patient.last_name", read_only=True)
    full_name = serializers.CharField(source="patient.full_name", read_only=True)
    last_attended_date = serializers.DateField(source="date", read_only=True)
    last_attended_time = serializers.TimeField(source="time", read_only=True, allow_null=True)


class OdontogramVersionSerializer(serializers.ModelSerializer):
    professional_name = serializers.SerializerMethodField()
    consultation_date = serializers.DateField(source="consultation.date", read_only=True)
    consultation_type = serializers.CharField(
        source="consultation.consultation_type",
        read_only=True,
    )
    consultation_type_display = serializers.CharField(
        source="consultation.get_consultation_type_display",
        read_only=True,
    )

    class Meta:
        model = OdontogramVersion
        fields = (
            "id",
            "patient",
            "consultation",
            "consultation_date",
            "consultation_type",
            "consultation_type_display",
            "version_number",
            "schema_version",
            "dentition",
            "teeth",
            "changed_teeth",
            "note",
            "based_on",
            "created_by",
            "professional_name",
            "created_at",
        )
        read_only_fields = fields

    def get_professional_name(self, obj):
        return obj.created_by.get_full_name().strip() or obj.created_by.email


class OdontogramVersionSummarySerializer(OdontogramVersionSerializer):
    class Meta(OdontogramVersionSerializer.Meta):
        fields = tuple(
            field for field in OdontogramVersionSerializer.Meta.fields if field != "teeth"
        )
        read_only_fields = fields


class OdontogramRevisionCreateSerializer(serializers.Serializer):
    base_version_id = serializers.IntegerField(min_value=1)
    dentition = serializers.ChoiceField(choices=OdontogramVersion.Dentition.choices)
    teeth = serializers.JSONField()
    note = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        max_length=1000,
    )

    def validate(self, attrs):
        attrs["teeth"] = normalize_teeth_snapshot(
            attrs["teeth"],
            attrs["dentition"],
        )
        return attrs

    def create(self, validated_data):
        return create_odontogram_revision(
            consultation=self.context["consultation"],
            author=self.context["request"].user,
            **validated_data,
        )

    def to_representation(self, instance):
        return OdontogramVersionSerializer(instance, context=self.context).data


class PatientDocumentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()
    content_url = serializers.SerializerMethodField()
    consultation = serializers.SerializerMethodField()
    tooth_code = serializers.SerializerMethodField()

    class Meta:
        model = PatientDocument
        fields = (
            "id",
            "consultation",
            "tooth_code",
            "category",
            "document_date",
            "notes",
            "original_name",
            "mime_type",
            "size_bytes",
            "uploaded_by",
            "uploaded_by_name",
            "created_at",
            "content_url",
        )
        read_only_fields = fields

    def get_uploaded_by_name(self, document):
        return document.uploaded_by.get_full_name().strip() or document.uploaded_by.email

    def get_content_url(self, document):
        return reverse(
            "patients:patient-document-content",
            kwargs={"patient_pk": document.patient_id, "pk": document.pk},
        )

    def can_view_clinical_context(self):
        if hasattr(self, "_can_view_clinical_context"):
            return self._can_view_clinical_context
        request = self.context.get("request")
        self._can_view_clinical_context = bool(
            request
            and user_has_permission(request.user, "consultations.view")
        )
        return self._can_view_clinical_context

    def get_consultation(self, document):
        if not self.can_view_clinical_context() or not document.consultation_id:
            return None
        return TreatmentItemConsultationSummarySerializer(document.consultation).data

    def get_tooth_code(self, document):
        if not self.can_view_clinical_context():
            return None
        return document.tooth_code


def validate_patient_document_context(attrs, *, patient, request, instance=None):
    context_submitted = "consultation" in attrs or "tooth_code" in attrs
    if context_submitted and not user_has_permission(request.user, "consultations.view"):
        raise PermissionDenied(
            "No tienes permiso para vincular contexto clínico al documento."
        )

    consultation = attrs.get(
        "consultation",
        instance.consultation if instance is not None else None,
    )
    if consultation is not None and consultation.patient_id != patient.pk:
        raise serializers.ValidationError({
            "consultation_id": "La consulta debe pertenecer al mismo paciente."
        })

    category = attrs.get(
        "category",
        instance.category if instance is not None else "",
    )
    if is_clinical_photo_category(category):
        mime_types = (
            [instance.mime_type]
            if instance is not None
            else [item.content_type.lower() for item in attrs.get("files", ())]
        )
        if any(not mime_type.startswith("image/") for mime_type in mime_types):
            raise serializers.ValidationError({
                "category": "Una fotografía clínica debe ser un archivo de imagen válido."
            })
    return attrs


class PatientDocumentContextInputMixin:
    def validate_tooth_code(self, value):
        if value is None or not value.strip():
            return None
        normalized = value.strip()
        if normalized not in PERMANENT_TEETH | PRIMARY_TEETH:
            raise serializers.ValidationError("Indica una pieza válida en formato FDI.")
        return normalized


class PatientDocumentBatchUploadSerializer(
    PatientDocumentContextInputMixin,
    serializers.Serializer,
):
    consultation_id = serializers.PrimaryKeyRelatedField(
        source="consultation",
        queryset=Consultation.objects.all(),
        required=False,
        allow_null=True,
    )
    tooth_code = serializers.CharField(
        required=False,
        allow_null=True,
        allow_blank=True,
        max_length=2,
        trim_whitespace=True,
    )
    files = serializers.ListField(
        child=serializers.FileField(),
        min_length=1,
        max_length=MAX_BATCH_FILES,
    )
    category = serializers.CharField(max_length=80)
    document_date = serializers.DateField(required=False, default=clinic_today)
    notes = serializers.CharField(required=False, allow_blank=True, default="", max_length=2000)

    def validate_category(self, value):
        normalized = normalize_category(value)
        if not normalized:
            raise serializers.ValidationError("Indica una categoría para los documentos.")
        return normalized

    def validate_files(self, files):
        if sum(uploaded_file.size for uploaded_file in files) > MAX_BATCH_SIZE:
            raise serializers.ValidationError("El lote puede pesar como máximo 50 MB.")
        cleaned = [validate_document_file(uploaded_file) for uploaded_file in files]
        if sum(uploaded_file.size for uploaded_file in cleaned) > MAX_BATCH_SIZE:
            raise serializers.ValidationError("El lote procesado supera 50 MB.")
        return cleaned

    def validate(self, attrs):
        return validate_patient_document_context(
            attrs,
            patient=self.context["patient"],
            request=self.context["request"],
        )

    def create(self, validated_data):
        files = validated_data.pop("files")
        patient = self.context["patient"]
        uploaded_by = self.context["request"].user
        created = []
        try:
            with transaction.atomic():
                for uploaded_file in files:
                    document = PatientDocument(
                        patient=patient,
                        uploaded_by=uploaded_by,
                        original_name=safe_original_name(uploaded_file.name),
                        mime_type=uploaded_file.content_type.lower(),
                        size_bytes=uploaded_file.size,
                        **validated_data,
                    )
                    save_tracked_upload(document.file, uploaded_file, self.context["request"])
                    document.save(force_insert=True)
                    created.append(document)
        except Exception:
            cleanup_created_uploads(self.context["request"])
            raise
        return created

    def to_representation(self, instance):
        return PatientDocumentSerializer(instance, many=True, context=self.context).data


class PatientDocumentMetadataUpdateSerializer(
    PatientDocumentContextInputMixin,
    serializers.ModelSerializer,
):
    consultation_id = serializers.PrimaryKeyRelatedField(
        source="consultation",
        queryset=Consultation.objects.all(),
        required=False,
        allow_null=True,
    )
    tooth_code = serializers.CharField(
        required=False,
        allow_null=True,
        allow_blank=True,
        max_length=2,
        trim_whitespace=True,
    )

    class Meta:
        model = PatientDocument
        fields = (
            "category",
            "document_date",
            "notes",
            "consultation_id",
            "tooth_code",
        )
        extra_kwargs = {
            "category": {"required": False},
            "document_date": {"required": False},
            "notes": {"required": False},
        }

    def validate_category(self, value):
        normalized = normalize_category(value)
        if not normalized:
            raise serializers.ValidationError("Indica una categoría para el documento.")
        return normalized

    def validate(self, attrs):
        return validate_patient_document_context(
            attrs,
            patient=self.context["patient"],
            request=self.context["request"],
            instance=self.instance,
        )

    def to_representation(self, instance):
        return PatientDocumentSerializer(instance, context=self.context).data
