# Traspaso: rediseño v3 (en curso, sin publicar)

Estado al 25-09-2026. Rama `claude/gifted-hopper-dgx99i`. **No está fusionado en `main`**, así que GitHub Pages aún muestra la versión anterior (PR #5).

## Qué pidió el cliente

La petición se refiere a Transporte Autorizado; el fondo y el estilo iOS se aplican también a las otras dos páginas.

- **Calendario:** mejorar su diseño. Elegir la hora es obligatorio.
- **Hero:** vuelve a ser directo, como antes. Las tres opciones (cotizar, buscar transportista y orientación) se abren **en el mismo lugar**, casi como una web app.
- **Imágenes:** usar imágenes para acompañar el contenido.
- **Orden visual:** todo simétrico, con espacios regulares.
- **Movimiento:** animaciones suaves y microinteracciones. Referencia: reactbits.dev/c/micro, que está bloqueado por la red del entorno; se recrearon los patrones en JS propio.
- **Estilo:** iOS 26, sin abusar del brillo ni del resplandor interior.
- **Fondo:** color papel, sutilmente amarillo o naranjo.
- **Clics:** hacer clic no debe llevar al final de la página. La acción ocurre ahí mismo, en el hero o en una hoja modal.

## Lo que ya está hecho (en el árbol de trabajo)

### `assets/site/site.css`: reescrito (sistema v3)

- **Tokens:**
  - Papel `--bg #faf6ee`, `--bg-alt #f5efe4`, superficie `--surface #fffdf9`.
  - `--hairline`, `--glass` y sombras cálidas.
  - Radios de 10 a 32 px.
- **Header:** cápsula flotante de vidrio (sticky). En móvil, el menú es un panel de vidrio.
- **`.segmented`:** pista hundida con indicador deslizante `.thumb`, que JS posiciona.
- **Controles nuevos:**
  - `.pills` (y `.pills.is-grid` con `--cols`).
  - `.choice`, con un check que aparece al marcar.
- **Estilos de componentes nuevos:**
  - `.cal` (calendario) y `.slots` (horas).
  - `.stepper` (`ol > li > i`, con números o check).
  - `.summary`, `.receipt` (resumen tipo recibo) y `.success` (check dibujado).
  - `.sheet` (hoja modal: sube desde abajo en móvil y se centra en escritorio).
- **Adaptaciones:**
  - `.section-head` ahora va centrado; `.is-left` lo alinea a la izquierda.
  - El acordeón es una lista agrupada.
  - `.related`, `.dock` y `.toast` usan vidrio.
- **Movimiento:** todo dentro de `prefers-reduced-motion: no-preference`.

### `assets/site/site.js`: reescrito

- **`SITE.morph(el, fn)`:** anima el cambio de altura.
- **`SITE.shake`:** sacude un campo inválido.
- **Controles:** controles segmentados con indicador y `ResizeObserver`.
- **Calendario `[data-calendar]`:**
  - Crea `input[type=hidden]` con `data-display` (fecha legible para el resumen).
  - Atributos: `data-required`, `data-min-offset`, `data-max`, `data-mode="multi"` y `data-multi-when="modalidad=flexible"`.
  - Navegación con teclado.
  - API en `root.calendar`: `setMode`, `reset` y `focus`.
- **Validación:** mensajes en línea (`.field-error`) en vez de las burbujas del navegador.
- **Formularios `data-steps`:**
  - El stepper marca los pasos listos.
  - El resumen se arma por secciones.
  - Un campo con `data-join` se une a otro (cantidad + unidad).
  - Los campos con `data-skip` no entran al resumen.
  - `data-replace` hace que el resumen reemplace al formulario; `data-edit` vuelve a él; `data-copy` copia el texto.
- **Hoja `SITE.sheet.open(view)`:**
  - Mueve la vista al `<dialog>` y la devuelve a su lugar al cerrar.
  - En móvil se cierra arrastrando hacia abajo, con Esc o haciendo clic en el fondo.
- **Disparadores:**
  - `[data-open="id"]` llama a `SITE.present(view, trigger)`. Primero consulta `SITE.presenter` (la página); si la vista ya está en pantalla, la enfoca; si no, abre la hoja.
  - `data-set` sigue preseleccionando campos y reinicia el flujo.
- **Dirección:** si el hash nombra una `[data-view]` (`#cotizar`, `#buscar`), se abre al cargar.

### `transporte-autorizado.html`: reescrito

- **Hero `.app-hero`:**
  - H1 y lead centrados.
  - Tres `.route` con imagen: cotizar, buscar (mosaico de cuatro categorías) y orientación.
  - `.app-work`: barra con «Volver» y tres vistas: `#cotizar`, `#buscar`, `#orientacion`.
- **Cotizador:** cuatro pasos (Residuo, Lugar, Fecha y hora, Contacto).
  - Paso 1: servicio, tipo, mosaico de categorías que rellena «residuo», cantidad + unidad y almacenamiento.
  - Paso 3: modalidad y calendario. Programado permite un día; «Espera y ahorra» hasta tres; Express muestra una nota «24 h». La hora (08:00 a 17:00) es **obligatoria**.
  - Al final, un resumen tipo recibo con WhatsApp y Copiar.
- **Secciones, centradas:**
  - Servicios: dos tarjetas y cuatro «También te ayudamos con», con imagen.
  - Modalidades: tres tarjetas con foto y etiqueta de vidrio.
  - Proceso: banner de flota y línea de tiempo de cinco pasos.
  - Normativa: tres tarjetas y una nota.
  - Preguntas frecuentes.
  - Relacionados y banda de gestores.
- **CTA:** todos usan `data-open`. El JSON-LD se conservó.

### Otros archivos

- **`assets/site/transporte.css`:** reescrito para las piezas anteriores; usa container queries en `.view`.
- **`assets/site/transporte.js`:** reescrito.
  - Controlador del hero: `showInApp` y `goHome`, con morph y `history.replaceState`.
  - `SITE.presenter`: el hero se usa si está visible; si no, la hoja.
  - Buscador: mosaicos con flechas y máscaras, filas con miniatura, contador animado; carga los datos al abrir o al pasar el cursor.
  - Categorías en el cotizador y mensaje de WhatsApp de orientación.
- **Imágenes nuevas en `assets/transporte/`** (recortes con Pillow):
  - `ruta-cotizar-720` y `ruta-orientacion-720`.
  - `modalidad-{express,programado,flexible}-800`.
  - `proceso-flota-1600` y `servicio-marcas-480`.

## Verificado

- Los dos JS pasan la revisión de sintaxis.
- Hay capturas estáticas de Transporte a 1440 y 390 px, sin desborde horizontal ni errores de consola. El hero se ve bien y cabe en la primera pantalla.

## Pendiente, en orden

1. **Ajustes que no alcanzaron a aplicarse** en `transporte.css`:
   - `.app-hero`: bajar el padding inferior a `clamp(8px, 2vw, 24px)`; sobra espacio antes de Servicios.
   - `.process-media img`: `aspect-ratio: 10 / 3` (hoy es demasiado alto).
   - `.service-media`: `aspect-ratio: 16 / 7`.
2. **Probar las interacciones** (sin probar aún) a 1440 y 390 px. El script de flujo quedó escrito en la conversación anterior, aunque no se ejecutó. Hay que probar:
   - Abrir cada ruta del hero y volver.
   - Validación en línea por paso.
   - Calendario en modo simple y múltiple, cambio de mes, hora obligatoria y nota Express.
   - Resumen, Editar y Copiar.
   - Buscador: carga, mosaicos, comuna, «Ver más».
   - Hoja desde «Evaluar mi residuo» y las modalidades: abrir, cerrar con Esc, que la vista vuelva al hero y que `data-set` quede aplicado.
   - Arrastrar para cerrar en móvil.
   - Revisar `applyConditionals` con el calendario dentro de `data-show-when`: los campos ocultos se deshabilitan.
3. **HDS y Campañas**, que ya heredan el papel, el vidrio y los controles:
   - Envolver el `.panel` del formulario de contacto con `id="consulta" data-view data-view-title="…"`.
   - Añadir `data-open="consulta"` a los CTA que hoy apuntan a `href="#contacto"` (nav, hero, tarjetas, dock y footer).
   - Cambiar el marcado del resumen al de Transporte (`data-replace`, `data-receipt`, `data-edit`, ícono `.success`).
   - En Campañas, cambiar `<input type="date" name="fecha">` por `<div class="cal" data-calendar data-name="fecha" data-label="Fecha estimada">` (opcional, sin hora).
   - Verificar que el control segmentado de ocho materiales de Campañas se desplace bien, y revisar las pestañas (`data-tabs` usa morph).
4. **QA completo:** con los scripts de `redesign.js`, `qa.js` y `func-*.js` (los de la sesión anterior, que usan Playwright global con `executablePath` por defecto y un servidor en `python3 -m http.server 8765`). Hay que actualizar los selectores:
   - `.chip` pasa a `.tile`.
   - Ahora hay cuatro pasos.
   - Las rutas del hero son `.route`.
5. **Publicar:**
   - `git fetch origin main` y revisar si el otro agente publicó algo (ver `AGENTS.md`).
   - Commit, PR y merge con el SHA completo.
   - Verificar que terminó «pages build and deployment».
   - Actualizar `AGENTS.md` en la sección «Coordinación entre agentes» con los nuevos atributos: `data-open`/`data-view`, `data-calendar`, hoja y `SITE.presenter`.

## Reglas que se mantienen

- Nunito, `noindex` y WhatsApp 56986067930 como canal principal.
- Los formularios solo preparan un resumen local; nunca dicen que la solicitud se envió.
- No inventar datos.
- Transporte no tramita autorizaciones sanitarias.
- El listado de transportistas es de fecha 31-12-2025.
- Commits con los trailers acordados y sin nombres de modelo.
