from io import BytesIO
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from PIL import Image as PillowImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from xml.sax.saxutils import escape

from .models import OdontogramVersion, PatientDocument, TreatmentItem


NAVY = colors.HexColor("#173B63")
CYAN = colors.HexColor("#0E7490")
LIGHT_BLUE = colors.HexColor("#EAF4F8")
LIGHT_GRAY = colors.HexColor("#F4F6F8")
MUTED = colors.HexColor("#5B6775")

FINDING_LABELS = {
    "CARIES": "Caries",
    "RESTORATION": "Restauración",
    "SEALANT": "Sellante",
    "FRACTURE": "Fractura",
    "MISSING": "Ausente",
    "UNERUPTED": "No erupcionada",
    "CROWN": "Corona",
    "IMPLANT": "Implante",
    "ROOT_CANAL": "Endodoncia",
}
SURFACE_LABELS = {
    "MESIAL": "mesial",
    "DISTAL": "distal",
    "VESTIBULAR": "vestibular",
    "PALATAL": "palatina",
    "LINGUAL": "lingual",
    "INCISAL": "incisal",
    "OCCLUSAL": "oclusal",
}


def _safe(value):
    if value is None or value == "":
        return "Sin información registrada"
    return escape(str(value)).replace("\n", "<br/>")


def _date(value):
    return value.strftime("%d/%m/%Y") if value else "Sin fecha"


def _time(value):
    return value.strftime("%H:%M") if value else ""


def _styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "ClinicalTitle",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=20,
            leading=24,
            textColor=NAVY,
            alignment=TA_CENTER,
            spaceAfter=5 * mm,
        ),
        "section": ParagraphStyle(
            "ClinicalSection",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=16,
            textColor=NAVY,
            spaceBefore=6 * mm,
            spaceAfter=2.5 * mm,
            keepWithNext=True,
        ),
        "subsection": ParagraphStyle(
            "ClinicalSubsection",
            parent=base["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=13,
            textColor=CYAN,
            spaceBefore=3 * mm,
            spaceAfter=1.5 * mm,
            keepWithNext=True,
        ),
        "body": ParagraphStyle(
            "ClinicalBody",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11.5,
            textColor=colors.HexColor("#263442"),
            alignment=TA_LEFT,
            spaceAfter=1.5 * mm,
        ),
        "small": ParagraphStyle(
            "ClinicalSmall",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=7.5,
            leading=9.5,
            textColor=MUTED,
        ),
        "label": ParagraphStyle(
            "ClinicalLabel",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=7.5,
            leading=9.5,
            textColor=NAVY,
        ),
    }


def _paragraph(value, style):
    return Paragraph(_safe(value), style)


def _field_table(rows, styles, widths=None):
    data = []
    for left_label, left_value, right_label, right_value in rows:
        data.append([
            _paragraph(left_label, styles["label"]),
            _paragraph(left_value, styles["body"]),
            _paragraph(right_label, styles["label"]),
            _paragraph(right_value, styles["body"]),
        ])
    table = Table(data, colWidths=widths or [29 * mm, 58 * mm, 29 * mm, 58 * mm])
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (0, -1), LIGHT_GRAY),
        ("BACKGROUND", (2, 0), (2, -1), LIGHT_GRAY),
        ("BOX", (0, 0), (-1, -1), 0.35, colors.HexColor("#D4DAE0")),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E1E5E9")),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return table


def _section_title(title, styles):
    return [
        Paragraph(escape(title), styles["section"]),
        HRFlowable(width="100%", thickness=0.7, color=CYAN, spaceAfter=2 * mm),
    ]


def _logo_reader(clinic):
    if not getattr(clinic, "logo", None):
        return None
    try:
        with clinic.logo.open("rb") as stream:
            content = stream.read()
        image = PillowImage.open(BytesIO(content))
        image.verify()
        return ImageReader(BytesIO(content))
    except Exception:
        return None


def _local_generated_at(generated_at, clinic):
    try:
        return generated_at.astimezone(ZoneInfo(clinic.timezone or "America/Managua"))
    except (ValueError, ZoneInfoNotFoundError):
        return generated_at


def _page_decorator(*, clinic, patient, generated_at, logo_reader):
    contact = " · ".join(
        item for item in (clinic.phone, clinic.email, clinic.address) if item
    )
    generated_text = _local_generated_at(generated_at, clinic).strftime("%d/%m/%Y %H:%M")

    def decorate(canvas, document):
        canvas.saveState()
        page_width, page_height = A4
        left = 18 * mm
        right = page_width - 18 * mm
        if logo_reader is not None:
            try:
                canvas.drawImage(
                    logo_reader,
                    left,
                    page_height - 28 * mm,
                    width=30 * mm,
                    height=12 * mm,
                    preserveAspectRatio=True,
                    anchor="w",
                    mask="auto",
                )
                text_left = left + 34 * mm
            except Exception:
                text_left = left
        else:
            text_left = left
        canvas.setFillColor(NAVY)
        canvas.setFont("Helvetica-Bold", 12)
        canvas.drawString(text_left, page_height - 17 * mm, str(clinic.name or "DentalClinic"))
        if contact:
            canvas.setFont("Helvetica", 6.8)
            canvas.setFillColor(MUTED)
            canvas.drawRightString(right, page_height - 27 * mm, contact[:150])
        canvas.setStrokeColor(CYAN)
        canvas.setLineWidth(0.8)
        canvas.line(left, page_height - 31 * mm, right, page_height - 31 * mm)
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 6.8)
        canvas.drawString(
            left,
            page_height - 35 * mm,
            f"Paciente: {patient.full_name} · {patient.code or 'Sin código'}",
        )
        canvas.drawRightString(right, page_height - 35 * mm, f"Generado: {generated_text}")
        canvas.setStrokeColor(colors.HexColor("#D4DAE0"))
        canvas.line(left, 14 * mm, right, 14 * mm)
        canvas.setFont("Helvetica", 6.8)
        canvas.setFillColor(MUTED)
        canvas.drawString(left, 9.5 * mm, "Documento clínico confidencial")
        canvas.drawRightString(right, 9.5 * mm, f"Página {document.page}")
        canvas.restoreState()

    return decorate


def _administrative_story(patient, styles):
    story = _section_title("Datos administrativos del paciente", styles)
    story.append(_field_table([
        ("Nombre", patient.full_name, "Código", patient.code),
        ("Nacimiento", _date(patient.date_of_birth), "Género", patient.get_gender_display()),
        ("Identificación", patient.identification_number, "Teléfono", patient.phone),
        ("Correo", patient.email, "Estado", "Activo" if patient.is_active else "Inactivo"),
        ("Dirección", patient.address, "Lugar de nacimiento", patient.birth_place),
        ("Responsable", patient.guardian_name, "Teléfono responsable", patient.guardian_phone),
    ], styles))
    return story


def _selected_history(values):
    if not isinstance(values, dict):
        return ""
    selected = []
    for key, value in values.items():
        if key == "other" and value:
            selected.append(str(value))
        elif value is True:
            selected.append(key.replace("_", " ").capitalize())
    return ", ".join(selected)


def _clinical_record_story(patient, styles):
    story = _section_title("Antecedentes y alertas clínicas", styles)
    record = getattr(patient, "clinical_record", None)
    if record is None:
        story.append(_paragraph("No existe información clínica general registrada.", styles["body"]))
        return story
    fields = (
        ("Motivo principal", record.chief_complaint),
        ("Historia de la enfermedad actual", record.present_illness_history),
        ("Alergias", record.allergies),
        ("Medicamentos actuales", record.current_medications),
        ("Condiciones relevantes", record.relevant_conditions),
        ("Otras alertas clínicas", record.other_clinical_alerts),
        ("Antecedentes familiares", record.family_history),
        ("Infectocontagiosas", _selected_history(record.infectious_diseases)),
        ("Hereditarias", _selected_history(record.hereditary_diseases)),
        ("Diagnóstico general", record.dental_diagnoses),
        ("Plan general registrado", record.treatment_plan),
    )
    present = [(label, value) for label, value in fields if value]
    if not present:
        story.append(_paragraph("Sin antecedentes o alertas registrados.", styles["body"]))
        return story
    for label, value in present:
        story.append(Paragraph(f"<b>{escape(label)}:</b> {_safe(value)}", styles["body"]))
    return story


def _consultation_story(patient, styles):
    story = _section_title("Historial de consultas", styles)
    consultations = patient.consultations.select_related("professional").prefetch_related("amendments").order_by(
        "date", "time", "created_at", "pk"
    )
    if not consultations.exists():
        story.append(_paragraph("No hay consultas registradas.", styles["body"]))
        return story
    for consultation in consultations:
        heading = (
            f"{_date(consultation.date)}"
            f"{f' · {_time(consultation.time)}' if consultation.time else ''}"
            f" · {consultation.get_consultation_type_display()}"
        )
        story.append(Paragraph(escape(heading), styles["subsection"]))
        professional = consultation.professional_name_snapshot or (
            consultation.professional.get_full_name().strip() or consultation.professional.email
        )
        story.append(_field_table([
            ("Estado", consultation.get_status_display(), "Profesional", professional),
        ], styles))
        professional_context = []
        if consultation.professional.specialty:
            professional_context.append(
                f"Especialidad: {consultation.professional.specialty}"
            )
        if consultation.professional.professional_registration_number:
            professional_context.append(
                "Registro profesional: "
                f"{consultation.professional.professional_registration_number}"
            )
        if professional_context:
            story.append(_paragraph(" · ".join(professional_context), styles["small"]))
        for label, value in (
            ("Resumen", consultation.summary),
            ("Motivo de consulta", consultation.chief_complaint),
            ("Diagnóstico dental", consultation.dental_diagnoses),
        ):
            if value:
                story.append(Paragraph(f"<b>{escape(label)}:</b> {_safe(value)}", styles["body"]))
        for amendment in consultation.amendments.all():
            story.append(_paragraph(f"Adenda · {amendment.author_name} · {amendment.created_at.isoformat()}", styles["label"]))
            story.append(_paragraph(f"Motivo: {amendment.reason}", styles["body"]))
            story.append(_paragraph(amendment.content, styles["body"]))
        story.append(Spacer(1, 1.5 * mm))
    return story


def _treatment_item_text(item, styles):
    location = f"Pieza {item.tooth_code}" if item.tooth_code else "Tratamiento general"
    if item.surfaces:
        location += " · " + ", ".join(
            SURFACE_LABELS.get(surface, surface.lower()) for surface in item.surfaces
        )
    content = [
        Paragraph(f"<b>{_safe(item.description)}</b> · {_safe(item.get_status_display())}", styles["body"]),
        Paragraph(
            f"{_safe(location)} · Propuesto el {_date(item.proposed_in.date)}",
            styles["small"],
        ),
    ]
    if item.diagnosis_text:
        content.append(Paragraph(f"Diagnóstico: {_safe(item.diagnosis_text)}", styles["small"]))
    if item.status_reason:
        content.append(Paragraph(f"Motivo: {_safe(item.status_reason)}", styles["small"]))
    return content


def _treatment_story(patient, styles):
    story = _section_title("Plan y tratamientos longitudinales", styles)
    items = list(
        TreatmentItem.objects.filter(proposed_in__patient=patient)
        .select_related("proposed_in", "performed_in")
        .order_by("proposed_in__date", "created_at", "pk")
    )
    pending = [
        item for item in items
        if item.status in (TreatmentItem.Status.PROPOSED, TreatmentItem.Status.ACCEPTED)
    ]
    history = [
        item for item in items
        if item.status in (TreatmentItem.Status.PERFORMED, TreatmentItem.Status.CANCELLED)
    ]
    story.append(Paragraph("Plan vigente", styles["subsection"]))
    if pending:
        for item in pending:
            story.extend(_treatment_item_text(item, styles))
            story.append(Spacer(1, 1.5 * mm))
    else:
        story.append(_paragraph("No hay procedimientos propuestos o aceptados.", styles["body"]))
    story.append(Paragraph("Histórico", styles["subsection"]))
    if history:
        for item in history:
            story.extend(_treatment_item_text(item, styles))
            story.append(Spacer(1, 1.5 * mm))
    else:
        story.append(_paragraph("No hay procedimientos realizados o cancelados.", styles["body"]))
    return story


def _current_findings(version):
    findings = []
    for tooth_code in sorted(version.teeth):
        tooth = version.teeth[tooth_code]
        current = tooth.get("current", {}) if isinstance(tooth, dict) else {}
        whole = [FINDING_LABELS.get(item, item) for item in current.get("whole", [])]
        surface_items = []
        for surface, values in sorted(current.get("surfaces", {}).items()):
            labels = ", ".join(FINDING_LABELS.get(item, item) for item in values)
            surface_items.append(f"{SURFACE_LABELS.get(surface, surface.lower())}: {labels}")
        details = whole + surface_items
        if details:
            findings.append((tooth_code, "; ".join(details), tooth.get("note", "")))
    return findings


def _odontogram_story(patient, styles):
    story = _section_title("Resumen del odontograma actual", styles)
    current = (
        OdontogramVersion.objects.filter(patient=patient)
        .select_related("consultation")
        .order_by("-version_number")
        .first()
    )
    if current is None:
        story.append(_paragraph("No existe odontograma registrado.", styles["body"]))
        return story
    story.append(Paragraph(
        f"Versión {current.version_number} · {escape(current.get_dentition_display())} · "
        f"Consulta del {_date(current.consultation.date)}",
        styles["body"],
    ))
    findings = _current_findings(current)
    if not findings:
        story.append(_paragraph("Sin hallazgos actuales estructurados.", styles["body"]))
        return story
    data = [[
        _paragraph("Pieza", styles["label"]),
        _paragraph("Estado actual", styles["label"]),
        _paragraph("Nota", styles["label"]),
    ]]
    for tooth_code, finding, note in findings:
        data.append([
            _paragraph(f"Pieza {tooth_code}", styles["body"]),
            _paragraph(finding, styles["body"]),
            _paragraph(note or "Sin nota", styles["small"]),
        ])
    table = Table(data, colWidths=[25 * mm, 100 * mm, 49 * mm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), LIGHT_BLUE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#D4DAE0")),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(table)
    return story


def _document_story(patient, styles):
    story = _section_title("Documentos adjuntos de referencia", styles)
    documents = (
        PatientDocument.objects.filter(patient=patient)
        .select_related("consultation")
        .order_by("document_date", "created_at", "pk")
    )
    if not documents.exists():
        story.append(_paragraph("No hay documentos adjuntos.", styles["body"]))
        return story
    data = [[
        _paragraph("Fecha", styles["label"]),
        _paragraph("Categoría", styles["label"]),
        _paragraph("Archivo", styles["label"]),
        _paragraph("Contexto", styles["label"]),
    ]]
    for document in documents:
        context = []
        if document.consultation_id:
            context.append(f"Consulta {_date(document.consultation.date)}")
        if document.tooth_code:
            context.append(f"Pieza {document.tooth_code}")
        data.append([
            _paragraph(_date(document.document_date), styles["body"]),
            _paragraph(document.category, styles["body"]),
            _paragraph(document.original_name, styles["body"]),
            _paragraph(" · ".join(context) or "Paciente", styles["small"]),
        ])
    table = Table(data, colWidths=[27 * mm, 42 * mm, 60 * mm, 45 * mm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), LIGHT_BLUE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#D4DAE0")),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(table)
    story.append(Spacer(1, 2 * mm))
    story.append(_paragraph(
        "Los archivos se listan como referencia y no están incrustados en esta exportación.",
        styles["small"],
    ))
    return story


def build_clinical_record_pdf(*, patient, clinic, generated_at, include_documents=False):
    styles = _styles()
    logo_reader = _logo_reader(clinic)
    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=42 * mm,
        bottomMargin=20 * mm,
        title=f"Expediente clínico {patient.code or patient.pk}",
        author=clinic.name or "DentalClinic",
        subject="Copia clínica para impresión",
        pageCompression=0,
    )
    story = [
        Paragraph("Expediente clínico", styles["title"]),
        _paragraph(
            "Copia generada con la información registrada al momento de la exportación.",
            styles["small"],
        ),
    ]
    story.extend(_administrative_story(patient, styles))
    story.extend(_clinical_record_story(patient, styles))
    story.extend(_consultation_story(patient, styles))
    story.extend(_treatment_story(patient, styles))
    story.extend(_odontogram_story(patient, styles))
    if include_documents:
        story.extend(_document_story(patient, styles))
    story.extend([
        Spacer(1, 5 * mm),
        HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#D4DAE0")),
        Spacer(1, 2 * mm),
        _paragraph(
            "Fin de la exportación. Este documento no modifica ni sustituye el expediente electrónico.",
            styles["small"],
        ),
    ])
    decorate = _page_decorator(
        clinic=clinic,
        patient=patient,
        generated_at=generated_at,
        logo_reader=logo_reader,
    )
    document.build(story, onFirstPage=decorate, onLaterPages=decorate)
    return buffer.getvalue()
