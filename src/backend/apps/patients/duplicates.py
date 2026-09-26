from dataclasses import dataclass
from datetime import date

from django.db.models import Q, Value
from django.db.models.functions import Lower, Replace, Trim

from .models import Patient


MAX_POSSIBLE_DUPLICATES = 10
_PHONE_SEPARATORS = (" ", "-", "(", ")", "+", ".", "\t", "\r", "\n")


@dataclass(frozen=True)
class PossiblePatientDuplicate:
    patient: Patient
    matched_on: tuple[str, ...]


def _replace_characters(expression, characters):
    for character in characters:
        expression = Replace(expression, Value(character), Value(""))
    return expression


def phone_key_expression():
    return _replace_characters(Trim("phone"), _PHONE_SEPARATORS)


def normalized_name_expression(field_name):
    expression = Trim(field_name)
    for whitespace in ("\t", "\r", "\n"):
        expression = Replace(expression, Value(whitespace), Value(" "))
    for _ in range(4):
        expression = Replace(expression, Value("  "), Value(" "))
    return Lower(expression)


def normalize_phone_key(value):
    normalized = str(value or "").strip()
    for character in _PHONE_SEPARATORS:
        normalized = normalized.replace(character, "")
    return normalized


def normalize_name_key(value):
    return " ".join(str(value or "").split()).casefold()


def find_possible_patient_duplicates(
    *,
    first_name="",
    first_last_name="",
    date_of_birth: date | None = None,
    phone="",
    exclude_patient_id=None,
    limit=MAX_POSSIBLE_DUPLICATES,
    queryset=None,
):
    phone_key = normalize_phone_key(phone)
    first_name_key = normalize_name_key(first_name)
    first_last_name_key = normalize_name_key(first_last_name)
    has_name_rule = bool(first_name_key and first_last_name_key and date_of_birth)
    if not phone_key and not has_name_rule:
        return []

    queryset = (Patient.objects.all() if queryset is None else queryset).annotate(
        _duplicate_phone_key=phone_key_expression(),
        _duplicate_first_name_key=normalized_name_expression("first_name"),
        _duplicate_last_name_key=normalized_name_expression("last_name"),
    )
    criteria = Q()
    if phone_key:
        criteria |= Q(_duplicate_phone_key=phone_key)
    if has_name_rule:
        criteria |= Q(
            _duplicate_first_name_key=first_name_key,
            _duplicate_last_name_key=first_last_name_key,
            date_of_birth=date_of_birth,
        )
    queryset = queryset.filter(criteria)
    if exclude_patient_id is not None:
        queryset = queryset.exclude(pk=exclude_patient_id)

    bounded_limit = max(0, min(int(limit), MAX_POSSIBLE_DUPLICATES))
    if bounded_limit == 0:
        return []
    patients = list(
        queryset.only(
            "id",
            "code",
            "first_name",
            "last_name",
            "second_last_name",
            "date_of_birth",
            "phone",
            "is_active",
        ).order_by("pk")[:bounded_limit]
    )

    matches = []
    for patient in patients:
        matched_on = []
        if phone_key and normalize_phone_key(patient.phone) == phone_key:
            matched_on.append("phone")
        if (
            has_name_rule
            and normalize_name_key(patient.first_name) == first_name_key
            and normalize_name_key(patient.last_name) == first_last_name_key
            and patient.date_of_birth == date_of_birth
        ):
            matched_on.append("name_and_date_of_birth")
        matches.append(PossiblePatientDuplicate(patient, tuple(matched_on)))
    return matches
