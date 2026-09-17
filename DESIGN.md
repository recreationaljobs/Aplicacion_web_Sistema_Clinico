# Guía de estilos del Sistema Clínico

Este documento describe el lenguaje visual que ya está implementado en el frontend. No propone un rediseño: registra los patrones actuales para que las nuevas pantallas mantengan coherencia con la aplicación.

## Base técnica

- React 19 y Vite 8.
- Tailwind CSS 4 mediante `@import "tailwindcss"` en `src/frontend/src/index.css`.
- Los estilos se aplican principalmente con clases utilitarias dentro de los componentes JSX.
- La agenda conserva sus reglas específicas en `pages/Appointments/appointments.css`; los dos CSS vacíos de la plantilla fueron retirados.
- `index.css` define `--font-sans` con IBM Plex Sans Variable, distribuida localmente mediante `@fontsource-variable/ibm-plex-sans`. `font-serif` conserva el fallback del sistema.

## Dirección visual

La interfaz utiliza una estética clínica limpia: fondos claros, superficies blancas, bordes grises suaves y azul como color de acción y de identidad. El contenido administrativo es compacto y sobrio; los flujos de autenticación emplean más espacio, imágenes y bloques informativos para transmitir seguridad.

Principios presentes en la implementación:

- Alto contraste entre contenido y superficie.
- Azul reservado para acciones, enlaces, foco, navegación activa e identidad.
- Escala de grises `slate` para texto, divisores, fondos y estados neutrales.
- Verde para confirmaciones y usuarios activos; rojo para errores.
- Bordes redondeados y sombras discretas para separar tarjetas y diálogos.
- Diseño responsivo desde móvil, con cambios principales en `sm`, `md` y `lg`.

## Paleta de colores

### Colores de marca y acción

| Uso | Valor o clase actual | Aplicación |
| --- | --- | --- |
| Azul principal de marca | `#1269ad` | Botón reutilizable, etiquetas de autenticación, foco y elementos destacados |
| Azul de navegación | `#0068b5` | Texto del elemento activo del menú lateral |
| Fondo de navegación activa | `#e5eff8` | Elemento activo del menú lateral |
| Azul de acción | `blue-700` | Botones principales, enlaces, iconos y controles activos |
| Azul de acción al pasar | `blue-800` | Estado `hover` de botones principales |
| Azul de foco | `blue-500` o `blue-600` | Borde de campos enfocados |
| Halo de foco | `blue-100` | Anillo de campos enfocados |
| Fondo informativo | `blue-50` y `blue-100` | Iconos, etiquetas, avatares y selecciones |
| Azul oscuro auxiliar | `#183c57` | Títulos de paneles informativos |
| Fondo azul muy claro | `#eaf4fb` o `#f4f8fb` | Paneles de seguridad y recuperación |

### Neutrales

| Uso | Clases o valores actuales |
| --- | --- |
| Fondo general protegido | `slate-50` |
| Superficie principal | `white` |
| Texto principal | `slate-900`, `#1f2a33`, `#1e2933` o `#252525` |
| Texto secundario | `slate-500`, `#64717d`, `#52606c` o `#888` |
| Texto tenue | `slate-400` |
| Bordes suaves | `slate-100`, `slate-200`, `#dce4ea`, `#d5d5d5` o `#ccd6df` |
| Fondo de controles | `slate-50` o `white` |
| Overlay de modal | `slate-950/40` |

### Estados

| Estado | Fondo | Texto o borde |
| --- | --- | --- |
| Éxito | `#eefaf4` o `emerald-50` | `#17603e`, `emerald-700`, borde `#b8dccb` |
| Error | `#fff0f0`, `#fff1f1` o `red-50` | `#a51d1d`, `red-700`, borde `#f2caca` |
| Inactivo | `slate-100` | `slate-600` |
| Deshabilitado/cargando | Sin cambio de color base | `opacity-60` o `opacity-70`; cursor de espera en `CustomButton` |

## Tipografía

La aplicación define su familia principal localmente y conserva el fallback serif del sistema:

- `font-sans`: interfaz, formularios, botones, navegación y textos generales.
- `font-serif`: títulos principales del dashboard, configuración e indicadores numéricos.

Jerarquía observada:

| Nivel | Tratamiento habitual |
| --- | --- |
| Título de página | `text-3xl` o `text-4xl`, `font-semibold`, `tracking-tight` o `tracking-[-.02em]` |
| Título de sección/tarjeta | `text-xl` o tamaño base, `font-semibold` |
| Etiqueta superior | `text-xs`, `font-semibold` o `font-bold`, mayúsculas, tracking entre `.16em` y `.22em` |
| Cuerpo | Tamaño base o `text-sm`, color secundario, `leading-5` o `leading-6` |
| Ayuda/metadatos | `text-xs` o `text-[11px]`, `slate-400`/`slate-500` |
| Etiquetas de formulario | `text-sm`, `font-medium` o `font-bold` |

## Espaciado y composición

La escala de espaciado procede de Tailwind. Los patrones más repetidos son:

- Separación corta: `gap-1.5`, `gap-2` y `gap-3`.
- Separación entre controles o bloques: `gap-4`, `gap-5` y `gap-6`.
- Relleno de controles: `px-3 py-2.5`, `px-4 py-3` o `px-5 py-2.5`.
- Relleno de tarjetas: `p-5` o `p-6`; formularios amplios usan `p-8` y `p-10` en pantallas mayores.
- Contenido protegido: `p-5 sm:p-7 lg:p-10`.
- Ancho máximo de páginas administrativas: `max-w-5xl` o `max-w-6xl`, centrado con `mx-auto`.
- Ancho máximo de formularios de acceso: entre `390px` y `430px`.

## Bordes, radios y sombras

- Campos y botones: `rounded-lg` o `rounded-xl`.
- Tarjetas: `rounded-xl` o `rounded-2xl`.
- Avatares, insignias e iconos circulares: `rounded-full`.
- Divisores: bordes `slate-100` o `slate-200` de un píxel.
- Tarjetas administrativas: `shadow-sm`.
- Botón reutilizable: `shadow-md`.
- Modal: `shadow-2xl`.
- Tarjeta de cambio de contraseña: sombra personalizada `0 18px 45px rgba(29, 63, 89, .09)`.

## Componentes y patrones

### Botones

Botón principal:

- Fondo `#1269ad` en `CustomButton` o `blue-700` en las vistas administrativas.
- Texto blanco y semibold.
- Radio `lg` o `xl`.
- `hover` azul más oscuro cuando está definido.
- Foco visible con contorno azul en las acciones principales del dashboard.
- Estado deshabilitado mediante reducción de opacidad.

Botón secundario:

- Fondo blanco.
- Borde `slate-300`.
- Texto `slate-600`.
- Fondo `slate-50` al pasar el cursor.

Botón de icono:

- Forma circular.
- Texto `slate-500`.
- Fondo `slate-100` al pasar el cursor.

### Formularios

- Etiqueta encima del control y asociada mediante `htmlFor` cuando el campo posee identificador.
- Campo blanco con borde neutral y radio `lg` o `xl`.
- Relleno horizontal de `3` o `4` y vertical de `2.5`, `3` o `3.5`.
- Foco con borde azul y anillo `blue-100`.
- Mensajes de error y éxito se muestran en bloques redondeados con `role="alert"` o `role="status"`.
- Los formularios dentro de modal pasan de una columna a dos desde `sm`.

### Tarjetas y paneles

- Superficie blanca, borde `slate-200`, radio `xl`/`2xl` y sombra ligera.
- Encabezado separado con borde inferior `slate-100`.
- Estados vacíos centrados, con icono circular de fondo azul o gris claro.
- Los paneles auxiliares de seguridad usan fondo azul claro y texto azul grisáceo.

### Navegación

- El layout protegido usa fondo `slate-50`, barra lateral y barra superior blancas.
- En móvil, la barra lateral se convierte en una franja horizontal con desplazamiento.
- Desde `md`, la barra lateral mide `w-56`, ocupa al menos toda la altura y usa borde derecho.
- El elemento activo combina `#e5eff8` con `#0068b5`; el inactivo usa `#354052`.
- La barra superior tiene una altura mínima de `4rem`, buscador desde `sm` y avatar circular.

### Tablas y etiquetas

- Las tablas mantienen un ancho mínimo y habilitan desplazamiento horizontal.
- Cabecera `slate-50`, texto de `10px`, mayúsculas y tracking amplio.
- Filas separadas por `slate-100` y resaltadas con `slate-50` al pasar.
- Roles y estados se representan con píldoras de `11px` y colores semánticos.

### Modal

- Overlay fijo de pantalla completa con fondo `slate-950/40`.
- Contenido centrado, blanco, `max-w-xl`, `rounded-2xl` y `shadow-2xl`.
- Altura limitada a `92vh` y desplazamiento vertical interno.
- Incluye `role="dialog"`, `aria-modal="true"` y título accesible.

## Layouts principales

### Acceso

- Pantalla dividida: imagen al `40%` y formulario en el espacio restante.
- El formulario se centra y limita a `390px`.
- Actualmente este layout conserva las dos columnas incluso en pantallas pequeñas.

### Recuperación de contraseña

- En móvil se muestra solamente el formulario sobre `#f4f8fb`.
- Desde `md`, se activa una cuadrícula con panel visual de al menos `300px` y aproximadamente `42%` del ancho.
- El panel visual combina `imagen_login.png` con un degradado azul y un indicador de tres pasos.
- El formulario se limita a `430px`.

### Área protegida

- Disposición vertical en móvil.
- Desde `md`, barra lateral fija en la composición y contenido flexible.
- El contenido se limita normalmente a `max-w-6xl`.
- Las cuadrículas de indicadores pasan a dos columnas en `sm`; los paneles principales cambian su proporción en `lg`.

## Puntos de quiebre utilizados

| Punto | Uso actual |
| --- | --- |
| `sm` | Mostrar el buscador, ampliar rellenos, formularios de dos columnas e indicadores en dos columnas |
| `md` | Convertir navegación horizontal en barra lateral y mostrar el panel visual de recuperación |
| `lg` | Aumentar rellenos y activar composiciones de panel principal/auxiliar |

## Recursos gráficos e iconografía

- `src/frontend/src/assets/logo_login.svg`: logotipo usado en acceso, recuperación y barra lateral.
- `src/frontend/src/assets/imagen_login.png`: imagen principal de acceso y recuperación.
- Los iconos de la barra lateral son SVG en línea con trazo de `1.8`.
- Algunos estados y acciones todavía utilizan caracteres Unicode como `✓`, `＋`, `×`, `▣` y `♙`.
- `hero.png`, `react.svg` y `vite.svg` existen en assets, pero no forman parte de los patrones visuales principales observados.

## Accesibilidad presente

- Uso de landmarks como `main`, `aside`, `nav`, `header` y `section`.
- Etiquetas accesibles mediante `aria-label`, `aria-labelledby` y texto `sr-only`.
- Elementos decorativos marcados con `aria-hidden="true"` o `alt=""`.
- Mensajes dinámicos con `role="alert"` y `role="status"`.
- Diálogos con semántica modal.
- Estados activos expuestos mediante `aria-current="page"`.
- Controles interactivos implementados con `button`, `a`, `Link` o `NavLink`.

## Reglas para mantener la coherencia

Al extender la interfaz existente:

1. Usar primero utilidades de Tailwind dentro del componente.
2. Preferir `blue-700` para acciones y `#1269ad` cuando el componente pertenece a los flujos de autenticación ya existentes.
3. Usar `slate-50` para el fondo de página, blanco para superficies y `slate-200` para bordes.
4. Mantener `rounded-xl border border-slate-200 bg-white shadow-sm` como base de las tarjetas administrativas.
5. Mantener etiquetas visibles, foco azul y mensajes semánticos en los formularios.
6. Añadir variantes responsivas coherentes con `sm`, `md` y `lg`.
7. Reutilizar `CustomButton`, `AuthRecoveryShell`, `Navbar` y `Sidebar` antes de duplicar sus patrones.
8. Si se introduce un nuevo color o valor arbitrario, documentar su propósito y reutilizarlo de forma consistente.

## Fuentes de referencia

- `src/frontend/src/index.css`
- `src/frontend/src/App.jsx`
- `src/frontend/src/components/CustomButton.jsx`
- `src/frontend/src/components/AuthRecoveryShell.jsx`
- `src/frontend/src/components/Navbar.jsx`
- `src/frontend/src/components/Sidebar.jsx`
- `src/frontend/src/pages/Auth/`
- `src/frontend/src/pages/Dashboard/DashboardPage.jsx`
- `src/frontend/src/pages/Settings/SettingsPage.jsx`

