from copy import deepcopy

from django.db import transaction
from rest_framework.exceptions import ValidationError

from .models import Consultation, OdontogramVersion, Patient
from .access import odontograms_visible_to


PERMANENT_TEETH = {
    f"{quadrant}{position}"
    for quadrant in range(1, 5)
    for position in range(1, 9)
}
PRIMARY_TEETH = {
    f"{quadrant}{position}"
    for quadrant in range(5, 9)
    for position in range(1, 6)
}
TEETH_BY_DENTITION = {
    OdontogramVersion.Dentition.PRIMARY: PRIMARY_TEETH,
    OdontogramVersion.Dentition.MIXED: PERMANENT_TEETH | PRIMARY_TEETH,
    OdontogramVersion.Dentition.PERMANENT: PERMANENT_TEETH,
}
CURRENT_SURFACE_FINDINGS = {"CARIES", "RESTORATION", "SEALANT", "FRACTURE"}
CURRENT_WHOLE_FINDINGS = {"MISSING", "UNERUPTED", "CROWN", "IMPLANT", "ROOT_CANAL"}
PLANNED_SURFACE_FINDINGS = {"RESTORATION", "SEALANT"}
PLANNED_WHOLE_FINDINGS = {"CROWN", "IMPLANT", "ROOT_CANAL", "EXTRACTION"}
COMMON_SURFACES = {"MESIAL", "DISTAL", "VESTIBULAR"}


class OdontogramConflict(Exception):
    def __init__(self, current_version_id):
        self.current_version_id = current_version_id
        super().__init__("El odontograma cambió desde que lo abriste.")


def allowed_surfaces(tooth_code):
    quadrant = int(tooth_code[0])
    position = int(tooth_code[1])
    surfaces = set(COMMON_SURFACES)
    surfaces.add("PALATAL" if quadrant in {1, 2, 5, 6} else "LINGUAL")
    surfaces.add("INCISAL" if position <= 3 else "OCCLUSAL")
    return surfaces


def normalize_teeth_snapshot(teeth, dentition):
    if not isinstance(teeth, dict):
        raise ValidationError({"teeth": "Debe ser un mapa de piezas dentales."})
    allowed_teeth = TEETH_BY_DENTITION[dentition]
    normalized = {}
    errors = {}
    for tooth_code, tooth in teeth.items():
        if tooth_code not in allowed_teeth:
            errors[tooth_code] = "La pieza no corresponde a la dentición seleccionada."
            continue
        if not isinstance(tooth, dict):
            errors[tooth_code] = "La pieza debe ser un objeto."
            continue
        if tooth.get("reviewed") is not True:
            errors[tooth_code] = "Una pieza registrada debe marcarse como evaluada."
            continue
        tooth_note = tooth.get("note", "")
        if not isinstance(tooth_note, str) or len(tooth_note) > 1000:
            errors[tooth_code] = "La nota clínica debe ser texto de hasta 1000 caracteres."
            continue

        normalized_tooth = {
            "reviewed": True,
            "note": tooth_note.strip(),
        }
        layer_errors = []
        for layer_name, surface_catalog, whole_catalog in (
            ("current", CURRENT_SURFACE_FINDINGS, CURRENT_WHOLE_FINDINGS),
            ("planned", PLANNED_SURFACE_FINDINGS, PLANNED_WHOLE_FINDINGS),
        ):
            layer = tooth.get(layer_name, {})
            if not isinstance(layer, dict):
                layer_errors.append(f"La capa {layer_name} debe ser un objeto.")
                continue
            whole = layer.get("whole", [])
            surfaces = layer.get("surfaces", {})
            if not isinstance(whole, list) or any(
                not isinstance(item, str) or item not in whole_catalog for item in whole
            ):
                layer_errors.append(f"Hallazgo de pieza completa inválido en {layer_name}.")
                continue
            if not isinstance(surfaces, dict):
                layer_errors.append(f"Las superficies de {layer_name} deben ser un objeto.")
                continue
            normalized_surfaces = {}
            for surface, findings in surfaces.items():
                if surface not in allowed_surfaces(tooth_code):
                    layer_errors.append(f"La superficie {surface} no aplica a la pieza {tooth_code}.")
                    continue
                if not isinstance(findings, list) or any(
                    not isinstance(finding, str) or finding not in surface_catalog
                    for finding in findings
                ):
                    layer_errors.append(f"Hallazgo de superficie inválido en {layer_name}.")
                    continue
                unique_findings = sorted(set(findings))
                if unique_findings:
                    normalized_surfaces[surface] = unique_findings
            normalized_tooth[layer_name] = {
                "whole": sorted(set(whole)),
                "surfaces": normalized_surfaces,
            }
        if layer_errors:
            errors[tooth_code] = layer_errors
        else:
            normalized[tooth_code] = normalized_tooth
    if errors:
        raise ValidationError({"teeth": errors})
    return normalized


def create_odontogram_revision(*, consultation, author, base_version_id, dentition, teeth, note):
    normalized_teeth = normalize_teeth_snapshot(teeth, dentition)
    with transaction.atomic():
        consultation = Consultation.objects.select_for_update().get(pk=consultation.pk)
        patient = Patient.objects.select_for_update().get(pk=consultation.patient_id)
        if consultation.status != Consultation.Status.IN_PROGRESS or not patient.is_active:
            raise ValidationError({"detail": "La consulta cerrada o el paciente inactivo es de solo lectura."})
        current = (
            OdontogramVersion.objects.filter(consultation=consultation)
            .order_by("-version_number")
            .first()
        )
        if current is None:
            raise ValidationError({"detail": "La consulta no tiene un odontograma inicial."})
        if current.pk != base_version_id:
            raise OdontogramConflict(current.pk)
        changed_teeth = sorted(
            code
            for code in set(current.teeth) | set(normalized_teeth)
            if current.teeth.get(code) != normalized_teeth.get(code)
        )
        if not changed_teeth and current.dentition == dentition:
            raise ValidationError(
                {"detail": "Realiza un cambio clínico antes de guardar una versión."}
            )
        latest_patient = OdontogramVersion.objects.filter(patient=patient).first()
        return OdontogramVersion.objects.create(
            patient=patient,
            consultation=consultation,
            version_number=latest_patient.version_number + 1,
            dentition=dentition,
            teeth=normalized_teeth,
            changed_teeth=changed_teeth,
            note=note.strip(),
            based_on=current,
            created_by=author,
        )


def suggested_dentition(patient, reference_date):
    years = reference_date.year - patient.date_of_birth.year
    if (reference_date.month, reference_date.day) < (
        patient.date_of_birth.month,
        patient.date_of_birth.day,
    ):
        years -= 1
    if years < 6:
        return OdontogramVersion.Dentition.PRIMARY
    if years < 13:
        return OdontogramVersion.Dentition.MIXED
    return OdontogramVersion.Dentition.PERMANENT


def create_initial_odontogram_version(consultation):
    with transaction.atomic():
        patient = Patient.objects.select_for_update().get(pk=consultation.patient_id)
        existing = OdontogramVersion.objects.filter(consultation=consultation).first()
        if existing:
            return existing
        latest = OdontogramVersion.objects.filter(patient=patient).first()
        previous = odontograms_visible_to(consultation.professional).filter(patient=patient).first()
        return OdontogramVersion.objects.create(
            patient=patient,
            consultation=consultation,
            version_number=(latest.version_number + 1) if latest else 1,
            dentition=(
                previous.dentition
                if previous
                else suggested_dentition(patient, consultation.date)
            ),
            teeth=deepcopy(previous.teeth) if previous else {},
            changed_teeth=[],
            based_on=previous,
            created_by=consultation.professional,
        )
