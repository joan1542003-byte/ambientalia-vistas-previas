=== Transporte Autorizado – Sitio ===
Requires at least: 6.2
Requires PHP: 7.4
Stable tag: 1.4.19

Sirve el sitio nuevo de Transporte Autorizado desde WordPress. Las cotizaciones de Transporte las recibe el asistente (servicio Laravel), que las registra en Odoo.

== Qué hace ==

* Muestra el sitio en una dirección privada (por defecto /nuevo/): solo con sesión iniciada o con el enlace con clave de «Transporte Autorizado → Ajustes». Los buscadores no lo indexan.
* Al pasar a «Publicado», el sitio reemplaza la portada y abre /normativa/, /ayuda/ y /documentos/.
* Las cotizaciones de Transporte (formulario de cotización, y el asistente de retiro, que lleva a ese formulario) van solo al asistente cuya dirección se indica en «Transporte Autorizado → Ajustes»: el asistente las registra en Odoo con sus fotografías y les da su número. WordPress no las recibe. Sin esa dirección, el formulario avisa que el envío en línea no está disponible.
* Para otros formularios que lo usen, el servicio de solicitudes sigue disponible: guarda cada solicitud en «Solicitudes», le asigna un número y envía dos correos, al equipo y a la persona.
* Recibe las fotografías que la persona adjunta (hasta 6): las revisa, las vuelve a generar, las guarda en una carpeta que no se entrega al público, las muestra en la solicitud y las adjunta al correo del equipo.
* Rechaza los correos de los dominios bloqueados en los ajustes (por defecto, Rusia, Francia y Alemania), el texto en cirílico y los envíos hechos desde otros sitios; limita los envíos por visita, por correo, por hora y por día.
* Al pasar una solicitud a «Lista», la persona recibe un correo de aviso.

== Cómo se arma ==

El contenido de la carpeta sitio/ sale del repositorio de las vistas previas: `python3 tools/wordpress.py` arma el plugin completo y su .zip. Los cambios del sitio se hacen allá y se vuelve a generar.

== Cambios ==

= 1.4.19 =
* Panel propio en el escritorio: menú «Transporte Autorizado» con Resumen (el estado de todo en tarjetas, cada una con su atajo), Solicitudes y Ajustes. Los ajustes van en pestañas (Sitio, Contacto, Retiros, Imágenes, Correos a clientes, Buscadores y SEO, Cotizaciones y chat, Seguridad), con la barra de guardar siempre a la vista y aviso de cambios sin guardar; al guardar se vuelve a la misma pestaña. La dirección anterior de los ajustes lleva a la nueva.
* Buscadores: verificación de Google Search Console y Bing Webmaster Tools desde los ajustes, subiendo el archivo que entregan (google….html o BingSiteAuth.xml, que queda en la raíz del dominio) o pegando su etiqueta; lista de lo que falta para indexar y pasos para agregar el mapa del sitio. «Vaciar caché» desde el resumen.
* robots.txt: el manifiesto para agentes va como comentario («# Agentmap:»); como directiva, Lighthouse marcaba el archivo como inválido y bajaba el SEO.
* Espera y ahorra se agenda desde pasado mañana, como el Retiro Programado (antes dejaba elegir mañana).
* Hero: cambio de foto más suave al pasar por las opciones (la nueva entra encima de la anterior, sin pasar por la principal).

= 1.4.18 =
* Horario de retiro: Mañana de 9:00 a 13:00 y Tarde de 13:00 a 17:00 (la mañana empieza a las 9 y nada pasa de las 17:00). Nueva sección «Horario de retiro» en los ajustes: las horas de inicio, de corte y de término, y si se ofrecen Mañana, Tarde y Vespertino. «Cualquier horario» va siempre. El campo del hero y el asistente solo entienden las opciones que se ofrecen.
* «Detalles del retiro»: en cada sección van primero las condiciones prioritarias y al final las demás. Es solo el orden en pantalla: lo que se guarda y se envía al asistente sigue en el orden de siempre (el mismo del chat).
* Comunas: con hasta cinco marcadas, los avisos las nombran; con más, dicen cuántas son («Por ahora atendemos 12 comunas de la Región Metropolitana»). Cambiar las comunas o el horario vacía la caché de páginas.
* Sin la fila «Vehículo» (tipo de camión) en el formulario.
* Solicitud enviada: el número de seguimiento se muestra grande y aparte. El envío al asistente no cambia.
* llms.txt y la habilidad para agentes de IA (/.well-known/agent-skills/…/SKILL.md) dicen las comunas y el horario de los ajustes (antes, siempre Quilicura, Lampa y Pudahuel); llms.txt suma el horario y lo nombra en el formulario.

= 1.4.17 =
* Mapa de la dirección: en una calle cuyo nombre lleva un número (Ruta 68, Pasaje 3, Avenida 2 Sur), ese número ya no se toma como el de la casa. Antes, al mover el punto sobre la Ruta 68 la dirección quedaba «Ruta 68 68, 68…», un 68 más cada vez.
* Las sugerencias de calles encuentran esas calles al escribirlas («Ruta 68», «Pje 3»).
* Sistema de diseño compartido con Campañas: las ventanas de selección múltiple pueden llevar una línea bajo cada opción y una ayuda plegable sobre la lista. En Transporte no cambia nada a la vista.

= 1.4.16 =
* Un toque en el hero (o en «Ayuda») mientras la página todavía carga ya no se pierde: se repite apenas llegan los scripts que se piden después de pintar la foto principal.
* Sistema de diseño compartido con Campañas de recolección: las filas de texto pueden llevar el mapa y las calles de la comuna (`data-mapa`), y el mapa nombra el lugar según el sitio. En Transporte no cambia nada a la vista.

= 1.4.15 =
* Hero sin la viñeta oscura: la foto sigue llenando el hero, sin el oscurecido de abajo ni el fundido negro del teléfono; queda solo el tono lila bajo el título y las opciones.
* Tarjetas de servicio de igual alto: la tarjeta lleva la foto y el texto; el botón y «Qué necesitamos» van debajo, fuera de ella.
* Carga más rápida en el teléfono: el panel «Ayuda» cerrado y las secciones bajo la primera pantalla no se calculan hasta que se usan o se acercan; el mapa, el asistente guiado, la biblioteca y el chat se cargan después del primer dibujo; el listado de transportistas y las miniaturas, con el primer gesto de la persona.
* Navegación con agentes de IA: manifiesto ARD en /.well-known/ard.json (y su nombre anterior, ai-catalog.json) con una habilidad que describe el sitio; robots.txt lo anuncia con Agentmap.
* CSS y JS del paquete compactados (602 KB → 379 KB); en la portada, el código y las fotos de más abajo se piden después de pintar la foto del hero, y site.js ya no recalcula la página al iniciar.
* Horario: solo Cualquier horario (la hora la definimos nosotros), Mañana, Tarde y Vespertino; sin rango de horas.
* Retiro Programado: se agenda desde pasado mañana (ni hoy ni mañana), en el formulario, el asistente y el campo del hero.
* Fotos nuevas en WebP (portada en tres medidas, fotos de las opciones del hero y de los servicios). Los espacios de «Imágenes del sitio» conservan sus claves: lo ya subido sigue rigiendo; con «Volver a la del sitio» se usan estas versiones livianas.
* Imágenes subidas a la biblioteca: la página entrega las medidas que WordPress generó al subirlas (srcset) y el navegador baja solo la que necesita; antes bajaba el original (el PNG de la portada pesa 2 MB). Las medidas nuevas que genera WordPress de un PNG o JPG quedan en WebP; las ya subidas cambian al volver a subirlas.
* Nunito va en el propio sitio, precargada: ya no se pide a Google Fonts (la política de contenido deja de permitirlo).
* Accesibilidad (WCAG 2.2 AA): el gris de los textos secundarios sube su contraste a 4,9:1 sobre el fondo gris claro. Los enlaces de WhatsApp, condiciones y privacidad del formulario son rastreables.
* El mapa de WordPress (wp-sitemap.xml) ya no lista autores y las páginas de autor llevan al inicio.

= 1.4.14 =
* Cambios de Jeremy del 03-11: condiciones de acceso del encargado (28, agrupadas por tipo en secciones plegables), «Solicitar cotización» del buscador abre la cotización del asistente (WhatsApp y correo quedan como alternativa) y el chat muestra párrafos y listas en sus respuestas.

= 1.4.13 =
* Une lo último de Jeremy (main, 28-10): el chat queda tal como él lo dejó (datos recordados, envíos pendientes al recargar, fotos y campos editables), plazos del Express (24 horas hábiles) y del certificado, y crédito en las páginas legales.
* Se quitan los cambios propios al chat del 23-10 (datos en localStorage, saludo al recargar, íconos en las opciones, pantalla completa con el teclado): el chat lo ve Jeremy.

= 1.4.12 =
* Teléfono: con el teclado abierto, el chat, las hojas del formulario y las ventanas de selección cubren toda la pantalla (el fondo sigue detrás del teclado); ya no queda un hueco por donde se vea la página.

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
* El agente vuelve al sitio: «Chat con IA», en la burbuja «?», conversa con el asistente cuya dirección se indica en «Transporte Autorizado → Ajustes» (la misma de las cotizaciones). Sin esa dirección, la ventana avisa que el asistente no está disponible.
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
