# HU-44 — Iniciar atención directamente desde una cita

**Estado:** Implementada y validada el 31 de agosto de 2026.

**Actualización 25/09/2026:** aislamiento por odontólogo y ventana temporal implementados sin migraciones nuevas. El [contrato, análisis y verificación actuales](../patient-assignment-access.md) detallan el cambio y los fallos previos de la suite general. La evidencia histórica que sigue corresponde al cierre inicial.

**Seguimiento de CI:** la suite completa PostgreSQL también valida las carreras de cierre y tratamiento con el reloj de la fixture situado dentro de la cita. Se conserva el control temporal real; véase la [evidencia de recuperación de las suites](HU-01-secure-session-regressions.md).

## Criterio de aceptación

Desde una cita programada o confirmada, un profesional autorizado puede iniciar
la atención una sola vez, abrir directamente la consulta clínica y conservar el
odontograma inicial y las alertas longitudinales del paciente.

## Diseño implementado

`Appointment.consultation` es una relación `OneToOneField` nullable hacia
`Consultation`, con `PROTECT`. Para odontólogos, las nuevas consultas requieren
una cita propia y su intervalo horario; las consultas manuales históricas se
conservan. El flujo administrativo mantiene su comportamiento anterior.
No se infirieron enlaces históricos.

El servicio `start_attendance` ejecuta una transacción atómica, bloquea solamente
la fila de la cita con `select_for_update(of=("self",))`, valida permisos y estado,
y crea una `Consultation` en `EN_PROGRESO`. Precarga paciente, profesional, hora
real, motivo y nombre del servicio; además reutiliza la creación existente del
odontograma inicial. Finalmente enlaza la consulta, cambia la cita a
`EN_ATENCION` y registra `attendance_started_at`.

La repetición secuencial o concurrente devuelve la consulta ya asociada. Dos POST
concurrentes reales en PostgreSQL producen respuestas 201/200 con el mismo ID,
una sola consulta y un solo odontograma.

## Contrato y protecciones

- Acción: `POST /api/appointments/{id}/start-attendance/`.
- Requiere `consultations.create` y alcance sobre la cita.
- Estados de origen: `PROGRAMADA`, `CONFIRMADA` o `PRESENTE`, dentro del intervalo programado.
- Error de dominio estable: `appointment_cannot_start_attendance` con HTTP 409.
- El PATCH genérico no puede entrar a `EN_ATENCION`, completar una cita desde el
  flujo administrativo ni cancelar/marcar inasistencia tras iniciar consulta.
- La auditoría registra `APPOINTMENT_START_ATTENDANCE`, actor, cita, consulta y
  paciente.

## Migración segura y evidencia PostgreSQL

La migración `0005` expande con campos nullable y conserva los históricos sin
backfill. `0006` valida duplicados y activa la unicidad uno-a-uno.

Sobre `clinica_dental`, antes → después:

- Appointment: 5 → 5;
- Consultation: 2 → 2;
- OdontogramVersion: 5 → 5;
- citas históricas enlazadas: 0;
- citas históricas con inicio real: 0.

Las huellas agregadas de los datos preexistentes permanecieron iguales:

- Appointment: `cb589ca4af78edf3e1ecb3e725a8c509`;
- Consultation: `d259058961f0a15af30e0d48310da21b`;
- OdontogramVersion: `68d55d8744d18caac47e34b036652b5f`.

## Evidencia automatizada

- Estados de origen y estados rechazados.
- Relación nullable y uno-a-uno, conservación de IDs y conteos.
- Precarga clínica, hora real y odontograma inicial.
- Idempotencia secuencial y concurrencia PostgreSQL real.
- Rollback total ante fallo del odontograma.
- Permisos, alcance, auditoría y consulta manual sin cita.
- Flujo React agenda → iniciar → consulta → alertas HU-28.

## Estado de enablers

- HU-45: parcial; falta la sincronización de cierre de HU-46.
- TEC-06: parcial; sólo existe `start_attendance`.
- TEC-07: parcial; se aplicó expandir/verificar/activar para este bloque.

No se implementaron cierre o cancelación clínica, HU-46 ni `TreatmentItem`.
