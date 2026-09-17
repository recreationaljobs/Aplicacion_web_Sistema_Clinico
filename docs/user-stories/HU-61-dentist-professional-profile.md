# HU-61 — Perfil profesional del odontólogo

Estado: Implementada y verificada el 2 de septiembre de 2026.

## Modelo y contratos

- `User` incorpora `specialty` (máximo 200) y
  `professional_registration_number` (máximo 100), ambos opcionales y sin
  formato nacional ni unicidad inventados.
- Los serializers recortan espacios mediante la validación estándar de texto y
  permiten crear, editar o limpiar ambos valores desde la administración.
- El perfil propio permite editar especialidad y código MINSA; el usuario no
  puede alterar su rol ni permisos desde esa vista.
- La consulta expone únicamente el contexto profesional necesario leyendo la
  relación actual con `User`; no guarda snapshots ni duplica los campos.

## Interfaz y documentos

- Crear o editar un odontólogo muestra Especialidad y Código MINSA. Un cambio posterior de rol oculta los controles sin borrar los
  valores almacenados.
- El perfil del odontólogo y el encabezado contextual de una consulta muestran
  los datos cuando corresponden.
- La exportación PDF de HU-35 lee siempre el perfil profesional vigente; una
  exportación histórica ya generada no se modifica y una nueva refleja el valor
  actual.

## Migración y auditoría

- `users.0010_user_professional_profile` es una expansión simple con dos campos
  vacíos permitidos, sin backfill. Los usuarios existentes permanecen intactos.
- Crear o editar personal audita los nombres seguros de los campos cambiados,
  incluido rol, especialidad y registro; contraseñas y tokens quedan excluidos.

## Evidencia de aceptación

- Campos opcionales, trim, longitudes, texto libre, creación, edición, limpieza,
  cambio de rol y permisos administrativos.
- Contratos de login/perfil/consulta y edición propia de especialidad y código MINSA, con rol protegido.
- Migración desde el estado anterior, auditoría segura, UI administrativa,
  perfil profesional y PDF con lectura dinámica del profesional.


## Conexión de datos validada el 16 de septiembre de 2026

- Nombre, especialidad, Código MINSA y teléfono se reutilizan desde User en Mi perfil, Staff y el detalle de consulta. La consulta expone `professional_phone`; los cuatro metadatos son de solo lectura y corresponden al profesional asignado.
- El nombre del detalle usa el perfil actual; la copia histórica del nombre se conserva para historial y atribución en exportación. No se crearon columnas duplicadas para código o teléfono.
- Se eliminan N.º INSS y N.º CEMA de ambos modelos clínicos mediante `patients.0024_remove_inss_and_cema`, aplicada y columnas ausentes verificadas en PostgreSQL local.
- Comandos: `python manage.py test apps.users.tests apps.users.test_hu61 apps.patients.tests apps.patients.test_clinical_record_export --settings=config.settings.test --noinput` (143 correctas), `npm test -- src/App.test.jsx src/pages/Profile/MyProfilePage.test.jsx src/pages/Settings/SettingsPage.test.jsx` (91 correctas), lint, build y comprobaciones Django/migraciones/diff correctas. El flujo de edición propia, lectura en Staff y creación de consulta con datos asignados tiene 8 regresiones ampliadas correctas.
