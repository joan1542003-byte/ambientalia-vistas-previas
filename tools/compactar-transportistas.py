"""Genera assets/transporte/transportistas.json a partir de assets/transporte/transportistas-filtro-residuo.js.

El archivo original repite cada empresa una vez por categoría de residuo (10 mil filas, 2,2 MB). El compacto guarda
cada registro una sola vez y, por categoría, la lista de registros que la atienden (≈ 4 veces más liviano).
El buscador (assets/site/transporte.js) lee el compacto. Uso: python3 tools/compactar-transportistas.py
"""
import json
from pathlib import Path

base = Path(__file__).resolve().parent.parent / 'assets' / 'transporte'
raw = (base / 'transportistas-filtro-residuo.js').read_text(encoding='utf-8')
src = json.loads(raw[raw.index('=') + 1:].strip().rstrip(';'))
assert src['columns'][0] == 'tipo', src['columns']

records, index = [], {}
out = {'version': src['version'], 'columns': src['columns'][1:], 'records': records}
for kind in ('safe', 'hazard'):
    by_type = {}
    for row in src[kind]:
        rec = tuple(row[1:])
        if rec not in index:
            index[rec] = len(records)
            records.append(list(rec))
        by_type.setdefault(row[0], []).append(index[rec])
    out[kind] = [[t, ids] for t, ids in by_type.items()]

(base / 'transportistas.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
rows = sum(len(ids) for k in ('safe', 'hazard') for _, ids in out[k])
print(f'{len(records)} registros, {rows} filas (original: {sum(len(src[k]) for k in ("safe", "hazard"))})')
