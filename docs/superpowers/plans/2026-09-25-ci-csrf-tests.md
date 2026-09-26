# CI CSRF regression recovery implementation plan

> Execute inline with systematic debugging and test-first verification. The errors are already reproduced against the unchanged implementation.

**Goal:** Restore green backend/frontend suites without weakening CSRF or reverting the current deployment contract.

**Architecture:** Keep GET /api/auth/csrf/ returning HTTP 200 with csrfToken and a cookie. Recover real frontend tests overwritten by implementation copies; test the real API module and provider. No schema, runtime authentication or dependency changes are planned.

**Tech Stack:** Django/DRF, Vitest, Testing Library, PostgreSQL.

## Constraints

- Preserve cookie-based refresh, CSRF rejection, JWT rotation/revocation and offline logout protection.
- Preserve the provider's current non-blocking startup and timeout behavior.
- Do not suppress failing suites or remove security assertions.
- Leave unrelated deployment files untouched. No push is included in this request.

## Tasks

- [x] Reproduce SecureSessionApiTests and the four failing Vitest files.
- [x] Trace backend CsrfCookieView, frontend ensureCsrfCookie and Git history. Both overwritten files had real tests before 56b8ffc5.
- [x] Update `src/backend/apps/users/tests.py` csrf_headers to assert HTTP 200, a JSON string token and a cookie; submit the JSON token. Keep all seven existing security tests and add malformed-token/origin rejection.

```python
self.assertEqual(response.status_code, 200)
token = response.data["csrfToken"]
self.assertIsInstance(token, str)
self.assertTrue(token)
self.assertIn("csrftoken", response.cookies)
return {"HTTP_X_CSRFTOKEN": token}
```

- [x] Recover `src/frontend/src/services/api.test.js` from the pre-overwrite Git version using apply_patch; replace old CSRF fixtures with `{status: 200, data: {csrfToken: 'csrf-json'}}`. Test JSON token precedence, missing token rejection before POST, refresh deduplication, file responses, permissions and API routing.
- [x] Replace `src/frontend/src/context/SystemFeaturesProvider.test.jsx` with real provider tests: immediate children, server demo restrictions, offline/invalid response fallback, abort on unmount and timeout. Mock only the network boundary.
- [x] Correct `authService.test.js` and `logoutSafety.test.js` fetch fixtures: CSRF GET returns JSON token, logout POST returns 204. Assert X-CSRFToken and no refresh-body token; preserve the offline marker assertions.
- [x] Run focused tests, then full SQLite and PostgreSQL backend suites plus full Vitest, lint and production build. Explain staticfiles warnings separately; they do not cause the reported failures.
- [x] Record fresh verification evidence and review the scoped diff before delivery.

## Additional failure discovered by the complete PostgreSQL run

- [x] Fix `src/backend/apps/patients/test_postgres.py` setup to patch the server clock to `datetime(2027, 1, 11, 15, 0, tzinfo=UTC)`, matching its 09:00 Managua appointment, with addCleanup. The seven completion/treatment concurrency tests currently fail before exercising their assertions because the booking is in the future. Retain their real service calls, transactions and race assertions, then rerun this class and the complete PostgreSQL suite.

Commands from `src/backend`: `.venv/Scripts/python.exe manage.py test --settings=config.settings.test --noinput`; repeat with `config.settings.postgres_test` and an isolated TEST_DATABASE_URL. From `src/frontend`: `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build` with VITE_API_URL=/.
