import re

from django.db import models
from django.db.models.functions import Replace, Trim, Upper


CEDULA = "CEDULA"


def normalize_identification_number(value):
    """Normalize new API input without discarding significant characters."""
    if value is None:
        return None
    normalized = str(value).strip().upper()
    return normalized or None


def normalize_identification_key(identification_type, value):
    normalized = normalize_identification_number(value)
    if normalized is None:
        return None
    if identification_type == CEDULA:
        return re.sub(r"[\s-]+", "", normalized)
    return normalized


def format_cedula(value):
    number = normalize_identification_key(CEDULA, value)
    if number is None or not re.fullmatch(r"[0-9]{13}[A-Z]", number):
        return None
    return f"{number[:3]}-{number[3:9]}-{number[9:]}"


def identification_key_expression():
    """Return the expression used by the database duplicate constraint."""
    number = Trim("identification_number")
    cedula_number = Replace(
        Replace(number, models.Value(" "), models.Value("")),
        models.Value("-"),
        models.Value(""),
    )
    return Upper(
        models.Case(
            models.When(identification_type=CEDULA, then=cedula_number),
            default=number,
            output_field=models.CharField(max_length=64),
        )
    )
