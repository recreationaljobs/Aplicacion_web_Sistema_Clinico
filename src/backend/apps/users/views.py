import mimetypes
import time
import logging
from smtplib import SMTPException

from rest_framework import status
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
import resend
from django.db import transaction
from django.db.models import F
from django.db.models.deletion import ProtectedError
from django.http import FileResponse, Http404
from django.middleware.csrf import get_token
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie

from rest_framework import filters, generics
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework import serializers

from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from apps.common.pagination import StandardPageNumberPagination

from .serializers import (
    ChangePasswordSerializer,
    CurrentUserProfileSerializer,
    CookieTokenRefreshSerializer,
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RolePermissionPresetSerializer,
    UserAdminSerializer,
    UserAdminUpdateSerializer,
)

from .models import RolePermissionPreset, User
from .login_limiter import LoginAttemptLimiter, WINDOW_SECONDS
from .permissions import PERMISSION_CATALOG
from .session import clear_refresh_cookie, set_refresh_cookie
from .authentication import LogoutJWTAuthentication
from .file_cleanup import schedule_file_deletion


PASSWORD_RESET_MESSAGE = (
    "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña."
)


@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    permission_classes = []
    authentication_classes = []

    def post(self, request):
        if (
            not isinstance(request.data, dict)
            or not isinstance(request.data.get("email", ""), str)
        ):
            raise serializers.ValidationError(
                {"email": "Indica un correo electrónico válido."}
            )

        limiter = LoginAttemptLimiter(
            request,
            request.data.get("email", ""),
        )

        if limiter.is_blocked():
            return Response(
                {
                    "detail": (
                        "Demasiados intentos. "
                        "Intenta nuevamente más tarde."
                    )
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={
                    "Retry-After": str(WINDOW_SECONDS)
                },
            )

        serializer = LoginSerializer(
            data=request.data,
            context={"request": request},
        )

        try:
            serializer.is_valid(raise_exception=True)

        except serializers.ValidationError:
            limiter.record_failure()
            raise

        limiter.clear_account()

        payload = dict(serializer.validated_data)

        refresh = payload.pop("refresh")

        request._request.audit_actor = serializer.user

        response = Response(
            payload,
            status=status.HTTP_200_OK,
        )

        set_refresh_cookie(
            response,
            refresh,
        )

        return response


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfCookieView(APIView):
    permission_classes = []
    authentication_classes = []

    def get(self, request):
        csrf_token = get_token(request)

        return Response(
            {
                "csrfToken": csrf_token,
            },
            status=status.HTTP_200_OK,
        )


@method_decorator(csrf_protect, name="dispatch")
class CookieTokenRefreshView(APIView):
    permission_classes = []
    authentication_classes = []

    def post(self, request):
        refresh = request.COOKIES.get(
            settings.REFRESH_COOKIE_NAME
        )

        if not refresh:
            return Response(
                {
                    "detail": "La sesión ya no es válida."
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

        serializer = CookieTokenRefreshSerializer(
            data={
                "refresh": refresh
            }
        )

        try:
            serializer.is_valid(
                raise_exception=True
            )

        except (
            serializers.ValidationError,
            TokenError,
        ):
            response = Response(
                {
                    "detail": "La sesión ya no es válida."
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

            clear_refresh_cookie(response)

            return response

        payload = dict(
            serializer.validated_data
        )

        rotated_refresh = payload.pop(
            "refresh",
            None,
        )

        request._request.audit_actor = (
            serializer.user
        )

        response = Response(
            payload,
            status=status.HTTP_200_OK,
        )

        if rotated_refresh:
            absolute_expiry = RefreshToken(
                rotated_refresh
            )["session_expires_at"]

            set_refresh_cookie(
                response,
                rotated_refresh,
                absolute_expiry - time.time(),
            )

        return response


class CurrentUserView(APIView):
    permission_classes = [
        IsAuthenticated
    ]

    def get(self, request):
        serializer = CurrentUserProfileSerializer(
            request.user,
            context={
                "request": request,
                "avatar_route": (
                    "users:current-user-avatar"
                ),
            },
        )

        return Response(
            serializer.data
        )

    def patch(self, request):
        serializer = CurrentUserProfileSerializer(
            request.user,
            data=request.data,
            partial=True,
            context={
                "request": request,
                "avatar_route": (
                    "users:current-user-avatar"
                ),
            },
        )

        serializer.is_valid(
            raise_exception=True
        )

        serializer.save()

        return Response(
            serializer.data
        )


class UserAvatarView(APIView):
    permission_classes = [
        IsAuthenticated
    ]

    def get(
        self,
        request,
        pk=None,
    ):
        user = (
            request.user
            if pk is None
            else get_object_or_404(
                User,
                pk=pk,
            )
        )

        if (
            user.pk != request.user.pk
            and request.user.role
            != User.Role.ADMINISTRADOR
        ):
            return Response(
                status=status.HTTP_403_FORBIDDEN
            )

        if not user.avatar:
            raise Http404

        content_type = (
            mimetypes.guess_type(
                user.avatar.name
            )[0]
            or "application/octet-stream"
        )

        response = FileResponse(
            user.avatar.open("rb"),
            content_type=content_type,
        )

        response[
            "Content-Disposition"
        ] = "inline"

        response[
            "Cache-Control"
        ] = "private, no-store"

        response[
            "X-Content-Type-Options"
        ] = "nosniff"

        return response


@method_decorator(csrf_protect, name="dispatch")
class LogoutView(APIView):
    permission_classes = []
    authentication_classes = [
        LogoutJWTAuthentication
    ]

    @transaction.atomic
    def post(self, request):
        user = (
            request.user
            if request.user.is_authenticated
            else None
        )

        refresh = request.COOKIES.get(
            settings.REFRESH_COOKIE_NAME
        )

        if refresh:
            try:
                token = RefreshToken(
                    refresh
                )

                if user is None:
                    user = (
                        User.objects
                        .filter(
                            pk=token["user_id"],
                            token_version=token.get(
                                "token_version"
                            ),
                        )
                        .first()
                    )

                if (
                    user
                    and str(
                        token["user_id"]
                    )
                    == str(user.pk)
                ):
                    token.blacklist()

            except TokenError:
                pass

        if user:
            (
                User.objects
                .filter(
                    pk=user.pk,
                    token_version=(
                        user.token_version
                    ),
                )
                .update(
                    token_version=(
                        F("token_version")
                        + 1
                    )
                )
            )

            request._request.audit_actor = (
                user
            )

        response = Response(
            status=status.HTTP_204_NO_CONTENT
        )

        clear_refresh_cookie(
            response
        )

        return response


class PasswordResetRequestView(APIView):
    permission_classes = []
    authentication_classes = []
    throttle_classes = [
        ScopedRateThrottle
    ]
    throttle_scope = "password_reset"

    def post(self, request):
        serializer = (
            PasswordResetRequestSerializer(
                data=request.data
            )
        )

        if not settings.PASSWORD_RESET_ENABLED:
            return Response(
                {
                    "detail": (
                        "En la demo, solicita al "
                        "administrador que cambie "
                        "tu contraseña."
                    )
                },
                status=403,
            )

        serializer.is_valid(
            raise_exception=True
        )

        user = (
            get_user_model()
            .objects
            .filter(
                email__iexact=(
                    serializer
                    .validated_data["email"]
                ),
                is_active=True,
            )
            .first()
        )

        if user:
            uid = urlsafe_base64_encode(
                force_bytes(
                    user.pk
                )
            )

            token = (
                default_token_generator
                .make_token(
                    user
                )
            )

            reset_url = (
                f"{settings.FRONTEND_URL}"
                f"/restablecer-contrasena/"
                f"{uid}/{token}"
            )

            try:
                resend.api_key = settings.RESEND_API_KEY

                resend.Emails.send(
                    {
                        "from": settings.RESEND_FROM_EMAIL,
                        "to": [user.email],
                        "subject": "Restablece tu contraseña de DentalClinic",
                        "html": f"""
                            <h2>Restablece tu contraseña</h2>

                            <p>
                                Hola {user.first_name or 'usuario'},
                            </p>

                            <p>
                                Recibimos una solicitud para restablecer
                                la contraseña de tu cuenta.
                            </p>

                            <p>
                                <a href="{reset_url}">
                                    Restablecer contraseña
                                </a>
                            </p>

                            <p>
                                Este enlace vence en 60 minutos.
                            </p>

                            <p>
                                Si no solicitaste este cambio,
                                puedes ignorar este mensaje.
                            </p>
                        """,
                    }
                )

            except Exception:
                logging.getLogger(
                    "dentalclinic.mail"
                ).exception(
                    "Password reset delivery failed",
                    extra={
                        "request_id": getattr(
                            request,
                            "request_id",
                            "",
                        )
                    },
                )
        return Response(
            {
                "detail": (
                    PASSWORD_RESET_MESSAGE
                )
            },
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmView(APIView):
    permission_classes = []
    authentication_classes = []
    throttle_classes = [
        ScopedRateThrottle
    ]
    throttle_scope = "password_reset"

    def post(self, request):
        serializer = (
            PasswordResetConfirmSerializer(
                data=request.data,
                context={
                    "user_model": (
                        get_user_model()
                    )
                },
            )
        )

        if not settings.PASSWORD_RESET_ENABLED:
            return Response(
                {
                    "detail": (
                        "La recuperación por "
                        "correo está deshabilitada "
                        "en la demo."
                    )
                },
                status=403,
            )

        serializer.is_valid(
            raise_exception=True
        )

        serializer.save()

        return Response(
            {
                "detail": (
                    "Tu contraseña fue "
                    "restablecida correctamente."
                )
            },
            status=status.HTTP_200_OK,
        )


class ChangePasswordView(APIView):
    permission_classes = [
        IsAuthenticated
    ]

    def post(self, request):
        serializer = (
            ChangePasswordSerializer(
                data=request.data,
                context={
                    "request": request
                },
            )
        )

        serializer.is_valid(
            raise_exception=True
        )

        serializer.save()

        response = Response(
            {
                "detail": (
                    "Tu contraseña fue "
                    "actualizada correctamente."
                )
            },
            status=status.HTTP_200_OK,
        )

        clear_refresh_cookie(
            response
        )

        return response


class IsAdministrator(BasePermission):

    def has_permission(
        self,
        request,
        view,
    ):
        return (
            request.user.is_authenticated
            and request.user.role
            == User.Role.ADMINISTRADOR
        )


AUDITABLE_STAFF_FIELDS = {
    "avatar",
    "email",
    "first_name",
    "is_active",
    "last_name",
    "phone",
    "professional_registration_number",
    "remove_avatar",
    "role",
    "specialty",
}


def set_staff_audit_fields(
    request,
    validated_data,
):
    raw_request = getattr(
        request,
        "_request",
        request,
    )

    raw_request.audit_changed_fields = sorted(
        field
        for field in validated_data
        if field in AUDITABLE_STAFF_FIELDS
    )


class UserCollectionView(
    generics.ListCreateAPIView
):
    permission_classes = [
        IsAuthenticated,
        IsAdministrator,
    ]

    serializer_class = (
        UserAdminSerializer
    )

    queryset = (
        User.objects.order_by(
            "first_name",
            "email",
        )
    )

    pagination_class = (
        StandardPageNumberPagination
    )

    filter_backends = [
        filters.SearchFilter
    ]

    search_fields = (
        "email",
        "first_name",
        "last_name",
    )

    def get_queryset(self):
        queryset = (
            super().get_queryset()
        )

        staff_status = (
            self.request
            .query_params
            .get(
                "status",
                "all",
            )
        )

        if staff_status == "active":
            return queryset.filter(
                is_active=True
            )

        if staff_status == "archived":
            return queryset.filter(
                is_active=False
            )

        if staff_status == "all":
            return queryset

        raise serializers.ValidationError(
            {
                "status": (
                    "Usa active, archived o all."
                )
            }
        )

    def perform_create(
        self,
        serializer,
    ):
        set_staff_audit_fields(
            self.request,
            serializer.validated_data,
        )

        serializer.save()


class UserDetailView(
    generics.UpdateAPIView
):
    permission_classes = [
        IsAuthenticated,
        IsAdministrator,
    ]

    serializer_class = (
        UserAdminUpdateSerializer
    )

    queryset = (
        User.objects.all()
    )

    def perform_update(
        self,
        serializer,
    ):
        was_active = (
            serializer.instance.is_active
        )

        set_staff_audit_fields(
            self.request,
            serializer.validated_data,
        )

        user = serializer.save()

        if (
            was_active
            != user.is_active
        ):
            (
                self.request
                ._request
                .audit_action
            ) = (
                "USER_REACTIVATED"
                if user.is_active
                else "USER_ARCHIVED"
            )

    def delete(
        self,
        request,
        *args,
        **kwargs,
    ):
        user = self.get_object()

        if user.pk == request.user.pk:
            return Response(
                {
                    "detail": (
                        "No puedes eliminar "
                        "tu propia cuenta."
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )

        avatar_name = user.avatar.name

        try:
            with transaction.atomic():
                user.delete()

        except ProtectedError:
            return Response(
                {
                    "detail": (
                        "Este usuario tiene "
                        "historial asociado y "
                        "no puede eliminarse. "
                        "Desactívalo para conservar "
                        "la trazabilidad."
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )

        if avatar_name:
            schedule_file_deletion(
                "avatar",
                avatar_name,
            )

        return Response(
            status=status.HTTP_204_NO_CONTENT
        )


class RolePermissionPresetCollectionView(
    APIView
):
    permission_classes = [
        IsAuthenticated,
        IsAdministrator,
    ]

    def get(
        self,
        request,
    ):
        presets = (
            RolePermissionPreset
            .objects
            .order_by(
                "role"
            )
        )

        return Response(
            {
                "available_permissions": list(
                    PERMISSION_CATALOG
                ),
                "presets": (
                    RolePermissionPresetSerializer(
                        presets,
                        many=True,
                    ).data
                ),
            }
        )


class RolePermissionPresetDetailView(
    APIView
):
    permission_classes = [
        IsAuthenticated,
        IsAdministrator,
    ]

    def patch(
        self,
        request,
        role,
    ):
        preset = get_object_or_404(
            RolePermissionPreset,
            role=role,
        )

        serializer = (
            RolePermissionPresetSerializer(
                preset,
                data=request.data,
            )
        )

        serializer.is_valid(
            raise_exception=True
        )

        serializer.save()

        return Response(
            serializer.data
        )