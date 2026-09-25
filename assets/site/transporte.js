/* Transporte Autorizado: hero tipo app, buscador de transportistas y cotizador.
   El listado (2 MB) se carga solo cuando se abre el buscador o el cursor se acerca a esa opción. */
(() => {
  const d = document;
  const SITE = window.SITE;
  if (!SITE) return;
  const EASE = 'cubic-bezier(.22,1,.36,1)';
  const motion = SITE.motion;

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
  const THUMB = new Map([...CATEGORIES.safe, ...CATEGORIES.hazard].map(([name, file]) => [name, `assets/transporte/cat/residuo-${file}.webp`]));
  const GRID_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/></svg>';

  const el = (tag, props = {}, ...children) => {
    const node = Object.assign(d.createElement(tag), props);
    children.flat().forEach((c) => c != null && node.append(c));
    return node;
  };
  const svg = (path, stroke = 2) => {
    const s = d.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 16 16'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', stroke); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
    const p = d.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', path); s.append(p);
    return s;
  };

  /* Mosaico de categorías reutilizable (buscador y cotizador) */
  const tile = (name, value, img, checked, i) => {
    const media = img ? el('img', { src: img, alt: '', width: 96, height: 96, loading: 'lazy', decoding: 'async' }) : el('i', { className: 'all', innerHTML: GRID_ICON });
    const node = el('label', { className: 'tile is-new' },
      el('input', { type: 'radio', name, value, checked }),
      el('span', {}, media, el('em', { textContent: value === '*' ? 'Todos' : value })));
    node.style.setProperty('--i', Math.min(i, 10));
    return node;
  };
  const scrollers = new Set();
  const updateScroller = (wrap) => {
    const s = wrap.querySelector('.tiles');
    wrap.classList.toggle('has-prev', s.scrollLeft > 4);
    wrap.classList.toggle('has-next', s.scrollLeft + s.clientWidth < s.scrollWidth - 4);
  };
  const bindScroller = (wrap) => {
    if (scrollers.has(wrap)) return;
    scrollers.add(wrap);
    const s = wrap.querySelector('.tiles');
    s.addEventListener('scroll', () => updateScroller(wrap), { passive: true });
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-scroll]');
      if (b) s.scrollBy({ left: Number(b.dataset.scroll) * s.clientWidth * 0.8, behavior: motion.matches ? 'smooth' : 'auto' });
    });
    if ('ResizeObserver' in window) new ResizeObserver(() => updateScroller(wrap)).observe(s);
  };

  /* ---------- Hero tipo app ---------- */
  const app = d.querySelector('[data-app]');
  const home = app?.querySelector('[data-app-home]');
  const work = app?.querySelector('[data-app-work]');
  const appTitle = app?.querySelector('[data-app-title]');
  const views = app ? [...app.querySelectorAll('[data-view]')] : [];
  let active = null;
  let lastRoute = null;

  const appVisible = () => {
    const r = app.getBoundingClientRect();
    return r.top < innerHeight * 0.6 && r.bottom > 160;
  };
  const clearHash = () => history.replaceState(null, '', location.pathname + location.search);
  function showInApp(view, animate) {
    const change = () => {
      home.hidden = true;
      work.hidden = false;
      views.forEach((v) => { if (app.contains(v)) v.hidden = v !== view; });
      appTitle.textContent = view.dataset.viewTitle || '';
    };
    if (animate) {
      SITE.morph(app, change, 520);
      if (motion.matches) work.animate([{ opacity: 0, transform: 'translateY(12px) scale(.985)' }, { opacity: 1, transform: 'none' }], { duration: 460, easing: EASE });
    } else change();
    active = view;
    const r = app.getBoundingClientRect();
    if (animate && (r.top < 72 || r.top > innerHeight * 0.45)) {
      scrollTo({ top: scrollY + r.top - 88, behavior: motion.matches ? 'smooth' : 'auto' });
    }
    appTitle.focus({ preventScroll: true });
    history.replaceState(null, '', `#${view.id}`);
    view.dispatchEvent(new CustomEvent('view:show', { bubbles: true }));
    SITE.refreshDock?.();
  }
  function goHome(animate = true) {
    if (!active) return;
    const change = () => { work.hidden = true; home.hidden = false; };
    if (animate) {
      SITE.morph(app, change, 480);
      if (motion.matches) home.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: EASE });
    } else change();
    active = null;
    clearHash();
    if (animate) (lastRoute || home.querySelector('.route'))?.focus({ preventScroll: true });
  }
  if (app) {
    app.querySelector('[data-app-back]').addEventListener('click', () => goHome(true));
    app.addEventListener('click', (e) => { const r = e.target.closest('.route'); if (r) lastRoute = r; });
    SITE.presenter = (view, trigger) => {
      if (!views.includes(view)) return false;
      if (SITE.sheet.view === view) return true;
      if (trigger?.closest('.sheet')) return false;
      if (!trigger || trigger.closest('[data-app]') || appVisible()) { showInApp(view, Boolean(trigger)); return true; }
      return false;
    };
    /* Si la vista activa del hero se abre en la hoja, el hero vuelve a sus opciones */
    d.addEventListener('view:show', (e) => {
      if (e.target === active && !app.contains(e.target)) goHome(false);
    });
  }

  /* ---------- Buscador de transportistas ---------- */
  const root = d.querySelector('[data-finder]');
  if (root) {
    const DATA_URL = 'assets/transporte/transportistas-filtro-residuo.js';
    const PAGE = matchMedia('(max-width: 640px)').matches ? 4 : 6;
    const KIND_LABEL = { safe: 'No peligroso', hazard: 'Peligroso' };
    const grid = root.querySelector('[data-categories]');
    const wrap = grid.closest('.tiles-wrap');
    const commune = root.querySelector('#finder-commune');
    const count = root.querySelector('[data-count]');
    const list = root.querySelector('[data-results]');
    const more = root.querySelector('[data-more]');
    const state = { kind: 'safe', type: '*', place: '*', shown: PAGE };
    let rows = null;
    let loading = null;
    bindScroller(wrap);

    const normalize = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLocaleLowerCase('es-CL').replace(/[^a-z0-9]+/g, ' ').trim();
    const ALIASES = { 'p a cerda': 'pedro aguirre cerda', 'san bernarso': 'san bernardo', 'san vernardo': 'san bernardo', 'b uin': 'buin', 'c': '', 'sin comuna informada': '' };
    const LABELS = { 'pedro aguirre cerda': 'Pedro Aguirre Cerda', 'san bernardo': 'San Bernardo', 'til til': 'Til Til', 'calera de tango': 'Calera de Tango', 'isla de maipo': 'Isla de Maipo', 'penalolen': 'Peñalolén', 'alhue': 'Alhué', 'buin': 'Buin', '': 'Sin comuna informada' };
    const placeKey = (v) => { const k = normalize(v); return k in ALIASES ? ALIASES[k] : k; };
    const titleCase = (s) => s.toLocaleLowerCase('es-CL').replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('es-CL')).replace(/(?<=\s)(De|Del|La|Las|Los|Y)\b/g, (w) => w.toLowerCase());

    const renderCategories = () => {
      grid.replaceChildren(tile('finder-type', '*', null, state.type === '*', 0),
        ...CATEGORIES[state.kind].map(([name, file], i) => tile('finder-type', name, `assets/transporte/cat/residuo-${file}.webp`, state.type === name, i + 1)));
      grid.scrollLeft = 0;
      requestAnimationFrame(() => updateScroller(wrap));
    };

    const renderPlaces = () => {
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
    };

    const compact = (v) => {
      if (!v || v.length <= 60) return v;
      const parts = v.split(/\s*-\s*/).filter(Boolean);
      return parts.length > 1 ? `${parts[0]} y ${parts.length - 1} más` : `${v.slice(0, 58).trimEnd()}…`;
    };
    const message = (g) => {
      const r = g.first;
      return [
        '*Consulta de retiro — Transporte Autorizado*', '',
        `• Transportista del listado: ${r.company}`,
        `• Comuna del transportista: ${g.placeLabel}`,
        `• Tipo: ${KIND_LABEL[r.kind]}`,
        `• Residuo: ${state.type === '*' ? r.type : state.type}`,
        `• Resolución: ${r.resolution}`, '',
        'Quiero coordinar el retiro de este residuo. Adjuntaré la cantidad aproximada y fotografías.'
      ].join('\n');
    };
    const row = (g, i) => {
      const r = g.first;
      const type = state.type === '*' ? r.type : state.type;
      const src = THUMB.get(type);
      const li = el('li', { className: 'result is-new' },
        src ? el('img', { className: 'result-thumb', src, alt: '', width: 48, height: 48, loading: 'lazy', decoding: 'async' }) : el('span', { className: 'result-thumb' }),
        el('div', {},
          el('h3', { textContent: r.company }),
          el('p', { className: 'result-meta' },
            el('span', { className: `pill ${r.kind === 'hazard' ? 'is-hazard' : 'is-safe'}`, textContent: g.placeLabel }),
            el('span', { textContent: compact(r.resolution), title: r.resolution }))),
        el('p', { className: 'result-waste', textContent: r.summary, title: r.summary }),
        el('a', { className: 'btn btn-secondary btn-small', href: SITE.whatsapp(message(g)), target: '_blank', rel: 'noopener noreferrer' },
          'Consultar', svg('M5 11l6-6M6 5h5v5'), el('span', { className: 'sr-only', textContent: ` retiro con ${r.company} (abre WhatsApp)` })));
      li.style.setProperty('--i', Math.min(i, 8));
      return li;
    };

    let tick = 0;
    const setCount = (n, text) => {
      cancelAnimationFrame(tick);
      const b = el('b');
      count.replaceChildren(b, text);
      const from = Number(count.dataset.n || 0);
      count.dataset.n = n;
      if (!motion.matches || from === n) { b.textContent = n.toLocaleString('es-CL'); return; }
      const t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / 520);
        b.textContent = Math.round(from + (n - from) * (1 - (1 - k) ** 3)).toLocaleString('es-CL');
        if (k < 1) tick = requestAnimationFrame(step);
      };
      tick = requestAnimationFrame(step);
    };

    const groups = () => {
      const map = new Map();
      rows.forEach((r) => {
        if (r.kind !== state.kind) return;
        if (state.type !== '*' && r.type !== state.type) return;
        if (state.place !== '*' && r.place !== state.place) return;
        const key = `${normalize(r.company)}|${r.place}`;
        if (!map.has(key)) map.set(key, { first: r, placeLabel: LABELS[r.place] || titleCase(r.placeRaw || '') });
      });
      return [...map.values()].sort((a, b) => a.first.company.localeCompare(b.first.company, 'es', { sensitivity: 'base' }));
    };
    const typeText = () => (state.type === '*' ? `residuos ${KIND_LABEL[state.kind].toLowerCase()}s`
      : /^\p{Lu}{2}/u.test(state.type) ? state.type : state.type[0].toLowerCase() + state.type.slice(1));

    const renderResults = (append) => {
      const found = groups();
      const placeText = state.place === '*' ? 'todas las comunas' : commune.selectedOptions[0]?.textContent;
      if (found.length) setCount(found.length, ` ${found.length === 1 ? 'transportista' : 'transportistas'} · ${typeText()} · ${placeText}`);
      else { count.dataset.n = 0; count.textContent = 'No hay transportistas del listado para esa combinación.'; }
      if (!found.length) {
        const actions = el('div', { className: 'actions' });
        if (state.place !== '*') actions.append(el('button', { type: 'button', className: 'btn btn-secondary btn-small', textContent: 'Ver todas las comunas', onclick: () => { state.place = '*'; commune.value = '*'; update(); } }));
        if (state.type !== '*') actions.append(el('button', { type: 'button', className: 'btn btn-secondary btn-small', textContent: 'Ver todos los residuos', onclick: () => { state.type = '*'; renderCategories(); update(); } }));
        const quote = el('a', { className: 'btn btn-primary btn-small', href: '#cotizar', textContent: 'Cotizar el retiro' });
        quote.dataset.open = 'cotizar';
        actions.append(quote);
        list.replaceChildren(el('li', { className: 'results-empty' }, el('p', { textContent: 'Prueba ampliar la búsqueda o cotiza el retiro directamente con nosotros.' }), actions));
        more.hidden = true;
        return;
      }
      if (append) list.append(...found.slice(list.children.length, state.shown).map(row));
      else list.replaceChildren(...found.slice(0, state.shown).map(row));
      const left = found.length - state.shown;
      more.hidden = left <= 0;
      more.textContent = `Ver ${Math.min(left, PAGE)} más`;
    };
    const update = () => {
      state.shown = PAGE;
      renderPlaces();
      list.classList.add('is-updating');
      requestAnimationFrame(() => SITE.morph(list, () => { renderResults(); list.classList.remove('is-updating'); }, 360));
    };

    const load = () => {
      if (loading) return loading;
      loading = new Promise((resolve, reject) => {
        if (window.TRANSPORTISTAS_FILTRO_RESIDUO) { resolve(); return; }
        const s = d.createElement('script');
        s.src = DATA_URL; s.async = true; s.onload = resolve; s.onerror = reject;
        d.head.append(s);
      }).then(() => {
        const src = window.TRANSPORTISTAS_FILTRO_RESIDUO;
        rows = ['safe', 'hazard'].flatMap((kind) => (src[kind] || []).map((r) => ({
          kind,
          type: r[0] || 'Tipo no informado',
          placeRaw: r[1] || '',
          place: placeKey(r[1]),
          company: (r[2] || 'Empresa no informada').trim(),
          address: r[3] || 'No informada',
          summary: r[4] || 'No informado',
          resolution: r[5] || 'No informada'
        })));
        update();
      }).catch(() => {
        loading = null;
        count.textContent = 'No pudimos cargar el listado. Vuelve a intentarlo o cotiza el retiro directamente.';
      });
      return loading;
    };
    root.closest('[data-view]')?.addEventListener('view:show', () => { load(); requestAnimationFrame(() => updateScroller(wrap)); });
    d.querySelectorAll('[data-open="buscar"]').forEach((t) => {
      ['pointerenter', 'focus', 'touchstart'].forEach((ev) => t.addEventListener(ev, () => load(), { once: true, passive: true }));
    });

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
      SITE.morph(list, () => renderResults(true), 420);
      list.children[before]?.querySelector('a')?.focus({ preventScroll: true });
    });
    renderCategories();
  }

  /* ---------- Cotizador: categorías sugeridas según el tipo de residuo ---------- */
  const quote = d.getElementById('cotizacion');
  const quoteCats = quote?.querySelector('[data-quote-cats]');
  if (quoteCats) {
    const input = quote.querySelector('#f-residuo');
    const wrap = quoteCats.closest('.tiles-wrap');
    let chosen = '';
    const render = () => {
      const kind = quote.querySelector('[name="tipo"]:checked')?.value;
      const list = kind === 'no-peligroso' ? CATEGORIES.safe : kind === 'peligroso' ? CATEGORIES.hazard : [...CATEGORIES.safe, ...CATEGORIES.hazard];
      quoteCats.replaceChildren(...list.map(([name, file], i) => {
        const t = tile('q-categoria', name, `assets/transporte/cat/residuo-${file}.webp`, name === chosen, i);
        t.querySelector('img').width = 80; t.querySelector('img').height = 80;
        t.querySelector('input').dataset.skip = '';
        return t;
      }));
      quoteCats.scrollLeft = 0;
    };
    quote.addEventListener('change', (e) => {
      if (e.target.name === 'tipo') render();
      if (e.target.name === 'q-categoria') {
        const value = e.target.value;
        if (!input.value.trim() || input.value === chosen) {
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          if (motion.matches) input.animate([{ backgroundColor: 'color-mix(in srgb, var(--accent) 12%, var(--surface))' }, { backgroundColor: 'var(--surface)' }], { duration: 700, easing: EASE });
        }
        chosen = value;
      }
    });
    input.addEventListener('input', () => {
      if (input.value !== chosen) quoteCats.querySelectorAll('input:checked').forEach((r) => { r.checked = false; });
    });
    render();
    bindScroller(wrap);
  }

  /* ---------- Orientación: mensaje de WhatsApp con el caso ---------- */
  const help = d.querySelector('[data-help]');
  if (help) {
    const send = help.querySelector('[data-help-send]');
    send.addEventListener('click', () => {
      const topics = [...help.querySelectorAll('[name="tema"]:checked')].map((c) => c.value);
      const text = help.querySelector('#h-caso').value.trim();
      const place = help.querySelector('#h-comuna').value.trim();
      const lines = ['*Quiero hablar con un especialista*'];
      if (topics.length) lines.push('', `*Consulta:* ${topics.join('; ')}`);
      if (text) lines.push('', `*Mi caso:* ${text}`);
      if (place) lines.push('', `*Comuna:* ${place}`);
      send.href = SITE.whatsapp(lines.join('\n'));
    });
  }
})();
