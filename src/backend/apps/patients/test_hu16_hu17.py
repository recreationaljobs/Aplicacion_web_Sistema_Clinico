from apps.common.test_utils import assign_test_patient, assigned_test_consultation, start_test_attendance
from datetime import date, datetime, time, timezone as datetime_timezone

from rest_framework.test import APITestCase

from apps.appointments.models import Appointment
from apps.users.models import RolePermissionPreset, User

from .models import Consultation, OdontogramVersion, Patient, TreatmentItem


class PatientOrderingApiTests(APITestCase):
    url = "/api/patients/"

    def setUp(self):
        self.admin = User.objects.create_user(
            email="hu16-admin@example.test",
            password="SyntheticOnly123!",
            role=User.Role.ADMINISTRADOR,
        )
        self.dentist = User.objects.create_user(
            email="hu16-dentist@example.test",
            password="SyntheticOnly123!",
            role=User.Role.ODONTOLOGO,
        )

    def create_patient(self, first_name, last_name, *, active=True):
        return Patient.objects.create(
            first_name=first_name,
            last_name=last_name,
            birth_place="Managua",
            phone=f"8800-{Patient.objects.count() + 1000}",
            gender=Patient.Gender.OTRO,
            date_of_birth=date(1990, 1, 1),
            is_active=active,
            registered_by=self.admin,
        )

    def result_ids(self, **params):
        response = self.client.get(self.url, params)
        self.assertEqual(response.status_code, 200, response.data)
        return [item["id"] for item in response.data["results"]]

    def test_orders_names_ascending_and_descending_with_stable_ties(self):
        first_tie = self.create_patient("Ana", "López")
        second_tie = self.create_patient("Ana", "López")
        last = self.create_patient("Bruno", "García")
        self.client.force_authenticate(self.admin)

        ascending = self.result_ids(ordering="name")
        descending = self.result_ids(ordering="-name")

        self.assertEqual(ascending, [first_tie.pk, second_tie.pk, last.pk])
        self.assertEqual(descending, [last.pk, second_tie.pk, first_tie.pk])

    def test_orders_code_registration_and_activity_in_the_database(self):
        first = self.create_patient("Primero", "Orden", active=True)
        second = self.create_patient("Segundo", "Orden", active=False)
        third = self.create_patient("Tercero", "Orden", active=True)
        same_created_at = datetime(2026, 8, 1, 9, 0, tzinfo=datetime_timezone.utc)
        Patient.objects.filter(pk__in=(first.pk, second.pk)).update(created_at=same_created_at)
        Patient.objects.filter(pk=third.pk).update(
            created_at=datetime(2026, 8, 2, 9, 0, tzinfo=datetime_timezone.utc)
        )
        self.client.force_authenticate(self.admin)

        self.assertEqual(
            self.result_ids(ordering="code"),
            [first.pk, second.pk, third.pk],
        )
        self.assertEqual(
            self.result_ids(ordering="-created_at"),
            [third.pk, second.pk, first.pk],
        )
        self.assertEqual(
            self.result_ids(ordering="is_active"),
            [second.pk, first.pk, third.pk],
        )

    def test_search_and_pagination_preserve_the_selected_order(self):
        first = self.create_patient("Coincidencia", "Zulu")
        second = self.create_patient("Coincidencia", "Alfa")
        third = self.create_patient("Coincidencia", "Mike")
        self.create_patient("Fuera", "Resultado")
        self.client.force_authenticate(self.admin)

        first_page = self.client.get(
            self.url,
            {"search": "Coincidencia", "ordering": "name", "page_size": 2},
        )
        second_page = self.client.get(
            self.url,
            {
                "search": "Coincidencia",
                "ordering": "name",
                "page_size": 2,
                "page": 2,
            },
        )

        self.assertEqual(first_page.status_code, 200, first_page.data)
        self.assertEqual(second_page.status_code, 200, second_page.data)
        self.assertEqual(first_page.data["count"], 3)
        self.assertEqual(
            [item["id"] for item in first_page.data["results"]],
            [second.pk, third.pk],
        )
        self.assertEqual(
            [item["id"] for item in second_page.data["results"]],
            [first.pk],
        )

    def test_rejects_arbitrary_or_multiple_ordering_fields(self):
        self.create_patient("Paciente", "Seguro")
        self.client.force_authenticate(self.admin)

        arbitrary = self.client.get(self.url, {"ordering": "identification_number"})
        multiple = self.client.get(self.url, {"ordering": "name,-created_at"})

        self.assertEqual(arbitrary.status_code, 400)
        self.assertIn("ordering", arbitrary.data)
        self.assertEqual(multiple.status_code, 400)
        self.assertIn("ordering", multiple.data)

    def test_ordering_keeps_the_existing_list_permission(self):
        self.create_patient("Paciente", "Privado")

        anonymous = self.client.get(self.url, {"ordering": "name"})
        preset = RolePermissionPreset.objects.get(role=User.Role.ODONTOLOGO)
        preset.permissions = []
        preset.save(update_fields=("permissions",))
        self.client.force_authenticate(self.dentist)
        unauthorized = self.client.get(self.url, {"ordering": "name"})
        preset.permissions = ["patients.view"]
        preset.save(update_fields=("permissions",))
        authorized = self.client.get(self.url, {"ordering": "name"})

        self.assertEqual(anonymous.status_code, 401)
        self.assertEqual(unauthorized.status_code, 403)
        self.assertEqual(authorized.status_code, 200)


class InactivePatientPolicyApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="hu17-admin@example.test",
            password="SyntheticOnly123!",
            role=User.Role.ADMINISTRADOR,
        )
        self.dentist = User.objects.create_user(
            email="hu17-dentist@example.test",
            password="SyntheticOnly123!",
            role=User.Role.ODONTOLOGO,
            first_name="Elena",
            last_name="Vargas",
        )
        self.restricted = User.objects.create_user(
            email="hu17-restricted@example.test",
            password="SyntheticOnly123!",
            role=User.Role.ODONTOLOGO,
        )
        self.patient = self.create_patient("Paciente", "Activo")
        assign_test_patient(self.patient, self.dentist)
        assign_test_patient(self.patient, self.restricted)

    def create_patient(self, first_name, last_name, *, active=True, phone="8888-1717"):
        return Patient.objects.create(
            first_name=first_name,
            last_name=last_name,
            birth_place="Managua",
            phone=phone,
            gender=Patient.Gender.OTRO,
            date_of_birth=date(1990, 1, 1),
            is_active=active,
            registered_by=self.admin,
        )

    @staticmethod
    def consultation_payload():
        return {
            "date": "2026-09-01",
            "time": "09:00:00",
            "consultation_type": Consultation.Type.GENERAL,
            "summary": "Consulta de política de inactividad.",
            "status": Consultation.Status.IN_PROGRESS,
        }

    def test_patients_edit_permission_controls_inactivation_and_reactivation(self):
        url = f"/api/patients/{self.patient.pk}/"
        self.client.force_authenticate(self.restricted)

        denied = self.client.patch(url, {"is_active": False}, format="json")
        preset = RolePermissionPreset.objects.get(role=User.Role.ODONTOLOGO)
        preset.permissions = ["patients.edit", "patients.view"]
        preset.save(update_fields=("permissions",))
        inactivated = self.client.patch(url, {"is_active": False}, format="json")
        reactivated = self.client.patch(url, {"is_active": True}, format="json")

        self.assertEqual(denied.status_code, 403)
        self.assertEqual(inactivated.status_code, 200, inactivated.data)
        self.assertFalse(inactivated.data["is_active"])
        self.assertEqual(reactivated.status_code, 200, reactivated.data)
        self.assertTrue(reactivated.data["is_active"])

    def test_inactive_patient_cannot_start_attendance_and_appointment_is_unchanged(self):
        appointment = Appointment.objects.create(
            patient=self.patient,
            dentist=self.dentist,
            date=date(2026, 9, 2),
            start_time=time(9, 0),
            duration_minutes=60,
            reason="Cita creada antes de inactivar",
            created_by=self.admin,
        )
        self.patient.is_active = False
        self.patient.save(update_fields=("is_active",))
        self.client.force_authenticate(self.admin)

        response = start_test_attendance(self.client, appointment)

        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(response.data["code"], "patient_inactive")
        appointment.refresh_from_db()
        self.assertEqual(appointment.status, Appointment.Status.SCHEDULED)
        self.assertIsNone(appointment.consultation_id)
        self.assertIsNone(appointment.attendance_started_at)
        self.assertEqual(Consultation.objects.count(), 0)
        self.assertEqual(OdontogramVersion.objects.count(), 0)

    def test_inactive_patient_cannot_receive_a_manual_consultation(self):
        self.patient.is_active = False
        self.patient.save(update_fields=("is_active",))
        self.client.force_authenticate(self.dentist)

        response = self.client.post(
            f"/api/patients/{self.patient.pk}/consultations/",
            self.consultation_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(response.data["code"], "appointment_required")
        self.assertEqual(Consultation.objects.count(), 0)
        self.assertEqual(OdontogramVersion.objects.count(), 0)

    def test_inactive_patient_cannot_receive_new_treatment_but_history_remains_visible(self):
        consultation = assigned_test_consultation(
            patient=self.patient,
            professional=self.dentist,
            **self.consultation_payload(),
        )
        existing = TreatmentItem.objects.create(
            proposed_in=consultation,
            description="Propuesta histórica",
        )
        self.patient.is_active = False
        self.patient.save(update_fields=("is_active",))
        self.client.force_authenticate(self.dentist)
        item_url = (
            f"/api/patients/{self.patient.pk}/consultations/"
            f"{consultation.pk}/treatment-items/"
        )

        created = self.client.post(
            item_url,
            {"description": "Nueva propuesta prohibida"},
            format="json",
        )
        detail = self.client.get(f"{item_url}{existing.pk}/")
        longitudinal = self.client.get(
            f"/api/patients/{self.patient.pk}/treatment-items/"
        )

        self.assertEqual(created.status_code, 409, created.data)
        self.assertEqual(created.data["code"], "patient_inactive")
        self.assertEqual(TreatmentItem.objects.count(), 1)
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["id"], existing.pk)
        self.assertEqual(longitudinal.status_code, 200)
        self.assertEqual(
            [item["id"] for item in longitudinal.data["results"]],
            [existing.pk],
        )

    def test_inactive_and_incomplete_are_distinct_and_active_flow_still_works(self):
        inactive = self.create_patient(
            "Paciente",
            "Inactivo",
            active=False,
            phone="8888-1718",
        )
        incomplete = self.create_patient(
            "Paciente",
            "Incompleto",
            phone="",
        )
        inactive_appointment = Appointment.objects.create(
            patient=inactive,
            dentist=self.dentist,
            date=date(2026, 9, 3),
            start_time=time(9, 0),
            duration_minutes=60,
            reason="Inactivo",
            created_by=self.admin,
        )
        incomplete_appointment = Appointment.objects.create(
            patient=incomplete,
            dentist=self.dentist,
            date=date(2026, 9, 3),
            start_time=time(11, 0),
            duration_minutes=60,
            reason="Incompleto",
            created_by=self.admin,
        )
        active_appointment = Appointment.objects.create(
            patient=self.patient,
            dentist=self.dentist,
            date=date(2026, 9, 3),
            start_time=time(13, 0),
            duration_minutes=60,
            reason="Activo",
            created_by=self.admin,
        )
        self.client.force_authenticate(self.admin)

        inactive_response = start_test_attendance(self.client, inactive_appointment)
        incomplete_response = start_test_attendance(self.client, incomplete_appointment)
        active_response = start_test_attendance(self.client, active_appointment)

        self.assertEqual(inactive_response.status_code, 409)
        self.assertEqual(inactive_response.data["code"], "patient_inactive")
        self.assertEqual(incomplete_response.status_code, 409)
        self.assertEqual(
            incomplete_response.data["code"],
            "patient_profile_incomplete",
        )
        self.assertEqual(active_response.status_code, 201, active_response.data)
        self.assertTrue(active_response.data["created"])
