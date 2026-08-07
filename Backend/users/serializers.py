from django.contrib.auth import authenticate
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer


class LoginSerializer(TokenObtainPairSerializer):
    """
    Autenticación mediante nombre de usuario y contraseña.
    """

    username_field = "username"

    default_error_messages = {
        "no_active_account": (
            "Usuario o contraseña incorrectos."
        ),
    }

    def validate(self, attrs):
        username = attrs.get(
            "username",
            ""
        ).strip()

        password = attrs.get("password")

        user = authenticate(
            request=self.context.get("request"),
            username=username,
            password=password
        )

        if user is None or not user.is_active:
            raise serializers.ValidationError(
                {
                    "detail": (
                        "Usuario o contraseña incorrectos."
                    )
                },
                code="authorization",
            )

        refresh = self.get_token(user)

        return {
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "role": user.role,
            },
        }