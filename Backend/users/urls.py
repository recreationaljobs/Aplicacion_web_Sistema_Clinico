from django.urls import path

from .views import (
    CurrentUserView,
    LoginView,
    LogoutView,
)


urlpatterns = [
    path(
        "auth/login/",
        LoginView.as_view(),
        name="login",
    ),

    path(
        "auth/logout/",
        LogoutView.as_view(),
        name="logout",
    ),

    path(
        "auth/me/",
        CurrentUserView.as_view(),
        name="current-user",
    ),
]