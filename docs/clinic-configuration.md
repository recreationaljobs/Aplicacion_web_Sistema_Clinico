# Configuración operativa

> Los ensayos de navegador anteriores se conservan como evidencia histórica, no como comandos ejecutables actuales. Las suites vigentes y el smoke reproducible están en [preparación para producción](production-readiness.md).

La sección **Configuración** permite a administración gestionar el perfil, los horarios y el catálogo clínico. Staff y Permisos conservan su funcionamiento anterior; Notificaciones se muestra como una opción no disponible.

## Reglas de agenda

Los horarios almacenados se aplican desde el inicio, incluso antes del primer guardado: un día marcado cerrado no permite crear citas ni consultar profesionales disponibles. Una cita debe estar íntegramente dentro de una jornada abierta, no puede cruzar una pausa ni coincidir con un cierre activo. Los cierres recurrentes comparan mes y día. Los cambios que afectarían citas futuras `PROGRAMADA` o `CONFIRMADA` se rechazan e incluyen `conflicting_appointments`. El formulario muestra el motivo y las citas afectadas junto al guardado, con un enlace a la agenda para reprogramarlas o cancelarlas antes de cambiar ese horario.

Los servicios son opcionales. Al elegir uno, la interfaz sugiere su duración y nombre, pero ambos campos siguen siendo editables y quedan guardados en la cita. Un servicio archivado permanece visible en citas históricas.

## API

| Método | Ruta | Acceso |
| --- | --- | --- |
| GET / PATCH | `/api/clinics/profile/` | lectura autenticada / escritura administración |
| GET | `/api/clinics/profile/options/` | autenticado |
| GET / PUT | `/api/clinics/business-hours/` | lectura autenticada / escritura administración |
| GET / POST | `/api/clinics/closures/` | lectura autenticada / escritura administración |
| PATCH | `/api/clinics/closures/<id>/` | administración |
| GET / POST | `/api/clinics/service-categories/` | lectura autenticada / escritura administración |
| PATCH | `/api/clinics/service-categories/<id>/` | administración |
| GET / POST | `/api/clinics/services/` | lectura autenticada / escritura administración |
| PATCH | `/api/clinics/services/<id>/` | administración |

Los logos admiten PNG, JPEG y WebP hasta 2 MB. En desarrollo se almacenan bajo `MEDIA_ROOT`; producción debe proporcionar almacenamiento persistente y configurar `DJANGO_SECRET_KEY`, `DEBUG` y orígenes permitidos mediante el entorno.

## Evidencia visual

- [Perfil de la clínica](user-stories/assets/clinic-config-profile.png)
- [Horarios de atención](user-stories/assets/clinic-config-hours.png)
- [Servicios y tarifas](user-stories/assets/clinic-config-services.png)
- [Modal móvil de categoría](user-stories/assets/clinic-config-mobile-modal.png)

## Ajuste del perfil del 16 de septiembre de 2026

- El perfil conserva nombre, logo, teléfono, correo, dirección, moneda y zona horaria. Se retira el campo Subtítulo (`tagline`) del formulario, payload y API.
- Migración `clinics.0002_remove_clinic_tagline` aplicada en PostgreSQL local; columna ausente verificada. El encabezado del PDF tampoco usa subtítulo.
- Verificación: 15 pruebas backend de clínica y exportación PDF, 30 pruebas SettingsPage; lint, build, Django check, consistencia de migraciones y diff check correctos.
- Comandos: `python manage.py test apps.clinics apps.patients.test_clinical_record_export --settings=config.settings.test --noinput`, `npm test -- src/pages/Settings/SettingsPage.test.jsx`, `npm run lint`, `npm run build`, `python manage.py makemigrations --check --dry-run` y `git diff --check`.
- Las capturas anteriores documentan la configuración original y todavía no reflejan este retiro del campo.

## Corrección de horarios del 16 de septiembre de 2026

- Se retira el bypass de `schedule_configured=False` en la validación compartida por citas y disponibilidad. No requiere migración ni modifica citas existentes.
- Se normalizan las horas recibidas a HH:MM antes de comparar intervalos, evitando rechazos al editar límites de pausas junto a horas HH:MM:SS del servidor.
- Regresiones: 90 pruebas de citas, clínica, continuidad y perfiles (22 pruebas PostgreSQL omitidas en SQLite); 54 pruebas adicionales de citas y auditoría; 33 pruebas de BusinessHoursPanel/SettingsPage. Guardado y recarga, conflictos y colocación visible del aviso comprobados en Chromium a 1280×900 y 390×844.
- Verificación local de solo lectura: la disponibilidad del 19/09/2026 a las 09:00 devuelve HTTP 400 por día cerrado, aunque `schedule_configured` sigue falso. Todos los horarios y la cita existente se conservan.
- La ejecución de la suite PostgreSQL en una base de pruebas aislada no pudo iniciar: el usuario local carece de permiso para crear bases. Las regresiones de persistencia/API se ejecutaron con la configuración SQLite; lint, build, Django check y consistencia de migraciones correctos.
- Comandos: `python manage.py test apps.appointments apps.clinics apps.patients.test_follow_up_continuity apps.patients.test_hu53 --settings=config.settings.test --noinput`; `python manage.py test apps.appointments.tests apps.audit.tests --settings=config.settings.test --noinput`; `npm test -- src/pages/Settings/BusinessHoursPanel.test.jsx src/pages/Settings/SettingsPage.test.jsx`; **evidencia histórica de navegador (script puntual retirado)**.
