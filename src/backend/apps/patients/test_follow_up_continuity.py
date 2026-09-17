from datetime import date, time

from rest_framework.test import APITestCase

from apps.appointments.models import Appointment
from apps.clinics.models import ClinicService, ServiceCategory
from apps.users.models import User
from apps.common.test_utils import open_clinic_days

from .models import Consultation, Patient, TreatmentItem


class FollowUpContinuityApiTests(APITestCase):
    def setUp(self):
        open_clinic_days()
        self.admin = User.objects.create_user(
            email="admin-follow-up@example.test",
            password="SyntheticOnly123!",
            role=User.Role.ADMINISTRADOR,
        )
        self.receptionist = User.objects.create_user(
            email="reception-follow-up@example.test",
            password="SyntheticOnly123!",
            role=User.Role.RECEPCIONISTA,
        )
        self.dentist = User.objects.create_user(
            email="dentist-follow-up@example.test",
            password="SyntheticOnly123!",
            role=User.Role.ODONTOLOGO,
            first_name="Elena",
            last_name="Vargas",
        )
        self.patient = Patient.objects.create(
            first_name="Paciente",
            last_name="Continuidad",
            birth_place="Managua",
            identification_type=Patient.IdentificationType.CEDULA,
            identification_number="001-010190-9251A",
            phone="+505 8000 0000",
            gender=Patient.Gender.OTRO,
            date_of_birth=date(1990, 1, 1),
            registered_by=self.receptionist,
        )
        category = ServiceCategory.objects.create(name="Continuidad clínica")
        self.service = ClinicService.objects.create(
            category=category,
            name="Restauración simple",
            duration_minutes=45,
            price="850.00",
        )
        self.consultation_a = Consultation.objects.create(
            patient=self.patient,
            professional=self.dentist,
            professional_name_snapshot="Elena Vargas",
            date=date(2026, 8, 31),
            time=time(9, 0),
            consultation_type=Consultation.Type.GENERAL,
            summary="Consulta A con tratamiento pendiente.",
            status=Consultation.Status.IN_PROGRESS,
        )
        self.pending_item = TreatmentItem.objects.create(
            proposed_in=self.consultation_a,
            service=self.service,
            description="Restauración de resina",
            status=TreatmentItem.Status.ACCEPTED,
            unit_price_snapshot="850.00",
        )

    def test_completed_manual_consultation_schedules_normal_appointment_and_keeps_pending_plan(self):
        self.client.force_authenticate(self.dentist)
        completion = self.client.post(
            f"/api/patients/{self.patient.pk}/consultations/{self.consultation_a.pk}/complete/",
            format="json",
        )

        self.assertEqual(completion.status_code, 200)
        self.assertEqual(completion.data["consultation"]["status"], Consultation.Status.COMPLETED)
        self.assertIsNone(completion.data["appointment"])

        self.client.force_authenticate(self.receptionist)
        scheduled = self.client.post(
            "/api/appointments/",
            {
                "patient": self.patient.pk,
                "dentist": self.dentist.pk,
                "service": self.service.pk,
                "date": "2026-09-01",
                "start_time": "10:30",
                "duration_minutes": 45,
                "reason": "Restauración de resina",
                "notes": "",
            },
            format="json",
        )

        self.assertEqual(scheduled.status_code, 201)
        appointment_b = Appointment.objects.get(pk=scheduled.data["id"])
        self.assertEqual(appointment_b.status, Appointment.Status.SCHEDULED)
        self.assertIsNone(appointment_b.consultation_id)

        self.client.force_authenticate(self.dentist)
        attendance = self.client.post(
            f"/api/appointments/{appointment_b.pk}/start-attendance/",
            format="json",
        )

        self.assertEqual(attendance.status_code, 201)
        consultation_b = Consultation.objects.get(pk=attendance.data["consultation"]["id"])
        self.assertEqual(consultation_b.patient_id, self.patient.pk)
        self.assertNotEqual(consultation_b.pk, self.consultation_a.pk)

        plan = self.client.get(
            f"/api/patients/{self.patient.pk}/treatment-items/",
            {"scope": "pending"},
        )

        self.assertEqual(plan.status_code, 200)
        self.assertEqual([item["id"] for item in plan.data["results"]], [self.pending_item.pk])
        self.assertEqual(plan.data["results"][0]["service"]["id"], self.service.pk)
        self.assertEqual(plan.data["results"][0]["service"]["duration_minutes"], 45)
        self.pending_item.refresh_from_db()
        self.assertEqual(self.pending_item.status, TreatmentItem.Status.ACCEPTED)
        self.assertIsNone(self.pending_item.performed_in_id)
