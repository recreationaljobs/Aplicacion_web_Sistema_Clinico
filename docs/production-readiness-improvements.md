# Correcciones y preparación de demo

> Informe histórico del 6 de septiembre de 2026. Sus conteos, migraciones y pendientes describen esa versión. El estado vigente y la evidencia de esta preparación están en [production-readiness.md](production-readiness.md); la operación está en [deployment.md](deployment.md). Este informe no define los requisitos del lanzamiento actual.

## Cambios implementados

| Área | Comportamiento |
|---|---|
| Integridad clínica | Las revisiones del odontograma bloquean consulta y paciente y rechazan consultas cerradas o pacientes inactivos. Los PATCH de consulta y tratamiento vuelven a comprobar el estado después de obtener el bloqueo. |
| Conflictos de edición | Paciente (incluye expediente anidado), consulta y tratamiento tienen `version`. Los PATCH aceptan `expected_version` y rechazan versiones obsoletas con `409 / edit_conflict`. Demo y producción requieren la versión; desarrollo conserva compatibilidad temporal. Las pantallas de paciente y consulta envían la versión leída. |
| Sesiones | Archivar, reactivar o cambiar el rol incrementa la versión de tokens. La edición de perfil no puede reactivar una cuenta archivada durante esa solicitud. Cambiar/restablecer contraseña bloquea y vuelve a comprobar el usuario. |
| Logout | Puede cerrar usando solo el refresh, tolera access vencido y es idempotente. Mantiene CSRF. El frontend conserva una marca no secreta de logout pendiente si falla la red y reintenta antes de restaurar sesión. |
| Administración | No se permite retirar el último administrador activo mediante cambio de rol/estado. Se conservan los cambios previos del proyecto para archivar, listar y eliminar usuarios sin historial protegido. |
| Exportación | El PDF incluye metadatos de documentos únicamente con `documents.view`. |
| Documentos | Retiro lógico con fecha, actor y motivo obligatorio. El archivo se conserva; un administrador puede listar retirados y restaurarlos desde la interfaz. No existe purga física de documentos clínicos. |
| Archivos | PDFs analizados estructuralmente con límites de objetos/profundidad/páginas; se rechazan archivos corruptos, cifrados, adjuntos e interactividad. Imágenes decodificadas y recodificadas sin metadatos ni bytes añadidos. |
| Transacciones y archivos | Si una operación/auditoría falla, se revierte su escritura y se intenta limpiar los archivos nuevos registrados en la solicitud. Avatares/logos anteriores se eliminan después del commit, con una tarea persistente para reintentar fallos del almacenamiento. |
| API | Autenticación por defecto, respuestas `/api/` sin almacenamiento en caché y validación de filtros de fecha/identificadores en agenda y auditoría. Login rechaza payloads mal formados con 400. |
| Consultas repetidas | El serializador de documentos calcula el permiso de contexto clínico una vez por instancia. Los listados/detalles de consulta cargan `completed_by` junto con el registro. |
| Interfaz | Odontograma de solo lectura al cerrar la consulta, motivo de retiro, restauración administrativa, retención del foco en los diálogos de documentos y mayor contraste del texto de login. |
| Demo | Perfil separado, muestras inmutables, semilla idempotente, aviso de datos ficticios, cargas y recuperación por correo deshabilitadas y preparación de Vercel/Render. |
| CI | La suite PostgreSQL incluye todo el backend, incluyendo HU-53. Se incorpora auditoría de dependencias de frontend y workflow manual serializado de preparación de la base demo. |

## Cambios de contrato y operación

- Migraciones nuevas: `patients.0017_clinical_edit_versions`, `patients.0018_document_retirement` y `users.0011_pending_file_cleanup`. Fueron ejercitadas en bases de prueba; no se aplicaron a la base de desarrollo del usuario.
- `PATCH /api/patients/{id}/`, consultas y tratamientos: enviar `expected_version` obtenido en el GET. `400` si falta cuando es obligatorio; `409` si alguien modificó el registro. No reintentar un conflicto silenciosamente ni reemplazar la versión antes de que el usuario revise los cambios.
- `DELETE /api/patients/{patient}/documents/{id}/`: cuerpo JSON `{"reason":"motivo"}`. Es un retiro, no una eliminación física.
- `GET /api/patients/{patient}/documents/?retired=true` y `POST .../documents/{id}/restore/`: exclusivos de administrador. La restauración conserva actor/motivo del último retiro y agrega un evento de auditoría.
- Ejecutar periódicamente `python manage.py retry_file_cleanup` para reintentar limpieza de avatares/logos y `python manage.py flushexpiredtokens` para limpiar tokens vencidos. La frecuencia debe configurarse en el entorno definitivo; no se creó un servicio periódico externo.
- Las migraciones son aditivas. Para revertir código durante el rollout, conservar columnas y datos; no deshacer migraciones ni borrar registros clínicos como procedimiento de rollback.

## Verificación y límites

Resultado local final (6 de septiembre de 2026): backend, **399 aprobadas y 32 omitidas por requerir PostgreSQL** (431 descubiertas); frontend, **321 aprobadas en 36 archivos**. Build y Oxlint sin errores. `pip check`, comprobación de migraciones y auditorías de dependencias Python/npm sin hallazgos. Se limitó Vitest a cuatro workers tras reproducir saturación al ejecutar toda la suite, y una prueba de agenda ahora espera a que se cargue su selección asincrónica.

Las pruebas nuevas reprodujeron antes de corregir: modificación tardía de consultas/odontogramas, revivir tokens después de archivar, cambio de rol del último administrador, logout sin access, sobrescritura entre editores, PDF falso/activo/cifrado, bytes añadidos a imágenes, retiro destructivo y archivos huérfanos ante fallo de auditoría.

Comandos de backend (desde `src/backend`):

```text
.venv/Scripts/python.exe manage.py test --settings=config.settings.test --noinput
.venv/Scripts/python.exe manage.py makemigrations --check --dry-run --settings=config.settings.test
.venv/Scripts/python.exe -m pip check
.venv/Scripts/python.exe -m pip_audit -r requirements.lock --progress-spinner off
```

Frontend: `npm test`, `npm run lint`, `npm audit --audit-level=high` y `npm run build` con `VITE_API_URL=/`. El perfil demo pasó `manage.py check --deploy` con configuración sintética, sin conectar a una base externa.

Las pruebas PostgreSQL locales quedaron bloqueadas porque el usuario de la conexión local no tiene `CREATEDB`. Se intentó crear una base de nombre aleatorio para pruebas; no se modificaron permisos ni tablas de desarrollo. Docker tampoco pudo ejecutarse porque su daemon no estaba iniciado. El job PostgreSQL de CI y la construcción de imagen deben pasar antes del despliegue. No se verificó un sitio publicado ni el proxy/cookies reales de Vercel/Render.

## Trabajo posterior antes de pacientes reales

1. Verificar CI con PostgreSQL y concurrencia real, imagen Docker y pruebas completas de navegador sobre staging. Medir latencia y consultas bajo carga representativa.
2. Usar almacenamiento persistente privado con cuarentena/antimalware y reconciliación periódica de huérfanos. El análisis estructural de PDF no es un antivirus. Un proceso que muere abruptamente o un almacenamiento caído durante la limpieza todavía requiere reconciliación externa.
3. Definir política de conservación, adendas/correcciones clínicas, procedimiento de recuperación y acceso de emergencia; mantener la purga clínica deshabilitada hasta definirlos.
4. Completar controles operativos: MFA, expiración por inactividad, tareas periódicas, correo transaccional con reintentos, alertas y auditoría protegida también mediante permisos de base y copia externa.
5. Implementar respaldos con recuperación a un punto en el tiempo y probar restauraciones. Acordar RPO/RTO, monitorización y responsables; la demo gratuita no satisface esos objetivos.
6. Completar las optimizaciones más amplias propuestas: selector de consultas con búsqueda/paginación (actualmente muestra hasta 100 opciones), disponibilidad calculada por lotes, carga limitada de agenda y revisión integral de accesibilidad/modales. La limpieza de recursos y documentación sobrantes y el rediseño general quedan en la etapa posterior acordada.

La marca de logout pendiente se conserva en almacenamiento del navegador. Si este lo bloquea, solo existe un respaldo en memoria durante esa pestaña; la revocación efectiva en el servidor siempre requiere recuperar conectividad.
