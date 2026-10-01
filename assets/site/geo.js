/* Direcciones de la Región Metropolitana: sugerencias mientras se escribe y conexión con el mapa (mapa.js).
   Todo sale de archivos del propio sitio, hechos con datos de OpenStreetMap (© colaboradores de OpenStreetMap,
   licencia ODbL): es inmediato, no depende de un servicio externo y ni lo que la persona escribe ni el punto que
   marca salen de su navegador.

   1. Sugerencias de calles, con su comuna: assets/transporte/calles.json (tools/calles.py). Se descarga la primera
      vez que se abre la dirección; `locate` usa además calles-puntos.json para mostrar la calle en el mapa.
   2. Dirección ↔ punto del mapa: assets/transporte/direcciones/<comuna>.json (el trazado de cada calle y los números
      que el mapa conoce) y comunas-limites.json (en qué comuna cae un punto), hechos con tools/direcciones.py. Se
      descargan al usar el mapa, solo la comuna que hace falta.
      - `search`: punto de «calle + número». Si el mapa conoce ese número, es exacto; si no, se estima entre los
        números vecinos de la misma calle y queda como aproximado (la persona lo confirma en el mapa).
      - `reverse`: dirección de un punto. Entrega el número solo cuando hay una dirección conocida en ese lugar: no
        se inventa un número estimado.
      - `junto`: si la calle escrita pasa cerca de un punto.
   Si algo no carga, no hay sugerencias o no se completa la dirección, y el campo sigue como texto libre.
   Para otro proveedor (Google o Mapbox, que requieren clave y facturación), basta reemplazar `suggest`, `search` y
   `reverse` manteniendo lo que devuelven. */
(() => {
  const PICK = window.PICK;
  if (!PICK) return;
  const fold = PICK.fold;
  const SRC = `${window.SITE_ROOT || ''}assets/transporte/calles.json`;
  const COMUNAS = new Map(PICK.communesOf('Metropolitana').map((c) => [fold(c), c]));
  const MAX = 5;
  const APODOS = { alameda: "Avenida Libertador Bernardo O'Higgins" };

  /* «Av. Providencia» y «Avenida Providencia» son la misma calle: se compara sin el tipo de vía */
  const TIPO = /^(avenida|avda|av|calle|pasaje|psje|pje|camino|cno|autopista|carretera|ruta|paseo|callejon|diagonal)\s+(?=\S)/;
  const limpio = (s) => fold(s).replace(/[.,;]/g, ' ').replace(/\s+/g, ' ').trim();
  const nucleo = (s) => limpio(s).replace(TIPO, '');
  const CLASE = { av: 'avenida', avda: 'avenida', psje: 'pasaje', pje: 'pasaje', cno: 'camino' };
  const tipoDe = (s) => { const m = limpio(s).match(TIPO); return m ? CLASE[m[1]] || m[1] : ''; };

  /* «av providencia 1234 oficina 5» → calle «av providencia», número «1234», resto «oficina 5».
     Los números que son parte del nombre («11 de Septiembre», «5 de Abril») no cuentan como número de la dirección, y
     tampoco los que vienen después de la primera coma («Pasaje Tatiana, bodega 2»: eso es la referencia). */
  const partes = (texto) => {
    const t = texto.trim().replace(/\s+/g, ' ');
    const coma = t.indexOf(',');
    const cabeza = coma < 0 ? t : t.slice(0, coma);
    let cola = coma < 0 ? '' : t.slice(coma + 1).trim();
    const junta = (...x) => x.map((v) => v.replace(/^[\s,.;-]+|[\s,]+$/g, '')).filter(Boolean).join(', ');
    const re = /(\d{1,5})(?!\d)/g;
    let m;
    while ((m = re.exec(cabeza))) {
      const antes = cabeza.slice(0, m.index).trim();
      const despues = cabeza.slice(m.index + m[1].length);
      if (!/[a-záéíóúñ]{3,}/i.test(antes)) continue;      // aún no hay nombre de calle
      if (/^\s+de\s/i.test(despues)) continue;            // «11 de septiembre»
      return { calle: antes.replace(/[,\s]+$/, ''), numero: m[1], resto: junta(despues, cola) };
    }
    /* «Los Aromos, 123»: el número viene justo después de la coma */
    const tras = cola.match(/^(\d{1,5})(?!\d)\s*(.*)$/);
    if (tras && /[a-záéíóúñ]{3,}/i.test(cabeza)) return { calle: cabeza.trim(), numero: tras[1], resto: junta(tras[2]) };
    return { calle: cabeza.replace(/[,\s]+$/, ''), numero: '', resto: junta(cola) };
  };

  let indice = null;
  let nombres = [];  // comunas en el orden del archivo (el mismo de calles-puntos.json)
  const cargar = () => (indice ||= fetch(SRC)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`calles ${r.status}`))))
    .then((d) => {
      const comunas = d.comunas.map((c) => COMUNAS.get(fold(c)) || '');
      nombres = comunas;
      const calles = d.calles.map(([nombre, orden, idx], i) => { const k = nucleo(nombre); return { i, idx, nombre, orden, k, ks: k.split(' '), l: limpio(nombre), tipo: tipoDe(nombre), comunas: idx.map((j) => comunas[j]).filter(Boolean) }; });
      /* Nombres de uso común que el mapa no trae como nombre oficial */
      Object.entries(APODOS).forEach(([apodo, oficial]) => {
        const c = calles.find((x) => x.nombre === oficial);
        if (c) calles.push({ ...c, k: apodo, ks: apodo.split(' '), orden: -1 });
      });
      return calles;
    })
    .catch(() => { indice = null; return null; }));

  /* 0: el nombre empieza con lo escrito · 1: cada palabra escrita empieza una palabra del nombre, en orden · 2: lo contiene */
  const puntaje = ({ k, ks }, q, palabras) => {
    if (k.startsWith(q)) return 0;
    let i = 0;
    const enOrden = palabras.every((p) => { while (i < ks.length && !ks[i].startsWith(p)) i += 1; return i++ < ks.length; });
    if (enOrden) return 1;
    return q.length >= 5 && k.includes(q) ? 2 : -1;
  };

  /* Devuelve hasta 5 sugerencias: { label: «Avenida Providencia 1234», sub: «Providencia», value, calle, numero, comuna }.
     `comuna` es la elegida en el formulario (sus calles van primero). Una calle que cruza muchas comunas, sin comuna
     elegida, se sugiere una sola vez y no cambia la comuna. */
  const suggest = async (texto, { comuna = '' } = {}) => {
    let { calle, numero, resto } = partes(texto);
    /* La comuna escrita a continuación («pajaritos 3000, maipú») manda sobre la elegida y no se repite en la dirección */
    const escrita = COMUNAS.get(fold(resto));
    if (escrita) { comuna = escrita; resto = ''; }
    const q = nucleo(calle);
    if (q.length < 3) return [];
    const calles = await cargar();
    if (!calles) return [];
    const palabras = q.split(' ');
    const tipo = tipoDe(calle);  // si se escribió «pje» o «av», primero las vías de ese tipo
    const entera = limpio(calle);
    const filas = [];
    for (const c of calles) {
      const p = puntaje(c, q, palabras);
      if (p < 0) continue;
      const label = `${c.nombre}${numero ? ` ${numero}` : ''}`;
      const base = { label, calle: c.nombre, numero, fila: c.i, clase: c.orden, value: `${label}${resto ? `, ${resto}` : ''}` };
      /* Una avenida principal que calza por una palabra («kennedy» → Avenida Presidente Kennedy) va antes que un pasaje
         que empieza igual; el nombre escrito completo, con su tipo de vía («Pasaje Abate Molina»), va antes que todo */
      const peso = (tipo && c.l === entera ? -10 : 0) + p * 2 + c.orden + (tipo && c.tipo !== tipo ? 2 : 0);
      const lejos = comuna ? 100 : 0;  // con una comuna elegida, sus calles van antes que las del resto
      if (comuna && c.comunas.includes(comuna)) filas.push({ ...base, sub: comuna, comuna, orden: peso });
      else if (c.comunas.length > 3) filas.push({ ...base, sub: `En ${c.comunas.length} comunas`, comuna: '', orden: lejos + peso });
      else c.comunas.forEach((x, pos) => filas.push({ ...base, sub: x, comuna: x, orden: lejos + peso, pos }));  // primero la comuna donde la calle es más larga
    }
    return filas
      .sort((a, b) => a.orden - b.orden || a.clase - b.clase || a.calle.length - b.calle.length || a.calle.localeCompare(b.calle, 'es') || (a.pos || 0) - (b.pos || 0) || a.sub.localeCompare(b.sub, 'es'))
      .slice(0, MAX);
  };

  /* Dónde partir en el mapa (mapa.js): la calle escrita, en la comuna elegida si pasa por ella; si no, el centro de la
     comuna. Los puntos vienen de assets/transporte/calles-puntos.json, que solo se descarga al abrir el mapa. */
  let puntos = null;
  const cargarPuntos = () => (puntos ||= fetch(SRC.replace('calles.json', 'calles-puntos.json'))
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`puntos ${r.status}`))))
    .catch(() => { puntos = null; return null; }));
  const locate = async (texto, { comuna = '', preferida = '' } = {}) => {
    const [calles, p] = await Promise.all([cargar(), cargarPuntos()]);
    if (!calles || !p) return null;
    const real = (v, eje) => p.base[eje] + v / p.escala;
    comuna = preferida || comuna;  // la comuna de la sugerencia elegida manda sobre la del formulario
    const lista = String(texto || '').trim() ? await suggest(texto, { comuna }) : [];
    for (const s of lista) {
      const c = calles[s.fila];
      const par = p.puntos[s.fila] || [];
      /* Primero la comuna de la sugerencia, después la elegida y, si no, cualquiera por donde pase la calle */
      const orden = [s.comuna, comuna, ...c.idx.map((j) => nombres[j])].filter(Boolean);
      for (const nombre of orden) {
        const k = c.idx.findIndex((j) => nombres[j] === nombre);
        if (k >= 0 && par[2 * k] >= 0) return { lat: real(par[2 * k], 0), lng: real(par[2 * k + 1], 1), zoom: 16, nivel: 'calle', calle: c.nombre, comuna: nombre };
      }
    }
    const j = comuna ? nombres.indexOf(comuna) : -1;
    if (j >= 0 && p.comunas[j]?.[0] >= 0) return { lat: real(p.comunas[j][0], 0), lng: real(p.comunas[j][1], 1), zoom: 14, nivel: 'comuna', comuna };
    return null;
  };

  /* ---------- Dirección ↔ punto del mapa, con los datos del sitio ---------- */
  const DATOS = SRC.replace('calles.json', '');
  const MLAT = 111320;                                             // metros por grado de latitud
  const mlon = (lat) => MLAT * Math.cos((lat * Math.PI) / 180);    // metros por grado de longitud a esa latitud
  const EN_EL_LUGAR = 20;   // m: una dirección conocida a menos de esto del punto es «la de ese lugar»
  const EN_LA_CALLE = 7;    // m: el punto está sobre la calzada
  const CALLE_CERCA = 150;  // m: más lejos que esto de toda calle, no se escribe ninguna
  const slug = (c) => fold(c).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  /* Un número que empieza con cero («0123») es otra numeración: la de la calle al otro lado de su origen. En los datos
     va como negativo, que es como se ordena en la calle (… 0200, 0100, origen, 100, 200 …) */
  const aNumero = (texto) => (/^0\d/.test(texto) ? -Number(texto) : Number(texto));
  const deNumero = (n) => (n < 0 ? `0${-n}` : String(n));
  const pedir = (ruta) => fetch(`${DATOS}${ruta}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${ruta} ${r.status}`))));
  /* Los archivos guardan cada punto como la diferencia con el anterior, en enteros de 0,00001° */
  const linea = (a, base, escala) => {
    const out = new Float64Array(a.length);
    let y = 0;
    let x = 0;
    for (let i = 0; i < a.length; i += 2) {
      y += a[i];
      x += a[i + 1];
      out[i] = base[0] + y / escala;
      out[i + 1] = base[1] + x / escala;
    }
    return out;
  };

  /* En qué comuna cae un punto */
  let limites = null;
  const cargarLimites = () => (limites ||= pedir('comunas-limites.json')
    .then((d) => d.comunas.map(([nombre, anillos]) => {
      const rings = anillos.map((a) => linea(a, d.base, d.escala));
      const caja = [90, 180, -90, -180];
      rings.forEach((r) => {
        for (let i = 0; i < r.length; i += 2) {
          caja[0] = Math.min(caja[0], r[i]); caja[1] = Math.min(caja[1], r[i + 1]);
          caja[2] = Math.max(caja[2], r[i]); caja[3] = Math.max(caja[3], r[i + 1]);
        }
      });
      return { nombre: COMUNAS.get(fold(nombre)) || '', rings, caja };
    }))
    .catch(() => { limites = null; return null; }));
  const dentro = (r, lat, lng) => {
    let si = false;
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      if ((r[i] > lat) !== (r[j] > lat) && lng < ((r[j + 1] - r[i + 1]) * (lat - r[i])) / (r[j] - r[i]) + r[i + 1]) si = !si;
    }
    return si;
  };
  /* Comuna del punto: «» si queda fuera de todas, null si los límites no cargaron */
  const comunaEn = async ({ lat, lng }) => {
    const L = await cargarLimites();
    if (!L) return null;
    const c = L.find((x) => lat >= x.caja[0] && lat <= x.caja[2] && lng >= x.caja[1] && lng <= x.caja[3] && x.rings.some((r) => dentro(r, lat, lng)));
    return c ? c.nombre : '';
  };

  /* Calles de una comuna: cada una con sus tramos continuos; cada tramo, con su trazado y sus números conocidos */
  const porComuna = new Map();
  const datos = (comuna) => {
    if (!comuna) return Promise.resolve(null);
    if (!porComuna.has(comuna)) {
      porComuna.set(comuna, pedir(`direcciones/${slug(comuna)}.json`)
        .then((d) => {
          const calles = new Map();
          d.calles.forEach(([nombre, ...tramos]) => {
            const calle = { nombre, tramos: [] };
            calle.tramos = tramos.map(([lineas, nums]) => {
              const N = [];
              let n = 0;
              let y = 0;
              let x = 0;
              for (let i = 0; i < nums.length; i += 3) {
                n += nums[i];
                y += nums[i + 1];
                x += nums[i + 2];
                N.push([n, d.base[0] + y / d.escala, d.base[1] + x / d.escala]);
              }
              return { calle, lineas: lineas.map((a) => linea(a, d.base, d.escala)), nums: N };
            });
            calles.set(nombre, calle);
          });
          return { comuna, calles, malla: null };
        })
        .catch(() => { porComuna.delete(comuna); return null; }));
    }
    return porComuna.get(comuna);
  };

  /* Distancia en metros del punto al segmento (y1,x1)-(y2,x2), y en qué parte del segmento queda lo más cercano */
  const aSegmento = (lat, lng, k, y1, x1, y2, x2) => {
    const ax = (x1 - lng) * k;
    const ay = (y1 - lat) * MLAT;
    const dx = (x2 - x1) * k;
    const dy = (y2 - y1) * MLAT;
    const largo2 = dx * dx + dy * dy;
    const t = largo2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / largo2)) : 0;
    return { d: Math.hypot(ax + t * dx, ay + t * dy), t };
  };
  const metrosEntre = (a, b) => Math.hypot((a[1] - b[1]) * MLAT, (a[2] - b[2]) * mlon(a[1]));
  /* Lo más cercano de un tramo a un punto: { d, lat, lng } */
  const aTramo = (tramo, lat, lng) => {
    const k = mlon(lat);
    let mejor = null;
    tramo.lineas.forEach((l) => {
      for (let i = 0; i + 3 < l.length; i += 2) {
        const s = aSegmento(lat, lng, k, l[i], l[i + 1], l[i + 2], l[i + 3]);
        if (!mejor || s.d < mejor.d) mejor = { d: s.d, lat: l[i] + (l[i + 2] - l[i]) * s.t, lng: l[i + 1] + (l[i + 3] - l[i + 1]) * s.t };
      }
    });
    return mejor;
  };

  /* Cuadrícula de la comuna (celdas de unos 170 m) para encontrar rápido lo que rodea a un punto */
  const PASO = 0.0016;
  const celda = (lat, lng) => Math.floor((lat + 90) / PASO) * 300000 + Math.floor((lng + 180) / PASO);
  const malla = (D) => {
    if (D.malla) return D.malla;
    const vias = new Map();
    const dirs = new Map();
    const pon = (m, k, v) => { const l = m.get(k); if (l) l.push(v); else m.set(k, [v]); };
    D.calles.forEach((calle) => calle.tramos.forEach((tramo) => {
      tramo.lineas.forEach((l) => {
        for (let i = 0; i + 3 < l.length; i += 2) {
          const seg = [tramo, l[i], l[i + 1], l[i + 2], l[i + 3]];
          const y0 = Math.floor((Math.min(l[i], l[i + 2]) + 90) / PASO);
          const y1 = Math.floor((Math.max(l[i], l[i + 2]) + 90) / PASO);
          const x0 = Math.floor((Math.min(l[i + 1], l[i + 3]) + 180) / PASO);
          const x1 = Math.floor((Math.max(l[i + 1], l[i + 3]) + 180) / PASO);
          for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) pon(vias, y * 300000 + x, seg);
        }
      });
      tramo.nums.forEach((n) => pon(dirs, celda(n[1], n[2]), [tramo, n]));
    }));
    return (D.malla = { vias, dirs });
  };
  /* La calle y la dirección con número más cercanas al punto, dentro de sus radios: { via: { tramo, d }, dir: { tramo, n, d } } */
  const alrededor = (D, { lat, lng }) => {
    const M = malla(D);
    const k = mlon(lat);
    const dLat = CALLE_CERCA / MLAT;
    const dLng = CALLE_CERCA / k;
    const y0 = Math.floor((lat - dLat + 90) / PASO);
    const y1 = Math.floor((lat + dLat + 90) / PASO);
    const x0 = Math.floor((lng - dLng + 180) / PASO);
    const x1 = Math.floor((lng + dLng + 180) / PASO);
    let via = null;
    let dir = null;
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const key = y * 300000 + x;
        (M.vias.get(key) || []).forEach(([tramo, a, b, c, e]) => {
          const d = aSegmento(lat, lng, k, a, b, c, e).d;
          if (d <= CALLE_CERCA && (!via || d < via.d)) via = { tramo, d };
        });
        (M.dirs.get(key) || []).forEach(([tramo, n]) => {
          const d = Math.hypot((n[1] - lat) * MLAT, (n[2] - lng) * k);
          if (d <= EN_EL_LUGAR && (!dir || d < dir.d)) dir = { tramo, n: n[0], d };
        });
      }
    }
    return { via, dir };
  };

  /* Dónde queda el número `n` en un tramo: exacto si el mapa lo conoce; si no, entre sus vecinos (primero los del
     mismo lado de la calle: pares con pares) o junto al último número conocido. null si no hay cómo saberlo. */
  const enTramo = (tramo, n) => {
    const N = tramo.nums;
    const igual = N.find((x) => x[0] === n);
    if (igual) return { nivel: 'exacto', lat: igual[1], lng: igual[2] };
    for (const lista of [N.filter((x) => (x[0] - n) % 2 === 0), N]) {
      let a = null;
      let b = null;
      for (const x of lista) { if (x[0] < n) a = x; else { b = x; break; } }
      if (!a || !b) continue;
      const largo = metrosEntre(a, b);
      const paso = largo / (b[0] - a[0]);  // metros por número: en Chile ronda 1; muy distinto, la numeración no es continua
      if (paso > 6 || (paso < 0.15 && b[0] - a[0] > 40) || largo > 3000) continue;  // vecinos a más de 3 km no dicen dónde queda
      const f = (n - a[0]) / (b[0] - a[0]);
      const p = { lat: a[1] + (b[1] - a[1]) * f, lng: a[2] + (b[2] - a[2]) * f };
      const eje = aTramo(tramo, p.lat, p.lng);  // en una curva, el punto estimado se devuelve a la calle
      return { nivel: 'tramo', ...(eje && eje.d > 45 ? { lat: eje.lat, lng: eje.lng } : p), holgura: largo };
    }
    const cerca = N.reduce((m, x) => (Math.abs(x[0] - n) <= 60 && (!m || Math.abs(x[0] - n) < Math.abs(m[0] - n)) ? x : m), null);
    return cerca ? { nivel: 'tramo', lat: cerca[1], lng: cerca[2], holgura: 150 } : null;
  };

  /* Punto de una dirección con número: { lat, lng, zoom, nivel, calle, numero, comuna } o null.
     nivel 'exacto': el mapa conoce ese número. nivel 'tramo': estimado entre números vecinos (aproximado).
     nivel 'duda': esa dirección calza en más de un lugar; `varias` dice si son 'comunas' distintas o 'calles' con el
     mismo nombre dentro de la comuna.
     La comuna se toma de la sugerencia elegida (`preferida`) o de la del formulario si la calle pasa por ella; una
     calle que existe en muchas comunas no se busca sin saber cuál. */
  const search = async (texto, { comuna = '', preferida = '' } = {}) => {
    const { calle, numero } = partes(texto);
    if (!numero || nucleo(calle).length < 3) return null;
    const calles = await cargar();
    const s = (await suggest(texto, { comuna: preferida || comuna }))[0];
    if (!calles || !s) return null;
    const candidatas = calles[s.fila].comunas;
    const pista = [preferida, comuna].find((c) => c && candidatas.includes(c)) || (candidatas.length === 1 ? candidatas[0] : '');
    if (!pista && candidatas.length > 3) return null;
    const n = aNumero(numero);
    const halladas = (await Promise.all((pista ? [pista] : candidatas).map(async (c) => {
      const D = await datos(c);
      const tramos = D?.calles.get(s.calle)?.tramos || [];
      return tramos.map((t) => enTramo(t, n)).filter(Boolean).map((x) => ({ ...x, comuna: c }));
    }))).flat();
    const ver = (x, nivel) => ({ lat: x.lat, lng: x.lng, zoom: x.nivel === 'exacto' || x.holgura <= 120 ? 18 : x.holgura <= 400 ? 17 : 16, nivel, calle: s.calle, numero, comuna: x.comuna });
    for (const nivel of ['exacto', 'tramo']) {
      const de = halladas.filter((x) => x.nivel === nivel);
      if (de.length === 1) return ver(de[0], nivel);
      /* La misma dirección en más de un lugar: se muestra la primera (la comuna donde la calle es más larga), pero
         como duda: no queda marcada hasta que la persona la confirme o elija la comuna */
      if (de.length > 1) return { ...ver(de[0], 'duda'), varias: de.some((x) => x.comuna !== de[0].comuna) ? 'comunas' : 'calles' };
    }
    return null;
  };

  /* Dirección de un punto del mapa: { calle, numero, comuna } (cada uno puede venir vacío) o null si no hay datos.
     El número se entrega solo si hay una dirección conocida en ese lugar. Si el punto está sobre la calzada de otra
     calle (una esquina) y más cerca de ella que de esa dirección, vale la calle y no el edificio vecino. */
  const reverse = async (p) => {
    const comuna = await comunaEn(p);
    if (comuna === null) return null;
    const D = await datos(comuna);
    if (!D) return comuna ? { calle: '', numero: '', comuna } : null;
    const { via, dir } = alrededor(D, p);
    const enCalzada = via && via.d < EN_LA_CALLE && via.d < dir?.d && via.tramo.calle !== dir.tramo.calle;
    if (dir && !enCalzada) return { calle: dir.tramo.calle.nombre, numero: deNumero(dir.n), comuna };
    return { calle: via ? via.tramo.calle.nombre : '', numero: '', comuna };
  };

  /* ¿La calle escrita pasa a menos de `radio` metros del punto? true o false; null si no se puede saber (la calle
     no está en el índice o faltan datos). Sirve para no reemplazar una dirección escrita que calza con el punto. */
  const junto = async (texto, p, radio = 60) => {
    if (nucleo(partes(texto).calle).length < 3) return null;
    const comuna = await comunaEn(p);
    const D = await datos(comuna);
    if (!D) return null;
    const lista = await suggest(texto, { comuna });
    if (!lista.length) return null;
    return lista.some((s) => (D.calles.get(s.calle)?.tramos || []).some((t) => { const e = aTramo(t, p.lat, p.lng); return e && e.d <= radio; }));
  };

  /* Deja a mano los datos que el mapa va a necesitar (los límites y, si se sabe, la comuna) */
  const calentar = (comuna = '') => { cargarLimites(); if (comuna) datos(comuna); };

  window.GEO = { suggest, partes, nucleo, locate, search, reverse, junto, comunaEn, calentar, prepare: cargar, fuente: 'Calles: © colaboradores de OpenStreetMap' };
})();
