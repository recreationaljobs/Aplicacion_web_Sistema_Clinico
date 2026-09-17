# HU-52 — Alta rápida de paciente desde agenda

**Estado:** Implementada y validada el 1 de septiembre de 2026.

## Flujo implementado

Cuando una búsqueda remota de HU-54 finaliza sin resultados, Nueva cita ofrece
`Crear paciente` sólo a quien posee `patients.create`. El formulario se abre
dentro de la agenda y crea el mismo modelo `Patient` mediante
`POST /api/patients/?mode=quick`; no existe una entidad provisional ni un
endpoint de dominio duplicado.

El contrato técnico actual mantiene obligatorios nombres, primer apellido y
fecha de nacimiento. Además exige teléfono o el par de identificación de
HU-53 (`CEDULA`, `PASAPORTE` u `OTRO`). No inventa lugar de nacimiento, género
ni fecha. El expediente clínico vacío se crea por el flujo normal y
`profile_complete` se calcula, no se persiste como una segunda bandera.

Antes del alta se reutiliza exactamente el duplicate-check de HU-13. Ante una
coincidencia puede elegirse un paciente activo existente, volver o crear de
todos modos; un paciente inactivo se identifica y no puede seleccionarse. La
identificación exacta sigue siendo bloqueante.

## Integración con la cita

La respuesta usa el contrato mínimo `PatientOption`: ID, código, nombre,
teléfono, fecha de nacimiento y `profile_complete`. El paciente creado o
elegido se inserta y selecciona localmente, sin descargar todos los pacientes
ni repetir la búsqueda global. Se conservan fecha, hora, servicio, duración y
motivo, y no se crea una cita automáticamente. Un perfil incompleto se indica
de forma discreta y puede programarse; las validaciones de inicio de atención
de HU-53 permanecen intactas.

## Evidencia

- Backend: alta con teléfono; alta con cada tipo de identificación; rechazo
  sin ambos; fecha requerida por el modelo actual; respuesta mínima;
  `ClinicalRecord` real; perfil calculado; permiso; bloqueo exacto y mismo
  número con tipo diferente permitido.
- Frontend: campos mínimos y tipos HU-53; warning HU-13; paciente activo e
  inactivo; volver/continuar; errores y doble envío; apertura por búsqueda
  vacía; visibilidad por permiso; selección inmediata; perfil incompleto;
  preservación del formulario y ausencia de creación automática de cita.
- PostgreSQL real: altas rápidas, bloqueo exacto y constraint de solapamiento
  de citas comprobados dentro de una transacción revertida.

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

### Actualización del buscador — 16 de septiembre de 2026

El buscador de la cita muestra resultados directamente bajo un solo campo. Cuando no encuentra coincidencias sigue ofreciendo Crear paciente únicamente con permiso; el paciente creado o elegido por duplicate-check aparece en el resumen seleccionado. Cambiar paciente conserva los demás datos del formulario. Las 68 pruebas de los cinco componentes de agenda, buscador, alta rápida y seguimiento pasan; el flujo se verifica además con Chromium en escritorio y móvil. Evidencia y comandos en [HU-18](HU-18-appointment-scheduling.md#selección-directa-de-paciente--16-de-septiembre-de-2026).

## Fuera de alcance

No se implementaron HU-17, reactivación, pacientes provisionales, cambios de
disponibilidad o solapamiento, ni creación automática de la cita.
