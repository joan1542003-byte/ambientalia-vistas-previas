#!/usr/bin/env python3
"""Versiones del logo de Transporte Autorizado para el sitio, a partir del original del cliente (docs/marca/TA_LOGO.svg).

El original es un SVG cuadrado con fondo blanco: el camión arriba y el nombre abajo. El sitio necesita piezas sueltas y
livianas, así que este programa separa el original, sin redibujar nada, y escribe:

  assets/transporte/logo/logo.svg     el logo completo (camión sobre el nombre), sin fondo y recortado
  assets/transporte/logo/camion.svg   solo el camión (encabezado, pie)
  assets/transporte/logo/nombre.svg   solo el nombre en dos líneas (encabezado, pie)
  assets/transporte/favicon.svg       ícono de la pestaña: el camión sobre un cuadro del color de la marca
  assets/transporte/apple-touch-icon.png   lo mismo, para la pantalla de inicio del teléfono (180 × 180)

En los dos íconos el camión va sin contorno y sobre el color del sitio: suelto y a 16 px, el original casi no se distingue.

Qué hace con el original: une las letras del nombre en una sola forma (el archivo trae cada letra dos veces) y convierte
el contorno del camión, que venía como trazo «por fuera» con máscara, en una forma rellena. El resultado pesa menos de
la mitad. Formas, degradado y proporciones son los del original.

Color: por pedido del cliente (02-10-2026), en el sitio el logo usa el color del sitio y no el del archivo original
(#000DFF). Se toma de la variable --accent de assets/site/site.css (lila desde el 08-10-2026): si ese color cambia, hay
que ejecutar esto de nuevo.

Uso: python3 tools/logo.py   (necesita Swift, que viene con las herramientas de Xcode: une las formas con CoreGraphics)
Si el cliente entrega un logo nuevo, reemplaza docs/marca/TA_LOGO.svg y vuelve a ejecutarlo.
"""
import json
import re
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ORIGEN = ROOT / 'docs' / 'marca' / 'TA_LOGO.svg'
DESTINO = ROOT / 'assets' / 'transporte' / 'logo'
FAVICON = ROOT / 'assets' / 'transporte' / 'favicon.svg'
TOQUE = ROOT / 'assets' / 'transporte' / 'apple-touch-icon.png'
ESTILOS = ROOT / 'assets' / 'site' / 'site.css'
ANCHO_ICONO = 0.74  # cuánto del ancho del ícono ocupa el camión
RADIO_ICONO = 0.22  # redondeo del cuadro del ícono de la pestaña, como fracción del lado
AIRE = 2            # unidades libres alrededor de cada pieza, para que el borde no quede cortado

TOK = re.compile(r'([MmLlHhVvCcZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)')
CUANTOS = {'M': 2, 'L': 2, 'H': 1, 'V': 1, 'C': 6}


def ordenes(d):
    """Trazado SVG (M L H V C Z, absolutas o relativas) → órdenes absolutas M, L, C y Z."""
    toks = [(m.group(1), m.group(2)) for m in TOK.finditer(d)]
    i, cmd, out, cur, ini = 0, None, [], (0.0, 0.0), (0.0, 0.0)
    while i < len(toks):
        if toks[i][0]:
            cmd = toks[i][0]
            i += 1
            if cmd in 'Zz':
                out.append(['Z'])
                cur = ini
                continue
        tipo = cmd.upper()
        v = [float(toks[i + k][1]) for k in range(CUANTOS[tipo])]
        i += CUANTOS[tipo]
        ox, oy = cur if cmd.islower() else (0.0, 0.0)
        if tipo == 'M':
            cur = ini = (v[0] + ox, v[1] + oy)
            out.append(['M', *cur])
            cmd = 'l' if cmd.islower() else 'L'
        elif tipo == 'L':
            cur = (v[0] + ox, v[1] + oy)
            out.append(['L', *cur])
        elif tipo == 'H':
            cur = (v[0] + ox, cur[1])
            out.append(['L', *cur])
        elif tipo == 'V':
            cur = (cur[0], v[0] + oy)
            out.append(['L', *cur])
        else:
            p = [v[0] + ox, v[1] + oy, v[2] + ox, v[3] + oy, v[4] + ox, v[5] + oy]
            cur = (p[4], p[5])
            out.append(['C', *p])
    return out


def leer(svg):
    """Separa el original: letras del nombre, silueta (la forma con degradado) y cara blanca del camión."""
    cuerpo = re.sub(r'<mask\b.*?</mask>', '', svg, flags=re.S)
    piezas = {'nombre': [], 'silueta': [], 'cara': []}
    datos = {}
    for m in re.finditer(r'<path\b([^>]*)/>', cuerpo):
        a = dict(re.findall(r'([\w:-]+)="([^"]*)"', m.group(1)))
        forma = {'c': ordenes(a['d']), 'par': a.get('fill-rule') == 'evenodd'}
        relleno = a.get('fill', '')
        if 'stroke' in a:
            datos['contorno'], datos['trazo'] = a['stroke'], float(a['stroke-width'])
        elif relleno.startswith('url('):
            piezas['silueta'].append(forma)
        elif relleno.lower() in ('white', '#fff', '#ffffff'):
            piezas['cara'].append(forma)
        elif relleno:
            piezas['nombre'].append(forma)
            datos['tinta'] = relleno
    g = re.search(r'<linearGradient\b([^>]*)>(.*?)</linearGradient>', svg, flags=re.S)
    ga = dict(re.findall(r'([\w:-]+)="([^"]*)"', g.group(1)))
    datos['y1'], datos['y2'] = float(ga['y1']), float(ga['y2'])
    datos['c1'], datos['c2'] = re.findall(r'stop-color="([^"]*)"', g.group(2))
    return piezas, datos


def color_del_sitio():
    """El color del sitio: la variable --accent que define :root en assets/site/site.css."""
    m = re.search(r':root\s*\{[^}]*?--accent:\s*(#[0-9a-fA-F]{6})\b', ESTILOS.read_text(encoding='utf-8'), flags=re.S)
    if not m:
        raise SystemExit(f'No encontré --accent en {ESTILOS.relative_to(ROOT)}')
    return m.group(1).lower()


def rgb(color):
    if color.lower() == 'white':
        return [1, 1, 1]
    h = color.lstrip('#')
    return [int(h[k:k + 2], 16) / 255 for k in (0, 2, 4)]


def unir(entrada):
    """Compila (si hace falta) y ejecuta tools/logo.swift."""
    fuente = Path(__file__).with_suffix('.swift')
    binario = Path(tempfile.gettempdir()) / 'ta-logo-unir'
    if not binario.exists() or binario.stat().st_mtime < fuente.stat().st_mtime:
        subprocess.run(['swiftc', '-O', str(fuente), '-o', str(binario)], check=True)
    r = subprocess.run([str(binario)], input=json.dumps(entrada).encode(), capture_output=True, check=True)
    return json.loads(r.stdout)


def main():
    piezas, d = leer(ORIGEN.read_text(encoding='utf-8'))
    original = d['tinta']
    d['tinta'] = d['contorno'] = d['c2'] = color_del_sitio()  # nombre, contorno y degradado: el color del sitio
    print(f'Color del logo en el sitio: {d["tinta"]} (el original trae {original})')
    DESTINO.mkdir(parents=True, exist_ok=True)
    r = unir({**piezas, 'trazo': d['trazo'],
              'png': {'ruta': str(TOQUE), 'lado': 180, 'ancho': ANCHO_ICONO, 'y1': d['y1'], 'y2': d['y2'],
                      'c1': rgb(d['c1']), 'c2': rgb(d['c2']), 'fondo': rgb(d['contorno'])}})
    blanco = '#fff'
    degradado = (f'<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="{d["y1"]:g}" x2="0" y2="{d["y2"]:g}">'
                 f'<stop stop-color="{blanco if d["c1"].lower() == "white" else d["c1"]}"/><stop offset="1" stop-color="{d["c2"]}"/></linearGradient></defs>')
    camion = lambda azul: (f'<path fill="{d["contorno"]}" d="{r[azul]}"/><path fill="url(#g)" d="{r["silueta"]}"/>'
                           f'<path fill="{blanco}" d="{r["cara"]}"/>')
    nombre = f'<path fill="{d["tinta"]}" d="{r["nombre"]}"/>'

    def caja(*claves):
        cajas = [r['cajas'][k] for k in claves]
        x0, y0 = min(c[0] for c in cajas) - AIRE, min(c[1] for c in cajas) - AIRE
        x1, y1 = max(c[0] + c[2] for c in cajas) + AIRE, max(c[1] + c[3] for c in cajas) + AIRE
        return x0, y0, x1 - x0, y1 - y0

    def escribir(ruta, vista, contenido, titulo):
        x, y, w, h = vista
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x:.1f} {y:.1f} {w:.1f} {h:.1f}" width="{w:.0f}" height="{h:.0f}">'
               f'<title>{titulo}</title>{contenido}</svg>\n')
        ruta.write_text(svg, encoding='utf-8')
        print(f'{ruta.relative_to(ROOT)}: {len(svg) / 1024:.1f} KB · proporción {w / h:.4f} ({w:.0f} × {h:.0f})')

    escribir(DESTINO / 'logo.svg', caja('camion', 'nombre'), degradado + camion('azul') + nombre, 'Transporte Autorizado')
    escribir(DESTINO / 'camion.svg', caja('camion'), degradado + camion('azul'), 'Transporte Autorizado')
    escribir(DESTINO / 'nombre.svg', caja('nombre'), nombre, 'Transporte Autorizado')
    # Ícono de la pestaña: cuadro redondeado del color del sitio con el camión (degradado y cara, sin contorno) al centro
    x, y, w, h = r['cajas']['volumen']
    lado = w / ANCHO_ICONO
    cuadro = (x + w / 2 - lado / 2, y + h / 2 - lado / 2, lado, lado)
    fondo = (f'<rect x="{cuadro[0]:.1f}" y="{cuadro[1]:.1f}" width="{lado:.1f}" height="{lado:.1f}" rx="{lado * RADIO_ICONO:.1f}" fill="{d["contorno"]}"/>')
    escribir(FAVICON, cuadro, degradado + fondo + f'<path fill="url(#g)" d="{r["silueta"]}"/><path fill="{blanco}" d="{r["cara"]}"/>', 'Transporte Autorizado')
    print(f'{TOQUE.relative_to(ROOT)}: {TOQUE.stat().st_size / 1024:.1f} KB')


if __name__ == '__main__':
    main()
