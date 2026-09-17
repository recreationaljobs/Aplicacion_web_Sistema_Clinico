from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from rest_framework import generics
from rest_framework import serializers
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.models import User
from apps.clinics.locking import serialized_schedule
from apps.users.permissions import HasCapability, user_has_permission
from apps.common.pagination import StandardPageNumberPagination
from apps.patients.serializers import ConsultationSerializer

from .models import Appointment, AppointmentRescheduleEvent, BLOCKING_APPOINTMENT_STATUSES
from .services import (
    AppointmentAttendanceError,
    AppointmentCheckInError,
    check_in_appointment,
    start_attendance,
    update_appointment_with_history,
    undo_check_in,
)
from .serializers import (
    DentistAvailabilityQuerySerializer,
    DentistOptionSerializer,
    AppointmentSerializer,
    AppointmentRescheduleEventSerializer,
    has_overlap,
)


APPOINTMENT_CONFLICTS = {
    "appointment_dentist_schedule_excl": {
        "code": "appointment_overlap",
        "conflict": "dentist",
        "detail": "El odontólogo ya tiene una cita en ese horario.",
    },
    "appointment_patient_schedule_excl": {
        "code": "appointment_overlap",
        "conflict": "patient",
        "detail": "El paciente ya tiene una cita en ese horario.",
    },
}


def appointment_integrity_conflict(error):
    cause = error.__cause__
    diagnostic = getattr(cause, "diag", None)
    constraint_name = getattr(diagnostic, "constraint_name", None)
    payload = APPOINTMENT_CONFLICTS.get(constraint_name)
    if payload is None:
        raise error
    return Response(payload, status=status.HTTP_409_CONFLICT)


def can_view_all_appointments(user):
    return user_has_permission(user, "appointments.view_all")


def scope_appointments_for_user(queryset, user):
    if can_view_all_appointments(user):
        return queryset
    return queryset.filter(dentist=user)


def enforce_dentist_assignment_scope(request):
    if can_view_all_appointments(request.user):
        return
    if request.user.role != User.Role.ODONTOLOGO:
        raise PermissionDenied("Sólo puedes gestionar citas asignadas a tu usuario.")
    dentist_id = request.data.get("dentist")
    if dentist_id is not None and str(dentist_id) != str(request.user.pk):
        raise PermissionDenied("Sólo puedes gestionar citas asignadas a tu usuario.")


class AppointmentListCreateView(generics.ListCreateAPIView):
    serializer_class = AppointmentSerializer
    pagination_class = StandardPageNumberPagination
    permission_classes = (IsAuthenticated, HasCapability)
    required_permissions = {
        "GET": "appointments.view",
        "POST": "appointments.create",
    }

    def get_queryset(self):
        queryset = Appointment.objects.select_related("patient", "dentist", "created_by", "service")
        queryset = scope_appointments_for_user(queryset, self.request.user)
        from apps.common.query_parameters import validated_parameter
        from rest_framework import serializers

        params = self.request.query_params
        appointment_date = validated_parameter(params, "date", serializers.DateField())
        date_from = validated_parameter(params, "date_from", serializers.DateField())
        date_to = validated_parameter(params, "date_to", serializers.DateField())
        dentist = validated_parameter(params, "dentist", serializers.IntegerField(min_value=1))
        if date_from and date_to and date_from > date_to:
            raise serializers.ValidationError({"date_to": "Debe ser igual o posterior a date_from."})
        appointment_status = self.request.query_params.get("status")
        if appointment_date:
            queryset = queryset.filter(date=appointment_date)
        else:
            if date_from:
                queryset = queryset.filter(date__gte=date_from)
            if date_to:
                queryset = queryset.filter(date__lte=date_to)
        if dentist:
            queryset = queryset.filter(dentist_id=dentist)
        if appointment_status:
            queryset = queryset.filter(status=appointment_status)
        return queryset

    @serialized_schedule()
    def create(self, request, *args, **kwargs):
        enforce_dentist_assignment_scope(request)
        try:
            with transaction.atomic():
                return super().create(request, *args, **kwargs)
        except IntegrityError as error:
            return appointment_integrity_conflict(error)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, status=Appointment.Status.SCHEDULED)


class AppointmentDetailView(generics.RetrieveUpdateAPIView):
    queryset = Appointment.objects.select_related("patient", "dentist", "created_by", "service")
    serializer_class = AppointmentSerializer
    permission_classes = (IsAuthenticated, HasCapability)
    required_permissions = {
        "GET": "appointments.view",
        "PATCH": "appointments.edit",
        "DELETE": "appointments.edit",
    }
    http_method_names = ("get", "patch", "head", "options")

    def get_queryset(self):
        return scope_appointments_for_user(super().get_queryset(), self.request.user)

    @serialized_schedule()
    def update(self, request, *args, **kwargs):
        try:
            with transaction.atomic():
                instance = get_object_or_404(
                    self.get_queryset().select_for_update(of=("self",)),
                    pk=kwargs["pk"],
                )
                self.check_object_permissions(request, instance)
                enforce_dentist_assignment_scope(request)
                serializer = self.get_serializer(
                    instance,
                    data=request.data,
                    partial=kwargs.pop("partial", False),
                )
                serializer.is_valid(raise_exception=True)
                changes = dict(serializer.validated_data)
                serializer.check_version(instance, changes)
                reschedule_reason = changes.pop("reschedule_reason", "")
                result = update_appointment_with_history(
                    appointment=instance,
                    changes=changes,
                    actor=request.user,
                    reason=reschedule_reason,
                )
                if result.reschedule_event is not None:
                    request._request.audit_action = "APPOINTMENT_RESCHEDULE"
                    request.audit_metadata.update({"appointment_id": instance.pk})
                return Response(
                    self.get_serializer(result.appointment).data,
                )
        except IntegrityError as error:
            return appointment_integrity_conflict(error)


class AppointmentRescheduleHistoryView(generics.ListAPIView):
    serializer_class = AppointmentRescheduleEventSerializer
    pagination_class = StandardPageNumberPagination
    permission_classes = (IsAuthenticated, HasCapability)
    required_permissions = {"GET": "appointments.view"}

    def get_appointment(self):
        if not hasattr(self, "_appointment"):
            self._appointment = get_object_or_404(
                scope_appointments_for_user(Appointment.objects.all(), self.request.user),
                pk=self.kwargs["pk"],
            )
            self.request._request.audit_patient_id = self._appointment.patient_id
        return self._appointment

    def get_queryset(self):
        appointment = self.get_appointment()
        return AppointmentRescheduleEvent.objects.select_related("changed_by").filter(
            appointment=appointment,
        )


class AppointmentStartAttendanceView(APIView):
    permission_classes = (IsAuthenticated, HasCapability)
    required_permissions = {"POST": "consultations.create"}

    def post(self, request, pk):
        appointment = get_object_or_404(
            scope_appointments_for_user(Appointment.objects.all(), request.user),
            pk=pk,
        )
        request._request.audit_patient_id = appointment.patient_id
        try:
            result = start_attendance(appointment_id=appointment.pk, actor=request.user)
        except AppointmentAttendanceError as error:
            payload = {"code": error.code, "detail": error.detail}
            if error.missing_fields:
                payload["missing_fields"] = list(error.missing_fields)
            return Response(
                payload,
                status=status.HTTP_409_CONFLICT,
            )

        request.audit_metadata.update({
            "appointment_id": result.appointment.pk,
            "consultation_id": result.consultation.pk,
        })
        payload = {
            "appointment": AppointmentSerializer(result.appointment).data,
            "consultation": ConsultationSerializer(result.consultation).data,
            "created": result.created,
        }
        response_status = status.HTTP_201_CREATED if result.created else status.HTTP_200_OK
        return Response(payload, status=response_status)


class AppointmentCheckInView(APIView):
    permission_classes = (IsAuthenticated, HasCapability)
    required_permissions = {"POST": "appointments.edit"}

    def post(self, request, pk):
        appointment = get_object_or_404(
            scope_appointments_for_user(Appointment.objects.all(), request.user),
            pk=pk,
        )
        request._request.audit_patient_id = appointment.patient_id
        try:
            result = check_in_appointment(
                appointment_id=appointment.pk,
                actor=request.user,
            )
        except AppointmentCheckInError as error:
            return Response(
                {"code": error.code, "detail": error.detail},
                status=status.HTTP_409_CONFLICT,
            )

        request.audit_metadata.update({"appointment_id": result.appointment.pk})
        return Response(
            {
                "appointment": AppointmentSerializer(result.appointment).data,
                "changed": result.changed,
            },
            status=(
                status.HTTP_201_CREATED
                if result.changed
                else status.HTTP_200_OK
            ),
        )


class AppointmentUndoCheckInView(APIView):
    permission_classes = (IsAuthenticated, HasCapability)
    required_permissions = {"POST": "appointments.edit"}

    def post(self, request, pk):
        appointment = get_object_or_404(scope_appointments_for_user(Appointment.objects.all(), request.user), pk=pk)
        class Payload(serializers.Serializer):
            reason = serializers.CharField(max_length=1000, allow_blank=False)
            expected_version = serializers.IntegerField(min_value=1)
        payload = Payload(data=request.data)
        payload.is_valid(raise_exception=True)
        try:
            result = undo_check_in(appointment_id=appointment.pk, actor=request.user, **payload.validated_data)
        except AppointmentCheckInError as error:
            return Response({"code": error.code, "detail": error.detail}, status=409)
        request._request.audit_action = "APPOINTMENT_UNDO_CHECK_IN"
        request._request.audit_patient_id = result.patient_id
        request.audit_metadata.update({"appointment_id": result.pk, "to_status": result.status})
        return Response(AppointmentSerializer(result).data)


class DentistAvailabilityView(APIView):
    permission_classes = (IsAuthenticated, HasCapability)
    required_permissions = {"GET": "appointments.view"}

    def get(self, request):
        query = DentistAvailabilityQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        values = query.validated_data
        dentists = get_user_model().objects.filter(
            role=User.Role.ODONTOLOGO,
            is_active=True,
        ).order_by("first_name", "last_name", "email")
        if not can_view_all_appointments(request.user):
            if request.user.role == User.Role.ODONTOLOGO:
                dentists = dentists.filter(pk=request.user.pk)
            else:
                dentists = dentists.none()
        dentists = list(dentists)
        occupied = Appointment.objects.filter(date=values["date"], dentist_id__in=[item.pk for item in dentists], status__in=BLOCKING_APPOINTMENT_STATUSES)
        if values.get("exclude_id"):
            occupied = occupied.exclude(pk=values["exclude_id"])
        start = values["start_time"].hour * 60 + values["start_time"].minute
        end = start + values["duration_minutes"]
        blocked = {
            item.dentist_id for item in occupied.only("dentist_id", "start_time", "duration_minutes")
            if item.start_time.hour * 60 + item.start_time.minute < end
            and item.start_time.hour * 60 + item.start_time.minute + item.duration_minutes > start
        }
        available = [dentist for dentist in dentists if dentist.pk not in blocked]
        return Response(DentistOptionSerializer(available, many=True).data)
