"""Los diez checklists del cliente («Documentos oficiales», 22-10-2026), de Excel a datos para usarlos en línea.

Copia cada planilla a assets/transporte/documentos/<slug>.xlsx (la descarga, tal como la entregó el cliente) y escribe
assets/transporte/documentos/<slug>.json con sus puntos agrupados por sección y la finalidad de su hoja «Instrucciones».
tools/ayuda.py arma con esos datos la página de cada checklist (ayuda/<slug>.html) y su lugar en el panel «Ayuda».

Lee el .xlsx sin dependencias (es un zip con XML). Columnas de la hoja «Checklist»: N°, Sección, Ítem de verificación,
Qué revisar, Evidencia / antecedente sugerido, Aplicabilidad, Referencia base, Responsable, Estado, Observaciones.

Uso: python3 tools/checklists.py <carpeta con los .xlsx>   (por defecto, «Material descargable» de Descargas)
"""
import json
import re
import shutil
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
DESTINO = ROOT / 'assets/transporte/documentos'
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
REL = '{http://schemas.openxmlformats.org/package/2006/relationships}'

# Número del archivo del cliente → dirección del checklist en el sitio
SLUGS = {
    '01': 'checklist-autorizacion-sanitaria',
    '02': 'checklist-contratar-transportista-residuos',
    '03': 'checklist-residuo-peligroso',
    '04': 'checklist-documentos-residuos-peligrosos',
    '05': 'checklist-ley-rep-quien-transporta',
    '06': 'checklist-vehiculo-transporte-residuos',
    '07': 'checklist-errores-retiro-residuos',
    '08': 'checklist-preparar-residuos',
    '09': 'checklist-trazabilidad-despues-del-retiro',
    '10': 'checklist-entregar-residuos-gestor',
}


def hojas(xlsx):
    """{nombre de la hoja: filas}, cada fila una lista de textos (celdas vacías como '')."""
    with zipfile.ZipFile(xlsx) as z:
        compartidos = []
        if 'xl/sharedStrings.xml' in z.namelist():
            for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS):
                compartidos.append(''.join(t.text or '' for t in si.iter(f'{{{NS["m"]}}}t')))
        rels = {r.get('Id'): r.get('Target') for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels')).iter(f'{REL}Relationship')}
        salida = {}
        for hoja in ET.fromstring(z.read('xl/workbook.xml')).iter(f'{{{NS["m"]}}}sheet'):
            destino = rels[hoja.get(f'{{{NS["r"]}}}id')].lstrip('/')
            ruta = destino if destino.startswith('xl/') else f'xl/{destino}'
            filas = []
            for fila in ET.fromstring(z.read(ruta)).iter(f'{{{NS["m"]}}}row'):
                celdas = {}
                for c in fila.findall('m:c', NS):
                    col = re.match(r'[A-Z]+', c.get('r')).group(0)
                    k = 0
                    for ch in col:
                        k = k * 26 + ord(ch) - 64
                    v = c.find('m:v', NS)
                    if c.get('t') == 's' and v is not None:
                        texto = compartidos[int(v.text)]
                    elif c.get('t') == 'inlineStr':
                        texto = ''.join(t.text or '' for t in c.iter(f'{{{NS["m"]}}}t'))
                    else:
                        texto = v.text if v is not None else ''
                    celdas[k - 1] = (texto or '').strip()
                if celdas:
                    filas.append([celdas.get(i, '') for i in range(max(celdas) + 1)])
            salida[hoja.get('name')] = filas
        return salida


def limpio(t):
    return re.sub(r'\s+', ' ', t).strip()


def leer(xlsx):
    h = hojas(xlsx)
    filas = h['Checklist']
    titulo = limpio(re.sub(r'^Checklist\s*-\s*', '', filas[0][0]))
    cabecera = next(i for i, f in enumerate(filas) if f and f[0] == 'N°')
    bloques = []
    for f in filas[cabecera + 1:]:
        if not f or not re.fullmatch(r'\d+(\.0)?', f[0]):
            continue
        f = f + [''] * (10 - len(f))
        punto = {
            'n': int(float(f[0])), 'item': limpio(f[2]), 'revisar': limpio(f[3]), 'evidencia': limpio(f[4]),
            'aplica': limpio(f[5]) or 'Siempre', 'referencia': limpio(f[6]),
        }
        seccion = limpio(f[1])
        if not bloques or bloques[-1]['nombre'] != seccion:
            bloques.append({'nombre': seccion, 'puntos': []})
        bloques[-1]['puntos'].append(punto)
    finalidad = next((limpio(f[1]) for f in h.get('Instrucciones', []) if len(f) > 1 and f[0] == 'Finalidad'), '')
    return {'titulo': titulo, 'finalidad': finalidad, 'estados': ['Pendiente', 'Cumple', 'No cumple', 'No aplica'], 'bloques': bloques}


def main():
    origen = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / 'Downloads/Documentos oficiales/Material descargable'
    DESTINO.mkdir(parents=True, exist_ok=True)
    for xlsx in sorted(origen.glob('*.xlsx')):
        numero = xlsx.name[:2]
        if numero not in SLUGS:
            continue
        slug = SLUGS[numero]
        datos = leer(xlsx)
        datos['fuente'] = f'{xlsx.name} (cliente, 22-10-2026)'
        shutil.copyfile(xlsx, DESTINO / f'{slug}.xlsx')
        (DESTINO / f'{slug}.json').write_text(json.dumps(datos, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
        total = sum(len(b['puntos']) for b in datos['bloques'])
        print(f'{slug}: {total} puntos en {len(datos["bloques"])} secciones')


if __name__ == '__main__':
    main()
