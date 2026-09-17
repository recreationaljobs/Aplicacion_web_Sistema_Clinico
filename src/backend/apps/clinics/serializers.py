from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from pathlib import Path

from django.db import transaction
from rest_framework import serializers

from apps.common.file_validation import validate_image_content
from apps.common.features import require_uploads_enabled
from apps.users.file_cleanup import schedule_file_deletion
from apps.common.upload_cleanup import cleanup_created_uploads, save_tracked_upload

from .models import (
    BusinessBreak,
    BusinessHour,
    ClinicProfile,
    ClinicService,
    HolidayClosure,
    ServiceCategory,
)


class ClinicProfileSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()
    remove_logo = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = ClinicProfile
        fields = (
            "id", "name", "phone", "email", "address", "logo",
            "logo_url", "remove_logo", "currency", "timezone",
            "schedule_configured", "updated_at",
        )
        read_only_fields = ("id", "logo_url", "schedule_configured", "updated_at")
        extra_kwargs = {"logo": {"write_only": True, "required": False}}

    def get_logo_url(self, profile):
        if not profile.logo:
            return ""
        request = self.context.get("request")
        return request.build_absolute_uri(profile.logo.url) if request else profile.logo.url

    def validate_logo(self, logo):
        require_uploads_enabled()
        if logo.size > 2 * 1024 * 1024:
            raise serializers.ValidationError("El logo no puede superar 2 MB.")
        if getattr(logo, "content_type", "") not in ("image/png", "image/jpeg", "image/webp"):
            raise serializers.ValidationError("Usa una imagen PNG, JPEG o WebP.")
        if Path(logo.name).suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp"):
            raise serializers.ValidationError("La extensión del logo debe ser PNG, JPEG o WebP.")
        formats = {
            "image/png": {"PNG"},
            "image/jpeg": {"JPEG"},
            "image/webp": {"WEBP"},
        }
        return validate_image_content(
            logo,
            formats[logo.content_type],
            "El contenido del logo no es válido.",
        )

    def validate_timezone(self, value):
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as error:
            raise serializers.ValidationError("Selecciona una zona horaria válida.") from error
        return value

    def update(self, instance, validated_data):
        remove_logo = validated_data.pop("remove_logo", False)
        old_name = instance.logo.name
        if remove_logo:
            validated_data["logo"] = ""
        request = self.context.get("request", self)
        try:
            uploaded_file = validated_data.get("logo")
            if hasattr(uploaded_file, "read"):
                save_tracked_upload(instance.logo, uploaded_file, request)
                validated_data["logo"] = instance.logo
            updated = super().update(instance, validated_data)
        except Exception:
            cleanup_created_uploads(request)
            raise
        if old_name and (remove_logo or "logo" in validated_data):
            schedule_file_deletion("logo", old_name)
        return updated


class BusinessBreakSerializer(serializers.Serializer):
    starts_at = serializers.TimeField()
    ends_at = serializers.TimeField()

    def validate(self, attrs):
        if attrs["starts_at"] >= attrs["ends_at"]:
            raise serializers.ValidationError("La pausa debe terminar después de iniciar.")
        return attrs


class BusinessDaySerializer(serializers.Serializer):
    weekday = serializers.IntegerField(min_value=0, max_value=6)
    weekday_display = serializers.CharField(read_only=True)
    is_open = serializers.BooleanField()
    opens_at = serializers.TimeField(required=False, allow_null=True)
    closes_at = serializers.TimeField(required=False, allow_null=True)
    breaks = BusinessBreakSerializer(many=True, required=False, default=list)

    def validate(self, attrs):
        if not attrs["is_open"]:
            attrs["opens_at"] = None
            attrs["closes_at"] = None
            attrs["breaks"] = []
            return attrs
        opens_at = attrs.get("opens_at")
        closes_at = attrs.get("closes_at")
        if not opens_at or not closes_at or opens_at >= closes_at:
            raise serializers.ValidationError("Indica una hora válida de apertura y cierre.")
        breaks = sorted(attrs.get("breaks", []), key=lambda item: item["starts_at"])
        previous_end = None
        for item in breaks:
            if item["starts_at"] < opens_at or item["ends_at"] > closes_at:
                raise serializers.ValidationError("Todas las pausas deben estar dentro de la jornada.")
            if previous_end and item["starts_at"] < previous_end:
                raise serializers.ValidationError("Las pausas no pueden solaparse.")
            previous_end = item["ends_at"]
        attrs["breaks"] = breaks
        return attrs


class BusinessHoursSerializer(serializers.Serializer):
    days = BusinessDaySerializer(many=True)

    def validate_days(self, days):
        if len(days) != 7 or {day["weekday"] for day in days} != set(range(7)):
            raise serializers.ValidationError("Envía exactamente los siete días de la semana.")
        return sorted(days, key=lambda item: item["weekday"])

    @transaction.atomic
    def save(self):
        saved_days = []
        for day in self.validated_data["days"]:
            breaks = day.pop("breaks")
            business_hour, _ = BusinessHour.objects.update_or_create(
                weekday=day["weekday"],
                defaults=day,
            )
            business_hour.breaks.all().delete()
            BusinessBreak.objects.bulk_create([
                BusinessBreak(business_hour=business_hour, **item) for item in breaks
            ])
            saved_days.append(business_hour)
        profile = ClinicProfile.load()
        profile.schedule_configured = True
        profile.save(update_fields=("schedule_configured", "updated_at"))
        return saved_days


class HolidayClosureSerializer(serializers.ModelSerializer):
    class Meta:
        model = HolidayClosure
        fields = ("id", "name", "date", "repeats_annually", "is_active", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")

class ServiceCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceCategory
        fields = ("id", "name", "position", "is_active", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_name(self, value):
        queryset = ServiceCategory.objects.filter(name__iexact=value.strip())
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("Ya existe una categoría con este nombre.")
        return value.strip()

    def validate(self, attrs):
        if self.instance and attrs.get("is_active") is False and self.instance.services.filter(is_active=True).exists():
            raise serializers.ValidationError("Archiva primero los servicios activos de esta categoría.")
        return attrs


class ClinicServiceSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = ClinicService
        fields = (
            "id", "category", "category_name", "name", "duration_minutes",
            "price", "position", "is_active", "created_at", "updated_at",
        )
        read_only_fields = ("id", "category_name", "created_at", "updated_at")

    def validate_duration_minutes(self, value):
        if value < 15 or value > 240 or value % 15:
            raise serializers.ValidationError("La duración debe ser un bloque de 15 a 240 minutos.")
        return value

    def validate(self, attrs):
        category = attrs.get("category", self.instance.category if self.instance else None)
        name = attrs.get("name", self.instance.name if self.instance else "").strip()
        if not category.is_active:
            raise serializers.ValidationError("Selecciona una categoría activa.")
        queryset = ClinicService.objects.filter(category=category, name__iexact=name)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("Ya existe un servicio con este nombre en la categoría.")
        attrs["name"] = name
        return attrs


def serialize_business_hours(days):
    return {
        "days": [
            {
                "weekday": day.weekday,
                "weekday_display": day.get_weekday_display(),
                "is_open": day.is_open,
                "opens_at": day.opens_at,
                "closes_at": day.closes_at,
                "breaks": list(day.breaks.values("starts_at", "ends_at")),
            }
            for day in days
        ],
    }
