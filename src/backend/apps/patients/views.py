from django.db import transaction
from django.db.models import Case, F, IntegerField, Q, Value, When, Window
from django.db.models.functions import Coalesce, RowNumber
from django.http import FileResponse, Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils.http import content_disposition_header
from django.utils import timezone
from rest_framework import filters, generics, serializers, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import HasCapability, user_has_permission
from apps.users.models import User
from apps.clinics.availability import clinic_today
from apps.clinics.models import ClinicProfile
from apps.common.pagination import StandardPageNumberPagination

from .models import Consultation, OdontogramVersion, Patient, PatientDocument, TreatmentItem
from .access import (
    patients_visible_to, consultations_visible_to, odontograms_visible_to,
    documents_visible_to, treatments_visible_to, with_dentist_summary,
)
from .clinical_record_pdf import build_clinical_record_pdf
from .odontograms import OdontogramConflict
from .duplicates import find_possible_patient_duplicates
from .services import (
    ConsultationOperationError,
    TreatmentItemOperationError,
    accept_treatment_item,
    cancel_treatment_item,
    cancel_consultation,
    complete_consultation,
    perform_treatment_item,
    require_active_patient,
    require_complete_patient_profile,
)
from .serializers import (
    ConsultationSerializer,
    OdontogramRevisionCreateSerializer,
    OdontogramVersionSerializer,
    OdontogramVersionSummarySerializer,
    PatientDetailSerializer,
    PatientDuplicateCheckSerializer,
    PatientDocumentBatchUploadSerializer,
    PatientDocumentMetadataUpdateSerializer,
    PatientDocumentSerializer,
    PatientOptionSerializer,
    PatientSummarySerializer,
    PossiblePatientDuplicateSerializer,
    PlannedOdontogramOverlayItemSerializer,
    LongitudinalTreatmentItemSerializer,
    RecentConsultationSerializer,
    RecentlyAttendedPatientSerializer,
    TreatmentItemSerializer,
    TreatmentItemConsultationSummarySerializer,
    TreatmentItemCancelSerializer,
    TreatmentItemPerformSerializer,
)


PATIENT_LIST_ORDERING = {
    "code": ("code", "pk"),
    "-code": ("-code", "-pk"),
    "name": ("first_name", "last_name", "second_last_name", "pk"),
    "-name": ("-first_name", "-last_name", "-second_last_name", "-pk"),
    "created_at": ("created_at", "pk"),
    "-created_at": ("-created_at", "-pk"),
    "is_active": ("is_active", "pk"),
    "-is_active": ("-is_active", "-pk"),
}


class CanExportClinicalRecord(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and user_has_permission(request.user, "patients.view")
            and user_has_permission(request.user, "consultations.view")
        )


class PatientClinicalRecordExportView(APIView):
    permission_classes = (IsAuthenticated, CanExportClinicalRecord)

    def get(self, request, pk):
        request._request.audit_action = "CLINICAL_RECORD_EXPORT"
        patient = get_object_or_404(
            patients_visible_to(request.user).select_related("clinical_record"),
            pk=pk,
        )
        clinic = ClinicProfile.objects.filter(pk=1).first() or ClinicProfile()
        content = build_clinical_record_pdf(
            patient=patient,
            clinic=clinic,
            generated_at=timezone.now(),
            include_documents=user_has_permission(request.user, "documents.view"),
            actor=request.user,
        )
        safe_code = "".join(
            character if character.isalnum() or character in "-_" else "-"
            for character in str(patient.code or patient.pk)
        )
        response = HttpResponse(content, content_type="application/pdf")
        response["Content-Disposition"] = content_disposition_header(
            True,
            f"expediente-clinico-{safe_code}.pdf",
        )
        response["Cache-Control"] = "private, no-store"
        response["Pragma"] = "no-cache"
        response["X-Content-Type-Options"] = "nosniff"
        return response


class PatientListCreateView(generics.ListCreateAPIView):
    queryset = Patient.objects.select_related("registered_by").all()
    serializer_class = PatientDetailSerializer
    permission_classes = (IsAuthenticated, HasCapability)
    required_permissions = {
        "GET": "patients.view",
        "POST": "patients.create",
    }
    filter_backends = (filters.SearchFilter,)
    pagination_class = StandardPageNumberPagination
    search_fields = (
        "code",
        "first_name",
        "last_name",
        "second_last_name",
        "identification_number",
        "phone",
        "email",
    )

    def get_queryset(self):
        requested_ordering = self.request.query_params.get(
            "ordering",
            "-created_at",
        ).strip()
        ordering = PATIENT_LIST_ORDERING.get(requested_ordering)
        if ordering is None:
            raise serializers.ValidationError({
                "ordering": (
                    "Selecciona code, name, created_at o is_active, "
                    "con un prefijo - opcional."
                ),
            })
        queryset = patients_visible_to(self.request.user, super().get_queryset())
        if self.request.user.role == User.Role.ODONTOLOGO:
            queryset = with_dentist_summary(queryset, self.request.user)
        return queryset.order_by(*ordering)

    def get_serializer_class(self):
        if self.request.method == "GET":
            return PatientSummarySerializer
        return PatientDetailSerializer

    def get_serializer_context(self):
        return {
            **super().get_serializer_context(),
            "quick_create": (
                self.request.method == "POST"
                and self.request.query_params.get("mode") == "quick"
            ),
        }

    def create(self, request, *args, **kwargs):
        if request.query_params.get("mode") != "quick":
            return super().create(request, *args, **kwargs)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        option_data = PatientOptionSerializer(
            serializer.instance,
            context=self.get_serializer_context(),
        ).data
        return Response(option_data, status=status.HTTP_201_CREATED)

    def perform_create(self, serializer):
        serializer.save(registered_by=self.request.user)


class PatientDetailView(generics.RetrieveUpdateAPIView):
    queryset = Patient.objects.select_related("registered_by").all()
    serializer_class = PatientDetailSerializer
    permission_classes = (IsAuthenticated, HasCapability)
    required_permissions = {
        "GET": "patients.view",
        "PATCH": "patients.edit",
    }
    http_method_names = ("get", "patch", "head", "options")

    def get_queryset(self):
        return patients_visible_to(self.request.user, super().get_queryset())


class PatientOptionListView(generics.ListAPIView):
    serializer_class = PatientOptionSerializer
    permission_classes = (IsAuthenticated, HasCapability)
    required_permissions = {"GET": "appointments.create"}
    filter_backends = (filters.SearchFilter,)
    pagination_class = None
    search_fields = (
        "code",
        "first_name",
        "last_name",
        "second_last_name",
        "identification_number",
        "phone",
    )

    def get_queryset(self):
        search = self.request.query_params.get("search", "").strip()
        if len(search) < 2:
            return Patient.objects.none()
        return patients_visible_to(self.request.user).filter(is_active=True).order_by(
            "first_name",
            "last_name",
            "pk",
        )

    def filter_queryset(self, queryset):
        return super().filter_queryset(queryset)[:20]


class PatientDuplicateCheckPermission(BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        exclude_patient_id = request.data.get("exclude_patient_id")
        permission = (
            "patients.edit"
            if exclude_patient_id not in (None, "")
            else "patients.create"
        )
        return user_has_permission(request.user, permission)


class PatientDuplicateCheckView(APIView):
    permission_classes = (IsAuthenticated, PatientDuplicateCheckPermission)

    def post(self, request):
        serializer = PatientDuplicateCheckSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        matches = find_possible_patient_duplicates(
            **serializer.validated_data, queryset=patients_visible_to(request.user),
        )
        return Response({
            "has_matches": bool(matches),
            "matches": PossiblePatientDuplicateSerializer(matches, many=True).data,
        })


def professional_display_name(user):
    return user.get_full_name().strip() or user.email


def consultation_operation_error_response(error):
    payload = {"code": error.code, "detail": error.detail}
    if error.missing_fields:
        payload["missing_fields"] = list(error.missing_fields)
    return Response(payload, status=status.HTTP_409_CONFLICT)


class RecentConsultationListView(generics.ListAPIView):
    serializer_class = RecentConsultationSerializer
    permission_classes = (IsAuthenticated, HasCapability)
    required_permissions = {"GET": "consultations.view"}

    def get_queryset(self):
        queryset = consultations_visible_to(self.request.user).select_related("patient", "professional")
        if not user_has_permission(self.request.user, "consultations.view_all"):
            queryset = queryset.filter(professional=self.request.user)
        return queryset.order_by("-date", "-time", "-created_at")[:4]


class PatientDashboardSummaryView(APIView):
    permission_classes = (IsAuthenticated, HasCapability)
    required_permissions = {"GET": "patients.view"}

    def get(self, request):
        latest_attendance_order = (
            F("date").desc(),
            F("time").desc(nulls_last=True),
            F("created_at").desc(),
            F("pk").desc(),
        )
        recently_attended = (
            consultations_visible_to(request.user).filter(
                status=Consultation.Status.COMPLETED,
                date__lte=clinic_today(),
            )
            .select_related("patient")
            .annotate(
                patient_rank=Window(
                    expression=RowNumber(),
                    partition_by=(F("patient_id"),),
                    order_by=latest_attendance_order,
                ),
            )
            .filter(patient_rank=1)
            .order_by(*latest_attendance_order)[:4]
        )
        return Response({
            "total_patients": patients_visible_to(request.user).count(),
            "recently_attended": RecentlyAttendedPatientSerializer(
                recently_attended,
                many=True,
            ).data,
        })


class PatientConsultationListView(generics.ListCreateAPIView):
    serializer_class = ConsultationSerializer
    pagination_class = StandardPageNumberPagination
    permission_classes = (IsAuthenticated, HasCapability)
    required_permissions = {
        "GET": "consultations.view",
        "POST": "consultations.create",
    }

    def get_patient(self):
        if not hasattr(self, "_patient"):
            self._patient = get_object_or_404(patients_visible_to(self.request.user), pk=self.kwargs["pk"])
        return self._patient

    def get_serializer_class(self):
        if (
            self.request.method == "GET"
            and self.request.query_params.get("compact", "").lower() == "true"
        ):
            return TreatmentItemConsultationSummarySerializer
        return ConsultationSerializer

    def get_queryset(self):
        patient = self.get_patient()
        if self.request.query_params.get("compact", "").lower() == "true":
            return consultations_visible_to(self.request.user).filter(patient_id=patient.pk).only("id", "date")
        return consultations_visible_to(self.request.user).select_related("professional", "completed_by").filter(
            patient_id=patient.pk
        )

    def create(self, request, *args, **kwargs):
        patient = self.get_patient()
        request._request.audit_patient_id = patient.pk
        if request.user.role == User.Role.ODONTOLOGO:
            return Response({
                "code": "appointment_required",
                "detail": "Inicia la consulta desde una cita asignada, dentro de su horario de atención.",
            }, status=status.HTTP_409_CONFLICT)
        try:
            return super().create(request, *args, **kwargs)
        except ConsultationOperationError as error:
            return consultation_operation_error_response(error)

    def perform_create(self, serializer):
        patient = self.get_patient()
        require_active_patient(patient)
        require_complete_patient_profile(patient)
        serializer.save(
            patient=patient,
            professional=self.request.user,
            professional_name_snapshot=professional_display_name(self.request.user),
        )


class PatientTreatmentItemListView(generics.ListAPIView):
    serializer_class = LongitudinalTreatmentItemSerializer
    pagination_class = StandardPageNumberPagination
    permission_classes = (IsAuthenticated, HasCapability)
    required_permissions = {"GET": "consultations.view"}

    def get_queryset(self):
        patient_id = self.kwargs["pk"]
        get_object_or_404(patients_visible_to(self.request.user), pk=patient_id)
        self.request.audit_patient_id = patient_id
        requested_status = self.request.query_params.get("status", "").strip()
        requested_scope = self.request.query_params.get("scope", "").strip()
        if requested_status and requested_scope:
            raise serializers.ValidationError(
                {"detail": "Utiliza status o scope, no ambos filtros a la vez."}
            )
        if requested_status and requested_status not in TreatmentItem.Status.values:
            raise serializers.ValidationError(
                {"status": "Selecciona un estado de tratamiento válido."}
            )
        if requested_scope and requested_scope not in ("pending", "history"):
            raise serializers.ValidationError(
                {"scope": "Selecciona pending o history."}
            )

        queryset = treatments_visible_to(self.request.user).select_related(
            "proposed_in",
            "performed_in",
            "service",
            "service__category",
        ).filter(proposed_in__patient_id=patient_id)
        if requested_status:
            queryset = queryset.filter(status=requested_status)
        elif requested_scope == "pending":
            queryset = queryset.filter(status__in=(
                TreatmentItem.Status.PROPOSED,
                TreatmentItem.Status.ACCEPTED,
            ))
        elif requested_scope == "history":
            queryset = queryset.filter(status__in=(
                TreatmentItem.Status.PERFORMED,
                TreatmentItem.Status.CANCELLED,
            ))

        pending_order = Case(
            When(status=TreatmentItem.Status.ACCEPTED, then=Value(0)),
            When(status=TreatmentItem.Status.PROPOSED, then=Value(1)),
            default=Value(2),
            output_field=IntegerField(),
        )
        if requested_scope == "pending" or requested_status in (
            TreatmentItem.Status.PROPOSED,
            TreatmentItem.Status.ACCEPTED,
        ):
            return queryset.annotate(_status_order=pending_order).order_by(
                "_status_order",
                "proposed_in__date",
                "pk",
            )
        if requested_scope == "history" or requested_status in (
            TreatmentItem.Status.PERFORMED,
            TreatmentItem.Status.CANCELLED,
        ):
            return queryset.annotate(
                _event_at=Coalesce("performed_at", "updated_at", "created_at")
            ).order_by("-_event_at", "-proposed_in__date", "-pk")
        return queryset.order_by("-updated_at", "-pk")


class PatientPlannedOdontogramOverlayView(generics.ListAPIView):
    serializer_class = PlannedOdontogramOverlayItemSerializer
    pagination_class = None
    permission_classes = (IsAuthenticated, HasCapability)
    required_permissions = {"GET": "consultations.view"}

    def get_queryset(self):
        patient_id = self.kwargs["pk"]
        get_object_or_404(patients_visible_to(self.request.user), pk=patient_id)
        self.request.audit_patient_id = patient_id
        return (
            treatments_visible_to(self.request.user).select_related("proposed_in")
            .filter(
                proposed_in__patient_id=patient_id,
                status__in=(
                    TreatmentItem.Status.PROPOSED,
                    TreatmentItem.Status.ACCEPTED,
                ),
                tooth_code__isnull=False,
            )
            .exclude(tooth_code="")
            .exclude(planned_finding="")
            .order_by("proposed_in__date", "pk")
        )


class PatientConsultationDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = ConsultationSerializer
    permission_classes = (IsAuthenticated, HasCapability)
    required_permissions = {
        "GET": "consultations.view",
        "PATCH": "consultations.edit",
        "DELETE": "consultations.edit",
    }
    http_method_names = ("get", "patch", "head", "options")

    def get_queryset(self):
        return consultations_visible_to(self.request.user).select_related("patient", "professional", "completed_by").filter(
            patient_id=self.kwargs["patient_pk"]
        )


class PatientConsultationOperationView(generics.GenericAPIView):
    serializer_class = ConsultationSerializer
    permission_classes = (IsAuthenticated, HasCapability)
    required_permissions = {"POST": "consultations.edit"}
    operation = None

    def get_queryset(self):
        return consultations_visible_to(self.request.user).filter(patient_id=self.kwargs["patient_pk"])

    def post(self, request, *args, **kwargs):
        consultation = self.get_object()
        request._request.audit_patient_id = consultation.patient_id
        try:
            result = self.operation(
                consultation_id=consultation.pk,
                actor=request.user,
            )
        except ConsultationOperationError as error:
            return consultation_operation_error_response(error)
        request.audit_metadata.update({"consultation_id": result.consultation.pk})
        if result.appointment is not None:
            request.audit_metadata["appointment_id"] = result.appointment.pk
        from apps.appointments.serializers import AppointmentSerializer

        return Response({
            "consultation": ConsultationSerializer(
                result.consultation,
                context=self.get_serializer_context(),
            ).data,
            "appointment": (
                AppointmentSerializer(result.appointment).data
                if result.appointment is not None
                else None
            ),
        })


class PatientConsultationCompleteView(PatientConsultationOperationView):
    operation = staticmethod(complete_consultation)


class PatientConsultationCancelView(PatientConsultationOperationView):
    operation = staticmethod(cancel_consultation)


class ConsultationTreatmentItemMixin:
    permission_classes = (IsAuthenticated, HasCapability)

    def get_consultation(self):
        if not hasattr(self, "_consultation"):
            self._consultation = get_object_or_404(
                consultations_visible_to(self.request.user).select_related("patient"),
                pk=self.kwargs["consultation_pk"],
                patient_id=self.kwargs["patient_pk"],
            )
        return self._consultation

    def get_serializer_context(self):
        return {
            **super().get_serializer_context(),
            "consultation": self.get_consultation(),
        }

    def get_queryset(self):
        consultation = self.get_consultation()
        return treatments_visible_to(self.request.user).select_related("service", "service__category").filter(
            proposed_in=consultation,
        )


class ConsultationTreatmentItemListCreateView(
    ConsultationTreatmentItemMixin,
    generics.ListCreateAPIView,
):
    serializer_class = TreatmentItemSerializer
    required_permissions = {
        "GET": "consultations.view",
        "POST": "consultations.edit",
    }
    pagination_class = None

    def create(self, request, *args, **kwargs):
        try:
            return super().create(request, *args, **kwargs)
        except TreatmentItemOperationError as error:
            return Response(
                {"code": error.code, "detail": error.detail},
                status=status.HTTP_409_CONFLICT,
            )

    def perform_create(self, serializer):
        consultation = self.get_consultation()
        require_active_patient(
            consultation.patient,
            error_class=TreatmentItemOperationError,
        )
        item = serializer.save(proposed_in=consultation)
        self.request.audit_metadata.update({
            "consultation_id": consultation.pk,
            "treatment_item_id": item.pk,
        })


class ConsultationTreatmentItemDetailView(
    ConsultationTreatmentItemMixin,
    generics.RetrieveUpdateAPIView,
):
    serializer_class = TreatmentItemSerializer
    required_permissions = {
        "GET": "consultations.view",
        "PATCH": "consultations.edit",
    }
    http_method_names = ("get", "patch", "head", "options")

    def perform_update(self, serializer):
        item = serializer.save()
        self.request.audit_metadata.update({
            "consultation_id": item.proposed_in_id,
            "treatment_item_id": item.pk,
        })


class ConsultationTreatmentItemOperationView(
    ConsultationTreatmentItemMixin,
    generics.GenericAPIView,
):
    serializer_class = TreatmentItemSerializer
    required_permissions = {"POST": "consultations.edit"}
    operation = None

    def operation_kwargs(self, request):
        return {}

    def post(self, request, *args, **kwargs):
        scoped_item = self.get_object()
        try:
            item = self.operation(
                treatment_item_id=scoped_item.pk,
                actor=request.user,
                **self.operation_kwargs(request),
            )
        except TreatmentItemOperationError as error:
            return Response(
                {"code": error.code, "detail": error.detail},
                status=status.HTTP_409_CONFLICT,
            )
        except Consultation.DoesNotExist as error:
            raise Http404("La consulta de realización no existe.") from error

        transition_from = getattr(item, "_transition_from", scoped_item.status)
        request.audit_metadata.update({
            "consultation_id": item.proposed_in_id,
            "origin_consultation_id": item.proposed_in_id,
            "performed_in_id": item.performed_in_id,
            "treatment_item_id": item.pk,
            "transition": f"{transition_from}->{item.status}",
        })
        if item.resulting_odontogram_version_id is not None:
            request.audit_metadata.update({
                "odontogram_result_registered": True,
                "resulting_odontogram_version_id": item.resulting_odontogram_version_id,
            })
        return Response(
            TreatmentItemSerializer(
                item,
                context=self.get_serializer_context(),
            ).data
        )


class ConsultationTreatmentItemAcceptView(ConsultationTreatmentItemOperationView):
    operation = staticmethod(accept_treatment_item)


class ConsultationTreatmentItemPerformView(ConsultationTreatmentItemOperationView):
    operation = staticmethod(perform_treatment_item)

    def operation_kwargs(self, request):
        serializer = TreatmentItemPerformSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        get_object_or_404(consultations_visible_to(request.user), pk=serializer.validated_data["performed_in"])
        return {
            "performed_in_id": serializer.validated_data["performed_in"],
            "odontogram_result": serializer.validated_data.get("odontogram_result"),
        }


class ConsultationTreatmentItemCancelView(ConsultationTreatmentItemOperationView):
    operation = staticmethod(cancel_treatment_item)

    def operation_kwargs(self, request):
        serializer = TreatmentItemCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return {"reason": serializer.validated_data.get("reason", "")}


class ConsultationOdontogramView(generics.RetrieveAPIView):
    serializer_class = OdontogramVersionSerializer
    permission_classes = (IsAuthenticated, HasCapability)
    required_permissions = {
        "GET": "consultations.view",
        "PATCH": "consultations.edit",
        "DELETE": "consultations.edit",
    }

    def get_object(self):
        consultation = get_object_or_404(
            consultations_visible_to(self.request.user),
            pk=self.kwargs["consultation_pk"],
            patient_id=self.kwargs["patient_pk"],
        )
        version = (
            OdontogramVersion.objects.select_related("consultation", "created_by")
            .filter(consultation=consultation)
            .order_by("-version_number")
            .first()
        )
        if version is None:
            raise Http404
        return version


class ConsultationOdontogramVersionCreateView(generics.CreateAPIView):
    serializer_class = OdontogramRevisionCreateSerializer
    permission_classes = (IsAuthenticated, HasCapability)
    required_permissions = {
        "POST": "consultations.edit",
        "PATCH": "consultations.edit",
        "DELETE": "consultations.edit",
    }

    def get_consultation(self):
        return get_object_or_404(
            consultations_visible_to(self.request.user),
            pk=self.kwargs["consultation_pk"],
            patient_id=self.kwargs["patient_pk"],
        )

    def get_serializer_context(self):
        return {
            **super().get_serializer_context(),
            "consultation": self.get_consultation(),
        }

    def create(self, request, *args, **kwargs):
        try:
            return super().create(request, *args, **kwargs)
        except OdontogramConflict as error:
            return Response(
                {
                    "detail": str(error),
                    "current_version_id": error.current_version_id,
                },
                status=status.HTTP_409_CONFLICT,
            )


class PatientOdontogramVersionListView(generics.ListAPIView):
    serializer_class = OdontogramVersionSummarySerializer
    pagination_class = StandardPageNumberPagination
    permission_classes = (IsAuthenticated, HasCapability)
    required_permissions = {
        "GET": "consultations.view",
        "PATCH": "consultations.edit",
        "DELETE": "consultations.edit",
    }

    def get_queryset(self):
        patient = get_object_or_404(patients_visible_to(self.request.user), pk=self.kwargs["patient_pk"])
        return odontograms_visible_to(self.request.user).select_related(
            "consultation", "created_by"
        ).filter(patient=patient)


class PatientOdontogramVersionDetailView(generics.RetrieveAPIView):
    serializer_class = OdontogramVersionSerializer
    permission_classes = (IsAuthenticated, HasCapability)
    required_permissions = {
        "GET": "consultations.view",
        "PATCH": "consultations.edit",
        "DELETE": "consultations.edit",
    }
    http_method_names = ("get", "head", "options")

    def get_queryset(self):
        return odontograms_visible_to(self.request.user).select_related(
            "consultation", "created_by"
        ).filter(patient_id=self.kwargs["patient_pk"])


class PatientDocumentListCreateView(APIView):
    permission_classes = (IsAuthenticated, HasCapability)
    parser_classes = (MultiPartParser, FormParser)
    required_permissions = {
        "GET": "documents.view",
        "POST": "documents.create",
    }

    def get_patient(self):
        return get_object_or_404(patients_visible_to(self.request.user), pk=self.kwargs["patient_pk"])

    def get(self, request, patient_pk):
        self.get_patient()
        retired = request.query_params.get("retired") == "true"
        if retired and request.user.role != User.Role.ADMINISTRADOR:
            raise PermissionDenied("Solo un administrador puede consultar documentos retirados.")
        manager = PatientDocument.all_objects if retired else PatientDocument.objects
        queryset = documents_visible_to(request.user, manager.all()).select_related(
            "uploaded_by",
            "consultation",
        ).filter(
            patient_id=patient_pk,
        )
        if retired:
            queryset = queryset.filter(deleted_at__isnull=False)
        category = request.query_params.get("category", "").strip()
        search = request.query_params.get("search", "").strip()
        if category:
            queryset = queryset.filter(category__iexact=category)
        consultation_id = request.query_params.get("consultation_id", "").strip()
        if consultation_id:
            if not user_has_permission(request.user, "consultations.view"):
                raise PermissionDenied(
                    "No tienes permiso para filtrar por contexto clínico."
                )
            if not consultation_id.isdecimal():
                raise serializers.ValidationError({
                    "consultation_id": "Indica una consulta válida."
                })
            queryset = queryset.filter(consultation_id=int(consultation_id))
        if search:
            queryset = queryset.filter(
                Q(original_name__icontains=search)
                | Q(category__icontains=search)
                | Q(notes__icontains=search)
            )
        paginator = StandardPageNumberPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        data = PatientDocumentSerializer(
            page,
            many=True,
            context={"request": request},
        ).data
        return paginator.get_paginated_response(data)

    def post(self, request, patient_pk):
        patient = self.get_patient()
        if not patient.is_active:
            return Response(
                {"detail": "El paciente está inactivo; sus documentos son de solo lectura."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = PatientDocumentBatchUploadSerializer(
            data=request.data,
            context={"request": request, "patient": patient},
        )
        serializer.is_valid(raise_exception=True)
        documents = serializer.save()
        request._request.audit_changed_fields = sorted({
            "category",
            *(
                field
                for field in ("consultation_id", "tooth_code")
                if field in request.data
            ),
        })
        return Response(
            PatientDocumentSerializer(
                documents,
                many=True,
                context={"request": request},
            ).data,
            status=status.HTTP_201_CREATED,
        )


class PatientDocumentDeleteView(APIView):
    permission_classes = (IsAuthenticated, HasCapability)
    required_permissions = {
        "PATCH": "documents.create",
        "DELETE": "documents.delete",
    }

    def get_patient_and_document(self, patient_pk, pk):
        patient = get_object_or_404(patients_visible_to(self.request.user), pk=patient_pk)
        document = get_object_or_404(
            documents_visible_to(self.request.user).select_related("uploaded_by", "consultation"),
            pk=pk,
            patient=patient,
        )
        return patient, document

    def patch(self, request, patient_pk, pk):
        patient, document = self.get_patient_and_document(patient_pk, pk)
        if not patient.is_active:
            return Response(
                {"detail": "El paciente está inactivo; sus documentos son de solo lectura."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = PatientDocumentMetadataUpdateSerializer(
            document,
            data=request.data,
            partial=True,
            context={"request": request, "patient": patient},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, patient_pk, pk):
        patient, document = self.get_patient_and_document(patient_pk, pk)
        if not patient.is_active:
            return Response(
                {"detail": "El paciente está inactivo; sus documentos son de solo lectura."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from rest_framework import serializers

        class RetirementInput(serializers.Serializer):
            reason = serializers.CharField(max_length=1000, allow_blank=False)

        payload = RetirementInput(data=request.data)
        payload.is_valid(raise_exception=True)
        PatientDocument.all_objects.filter(pk=document.pk, deleted_at__isnull=True).update(
            deleted_at=timezone.now(), deleted_by=request.user,
            deletion_reason=payload.validated_data["reason"],
        )
        request._request.audit_action = "DOCUMENT_RETIRED"
        return Response(status=status.HTTP_204_NO_CONTENT)


class PatientDocumentRestoreView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, patient_pk, pk):
        if request.user.role != User.Role.ADMINISTRADOR:
            return Response(status=status.HTTP_403_FORBIDDEN)
        with transaction.atomic():
            document = get_object_or_404(
                PatientDocument.all_objects.select_for_update(), pk=pk, patient_id=patient_pk,
            )
            document.deleted_at = None
            document.save(update_fields=["deleted_at"])
        request._request.audit_action = "DOCUMENT_RESTORED"
        return Response(PatientDocumentSerializer(document, context={"request": request}).data)


class PatientDocumentContentView(APIView):
    permission_classes = (IsAuthenticated, HasCapability)
    required_permissions = {"GET": "documents.view"}

    def get(self, request, patient_pk, pk):
        document = get_object_or_404(
            documents_visible_to(request.user),
            pk=pk,
            patient_id=patient_pk,
        )
        as_attachment = request.query_params.get("download", "").lower() == "true"
        response = FileResponse(
            document.file.open("rb"),
            content_type=document.mime_type,
        )
        response["Content-Disposition"] = content_disposition_header(
            as_attachment,
            document.original_name,
        )
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response


class PatientDocumentCategoryListView(APIView):
    permission_classes = (IsAuthenticated, HasCapability)
    required_permissions = {"GET": "documents.view"}

    def get(self, request):
        categories = documents_visible_to(request.user).order_by("created_at", "pk").values_list(
            "category",
            flat=True,
        )
        unique = {}
        for category in categories:
            unique.setdefault(category.casefold(), category)
        return Response(sorted(unique.values(), key=str.casefold))
