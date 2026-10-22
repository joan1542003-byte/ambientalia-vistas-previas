# Documentación del proyecto

Contexto, normativa y procedimientos que sustentan las vistas previas. Empieza por [contexto-proyecto.md](contexto-proyecto.md).

| Carpeta / archivo | Contenido |
|---|---|
| [contexto-proyecto.md](contexto-proyecto.md) | Objetivo de cada página, cómo se conectan, modelo de ingresos, canales y tono. |
| [copy/transporte-autorizado.md](copy/transporte-autorizado.md) | Copy de referencia de Transporte Autorizado; incluye bloques antiguos que deben contrastarse con el contexto vigente. |
| [reuniones/reunion-copy-transporte-autorizado.md](reuniones/reunion-copy-transporte-autorizado.md) | Ideas y decisiones de la reunión de copy de Transporte autorizado. |
| [normativa/decreto-29-2024-minsal.md](normativa/decreto-29-2024-minsal.md) | DS 29/2024 MINSAL: recepción, almacenamiento, recolección y transporte de residuos de productos prioritarios; campañas de recolección. |
| [normativa/decreto-57-2019-minsal.md](normativa/decreto-57-2019-minsal.md) | DS 57/2019 MINSAL: clasificación, etiquetado y notificación de sustancias peligrosas; HDS (Título V). |
| [procedimientos/PR-COT-HDS-01-cotizacion-hds.md](procedimientos/PR-COT-HDS-01-cotizacion-hds.md) | Procedimiento de cotización estandarizada de HDS/HDSR. |
| [procedimientos/informe-tecnico-campanas-recoleccion.md](procedimientos/informe-tecnico-campanas-recoleccion.md) | Informe técnico sobre campañas de recolección según el DS 29/2024. |
| [procedimientos/originales/](procedimientos/originales/) | Archivos .docx originales. Son la fuente oficial; los .md son conversiones para leerlos más fácil. |
| [flujo-cotizacion.html](flujo-cotizacion.html) | Esquema del flujo de cotización de Transporte Autorizado: lo que hace el sitio hoy y el envío en línea al asistente (Laravel → Odoo). |
| [integracion-frontend-laravel.md](integracion-frontend-laravel.md) | Integración de las ramas y del formulario de Transporte con el asistente Laravel (`POST /api/quotes`): contrato, duplicados, configuración por entorno, WordPress y pruebas. |
| [integracion-widget-chatbot.md](integracion-widget-chatbot.md) | Widget del chat conectado al asistente (`/api/chat/*`): configuración por entorno, sesión, idempotencia y reintentos, historial, fotos, borrado, seguridad de enlaces, CSP, errores, pruebas y pendientes de staging. |
| [despliegue-chat-wordpress.md](despliegue-chat-wordpress.md) | Pasos para publicar en WordPress el plugin 1.4.0 con el chat conectado al asistente: antes, durante y después, y cómo volver atrás. |
| [preguntas-y-apartados.html](preguntas-y-apartados.html) | Preguntas que podría hacerse una persona, con el apartado del sitio que las responde y su enlace en transporteautorizado.cl. |
| [activos-visuales.md](activos-visuales.md) | Catálogo de imágenes de categorías de residuos usadas como recursos ilustrativos de Transporte Autorizado. |
| [linkedin.md](linkedin.md) | Publicaciones de LinkedIn en Transporte: API, secretos y actualización automática. |
| `../normativa/`, `../tools/normativa.py` | Biblioteca de normativa: páginas por norma con texto oficial de Ley Chile (BCN) y PDF. |
