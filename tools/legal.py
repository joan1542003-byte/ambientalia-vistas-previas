"""Condiciones del servicio, política de privacidad y borrado de la conversación, en el propio sitio (legal/*.html).

El texto es el que publica el asistente (https://taax.greensoft.cl/<página>, servicio de Jeremy): se copia tal cual, con
el formato del sitio. El formulario de cotización, el chat y el pie enlazan a estas copias. Si el asistente publica una
versión nueva, se vuelve a correr: python3 tools/legal.py   (tools/normativa.py lo ejecuta al final; sin red usa la copia guardada en docs/legal/)
"""
import html as H
import json
import re
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import normativa as N  # noqa: E402

ROOT = N.ROOT
SITE = N.SITE
ORIGEN = 'https://taax.greensoft.cl'
PAGINAS = [  # (página del asistente, rótulo corto)
    ('condiciones-del-servicio', 'Condiciones del servicio'),
    ('politica-de-privacidad', 'Política de privacidad'),
    ('eliminacion-de-datos', 'Borrar tu conversación'),
]
PERMITIDAS = {'h2', 'h3', 'p', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'strong', 'em', 'br'}


def correo(hexa):
    """Cloudflare oculta los correos (data-cfemail): el primer byte es la clave del XOR."""
    b = bytes.fromhex(hexa)
    return ''.join(chr(c ^ b[0]) for c in b[1:])


def limpio(fragmento):
    """Solo las etiquetas de texto, sin atributos (salvo href); correos y enlaces entre estas páginas, a las copias."""
    fragmento = re.sub(r'<a [^>]*>\s*<span class="__cf_email__" data-cfemail="([0-9a-f]+)">.*?</span>\s*</a>',
                       lambda m: f'<a href="mailto:{correo(m.group(1))}">{correo(m.group(1))}</a>', fragmento, flags=re.S)

    def etiqueta(m):
        cierre, nombre, attrs = m.group(1), m.group(2).lower(), m.group(3)
        if nombre not in PERMITIDAS:
            return ''
        if cierre or nombre != 'a':
            return f'<{cierre}{nombre}>'
        href = re.search(r'href="([^"]*)"', attrs)
        href = href.group(1) if href else ''
        for slug, _ in PAGINAS:
            if href.rstrip('/') in (f'{ORIGEN}/{slug}', f'/{slug}'):
                return f'<a href="{slug}.html">'
        externo = href.startswith('http')
        return f'<a href="{H.escape(href)}"' + (' target="_blank" rel="noopener noreferrer">' if externo else '>')
    fragmento = re.sub(r'<(/?)([a-zA-Z0-9]+)([^>]*)>', etiqueta, fragmento)
    # Espacios: uno solo dentro del texto (también junto a enlaces y negritas); ninguno junto a las etiquetas de bloque
    fragmento = re.sub(r'\s+', ' ', fragmento)
    fragmento = re.sub(r'\s*(</?(?:h2|h3|p|ul|ol|li|table|thead|tbody|tr|th|td)>|<br>)\s*', r'\1', fragmento)
    fragmento = re.sub(r'\s+(</(?:a|strong|em)>)', r'\1', fragmento)
    for bloque in ('h2', 'h3', 'p', 'ul', 'ol', 'table'):
        fragmento = fragmento.replace(f'<{bloque}>', f'\n<{bloque}>')
    return fragmento.strip()


def leer(slug):
    pedido = urllib.request.Request(f'{ORIGEN}/{slug}', headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'})
    with urllib.request.urlopen(pedido, timeout=20) as r:  # Cloudflare rechaza el agente de Python
        s = r.read().decode('utf-8')
    texto = lambda patron: H.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', (re.search(patron, s, re.S) or [None, ''])[1]))).strip()
    doc = re.search(r'<div class="document">(.*?)</div>\s*</article>', s, re.S) or re.search(r'<article>(.*?)</article>', s, re.S)
    return {
        'kicker': texto(r'<p class="eyebrow">(.*?)</p>'),
        'titulo': texto(r'<h1>(.*?)</h1>'),
        'bajada': texto(r'<p class="hero-copy">(.*?)</p>'),
        'vigencia': texto(r'<aside class="hero-panel"[^>]*>.*?<p>(.*?)</p>'),
        'cuerpo': limpio(doc.group(1)).replace('versión aprobado', 'versión aprobada'),
    }


def pagina(slug, rotulo, d, version, tools):
    import ayuda as A
    url = f'{SITE}/legal/{slug}.html'
    otras = ''.join(f'<li><a href="{s}.html">{A.esc(r)}</a></li>' for s, r in PAGINAS if s != slug)
    ld = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'WebPage', '@id': f'{url}#pagina', 'name': d['titulo'], 'description': d['bajada'], 'inLanguage': 'es-CL', 'url': url,
         'isPartOf': {'@id': f'{SITE}/#website'}, 'publisher': {'@id': f'{SITE}/#organizacion'}},
        {'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Transporte Autorizado', 'item': f'{SITE}/'},
            {'@type': 'ListItem', 'position': 2, 'name': 'Legal'},
            {'@type': 'ListItem', 'position': 3, 'name': rotulo}]}]}
    cuerpo = f'''<main id="contenido">
  <article class="container guia legal">
    <nav class="norm-crumbs" aria-label="Ruta"><a href="../transporte-autorizado.html">Inicio</a><span aria-hidden="true">/</span><span>Legal</span><span aria-hidden="true">/</span><span aria-current="page">{A.esc(rotulo)}</span></nav>
    <header class="guia-head">
      <p class="norm-kind">{A.esc(d["kicker"])}</p>
      <h1 class="norm-title">{A.esc(d["titulo"])}</h1>
      <p class="norm-lead">{A.esc(d["bajada"])}</p>
      {f'<p class="legal-vigencia">{A.esc(d["vigencia"])}</p>' if d["vigencia"] else ''}
    </header>
    <div class="legal-doc">
{d["cuerpo"]}
    </div>
    <footer class="norm-source">
      <ul class="legal-otras">{otras}</ul>
      <a class="btn btn-quiet btn-small" href="../transporte-autorizado.html">{A.ICO["volver"]}Volver al inicio</a>
    </footer>
  </article>
</main>'''
    return A.envoltura(d['titulo'], d['bajada'], url, ld, 'marco', cuerpo, version, tools, clase=' legal-page', og='website')


def main():
    version = N.version_actual()
    tools = N.herramientas()
    (ROOT / 'legal').mkdir(exist_ok=True)
    (ROOT / 'docs/legal').mkdir(parents=True, exist_ok=True)
    for slug, rotulo in PAGINAS:
        guardado = ROOT / 'docs/legal' / f'{slug}.json'  # el texto copiado: en git se ve qué cambió en el asistente
        try:
            d = leer(slug)
            guardado.write_text(json.dumps(d, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
        except OSError as e:
            if not guardado.exists():
                raise
            print(f'legal/{slug}.html: sin conexión con el asistente ({e}); se usa la copia guardada')
            d = json.loads(guardado.read_text(encoding='utf-8'))
        (ROOT / 'legal' / f'{slug}.html').write_text(pagina(slug, rotulo, d, version, tools), encoding='utf-8')
        print(f'legal/{slug}.html')


if __name__ == '__main__':
    main()
