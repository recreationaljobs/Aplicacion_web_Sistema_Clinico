# HU-01 — Ajuste de visibilidad de contraseña en el login

Estado del ajuste: Implementado y validado el 16 de septiembre de 2026.

El campo Contraseña de `/login` incluye un botón con icono de ojo para mostrar u ocultar el texto. La contraseña inicia oculta. El botón conserva el valor ingresado, no envía el formulario y anuncia su acción y estado mediante `aria-label` y `aria-pressed`.

Interfaces afectadas: `LoginPage.jsx` y su prueba de regresión. No cambia el contrato de autenticación ni el almacenamiento.

Evidencia: la regresión falló antes de agregar el botón y luego pasó. Las seis pruebas de login, lint y la compilación de producción finalizaron correctamente.

Comandos: `npm test -- src/pages/Auth/LoginPage.test.jsx`, `npm run lint`, `npm run build` y `git diff --check`.
