# Contexto del proyecto

Vistas previas de tres páginas de servicios de gestión de residuos para Chile. Están dirigidas a **empresas**, no a hogares, y en particular a **prevencionistas de riesgo que trabajan en terreno**: necesitan resolver rápido, idealmente con una foto y un WhatsApp.

Hoy hay poca publicidad y poco posicionamiento en gestión de residuos en Chile, así que las páginas tienen que dejar clara la promesa y llevar a una solicitud.

## Modelo de ingresos (antecedente, validar antes de usar)

| Línea | Peso | Dónde vive |
|---|---|---|
| Retiro de residuos (peligrosos y no peligrosos) | **80 %** | `transporte-autorizado.html` |
| Suscripción de gestores/transportistas a la plataforma | 10 % | Buscador de transportistas (`transporte-autorizado.html`) |
| Trámite de permisos sanitarios | **No confirmado como servicio** | No presentarlo en `transporte-autorizado.html`; Campañas puede orientar sobre requisitos aplicables, sin prometer una autorización. |

Los porcentajes proceden de notas anteriores y no deben presentarse como dato vigente sin confirmación. El retiro es la actividad principal de Transporte Autorizado. No presentar ese sitio como un servicio para obtener o tramitar autorizaciones sanitarias.

## Las tres páginas y cómo se conectan

```
                 Campañas de reciclaje
            (municipalidades, empresas, etc.)
                 /                    \
   necesitan retiro y            si hay residuos peligrosos,
   transporte autorizado         necesitan HDS / HDSR
               /                          \
   Transporte autorizado  <———————————>  HDS
   (retiro de residuos)     documentación técnica
                            cuando corresponda
```

### 1. Transporte autorizado — `transporte-autorizado.html`
- **Objetivo:** que empresas y organizaciones puedan coordinar el **retiro de residuos peligrosos y no peligrosos** y encontrar transportistas según residuo y comuna. El servicio del sitio es retirar y coordinar residuos; no ofrece obtener ni tramitar autorizaciones sanitarias.
- Promesa principal: **«Nos hacemos cargo de tus residuos»**.
- Incluye un buscador de transportistas autorizados por tipo de residuo y comuna (datos en `assets/transporte/transportistas.json`, versión compacta de `assets/transporte/transportistas-filtro-residuo.js`; ver `tools/compactar-transportistas.py`).
- Normativa: D.S. 148/2003 para manejo de residuos peligrosos. El D.S. 29 regula labores relacionadas con residuos de productos prioritarios y puede establecer requisitos de autorización según actividad y caso. Una regla normativa no significa que Transporte Autorizado preste el trámite. Verifica el artículo, alcance, vigencia y transición en la fuente oficial antes de publicar requisitos concretos.

### 2. HDS — `hds.html`
- **Objetivo:** elaborar, actualizar o revisar **Hojas de Datos de Seguridad** (HDS de producto y HDSR/FDSR de residuos).
- **Va de la mano con Transporte Autorizado:** cuando el retiro de un residuo peligroso requiere documentación de seguridad, HDS apoya con la hoja que corresponda. No confundas HDS/FDS de producto, FDSR/HDSR de residuo y documentos de transporte; verifica excepciones y requisitos aplicables al caso.
- Normativa: DS 57/2019 (clasificación, etiquetado y HDS; Título V).
- Cotización: ver [PR-COT-HDS-01](procedimientos/PR-COT-HDS-01-cotizacion-hds.md) (servicios, antecedentes mínimos, complejidad, plazos, exclusiones).

### 3. Campañas de reciclaje — `campanas-reciclaje.html`
- **Objetivo:** ofrecer **campañas de recolección** a municipalidades, empresas y otras organizaciones.
- Aquí se conectan las otras dos páginas: la campaña puede requerir **Transporte Autorizado** para coordinar retiros y apoyo de **HDS** si corresponde documentación de residuos peligrosos.
- Normativa: DS 29/2024, arts. 7, 24–26, 39–40 y 42. Ver [informe técnico](procedimientos/informe-tecnico-campanas-recoleccion.md).
- Datos clave para el copy:
  - La solicitud de autorización sanitaria va a la SEREMI de Salud **al menos 40 días hábiles antes** de la campaña (art. 24).
  - La SEREMI responde en 30 días hábiles; las observaciones se subsanan en 5 días hábiles, prorrogables una vez por 5 más (arts. 39–40).
  - Si no hay respuesta a tiempo, la solicitud se da por aprobada, **salvo** en campañas con residuos peligrosos (art. 40).
  - Un mes después de terminada la campaña se reportan las cantidades en el RETC (**art. 7**; el informe técnico dice «Art. 5» por error).

## Canales de contacto
- **WhatsApp** (`wa.me/56986067930`) es el canal preferido: rápido y permite enviar fotos. Los formularios generan un resumen y abren WhatsApp con el texto ya escrito.
- **Formulario**: se mantiene sí o sí porque junta los datos completos y puede reenviarse a un tercero (ficha de retiro para el transportista). Todavía no está conectado a ningún correo de destino.
  En Transporte Autorizado vive dentro del hero (opción «Necesito gestionar mis residuos») en dos pasos: Retiro y Contacto. Cada dato se elige en una ventana de selección: residuo (con imágenes), cantidad por rango, región y comuna, y fecha y horario (modalidad, calendario y franja). Se escriben solo la dirección y los datos de contacto. Los detalles opcionales (acceso, estado, almacenamiento, antecedentes, RUT, correo para la ficha de retiro y comentarios) no se exigen. Sigue la reunión de copy: datos imprescindibles, horario desde/hasta, condiciones de acceso y correo para derivar la ficha.
- **Asistente de retiro (chat en el hero)**: se puede escribir en el campo del hero o dentro del asistente, o tocar opciones. `assets/site/interpretar.js` reconoce sin IA urgencia y modalidad (p. ej. «necesito un retiro urgente» = Retiro Express), residuo, cantidad, comuna, día, horario, almacenamiento y documentos; el asistente anota lo reconocido y pregunta solo lo que falta, con los 7 pasos del copy. Según palabras clave, el campo del hero abre cotizar (conversación), buscar transportista (ya filtrado) o hablar con un especialista (tema y consulta listos para WhatsApp). La comuna se limita a la Región Metropolitana. Termina con una revisión y abre WhatsApp con el resumen; las fotos y documentos se adjuntan allí. El análisis de fotos con IA queda pendiente por el costo en tokens.

## Tono y vocabulario
- Español de Chile, directo, que prometa: «te lo hacemos».
- Hablar de **gestor autorizado** o **transportista autorizado**, no de «operador».
- Siempre ofrecer una acción clara: *Cotizar retiro*, *Buscar transportista*, *Hablar con especialista*.

## Precedencia y documentación relacionada

Las anotaciones y correcciones más recientes de la persona responsable prevalecen sobre decisiones de reuniones antiguas, borradores de copy y texto ya incluido en las vistas. Para afirmaciones legales, prevalece la norma oficial vigente. El texto de `copy/transporte-autorizado.md` conserva material anterior y no debe tratarse como aprobado en las partes que contradigan este contexto; en particular, Transporte Autorizado no ofrece tramitar permisos sanitarios.

- [Copy de referencia de Transporte Autorizado, con secciones antiguas por revisar](copy/transporte-autorizado.md)
- [Decisiones de la reunión de copy](reuniones/reunion-copy-transporte-autorizado.md)
- [Normativa](normativa/)
- [Procedimientos internos](procedimientos/)
