from hashlib import sha256
from datetime import UTC, datetime
from pathlib import Path

from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import F
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.reverse import reverse
from rest_framework_simplejwt.serializers import (
    TokenObtainPairSerializer,
    TokenRefreshSerializer,
)
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from apps.common.file_validation import validate_image_content
from apps.common.features import require_uploads_enabled
from apps.common.upload_cleanup import cleanup_created_uploads, save_tracked_upload

from .models import RolePermissionPreset, User
from .file_cleanup import schedule_file_deletion
from .permissions import PERMISSION_CODES, get_effective_permissions, order_permissions


AVATAR_FORMATS = {
    "image/jpeg": {"JPEG"},
    "image/png": {"PNG"},
    "image/webp": {"WEBP"},
}
AVATAR_EXTENSIONS = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}
MAX_AVATAR_SIZE = 2 * 1024 * 1024


def protected_avatar_url(user, route_name, kwargs=None):
    if not user.avatar:
        return ""
    path = reverse(route_name, kwargs=kwargs, request=None)
    version = sha256(user.avatar.name.encode()).hexdigest()[:12]
    return f"{path}?v={version}"


def validate_avatar(uploaded_file):
    require_uploads_enabled()
    extension = Path(uploaded_file.name).suffix.lower()
    content_type = getattr(uploaded_file, "content_type", "").lower()
    if (
        extension not in AVATAR_EXTENSIONS
        or content_type not in AVATAR_FORMATS
        or AVATAR_EXTENSIONS[extension] != content_type
    ):
        raise serializers.ValidationError("Usa una imagen PNG, JPEG o WebP.")
    if uploaded_file.size > MAX_AVATAR_SIZE:
        raise serializers.ValidationError("La foto no puede superar 2 MB.")
    return validate_image_content(
        uploaded_file,
        AVATAR_FORMATS[content_type],
        "El contenido de la imagen no es válido.",
    )


class AvatarUpdateMixin:
    def get_avatar_url(self, user):
        route_name = self.context.get("avatar_route", "users:user-avatar")
        if route_name == "users:current-user-avatar":
            return protected_avatar_url(user, route_name)
        return protected_avatar_url(user, route_name, {"pk": user.pk})

    def validate_avatar(self, value):
        return validate_avatar(value)

    def update(self, instance, validated_data):
        remove_avatar = validated_data.pop("remove_avatar", False)
        old_name = instance.avatar.name
        if remove_avatar:
            validated_data["avatar"] = ""
        request = self.context.get("request", self)
        try:
            uploaded_file = validated_data.get("avatar")
            if hasattr(uploaded_file, "read"):
                save_tracked_upload(instance.avatar, uploaded_file, request)
                validated_data["avatar"] = instance.avatar
            updated = super().update(instance, validated_data)
        except Exception:
            cleanup_created_uploads(request)
            raise
        if old_name and (remove_avatar or "avatar" in validated_data):
            schedule_file_deletion("avatar", old_name)
        return updated


class LoginSerializer(TokenObtainPairSerializer):
    """Emite JWT y devuelve solo los datos públicos necesarios por la interfaz."""

    username_field = "email"
    default_error_messages = {
        "no_active_account": "Correo electrónico o contraseña incorrectos.",
    }

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["token_version"] = user.token_version
        token["session_expires_at"] = token["exp"]
        return token

    def validate(self, attrs):
        email = attrs.get("email", "").strip().lower()
        password = attrs.get("password")
        user = authenticate(request=self.context.get("request"), email=email, password=password)

        if user is None or not user.is_active:
            raise serializers.ValidationError(
                {"detail": "Correo electrónico o contraseña incorrectos."},
                code="authorization",
            )

        self.user = user
        refresh = self.get_token(user)
        return {
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": {
                "id": user.id,
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "phone": user.phone,
                "specialty": user.specialty,
                "professional_registration_number": user.professional_registration_number,
                "avatar_url": protected_avatar_url(user, "users:current-user-avatar"),
                "role": user.role,
                "permissions": get_effective_permissions(user),
            },
        }


class CookieTokenRefreshSerializer(TokenRefreshSerializer):
    def validate(self, attrs):
        token = RefreshToken(attrs["refresh"])
        try:
            user = User.objects.get(pk=token["user_id"], is_active=True)
        except User.DoesNotExist:
            raise serializers.ValidationError("La sesión ya no es válida.") from None
        if token.get("token_version") != user.token_version:
            raise serializers.ValidationError("La sesión ya no es válida.")
        self.user = user
        absolute_expiry = token["session_expires_at"]
        data = super().validate(attrs)
        access = AccessToken(data["access"])
        access["exp"] = min(access["exp"], absolute_expiry)
        data["access"] = str(access)
        if "refresh" in data:
            rotated = RefreshToken(data["refresh"])
            rotated["exp"] = absolute_expiry
            data["refresh"] = str(rotated)
            OutstandingToken.objects.filter(jti=rotated["jti"]).update(
                token=data["refresh"],
                expires_at=datetime.fromtimestamp(absolute_expiry, tz=UTC),
            )
        return data


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        return value.strip().lower()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField(write_only=True)
    token = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)
    confirm_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError(
                {"confirm_password": "Las contraseñas no coinciden."}
            )

        user_model = self.context["user_model"]
        try:
            user_id = force_str(urlsafe_base64_decode(attrs["uid"]))
            user = user_model.objects.get(pk=user_id, is_active=True)
        except (TypeError, ValueError, OverflowError, user_model.DoesNotExist):
            raise serializers.ValidationError(
                {"token": "El enlace no es válido o ha expirado."}
            ) from None

        if not default_token_generator.check_token(user, attrs["token"]):
            raise serializers.ValidationError(
                {"token": "El enlace no es válido o ha expirado."}
            )

        try:
            validate_password(attrs["new_password"], user=user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"new_password": exc.messages}) from exc

        self.user = user
        return attrs

    @transaction.atomic
    def save(self, **kwargs):
        self.user = User.objects.select_for_update().get(pk=self.user.pk)
        if not self.user.is_active or not default_token_generator.check_token(self.user, self.validated_data["token"]):
            raise serializers.ValidationError({"token": "El enlace no es válido o ha expirado."})
        self.user.set_password(self.validated_data["new_password"])
        self.user.token_version += 1
        self.user.save(update_fields=["password", "token_version"])
        return self.user


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False)
    confirm_password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        user = self.context["request"].user
        if not user.check_password(attrs["current_password"]):
            raise serializers.ValidationError(
                {"current_password": "La contraseña actual es incorrecta."}
            )
        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError(
                {"confirm_password": "Las contraseñas no coinciden."}
            )
        if user.check_password(attrs["new_password"]):
            raise serializers.ValidationError(
                {"new_password": "La nueva contraseña debe ser diferente a la actual."}
            )
        try:
            validate_password(attrs["new_password"], user=user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"new_password": exc.messages}) from exc
        return attrs

    @transaction.atomic
    def save(self, **kwargs):
        previous = self.context["request"].user
        user = User.objects.select_for_update().get(pk=previous.pk)
        if not user.is_active or user.token_version != previous.token_version:
            raise AuthenticationFailed("La sesión ya no es válida.")
        if not user.check_password(self.validated_data["current_password"]):
            raise serializers.ValidationError({"current_password": "La contraseña actual cambió."})
        user.set_password(self.validated_data["new_password"])
        user.token_version += 1
        user.save(update_fields=["password", "token_version"])
        return user


class CurrentUserProfileSerializer(AvatarUpdateMixin, serializers.ModelSerializer):
    @transaction.atomic
    def update(self, instance, validated_data):
        locked = User.objects.select_for_update().get(pk=instance.pk)
        if not locked.is_active or locked.token_version != instance.token_version:
            raise AuthenticationFailed("La sesión ya no es válida.")
        return super().update(locked, validated_data)

    avatar_url = serializers.SerializerMethodField()
    remove_avatar = serializers.BooleanField(write_only=True, required=False, default=False)
    current_password = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        trim_whitespace=False,
    )
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "phone",
            "specialty",
            "professional_registration_number",
            "avatar",
            "avatar_url",
            "remove_avatar",
            "current_password",
            "role",
            "permissions",
        )
        read_only_fields = (
            "id",
            "role",
            "permissions",
            "avatar_url",
        )
        extra_kwargs = {"avatar": {"write_only": True, "required": False}}

    def get_permissions(self, user):
        return get_effective_permissions(user)

    def validate_email(self, value):
        email = User.objects.normalize_email(value).strip().lower()
        duplicate = User.objects.filter(email__iexact=email).exclude(pk=self.instance.pk)
        if duplicate.exists():
            raise serializers.ValidationError(
                "Ya existe un usuario con este correo electrónico.",
            )
        return email

    def validate(self, attrs):
        current_password = attrs.pop("current_password", "")
        new_email = attrs.get("email")
        if new_email is not None and new_email != self.instance.email:
            if not current_password:
                raise serializers.ValidationError({
                    "current_password": "Confirma tu contraseña actual para cambiar el correo.",
                })
            if not self.instance.check_password(current_password):
                raise serializers.ValidationError({
                    "current_password": "La contraseña actual es incorrecta.",
                })
        return attrs


class UserAdminSerializer(AvatarUpdateMixin, serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()
    remove_avatar = serializers.BooleanField(write_only=True, required=False, default=False)
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    confirm_password = serializers.CharField(write_only=True, trim_whitespace=False)

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "phone",
            "specialty",
            "professional_registration_number",
            "avatar",
            "avatar_url",
            "remove_avatar",
            "role",
            "is_active",
            "password",
            "confirm_password",
        )
        read_only_fields = ("id", "is_active")
        extra_kwargs = {"avatar": {"write_only": True, "required": False}}

    def validate_email(self, value):
        email = User.objects.normalize_email(value).strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError(
                "Ya existe un usuario con este correo electrónico."
            )
        return email

    def validate(self, attrs):
        if attrs["password"] != attrs["confirm_password"]:
            raise serializers.ValidationError(
                {"confirm_password": "Las contraseñas no coinciden."}
            )
        candidate = User(
            email=attrs.get("email", ""),
            first_name=attrs.get("first_name", ""),
            last_name=attrs.get("last_name", ""),
            role=attrs.get("role", ""),
        )
        try:
            validate_password(attrs["password"], user=candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": exc.messages}) from exc
        return attrs

    def create(self, validated_data):
        validated_data.pop("confirm_password")
        validated_data.pop("remove_avatar", None)
        avatar = validated_data.pop("avatar", None)
        request = self.context.get("request", self)
        try:
            with transaction.atomic():
                user = User.objects.create_user(**validated_data)
                if avatar:
                    save_tracked_upload(user.avatar, avatar, request)
                    user.save(update_fields=["avatar"])
                return user
        except Exception:
            cleanup_created_uploads(request)
            raise


class UserAdminUpdateSerializer(AvatarUpdateMixin, serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()
    remove_avatar = serializers.BooleanField(write_only=True, required=False, default=False)
    new_password = serializers.CharField(
        write_only=True,
        required=False,
        trim_whitespace=False,
    )
    confirm_password = serializers.CharField(
        write_only=True,
        required=False,
        trim_whitespace=False,
    )

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "phone",
            "specialty",
            "professional_registration_number",
            "avatar",
            "avatar_url",
            "remove_avatar",
            "role",
            "is_active",
            "new_password",
            "confirm_password",
        )
        read_only_fields = ("id",)
        extra_kwargs = {"avatar": {"write_only": True, "required": False}}

    def validate_email(self, value):
        email = User.objects.normalize_email(value).strip().lower()
        duplicate = User.objects.filter(email__iexact=email).exclude(pk=self.instance.pk)
        if duplicate.exists():
            raise serializers.ValidationError(
                "Ya existe un usuario con este correo electrónico."
            )
        return email

    def validate(self, attrs):
        request = self.context.get("request")
        if (
            attrs.get("is_active") is False
            and request is not None
            and self.instance.pk == request.user.pk
        ):
            raise serializers.ValidationError({
                "is_active": "No puedes archivar tu propia cuenta.",
            })
        has_new_password = "new_password" in attrs
        has_confirmation = "confirm_password" in attrs
        if has_new_password != has_confirmation:
            missing_field = "confirm_password" if has_new_password else "new_password"
            raise serializers.ValidationError({
                missing_field: "Completa ambos campos de contraseña.",
            })
        if not has_new_password:
            return attrs
        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({
                "confirm_password": "Las contraseñas no coinciden.",
            })
        try:
            validate_password(attrs["new_password"], user=self.instance)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"new_password": exc.messages}) from exc
        return attrs

    @transaction.atomic
    def update(self, instance, validated_data):
        # Serialize administrator changes before locking the target account.
        list(User.objects.select_for_update().filter(
            role=User.Role.ADMINISTRADOR, is_active=True,
        ).order_by("pk").values_list("pk", flat=True))
        instance = User.objects.select_for_update().get(pk=instance.pk)
        loses_admin = (
            instance.role == User.Role.ADMINISTRADOR and instance.is_active
            and (validated_data.get("is_active") is False
                 or validated_data.get("role", instance.role) != User.Role.ADMINISTRADOR)
        )
        if loses_admin and not User.objects.filter(
            role=User.Role.ADMINISTRADOR, is_active=True,
        ).exclude(pk=instance.pk).exists():
            raise serializers.ValidationError({"role": "Debe quedar al menos un administrador activo."})
        revoke_tokens = (
            instance.is_active != validated_data.get("is_active", instance.is_active)
            or instance.role != validated_data.get("role", instance.role)
        )
        new_password = validated_data.pop("new_password", None)
        validated_data.pop("confirm_password", None)
        updated = super().update(instance, validated_data)
        if new_password is not None or revoke_tokens:
            changes = {"token_version": F("token_version") + 1}
            if new_password is not None:
                updated.set_password(new_password)
                changes["password"] = updated.password
            type(updated).objects.filter(pk=updated.pk).update(**changes)
            updated.refresh_from_db(fields=["password", "token_version"])
        return updated


class RolePermissionPresetSerializer(serializers.ModelSerializer):
    permissions = serializers.ListField(
        child=serializers.ChoiceField(choices=PERMISSION_CODES),
        allow_empty=True,
    )

    class Meta:
        model = RolePermissionPreset
        fields = ("role", "permissions")
        read_only_fields = ("role",)

    def validate_permissions(self, value):
        permissions = order_permissions(value)
        if "appointments.view_all" in permissions and "appointments.view" not in permissions:
            raise serializers.ValidationError(
                "appointments.view_all requiere el permiso appointments.view.",
            )
        if "consultations.view_all" in permissions and "consultations.view" not in permissions:
            raise serializers.ValidationError(
                "consultations.view_all requiere el permiso consultations.view.",
            )
        return permissions
