=== Transporte Autorizado – Sitio ===
Requires at least: 6.2
Requires PHP: 7.4
Stable tag: 1.3.0

Sirve el sitio nuevo de Transporte Autorizado desde WordPress y recibe las solicitudes de sus formularios.

== Qué hace ==

* Muestra el sitio en una dirección privada (por defecto /nuevo/): solo con sesión iniciada o con el enlace con clave de «Solicitudes → Ajustes del sitio». Los buscadores no lo indexan.
* Al pasar a «Publicado», el sitio reemplaza la portada y abre /normativa/, /ayuda/ y /documentos/.
* Guarda cada solicitud en «Solicitudes», le asigna un número y envía dos correos: al equipo y a la persona.
* Recibe las fotografías que la persona adjunta (hasta 6): las revisa, las vuelve a generar, las guarda en una carpeta que no se entrega al público, las muestra en la solicitud y las adjunta al correo del equipo.
* Rechaza los correos de los dominios bloqueados en los ajustes (por defecto, Rusia, Francia y Alemania), el texto en cirílico y los envíos hechos desde otros sitios; limita los envíos por visita, por correo, por hora y por día.
* Al pasar una solicitud a «Lista», la persona recibe un correo de aviso.

== Cómo se arma ==

El contenido de la carpeta sitio/ sale del repositorio de las vistas previas: `python3 tools/wordpress.py` arma el plugin completo y su .zip. Los cambios del sitio se hacen allá y se vuelve a generar.

== Cambios ==

= 1.3.0 =
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
