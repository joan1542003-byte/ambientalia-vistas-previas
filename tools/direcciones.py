#!/usr/bin/env python3
"""Trazado de las calles y numeración conocida de la Región Metropolitana, por comuna (los usa assets/site/geo.js).

Con estos archivos el sitio convierte dirección ↔ punto del mapa por sí mismo, sin consultar servicios externos:
- al marcar un punto, toma la dirección con número que está ahí o, si no hay, la calle que pasa por el lugar;
- al escribir «calle + número», ubica ese número si el mapa lo conoce o lo estima entre los números vecinos.

Escribe:
- assets/transporte/calles.json y calles-puntos.json: no cambia su contenido, solo el orden de las comunas de cada
  calle (primero aquella donde la calle es más larga). tools/calles.py las vuelve a dejar en orden alfabético, así
  que este programa se ejecuta siempre después de aquel.
- assets/transporte/direcciones/<comuna>.json: cada calle de la comuna, separada en tramos continuos (dos pasajes
  distintos con el mismo nombre son dos tramos); cada tramo trae su trazado y los números conocidos con su punto.
- assets/transporte/comunas-limites.json: el límite de cada comuna, simplificado, para saber en cuál cae un punto.

Fuente: OpenStreetMap, vía Overpass API (© colaboradores de OpenStreetMap, licencia ODbL). Solo entran las calles que
están en assets/transporte/calles.json: ejecuta antes tools/calles.py si quieres incluir calles nuevas.

Uso: python3 tools/direcciones.py               (descarga lo que falte en tools/cache/osm y genera todo; unos 5 minutos)
     python3 tools/direcciones.py --actualizar  (vuelve a descargar los datos del mapa)
La descarga queda en tools/cache/osm (no se publica: está en .gitignore). Conviene repetirlo un par de veces al año.
"""
import json
import math
import re
import shutil
import sys
import time
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from calles import COMUNAS, DESCARTE, ES_CALLE, ORDEN, SOLO_SI, coser, fold, overpass  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'tools' / 'cache' / 'osm'
INDICE = ROOT / 'assets' / 'transporte' / 'calles.json'
OUT = ROOT / 'assets' / 'transporte' / 'direcciones'
OUT_LIMITES = ROOT / 'assets' / 'transporte' / 'comunas-limites.json'
FUENTE = '© colaboradores de OpenStreetMap (ODbL)'

CAJA = (-34.30, -71.72, -32.92, -69.76)  # sur, oeste, norte, este: toda la región
PARTES = (4, 5)                          # la descarga se reparte en filas × columnas, para no pedir todo de una vez
ESCALA = 100000                          # los puntos se guardan como enteros de 0,00001° (cerca de 1 m)
MLAT = 111320.0                          # metros por grado de latitud
MLON = MLAT * math.cos(math.radians(33.5))  # metros por grado de longitud a la latitud de Santiago

TOL_CALLE = 1.5     # m: simplificación del trazado de las calles
TOL_LIMITE = 12.0   # m: simplificación del límite de las comunas
ORILLA = 60.0       # m: una calle que pasa a menos de esto del límite también se guarda en la comuna vecina
UNION = 80.0        # m: trozos de una calle a menos de esta distancia (más o menos) son el mismo tramo
LEJOS = 200.0       # m: una dirección más lejos que esto de su calle se descarta (dato dudoso)
JUNTAS = 60.0       # m: varias entradas con la misma dirección a menos de esto son el mismo lugar

TIPO = re.compile(r'^(avenida|avda|av|calle|pasaje|psje|pje|camino|cno|autopista|carretera|ruta|paseo|callejon|diagonal)\s+(?=\S)')


def nucleo(s):
    """Nombre de calle sin el tipo de vía, igual que en geo.js («Av. Providencia» y «Avenida Providencia» coinciden)."""
    return TIPO.sub('', re.sub(r'\s+', ' ', re.sub(r'[.,;]', ' ', fold(s))).strip())


def slug(comuna):
    return re.sub(r'[^a-z0-9]+', '-', fold(comuna)).strip('-')


def metros(p):
    return (p[1] * MLON, p[0] * MLAT)


# ---------- Descarga ----------
def celdas_descarga():
    s, w, n, e = CAJA
    filas, cols = PARTES
    for i in range(filas):
        for j in range(cols):
            yield i, j, (s + (n - s) * i / filas, w + (e - w) * j / cols, s + (n - s) * (i + 1) / filas, w + (e - w) * (j + 1) / cols)


def bajar(nombre, consulta, forzar):
    f = CACHE / nombre
    if f.exists() and not forzar:
        return f.read_text(encoding='utf-8')
    time.sleep(3)  # sin ráfagas: Overpass es un servicio compartido
    t0 = time.time()
    texto = overpass(consulta)
    f.write_text(texto, encoding='utf-8')
    print(f'  {nombre:<16} {len(texto) // 1024:>6} KB  {time.time() - t0:4.0f} s', flush=True)
    return texto


def descargar(forzar):
    CACHE.mkdir(parents=True, exist_ok=True)
    ids = ','.join(str(i) for i in COMUNAS.values())
    limites = json.loads(bajar('limites.json', f'[out:json][timeout:170];rel(id:{ids});out geom;', forzar))['elements']
    vias, dirs = {}, {}
    for i, j, (s, w, n, e) in celdas_descarga():
        caja = f'{s:.4f},{w:.4f},{n:.4f},{e:.4f}'
        q = (f'[out:json][timeout:170];way["highway"]["name"]({caja});'
             'convert way ::id=id(),::geom=geom(),name=t["name"],highway=t["highway"];out geom;')
        for el in json.loads(bajar(f'vias-{i}-{j}.json', q, forzar))['elements']:
            vias[el['id']] = el
        q = (f'[out:csv(::type,::id,::lat,::lon,"addr:street","addr:housenumber";false;"|")][timeout:170];'
             f'nwr["addr:housenumber"]["addr:street"]({caja});out center;')
        for linea in bajar(f'dir-{i}-{j}.csv', q, forzar).splitlines():
            c = linea.split('|')
            if len(c) >= 6:
                dirs[(c[0], c[1])] = (c[2], c[3], '|'.join(c[4:-1]), c[-1])
    return limites, vias, dirs


# ---------- Geometría ----------
def simplificar(pts, tol):
    """Douglas-Peucker sobre puntos (lat, lon); la tolerancia va en metros. Devuelve los puntos que quedan."""
    if len(pts) < 3:
        return list(pts)
    xy = [metros(p) for p in pts]
    queda = [False] * len(pts)
    queda[0] = queda[-1] = True
    pila = [(0, len(pts) - 1)]
    while pila:
        a, b = pila.pop()
        ax, ay = xy[a]
        dx, dy = xy[b][0] - ax, xy[b][1] - ay
        largo2 = dx * dx + dy * dy
        peor, donde = 0.0, -1
        for i in range(a + 1, b):
            px, py = xy[i][0] - ax, xy[i][1] - ay
            t = 0.0 if largo2 == 0 else max(0.0, min(1.0, (px * dx + py * dy) / largo2))
            d = (px - t * dx) ** 2 + (py - t * dy) ** 2
            if d > peor:
                peor, donde = d, i
        if peor > tol * tol:
            queda[donde] = True
            pila += [(a, donde), (donde, b)]
    return [p for p, q in zip(pts, queda) if q]


def dist_tramo(p, a, b):
    """Distancia en metros del punto p al segmento a-b (todos en metros)."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    largo2 = dx * dx + dy * dy
    t = 0.0 if largo2 == 0 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / largo2))
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)


class Limite:
    """Límite de una comuna, con sus aristas repartidas en franjas de latitud para saber rápido si un punto cae dentro."""
    PASO = 0.002

    def __init__(self, nombre, anillos):
        self.nombre = nombre
        self.anillos = anillos
        lats = [p[0] for a in anillos for p in a]
        lons = [p[1] for a in anillos for p in a]
        self.caja = (min(lats), min(lons), max(lats), max(lons))
        self.franjas = {}
        for anillo in anillos:
            for (la1, lo1), (la2, lo2) in zip(anillo, anillo[1:]):
                if la1 == la2:
                    continue
                for f in range(math.floor(min(la1, la2) / self.PASO), math.floor(max(la1, la2) / self.PASO) + 1):
                    self.franjas.setdefault(f, []).append((la1, lo1, la2, lo2))

    def contiene(self, la, lo):
        c = self.caja
        if not (c[0] <= la <= c[2] and c[1] <= lo <= c[3]):
            return False
        dentro = False
        for la1, lo1, la2, lo2 in self.franjas.get(math.floor(la / self.PASO), ()):
            if (la1 > la) != (la2 > la) and lo < (lo2 - lo1) * (la - la1) / (la2 - la1) + lo1:
                dentro = not dentro
        return dentro


class Comunas:
    """En qué comuna cae un punto, y qué comunas están a menos de ORILLA metros de él."""
    CELDA = 0.004  # cuadrícula gruesa: las celdas por donde no pasa ningún límite son de una sola comuna

    def __init__(self, limites):
        self.limites = limites
        self.borde = set()
        self.lisa = {}
        m_la, m_lo = 1.5 * ORILLA / MLAT, 1.5 * ORILLA / MLON
        for L in limites:
            for anillo in L.anillos:
                for a, b in zip(anillo, anillo[1:]):
                    pasos = max(1, int(math.hypot((b[0] - a[0]) * MLAT, (b[1] - a[1]) * MLON) / 40))
                    for k in range(pasos + 1):
                        la, lo = a[0] + (b[0] - a[0]) * k / pasos, a[1] + (b[1] - a[1]) * k / pasos
                        for da in (-m_la, 0, m_la):
                            for do in (-m_lo, 0, m_lo):
                                self.borde.add(self.celda(la + da, lo + do))

    def celda(self, la, lo):
        return (math.floor(la / self.CELDA), math.floor(lo / self.CELDA))

    def de(self, la, lo):
        for L in self.limites:
            if L.contiene(la, lo):
                return L.nombre
        return None

    def cerca(self, la, lo):
        k = self.celda(la, lo)
        if k not in self.borde:
            if k not in self.lisa:
                self.lisa[k] = self.de((k[0] + .5) * self.CELDA, (k[1] + .5) * self.CELDA)
            return {self.lisa[k]} - {None}
        d_la, d_lo = ORILLA / MLAT, ORILLA / MLON
        return {self.de(la + a, lo + o) for a, o in ((0, 0), (d_la, 0), (-d_la, 0), (0, d_lo), (0, -d_lo))} - {None}


def tramos_continuos(lineas):
    """Agrupa los trozos de una calle que están juntos (comparten cuadra o quedan a menos de ~UNION metros)."""
    padre = list(range(len(lineas)))

    def raiz(i):
        while padre[i] != i:
            padre[i] = padre[padre[i]]
            i = padre[i]
        return i

    vistas = {}
    for i, linea in enumerate(lineas):
        xy = [metros(p) for p in linea]
        for a, b in zip(xy, xy[1:] if len(xy) > 1 else xy):
            pasos = max(1, int(math.hypot(b[0] - a[0], b[1] - a[1]) / (UNION / 2)))
            for k in range(pasos + 1):
                cx = math.floor((a[0] + (b[0] - a[0]) * k / pasos) / UNION)
                cy = math.floor((a[1] + (b[1] - a[1]) * k / pasos) / UNION)
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        j = vistas.get((cx + dx, cy + dy))
                        if j is not None and raiz(j) != raiz(i):
                            padre[raiz(j)] = raiz(i)
                vistas.setdefault((cx, cy), i)
    grupos = {}
    for i in range(len(lineas)):
        grupos.setdefault(raiz(i), []).append(lineas[i])
    return list(grupos.values())


def numeros_de(texto):
    """«1234», «1234-A», «1409, 1411» → los números de la dirección. Rangos y textos raros no se usan.
    Un número que empieza con cero («0123») es otra numeración: la de la calle al otro lado de su origen. Se guarda
    como negativo, que es justo como se ordena en la calle (… 0200, 0100, origen, 100, 200 …)."""
    out = []
    for parte in re.split(r'[;,/]', texto):
        m = re.fullmatch(r'\s*(\d{1,5})(?:\s*-?\s*[A-Za-z0-9]{1,2})?\s*', parte)
        if m and int(m.group(1)):
            out.append(-int(m.group(1)) if m.group(1)[0] == '0' else int(m.group(1)))
    return out


def lugar(puntos):
    """Un solo punto para una dirección que aparece varias veces (locales de un mismo edificio). Si las entradas
    están repartidas en lugares distintos y ninguno predomina, no se usa: el dato es ambiguo."""
    if len(puntos) == 1:
        return puntos[0]
    grupos = []
    for p in puntos:
        x, y = metros(p)
        for g in grupos:
            gx, gy = metros(g[0])
            if math.hypot(x - gx, y - gy) <= JUNTAS:
                g.append(p)
                break
        else:
            grupos.append([p])
    grupos.sort(key=len, reverse=True)
    if len(grupos) > 1 and len(grupos[1]) * 2 > len(grupos[0]):
        return None
    g = grupos[0]
    la, lo = sum(p[0] for p in g) / len(g), sum(p[1] for p in g) / len(g)
    return min(g, key=lambda p: (p[0] - la) ** 2 + (p[1] - lo) ** 2)


def ordenar_indice(largos):
    """En calles.json (y calles-puntos.json) deja las comunas de cada calle ordenadas por cuánta calle hay en cada una:
    así, sin comuna elegida, las sugerencias y el mapa parten por donde la calle es más larga («Avenida Providencia»
    en Providencia antes que su cuadra en Santiago)."""
    puntos_f = INDICE.with_name('calles-puntos.json')
    doc = json.loads(INDICE.read_text(encoding='utf-8'))
    pts = json.loads(puntos_f.read_text(encoding='utf-8')) if puntos_f.exists() else None
    for f, fila in enumerate(doc['calles']):
        nombre, _, idx = fila
        if len(idx) < 2:
            continue
        orden = sorted(range(len(idx)), key=lambda k: (-largos.get((doc['comunas'][idx[k]], nombre), 0), idx[k]))
        fila[2] = [idx[k] for k in orden]
        if pts and len(pts['puntos'][f]) == 2 * len(idx):
            pts['puntos'][f] = [v for k in orden for v in pts['puntos'][f][2 * k:2 * k + 2]]
    INDICE.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    if pts:
        puntos_f.write_text(json.dumps(pts, separators=(',', ':')) + '\n', encoding='utf-8')


# ---------- Armado ----------
def main():
    forzar = '--actualizar' in sys.argv
    canon = {fold(n): n for n, _, _ in json.loads(INDICE.read_text(encoding='utf-8'))['calles']}
    print('Descarga (lo que ya está en tools/cache/osm se reutiliza):', flush=True)
    rels, vias, dirs = descargar(forzar)
    print(f'{len(vias)} vías con nombre y {len(dirs)} direcciones con número en el mapa', flush=True)

    por_rel = {r['id']: r for r in rels}
    limites = []
    for nombre in sorted(COMUNAS, key=fold):
        anillos = coser(por_rel[COMUNAS[nombre]])
        if not anillos:
            sys.exit(f'Sin límite para {nombre}: revisa la relación {COMUNAS[nombre]} en OpenStreetMap')
        limites.append(Limite(nombre, anillos))
    comunas = Comunas(limites)

    # Calles: cada vía se simplifica y sus segmentos van a la comuna donde caen (y a la vecina, si pasan por la orilla)
    trazos = {L.nombre: {} for L in limites}
    fuera_indice = 0
    for el in vias.values():
        nombre = re.sub(r'\s+', ' ', el['tags'].get('name', '')).strip()
        tipo = el['tags'].get('highway', '')
        if not nombre or len(nombre) > 60 or DESCARTE.search(nombre):
            continue
        if not (tipo in ORDEN or (tipo in SOLO_SI and ES_CALLE.search(nombre))):
            continue
        if el['geometry'].get('type') != 'LineString':
            continue
        oficial = canon.get(fold(nombre))
        if not oficial:
            fuera_indice += 1
            continue
        pts = simplificar([(la, lo) for lo, la in el['geometry']['coordinates']], TOL_CALLE)
        if len(pts) < 2:
            continue
        abiertas = {}  # comuna → trozo que se está armando
        for a, b in zip(pts, pts[1:]):
            pasos = max(1, math.ceil(math.hypot((b[0] - a[0]) * MLAT, (b[1] - a[1]) * MLON) / 150))
            donde = set()
            for k in range(pasos):
                t = (k + .5) / pasos
                donde |= comunas.cerca(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
            for c in list(abiertas):
                if c not in donde:
                    trazos[c].setdefault(oficial, []).append(abiertas.pop(c))
            for c in donde:
                if c in abiertas:
                    abiertas[c].append(b)
                else:
                    abiertas[c] = [a, b]
        for c, trozo in abiertas.items():
            trazos[c].setdefault(oficial, []).append(trozo)
    tramos = {c: {n: [{'lineas': g, 'nums': {}} for g in tramos_continuos(lineas)] for n, lineas in calles.items()} for c, calles in trazos.items()}
    largo = lambda linea: sum(math.hypot((b[0] - a[0]) * MLAT, (b[1] - a[1]) * MLON) for a, b in zip(linea, linea[1:]))
    ordenar_indice({(c, n): sum(largo(l) for l in lineas) for c, calles in trazos.items() for n, lineas in calles.items()})
    print(f'Calles armadas ({fuera_indice} vías cuyo nombre no está en calles.json quedaron fuera)', flush=True)

    # Direcciones: cada número va al tramo de su calle que le queda más cerca, dentro de su comuna
    por_nucleo = {c: {} for c in tramos}
    for c, calles in tramos.items():
        for n in calles:
            por_nucleo[c].setdefault(nucleo(n), set()).add(n)
    sin = {'número': 0, 'comuna': 0, 'calle': 0, 'lejos': 0, 'ambigua': 0}
    for la, lo, calle, numero in dirs.values():
        nums = numeros_de(numero)
        if not nums:
            sin['número'] += 1
            continue
        try:
            la, lo = float(la), float(lo)
        except ValueError:
            continue
        c = comunas.de(la, lo)
        if not c:
            sin['comuna'] += 1
            continue
        oficial = canon.get(fold(re.sub(r'\s+', ' ', calle).strip()))
        # Si el nombre no calza tal cual, valen las calles de la comuna que se llaman igual sin el tipo de vía
        opciones = [oficial] if oficial in tramos[c] else sorted(por_nucleo[c].get(nucleo(calle), ()))
        if not opciones:
            sin['calle'] += 1
            continue
        p = metros((la, lo))
        mejor, d_mejor = None, LEJOS
        for nombre in opciones:
            for t in tramos[c][nombre]:
                if 'xy' not in t:
                    t['xy'] = [[metros(q) for q in linea] for linea in t['lineas']]
                for xy in t['xy']:
                    for a, b in zip(xy, xy[1:]):
                        d = dist_tramo(p, a, b)
                        if d < d_mejor:
                            mejor, d_mejor = t, d
        if not mejor:
            sin['lejos'] += 1
            continue
        for n in nums:
            mejor['nums'].setdefault(n, []).append((la, lo))

    # Salida
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    hoy = date.today().isoformat()
    total = {'calles': 0, 'numeros': 0, 'bytes': 0, 'mayor': ('', 0)}
    for c, calles in sorted(tramos.items(), key=lambda kv: fold(kv[0])):
        puntos = [p for ts in calles.values() for t in ts for linea in t['lineas'] for p in linea]
        if not puntos:
            continue
        base = (math.floor(min(p[0] for p in puntos) * 1000) / 1000, math.floor(min(p[1] for p in puntos) * 1000) / 1000)
        ent = lambda p: (round((p[0] - base[0]) * ESCALA), round((p[1] - base[1]) * ESCALA))

        def delta(pts):
            out, ant = [], (0, 0)
            for p in pts:
                e = ent(p)
                out += [e[0] - ant[0], e[1] - ant[1]]
                ant = e
            return out

        filas = []
        for nombre in sorted(calles, key=fold):
            fila = [nombre]
            for t in calles[nombre]:
                nums, ant = [], (0, 0, 0)
                for n in sorted(t['nums']):
                    p = lugar(t['nums'][n])
                    if not p:
                        sin['ambigua'] += 1
                        continue
                    e = ent(p)
                    nums += [n - ant[0], e[0] - ant[1], e[1] - ant[2]]
                    ant = (n, e[0], e[1])
                    total['numeros'] += 1
                fila.append([[delta(linea) for linea in t['lineas']], nums])
            filas.append(fila)
        total['calles'] += len(filas)
        doc = {'fuente': FUENTE, 'licencia': 'https://www.openstreetmap.org/copyright', 'fecha': hoy, 'comuna': c,
               'base': list(base), 'escala': ESCALA, 'calles': filas}
        f = OUT / f'{slug(c)}.json'
        f.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
        peso = f.stat().st_size
        total['bytes'] += peso
        if peso > total['mayor'][1]:
            total['mayor'] = (f.name, peso)

    base = (CAJA[0], CAJA[1])
    filas = []
    for L in limites:
        anillos = []
        for anillo in L.anillos:
            pts = simplificar(anillo, TOL_LIMITE)
            if len(pts) < 4:
                continue
            out, ant = [], (0, 0)
            for p in pts:
                e = (round((p[0] - base[0]) * ESCALA), round((p[1] - base[1]) * ESCALA))
                out += [e[0] - ant[0], e[1] - ant[1]]
                ant = e
            anillos.append(out)
        filas.append([L.nombre, anillos])
    doc = {'fuente': FUENTE, 'licencia': 'https://www.openstreetmap.org/copyright', 'fecha': hoy, 'base': list(base), 'escala': ESCALA, 'comunas': filas}
    OUT_LIMITES.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')

    print(f'{total["calles"]} calles (por comuna) y {total["numeros"]} direcciones con número → {OUT.relative_to(ROOT)}/ '
          f'({total["bytes"] // 1024} KB en {len(list(OUT.glob("*.json")))} archivos; el mayor, {total["mayor"][0]}: {total["mayor"][1] // 1024} KB)')
    print(f'Límites de comunas → {OUT_LIMITES.relative_to(ROOT)} ({OUT_LIMITES.stat().st_size // 1024} KB)')
    print('Direcciones del mapa que no se usaron: ' + ', '.join(f'{v} por {k}' for k, v in sin.items()))


if __name__ == '__main__':
    main()
