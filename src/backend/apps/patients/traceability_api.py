from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import generics, serializers
from rest_framework.exceptions import APIException
from rest_framework.permissions import IsAuthenticated

from apps.common.pagination import StandardPageNumberPagination
from apps.users.permissions import HasCapability
from .models import ClinicalRevision, Consultation, ConsultationAmendment, Patient
from .traceability import record_revision


class ClinicalRevisionSerializer(serializers.ModelSerializer):
    author_id = serializers.IntegerField(read_only=True, allow_null=True)

    class Meta:
        model = ClinicalRevision
        fields = ("id", "author_id", "author_name", "resource_version", "snapshot", "reason", "created_at")
        read_only_fields = fields


class ClinicalRevisionListView(generics.ListAPIView):
    serializer_class = ClinicalRevisionSerializer
    pagination_class = StandardPageNumberPagination
    permission_classes = (IsAuthenticated, HasCapability)
    required_permissions = {"GET": "patients.view"}

    def get_queryset(self):
        patient = get_object_or_404(Patient, pk=self.kwargs["patient_pk"])
        self.request._request.audit_patient_id = patient.pk
        queryset = ClinicalRevision.objects.filter(patient=patient)
        if "consultation_pk" in self.kwargs:
            consultation = get_object_or_404(Consultation, patient=patient, pk=self.kwargs["consultation_pk"])
            return queryset.filter(consultation=consultation)
        return queryset.filter(consultation__isnull=True)


class ConsultationRevisionListView(ClinicalRevisionListView):
    required_permissions = {"GET": "consultations.view"}


class AmendmentStateConflict(APIException):
    status_code = 409
    default_detail = "Solo las consultas completadas admiten adendas."
    default_code = "amendment_state_conflict"


class ConsultationAmendmentSerializer(serializers.ModelSerializer):
    reason = serializers.CharField(max_length=1000, allow_blank=False)
    content = serializers.CharField(max_length=10000, allow_blank=False)
    author_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = ConsultationAmendment
        fields = ("id", "author_id", "author_name", "reason", "content", "created_at")
        read_only_fields = ("id", "author_id", "author_name", "created_at")


class ConsultationAmendmentListCreateView(generics.ListCreateAPIView):
    serializer_class = ConsultationAmendmentSerializer
    pagination_class = StandardPageNumberPagination
    permission_classes = (IsAuthenticated, HasCapability)
    required_permissions = {"GET": "consultations.view", "POST": "consultations.edit"}

    def get_consultation(self):
        return get_object_or_404(Consultation, pk=self.kwargs["consultation_pk"], patient_id=self.kwargs["patient_pk"])

    def get_queryset(self):
        consultation = self.get_consultation()
        self.request._request.audit_patient_id = consultation.patient_id
        return consultation.amendments.all()

    @transaction.atomic
    def perform_create(self, serializer):
        consultation = get_object_or_404(Consultation.objects.select_for_update(), pk=self.kwargs["consultation_pk"], patient_id=self.kwargs["patient_pk"])
        if consultation.status != Consultation.Status.COMPLETED:
            raise AmendmentStateConflict()
        record_revision(patient=consultation.patient, instance=consultation, consultation=consultation, reason="Consulta original previa a adenda")
        actor = self.request.user
        amendment = serializer.save(consultation=consultation, author=actor, author_name=actor.get_full_name().strip() or actor.email)
        request = self.request._request
        request.audit_action = "CONSULTATION_AMENDMENT_CREATE"
        request.audit_patient_id = consultation.patient_id
        request.audit_metadata = {**getattr(request, "audit_metadata", {}), "consultation_id": consultation.pk, "amendment_id": amendment.pk}
