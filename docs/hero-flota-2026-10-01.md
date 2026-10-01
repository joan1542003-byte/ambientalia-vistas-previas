# Imagen del hero · 01-10-2026

El cliente entregó la imagen definitiva del hero: atardecer sobre Santiago con una flota de seis vehículos a la derecha.
(Una primera imagen de ese día, con tres camiones grandes, se usó unas horas y se retiró: no era la correcta.)

- Original, tal como llegó: `assets/transporte/transporte-hero-flota-ciudad.webp` (1774 × 887). No se muestra directamente: de él salen las dos versiones que usa la página, con `python3 tools/hero-cielo.py`.
- Escritorio: `transporte-hero-flota-ciudad-cielo.webp` (1774 × 1111). La misma foto con 224 px de cielo agregados arriba (continúa los colores del borde superior de la propia foto; no agrega objetos). Motivo: la flota ocupa del 37 % al 98 % del ancho de la foto y debe verse completa a la derecha de los controles del hero, sin quedar detrás de ellos ni cortada por el borde (pedido del 28-09). Para eso la foto se muestra un poco más chica que el hero, anclada abajo a la derecha, y el cielo extra rellena la parte de arriba.
- Teléfono y tablet (hasta 860 px): `transporte-hero-flota-ciudad-movil.webp` (1204 × 712), un recorte con la flota a lo ancho; con la foto completa los vehículos quedaban muy chicos en la franja del teléfono.
- CSS (`transporte.css`, bloque del hero): en escritorio el ancho de la foto es `min(100%, (100% − 438px) × 1,5954)`, de modo que el primer vehículo quede a 438 px del borde izquierdo del hero en cualquier ancho; lo que la foto no cubre (arriba y a la izquierda) es `--hero-cielo`, el color en que termina su cielo, y los bordes de la foto se funden con él. En el teléfono, `object-position: 100% 62%`.
- Para cambiar la foto: reemplaza el original, corre `python3 tools/hero-cielo.py` y copia en el CSS el `aspect-ratio` y el color que imprime. Si la flota ocupa otra zona de la imagen, ajusta `MOVIL` en el script y los dos números del ancho en el CSS (438 px = borde derecho de los controles más un margen; 1,5954 = 1 ÷ la fracción del ancho de la foto que va desde el primer vehículo hasta el borde derecho).
- Imagen ilustrativa, no prueba de flota propia. Se conservan los archivos anteriores a esta fecha (`transporte-hero-flota-derecha.webp` y otros).
