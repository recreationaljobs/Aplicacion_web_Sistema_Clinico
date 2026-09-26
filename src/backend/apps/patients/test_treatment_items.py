from apps.common.test_utils import assigned_test_consultation
from datetime import date, time
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.test import APITestCase

from apps.clinics.models import ClinicService, ServiceCategory
from apps.users.models import RolePermissionPreset, User

from .models import Consultation, Patient, TreatmentItem


class TreatmentItemTestMixin:
    def create_user(self, email, role=User.Role.ODONTOLOGO):
        return User.objects.create_user(
            email=email,
            password="ContraseñaSegura123!",
            role=role,
            first_name="Elena",
            last_name="Rivera",
        )

    def create_patient(self, suffix="1"):
        return Patient.objects.create(
            first_name="Paciente",
            last_name=f"Tratamiento {suffix}",
            birth_place="Managua",
            identification_type=Patient.IdentificationType.CEDULA,
            identification_number=f"001-010190-90{int(suffix):02d}A",
            gender=Patient.Gender.FEMENINO,
            date_of_birth=date(1990, 1, 1),
            registered_by=self.admin,
        )

    def create_consultation(self, patient=None, status=Consultation.Status.IN_PROGRESS):
        return assigned_test_consultation(
            patient=patient or self.patient,
            professional=self.dentist,
            professional_name_snapshot="Elena Rivera",
            date=date(2026, 8, 31),
            time=time(9, 30),
            consultation_type=Consultation.Type.GENERAL,
            summary="Consulta para plan estructurado.",
            status=status,
        )

    def create_service(self, name="Restauración con resina", price="850.00", active=True):
        return ClinicService.objects.create(
            category=self.category,
            name=name,
            duration_minutes=60,
            price=price,
            is_active=active,
        )


class TreatmentItemModelTests(TreatmentItemTestMixin, APITestCase):
    def setUp(self):
        self.admin = self.create_user("admin-treatment-model@example.test", User.Role.ADMINISTRADOR)
        self.dentist = self.create_user("dentist-treatment-model@example.test")
        self.patient = self.create_patient()
        self.consultation = self.create_consultation()
        self.category = ServiceCategory.objects.create(name="Restauraciones")

    def test_requires_origin_consultation_and_defaults_to_proposed(self):
        item = TreatmentItem(description="Procedimiento personalizado")

        with self.assertRaises(DjangoValidationError):
            item.full_clean()

        item.proposed_in = self.consultation
        item.full_clean()
        self.assertEqual(item.status, TreatmentItem.Status.PROPOSED)

    def test_allows_nullable_service_tooth_and_price_for_custom_procedure(self):
        item = TreatmentItem(
            proposed_in=self.consultation,
            description="Educación de higiene oral",
        )

        item.full_clean()
        item.save()

        self.assertIsNone(item.service)
        self.assertIsNone(item.tooth_code)
        self.assertEqual(item.surfaces, [])
        self.assertIsNone(item.unit_price_snapshot)

    def test_reuses_fdi_and_surface_rules_from_odontogram(self):
        valid = TreatmentItem(
            proposed_in=self.consultation,
            description="Restauración",
            tooth_code="16",
            surfaces=["OCCLUSAL", "MESIAL"],
            planned_finding="RESTORATION",
        )
        valid.full_clean()

        invalid_tooth = TreatmentItem(
            proposed_in=self.consultation,
            description="Restauración",
            tooth_code="19",
        )
        with self.assertRaises(DjangoValidationError):
            invalid_tooth.full_clean()

        invalid_surface = TreatmentItem(
            proposed_in=self.consultation,
            description="Restauración",
            tooth_code="16",
            surfaces=["INCISAL"],
        )
        with self.assertRaises(DjangoValidationError):
            invalid_surface.full_clean()

        no_tooth = TreatmentItem(
            proposed_in=self.consultation,
            description="Profilaxis",
            surfaces=["VESTIBULAR"],
        )
        with self.assertRaises(DjangoValidationError):
            no_tooth.full_clean()


class TreatmentItemApiTests(TreatmentItemTestMixin, APITestCase):
    def setUp(self):
        self.admin = self.create_user("admin-treatment-api@example.test", User.Role.ADMINISTRADOR)
        self.dentist = self.create_user("dentist-treatment-api@example.test")
        self.receptionist = self.create_user(
            "reception-treatment-api@example.test",
            User.Role.RECEPCIONISTA,
        )
        self.patient = self.create_patient()
        self.other_patient = self.create_patient("2")
        self.consultation = self.create_consultation()
        self.other_consultation = self.create_consultation(patient=self.other_patient)
        self.category = ServiceCategory.objects.create(name="Restauraciones")
        self.service = self.create_service()
        self.other_service = self.create_service("Endodoncia", "3500.00")
        self.list_url = (
            f"/api/patients/{self.patient.pk}/consultations/"
            f"{self.consultation.pk}/treatment-items/"
        )
        self.client.force_authenticate(self.dentist)

    def test_creates_from_active_catalog_service_with_backend_snapshots(self):
        response = self.client.post(
            self.list_url,
            {
                "service_id": self.service.pk,
                "diagnosis_text": "Caries oclusal",
                "tooth_code": "16",
                "surfaces": ["OCCLUSAL"],
                "planned_finding": "RESTORATION",
                "notes": "Aplicar aislamiento absoluto.",
                "unit_price_snapshot": "1.00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["proposed_in"], self.consultation.pk)
        self.assertEqual(response.data["service"]["id"], self.service.pk)
        self.assertEqual(response.data["service"]["category_name"], "Restauraciones")
        self.assertEqual(response.data["description"], "Restauración con resina")
        self.assertEqual(response.data["unit_price_snapshot"], "850.00")
        self.assertEqual(response.data["status"], "PROPUESTO")
        self.assertEqual(response.data["surfaces"], ["OCCLUSAL"])

    def test_creates_custom_procedure_without_service(self):
        response = self.client.post(
            self.list_url,
            {
                "description": "Educación personalizada de higiene oral",
                "diagnosis_text": "Control preventivo",
                "notes": "Reforzar técnica de cepillado.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)
        self.assertIsNone(response.data["service"])
        self.assertEqual(response.data["description"], "Educación personalizada de higiene oral")
        self.assertIsNone(response.data["unit_price_snapshot"])

    def test_rejects_missing_service_and_description_and_inactive_service(self):
        missing = self.client.post(self.list_url, {}, format="json")

        inactive = self.create_service("Servicio archivado", "500.00", active=False)
        archived = self.client.post(
            self.list_url,
            {"service_id": inactive.pk},
            format="json",
        )

        self.assertEqual(missing.status_code, 400)
        self.assertIn("description", missing.data)
        self.assertEqual(archived.status_code, 400)
        self.assertIn("service_id", archived.data)

    def test_scopes_list_and_detail_to_patient_and_consultation(self):
        created = self.client.post(
            self.list_url,
            {"description": "Procedimiento de la consulta correcta"},
            format="json",
        )
        item_id = created.data["id"]
        wrong_patient_url = (
            f"/api/patients/{self.other_patient.pk}/consultations/"
            f"{self.consultation.pk}/treatment-items/"
        )
        wrong_consultation_detail = (
            f"/api/patients/{self.patient.pk}/consultations/"
            f"{self.other_consultation.pk}/treatment-items/{item_id}/"
        )

        self.assertEqual(self.client.get(wrong_patient_url).status_code, 404)
        self.assertEqual(self.client.get(wrong_consultation_detail).status_code, 404)
        listed = self.client.get(self.list_url)
        self.assertEqual(listed.status_code, 200)
        self.assertEqual([item["id"] for item in listed.data], [item_id])

    def test_only_creates_or_edits_while_consultation_is_in_progress(self):
        for consultation_status in (
            Consultation.Status.COMPLETED,
            Consultation.Status.CANCELLED,
        ):
            with self.subTest(consultation_status=consultation_status):
                closed = self.create_consultation(status=consultation_status)
                closed_url = (
                    f"/api/patients/{self.patient.pk}/consultations/"
                    f"{closed.pk}/treatment-items/"
                )
                response = self.client.post(
                    closed_url,
                    {"description": "No debe crearse"},
                    format="json",
                )
                self.assertEqual(response.status_code, 400)

        item = TreatmentItem.objects.create(
            proposed_in=self.consultation,
            description="Plan antes del cierre",
        )
        self.consultation.status = Consultation.Status.COMPLETED
        self.consultation.save(update_fields=("status", "updated_at"))
        detail_url = f"{self.list_url}{item.pk}/"

        self.assertEqual(
            self.client.patch(detail_url, {"notes": "Cambio tardío"}, format="json").status_code,
            400,
        )
        read = self.client.get(detail_url)
        self.assertEqual(read.status_code, 200)
        self.assertEqual(read.data["description"], "Plan antes del cierre")

    def test_requires_clinical_permissions_on_backend(self):
        preset = RolePermissionPreset.objects.get(role=User.Role.RECEPCIONISTA)
        preset.permissions = ["consultations.view"]
        preset.save(update_fields=("permissions",))
        self.client.force_authenticate(self.receptionist)

        self.assertEqual(self.client.get(self.list_url).status_code, 200)
        self.assertEqual(
            self.client.post(
                self.list_url,
                {"description": "Sin permiso de edición"},
                format="json",
            ).status_code,
            403,
        )

        preset.permissions = []
        preset.save(update_fields=("permissions",))
        self.assertEqual(self.client.get(self.list_url).status_code, 403)

    def test_editing_service_refreshes_snapshots_and_explicit_custom_description_wins(self):
        item = TreatmentItem.objects.create(
            proposed_in=self.consultation,
            service=self.service,
            description=self.service.name,
            unit_price_snapshot=self.service.price,
        )
        detail_url = f"{self.list_url}{item.pk}/"

        changed = self.client.patch(
            detail_url,
            {"service_id": self.other_service.pk},
            format="json",
        )
        self.assertEqual(changed.status_code, 200, changed.data)
        self.assertEqual(changed.data["description"], "Endodoncia")
        self.assertEqual(changed.data["unit_price_snapshot"], "3500.00")

        custom = self.client.patch(
            detail_url,
            {
                "service_id": self.service.pk,
                "description": "Restauración estética personalizada",
            },
            format="json",
        )
        self.assertEqual(custom.status_code, 200, custom.data)
        self.assertEqual(custom.data["description"], "Restauración estética personalizada")
        self.assertEqual(custom.data["unit_price_snapshot"], "850.00")

    def test_removing_service_keeps_description_and_clears_price(self):
        item = TreatmentItem.objects.create(
            proposed_in=self.consultation,
            service=self.service,
            description=self.service.name,
            unit_price_snapshot=self.service.price,
        )

        response = self.client.patch(
            f"{self.list_url}{item.pk}/",
            {"service_id": None},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertIsNone(response.data["service"])
        self.assertEqual(response.data["description"], "Restauración con resina")
        self.assertIsNone(response.data["unit_price_snapshot"])

    def test_rejects_generic_status_and_origin_changes(self):
        item = TreatmentItem.objects.create(
            proposed_in=self.consultation,
            description="Propuesta protegida",
        )
        detail_url = f"{self.list_url}{item.pk}/"

        status_change = self.client.patch(
            detail_url,
            {"status": "ACEPTADO"},
            format="json",
        )
        origin_change = self.client.patch(
            detail_url,
            {"proposed_in": self.other_consultation.pk},
            format="json",
        )

        self.assertEqual(status_change.status_code, 400)
        self.assertIn("status", status_change.data)
        self.assertEqual(origin_change.status_code, 400)
        self.assertIn("proposed_in", origin_change.data)
        item.refresh_from_db()
        self.assertEqual(item.status, TreatmentItem.Status.PROPOSED)
        self.assertEqual(item.proposed_in, self.consultation)

    def test_catalog_changes_do_not_rewrite_existing_snapshots(self):
        created = self.client.post(
            self.list_url,
            {"service_id": self.service.pk},
            format="json",
        )
        self.service.name = "Nombre nuevo del catálogo"
        self.service.price = Decimal("1200.00")
        self.service.is_active = False
        self.service.save(update_fields=("name", "price", "is_active", "updated_at"))

        detail = self.client.get(f"{self.list_url}{created.data['id']}/")

        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["description"], "Restauración con resina")
        self.assertEqual(detail.data["unit_price_snapshot"], "850.00")
        self.assertEqual(detail.data["service"]["name"], "Nombre nuevo del catálogo")
        self.assertFalse(detail.data["service"]["is_active"])

        unchanged_reference = self.client.patch(
            f"{self.list_url}{created.data['id']}/",
            {"service_id": self.service.pk, "notes": "Nota posterior"},
            format="json",
        )
        self.assertEqual(unchanged_reference.status_code, 200, unchanged_reference.data)
        self.assertEqual(unchanged_reference.data["description"], "Restauración con resina")
        self.assertEqual(unchanged_reference.data["unit_price_snapshot"], "850.00")

    def test_does_not_offer_delete_or_status_transition_methods(self):
        item = TreatmentItem.objects.create(
            proposed_in=self.consultation,
            description="Propuesta sin borrado",
        )
        detail_url = f"{self.list_url}{item.pk}/"

        self.assertEqual(self.client.delete(detail_url).status_code, 405)
        self.assertEqual(self.client.put(detail_url, {}, format="json").status_code, 405)
