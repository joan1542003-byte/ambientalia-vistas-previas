=== Transporte Autorizado – Sitio ===
Requires at least: 6.2
Requires PHP: 7.4
Stable tag: 1.4.11

Sirve el sitio nuevo de Transporte Autorizado desde WordPress. Las cotizaciones de Transporte las recibe el asistente (servicio Laravel), que las registra en Odoo.

== Qué hace ==

* Muestra el sitio en una dirección privada (por defecto /nuevo/): solo con sesión iniciada o con el enlace con clave de «Solicitudes → Ajustes del sitio». Los buscadores no lo indexan.
* Al pasar a «Publicado», el sitio reemplaza la portada y abre /normativa/, /ayuda/ y /documentos/.
* Las cotizaciones de Transporte (formulario de cotización, y el asistente de retiro, que lleva a ese formulario) van solo al asistente cuya dirección se indica en «Solicitudes → Ajustes del sitio»: el asistente las registra en Odoo con sus fotografías y les da su número. WordPress no las recibe. Sin esa dirección, el formulario avisa que el envío en línea no está disponible.
* Para otros formularios que lo usen, el servicio de solicitudes sigue disponible: guarda cada solicitud en «Solicitudes», le asigna un número y envía dos correos, al equipo y a la persona.
* Recibe las fotografías que la persona adjunta (hasta 6): las revisa, las vuelve a generar, las guarda en una carpeta que no se entrega al público, las muestra en la solicitud y las adjunta al correo del equipo.
* Rechaza los correos de los dominios bloqueados en los ajustes (por defecto, Rusia, Francia y Alemania), el texto en cirílico y los envíos hechos desde otros sitios; limita los envíos por visita, por correo, por hora y por día.
* Al pasar una solicitud a «Lista», la persona recibe un correo de aviso.

== Cómo se arma ==

El contenido de la carpeta sitio/ sale del repositorio de las vistas previas: `python3 tools/wordpress.py` arma el plugin completo y su .zip. Los cambios del sitio se hacen allá y se vuelve a generar.

== Cambios ==

= 1.4.11 =
* «Imágenes del sitio»: también la foto del hero para «Quiero hacer convenio con un reciclador de base».

= 1.4.10 =
* Hero y tipo de retiro: el borde de luz se recorta con un solo contorno; en Safari ya no se ilumina toda la fila al cargar.

= 1.4.9 =
* Ícono de la pestaña: las direcciones llevan la versión (?v=), así el navegador deja de mostrar el que tenía guardado.
* Hero: el borde de luz de «Necesito gestionar mis residuos» aparece con la página ya cargada (al cargar se podía ver como un relleno de toda la fila).

= 1.4.8 =
* Chat: al recargar la página sigue conectado y muestra un saludo con el menú, no la última conversación («Ver la conversación anterior» la trae).
* Cotizar: el brillo del tipo de retiro vuelve a ser el de antes.

= 1.4.7 =
* «Imágenes del sitio»: se puede cambiar cualquier imagen (portadas, servicios, otras secciones, las miniaturas de cada residuo, el logo, el ícono de la pestaña y la imagen al compartir), ordenadas por grupo. La lista se arma sola con el paquete (sitio/imagenes.json).
* «WhatsApp del sitio» en los ajustes: cambia el número de todos los enlaces, del texto y de los scripts.
* Normativa: el PDF oficial de Ley Chile de cada norma, alojado en el sitio, y sus fechas en la biblioteca.
* Chat: recuerda nombre, correo y teléfono en el navegador («Usar otros datos» y «Borrar mis datos» los olvidan); íconos en las opciones.
* Cotizar: el tipo de retiro cambia al instante (en Firefox se notaba una espera). Mapa: «Marcar aquí» destacado y el contorno de la comuna elegida.

= 1.4.6 =
* Chat en el teléfono a pantalla completa: ocupa justo el área visible (con el teclado abierto o cerrado), la página de atrás queda quieta y el chat se cierra con su «X».

= 1.4.5 =
* Ícono de la pestaña nuevo (el camión del cliente).
* Chat en el teléfono casi a pantalla completa; en escritorio, una sombra más marcada.
* Ayuda: al elegir un tema queda solo ese, con «Todos los temas» para volver.
* Horario: «Elegir un rango» con un deslizador de dos puntas (cada media hora, de 8:00 a 18:00).
* El tipo de retiro elegido vuelve a brillar como «Chat con IA».

= 1.4.4 =
* Íconos de Lucide (licencia ISC) en todo el sitio de Transporte.
* Chat en el teléfono: más alto (deja a la vista el menú) y, con el teclado abierto, ocupa el área visible sin quedar cortado. En escritorio, una sombra que lo separa del sitio.
* El PDF de los checklists es un formulario para leer y llenar a mano: datos del caso, casillas por punto, observaciones y firma.

= 1.4.3 =
* Checklists: «Descargar Excel» entrega la planilla con las marcas puestas y «Descargar PDF», un PDF real (antes, la ventana de impresión).
* Ayuda: categoría «Checklists» con todos, junto a «Normativa» (grupo «Documentos»).
* Formulario de cotización: WhatsApp junto al título y la barra de avance en una fila (la cabecera pasa de 159 a 101 px).
* El tipo de retiro elegido solo brilla, sin otra animación.

= 1.4.2 =
* Chat en el teléfono: ventana opaca de alto fijo (no cambia de tamaño al escribir) y el fondo desenfocado; con ahorro de batería, solo oscurecido. Tocar fuera lo cierra.
* Ayuda por temas: se elige uno y se despliegan sus guías, con su checklist y su Excel, o la normativa.
* El tipo de retiro elegido se enciende con una animación; el ícono de «Necesito gestionar mis residuos», sin brillo.
* En el teléfono la página ya no se ensancha (el pie de cinco columnas era solo para escritorio).

= 1.4.1 =
* Imágenes del sitio en los ajustes: portada del inicio (escritorio y teléfono), foto de cada opción del hero y de cada servicio, desde la biblioteca de medios.
* Condiciones del servicio, política de privacidad y borrado de la conversación en el propio sitio (/legal/), con el texto del asistente; el pie, el formulario y el chat enlazan ahí.
* Ayuda con diez guías y once checklists (en línea y en Excel), panel por pestañas, enlaces a HDS y Campañas, publicaciones de LinkedIn de Transporte Autorizado y sello Yo Reciclo nuevo.
* La burbuja «?» aparece al entrar; brillo leve en «Necesito gestionar mis residuos» y en el tipo de retiro elegido.

= 1.4.0 =
* El agente vuelve al sitio: «Chat con IA», en la burbuja «?», conversa con el asistente cuya dirección se indica en «Solicitudes → Ajustes del sitio» (la misma de las cotizaciones). Sin esa dirección, la ventana avisa que el asistente no está disponible.
* El sitio incluido es el del 22-10-2026 (burbuja «?» y chat). `python3 tools/wordpress.py` arma el paquete con el agente; con `--sin-agente` lo deja fuera.
* Al actualizar, el plugin vacía las cachés de páginas (LiteSpeed y otras) y vuelve a registrar sus reglas.

= 1.3.0 =
* Las cotizaciones de Transporte van solo al asistente (Laravel), con su dirección y la clave pública de Turnstile en los ajustes de cada instalación (pruebas o producción). La página la recibe en window.TA_API y su política de contenido (CSP) admite esa dirección y, con Turnstile, challenges.cloudflare.com.
* WordPress ya no recibe las cotizaciones de Transporte ni las del asistente de retiro; el servicio de solicitudes se conserva para otros formularios.
* Las fotos del formulario: hasta 2, el tope del asistente.
* Comunas que se atienden, en los ajustes (por defecto Quilicura, Lampa y Pudahuel): el formulario y el asistente solo ofrecen esas.
* Correos con formato, logotipo y firma (texto e imagen de la biblioteca de medios) al final de todos los que recibe la persona.
* Gestor de solicitudes: filtros por estado, búsqueda por número, empresa, nombre, correo o teléfono, cambio de estado en grupo, exportación a CSV, resumen en el escritorio y número de nuevas junto al menú.
* En cada solicitud: «Responder» con respuestas rápidas, imágenes o archivos adjuntos y copia; notas internas; registro de respuestas recibidas e historial de todo lo enviado.
* El agente del sitio (en desarrollo) no se muestra.
* Correos que reciben las solicitudes: se eligen de una lista (una o varias casillas), se agregan escribiéndolas y una es la principal (a donde contestan las personas).

= 1.2.0 =
* Logotipo oficial nuevo (placa «Transporte / Autorizado»); cambia de color solo mientras el puntero está encima.
* Cuatro normas nuevas en la biblioteca (Código Sanitario, Ley de Tránsito, D.S. 75/1987 y Res. 5081/1993), ordenada por relevancia para el transporte de residuos.
* Checklist de autorización para usar en línea, también en el teléfono (ayuda/checklist-autorizacion-transporte.html).
* Las fotos del residuo que se agregan al final del formulario viajan con «Enviar solicitud».

= 1.1.1 =
* La política de contenido (CSP) va también dentro de cada página: el servidor del cliente reemplazaba la cabecera por la suya y la página quedaba sin política.
* El teléfono debe tener al menos 8 números.

= 1.1.0 =
* Fotografías adjuntas a la solicitud.
* Más protección del formulario: solo desde las páginas del sitio, correos y países bloqueados, texto en cirílico, límites por correo y por hora, y un permiso distinto para cada visita (antes, dos visitas en el mismo segundo compartían el suyo).
* El límite por visita usa la dirección que anota la red del proveedor, no la que puede escribir quien envía.
* La página ya no carga código desde otros servidores: Leaflet y NumberFlow van dentro del sitio.

= 1.0.1 =
* Ninguna dirección de la vista privada se guarda en caché, tampoco el 404 de quien no tiene acceso. Con LiteSpeed Cache ese 404 quedaba guardado y también lo recibía quien llegaba con el enlace con clave.
* Vacía la caché de páginas al activar, al actualizar y al cambiar el estado o la dirección de la vista previa.

= 1.0.0 =
* Primera versión.
