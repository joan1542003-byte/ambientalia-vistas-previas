/* Transporte Autorizado: buscador de transportistas.
   Los datos (2 MB) se cargan solo cuando el buscador se acerca a la pantalla. */
(() => {
  const root = document.querySelector('[data-finder]');
  if (!root) return;

  const DATA_URL = 'assets/transporte/transportistas-filtro-residuo.js';
  const PAGE = matchMedia('(max-width: 640px)').matches ? 4 : 6;
  const CATEGORIES = {
    safe: [
      ['Aceites y grasas', 'np-aceites-grasas'], ['Construcción y demolición', 'np-construccion-demolicion'],
      ['Lodos y aguas', 'np-lodos-aguas'], ['Madera', 'np-madera'], ['Metales', 'np-metales'],
      ['Neumáticos y caucho', 'np-neumaticos-caucho'], ['Orgánicos y alimentos', 'np-organicos-alimentos'],
      ['Papel y cartón', 'np-papel-carton'], ['Plásticos', 'np-plasticos'], ['RAEE y electrónicos', 'np-raee-electronicos'],
      ['Textiles y cuero', 'np-textiles-cuero'], ['Vidrio', 'np-vidrio'], ['Otros residuos no peligrosos', 'np-otros-residuos']
    ],
    hazard: [
      ['Aceites e hidrocarburos', 'p-aceites-hidrocarburos'], ['Asbesto', 'p-asbesto'], ['Baterías y pilas', 'p-baterias-pilas'],
      ['Envases y materiales contaminados', 'p-envases-materiales-contaminados'], ['Gases y refrigerantes', 'p-gases-refrigerantes'],
      ['Lodos, aguas y suelos', 'p-lodos-aguas-suelos'], ['Metales y metales pesados', 'p-metales-pesados'],
      ['Químicos, solventes y pinturas', 'p-quimicos-solventes-pinturas'], ['RAEE, luminarias y mercurio', 'p-raee-luminarias-mercurio'],
      ['Residuos clínicos y farmacéuticos', 'p-residuos-clinicos-farmaceuticos']
    ]
  };
  const KIND_LABEL = { safe: 'No peligroso', hazard: 'Peligroso' };

  const grid = root.querySelector('[data-categories]');
  const commune = root.querySelector('#finder-commune');
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
    svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path'); path.setAttribute('d', 'M5 11l6-6M6 5h5v5'); svg.append(path);
    return svg;
  };

  /* Categorías como chips con miniatura */
  function renderCategories() {
    const all = el('label', { className: 'chip' },
      el('input', { type: 'radio', name: 'finder-type', value: '*', checked: state.type === '*' }),
      el('span', {}, el('i', { className: 'all', innerHTML: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/></svg>' }), 'Todos'));
    const chips = CATEGORIES[state.kind].map(([name, file]) => el('label', { className: 'chip' },
      el('input', { type: 'radio', name: 'finder-type', value: name, checked: state.type === name }),
      el('span', {}, el('img', { src: `assets/transporte/cat/residuo-${file}.webp`, alt: '', width: 28, height: 28, loading: 'lazy', decoding: 'async' }), name)));
    grid.replaceChildren(all, ...chips);
    grid.scrollLeft = 0;
  }

  /* Comunas disponibles para el tipo y la categoría elegidos */
  function renderPlaces() {
    const map = new Map();
    rows.forEach((r) => {
      if (r.kind !== state.kind || (state.type !== '*' && r.type !== state.type)) return;
      if (!map.has(r.place)) map.set(r.place, LABELS[r.place] || titleCase(r.placeRaw || ''));
    });
    const options = [...map].sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : a[1].localeCompare(b[1], 'es')));
    if (state.place !== '*' && !map.has(state.place)) state.place = '*';
    commune.replaceChildren(el('option', { value: '*', textContent: 'Todas las comunas' }),
      ...options.map(([value, label]) => el('option', { value, textContent: label, selected: value === state.place })));
    commune.disabled = false;
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
      const key = `${normalize(r.company)}|${r.place}`;
      if (!map.has(key)) map.set(key, { first: r, placeLabel: LABELS[r.place] || titleCase(r.placeRaw || '') });
    });
    return [...map.values()].sort((a, b) => a.first.company.localeCompare(b.first.company, 'es', { sensitivity: 'base' }));
  }
  function renderResults(append) {
    const found = groups();
    const typeText = state.type === '*' ? `residuos ${KIND_LABEL[state.kind].toLowerCase()}s` : (/^\p{Lu}{2}/u.test(state.type) ? state.type : state.type[0].toLowerCase() + state.type.slice(1));
    const placeText = state.place === '*' ? 'todas las comunas' : commune.selectedOptions[0]?.textContent;
    if (found.length) setCount(found.length, ` ${found.length === 1 ? 'transportista' : 'transportistas'} · ${typeText} · ${placeText}`);
    else { count.dataset.n = 0; count.textContent = 'No hay transportistas del listado para esa combinación.'; }
    if (!found.length) {
      const actions = el('div', { className: 'actions' });
      if (state.place !== '*') actions.append(el('button', { type: 'button', className: 'btn btn-secondary btn-small', textContent: 'Ver todas las comunas', onclick: () => { state.place = '*'; commune.value = '*'; update(); } }));
      if (state.type !== '*') actions.append(el('button', { type: 'button', className: 'btn btn-secondary btn-small', textContent: 'Ver todos los residuos', onclick: () => { state.type = '*'; renderCategories(); update(); } }));
      list.replaceChildren(el('li', { className: 'results-empty' }, el('p', { textContent: 'Prueba ampliar la búsqueda o cotiza el retiro directamente con nosotros.' }), actions));
      more.hidden = true;
      return;
    }
    if (append) list.append(...found.slice(list.children.length, state.shown).map((g, i) => row(g, i, true)));
    else list.replaceChildren(...found.slice(0, state.shown).map((g, i) => row(g, i, true)));
    const left = found.length - state.shown;
    more.hidden = left <= 0;
    more.textContent = `Ver ${Math.min(left, PAGE)} más`;
  }
  function update() {
    state.shown = PAGE; renderPlaces();
    list.classList.add('is-updating');
    requestAnimationFrame(() => { renderResults(); list.classList.remove('is-updating'); });
  }

  /* Carga de datos bajo demanda */
  function load() {
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      if (window.TRANSPORTISTAS_FILTRO_RESIDUO) return resolve();
      const s = document.createElement('script');
      s.src = DATA_URL; s.async = true; s.onload = resolve; s.onerror = reject;
      document.head.append(s);
    }).then(() => {
      const src = window.TRANSPORTISTAS_FILTRO_RESIDUO;
      rows = ['safe', 'hazard'].flatMap((kind) => (src[kind] || []).map((row) => ({
        kind,
        type: row[0] || 'Tipo no informado',
        placeRaw: row[1] || '',
        place: placeKey(row[1]),
        company: (row[2] || 'Empresa no informada').trim(),
        address: row[3] || 'No informada',
        summary: row[4] || 'No informado',
        resolution: row[5] || 'No informada',
        plates: row[6] || '',
        page: row[7] || '—'
      })));
      update();
    }).catch(() => {
      count.textContent = 'No pudimos cargar el listado. Recarga la página o cotiza el retiro directamente.';
    });
    return loading;
  }
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: '800px 0px' });
    io.observe(root);
  } else {
    load();
  }

  /* Eventos */
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'finder-kind') { state.kind = t.value; state.type = '*'; state.place = '*'; renderCategories(); }
    else if (t.name === 'finder-type') state.type = t.value;
    else if (t === commune) state.place = t.value;
    else return;
    if (rows) update(); else load();
  });
  more.addEventListener('click', () => {
    const before = state.shown;
    state.shown += PAGE;
    renderResults(true);
    list.children[before]?.querySelector('a')?.focus({ preventScroll: true });
  });

  renderCategories();
})();
