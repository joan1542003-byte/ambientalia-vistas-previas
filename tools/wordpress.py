#!/usr/bin/env python3
"""Arma el plugin de WordPress que sirve Transporte Autorizado: código de wordpress/ta-sitio/ + el sitio.

    python3 tools/wordpress.py [destino] [--sin-agente]

Sin destino, deja la carpeta del plugin y su .zip junto a este repositorio: ../wordpress/ta-sitio y ../wordpress/ta-sitio.zip
El paquete lleva el agente (la opción «Chat con IA» de la burbuja «?»), que responde el asistente de la dirección que se
indique en los ajustes del plugin; con --sin-agente se arma sin él.

El plugin (wordpress/ta-sitio/) muestra el sitio desde WordPress, primero en una dirección privada, y recibe las
solicitudes de los formularios (número, correos). El sitio va dentro, en sitio/: la página, assets/site,
assets/transporte, normativa/, ayuda/ y documentos/, más llms.txt (resumen del sitio para asistentes de IA) e imagenes.json
(las imágenes que se cambian desde los ajustes).
Se instala en WordPress con Plugins → Añadir nuevo → Subir plugin.
"""
import json
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ORIGEN = ROOT / 'wordpress' / 'ta-sitio'
DOMINIO = 'https://transporteautorizado.cl/'
SITIO = ['transporte-autorizado.html', 'assets/site/', 'assets/transporte/', 'normativa/', 'ayuda/', 'documentos/', 'legal/', '.well-known/']
FUERA = {'filas.js'}  # solo de HDS y Campañas
AGENTE = {'agente.js', 'agente.css', 'agente-chat.js', 'agente-chat.css'}  # no van con --sin-agente
# Textos de llms.txt y de .well-known/agent-skills/…/SKILL.md que el plugin reemplaza al entregarlos por las comunas y el
# horario de sus ajustes (TA_SITIO_COBERTURA_BASE y TA_SITIO_HORARIO_BASE en wordpress/ta-sitio/inc/ajustes.php): deben
# quedar idénticos en los tres lugares
COBERTURA_BASE = 'Cerrillos, Cerro Navia, Conchalí, El Bosque, Estación Central, Huechuraba, Independencia, La Cisterna, La Florida, La Granja, La Pintana, La Reina, Lampa, Las Condes, Lo Barnechea, Lo Espejo, Lo Prado, Macul, Maipú, Ñuñoa, Pedro Aguirre Cerda, Peñalolén, Providencia, Pudahuel, Puente Alto, Quilicura, Quinta Normal, Recoleta, Renca, San Bernardo, San Joaquín, San Miguel, San Ramón, Santiago y Vitacura (Región Metropolitana)'
HORARIO_BASE = 'cualquier horario (la hora la define el equipo), mañana (9:00 a 13:00), tarde (13:00 a 17:00) o vespertino (de noche, sujeto a confirmación)'
SKILL = '.well-known/agent-skills/retiro-de-residuos/SKILL.md'


def sin_agente(html):
    """Para armar el paquete sin el agente (--sin-agente; el cliente lo pidió así el 16-10-2026, mientras estaba en desarrollo).
    Se quitan su bloque (del comentario «Agente informativo» al cierre de su ventana), su opción «Chat con IA» de la burbuja
    «?» y sus estilos y scripts."""
    i = html.find('<!-- Agente informativo')
    if i > -1:
        j = html.index('\n</div>\n', html.index('<div class="agente"', i)) + len('\n</div>\n')
        html = html[:i] + html[j:]
    html = re.sub(r'\n *<button class="dock-action is-ia".*?</button>', '', html, count=1, flags=re.S)
    html = re.sub(r'<(?:link|script)[^>]*assets/site/agente(?:-chat)?\.(?:css|js)[^>]*>(?:</script>)?\n?', '', html)
    assert 'data-agente' not in html and 'assets/site/agente' not in html, 'quedó algo del agente en la página'
    return html


def git(*args):
    return subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout


def llms():
    """Resumen del sitio para asistentes de IA (llms.txt): qué es, qué se puede hacer y dónde está cada cosa."""
    html = (ROOT / 'transporte-autorizado.html').read_text(encoding='utf-8')
    bajada = re.search(r'<meta name="description" content="([^"]+)"', html).group(1)
    normas = json.loads((ROOT / 'assets/transporte/normativa.json').read_text(encoding='utf-8'))['normas']
    guias, listas = [], []
    for f in sorted((ROOT / 'ayuda').glob('*.html')):
        html_f = f.read_text(encoding='utf-8')
        titulo = re.search(r'<title>([^<|]+)', html_f).group(1).strip()
        resumen = re.search(r'<meta name="description" content="([^"]+)"', html_f).group(1)
        (listas if 'ck-page' in html_f else guias).append(f'- [{titulo}]({DOMINIO}ayuda/{f.name}): {resumen}')
    lineas = [
        '# Transporte Autorizado', '', f'> {bajada}', '',
        f'Sitio de retiro y coordinación de residuos para empresas en Chile. No tramita autorizaciones sanitarias. Por ahora coordina retiros en {COBERTURA_BASE}. Los retiros se coordinan de lunes a sábado; horario: {HORARIO_BASE}.', '',
        '## Qué se puede hacer',
        f'- [Cotizar un retiro]({DOMINIO}#cotizar): formulario en dos pasos (residuo, cantidad, comuna, dirección, tipo de retiro, horario y contacto). También cotiza el arriendo de contenedores.',
        f'- [Asistente de retiro]({DOMINIO}#asistente): las mismas preguntas, una por una.',
        f'- [Buscar un transportista autorizado]({DOMINIO}#buscar): listado por tipo de residuo y comuna, con datos al 31-12-2025; la vigencia de cada autorización se confirma al consultar.',
        f'- [Hablar con un especialista]({DOMINIO}#especialista): por WhatsApp, +56 9 8606 7930.', '',
        '## Secciones',
        f'- [Servicios]({DOMINIO}#servicios): retiro de residuos no peligrosos, retiro de residuos peligrosos y arriendo de contenedores.',
        f'- [Planes]({DOMINIO}#planes): Retiro Express (prioridad dentro de 24 horas hábiles, sujeto a disponibilidad, tipo de residuo y comuna), Retiro Programado (mensual; se agenda desde pasado mañana) y Espera y ahorra (la empresa propone fechas, desde pasado mañana).',
        f'- [Cómo funciona]({DOMINIO}#proceso)',
        f'- [Preguntas frecuentes]({DOMINIO}#preguntas)', '',
        '## Guías rápidas (orientación para preparar un retiro, con citas al texto oficial)', *guias, '',
        '## Checklists (para usar en línea o descargar en Excel)', *listas, '',
        '## Otros sitios', '- [HDS](https://hds.cl): hojas de datos de seguridad y revisión documental de residuos.', '- [Campañas de reciclaje](https://campanasdereciclaje.cl): campañas de recolección para municipalidades y empresas.',
        '- [LinkedIn de Transporte Autorizado](https://www.linkedin.com/company/transporte-autorizado/)', '',
        '## Normativa (texto oficial de Ley Chile, copia referencial)',
        *[f"- [{n['corto']}: {n['tema']}]({DOMINIO}normativa/{n['slug']}.html)" for n in normas], '',
    ]
    return '\n'.join(lineas)


# Imágenes que se pueden cambiar desde WordPress («Ajustes del sitio» → «Imágenes del sitio», inc/imagenes.php). La lista se
# arma sola al armar el paquete: toda imagen de assets/transporte/ que usan las páginas, las miniaturas de los residuos (las
# pone pickers.js), el logo y el ícono de la pestaña. Aquí solo van los rótulos y las claves antiguas (ajustes ya guardados).
ROTULOS = {  # archivo → (grupo, rótulo, clave antigua o None[, medida de WordPress]); la medida, si la imagen se ve en un tamaño acotado
    'transporte-portada.webp': ('Portada', 'Portada del inicio (computador y teléfono)', 'hero'),
    'transporte-opcion-buscar.webp': ('Portada', 'Hero: «¿Buscas un transportista autorizado?»', 'hero_buscar', '1536x1536'),
    'transporte-opcion-orientacion.webp': ('Portada', 'Hero: «¿Necesitas orientación?»', 'hero_especialista', '1536x1536'),
    'transporte-opcion-reciclador.webp': ('Portada', 'Hero: «Quiero hacer convenio con un reciclador de base»', 'hero_reciclador', '1536x1536'),
    'transporte-servicio-no-peligrosos.webp': ('Servicios', 'Servicio: retiro de residuos no peligrosos', 'servicio_1'),
    'transporte-servicio-peligrosos.webp': ('Servicios', 'Servicio: retiro de residuos peligrosos', 'servicio_2'),
    'transporte-portacontenedor-azul-1200.webp': ('Servicios', 'Servicio: arriendo de contenedores', 'servicio_3'),
    'ecosistema-hds-transporte-400.webp': ('Otras secciones', 'Otros sitios: HDS', 'img_ecosistema_hds_transporte_1200'),
    'ecosistema-campanas-400.webp': ('Otras secciones', 'Otros sitios: Campañas de reciclaje', 'img_ecosistema_campanas_1200'),
    'og-transporte.jpg': ('Al compartir', 'Imagen al compartir el enlace (WhatsApp, LinkedIn, redes)', None),
}
# Medidas más chicas de una misma imagen (srcset): van en el mismo espacio que la principal, así una imagen de la biblioteca
# las reemplaza a todas y el plugin pone en su lugar las medidas que generó WordPress
VARIANTES = {
    'transporte-portada-1200.webp': 'transporte-portada.webp',
    'transporte-portada-720.webp': 'transporte-portada.webp',
}
ICONOS = ['favicon-48.png', 'favicon-192.png', 'apple-touch-icon.png']  # un solo espacio: el ícono de la pestaña


def imagenes():
    """[{clave, grupo, rotulo, archivos}] de las imágenes que se pueden cambiar (rutas desde la raíz del sitio)."""
    paginas = ['transporte-autorizado.html', *[str(f.relative_to(ROOT)) for c in ('ayuda', 'normativa', 'legal') for f in sorted((ROOT / c).glob('*.html'))]]
    vistas = []
    for pagina in paginas:
        for m in re.finditer(r'(?:\.\./)*(?:https://transporteautorizado\.cl/)?(assets/transporte/[\w./-]+\.(?:webp|png|jpe?g|avif))', (ROOT / pagina).read_text(encoding='utf-8')):
            if m.group(1) not in vistas:
                vistas.append(m.group(1))
    out = [{'clave': 'logo', 'grupo': 'Logo e ícono', 'rotulo': 'Logo (arriba y en el pie; la imagen elegida no cambia de color al pasar el mouse)', 'archivos': ['assets/transporte/logo/logotipo.svg'], 'tipo': 'logo'},
           {'clave': 'icono', 'grupo': 'Logo e ícono', 'rotulo': 'Ícono de la pestaña del navegador (cuadrado, de al menos 192 px)', 'archivos': [f'assets/transporte/{i}' for i in ICONOS]}]
    principales = {}
    for ruta in vistas:
        nombre = Path(ruta).name
        if nombre in ICONOS or nombre in VARIANTES:
            continue
        grupo, rotulo, clave, *medida = ROTULOS.get(nombre, ('Otras secciones', re.sub(r'[-_]+', ' ', Path(ruta).stem).capitalize(), None))
        e = {'clave': clave or 'img_' + re.sub(r'[^a-z0-9]+', '_', Path(ruta).stem.lower()), 'grupo': grupo, 'rotulo': rotulo, 'archivos': [ruta]}
        if medida:
            e['medida'] = medida[0]
        out.append(e)
        principales[nombre] = e
    for ruta in vistas:
        if Path(ruta).name in VARIANTES:
            principales[VARIANTES[Path(ruta).name]]['archivos'].append(ruta)
    pickers = (ROOT / 'assets/site/pickers.js').read_text(encoding='utf-8')
    for nombre, archivo in re.findall(r"\['([^']+)', '((?:np|p)-[a-z-]+)'\]", pickers):
        peligro = 'peligroso' if archivo.startswith('p-') else 'no peligroso'
        out.append({'clave': 'cat_' + archivo.replace('-', '_'), 'grupo': 'Residuos', 'rotulo': nombre if 'peligros' in nombre else f'{nombre} ({peligro})', 'archivos': [f'assets/transporte/cat/residuo-{archivo}.webp']})
    for e in out:
        assert all((ROOT / a).is_file() for a in e['archivos']), f'no existe la imagen de {e["rotulo"]}'
    assert len({e['clave'] for e in out}) == len(out), 'dos imágenes con la misma clave'
    return out


# CSS y JS del paquete en versión compacta (12-11-2026): sin comentarios ni espacios bajan ~14 KB de CSS y ~29 KB del JS que
# se descarga antes de la foto del hero (comprimidos), lo que Lighthouse marcaba en el teléfono. El repositorio queda legible;
# solo se compacta la copia del paquete. Usa esbuild (versión fija, por npx); sin Node, el paquete sale sin compactar.
ESBUILD = ['npx', '--yes', 'esbuild@0.28.2']


def compactar(carpeta):
    """Compacta en su lugar assets/site/*.css y *.js del paquete, salvo los del chat (de Jeremy, van tal cual)."""
    archivos = sorted(f for f in carpeta.glob('*.css')) + sorted(f for f in carpeta.glob('*.js'))
    archivos = [f for f in archivos if f.name not in AGENTE]
    try:
        subprocess.run([*ESBUILD, '--version'], capture_output=True, text=True, check=True, timeout=180)
    except (OSError, subprocess.SubprocessError):
        print('Aviso: sin esbuild (Node/npx); el CSS y el JS van sin compactar.')
        return 0
    antes = sum(f.stat().st_size for f in archivos)
    for f in archivos:
        extra = ['--target=es2022'] if f.suffix == '.js' else []
        subprocess.run([*ESBUILD, str(f), '--minify', '--charset=utf8', '--legal-comments=none', '--log-level=warning',
                        *extra, f'--outfile={f}', '--allow-overwrite'], check=True, capture_output=True, text=True, timeout=180)
    despues = sum(f.stat().st_size for f in archivos)
    print(f'{len(archivos)} archivos CSS y JS compactados: {antes / 1e3:.0f} KB → {despues / 1e3:.0f} KB')
    return len(archivos)


HTACCESS = """# Las páginas las entrega WordPress (con su control de acceso); aquí solo se sirven los archivos.
<FilesMatch "\\.html$">
  <IfModule mod_authz_core.c>
    Require all denied
  </IfModule>
  <IfModule !mod_authz_core.c>
    Order allow,deny
    Deny from all
  </IfModule>
</FilesMatch>
"""


def main():
    banderas = {a for a in sys.argv[1:] if a.startswith('--')}
    if banderas - {'--sin-agente'}:
        sys.exit('Uso: python3 tools/wordpress.py [destino] [--sin-agente]')
    con_agente = '--sin-agente' not in banderas
    argumentos = [a for a in sys.argv[1:] if not a.startswith('--')]
    salida = Path(argumentos[0]).expanduser().resolve() if argumentos else ROOT.parent / 'wordpress'
    if salida == ROOT or ROOT in salida.parents:
        sys.exit('El destino no puede quedar dentro del repositorio.')
    plugin = salida / 'ta-sitio'
    if plugin.exists():
        shutil.rmtree(plugin)
    shutil.copytree(ORIGEN, plugin)
    sitio = plugin / 'sitio'
    sitio.mkdir()
    n = 0
    for f in git('ls-files', '-co', '--exclude-standard').splitlines():
        if (f in SITIO or any(f.startswith(p) for p in SITIO if p.endswith('/'))) and Path(f).name not in FUERA and (con_agente or Path(f).name not in AGENTE) and (ROOT / f).is_file():
            (sitio / f).parent.mkdir(parents=True, exist_ok=True)
            if f.endswith('.html') and not con_agente:
                (sitio / f).write_text(sin_agente((ROOT / f).read_text(encoding='utf-8')), encoding='utf-8')
            else:
                shutil.copy2(ROOT / f, sitio / f)
            n += 1
    if con_agente:
        pagina = (sitio / 'transporte-autorizado.html').read_text(encoding='utf-8')
        assert 'data-agente-abrir' in pagina and 'assets/site/agente-chat.js' in pagina, 'la página no trae el agente'
        assert all((sitio / 'assets' / 'site' / a).is_file() for a in AGENTE), 'faltan archivos del agente en el paquete'
    compactar(sitio / 'assets' / 'site')
    texto_llms = llms()
    texto_skill = (sitio / SKILL).read_text(encoding='utf-8')
    for nombre, texto in (('llms.txt', texto_llms), (SKILL, texto_skill)):
        assert COBERTURA_BASE in texto and HORARIO_BASE in texto, f'{nombre}: falta el texto de cobertura u horario que el plugin reemplaza'
    (sitio / 'llms.txt').write_text(texto_llms, encoding='utf-8')
    (sitio / 'imagenes.json').write_text(json.dumps(imagenes(), ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    (sitio / '.htaccess').write_text(HTACCESS, encoding='utf-8')
    (sitio / 'index.php').write_text("<?php // Silencio.\n", encoding='utf-8')
    for carpeta in (plugin, plugin / 'inc', plugin / 'admin'):
        (carpeta / 'index.php').write_text("<?php // Silencio.\n", encoding='utf-8')

    comprimido = salida / 'ta-sitio.zip'
    with zipfile.ZipFile(comprimido, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for f in sorted(plugin.rglob('*')):
            if f.is_file():
                z.write(f, f.relative_to(salida))
    version = git('rev-parse', '--short', 'HEAD').strip() + (' + cambios sin confirmar' if git('status', '--porcelain').strip() else '')
    print(f'{n} archivos del sitio ({version}), {"con" if con_agente else "sin"} agente')
    print(f'{plugin}')
    print(f'{comprimido}  {comprimido.stat().st_size / 1e6:.1f} MB')


if __name__ == '__main__':
    main()
