# Despliegue y operación

Actualizado: 17 de septiembre de 2026. Esta guía prepara una **instalación nueva con base vacía**. No importa usuarios, contraseñas, archivos ni datos de la demo. El despliegue lo realiza el propietario del proyecto.

## Arquitectura

Publica React y la API bajo un solo origen HTTPS, por ejemplo `https://clinic.example.com`. Sirve `dist/` y envía `/api/`, `/health/` y `/static/` al backend privado. Django usa `config.settings.production`, Gunicorn, PostgreSQL 18, Redis, SMTP y almacenamiento S3-compatible. WhiteNoise sirve static; los archivos clínicos se conservan fuera del contenedor.

La [plantilla Nginx](../deployment/nginx.conf.template) muestra ese encaminamiento. Sustituye dominio, certificados y rutas; no es una configuración aprovisionada. El proxy directo debe sobrescribir `X-Real-IP`, `X-Forwarded-For` y `X-Forwarded-Proto`. Declara su IP exacta tanto en `LOGIN_TRUSTED_PROXY_IPS` como en `FORWARDED_ALLOW_IPS`. Restringe el acceso a Gunicorn desde la red; confiar en una cabecera no impide que alguien llegue directamente al puerto. Si usas un balanceador previo, configura primero sus IP de confianza para obtener la IP real.

Las cabeceras se establecen mediante [`proxy_set_header`](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header). Los logs del proxy también deben evitar identificadores de paciente, query strings, cookies y tokens.

## Infraestructura y secretos

1. Crea una base PostgreSQL vacía, Redis dedicado y buckets/prefijos separados para media general y documentos privados. Activa bloqueo de acceso público, cifrado y versionado de objetos. No permitas listar ni acceder anónimamente al bucket clínico.
2. Configura SMTP con STARTTLS en el puerto admitido por el proveedor y remitente autorizado. La aplicación usa `EMAIL_USE_TLS=True`, timeout de 10 segundos y respuesta genérica ante fallos de recuperación; el fallo se registra sin credenciales.
3. Crea una clave Django aleatoria y exclusiva de al menos 50 caracteres mediante tu gestor de secretos. No reutilices claves de desarrollo ni de CI. Las contraseñas de PostgreSQL, SMTP y credenciales S3 también deben ser nuevas.
4. Completa [`src/backend/.env.example`](../src/backend/.env.example) en el gestor de secretos de tu plataforma. Django no carga esta plantilla en producción. Si utilizas un archivo local para Docker, mantenlo fuera del repositorio y restringe su acceso.

Usa hosts explícitos y orígenes HTTPS sin rutas: `ALLOWED_HOSTS=clinic.example.com`, `FRONTEND_URL=https://clinic.example.com`, `CSRF_TRUSTED_ORIGINS=https://clinic.example.com`. Bajo un solo origen deja `CORS_ALLOWED_ORIGINS` vacío. Configura `HEALTHCHECK_HOST` con uno de los hosts permitidos. Django rechaza claves débiles, comodines y orígenes inseguros; `DEBUG=False`, cookies Secure/HttpOnly y verificación de versión se activan en producción.

Las credenciales AWS se obtienen mediante la cadena estándar de boto3: identidad de la plataforma preferida, o `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` en el gestor de secretos. La plantilla no contiene ninguna credencial válida. Para un proveedor compatible, configura `AWS_S3_ENDPOINT_URL` HTTPS y confirma sus permisos y opciones de cifrado.

## Roles PostgreSQL

Separa las credenciales de migraciones de las utilizadas por Gunicorn:

- **Migraciones:** rol propietario de la base y del esquema de esta aplicación, limitado al job de release. Debe poder instalar `btree_gist`, crear constraints, tablas, funciones y triggers. El proveedor puede requerir que aprovisiones antes la extensión.
- **Runtime:** `clinic_runtime`, LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE y sin pertenencia al rol propietario. No posee tablas/esquema, no modifica triggers ni recibe `TRUNCATE`.

Tras aplicar migraciones, ejecuta [`deployment/postgres-runtime-grants.sql`](../deployment/postgres-runtime-grants.sql) conectado a la base como propietario. Concede `CONNECT` a `clinic_runtime` sobre esa base y configura su contraseña de forma segura. Adapta el nombre del rol si lo exige tu proveedor. Repite los grants después de cada migración que cree tablas o secuencias; los nuevos objetos no adquieren permisos automáticamente.

El script permite SELECT/INSERT/UPDATE/DELETE en tablas operativas y SELECT/INSERT en revisiones, adendas, auditoría y eventos históricos de agenda. Revoca acceso al esquema a PUBLIC: úsalo exclusivamente en una base dedicada, no sobre un esquema compartido con otras aplicaciones. Revisa otras membresías o grants heredados que pueda haber creado tu proveedor. Las pruebas sintéticas verificaron 18 operaciones prohibidas con un rol sin privilegios.

Los triggers rechazan UPDATE/DELETE del historial, incluso con SQL directo. La separación de roles evita que la aplicación pueda desactivarlos o usar TRUNCATE. Un propietario o superusuario conserva capacidades administrativas; por eso sus credenciales no deben estar en Gunicorn. Véase [privilegios PostgreSQL](https://www.postgresql.org/docs/18/ddl-priv.html).

## Construcción

Desde la raíz:

```powershell
docker build --tag dentalclinic-backend:release src/backend
```

La imagen fija Python 3.13.15 slim-bookworm por digest, instala `requirements.lock`, ejecuta `collectstatic` y termina como usuario `10001:10001`. `.dockerignore` excluye secretos, SQLite, media, entornos y backups. `requirements.txt` enumera dependencias directas y el lock fija su cierre completo.

Frontend, con Node.js 22:

```powershell
cd src/frontend
npm.cmd ci
npm.cmd test
npm.cmd run lint
npm.cmd audit
$env:VITE_API_URL = "/"
npm.cmd run build
```

En Bash usa `VITE_API_URL=/ npm run build`. Publica el contenido de `dist/`. La variable se incorpora al build y no se cambia al arrancar Django. El fallback al puerto 8000 existe únicamente para desarrollo. No publiques las plantillas `*.demo.*` como configuración productiva.

## Primera instalación y arranque

Los siguientes comandos usan archivos de entorno **externos al repositorio**. `migration.env` contiene DATABASE_URL del propietario; `production.env`, del runtime. El resto de las variables debe ser coherente en ambos archivos. En plataformas administradas usa los jobs y secretos equivalentes.

```powershell
docker run --rm --env-file migration.env dentalclinic-backend:release python manage.py migrate --plan
docker run --rm --env-file migration.env dentalclinic-backend:release python manage.py migrate --noinput
```

Aplica los grants del runtime desde PostgreSQL. Después:

```powershell
docker run --rm --env-file production.env dentalclinic-backend:release python manage.py migrate --check
docker run --rm --env-file production.env dentalclinic-backend:release python manage.py check --deploy
docker run --rm --env-file production.env dentalclinic-backend:release python manage.py check_services --storage-write
docker run --rm -it --env-file production.env dentalclinic-backend:release python manage.py createsuperuser
docker run --rm --env-file production.env -p 127.0.0.1:8000:8000 dentalclinic-backend:release
```

Ejecuta migraciones una sola vez por release, antes de iniciar/ampliar las réplicas. No se ejecutan automáticamente por cada contenedor. `createsuperuser` crea la primera cuenta administrativa con contraseña elegida, no una cuenta de demo. Configura clínica, zona horaria, horarios, servicios, permisos y cuentas individuales desde la aplicación. No ejecutes `seed_demo`: está bloqueado en producción.

El proceso principal es `gunicorn config.wsgi:application --config gunicorn.conf.py`. Ajusta `WEB_CONCURRENCY`, timeouts y límites con métricas de tu servidor. No uses `runserver` ni `config.settings.release_smoke` en producción.

Las migraciones antiguas `patients/0019–0024` incluyen conversiones/eliminaciones de campos y traslado de historia clínica. Esta preparación **no certifica una actualización sin pérdida de una base con expedientes reales**. Si alguna vez necesitas importarla, detén ese proceso y diseña una migración específica con backup y reconciliación de cada campo.

## Comprobaciones de servicio

```bash
curl --fail https://clinic.example.com/health/live/
curl --fail https://clinic.example.com/health/ready/
python manage.py check_services --storage-write
```

`live` verifica que Django responde. `ready` comprueba PostgreSQL con SELECT 1 y Redis; responde un 503 constante si alguna dependencia falla. Las conexiones PostgreSQL/Redis tienen timeout de 3 segundos; no equivalen a un límite global de duración de cualquier consulta SQL. Las migraciones se verifican mediante `migrate --check` en el release job.

`check_services` comprueba base, cache, ambos almacenamientos y conexión/autenticación SMTP, **sin enviar correo**. `--storage-write` añade escritura, lectura y eliminación de objetos sintéticos con nombres únicos. Un chequeo de conexión no demuestra que un mensaje llegue al buzón: prueba manualmente recuperación con una cuenta sintética propia en staging.

## Operación y mantenimiento

Los logs JSON de la aplicación incluyen request ID, plantilla de ruta, status y duración; excluyen bodies, query strings, tokens, cookies y contenido clínico. Configura alertas sobre readiness 503, 5xx, latencia, capacidad PostgreSQL/Redis, errores SMTP/S3 y antigüedad del último backup. Verifica quién recibe cada alerta.

Programa como jobs de plataforma, por ejemplo diariamente:

```bash
python manage.py flushexpiredtokens
python manage.py retry_file_cleanup
```

Confirma el resultado y alerta si fallan. Los jobs no se ejecutan por tener Gunicorn encendido. Ajusta la frecuencia según el volumen; no se añadió Celery ni un servicio de colas.

## Backups y recuperación

Define con el responsable de la clínica cuánto tiempo de datos puede perderse (RPO), cuánto puede tardar la recuperación (RTO) y la retención de copias. Los valores deben corresponder al proveedor contratado y medirse; no se afirma un SLA ni rendimiento que no se haya probado.

1. Mantén backups cifrados y separados del servidor, de PostgreSQL y de **todos** los objetos/prefijos de media. Conserva versiones anteriores de los objetos. Un dump no contiene archivos S3.
2. Para una copia coordinada, pausa escrituras y jobs, realiza `pg_dump --format=custom --no-owner --no-acl` con cliente PostgreSQL 18 y guarda el manifiesto/versiones de objetos correspondientes. Para recuperar a un instante sin pausa, contrata/configura PITR y una estrategia coherente de versionado de objetos.
3. Restaura siempre primero en una **base nueva**, con `pg_restore --exit-on-error --no-owner --no-acl`, usando el rol de migraciones. No apuntes un ensayo al servidor productivo activo.
4. Restaura objetos y configura rutas/credenciales. Reaplica grants, comprueba migraciones, recuentos, integridad de archivos, triggers, documentos autenticados y smoke funcional. Mide el tiempo real y conserva evidencia.
5. Solo entonces cambia el tráfico. Ante fallo de release, detén escrituras antes de volver a un artefacto/backup compatible. No inviertas migraciones destructivas ni recortes auditoría para “arreglar” el despliegue.

El ensayo local restauró 32 tablas, 405 filas y un archivo privado, comparando todas las filas y SHA-256 del archivo; conservó el trigger de historial. Es evidencia del mecanismo local, no de la restauración del proveedor S3 ni del tamaño de producción.

## Lista de lanzamiento en tu entorno

- [ ] Base nueva; cero cuentas/archivos de demo y secretos nuevos.
- [ ] PostgreSQL/Redis accesibles solo desde redes autorizadas, con TLS cuando salen del host/red privada.
- [ ] Runtime sin ownership/DDL/TRUNCATE; grants de historial y triggers presentes.
- [ ] Build con Node 22 y `VITE_API_URL=/`; rutas profundas de React recargan correctamente.
- [ ] Dominio HTTPS, certificados y proxy exacto; Gunicorn inaccesible directamente desde Internet.
- [ ] `check --deploy`, `migrate --check`, `check_services --storage-write`, live y ready correctos con credenciales reales.
- [ ] Cookies refresh Secure/HttpOnly y CSRF probado desde el dominio definitivo; logout invalida la sesión.
- [ ] Buckets privados, sin acceso anónimo; archivos sobreviven a reemplazar el contenedor.
- [ ] Clínica, moneda, zona horaria, horarios, permisos y cuentas individuales configurados.
- [ ] Smoke con datos ficticios: los tres roles, versiones, motivo clínico, adenda/PDF, citas, documentos y logout.
- [ ] Recuperación por correo comprobada con una cuenta sintética propia.
- [ ] Backup PostgreSQL + objetos restaurado en entorno aislado; tiempos y responsables registrados.
- [ ] Jobs y alertas configurados y comprobados; capacidad medida con la carga prevista.

Consulta [la auditoría y evidencia del repositorio](production-readiness.md) y [la guía de usuario](guia-usuario/README.md). Esta lista corresponde a la infraestructura que desplegarás y no se marca como aprobada por los resultados locales.
