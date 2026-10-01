/* Sugerencias de direcciones reales mientras se escribe: calles de la Región Metropolitana, con su comuna.
   Fuente: OpenStreetMap (© colaboradores de OpenStreetMap, licencia ODbL). El índice es un archivo del propio sitio
   (assets/transporte/calles.json, generado con tools/calles.py), así que las sugerencias son inmediatas, no dependen de un
   servicio externo y lo que la persona escribe no sale de su navegador. Se descarga la primera vez que se abre la dirección.
   Si el archivo no carga, no hay sugerencias y el campo sigue funcionando como texto libre.
   Para usar un proveedor en línea (Google Places o Mapbox, que requieren clave y facturación), basta reemplazar `suggest()`
   manteniendo lo que devuelve. */
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
     Los números que son parte del nombre («11 de Septiembre», «5 de Abril») no cuentan como número de la dirección. */
  const partes = (texto) => {
    const t = texto.trim().replace(/\s+/g, ' ');
    const re = /(\d{1,5})(?!\d)/g;
    let m;
    while ((m = re.exec(t))) {
      const antes = t.slice(0, m.index).trim();
      const despues = t.slice(m.index + m[1].length);
      if (!/[a-záéíóúñ]{3,}/i.test(antes)) continue;      // aún no hay nombre de calle
      if (/^\s+de\s/i.test(despues)) continue;            // «11 de septiembre»
      return { calle: antes.replace(/[,\s]+$/, ''), numero: m[1], resto: despues.replace(/^[\s,.;-]+/, '') };
    }
    return { calle: t.replace(/[,\s]+$/, ''), numero: '', resto: '' };
  };

  let indice = null;
  let nombres = [];  // comunas en el orden del archivo (el mismo de calles-puntos.json)
  const cargar = () => (indice ||= fetch(SRC)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`calles ${r.status}`))))
    .then((d) => {
      const comunas = d.comunas.map((c) => COMUNAS.get(fold(c)) || '');
      nombres = comunas;
      const calles = d.calles.map(([nombre, orden, idx], i) => { const k = nucleo(nombre); return { i, idx, nombre, orden, k, ks: k.split(' '), tipo: tipoDe(nombre), comunas: idx.map((j) => comunas[j]).filter(Boolean) }; });
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
    const filas = [];
    for (const c of calles) {
      const p = puntaje(c, q, palabras);
      if (p < 0) continue;
      const label = `${c.nombre}${numero ? ` ${numero}` : ''}`;
      const base = { label, calle: c.nombre, numero, fila: c.i, value: `${label}${resto ? `, ${resto}` : ''}` };
      /* Una avenida principal que calza por una palabra («kennedy» → Avenida Presidente Kennedy) va antes que un pasaje que empieza igual */
      const peso = p * 2 + c.orden + (tipo && c.tipo !== tipo ? 2 : 0);
      const lejos = comuna ? 100 : 0;  // con una comuna elegida, sus calles van antes que las del resto
      if (comuna && c.comunas.includes(comuna)) filas.push({ ...base, sub: comuna, comuna, orden: peso });
      else if (c.comunas.length > 3) filas.push({ ...base, sub: `En ${c.comunas.length} comunas`, comuna: '', orden: lejos + peso });
      else c.comunas.forEach((x) => filas.push({ ...base, sub: x, comuna: x, orden: lejos + peso }));
    }
    return filas
      .sort((a, b) => a.orden - b.orden || a.calle.length - b.calle.length || a.calle.localeCompare(b.calle, 'es') || a.sub.localeCompare(b.sub, 'es'))
      .slice(0, MAX);
  };

  /* Dónde partir en el mapa (mapa.js): la calle escrita, en la comuna elegida si pasa por ella; si no, el centro de la
     comuna. Los puntos vienen de assets/transporte/calles-puntos.json, que solo se descarga al abrir el mapa. */
  let puntos = null;
  const cargarPuntos = () => (puntos ||= fetch(SRC.replace('calles.json', 'calles-puntos.json'))
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`puntos ${r.status}`))))
    .catch(() => { puntos = null; return null; }));
  const locate = async (texto, { comuna = '' } = {}) => {
    const [calles, p] = await Promise.all([cargar(), cargarPuntos()]);
    if (!calles || !p) return null;
    const real = (v, eje) => p.base[eje] + v / p.escala;
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

  window.GEO = { suggest, partes, nucleo, locate, prepare: cargar, fuente: 'Calles: © colaboradores de OpenStreetMap' };
})();
