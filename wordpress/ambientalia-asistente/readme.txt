=== Ambientalia · Asistente IA ===
Requires at least: 6.0
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.3.0

Burbuja «?» de Ambientalia (Contacto, WhatsApp y Chat con IA), presente en todas las páginas públicas del sitio. Mismo diseño que la de Transporte Autorizado, en el verde de Ambientalia.

== Descripción ==

* La burbuja aparece abajo a la derecha (o a la izquierda) en todas las páginas, también las hechas con Elementor. No aparece en el escritorio ni en el editor de Elementor.
* La ventana conversa directo con el asistente (POST /api/chat/sessions, /api/chat/messages, GET /api/chat/history, DELETE /api/chat/session). Antes de conversar pide nombre, correo, teléfono y la aceptación de las condiciones y el aviso de privacidad.
* Sin dirección del asistente, la burbuja sigue presente y ofrece WhatsApp y la página de contacto.
* Se arma dentro de un Shadow DOM: los estilos del tema y de Elementor no la alteran, y ella no altera el sitio.
* Cualquier enlace a #asistente (por ejemplo, un botón de Elementor) abre la ventana. Desde código: window.ambAsistente.abrir().

== Instalación ==

1. Plugins → Añadir nuevo → Subir plugin → ambientalia-asistente.zip → Activar.
2. Ajustes → Asistente IA: qué acciones muestra la burbuja (Contacto, WhatsApp, Chat con IA) y sus textos, la página de contacto, el número y el mensaje de WhatsApp, la dirección del asistente (https, sin barra final), la clave pública de Turnstile (solo si el asistente la exige) y la posición.
3. Vaciar la caché de páginas y de la CDN si la hay (el plugin vacía LiteSpeed, WP Rocket y W3 Total Cache al guardar).

El asistente debe aceptar el origen del sitio (https://ambientalia.cl y, si se usa, https://www.ambientalia.cl).

== Changelog ==

= 1.3.0 =
* Ajustes por acción: mostrar u ocultar Contacto, WhatsApp y Chat con IA, sus textos, la página de contacto, el número y el mensaje inicial de WhatsApp, el texto junto a la X y la acción destacada.
* «Chat con IA» más sutil: borde de verde a celeste que gira despacio y halo celeste suave. El giro ahora funciona dentro del Shadow DOM.

= 1.2.0 =
* Diseño idéntico al de Transporte Autorizado: la burbuja «?» que se expande con Contacto, WhatsApp y Chat con IA, y la ventana del chat que nace desde ella. En el verde de Ambientalia y con Montserrat.
* Sin la invitación ni los agregados de la 1.1.0, que no están en Transporte.

= 1.1.0 =
* Nuevo diseño con el lenguaje del header del sitio (vidrio verde, menta, curvas de resorte) y la ventana del chat de Transporte Autorizado.
* Nueva marca de la burbuja, invitación con sugerencias, bienvenida con preguntas de ejemplo y pregunta inmediata (los datos se piden después).
* Micro interacciones: apertura de gota, mensajes y opciones animados, copiar respuesta, «Nuevo mensaje», estados de espera.
* Teléfono: pantalla visible con teclado, página quieta, «atrás» cierra el chat, campos de 16 px.
* Burbuja a la derecha por omisión.

= 1.0.0 =
* Primera versión.
