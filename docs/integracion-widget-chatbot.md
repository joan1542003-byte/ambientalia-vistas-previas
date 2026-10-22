# Widget del chat conectado al asistente Laravel

Estado al 20-10-2026. Completa el widget sobre la integración del formulario. **Sin despliegue.** El contrato se leyó directamente del asistente (`agente-transporte-autorizado`, Laravel, revisado en `049f18b`), que no se modificó.

Complementa a [integracion-frontend-laravel.md](integracion-frontend-laravel.md), que cubre el formulario de cotización y la arquitectura general. Aquí solo va lo del chat; el detalle interno del asistente está en su propio repositorio.

## Arquitectura del widget

Es el mismo componente de antes, completado, no uno nuevo:

| Archivo | Qué hace |
|---|---|
| `assets/site/agente-chat.js` | Chat conectado al asistente: puerta de datos, turnos, historial, fotos y borrado. |
| `assets/site/agente-chat.css` | Lo propio del chat sobre `agente.css` (sin rediseño: se sumó solo el estilo de las opciones inactivas). |
| `assets/site/agente.js` y `agente.css` | Maqueta informativa (busca en lo publicado). Solo cambió la condición que decide quién responde. |
| `transporte-autorizado.html`, `agente-virtual.html` | La misma burbuja y la misma ventana (`[data-agente]`). |

**Quién responde.** Lo decide la misma condición en `agente.js` y `agente-chat.js`:

| Situación | Responde |
|---|---|
| Hay dirección del asistente | El chat conectado (`agente-chat.js`) |
| Sin dirección, en una vista previa sin WordPress (GitHub Pages, local) | La maqueta, como antes |
| Sin dirección, sobre WordPress (`window.TA_API` existe) | Nadie: la ventana dice «El asistente en línea no está disponible por ahora…» y no llama a nada. No se activa la maqueta para que no parezca el asistente real |
| `?agente=maqueta`, solo en este computador | La maqueta, aunque haya dirección |

**Decisiones de interfaz** (el diseño no cambió):
- La etiqueta «Prueba local» aparece solo en `localhost`; fuera de ahí la cabecera dice «Asistente».
- El botón del pie pasó de «Cambiar mis datos» a **«Borrar esta conversación»**, el nombre que usa la política del asistente (`/eliminacion-de-datos`). Después de borrar vuelve la puerta, así que también sirve para empezar con otros datos.
- Las opciones de respuestas anteriores quedan inactivas: ya no corresponden al estado de la conversación.
- `agente-virtual.html` ahora carga `site.js`, para leer la dirección con `window.SITE.asistente()` como las demás páginas.

## Configuración por entorno

La dirección es **la misma de las cotizaciones** y sale de `window.SITE.asistente()` (`site.js`), en este orden:

1. **Solo en este computador** (`localhost` o `127.0.0.1`): `?asistente=<dirección>`. La pestaña la recuerda (`sessionStorage`, clave `ta-asistente`); `?asistente=` vacío la borra.
2. **WordPress:** la del plugin, en «Ajustes del sitio → Cotizaciones de Transporte → Dirección del asistente». La página la recibe en `window.TA_API.asistente`.
3. **Atributo `data-agente-api`** de la ventana. Está vacío en el repositorio: nunca se publica una dirección fija.

Fuera de este computador la dirección debe ser `https`. Se aceptan otras rutas base, pero no usuario, consulta ni fragmento; esto se valida en `site.js` y, al guardar, en el plugin.

| | Desarrollo local | Staging | Producción |
|---|---|---|---|
| Dirección | `?asistente=http://127.0.0.1:8000` (o la que use Laravel local) | Ajuste del plugin, con https | Ajuste del plugin, con https |
| `CHAT_ALLOWED_ORIGINS` en Laravel | Origen del sitio local (p. ej., `http://127.0.0.1:8080`) | Origen exacto del WordPress de staging | Origen exacto del WordPress de producción |
| Turnstile | Opcional (`data-turnstile`) | Clave pública en el plugin; la secreta, solo en Laravel | Ídem |
| Espera por respuesta | `data-agente-espera` (90 s por omisión) | Ídem | Ídem |

- La clave pública de Turnstile se toma de `window.TA_API.turnstile` o de `data-turnstile`.
- Ninguna credencial privada llega al navegador: solo la dirección pública de la API y la clave pública de Turnstile.

## Endpoints utilizados

Todos van directo del navegador al asistente, sin pasar por WordPress:

| Método y ruta | Uso |
|---|---|
| `POST /api/chat/sessions` | Abrir la sesión desde la puerta. |
| `POST /api/chat/messages` | Cada turno: texto u opción. |
| `GET /api/chat/history` | Repintar la conversación al volver. |
| `POST /api/chat/attachments` | Subir una foto. |
| `DELETE /api/chat/session` | Borrar esta conversación. |
| `GET /condiciones-del-servicio`, `/politica-de-privacidad`, `/eliminacion-de-datos` | Enlaces legales; se abren en otra pestaña, no son llamadas de la página. |

## Contratos relevantes (leídos en Laravel)

**Respuesta (`reply`):** `{ text, options: [{ id, label, description? }], sources: [{ label, url? }], intent, lead_status }`.
- El texto es plano.
- El asistente ya lo sanea y aun así el widget lo trata como no confiable.

**Consumo (`usage`):** `{ max, used, remaining, resets_at }`.

**Sesión.**
- Requiere `name` (2 a 150), `email` (hasta 150), `phone` (8 a 15 dígitos) y `privacy_accepted`.
- Son opcionales `marketing_accepted`, el campo trampa `website` y `cf-turnstile-response` (si hay Turnstile).
- Responde `201 { token, expires_at, reply, usage }`.
- El token va en `Authorization: Bearer` y dura `CHAT_SESSION_TTL_HOURS` (24 h).

**Turno.**
- Lleva `text` (hasta `CHAT_MAX_MESSAGE_LENGTH`, 1000; el campo del sitio corta en 240) u `option_id` (hasta 100).
- Lleva siempre `client_message_id` (hasta 64 caracteres, `[A-Za-z0-9_-]`).

**Comandos del asistente**, como texto o como `option_id`:
- `inicio` (también «menu», «reiniciar»…): vuelve al menú y no gasta consultas. Lo usa «Empezar una conversación nueva» y el historial vacío.
- `volver` y `cancelar`: el asistente los acepta, pero sus respuestas no los traen como opciones. Por eso el widget no agregó un botón «Volver»; la persona puede escribirlo.

**Historial.**
- `{ messages: [{ role, text, options, sources, intent, lead_status }] }`, con hasta 50.
- No trae `usage`, fotos ni `client_message_id`, ni el estado completo del flujo guiado (solo `intent` y `lead_status` de cada respuesta).

**Foto.**
- Campo `image`: jpg, jpeg, png o webp, hasta `CHAT_ATTACHMENT_MAX_KB` (5120). El tipo se comprueba por el contenido.
- Hasta `CHAT_ATTACHMENTS_MAX` (2) por visitante.
- Responde `201 { attachment, reply, usage }`.

**Borrado:** cuerpo `{ "confirm": true }`.

**Límites:**
- Por sesión, por IP y globales: al pasarlos, el asistente responde `429` (ver «Errores HTTP»). Sus valores son configuración del asistente.
- Un turno a la vez por sesión: espera hasta 5 s (`CHAT_LOCK_WAIT_SECONDS`) y si no, responde `409 busy`.

## Gestión de sesión

**Qué se guarda en la pestaña** (`sessionStorage`, clave `agente-chat`): solo el **token**, su **vencimiento** y **cuántas fotos se subieron**.
- Los datos de la puerta (nombre, correo, teléfono) quedan solo en memoria, para no volver a pedirlos en la misma página.
- La conversación no se guarda en el navegador: se pide al asistente.
- Tampoco el texto pendiente ni nombres de archivo.

| Caso | Comportamiento |
|---|---|
| Token vigente | Al abrir, `GET /history` con ese token y se repinta. |
| Token vencido (según `expires_at`) o con forma inválida | Se descarta sin llamar al servicio y aparece la puerta. |
| Sesión inválida en el servidor (`401 session_expired`) | Olvida el token, avisa y muestra la puerta. Si fue al enviar, lo escrito vuelve al campo. |
| Historial vacío | Pide el menú con `inicio`, que no se muestra como mensaje propio. |
| Recarga de página | Igual que «token vigente». Si el historial falla por red, se ofrece «Reintentar» sin perder el token. |

## Idempotencia y reintentos

Cada mensaje nace con un `client_message_id` (UUID) y lo conserva **hasta que el servicio responde o la persona escribe otra cosa**. El asistente lo identifica dentro de la sesión del visitante y:
- si ya lo procesó, devuelve la misma respuesta (`duplicate: true`) sin ejecutar nada. Si esa respuesta no quedó guardada, llega `reply: null` y el widget dice que el mensaje ya se había recibido;
- si lo está procesando, responde `409 busy`;
- si falló, lo reintenta hasta `CHAT_MESSAGE_MAX_ATTEMPTS` (3) en total.

| Situación | Qué hace el widget | Identificador |
|---|---|---|
| Espera agotada (`data-agente-espera`, 90 s) o `504` del proxy | Reintenta solo, hasta 2 veces, con pausas de 3 y 6 s. Después ofrece «Reintentar». | El mismo |
| `409 busy` | Igual: 2 reintentos solos y después «Reintentar». | El mismo |
| Sin conexión (no hubo respuesta) | No reintenta solo. Ofrece «Reintentar» y aclara que, si el mensaje llegó, no se repetirá. | El mismo |
| `503 unavailable` (o 500, 502, 503 en HTML, 429) | Mensaje del asistente o propio y «Reintentar». | El mismo |
| Escribir otra vez el mismo texto (o tocar la misma opción) mientras está pendiente | Es el mismo mensaje: se reintenta, sin repetir la burbuja. | El mismo |
| `409 idempotency_conflict` | Muestra el mensaje del asistente. No se reintenta ni ofrece «Reintentar». | Se descarta; el próximo mensaje lleva otro |
| `422` | Texto propio en español (el asistente no traduce esa validación). Lo escrito vuelve al campo. | Se descarta |
| `401` | Va a la puerta (ver arriba). | Se descarta |
| `403 origin_not_allowed` | «El asistente no está disponible desde esta página». | Se descarta |

**Topes:**
- 2 reintentos automáticos (solo la primera vez) y 3 manuales por mensaje: como máximo 6 envíos del mismo mensaje.
- Después, el widget pide escribirlo de nuevo más tarde o usar el formulario o WhatsApp.
- No hay bucles: el modelo nunca se llama dos veces por el mismo identificador, salvo el reintento que el propio asistente admite tras una falla.

**Sin envíos simultáneos.** Mientras hay un turno, una foto, un borrado o la lectura del historial, no sale otra llamada: Enter repetido, toques a opciones (iguales o distintas) y «Reintentar» múltiple no generan llamadas extra.

**Hallazgo en las pruebas:** cuando se corta un socket reutilizado, Chrome reenvía solo el mismo POST (mismo cuerpo, mismo identificador). El asistente lo reconoce y devuelve la respuesta ya procesada; sin el identificador estable, ese reenvío sería un segundo turno.

## Historial

- **Se repinta:**
  - los mensajes de la persona y del asistente;
  - las negritas;
  - las fuentes, con las mismas reglas de enlaces;
  - las opciones, solo las de la última respuesta, porque las anteriores ya no corresponden.
- **Si el último mensaje es de la persona** (turno en curso o fallido): aparece «Tu último mensaje todavía no tiene respuesta» con «Actualizar», que vuelve a leer el historial **sin reenviar** nada.

**No se recupera, porque el contrato no lo entrega:**
- el consumo de consultas, que aparece con la próxima respuesta;
- cuántas fotos se subieron: el número local de la pestaña cubre la recarga, y si no, manda el `422 attachment_limit`;
- el identificador de un mensaje que quedó sin respuesta, así que no se puede reintentar de forma idempotente después de recargar;
- `intent` y `lead_status`, que llegan pero el widget no los necesita para mostrar la conversación.

## Fotos

| Regla | Cómo |
|---|---|
| Formatos | JPG, PNG o WebP: por tipo MIME o, sin tipo, por extensión. El selector solo ofrece esos. |
| Tamaño | La original, hasta 25 MB, para no agotar la memoria del teléfono. La que se sube, hasta 5120 KB, el tope del asistente. |
| Máximo | 2 por conversación. Antes de subir, por el número guardado en la pestaña; después, por el `422 attachment_limit` del asistente, que manda. |
| Reducción | Se lleva a 1600 px como máximo y a JPEG 0,85, sobre fondo blanco (un PNG transparente no queda negro). Respeta la orientación EXIF y **no conserva EXIF** (ubicación ni datos de la cámara). |
| Si la conversión falla | **No se sube nada.** Antes se subía la original. |
| Nombre | Neutro (`foto-1.jpg`, `foto-2.jpg`): el nombre original puede llevar datos personales y no sale del navegador. |
| Duplicadas | La misma foto (nombre, tamaño y fecha) ya confirmada no se vuelve a subir. |
| Pegar o soltar | En la ventana del chat se adjunta al chat y el evento **no sigue** hacia el documento. El formulario de cotización (`transporte-ui.js`, que escucha `paste` y `drop` en todo el documento) no la recibe. Fuera del chat, todo sigue como antes. |
| Móvil | Selector con `accept` de los tres tipos (iOS entrega JPEG) y `multiple`. Se procesan una a una. |

La subida no tiene identificador propio en el contrato. Por eso, si no hubo respuesta, no se reintenta sola: el widget dice que no pudo confirmar si llegó y que, si la vuelve a adjuntar, podría quedar dos veces. El tope de 2 acota el efecto.

## Seguridad de respuestas, fuentes y DOM

- **Todo lo que viene del asistente entra como texto** (`textContent` o nodos de texto):
  - el texto de la respuesta;
  - los rótulos y las descripciones de las opciones (en `title`);
  - los rótulos de las fuentes;
  - los mensajes de error.
- `innerHTML` solo se usa para los íconos escritos en el propio archivo.
- Ningún atributo de evento se arma con datos del modelo, y el `id` de una opción solo viaja en el JSON.
- **Formato:** solo `**negrita**`, que se arma con `<strong>` y su texto.
- **Enlaces dentro de `reply.text`:** **no se convierten** (se eliminó `conEnlaces`). Una dirección escrita por el modelo se ve como texto.
- **Fuentes:** el enlace sale solo de `reply.sources[].url`, y solo si:
  - es `http(s)`, sin usuario ni clave;
  - es del propio origen de la página (https en staging y producción; http solo en una vista local), o
  - es `https` hacia `transporteautorizado.cl`, `bcn.cl`, `leychile.cl` (con sus subdominios) o cualquier dominio del Estado (`*.gob.cl`).
- **Origen de esa lista:** son los dominios de las fuentes del corpus del asistente (www.bcn.cl, bcn.cl, www.leychile.cl, portalvu.mma.gob.cl y el sitio), más `*.gob.cl` para no bloquear normas oficiales legítimas. Se amplía en la constante `FUENTES` de `agente-chat.js`.
- **Fuente que no cumple:** se muestra igual, con su rótulo y sin enlace. Quedan fuera `javascript:`, `data:`, `http` externo, dominios parecidos (`bcn.cl.evil…`, `evil-gob.cl`) y direcciones relativas.
- **Cómo se abren:** las externas en otra pestaña con `rel="noopener noreferrer"`. Las de `transporteautorizado.cl` se muestran en este sitio, como en la maqueta.

## CSP (plugin `ta-sitio` 1.3.0)

**Lo que exige el chat:**
- `connect-src` con el origen del asistente;
- con Turnstile, `script-src` y `frame-src` con `https://challenges.cloudflare.com`.

**Lo que ya hace el plugin:** con la «Dirección del asistente» configurada, `ta_sitio_politica()` lo agrega (en la cabecera y en el `<meta>`). **No hubo que cambiar el plugin.**

**Lo que no exige:**
- Los enlaces legales y las fuentes son navegación, no conexiones.
- La reducción de fotos usa `canvas` y `createImageBitmap`, sin `blob:` en la página.

**Prueba:** se sirvió la página con el código real del plugin (`tools/pruebas/pagina-wp.php`, que llama a `ta_sitio_pagina()` con funciones de WordPress simuladas) y el chat completo funcionó sin violaciones de CSP. Si se quita el origen del asistente de `connect-src`, el chat deja de funcionar y la prueba lo detecta.

**Caché:** el plugin entrega los archivos con `?v=` como inmutables por un año. Por eso se subió la versión a `20261020b` en las 24 páginas, el mismo valor en todas. Las 20 páginas generadas (normativa y ayuda) solo cambiaron en `?v=`, como lo haría el generador; queda pendiente correrlo con Python 3.12 o más nuevo.

## Errores HTTP

| Ruta | Estado | Qué ve la persona | ¿Token? |
|---|---|---|---|
| sesiones | 201 | Saludo y opciones | Nuevo |
| sesiones | 422 | Los mensajes del asistente (en español); también si Turnstile falla | — |
| sesiones | 429 | Con `error`: el mensaje del asistente (tope global). Sin `error`: «Hubo muchos intentos desde esta conexión» | — |
| sesiones | 403 / sin red | «No está disponible desde esta página» / «No pude conectarme» | — |
| sesiones | 500 u otro | «No pude abrir el chat»: texto propio, porque el de Laravel en esos casos viene en inglés («Server Error») | — |
| mensajes | ver «Idempotencia y reintentos» | | Se conserva, salvo 401 |
| historial | 401 | Puerta | Se olvida |
| historial | otro / sin red | «No pude recuperar…» o «No pude conectarme…» y «Reintentar» | Se conserva |
| fotos | 201 | Acuse del asistente | — |
| fotos | 422 | Mensaje del asistente (formato o tope) | — |
| fotos | 5xx / sin red | «No pude confirmar si la foto llegó…» | Se conserva |
| fotos | 429 / 403 / 401 | Mensaje propio / no disponible / puerta | 401: se olvida |
| fotos | otro (p. ej., 413) | «No pude subir la foto»: texto propio | — |
| borrado | 200 `deleted` | «Listo: borramos esta conversación…» y la puerta | Se olvida |
| borrado | 409 `busy` | «Hay una respuesta en curso… todavía no se borró nada», con «Reintentar el borrado» | **Se conserva** |
| borrado | 500 `erasure_pending` | «Recibimos tu solicitud y cerramos la sesión. El borrado quedó en curso…» (**no** dice que se borró) | Se olvida (el asistente ya la revocó) |
| borrado | sin red | «No pude confirmar el borrado…», con «Reintentar el borrado» | **Se conserva** |
| borrado | 429 u otro | Texto propio (el del limitador viene en inglés), que aclara que todavía no se borró nada, con «Reintentar el borrado» | **Se conserva** |
| borrado | 401 | Si antes hubo un intento sin respuesta: «La sesión ya está cerrada. Si tu solicitud anterior alcanzó a llegar, ya se borró; si no, revisa el aviso de privacidad». Si no: «Tu sesión ya había terminado…» | Se olvida |

**Detalles del borrado:**
- «Borrar esta conversación» pide confirmación en el propio chat, con «Sí, borrar» y «Cancelar», y explica lo que no alcanza: una solicitud ya enviada al equipo.
- Mientras se borra, los botones quedan inactivos: tres toques hacen una sola llamada.
- «Cancelar» no llama a nada.

## Pruebas

- **Infraestructura:** las mismas herramientas del repositorio, sin dependencias nuevas.
  - Node 22 y un navegador sin interfaz controlado por DevTools (Brave en este equipo).
  - El asistente Laravel se simula en un servidor local con su contrato, incluida la idempotencia por `client_message_id`.
  - El navegador no sale a internet (están bloqueados BCN, Turnstile, WhatsApp y los dominios de ejemplo).
- **Lo que no se hizo:** ninguna llamada real a Laravel ni a Odoo.

| Comando | Resultado |
|---|---|
| `node tools/pruebas/widget.mjs` (nuevo) | **75 ok, 0 fallas** |
| `node tools/pruebas/integracion.mjs` (formulario, HDS, Campañas, WhatsApp, plugin, paquete, sintaxis; con navegador) | **115 ok, 0 fallas**, sin avisos |
| `php tools/pruebas/plugin.php` | Todo bien (20) |
| `php -l` (plugin y arneses de prueba) | Sin errores |

**Cobertura de `widget.mjs`** (los números siguen la lista pedida):
1. Configuración: maqueta en la vista previa; «no disponible» en WordPress sin dirección (sin llamadas); dirección del plugin; `?asistente=` recordado; `?agente=maqueta`; sin dirección fija en el HTML; validación de la dirección.
2. Sesión: campos, origen, consentimientos y qué queda en la pestaña.
3. Mensaje exitoso: token, identificador, respuesta y consumo.
4. Opciones: envían su `option_id`, se ve su rótulo y las anteriores quedan inactivas.
5. Reintento manual con el mismo identificador, incluso con tres toques a «Reintentar».
6. `409 busy`: reintentos solos acotados y después «Reintentar».
7. `409 idempotency_conflict`: no se reintenta y el siguiente mensaje lleva otro identificador.
8. `503` del asistente y `503` en HTML.
9. Espera agotada a los 5 s: tres llamadas con el mismo identificador y una sola ejecución del modelo.
10. Pérdida de conexión, incluido el reenvío del propio navegador: se recupera la respuesta procesada con una sola ejecución.
11. Historial: repintado, opciones de la última respuesta, «Actualizar» sin reenviar e historial vacío.
12. Expiración: token vencido en la pestaña, `401` al leer el historial y `401` al enviar (el texto vuelve al campo).
13. Borrado exitoso.
14. Borrado ocupado: conserva el token.
15. Supresión pendiente, y red seguida de `401`.
16. Fotos válidas: PNG reducida a JPEG con nombre neutro; JPEG sin el bloque EXIF.
17. Fotos inválidas: GIF, archivo ilegible y más de 25 MB; no se sube nada, tampoco la original.
18. Límite de fotos: 2 en el navegador, `422 attachment_limit` del asistente, duplicadas, pegadas y soltadas en el chat sin tocar el formulario.
19. Enlaces maliciosos: `javascript:`, `data:`, http, dominios ajenos o parecidos, usuario y clave, relativos.
20. Fuentes autorizadas y guías del sitio.
21. DOM: HTML del modelo como texto, sin atributos de evento y `window.__xss` intacto.
22. WordPress: página del plugin con su CSP real, sin violaciones; sin proxy; Turnstile del plugin.
23. Sin envíos duplicados: puerta, Enter, opciones iguales y distintas. Sin errores de JavaScript.

**Validación con mutaciones.** Se inyectaron 17 defectos, cada uno en una copia temporal del repositorio, y `widget.mjs` los detectó todos:
- identificador nuevo al reintentar;
- conflicto tratado como `busy`;
- texto como HTML;
- fuentes sin validar;
- borrado sin `confirm`;
- olvidar el token ante `busy`;
- subir la original si falla la conversión;
- pegar que llega al formulario;
- sin espera máxima;
- opciones de todo el historial;
- sin freno de concurrencia;
- CSP del plugin sin el asistente;
- reintentos sin tope;
- maqueta sobre WordPress;
- mostrar el texto en inglés de Laravel al borrar (`429`), al abrir la sesión (`500`) o al subir una foto (`413`).

El freno de concurrencia primero no se detectó (lo cubría la segunda guarda) y se agregó la prueba de dos opciones distintas.

## Limitaciones

- **Recuperación tras recargar (no garantizada):** el identificador de un mensaje pendiente vive solo en la memoria de la página; no se guarda en el navegador, para no conservar mensajes ni datos personales. Si la página se recarga con un mensaje sin respuesta, el widget no puede reintentarlo con el mismo identificador. Ofrece «Actualizar», que relee el historial sin reenviar nada. Si la persona lo escribe de nuevo, es un mensaje nuevo (otro identificador) y el asistente lo procesa otra vez.
- **Historial:** no devuelve consumo, fotos ni identificadores (ver «Historial»).
- **Fotos:** la subida no es idempotente en el contrato (ver «Fotos»).
- **Retry-After:** CORS no lo expone, así que en un 429 el widget no sabe cuánto esperar y pide «un momento».
- **Validación del turno:** sin traducciones (`lang/es`), los 422 de `/messages` llegarían en inglés. El widget muestra un texto propio.
- **Navegadores antiguos:** sin `createImageBitmap` (Safari anterior a 15), las fotos no se pueden convertir y no se suben. El mensaje lo dice.
- **Tiempos de espera:** ver la sección siguiente.

## Tiempos de espera (a confirmar en staging)

**El widget** espera 90 s cada respuesta (`data-agente-espera`). Las demás llamadas esperan 30 s y las fotos, 60 s. Tras una espera agotada se reintenta solo dos veces (a los 3 y a los 6 s) con el mismo identificador.

**Cómo fijar `data-agente-espera`:** debe ser **mayor** que el turno más largo del asistente y **menor** que el corte del proxy que tenga delante. Los tiempos del asistente y del proxy se miden y se ajustan en staging, con la documentación del asistente.
- **El widget y el modelo tienen hoy el mismo límite (90 s), sin margen** para la búsqueda en documentos, la base de datos y el resto del turno. Un turno que pasa de 90 s no se pierde: el reintento solo recibe `409 busy` mientras sigue en curso y, cuando termina, la misma respuesta. Si conviene más margen, se sube `data-agente-espera`.
- **Cloudflare** (si se usa como proxy) corta a los 100 s con un `524`. Queda después de los 90 s del widget.
- **Los errores que genera el propio proxy** (`504` de nginx, `524` de Cloudflare) normalmente no traen las cabeceras CORS, que pone Laravel. El navegador los ve como una falla de red: el widget no reintenta solo y ofrece «Reintentar» con el mismo identificador. El reintento automático de un `504` solo ocurre si el proxy agrega CORS. Un `524` siempre pasa por «Reintentar».

## Pendientes de staging y producción

- **Laravel desplegado aparte, con HTTPS** y el origen exacto de cada WordPress en `CHAT_ALLOWED_ORIGINS`. Lo prepara quien despliega el asistente, con su propia documentación.
- **Plugin 1.3.0 en un WordPress de staging** (no en el real) con la «Dirección del asistente». Revisar ahí, con el navegador:
  - la CSP real (cabecera y `<meta>`), incluido si el servidor reemplaza la cabecera;
  - CORS (preflight con `Authorization` y `DELETE`);
  - Turnstile;
  - la caché de LiteSpeed y de una CDN, si la hay: que no se guarde la respuesta de la API y que los `?v=` nuevos lleguen.
- **Tiempos:** medir en staging cuánto tarda un turno real, confirmar el proxy que se use y si sus errores traen CORS, y ajustar `data-agente-espera` (ver «Tiempos de espera»).
- **Prueba de punta a punta en staging:**
  - sesión, turnos, opciones, historial tras recargar, foto desde un teléfono real (iOS y Android) y borrado;
  - la recepción de la solicitud del chat en Odoo de prueba.
- **Generador oficial:** `python3 tools/normativa.py` con Python 3.12 o más nuevo, que debería dejar las 20 páginas igual.
