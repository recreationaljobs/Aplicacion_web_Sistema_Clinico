from datetime import date, time

from django.urls import reverse
from rest_framework.test import APITestCase

from apps.audit.models import AuditEvent
from apps.patients.models import Consultation
from apps.patients.serializers import ConsultationSerializer

from .models import User


class DentistProfessionalProfileApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="admin-hu61@dentalclinic.com",
            password="ContraseñaAdmin123!",
            role=User.Role.ADMINISTRADOR,
        )
        self.dentist = User.objects.create_user(
            email="dentist-hu61@dentalclinic.com",
            password="ContraseñaDentista123!",
            role=User.Role.ODONTOLOGO,
            first_name="Elena",
            last_name="Rivera",
        )
        self.client.force_authenticate(self.admin)

    def test_administrator_creates_trimmed_professional_fields_and_other_roles_remain_optional(self):
        dentist_response = self.client.post(
            reverse("users:user-list"),
            {
                "email": "nueva-dentista@dentalclinic.com",
                "first_name": "Lucía",
                "last_name": "Méndez",
                "phone": "",
                "role": User.Role.ODONTOLOGO,
                "specialty": "  Odontopediatría  ",
                "professional_registration_number": "  MINSA-2048  ",
                "password": "ContraseñaNueva123!",
                "confirm_password": "ContraseñaNueva123!",
            },
            format="multipart",
        )
        receptionist_response = self.client.post(
            reverse("users:user-list"),
            {
                "email": "nueva-recepcion@dentalclinic.com",
                "first_name": "Ana",
                "last_name": "López",
                "phone": "",
                "role": User.Role.RECEPCIONISTA,
                "password": "ContraseñaNueva123!",
                "confirm_password": "ContraseñaNueva123!",
            },
            format="multipart",
        )

        self.assertEqual(dentist_response.status_code, 201)
        self.assertEqual(dentist_response.data["specialty"], "Odontopediatría")
        self.assertEqual(
            dentist_response.data["professional_registration_number"],
            "MINSA-2048",
        )
        self.assertEqual(receptionist_response.status_code, 201)
        self.assertEqual(receptionist_response.data["specialty"], "")
        self.assertEqual(
            receptionist_response.data["professional_registration_number"],
            "",
        )

    def test_role_change_does_not_destroy_existing_professional_information(self):
        self.dentist.specialty = "Cirugía oral"
        self.dentist.professional_registration_number = "REG-7788"
        self.dentist.save(update_fields=("specialty", "professional_registration_number"))

        response = self.client.patch(
            reverse("users:user-detail", kwargs={"pk": self.dentist.pk}),
            {"role": User.Role.RECEPCIONISTA},
            format="multipart",
        )

        self.assertEqual(response.status_code, 200)
        self.dentist.refresh_from_db()
        self.assertEqual(self.dentist.role, User.Role.RECEPCIONISTA)
        self.assertEqual(self.dentist.specialty, "Cirugía oral")
        self.assertEqual(self.dentist.professional_registration_number, "REG-7788")
        self.assertEqual(response.data["specialty"], "Cirugía oral")

    def test_professional_fields_are_length_bounded_without_format_or_uniqueness_rules(self):
        too_long_specialty = self.client.patch(
            reverse("users:user-detail", kwargs={"pk": self.dentist.pk}),
            {"specialty": "x" * 201},
            format="multipart",
        )
        too_long_registration = self.client.patch(
            reverse("users:user-detail", kwargs={"pk": self.dentist.pk}),
            {"professional_registration_number": "y" * 101},
            format="multipart",
        )
        first = self.client.patch(
            reverse("users:user-detail", kwargs={"pk": self.dentist.pk}),
            {"professional_registration_number": "libre / 001"},
            format="multipart",
        )
        other = User.objects.create_user(
            email="other-dentist-hu61@dentalclinic.com",
            password="ContraseñaOtro123!",
            role=User.Role.ODONTOLOGO,
        )
        duplicate_allowed = self.client.patch(
            reverse("users:user-detail", kwargs={"pk": other.pk}),
            {"professional_registration_number": "libre / 001"},
            format="multipart",
        )

        self.assertEqual(too_long_specialty.status_code, 400)
        self.assertIn("specialty", too_long_specialty.data)
        self.assertEqual(too_long_registration.status_code, 400)
        self.assertIn("professional_registration_number", too_long_registration.data)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(duplicate_allowed.status_code, 200)

    def test_current_profile_updates_shared_professional_fields_without_changing_role(self):
        self.dentist.specialty = "Endodoncia"
        self.dentist.professional_registration_number = "REG-900"
        self.dentist.save(update_fields=("specialty", "professional_registration_number"))
        self.client.force_authenticate(self.dentist)

        profile = self.client.get(reverse("users:current-user"))
        attempted_assignment = self.client.patch(
            reverse("users:current-user"),
            {
                "specialty": "Implantología",
                "professional_registration_number": "9669",
                "phone": "+505 8888 4321",
                "role": User.Role.ADMINISTRADOR,
            },
            format="multipart",
        )

        self.assertEqual(profile.status_code, 200)
        self.assertEqual(profile.data["specialty"], "Endodoncia")
        self.assertEqual(profile.data["professional_registration_number"], "REG-900")
        self.assertEqual(attempted_assignment.status_code, 200)
        self.dentist.refresh_from_db()
        self.assertEqual(self.dentist.specialty, "Implantología")
        self.assertEqual(self.dentist.professional_registration_number, "9669")
        self.assertEqual(self.dentist.role, User.Role.ODONTOLOGO)
        self.client.force_authenticate(self.admin)
        staff = self.client.get(reverse("users:user-list"))
        self.assertEqual(staff.status_code, 200)
        staff_profile = next(user for user in staff.data["results"] if user["id"] == self.dentist.pk)
        self.assertEqual(staff_profile["specialty"], "Implantología")
        self.assertEqual(staff_profile["professional_registration_number"], "9669")
        self.assertEqual(staff_profile["phone"], "+505 8888 4321")

    def test_login_contract_includes_only_the_current_professional_context(self):
        self.dentist.specialty = "Periodoncia"
        self.dentist.professional_registration_number = "REG-901"
        self.dentist.save(update_fields=("specialty", "professional_registration_number"))
        self.client.force_authenticate(None)

        response = self.client.post(
            reverse("users:login"),
            {
                "email": self.dentist.email,
                "password": "ContraseñaDentista123!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["user"]["specialty"], "Periodoncia")
        self.assertEqual(
            response.data["user"]["professional_registration_number"],
            "REG-901",
        )

    def test_staff_audit_records_professional_field_names_without_credentials(self):
        response = self.client.patch(
            reverse("users:user-detail", kwargs={"pk": self.dentist.pk}),
            {
                "specialty": "Ortodoncia",
                "professional_registration_number": "REG-902",
                "new_password": "ContraseñaActualizada123!",
                "confirm_password": "ContraseñaActualizada123!",
            },
            format="multipart",
            HTTP_X_REQUEST_ID="hu61-professional-audit",
        )

        self.assertEqual(response.status_code, 200)
        event = AuditEvent.objects.get(request_id="hu61-professional-audit")
        self.assertEqual(event.action, "STAFF_UPDATE")
        self.assertEqual(
            event.changed_fields,
            ["professional_registration_number", "specialty"],
        )
        self.assertNotIn("password", str(event.metadata).lower())

    def test_consultation_contract_reads_current_professional_fields_without_snapshot_columns(self):
        self.dentist.specialty = "Rehabilitación oral"
        self.dentist.professional_registration_number = "REG-903"
        self.dentist.save(update_fields=("specialty", "professional_registration_number"))
        consultation = Consultation(
            professional=self.dentist,
            professional_name_snapshot="Dra. Elena Rivera",
            date=date(2026, 9, 2),
            time=time(9, 0),
            consultation_type=Consultation.Type.GENERAL,
            summary="Control",
            status=Consultation.Status.IN_PROGRESS,
        )

        first = ConsultationSerializer(consultation).data
        self.dentist.specialty = "Endodoncia avanzada"
        self.dentist.professional_registration_number = "REG-904"
        second = ConsultationSerializer(consultation).data

        self.assertEqual(first["professional_name"], "Elena Rivera")
        self.assertEqual(first["professional_phone"], self.dentist.phone)
        self.assertEqual(first["professional_specialty"], "Rehabilitación oral")
        self.assertEqual(first["professional_registration_number"], "REG-903")
        self.assertEqual(second["professional_specialty"], "Endodoncia avanzada")
        self.assertEqual(second["professional_registration_number"], "REG-904")
