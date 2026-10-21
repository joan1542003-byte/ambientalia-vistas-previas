# Integración del sitio con el asistente Laravel (cotizaciones de Transporte)

Estado al 20-10-2026: fusión de `cambios-15-10` y `conexion-odoo` (ver «Estrategia de integración de las ramas»). **No se desplegó nada**: ni WordPress ni Laravel. El asistente es el repositorio aparte `agente-transporte-autorizado` (Laravel), revisado en `049f18b`.

## Decisión

El cliente decidió que **el asistente Laravel es el único backend de las cotizaciones de Transporte Autorizado**. Recibe, valida, guarda y entrega a Odoo:

- el formulario de cotización del sitio;
- las solicitudes del chat con IA, que vendrán en el siguiente bloque.

WordPress (plugin `ta-sitio`) es la capa de presentación. El sitio no tiene otro conector de Odoo ni llama a Odoo: lo hace el asistente, que crea una `project.task` con sus fotos como `ir.attachment`. HDS y Campañas quedan fuera de esta tarea y conservan su comportamiento.

## Aplicaciones desacopladas

El frontend (este repositorio, que WordPress sirve con el plugin `ta-sitio`) y el backend (Laravel, repositorio `agente-transporte-autorizado`) son **aplicaciones independientes**:
- tienen repositorios, servidores y despliegues separados;
- no son un monolito;
- no necesitan compartir servidor ni dominio.

**Cómo se comunican:**
- El navegador de la persona llama directamente a la API pública de Laravel por **HTTPS**:
  - `POST /api/quotes` para la cotización;
  - `/api/chat/*` para el chat, en el siguiente bloque.
- No hay proxy en WordPress.
- Laravel controla CORS (`CHAT_ALLOWED_ORIGINS`) y todas las validaciones del servidor.

**Lo que el plugin hace y no hace:**
- Presenta la página y le entrega configuración **pública**: dirección de la API y clave pública de Turnstile en `window.TA_API`, más la CSP que admite ese origen.
- No contiene código de Laravel.
- No accede a la base de datos MySQL de Laravel.
- No se conecta a Odoo.
- No llama a la API desde el servidor.
- No guarda credenciales.

**Lo que el frontend conoce del backend (el contrato):**
- solo las rutas públicas `/api/quotes`, `/api/chat/*`, `/politica-de-privacidad` y `/condiciones-del-servicio`;
- los campos y respuestas de esas rutas;
- dos valores de configuración copiados en el sitio: 2 fotos por solicitud y 5 MB por foto (`CHAT_ATTACHMENTS_MAX` y `CHAT_ATTACHMENT_MAX_KB`).

Laravel sigue siendo la autoridad. Si cambia esos valores, el sitio muestra su 422 hasta que se ajuste `data-max`. Nada del sitio depende de sus jobs, tablas ni modelos.

**Actualizaciones independientes:**
- Laravel se actualiza sin rehacer el sitio mientras conserve el contrato.
- El plugin se actualiza sin desplegar Laravel.
- Cambiar la dirección de la API es un ajuste de WordPress, no un cambio de código.

| | Desarrollo local | Staging | Producción |
|---|---|---|---|
| Sitio | En `localhost` o `127.0.0.1` (servidor estático o WordPress local) | WordPress de pruebas con el plugin 1.3.0 | WordPress de `transporteautorizado.cl` con el plugin |
| Dirección de la API | `?asistente=http://127.0.0.1:8000` (solo en localhost; admite `http`) | «Ajustes del sitio → Dirección del asistente», `https://` del Laravel de pruebas | La misma opción, con el `https://` del Laravel de producción |
| Turnstile | Sin clave (opcional) | Clave pública del widget de pruebas; la secreta, solo en Laravel | Clave pública del widget de producción; la secreta, solo en Laravel |
| Laravel, `CHAT_ALLOWED_ORIGINS` | `http://127.0.0.1:<puerto>` del sitio local | El origen exacto del WordPress de pruebas | `https://transporteautorizado.cl` y la variante con `www` si se usa |
| Odoo | Nunca el real: un Odoo de prueba o la entrega desactivada | Odoo de prueba | Odoo real (lo configura solo Laravel) |

- No hay dominios fijos en el sitio publicado.
- Los nombres de dominio de staging y producción de la API los define quien despliegue Laravel.

## Arquitectura

```
Página de Transporte (estática, o servida por el plugin ta-sitio en WordPress)
  form#cotizacion[data-cotizar-api] ──POST /api/quotes (una vez por envío)──▶ asistente Laravel ──▶ Odoo (project.task)
  asistente de retiro ──«Enviar en línea»──▶ el mismo formulario
  WhatsApp ──▶ contacto manual opcional, independiente de Laravel (no es un chatbot ni crea solicitudes)
  Copiar ──▶ el resumen al portapapeles

WordPress: /wp-json/ta/v1/solicitudes sigue en el plugin para otros formularios; Transporte no lo usa.
```

## Estrategia de integración de las ramas

- Las tres ramas parten de `a55a3cc` (`main`):
  - `origin/cambios-15-10` (`c1f073f`, Johan) suma 2 commits;
  - `origin/conexion-odoo` (`906b1c9`) suma 7.
- **Base:** se tomó `origin/cambios-15-10`, que es `main` más el trabajo de Johan (86 archivos, entre ellos el plugin), y se creó la rama sin seguimiento remoto.
- **Fusión:** se fusionó `origin/conexion-odoo` con `git merge --no-commit --no-ff`. La historia de las dos ramas queda en el commit de fusión y no se reescribe nada.
- **Sin conflicto:** se fusionaron solos `AGENTS.md`, `docs/contexto-proyecto.md`, `agente-chat.js`, `agente-chat.css`, `transporte.css` y `.gitignore`.
- **En conflicto:** 21 archivos, en dos grupos.
  - **Fuentes, resueltas a mano:**

    | Archivo | Conflictos | Resolución |
    |---|---|---|
    | `assets/site/site.js` | 4 | Las dos ramas reescribieron a la vez el armado del resumen (Johan con `sectionsOf()`, conexion-odoo con `rowsOf()`/`form.summaryRows()`), con la misma salida. Queda una sola versión (`rowsOf`), y el envío a WordPress de Johan la usa con `form.summaryRows()`. |
    | `assets/site/transporte-ui.js` | 1 | Nota de las fotos en el resumen: se conserva el texto de Johan, con la condición del envío al asistente. |
    | `transporte-autorizado.html` | 3 | Dos son de versión (`?v=`). El tercero es el botón del resumen: queda solo «Enviar solicitud» del asistente (`data-cotizar-enviar`) y sale el de WordPress (`data-enviar`). |
    | `hds.html`, `campanas-reciclaje.html`, `agente-virtual.html` | 2 cada uno | Solo versión. |

  - **Páginas generadas** (15 en conflicto, 20 al día): `normativa/*.html` y `ayuda/*.html`. Se tomó la versión de Johan como base y se rehicieron la tarjeta, la burbuja y la versión desde la fuente (ver «Páginas generadas»).
- **Versión de los archivos:** pasa a `?v=20261020a` en todas las páginas, la misma en todas, como pide `AGENTS.md`.

### Qué se conserva de cada rama

- **De Johan (`cambios-15-10`):**
  - el plugin `wordpress/ta-sitio/` y `tools/wordpress.py`;
  - logo oficial y sello Yo Reciclo;
  - cuatro normas nuevas con su caché y PDF;
  - checklist en línea (`checklist.js` y su página);
  - Leaflet y NumberFlow incluidos en el sitio;
  - cambios del asistente de retiro y de `pickers.js`, `mapa.js` y los CSS;
  - en `site.js`: el envío a WordPress (`window.SITE.enviar`, `fotos`, `enviando`, `permiso`), que sigue disponible para otros formularios.
- **De `conexion-odoo`:**
  - el envío del formulario a `/api/quotes` con consentimiento, contacto comercial opcional, campo trampa, Turnstile y `client_request_id`;
  - `form.summaryRows()`;
  - los cambios de `agente-chat.js` y `agente-chat.css`: Turnstile, campo trampa y `marketing_accepted` en la puerta del chat;
  - los estilos del envío.

### Cambios propios de esta integración

- **`site.js`:**
  - `window.SITE.asistente()` resuelve la dirección del asistente por entorno;
  - el envío de WordPress no se conecta a un formulario con `data-cotizar-api`;
  - sale `window.ADJUNTOS`.
- **`transporte-ui.js`:**
  - dirección por entorno, con aviso si no hay;
  - un solo identificador por resumen mientras no se confirme;
  - mensajes por respuesta;
  - control de cantidad y peso de las fotos;
  - sale `window.ADJUNTOS`, que duplicaba `zone.fotos()` y solo servía para mandar las fotos de Transporte a WordPress.
- **`asistente.js`:**
  - no envía a WordPress;
  - ofrece «Enviar en línea», que lleva lo respondido al formulario.
- **`transporte.css`:**
  - estilo del aviso informativo;
  - ancho del botón «Enviar en línea».
- **`transporte-autorizado.html`:**
  - sale `data-cotizar-api-local`;
  - `data-max="2"` en las fotos;
  - el resumen tiene un solo botón de envío;
  - comentario del formulario al día.
- **Plugin 1.3.0:**
  - ajustes «Dirección del asistente» y «Clave pública de Turnstile»;
  - `window.TA_API.asistente` y `window.TA_API.turnstile`;
  - CSP con `ta_sitio_politica()`;
  - readme al día.
- **Documentación:**
  - `AGENTS.md`, «Cambios del 20-10-2026»;
  - `docs/contexto-proyecto.md`;
  - `docs/flujo-cotizacion.html`;
  - este archivo.
- **Pruebas:** `tools/pruebas/integracion.mjs` y `tools/pruebas/plugin.php`.

## WhatsApp: contacto opcional (decisión definitiva)

**Qué se mantiene:**
- WhatsApp sigue en el sitio como **canal de contacto opcional e independiente**: enlaces, botones, la burbuja «?», el especialista, el buscador y los mensajes precargados.
- No depende de que Laravel esté disponible.
- No se oculta al activar el envío en línea.
- La persona elige entre enviar el formulario a Laravel o escribir por WhatsApp.

**Lo que no hace:**
- no es un chatbot;
- no hay integración WhatsApp → Odoo;
- no se abre solo: ningún envío ni falla de Laravel lo abre;
- no dispara llamadas a Laravel ni a WordPress.

**En el resumen de la cotización:**
- antes de enviar, «Enviar por WhatsApp» lleva el texto de la solicitud, como siempre;
- después de una solicitud recibida pasa a «Escríbenos por WhatsApp», con su número, para agregar información.

**Verificado:** los 97 enlaces y mensajes precargados de WhatsApp de las 30 páginas son idénticos a los de `cambios-15-10`.

## Contrato de `POST /api/quotes`

Fuente: el código del asistente, revisado en `049f18b`.

**Petición:** `multipart/form-data` con la cabecera `Accept: application/json`. No lleva cookies ni token.

| Campo | Regla del asistente | Lo que envía el sitio |
|---|---|---|
| `name` | obligatorio, 2–150 | `nombre` |
| `company` | obligatorio, 2–150 | `empresa` |
| `email` | obligatorio, correo, ≤150 | `correo` |
| `phone` | obligatorio, 8–15 dígitos | `telefono` |
| `privacy_accepted` | `accepted` | `1` (casilla obligatoria: condiciones y aviso de privacidad) |
| `marketing_accepted` | opcional | `0` o `1` (casilla opcional, sin marcar) |
| `subject` | opcional, ≤150 | servicio · residuo · comuna |
| `details[n][label]` / `[value]` | 1–40 pares; ≤80 / ≤1000 | las mismas líneas del resumen de WhatsApp, sin los datos de contacto |
| `photos[]` | hasta `CHAT_ATTACHMENTS_MAX` (2); jpg/jpeg/png/webp; ≤ `CHAT_ATTACHMENT_MAX_KB` (5120) | fotos del formulario, ya en JPEG |
| `client_request_id` | obligatorio, ≤64, `[A-Za-z0-9_-]` | UUID por resumen |
| `website` | campo trampa: si llega lleno, 201 sin guardar | vacío |
| `cf-turnstile-response` | obligatorio si el asistente tiene `TURNSTILE_SECRET_KEY` | el token, solo si hay clave pública |

**Respuestas y lo que hace el sitio:**

| Respuesta | El sitio |
|---|---|
| 201 `{received, reference, delivered}` | «Recibimos tu solicitud.» con su número (`TA-000123`). |
| 200 `{…, duplicate: true}` | Igual que 201: ya estaba recibida con ese identificador (mismo número). |
| 403 `origin_not_allowed` | «No pudimos enviar la solicitud desde esta página…». |
| 409 `idempotency_conflict` | El mensaje del asistente; el próximo intento lleva otro identificador. |
| 409 `busy` | «Estamos recibiendo tu envío…». |
| 413, también el HTML del proxy | «Las fotos pesan demasiado…». |
| 422 | El primer error de validación del asistente, ya en español. |
| 429 `too_many` | El mensaje del asistente. Si viene del límite por IP, uno propio. |
| 5xx, sin respuesta o 60 s sin respuesta | «No pudimos confirmar el envío. Vuelve a intentarlo…: si ya la habíamos recibido, no se duplicará.» |

**Requisitos del lado del asistente:**

- `CHAT_ALLOWED_ORIGINS` debe tener el origen exacto de cada sitio que envía:
  - producción: `https://transporteautorizado.cl`, más la variante con `www` si se usa;
  - la instalación de pruebas;
  - en desarrollo, `http://127.0.0.1:<puerto>`.
- En producción el asistente solo acepta orígenes `https`.

## Flujo de envío

1. La persona completa el formulario. Si hay dirección del asistente, el último paso muestra la casilla de condiciones y aviso de privacidad (obligatoria) y la del contacto comercial (opcional).
2. «Preparar solicitud» valida todo y muestra el resumen con «Enviar solicitud», WhatsApp, Copiar y Editar. Si hay clave de Turnstile, el widget se carga en ese momento.
3. «Enviar solicitud»:
   - se deshabilita;
   - revisa las fotos;
   - decide el identificador;
   - espera el token de Turnstile si corresponde;
   - hace **una** petición `POST /api/quotes`.
4. Con 201 o 200 duplicada, el resumen pasa a «Recibimos tu solicitud.»:
   - muestra el número;
   - WhatsApp queda como contacto que menciona ese número;
   - «Editar» pasa a «Otra solicitud».
5. Con error, el aviso aparece sobre el resumen, el botón queda listo para reintentar y **no se envía a otro lado**.

**Sin dirección del asistente:** el resumen dice «El envío en línea no está disponible por ahora. Puedes copiar el resumen o escribirnos por WhatsApp.» No hay casilla de aviso ni botón de envío. WordPress no lo reemplaza.

## Prevención de duplicados

- **Un solo camino.**
  - `site.js` no conecta «Enviar solicitud» de WordPress a `form[data-cotizar-api]`, con o sin dirección.
  - El resumen de Transporte no tiene `[data-enviar]`.
  - El asistente de retiro no envía a WordPress: lleva al formulario.
  - No queda ningún listener que mande la cotización de Transporte a `/wp-json/`.
- **Un clic, una petición.** El botón se deshabilita en el mismo clic y una bandera (`enviando`) descarta los clics que lleguen durante el envío.
- **Identificador estable** (`client_request_id`):
  - se calcula con una firma del resumen: texto, contacto comercial y fotos;
  - reintentar, o volver a preparar el mismo resumen sin cambios mientras no se confirme, usa el mismo, y el asistente responde «duplicada» con el mismo número;
  - cambia cuando el contenido cambia, después de una solicitud confirmada o tras `idempotency_conflict`.
- **Sin canal de reemplazo.** Ninguna falla abre WhatsApp ni envía a WordPress. WhatsApp solo se sugiere en el texto cuando es seguro que la solicitud no llegó (403, 413, 429, verificación de Turnstile). Cuando pudo llegar (5xx, corte), se pide reintentar.
- **Lo que queda fuera del sitio:**
  - una persona puede enviar además el mismo texto por WhatsApp, a mano;
  - una consulta del chat y una cotización del formulario de la misma persona crean dos tareas, porque el asistente no deduplica entre canales.

## Configuración por entorno

`window.SITE.asistente()` (`assets/site/site.js`) devuelve la primera dirección válida en este orden:

| Entorno | Dónde se configura | Notas |
|---|---|---|
| Este computador (sitio en `localhost` o `127.0.0.1`) | `?asistente=http://127.0.0.1:8000` en la dirección. Queda en `sessionStorage` (`ta-asistente`) para la pestaña; `?asistente=` la quita. | Solo en localhost; ahí se admite `http`. En el sitio publicado el parámetro no cuenta: un enlace no puede desviar los datos a otra dirección. |
| WordPress (pruebas o producción) | «Solicitudes → Ajustes del sitio → Dirección del asistente» y, opcional, «Clave pública de Turnstile». | El plugin las deja en `window.TA_API.asistente` y `.turnstile`, las suma a la CSP y vacía la caché al cambiarlas. Solo acepta `https` (o `http` hacia localhost). |
| Otro alojamiento estático | `data-cotizar-api="https://…"` y `data-turnstile` en `form#cotizacion`. | En el repositorio quedan vacíos: GitHub Pages no envía en línea. |

- No hay secretos en el sitio: la clave secreta de Turnstile y las credenciales de Odoo viven solo en el asistente.
- No quedan direcciones locales fijas en el formulario.

## Fotografías

- **Tope:** el formulario admite hasta **2** (`data-max="2"`), el tope del asistente (`CHAT_ATTACHMENTS_MAX=2`). Antes admitía 5, y con 3 o más fotos el asistente respondía 422.
- **Validación de la interfaz:**
  - no deja agregar más de dos;
  - el envío vuelve a revisar cantidad y peso: hasta 5 MB cada una, `CHAT_ATTACHMENT_MAX_KB`.
- **Reducción:** cada imagen se reduce en el navegador a 1600 px en JPEG (calidad 0,85). Así pesa menos y no lleva datos de la cámara ni ubicación. Una imagen que el navegador no puede leer se rechaza con un aviso; no se sube la original.
- **Para subir el tope:**
  - hace falta aprobación y cambiar `CHAT_ATTACHMENTS_MAX` en el asistente y `data-max` aquí;
  - después correr `tools/normativa.py`, porque las páginas copian la tarjeta.
  - El asistente no se modificó.
- **Por WhatsApp** las fotos siguen sin viajar con el texto. El resumen ofrece compartirlas o copiarlas.

## WordPress

**Plugin `ta-sitio` 1.3.0** (sin publicar; no se instaló ni se actualizó en el servidor real):

- **Sin cambios:**
  - vista privada y modo publicado;
  - caché;
  - `.htaccess`;
  - `inc/solicitudes.php` (`/wp-json/ta/v1/permiso` y `/solicitudes`, correos, estados);
  - `inc/fotos.php`.
- **`window.TA_API`:** la página sigue recibiendo `url` (servicio de solicitudes) y `v`. Ahora también recibe `asistente` y `turnstile` si están configurados.
- **Política de contenido** (cabecera y `<meta>`), con `ta_sitio_politica()` en `inc/sitio.php`:
  - sin configuración es la misma de la 1.2.0;
  - con el asistente, `connect-src` suma su origen;
  - con Turnstile, `script-src` y `frame-src` suman `https://challenges.cloudflare.com`.
- **Sin destino Laravel:** el formulario de Transporte no recibe la dirección y avisa que el envío en línea no está disponible. WordPress no lo recibe en su lugar.
- **Paquete:** `tools/wordpress.py` solo lleva el sitio de Transporte, así que hoy ningún formulario del paquete usa el servicio de solicitudes de WordPress. El servicio sigue para formularios que lo declaren con `[data-enviar]` (HDS y Campañas, si algún día se sirven así).

## Páginas generadas

- **Por qué no se corrió el generador oficial:**
  - `tools/normativa.py` y `tools/ayuda.py` necesitan Python 3.12 o más nuevo (f-strings de PEP 701);
  - este computador tiene Python 3.9.6;
  - no se instaló nada.
- **Lo que se hizo:** se aplicó lo único que esas páginas toman de la fuente:
  - la tarjeta `.hcard` (`herramientas()`, sin `role`/`aria-labelledby`);
  - la burbuja `.dock` (con `data-dock-always`);
  - la versión (`version_actual()`).
- **Validación de la réplica:** reproduce byte a byte las páginas de `main`, `conexion-odoo` y `cambios-15-10` desde su propia fuente, con 0 diferencias.
- **Resultado:**
  - 20 páginas al día (16 normas y 4 de ayuda);
  - sin ningún otro cambio, comprobado contra `cambios-15-10`;
  - `documentos/*.html` no cambia.
- **Antes de publicar:** conviene correr `python3 tools/normativa.py` con Python 3.12 o más nuevo y confirmar que no deja diferencias.

## Pendientes del widget del chat (siguiente bloque)

**Resuelto** al completar el widget: ver [integracion-widget-chatbot.md](integracion-widget-chatbot.md). Lo que sigue es la lista tal como quedó al cerrar esta fusión.

`agente-chat.js` se conserva tal como quedó en `conexion-odoo`, sin duplicar y con sus estilos. Pendiente:

- **Configuración:**
  - usar `window.SITE.asistente()` en lugar de `data-agente-api-local="http://127.0.0.1:8000"`, que aún está en `transporte-autorizado.html` y `agente-virtual.html`;
  - `agente-virtual.html` no carga `site.js`.
- **Reintentos:** reintentar con el **mismo** `client_message_id` tras `409 busy`, `503 unavailable` o un corte. Hoy cada envío lleva uno nuevo.
- **409:** distinguir `409 busy` de `409 idempotency_conflict`, que hoy muestran el mismo texto.
- **Supresión real de la sesión:** `DELETE /api/chat/session` con `confirm: true`, que maneja 409 y `500 erasure_pending`. Hoy «Cambiar mis datos» solo olvida el token.
- **Historial:** mostrar fuentes y opciones de la última respuesta. Hoy solo muestra el texto.
- **Fotos:** hasta 2 por visitante y 5 MB. No subir la original si la reducción falla.
- **Enlaces:** no convertir en enlace las URL del texto del modelo; usar solo `sources[].url` con una lista de dominios permitidos.
- **CSP de WordPress:** el ajuste «Dirección del asistente» ya habilita `connect-src` y Turnstile para el chat. Falta comprobarlo en el servidor real.
- **Errores y tiempos:** tiempo máximo cercano a 100 s (Cloudflare corta a los 100 s), mensajes para `401 session_expired`, `422` y `429`, y no mostrar claves de traducción sin traducir.

## Pruebas realizadas

**`node tools/pruebas/integracion.mjs`** (con `CHROME=` apuntando a un navegador si no está en la ruta habitual). Se corrió con Brave sin interfaz y **todo pasó**.

1. Sin secretos ni llamadas directas a Odoo en los archivos de texto del frontend (96 al cerrar esta tanda).
2. Sin direcciones locales en el formulario de las páginas publicadas. Queda un aviso por el agente, pendiente del bloque del chat.
3. Estructura del formulario de Transporte:
   - un destino y un botón;
   - sin `data-enviar`;
   - `data-max="2"`;
   - consentimiento y campo trampa.
4. HDS y Campañas iguales a `cambios-15-10` salvo `?v=`, con su «Enviar solicitud» de WordPress.
5. Una sola versión en 24 páginas.
6. Las 20 páginas generadas tienen la tarjeta y la burbuja de la fuente, sin otros cambios.
7. Plugin:
   - seis archivos;
   - `solicitudes.php` y `fotos.php` sin cambios;
   - versión coherente;
   - `php -l`;
   - `tools/pruebas/plugin.php` (dirección del asistente y CSP, 20 comprobaciones).
8. Agente conservado:
   - `agente-chat.js` y `.css` iguales a `conexion-odoo`;
   - maqueta sin cambios;
   - una burbuja y cada script una vez.
9. `tools/wordpress.py` arma el zip en una carpeta temporal:
   - con la página tal cual;
   - sin herramientas ni documentación;
   - **sin secretos** (se revisan sus archivos de texto).
10. **WhatsApp:**
    - los 97 enlaces y mensajes precargados son idénticos a `cambios-15-10`;
    - el número y `SITE.whatsapp` no cambian;
    - ningún script lo oculta ni lo abre solo;
    - el resumen conserva su botón.
11. **Desacoplamiento:**
    - el plugin no se conecta desde el servidor a bases de datos, a Odoo ni a la API (no hay proxy);
    - no hay código Laravel en el repositorio;
    - el navegador solo usa las rutas públicas del contrato;
    - ninguna referencia a modelos, tablas ni variables internas;
    - fuera de localhost la dirección exige `https`.
12. **Sintaxis y estructura:**
    - `node --check` de 19 scripts;
    - etiquetas balanceadas en 30 páginas;
    - sin `id` repetidos nuevos.
13. **En el navegador**, con el asistente y WordPress simulados en este computador, sin salir a internet. Las pestañas abiertas se cuentan en el propio navegador, así que se detecta también un WhatsApp abierto por código.
    - **Sin dirección:**
      - aviso informativo;
      - sin botón ni casilla;
      - ninguna llamada;
      - nada se abre solo.
    - **Con dirección:**
      - consentimiento obligatorio;
      - de 3 fotos quedan 2;
      - WhatsApp a la vista con la solicitud precargada;
      - **un clic de persona en WhatsApp** abre solo WhatsApp, sin llamadas, y deja disponible «Enviar solicitud»;
      - **tres clics = una petición**;
      - contrato completo: campos, 2 `photos[]` JPEG de menos de 5 MB y origen;
      - 503 seguido de un reintento con el **mismo** `client_request_id`;
      - 200 duplicada y 201 con número;
      - 403, 409 (`idempotency_conflict` y `busy`), 413, 422, 429, 500 y 503 (HTML de un proxy), cada uno con su mensaje, el botón listo y nada enviado a otro lado;
      - identificador nuevo tras una confirmada y tras `idempotency_conflict`;
      - ninguna pestaña se abrió sola en todo el recorrido.
    - **Laravel caído, sobre WordPress:**
      - avisa y deja reintentar;
      - no envía a WordPress en su lugar ni abre WhatsApp;
      - WhatsApp sigue disponible.
    - **WordPress simulado:**
      - la dirección llega por `TA_API.asistente`;
      - una petición a `/api/quotes` y **ninguna a `/wp-json/`**;
      - sin dirección en los ajustes, avisa y no envía a WordPress.
    - **Asistente de retiro, en una página nueva y con datos propios:**
      - no crea solicitudes;
      - ofrece «Enviar en línea» y WhatsApp con su resumen;
      - el formulario recibe contacto, dirección, comuna, residuo, cantidad y plan, y abre en su último paso;
      - el consentimiento llega sin marcar y es obligatorio;
      - se puede volver a revisar el paso del retiro y editar;
      - el doble clic genera una sola solicitud, que lleva lo editado;
      - el reintento conserva `client_request_id`;
      - ninguna llamada a WordPress.
    - **HDS y Campañas:**
      - en estático, resumen con WhatsApp y sin llamadas;
      - sobre WordPress, HDS envía una vez a `/wp-json/ta/v1/solicitudes` y nada al asistente.
    - Sin errores de JavaScript.

**Resultado al cerrar la fusión:** 113 comprobaciones correctas, más las 20 de `php tools/pruebas/plugin.php`. Queda un aviso conocido: `data-agente-api-local` del widget.

**Prueba de las pruebas:** se introdujeron fallas a propósito y luego se restauraron los originales, idénticos. Todas fueron detectadas:

| Falla introducida | Comprobación que falló |
|---|---|
| Identificador nuevo en cada intento | El reintento lleva el mismo `client_request_id` |
| Sin las dos protecciones contra doble clic | Tres clics, una sola solicitud (hubo 3) |
| Un mensaje precargado de WhatsApp distinto | WhatsApp idéntico a `cambios-15-10`, y la tarjeta de las páginas generadas |
| `window.open` de WhatsApp tras una solicitud recibida | Ningún envío ni falla abrió una pestaña |
| Clic en WhatsApp por código y envío a WordPress cuando falla Laravel | Ningún script abre WhatsApp, y con Laravel caído no se envía a WordPress |
| El asistente de retiro sin trasladar lo respondido | Los datos del asistente llegan al formulario |
| Una llamada `wp_remote_post` en el plugin (proxy) | El plugin no se conecta desde el servidor |

## Limitaciones conocidas

- **Asistente real:** no se probó contra el asistente en ejecución. El contrato se tomó de su código (`049f18b`) y se simuló. Probarlo de punta a punta requiere el asistente local con un Odoo de prueba, nunca el real.
- **WordPress real:** no se probó. Falta comprobar en el servidor:
  - la CSP con la dirección del asistente, en la respuesta real (`curl -D -`), porque un servidor puede reemplazar la cabecera;
  - Turnstile;
  - la caché de LiteSpeed.
- **Turnstile:** no se ejecutó, porque las pruebas bloquean Cloudflare. Su lógica es la de `conexion-odoo`.
- **Teléfono:** las pruebas en el navegador usan el ancho de escritorio. En teléfono el formulario va en una hoja a pantalla completa, con el mismo código de envío.
- **Generador oficial:** no se corrió (ver «Páginas generadas»).
- **Decidido por el cliente** (antes «por confirmar»):
  - WhatsApp sigue como contacto opcional, con su texto precargado;
  - «Enviar en línea» está aprobado.
- **Duplicados entre canales** (chat y formulario de la misma persona): dependen del asistente, que hoy no los detecta.
- **`docs/preguntas-y-apartados.html`** no cambia: los apartados y anclajes son los mismos.

## Pendiente antes del piloto (dependencias externas)

- **Laravel desplegado por separado** (staging y luego producción), con HTTPS, su dirección pública y el origen exacto de cada WordPress en `CHAT_ALLOWED_ORIGINS`. Lo prepara quien despliega el asistente, con su propia documentación.
- **Plugin 1.3.0** instalado en un WordPress de pruebas, con la dirección de la API en sus ajustes. Comprobar allí:
  - la CSP real (`curl -D -`);
  - CORS;
  - Turnstile, si se usa;
  - la caché.
- **Claves de Cloudflare Turnstile** por entorno, si se usa: la pública en WordPress y la secreta en Laravel.
- **Generador oficial:** correr `python3 tools/normativa.py` con Python 3.12 o más nuevo y confirmar que no deja diferencias.
- **Prueba de punta a punta** del formulario contra Laravel de staging con Odoo de prueba, nunca el real.
- **Widget del chat:** completado; lo que falta comprobar en staging está en [integracion-widget-chatbot.md](integracion-widget-chatbot.md).
