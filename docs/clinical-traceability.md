# Revisiones clínicas y adendas

El resumen clínico y la consulta guardan snapshots completos dentro del dominio clínico. La auditoría general registra acción e identificadores, sin copiar valores clínicos, motivo de corrección ni contenido de adenda a logs administrativos.

## Resumen del paciente

`PATCH /api/patients/<patient>/` conserva `expected_version`. Cuando cambia efectivamente `clinical_record`, producción exige `clinical_change_reason` no vacío, hasta 1000 caracteres. Cambiar teléfono/dirección u otros datos administrativos no exige motivo clínico.

La creación conserva la revisión inicial. Antes del primer cambio de un registro previo sin historial se conserva su estado observado, marcado `Estado previo / sistema`; no se inventa autor o fecha histórica. Cada cambio efectivo guarda la revisión resultante con autor y versión en la misma transacción. Las versiones pueden tener saltos si hubo cambios administrativos.

`GET /api/patients/<patient>/clinical-record/revisions/` requiere `patients.view`, está paginado y devuelve autor, fecha, motivo, `resource_version` y snapshot. Desarrollo conserva compatibilidad temporal con ediciones sin motivo; producción aplica el requisito.

## Consulta

Las consultas en progreso conservan revisiones al crear, editar y cerrar/cancelar. `GET /api/patients/<patient>/consultations/<consultation>/revisions/` requiere `consultations.view`. Odontogramas y tratamientos mantienen sus propios modelos de historial; no se fusionan con una revisión narrativa.

La consulta completada no se reabre ni se sobrescribe. `GET/POST .../amendments/` permite leer con `consultations.view` y registrar con `consultations.edit`. El POST requiere `reason` (1–1000 caracteres) y `content` (1–10000); el backend asigna autor y fecha. Sólo admite consultas completadas del paciente indicado y conserva su versión/contenido original.

La interfaz permite leer páginas de revisiones/adendas, registrar una adenda y revisar su persistencia. El PDF conserva el texto original y añade las adendas con autor, fecha, motivo y contenido.

## Inmutabilidad y operación

No hay PATCH/DELETE de revisiones ni adendas. Los managers/modelos rechazan modificación y borrado. PostgreSQL incorpora triggers `BEFORE UPDATE OR DELETE` sobre revisiones, adendas, auditoría, correcciones de llegada y reprogramaciones.

El usuario de runtime no debe ser dueño de tablas, tener DDL, `TRUNCATE`, ser superusuario ni pertenecer al rol propietario. Los triggers no protegen contra un administrador de base que pueda desactivarlos: separa cuentas de aplicación, migración y respaldo. Retención/exportación legal se definen operativamente; no hay purga clínica automática.

Migraciones nuevas: `patients.0025–0026`, `appointments.0008–0010` y `clinics.0003`. La salida acordada es una base nueva. Las migraciones anteriores `patients.0019–0024` convierten/eliminan campos; no se presenta esta cadena como una actualización sin pérdida para una base con información clínica real.

## Verificación

```text
python manage.py test apps.patients.test_production apps.appointments.test_production --settings=config.settings.test --noinput
python manage.py test apps.patients.test_production --settings=config.settings.postgres_test --noinput
```

El smoke compara original y adenda tras recargar y dentro del PDF. El ensayo de restauración también comprueba que PostgreSQL conserva el trigger de historial.
