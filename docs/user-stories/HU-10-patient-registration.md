# HU-10 — Registro de pacientes y apertura de expediente

> Los ensayos de navegador anteriores se conservan como evidencia histórica, no como comandos ejecutables actuales. Las suites vigentes y el smoke reproducible están en [preparación para producción](../production-readiness.md).

**Jira:** SCRUM-18

**Historia:** Como recepcionista, quiero registrar nuevos pacientes, para crear su expediente clínico.

**Estado:** Implementada y validada el 10 de agosto de 2026; criterio de pacientes recientes corregido y validado el 28 de agosto de 2026.

## Criterio de aceptación

> Dado que completo los datos personales del paciente, cuando guardo, entonces se almacenan correctamente y se abre su expediente automáticamente.

## Alcance implementado

- La recepcionista con el permiso `patients.create` puede abrir **Nuevo paciente** desde `/pacientes` o el dashboard; ambas acciones navegan a `/pacientes/nuevo`.
- Alta, visualización y edición usan una sola vista principal inspirada en Odoo: conservan el encabezado, las tarjetas, la distribución y las tabs **Resumen clínico**, **Consultas**, **Odontograma** y **Documentos**.
- `/pacientes/nuevo` activa `isNew=true`; `/pacientes/{id}` carga el mismo componente con un borrador basado en la última versión persistida.
- El dashboard usa un resumen compacto para calcular el total sin descargar expedientes completos y muestra hasta cuatro pacientes distintos ordenados por su última consulta completada, con acceso directo al expediente para Administración y Recepción.
- Odontología sustituye **Pacientes recientes** por sus cuatro consultas más recientes. Administración ve consultas de todo el equipo y Recepción puede habilitar ese resumen general mediante `consultations.view_all`.
- El resumen reúne los datos permanentes del paciente, la historia de la enfermedad actual y sus antecedentes familiares, infectocontagiosos y hereditarios. La historia se edita con `patients.edit` y se incluye en la exportación PDF.
- Los datos propios de una atención —profesional, fecha, motivo, interrogatorio, examen físico, diagnóstico, plan, presupuesto y tratamiento— se capturan exclusivamente desde **Consultas** y no se repiten en **Resumen clínico**.
- **Resumen clínico** no muestra ni edita una tarjeta de archivos clínicos. Radiografías, fotografías y demás adjuntos se gestionarán exclusivamente desde la pestaña **Documentos**.
- Son obligatorios: nombres, primer apellido, lugar de nacimiento, cédula, género y fecha de nacimiento.
- La API rechaza fechas futuras. La detección robusta de cédulas duplicadas, incluyendo variantes de guiones y espacios, se documenta en HU-13.
- El sistema genera el código inmutable `PAC-00001` a partir del identificador interno.
- Después de guardar, la interfaz navega a `/pacientes/{id}` y muestra el expediente inicial.
- El expediente de lectura conserva el diseño de tarjetas para datos personales y antecedentes; los opcionales vacíos se identifican como **Sin información registrada**.
- No existe un interruptor global de edición. Con `patients.edit`, los valores son controles en línea con apariencia de texto; el borde se revela al pasar el cursor o enfocar el campo.
- La nube **Guardar cambios** y la X **Descartar cambios** aparecen solo cuando el borrador cambia. Guardar actualiza la línea base; descartar restaura el expediente existente o abandona un alta nueva.
- Si se intenta navegar, recargar o cerrar con cambios pendientes, el sistema advierte antes de perderlos. Un error de API conserva el borrador para reintentar.
- Los errores de validación, incluso cuando pertenecen al objeto anidado `clinical_record`, muestran el mensaje específico de la API en lugar de ocultarlo tras un aviso genérico.
- En un paciente persistido, la pestaña **Consultas** usa la ruta `/pacientes/{id}/consultas`, carga su historial real y lo ordena de la fecha más reciente a la más antigua. Incluye estados de carga, error y ausencia de registros.
- Con `consultations.create`, **Nueva consulta** abre `/pacientes/{id}/consultas/nueva`; **Ver detalle** abre `/pacientes/{id}/consultas/{consultationId}` para cualquier usuario con `consultations.view`.
- La misma ficha de consulta sirve para alta, lectura y edición. Sus campos tienen apariencia textual y la nube/X aparecen únicamente cuando el borrador difiere de la versión persistida.
- Cada consulta guarda fecha, hora, tipo, resumen, estado, identificación profesional, servicio, motivo de consulta, interrogatorio por sistemas, examen físico, diagnóstico, plan y presupuesto.
- Fecha, hora, tipo, resumen y estado son obligatorios. En un alta se precargan la fecha y hora locales y el estado **En progreso**; el profesional se asigna desde la sesión y no desde el formulario.
- Un error conserva el borrador y la navegación con cambios pendientes usa la misma advertencia del expediente. Las consultas completadas continúan editables cuando la cuenta posee `consultations.edit`.

## Modelo y seguridad

- `Patient` conserva identidad, contacto y datos demográficos permanentes; `ClinicalRecord` mantiene antecedentes generales en una relación uno-a-uno y `Consultation` representa cada atención del historial clínico.
- `Consultation.professional` protege la referencia al usuario mediante `PROTECT`, de modo que una consulta no pierda la identidad del profesional asociado.
- `Consultation.professional_name_snapshot` conserva el nombre presentado al momento del alta aunque la cuenta cambie posteriormente. La migración completa esa copia para registros existentes sin eliminar datos.
- La creación anidada de ambos modelos se ejecuta dentro de una transacción para evitar expedientes parciales.
- `code`, `registered_by`, `created_at` y `updated_at` son campos de solo lectura en la API.
- `GET /api/patients/` y `GET /api/patients/{id}/` requieren `patients.view`.
- `GET /api/patients/dashboard-summary/` requiere `patients.view` y ofrece un alcance global independiente de `consultations.view_all`.
- El resumen considera únicamente consultas `COMPLETADA` cuya fecha no sea posterior al día local de la clínica, deduplica por paciente en base de datos y conserva la atención más reciente. Incluye pacientes inactivos para preservar el historial.
- `POST /api/patients/` requiere `patients.create`.
- `PATCH /api/patients/{id}/` requiere `patients.edit`; ocultar **Editar** sin permiso es solamente una protección adicional de interfaz.
- El administrador mantiene acceso implícito; los demás roles heredan los presets configurados en HU-09.
- `GET /api/patients/consultations/recent/` requiere `consultations.view`; sin `consultations.view_all` filtra por el profesional autenticado y nunca confía en un identificador enviado por el cliente.
- `consultations.view_all` afecta únicamente el resumen del dashboard; los historiales y detalles existentes conservan su alcance actual.
- La autorización se valida en backend, independientemente de que la interfaz oculte el botón de creación.

## Interfaces públicas

| Método | Endpoint | Capacidad | Resultado |
|---|---|---|---|
| `GET` | `/api/patients/` | `patients.view` | Lista y búsqueda con `?search=`. |
| `GET` | `/api/patients/dashboard-summary/` | `patients.view` | Devuelve el total de pacientes y hasta cuatro pacientes distintos por su última consulta completada. |
| `POST` | `/api/patients/` | `patients.create` | Registra `Patient` y su objeto anidado `clinical_record`. |
| `GET` | `/api/patients/{id}/` | `patients.view` | Devuelve la identidad y el expediente clínico completo. |
| `PATCH` | `/api/patients/{id}/` | `patients.edit` | Actualiza datos permanentes y el objeto `clinical_record`. |
| `GET` | `/api/patients/consultations/recent/` | `consultations.view` | Devuelve hasta cuatro consultas propias; con `consultations.view_all`, devuelve las del equipo. |
| `GET` | `/api/patients/{id}/consultations/` | `consultations.view` | Lista el historial persistido de consultas, de más reciente a más antiguo. |
| `POST` | `/api/patients/{id}/consultations/` | `consultations.create` | Registra una consulta y asigna paciente/profesional desde la ruta y sesión. |
| `GET` | `/api/patients/{id}/consultations/{consultationId}/` | `consultations.view` | Devuelve la ficha clínica completa de una consulta del paciente indicado. |
| `PATCH` | `/api/patients/{id}/consultations/{consultationId}/` | `consultations.edit` | Actualiza campos clínicos sin permitir sustituir paciente o profesional. |

## Evidencia automatizada

- Backend `[HU-10]`: creación transaccional del paciente y expediente completo, apertura del detalle, código automático, persistencia, búsqueda, permisos editables, acceso administrativo, fecha futura, duplicidad de cédula y campos internos de solo lectura.
- Frontend `[HU-10]`: una sola vista cubre `isNew`, edición inmediata por permiso, detección de cambios, `POST`, `PATCH`, descarte, errores y protección de navegación conservando estructura y tabs. Las pruebas verifican la lectura, edición, guardado y recarga de la historia en el resumen y su ausencia en el formulario y payload de consulta.
- Cliente API: una prueba de regresión comprueba que los errores anidados del expediente se presentan de forma legible.
- Dashboard: las acciones rápidas respetan capacidades; el total y las últimas atenciones se cargan desde `GET /api/patients/dashboard-summary/`, con deduplicación, límite, orden y criterio `COMPLETADA` validados en backend. El resumen separado de consultas conserva su alcance personal/general.
- Servicio frontend: listado/búsqueda, creación y detalle con autenticación Bearer.
- Edición: permiso configurable, rechazo `403`, campos técnicos inmutables, formulario precargado, `PATCH` y actualización visible.
- Consultas backend: creación completa, metadatos obligatorios, profesional automático, propiedad inmutable, alcance por paciente, resumen reciente limitado y filtrado, permisos separados, edición de completadas y rechazo de eliminación.
- Consultas frontend: rutas de historial/alta/detalle, resumen reciente por rol y capacidad, acciones por capacidad, valores iniciales, todos los grupos clínicos, `POST`, `PATCH`, descarte, errores, modo lectura, bloqueo de navegación y tabla/tarjetas responsivas.

## Decisiones de alcance

- La edad se deriva de la fecha de nacimiento y no se almacena como dato duplicado.
- Las enfermedades se guardan como selecciones estructuradas. Los campos heredados de referencias radiográficas y fotográficas se conservan temporalmente en el backend para no perder datos existentes, pero quedan fuera del formulario hasta su migración al módulo documental.
- Los apartados excluidos expresamente por la fuente no forman parte del modelo.
- Salvo `present_illness_history`, que pertenece al resumen, los campos de consulta heredados que todavía existen en `ClinicalRecord` permanecen en el backend para no destruir datos existentes, pero ya no se muestran ni se envían desde el resumen y no se sincronizan con `Consultation`.
- El odontograma y la carga binaria de documentos requieren historias posteriores.
- La separación por clínica deberá incorporarse cuando exista la relación operativa entre usuarios, clínicas y pacientes.

## Ajuste validado el 16 de septiembre de 2026

- Historia de la enfermedad actual pertenece a `ClinicalRecord`; `Consultation` deja de exponer y almacenar ese campo.
- Migración `0021`: conserva el resumen existente; si está vacío o falta, toma la última historia no vacía de las consultas antes de retirar la columna.
- Regresiones: lectura/edición/recarga del resumen, ausencia en consulta, migración y contenido PDF.
- Verificación: `python manage.py test apps.patients --settings=config.settings.test --noinput`, `npm test -- src/App.test.jsx`, `npm run lint`, `npm run build`, `python manage.py makemigrations --check --dry-run` y `git diff --check`.
- Resultado: 220 pruebas backend (10 omitidas), 56 pruebas frontend; lint, build, consistencia de migraciones y comprobaciones Django correctos. Migración 0021 aplicada y columnas verificadas en PostgreSQL local.

### Retiro de Observaciones y análisis

- Se elimina la tarjeta de consulta, el campo `observations_analysis` del payload y API, y su referencia en el PDF.
- Migración `0022`: retira las columnas en `ClinicalRecord` y `Consultation`; aplicada y verificada en PostgreSQL local.
- Verificación: 66 pruebas backend de API, exportación y migraciones correctas; 56 pruebas App correctas, lint, build, Django check, consistencia de migraciones y diff check.
- Comando backend: `python manage.py test apps.patients.tests apps.patients.test_clinical_record_export apps.patients.test_illness_history_migration apps.patients.test_system_checks_migration --settings=config.settings.test --noinput`.

### Retiro de Tratamiento realizado

- Se retira la tarjeta textual de consulta y el campo `treatment_performed` del payload, API, modelos y exportación PDF.
- Migración `0023`: elimina las columnas de `ClinicalRecord` y `Consultation`, aplicada y verificada en PostgreSQL local.
- La regresión verifica que el formulario y el payload de consulta, así como las respuestas de paciente y consulta, excluyan el campo.
- Verificación: 75 pruebas backend correctas con `python manage.py test apps.patients.tests apps.patients.test_clinical_record_export apps.patients.test_illness_history_migration apps.patients.test_system_checks_migration apps.patients.test_migrations --settings=config.settings.test --noinput`; 56 pruebas App, lint, build, Django check, consistencia de migraciones y diff check correctos.

### Datos profesionales compartidos

- La consulta muestra el nombre actual, especialidad, Código MINSA y teléfono de su profesional desde User, sin controles para sustituirlos en la consulta. Mi perfil y Staff son las interfaces de edición.
- Migración 0024 elimina INSS/CEMA en ClinicalRecord y Consultation. Aplicada y verificada en la base local; API y formulario excluyen ambos campos.
- Creación de consulta verificada tras un PATCH de perfil: usa datos guardados y descarta metadatos profesionales enviados arbitrariamente por el cliente. Suites de cuentas/pacientes/PDF: 143 correctas; perfil/Staff/App: 91 correctas.

### Navegación y acciones persistentes — 16 de septiembre de 2026

- Todas las vistas autenticadas comparten un contenedor ajustado al alto disponible, con menú y barra de cuenta visibles y scroll propio del contenido central. El aviso demo conserva su espacio; cambiar de ruta restablece el scroll.
- Guardar y descartar flotan como un grupo compacto en la esquina inferior derecha del expediente, consulta y odontograma; se retira la franja superior fija. Conservan su visibilidad condicional y los handlers existentes. Los formularios dejan espacio al final para que se pueda desplazar el último campo por encima de las acciones.
- Chromium con API simulada y datos ficticios verifica escritorio (1280×900), móvil (390×844) y ambos modos demo: navegación inmóvil, acciones visibles y sin superposición, ausencia de scroll exterior/desbordamiento horizontal, guardado desde la consulta y descarte en los tres formularios.
- Verificación: **evidencia histórica de navegador (script puntual retirado)**; 66 pruebas con `npm test -- src/App.test.jsx src/pages/Patients/OdontogramPages.test.jsx`, `npm run lint`, `npm run build` y `git diff --check` correctos.
