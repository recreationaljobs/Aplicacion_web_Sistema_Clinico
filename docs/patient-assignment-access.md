# Pacientes asignados y atención desde citas

Actualización de HU-19/HU-44, 25 de septiembre de 2026.

## Análisis previo

1. `patients/views.py`: listado y detalle de Patient exigían capacidades, pero sus querysets incluían todos los pacientes. ClinicalRecord contiene los antecedentes generales y alertas compartidas, en una relación uno a uno con Patient.
2. `appointments/models.py`: Appointment.patient es ForeignKey a Patient, con relación inversa `appointments`.
3. Appointment.dentist es ForeignKey a User. No existe un perfil Dentist separado: se utiliza User.role = `ODONTOLOGO`. `ADMINISTRADOR` y `RECEPCIONISTA` son los otros roles.
4. Existían creación libre de Consultation bajo el paciente e inicio desde `start-attendance`. Este último ya bloqueaba la cita y reutilizaba Appointment.consultation, un OneToOne nullable. No comprobaba fecha/hora.
5. `users/permissions.py` define HasCapability, capacidades y presets editables. `appointments.view_all` ampliaba el alcance de citas; `consultations.view_all` se utilizaba en consultas recientes, pero no uniformemente en el expediente. Se conservaron los permisos y el comportamiento administrativo existente.
6. Las rutas anidadas de consultas, odontogramas, tratamientos, documentos, revisiones/adendas y PDF necesitaban alcance adicional. El PDF consultaba todo el historial. El odontograma inicial copiaba la última versión del paciente sin distinguir profesional.
7. React reutiliza PatientsPage, PatientConsultationsPanel, ConsultationRecordPage, AppointmentsPage, AppointmentDetailsPanel y Sidebar. Los servicios existentes ya exponen las llamadas necesarias; AuthContext, JWT y rutas se conservan.
8. No se necesita ni se incluye migración. Las relaciones y los índices existentes permiten resolver el acceso sin duplicar asignaciones.

## Contrato vigente

Las capacidades siguen autorizando la operación. Para ODONTOLOGO, además:

- Patient es visible si existe una Appointment con ese paciente y usuario como dentist. Se consideran citas históricas y actuales, incluso canceladas: cancelar impide atender, pero no borra la asignación histórica.
- Sólo son visibles sus propias citas, incluso con `appointments.view_all`. En otros roles ese permiso mantiene su significado anterior.
- Sólo son visibles sus propias consultas de pacientes asignados; si están enlazadas a una cita, esa cita también debe pertenecer al usuario. `consultations.view_all` no elude esta restricción del rol. Las consultas manuales antiguas se conservan y son accesibles si son propias y el paciente tiene una cita asignada.
- `POST /api/patients/{id}/consultations/` devuelve 409 `appointment_required` para odontólogos. La entrada es `POST /api/appointments/{id}/start-attendance/`. El flujo administrativo de creación manual se conserva.
- Los recursos ajenos devuelven 404 en detalle/operaciones. Seleccionar un paciente ajeno al crear una cita devuelve 400 como relación inválida; vincular un documento a una consulta ajena devuelve 403.
- Patient/ClinicalRecord y documentos sin consulta asociada permanecen compartidos entre profesionales asignados, sujetos a capacidades. Consultas, adendas, revisiones de consulta, documentos vinculados, odontogramas y tratamientos se limitan a su relación autorizada.
- El PDF utiliza el mismo alcance. La búsqueda de pacientes, comprobación de posibles duplicados, categorías de documentos y dashboard tampoco enumeran pacientes ajenos.

Los selectores están en `patients/access.py` y `appointments/access.py`. EXISTS resuelve pertenencia sin duplicados; Subquery obtiene próximas citas y última consulta sin consultas independientes por fila. Estos resúmenes respetan también `appointments.view` y `consultations.view`.

## Hora y estados

`USE_TZ=True`, `TIME_ZONE="UTC"`. La fecha/hora de reserva se interpreta con `ClinicProfile.timezone` (por defecto America/Managua). Se compara un instante aware de `timezone.now()` con `[inicio, inicio + duración)`.

Ejemplo: una cita de 10:00 a 10:30 en Managua permite iniciar a las 10:00; a las 09:59:59 o 10:30 devuelve 409. No hay tolerancia añadida. Los códigos son `appointment_not_due` y `appointment_window_closed`. PROGRAMADA, CONFIRMADA y PRESENTE son estados habilitados; CANCELADA, NO_ASISTIO y COMPLETADA sin consulta no permiten iniciar.

El servicio decide dentro de la transacción que bloquea la cita. Una consulta existente se devuelve con HTTP 200; el primer inicio responde 201. La consulta iniciada permanece accesible después de la ventana y conserva las reglas clínicas de edición/cierre.

Appointment añade `attendance` con `can_start`, `code`, `detail`, `starts_at`, `ends_at` y `server_now`. React consulta la cita seleccionada al abrirla, cada 15 segundos y al recuperar foco. Un error deshabilita el inicio. POST vuelve a validar horario y permisos; la hora del navegador no autoriza atención.

El `scheduled_range` existente emplea la zona UTC del proyecto para la exclusión de solapamientos. No se reinterpretaron esos datos ni constraints: la ventana de atención se calcula desde los campos locales y la zona de clínica.

## Historial conservado

Las nuevas versiones iniciales y resultados de tratamientos utilizan únicamente versiones visibles para el profesional de la consulta. Se mantiene la numeración global por paciente y el bloqueo que evita números duplicados.

No se borran ni reescriben snapshots históricos. Si una versión antigua ya copió hallazgos de otro profesional, su contenido no tiene procedencia por campo para separarlo automáticamente. El cambio impide nuevos accesos/copias cruzados; sanear contenido histórico requeriría una política clínica específica.

## Verificación

Nota posterior: los fallos de autenticación descritos en esta evidencia histórica se abordan en [HU-01: regresiones de sesión segura](user-stories/HU-01-secure-session-regressions.md), actualizando pruebas al contrato CSRF vigente y recuperando las suites sobrescritas.

Desde `src/backend`:

```powershell
.\.venv\Scripts\python.exe manage.py test --settings=config.settings.test --noinput
$env:TEST_DATABASE_URL = 'postgresql://assignment_test@127.0.0.1:55439/assignment_verification'
.\.venv\Scripts\python.exe manage.py test apps.patients.test_assignment_access apps.appointments.test_postgres --settings=config.settings.postgres_test --noinput
.\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run --settings=config.settings.test
```

El PostgreSQL de verificación es temporal y aislado, no la base clínica. Las pruebas comprueban concurrencia real, IDOR, pacientes compartidos, permisos, próximos datos propios, timezone, límites horarios, cancelación, copias odontológicas, PDF, documentos y consultas sin cita.

Desde `src/frontend`: `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`.

La suite general tiene fallos anteriores, reproducidos en una exportación intacta de HEAD: siete SecureSessionApiTests esperan 204 del endpoint CSRF, cuya implementación ya devuelve 200 con token; en frontend dos tests de logout esperan el contrato CSRF anterior y dos archivos `*.test.*` no contienen suites. No se cambió autenticación para ocultar esos resultados. Las pruebas del alcance clínico y de la nueva interfaz pasan.

Resultados del 25/09/2026:

- PostgreSQL aislado: 36/36 pruebas correctas (16 del nuevo contrato y 20 existentes de concurrencia/integridad).
- Interfaz enfocada: 38/38 pruebas correctas en AppointmentAttendance, AppointmentsPage y PatientsPage, incluido refresco desde servidor y fallo cerrado ante error de red.
- Última ejecución completa de backend: 478 pruebas, 438 correctas, 33 omitidas por entorno y los 7 fallos previos indicados. Posteriormente se añadió la prueba de vinculación de documentos ajenos, incluida en las 36 de PostgreSQL.
- Última ejecución completa de frontend: 330 correctas y 2 fallidas; 36 archivos correctos y 4 fallidos (dos sin suites). Posteriormente se añadió la prueba de refresco al recuperar foco, incluida en las 38 enfocadas.
- Oxlint, build de Vite y `makemigrations --check --dry-run`: correctos; Django no detectó cambios de modelos. `git diff --check`: sin errores.

Se aplicaron pruebas primero, revisión de autorización/IDOR según OWASP y verificación posterior. Las fixtures antiguas ahora declaran explícitamente una asignación histórica o fijan la hora del servidor dentro de la cita; no se relajaron los controles en producción. Los logs locales están bajo `.tmp/assignment-*`; no contienen datos clínicos reales y no se versionan.
