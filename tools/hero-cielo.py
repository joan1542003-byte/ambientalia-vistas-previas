#!/usr/bin/env python3
"""Versiones de la foto del hero de Transporte a partir de la imagen original que entrega el cliente.

1. Escritorio (`…-cielo.webp`): la misma foto con más cielo arriba. En escritorio la flota debe quedar completa a la
   derecha de los controles del hero; para eso la foto se muestra más chica que el hero y hace falta cielo que rellene
   la parte de arriba. El cielo agregado no se inventa: continúa hacia arriba los colores de la franja superior de la
   propia foto (suavizados) y termina en un color plano, el mismo que usa el hero de fondo (`--hero-cielo` en
   transporte.css), para que no haya corte cuando la foto se muestra más baja en pantallas angostas.
2. Teléfono (`…-movil.webp`): un recorte de la foto con la flota a lo ancho; en la franja angosta del teléfono la foto
   completa dejaba los vehículos muy chicos.

Uso: python3 tools/hero-cielo.py [origen.webp]
     Por defecto: assets/transporte/transporte-hero-flota-ciudad.webp. Requiere Pillow.
Al terminar imprime el tamaño de la versión de escritorio y el color plano: si cambiaron, actualiza `aspect-ratio` y
`--hero-cielo` en el bloque del hero de transporte.css. Si en una foto nueva la flota ocupa otra zona, ajusta MOVIL
aquí y el ancho de la foto en ese mismo bloque de CSS (ver docs/hero-flota-2026-10-01.md).
"""
import sys
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
ORIGEN = ROOT / 'assets/transporte/transporte-hero-flota-ciudad.webp'
EXTRA = 224                    # px de cielo que se agregan arriba (a la resolución de la foto)
COSTURA = 150                  # filas de la foto que se funden con el cielo agregado (las nubes del borde se desvanecen)
PLANO_DESDE = 0.45             # el color plano sale del cielo de la derecha: la izquierda queda bajo el velo oscuro del hero
MOVIL = (570, 175, 1774, 887)  # recorte para el teléfono (izquierda, arriba, derecha, abajo): la flota a lo ancho


def fila_suave(img, y0, y1, muestras=10):
    """Promedio de las filas y0..y1 como lista de (r, g, b) por columna, muy suavizado a lo ancho (sin vetas)."""
    w = img.width
    banda = img.crop((0, y0, w, y1)).resize((w, 1), Image.BOX)
    banda = banda.resize((muestras, 1), Image.BOX).resize((w, 1), Image.BICUBIC)
    return list(banda.get_flattened_data() if hasattr(banda, 'get_flattened_data') else banda.getdata())


def paso_suave(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def con_cielo(foto, extra):
    w, h = foto.size
    borde = fila_suave(foto, 0, 14)                 # color del cielo en el borde superior
    # Cambio de color por px al subir, igual para todas las columnas (por columna dejaba vetas verticales)
    arriba, abajo = fila_suave(foto, 0, 26, 1)[0], fila_suave(foto, 110, 150, 1)[0]
    tendencia = tuple((a - b) / 118 for a, b in zip(arriba, abajo))
    alcance = lambda u: u * (1 - 0.45 * u / extra)  # la tendencia se va frenando

    # Color plano del extremo superior: promedio de la parte derecha de lo que daría seguir la tendencia hasta arriba
    desde = int(w * PLANO_DESDE)
    tope = [tuple(c + t * alcance(extra) for c, t in zip(pc, tendencia)) for pc in borde[desde:]]
    plano = tuple(max(0, min(255, round(sum(p[k] for p in tope) / len(tope)))) for k in range(3))

    cielo = Image.new('RGB', (w, extra))
    px = []
    for r in range(extra):
        u = extra - r                                 # px sobre la costura
        k = alcance(u)
        f = paso_suave((u / extra - 0.25) / 0.75)     # arriba converge al color plano
        for x in range(w):
            c = borde[x]
            px.append(tuple(max(0, min(255, round((c[i] + tendencia[i] * k) * (1 - f) + plano[i] * f))) for i in range(3)))
    cielo.putdata(px)

    # Costura: las primeras filas de la foto se funden con el color suave del borde (así las nubes no quedan cortadas)
    suave = Image.new('RGB', (w, 1))
    suave.putdata([tuple(round(v) for v in c) for c in borde])
    suave = suave.resize((w, COSTURA), Image.NEAREST)
    mascara = Image.new('L', (1, COSTURA))
    mascara.putdata([round(255 * paso_suave(y / COSTURA)) for y in range(COSTURA)])
    mascara = mascara.resize((w, COSTURA), Image.NEAREST)
    franja = Image.composite(foto.crop((0, 0, w, COSTURA)), suave, mascara)

    lienzo = Image.new('RGB', (w, h + extra))
    lienzo.paste(cielo, (0, 0))
    lienzo.paste(foto, (0, extra))
    lienzo.paste(franja, (0, extra))

    # Un poco de grano en lo agregado, como el de la foto, para que el degradado no forme bandas al comprimir
    alto_grano = extra + COSTURA
    grano = Image.effect_noise((w, alto_grano), 2.2).convert('RGB')
    zona = ImageChops.add(lienzo.crop((0, 0, w, alto_grano)), grano, scale=1, offset=-128)
    lienzo.paste(zona, (0, 0))
    lienzo.paste(Image.new('RGB', (w, 1), plano), (0, 0))  # la primera fila, exactamente el color plano
    return lienzo, plano


def main():
    origen = Path(sys.argv[1]) if len(sys.argv) > 1 else ORIGEN
    foto = Image.open(origen).convert('RGB')
    nombre = lambda sufijo: origen.with_name(f'{origen.stem}-{sufijo}.webp')
    ver = lambda p: p.relative_to(ROOT) if p.is_relative_to(ROOT) else p

    lienzo, plano = con_cielo(foto, EXTRA)
    lienzo.save(nombre('cielo'), 'WEBP', quality=90, method=6)
    print(f'{ver(nombre("cielo"))}: {lienzo.width} × {lienzo.height}, {nombre("cielo").stat().st_size // 1024} KB')
    print('  aspect-ratio: {} / {}   ·   --hero-cielo: rgb({} {} {})'.format(lienzo.width, lienzo.height, *plano))

    movil = foto.crop(MOVIL)
    movil.save(nombre('movil'), 'WEBP', quality=88, method=6)
    print(f'{ver(nombre("movil"))}: {movil.width} × {movil.height}, {nombre("movil").stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
