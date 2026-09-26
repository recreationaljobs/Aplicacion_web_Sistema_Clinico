# HU-19 — Agenda diaria por profesional

**Estado:** Implementada y validada el 1 de septiembre de 2026.

**Actualización 25/09/2026:** el odontólogo siempre recibe sólo sus citas y pacientes asignados, incluso con `view_all`. Se reutiliza Pacientes como “Mis pacientes”, con próxima cita y última consulta propias. Véase el [contrato y evidencia actualizados](../patient-assignment-access.md); las cifras posteriores pertenecen al cierre inicial.

## Alcance implementado

La vista diaria de agenda mantiene una columna por odontólogo y ahora identifica
de forma explícita tanto al profesional como su carga del día. Las columnas se
ordenan por nombre y muestran `1 cita` o `N citas`; no se introdujeron conceptos
de consultorio, sala o sillón.

Se conserva el contrato existente `GET /api/appointments/?date=AAAA-MM-DD` y su
alcance por permisos: recepción y perfiles no odontólogos con `appointments.view_all`
pueden ver la agenda general, mientras cualquier odontólogo sólo recibe sus citas.
Las vistas semanal y mensual no cambian.

## Interfaces afectadas

- `AppointmentTimeline`: agrupación diaria, orden estable e indicador de carga.
- `AppointmentsPage`: continúa solicitando una única fecha para la vista diaria.

## Evidencia de aceptación

- Pruebas de interfaz verifican dos profesionales con cargas distintas, nombres
  visibles, pluralización y petición diaria sin llamadas adicionales.
- Suite enfocada de agenda: 51/51 pruebas correctas.
- Suite frontend completa: 274/274 pruebas correctas.
- Suite backend completa: 359 pruebas correctas, 32 omitidas por condición de
  entorno; las 20 pruebas específicas PostgreSQL se ejecutaron aparte y pasaron.
- `npm run lint`, `npm run build` y los chequeos Django forman parte del cierre.

## Fuera de alcance

Asignación de espacios físicos, refactor de agenda, recordatorios, recurrencia y
cualquier historia distinta de HU-19, HU-23 y HU-58.
