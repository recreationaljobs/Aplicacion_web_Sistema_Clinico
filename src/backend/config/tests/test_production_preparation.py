from unittest.mock import patch

from django.test import TestCase


class ReadinessDependencyTests(TestCase):
    def test_redis_failure_returns_constant_unavailable_response(self):
        with patch("config.health.cache.get", side_effect=ConnectionError("private-redis-password")):
            response = self.client.get("/health/ready/")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"status": "unavailable"})
