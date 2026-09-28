"""Documentos de Transporte Autorizado: guías rápidas, checklist descargable y acceso a la normativa.

Fuente del contenido: «Documentos Página Transporte» del cliente (28-09-2026): tres guías en versión para la web y el
checklist de autorización de transporte (se publica la versión con casillas en assets/transporte/documentos/).
Las citas legales se verificaron en el texto oficial de Ley Chile (normativa/*.html) y enlazan al artículo exacto.

Genera:
- documentos/<slug>.html: una página por guía (lectura directa, datos estructurados, enlaces a los artículos citados).
- El panel «Documentos» de la cabecera (se abre desde el menú; la propia cabecera se expande) en transporte-autorizado.html
  y en las páginas de guías y normas (tools/normativa.py lo inserta con menu_html('../')).
- El bloque de guías y descarga de la sección #documentos en transporte-autorizado.html.
Uso: python3 tools/documentos.py   (después de cambiar la tarjeta del hero o la burbuja, corre también tools/normativa.py)
"""
import json
import re
from pathlib import Path

import normativa as N

ROOT = N.ROOT
SITE = N.SITE
esc = N.esc


def _i(p, w=20, sw=1.8):
    return f'<svg width="{w}" height="{w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{p}</svg>'


ICO = {
    'peligroso': _i(N.TEMA_ICON['peligrosos']),
    'autorizacion': _i('<path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>'),
    'contratar': _i('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M3.5 6l1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/>'),
    'normativa': _i('<path d="M4 20h16M6 20V10M18 20V10M10 20v-6h4v6M3 10l9-6 9 6"/>'),
    'check': _i('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 18, 2.2),
    'x': _i('<path d="M7 7l10 10M17 7L7 17"/>', 18, 2.2),
    'flecha': _i('<path d="M5 12h14M13 6l6 6-6 6"/>', 18, 2),
    'chev': _i('<path d="M9 6l6 6-6 6"/>', 18, 2),
    'abajo': _i('<path d="M6 9l6 6 6-6"/>', 16, 2.2),
    'descarga': _i('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', 18, 2),
    'hoja': _i('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 12h6M10 16h6"/>'),
    'especialista': _i('<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z"/>', 18, 2),
    'buscar': _i('<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.7"/><circle cx="17" cy="17.5" r="1.7"/>', 18, 2),
    'volver': _i('<path d="M19 12H5M11 6l-6 6 6 6"/>', 20, 2),
}

CHECKLIST = {
    'archivo': 'assets/transporte/documentos/checklist-autorizacion-transporte.xlsx',
    'titulo': 'Checklist de autorización de transporte',
    'sub': '50 puntos en 9 bloques para revisar un caso antes del retiro · Excel',
}

TEMA_NORMA = {'ds-148-2003-minsal': 'peligrosos', 'ds-29-2024-minsal': 'rep', 'ley-20920': 'rep', 'ds-298-1994-mtt': 'transporte', 'ds-57-2019-minsal': 'sustancias'}
NORMA = {  # slug de la página de la norma → nombre corto
    'ds-148-2003-minsal': 'D.S. 148', 'ds-29-2024-minsal': 'D.S. 29', 'ds-298-1994-mtt': 'D.S. 298',
    'ley-20920': 'Ley 20.920', 'ds-57-2019-minsal': 'D.S. 57',
}


def ref(slug, art=None, texto=None):
    return {'slug': slug, 'art': art, 'texto': texto or (f'{NORMA[slug]}, art. {art}' if art else NORMA[slug])}


GUIAS = [
    {
        'slug': 'residuo-peligroso-o-no-peligroso', 'icono': 'peligroso', 'tema': 'peligrosos',
        'menu': '¿Peligroso o no peligroso?', 'menu_sub': 'Cómo empezar a identificar tu residuo',
        'corto': 'Peligroso o no peligroso',
        'titulo': '¿Residuo peligroso o no peligroso?',
        'kicker': 'Guía rápida para comenzar a identificarlo',
        'descripcion': 'Cómo empezar a identificar si un residuo es peligroso: qué antecedentes reunir, qué no basta (una foto, el nombre) y cuándo pedir una revisión técnica.',
        'intro': 'La peligrosidad de un residuo no se determina por color, olor o fotografía. La revisión debe considerar su origen, composición, contaminación, estado y los antecedentes técnicos disponibles. Cuando falte información, lo correcto es declarar la incertidumbre y reunir antecedentes antes de coordinar el manejo.',
        'resumen': 'No se determina por color, olor ni fotografía: se revisan el origen, la composición, la contaminación y los antecedentes técnicos del residuo.',
        'claves': [
            'La HDS del producto original ayuda, pero el residuo pudo cambiar por uso, mezcla o contaminación.',
            'Una fotografía muestra el estado y el envase; no demuestra la peligrosidad.',
            'Si falta información, se pide análisis o caracterización antes de decidir el transporte.',
        ],
        'saber': [
            ('El D.S. 148 define el residuo peligroso según sus características de peligrosidad y regula su manejo.', [ref('ds-148-2003-minsal', '10'), ref('ds-148-2003-minsal', '11')]),
            ('La HDS del producto original puede ser un antecedente útil, pero el residuo puede haber cambiado por uso, mezcla, contaminación o proceso.', []),
            ('Una fotografía sirve para reconocer el estado físico, el envase o la condición visible, pero no demuestra por sí sola la peligrosidad.', []),
            ('Cuando exista mezcla o contaminación, debe revisarse el conjunto y no solo el material principal.', []),
            ('Si la información es insuficiente, puede ser necesario solicitar un análisis o una caracterización antes de decidir el transporte y el destino.', []),
        ],
        'pasos': [
            'Describe el proceso o la actividad que genera el residuo.',
            'Indica el nombre del material y su composición conocida.',
            'Registra si está limpio, usado, contaminado o mezclado.',
            'Define su estado físico y la cantidad aproximada.',
            'Reúne la HDS o FDS del producto original, la HDSR (hoja de seguridad del residuo), fichas técnicas o análisis, si existen.',
            'Identifica contaminantes, derrames, daños o condiciones anormales.',
            'Con la información reunida, pide una revisión técnica si la clasificación sigue siendo incierta.',
        ],
        'errores': [
            'Clasificar solo por el nombre: «aceite», «plástico», «solvente» o «batería».',
            'Concluir la peligrosidad a partir de una fotografía.',
            'Usar la HDS de un producto como si describiera automáticamente el residuo final.',
        ],
        'normas': [ref('ds-148-2003-minsal', None, 'D.S. 148 · Residuos peligrosos'), ref('ds-57-2019-minsal', None, 'D.S. 57 · Clasificación y etiquetado de sustancias')],
        'accion': ('especialista', 'Hablar con un especialista'),
    },
    {
        'slug': 'autorizacion-sanitaria-transporte', 'icono': 'autorizacion', 'tema': 'transporte',
        'menu': '¿Necesitas autorización sanitaria?', 'menu_sub': 'Qué exige la norma según el residuo',
        'corto': 'Autorización sanitaria',
        'titulo': '¿Necesitas autorización sanitaria para transportar residuos?',
        'kicker': 'Guía rápida',
        'descripcion': 'Cuándo se necesita autorización sanitaria para transportar residuos en Chile: regla del D.S. 148, excepción del art. 42 y el caso de los productos prioritarios (D.S. 29).',
        'intro': 'No existe una respuesta única para todos los residuos. Antes de coordinar un transporte conviene identificar la naturaleza del residuo, si corresponde a un producto prioritario y quién realiza la operación. Con esos antecedentes se puede revisar qué autorización, registro o documentación resulta aplicable.',
        'resumen': 'Depende de si el residuo es peligroso, si viene de un producto prioritario (Ley REP) y de quién lo transporta.',
        'claves': [
            'Residuo peligroso: el transportista debe estar autorizado por la Autoridad Sanitaria.',
            'Excepción acotada: hasta 6 kg de tóxicos agudos o 2 t de otros residuos peligrosos, si los transporta el propio generador exento de plan de manejo.',
            'Producto prioritario no peligroso: no requiere autorización para recolectar o transportar, pero sí registro como gestor.',
        ],
        'saber': [
            ('Para residuos peligrosos transportados por calles y caminos públicos, el D.S. 148 establece como regla que el transportista debe estar autorizado por la Autoridad Sanitaria.', [ref('ds-148-2003-minsal', '36')]),
            ('El D.S. 148 contiene una excepción específica: cantidades que no excedan 6 kg de residuos tóxicos agudos o 2 toneladas de cualquier otra clase de residuo peligroso, cuando el transporte lo efectúa el propio generador y este, además, está exceptuado de presentar un plan de manejo.', [ref('ds-148-2003-minsal', '42')]),
            ('Para residuos no peligrosos de productos prioritarios, la recolección o el transporte no requiere autorización sanitaria para esa actividad, pero exige formar parte del registro de gestores de residuos de productos prioritarios y cumplir los requisitos del Título III del D.S. 29.', [ref('ds-29-2024-minsal', '29'), ref('ds-29-2024-minsal', '30')]),
            ('Si el residuo de producto prioritario es peligroso, el D.S. 29 remite la autorización de recolección y transporte al procedimiento del D.S. 148.', [ref('ds-29-2024-minsal', '28'), ref('ds-29-2024-minsal', '41')]),
            ('Para residuos que no encajen en estas categorías, la respuesta debe revisarse según la clasificación, la operación y la normativa sanitaria aplicable. No debe extrapolarse el artículo 29 del D.S. 29 a todo residuo no peligroso.', []),
        ],
        'matriz': [
            ('Residuo peligroso (regla general)', 'Sí', 'si', 'Transportista autorizado por la Autoridad Sanitaria y vehículo adecuado al tipo, peligrosidad y estado físico del residuo; revisar además el D.S. 298. Documento de Declaración y hojas de seguridad de transporte cuando correspondan.', [ref('ds-148-2003-minsal', '36', 'D.S. 148, arts. 36 a 41')]),
            ('Residuo peligroso: posible excepción', 'Posible excepción', 'quizas', 'Deben cumplirse a la vez: cantidad bajo el umbral, transporte por el propio generador y generador exceptuado de plan de manejo. La declaración y seguimiento tiene su propia excepción, que se revisa por separado.', [ref('ds-148-2003-minsal', '42', 'D.S. 148, art. 42'), ref('ds-148-2003-minsal', '84', 'art. 84')]),
            ('Producto prioritario no peligroso', 'No, para recolectar o transportar', 'no', 'Registro de gestores y requisitos de transporte: altura de la carga, cubierta, lluvia y escurrimientos, ruido y olores, y limpieza del vehículo.', [ref('ds-29-2024-minsal', '29', 'D.S. 29, arts. 29'), ref('ds-29-2024-minsal', '30', '30')]),
            ('Producto prioritario peligroso', 'Sí, por la vía del D.S. 148', 'si', 'Autorización sanitaria para los gestores que transportan residuos peligrosos; revisar el D.S. 148 y el D.S. 298.', [ref('ds-29-2024-minsal', '28', 'D.S. 29, art. 28')]),
            ('Residuo no peligroso y no prioritario', 'No concluir sin revisar', 'revisar', 'Revisar la normativa aplicable al residuo, a la operación y a la autoridad competente. El art. 29 del D.S. 29 no basta para eximir.', []),
        ],
        'pasos': [
            'Identifica qué residuo se transportará y el proceso que lo genera.',
            'Define si hay antecedentes de peligrosidad: análisis, HDS del producto original, HDSR u otra caracterización.',
            'Revisa si el residuo corresponde a un producto prioritario de la Ley REP.',
            'Identifica quién realizará el transporte: el generador, un gestor o un tercero.',
            'Verifica la autorización, el registro, el vehículo, el destino y la documentación según el escenario.',
            'Conserva evidencia de la revisión realizada antes del retiro.',
        ],
        'errores': [
            'Asumir que «no peligroso» equivale siempre a «sin autorización».',
            'Usar una fotografía como única base para definir la peligrosidad.',
            'Confundir la autorización sanitaria del transportista con la del destino o la instalación.',
            'Omitir el registro de gestor cuando aplica el D.S. 29.',
        ],
        'normas': [ref('ds-148-2003-minsal', None, 'D.S. 148 · Residuos peligrosos'), ref('ds-29-2024-minsal', None, 'D.S. 29 · Residuos de productos prioritarios'), ref('ds-298-1994-mtt', None, 'D.S. 298 · Transporte de cargas peligrosas'), ref('ley-20920', None, 'Ley 20.920 · Ley REP')],
        'descarga': True,
        'accion': ('especialista', 'Hablar con un especialista'),
    },
    {
        'slug': 'checklist-contratar-transportista', 'icono': 'contratar', 'tema': 'registro',
        'menu': 'Antes de contratar un transportista', 'menu_sub': 'Qué revisar para evitar retiros fallidos',
        'corto': 'Antes de contratar',
        'titulo': 'Checklist antes de contratar un transportista de residuos',
        'kicker': 'Guía rápida',
        'descripcion': 'Qué revisar antes de contratar un transportista de residuos: identidad, autorización o registro y su alcance, vehículo, destino y respaldo de la trazabilidad.',
        'intro': 'Contratar un transportista implica revisar más que la disponibilidad del vehículo. Una verificación mínima ayuda a reducir rechazos, retiros fallidos y problemas de trazabilidad. El alcance exacto dependerá del tipo de residuo y de la operación.',
        'resumen': 'Es más que confirmar un vehículo: revisa quién transporta, con qué autorización o registro y hacia qué destino.',
        'claves': [
            'Confirma la identidad legal del proveedor y quién hará efectivamente el transporte.',
            'Revisa que la autorización o el registro esté vigente y cubra tu residuo.',
            'Confirma el destino y el respaldo que recibirás al terminar.',
        ],
        'saber': [
            ('Confirma la identidad legal del proveedor y quién ejecutará efectivamente el transporte.', []),
            ('Verifica si el tipo de residuo requiere autorización sanitaria o registro como gestor.', [ref('ds-148-2003-minsal', '36'), ref('ds-29-2024-minsal', '29')]),
            ('Cuando exista autorización sanitaria, revisa que esté vigente y que su alcance sea coherente con la operación.', []),
            ('Asegúrate de que el vehículo y la forma de transporte sean compatibles con el residuo, su estado físico y los contenedores.', []),
            ('Confirma el destino antes del retiro: la instalación de valorización o eliminación que corresponda y que pueda recibir el residuo.', []),
            ('Define qué respaldo se entregará al terminar la operación y cómo se conservará la trazabilidad.', []),
        ],
        'pasos': [
            'Solicita los antecedentes legales y operacionales del proveedor.',
            'Revisa la autorización o el registro y su alcance.',
            'Cruza residuo, vehículo y destino.',
            'Confirma las condiciones de carga, acceso y horarios.',
            'Acuerda la documentación del retiro y el respaldo posterior.',
            'Registra la verificación en una pauta interna.',
        ],
        'errores': [
            'Aceptar una resolución sin revisar su alcance.',
            'No confirmar el destino final antes del retiro.',
            'Confundir a un intermediario comercial con el transportista efectivo.',
            'No acordar previamente certificados, declaraciones o evidencias de recepción.',
        ],
        'normas': [ref('ds-148-2003-minsal', None, 'D.S. 148 · Residuos peligrosos'), ref('ds-29-2024-minsal', None, 'D.S. 29 · Residuos de productos prioritarios'), ref('ds-298-1994-mtt', None, 'D.S. 298 · Transporte de cargas peligrosas')],
        'descarga': True,
        'accion': ('buscar', 'Buscar transportista'),
    },
]

NORMATIVA_MENU = {
    'menu': 'Normativa', 'menu_sub': 'D.S. 148, Ley REP y más, con su texto oficial',
    'resumen': 'Las normas chilenas que ordenan la gestión y el transporte de residuos, con su texto oficial para leer, buscar dentro o descargar.',
    'rapidas': [('ds-148-2003-minsal', 'D.S. 148/2003', 'Residuos peligrosos'), ('ds-298-1994-mtt', 'D.S. 298/1994', 'Transporte de cargas peligrosas'),
                ('ley-20920', 'Ley 20.920', 'Ley REP'), ('ds-29-2024-minsal', 'D.S. 29/2024', 'Residuos de productos prioritarios')],
}


def enlace_norma(r, root):
    return f'{root}normativa/{r["slug"]}.html' + (f'#art-{r["art"]}' if r['art'] else '')


def validar_anclas():
    """Cada cita debe llevar a un artículo que exista en la página de la norma."""
    faltan = []
    for g in GUIAS:
        refs = [r for _, rs in g['saber'] for r in rs] + [r for fila in g.get('matriz', []) for r in fila[4]] + g['normas']
        for r in refs:
            p = ROOT / 'normativa' / f'{r["slug"]}.html'
            if not p.exists():
                faltan.append(f'{g["slug"]}: falta la página {p.name}')
            elif r['art'] and f'id="art-{r["art"]}"' not in p.read_text(encoding='utf-8'):
                faltan.append(f'{g["slug"]}: {r["slug"]} sin #art-{r["art"]}')
    if faltan:
        raise SystemExit('Citas sin destino:\n' + '\n'.join(faltan))


# ---------- Panel «Documentos» de la cabecera ----------
def accion(clave, texto, root, clase='btn btn-quiet btn-small'):
    if clave == 'descarga':
        return f'<a class="{clase}" href="{root}{CHECKLIST["archivo"]}" download data-download data-toast="Descargando el checklist (Excel)">{ICO["descarga"]}<span>Descargar checklist</span></a>'
    icon = ICO.get(clave, '')
    return f'<button class="{clase}" type="button" data-dock-open="{clave}">{icon}<span>{esc(texto)}</span></button>'


def menu_html(root=''):
    """Panel que se abre dentro de la cabecera al elegir «Documentos». Lista a la izquierda y explicación a la derecha
    (escritorio); en el teléfono, cada tema se despliega en su lugar."""
    items = []
    for g in GUIAS:
        k = g['slug']
        extra = accion('descarga', '', root) if g.get('descarga') else accion(*g['accion'], root)
        items.append(
            f'<div class="docs-item" data-docs-item data-tema="{g["tema"]}">'
            f'<button class="docs-tab" type="button" id="docs-t-{k}" aria-expanded="false" aria-controls="docs-d-{k}" data-docs-tab>'
            f'<span class="doc-icon">{ICO[g["icono"]]}</span><span class="docs-tab-text"><strong>{esc(g["menu"])}</strong><small>{esc(g["menu_sub"])}</small></span>'
            f'<span class="docs-chev">{ICO["chev"]}</span></button>'
            f'<div class="docs-detail" id="docs-d-{k}" role="region" aria-labelledby="docs-t-{k}">'
            f'<p class="docs-kicker">Guía rápida</p><h3>{esc(g["titulo"])}</h3><p class="docs-lead">{esc(g["resumen"])}</p>'
            f'<ul class="docs-points">{"".join(f"<li>{ICO["check"]}<span>{esc(c)}</span></li>" for c in g["claves"])}</ul>'
            f'<div class="docs-actions"><a class="btn btn-ink btn-small" href="{root}documentos/{k}.html">Leer la guía{ICO["flecha"]}</a>{extra}</div>'
            f'</div></div>')
    nm = NORMATIVA_MENU
    rapidas = ''.join(f'<li><a href="{root}normativa/{s}.html"><strong>{esc(c)}</strong><span>{esc(t)}</span>{ICO["chev"]}</a></li>' for s, c, t in nm['rapidas'])
    items.append(
        f'<div class="docs-item" data-docs-item data-tema="marco">'
        f'<button class="docs-tab" type="button" id="docs-t-normativa" aria-expanded="false" aria-controls="docs-d-normativa" data-docs-tab>'
        f'<span class="doc-icon">{ICO["normativa"]}</span><span class="docs-tab-text"><strong>{nm["menu"]}</strong><small>{esc(nm["menu_sub"])}</small></span>'
        f'<span class="docs-chev">{ICO["chev"]}</span></button>'
        f'<div class="docs-detail" id="docs-d-normativa" role="region" aria-labelledby="docs-t-normativa">'
        f'<p class="docs-kicker">Biblioteca</p><h3>Normativa chilena de residuos</h3><p class="docs-lead">{esc(nm["resumen"])}</p>'
        f'<ul class="docs-quick">{rapidas}</ul>'
        f'<div class="docs-actions"><a class="btn btn-ink btn-small" href="{root + "transporte-autorizado.html" if root else ""}#normativa" data-docs-close>Ver toda la normativa{ICO["flecha"]}</a></div>'
        f'</div></div>')
    return (f'<div class="docs-panel" id="docs-panel" data-docs-panel inert><div class="docs-inner"><div class="docs-scroll">'
            f'<div class="docs-grid"><span class="docs-glide" aria-hidden="true"></span>{"".join(items)}</div>'
            f'</div></div></div>')


def boton_documentos(root='', actual=False):
    href = f'{root}transporte-autorizado.html#documentos' if root else '#documentos'
    return (f'<a href="{href}" class="nav-docs" data-docs-open aria-controls="docs-panel" aria-expanded="false"{" aria-current=\"true\"" if actual else ""}>'
            f'Documentos<span class="nav-docs-chev">{ICO["abajo"]}</span></a>')


# ---------- Bloque de la sección #documentos (página principal) ----------
def bloque_landing():
    tarjetas = ''.join(
        f'<a class="guia-card" href="documentos/{g["slug"]}.html" data-tema="{g["tema"]}">'
        f'<span class="doc-icon">{ICO[g["icono"]]}</span>'
        f'<span class="guia-card-text"><strong>{esc(g["titulo"])}</strong><small>{esc(g["resumen"])}</small></span>'
        f'<span class="guia-card-go">Leer la guía{ICO["flecha"]}</span></a>' for g in GUIAS)
    return (f'        <div class="guias reveal-group">{tarjetas}</div>\n'
            f'        {franja_descarga("")}\n')


def franja_descarga(root):
    size = (ROOT / CHECKLIST['archivo']).stat().st_size
    return (f'<div class="download-strip"><span class="download-icon">{ICO["hoja"]}</span>'
            f'<p><strong>{esc(CHECKLIST["titulo"])}</strong><small>{esc(CHECKLIST["sub"])} · {round(size / 1024)} KB</small></p>'
            f'<a class="btn btn-ink btn-small" href="{root}{CHECKLIST["archivo"]}" download data-download data-toast="Descargando el checklist (Excel)">{ICO["descarga"]}<span>Descargar</span></a></div>')


def reemplazar(s, marca, contenido):
    a, b = f'<!-- {marca}:inicio -->', f'<!-- {marca}:fin -->'
    if a not in s or b not in s:
        raise SystemExit(f'Faltan las marcas {a} … {b} en transporte-autorizado.html')
    return s[:s.index(a) + len(a)] + '\n' + contenido + s[s.index(b):]


# ---------- Página de cada guía ----------
def citas(refs, root):
    if not refs:
        return ''
    return '<span class="law-refs">' + ''.join(f'<a class="law-ref" href="{enlace_norma(r, root)}">{esc(r["texto"])}</a>' for r in refs) + '</span>'


def pagina(g, version, tools):
    root = '../'
    url = f'{SITE}/documentos/{g["slug"]}.html'
    otras = [x for x in GUIAS if x is not g]
    ld = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'Article', '@id': f'{url}#guia', 'headline': g['titulo'], 'description': g['descripcion'],
                'inLanguage': 'es-CL', 'url': url, 'isAccessibleForFree': True,
                'publisher': {'@type': 'Organization', 'name': 'Transporte Autorizado', 'url': f'{SITE}/'},
                'about': [{'@type': 'Thing', 'name': 'Transporte de residuos'}, {'@type': 'Thing', 'name': 'Residuos peligrosos'}],
                'citation': [{'@type': 'Legislation', 'name': r['texto'], 'url': f'{SITE}/normativa/{r["slug"]}.html'} for r in g['normas']],
            },
            {
                '@type': 'HowTo', 'name': f'Cómo usar la guía: {g["titulo"]}', 'inLanguage': 'es-CL',
                'step': [{'@type': 'HowToStep', 'position': i + 1, 'text': p} for i, p in enumerate(g['pasos'])],
            },
            {
                '@type': 'BreadcrumbList',
                'itemListElement': [
                    {'@type': 'ListItem', 'position': 1, 'name': 'Transporte Autorizado', 'item': f'{SITE}/'},
                    {'@type': 'ListItem', 'position': 2, 'name': 'Documentos', 'item': f'{SITE}/#documentos'},
                    {'@type': 'ListItem', 'position': 3, 'name': g['corto']},
                ],
            },
        ],
    }
    saber = ''.join(f'<li>{ICO["check"]}<span>{esc(t)}{citas(rs, root)}</span></li>' for t, rs in g['saber'])
    pasos = ''.join(f'<li><span>{esc(p)}</span></li>' for p in g['pasos'])
    errores = ''.join(f'<li>{ICO["x"]}<span>{esc(e)}</span></li>' for e in g['errores'])
    matriz = ''
    if g.get('matriz'):
        filas = ''.join(
            f'<tr><th scope="row">{esc(escenario)}</th><td data-label="¿Autorización sanitaria?"><span class="gm-ans is-{k}">{esc(a)}</span></td>'
            f'<td data-label="Qué se exige">{esc(c)}</td><td data-label="Base">{citas(rs, root) or "Revisión específica del caso"}</td></tr>'
            for escenario, a, k, c, rs in g['matriz'])
        matriz = ('<section class="guia-sec" aria-labelledby="escenarios"><h2 id="escenarios">Escenarios frecuentes</h2>'
                  '<p class="guia-sub">Resumen orientativo. Valida siempre la clasificación, quién transporta, la cantidad, el destino y los documentos del caso.</p>'
                  '<div class="guia-matrix"><table><thead><tr><th scope="col">Escenario</th><th scope="col">¿Autorización sanitaria de transporte?</th>'
                  f'<th scope="col">Qué se exige</th><th scope="col">Base</th></tr></thead><tbody>{filas}</tbody></table></div></section>')
    normas = ''.join(f'<li><a href="{root}normativa/{r["slug"]}.html" data-tema="{TEMA_NORMA.get(r["slug"], "marco")}"><span class="doc-icon">{N.icono_tema(TEMA_NORMA.get(r["slug"], "marco"))}</span><span><strong>{esc(r["texto"])}</strong></span>{ICO["chev"]}</a></li>' for r in g['normas'])
    mas = ''.join(f'<li><a href="{x["slug"]}.html" data-tema="{x["tema"]}"><span class="doc-icon">{ICO[x["icono"]]}</span><span><strong>{esc(x["titulo"])}</strong><small>{esc(x["resumen"])}</small></span>{ICO["chev"]}</a></li>' for x in otras)
    cta_principal = accion(*g['accion'], root, 'btn btn-ink btn-small')
    cta_descarga = accion('descarga', '', root) if g.get('descarga') else ''
    return f'''<!doctype html>
<html lang="es-CL">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{esc(g["titulo"])} | Transporte Autorizado</title>
<meta name="description" content="{esc(g["descripcion"])}">
<meta name="robots" content="noindex,nofollow">
<link rel="canonical" href="{url}">
<meta property="og:locale" content="es_CL">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Transporte Autorizado">
<meta property="og:title" content="{esc(g["titulo"])}">
<meta property="og:description" content="{esc(g["descripcion"])}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}/assets/truck-stock.jpg">
<meta property="og:image:alt" content="Fotografía ilustrativa de transporte de carga">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="../assets/transporte/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="../assets/transporte/apple-touch-icon.png">
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
<body data-site="transporte" class="guia-page" data-tema="{g["tema"]}">
<a class="skip" href="#contenido">Saltar al contenido</a>
<header class="site-header has-docs">
  <div class="container">
    <a class="brand" href="../transporte-autorizado.html" aria-label="Transporte Autorizado, inicio">
      <svg width="32" height="32" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="12" fill="#2f5bd3"/><path d="M9 14h14v12H9zM23 18h5l4 4v4h-9M13 30a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm14 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>
      Transporte Autorizado
    </a>
    <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="nav" aria-label="Abrir menú">
      <svg width="20" height="20" class="icon-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 8h16M4 16h16"/></svg>
      <svg width="20" height="20" class="icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
    <nav class="nav" id="nav" aria-label="Principal">
      {boton_documentos(root, actual=True)}
      <a class="btn btn-primary btn-small" href="../transporte-autorizado.html#cotizar" data-dock-open="cotizar">Cotizar retiro</a>
    </nav>
    {menu_html(root)}
  </div>
</header>

<main id="contenido">
  <article class="container guia">
    <nav class="norm-crumbs" aria-label="Ruta"><a href="../transporte-autorizado.html">Inicio</a><span aria-hidden="true">/</span><a href="../transporte-autorizado.html#documentos">Documentos</a><span aria-hidden="true">/</span><span aria-current="page">{esc(g["corto"])}</span></nav>
    <header class="guia-head">
      <p class="norm-kind"><span class="doc-icon">{ICO[g["icono"]]}</span>{esc(g["kicker"])}</p>
      <h1 class="norm-title">{esc(g["titulo"])}</h1>
      <p class="norm-lead">{esc(g["intro"])}</p>
      <div class="norm-actions guia-actions">{cta_principal}{cta_descarga}</div>
    </header>

    <section class="guia-sec" aria-labelledby="saber"><h2 id="saber">Qué debes saber</h2><ul class="guia-points">{saber}</ul></section>
    {matriz}
    <section class="guia-sec" aria-labelledby="pasos"><h2 id="pasos">Cómo usar esta guía</h2><ol class="guia-steps">{pasos}</ol></section>
    <section class="guia-sec" aria-labelledby="errores"><h2 id="errores">Errores frecuentes</h2><ul class="guia-errors">{errores}</ul></section>
    {f'<section class="guia-sec" aria-label="Material descargable">{franja_descarga(root)}</section>' if g.get('descarga') else ''}
    <section class="guia-sec" aria-labelledby="normas"><h2 id="normas">Normativa relacionada</h2><ul class="guia-links">{normas}</ul></section>
    <section class="guia-sec" aria-labelledby="otras"><h2 id="otras">Otras guías</h2><ul class="guia-links guia-more">{mas}</ul></section>

    <footer class="norm-source">
      <p>Orientación general para preparar un retiro: no reemplaza la revisión técnica ni legal de cada caso. Las citas enlazan al texto oficial publicado en Ley Chile (Biblioteca del Congreso Nacional).</p>
      <a class="btn btn-quiet btn-small" href="../transporte-autorizado.html#documentos">{ICO["volver"]}Volver a Documentos</a>
    </footer>
  </article>
</main>

<div data-hero data-view="inicio" data-float-only hidden><div data-panel hidden>
{tools[0]}
</div></div>
{tools[1]}

<script>window.SITE_ROOT = '../';</script>
<script src="../assets/site/site.js?v={version}" defer></script>
<script src="../assets/site/pickers.js?v={version}" defer></script>
<script src="../assets/site/seleccion.js?v={version}" defer></script>
<script src="../assets/site/interpretar.js?v={version}" defer></script>
<script src="../assets/site/transporte.js?v={version}" defer></script>
<script src="../assets/site/transporte-ui.js?v={version}" defer></script>
<script src="../assets/site/asistente.js?v={version}" defer></script>
<script src="../assets/site/documentos.js?v={version}" defer></script>
</body>
</html>
'''


def main():
    validar_anclas()
    version = N.version_actual()
    tools = N.herramientas()
    (ROOT / 'documentos').mkdir(exist_ok=True)
    for g in GUIAS:
        (ROOT / 'documentos' / f'{g["slug"]}.html').write_text(pagina(g, version, tools), encoding='utf-8')
        print(f'documentos/{g["slug"]}.html')
    p = ROOT / 'transporte-autorizado.html'
    s = p.read_text(encoding='utf-8')
    s = reemplazar(s, 'documentos:menu', '    ' + menu_html('') + '\n')
    s = reemplazar(s, 'documentos:guias', bloque_landing())
    p.write_text(s, encoding='utf-8')
    print('transporte-autorizado.html: panel de Documentos y bloque de guías')


if __name__ == '__main__':
    main()
