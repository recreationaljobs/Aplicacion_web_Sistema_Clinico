# Sistema Clínico Dental

Aplicación para una clínica odontológica: API Django REST y frontend React/Vite. Mantiene un monolito modular, con permisos configurables, expedientes, consultas, tratamientos, odontogramas, documentos privados y agenda.

El repositorio se prepara para una **instalación de producción nueva y vacía**. No importes la base, usuarios, secretos ni archivos de la demo. La guía de despliegue y su lista de comprobaciones están en [docs/deployment.md](docs/deployment.md); consulta la evidencia y los límites en [docs/production-readiness.md](docs/production-readiness.md). No se publica ningún servicio automáticamente.

## Estructura

- `src/backend/apps/`: dominios `users`, `patients`, `clinics`, `appointments` y `audit`; modelos, serializers, servicios, migraciones y pruebas en cada app.
- `src/backend/config/`: perfiles de desarrollo, pruebas, demo, build y producción; almacenamiento, Gunicorn, salud y logs.
- `src/frontend/src/`: componentes, páginas, servicios API, contexto y utilidades. La API se consume desde `services/`.
- `deployment/`: plantillas de proxy, permisos de base y demo, separadas de la configuración productiva.
- `scripts/`: comprobaciones reproducibles con datos sintéticos.
- `docs/user-stories/`: contratos y evidencia de aceptación; [DESIGN.md](DESIGN.md) registra el lenguaje visual actual.

## Desarrollo

Python 3.13, PostgreSQL 18 y Node.js 22 LTS. La imagen fija Python 3.13 por digest; CI usa Python 3.13 y Node 22. SQLite se utiliza únicamente para pruebas.

Desde `src/backend`:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
$env:DATABASE_URL = "postgresql://usuario:contraseña-codificada@127.0.0.1:5432/clinica_dental"
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py createsuperuser
.\.venv\Scripts\python.exe manage.py runserver
```

El perfil de desarrollo carga `src/backend/.env` si existe; nunca lo incluyas en Git. Crea antes una base PostgreSQL local. `requirements.lock` fija las dependencias productivas; `requirements-dev.txt` agrega las herramientas locales.

Desde `src/frontend`:

```powershell
npm.cmd ci
npm.cmd run dev
```

En otras terminales puedes usar `npm`. Desarrollo permite el fallback a la API del host en el puerto 8000. Producción se construye con `VITE_API_URL=/` y se publica junto a `/api/` bajo un solo origen HTTPS.

## Verificación

Backend, desde `src/backend`:

```powershell
.\.venv\Scripts\python.exe manage.py test --settings=config.settings.test --noinput
$env:TEST_DATABASE_URL = "postgresql://usuario-pruebas:contraseña@127.0.0.1:5432/clinic_test"
.\.venv\Scripts\python.exe manage.py test --settings=config.settings.postgres_test --noinput
.\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run --settings=config.settings.test
.\.venv\Scripts\python.exe -m pip check
.\.venv\Scripts\python.exe -m pip_audit -r requirements.lock
```

Usa una base y un rol **aislados** para `TEST_DATABASE_URL`: Django crea y elimina su base `test_...`. No ejecutes dos suites simultáneas con el mismo nombre de base de pruebas. Las constraints de intervalos, triggers y concurrencia requieren PostgreSQL real.

Frontend, desde `src/frontend`:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd audit
$env:VITE_API_URL = "/"
npm.cmd run build
```

CI ejecuta las suites completas en SQLite y PostgreSQL, auditorías de dependencias, comprobación de migraciones, `check --deploy` sintético, frontend y build Docker. El smoke de navegador y el ensayo local de restauración están descritos en [production-readiness.md](docs/production-readiness.md).

## Contratos principales

- Access JWT en memoria; refresh en cookie HttpOnly; CSRF en login/refresh/logout y revocación por versión de usuario. Nada de tokens persistidos en WebStorage.
- Los presets de Recepción y Odontología siguen siendo editables. Administración tiene acceso implícito. No se reemplazan los permisos de una instalación existente.
- Paciente, consulta, tratamiento y cita exponen `version`; producción requiere `expected_version` para editar y responde `409` ante una versión obsoleta. Conserva el borrador y revisa los cambios antes de volver a guardar.
- Cambiar contenido del resumen clínico requiere `clinical_change_reason` en producción. Sus revisiones contienen snapshots completos, autor, fecha y motivo; el log general de auditoría excluye contenido clínico.
- Las consultas completadas conservan su contenido original y aceptan adendas con motivo/contenido mediante `consultations.edit`. Las adendas son inmutables y aparecen en la interfaz y el PDF.
- La agenda aplica horarios, pausas y cierres; PostgreSQL impide solapamientos. El registro de llegada se puede corregir antes de la atención, con motivo y versión. El inicio real usa la zona horaria de la clínica.
- Para Odontología, “Mis pacientes” se deriva de sus citas actuales e históricas; consultas y contenido asociado se aíslan por profesional. Las nuevas consultas se inician desde una cita propia, dentro de su intervalo, con validación del servidor e idempotencia. [Contrato, análisis y verificación](docs/patient-assignment-access.md).
- Documentos, avatares y logos usan almacenamiento externo en producción. Los documentos clínicos se retiran lógicamente y pueden restaurarse por Administración; la descarga siempre exige autenticación.

## Documentación

- [Despliegue, operación y lista previa al lanzamiento](docs/deployment.md).
- [Auditoría, cambios y evidencia vigente](docs/production-readiness.md).
- [Revisiones y adendas clínicas](docs/clinical-traceability.md).
- [Documentos privados](docs/patient-documents.md), [auditoría](docs/audit-trail.md) y [configuración de clínica](docs/clinic-configuration.md).
- [Guía de usuario](docs/guia-usuario/README.md).
- [Demo aislada](docs/demo-deployment.md), únicamente con datos ficticios. `seed_demo` está bloqueado en producción; sus plantillas no apuntan a una instalación activa.

## Historias implementadas

HU-01, HU-02, HU-03, HU-04, HU-05, HU-06, HU-07, HU-08, HU-09, HU-10, HU-11, HU-13, HU-16, HU-17, HU-18, HU-19, HU-20, HU-23, HU-28, HU-32, HU-35, HU-41, HU-43, HU-44, HU-45, HU-46, HU-47, HU-48, HU-49, HU-50, HU-51, HU-52, HU-53, HU-54, HU-55, HU-56, HU-58 y HU-61. Su evidencia y contratos se mantienen en [docs/user-stories/](docs/user-stories/).

HU-19 y HU-44 se amplían con aislamiento por odontólogo, “Mis pacientes” basado en citas y validación del intervalo de atención en servidor, sin migraciones. La evidencia y las limitaciones se detallan en [pacientes asignados](docs/patient-assignment-access.md).

HU-01: las [regresiones de sesión segura](docs/user-stories/HU-01-secure-session-regressions.md) verifican el contrato CSRF en JSON y recuperan las suites frontend sobrescritas, sin alterar la autenticación de producción.

La preparación actual añade trazabilidad del resumen y consulta, adendas, versión de citas, corrección de llegada y controles operativos. Los resultados de una versión histórica no certifican el despliegue definitivo: las conexiones reales, restauración del proveedor, TLS y cookies se verifican durante tu despliegue.
