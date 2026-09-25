# CLAUDE.md

Sitio estático (HTML/CSS/JS sin build) con vistas previas de diseño publicadas en GitHub Pages (`.nojekyll`, `robots.txt` bloquea la indexación).

- `transporte-autorizado.html`: retiro y coordinación de residuos peligrosos y no peligrosos; no ofrece obtener ni tramitar autorizaciones sanitarias.
- `hds.html`: Hojas de Datos de Seguridad (HDS/HDSR). Van de la mano con el transporte, porque el residuo peligroso viaja con su HDS.
- `campanas-reciclaje.html`: campañas de recolección para municipalidades y empresas. Se apoyan en las otras dos páginas.
- `assets/<página>/`: imágenes y scripts de cada página.
- `docs/activos-visuales.md`: catálogo de las 23 imágenes ilustrativas de categorías de residuos para Transporte Autorizado; los fondos de color no sustituyen una clasificación técnica.

Antes de cambiar textos, código o formularios, lee `AGENTS.md` y `docs/contexto-proyecto.md`. Las correcciones recientes del cliente prevalecen sobre minutas, copy anterior y prototipos. `docs/copy/transporte-autorizado.md` conserva material previo y contiene secciones que deben revisarse; no lo trates como autoridad si contradice el contexto actualizado. Para afirmaciones normativas, consulta `docs/normativa/` y los procedimientos, y confirma el alcance y vigencia en una fuente oficial.

Convenciones: español de Chile, público empresarial (prevencionistas en terreno), «gestor» o «transportista autorizado» en vez de «operador», WhatsApp `56986067930` como canal principal y formulario como respaldo.

Flujo acordado: en esta sesión se edita directamente el HTML de este repositorio y se publica en Pages (merge a `main`) al terminar cada tanda de cambios. Lee la sección «Coordinación entre agentes» de `AGENTS.md`: capa compartida `assets/shared/`, subconjunto de íconos y precauciones con las publicaciones del otro agente.
