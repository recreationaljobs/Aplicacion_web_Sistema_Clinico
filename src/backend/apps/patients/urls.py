from django.urls import path
from .views import PatientDocumentRestoreView
from .traceability_api import ClinicalRevisionListView, ConsultationRevisionListView, ConsultationAmendmentListCreateView

from .views import (
    ConsultationOdontogramView,
    ConsultationOdontogramVersionCreateView,
    ConsultationTreatmentItemDetailView,
    ConsultationTreatmentItemListCreateView,
    ConsultationTreatmentItemAcceptView,
    ConsultationTreatmentItemCancelView,
    ConsultationTreatmentItemPerformView,
    PatientOdontogramVersionDetailView,
    PatientOdontogramVersionListView,
    PatientConsultationCancelView,
    PatientConsultationCompleteView,
    PatientConsultationDetailView,
    PatientConsultationListView,
    PatientClinicalRecordExportView,
    PatientDashboardSummaryView,
    PatientDetailView,
    PatientDuplicateCheckView,
    PatientDocumentCategoryListView,
    PatientDocumentContentView,
    PatientDocumentDeleteView,
    PatientDocumentListCreateView,
    PatientListCreateView,
    PatientOptionListView,
    PatientPlannedOdontogramOverlayView,
    PatientTreatmentItemListView,
    RecentConsultationListView,
)


app_name = "patients"


urlpatterns = [
    path("<int:patient_pk>/clinical-record/revisions/", ClinicalRevisionListView.as_view(), name="clinical-record-revisions"),
    path("<int:patient_pk>/consultations/<int:consultation_pk>/revisions/", ConsultationRevisionListView.as_view(), name="consultation-revisions"),
    path("<int:patient_pk>/consultations/<int:consultation_pk>/amendments/", ConsultationAmendmentListCreateView.as_view(), name="consultation-amendments"),
    path(
        "<int:patient_pk>/documents/<int:pk>/restore/",
        PatientDocumentRestoreView.as_view(), name="patient-document-restore",
    ),
    path("", PatientListCreateView.as_view(), name="patient-list-create"),
    path(
        "duplicate-check/",
        PatientDuplicateCheckView.as_view(),
        name="patient-duplicate-check",
    ),
    path("options/", PatientOptionListView.as_view(), name="patient-option-list"),
    path(
        "document-categories/",
        PatientDocumentCategoryListView.as_view(),
        name="patient-document-categories",
    ),
    path(
        "consultations/recent/",
        RecentConsultationListView.as_view(),
        name="recent-consultation-list",
    ),
    path(
        "dashboard-summary/",
        PatientDashboardSummaryView.as_view(),
        name="patient-dashboard-summary",
    ),
    path("<int:pk>/", PatientDetailView.as_view(), name="patient-detail"),
    path(
        "<int:pk>/clinical-record/export/",
        PatientClinicalRecordExportView.as_view(),
        name="patient-clinical-record-export",
    ),
    path(
        "<int:pk>/treatment-items/",
        PatientTreatmentItemListView.as_view(),
        name="patient-treatment-item-list",
    ),
    path(
        "<int:pk>/odontogram/planned-overlay/",
        PatientPlannedOdontogramOverlayView.as_view(),
        name="patient-planned-odontogram-overlay",
    ),
    path(
        "<int:pk>/consultations/",
        PatientConsultationListView.as_view(),
        name="patient-consultation-list",
    ),
    path(
        "<int:patient_pk>/consultations/<int:pk>/",
        PatientConsultationDetailView.as_view(),
        name="patient-consultation-detail",
    ),
    path(
        "<int:patient_pk>/consultations/<int:pk>/complete/",
        PatientConsultationCompleteView.as_view(),
        name="patient-consultation-complete",
    ),
    path(
        "<int:patient_pk>/consultations/<int:pk>/cancel/",
        PatientConsultationCancelView.as_view(),
        name="patient-consultation-cancel",
    ),
    path(
        "<int:patient_pk>/consultations/<int:consultation_pk>/treatment-items/",
        ConsultationTreatmentItemListCreateView.as_view(),
        name="consultation-treatment-item-list",
    ),
    path(
        "<int:patient_pk>/consultations/<int:consultation_pk>/treatment-items/<int:pk>/",
        ConsultationTreatmentItemDetailView.as_view(),
        name="consultation-treatment-item-detail",
    ),
    path(
        "<int:patient_pk>/consultations/<int:consultation_pk>/treatment-items/<int:pk>/accept/",
        ConsultationTreatmentItemAcceptView.as_view(),
        name="consultation-treatment-item-accept",
    ),
    path(
        "<int:patient_pk>/consultations/<int:consultation_pk>/treatment-items/<int:pk>/perform/",
        ConsultationTreatmentItemPerformView.as_view(),
        name="consultation-treatment-item-perform",
    ),
    path(
        "<int:patient_pk>/consultations/<int:consultation_pk>/treatment-items/<int:pk>/cancel/",
        ConsultationTreatmentItemCancelView.as_view(),
        name="consultation-treatment-item-cancel",
    ),
    path(
        "<int:patient_pk>/consultations/<int:consultation_pk>/odontogram/",
        ConsultationOdontogramView.as_view(),
        name="consultation-odontogram",
    ),
    path(
        "<int:patient_pk>/consultations/<int:consultation_pk>/odontogram/versions/",
        ConsultationOdontogramVersionCreateView.as_view(),
        name="consultation-odontogram-version-create",
    ),
    path(
        "<int:patient_pk>/odontogram-versions/",
        PatientOdontogramVersionListView.as_view(),
        name="patient-odontogram-version-list",
    ),
    path(
        "<int:patient_pk>/odontogram-versions/<int:pk>/",
        PatientOdontogramVersionDetailView.as_view(),
        name="patient-odontogram-version-detail",
    ),
    path(
        "<int:patient_pk>/documents/",
        PatientDocumentListCreateView.as_view(),
        name="patient-document-list-create",
    ),
    path(
        "<int:patient_pk>/documents/<int:pk>/",
        PatientDocumentDeleteView.as_view(),
        name="patient-document-delete",
    ),
    path(
        "<int:patient_pk>/documents/<int:pk>/content/",
        PatientDocumentContentView.as_view(),
        name="patient-document-content",
    ),
]
