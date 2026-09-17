from django.core.exceptions import ValidationError
from rest_framework.test import APITestCase

from apps.users.models import User
from .models import ClinicService, ServiceCategory


class CatalogProductionTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(email="catalog-prod@example.test", password="Synthetic123!", role="ADMINISTRADOR")
        self.client.force_authenticate(self.admin)
        self.category = ServiceCategory.objects.create(name="Synthetic category")

    def test_negative_prices_are_rejected_by_api(self):
        response = self.client.post("/api/clinics/services/", {"category": self.category.pk, "name": "Synthetic service", "duration_minutes": 30, "price": "-10.00"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_negative_prices_are_rejected_by_model_validation(self):
        service = ClinicService(category=self.category, name="Synthetic", duration_minutes=30, price="-1.00")
        with self.assertRaises(ValidationError):
            service.full_clean()

    def test_invalid_category_is_a_controlled_input_error(self):
        response = self.client.get("/api/clinics/services/?category=abc")
        self.assertEqual(response.status_code, 400)
