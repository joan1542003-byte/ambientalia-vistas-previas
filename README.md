# Ambientalia · vistas previas

Repositorio público para revisar las versiones de diseño de tres sitios relacionados. Estas páginas son vistas estáticas; el código modular editable y el contexto de negocio están en el repositorio privado [Ambientalia](https://github.com/joan1542003-byte/ambientalia).

## Vistas

- [Transporte Autorizado](https://joan1542003-byte.github.io/ambientalia-vistas-previas/transporte-autorizado.html) — retiro y coordinación de residuos peligrosos y no peligrosos.
- [HDS](https://joan1542003-byte.github.io/ambientalia-vistas-previas/hds.html) — documentación de seguridad química y evaluación documental de residuos.
- [Campañas de reciclaje](https://joan1542003-byte.github.io/ambientalia-vistas-previas/campanas-reciclaje.html) — campañas para municipalidades, empresas y comunidades.

## Relación entre los sitios

Campañas organiza jornadas; Transporte Autorizado coordina retiros; HDS desarrolla y revisa documentación. Cada sitio conserva su alcance y su identidad visual. Lee [`docs/contexto-proyecto.md`](docs/contexto-proyecto.md) para el contexto detallado y [`AGENTS.md`](AGENTS.md) antes de editar.

## Estructura de publicación

- `transporte-autorizado.html`, `hds.html` y `campanas-reciclaje.html` son documentos completos para previsualización.
- `assets/transporte/`, `assets/hds/` y `assets/campanas/` mantienen separados los recursos de cada página.
- `index.html` es el índice de las vistas.
- `robots.txt` y las etiquetas `noindex` mantienen este repositorio fuera de los resultados de búsqueda. No copiar esa configuración a los dominios de producción.


Los documentos de referencia están organizados en [`docs/`](docs/README.md): copy, decisiones, normativa y procedimientos. Este repositorio se excluye deliberadamente de indexación; no copies su configuración `noindex` a producción.
