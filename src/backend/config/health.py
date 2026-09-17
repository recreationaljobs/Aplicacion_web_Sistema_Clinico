from django.db import DatabaseError, connection
from django.conf import settings
from django.core.cache import cache
from redis.exceptions import RedisError
from django.http import JsonResponse
from django.views.decorators.http import require_GET


@require_GET
def features(request):
    return JsonResponse({
        "demo": settings.DEMO_MODE,
        "uploads": settings.UPLOADS_ENABLED,
        "password_reset": settings.PASSWORD_RESET_ENABLED,
    })


@require_GET
def live(request):
    return JsonResponse({"status": "ok"})


@require_GET
def ready(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        cache.get("health:readiness")
    except (DatabaseError, RedisError, ConnectionError, TimeoutError, OSError):
        return JsonResponse({"status": "unavailable"}, status=503)
    return JsonResponse({"status": "ok"})
