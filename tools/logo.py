#!/usr/bin/env python3
"""Piezas del logotipo de Transporte Autorizado para el sitio, a partir del original del cliente (docs/marca/logotipo.svg).

El logotipo oficial (entregado el 15-10-2026) es una placa de dos franjas: «TRANSPORTE» en lila sobre una franja clara
y «AUTORIZADO» en claro sobre una franja lila, con un marco lila. Usa dos colores: #6708C7 (oscuro) y #FDF7FF (claro).
El anterior (camión con el nombre, 09-10-2026) queda en docs/marca/logotipo-camion-2026-10-09.svg.

Este programa separa el original por color, sin redibujar nada, y escribe:

  assets/transporte/logo/logotipo.svg   el logotipo completo con sus colores (pie de página, redes, respaldo)
  assets/transporte/logo/claro.svg      lo que va en el color claro   ┐ máscaras: el sitio las pinta con CSS (va abajo lo
  assets/transporte/logo/oscuro.svg     lo que va en el color oscuro  ┘ claro y encima lo oscuro, como en el original), así
                                                                          el logo cambia de colores mientras se le pasa el puntero
  assets/transporte/favicon.svg         ícono de la pestaña: una placa chica con la «T» y la «A» del logotipo
  assets/transporte/apple-touch-icon.png   lo mismo, para la pantalla de inicio del teléfono (180 × 180)
  assets/transporte/logo/logotipo-correo.png   el logotipo en PNG para el encabezado de los correos (muchos
                                         programas de correo no muestran SVG)

Uso: python3 tools/logo.py   (el PNG se dibuja con sips, que viene con macOS)
Si el cliente entrega un logotipo nuevo, reemplaza docs/marca/logotipo.svg y vuelve a ejecutarlo.
"""
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ORIGEN = ROOT / 'docs' / 'marca' / 'logotipo.svg'
DESTINO = ROOT / 'assets' / 'transporte' / 'logo'
FAVICON = ROOT / 'assets' / 'transporte' / 'favicon.svg'
TOQUE = ROOT / 'assets' / 'transporte' / 'apple-touch-icon.png'
OSCURO, CLARO = '#6708C7', '#FDF7FF'   # los dos colores del original
LADO, RADIO, MARCO = 64, 14, 2.5        # ícono: lado, redondeo y grosor del marco


def caja(d):
    """Caja que contiene un trazo (los puntos de control alcanzan: la exportación de Figma usa M, L, H, V, C y Z absolutos)."""
    assert not re.search(r'[a-df-zAQSTqst]', d), 'el original trae órdenes de trazo que este programa no lee'
    xs, ys = [], []
    x = y = 0.0
    for cmd, args in re.findall(r'([MLHVCZ])([^MLHVCZ]*)', d):
        n = [float(v) for v in re.findall(r'-?\d*\.?\d+(?:e-?\d+)?', args)]
        if cmd == 'H':
            for v in n: x = v; xs.append(x)
        elif cmd == 'V':
            for v in n: y = v; ys.append(y)
        elif cmd in 'MLC':
            for i in range(0, len(n) - 1, 2):
                x, y = n[i], n[i + 1]; xs.append(x); ys.append(y)
    return min(xs), min(ys), max(xs), max(ys)


def main():
    svg = ORIGEN.read_text(encoding='utf-8')
    vista = re.search(r'viewBox="([^"]+)"', svg).group(1)
    w, h = [float(v) for v in vista.split()[2:]]
    trazos = []
    for antes, d, despues in re.findall(r'<path\b([^>]*?)\bd="([^"]+)"([^>]*?)/>', svg):
        attrs = antes + despues
        color = re.search(r'fill="([^"]+)"', attrs).group(1).upper()
        assert color in (OSCURO, CLARO), f'color inesperado en el original: {color}'
        trazos.append((color, d, ' fill-rule="evenodd" clip-rule="evenodd"' if 'evenodd' in attrs else ''))
    claro = [(d, r) for c, d, r in trazos if c == CLARO]
    oscuro = [(d, r) for c, d, r in trazos if c == OSCURO]
    assert claro and oscuro, 'no se encontraron los dos colores del logotipo'

    def hoja(piezas, titulo=''):
        cuerpo = ''.join(f'<path fill="{c}"{r} d="{d}"/>' for c, grupo in piezas for d, r in grupo)
        return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vista}">{f"<title>{titulo}</title>" if titulo else ""}{cuerpo}</svg>\n'

    DESTINO.mkdir(parents=True, exist_ok=True)
    for viejo in ('forma.svg', 'texto.svg'):  # piezas del logotipo anterior
        (DESTINO / viejo).unlink(missing_ok=True)
    (DESTINO / 'logotipo.svg').write_text(hoja([(CLARO, claro), (OSCURO, oscuro)], 'Transporte Autorizado'), encoding='utf-8')
    (DESTINO / 'claro.svg').write_text(hoja([('#000', claro)]), encoding='utf-8')
    (DESTINO / 'oscuro.svg').write_text(hoja([('#000', oscuro)]), encoding='utf-8')

    # Ícono: la primera letra de cada franja («T» arriba, en oscuro; «A» abajo, en claro), en una placa chica
    def letra(color, franja):
        cand = [(caja(d), d, r) for c, d, r in trazos if c == color]
        cand = [x for x in cand if x[0][2] - x[0][0] < w * 0.15 and (x[0][1] < h / 2) == (franja == 'arriba')]
        return min(cand, key=lambda x: x[0][0])
    (tx0, ty0, tx1, ty1), td, tr = letra(OSCURO, 'arriba')
    (ax0, ay0, ax1, ay1), ad, ar = letra(CLARO, 'abajo')
    alto = LADO / 2 - 2 * MARCO - 6                      # cada letra ocupa su franja, con aire
    e = alto / max(ty1 - ty0, ay1 - ay0)
    def poner(x0, y0, x1, y1, cy):
        return f'translate({LADO / 2 - (x0 + x1) / 2 * e:.3f} {cy - (y0 + y1) / 2 * e:.3f}) scale({e:.5f})'
    medio = LADO / 2
    icono = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {LADO} {LADO}">'
             f'<rect width="{LADO}" height="{LADO}" rx="{RADIO}" fill="{OSCURO}"/>'
             f'<rect x="{MARCO}" y="{MARCO}" width="{LADO - 2 * MARCO}" height="{medio - MARCO}" rx="{RADIO - MARCO}" fill="{CLARO}"/>'
             f'<rect x="{MARCO}" y="{medio - RADIO}" width="{LADO - 2 * MARCO}" height="{RADIO}" fill="{CLARO}"/>'
             f'<path fill="{OSCURO}"{tr} transform="{poner(tx0, ty0, tx1, ty1, (MARCO + medio) / 2)}" d="{td}"/>'
             f'<path fill="{CLARO}"{ar} transform="{poner(ax0, ay0, ax1, ay1, (medio + LADO - MARCO) / 2)}" d="{ad}"/>'
             '</svg>\n')
    FAVICON.write_text(icono, encoding='utf-8')
    subprocess.run(['sips', '-s', 'format', 'png', '-z', '180', '180', str(FAVICON), '--out', str(TOQUE)], check=True, capture_output=True)
    correo = DESTINO / 'logotipo-correo.png'
    subprocess.run(['sips', '-s', 'format', 'png', '-z', str(round(600 * h / w)), '600', str(DESTINO / 'logotipo.svg'), '--out', str(correo)], check=True, capture_output=True)
    for f in (DESTINO / 'logotipo.svg', DESTINO / 'claro.svg', DESTINO / 'oscuro.svg', FAVICON, TOQUE, correo):
        print(f'{f.relative_to(ROOT)}  {f.stat().st_size / 1024:.1f} KB')
    print(f'Proporción del logotipo: {w:.0f} / {h:.0f} (va en .logo-ta, assets/site/transporte.css)')


if __name__ == '__main__':
    main()
