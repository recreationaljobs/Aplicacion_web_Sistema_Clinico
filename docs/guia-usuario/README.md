# Guía de usuario — Sistema Clínico Dental

Actualizada: 17 de septiembre de 2026. Toda esta guía está en Markdown; no requiere Word.

La dirección del sistema y tu contraseña inicial las proporciona Administración. No existe una contraseña predeterminada para producción. Los nombres y situaciones descritos son ejemplos ficticios.

Esta guía explica las tareas diarias de la aplicación: acceder, localizar pacientes, trabajar con expedientes y consultas, usar el odontograma, administrar documentos, organizar citas y configurar la clínica según el rol.

Accede a la dirección HTTPS indicada por Administración.

## Antes de comenzar

El sistema muestra solo las funciones autorizadas para la cuenta activa. Si una opción descrita no aparece, revisa el rol y los permisos configurados por Administración.

### Alcance de cada rol

| Rol | Uso principal | Navegación visible |
| --- | --- | --- |
| Administración | Control integral, personal, permisos y parámetros de la clínica. | Dashboard, Pacientes, Citas y Configuración |
| Odontología | Atención clínica, consultas, tratamientos y odontogramas. | Dashboard, Pacientes y Citas |
| Recepción | Registro administrativo de pacientes y coordinación de agenda. | Dashboard, Pacientes y Citas |

## Inicio de sesión

Abre el enlace de la aplicación e identifica la pantalla de acceso antes de escribir las credenciales.

1. Escribe el correo correspondiente a tu rol.

2. Escribe la contraseña. El campo la oculta mientras la introduces.

3. Selecciona Iniciar sesión y espera a que aparezca el panel principal.

4. Comprueba el nombre de la cuenta en la esquina superior derecha antes de trabajar.

Si el acceso falla. Verifica mayúsculas, minúsculas y el correo completo. Usa la recuperación de contraseña si el correo está configurado; si no recibes el mensaje, solicita ayuda a Administración.

## Navegación y cuenta personal

La barra lateral abre los módulos. El menú del nombre permite administrar la cuenta y cerrar la sesión.

| Opción | Función |
| --- | --- |
| Dashboard | Resumen de pacientes, citas y actividad permitida para el rol. |
| Pacientes | Búsqueda, registro y acceso al expediente clínico. |
| Citas | Agenda diaria, semanal y mensual. |
| Configuración | Parámetros de clínica, servicios, personal y permisos. Solo Administración. |

Cambios pendientes. Cuando aparezcan los controles de guardar y descartar, confirma una de las dos acciones antes de salir. La aplicación puede advertir si intentas abandonar un borrador.

## Panel de Administración

Administración dispone de una vista global y accesos rápidos a pacientes, citas y configuración.

- Nuevo paciente abre directamente el alta de expediente.

- Agendar citas abre la agenda para programar una atención.

- Consultas recientes muestra actividad del equipo; Pacientes recientes resume atenciones completadas.

- Configuración aparece en la barra lateral únicamente para cuentas administrativas.

## Paneles de Odontología y Recepción

Los dos perfiles comparten Pacientes y Citas, pero su resumen prioriza tareas distintas.

| Odontología | Recepción |
| --- | --- |
| Muestra la agenda propia y las consultas recientes del profesional. No incluye Configuración. | Incluye accesos rápidos para registrar pacientes y agendar citas del equipo. No incluye Configuración. |

### Permisos efectivos

Administración puede cambiar los permisos predeterminados de Recepción y Odontología. Por esa razón, una cuenta puede tener menos o más acciones que las descritas en esta guía.

## Buscar y abrir pacientes

La lista reúne el identificador, contacto, fecha de nacimiento, registro y estado administrativo de cada paciente.

1. Abre Pacientes desde la barra lateral.

2. Busca por nombre, identificación, teléfono o correo.

3. Usa Ordenar por y Dirección para cambiar la secuencia de los resultados.

4. Selecciona Ver para abrir el expediente del paciente correcto.

Antes de abrir. Confirma el código y la fecha de nacimiento cuando existan nombres parecidos.

## Registrar un paciente

El botón Nuevo paciente crea un borrador de expediente. Las pestañas clínicas permanecen deshabilitadas hasta guardar la identidad inicial.

1. Completa nombres, primer apellido, fecha de nacimiento y teléfono; el aviso superior enumera los datos administrativos pendientes.

2. Selecciona género y registra el lugar de nacimiento cuando el formulario lo solicite.

3. Si existe identificación, selecciona el tipo antes de escribir el número.

4. Registra responsable o tutor cuando otra persona administra la atención del paciente.

5. Añade alertas y antecedentes conocidos sin introducir información no confirmada.

6. Guarda el expediente. El sistema genera el código del paciente y abre su ficha.

Posibles duplicados. Si aparece una coincidencia por identificación, teléfono o nombre y fecha de nacimiento, revisa los resultados antes de crear otro expediente.

## Consultar el expediente clínico

El encabezado confirma la identidad, el código y el estado. Las pestañas separan la información longitudinal del paciente.

| Pestaña | Contenido |
| --- | --- |
| Resumen clínico | Alertas, datos personales, identificación, responsable, antecedentes y plan longitudinal. |
| Consultas | Historial de atenciones y acceso a la ficha clínica de cada consulta. |
| Odontograma | Historial de versiones y comparación del estado dental. |
| Documentos | Imágenes, radiografías, consentimientos y archivos asociados. |

- Exportar PDF genera una copia de solo lectura del expediente cuando la cuenta tiene acceso.

- Un paciente inactivo conserva su historia, pero las nuevas operaciones clínicas quedan bloqueadas.

- La edición de datos existentes depende del permiso Editar pacientes.

- Los cambios clínicos requieren un motivo. Ver revisiones muestra el contenido anterior, autor y fecha; los cambios administrativos no requieren ese motivo.

## Consultas clínicas

Las consultas registran la atención por fecha y profesional. Recepción suele tener acceso de lectura; Odontología crea y edita cuando el permiso está habilitado.

1. En el expediente, abre Consultas y selecciona Nueva consulta o Ver detalle.

2. Registra el resumen, motivo, interrogatorio por sistemas, examen, diagnóstico, plan y presupuesto. La historia de enfermedad actual pertenece al resumen del expediente.

3. Guarda el borrador durante la atención.

4. Usa Completar consulta solo después de revisar la ficha. El cierre sincroniza la cita vinculada y deja la consulta en modo de solo lectura.

5. Con permiso de edición clínica, registra una aclaración posterior en Motivo y Contenido de la adenda. Guardar adenda conserva la consulta original; Ver adendas muestra las aclaraciones y estas se incluyen en el PDF.

## Tratamientos y odontograma

El odontograma de la consulta guarda revisiones inmutables. Cada versión conserva el estado clínico observado en ese momento.

1. Abre una consulta guardada y selecciona Odontograma.

2. Elige dentición temporal, mixta o permanente.

3. Trabaja sobre Estado actual o Plan de tratamiento.

4. Selecciona Caries, Restauración, Sellante o Fractura y marca la superficie correspondiente.

5. Selecciona el número de una pieza para registrar estados de pieza completa o notas.

6. Añade una nota de versión y guarda. No salgas mientras existan cambios pendientes.

Tratamientos estructurados. Las propuestas pueden pasar por aceptación, realización o cancelación. Verifica la pieza y la superficie antes de confirmar un resultado odontográfico.

## Documentos del paciente

La pestaña Documentos permite localizar archivos por texto, categoría o consulta relacionada.

1. Abre el expediente y selecciona Documentos.

2. Busca por nombre, categoría o notas, o aplica los filtros disponibles.

3. Selecciona Ver para abrir la ficha y la vista previa autenticada.

4. Usa Descargar cuando necesites una copia autorizada del archivo.

- En entornos habilitados, el permiso Adjuntar documentos controla la carga y Borrar documentos controla el retiro lógico.

- El retiro conserva la trazabilidad; Administración puede consultar y restaurar documentos retirados.

## Consultar la agenda de citas

La agenda ofrece vistas de Día, Semana y Mes. El alcance depende del rol: Recepción y Administración suelen ver al equipo; Odontología ve su propia agenda.

1. Abre Citas desde la barra lateral.

2. Selecciona Día, Semana o Mes según el nivel de detalle que necesites.

3. Usa las flechas, Hoy o el selector de fecha para cambiar el periodo.

4. Selecciona una tarjeta de cita para abrir el detalle y sus acciones.

Lectura rápida. Cada tarjeta muestra hora, paciente, motivo, profesional y estado. Las citas canceladas permanecen visibles para trazabilidad, pero liberan el horario.

## Programar una cita

Nueva cita abre un panel sin abandonar el calendario. El sistema valida disponibilidad antes de permitir el registro.

1. Define fecha, hora, servicio opcional y duración.

2. Busca al paciente con al menos dos caracteres y selecciónalo en los resultados.

3. Selecciona un odontólogo disponible para el intervalo.

4. Escribe el motivo y las notas necesarias.

5. Revisa todos los datos y selecciona Programar cita.

- La agenda impide solapamientos del mismo paciente o profesional.

- Si el paciente aún no existe, la creación rápida puede estar disponible sin perder el borrador de la cita.

- Una cita nueva comienza con estado Programada.

## Gestionar una cita

Las acciones cambian según el estado de la cita y los permisos de la cuenta.

| Acción | Cuándo usarla |
| --- | --- |
| Abrir expediente | Consultar la identidad y la historia clínica del paciente. |
| Registrar llegada | Marcar el check-in del paciente al presentarse. |
| Iniciar atención | Crear o abrir la consulta vinculada a la cita. |
| Editar | Reprogramar o ajustar datos conservando el historial de cambios. |
| Confirmar cita | Registrar que la cita fue confirmada. |
| Cancelar cita | Cerrar la cita sin eliminar su trazabilidad. |

Confirmación clínica. Antes de cambiar estado, verifica paciente, fecha, hora y profesional. Completar, cancelar o registrar inasistencia altera el historial de la cita.

## Configuración de la clínica

Configuración concentra los parámetros operativos que gobiernan la identidad institucional y la disponibilidad de la agenda.

| Sección | Qué administra |
| --- | --- |
| Perfil de la clínica | Nombre, logotipo, contacto, moneda y zona horaria. |
| Horarios de atención | Jornadas, pausas, días laborales y festivos. |
| Servicios y tarifas | Catálogo de tratamientos, duración y precios de referencia. |
| Gestión de Staff | Cuentas, roles, estado, datos y acceso del personal. |
| Permisos por rol | Acciones predeterminadas de Recepción y Odontología. |

Efecto en la agenda. Los horarios, festivos, servicios y zona horaria modifican la disponibilidad que aparece al programar citas.

## Personal y permisos

Gestión de Staff administra cuentas individuales. Permisos por rol modifica los accesos predeterminados de todas las cuentas del rol seleccionado.

1. Para crear una cuenta, selecciona Añadir miembro y asigna el rol correcto.

2. Usa Editar para actualizar datos; la sección de acceso permite definir una nueva contraseña sin mostrar la anterior.

3. Archivar desactiva la cuenta y revoca sus sesiones sin borrar el historial.

4. En Permisos por rol, elige Recepcionista u Odontólogo, marca solo las capacidades necesarias y guarda.

Impacto global. Un cambio de permisos se aplica a todas las cuentas del rol. Revisa el conjunto completo antes de guardar.

## Perfil, seguridad y solución de problemas

Cada persona puede revisar sus datos desde el menú de la esquina superior derecha.

1. Abre el menú de tu nombre y selecciona Mi perfil.

2. Actualiza nombre, apellidos, teléfono, correo o fotografía cuando el entorno lo permita.

3. Usa Cambiar contraseña para el flujo independiente de seguridad. Usa una contraseña exclusiva para tu cuenta y no la compartas.

4. Al terminar, abre nuevamente el menú y selecciona Cerrar sesión.

### Problemas frecuentes

| Situación | Qué hacer |
| --- | --- |
| Conectando con el servidor | Comprueba tu conexión. Si persiste, informa a Administración para revisar la disponibilidad del servicio. |
| No aparece una acción | Comprueba el rol y solicita a Administración revisar los permisos. |
| La cita no se puede guardar | Revisa campos obligatorios y posibles solapamientos. |
| Conflicto de edición | Conserva el borrador, carga la versión más reciente y reconcilia los cambios. |
| No puedes adjuntar archivos o recuperar la contraseña | Revisa el permiso correspondiente y solicita comprobar el almacenamiento o el correo. |

Regla de seguridad. Accede con una cuenta individual, comparte información clínica solo con personas autorizadas y cierra la sesión al terminar, especialmente en equipos compartidos. Usa únicamente datos ficticios si estás en una demostración.

## Corrección del registro de llegada

Si registraste una llegada por error y la atención todavía no ha comenzado, abre el detalle de la cita y selecciona **Corregir llegada**. Escribe un motivo y confirma. La cita vuelve a su estado anterior, conservando una constancia de la corrección. Se requiere el permiso de edición de citas. Si otra persona cambió la cita, actualiza sus datos antes de intentarlo de nuevo.

## Cambios simultáneos

Si aparece un conflicto al guardar, conserva tu borrador y vuelve a cargar los datos actuales. Revisa lo que cambió antes de repetir la operación. El sistema impide que un guardado sobrescriba silenciosamente una versión más reciente.

## Referencias técnicas

- [Despliegue y operación](../deployment.md).
- [Trazabilidad clínica y adendas](../clinical-traceability.md).
- [Documentos privados](../patient-documents.md).
