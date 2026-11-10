=== Ambientalia · Asistente IA ===
Requires at least: 6.0
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.0.0

Burbuja del asistente con IA de Ambientalia, presente en todas las páginas públicas del sitio.

== Descripción ==

* La burbuja aparece abajo a la izquierda (o a la derecha, sobre el botón de WhatsApp) en todas las páginas, también las hechas con Elementor. No aparece en el escritorio ni en el editor de Elementor.
* La ventana conversa directo con el asistente (POST /api/chat/sessions, /api/chat/messages, GET /api/chat/history, DELETE /api/chat/session). Antes de conversar pide nombre, correo, teléfono y la aceptación de las condiciones y el aviso de privacidad.
* Sin dirección del asistente, la burbuja sigue presente y ofrece WhatsApp y la página de contacto.
* Se arma dentro de un Shadow DOM: los estilos del tema y de Elementor no la alteran, y ella no altera el sitio.
* Cualquier enlace a #asistente (por ejemplo, un botón de Elementor) abre la ventana. Desde código: window.ambAsistente.abrir().

== Instalación ==

1. Plugins → Añadir nuevo → Subir plugin → ambientalia-asistente.zip → Activar.
2. Ajustes → Asistente IA: dirección del asistente (https, sin barra final), clave pública de Turnstile (solo si el asistente la exige), WhatsApp, página de contacto, posición e invitación.
3. Vaciar la caché de páginas y de la CDN si la hay (el plugin vacía LiteSpeed, WP Rocket y W3 Total Cache al guardar).

El asistente debe aceptar el origen del sitio (https://ambientalia.cl y, si se usa, https://www.ambientalia.cl).

== Changelog ==

= 1.0.0 =
* Primera versión.
