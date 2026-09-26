from apps.common.test_utils import legacy_consultation_response
from rest_framework.test import APITestCase

from apps.users.models import RolePermissionPreset, User

from django.core.exceptions import ValidationError

from .models import OdontogramVersion, Patient


class OdontogramApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="admin-odontograms@dentalclinic.com",
            password="ContraseñaAdmin123!",
            role=User.Role.ADMINISTRADOR,
        )
        self.dentist = User.objects.create_user(
            email="dentist-odontograms@dentalclinic.com",
            password="ContraseñaDentist123!",
            role=User.Role.ODONTOLOGO,
            first_name="Elena",
            last_name="Rivera",
        )
        self.receptionist = User.objects.create_user(
            email="reception-odontograms@dentalclinic.com",
            password="ContraseñaReception123!",
            role=User.Role.RECEPCIONISTA,
        )
        self.patient = Patient.objects.create(
            first_name="María",
            last_name="García",
            birth_place="Managua",
            identification_type=Patient.IdentificationType.CEDULA,
            identification_number="001-160498-0001A",
            phone="+505 8000 0000",
            gender="FEMENINO",
            date_of_birth="1998-04-16",
            registered_by=self.admin,
        )
        self.other_patient = Patient.objects.create(
            first_name="Juan",
            last_name="Pérez",
            birth_place="León",
            identification_type=Patient.IdentificationType.CEDULA,
            identification_number="001-010190-0002B",
            phone="+505 8000 0000",
            gender="MASCULINO",
            date_of_birth="1990-01-01",
            registered_by=self.admin,
        )
        self.consultations_url = f"/api/patients/{self.patient.pk}/consultations/"

    def consultation_payload(self, **overrides):
        payload = {
            "date": "2026-08-09",
            "time": "09:30:00",
            "consultation_type": "GENERAL",
            "summary": "Valoración odontológica.",
            "status": "EN_PROGRESO",
        }
        payload.update(overrides)
        return payload

    def create_consultation(self, **overrides):
        self.client.force_authenticate(self.dentist)
        return legacy_consultation_response(self.patient, self.dentist, self.consultation_payload(**overrides))

    def odontogram_url(self, consultation_id, patient=None):
        patient = patient or self.patient
        return (
            f"/api/patients/{patient.pk}/consultations/"
            f"{consultation_id}/odontogram/"
        )

    def versions_url(self, consultation_id, patient=None):
        return f"{self.odontogram_url(consultation_id, patient)}versions/"

    def history_url(self, patient=None):
        patient = patient or self.patient
        return f"/api/patients/{patient.pk}/odontogram-versions/"

    def chart_payload(self, base_version_id, **overrides):
        payload = {
            "base_version_id": base_version_id,
            "dentition": "PERMANENT",
            "note": "Control de caries y plan restaurador.",
            "teeth": {
                "14": {
                    "reviewed": True,
                    "note": "Sensibilidad referida",
                    "current": {
                        "whole": ["CROWN"],
                        "surfaces": {"MESIAL": ["CARIES"]},
                    },
                    "planned": {
                        "whole": [],
                        "surfaces": {"MESIAL": ["RESTORATION"]},
                    },
                },
                "46": {
                    "reviewed": True,
                    "note": "",
                    "current": {"whole": [], "surfaces": {}},
                    "planned": {"whole": [], "surfaces": {}},
                },
            },
        }
        payload.update(overrides)
        return payload

    def test_creating_a_consultation_creates_its_initial_odontogram_version(self):
        consultation = self.create_consultation()

        response = self.client.get(self.odontogram_url(consultation.data["id"]))

        self.assertEqual(consultation.status_code, 201)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["patient"], self.patient.pk)
        self.assertEqual(response.data["consultation"], consultation.data["id"])
        self.assertEqual(response.data["version_number"], 1)
        self.assertEqual(response.data["schema_version"], 1)
        self.assertEqual(response.data["dentition"], "PERMANENT")
        self.assertEqual(response.data["teeth"], {})
        self.assertEqual(response.data["created_by"], self.dentist.pk)
        self.assertEqual(response.data["professional_name"], "Elena Rivera")

    def test_initial_dentition_is_suggested_from_age(self):
        cases = (
            ("2022-08-10", "PRIMARY"),
            ("2017-08-09", "MIXED"),
            ("2013-08-09", "PERMANENT"),
        )
        for index, (birth_date, expected) in enumerate(cases, start=1):
            with self.subTest(expected=expected):
                patient = Patient.objects.create(
                    first_name=f"Paciente {index}",
                    last_name="Dentición",
                    birth_place="Managua",
                    identification_type=Patient.IdentificationType.CEDULA,
                    identification_number=f"001-090809-000{index}D",
                    phone="+505 8000 0000",
                    guardian_name="Responsable de prueba",
                    guardian_relationship="Madre, padre o tutor",
                    guardian_phone="+505 8000 0001",
                    gender="OTRO",
                    date_of_birth=birth_date,
                    registered_by=self.admin,
                )
                self.client.force_authenticate(self.dentist)
                consultation = legacy_consultation_response(patient, self.dentist, self.consultation_payload())
                chart = self.client.get(
                    self.odontogram_url(consultation.data["id"], patient)
                )
                self.assertEqual(chart.data["dentition"], expected)

    def test_new_consultation_copies_latest_patient_snapshot_and_numbers_globally(self):
        first_consultation = self.create_consultation()
        first_chart = self.client.get(
            self.odontogram_url(first_consultation.data["id"])
        ).data
        revision = self.client.post(
            self.versions_url(first_consultation.data["id"]),
            self.chart_payload(first_chart["id"], dentition="MIXED"),
            format="json",
        )

        second_consultation = self.create_consultation(summary="Consulta posterior.")
        copied = self.client.get(
            self.odontogram_url(second_consultation.data["id"])
        )

        self.assertEqual(revision.status_code, 201)
        self.assertEqual(copied.status_code, 200)
        self.assertEqual(copied.data["version_number"], 3)
        self.assertEqual(copied.data["based_on"], revision.data["id"])
        self.assertEqual(copied.data["dentition"], "MIXED")
        self.assertEqual(copied.data["teeth"], revision.data["teeth"])
        self.assertEqual(copied.data["changed_teeth"], [])

    def test_creates_immutable_partial_revision_with_author_and_changes(self):
        consultation = self.create_consultation()
        initial = self.client.get(self.odontogram_url(consultation.data["id"])).data

        response = self.client.post(
            self.versions_url(consultation.data["id"]),
            self.chart_payload(initial["id"]),
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["version_number"], 2)
        self.assertEqual(response.data["based_on"], initial["id"])
        self.assertEqual(response.data["created_by"], self.dentist.pk)
        self.assertEqual(response.data["changed_teeth"], ["14", "46"])
        self.assertEqual(response.data["teeth"]["46"]["current"]["whole"], [])
        version = OdontogramVersion.objects.get(pk=response.data["id"])
        version.note = "Intento de sobrescritura"
        with self.assertRaises(ValidationError):
            version.save()
        with self.assertRaises(ValidationError):
            version.delete()

    def test_rejects_invalid_fdi_surfaces_catalogs_and_dentition(self):
        consultation = self.create_consultation()
        initial = self.client.get(self.odontogram_url(consultation.data["id"])).data
        invalid_payloads = (
            self.chart_payload(initial["id"], teeth={"99": {"reviewed": True}}),
            self.chart_payload(initial["id"], dentition="PRIMARY"),
            self.chart_payload(
                initial["id"],
                teeth={
                    "14": {
                        "reviewed": True,
                        "current": {"whole": [], "surfaces": {"LINGUAL": ["CARIES"]}},
                        "planned": {"whole": [], "surfaces": {}},
                    }
                },
            ),
            self.chart_payload(
                initial["id"],
                teeth={
                    "14": {
                        "reviewed": True,
                        "current": {"whole": ["EXTRACTION"], "surfaces": {}},
                        "planned": {"whole": [], "surfaces": {}},
                    }
                },
            ),
            self.chart_payload(
                initial["id"],
                teeth={
                    "14": {
                        "reviewed": True,
                        "note": {"contenido": "no textual"},
                        "current": {"whole": [], "surfaces": {}},
                        "planned": {"whole": [], "surfaces": {}},
                    }
                },
            ),
        )

        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                response = self.client.post(
                    self.versions_url(consultation.data["id"]),
                    payload,
                    format="json",
                )
                self.assertEqual(response.status_code, 400)

        self.assertEqual(OdontogramVersion.objects.count(), 1)

    def test_rejects_note_only_revision_and_stale_base_with_conflict(self):
        consultation = self.create_consultation()
        initial = self.client.get(self.odontogram_url(consultation.data["id"])).data
        note_only = self.client.post(
            self.versions_url(consultation.data["id"]),
            self.chart_payload(initial["id"], teeth={}),
            format="json",
        )
        current = self.client.post(
            self.versions_url(consultation.data["id"]),
            self.chart_payload(initial["id"]),
            format="json",
        )
        stale = self.client.post(
            self.versions_url(consultation.data["id"]),
            self.chart_payload(
                initial["id"],
                teeth={
                    "11": {
                        "reviewed": True,
                        "note": "",
                        "current": {"whole": [], "surfaces": {}},
                        "planned": {"whole": [], "surfaces": {}},
                    }
                },
            ),
            format="json",
        )

        self.assertEqual(note_only.status_code, 400)
        self.assertEqual(current.status_code, 201)
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(
            stale.data,
            {
                "detail": "El odontograma cambió desde que lo abriste.",
                "current_version_id": current.data["id"],
            },
        )

    def test_history_and_detail_are_scoped_to_patient_and_are_read_only(self):
        consultation = self.create_consultation()
        initial = self.client.get(self.odontogram_url(consultation.data["id"])).data
        revision = self.client.post(
            self.versions_url(consultation.data["id"]),
            self.chart_payload(initial["id"]),
            format="json",
        )

        history = self.client.get(self.history_url())
        detail = self.client.get(f"{self.history_url()}{revision.data['id']}/")
        wrong_patient = self.client.get(
            f"{self.history_url(self.other_patient)}{revision.data['id']}/"
        )

        self.assertEqual(history.status_code, 200)
        self.assertEqual(
            [item["version_number"] for item in history.data["results"]],
            [2, 1],
        )
        self.assertNotIn("teeth", history.data["results"][0])
        self.assertEqual(detail.status_code, 200)
        self.assertIn("teeth", detail.data)
        self.assertEqual(wrong_patient.status_code, 404)
        self.assertEqual(
            self.client.patch(
                f"{self.history_url()}{revision.data['id']}/",
                {"note": "No"},
                format="json",
            ).status_code,
            405,
        )
        self.assertEqual(
            self.client.delete(f"{self.history_url()}{revision.data['id']}/").status_code,
            405,
        )
        self.assertEqual(
            self.client.patch(
                self.odontogram_url(consultation.data["id"]),
                {"note": "No"},
                format="json",
            ).status_code,
            405,
        )
        self.assertEqual(
            self.client.delete(self.versions_url(consultation.data["id"])).status_code,
            405,
        )

    def test_scope_permissions_and_administrator_access_are_enforced(self):
        consultation = self.create_consultation()
        chart_url = self.odontogram_url(consultation.data["id"])
        version_url = self.versions_url(consultation.data["id"])
        initial = self.client.get(chart_url).data

        self.client.force_authenticate(self.receptionist)
        self.assertEqual(self.client.get(chart_url).status_code, 200)
        self.assertEqual(
            self.client.post(
                version_url,
                self.chart_payload(initial["id"]),
                format="json",
            ).status_code,
            403,
        )

        self.client.force_authenticate(self.admin)
        self.assertEqual(
            self.client.post(
                version_url,
                self.chart_payload(initial["id"]),
                format="json",
            ).status_code,
            201,
        )
        self.assertEqual(
            self.client.get(
                self.odontogram_url(consultation.data["id"], self.other_patient)
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.post(
                self.versions_url(consultation.data["id"], self.other_patient),
                self.chart_payload(initial["id"]),
                format="json",
            ).status_code,
            404,
        )

    def test_get_returns_latest_revision_for_the_consultation(self):
        consultation = self.create_consultation()
        initial = self.client.get(self.odontogram_url(consultation.data["id"])).data
        revision = self.client.post(
            self.versions_url(consultation.data["id"]),
            self.chart_payload(initial["id"]),
            format="json",
        )

        response = self.client.get(self.odontogram_url(consultation.data["id"]))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], revision.data["id"])
