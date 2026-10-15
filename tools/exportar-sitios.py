#!/usr/bin/env python3
"""Arma una carpeta ordenada con los tres sitios, cada uno completo en su propia carpeta.

    python3 tools/exportar-sitios.py [destino]

Sin destino, la carpeta queda junto a este repositorio: ../sitios-ambientalia

Este repositorio publica los tres sitios desde una sola carpeta (así los sirve GitHub Pages) y los tres comparten el
sistema de diseño de assets/site/. Para respaldar o entregar cada sitio por separado, esta herramienta copia:

  1-transporte-autorizado/   la página, assets/site/, assets/transporte/, normativa/, ayuda/, documentos/, tools/, docs/
                             y las reglas de trabajo (AGENTS.md, CLAUDE.md): todo lo que lo hace funcionar
  2-hds/                     la página, assets/hds/ y los archivos de assets/site/ que carga
  3-campanas-reciclaje/      la página, assets/campanas/ y los archivos de assets/site/ que carga
  index.html                 la portada, con los enlaces a las tres carpetas
  LEEME.md                   qué hay en cada carpeta y cómo abrirla

Es una copia: no cambia nada de este repositorio, que sigue siendo donde se edita y desde donde se publica. Los
enlaces entre sitios se ajustan a las carpetas nuevas y, al terminar, se revisa que ningún enlace local quede roto.
Solo se copia lo que git conoce (sin tools/cache/osm, que son descargas que se regeneran).
"""
import re
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITIOS = {
    'transporte': ('1-transporte-autorizado', 'transporte-autorizado.html', 'Transporte Autorizado', 'transporteautorizado.cl'),
    'hds': ('2-hds', 'hds.html', 'HDS', 'hds.cl'),
    'campanas': ('3-campanas-reciclaje', 'campanas-reciclaje.html', 'Campañas de reciclaje', 'campanasdereciclaje.cl'),
}
PAGINA = {pagina: carpeta for carpeta, pagina, _, _ in SITIOS.values()}
MARCA = '.exportado'  # distingue una carpeta hecha por esta herramienta: solo esas se reemplazan


def git(*args):
    return subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout


def archivos():
    """Lo que git conoce (confirmado o nuevo), sin lo ignorado."""
    return [f for f in git('ls-files', '-co', '--exclude-standard').splitlines() if (ROOT / f).is_file()]


def compartidos(pagina):
    """Archivos de assets/site/ que carga una página."""
    html = (ROOT / pagina).read_text(encoding='utf-8')
    return set(re.findall(r'assets/site/[\w.-]+\.(?:css|js)', html))


def destinos(f):
    """Carpetas de sitio a las que va un archivo del repositorio."""
    t, h, c = (SITIOS[k][0] for k in ('transporte', 'hds', 'campanas'))
    if f in ('.gitignore', '.nojekyll', 'index.html', 'README.md', 'tools/exportar-sitios.py'):
        return []  # propios del repositorio; esta herramienta necesita git y solo sirve aquí
    if f == 'robots.txt':
        return [t, h, c]
    if f.startswith('assets/site/'):
        return [t] + [carpeta for carpeta, pagina in ((h, 'hds.html'), (c, 'campanas-reciclaje.html')) if f in compartidos(pagina)]
    if f == 'hds.html' or f.startswith('assets/hds/'):
        return [h]
    if f == 'campanas-reciclaje.html' or f.startswith('assets/campanas/'):
        return [c]
    return [t]  # la página de Transporte, sus datos, normas, guías, herramientas y documentación


def entre_sitios(html, carpeta):
    """Los enlaces a las otras vistas pasan a apuntar a su carpeta vecina."""
    def cambia(m):
        pagina = m.group(2) + '.html'
        return m.group(0) if PAGINA[pagina] == carpeta else f'{m.group(1)}../{PAGINA[pagina]}/{pagina}'
    return re.sub(r'(href=")\./(transporte-autorizado|hds|campanas-reciclaje)\.html', cambia, html)


def portada():
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    for carpeta, pagina, _, _ in SITIOS.values():
        html = html.replace(f'href="{pagina}"', f'href="{carpeta}/{pagina}"')
    for clave, (carpeta, *_) in SITIOS.items():
        html = html.replace(f'"assets/{clave}/', f'"{carpeta}/assets/{clave}/')
    return html


# ---------- Revisión: ningún enlace local roto ----------
EXTERNO = re.compile(r'^(?:[a-z][a-z0-9+.-]*:|//|#)', re.I)


def referencias(texto, es_css):
    refs = set()
    if es_css:
        texto = re.sub(r'/\*.*?\*/', '', texto, flags=re.S)  # los comentarios nombran archivos, no los enlazan
    else:
        refs.update(re.findall(r'\b(?:href|src|poster|data-foto)="([^"]+)"', texto))
        for lista in re.findall(r'\bsrcset="([^"]+)"', texto):
            refs.update(parte.strip().split()[0] for parte in lista.split(',') if parte.strip())
    refs.update(m.strip('\'" ') for m in re.findall(r'url\(([^)]+)\)', texto))
    return {r for r in refs if r and not EXTERNO.match(r)}


def rotos(base):
    """Enlaces e imágenes locales de las páginas y hojas de estilo que no tienen archivo en la copia."""
    faltan = []
    for f in sorted(base.rglob('*')):
        if f.suffix not in ('.html', '.css') or not f.is_file() or {'tools', 'docs'} & set(f.relative_to(base).parts):
            continue
        sitio = f.relative_to(base).parts[0]
        for ref in sorted(referencias(f.read_text(encoding='utf-8', errors='replace'), f.suffix == '.css')):
            ruta = ref.split('#')[0].split('?')[0]
            # El CSS compartido nombra el logo de Transporte: HDS y Campañas no lo usan ni lo llevan.
            if f.suffix == '.css' and ruta.startswith('../transporte/') and sitio != SITIOS['transporte'][0]:
                continue
            if ruta and not (f.parent / ruta).resolve().exists():
                faltan.append(f'{f.relative_to(base)} → {ref}')
    return faltan


def datos_del_js(base):
    """Rutas fijas que los scripts de Transporte piden al navegador (datos e imágenes)."""
    faltan = []
    sitio = base / SITIOS['transporte'][0]
    for f in sorted((sitio / 'assets/site').glob('*.js')):
        for ruta in set(re.findall(r'assets/[\w/.-]+\.(?:json|webp|svg|png|jpg|xlsx|pdf)', f.read_text(encoding='utf-8'))):
            if not (sitio / ruta).exists():
                faltan.append(f'{f.relative_to(base)} → {ruta}')
    return faltan


def peso(carpeta):
    total = sum(f.stat().st_size for f in carpeta.rglob('*') if f.is_file())
    return f'{total / 1e6:.1f} MB'.replace('.', ',')


def leeme(base, version):
    t, h, c = (SITIOS[k][0] for k in ('transporte', 'hds', 'campanas'))
    filas = '\n'.join(f'| `{carpeta}/` | {nombre} | `{pagina}` | {dominio} | {peso(base / carpeta)} |' for carpeta, pagina, nombre, dominio in SITIOS.values())
    return f"""# Sitios de Ambientalia

Copia ordenada de los tres sitios, hecha el {date.today().strftime('%d-%m-%Y')} desde `ambientalia-vistas-previas` (versión {version}).
Cada carpeta contiene un sitio completo: se puede abrir, respaldar o entregar por separado.

| Carpeta | Sitio | Página de entrada | Dominio previsto | Tamaño |
|---|---|---|---|---|
{filas}

`index.html` es la portada con los enlaces a los tres.

## Cómo abrirlos

Los sitios leen datos (transportistas, calles, normativa), y eso solo funciona cuando una dirección web los sirve; con
doble clic sobre el archivo, esas partes quedan vacías. Desde esta carpeta, en la Terminal:

```bash
python3 -m http.server 8800
```

y luego abrir <http://localhost:8800>. No hay nada que instalar ni compilar: son HTML, CSS y JavaScript tal cual.

## {t}: qué es cada cosa

| Qué | Dónde |
|---|---|
| La página | `transporte-autorizado.html` |
| Diseño y funcionamiento | `assets/site/` (detalle más abajo) |
| Imágenes, logo y datos | `assets/transporte/`: `transportistas.json` (buscador), `calles.json` y `direcciones/` (direcciones y mapa), `normativa.json` y `normativa/` (biblioteca y PDF), `cat/` (imágenes de residuos), `linkedin.json` y `linkedin/` (publicaciones), `logo/`, `documentos/` (checklist en Excel) |
| Normas, una página por norma | `normativa/` |
| Guías | `ayuda/` (`documentos/` solo redirige a ellas) |
| Herramientas que generan contenido | `tools/` |
| Plugin para WordPress (sirve el sitio y recibe las solicitudes) | `wordpress/ta-sitio/`; se arma con `python3 tools/wordpress.py` |
| Documentación del proyecto | `docs/`: contexto, normativa, procedimientos y dos esquemas en HTML, `flujo-cotizacion.html` (el flujo de cotización) y `preguntas-y-apartados.html` (preguntas frecuentes de una persona y el apartado que las responde) |
| Reglas y decisiones de diseño | `AGENTS.md` (la bitácora completa) y `CLAUDE.md` |

Archivos de `assets/site/`:

- `site.css` y `transporte.css`: todo el diseño (colores, tipografía, hero, tarjetas, ventanas).
- `site.js`: menú, formularios con resumen, enlaces de WhatsApp y la burbuja «?».
- `pickers.js`: las listas que se eligen (residuos, cantidades, comunas, horarios, vehículos y contenedores).
- `seleccion.js`: las ventanas de selección (opciones, calendario, horario, dirección).
- `transporte-ui.js`: el hero, el campo para escribir y el formulario de cotización.
- `transporte.js`: el buscador de transportistas.
- `interpretar.js`: entiende lo que la persona escribe (palabras clave, sin IA).
- `asistente.js`: el asistente de retiro.
- `geo.js` y `mapa.js`: sugerencias de calles y el mapa de la dirección.
- `ayuda.js`, `normativa.js` y `norma.js`: el panel «Ayuda», la biblioteca de normas y la lectura de cada norma.

Herramientas de `tools/` (se ejecutan desde la carpeta del sitio, por ejemplo `python3 tools/normativa.py`):

- `normativa.py` y `ayuda.py`: generan `normativa/`, `ayuda/` y el panel «Ayuda» con el texto oficial guardado en `tools/cache/leychile/`.
- `normativa-pdf.mjs`: genera los PDF de las normas.
- `compactar-transportistas.py`: prepara `transportistas.json` a partir del listado.
- `calles.py` y `direcciones.py`: arman el índice de calles y direcciones con OpenStreetMap.
- `logo.py`: saca las piezas del logotipo y los íconos desde el original de `docs/marca/`.
- `wordpress.py`: arma el plugin de WordPress con el sitio dentro.
- `hero-cielo.py`: prepara las versiones de la foto del hero.
- `linkedin.mjs` y `.github/workflows/linkedin.yml` (carpeta oculta): leen las publicaciones de LinkedIn; esa tarea corre sola en GitHub.

## {h} y {c}

Cada una trae su página, su carpeta de imágenes (`assets/hds/`, `assets/campanas/`) y los archivos de `assets/site/`
que usa: el mismo diseño de Transporte más `filas.js`, que maneja las filas de sus formularios. Su contexto y sus reglas
están en `{t}/docs/contexto-proyecto.md` y `{t}/AGENTS.md`.

## Qué usan de afuera

No hay servidor propio ni base de datos: los formularios arman un mensaje y abren WhatsApp (56986067930). Desde
internet se cargan la tipografía Nunito (Google Fonts), el mapa (Leaflet desde jsDelivr e imágenes de OpenStreetMap) y
la animación de números (NumberFlow desde jsDelivr).

## Antes de publicar en un dominio definitivo

- Se sube el contenido de la carpeta del sitio; `tools/`, `docs/` y los `.md` no hacen falta en el servidor.
- La página de entrada no se llama `index.html`. En Transporte, las normas y las guías enlazan a
  `transporte-autorizado.html`: si se renombra, hay que cambiar esos enlaces (y `tools/normativa.py`, que los genera).
- Las páginas llevan `noindex` y `robots.txt` bloquea a los buscadores porque son vistas previas: hay que quitarlo.
- Transporte enlaza a <https://hds.cl> y <https://campanasdereciclaje.cl>; al 08-10-2026 el segundo dominio todavía no
  existe. HDS y Campañas enlazan a las carpetas vecinas de esta copia.
- Datos que faltan del cliente (vehículos, contenedores, correo de destino y fotos del hero): ver «Cambios del
  08-10-2026» en `{t}/AGENTS.md`.

## Esta carpeta es una copia

Los cambios se hacen en `ambientalia-vistas-previas` (desde ahí se publica la vista previa). Para actualizar esta
carpeta, desde `ambientalia-vistas-previas`: `python3 tools/exportar-sitios.py`. Lo que se edite aquí a mano se pierde al
volver a generarla.
"""


def main():
    destino = Path(sys.argv[1]).expanduser().resolve() if len(sys.argv) > 1 else ROOT.parent / 'sitios-ambientalia'
    if destino == ROOT or ROOT in destino.parents:
        sys.exit('El destino no puede quedar dentro del repositorio: se publicaría junto con las vistas.')
    if destino.exists():
        if not (destino / MARCA).exists():
            sys.exit(f'{destino} ya existe y no la hizo esta herramienta. Elige otro destino o muévela.')
        shutil.rmtree(destino)
    destino.mkdir(parents=True)
    (destino / MARCA).write_text('Carpeta generada por tools/exportar-sitios.py de ambientalia-vistas-previas.\n', encoding='utf-8')

    for f in archivos():
        for carpeta in destinos(f):
            salida = destino / carpeta / f
            salida.parent.mkdir(parents=True, exist_ok=True)
            if f in PAGINA:
                salida.write_text(entre_sitios((ROOT / f).read_text(encoding='utf-8'), carpeta), encoding='utf-8')
            else:
                shutil.copy2(ROOT / f, salida)
    (destino / 'index.html').write_text(portada(), encoding='utf-8')

    version = git('rev-parse', '--short', 'HEAD').strip() + (', más cambios sin confirmar' if git('status', '--porcelain').strip() else '')
    (destino / 'LEEME.md').write_text(leeme(destino, version), encoding='utf-8')

    for carpeta, pagina, nombre, _ in SITIOS.values():
        n = sum(1 for f in (destino / carpeta).rglob('*') if f.is_file())
        print(f'{carpeta:26} {n:4} archivos  {peso(destino / carpeta):>8}  {nombre}')
    faltan = rotos(destino) + datos_del_js(destino)
    if faltan:
        print(f'\n{len(faltan)} enlaces locales sin destino:')
        print('\n'.join(f'  {x}' for x in faltan))
        sys.exit(1)
    print(f'\nSin enlaces locales rotos. Carpeta: {destino}')


if __name__ == '__main__':
    main()
