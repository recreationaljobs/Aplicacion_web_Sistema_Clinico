from datetime import date, time, timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.appointments.models import Appointment
from apps.patients.models import Patient


class ClinicConfigurationApiTests(APITestCase):
    profile_url = "/api/clinics/profile/"
    hours_url = "/api/clinics/business-hours/"
    closures_url = "/api/clinics/closures/"
    categories_url = "/api/clinics/service-categories/"
    services_url = "/api/clinics/services/"

    def setUp(self):
        user_model = get_user_model()
        self.admin = user_model.objects.create_user(
            email="admin-clinic@dentalclinic.com",
            password="ContraseñaAdmin123!",
            first_name="Ana",
            role="ADMINISTRADOR",
        )
        self.receptionist = user_model.objects.create_user(
            email="reception-clinic@dentalclinic.com",
            password="ContraseñaRecepcion123!",
            first_name="Rosa",
            role="RECEPCIONISTA",
        )

    def hours_payload(self):
        return {
            "days": [
                {
                    "weekday": weekday,
                    "is_open": weekday < 5,
                    "opens_at": "08:00" if weekday < 5 else None,
                    "closes_at": "17:00" if weekday < 5 else None,
                    "breaks": (
                        [
                            {"starts_at": "10:00", "ends_at": "10:15"},
                            {"starts_at": "12:00", "ends_at": "13:00"},
                        ]
                        if weekday < 5 else []
                    ),
                }
                for weekday in range(7)
            ],
        }

    def test_authenticated_staff_reads_profile_but_only_admin_updates_it(self):
        self.client.force_authenticate(self.receptionist)
        response = self.client.get(self.profile_url)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("tagline", response.data)
        self.assertEqual(response.data["name"], "DentalClinic")
        self.assertEqual(response.data["currency"], "NIO")
        self.assertEqual(response.data["timezone"], "America/Managua")
        self.assertFalse(response.data["schedule_configured"])
        forbidden = self.client.patch(self.profile_url, {"name": "Clínica Norte"})
        self.assertEqual(forbidden.status_code, 403)

        self.client.force_authenticate(self.admin)
        updated = self.client.patch(
            self.profile_url,
            {
                "name": "Clínica Argüello",
                "phone": "+505 2222 3333",
                "email": "contacto@arguello.com",
                "address": "Managua, Nicaragua",
                "currency": "USD",
                "timezone": "America/Costa_Rica",
            },
            format="json",
        )
        self.assertEqual(updated.status_code, 200)
        self.assertNotIn("tagline", updated.data)
        self.assertEqual(updated.data["name"], "Clínica Argüello")
        self.assertEqual(updated.data["currency"], "USD")

    def test_profile_rejects_non_image_logo(self):
        self.client.force_authenticate(self.admin)
        response = self.client.patch(
            self.profile_url,
            {"logo": SimpleUploadedFile("logo.txt", b"not-an-image", content_type="text/plain")},
            format="multipart",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("logo", response.data)

    def test_admin_saves_all_hours_with_multiple_breaks_and_activates_schedule(self):
        self.client.force_authenticate(self.admin)
        response = self.client.put(self.hours_url, self.hours_payload(), format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["days"]), 7)
        monday = response.data["days"][0]
        self.assertTrue(monday["is_open"])
        self.assertEqual(len(monday["breaks"]), 2)

        profile = self.client.get(self.profile_url)
        self.assertTrue(profile.data["schedule_configured"])
        reloaded = self.client.get(self.hours_url)
        self.assertEqual(reloaded.json(), response.json())

    def test_hours_reject_overlapping_breaks(self):
        payload = self.hours_payload()
        payload["days"][0]["breaks"] = [
            {"starts_at": "12:00", "ends_at": "13:00"},
            {"starts_at": "12:30", "ends_at": "13:30"},
        ]
        self.client.force_authenticate(self.admin)
        response = self.client.put(self.hours_url, payload, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("pausas", str(response.data).lower())

    def test_receptionist_cannot_mutate_hours_or_closures(self):
        self.client.force_authenticate(self.receptionist)
        hours = self.client.put(self.hours_url, self.hours_payload(), format="json")
        closure = self.client.post(
            self.closures_url,
            {"name": "Cierre", "date": "2026-12-24", "repeats_annually": False},
            format="json",
        )

        self.assertEqual(hours.status_code, 403)
        self.assertEqual(closure.status_code, 403)

    def test_admin_creates_and_archives_recurring_holiday_closure(self):
        self.client.force_authenticate(self.admin)
        created = self.client.post(
            self.closures_url,
            {
                "name": "Navidad",
                "date": date(2026, 12, 25).isoformat(),
                "repeats_annually": True,
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201)
        self.assertTrue(created.data["is_active"])
        archived = self.client.patch(
            f"{self.closures_url}{created.data['id']}/",
            {"is_active": False},
            format="json",
        )
        self.assertEqual(archived.status_code, 200)
        self.assertFalse(archived.data["is_active"])

    def test_admin_manages_categories_and_services_while_staff_can_read(self):
        self.client.force_authenticate(self.admin)
        category = self.client.post(
            self.categories_url,
            {"name": "Ortodoncia", "position": 1},
            format="json",
        )
        self.assertEqual(category.status_code, 201)
        service = self.client.post(
            self.services_url,
            {
                "category": category.data["id"],
                "name": "Estudio de ortodoncia",
                "duration_minutes": 120,
                "price": "120.00",
            },
            format="json",
        )
        self.assertEqual(service.status_code, 201)
        self.assertEqual(service.data["category_name"], "Ortodoncia")

        self.client.force_authenticate(self.receptionist)
        listed = self.client.get(f"{self.services_url}?active=true")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual([item["name"] for item in listed.data], ["Estudio de ortodoncia"])
        forbidden = self.client.post(
            self.services_url,
            {
                "category": category.data["id"],
                "name": "Servicio no autorizado",
                "duration_minutes": 30,
                "price": "10.00",
            },
            format="json",
        )
        self.assertEqual(forbidden.status_code, 403)

    def test_category_with_active_services_cannot_be_archived(self):
        self.client.force_authenticate(self.admin)
        category = self.client.post(
            self.categories_url,
            {"name": "General", "position": 0},
            format="json",
        ).data
        self.client.post(
            self.services_url,
            {
                "category": category["id"],
                "name": "Limpieza",
                "duration_minutes": 45,
                "price": "650.00",
            },
            format="json",
        )
        response = self.client.patch(
            f"{self.categories_url}{category['id']}/",
            {"is_active": False},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("servicios activos", str(response.data).lower())

    def test_hours_and_closures_report_future_appointment_conflicts(self):
        dentist = get_user_model().objects.create_user(
            email="dentist-conflict@dentalclinic.com",
            password="ContraseñaOdontologo123!",
            first_name="Elena",
            role="ODONTOLOGO",
        )
        patient = Patient.objects.create(
            first_name="Ana",
            last_name="Pérez",
            birth_place="Managua",
            identification_type=Patient.IdentificationType.CEDULA,
            identification_number="001-110190-0001A",
            gender=Patient.Gender.FEMENINO,
            date_of_birth=date(1990, 1, 11),
            registered_by=self.receptionist,
        )
        appointment_date = timezone.localdate() + timedelta(days=14)
        appointment = Appointment.objects.create(
            patient=patient,
            dentist=dentist,
            date=appointment_date,
            start_time=time(16, 30),
            duration_minutes=60,
            reason="Control",
            created_by=self.admin,
        )
        payload = self.hours_payload()
        target = payload["days"][appointment_date.weekday()]
        target["is_open"] = True
        target["opens_at"] = "08:00"
        target["closes_at"] = "17:00"
        target["breaks"] = []
        self.client.force_authenticate(self.admin)

        hours_response = self.client.put(self.hours_url, payload, format="json")
        closure_response = self.client.post(
            self.closures_url,
            {
                "name": "Cierre extraordinario",
                "date": appointment_date.isoformat(),
                "repeats_annually": False,
            },
            format="json",
        )

        self.assertEqual(hours_response.status_code, 400)
        self.assertEqual(hours_response.data["conflicting_appointments"][0]["id"], appointment.pk)
        self.assertEqual(closure_response.status_code, 400)
        self.assertEqual(closure_response.data["conflicting_appointments"][0]["id"], appointment.pk)
