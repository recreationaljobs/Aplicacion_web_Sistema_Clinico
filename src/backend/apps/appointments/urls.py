from django.urls import path
from .views import AppointmentUndoCheckInView

from .views import (
    AppointmentCheckInView,
    AppointmentDetailView,
    AppointmentRescheduleHistoryView,
    AppointmentListCreateView,
    AppointmentStartAttendanceView,
    DentistAvailabilityView,
)


app_name = "appointments"


urlpatterns = [
    path("<int:pk>/undo-check-in/", AppointmentUndoCheckInView.as_view(), name="appointment-undo-check-in"),
    path("", AppointmentListCreateView.as_view(), name="appointment-list-create"),
    path(
        "dentists/availability/",
        DentistAvailabilityView.as_view(),
        name="dentist-availability",
    ),
    path(
        "<int:pk>/reschedule-history/",
        AppointmentRescheduleHistoryView.as_view(),
        name="appointment-reschedule-history",
    ),
    path(
        "<int:pk>/check-in/",
        AppointmentCheckInView.as_view(),
        name="appointment-check-in",
    ),
    path(
        "<int:pk>/start-attendance/",
        AppointmentStartAttendanceView.as_view(),
        name="appointment-start-attendance",
    ),
    path("<int:pk>/", AppointmentDetailView.as_view(), name="appointment-detail"),
]
