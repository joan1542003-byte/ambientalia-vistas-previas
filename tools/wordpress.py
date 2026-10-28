#!/usr/bin/env python3
"""Arma el plugin de WordPress que sirve Transporte Autorizado: código de wordpress/ta-sitio/ + el sitio.

    python3 tools/wordpress.py [destino] [--sin-agente]

Sin destino, deja la carpeta del plugin y su .zip junto a este repositorio: ../wordpress/ta-sitio y ../wordpress/ta-sitio.zip
El paquete lleva el agente (la opción «Chat con IA» de la burbuja «?»), que responde el asistente de la dirección que se
indique en los ajustes del plugin; con --sin-agente se arma sin él.

El plugin (wordpress/ta-sitio/) muestra el sitio desde WordPress, primero en una dirección privada, y recibe las
solicitudes de los formularios (número, correos). El sitio va dentro, en sitio/: la página, assets/site,
assets/transporte, normativa/, ayuda/ y documentos/, más llms.txt (resumen del sitio para asistentes de IA).
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
SITIO = ['transporte-autorizado.html', 'assets/site/', 'assets/transporte/', 'normativa/', 'ayuda/', 'documentos/', 'legal/']
FUERA = {'filas.js'}  # solo de HDS y Campañas
AGENTE = {'agente.js', 'agente.css', 'agente-chat.js', 'agente-chat.css'}  # no van con --sin-agente


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
        'Sitio de retiro y coordinación de residuos para empresas en Chile. No tramita autorizaciones sanitarias. Por ahora coordina retiros en Quilicura, Lampa y Pudahuel (Región Metropolitana).', '',
        '## Qué se puede hacer',
        f'- [Cotizar un retiro]({DOMINIO}#cotizar): formulario en dos pasos (residuo, cantidad, comuna, dirección, tipo de retiro y contacto). También cotiza el arriendo de contenedores.',
        f'- [Asistente de retiro]({DOMINIO}#asistente): las mismas preguntas, una por una.',
        f'- [Buscar un transportista autorizado]({DOMINIO}#buscar): listado por tipo de residuo y comuna, con datos al 31-12-2025; la vigencia de cada autorización se confirma al consultar.',
        f'- [Hablar con un especialista]({DOMINIO}#especialista): por WhatsApp, +56 9 8606 7930.', '',
        '## Secciones',
        f'- [Servicios]({DOMINIO}#servicios): retiro de residuos no peligrosos, retiro de residuos peligrosos y arriendo de contenedores.',
        f'- [Planes]({DOMINIO}#planes): Retiro Express (prioridad dentro de 24 horas hábiles, sujeto a disponibilidad, tipo de residuo y comuna), Retiro Programado (mensual) y Espera y ahorra (la empresa propone fechas).',
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
    (sitio / 'llms.txt').write_text(llms(), encoding='utf-8')
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
