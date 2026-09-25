# Contexto para trabajar en este repositorio

## Para qué existe

Este repositorio público aloja vistas previas de tres sitios de Ambientalia. Sirve para inspección visual y conversación; no es el repositorio fuente, un sistema de gestión de contenido ni el sitio de producción. Las páginas publicadas incluyen `noindex` y el repositorio dispone de `robots.txt` para no aparecer en búsquedas.

El código fuente y la documentación de trabajo están en el repositorio privado [joan1542003-byte/ambientalia](https://github.com/joan1542003-byte/ambientalia). Cuando tengas acceso, úsalo como fuente de verdad y edita allí. No sobrescribas con una edición manual el HTML compilado de este repositorio si el cambio debe conservarse en el proyecto.

## Propósito de cada sitio

- **Transporte Autorizado (`transporteautorizado.cl`)**: ayuda a empresas y otras organizaciones a coordinar el retiro de residuos peligrosos y no peligrosos. El buscador se basa en los registros y categorías de la pestaña «Filtro por residuo» de los listados de transportistas recibidos, con corte de datos al 31-12-2025. No inventes empresas, residuos aceptados, comunas, capacidades, permisos ni vigencia actual. Si cambia la fuente, identifica el archivo y fecha del nuevo listado antes de actualizar el buscador.
- **HDS (`hds.cl`)**: presta apoyo técnico para elaborar, actualizar, homologar y revisar hojas de seguridad, además de evaluar documentalmente residuos mediante FDSR. Prioriza la FDSR cuando se describan los servicios relacionados con residuos. Distingue la HDS/FDS de producto químico de la documentación de seguridad propia del transporte de residuos peligrosos. El servicio no es una autoridad, laboratorio, transportista ni certificador oficial.
- **Campañas de reciclaje (`campanasdereciclaje.cl`)**: ofrece orientación, diseño y coordinación de campañas de recolección para municipalidades, empresas y comunidades. Una campaña puede enlazar con Transporte Autorizado para coordinar retiros y con HDS si surge una necesidad documental; no conviertas la página de campañas en una página general de transporte ni presentes el transporte como el propósito de una campaña.

## Límites editoriales y normativos

- No confundas estos tres servicios ni combines sus formularios, promesas, precios, contactos o áreas de cobertura.
- Las correcciones recientes del cliente prevalecen sobre minutas, copies antiguos y HTML previo. Si otro documento dice que Transporte Autorizado tramita permisos sanitarios, considéralo desactualizado: la página es de retiro y coordinación de residuos.
- Presenta como hechos solo lo que esté respaldado por las notas, el material fuente y los registros disponibles. No inventes clientes, resultados, acreditaciones, autorizaciones, plazos o compromisos comerciales.
- El D.S. 148 se relaciona con la gestión de residuos peligrosos y requisitos de transporte; la documentación y sus excepciones dependen del caso. El D.S. 57 trata clasificación y comunicación de peligros de sustancias y mezclas, no clasifica automáticamente un residuo. El D.S. 29 establece requisitos sanitarios para ciertas actividades vinculadas con residuos de productos prioritarios y campañas; una obligación regulatoria no convierte el trámite de una autorización en un servicio de Transporte Autorizado. Antes de cambiar una afirmación legal, confirma texto, alcance, vigencia y disposiciones transitorias en una fuente oficial (BCN, Diario Oficial o autoridad competente). En la documentación de trabajo existe el texto publicado el 14-ENE-2026 como Decreto 29, promulgado en 2024; evita llamarlo «Decreto 29 de 2026» sin verificar su denominación oficial.
- Una HDS/FDS de un producto no es una FDSR ni sustituye por sí sola los documentos exigibles para transportar un residuo peligroso. No afirmes que una hoja, asesoría o herramienta equivale a un certificado o aprobación de una autoridad.
- Los listados de transportistas son una fuente fechada, no una garantía de que una autorización siga vigente hoy. Conserva la procedencia y fecha de cualquier dato mostrado; evita referencias internas de Excel como números de pestaña o página cuando no ayuden al usuario.
- Los formularios actuales preparan una consulta o un resumen local salvo que el código de origen demuestre que existe un endpoint conectado. No afirmes que una solicitud fue enviada si solo se abrió WhatsApp, correo, copia o descarga.

## Diseño y experiencia

- Mantén coherencia de familia, con identidades cromáticas propias: Transporte Autorizado usa azul/índigo operativo; HDS usa celeste claro; Campañas usa verdes. La categoría de residuo peligroso puede usar rojo/naranja como señal funcional, sin recolorear toda la página.
- Nunito es la tipografía acordada. Usa texto legible, jerarquía estable, contenido directo, navegación predecible y controles redondeados. Evita interfaces recargadas, números ornamentales, emojis, adornos sin función, tarjetas gigantes y patrones genéricos repetidos.
- Conserva las imágenes propias de cada página; no reutilices una imagen entre sitios si puede dar a entender que representan el mismo servicio. Las 23 imágenes por categoría de residuo de Transporte Autorizado y sus restricciones de uso están en [`docs/activos-visuales.md`](docs/activos-visuales.md). Son ilustrativas: no permiten inferir ni certificar la clasificación de un residuo. Las imágenes de hero deben cargar, conservar un encuadre adecuado al `object-fit: cover` y tener dimensiones declaradas.
- Las interacciones deben indicar con claridad qué cambia y qué ocurrirá después. El buscador de transporte actualiza resultados al cambiar sus filtros y debe mantener los filtros visibles. No cambies los datos filtrados por recomendaciones especulativas de cercanía.
- Diseña y verifica escritorio, tablet y móvil. Evita desbordamiento horizontal, controles difíciles de tocar y contenido que se pierda con `overflow: hidden`.
- Las animaciones son cortas y funcionales, respetan `prefers-reduced-motion` y no deben mover el layout de forma inesperada.
- Usa HTML semántico, foco visible, etiquetas accesibles y texto alternativo cuando la imagen aporte información. No dupliques navegación ni headings.

## Coordinación entre agentes (desde el 25-09-2026)

Por decisión del responsable, las sesiones de Claude Code editan **directamente** el HTML de este repositorio y publican en `main`. Otro agente genera estas mismas páginas desde la copia local de `ambientalia`, y una publicación suya sin sincronizar ya sobrescribió cambios aprobados una vez. Por eso:

- Antes de publicar un HTML regenerado desde `ambientalia`, trae los cambios de `main` de este repositorio (`git log -- <archivo>.html`) y llévalos a la fuente, o combínalos. No reemplaces el archivo completo sin comparar.
- La capa compartida `assets/shared/ui.css` y `assets/shared/ui.js` agrega las microinteracciones: progreso de lectura, header al hacer scroll, sección activa en la navegación, aparición escalonada, `details` animados, carruseles en móvil y barra de acción móvil. Cada página la carga desde el `head` (con `html.ui`) y al final del `body`. La barra móvil se configura con `data-ui-cta-label`, `data-ui-cta-href` y `data-ui-chat-text` en `<body>`. Consérvalas al regenerar.
- La fuente de íconos usa un subconjunto (`icon_names=` en el enlace de Google Fonts, en orden alfabético). Si agregas un ícono de Material Symbols, súmalo a esa lista o se verá como texto.
- Cada sitio tiene `favicon.svg` y `apple-touch-icon.png` en su carpeta `assets/<sitio>/`.

## Edición y publicación

Las notas de reunión y `docs/copy/transporte-autorizado.md` conservan formulaciones anteriores sobre permisos. No son vigentes donde contradigan este contexto. Consulta `docs/contexto-proyecto.md`, `docs/README.md` y la fuente normativa oficial antes de reutilizarlas.

1. Identifica el sitio afectado y localiza la fuente modular correspondiente en el repositorio privado.
2. Cambia los fragmentos fuente, vuelve a generar `website/index.html` y comprueba que los fragmentos y el montaje estén sincronizados.
3. Actualiza en este repositorio solo el HTML de vista afectado y los recursos de su propio directorio `assets/<sitio>/`. Mantén intactos los otros sitios.
4. Conserva las rutas de assets con su namespace para que no choquen nombres repetidos. Mantén los enlaces cruzados de las vistas dirigidos a los otros HTML de preview cuando corresponda.
5. Mantén `noindex`, el `robots.txt` y el índice de vistas. No publiques aquí datos personales, credenciales, archivos de origen privados ni listados completos que no sean necesarios para la vista.
6. Confirma que el HTML apunta a recursos existentes, que la imagen del hero carga y que el cambio aparece en el preview publicado. El dominio de preview no es el dominio de producción.

## SEO y GEO

Las vistas de este repositorio son deliberadamente `noindex`; su canonical puede apuntar al dominio de producción y no se debe optimizar el preview como resultado de búsqueda. Las páginas de producción deben conservar su canonical propio, `lang="es-CL"`, títulos y descripciones específicos, encabezados semánticos, contenido visible verificable y datos estructurados que coincidan con el contenido real. No añadas FAQ, schema, ubicaciones, precios ni promesas solo para buscadores. La claridad factual, la fuente y la fecha son más importantes que la repetición de palabras clave.
