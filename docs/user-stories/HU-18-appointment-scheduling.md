# HU-18 — Programación y gestión de citas

> Los ensayos de navegador anteriores se conservan como evidencia histórica, no como comandos ejecutables actuales. Las suites vigentes y el smoke reproducible están en [preparación para producción](../production-readiness.md).

**Jira:** SCRUM-26

**Historia:** Como recepcionista, quiero programar una cita, para organizar la agenda de atención.

**Estado:** Implementada y validada el 9 de agosto de 2026.

## Criterio de aceptación

> Dado que selecciono fecha, hora, paciente y odontólogo disponibles, cuando guardo, entonces la cita queda asignada en el calendario.

## Alcance implementado

- La agenda ofrece vistas diaria, semanal y mensual. La vista diaria organiza por hora y odontólogo; semana muestra siete columnas y mes resume la ocupación por fecha, con acceso directo al detalle diario.
- La creación, edición y consulta de una cita se presentan en modales centrados, con scroll interno y adaptación de pantalla completa en móvil.
- Semana y mes se consultan como rangos inclusivos en una sola petición y mantienen desplazamiento horizontal accesible en pantallas estrechas.
- El dashboard consulta la fecha local actual, muestra el total y el resumen de las citas visibles del día, y enlaza con la agenda completa.
- Recepción y administración pueden programar citas indicando paciente, odontólogo, fecha, hora, duración, motivo y notas.
- Las duraciones admiten bloques de 15 minutos entre 15 y 240 minutos.
- El selector profesional devuelve únicamente odontólogos activos disponibles para el intervalo elegido.
- El backend evita solapamientos tanto del odontólogo como del paciente; permite citas adyacentes y no considera las canceladas como bloqueos.
- El ciclo incluye programar, confirmar, completar, cancelar y marcar inasistencia. Las citas completadas, canceladas o con inasistencia son finales y permanecen visibles para auditoría.
- La cancelación permite registrar un motivo opcional y no existe eliminación por API.
- Los permisos `appointments.view`, `appointments.create` y `appointments.edit` controlan consulta, creación y modificación respectivamente. `appointments.view_all` amplía el alcance a todo el equipo.
- Odontología ve por defecto únicamente sus citas en dashboard, agenda, detalle y disponibilidad. Recepción conserva acceso a todo el equipo y Administración mantiene acceso completo implícito.
- Sin `appointments.view_all`, la API impide consultar, crear, editar o reasignar citas de otro odontólogo; el alcance se protege en el backend y no depende de filtros visuales.

## Interfaces afectadas

- `GET|POST /api/appointments/`
- `GET|PATCH /api/appointments/<id>/`
- `GET /api/appointments/dentists/availability/`
- `/citas`

## Evidencia de aceptación

- Las pruebas backend cubren autorización, alcance por odontólogo, acceso directo, referencias activas, filtros, disponibilidad, solapamientos, citas adyacentes y transiciones.
- Las pruebas frontend cubren agenda, navegación diaria/semanal/mensual, apertura de un día desde calendarios agregados, permisos, creación, errores conservando el formulario y confirmación.
- La interfaz ofrece estados de carga, error y vacío, foco visible, paneles accesibles y diseño responsive sin dependencias externas de calendario.
- Evidencia visual: [agenda diaria de escritorio](assets/HU-18-desktop.png), [agenda diaria móvil](assets/HU-18-mobile.png), [vista semanal](assets/HU-18-week.png), [vista mensual](assets/HU-18-month.png) y [vista semanal móvil](assets/HU-18-week-mobile.png).

## Verificación

```powershell
cd src/backend
.\.venv\Scripts\python.exe manage.py test

cd ..\frontend
npm test
npm run lint
npm run build
```

### Corrección de horario de clínica — 16 de septiembre de 2026

- Un día cerrado bloquea creación y disponibilidad también antes del primer guardado de horarios. Regresiones reproducidas inicialmente con HTTP 201/200 indebidos; después de la corrección ambos flujos devuelven HTTP 400.
- Las citas existentes de un día cerrado pueden cancelarse para resolver el conflicto. El formulario de horarios muestra las citas afectadas y orienta a reprogramarlas o cancelarlas, sin descartarlas automáticamente.
- Guardado/recarga de horas y comparación HH:MM/HH:MM:SS verificados; evidencia y limitación de la suite PostgreSQL aislada en [Configuración operativa](../clinic-configuration.md#corrección-de-horarios-del-16-de-septiembre-de-2026).

### Avisos visibles en el formulario — 16 de septiembre de 2026

- El modal separa los campos con scroll propio de la cabecera y el pie de acciones. Los avisos de disponibilidad y guardado permanecen junto a Programar cita/Guardar cambios, visibles también al bajar por el formulario.
- Un día cerrado muestra la fecha con su día de la semana y orienta a cambiar fecha/hora; el botón permanece deshabilitado durante la consulta y cuando no hay disponibilidad. Editar paciente, motivo o notas conserva el aviso.
- Una consulta fallida retira odontólogos de la disponibilidad anterior y limpia la selección obsoleta. Una fecha disponible permite continuar manteniendo paciente y motivo; los errores del POST conservan los datos en el modal.
- Cuatro regresiones nuevas fallaban antes de la corrección. Después pasan las 51 pruebas de AppointmentFormPanel, AppointmentsPage y ConsultationFollowUpSection. Chromium verifica aviso y botón siempre visibles durante scroll, sábado bloqueado y cambio a lunes con creación simulada, en 1280×900 y 390×844.
- Comandos: `npm test -- src/pages/Appointments/AppointmentFormPanel.test.jsx src/pages/Appointments/AppointmentsPage.test.jsx src/pages/Patients/ConsultationFollowUpSection.test.jsx`; **evidencia histórica de navegador (script puntual retirado)**; `npm run lint`, `npm run build`, `git diff --check` correctos. Solo cambia la interfaz; no requiere migración.

### Selección directa de paciente — 16 de septiembre de 2026

- Nueva cita y Editar cita sustituyen búsqueda más selector por un único campo con resultados seleccionables debajo. Cada resultado identifica nombre, código y teléfono; las búsquedas siguen usando la API remota con debounce y cancelación.
- Un error al escribir se corrige en el mismo campo. Flechas y Enter seleccionan; Escape cierra primero los resultados. La selección muestra un resumen con Cambiar paciente, que elimina el ID anterior y devuelve el foco al buscador sin alterar los demás datos.
- Escribir sin seleccionar no permite guardar. Se conservan alta rápida por permiso, perfiles incompletos seleccionables y precarga desde seguimiento clínico. No hay cambios de modelo ni migraciones.
- Evidencia: 68 pruebas correctas en PatientSearchField, AppointmentFormPanel, AppointmentsPage, PatientQuickCreateDialog y ConsultationFollowUpSection; lint y build correctos. Chromium verifica corrección de nombre, búsqueda por teléfono, selección con teclado/clic, cambio de paciente y creación simulada en 1280×900 y 390×844 mediante **el ensayo histórico de navegador, cuyo script puntual fue retirado**.
- Comando: `npm test -- src/pages/Appointments/PatientSearchField.test.jsx src/pages/Appointments/AppointmentFormPanel.test.jsx src/pages/Appointments/AppointmentsPage.test.jsx src/pages/Appointments/PatientQuickCreateDialog.test.jsx src/pages/Patients/ConsultationFollowUpSection.test.jsx`.

### Simplificación de Nueva cita — 16 de septiembre de 2026

Nueva cita omite el campo Notas. El cambio afecta únicamente al formulario de creación; las notas existentes y su edición se conservan. La regresión comprueba la ausencia del campo al abrir Nueva cita y las suites de formulario/agenda verifican el guardado.

### Scroll de agenda diaria — 16 de septiembre de 2026

- Reproducción: la agenda tenía 923 px de alto visible y 931 px de contenido. Su scroll vertical accidental consumía el primer movimiento de rueda (8 px), antes de desplazar la página; al invertir la dirección ocurría lo mismo.
- El cuerpo de la agenda reserva 32 px adicionales para la última etiqueta de hora y las tarjetas compactas. Se conserva la escala horaria, la posición de las citas, el desplazamiento horizontal y la navegación fija. El diseño móvil mantiene su altura automática.
- Regresión Chromium: **el ensayo histórico de navegador, cuyo script puntual fue retirado** falló antes del ajuste por el overflow de 8 px. Después verifica desplazamiento inmediato hacia abajo/arriba sin scroll interno, última hora completa, seis columnas con scroll horizontal, cita de 15 minutos al final del día y lista móvil con ocho citas. Viewports: 1645×1030, 1280×900 y 390×844. Todos los datos API son ficticios; no escribe en la base de desarrollo.
- Verificación: 31 pruebas correctas de AppointmentsPage y appointmentDisplay; Oxlint y build correctos. Comandos: `npm test -- src/pages/Appointments/AppointmentsPage.test.jsx src/pages/Appointments/appointmentDisplay.test.js`; **evidencia histórica de navegador (script puntual retirado)**; `npm run lint`; `npm run build`.

## Fuera de alcance

- Jornadas laborales, vacaciones o excepciones individuales por odontólogo.
- Recordatorios por correo, SMS o mensajería.
- Eliminación permanente de citas.
