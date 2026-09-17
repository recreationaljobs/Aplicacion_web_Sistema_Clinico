# HU-16 — Listado y ordenación de pacientes

> Los ensayos de navegador anteriores se conservan como evidencia histórica, no como comandos ejecutables actuales. Las suites vigentes y el smoke reproducible están en [preparación para producción](../production-readiness.md).

**Estado:** Implementada y validada el 1 de septiembre de 2026.

## Contrato

- `GET /api/patients/` acepta un único parámetro `ordering` con los campos
  permitidos `code`, `name`, `created_at` e `is_active`.
- El prefijo `-` solicita orden descendente; sin prefijo, ascendente.
- Cada orden termina en `pk` como desempate determinista. El orden por nombre
  usa nombres, primer apellido, segundo apellido y `pk`.
- Sin parámetro se conserva el orden por fecha de registro descendente.
- Un campo arbitrario o una lista de campos devuelve `400` y no llega a
  `order_by`.
- El backend ordena el queryset antes de búsqueda y paginación. El frontend
  vuelve a la página 1 cuando cambia el campo o la dirección.

`PatientSummary` no fue ampliado con datos clínicos. El listado sólo añadió la
representación visible del estado que el contrato mínimo ya incluía.

## Permisos y evidencia

Se mantiene `patients.view`: una petición anónima devuelve `401` y un usuario
sin la capacidad devuelve `403`. Las pruebas cubren ascendente, descendente,
empates estables, código, fecha, estado, búsqueda combinada, páginas sucesivas,
parámetros inválidos y los controles frontend.

## Verificación

```powershell
cd src/backend
.venv\Scripts\python manage.py test apps.patients.test_hu16_hu17 --settings=config.settings.test --noinput
.venv\Scripts\python manage.py test --settings=config.settings.test --noinput

cd ../frontend
npm test -- src/services/patientService.test.js src/pages/Patients/PatientsPage.test.jsx
npm test -- --reporter=dot
npm run lint
npm run build
```

### Ajuste visual — 16 de septiembre de 2026

- Buscador y selectores comparten altura de 44 px y se alinean por su borde inferior; la lupa SVG se centra dentro del buscador. En móvil los controles conservan su disposición vertical.
- Chromium verifica geometría, centrado y ausencia de desbordamiento en 1280×900 y 390×844 con **evidencia histórica de navegador (script puntual retirado)**.
- Las 3 pruebas de `PatientsPage.test.jsx`, lint y build pasan.

## Fuera de alcance

No se añadieron filtros clínicos, exportación, ordenación por campos arbitrarios
ni carga del dataset completo en el navegador.
