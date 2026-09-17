# HU-13 — Detección de pacientes duplicados

**Jira:** SCRUM-20

**Estado:** Implementada y validada el 1 de septiembre de 2026.

## Reglas y contrato

- La identificación exacta continúa protegida por el par normalizado
  `identification_type + identification_number` y por la restricción de
  PostgreSQL de HU-53.
- Un teléfono igual después de eliminar separadores comunes produce
  `matched_on: phone`.
- Primer nombre y primer apellido iguales, sin diferencias de mayúsculas ni
  espacios, junto con la misma fecha de nacimiento, producen
  `matched_on: name_and_date_of_birth`.
- Las coincidencias son advertencias no bloqueantes: pueden revisarse, volver
  al formulario o confirmarse con `Crear de todos modos`.
- En edición se excluye el paciente actual. Se incluyen pacientes activos e
  inactivos, se consolidan las reglas por paciente y se devuelven como máximo
  diez registros en orden estable.

El servicio reutilizable `find_possible_patient_duplicates` ejecuta el filtro
en SQL y selecciona sólo los campos administrativos mínimos. El endpoint
`POST /api/patients/duplicate-check/` devuelve `id`, código, nombre completo,
fecha de nacimiento, teléfono, estado y razones de coincidencia; no carga ni
expone expediente, identificación, tutor, alertas, consultas, documentos u
odontograma.

## Permisos, privacidad y auditoría

- Una comprobación previa a creación requiere `patients.create`; con
  `exclude_patient_id`, requiere `patients.edit`.
- El backend conserva la autorización final tanto del create como del update.
- La auditoría registra `PATIENT_DUPLICATE_CHECK` y los nombres de los campos
  consultados, no sus valores con PII.

## Evidencia

- Backend: normalización de teléfono, nombre y espacios; diferencias reales;
  coincidencia doble consolidada; inactivos; exclusión propia; límite diez;
  consulta acotada sin `ClinicalRecord`; contrato mínimo; autenticación,
  permisos y auditoría.
- Frontend: cero, una y múltiples coincidencias; razones; inactivo; revisar,
  volver y continuar; error del check; create/update y protección ante doble
  envío.
- PostgreSQL real: coincidencia por ambas reglas y bloqueo de identificación
  exacta comprobados dentro de una transacción revertida.

## Verificación

```powershell
cd src/backend
.venv\Scripts\python manage.py test --settings=config.settings.test --noinput
.venv\Scripts\python manage.py check
.venv\Scripts\python manage.py migrate --check
.venv\Scripts\python manage.py makemigrations --check --dry-run

cd ../frontend
npm test -- --reporter=dot
npm run lint
npm run build
```

## Fuera de alcance

No se implementaron coincidencias difusas, trigramas, Levenshtein, IA,
fusión, reactivación ni deduplicación automática.

## Formato de cédula validado el 16 de septiembre de 2026

Las entradas de cédula se guardan con guiones y letra mayúscula. Se mantienen las equivalencias de la clave normalizada: una entrada compacta o con espacios no permite registrar otra vez la misma cédula; reformatear la identificación del propio paciente continúa permitido. Regresiones correctas dentro de las 88 pruebas de API/perfil/duplicados de este ajuste; contrato de formato documentado en HU-53.
