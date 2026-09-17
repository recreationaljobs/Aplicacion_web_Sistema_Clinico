# HU-35 — Exportar el expediente clínico en PDF

Estado: Implementada y verificada.

## Alcance implementado

- El backend genera bajo demanda un PDF A4 imprimible; no captura la interfaz ni persiste el resultado como `PatientDocument`.
- La exportación reúne datos administrativos, antecedentes y alertas, consultas en orden cronológico, plan longitudinal separado entre vigente e histórico, el estado actual del odontograma y referencias a documentos adjuntos.
- El endpoint requiere autenticación y permisos de lectura tanto de pacientes como de consultas. Los expedientes inactivos permanecen exportables en modo histórico.
- La respuesta usa un nombre seguro derivado del código del paciente y cabeceras privadas sin caché pública.
- La acción deja una auditoría `CLINICAL_RECORD_EXPORT` con identidad del actor, paciente y fecha, sin copiar contenido clínico al registro de auditoría.
- La interfaz presenta `Exportar PDF` únicamente a usuarios autorizados, evita solicitudes simultáneas y conserva el nombre enviado por el servidor.

## Interfaces afectadas

- `GET /api/patients/{patient_id}/clinical-record/export/`
- Acción `Exportar PDF` en el expediente existente del paciente.
- Utilidad frontend `apiFileRequest` para descargas autenticadas.

## Persistencia

- No se agregaron modelos, campos ni migraciones.
- La generación es de solo lectura y no crea documentos, snapshots ni versiones clínicas.

## Evidencia de aceptación

- Pruebas backend de contenido, orden cronológico, paginación, autorización, paciente inactivo, privacidad, nombre seguro, auditoría e invariancia de datos.
- Pruebas frontend de permisos, descarga autenticada, nombre del archivo, estado de carga, solicitud única y errores recuperables.
- PDF sintético de tres páginas renderizado e inspeccionado visualmente; encabezados, márgenes, tablas y pies se mantienen en todas las páginas.
- Suites completas, lint, build y comprobaciones de Django ejecutadas al cerrar el bloque.

## Comandos de verificación

- `.venv\Scripts\python.exe manage.py test apps.patients.test_clinical_record_export --settings=config.settings.test`
- `.venv\Scripts\python.exe manage.py test --settings=config.settings.test`
- `npm test -- --reporter=dot`
- `npm run lint`
- `npm run build`
- `.venv\Scripts\python.exe manage.py check`
- `.venv\Scripts\python.exe manage.py migrate --check`
- `.venv\Scripts\python.exe manage.py makemigrations --check --dry-run`
- `git diff --check`

## Ajuste del encabezado del 16 de septiembre de 2026

- El encabezado conserva el nombre y contacto de la clínica y deja de mostrar el subtítulo retirado del perfil.
- La suite de exportación PDF pasó junto con las pruebas de configuración: 15 pruebas backend correctas mediante `python manage.py test apps.clinics apps.patients.test_clinical_record_export --settings=config.settings.test --noinput`.
