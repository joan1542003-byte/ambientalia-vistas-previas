# Imagen del hero · 01-10-2026

Solicitud del cliente: usar en el hero la imagen que entregó (los mismos tres camiones, más grandes y juntos a la derecha).

- Original, tal como llegó: `assets/transporte/transporte-hero-flota-grande.webp` (1942 × 809). Se usa en el teléfono y tablet (hasta 860 px), con el encuadre de siempre (`object-position: 80% 72%`).
- Escritorio: `assets/transporte/transporte-hero-flota-grande-cielo.webp` (1942 × 1017). Es la misma foto con 208 px de cielo agregados arriba por `tools/hero-cielo.py` (continúa los colores del borde superior de la propia foto; no agrega objetos). Motivo: en escritorio el hero recorta la foto a lo ancho y, con los camiones a ese tamaño, el primero quedaba detrás de los controles y el último cortado por el borde. Con más cielo la foto se muestra algo más chica y los tres caben completos a la derecha de los controles, que era lo pedido el 28-09.
- CSS (`transporte.css`, bloque del hero): en escritorio la foto se ancla abajo, con `object-position: 84% 100%`; entre 861 y 1143 px se muestra más baja para que los camiones sigan cabiendo, y arriba queda el color en que termina el cielo (`--hero-cielo`, el que imprime el script).
- Para cambiar la foto otra vez: reemplaza el original, corre `python3 tools/hero-cielo.py` y copia el color que imprime en `--hero-cielo` si cambió. Si los camiones ocupan otra parte de la imagen, ajusta `object-position` y el cálculo de alto en el mismo bloque.
- Imagen ilustrativa, no prueba de flota propia. Se conservan los archivos anteriores (`transporte-hero-flota-derecha.webp` y otros).
