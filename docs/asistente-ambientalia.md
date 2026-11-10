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

## Diseño (1.2.0, 10-11-2026): idéntico al de Transporte Autorizado

- **La burbuja «?» de Transporte** (`assets/site/site.css`, `.dock`; `site.js`): vidrio teñido con el verde, que al tocarla se expande como vidrio líquido y muestra, de arriba abajo, **Contacto** (destacada), **WhatsApp** y **Chat con IA** (con su borde de luz que gira y su halo), con «¿En qué te ayudamos?» junto a la X. Se cierra al elegir una, al tocar fuera o con Escape. Siempre a la vista, abajo a la derecha (el botón de WhatsApp del sitio se retira; en los ajustes puede ir a la izquierda).
- **La ventana del chat de Transporte** (`agente.css`, `agente-chat.css`; `agente.js`): nace desde la burbuja, que pasa a X y la cierra; cabecera con «Volver» (vuelve a las opciones), avatar, «Asistente» y «Empezar una conversación nueva»; mensajes, opciones, fuentes, campo redondo y «Borrar esta conversación» al pie. En el teléfono va sobre la burbuja, casi a todo el ancho, y se apoya sobre el teclado. Al abrir sin sesión saluda «Hola. ¿En qué te ayudo?» con preguntas de ejemplo, como el de Transporte.
- **Los mismos textos, medidas, curvas y animaciones**; el CSS se copió de Transporte y solo cambian los colores y la tipografía:
  - acento `#006248`, el verde del vidrio del header de ambientalia.cl (`rgba(0, 98, 72, .68)`), con `#004a37` al presionar;
  - el borde y el halo de «Chat con IA» en ese verde, la menta `#78DCB4` y el cian `#4DDBF0` del sitio;
  - sombras teñidas de verde en vez de azul;
  - Montserrat, la letra del sitio, en vez de Nunito.
- **Flujo:** se puede preguntar de inmediato (escribiendo o con un ejemplo); la pregunta queda a la vista, se piden nombre, correo, teléfono y la aceptación, y al entrar se envía sola.
- **Shadow DOM:** los estilos del tema y de Elementor no la alteran, y ella no altera el sitio. El anfitrión lleva `all: initial`.
- Cualquier enlace a `#asistente` (un botón de Elementor, por ejemplo) abre el chat; desde código, `window.ambAsistente.abrir()` o `window.ambAsistente.preguntar('…')`.

## Configuración

| Ajuste | Para qué |
|---|---|
| Mostrar la burbuja | Apagarla sin desactivar el plugin. |
| Dirección del asistente | La base del servicio (`https://…`, sin barra final). La ventana llama a `/api/chat/…` sobre ella y enlaza sus `/condiciones-del-servicio` y `/politica-de-privacidad`. Debe ser https; sin consulta, fragmento ni datos de acceso (se valida al guardar). |
| Clave pública de Turnstile | Solo si el asistente exige Cloudflare Turnstile. La clave secreta queda en el servidor del asistente. |
| WhatsApp y página de contacto | Las acciones «WhatsApp» y «Contacto» de la burbuja. Sin número, no se muestra WhatsApp; sin página, Contacto va a `/contacto/`. |
| Posición | Derecha por omisión. |

Sin dirección, la burbuja sigue con Contacto y WhatsApp, y el chat dice «El asistente en línea no está disponible por ahora»; no llama a nada. Ninguna dirección ni clave va dentro del plugin.

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

1. En incógnito, `https://ambientalia.cl/`: la burbuja «?» aparece abajo a la derecha; al tocarla, Contacto, WhatsApp y Chat con IA.
2. Ver el código fuente: `window.AMB_ASISTENTE=` trae la dirección configurada.
3. Chat con IA: aparece el saludo con ejemplos; al elegir uno, la puerta. Al entrar, en Red, `POST …/api/chat/sessions` responde 201 y se ve el saludo con el menú.
4. Preguntar algo, tocar una opción, recargar: la conversación vuelve.
5. «Borrar esta conversación» → «Sí, borrar»: vuelve la puerta.
6. La consola no muestra errores de CORS ni de CSP. Repetir en un teléfono.
7. Abrir el editor de Elementor: la burbuja no aparece.

## Prueba local

```
python3 tools/asistente-simulado.py          # http://127.0.0.1:8794
python3 -m http.server 8791                  # en la raíz del repositorio
```

Abrir `http://localhost:8791/ambientalia-asistente.html?asistente=http://127.0.0.1:8794` (`&posicion=izquierda` para la otra esquina). En la vista previa el sitio de atrás todavía muestra su botón de WhatsApp, que queda bajo la burbuja. En el simulado, «lento» tarda 4 s, «error» responde 503 y «caducar» vence la sesión. `?asistente=` vacío vuelve al estado sin dirección. Probado el 10-11-2026 (1.2.0) en Chromium, escritorio y 375 px, junto a la burbuja de Transporte: menú de la burbuja, Chat con IA, ejemplo → datos → pregunta enviada sola, «Volver» a las opciones, X que cierra el chat, recarga con la conversación, opciones, fuentes, texto con etiquetas mostrado como texto, 503 con «Reintentar» y borrado. Falta probarlo en un iPhone y un Android reales (teclado) y sobre el WordPress real.
