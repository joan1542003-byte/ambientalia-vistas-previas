# Asistente IA de Ambientalia (plugin de WordPress)

Estado al 10-11-2026. Burbuja del asistente con IA para `ambientalia.cl` (WordPress con Elementor, tema Hello Biz). Es la misma conversación que el chat de Transporte Autorizado ([integracion-widget-chatbot.md](integracion-widget-chatbot.md)), armada como un plugin independiente: no usa ni cambia los archivos del chat de Transporte (`assets/site/agente*.js|css`, de Jeremy).

## Archivos

| Archivo | Qué hace |
|---|---|
| `wordpress/ambientalia-asistente/ambientalia-asistente.php` | Ajustes (Ajustes → Asistente IA) y carga de la burbuja en todas las páginas públicas. No va en el escritorio ni en el editor de Elementor. |
| `wordpress/ambientalia-asistente/assets/asistente.js` | Burbuja, invitación y ventana, dentro de un Shadow DOM (`#amb-asistente`). |
| `wordpress/ambientalia-asistente/assets/asistente.css` | Estilos de la ventana (solo dentro del Shadow DOM). |
| `ambientalia-asistente.html` | Vista previa: el sitio real detrás, en un `<iframe>`, y la burbuja encima. |
| `tools/asistente-simulado.py` | Asistente de prueba con el mismo contrato (solo local). |

## Diseño (1.1.0, 10-11-2026)

- **Lenguaje del header de ambientalia.cl** (se leyó su CSS): vidrio verde `rgba(0, 98, 72, .72)` con `blur(10px) saturate(380%)` y el mismo brillo interior, la capa «liquid» de luces radiales, foco menta `#78DCB4`, curvas de resorte (`cubic-bezier(.34, 1.28, .64, 1)` y `(.32, .72, 0, 1)`), Montserrat 500/600/800 y títulos con `letter-spacing: -.032em`.
- **Ventana como la del chat de Transporte:** vidrio claro con borde de luz, cabecera liviana (avatar, nombre, «En línea · responde con IA» con un punto que late, menú «⋯» y cerrar), sugerencias como tarjetas, campo redondo con botón de enviar.
- **Marca de la burbuja:** un globo de conversación con una chispa (IA) en el degradado menta-cian del sitio. La chispa titila cada tanto y gira al pasar el puntero; abierta, la burbuja pasa a una X.
- **Burbuja a la derecha** por omisión (el botón de WhatsApp del sitio se retira), 60 px como ese botón. En los ajustes puede ir a la izquierda.
- **Invitación** una vez por visita, a los 4 s: «escribiendo…», el saludo y dos sugerencias (Permisos ambientales, Ley REP) que abren el chat con la pregunta puesta. Aparece con un punto menta en la burbuja, como el aviso del WhatsApp del sitio. Se va sola a los 16 s; se puede apagar.
- **Bienvenida y sugerencias:** cuatro preguntas de ejemplo. Se puede preguntar de inmediato, escribiendo o con una sugerencia: si no hay sesión, la pregunta queda a la vista, se piden los datos («Antes de responder, déjame tus datos») y, al entrar, se envía sola.
- **Micro interacciones:** la ventana se abre como la gota del megamenú del sitio; los mensajes entran con desplazamiento y un leve desenfoque; las opciones aparecen en cascada y, al tocar una, queda marcada y las demás se apartan; el botón de enviar se activa con un rebote al escribir y la flecha «sale disparada» al enviar; «escribiendo…» dice qué hace si tarda («Pensando…», «Revisando la información…»); botón «Copiar» en cada respuesta, con confirmación; «Nuevo mensaje» si se estaba leyendo más arriba; la puerta tiembla y marca el campo que falta; casillas con su visto animado. Todo se apaga con «reducir movimiento».
- **Teléfono:** la ventana ocupa la pantalla visible (`visualViewport`): con el teclado abierto, el campo queda justo encima. La página de atrás no se desplaza mientras el chat está abierto, el botón «atrás» del teléfono lo cierra, los campos usan 16 px (iOS no hace zoom) y respetan las zonas seguras. Enter envía solo con teclado físico.
- **PC:** la ventana no tapa el header del sitio; Escape cierra; el menú se recorre con flechas; el foco vuelve a la burbuja.
- **Shadow DOM:** los estilos del tema y de Elementor no la alteran, y ella no altera el sitio. El anfitrión lleva `all: initial`.
- Cualquier enlace a `#asistente` (un botón de Elementor, por ejemplo) abre la ventana; desde código, `window.ambAsistente.abrir()` o `window.ambAsistente.preguntar('…')`.

## Configuración

| Ajuste | Para qué |
|---|---|
| Mostrar la burbuja | Apagarla sin desactivar el plugin. |
| Dirección del asistente | La base del servicio (`https://…`, sin barra final). La ventana llama a `/api/chat/…` sobre ella y enlaza sus `/condiciones-del-servicio` y `/politica-de-privacidad`. Debe ser https; sin consulta, fragmento ni datos de acceso (se valida al guardar). |
| Clave pública de Turnstile | Solo si el asistente exige Cloudflare Turnstile. La clave secreta queda en el servidor del asistente. |
| WhatsApp y página de contacto | Se ofrecen cuando no hay dirección del asistente. |
| Posición e invitación | Derecha por omisión. Ver «Diseño». |

Sin dirección, la burbuja sigue presente y la ventana dice «El asistente en línea no está disponible por ahora» con WhatsApp y contacto; no llama a nada. Ninguna dirección ni clave va dentro del plugin.

## Contrato con el asistente

El mismo de Transporte Autorizado: `POST /api/chat/sessions` (nombre, correo, teléfono, `privacy_accepted`, `marketing_accepted` opcional, campo trampa `website` y `cf-turnstile-response` si hay Turnstile), `POST /api/chat/messages` (`text` u `option_id`, siempre con `client_message_id`), `GET /api/chat/history` y `DELETE /api/chat/session` con `{ "confirm": true }`. Respuestas `{ text, options, sources }`, siempre mostradas como texto. Reintentos, idempotencia, 401, 409, 422 y 429 como en [integracion-widget-chatbot.md](integracion-widget-chatbot.md).

Diferencias con el chat de Transporte: no sube fotos ni lleva la cotización ni el formulario de edición de datos; los enlaces de las fuentes se aceptan de ambientalia.cl, Ley Chile, BCN, el Diario Oficial y los dominios del Estado (`.gob.cl`, `minsal.cl`).

En el servidor del asistente, `CHAT_ALLOWED_ORIGINS` debe llevar `https://ambientalia.cl` (y `https://www.ambientalia.cl` si se usa).

## Instalación

1. Plugins → Añadir nuevo → Subir plugin → `ambientalia-asistente.zip` → Activar.
2. Ajustes → Asistente IA: dirección del asistente y, si corresponde, la clave pública de Turnstile. Guardar.
3. Vaciar la caché de páginas y de la CDN (al guardar, el plugin vacía LiteSpeed, WP Rocket y W3 Total Cache).

Para armar el zip: `cd wordpress && zip -qr ../../wordpress/ambientalia-asistente.zip ambientalia-asistente -x '*.DS_Store'` (queda junto al repositorio, como el de Transporte).

## Verificación

1. En incógnito, `https://ambientalia.cl/`: la burbuja aparece abajo a la derecha y la invitación a los 4 s.
2. Ver el código fuente: `window.AMB_ASISTENTE=` trae la dirección configurada.
3. Abrir la burbuja: aparece la puerta. Al entrar, en Red, `POST …/api/chat/sessions` responde 201 y se ve el saludo con el menú.
4. Preguntar algo, tocar una opción, recargar: la conversación vuelve.
5. «Borrar esta conversación» → «Sí, borrar»: vuelve la puerta.
6. La consola no muestra errores de CORS ni de CSP. Repetir en un teléfono.
7. Abrir el editor de Elementor: la burbuja no aparece.

## Prueba local

```
python3 tools/asistente-simulado.py          # http://127.0.0.1:8794
python3 -m http.server 8791                  # en la raíz del repositorio
```

Abrir `http://localhost:8791/ambientalia-asistente.html?asistente=http://127.0.0.1:8794` (`&posicion=izquierda` para la otra esquina). En la vista previa el sitio de atrás todavía muestra su botón de WhatsApp, que queda bajo la burbuja. En el simulado, «lento» tarda 4 s, «error» responde 503 y «caducar» vence la sesión. `?asistente=` vacío vuelve al estado sin dirección. Probado el 10-11-2026 en Chromium (escritorio y 375 px): invitación, sugerencia → datos → pregunta enviada sola, validación de la puerta, Enter para enviar, copiar, menú, opciones, fuentes (la que no es https no se enlaza), texto con etiquetas mostrado como texto, 503 con «Reintentar», recarga con el envío pendiente, borrado, bloqueo de la página y «atrás» en el teléfono. Falta probarlo en un iPhone y un Android reales (teclado).
