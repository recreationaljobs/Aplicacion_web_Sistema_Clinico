from io import BytesIO
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from xml.sax.saxutils import escape

from PIL import Image as PillowImage

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as pdf_canvas
from reportlab.platypus import (
    HRFlowable,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from .models import (
    OdontogramVersion,
    PatientDocument,
    TreatmentItem,
)
from .access import (
    consultations_visible_to,
    treatments_visible_to,
    odontograms_visible_to,
    documents_visible_to,
)


# ============================================================
# COLORES
# ============================================================

NAVY = colors.HexColor("#173B63")
NAVY_DARK = colors.HexColor("#103354")

LIGHT_BLUE = colors.HexColor("#EAF1F8")
LIGHT_GRAY = colors.HexColor("#F3F5F8")
BORDER = colors.HexColor("#D6DCE4")
TEXT = colors.HexColor("#202A36")
MUTED = colors.HexColor("#5B6775")
WHITE = colors.white


# ============================================================
# ETIQUETAS ODONTOGRAMA
# ============================================================

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


# ============================================================
# HELPERS
# ============================================================

def _safe(value, empty="N/A"):
    if value is None or value == "":
        return empty

    return escape(str(value)).replace("\n", "<br/>")


def _date(value):
    return value.strftime("%d/%m/%Y") if value else "N/A"


def _time(value):
    if not value:
        return ""

    hour = value.hour
    minute = value.minute

    suffix = "AM" if hour < 12 else "PM"
    display_hour = hour % 12 or 12

    return f"{display_hour}:{minute:02d} {suffix}"


def _age(date_of_birth, reference_date):
    if not date_of_birth:
        return None

    age = reference_date.year - date_of_birth.year

    if (
        reference_date.month,
        reference_date.day,
    ) < (
        date_of_birth.month,
        date_of_birth.day,
    ):
        age -= 1

    return max(age, 0)


def _paragraph(value, style, empty="N/A"):
    return Paragraph(
        _safe(value, empty),
        style,
    )


def _styles():
    base = getSampleStyleSheet()

    return {
        "document_title": ParagraphStyle(
            "DocumentTitle",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=16,
            leading=19,
            textColor=NAVY,
            alignment=TA_CENTER,
            spaceAfter=1.5 * mm,
        ),

        "document_subtitle": ParagraphStyle(
            "DocumentSubtitle",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=7.4,
            leading=9,
            textColor=NAVY,
            alignment=TA_CENTER,
            spaceAfter=4 * mm,
        ),

        "section_white": ParagraphStyle(
            "SectionWhite",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=8.3,
            leading=10,
            textColor=WHITE,
        ),

        "label": ParagraphStyle(
            "ClinicalLabel",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=6.8,
            leading=8.5,
            textColor=NAVY,
        ),

        "body": ParagraphStyle(
            "ClinicalBody",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=7.6,
            leading=10,
            textColor=TEXT,
            alignment=TA_LEFT,
        ),

        "body_bold": ParagraphStyle(
            "ClinicalBodyBold",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=7.6,
            leading=10,
            textColor=TEXT,
            alignment=TA_LEFT,
        ),

        "small": ParagraphStyle(
            "ClinicalSmall",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=6.5,
            leading=8,
            textColor=MUTED,
        ),

        "consent_title": ParagraphStyle(
            "ConsentTitle",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=15,
            leading=18,
            textColor=NAVY,
            alignment=TA_CENTER,
            spaceBefore=4 * mm,
            spaceAfter=1.5 * mm,
        ),

        "consent_intro": ParagraphStyle(
            "ConsentIntro",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=7,
            leading=9,
            textColor=TEXT,
            alignment=TA_CENTER,
            spaceAfter=3 * mm,
        ),
    }


# ============================================================
# LOGO
# ============================================================

def _logo_reader(clinic):
    if not getattr(clinic, "logo", None):
        return None

    try:
        with clinic.logo.open("rb") as stream:
            content = stream.read()

        image = PillowImage.open(BytesIO(content))
        image.verify()

        return ImageReader(
            BytesIO(content)
        )

    except Exception:
        return None


# ============================================================
# FECHA LOCAL
# ============================================================

def _local_generated_at(
    generated_at,
    clinic,
):
    try:
        return generated_at.astimezone(
            ZoneInfo(
                clinic.timezone
                or "America/Managua"
            )
        )

    except (
        ValueError,
        ZoneInfoNotFoundError,
    ):
        return generated_at


# ============================================================
# CANVAS CON TOTAL DE PÁGINAS
# ============================================================

class NumberedCanvas(
    pdf_canvas.Canvas
):
    def __init__(
        self,
        *args,
        **kwargs,
    ):
        super().__init__(
            *args,
            **kwargs,
        )

        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(
            dict(self.__dict__)
        )

        self._startPage()

    def save(self):
        total_pages = len(
            self._saved_page_states
        )

        for state in (
            self._saved_page_states
        ):
            self.__dict__.update(
                state
            )

            self._page_total_count = (
                total_pages
            )

            self._draw_page_number()

            super().showPage()

        super().save()

    def _draw_page_number(self):
        total = getattr(
            self,
            "_page_total_count",
            1,
        )

        page = self._pageNumber

        self.setFont(
            "Helvetica",
            6.5,
        )

        self.setFillColor(
            MUTED
        )

        self.drawRightString(
            A4[0] - 18 * mm,
            8.5 * mm,
            f"Página {page} de {total}",
        )


# ============================================================
# HEADER / FOOTER
# ============================================================

def _page_decorator(
    *,
    clinic,
    patient,
    generated_at,
    logo_reader,
):
    generated_local = _local_generated_at(
        generated_at,
        clinic,
    )

    generated_text = generated_local.strftime(
        "%d/%m/%Y %H:%M"
    )

    clinic_name = (
        clinic.name
        or "Clinica Dr. Luis Jaime Arguello Arguello"
    )

    contact = " · ".join(
        item
        for item in (
            getattr(clinic, "phone", ""),
            getattr(clinic, "email", ""),
            getattr(clinic, "address", ""),
        )
        if item
    )

    def decorate(
        canvas,
        document,
    ):
        canvas.saveState()

        page_width, page_height = A4

        left = 18 * mm
        right = page_width - 18 * mm

        # ====================================================
        # ENCABEZADO LIMPIO
        # ====================================================

        header_top = page_height - 8 * mm
        header_bottom = page_height - 29 * mm

        # Logo
        text_left = left

        if logo_reader is not None:
            try:
                canvas.drawImage(
                    logo_reader,
                    left,
                    page_height - 25 * mm,
                    width=24 * mm,
                    height=16 * mm,
                    preserveAspectRatio=True,
                    anchor="c",
                    mask="auto",
                )

                text_left = left + 29 * mm

            except Exception:
                text_left = left

        # Nombre de la clínica
        canvas.setFillColor(NAVY)

        canvas.setFont(
            "Helvetica-Bold",
            11,
        )

        canvas.drawString(
            text_left,
            page_height - 14 * mm,
            str(clinic_name)[:65],
        )

        # Datos secundarios
        if contact:
            canvas.setFillColor(MUTED)

            canvas.setFont(
                "Helvetica",
                6.5,
            )

            canvas.drawString(
                text_left,
                page_height - 19 * mm,
                contact[:110],
            )

        # Texto derecho
        canvas.setFillColor(MUTED)

        canvas.setFont(
            "Helvetica",
            6.5,
        )

        canvas.drawRightString(
            right,
            page_height - 14 * mm,
            "EXPEDIENTE CLÍNICO",
        )

        canvas.setFont(
            "Helvetica",
            5.8,
        )

        canvas.drawRightString(
            right,
            page_height - 19 * mm,
            "Documento clínico confidencial",
        )

        # Línea inferior
        

        # ====================================================
        # PIE DE PÁGINA
        # ====================================================

        canvas.setStrokeColor(
            BORDER
        )

        canvas.setLineWidth(
            0.45
        )

        canvas.line(
            left,
            14 * mm,
            right,
            14 * mm,
        )

        canvas.setFillColor(
            MUTED
        )

        canvas.setFont(
            "Helvetica",
            6.2,
        )

        canvas.drawString(
            left,
            9 * mm,
            (
                f"Paciente: "
                f"{patient.full_name or 'N/A'}"
                f" | "
                f"{patient.code or 'Sin código'}"
                f" | Documento clínico confidencial"
            )[:125],
        )

        canvas.drawCentredString(
            page_width / 2,
            5.8 * mm,
            f"Generado el {generated_text}",
        )

        canvas.restoreState()

    return decorate

# ============================================================
# SECCIÓN AZUL
# ============================================================

def _section_bar(
    title,
    styles,
):
    table = Table(
        [[
            Paragraph(
                escape(title),
                styles[
                    "section_white"
                ],
            )
        ]],
        colWidths=[
            174 * mm
        ],
    )

    table.setStyle(
        TableStyle([
            (
                "BACKGROUND",
                (0, 0),
                (-1, -1),
                NAVY,
            ),

            (
                "LEFTPADDING",
                (0, 0),
                (-1, -1),
                7,
            ),

            (
                "RIGHTPADDING",
                (0, 0),
                (-1, -1),
                7,
            ),

            (
                "TOPPADDING",
                (0, 0),
                (-1, -1),
                5,
            ),

            (
                "BOTTOMPADDING",
                (0, 0),
                (-1, -1),
                5,
            ),
        ])
    )

    return table


# ============================================================
# TABLA DE CAMPOS
# ============================================================

def _field_table(
    rows,
    styles,
    widths=None,
):
    data = []

    for (
        left_label,
        left_value,
        right_label,
        right_value,
    ) in rows:

        data.append([
            _paragraph(
                left_label,
                styles["label"],
            ),

            _paragraph(
                left_value,
                styles["body"],
            ),

            _paragraph(
                right_label,
                styles["label"],
            ),

            _paragraph(
                right_value,
                styles["body"],
            ),
        ])

    table = Table(
        data,
        colWidths=(
            widths
            or [
                29 * mm,
                58 * mm,
                29 * mm,
                58 * mm,
            ]
        ),
    )

    table.setStyle(
        TableStyle([
            (
                "VALIGN",
                (0, 0),
                (-1, -1),
                "TOP",
            ),

            (
                "BACKGROUND",
                (0, 0),
                (0, -1),
                LIGHT_GRAY,
            ),

            (
                "BACKGROUND",
                (2, 0),
                (2, -1),
                LIGHT_GRAY,
            ),

            (
                "BOX",
                (0, 0),
                (-1, -1),
                0.35,
                BORDER,
            ),

            (
                "INNERGRID",
                (0, 0),
                (-1, -1),
                0.25,
                BORDER,
            ),

            (
                "LEFTPADDING",
                (0, 0),
                (-1, -1),
                4,
            ),

            (
                "RIGHTPADDING",
                (0, 0),
                (-1, -1),
                4,
            ),

            (
                "TOPPADDING",
                (0, 0),
                (-1, -1),
                4,
            ),

            (
                "BOTTOMPADDING",
                (0, 0),
                (-1, -1),
                4,
            ),
        ])
    )

    return table


def _single_field_table(
    rows,
    styles,
):
    data = []

    for label, value in rows:
        # Si ya recibimos un objeto Paragraph,
        # lo colocamos directamente en la celda.
        if isinstance(value, Paragraph):
            value_cell = value
        else:
            value_cell = _paragraph(
                value,
                styles["body"],
            )

        data.append([
            _paragraph(
                label,
                styles["label"],
            ),
            value_cell,
        ])

    table = Table(
        data,
        colWidths=[
            42 * mm,
            132 * mm,
        ],
    )

    table.setStyle(
        TableStyle([
            (
                "VALIGN",
                (0, 0),
                (-1, -1),
                "TOP",
            ),
            (
                "BACKGROUND",
                (0, 0),
                (0, -1),
                LIGHT_GRAY,
            ),
            (
                "GRID",
                (0, 0),
                (-1, -1),
                0.3,
                BORDER,
            ),
            (
                "LEFTPADDING",
                (0, 0),
                (-1, -1),
                4,
            ),
            (
                "RIGHTPADDING",
                (0, 0),
                (-1, -1),
                4,
            ),
            (
                "TOPPADDING",
                (0, 0),
                (-1, -1),
                4,
            ),
            (
                "BOTTOMPADDING",
                (0, 0),
                (-1, -1),
                4,
            ),
        ])
    )

    return table


# ============================================================
# ANTECEDENTES
# ============================================================

def _selected_history(
    values,
    labels=None,
):
    if not isinstance(
        values,
        dict,
    ):
        return ""

    selected = []

    for key, value in (
        values.items()
    ):
        if (
            key == "other"
            and value
        ):
            selected.append(
                str(value)
            )

        elif value is True:
            selected.append(
                (
                    labels or {}
                ).get(
                    key,
                    key.replace(
                        "_",
                        " ",
                    ).capitalize(),
                )
            )

    return ", ".join(
        selected
    )


INFECTIOUS_LABELS = {
    "hepatitis": "Hepatitis",
    "syphilis": "Sífilis",
    "tuberculosis": "Tuberculosis",
    "cholera": "Cólera",
    "amebiasis": "Amebiasis",
    "pertussis": "Tosferina",
    "measles": "Sarampión",
    "varicella": "Varicela",
    "rubella": "Rubéola",
    "mumps": "Parotiditis",
    "meningitis": "Meningitis",
    "impetigo": "Impétigo",
    "typhoid_fever": "Fiebre tifoidea",
    "scarlet_fever": "Escarlatina",
    "malaria": "Malaria",
    "scabies": "Escabiosis",
    "pediculosis": "Pediculosis",
    "ringworm": "Tiña",
}


HEREDITARY_LABELS = {
    "diabetes_mellitus":
        "Diabetes mellitus",

    "hypertension":
        "Hipertensión",

    "rheumatic_disease":
        "Enfermedad reumática",

    "kidney_diseases":
        "Enfermedades renales",

    "eye_diseases":
        "Enfermedades oculares",

    "heart_diseases":
        "Enfermedades cardíacas",

    "liver_disease":
        "Enfermedad hepática",

    "muscle_diseases":
        "Enfermedades musculares",

    "congenital_malformations":
        "Malformaciones congénitas",

    "mental_disorders":
        "Desórdenes mentales",

    "degenerative_cns_diseases":
        "Enfermedades degenerativas del SNC",

    "growth_anomalies":
        "Anomalías del crecimiento",

    "inborn_metabolic_errors":
        "Errores innatos del metabolismo",
}


# ============================================================
# CONSULTAS VISIBLES
# ============================================================

def _consultations_queryset(
    patient,
    actor=None,
):
    queryset = (
        patient
        .consultations
        .all()
    )

    if actor is not None:
        queryset = (
            consultations_visible_to(
                actor,
                queryset,
            )
        )

    return (
        queryset
        .select_related(
            "professional"
        )
        .prefetch_related(
            "amendments"
        )
    )


def _latest_consultation(
    patient,
    actor=None,
):
    return (
        _consultations_queryset(
            patient,
            actor,
        )
        .order_by(
            "-date",
            "-time",
            "-created_at",
            "-pk",
        )
        .first()
    )


# ============================================================
# 1. DATOS DEL PACIENTE
# ============================================================

def _patient_story(
    patient,
    styles,
    generated_at,
    clinic,
):
    local_date = (
        _local_generated_at(
            generated_at,
            clinic,
        ).date()
    )

    age = _age(
        patient.date_of_birth,
        local_date,
    )

    birth_display = (
        _date(
            patient.date_of_birth
        )
    )

    if age is not None:
        birth_display += (
            f" ({age} años)"
        )

    story = [
        _section_bar(
            "1. DATOS DEL PACIENTE",
            styles,
        ),

        Spacer(
            1,
            1.5 * mm,
        ),

        _field_table([
            (
                "NOMBRE",
                patient.full_name,
                "CÓDIGO",
                patient.code,
            ),

            (
                "NACIMIENTO",
                birth_display,
                "GÉNERO",
                (
                    patient
                    .get_gender_display()
                    if patient.gender
                    else None
                ),
            ),

            (
                "IDENTIFICACIÓN",
                patient.identification_number,
                "TELÉFONO",
                patient.phone,
            ),

            (
                "CORREO",
                patient.email,
                "ESTADO",
                (
                    "Activo"
                    if patient.is_active
                    else "Inactivo"
                ),
            ),

            (
                "DIRECCIÓN",
                patient.address,
                "LUGAR DE NACIMIENTO",
                patient.birth_place,
            ),

            (
                "RESPONSABLE",
                patient.guardian_name,
                "TEL. RESPONSABLE",
                patient.guardian_phone,
            ),
        ], styles),
    ]

    return story


# ============================================================
# 2. ANTECEDENTES Y ALERTAS
# ============================================================

def _clinical_story(
    patient,
    styles,
):
    story = [
        Spacer(
            1,
            3 * mm,
        ),

        _section_bar(
            "2. ANTECEDENTES Y ALERTAS CLÍNICAS",
            styles,
        ),

        Spacer(
            1,
            1.5 * mm,
        ),
    ]

    record = getattr(
        patient,
        "clinical_record",
        None,
    )

    if record is None:
        story.append(
            _single_field_table([
                (
                    "INFORMACIÓN",
                    "No existe información clínica general registrada.",
                )
            ], styles)
        )

        return story

    illness = (
        record.present_illness_history
        or record.chief_complaint
    )

    infectious = (
        _selected_history(
            record.infectious_diseases,
            INFECTIOUS_LABELS,
        )
    )

    hereditary = (
        _selected_history(
            record.hereditary_diseases,
            HEREDITARY_LABELS,
        )
    )

    story.append(
        _single_field_table([
            (
                "ENFERMEDAD ACTUAL",
                illness,
            )
        ], styles)
    )

    story.append(
        _field_table([
            (
                "ALERGIAS",
                record.allergies,
                "MEDICAMENTOS ACTUALES",
                record.current_medications,
            ),

            (
                "CONDICIONES RELEVANTES",
                record.relevant_conditions,
                "OTRAS ALERTAS",
                record.other_clinical_alerts,
            ),
        ], styles)
    )

    story.append(
        _single_field_table([
            (
                "ANTECEDENTES FAMILIARES",
                record.family_history,
            )
        ], styles)
    )

    story.append(
        _field_table([
            (
                "INFECTOCONTAGIOSAS",
                infectious,
                "HEREDITARIAS",
                hereditary,
            )
        ], styles)
    )

    return story


# ============================================================
# 3. CONSULTA DEL DÍA / ÚLTIMA CONSULTA
# ============================================================

def _consultation_story(
    patient,
    styles,
    actor=None,
):
    story = [
        Spacer(
            1,
            3 * mm,
        ),

        _section_bar(
            "3. CONSULTA DEL DÍA",
            styles,
        ),

        Spacer(
            1,
            1.5 * mm,
        ),
    ]

    consultation = (
        _latest_consultation(
            patient,
            actor,
        )
    )

    if consultation is None:
        story.append(
            _single_field_table([
                (
                    "CONSULTA",
                    "No hay consultas registradas.",
                )
            ], styles)
        )

        return story

    professional = (
        consultation
        .professional_name_snapshot
        or (
            consultation
            .professional
            .get_full_name()
            .strip()
        )
        or consultation
        .professional
        .email
    )

    date_time = (
        _date(
            consultation.date
        )
    )

    if consultation.time:
        date_time += (
            " - "
            f"{_time(consultation.time)}"
        )

    story.append(
        _field_table([
            (
                "FECHA Y HORA",
                date_time,
                "TIPO",
                (
                    consultation
                    .get_consultation_type_display()
                ),
            ),

            (
                "ESTADO",
                (
                    consultation
                    .get_status_display()
                ),
                "PROFESIONAL",
                professional,
            ),
        ], styles)
    )

    story.append(
        _single_field_table([
            (
                "MOTIVO DE CONSULTA",
                consultation.chief_complaint,
            ),

            (
                "RESUMEN",
                consultation.summary,
            ),

            (
                "DIAGNÓSTICO DENTAL",
                consultation.dental_diagnoses,
            ),
        ], styles)
    )

    return story


# ============================================================
# TRATAMIENTOS
# ============================================================

def _treatment_items(
    patient,
    actor=None,
):
    queryset = (
        treatments_visible_to(actor)
        if actor is not None
        else TreatmentItem.objects.all()
    )

    return list(
        queryset
        .filter(
            proposed_in__patient=patient
        )
        .select_related(
            "proposed_in",
            "performed_in",
        )
        .order_by(
            "proposed_in__date",
            "created_at",
            "pk",
        )
    )


def _treatment_table(
    items,
    styles,
):
    data = [[
        _paragraph(
            "PROCEDIMIENTO",
            styles["label"],
        ),

        _paragraph(
            "PIEZA",
            styles["label"],
        ),

        _paragraph(
            "FECHA PROPUESTA",
            styles["label"],
        ),

        _paragraph(
            "ESTADO",
            styles["label"],
        ),
    ]]

    if not items:
        data.append([
            _paragraph(
                "No hay procedimientos registrados.",
                styles["body"],
            ),
            "",
            "",
            "",
        ])

    else:
        for item in items:
            piece = (
                item.tooth_code
                or "General"
            )

            data.append([
                _paragraph(
                    item.description,
                    styles["body"],
                ),

                _paragraph(
                    piece,
                    styles["body"],
                ),

                _paragraph(
                    _date(
                        item.proposed_in.date
                    ),
                    styles["body"],
                ),

                _paragraph(
                    item.get_status_display(),
                    styles["body"],
                ),
            ])

    table = Table(
        data,
        colWidths=[
            59 * mm,
            25 * mm,
            43 * mm,
            47 * mm,
        ],
        repeatRows=1,
    )

    table.setStyle(
        TableStyle([
            (
                "BACKGROUND",
                (0, 0),
                (-1, 0),
                LIGHT_GRAY,
            ),

            (
                "VALIGN",
                (0, 0),
                (-1, -1),
                "TOP",
            ),

            (
                "GRID",
                (0, 0),
                (-1, -1),
                0.3,
                BORDER,
            ),

            (
                "SPAN",
                (0, 1),
                (-1, 1),
            )
            if not items
            else (
                "VALIGN",
                (0, 0),
                (-1, -1),
                "TOP",
            ),

            (
                "LEFTPADDING",
                (0, 0),
                (-1, -1),
                4,
            ),

            (
                "RIGHTPADDING",
                (0, 0),
                (-1, -1),
                4,
            ),

            (
                "TOPPADDING",
                (0, 0),
                (-1, -1),
                4,
            ),

            (
                "BOTTOMPADDING",
                (0, 0),
                (-1, -1),
                4,
            ),
        ])
    )

    return table


# ============================================================
# ODONTOGRAMA
# ============================================================

def _current_findings(
    version,
):
    findings = []

    for tooth_code in sorted(
        version.teeth
    ):
        tooth = (
            version.teeth[
                tooth_code
            ]
        )

        current = (
            tooth.get(
                "current",
                {},
            )
            if isinstance(
                tooth,
                dict,
            )
            else {}
        )

        whole = [
            FINDING_LABELS.get(
                item,
                item,
            )
            for item in current.get(
                "whole",
                [],
            )
        ]

        surface_items = []

        for (
            surface,
            values,
        ) in sorted(
            current.get(
                "surfaces",
                {},
            ).items()
        ):
            labels = ", ".join(
                FINDING_LABELS.get(
                    item,
                    item,
                )
                for item in values
            )

            surface_items.append(
                (
                    f"{SURFACE_LABELS.get(surface, surface.lower())}: "
                    f"{labels}"
                )
            )

        details = (
            whole +
            surface_items
        )

        if details:
            findings.append((
                tooth_code,
                "; ".join(details),
                tooth.get(
                    "note",
                    "",
                ),
            ))

    return findings


def _current_odontogram(
    patient,
    actor=None,
):
    queryset = (
        odontograms_visible_to(
            actor
        )
        if actor is not None
        else OdontogramVersion.objects.all()
    )

    return (
        queryset
        .filter(
            patient=patient
        )
        .select_related(
            "consultation"
        )
        .order_by(
            "-version_number"
        )
        .first()
    )


def _odontogram_summary(
    patient,
    styles,
    actor=None,
):
    current = (
        _current_odontogram(
            patient,
            actor,
        )
    )

    if current is None:
        return (
            "No existe odontograma registrado."
        )

    header = (
        f"Versión "
        f"{current.version_number}"
        f" - "
        f"{current.get_dentition_display()}"
        f" - Consulta del "
        f"{_date(current.consultation.date)}."
    )

    findings = (
        _current_findings(
            current
        )
    )

    text = [header]

    for (
        tooth_code,
        finding,
        note,
    ) in findings:
        value = (
            f"<b>Pieza "
            f"{escape(str(tooth_code))}"
            f":</b> "
            f"{escape(finding)}"
        )

        if note:
            value += (
                f". <b>Nota:</b> "
                f"{escape(note)}"
            )

        text.append(value)

    if not findings:
        text.append(
            "Sin hallazgos actuales estructurados."
        )

    return "<br/>".join(
        text
    )


# ============================================================
# DOCUMENTOS
# ============================================================

def _documents_text(
    patient,
    actor=None,
):
    queryset = (
        documents_visible_to(
            actor
        )
        if actor is not None
        else PatientDocument.objects.all()
    )

    documents = (
        queryset
        .filter(
            patient=patient
        )
        .order_by(
            "document_date",
            "created_at",
            "pk",
        )
    )

    count = documents.count()

    if not count:
        return (
            "No hay documentos adjuntos."
        )

    if count == 1:
        return (
            "1 documento adjunto registrado."
        )

    return (
        f"{count} documentos adjuntos registrados."
    )


# ============================================================
# 4. PLAN DE TRATAMIENTO Y ODONTOGRAMA
# ============================================================

def _treatment_and_odontogram_story(
    patient,
    styles,
    actor=None,
):
    items = (
        _treatment_items(
            patient,
            actor,
        )
    )

    diagnosis_parts = []

    for item in items:
        if (
            item.diagnosis_text
            and
            item.diagnosis_text
            not in diagnosis_parts
        ):
            diagnosis_parts.append(
                item.diagnosis_text
            )

    diagnosis = (
        " ".join(
            diagnosis_parts
        )
        if diagnosis_parts
        else "N/A"
    )

    story = [
        Spacer(
            1,
            4 * mm,
        ),

        _section_bar(
            "4. PLAN DE TRATAMIENTO Y ODONTOGRAMA",
            styles,
        ),

        Spacer(
            1,
            1.5 * mm,
        ),

        _treatment_table(
            items,
            styles,
        ),

        _single_field_table([
            (
                "DIAGNÓSTICO DEL TRATAMIENTO",
                diagnosis,
            ),

            (
                "ODONTOGRAMA",
                Paragraph(
                    _odontogram_summary(
                        patient,
                        styles,
                        actor,
                    ),
                    styles["body"],
                ),
            ),

            (
                "DOCUMENTOS ADJUNTOS",
                _documents_text(
                    patient,
                    actor,
                ),
            ),
        ], styles),
    ]

    return story


# ============================================================
# CONSENTIMIENTO
# ============================================================

def _consent_heading(
    styles,
):
    return [
        Spacer(
            1,
            4 * mm,
        ),

        Paragraph(
            (
                "CONSENTIMIENTO INFORMADO "
                "Y TÉRMINOS Y CONDICIONES"
            ),
            styles[
                "consent_title"
            ],
        ),

        Paragraph(
            (
                "Lea cuidadosamente este documento antes de firmar. "
                "Puede hacer todas las preguntas que considere necesarias."
            ),
            styles[
                "consent_intro"
            ],
        ),
    ]


def _procedures_consent_story(
    patient,
    styles,
    actor=None,
):
    items = (
        _treatment_items(
            patient,
            actor,
        )
    )

    identification = (
        patient.identification_number
        or "sin identificación registrada"
    )

    story = [
        _section_bar(
            "5. PROCEDIMIENTOS A REALIZAR",
            styles,
        ),

        Spacer(
            1,
            2 * mm,
        ),

        Paragraph(
            (
                f"Yo, <b>{_safe(patient.full_name)}</b>, "
                f"con identificación "
                f"<b>{_safe(identification)}</b>, "
                "declaro que el profesional tratante me ha explicado "
                "que, de acuerdo con el diagnóstico de mi caso, "
                "se me realizará lo siguiente:"
            ),
            styles["body"],
        ),

        Spacer(
            1,
            1.5 * mm,
        ),
    ]

    if not items:
        story.append(
            Paragraph(
                (
                    "• No existen procedimientos específicos registrados "
                    "en el plan de tratamiento al momento de generar "
                    "este documento."
                ),
                styles["body"],
            )
        )

        return story

    for item in items:
        location = (
            f" de la pieza "
            f"{item.tooth_code}"
            if item.tooth_code
            else ""
        )

        story.append(
            Paragraph(
                (
                    f"• <b>{_safe(item.description)}</b>"
                    f"{escape(location)}."
                ),
                styles["body"],
            )
        )

    return story


def _risk_story(
    styles,
):
    story = [
        Spacer(
            1,
            3 * mm,
        ),

        _section_bar(
            "6. INFORMACIÓN, RIESGOS Y ALTERNATIVAS",
            styles,
        ),

        Spacer(
            1,
            2 * mm,
        ),
    ]

    paragraphs = [
        (
            "<b>6.1 Naturaleza del procedimiento.</b> "
            "Comprendo que los procedimientos odontológicos serán "
            "realizados de acuerdo con el diagnóstico y plan de tratamiento "
            "registrado, utilizando las técnicas que el profesional considere "
            "apropiadas para mi caso."
        ),

        (
            "<b>6.2 Riesgos y molestias posibles.</b> "
            "Como en todo procedimiento odontológico, pueden presentarse "
            "dolor, inflamación, sangrado, sensibilidad, infección, "
            "reacciones a medicamentos o anestésicos, lesión de tejidos "
            "vecinos u otras complicaciones propias del procedimiento."
        ),

        (
            "<b>6.3 Alternativas.</b> "
            "Se me informó sobre las alternativas disponibles, incluida "
            "la posibilidad de no realizar el tratamiento, así como las "
            "consecuencias que pueden derivarse de no tratar la condición."
        ),

        (
            "<b>6.4 Tratamientos complementarios.</b> "
            "Comprendo que algunos procedimientos pueden requerir controles, "
            "tratamientos posteriores, restauraciones, prótesis, implantes "
            "u otras medidas que serán explicadas y acordadas por separado."
        ),

        (
            "<b>6.5 Resultados.</b> "
            "Entiendo que la odontología no es una ciencia exacta y que "
            "no se puede garantizar un resultado absoluto. El profesional "
            "se compromete a aplicar sus conocimientos y la técnica adecuada."
        ),
    ]

    for text in paragraphs:
        story.append(
            Paragraph(
                text,
                styles["body"],
            )
        )

    return story


def _patient_declarations_story(
    styles,
):
    story = [
        _section_bar(
            "7. DECLARACIONES DEL PACIENTE",
            styles,
        ),

        Spacer(
            1,
            2 * mm,
        ),
    ]

    paragraphs = [
        (
            "<b>7.1 Veracidad de la información.</b> "
            "Declaro que la información brindada sobre mi salud, alergias, "
            "medicamentos y antecedentes es verdadera y completa, y me "
            "comprometo a informar cualquier cambio. Entiendo que ocultar "
            "o alterar datos puede afectar mi tratamiento."
        ),

        (
            "<b>7.2 Comprensión.</b> "
            "Declaro que se me explicó en lenguaje claro el diagnóstico, "
            "el procedimiento, sus riesgos, beneficios y alternativas; "
            "que tuve la oportunidad de hacer preguntas y que fueron "
            "respondidas a mi satisfacción."
        ),

        (
            "<b>7.3 Autorización.</b> "
            "Con base en lo anterior, autorizo de forma libre, voluntaria "
            "y consciente al profesional y a su equipo a realizar los "
            "procedimientos descritos en este documento, incluido el uso "
            "de anestesia local cuando corresponda y cualquier medida "
            "razonable necesaria para mi seguridad."
        ),

        (
            "<b>7.4 Derecho a revocar.</b> "
            "Sé que puedo retirar mi consentimiento en cualquier momento "
            "antes del procedimiento, sin que ello afecte mi derecho a "
            "recibir atención."
        ),
    ]

    for text in paragraphs:
        story.append(
            Paragraph(
                text,
                styles["body"],
            )
        )

    return story


def _terms_story(
    styles,
):
    story = [
        Spacer(
            1,
            4 * mm,
        ),

        _section_bar(
            "8. TÉRMINOS Y CONDICIONES",
            styles,
        ),

        Spacer(
            1,
            2 * mm,
        ),
    ]

    paragraphs = [
        (
            "<b>8.1 Indicaciones postoperatorias.</b> "
            "Me comprometo a seguir las indicaciones dadas por el profesional "
            "sobre medicación, higiene, alimentación, reposo y controles. "
            "El incumplimiento puede favorecer la aparición de complicaciones."
        ),

        (
            "<b>8.2 Citas y controles.</b> "
            "Me comprometo a asistir a las citas de control acordadas y a "
            "comunicarme con la clínica ante sangrado abundante, fiebre, "
            "dolor intenso, inflamación creciente o cualquier síntoma inusual."
        ),

        (
            "<b>8.3 Honorarios y pagos.</b> "
            "Los costos de los procedimientos me serán informados previamente. "
            "Los tratamientos adicionales serán presupuestados y aceptados "
            "por separado."
        ),

        (
            "<b>8.4 Confidencialidad y datos personales.</b> "
            "Mis datos y mi expediente clínico son confidenciales. Autorizo "
            "su uso para fines de atención, seguimiento clínico y administrativo "
            "de la clínica, así como su entrega cuando corresponda legalmente."
        ),

        (
            "<b>8.5 Expediente clínico.</b> "
            "Este documento forma parte de mi expediente y refleja la "
            "información registrada al momento de su generación. No sustituye "
            "el expediente electrónico de la clínica."
        ),

        (
            "<b>8.6 Registros complementarios.</b> "
            "Autorizo, cuando sea clínicamente necesario, la toma de "
            "radiografías y fotografías para mi diagnóstico y seguimiento. "
            "Su uso con fines docentes o de difusión requerirá autorización "
            "expresa por separado."
        ),

        (
            "<b>8.7 Emergencias.</b> "
            "En caso de una complicación durante el procedimiento, autorizo "
            "al profesional a actuar según su criterio clínico para proteger "
            "mi salud y a referirme a otro centro si fuera necesario."
        ),
    ]

    for text in paragraphs:
        story.append(
            Paragraph(
                text,
                styles["body"],
            )
        )

    return story


# ============================================================
# FIRMAS
# ============================================================

def _signature_story(
    patient,
    styles,
    generated_at,
    clinic,
    actor=None,
):
    consultation = (
        _latest_consultation(
            patient,
            actor,
        )
    )

    professional_name = ""
    registration = ""

    if consultation:
        professional_name = (
            consultation
            .professional_name_snapshot
            or consultation
            .professional
            .get_full_name()
            .strip()
            or consultation
            .professional
            .email
        )

        registration = (
            consultation
            .professional
            .professional_registration_number
            or ""
        )

    local_date = (
        _local_generated_at(
            generated_at,
            clinic,
        )
    )

    clinic_place = (
        getattr(
            clinic,
            "city",
            None,
        )
        or getattr(
            clinic,
            "address",
            None,
        )
        or "Managua"
    )

    story = [
        _section_bar(
            "9. ACEPTACIÓN Y FIRMAS",
            styles,
        ),

        Spacer(
            1,
            2.5 * mm,
        ),

        Paragraph(
            (
                "Habiendo leído y comprendido este documento, "
                "y sin haber sido presionado(a) de ninguna forma, "
                "firmo en señal de conformidad con el expediente clínico, "
                "el plan de tratamiento y los términos y condiciones aquí descritos."
            ),
            styles["body"],
        ),

        Spacer(
            1,
            3 * mm,
        ),

        _field_table([
            (
                "Lugar y fecha",
                (
                    f"{clinic_place}, "
                    f"{local_date.strftime('%d/%m/%Y')}"
                ),
                "Hora",
                "____ : ____",
            )
        ], styles),

        Spacer(
            1,
            14 * mm,
        ),
    ]

    signature_data = [
        [
            Paragraph(
                "______________________________",
                styles["body"],
            ),

            Paragraph(
                "______________________________",
                styles["body"],
            ),
        ],

        [
            Paragraph(
                "<b>PACIENTE</b>",
                styles["label"],
            ),

            Paragraph(
                "<b>PROFESIONAL TRATANTE</b>",
                styles["label"],
            ),
        ],

        [
            Paragraph(
                _safe(
                    patient.full_name
                ),
                styles["body"],
            ),

            Paragraph(
                _safe(
                    professional_name,
                    "Nombre: ________________________",
                ),
                styles["body"],
            ),
        ],

        [
            Paragraph(
                (
                    "ID: "
                    + _safe(
                        patient.identification_number,
                        "N/A",
                    )
                ),
                styles["small"],
            ),

            Paragraph(
                (
                    "Cód. profesional / sello: "
                    + _safe(
                        registration,
                        "________________",
                    )
                ),
                styles["small"],
            ),
        ],
    ]

    signature_table = Table(
        signature_data,
        colWidths=[
            87 * mm,
            87 * mm,
        ],
    )

    signature_table.setStyle(
        TableStyle([
            (
                "ALIGN",
                (0, 0),
                (-1, -1),
                "CENTER",
            ),

            (
                "VALIGN",
                (0, 0),
                (-1, -1),
                "TOP",
            ),

            (
                "LEFTPADDING",
                (0, 0),
                (-1, -1),
                5,
            ),

            (
                "RIGHTPADDING",
                (0, 0),
                (-1, -1),
                5,
            ),
        ])
    )

    story.append(
        signature_table
    )

    story.extend([
        Spacer(
            1,
            7 * mm,
        ),

        Paragraph(
            (
                "<b>Huella dactilar del paciente (opcional):</b>"
            ),
            styles["small"],
        ),

        Spacer(
            1,
            2 * mm,
        ),
    ])

    fingerprint = Table(
        [[""]],
        colWidths=[
            25 * mm
        ],
        rowHeights=[
            25 * mm
        ],
    )

    fingerprint.setStyle(
        TableStyle([
            (
                "BOX",
                (0, 0),
                (-1, -1),
                0.5,
                BORDER,
            )
        ])
    )

    story.append(
        fingerprint
    )

    story.extend([
        Spacer(
            1,
            8 * mm,
        ),

        Paragraph(
            (
                "Este documento se emite en dos ejemplares: "
                "uno para el paciente y otro para el expediente de la clínica."
            ),
            styles["small"],
        ),
    ])

    return story


# ============================================================
# DOCUMENTOS DETALLADOS OPCIONALES
# ============================================================

def _document_story(
    patient,
    styles,
    actor=None,
):
    queryset = (
        documents_visible_to(
            actor
        )
        if actor is not None
        else PatientDocument.objects.all()
    )

    documents = (
        queryset
        .filter(
            patient=patient
        )
        .select_related(
            "consultation"
        )
        .order_by(
            "document_date",
            "created_at",
            "pk",
        )
    )

    if not documents.exists():
        return []

    story = [
        Spacer(
            1,
            4 * mm,
        ),

        _section_bar(
            "DOCUMENTOS ADJUNTOS",
            styles,
        ),

        Spacer(
            1,
            1.5 * mm,
        ),
    ]

    data = [[
        _paragraph(
            "FECHA",
            styles["label"],
        ),

        _paragraph(
            "CATEGORÍA",
            styles["label"],
        ),

        _paragraph(
            "ARCHIVO",
            styles["label"],
        ),

        _paragraph(
            "CONTEXTO",
            styles["label"],
        ),
    ]]

    for document in documents:
        context = []

        if document.consultation_id:
            context.append(
                (
                    "Consulta "
                    f"{_date(document.consultation.date)}"
                )
            )

        if document.tooth_code:
            context.append(
                (
                    "Pieza "
                    f"{document.tooth_code}"
                )
            )

        data.append([
            _paragraph(
                _date(
                    document.document_date
                ),
                styles["body"],
            ),

            _paragraph(
                document.category,
                styles["body"],
            ),

            _paragraph(
                document.original_name,
                styles["body"],
            ),

            _paragraph(
                (
                    " · ".join(
                        context
                    )
                    or "Paciente"
                ),
                styles["small"],
            ),
        ])

    table = Table(
        data,
        colWidths=[
            28 * mm,
            40 * mm,
            61 * mm,
            45 * mm,
        ],
        repeatRows=1,
    )

    table.setStyle(
        TableStyle([
            (
                "BACKGROUND",
                (0, 0),
                (-1, 0),
                LIGHT_GRAY,
            ),

            (
                "GRID",
                (0, 0),
                (-1, -1),
                0.3,
                BORDER,
            ),

            (
                "VALIGN",
                (0, 0),
                (-1, -1),
                "TOP",
            ),

            (
                "LEFTPADDING",
                (0, 0),
                (-1, -1),
                4,
            ),

            (
                "RIGHTPADDING",
                (0, 0),
                (-1, -1),
                4,
            ),

            (
                "TOPPADDING",
                (0, 0),
                (-1, -1),
                4,
            ),

            (
                "BOTTOMPADDING",
                (0, 0),
                (-1, -1),
                4,
            ),
        ])
    )

    story.append(
        table
    )

    return story


# ============================================================
# GENERACIÓN FINAL
# ============================================================

def build_clinical_record_pdf(
    *,
    patient,
    clinic,
    generated_at,
    include_documents=False,
    actor=None,
):
    styles = _styles()

    logo_reader = (
        _logo_reader(
            clinic
        )
    )

    buffer = BytesIO()

    document = SimpleDocTemplate(
        buffer,

        pagesize=A4,

        leftMargin=18 * mm,
        rightMargin=18 * mm,

        topMargin=24 * mm,
        bottomMargin=18 * mm,

        title=(
            "Expediente clínico y consentimiento informado "
            f"{patient.code or patient.pk}"
        ),

        author=(
            clinic.name
            or "DentalClinic"
        ),

        subject=(
            "Expediente clínico y consentimiento informado"
        ),

        pageCompression=1,
    )

    generated_local = (
        _local_generated_at(
            generated_at,
            clinic,
        )
    )

    # ========================================================
    # PÁGINA 1
    # ========================================================

    story = [
        Spacer(
            1,
            1 * mm,
        ),

        Paragraph(
            "EXPEDIENTE CLÍNICO Y CONSENTIMIENTO INFORMADO",
            styles[
                "document_title"
            ],
        ),

        Paragraph(
            (
                "Documento clínico confidencial"
                " | Fecha de emisión: "
                f"{generated_local.strftime('%d/%m/%Y')}"
            ),
            styles[
                "document_subtitle"
            ],
        ),
    ]

    story.extend(
        _patient_story(
            patient,
            styles,
            generated_at,
            clinic,
        )
    )

    story.extend(
        _clinical_story(
            patient,
            styles,
        )
    )

    story.extend(
        _consultation_story(
            patient,
            styles,
            actor,
        )
    )

    # ========================================================
    # PÁGINA 2
    # ========================================================

    story.append(
        PageBreak()
    )

    story.extend(
        _treatment_and_odontogram_story(
            patient,
            styles,
            actor,
        )
    )

    if include_documents:
        story.extend(
            _document_story(
                patient,
                styles,
                actor,
            )
        )

    story.extend(
        _consent_heading(
            styles
        )
    )

    story.extend(
        _procedures_consent_story(
            patient,
            styles,
            actor,
        )
    )

    story.extend(
        _risk_story(
            styles
        )
    )

    # ========================================================
    # PÁGINA 3
    # ========================================================

    story.append(
        PageBreak()
    )

    story.extend(
        _patient_declarations_story(
            styles
        )
    )

    story.extend(
        _terms_story(
            styles
        )
    )

    # ========================================================
    # PÁGINA 4
    # ========================================================

    story.append(
        PageBreak()
    )

    story.extend(
        _signature_story(
            patient,
            styles,
            generated_at,
            clinic,
            actor,
        )
    )

    decorate = (
        _page_decorator(
            clinic=clinic,
            patient=patient,
            generated_at=generated_at,
            logo_reader=logo_reader,
        )
    )

    document.build(
        story,

        onFirstPage=decorate,
        onLaterPages=decorate,

        canvasmaker=
            NumberedCanvas,
    )

    return buffer.getvalue()