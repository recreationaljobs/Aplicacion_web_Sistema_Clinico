from rest_framework.exceptions import AuthenticationFailed # pyright: ignore[reportMissingImports]
from rest_framework_simplejwt.authentication import JWTAuthentication # pyright: ignore[reportMissingImports]


class VersionedJWTAuthentication(JWTAuthentication):
    """Reject access tokens issued before the user's latest logout."""

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        if validated_token.get("token_version") != user.token_version:
            raise AuthenticationFailed("La sesión ya no es válida.", code="session_revoked")
        return user


class LogoutJWTAuthentication(VersionedJWTAuthentication):
    """An expired/revoked access token must not prevent clearing the cookie."""

    def authenticate(self, request):
        try:
            return super().authenticate(request)
        except AuthenticationFailed:
            return None
