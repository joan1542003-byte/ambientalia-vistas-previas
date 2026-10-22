# Despliegue del chat en WordPress (plugin 1.4.0)

Estado al 22-10-2026. Para quien sube el plugin a `transporteautorizado.cl`. El asistente (Laravel) ya está desplegado en **`https://taax.greensoft.cl`**; lo que falta es subir el sitio y apuntarlo a él.

Contrato y comportamiento del chat: [integracion-widget-chatbot.md](integracion-widget-chatbot.md).

## Qué cambia respecto de lo que hay en vivo

| | En vivo hoy (1.3.0, archivos `?v=20261016a`) | Con 1.4.0 y la dirección del asistente |
|---|---|---|
| Chat | No hay | «Chat con IA», la última opción de la burbuja «?» |
| Cotizaciones del formulario | Van a WordPress (`/wp-json/ta/v1/`): quedan en «Solicitudes» y llegan por correo | Van al asistente (`POST /api/quotes`) y quedan en Odoo. **WordPress deja de recibirlas**: «Solicitudes» no sumará las nuevas |
| Chat y cotizaciones sin la dirección | — | El chat dice «no disponible» y el formulario avisa que el envío en línea no está disponible (queda WhatsApp) |

El segundo punto es el que más importa: al guardar la dirección, las cotizaciones cambian de destino. Avisa al equipo que las recibe.

## Antes de subir

1. **El asistente tiene que aceptar el sitio.** En el servidor del asistente, `CHAT_ALLOWED_ORIGINS` debe llevar `https://transporteautorizado.cl` (ya lo lleva: el preflight del 22-10 respondió bien, con `Authorization` y `DELETE`).
2. **`www`.** `www.transporteautorizado.cl` sirve hoy la misma página sin redirigir. El asistente solo acepta el origen sin `www`, así que por `www` el chat y el formulario dirían «no disponible». O se redirige `www` a `transporteautorizado.cl` (en WordPress o Cloudflare), o quien administra el asistente agrega `https://www.transporteautorizado.cl` a `CHAT_ALLOWED_ORIGINS`.
3. **Odoo.** Quien administra el asistente confirma que la entrega a Odoo funciona (`php artisan production:check` en el servidor), porque las cotizaciones pasarán por ahí.
4. **Turnstile.** Si el asistente tiene `TURNSTILE_SECRET_KEY`, hace falta la clave **pública** del mismo widget de Cloudflare. Si no la tiene, se deja vacío. Preguntar a quien administra el asistente.
5. **Respaldo.** Descarga la carpeta actual `wp-content/plugins/ta-sitio/` (o el zip 1.3.0 que se subió): es la vuelta atrás.

## Pasos

1. **Plugins → Añadir nuevo → Subir plugin** con `ta-sitio.zip` (19,6 MB) y, cuando WordPress avisa que ya existe, **«Reemplazar el actual con el subido»**. Los ajustes (estado, correos, comunas, firma) se guardan en la base de datos y se conservan.
2. En **Plugins** debe decir **versión 1.4.0**. Al entrar al escritorio, el plugin vacía las cachés de páginas (LiteSpeed y otras) y vuelve a registrar sus reglas; eso ocurre solo cuando cambia la versión.
3. **Solicitudes → Ajustes del sitio → Cotizaciones de Transporte**:
   - **Dirección del asistente:** `https://taax.greensoft.cl`, sin barra final y **sin ruta** (no `/politica-de-privacidad`). Si queda vacío después de guardar, la dirección no cumplía: debe ser `https`, sin consulta ni datos de acceso.
   - **Clave pública de Turnstile:** según el punto 4 de «Antes de subir».
   - **Guardar ajustes** (vuelve a vaciar la caché de páginas).
4. Por si acaso, **LiteSpeed Cache → Toolbox → Purge All**, y la caché de la CDN si hay una.

El sitio ya está publicado: entre el paso 1 y el 3, la ventana del chat diría «no disponible». Hazlos seguidos.

## Verificación

Con una ventana de incógnito en `https://transporteautorizado.cl/`:

1. Ver el código fuente: `window.TA_API=` trae `"asistente":"https://taax.greensoft.cl"` y los archivos terminan en `?v=20261022g`.
2. Abrir la burbuja «?» → **Chat con IA**. Aparece la puerta (nombre, correo, teléfono y la casilla de condiciones y aviso de privacidad). Al entrar se ven el saludo y el menú. En las herramientas del navegador (Red), `POST https://taax.greensoft.cl/api/chat/sessions` responde 201.
3. Escribir una pregunta (por ejemplo, «¿qué documentos necesito para retirar residuos peligrosos?») y tocar una opción del menú.
4. Adjuntar una foto y recargar la página: la conversación vuelve.
5. **Borrar esta conversación** y confirmar: vuelve la puerta.
6. La consola no muestra errores de política de contenido (CSP) ni de CORS.
7. El pie muestra la columna «Legal», con los enlaces a las condiciones y la política del asistente.
8. **Cotización de prueba** completa, con una foto: el resumen dice «Recibimos tu solicitud.» con un número `TA-…`, y la tarea aparece en Odoo. Avisar al equipo de Odoo que es una prueba.
9. Repetir 2 y 8 desde un teléfono (iOS y Android).

## Si algo falla

- **El chat dice «no disponible desde esta página»:** el origen no está permitido en el asistente (ver `www`).
- **La puerta rechaza con un error de verificación:** el asistente exige Turnstile y falta la clave pública en los ajustes.
- **«No pude conectarme»:** el servicio del asistente no responde o el navegador bloqueó la llamada; revisar la pestaña Red.
- **No se ve nada nuevo:** quedó una caché. Purgar LiteSpeed y la CDN; los archivos nuevos terminan en `?v=20261022g`.
- **Volver atrás:** reemplazar el plugin con el 1.3.0 respaldado. Deja el sitio como estaba (sin chat, y las cotizaciones vuelven a WordPress, porque la versión vieja no usa la dirección del asistente).

## Cómo se armó el paquete

`python3 tools/wordpress.py` (sin argumentos) deja `../wordpress/ta-sitio.zip` junto a este repositorio. Incluye el agente; `--sin-agente` lo arma como antes, sin él. El zip sale de lo que hay en el repositorio en ese momento: si cambia algo, se vuelve a generar. Ninguna dirección del asistente ni clave va dentro del paquete: se ponen en los ajustes de cada instalación.
