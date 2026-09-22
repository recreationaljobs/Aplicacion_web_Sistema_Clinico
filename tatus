"""
URL configuration for django_project project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from . import health

urlpatterns = [
    path('api/system/features/', health.features, name='system-features'),
    path('health/live/', health.live, name='health-live'),
    path('health/ready/', health.ready, name='health-ready'),
    path('api/auth/', include('apps.users.urls', namespace='users')),
    path('api/patients/', include('apps.patients.urls', namespace='patients')),
    path('api/appointments/', include('apps.appointments.urls', namespace='appointments')),
    path('api/clinics/', include('apps.clinics.urls', namespace='clinics')),
    path('api/audit/', include('apps.audit.urls', namespace='audit')),
]

if settings.ENABLE_DJANGO_ADMIN:
    urlpatterns.insert(0, path('admin/', admin.site.urls))

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
