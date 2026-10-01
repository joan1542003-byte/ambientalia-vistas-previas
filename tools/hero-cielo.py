#!/usr/bin/env python3
"""Versión de escritorio de la foto del hero de Transporte: la misma imagen con más cielo arriba.

Por qué: en escritorio el hero recorta la foto a lo ancho. Con los camiones tan grandes como vienen en la imagen, el
primero quedaba detrás de los controles y el último cortado por el borde. Al agregar cielo, la foto se muestra un poco
más chica y los tres camiones caben completos a la derecha de los controles. En el teléfono se usa la foto original.

El cielo agregado no se inventa: continúa hacia arriba los colores de la franja superior de la propia foto (suavizados)
y termina en un color plano, que es el mismo fondo que usa el hero (`--hero-cielo` en transporte.css), para que no haya
corte cuando la foto se muestra más baja en pantallas angostas.

Uso: python3 tools/hero-cielo.py [origen.webp] [destino.webp] [alto_extra]
     Por defecto: assets/transporte/transporte-hero-flota-grande.webp → …-grande-cielo.webp, 208 px.
     Al terminar imprime el color plano: cópialo en `--hero-cielo` si cambió. Requiere Pillow.
"""
import sys
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
ORIGEN = ROOT / 'assets/transporte/transporte-hero-flota-grande.webp'
EXTRA = 208      # px de cielo que se agregan arriba (a la resolución de la foto)
COSTURA = 90     # filas de la foto original que se funden con el cielo agregado (las nubes del borde se desvanecen)


def fila_suave(img, y0, y1, muestras=10):
    """Promedio de las filas y0..y1 como lista de (r, g, b) por columna, muy suavizado a lo ancho (sin vetas)."""
    w = img.width
    banda = img.crop((0, y0, w, y1)).resize((w, 1), Image.BOX)
    banda = banda.resize((muestras, 1), Image.BOX).resize((w, 1), Image.BICUBIC)
    return list(banda.get_flattened_data() if hasattr(banda, 'get_flattened_data') else banda.getdata())


def paso_suave(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def main():
    origen = Path(sys.argv[1]) if len(sys.argv) > 1 else ORIGEN
    destino = Path(sys.argv[2]) if len(sys.argv) > 2 else origen.with_name(origen.stem + '-cielo.webp')
    extra = int(sys.argv[3]) if len(sys.argv) > 3 else EXTRA
    foto = Image.open(origen).convert('RGB')
    w, h = foto.size

    borde = fila_suave(foto, 0, 14)                 # color del cielo en el borde superior
    # Cambio de color por px al subir, igual para todas las columnas (por columna dejaba vetas verticales)
    arriba, abajo = fila_suave(foto, 0, 26, 1)[0], fila_suave(foto, 110, 150, 1)[0]
    tendencia = [tuple((a - b) / 118 for a, b in zip(arriba, abajo))] * w

    # Color plano del extremo superior: el promedio de lo que daría seguir la tendencia hasta arriba
    alcance = lambda u: u * (1 - 0.45 * u / extra)  # la tendencia se va frenando
    tope = [tuple(c + t * alcance(extra) for c, t in zip(pc, pt)) for pc, pt in zip(borde, tendencia)]
    plano = tuple(round(sum(p[k] for p in tope) / w) for k in range(3))

    cielo = Image.new('RGB', (w, extra))
    px = []
    for r in range(extra):
        u = extra - r                                 # px sobre la costura
        k = alcance(u)
        f = paso_suave((u / extra - 0.3) / 0.7)       # arriba converge al color plano
        for x in range(w):
            c = borde[x]
            t = tendencia[x]
            px.append(tuple(max(0, min(255, round((c[i] + t[i] * k) * (1 - f) + plano[i] * f))) for i in range(3)))
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

    lienzo.save(destino, 'WEBP', quality=90, method=6)
    print(f'{destino.relative_to(ROOT) if destino.is_relative_to(ROOT) else destino}: {w} × {h + extra}, {destino.stat().st_size // 1024} KB')
    print('--hero-cielo: rgb({} {} {})'.format(*plano))


if __name__ == '__main__':
    main()
