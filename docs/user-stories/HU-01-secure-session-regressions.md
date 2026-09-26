# HU-01 — Regresiones de sesión segura y contrato CSRF

Estado: corregida y verificada localmente el 25/09/2026. Sin cambios en autenticación de producción, modelos, migraciones o dependencias.

## Causa de los fallos de CI

- Las siete pruebas SecureSessionApiTests se detenían en un helper que esperaba HTTP 204. CsrfCookieView ya responde HTTP 200 con `csrfToken` en JSON y establece la cookie CSRF.
- Al corregir ese helper apareció otra expectativa antigua: la cookie refresh ya usa `Path=/` desde el commit 8c10c96a. Esto permite enviarla a `/api/proxy`, por donde pasan refresh/logout en el frontend de producción.
- Las fixtures de logout simulaban HTTP 204 también para la inicialización CSRF y omitían el token necesario.
- `api.test.js` y `SystemFeaturesProvider.test.jsx` contenían copias de implementación, sin suites. El historial anterior a 56b8ffc5 permitió recuperar los casos de API; las pruebas del proveedor se adaptaron al arranque no bloqueante que tiene actualmente.

## Interfaces y cobertura

- `apps/users/tests.py`: los tests envían el token JSON real con `enforce_csrf_checks=True`. Se mantienen verificaciones de HttpOnly, SameSite, expiración, rotación, revocación, usuario inactivo, cambio de contraseña y ausencia del refresh en JSON. Se comprueba rechazo de token incorrecto y de origen no confiable; cerrar sesión y cambiar contraseña eliminan la cookie en la misma ruta.
- `services/api.test.js`: llamadas al módulo real; CSRF JSON, fallback de cookie local, rechazo antes del POST cuando falta CSRF, refresh deduplicado, errores, permisos, archivos y rutas del proxy con parámetros.
- `services/authService.test.js` y `services/logoutSafety.test.js`: fixtures por respuesta; logout envía X-CSRFToken sin refresh en el cuerpo y no restaura una sesión tras cierre offline.
- `context/SystemFeaturesProvider.test.jsx`: componente y API reales con fetch simulado. Prueba configuración de demo, controles de carga/recuperación, arranque inmediato, respuesta inválida/offline, timeout de diez segundos y cancelación al desmontar.

La ejecución completa en PostgreSQL también descubrió siete errores de preparación en `patients/test_postgres.py`: sus citas eran del 11/01/2027 a las 09:00 de Managua, pero se iniciaban con la hora real. La fixture ahora fija `timezone.now()` a las 15:00 UTC de ese día y restaura el reloj al terminar. No se cambia la validación de HU-44 ni se omiten las carreras de cierre, aceptación, realización y cancelación de tratamientos. Estos siete casos no se ejecutan en SQLite.

No se excluyeron suites, no se desactivó CSRF y no se volvió a la lectura exclusiva de cookies del navegador. Las pruebas de configuración mantienen el comportamiento actual; el backend sigue siendo la autoridad sobre funciones habilitadas.

## Comandos de verificación

Desde `src/backend`:

```powershell
.\.venv\Scripts\python.exe manage.py test apps.users.tests.SecureSessionApiTests --settings=config.settings.test --noinput
.\.venv\Scripts\python.exe manage.py test --settings=config.settings.test --noinput
# TEST_DATABASE_URL debe apuntar a una instancia aislada, nunca a la base clínica.
.\.venv\Scripts\python.exe manage.py test --settings=config.settings.postgres_test --noinput
```

Desde `src/frontend`:

```powershell
npm.cmd test
npm.cmd run lint
$env:VITE_API_URL = '/'
npm.cmd run build
```

El aviso de WhiteNoise sobre `staticfiles/` ausente en CI no es un fallo de tests: ese directorio se genera con `collectstatic` durante el build de despliegue. No se silenciaron advertencias ni se cambiaron los controles de CI para obtener un resultado exitoso.

## Evidencia local

- SecureSessionApiTests: 9/9 correctas.
- Backend SQLite completo: 481 pruebas, 448 correctas y 33 omitidas por entorno; ningún fallo.
- Backend PostgreSQL 18 completo, en instancia temporal aislada: 481/481 correctas, sin omisiones. Incluye los siete casos de concurrencia clínica reparados y las regresiones de asignación por odontólogo.
- Frontend completo: 360/360 pruebas correctas en 40 archivos.
- Oxlint y build de producción con VITE_API_URL=/: correctos.
- `git diff --check`: sin errores.

Verificación local en Windows con Python 3.14.6; CI configura Python 3.13. La ejecución remota se comprobará después de publicar el commit. La guía de depuración sistemática permitió identificar expectativas antiguas; TDD y la revisión OWASP guiaron la recuperación de cobertura sin relajar los controles reales.
