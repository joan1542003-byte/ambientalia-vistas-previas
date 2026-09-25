# Contexto del proyecto

Vistas previas de tres páginas de servicios de gestión de residuos para Chile. Están dirigidas a **empresas**, no a hogares, y en particular a **prevencionistas de riesgo que trabajan en terreno**: necesitan resolver rápido, idealmente con una foto y un WhatsApp.

Hoy hay poca publicidad y poco posicionamiento en gestión de residuos en Chile, así que las páginas tienen que dejar clara la promesa y llevar a una solicitud.

## Modelo de ingresos (orienta la jerarquía de contenidos)

| Línea | Peso | Dónde vive |
|---|---|---|
| Retiro de residuos (peligrosos y no peligrosos) | **80 %** | `transporte-autorizado.html` |
| Suscripción de gestores/transportistas a la plataforma | 10 % | Buscador de transportistas (`transporte-autorizado.html`) |
| Permisos (autorizaciones sanitarias y similares) | 10 % | `transporte-autorizado.html` y `campanas-reciclaje.html` |

Como el retiro es la línea principal, la parte superior de las páginas lleva a **cotizar un retiro**, y los permisos se derivan a secciones propias.

## Las tres páginas y cómo se conectan

```
                 Campañas de reciclaje
            (municipalidades, empresas, etc.)
                 /                    \
   necesitan retiro y            si hay residuos peligrosos,
   transporte autorizado         necesitan HDS / HDSR
               /                          \
   Transporte autorizado  <———————————>  HDS
   (retiro + autorización   el residuo peligroso viaja
    sanitaria)              con su HDS
```

### 1. Transporte autorizado — `transporte-autorizado.html`
- **Objetivo:** que el cliente pueda pedir el **retiro de residuos peligrosos y no peligrosos**, y también obtener la **autorización sanitaria** (permiso para transportar).
- Promesa principal: **«Nos hacemos cargo de tus residuos»**.
- Incluye un buscador de transportistas autorizados por tipo de residuo y comuna (`assets/transportistas-filtro-residuo.js`).
- Normativa: DS 148/2003 (residuos peligrosos), DS 29/2024 (productos prioritarios; el art. 28 exige autorización sanitaria para transportar residuos peligrosos de productos prioritarios y el art. 29 exime a los no peligrosos, aunque deben estar registrados), DS 594.

### 2. HDS — `hds.html`
- **Objetivo:** elaborar, actualizar o revisar **Hojas de Datos de Seguridad** (HDS de producto y HDSR/FDSR de residuos).
- **Va de la mano con Transporte autorizado:** un residuo peligroso tiene que **viajar con su HDS**. La página de transporte deriva a HDS y al revés.
- Normativa: DS 57/2019 (clasificación, etiquetado y HDS; Título V).
- Cotización: ver [PR-COT-HDS-01](procedimientos/PR-COT-HDS-01-cotizacion-hds.md) (servicios, antecedentes mínimos, complejidad, plazos, exclusiones).

### 3. Campañas de reciclaje — `campanas-reciclaje.html`
- **Objetivo:** ofrecer **campañas de recolección** a municipalidades, empresas y otras organizaciones.
- Aquí se juntan las otras dos páginas: la campaña necesita **transporte autorizado** para el retiro y, si recibe residuos peligrosos, sus **HDS**.
- Normativa: DS 29/2024, arts. 7, 24–26, 39–40 y 42. Ver [informe técnico](procedimientos/informe-tecnico-campanas-recoleccion.md).
- Datos clave para el copy:
  - La solicitud de autorización sanitaria va a la SEREMI de Salud **al menos 40 días hábiles antes** de la campaña (art. 24).
  - La SEREMI responde en 30 días hábiles; las observaciones se subsanan en 5 días hábiles, prorrogables una vez por 5 más (arts. 39–40).
  - Si no hay respuesta a tiempo, la solicitud se da por aprobada, **salvo** en campañas con residuos peligrosos (art. 40).
  - Un mes después de terminada la campaña se reportan las cantidades en el RETC (**art. 7**; el informe técnico dice «Art. 5» por error).

## Canales de contacto
- **WhatsApp** (`wa.me/56986067930`) es el canal preferido: rápido y permite enviar fotos. Los formularios generan un resumen y abren WhatsApp con el texto ya escrito.
- **Formulario**: se mantiene sí o sí porque junta los datos completos y puede reenviarse a un tercero (ficha de retiro para el transportista). Todavía no está conectado a ningún correo de destino.
- **Chatbot**: flujo guiado de 7 pasos (ver copy). El análisis de fotos con IA queda pendiente por el costo en tokens.

## Tono y vocabulario
- Español de Chile, directo, que prometa: «te lo hacemos».
- Hablar de **gestor autorizado** o **transportista autorizado**, no de «operador».
- Siempre ofrecer una acción clara: *Cotizar retiro*, *Buscar transportista*, *Hablar con especialista*.

## Documentación relacionada
- [Copy aprobado de Transporte autorizado](copy/transporte-autorizado.md)
- [Decisiones de la reunión de copy](reuniones/reunion-copy-transporte-autorizado.md)
- [Normativa](normativa/)
- [Procedimientos internos](procedimientos/)
