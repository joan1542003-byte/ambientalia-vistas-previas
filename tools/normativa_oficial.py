"""PDF oficiales de la normativa: los que exporta Ley Chile (Biblioteca del Congreso Nacional), alojados en el sitio.

Cada norma de assets/transporte/normativa.json queda en assets/transporte/normativa/oficial/<slug>.pdf, tal como la entrega
Ley Chile (con su encabezado, fechas de publicación y promulgación, versión y enlace corto). La página de la norma y la
biblioteca del panel «Ayuda» los ofrecen junto a la copia del sitio. Solo se descargan los que faltan; --actualizar los
vuelve a pedir todos. Los muy pesados (tablas como imágenes) se aligeran recomprimiendo las imágenes en JPEG.

Uso: python3 tools/normativa_oficial.py [--actualizar]
"""
import http.client
import io
import json
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DESTINO = ROOT / 'assets/transporte/normativa/oficial'
EXPORTAR = ('https://nuevo.leychile.cl/servicios/Consulta/Exportar?radioExportar=Normas&exportar_formato=pdf&nombrearchivo={slug}'
            '&exportar_con_notas_bcn=False&exportar_con_notas_originales=False&exportar_con_notas_al_pie=False'
            '&hddResultadoExportar={id}.{version}.0.0%23')
# Ley Chile exporta el texto bajo otra fecha de versión que la de su servicio XML (con esa, el PDF sale vacío)
VERSION_PDF = {'ds-29-2024-minsal': '2026-07-14'}
PESO_MAX = 8_000_000  # sobre esto, se recomprimen las imágenes
AGENTE = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'


def descargar(n):
    url = EXPORTAR.format(slug=n['slug'], id=n['id'], version=VERSION_PDF.get(n['slug'], n['version']))
    for intento in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': AGENTE}), timeout=120) as r:
                datos = r.read()
            if datos.startswith(b'%PDF') and b'%%EOF' in datos[-1024:]:
                return datos
        except (OSError, http.client.HTTPException) as e:
            print(f'  {n["slug"]}: {e}; se reintenta')
        time.sleep(2 + intento * 3)
    raise SystemExit(f'{n["slug"]}: Ley Chile no entregó el PDF')


def aligerar(datos):
    """Las imágenes, a JPEG de calidad 50 y 1400 px como máximo (pypdf y Pillow)."""
    from pypdf import PdfReader, PdfWriter
    from PIL import Image
    w = PdfWriter(clone_from=PdfReader(io.BytesIO(datos)))
    for pagina in w.pages:
        for img in pagina.images:
            im = img.image
            if im.mode not in ('RGB', 'L'):
                im = im.convert('RGB')
            im.thumbnail((1400, 1400), Image.LANCZOS)
            img.replace(im, quality=50)
        pagina.compress_content_streams()
    salida = io.BytesIO()
    w.write(salida)
    return salida.getvalue()


def main():
    actualizar = '--actualizar' in sys.argv
    DESTINO.mkdir(parents=True, exist_ok=True)
    for n in json.loads((ROOT / 'assets/transporte/normativa.json').read_text(encoding='utf-8'))['normas']:
        archivo = DESTINO / f'{n["slug"]}.pdf'
        if archivo.exists() and not actualizar:
            continue
        datos = descargar(n)
        if len(datos) > PESO_MAX:
            antes = len(datos)
            datos = aligerar(datos)
            print(f'  {n["slug"]}: {antes / 1e6:.1f} MB → {len(datos) / 1e6:.1f} MB')
        archivo.write_bytes(datos)
        print(f'{archivo.relative_to(ROOT)}  {len(datos) / 1e3:.0f} KB')


if __name__ == '__main__':
    main()
