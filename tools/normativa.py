"""Biblioteca de normativa de Transporte Autorizado.

Descarga el texto oficial de cada norma desde Ley Chile (Biblioteca del Congreso Nacional, servicio XML
https://www.bcn.cl/leychile/Consulta/obtxml?opt=7&idNorma=...) y genera:

- normativa/<slug>.html: una página por norma con sus datos, el objeto (artículo 1, textual), índice y el texto completo,
  con la fuente citada y datos estructurados (schema.org/Legislation). Texto visible = mejor para SEO y GEO.
- assets/transporte/normativa.json: índice que lee la biblioteca de la página (búsqueda, filtros y vista previa).

Los PDF se generan después desde estas páginas: node tools/normativa-pdf.mjs
Uso: python3 tools/normativa.py            (todas)   ·   python3 tools/normativa.py ds-148-2003-minsal   (una)
Para agregar una norma: súmala a NORMAS con su idNorma de Ley Chile y revisa el texto «rel» (por qué importa).
"""
import html
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NS = '{http://www.leychile.cl/esquemas}'
SITE = 'https://transporteautorizado.cl'
HOY = date.today().isoformat()

TEMAS = {
    'peligrosos': 'Residuos peligrosos',
    'transporte': 'Transporte',
    'rep': 'REP y reciclaje',
    'almacenamiento': 'Almacenamiento',
    'sustancias': 'Sustancias peligrosas',
    'salud': 'Residuos de salud',
    'trabajo': 'Lugares de trabajo',
    'registro': 'Reportes y registros',
    'marco': 'Marco ambiental',
}

# idNorma de Ley Chile, slug, nombre corto, tema de la tarjeta, temas y por qué importa para el retiro de residuos
NORMAS = [
    (226458, 'ds-148-2003-minsal', 'Residuos peligrosos', ['peligrosos', 'transporte', 'almacenamiento'],
     'Es la base para identificar, almacenar, transportar y eliminar residuos peligrosos, y para la documentación que acompaña su traslado.'),
    (12087, 'ds-298-1994-mtt', 'Transporte de cargas peligrosas', ['transporte'],
     'Fija las condiciones para transportar sustancias peligrosas por calles y caminos: vehículos, rotulación y operación.'),
    (1090894, 'ley-20920', 'Ley REP', ['rep', 'marco'],
     'Marco de la gestión de residuos y de la responsabilidad extendida del productor (REP) para productos prioritarios.'),
    (1157019, 'ds-12-2020-mma', 'Metas REP de envases y embalajes', ['rep'],
     'Metas de recolección y valorización y obligaciones asociadas para envases y embalajes.'),
    (1154847, 'ds-8-2019-mma', 'Metas REP de neumáticos', ['rep'],
     'Metas de recolección y valorización y obligaciones asociadas para neumáticos.'),
    (1220286, 'ds-29-2024-minsal', 'Residuos de productos prioritarios', ['rep', 'almacenamiento'],
     'Requisitos sanitarios para recibir y almacenar residuos de productos prioritarios, también en campañas de recolección.'),
    (1008725, 'ds-6-2009-minsal', 'Residuos de establecimientos de salud (REAS)', ['salud', 'peligrosos'],
     'Condiciones para manejar los residuos que se generan en establecimientos de atención de salud.'),
    (1088802, 'ds-43-2015-minsal', 'Almacenamiento de sustancias peligrosas', ['sustancias', 'almacenamiento'],
     'Condiciones de las instalaciones donde se almacenan sustancias peligrosas.'),
    (1155752, 'ds-57-2019-minsal', 'Clasificación y etiquetado de sustancias', ['sustancias'],
     'Clasificación, etiquetado y comunicación de peligros de sustancias y mezclas (HDS). No clasifica por sí solo un residuo.'),
    (167766, 'ds-594-1999-minsal', 'Condiciones sanitarias en lugares de trabajo', ['trabajo', 'peligrosos'],
     'Condiciones sanitarias y ambientales básicas de los lugares de trabajo, incluido el manejo de residuos industriales.'),
    (1050536, 'ds-1-2013-mma', 'Registro RETC', ['registro'],
     'Declaración de emisiones, residuos y transferencias de contaminantes en el RETC.'),
    (30667, 'ley-19300', 'Bases generales del medio ambiente', ['marco'],
     'Ley marco ambiental: principios, instrumentos de gestión y fiscalización ambiental.'),
]

# Cómo reconocer cada norma en un texto (publicaciones de LinkedIn y búsqueda): expresión regular sobre texto en minúsculas
# y sin tildes, con su peso. Número de la norma = 3; sigla o tema propio = 2; tema compartido = 1. Gana el puntaje mayor.
NUM = r'(?:d\.?\s?s\.?|decreto(?: supremo)?|dto\.?)\s?(?:n[°º.o]?\s?)?'
ALIAS = {
    'ds-148-2003-minsal': [[NUM + r'148\b', 3], [r'\bsidrep\b', 2], [r'residuos? peligrosos?', 1]],
    'ds-298-1994-mtt': [[NUM + r'298\b', 3], [r'cargas? peligrosas?', 2], [r'transporte de (sustancias|mercancias) peligrosas', 2]],
    'ley-20920': [[r'(ley\s?(n[°º.o]?\s?)?)?20\.?920\b', 3], [r'\bley rep\b', 2], [r'responsabilidad extendida del productor', 2], [r'\brep\b', 1]],
    'ds-12-2020-mma': [[NUM + r'12\b', 3], [r'envases? y embalajes?', 2]],
    'ds-8-2019-mma': [[NUM + r'8\b', 3], [r'neumaticos?', 2], [r'\bnfu\b', 2]],
    'ds-29-2024-minsal': [[NUM + r'29\b', 3], [r'productos? prioritarios?', 1], [r'campanas? de (recoleccion|reciclaje)', 1]],
    'ds-6-2009-minsal': [[NUM + r'6\b', 3], [r'\breas\b', 2], [r'establecimientos? de (atencion de )?salud', 2]],
    'ds-43-2015-minsal': [[NUM + r'43\b', 3], [r'almacenamiento de sustancias peligrosas', 2], [r'bodegas? de sustancias', 1]],
    'ds-57-2019-minsal': [[NUM + r'57\b', 3], [r'\bhds\b', 2], [r'hojas? de (datos de )?seguridad', 2], [r'\bsga\b|\bghs\b', 2], [r'etiquetado', 1]],
    'ds-594-1999-minsal': [[NUM + r'594\b', 3], [r'lugares? de trabajo', 2], [r'residuos? industriales?', 1]],
    'ds-1-2013-mma': [[NUM + r'1\b(?![.,]\d)', 3], [r'\bretc\b', 2], [r'ventanilla unica', 2]],
    'ley-19300': [[r'(ley\s?(n[°º.o]?\s?)?)?19\.?300\b', 3], [r'\bseia\b', 2], [r'evaluacion de impacto ambiental', 2]],
}

ORG_CORTO = {
    'MINISTERIO DE SALUD': 'Ministerio de Salud',
    'MINISTERIO DEL MEDIO AMBIENTE': 'Ministerio del Medio Ambiente',
    'MINISTERIO DE TRANSPORTES Y TELECOMUNICACIONES': 'Ministerio de Transportes y Telecomunicaciones',
    'MINISTERIO SECRETARÍA GENERAL DE LA PRESIDENCIA': 'Ministerio Secretaría General de la Presidencia',
}
MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']


def fecha_larga(iso):
    y, m, d = map(int, iso.split('-'))
    return f'{d} de {MESES[m - 1]} de {y}'


def fecha_corta(iso):
    y, m, d = map(int, iso.split('-'))
    return f'{d} {MESES[m - 1][:3]}. {y}'


def fetch(id_norma):
    url = f'https://www.bcn.cl/leychile/Consulta/obtxml?opt=7&idNorma={id_norma}'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (biblioteca de normativa)'})
    return ET.fromstring(urllib.request.urlopen(req, timeout=60).read())


def esc(s):
    return html.escape(s or '', quote=True)


def parrafos(texto):
    """Texto oficial a párrafos: respeta los saltos del original y descarta líneas vacías."""
    out = []
    # Ley Chile entrega algunos símbolos codificados dos veces (&amp;gt;): se decodifican antes de escapar
    for bloque in re.split(r'\n\s*\n', html.unescape(texto or '').replace('\r', '')):
        lineas = [l.strip() for l in bloque.split('\n') if l.strip()]
        if lineas:
            out.append('<br>'.join(esc(l) for l in lineas))
    return ''.join(f'<p>{p}</p>' for p in out)


def titulo_corto(tipo, numero, prom):
    y = prom[:4]
    if tipo == 'Ley':
        n = f'{int(numero):,}'.replace(',', '.') if numero.isdigit() else numero
        return f'Ley {n}'
    return f'D.S. {numero}/{y}'


def estructura(parent, nivel, toc, arts):
    """Recorre las partes (títulos, párrafos, artículos) y devuelve el HTML del texto."""
    out = []
    for parte in parent.findall(f'{NS}EstructuraFuncional'):
        tipo = parte.get('tipoParte', '')
        idp = parte.get('idParte', '')
        texto = parte.findtext(f'{NS}Texto') or ''
        derog = parte.get('derogado') == 'derogado'
        hijos = parte.find(f'{NS}EstructurasFuncionales')
        if tipo == 'Artículo':
            nombre = (parte.findtext(f'{NS}Metadatos/{NS}NombreParte') or '').strip()
            ancla = f'art-{re.sub(r"[^0-9a-z]+", "-", nombre.lower()).strip("-") or idp}'
            if ancla in arts:
                ancla = f'{ancla}-{idp}'
            arts.append(ancla)
            cuerpo = parrafos(texto)
            cuerpo = re.sub(r'^<p>((?:Artículo|ARTÍCULO|Art\.)[^.<]{0,40}\.-?)', r'<p><strong>\1</strong>', cuerpo, count=1)
            out.append(f'<section class="norm-art{" is-derogado" if derog else ""}" id="{ancla}">{cuerpo}</section>')
        else:
            titulo = (parte.findtext(f'{NS}Metadatos/{NS}TituloParte') or '').strip() or texto.strip().split('\n')[0]
            h = min(2 + nivel, 4)
            ancla = f'p-{idp}'
            if titulo:
                toc.append((nivel, ancla, re.sub(r'\s+', ' ', titulo)))
            resto = texto.strip()
            extra = '' if not resto or resto == titulo else parrafos(resto)
            out.append(f'<h{h} class="norm-part" id="{ancla}">{esc(re.sub(r"\s+", " ", titulo))}</h{h}>{extra if extra != f"<p>{esc(titulo)}</p>" else ""}')
        if hijos is not None:
            out.append(estructura(hijos, nivel + 1, toc, arts))
    return ''.join(out)


def primer_articulo(root):
    for parte in root.iter(f'{NS}EstructuraFuncional'):
        if parte.get('tipoParte') == 'Artículo':
            t = re.sub(r'\s+', ' ', html.unescape(parte.findtext(f'{NS}Texto') or '')).strip()
            # «Artículo único/primero: Apruébase el siguiente reglamento…»: el objeto está en el artículo 1 del reglamento
            if re.match(r'^Art[íi]culo (único|primero)\W{0,4}.{0,20}Apru[ée]b', t, re.I):
                continue
            return t
    return ''


ICON = {
    'pdf': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
    'out': '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 11l6-6M6 5h5v5"/></svg>',
    'back': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
}


def pagina(n, cuerpo, toc, version):
    ld = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'Legislation',
                '@id': f'{SITE}/normativa/{n["slug"]}.html#norma',
                'name': n['nombre'],
                'alternateName': n['corto'],
                'legislationIdentifier': f'{n["tipo"]} {n["numero"]}',
                'legislationType': n['tipo'],
                'legislationDate': n['promulgacion'],
                'datePublished': n['publicacion'],
                'dateModified': n['version'],
                'legislationPassedBy': {'@type': 'GovernmentOrganization', 'name': n['organismo']},
                'legislationJurisdiction': {'@type': 'AdministrativeArea', 'name': 'Chile'},
                'legislationLegalForce': 'https://schema.org/InForce' if n['vigente'] else 'https://schema.org/NotInForce',
                'inLanguage': 'es-CL',
                'url': f'{SITE}/normativa/{n["slug"]}.html',
                'isBasedOn': n['fuente'],
                'sameAs': n['fuente'],
                'encoding': {'@type': 'MediaObject', 'contentUrl': f'{SITE}/{n["pdf"]}', 'encodingFormat': 'application/pdf'},
                'about': [TEMAS[t] for t in n['temas']],
            },
            {
                '@type': 'BreadcrumbList',
                'itemListElement': [
                    {'@type': 'ListItem', 'position': 1, 'name': 'Transporte Autorizado', 'item': f'{SITE}/'},
                    {'@type': 'ListItem', 'position': 2, 'name': 'Documentos y normativa', 'item': f'{SITE}/#normativa'},
                    {'@type': 'ListItem', 'position': 3, 'name': n['corto']},
                ],
            },
        ],
    }
    indice = ''.join(f'<li><a href="#{a}">{esc(t)}</a></li>' for a, t in toc)
    temas = ''.join(f'<li>{esc(TEMAS[t])}</li>' for t in n['temas'])
    estado = 'Vigente' if n['vigente'] else 'Derogada'
    desc = f'{n["corto"]}: {n["titulo"].capitalize()}. Texto oficial, datos clave y descarga en PDF. Fuente: Ley Chile (BCN).'
    return f'''<!doctype html>
<html lang="es-CL">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{esc(n["corto"])} · {esc(n["tema"])} | Transporte Autorizado</title>
<meta name="description" content="{esc(desc)}">
<meta name="robots" content="noindex,nofollow">
<link rel="canonical" href="{SITE}/normativa/{n["slug"]}.html">
<meta property="og:locale" content="es_CL">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Transporte Autorizado">
<meta property="og:title" content="{esc(n["corto"])} · {esc(n["tema"])}">
<meta property="og:description" content="{esc(desc)}">
<link rel="icon" href="../assets/transporte/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/site/site.css?v={version}">
<link rel="stylesheet" href="../assets/site/transporte.css?v={version}">
<script>document.documentElement.classList.add('js')</script>
<script type="application/ld+json">
{json.dumps(ld, ensure_ascii=False, indent=2)}
</script>
</head>
<body data-site="transporte" class="norm-page" data-tema="{n["temas"][0]}">
<a class="skip" href="#contenido">Saltar al contenido</a>
<header class="site-header">
  <div class="container">
    <a class="brand" href="../transporte-autorizado.html" aria-label="Transporte Autorizado, inicio">
      <svg width="32" height="32" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="12" fill="#2f5bd3"/><path d="M9 14h14v12H9zM23 18h5l4 4v4h-9M13 30a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm14 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>
      Transporte Autorizado
    </a>
    <nav class="nav" id="nav" aria-label="Principal">
      <a href="../transporte-autorizado.html#normativa">Normativa</a>
      <a class="btn btn-primary btn-small" href="../transporte-autorizado.html#cotizar">Cotizar retiro</a>
    </nav>
  </div>
</header>

<main id="contenido">
  <article class="container norm">
    <nav class="norm-crumbs" aria-label="Ruta"><a href="../transporte-autorizado.html">Inicio</a><span aria-hidden="true">/</span><a href="../transporte-autorizado.html#normativa">Documentos y normativa</a><span aria-hidden="true">/</span><span aria-current="page">{esc(n["corto"])}</span></nav>
    <header class="norm-head">
      <p class="norm-kind">{esc(n["tipo"])} · {esc(n["organismo"])}</p>
      <h1 class="norm-title">{esc(n["corto"])} · {esc(n["tema"])}</h1>
      <p class="norm-lead">{esc(n["titulo"].capitalize())}.</p>
      <ul class="norm-meta">
        <li><span class="norm-state{"" if n["vigente"] else " is-off"}">{estado}</span></li>
        <li>Promulgada el <time datetime="{n["promulgacion"]}">{fecha_corta(n["promulgacion"])}</time></li>
        <li>Publicada el <time datetime="{n["publicacion"]}">{fecha_corta(n["publicacion"])}</time></li>
        <li>Texto al <time datetime="{n["version"]}">{fecha_corta(n["version"])}</time></li>
        <li>{n["articulos"]} artículos</li>
      </ul>
      <div class="norm-actions">
        <a class="btn btn-ink btn-small" href="../{n["pdf"]}" download>{ICON["pdf"]}Descargar PDF</a>
        <a class="btn btn-quiet btn-small" href="{esc(n["fuente"])}" target="_blank" rel="noopener noreferrer">Ley Chile{ICON["out"]}<span class="sr-only"> (pestaña nueva)</span></a>
      </div>
      <p class="norm-why"><strong>Para el retiro:</strong> {esc(n["rel"])}</p>
    </header>

    <div class="norm-layout">
      {f'<details class="norm-toc" data-toc><summary>Índice <small>{len(toc)} partes</small></summary><ol>{indice}</ol></details>' if indice else ''}
      <section class="norm-text" aria-labelledby="texto">
        <h2 id="texto" class="sr-only">Texto de la norma</h2>
        {cuerpo}
      </section>
    </div>

    <footer class="norm-source">
      <p><strong>Fuente:</strong> <a href="{esc(n["fuente"])}" target="_blank" rel="noopener noreferrer">Ley Chile, Biblioteca del Congreso Nacional</a>. Texto obtenido el {fecha_larga(HOY)} (versión del {fecha_larga(n["version"])}). Esta copia es referencial: para efectos legales, consulta siempre la fuente oficial y el Diario Oficial.</p>
      <a class="btn btn-quiet btn-small" href="../transporte-autorizado.html#normativa">{ICON["back"]}Volver a la biblioteca</a>
    </footer>
  </article>
</main>
<script>matchMedia('(min-width: 901px)').matches && document.querySelectorAll('[data-toc]').forEach((d) => {{ d.open = true; }});</script>

<script src="../assets/site/site.js?v={version}" defer></script>
</body>
</html>
'''


EYE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>'
# Ícono de cada tema (el mismo mapa está en assets/site/normativa.js)
TEMA_ICON = {
    'peligrosos': '<path d="M12 3.5l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
    'transporte': '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.7"/><circle cx="17" cy="17.5" r="1.7"/>',
    'rep': '<path d="M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6"/><path d="M18 3v4h-4M6 21v-4h4"/>',
    'almacenamiento': '<path d="M3 9.5l9-5 9 5V20H3z"/><path d="M8 20v-6h8v6"/>',
    'sustancias': '<path d="M9 3h6M10 3v6l-5.2 9.2A1 1 0 0 0 5.7 20h12.6a1 1 0 0 0 .9-1.8L14 9V3"/><path d="M7.5 15h9"/>',
    'salud': '<path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z"/>',
    'trabajo': '<path d="M4 17h16M6 17a6 6 0 0 1 12 0M10 11.3V7.5h4v3.8"/>',
    'registro': '<path d="M8 3.5h8v3H8z"/><path d="M6 5H5v15.5h14V5h-1M9 17v-3M12 17v-6M15 17v-4"/>',
    'marco': '<path d="M5 19c0-8 6-14 14-14 0 8-6 14-14 14z"/><path d="M5 19l7-7"/>',
}


def icono_tema(t):
    return f'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{TEMA_ICON.get(t, TEMA_ICON["marco"])}</svg>'


def tarjeta(n, i=0):
    """Tarjeta de la biblioteca (la misma que dibuja assets/site/normativa.js al filtrar)."""
    estado = 'Vigente' if n['vigente'] else 'Derogada'
    t = n['temas'][0]
    return (f'          <li class="doc" data-slug="{n["slug"]}" data-tema="{t}" style="--i:{min(i, 8)}">'
            f'<div class="doc-top"><span class="doc-icon">{icono_tema(t)}</span><p class="doc-kind">{esc(n["tipo"])} · {esc(n["organismo"])}</p></div>'
            f'<h3><a href="{n["pagina"]}" data-doc-open>{esc(n["corto"])}</a></h3>'
            f'<p class="doc-topic">{esc(n["tema"])}</p>'
            f'<p class="doc-rel">{esc(n["rel"])}</p>'
            f'<div class="doc-foot"><span class="doc-meta"><span class="doc-state{"" if n["vigente"] else " is-off"}">{estado}</span> · {n["articulos"]} artículos</span>'
            f'<div class="doc-actions"><button class="btn btn-ink btn-small" type="button" data-doc-view>{EYE}Ver</button>'
            f'<a class="btn btn-quiet btn-small" href="{n["pdf"]}" download data-doc-pdf aria-label="Descargar PDF de {esc(n["corto"])}">{ICON["pdf"]}<span>PDF</span></a></div></div></li>')


def escribir_tarjetas(normas):
    p = ROOT / 'transporte-autorizado.html'
    s = p.read_text(encoding='utf-8')
    a, b = '<!-- normativa:inicio -->', '<!-- normativa:fin -->'
    if a not in s or b not in s:
        print('Aviso: no están las marcas de la biblioteca en transporte-autorizado.html')
        return
    html_cards = '\n'.join(tarjeta(n, i) for i, n in enumerate(normas))
    s = s[:s.index(a) + len(a)] + '\n' + html_cards + '\n' + s[s.index(b):]
    p.write_text(s, encoding='utf-8')


def version_actual():
    s = (ROOT / 'transporte-autorizado.html').read_text(encoding='utf-8')
    m = re.search(r'assets/site/site\.css\?v=([\w.-]+)"', s)
    return m.group(1) if m else HOY.replace('-', '')


def main():
    solo = set(sys.argv[1:])
    version = version_actual()
    (ROOT / 'normativa').mkdir(exist_ok=True)
    indice_path = ROOT / 'assets/transporte/normativa.json'
    previo = {d['slug']: d for d in json.loads(indice_path.read_text(encoding='utf-8'))['normas']} if indice_path.exists() else {}
    normas = []
    for id_norma, slug, tema, temas, rel in NORMAS:
        if solo and slug not in solo:
            if slug in previo:
                normas.append(previo[slug])
            continue
        root = fetch(id_norma)
        ident = root.find(f'{NS}Identificador')
        tipo = root.findtext(f'.//{NS}TipoNumero/{NS}Tipo')
        numero = root.findtext(f'.//{NS}TipoNumero/{NS}Numero')
        org = root.findtext(f'.//{NS}Organismo') or ''
        titulo = re.sub(r'\s+', ' ', root.findtext(f'{NS}Metadatos/{NS}TituloNorma') or '').strip()
        n = {
            'id': id_norma, 'slug': slug, 'tipo': tipo, 'numero': numero,
            'corto': titulo_corto(tipo, numero, ident.get('fechaPromulgacion')),
            'tema': tema, 'temas': temas, 'rel': rel,
            'nombre': f'{tipo} {numero} de {ident.get("fechaPromulgacion")[:4]}: {titulo.capitalize()}',
            'titulo': titulo,
            'organismo': ORG_CORTO.get(org, org.title()),
            'promulgacion': ident.get('fechaPromulgacion'), 'publicacion': ident.get('fechaPublicacion'),
            'version': root.get('fechaVersion'), 'vigente': root.get('derogado') != 'derogado',
            'fuente': f'https://www.bcn.cl/leychile/navegar?idNorma={id_norma}',
            'pagina': f'normativa/{slug}.html', 'pdf': f'assets/transporte/normativa/{slug}.pdf',
            'consulta': HOY, 'alias': ALIAS.get(slug, []),
        }
        n['objeto'] = primer_articulo(root)
        toc, arts = [], []
        partes = [f'<div class="norm-intro">{parrafos(root.findtext(f"{NS}Encabezado/{NS}Texto"))}</div>']
        ef = root.find(f'{NS}EstructurasFuncionales')
        if ef is not None:
            partes.append(estructura(ef, 0, toc, arts))
        prom = root.findtext(f'{NS}Promulgacion/{NS}Texto')
        if prom and prom.strip():
            partes.append(f'<div class="norm-outro">{parrafos(prom)}</div>')
        anexos = root.find(f'{NS}Anexos')
        if anexos is not None and len(anexos):
            toc.append((-1, 'anexos', 'Anexos'))
            bloques = []
            for i, ax in enumerate(anexos.findall(f'{NS}Anexo'), 1):
                t = ax.findtext(f'{NS}Texto') or ''
                binario = ax.find(f'.//{NS}ArchivoBinario') is not None or ax.find(f'.//{NS}ArchivosBinarios') is not None
                nota = f'<p class="norm-note">Este anexo incluye material gráfico o tablas que se consultan en la <a href="{esc(n["fuente"])}" target="_blank" rel="noopener noreferrer">fuente oficial</a>.</p>' if binario or not t.strip() else ''
                bloques.append(f'<section class="norm-annex" id="anexo-{i}">{parrafos(t)}{nota}</section>')
            partes.append(f'<h2 class="norm-part" id="anexos">Anexos</h2>{"".join(bloques)}')
        # Índice: el nivel más alto con al menos tres entradas (en decretos que aprueban un reglamento, los títulos van un nivel más abajo)
        niveles = sorted({lv for lv, _, _ in toc if lv >= 0})
        nivel_toc = next((lv for lv in niveles if sum(1 for x in toc if x[0] == lv) >= 3), niveles[0] if niveles else 0)
        toc = [(a, t) for lv, a, t in toc if lv == nivel_toc or lv == -1]
        n['articulos'] = len(arts)
        n['indice'] = [t for _, t in toc][:40]
        (ROOT / n['pagina']).write_text(pagina(n, ''.join(partes), toc, version), encoding='utf-8')
        normas.append(n)
        print(f'{n["corto"]:<16} {len(arts):>4} artículos  {n["pagina"]}')
    escribir_tarjetas(normas)
    indice_path.write_text(json.dumps({'consulta': HOY, 'fuente': 'Ley Chile, Biblioteca del Congreso Nacional', 'temas': TEMAS, 'normas': normas}, ensure_ascii=False, indent=1), encoding='utf-8')


if __name__ == '__main__':
    main()
