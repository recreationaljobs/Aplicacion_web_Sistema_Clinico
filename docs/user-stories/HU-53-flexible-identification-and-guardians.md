# HU-53 — Identificación flexible y responsables de menores

**Estado:** Implementada y validada el 1 de septiembre de 2026.

## Diseño final

Se mantiene una sola entidad `Patient`. La identidad administrativa usa un par opcional `identification_type`/`identification_number`, con tipos `CEDULA`, `PASAPORTE` y `OTRO`. Si existe número debe existir tipo; ambos pueden ser nulos cuando la identificación todavía no está disponible.

La unicidad se aplica en base de datos sobre el tipo y una expresión normalizada del número, únicamente cuando ambos existen. Las entradas de `CEDULA` se guardan con el formato `281-090403-1006K`: tres dígitos, seis dígitos y cuatro dígitos más una letra mayúscula, separados por guiones. Se aceptan entradas completas compactas o con espacios y guiones; se rechazan estructuras incompletas. La normalización central elimina espacios exteriores y convierte a mayúsculas; la clave de comparación de `CEDULA` ignora espacios y guiones, conservando la equivalencia de HU-13. Pasaportes y otros documentos conservan sus caracteres internos.

Se añadieron `guardian_name`, `guardian_relationship` y `guardian_phone`, todos opcionales. No se creó un modelo de tutor ni un modelo provisional de paciente.

## Migraciones y datos

- `0014_expand_flexible_identification`: agrega la estructura nullable, copia cada cédula histórica exactamente como `CEDULA`, valida el conteo copiado y activa las restricciones condicionales.
- `0015_contract_legacy_national_id`: retira `national_id` y `national_id_key` después de actualizar sus consumidores. La compatibilidad legada queda limitada a entrada API temporal; no existe una segunda fuente persistida de verdad.
- La reversión sólo reconstruye filas representables como cédula y falla de forma segura, sin exponer valores, para datos sin identificación o con otro tipo.

La migración real se ejecutó sobre PostgreSQL de desarrollo `clinica_dental`, sin recrear la base:

| Medición | Antes | Después |
| --- | ---: | ---: |
| Pacientes | 0 | 0 |
| Identificaciones existentes/migradas | 0 | 0 |
| Duplicados normalizados | 0 | 0 |
| Hash de identificaciones | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

Los campos de tutor quedaron nulos en históricos. La inspección posterior confirmó la ausencia de las columnas legadas y la presencia del `CHECK` de par válido y del índice único funcional/condicional.

## Perfil administrativo

`profile_complete` y `missing_profile_fields` son derivados, no persistidos. Para un adulto se requieren `first_name`, `last_name`, `date_of_birth` y `phone`. Un menor de 18 años —calculado en la fecha local de la clínica y respetando el cumpleaños exacto— requiere además los tres campos del responsable. La identificación no es requisito de perfil.

El alta y la agenda aceptan perfiles incompletos. Iniciar atención, crear una consulta manual nueva o cerrar una consulta exige un perfil completo mediante una única validación de dominio. El rechazo estable usa `patient_profile_incomplete`, lista `missing_fields`, no muta la cita ni crea una consulta y se registra sin copiar valores sensibles.

## Contratos y experiencia

- `PatientDetail` expone los campos canónicos de identificación y tutor, `profile_complete` y `missing_profile_fields`.
- `PatientSummary` y `PatientOption` sólo añaden `profile_complete`; no exponen documento ni tutor.
- La búsqueda sigue cubriendo nombre, código, teléfono e identificación y las opciones continúan limitadas a pacientes activos.
- El formulario permite escoger tipo, omitir identificación y registrar responsable. Al detectar un menor destaca la sección sin borrar datos cuando cambia la fecha.
- El expediente distingue claramente el perfil administrativo incompleto y enumera faltantes.
- La agenda muestra una señal discreta de perfil incompleto, pero mantiene el paciente seleccionable.
- El inicio de atención presenta los faltantes y sólo ofrece editar el paciente cuando el usuario posee ambos permisos requeridos.

## Auditoría y privacidad

Los cambios de identificación y responsable reutilizan la auditoría existente. El evento conserva paciente, actor, acción y nombres de campos modificados, sin almacenar el número de documento ni los datos del tutor en el resumen estructurado. Los contratos mínimos de agenda no fueron ampliados con esos valores.

## Evidencia de aceptación

- Pruebas unitarias y de API para tipos, opcionalidad, normalización, duplicados, tutor, mayoría de edad, perfil, agenda, atención, contratos, búsqueda y compatibilidad de entrada legada.
- Pruebas de migración para backfill, conteo, ausencia de invención, contracción segura y múltiples identificaciones nulas.
- Restricciones verificadas en PostgreSQL real dentro de una transacción revertida: múltiples nulos, duplicado normalizado rechazado, mismo número con otro tipo permitido y número sin tipo rechazado. Otra verificación transaccional confirmó que `start_attendance` rechaza el perfil incompleto sin cambiar la cita ni crear una consulta. Ninguna prueba dejó datos residuales.
- Suites completas de backend y frontend, comprobaciones Django, lint y build ejecutados como cierre de la historia.

El runner aislado de pruebas PostgreSQL no pudo crear una base temporal porque el rol local no posee `CREATEDB`. La garantía equivalente sí se verificó directamente contra PostgreSQL con rollback total, y las pruebas automatizadas específicas permanecen disponibles para un entorno con permisos de creación de base.

## Historias relacionadas

- HU-13 reutiliza esta protección exacta y añade advertencias no bloqueantes por teléfono o nombre y nacimiento.
- HU-17 no cambia: paciente inactivo y perfil incompleto siguen siendo conceptos separados.
- HU-52 reutiliza la identificación flexible y el cálculo de perfil en el alta rápida desde agenda.

## Ajuste del formato de cédula del 16 de septiembre de 2026

- El expediente y el alta rápida convierten entradas completas como `2810904031006k` a `281-090403-1006K`; muestran el ejemplo y validan la estructura del campo. La entrada incompleta se conserva durante la edición y no se trunca información inválida.
- La API normaliza y valida nuevas cédulas y cambios de identificación. La validación es de estructura, sin verificar emisión ni correspondencia con fecha de nacimiento.
- La identificación continúa opcional; pasaportes y otros documentos conservan formato libre. No se modificó el esquema ni se reescribieron identificaciones históricas en la base.
- Verificación: 88 pruebas backend de API, perfiles y duplicados; 67 pruebas frontend de App y alta rápida, todas correctas. Lint, build, Django check, consistencia de migraciones y diff check correctos.
- Comandos: `python manage.py test apps.patients.tests apps.patients.test_hu53 apps.patients.test_hu13_duplicates --settings=config.settings.test --noinput`, `npm test -- src/App.test.jsx src/pages/Appointments/PatientQuickCreateDialog.test.jsx`, `npm run lint`, `npm run build`, `python manage.py makemigrations --check --dry-run` y `git diff --check`.
