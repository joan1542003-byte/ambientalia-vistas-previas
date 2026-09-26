/* Transporte Autorizado: buscador de transportistas.
   El residuo y la comuna se eligen en ventanas de selección (seleccion.js), con el número de transportistas de cada opción.
   Los datos (listado compacto, 110 KB comprimido) se descargan en segundo plano cuando la página queda libre. */
(() => {
  const root = document.querySelector('[data-finder]');
  if (!root) return;

  /* Listado compacto (tools/compactar-transportistas.py): cada registro una vez y, por categoría, los registros que la atienden.
     Al regenerarlo, sube la versión para que el teléfono no use el anterior en caché */
  const DATA_URL = 'assets/transporte/transportistas.json?v=2025-12-31';
  const PAGE = matchMedia('(max-width: 640px)').matches ? 4 : 6;
  const CATEGORIES = window.PICK.CATEGORIES;
  const KIND_LABEL = { safe: 'No peligroso', hazard: 'Peligroso' };

  const residuoValue = root.querySelector('[data-finder-value="residuo"]');
  const comunaValue = root.querySelector('[data-finder-value="comuna"]');
  const count = root.querySelector('[data-count]');
  const list = root.querySelector('[data-results]');
  const more = root.querySelector('[data-more]');
  const state = { kind: 'safe', type: '*', place: '*', shown: PAGE };
  let rows = null;
  let loading = null;

  /* Normalización de comunas (mismos criterios que el buscador anterior) */
  const normalize = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('es-CL').replace(/[^a-z0-9]+/g, ' ').trim();
  const ALIASES = { 'p a cerda': 'pedro aguirre cerda', 'san bernarso': 'san bernardo', 'san vernardo': 'san bernardo', 'b uin': 'buin', 'c': '', 'sin comuna informada': '' };
  const LABELS = { 'pedro aguirre cerda': 'Pedro Aguirre Cerda', 'san bernardo': 'San Bernardo', 'til til': 'Til Til', 'calera de tango': 'Calera de Tango', 'isla de maipo': 'Isla de Maipo', 'penalolen': 'Peñalolén', 'alhue': 'Alhué', 'buin': 'Buin', '': 'Sin comuna informada' };
  const placeKey = (v) => { const k = normalize(v); return k in ALIASES ? ALIASES[k] : k; };
  const titleCase = (s) => s.toLocaleLowerCase('es-CL').replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('es-CL')).replace(/(?<=\s)(De|Del|La|Las|Los|Y)\b/g, (w) => w.toLowerCase());

  const el = (tag, props = {}, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    children.flat().forEach((c) => c != null && node.append(c));
    return node;
  };
  const arrowUpRight = () => {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('width', '16'); svg.setAttribute('height', '16'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path'); path.setAttribute('d', 'M5 11l6-6M6 5h5v5'); svg.append(path);
    return svg;
  };

  /* Etiquetas de los dos campos y opciones de cada ventana */
  const labels = new Map();
  const placeLabel = (key) => labels.get(key) || LABELS[key] || key;
  const kindText = (kind) => (kind === 'safe' ? 'no peligrosos' : 'peligrosos');
  function paint() {
    residuoValue.textContent = state.type === '*' ? `Todos los ${kindText(state.kind)}` : `${state.type} · ${KIND_LABEL[state.kind]}`;
    comunaValue.textContent = state.place === '*' ? 'Todas las comunas' : placeLabel(state.place);
  }
  /* Conteos por residuo, calculados una sola vez al cargar (cada transportista cuenta una vez por comuna) */
  const counts = new Map();
  const companies = (kind, type = '*') => counts.get(`${kind}|${type}`) || 0;
  const collator = new Intl.Collator('es', { sensitivity: 'base' });
  const plural = (n) => `${n.toLocaleString('es-CL')} ${n === 1 ? 'transportista' : 'transportistas'}`;
  function residueGroups() {
    const group = (kind, label) => ({
      label,
      count: CATEGORIES[kind].length,
      options: [
        { value: `${kind}|*`, label: `Todos los ${kindText(kind)}`, hint: plural(companies(kind)), icon: window.PICK.ICONS.grid },
        ...CATEGORIES[kind].map(([name, file]) => ({ value: `${kind}|${name}`, label: name, hint: plural(companies(kind, name)), img: window.PICK.thumb(file) }))
      ]
    });
    return [group('safe', 'No peligrosos'), group('hazard', 'Peligrosos')];
  }
  function placeOptions() {
    const map = new Map();
    rows.forEach((r) => {
      if (r.kind !== state.kind || (state.type !== '*' && r.type !== state.type)) return;
      if (!labels.has(r.place)) labels.set(r.place, LABELS[r.place] || titleCase(r.placeRaw || ''));
      if (!map.has(r.place)) map.set(r.place, new Set());
      map.get(r.place).add(r.companyKey);
    });
    const total = [...map.values()].reduce((n, set) => n + set.size, 0);
    const list = [...map].sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : collator.compare(placeLabel(a[0]), placeLabel(b[0]))));
    return [{ value: '*', label: 'Todas las comunas', hint: plural(total) }, ...list.map(([key, set]) => ({ value: key || '∅', label: placeLabel(key), hint: plural(set.size) }))];
  }

  /* Resultados */
  const compact = (v) => {
    if (!v || v.length <= 60) return v;
    const parts = v.split(/\s*-\s*/).filter(Boolean);
    return parts.length > 1 ? `${parts[0]} y ${parts.length - 1} más` : `${v.slice(0, 58).trimEnd()}…`;
  };
  function message(g) {
    const r = g.first;
    return [
      '*Consulta de retiro — Transporte Autorizado*', '',
      `• Transportista del listado: ${r.company}`,
      `• Comuna del transportista: ${g.placeLabel}`,
      `• Tipo: ${KIND_LABEL[r.kind]}`,
      `• Residuo: ${state.type === '*' ? r.type : state.type}`,
      `• Resolución: ${r.resolution}`,
      `• Ref. listado: pág. ${r.page}`, '',
      'Quiero coordinar el retiro de este residuo. Adjuntaré la cantidad aproximada y fotografías.'
    ].join('\n');
  }
  function row(g, i, fresh) {
    const r = g.first;
    const link = el('a', { className: 'btn btn-secondary btn-small', href: window.SITE.whatsapp(message(g)), target: '_blank', rel: 'noopener noreferrer' },
      'Consultar', arrowUpRight(), el('span', { className: 'sr-only', textContent: ` retiro con ${r.company} (abre WhatsApp)` }));
    const li = el('li', { className: fresh ? 'result is-new' : 'result' },
      el('div', {},
        el('h3', { textContent: r.company }),
        el('p', { className: 'result-meta' },
          el('span', { className: `pill ${r.kind === 'hazard' ? 'is-hazard' : 'is-safe'}`, textContent: g.placeLabel }),
          el('span', { textContent: compact(r.resolution), title: r.resolution }))),
      el('p', { className: 'result-waste', textContent: r.summary, title: r.summary }),
      link);
    li.style.setProperty('--i', Math.min(i, 8));
    return li;
  }
  /* Conteo con un breve avance numérico */
  let tick = 0;
  function setCount(n, text) {
    cancelAnimationFrame(tick);
    /* Con NumberFlow los dígitos giran hacia el nuevo valor; sin él, conteo simple */
    if (customElements.get('number-flow')) {
      let flow = count.querySelector('number-flow');
      if (!flow) { flow = document.createElement('number-flow'); flow.locales = 'es-CL'; }
      count.replaceChildren(flow, text);
      flow.update(n);
      count.dataset.n = n;
      return;
    }
    const b = el('b', { className: 'tnum' });
    count.replaceChildren(b, text);
    const from = Number(count.dataset.n || 0);
    count.dataset.n = n;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || from === n) { b.textContent = n.toLocaleString('es-CL'); return; }
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 450);
      b.textContent = Math.round(from + (n - from) * (1 - (1 - k) ** 3)).toLocaleString('es-CL');
      if (k < 1) tick = requestAnimationFrame(step);
    };
    tick = requestAnimationFrame(step);
  }
  function groups() {
    const map = new Map();
    rows.forEach((r) => {
      if (r.kind !== state.kind) return;
      if (state.type !== '*' && r.type !== state.type) return;
      if (state.place !== '*' && r.place !== state.place) return;
      if (!map.has(r.key)) map.set(r.key, { first: r, placeLabel: LABELS[r.place] || titleCase(r.placeRaw || '') });
    });
    return [...map.values()].sort((a, b) => collator.compare(a.first.company, b.first.company));
  }
  function renderResults(append) {
    const found = groups();
    const typeText = state.type === '*' ? `residuos ${KIND_LABEL[state.kind].toLowerCase()}s` : (/^\p{Lu}{2}/u.test(state.type) ? state.type : state.type[0].toLowerCase() + state.type.slice(1));
    const placeText = state.place === '*' ? 'todas las comunas' : placeLabel(state.place);
    if (found.length) setCount(found.length, ` ${found.length === 1 ? 'transportista' : 'transportistas'} · ${typeText} · ${placeText}`);
    else { count.dataset.n = 0; count.textContent = 'No hay transportistas del listado para esa combinación.'; }
    if (!found.length) {
      const actions = el('div', { className: 'actions' });
      if (state.place !== '*') actions.append(el('button', { type: 'button', className: 'btn btn-secondary btn-small', textContent: 'Ver todas las comunas', onclick: () => { state.place = '*'; paint(); update(); } }));
      if (state.type !== '*') actions.append(el('button', { type: 'button', className: 'btn btn-secondary btn-small', textContent: 'Ver todos los residuos', onclick: () => { state.type = '*'; paint(); update(); } }));
      list.replaceChildren(el('li', { className: 'results-empty' }, el('p', { textContent: 'Prueba ampliar la búsqueda o cotiza el retiro directamente con nosotros.' }), actions));
      more.hidden = true;
      return;
    }
    /* Las filas entran con un fundido solo si el buscador está a la vista; si se prepararon ocultas (carga en segundo plano),
       aparecen ya puestas al abrirlo */
    const fresh = list.getClientRects().length > 0;
    if (append) list.append(...found.slice(list.children.length, state.shown).map((g, i) => row(g, i, fresh)));
    else list.replaceChildren(...found.slice(0, state.shown).map((g, i) => row(g, i, fresh)));
    const left = found.length - state.shown;
    more.hidden = left <= 0;
    more.textContent = `Ver ${Math.min(left, PAGE)} más`;
  }
  /* Cambio de filtro: la lista se atenúa, se reemplaza y vuelve a aparecer (sin superponer filas) */
  let fade = 0;
  function update() {
    state.shown = PAGE;
    clearTimeout(fade);
    list.classList.add('is-updating');
    fade = setTimeout(() => {
      renderResults();
      list.closest('[data-scroll-root]')?.scrollTo({ top: 0 });
      requestAnimationFrame(() => list.classList.remove('is-updating'));
    }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 140);
  }

  /* Carga de datos: el listado compacto se descarga en segundo plano apenas la página queda libre (ver abajo),
     así el buscador y sus ventanas abren al instante. Claves y conteos se calculan aquí una sola vez */
  function load() {
    if (loading) return loading;
    loading = fetch(DATA_URL).then((res) => {
      if (!res.ok) throw new Error(res.status);
      return res.json();
    }).then((src) => {
      /* Cada registro se prepara una vez (2 mil) y las filas por categoría lo reutilizan (10 mil) */
      const base = src.records.map((rec) => {
        const company = (rec[1] || 'Empresa no informada').trim();
        const place = placeKey(rec[0]);
        const companyKey = normalize(company);
        return {
          placeRaw: rec[0] || '', place, company, companyKey, key: `${companyKey}|${place}`,
          address: rec[2] || 'No informada', summary: rec[3] || 'No informado', resolution: rec[4] || 'No informada', plates: rec[5] || '', page: rec[6] || '—'
        };
      });
      const seen = new Map();
      rows = [];
      ['safe', 'hazard'].forEach((kind) => (src[kind] || []).forEach(([type, ids]) => ids.forEach((i) => {
        const row = { kind, type: type || 'Tipo no informado', ...base[i] };
        rows.push(row);
        [`${kind}|*`, `${kind}|${row.type}`].forEach((k) => {
          if (!seen.has(k)) seen.set(k, new Set());
          seen.get(k).add(row.key);
        });
      })));
      seen.forEach((set, k) => counts.set(k, set.size));
      update();
    }).catch(() => {
      loading = null;
      count.textContent = 'No pudimos cargar el listado. Recarga la página o cotiza el retiro directamente.';
    });
    return loading;
  }
  window.FINDER_LOAD = load;
  /* Descarga en segundo plano cuando la página queda libre (110 KB comprimidos; no con «ahorro de datos»).
     Si alguien abre el buscador antes, se carga en ese momento */
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
  /* También las imágenes de las categorías (23, ~9 KB c/u): así las ventanas de residuo abren completas, sin imágenes que aparecen después */
  const warm = [];  // se guardan para que el navegador conserve las imágenes ya decodificadas
  const warmImages = () => [...window.PICK.CATEGORIES.safe, ...window.PICK.CATEGORIES.hazard].forEach(([, file]) => {
    const img = new Image();
    img.src = window.PICK.thumb(file);
    img.decode?.().catch(() => {});
    warm.push(img);
  });
  const prefetch = () => { if (!navigator.connection?.saveData) idle(() => { load(); warmImages(); }, { timeout: 4000 }); };
  if (document.readyState === 'complete') prefetch(); else addEventListener('load', prefetch, { once: true });

  /* Eventos */
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-finder-pick]');
    if (!b || !window.Picker) return;
    await load();
    if (!rows) return;
    if (b.dataset.finderPick === 'residuo') {
      const v = await window.Picker.choose({ title: '¿Qué residuo necesitas retirar?', sub: 'Las imágenes son ilustrativas y no determinan la clasificación.', groups: residueGroups(), value: `${state.kind}|${state.type}`, search: 'Buscar residuo', layout: 'tiles', tabs: true });
      if (!v) return;
      const [kind, type] = v.split('|');
      state.kind = kind;
      state.type = type;
      if (!placeOptions().some((o) => o.value === (state.place || '∅'))) state.place = '*';
    } else {
      const [all, ...places] = placeOptions();
      const v = await window.Picker.choose({ title: 'Comuna del transportista', sub: 'Solo aparecen comunas con transportistas para el residuo elegido.', groups: [{ options: [all], layout: 'list' }, { label: `${places.length} comunas`, options: places, layout: 'grid' }], value: state.place === '' ? '∅' : state.place, search: 'Buscar comuna' });
      if (v === undefined || v === null) return;
      state.place = v === '∅' ? '' : v;
    }
    paint();
    update();
  });
  more.addEventListener('click', () => {
    const before = state.shown;
    state.shown += PAGE;
    renderResults(true);
    list.children[before]?.querySelector('a')?.focus({ preventScroll: true });
  });

  /* El chat del hero puede abrir el buscador ya filtrado: FINDER.set({ tipo: 'peligroso', categoria, comuna }) */
  window.FINDER = {
    set: async ({ tipo, categoria, comuna } = {}) => {
      await load();
      if (!rows) return;
      if (tipo) { state.kind = tipo === 'peligroso' ? 'hazard' : 'safe'; state.type = '*'; }
      if (categoria && CATEGORIES[state.kind].some(([n]) => n === categoria)) state.type = categoria;
      state.place = '*';
      if (comuna) {
        const key = placeKey(comuna);
        if (placeOptions().some((o) => o.value === key)) state.place = key;
      }
      paint();
      update();
    }
  };
  paint();
})();
