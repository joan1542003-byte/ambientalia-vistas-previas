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

## Diseño

- Lenguaje de ambientalia.cl: Montserrat, azul petróleo `#003B49` para lo principal, verdes `#1EB470` y `#1D766B` en los detalles, tarjetas blancas muy redondeadas.
- Burbuja de 60 px (como el botón de WhatsApp del sitio), abajo a la izquierda por omisión: el WhatsApp ocupa la esquina derecha. En los ajustes se puede pasar a la derecha, sobre el WhatsApp.
- Una vez por visita, a los 5 s, una invitación junto a la burbuja («¿Tienes dudas ambientales? Pregúntale al asistente.»), que se va sola a los 12 s. Se puede apagar en los ajustes.
- En el teléfono la ventana ocupa la pantalla y la burbuja se aparta mientras está abierta.
- Shadow DOM: los estilos del tema y de Elementor no la alteran, y ella no altera el sitio. El anfitrión lleva `all: initial`, así que no hereda la tipografía ni los colores del tema.
- Cualquier enlace a `#asistente` (un botón de Elementor, por ejemplo) abre la ventana; desde código, `window.ambAsistente.abrir()`.

## Configuración

| Ajuste | Para qué |
|---|---|
| Mostrar la burbuja | Apagarla sin desactivar el plugin. |
| Dirección del asistente | La base del servicio (`https://…`, sin barra final). La ventana llama a `/api/chat/…` sobre ella y enlaza sus `/condiciones-del-servicio` y `/politica-de-privacidad`. Debe ser https; sin consulta, fragmento ni datos de acceso (se valida al guardar). |
| Clave pública de Turnstile | Solo si el asistente exige Cloudflare Turnstile. La clave secreta queda en el servidor del asistente. |
| WhatsApp y página de contacto | Se ofrecen cuando no hay dirección del asistente. |
| Posición e invitación | Ver «Diseño». |

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

1. En incógnito, `https://ambientalia.cl/`: la burbuja aparece abajo a la izquierda y la invitación a los 5 s.
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

Abrir `http://localhost:8791/ambientalia-asistente.html?asistente=http://127.0.0.1:8794` (`&posicion=derecha` para la otra esquina). En el simulado, «lento» tarda 4 s, «error» responde 503 y «caducar» vence la sesión. `?asistente=` vacío vuelve al estado sin dirección. Probado el 10-11-2026 en Chromium (escritorio y 375 px): puerta, menú, opciones, fuentes (la que no es https no se enlaza), texto con etiquetas mostrado como texto, 503 con «Reintentar», recarga con el envío pendiente y borrado.
