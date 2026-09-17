# Auditoría y preparación para producción

Revisión y verificaciones: 16–17 de septiembre de 2026. Alcance: aplicación Django/React, API, permisos, integridad clínica, agenda, archivos, dependencias, build, documentación y recuperación. Se trabajó sobre los cambios que ya existían en el árbol local y se preservaron durante la preparación.

## Dictamen

La arquitectura tiene sentido para una clínica: un monolito Django dividido por dominios y una SPA React. PostgreSQL conserva la integridad transaccional; Redis sirve para controles compartidos; S3 conserva archivos fuera del contenedor. No hay una necesidad demostrada de microservicios, una cola o una reescritura.

La preparación corrige problemas de integridad, trazabilidad, concurrencia y configuración que sí afectaban una salida a producción. El repositorio queda preparado para construir y desplegar una **instalación nueva y vacía**, con una guía operativa verificable. No se ha publicado nada ni se han probado credenciales/servicios de un entorno productivo real. La lista de [despliegue](deployment.md#lista-de-lanzamiento-en-tu-entorno) debe completarse en ese entorno antes de usar datos reales.

No se certifica una migración sin pérdida desde la demo o desde una base clínica previa. Tampoco se afirma una capacidad de usuarios, latencia p95, SLA, RPO o RTO sin medirlos con el volumen y proveedor elegidos. Las antiguas metas de documentos de planificación no son requisitos impuestos al lanzamiento actual.

## Evaluación técnica

| Área | Evaluación y consecuencia |
| --- | --- |
| Arquitectura | Separación razonable por `users`, `patients`, `clinics`, `appointments` y `audit`; mantener transacciones en el backend y acceso API en servicios del frontend. |
| Calidad | Hay suites extensas de comportamiento y permisos. `patients/models.py`, serializers y varias pantallas son grandes: conviene dividirlos gradualmente por responsabilidad, conservando sus contratos y pruebas. |
| Seguridad | Autenticación obligatoria, permisos configurables, refresh HttpOnly, access en memoria, CSRF, revocación y descargas privadas. La configuración del proxy, secretos y buckets reales sigue siendo parte del despliegue. |
| Integridad clínica | Revisiones completas y adendas ahora conservan original, actor, fecha, motivo y versión. No se confunde el log general administrativo con el contenido clínico. |
| Agenda | Versiones, constraints PostgreSQL y un bloqueo común con cambios de horario. El bloqueo global del perfil serializa escrituras de agenda: apropiado inicialmente, medir antes de aumentar volumen. |
| Archivos | Validación estructural de PDF e imágenes, retiro lógico, acceso autenticado y limpieza recuperable. El análisis no sustituye a un antivirus; una cuarentena puede añadirse si el riesgo/volumen lo requiere. |
| Operación | Build reproducible y usuario no privilegiado; sondas y comandos de diagnóstico. Jobs, backups, alertas y restauración del proveedor deben configurarse expresamente. |
| Interfaz | Errores de servicios preservan el formulario; diálogos corregidos tienen manejo de foco/teclado. Smoke en Chromium móvil/escritorio, sin afirmar cobertura completa de accesibilidad o de todos los navegadores. |

## Hallazgos resueltos

| Problema comprobado | Corrección y evidencia |
| --- | --- |
| Inicio de atención tomaba fecha UTC al cruzar medianoche | Fecha/hora real convertida a la zona de la clínica; regresión de cruce UTC. No se cambió la representación de intervalos de agenda. |
| Resumen/consulta sin historial completo recuperable | Snapshots iniciales y de cada cambio efectivo, autor y motivo; historial paginado en API/UI. Un estado previo observado se marca como sistema, sin inventar un autor histórico. |
| Consulta cerrada necesitaba aclaraciones posteriores | Adendas inmutables con permiso existente `consultations.edit`, original intacto y exportación PDF; smoke tras recargar y comparación de texto PDF. |
| Cita podía sobrescribirse desde una versión vieja | `version` / `expected_version`; producción exige versión y devuelve 409 si es obsoleta. UI envía la versión leída. |
| Llegada marcada por error sin corrección trazable | `undo-check-in` con motivo/versión, antes de iniciar atención, restaura el estado previo conocido y conserva evento inmutable. |
| Booking y cambios de horarios/cierres podían validarse en paralelo | Ambas operaciones toman primero el mismo bloqueo PostgreSQL del perfil; se mantienen las constraints de solapamiento. Citas presentes/en atención también impiden cierres incompatibles. |
| Disponibilidad crecía en consultas SQL por profesional | Query de citas agrupada y cálculo del intervalo en memoria; regresión de cantidad de consultas. |
| Opciones de consulta desaparecían después de 100 | El servicio recorre las páginas compactas; regresión de segunda página. Sigue cargando las opciones en conjunto: con historiales enormes convendrá búsqueda/paginación en el selector. |
| JSON odontográfico/superficies mal formado podía producir 500 | Validación de tipos antes de hashing/pertenencia; pruebas de payload inválido. |
| Precio negativo y categoría inválida | Validador + constraint SQL de precio; filtro inválido devuelve 400. |
| Readiness sólo verificaba la base | Añadido Redis; respuesta 503 constante ante fallo. Timeout de conexión configurado; no se presenta como un límite global de consultas SQL. |
| Fallo SMTP podía revelar un error al recuperar contraseña | Timeout, respuesta genérica y log sin detalles del proveedor. El envío sigue siendo síncrono: monitorizar tiempo/fallos y evaluar cola si hace falta. |
| Configuración productiva aceptaba valores inseguros | Rechazo de clave débil, comodines y orígenes sin HTTPS; mismo origen y `VITE_API_URL=/`; configuración demo apartada. |
| Historia inmutable sólo dependía del ORM | Triggers PostgreSQL UPDATE/DELETE y plantilla runtime sin DDL/TRUNCATE/ownership; 18 intentos prohibidos rechazados con rol real aislado. |
| Sin diagnóstico explícito de servicios externos | `check_services`, con prueba sintética opcional de ambos almacenamientos y autenticación SMTP sin mandar mensajes. |
| Documentación vieja/generada fuera del contrato actual | README consolidado, contratos de archivos y trazabilidad actuales, guía de despliegue y usuario en Markdown; evidencia histórica marcada. |

Se conservaron los permisos configurables. Recepción puede editar información clínica si Administración le concede `patients.edit`; no se impuso un nuevo reparto de roles. El permiso extra usado por Recepción en el smoke sólo se agregó a su base sintética.

## Verificaciones realizadas

| Comprobación | Resultado |
| --- | --- |
| Backend completo PostgreSQL 18 | Suite de 463 pruebas aprobada; validación real de exclusión, transacciones, concurrencia y triggers. Runtime local Python 3.14. |
| Backend completo Python 3.13.15 / SQLite en Docker | 463 pruebas, suite aprobada en 183.706 s; 33 omitidas porque requieren PostgreSQL. |
| Frontend Node 22.23.2 / Vitest 4.1.11 en Docker | 39 archivos, 345 pruebas; lint, auditoría y build aprobados. |
| `makemigrations --check --dry-run` | Sin cambios pendientes. |
| `pip check` | Sin requisitos incompatibles. |
| `pip-audit -r requirements.lock` | Sin vulnerabilidades conocidas; lock productivo de 27 paquetes. |
| `npm audit --audit-level=low` | Sin vulnerabilidades conocidas. Se actualizó Vitest 4.1.10 → 4.1.11 por el aviso detectado. |
| Gitleaks 8.30.1, fuente vigente | 395 archivos de texto exportados sin entornos/secretos locales; sin hallazgos. |
| Gitleaks 8.30.1, historial Git | 59 commits, 31.85 MB analizados; sin hallazgos. Escaneo continuo añadido a CI con salida censurada. |
| Docker backend | Build aprobado con Python 3.13.15; UID 10001, `check --deploy`, arranque real Gunicorn y live 200 aprobados con variables ficticias y sin publicar puertos. |
| Navegador/API Chromium | Los tres roles: login/refresh/logout, revocación del JWT, motivo/revisiones, adenda persistente/PDF, archivos autenticados/no-store y móvil 390×844 aprobados. |
| Restauración PostgreSQL + media privado | 32 tablas / 405 filas comparadas íntegramente y un archivo comparado con SHA-256; trigger inmutable conservado. |
| Privilegios de runtime | Lectura/actualización normal permitidas; 18 intentos UPDATE/DELETE/TRUNCATE del historial, DDL y TRUNCATE operativo rechazados. |

Las primeras ejecuciones de validación en contenedor tuvieron fallos del **entorno de ensayo**: la imagen productiva no instala `python-dotenv`, que sí necesitan los tests de desarrollo, y `VITE_API_URL=/` se aplicó a tests que esperan el fallback de desarrollo. Se separó la imagen temporal de pruebas y la variable del build. No se añadieron esas dependencias de pruebas a producción ni se ocultaron fallos de aplicación.

Los escáneres no garantizan ausencia total de vulnerabilidades o credenciales. Una revisión adicional del historial encontró claves Django generadas para desarrollo: no son evidencia de credenciales productivas activas. No reutilizarlas; si alguna se utilizó fuera de pruebas, reemplazarla en ese entorno. No se reescribió el historial.

## Reproducir el smoke local

Los scripts de `scripts/` son herramientas de pruebas con datos ficticios, no scripts de despliegue ni de importación. El perfil `release_smoke` usa hash rápido, HTTP y servicios locales de pruebas: **jamás se usa para producción**.

1. Prepara un cluster PostgreSQL aislado en `127.0.0.1:55439`, con rol `clinic_test`, base vacía `clinic_smoke` y acceso local para ese rol. No cambies la autenticación del cluster real. Usa una contraseña sintética en su URL si habilitas autenticación por contraseña.
2. Instala `src/backend/requirements-smoke.txt` en tu entorno de desarrollo y ejecuta `python -m playwright install chromium`. Define `TEST_DATABASE_URL=postgresql://clinic_test@127.0.0.1:55439/clinic_smoke`, `DJANGO_SETTINGS_MODULE=config.settings.release_smoke` y una `RELEASE_SMOKE_PASSWORD` exclusiva de pruebas.
3. Ejecuta migraciones con ese perfil. Desde la raíz, ejecuta `python scripts/prepare_release_smoke.py`: rechaza una base con usuarios/pacientes existentes. Anota los identificadores impresos; no presupongas que son 1.
4. Construye el frontend con `VITE_API_URL=/`. En terminales separadas arranca backend en `127.0.0.1:8190` y preview en `127.0.0.1:5190`:

```powershell
# Desde src/backend, con las variables de pruebas descritas arriba:
.\.venv\Scripts\python.exe -B -u manage.py runserver 127.0.0.1:8190 --noreload
# Desde src/frontend:
npm.cmd run preview -- --host 127.0.0.1 --port 5190 --strictPort --config ../../scripts/vite-smoke.config.mjs
# Desde la raíz, usando el Python del entorno con Playwright:
src/backend/.venv/Scripts/python.exe -B scripts/release_smoke.py --patient ID --consultation ID
```

`release_smoke.py` guarda capturas en `.tmp/production-check/browser/`, comprueba que no se persistan JWT en WebStorage y revisa persistencia del original/adenda dentro del PDF. Necesita las variables sintéticas en su terminal. El preview es una herramienta local de ensayo, no el servidor productivo.

Desde la raíz, sobre ese cluster sintético, ejecuta `python scripts/verify_release_restore.py --pg-bin "C:/Program Files/PostgreSQL/18/bin"`. Sólo restaura `clinic_smoke` a una **nueva** `clinic_smoke_restore` y rechaza un destino existente. El script actual utiliza los binarios `.exe` de Windows. `verify_runtime_permissions.py` verifica la plantilla de grants y rechaza un rol de ensayo ya existente; ejecuta cada ensayo en un cluster aislado nuevo. Ninguno se apunta a una base real.

## Limpieza aplicada y archivos conservados

- Retirados `App.css` y `Auth/LoginPage.css`, ambos vacíos y sin importaciones.
- `DESING.md` corregido a `DESIGN.md` y actualizado para la tipografía/estilos actuales.
- README genérico del frontend reemplazado por instrucciones útiles y referencias al README principal.
- Configuración activa de Vercel que apuntaba a la demo retirada; se conserva su plantilla explícita en `deployment/`.
- Plan viejo de producción redundante retirado; este informe y `deployment.md` describen el estado actual, sin exigir objetivos imaginados en planes antiguos.
- Guía Word sustituida por `docs/guia-usuario/README.md`. Retirados `.docx`, generador, conversor/verificador, dependencias documentales y capturas/renders que dejaron de usarse.
- Conservados historias de usuario, ADR de cookies, contratos clínicos, documentación de operación y demo aislada. `production-readiness-improvements.md` está marcado como histórico y no define requisitos actuales. Las pruebas antiguas de navegador se identifican como históricas; no se presentan scripts eliminados como comandos vigentes.
- `.tmp/`, entornos, `node_modules`, builds, `.env` y archivos locales no forman parte del artefacto productivo ni deben versionarse. Los dumps/capturas del ensayo son datos ficticios y evidencia local, no fixtures de producción.

No se eliminaron migraciones aplicadas ni código únicamente porque “parecía no usado”; el historial de schema y los contratos soportados siguen siendo esenciales. Las eliminaciones y modificaciones que ya estaban presentes antes de esta preparación se preservaron.

## Siguientes prioridades recomendadas

1. Antes de abrir datos reales, completar la lista del entorno: TLS/cookies, servicios, correo, permisos de runtime, backups de proveedor, jobs y alertas.
2. Medir con el volumen previsto consultas de pacientes/agenda, PDF y archivos; ajustar workers, índices o paginación con resultados. Evitar adoptar microservicios por anticipación.
3. Dividir módulos/pantallas grandes cuando se trabaje en ellos, conservar pruebas y añadir cobertura de los flujos que se cambien. Ampliar auditoría de accesibilidad/navegadores si lo requiere el personal.
4. Evaluar MFA para Administración, cola de correo y cuarentena de archivos según exposición, necesidades y costo. Son mejoras posteriores, no implementaciones que este informe afirme tener.

La documentación operativa y de usuario se mantiene directamente en Markdown. El estado verificable del repositorio y la configuración efectiva del despliegue deben revisarse por separado en cada release.
