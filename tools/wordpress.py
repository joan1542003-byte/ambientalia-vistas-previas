#!/usr/bin/env python3
"""Arma el plugin de WordPress que sirve Transporte Autorizado: código de wordpress/ta-sitio/ + el sitio.

    python3 tools/wordpress.py [destino]

Sin destino, deja la carpeta del plugin y su .zip junto a este repositorio: ../wordpress/ta-sitio y ../wordpress/ta-sitio.zip

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
SITIO = ['transporte-autorizado.html', 'assets/site/', 'assets/transporte/', 'normativa/', 'ayuda/', 'documentos/']
FUERA = {'filas.js', 'agente.js', 'agente.css', 'agente-chat.js', 'agente-chat.css'}  # filas: HDS y Campañas; agente: en desarrollo


def sin_agente(html):
    """El agente (y su versión con IA) sigue en desarrollo: el sitio oficial no lo muestra (pedido del cliente, 16-10-2026).
    Se quitan su bloque (del comentario «Agente informativo» al cierre de su ventana) y sus estilos y scripts."""
    i = html.find('<!-- Agente informativo')
    if i > -1:
        j = html.index('\n</div>\n', html.index('<div class="agente"', i)) + len('\n</div>\n')
        html = html[:i] + html[j:]
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
    guias = []
    for f in sorted((ROOT / 'ayuda').glob('*.html')):
        titulo = re.search(r'<title>([^<|]+)', f.read_text(encoding='utf-8')).group(1).strip()
        guias.append(f'- [{titulo}]({DOMINIO}ayuda/{f.name})')
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
        f'- [Planes]({DOMINIO}#planes): Retiro Express (prioridad dentro de las próximas 24 horas, sujeto a disponibilidad, tipo de residuo y comuna), Retiro Programado (mensual) y Espera y ahorra (la empresa propone fechas).',
        f'- [Cómo funciona]({DOMINIO}#proceso)',
        f'- [Preguntas frecuentes]({DOMINIO}#preguntas)', '',
        '## Guías', *guias, '',
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
    salida = Path(sys.argv[1]).expanduser().resolve() if len(sys.argv) > 1 else ROOT.parent / 'wordpress'
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
        if (f in SITIO or any(f.startswith(p) for p in SITIO if p.endswith('/'))) and Path(f).name not in FUERA and (ROOT / f).is_file():
            (sitio / f).parent.mkdir(parents=True, exist_ok=True)
            if f.endswith('.html'):
                (sitio / f).write_text(sin_agente((ROOT / f).read_text(encoding='utf-8')), encoding='utf-8')
            else:
                shutil.copy2(ROOT / f, sitio / f)
            n += 1
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
    print(f'{n} archivos del sitio ({version})')
    print(f'{plugin}')
    print(f'{comprimido}  {comprimido.stat().st_size / 1e6:.1f} MB')


if __name__ == '__main__':
    main()
