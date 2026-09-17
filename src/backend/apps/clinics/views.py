from zoneinfo import available_timezones

from rest_framework import generics
from rest_framework import status
from rest_framework.permissions import BasePermission, IsAuthenticated, SAFE_METHODS
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.models import User

from .models import BusinessHour, ClinicProfile, ClinicService, HolidayClosure, ServiceCategory
from .locking import serialized_schedule
from .availability import conflict_validation_error, future_appointment_conflicts
from .serializers import (
    BusinessHoursSerializer,
    ClinicProfileSerializer,
    ClinicServiceSerializer,
    HolidayClosureSerializer,
    ServiceCategorySerializer,
    serialize_business_hours,
)


class IsAdministratorOrReadOnly(BasePermission):
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return request.user.is_authenticated
        return request.user.is_authenticated and request.user.role == User.Role.ADMINISTRADOR


class ClinicProfileView(APIView):
    permission_classes = (IsAuthenticated, IsAdministratorOrReadOnly)

    def get(self, request):
        return Response(ClinicProfileSerializer(ClinicProfile.load(), context={"request": request}).data)

    @serialized_schedule()
    def patch(self, request):
        serializer = ClinicProfileSerializer(
            ClinicProfile.load(), data=request.data, partial=True, context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class ClinicProfileOptionsView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        return Response({
            "currencies": [
                {"value": value, "label": label} for value, label in ClinicProfile.Currency.choices
            ],
            "timezones": sorted(available_timezones()),
        })


class BusinessHoursView(APIView):
    permission_classes = (IsAuthenticated, IsAdministratorOrReadOnly)

    def get(self, request):
        return Response(serialize_business_hours(BusinessHour.objects.prefetch_related("breaks")))

    @serialized_schedule()
    def put(self, request):
        serializer = BusinessHoursSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        conflicts = future_appointment_conflicts(days=serializer.validated_data["days"])
        if conflicts:
            return Response(conflict_validation_error(conflicts), status=status.HTTP_400_BAD_REQUEST)
        days = serializer.save()
        return Response(serialize_business_hours(days))


class HolidayClosureListCreateView(generics.ListCreateAPIView):
    queryset = HolidayClosure.objects.all()
    serializer_class = HolidayClosureSerializer
    permission_classes = (IsAuthenticated, IsAdministratorOrReadOnly)

    @serialized_schedule()
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        conflicts = future_appointment_conflicts(closure=serializer.validated_data)
        if conflicts:
            return Response(conflict_validation_error(conflicts), status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class HolidayClosureDetailView(generics.UpdateAPIView):
    queryset = HolidayClosure.objects.all()
    serializer_class = HolidayClosureSerializer
    permission_classes = (IsAuthenticated, IsAdministratorOrReadOnly)
    http_method_names = ("patch", "head", "options")

    @serialized_schedule()
    def update(self, request, *args, **kwargs):
        current = self.get_object()
        serializer = self.get_serializer(current, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        closure = {
            "date": serializer.validated_data.get("date", current.date),
            "repeats_annually": serializer.validated_data.get(
                "repeats_annually", current.repeats_annually,
            ),
            "is_active": serializer.validated_data.get("is_active", current.is_active),
        }
        conflicts = future_appointment_conflicts(closure=closure)
        if conflicts:
            return Response(conflict_validation_error(conflicts), status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data)


class ServiceCategoryListCreateView(generics.ListCreateAPIView):
    queryset = ServiceCategory.objects.all()
    serializer_class = ServiceCategorySerializer
    permission_classes = (IsAuthenticated, IsAdministratorOrReadOnly)


class ServiceCategoryDetailView(generics.UpdateAPIView):
    queryset = ServiceCategory.objects.all()
    serializer_class = ServiceCategorySerializer
    permission_classes = (IsAuthenticated, IsAdministratorOrReadOnly)
    http_method_names = ("patch", "head", "options")


class ClinicServiceListCreateView(generics.ListCreateAPIView):
    serializer_class = ClinicServiceSerializer
    permission_classes = (IsAuthenticated, IsAdministratorOrReadOnly)

    def get_queryset(self):
        queryset = ClinicService.objects.select_related("category")
        active = self.request.query_params.get("active")
        category = self.request.query_params.get("category")
        if active in ("true", "false"):
            queryset = queryset.filter(is_active=active == "true")
        if category:
            try:
                category = int(category)
                if category < 1:
                    raise ValueError
            except (TypeError, ValueError):
                from rest_framework.exceptions import ValidationError
                raise ValidationError({"category": "Indica un identificador entero positivo."})
            queryset = queryset.filter(category_id=category)
        return queryset


class ClinicServiceDetailView(generics.UpdateAPIView):
    queryset = ClinicService.objects.select_related("category")
    serializer_class = ClinicServiceSerializer
    permission_classes = (IsAuthenticated, IsAdministratorOrReadOnly)
    http_method_names = ("patch", "head", "options")
