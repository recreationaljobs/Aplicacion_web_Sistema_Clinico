"""Appointment ownership supplements configurable capabilities."""
from apps.users.models import User
from apps.users.permissions import user_has_permission


def can_view_all_appointments(user):
    return (
        user.role != User.Role.ODONTOLOGO
        and user_has_permission(user, "appointments.view_all")
    )


def scope_appointments_for_user(queryset, user):
    if can_view_all_appointments(user):
        return queryset
    return queryset.filter(dentist=user)
