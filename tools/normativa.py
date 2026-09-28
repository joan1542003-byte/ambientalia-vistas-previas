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


DEFINICION = re.compile(r'^([A-ZÁÉÍÓÚÑ][^:.;]{1,70}?):\s+(\S.*)$')


LISTA = re.compile(r'^((?:[a-zñ]|[ivx]{1,4}|\d{1,3})(?:\)|\.-|\.–|°\)|\.(?=\s)|-(?=\s)))\s+(.*)$', re.I)
CONECTOR = re.compile(r'(,|\b(?:de|del|la|las|el|los|y|o|u|e|en|a|al|con|por|para|que|se|su|sus|un|una|como|sin|sobre|entre|desde|hasta|según|cuando|donde|cual|cuyo|cuya|lo|le|les|no|ni))$', re.I)


def lineas(texto):
    """Líneas del texto oficial, sin vacías. Algunas normas llegan con saltos fijos a mitad de frase:
    se unen cuando la línea no termina en puntuación y la siguiente sigue la frase (minúscula o tras una coma o un conector)."""
    ls = [re.sub(r'\b((?:[^\W\d_] ){4,}[^\W\d_])\b', lambda m: m.group(1).replace(' ', ''), re.sub(r'\s+', ' ', l).strip())
          for l in html.unescape(texto or '').replace('\r', '').split('\n')]
    out = []
    for l in ls:
        if not l:
            if out and out[-1] != '':
                out.append('')
            continue
        prev = out[-1] if out else ''
        if prev and not re.search(r'[.:;!?»"”)\]]$', prev) and not LISTA.match(l) and (l[0].islower() or CONECTOR.search(prev)):
            out[-1] = f'{prev} {l}'
        else:
            out.append(l)
    return [l for l in out if l]


def bloques(ls, definiciones=False):
    """Cada línea es un párrafo; los incisos (a), b), 1.-) llevan sangría francesa y las definiciones su término destacado."""
    out = []
    # Filas cortas seguidas (tablas y listados sin viñeta) van juntas, sin espacio entre ellas
    corta = [len(l) <= 60 and not re.search(r'[.:;]$', l) for l in ls]
    fila = [c and ((k > 0 and corta[k - 1]) or (k + 1 < len(ls) and corta[k + 1])) for k, c in enumerate(corta)]
    for k, l in enumerate(ls):
        m = LISTA.match(l)
        marca, resto = (m.group(1), m.group(2)) if m else ('', l)
        cuerpo = esc(resto)
        if definiciones:
            d = DEFINICION.match(resto)
            if d and len(d.group(1).split()) <= 9:
                cuerpo = f'<dfn>{esc(d.group(1))}:</dfn> {esc(d.group(2))}'
        clase = ' norm-row' if fila[k] else ''
        out.append(f'<p class="norm-li{clase}"><span class="norm-li-m">{esc(marca)}</span><span>{cuerpo}</span></p>' if marca else f'<p{f' class="{clase.strip()}"' if clase else ''}>{cuerpo}</p>')
    return ''.join(out)


PARTE = re.compile(r'^(T[ÍI]TULO|CAP[ÍI]TULO|SUBP[ÁA]RRAFO|P[ÁA]RRAFO|LIBRO|SECCI[ÓO]N)\s+((?:[IVXLC]+|\d+|PRELIMINAR|FINAL|[ÚU]NICO|PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|S[ÉE]PTIMO|OCTAVO|NOVENO|D[ÉE]CIMO)[°º]?(?:\s+BIS)?)\b\.?\s*[-–.:]?\s*(.*)$', re.I)
CLASES = {'titulo': 'Título', 'capitulo': 'Capítulo', 'parrafo': 'Párrafo', 'subparrafo': 'Subpárrafo', 'libro': 'Libro', 'seccion': 'Sección'}
SIGLAS = {'REP', 'RETC', 'SMA', 'SEIA', 'REAS', 'SIDREP', 'HDS', 'SGA', 'ONU', 'OCDE', 'MINSAL', 'NCH', 'SEREMI', 'D.S.'}


def sin_tildes(s):
    import unicodedata
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn').lower()


def oracion(s):
    """TEXTO EN MAYÚSCULAS a tipo oración, conservando siglas y números romanos."""
    if not s or s != s.upper() or not re.search(r'[A-ZÁÉÍÓÚÑ]{3}', s):
        return s
    out = []
    for k, w in enumerate(s.split(' ')):
        base = re.sub(r'[^\wÁÉÍÓÚÑÜ.]', '', w)
        if base in SIGLAS or re.fullmatch(r'[IVX]{1,5}', base):
            out.append(w)
        else:
            out.append(w[:1] + w[1:].lower() if k == 0 else w.lower())
    return ' '.join(out)


def titulo_parte(t):
    """«TITULO II De la Identificación» → ('Título II', 'De la identificación')."""
    t = re.sub(r'\s+', ' ', t).strip()
    t = re.sub(r'\b((?:[A-ZÁÉÍÓÚÑ] ){3,}[A-ZÁÉÍÓÚÑ])\b', lambda m: m.group(1).replace(' ', ''), t)
    m = PARTE.match(t)
    if not m:
        return '', oracion(t)
    clase = CLASES.get(sin_tildes(m.group(1)), m.group(1).capitalize())
    num = m.group(2).upper() if re.fullmatch(r'[IVXLC]+|\d+[°º]?', m.group(2), re.I) else m.group(2).lower()
    return f'{clase} {num}', oracion(m.group(3).strip(' .-–:'))


ARTICULO = re.compile(r'^((?:Art[íi]culo|Art\.)(?:\s*(?:\d+[°º]?(?:\s*(?:bis|ter|qu[áa]ter))?|[úu]nico|primero|segundo|tercero|cuarto|quinto|sexto|s[ée]ptimo|octavo|noveno|d[ée]cimo))?(?:\s+transitorio)?)\s*(?:\.-|\.–|\.|:|-|–)?\s*', re.I)
EPIGRAFE = re.compile(r'^([A-ZÁÉÍÓÚÑ][^.:;]{1,55})\.\s+(?=[A-ZÁÉÍÓÚÑ"«(])')


def con_epigrafes(root):
    """¿La norma titula sus artículos («Artículo 1°.- Objeto. La presente ley…»)? Se decide por la mayoría."""
    si = total = 0
    for parte in root.iter(f'{NS}EstructuraFuncional'):
        if parte.get('tipoParte') != 'Artículo':
            continue
        ls = lineas(parte.findtext(f'{NS}Texto'))
        if not ls:
            continue
        total += 1
        resto = ARTICULO.sub('', ls[0], count=1)
        m = EPIGRAFE.match(resto)
        si += bool(m and len(m.group(1).split()) <= 6)
    return total and si / total >= .5


def articulo(texto, ancla, h, epigrafes, nombre=''):
    ls = lineas(texto)
    if not ls:
        return ''
    m = ARTICULO.match(ls[0])
    etiqueta = re.sub(r'\s+', ' ', m.group(1)).strip() if m and m.group(1).strip() else ''
    if etiqueta:
        ls[0] = ls[0][m.end():]
    epi = ''
    if epigrafes and ls and ls[0]:
        e = EPIGRAFE.match(ls[0])
        if e and len(e.group(1).split()) <= 6:
            epi, ls[0] = e.group(1), ls[0][e.end():]
    ls = [l for l in ls if l]
    # Definiciones: si el artículo tiene al menos tres líneas «Término: significado», se destacan los términos
    defs = sum(1 for l in ls if DEFINICION.match(LISTA.sub(r'\2', l))) >= 3
    if not etiqueta:
        etiqueta = nombre if re.match(r'^art', nombre, re.I) else (f'Artículo {nombre}' if nombre else 'Artículo')
    cab = f'<h{h} class="norm-art-h"><a href="#{ancla}">{esc(etiqueta)}</a>{f"<span>{esc(epi)}</span>" if epi else ""}</h{h}>'
    return cab + bloques(ls, defs)


def estructura(parent, nivel, toc, arts, epigrafes):
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
            if ancla in [a for a, _ in arts]:
                ancla = f'{ancla}-{idp}'
            arts.append((ancla, nombre))
            h = max(3, min(2 + nivel, 5))
            out.append(f'<section class="norm-art{" is-derogado" if derog else ""}" id="{ancla}">{articulo(texto, ancla, h, epigrafes, nombre)}</section>')
        else:
            titulo = (parte.findtext(f'{NS}Metadatos/{NS}TituloParte') or '').strip() or texto.strip().split('\n')[0]
            h = min(2 + nivel, 4)
            ancla = f'p-{idp}'
            rotulo, nombre = titulo_parte(titulo)
            # El texto de la parte suele repetir su título en dos líneas («TITULO I» / «Disposiciones generales»): se omite
            clave = re.sub(r'[^a-z0-9]', '', sin_tildes(titulo))
            resto = [l for l in lineas(texto) if re.sub(r'[^a-z0-9]', '', sin_tildes(l)) not in clave]
            entrada = [nivel, ancla, rotulo, nombre, len(arts), None]
            if titulo:
                toc.append(entrada)
            cab = f'<span class="norm-part-n">{esc(rotulo)}</span>{esc(nombre)}' if rotulo and nombre else esc(rotulo or nombre)
            out.append(f'<h{h} class="norm-part" id="{ancla}">{cab}</h{h}>{bloques(resto)}')
        if hijos is not None:
            out.append(estructura(hijos, nivel + 1, toc, arts, epigrafes))
        if tipo != 'Artículo' and titulo:
            entrada[5] = len(arts)
    return ''.join(out)


def titulo_corto(tipo, numero, prom):
    y = prom[:4]
    if tipo == 'Ley':
        n = f'{int(numero):,}'.replace(',', '.') if numero.isdigit() else numero
        return f'Ley {n}'
    return f'D.S. {numero}/{y}'


def primer_articulo(root):
    for parte in root.iter(f'{NS}EstructuraFuncional'):
        if parte.get('tipoParte') == 'Artículo':
            t = re.sub(r'\s+', ' ', html.unescape(parte.findtext(f'{NS}Texto') or '')).strip()
            # «Artículo único/primero: Apruébase el siguiente reglamento…»: el objeto está en el artículo 1 del reglamento
            if re.match(r'^Art[íi]culo (único|primero)\W{0,4}.{0,20}Apru[ée]b', t, re.I):
                continue
            return t
    return ''


def _i(p, w=20):
    return f'<svg width="{w}" height="{w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{p}</svg>'


# Íconos de los datos de una norma (los mismos en assets/site/normativa.js)
DATO = {
    'vigente': _i('<path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>'),
    'derogada': _i('<path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/>'),
    'promulgada': _i('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
    'publicada': _i('<path d="M4 5h13v14H6a2 2 0 0 1-2-2z"/><path d="M17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5M8 16h3"/>'),
    'version': _i('<path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4"/><path d="M12 8v4l3 2"/>'),
    'articulos': _i('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>'),
    'organismo': _i('<path d="M4 20h16M6 20V10M18 20V10M10 20v-6h4v6M3 10l9-6 9 6"/>'),
    'fuente': _i('<path d="M4 20h16M6 20V10M18 20V10M10 20v-6h4v6M3 10l9-6 9 6"/>'),
    'retiro': _i('<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.7"/><circle cx="17" cy="17.5" r="1.7"/>'),
    'buscar': _i('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>', 20),
    'indice': _i('<path d="M4 6h16M4 12h10M4 18h13"/>', 20),
    'arriba': _i('<path d="M6 15l6-6 6 6"/>', 20),
    'abajo': _i('<path d="M6 9l6 6 6-6"/>', 20),
    'cerrar': _i('<path d="M6 6l12 12M18 6L6 18"/>', 20),
    'leer': _i('<path d="M5 12h14M13 6l6 6-6 6"/>', 20),
}


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
    def rango(e):
        a, b = e['desde'], e['hasta']
        if a is None or b is None or b <= a:
            return ''
        num = lambda k: (lambda v: v.lower() if v.isalpha() else v)(re.sub(r'^(?:art[íi]culo|art\.)\s*', '', n['_arts'][k][1], flags=re.I) or str(k + 1))
        return f'Art. {num(a)}' if b - a == 1 else f'Arts. {num(a)}–{num(b - 1)}'
    indice = ''.join(
        f'<li><a href="#{e["ancla"]}">{f"<small>{esc(e["rotulo"])}</small>" if e["rotulo"] and e["nombre"] else ""}'
        f'<span>{esc(e["nombre"] or e["rotulo"])}</span>{f"<em>{rango(e)}</em>" if rango(e) else ""}</a></li>' for e in toc)
    estado = 'Vigente' if n['vigente'] else 'Derogada'
    datos = (
        f'<li class="norm-state{"" if n["vigente"] else " is-off"}" data-tip="Estado según Ley Chile al {fecha_larga(HOY)}">{DATO["vigente" if n["vigente"] else "derogada"]}{estado}</li>'
        f'<li data-tip="Fecha en que se firmó">{DATO["promulgada"]}<span>Promulgada el <time datetime="{n["promulgacion"]}">{fecha_corta(n["promulgacion"])}</time></span></li>'
        f'<li data-tip="Fecha de publicación en el Diario Oficial">{DATO["publicada"]}<span>Publicada el <time datetime="{n["publicacion"]}">{fecha_corta(n["publicacion"])}</time></span></li>'
        f'<li data-tip="Versión del texto que muestra esta página">{DATO["version"]}<span>Texto al <time datetime="{n["version"]}">{fecha_corta(n["version"])}</time></span></li>'
        f'<li>{DATO["articulos"]}{n["articulos"]} artículos</li>'
        f'<li><a href="{esc(n["fuente"])}" target="_blank" rel="noopener noreferrer">{DATO["fuente"]}Ley Chile{ICON["out"]}<span class="sr-only"> (fuente oficial, pestaña nueva)</span></a></li>'
    )
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
<header class="site-header norm-bar" data-reader>
  <div class="container">
    <a class="brand" href="../transporte-autorizado.html" aria-label="Transporte Autorizado, inicio">
      <svg width="32" height="32" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="12" fill="#2f5bd3"/><path d="M9 14h14v12H9zM23 18h5l4 4v4h-9M13 30a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm14 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>
      Transporte Autorizado
    </a>
    <nav class="nav" id="nav" aria-label="Principal">
      <a href="../transporte-autorizado.html#normativa">Normativa</a>
      <a class="btn btn-primary btn-small" href="../transporte-autorizado.html#cotizar">Cotizar retiro</a>
    </nav>
    <div class="reader" data-reader-bar inert>
      <a class="reader-back" href="../transporte-autorizado.html#normativa" aria-label="Volver a la biblioteca">{ICON["back"]}</a>
      <p class="reader-where"><small>{esc(n["corto"])}</small><strong data-reader-now>{esc(n["tema"])}</strong></p>
      <button class="reader-btn" type="button" data-find-open aria-label="Buscar en esta norma">{DATO["buscar"]}</button>
      <button class="reader-btn reader-toc" type="button" data-toc-open aria-label="Índice">{DATO["indice"]}</button>
      <a class="reader-btn" href="../{n["pdf"]}" download data-doc-pdf aria-label="Descargar PDF">{ICON["pdf"]}</a>
    </div>
    <form class="finder" data-finder role="search" inert>
      <span class="finder-icon" aria-hidden="true">{DATO["buscar"]}</span>
      <label class="sr-only" for="finder-q">Buscar en el texto de {esc(n["corto"])}</label>
      <input id="finder-q" type="search" placeholder="Buscar en el texto" autocomplete="off" enterkeyhint="search" data-finder-q>
      <output class="finder-count" data-finder-count aria-live="polite"></output>
      <button class="reader-btn" type="button" data-finder-prev aria-label="Resultado anterior" disabled>{DATO["arriba"]}</button>
      <button class="reader-btn" type="button" data-finder-next aria-label="Resultado siguiente" disabled>{DATO["abajo"]}</button>
      <button class="reader-btn" type="button" data-finder-close aria-label="Cerrar búsqueda">{DATO["cerrar"]}</button>
    </form>
    <span class="reader-progress" aria-hidden="true"><i data-reader-progress></i></span>
  </div>
</header>

<main id="contenido">
  <article class="container norm">
    <nav class="norm-crumbs" aria-label="Ruta"><a href="../transporte-autorizado.html">Inicio</a><span aria-hidden="true">/</span><a href="../transporte-autorizado.html#normativa">Documentos y normativa</a><span aria-hidden="true">/</span><span aria-current="page">{esc(n["corto"])}</span></nav>
    <header class="norm-head">
      <p class="norm-kind"><span class="doc-icon">{icono_tema(n["temas"][0])}</span>{esc(n["tipo"])} · {esc(n["organismo"])}</p>
      <h1 class="norm-title">{esc(n["corto"])} · {esc(n["tema"])}</h1>
      <p class="norm-lead">{esc(n["titulo"].capitalize())}.</p>
      <ul class="norm-facts" data-tips>{datos}</ul>
      <div class="norm-actions">
        <a class="btn btn-ink btn-small" href="../{n["pdf"]}" download data-doc-pdf>{ICON["pdf"]}<span><span class="lg">Descargar </span>PDF</span></a>
        <button class="btn btn-quiet btn-small" type="button" data-find-open>{DATO["buscar"]}<span>Buscar<span class="lg"> en el texto</span></span></button>
        {f'<button class="btn btn-quiet btn-small norm-toc-btn" type="button" data-toc-open>{DATO["indice"]}Índice</button>' if indice else ''}
      </div>
      <p class="norm-why">{DATO["retiro"]}<span><strong>Para el retiro:</strong> {esc(n["rel"])}</span></p>
    </header>

    <div class="norm-layout">
      {f'<nav class="norm-toc" aria-label="Índice" data-toc><p class="norm-toc-h">Índice</p><ol>{indice}</ol></nav>' if indice else '<div></div>'}
      <section class="norm-text" aria-labelledby="texto" data-norm-text>
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

<script src="../assets/site/site.js?v={version}" defer></script>
<script src="../assets/site/norma.js?v={version}" defer></script>
</body>
</html>
'''


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
    """Fila de la biblioteca (la misma que dibuja assets/site/normativa.js al filtrar)."""
    estado = 'Vigente' if n['vigente'] else 'Derogada'
    t = n['temas'][0]
    return (f'          <li class="doc" data-slug="{n["slug"]}" data-tema="{t}" style="--i:{min(i, 8)}">'
            f'<span class="doc-icon">{icono_tema(t)}</span>'
            f'<div class="doc-body"><h3 class="doc-title"><a href="{n["pagina"]}">{esc(n["corto"])}</a><span class="doc-topic">{esc(n["tema"])}</span></h3>'
            f'<p class="doc-rel">{esc(n["rel"])}</p>'
            f'<ul class="doc-meta"><li class="doc-state{"" if n["vigente"] else " is-off"}">{DATO["vigente" if n["vigente"] else "derogada"]}{estado}</li>'
            f'<li>{DATO["organismo"]}{esc(n["organismo"])}</li><li>{DATO["articulos"]}{n["articulos"]} artículos</li></ul></div>'
            f'<div class="doc-actions"><span class="doc-go" aria-hidden="true">Leer{DATO["leer"]}</span>'
            f'<a class="doc-pdf" href="{n["pdf"]}" download data-doc-pdf aria-label="Descargar PDF de {esc(n["corto"])}">{ICON["pdf"]}<span>PDF</span></a></div></li>')


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
        enc = root.findtext(f"{NS}Encabezado/{NS}Texto") or ''
        sub = 'vistos y considerandos' if re.search(r'consideran', enc, re.I) else 'texto previo al articulado'
        partes = [f'<details class="norm-fold norm-intro"><summary>Encabezado <small>{sub}</small></summary>{bloques(lineas(enc))}</details>'] if enc.strip() else []
        ef = root.find(f'{NS}EstructurasFuncionales')
        if ef is not None:
            partes.append(estructura(ef, 0, toc, arts, con_epigrafes(root)))
        prom = root.findtext(f'{NS}Promulgacion/{NS}Texto')
        if prom and prom.strip():
            partes.append(f'<details class="norm-fold norm-outro"><summary>Promulgación y firmas</summary>{bloques(lineas(prom))}</details>')
        anexos = root.find(f'{NS}Anexos')
        if anexos is not None and len(anexos):
            toc.append([-1, 'anexos', '', 'Anexos', None, None])
            anexos_html = []
            for i, ax in enumerate(anexos.findall(f'{NS}Anexo'), 1):
                t = ax.findtext(f'{NS}Texto') or ''
                binario = ax.find(f'.//{NS}ArchivoBinario') is not None or ax.find(f'.//{NS}ArchivosBinarios') is not None
                nota = f'<p class="norm-note">Este anexo incluye material gráfico o tablas que se consultan en la <a href="{esc(n["fuente"])}" target="_blank" rel="noopener noreferrer">fuente oficial</a>.</p>' if binario or not t.strip() else ''
                anexos_html.append(f'<section class="norm-annex" id="anexo-{i}">{parrafos(t)}{nota}</section>')
            partes.append(f'<h2 class="norm-part" id="anexos">Anexos</h2>{"".join(anexos_html)}')
        # Índice: el nivel más alto con al menos tres entradas (en decretos que aprueban un reglamento, los títulos van un nivel más abajo)
        niveles = sorted({e[0] for e in toc if e[0] >= 0})
        nivel_toc = next((lv for lv in niveles if sum(1 for x in toc if x[0] == lv) >= 3), niveles[0] if niveles else 0)
        toc = [dict(zip(('nivel', 'ancla', 'rotulo', 'nombre', 'desde', 'hasta'), e)) for e in toc if e[0] == nivel_toc or e[0] == -1]
        n['articulos'] = len(arts)
        n['indice'] = [' · '.join(x for x in (e['rotulo'], e['nombre']) if x) for e in toc][:40]
        n['_arts'] = arts
        (ROOT / n['pagina']).write_text(pagina(n, ''.join(partes), toc, version), encoding='utf-8')
        del n['_arts']
        normas.append(n)
        print(f'{n["corto"]:<16} {len(arts):>4} artículos  {n["pagina"]}')
    escribir_tarjetas(normas)
    indice_path.write_text(json.dumps({'consulta': HOY, 'fuente': 'Ley Chile, Biblioteca del Congreso Nacional', 'temas': TEMAS, 'normas': normas}, ensure_ascii=False, indent=1), encoding='utf-8')


if __name__ == '__main__':
    main()
