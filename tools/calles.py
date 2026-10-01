#!/usr/bin/env python3
"""Índice de calles de la Región Metropolitana para las sugerencias de dirección (assets/site/geo.js).

Fuente: OpenStreetMap, vía Overpass API. Se guarda una copia en el sitio (assets/transporte/calles.json) para que las
sugerencias sean inmediatas, no dependan de un servicio externo y lo que la persona escribe no salga de su navegador.
Además escribe assets/transporte/calles-puntos.json: un punto de referencia por calle y comuna (y el centro de cada
comuna), que solo se descarga al abrir el mapa para marcar el lugar del retiro, y sirve para partir cerca de la calle.
Los datos son © colaboradores de OpenStreetMap, con licencia ODbL (https://www.openstreetmap.org/copyright).

Cómo trabaja: pide el límite de cada comuna (su relación en OpenStreetMap) y luego las vías con nombre dentro de ese
polígono. No usa las «áreas» de Overpass, que no todos los servidores tienen.

Uso: python3 tools/calles.py              (las 52 comunas; tarda unos 8 minutos por las pausas entre consultas)
     python3 tools/calles.py Maipú Paine  (solo esas comunas; el resto se conserva del archivo actual)
     python3 tools/calles.py --faltantes  (solo las comunas que aún no están en el archivo: retoma una pasada interrumpida)
El archivo se guarda después de cada comuna, así que una pasada interrumpida no se pierde.
Conviene repetirlo un par de veces al año: las calles nuevas aparecen cuando alguien las agrega al mapa.
"""
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'transporte' / 'calles.json'
OUT_PUNTOS = ROOT / 'assets' / 'transporte' / 'calles-puntos.json'
BASE = (-34.6, -71.9)   # los puntos se guardan como enteros: (coordenada - base) × ESCALA (unos 11 m de precisión)
ESCALA = 10000
OVERPASS = ['https://overpass.openstreetmap.fr/api/interpreter', 'https://overpass-api.de/api/interpreter',
            'https://lambert.openstreetmap.de/api/interpreter']
UA = 'indice-calles-rm/1.0 (sitio estatico; consulta ocasional)'

# Las 52 comunas de la Región Metropolitana y su relación (límite administrativo) en OpenStreetMap
COMUNAS = {
    'Alhué': 1556873, 'Buin': 660816, 'Calera de Tango': 1626780, 'Cerrillos': 168260, 'Cerro Navia': 168271, 'Colina': 164101,
    'Conchalí': 190910, 'Curacaví': 168297, 'El Bosque': 191203, 'El Monte': 1617563, 'Estación Central': 168058,
    'Huechuraba': 164091, 'Independencia': 168060, 'Isla de Maipo': 1557251, 'La Cisterna': 191200, 'La Florida': 224590,
    'La Granja': 191220, 'La Pintana': 191216, 'La Reina': 162992, 'Lampa': 168295, 'Las Condes': 162991, 'Lo Barnechea': 164090,
    'Lo Espejo': 191193, 'Lo Prado': 168268, 'Macul': 191190, 'Maipú': 168259, 'María Pinto': 296839, 'Melipilla': 296835,
    'Padre Hurtado': 175820, 'Paine': 1557208, 'Pedro Aguirre Cerda': 168057, 'Peñaflor': 1626477, 'Peñalolén': 164137,
    'Pirque': 238959, 'Providencia': 162983, 'Pudahuel': 168269, 'Puente Alto': 166571, 'Quilicura': 164102,
    'Quinta Normal': 168059, 'Recoleta': 162984, 'Renca': 109577, 'San Bernardo': 660810, 'San Joaquín': 168055,
    'San José de Maipo': 166556, 'San Miguel': 168056, 'San Pedro': 296836, 'San Ramón': 191201, 'Santiago': 164609,
    'Talagante': 1626706, 'Tiltil': 175894, 'Vitacura': 162990, 'Ñuñoa': 162993,
}

# Vías que cuentan como calle. El número es el orden al sugerir: primero las principales.
ORDEN = {'motorway': 0, 'trunk': 0, 'primary': 0, 'secondary': 1, 'tertiary': 2,
         'unclassified': 3, 'residential': 3, 'living_street': 3, 'pedestrian': 3, 'road': 3}
# Senderos, accesos y caminos de servicio solo entran si su nombre es el de una calle («Pasaje…», «Camino…»)
SOLO_SI = {'footway', 'service', 'track', 'path'}
ES_CALLE = re.compile(r'^(pasaje|paseo|camino|calle|avenida|callej[oó]n|diagonal)\b', re.I)
DESCARTE = re.compile(r'^(acceso|estacionamientos?|ciclov[ií]a|sendero|entrada|salida|retorno|enlace|caletera|corredor|aeropuerto|'
                      r'condominio|rotonda|puente|t[uú]nel|nudo|tr[eé]bol|pista|paso (superior|inferior|nivel|bajo)|sin nombre)\b|\bpeaje\b', re.I)
PUNTOS = 300  # vértices por polígono al consultar (el límite se simplifica; basta para saber qué calles pasan por la comuna)


def fold(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn').lower()


def overpass(q, intentos=6):
    """Devuelve el texto de la respuesta. Reintenta, alternando servidores, ante errores pasajeros."""
    data = urllib.parse.urlencode({'data': q}).encode()
    for k in range(intentos):
        url = OVERPASS[k % len(OVERPASS)]
        try:
            req = urllib.request.Request(url, data=data, headers={'User-Agent': UA})
            texto = urllib.request.urlopen(req, timeout=150).read().decode('utf-8')
            if 'runtime error' in texto[-400:] or texto.lstrip().startswith('<?xml'):
                raise ValueError(texto[-160:].strip().replace('\n', ' '))
            return texto
        except (OSError, ValueError) as e:
            if k == intentos - 1:
                raise
            print(f'  {url.split("/")[2]} no respondió ({str(e)[:90]}); reintento {k + 2} de {intentos}…', flush=True)
            time.sleep(12 * (k + 1))


def anillos(rel):
    """Anillos exteriores del límite de la comuna, como listas de (lat, lon), cosiendo las vías que lo forman."""
    r = json.loads(overpass(f'[out:json][timeout:90];rel({rel});out geom;'))['elements'][0]
    tramos = [[(p['lat'], p['lon']) for p in m['geometry']] for m in r['members']
              if m['type'] == 'way' and m.get('role') in ('outer', '') and m.get('geometry')]
    out = []
    while tramos:
        anillo = tramos.pop(0)
        while anillo[0] != anillo[-1]:
            for i, t in enumerate(tramos):
                if t[0] == anillo[-1]:
                    anillo += t[1:]
                elif t[-1] == anillo[-1]:
                    anillo += t[::-1][1:]
                else:
                    continue
                tramos.pop(i)
                break
            else:
                break  # límite abierto en el mapa: se usa lo que hay
        if len(anillo) >= 4:
            out.append(anillo)
    return out


def medio(puntos):
    """El punto de la lista más cercano al promedio: queda sobre una vía real y no en medio de una manzana."""
    la = sum(p[0] for p in puntos) / len(puntos)
    lo = sum(p[1] for p in puntos) / len(puntos)
    return min(puntos, key=lambda p: (p[0] - la) ** 2 + (p[1] - lo) ** 2)


def calles(rel):
    """{calle: (orden, lat, lon)} de una comuna; el punto es el centro del tramo más céntrico de esa calle."""
    tramos = {}
    for anillo in anillos(rel):
        paso = max(1, len(anillo) // PUNTOS)
        poly = ' '.join(f'{la:.5f} {lo:.5f}' for la, lo in anillo[::paso])
        time.sleep(2)
        csv = overpass(f'[out:csv(name,highway,::lat,::lon;false;"|")][timeout:150];way(poly:"{poly}")["highway"]["name"];out center tags;')
        for linea in csv.splitlines():
            partes = linea.rsplit('|', 3)
            if len(partes) != 4:
                continue
            nombre, tipo, lat, lon = partes
            nombre = re.sub(r'\s+', ' ', nombre).strip()
            if not nombre or len(nombre) > 60 or DESCARTE.search(nombre):
                continue
            if tipo in ORDEN:
                orden = ORDEN[tipo]
            elif tipo in SOLO_SI and ES_CALLE.search(nombre):
                orden = 3
            else:
                continue
            t = tramos.setdefault(nombre, [orden, []])
            t[0] = min(t[0], orden)
            try:
                t[1].append((float(lat), float(lon)))
            except ValueError:
                pass
    return {n: (orden, *(medio(pts) if pts else (None, None))) for n, (orden, pts) in tramos.items()}


def guardar(por_comuna):
    nombres = [n for n in sorted(COMUNAS, key=fold) if por_comuna.get(n)]
    # Una misma calle puede venir escrita de varias formas («11 de septiembre», «11 de Septiembre»): se juntan y queda
    # la forma más usada (a igualdad, la que tiene más mayúsculas y tildes)
    juntas = {}
    for i, c in enumerate(nombres):
        for calle, (orden, lat, lon) in por_comuna[c].items():
            if DESCARTE.search(calle):
                continue
            j = juntas.setdefault(fold(calle), {'orden': orden, 'comunas': {}, 'formas': {}})
            j['orden'] = min(j['orden'], orden)
            j['comunas'].setdefault(i, (lat, lon))
            j['formas'][calle] = j['formas'].get(calle, 0) + 1
    mejor = lambda formas: max(formas, key=lambda f: (formas[f], sum(1 for ch in f if ch.isupper() or ord(ch) > 127)))
    orden_filas = [j for _, j in sorted(juntas.items())]
    filas = [[mejor(j['formas']), j['orden'], sorted(j['comunas'])] for j in orden_filas]
    doc = {'fuente': '© colaboradores de OpenStreetMap (ODbL)', 'licencia': 'https://www.openstreetmap.org/copyright',
           'fecha': date.today().isoformat(), 'comunas': nombres, 'calles': filas}
    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')

    # Puntos: misma fila y mismo orden de comunas que calles.json; -1 cuando una calle no tiene punto
    entero = lambda v, base: -1 if v is None else round((v - base) * ESCALA)
    puntos = [[x for i in sorted(j['comunas']) for x in (entero(j['comunas'][i][0], BASE[0]), entero(j['comunas'][i][1], BASE[1]))] for j in orden_filas]
    centros = []
    for c in nombres:  # centro de la comuna: el punto de calle más cercano a la mediana (cae en la zona poblada)
        pts = [(la, lo) for _, la, lo in por_comuna[c].values() if la is not None]
        if not pts:
            centros.append([-1, -1])
            continue
        la = sorted(p[0] for p in pts)[len(pts) // 2]
        lo = sorted(p[1] for p in pts)[len(pts) // 2]
        m = min(pts, key=lambda p: (p[0] - la) ** 2 + (p[1] - lo) ** 2)
        centros.append([entero(m[0], BASE[0]), entero(m[1], BASE[1])])
    doc_puntos = {'fuente': doc['fuente'], 'fecha': doc['fecha'], 'base': list(BASE), 'escala': ESCALA, 'comunas': centros, 'puntos': puntos}
    OUT_PUNTOS.write_text(json.dumps(doc_puntos, separators=(',', ':')) + '\n', encoding='utf-8')
    return len(filas), len(nombres)


def main():
    faltantes = '--faltantes' in sys.argv
    solo = {fold(a) for a in sys.argv[1:] if not a.startswith('--')}
    previo = json.loads(OUT.read_text(encoding='utf-8')) if OUT.exists() else None
    por_comuna = {}
    if previo:  # lo que ya estaba, por si solo se actualizan algunas comunas
        pp = json.loads(OUT_PUNTOS.read_text(encoding='utf-8')) if OUT_PUNTOS.exists() else None
        real = lambda v, base: None if v < 0 else base + v / ESCALA
        for f, (nombre, orden, idx) in enumerate(previo['calles']):
            for k, i in enumerate(idx):
                par = pp['puntos'][f][2 * k:2 * k + 2] if pp and f < len(pp['puntos']) and len(pp['puntos'][f]) == 2 * len(idx) else [-1, -1]
                por_comuna.setdefault(previo['comunas'][i], {})[nombre] = (orden, real(par[0], BASE[0]), real(par[1], BASE[1]))
    completa = lambda c: por_comuna.get(c) and any(la is not None for _, la, _ in por_comuna[c].values())
    for nombre in sorted(COMUNAS, key=fold):
        if (solo and fold(nombre) not in solo) or (faltantes and completa(nombre)):
            continue
        time.sleep(3)  # sin ráfagas: Overpass es un servicio compartido
        por_comuna[nombre] = calles(COMUNAS[nombre])
        print(f'{nombre:<22} {len(por_comuna[nombre]):>5} calles', flush=True)
        guardar(por_comuna)
    filas, n = guardar(por_comuna)
    print(f'{filas} calles distintas en {n} comunas → {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB) y {OUT_PUNTOS.name} ({OUT_PUNTOS.stat().st_size // 1024} KB)')


if __name__ == '__main__':
    main()
