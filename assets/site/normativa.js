/* Transporte Autorizado: biblioteca de documentos y normativa, y publicaciones recientes de LinkedIn con su norma relacionada.
   Datos: assets/transporte/normativa.json (tools/normativa.py, texto oficial de Ley Chile) y assets/transporte/linkedin.json
   (tools/linkedin.mjs, lo actualiza GitHub Actions con la API de LinkedIn). Las tarjetas de la biblioteca ya vienen en el HTML
   (para buscadores); este script agrega búsqueda, filtros, vista previa y el carrusel de publicaciones. */
(() => {
  const d = document;
  const lib = d.querySelector('[data-lib]');
  const postsRoot = d.querySelector('[data-posts]');
  if (!lib && !postsRoot) return;
  const motion = matchMedia('(prefers-reduced-motion: no-preference)');
  const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const svg = (p, w = 20, vb = 24) => `<svg width="${w}" height="${w}" viewBox="0 0 ${vb} ${vb}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const ICON = {
    eye: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
    pdf: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
    doc: svg('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>'),
    out: svg('<path d="M5 11l6-6M6 5h5v5"/>', 16, 16),
    list: svg('<path d="M4 6h16M7 12h10M10 18h4"/>'),
    li: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z"/></svg>'
  };
  /* Ícono de cada tema (el mismo mapa está en tools/normativa.py) */
  const TEMA_ICON = {
    peligrosos: '<path d="M12 3.5l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
    transporte: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.7"/><circle cx="17" cy="17.5" r="1.7"/>',
    rep: '<path d="M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6"/><path d="M18 3v4h-4M6 21v-4h4"/>',
    almacenamiento: '<path d="M3 9.5l9-5 9 5V20H3z"/><path d="M8 20v-6h8v6"/>',
    sustancias: '<path d="M9 3h6M10 3v6l-5.2 9.2A1 1 0 0 0 5.7 20h12.6a1 1 0 0 0 .9-1.8L14 9V3"/><path d="M7.5 15h9"/>',
    salud: '<path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z"/>',
    trabajo: '<path d="M4 17h16M6 17a6 6 0 0 1 12 0M10 11.3V7.5h4v3.8"/>',
    registro: '<path d="M8 3.5h8v3H8z"/><path d="M6 5H5v15.5h14V5h-1M9 17v-3M12 17v-6M15 17v-4"/>',
    marco: '<path d="M5 19c0-8 6-14 14-14 0 8-6 14-14 14z"/><path d="M5 19l7-7"/>'
  };
  const temaIcon = (t) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TEMA_ICON[t] || TEMA_ICON.marco}</svg>`;
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const fecha = (iso) => { const [y, m, dd] = String(iso).split('-').map(Number); return `${dd} de ${MESES[m - 1]} de ${y}`; };

  /* ---------- Datos de normativa (compartidos por la biblioteca y las publicaciones) ---------- */
  const src = lib?.dataset.src || 'assets/transporte/normativa.json';
  let normasPromise = null;
  const normas = () => (normasPromise ||= fetch(src).then((r) => r.json()).catch(() => null));
  /* Norma relacionada con un texto: puntaje por número (3), sigla o tema propio (2) y tema compartido (1) */
  const related = (text, list) => {
    const t = fold(text);
    let best = null;
    let score = 0;
    list.forEach((n) => {
      const s = (n.alias || []).reduce((acc, [re, w]) => { try { return acc + (new RegExp(re, 'i').test(t) ? w : 0); } catch { return acc; } }, 0);
      if (s > score) { score = s; best = n; }
    });
    return best;
  };

  /* ---------- Vista previa de una norma ---------- */
  const preview = (n, data) => {
    if (!window.Picker?.content) { location.href = n.pagina; return; }
    const html = `<div class="doc-preview" data-tema="${n.temas[0]}">
      <div class="doc-preview-top"><span class="doc-icon">${temaIcon(n.temas[0])}</span><div><strong>${esc(n.tema)}</strong><small>${n.articulos} artículos · ${n.vigente ? 'vigente' : 'derogada'}</small></div></div>
      <dl>
        <div><dt>Organismo</dt><dd>${esc(n.organismo)}</dd></div>
        <div><dt>Promulgación</dt><dd>${fecha(n.promulgacion)}</dd></div>
        <div><dt>Publicación</dt><dd>${fecha(n.publicacion)}</dd></div>
        <div><dt>Versión del texto</dt><dd>${fecha(n.version)}</dd></div>
      </dl>
      <section><h3>Por qué importa para el retiro</h3><p>${esc(n.rel)}</p></section>
      <section><h3>Objeto de la norma</h3><blockquote>${esc(n.objeto)}</blockquote></section>
      ${n.indice?.length ? `<section><h3>Contenido (${n.articulos} artículos)</h3><ol>${n.indice.slice(0, 14).map((t) => `<li>${esc(t)}</li>`).join('')}</ol></section>` : ''}
      <p class="doc-source">Fuente: Ley Chile, Biblioteca del Congreso Nacional. Consultada el ${fecha(data?.consulta || n.consulta)}.</p>
    </div>`;
    const links = `<a class="btn btn-ink btn-small" href="${esc(n.pagina)}">${ICON.doc}Leer completa</a>`
      + `<a class="btn btn-secondary btn-small" href="${esc(n.pdf)}" download data-doc-pdf>${ICON.pdf}<span>PDF</span></a>`
      + `<a class="btn btn-quiet btn-small" href="${esc(n.fuente)}" target="_blank" rel="noopener noreferrer">Ley Chile${ICON.out}<span class="sr-only"> (pestaña nueva)</span></a>`;
    window.Picker.content({ title: `${n.corto} · ${n.tema}`, sub: `${n.tipo} del ${n.organismo}`, html, links });
  };

  /* Descarga: confirmación breve en el botón y un aviso */
  d.addEventListener('click', (e) => {
    const a = e.target.closest('[data-doc-pdf]');
    if (!a) return;
    a.classList.add('is-downloading');
    const label = a.querySelector('span');
    const before = label?.textContent;
    if (label) label.textContent = 'Descargando';
    window.SITE?.toast?.('Descargando el PDF de la norma');
    setTimeout(() => { a.classList.remove('is-downloading'); if (label) label.textContent = before; }, 1800);
  });

  /* ---------- Biblioteca ---------- */
  if (lib) {
    const list = lib.querySelector('[data-lib-list]');
    const input = lib.querySelector('[data-lib-q]');
    const search = lib.querySelector('.lib-search');
    const count = lib.querySelector('[data-lib-count]');
    const empty = lib.querySelector('[data-lib-empty]');
    const resets = lib.querySelectorAll('[data-lib-reset]');
    const st = { q: '', tema: '*', org: '*' };
    let data = null;
    let drawn = false;

    const mark = (text, terms) => {
      let out = esc(text);
      terms.filter((t) => t.length > 1).forEach((t) => {
        const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        out = out.replace(/(^|>)([^<]*)/g, (m, a, b) => a + b.replace(re, '<mark>$1</mark>'));
      });
      return out;
    };
    const terms = () => st.q.trim().split(/\s+/).filter(Boolean);
    const card = (n, i, fresh) => {
      const tt = terms();
      const t = n.temas[0];
      return `<li class="doc${fresh ? ' is-new' : ''}" data-slug="${n.slug}" data-tema="${t}" style="--i:${Math.min(i, 8)}">`
        + `<div class="doc-top"><span class="doc-icon">${temaIcon(t)}</span><p class="doc-kind">${esc(n.tipo)} · ${esc(n.organismo)}</p></div>`
        + `<h3><a href="${esc(n.pagina)}" data-doc-open>${mark(n.corto, tt)}</a></h3>`
        + `<p class="doc-topic">${mark(n.tema, tt)}</p>`
        + `<p class="doc-rel">${mark(n.rel, tt)}</p>`
        + `<div class="doc-foot"><span class="doc-meta"><span class="doc-state${n.vigente ? '' : ' is-off'}">${n.vigente ? 'Vigente' : 'Derogada'}</span> · ${n.articulos} artículos</span>`
        + `<div class="doc-actions"><button class="btn btn-ink btn-small" type="button" data-doc-view>${ICON.eye}Ver</button>`
        + `<a class="btn btn-quiet btn-small" href="${esc(n.pdf)}" download data-doc-pdf aria-label="Descargar PDF de ${esc(n.corto)}">${ICON.pdf}<span>PDF</span></a></div></div></li>`;
    };
    const matches = (n) => {
      if (st.tema !== '*' && !n.temas.includes(st.tema)) return false;
      if (st.org !== '*' && n.organismo !== st.org) return false;
      const q = fold(st.q).trim();
      if (!q) return true;
      const hay = fold([n.corto, n.numero, n.tipo, n.tema, n.titulo, n.rel, n.organismo, ...n.temas.map((t) => data.temas[t])].join(' '));
      /* Cada palabra debe aparecer al comienzo de una palabra; las de hasta tres letras, completas («rep» no encuentra «reportes») */
      const word = (t) => new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${t.length <= 3 ? '($|[^a-z0-9])' : ''}`).test(hay);  // siglas cortas: palabra completa
      if (q.split(/\s+/).every((t) => word(t.replace(/^(ds|d\.s\.?)$/, 'd.s')))) return true;
      return (n.alias || []).some(([re, w]) => { try { return w >= 2 && new RegExp(re, 'i').test(q); } catch { return false; } });
    };
    const setCount = (n) => {
      const text = ` ${n === 1 ? 'norma' : 'normas'}${st.tema !== '*' ? ` · ${data.temas[st.tema]}` : ''}${st.org !== '*' ? ` · ${st.org}` : ''}`;
      if (customElements.get('number-flow')) {
        let flow = count.querySelector('number-flow');
        if (!flow) { flow = d.createElement('number-flow'); flow.locales = 'es-CL'; }
        const rest = d.createTextNode(text);
        count.replaceChildren(flow, rest);
        flow.update ? flow.update(n) : (flow.value = n);
      } else count.textContent = `${n}${text}`;
    };
    let fadeTimer = 0;
    const render = (animate = true) => {
      if (!data) return;
      const found = data.normas.filter(matches);
      setCount(found.length);
      const active = st.q.trim() || st.tema !== '*' || st.org !== '*';
      resets.forEach((b) => { if (b.closest('.lib-bar')) b.hidden = !active; });
      search.classList.toggle('has-text', Boolean(st.q));
      clearTimeout(fadeTimer);
      const swap = () => {
        list.innerHTML = found.map((n, i) => card(n, i, animate && motion.matches)).join('');
        list.hidden = !found.length;
        empty.hidden = Boolean(found.length);
        list.classList.remove('is-updating');
        drawn = true;
      };
      if (animate && motion.matches) { list.classList.add('is-updating'); fadeTimer = setTimeout(swap, 140); } else swap();
    };
    const paint = () => {
      lib.querySelector('[data-lib-value="tema"]').textContent = st.tema === '*' ? 'Todos' : data.temas[st.tema];
      lib.querySelector('[data-lib-value="organismo"]').textContent = st.org === '*' ? 'Todos' : st.org;
    };

    normas().then((json) => {
      if (!json) return;
      data = json;
      setCount(data.normas.length);
    });

    /* Atajo de teclado: «/» lleva a la búsqueda (como en muchos buscadores) */
    d.addEventListener('keydown', (e) => {
      if (e.key !== '/' || e.target.closest('input, textarea, select, [contenteditable]') || d.querySelector('dialog[open]')) return;
      const r = lib.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return;
      e.preventDefault();
      input.focus();
    });
    let typing = 0;
    input.addEventListener('input', () => {
      st.q = input.value;
      search.classList.toggle('has-text', Boolean(st.q));
      clearTimeout(typing);
      typing = setTimeout(() => render(), 160);
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape' && input.value) { e.preventDefault(); input.value = ''; st.q = ''; render(); } });
    lib.querySelector('[data-lib-clear]').addEventListener('click', () => { input.value = ''; st.q = ''; render(); input.focus(); });
    resets.forEach((b) => b.addEventListener('click', () => { input.value = ''; Object.assign(st, { q: '', tema: '*', org: '*' }); paint(); render(); }));

    lib.addEventListener('click', async (e) => {
      const pick = e.target.closest('[data-lib-pick]');
      if (pick && window.Picker) {
        if (!data) return;
        const base = data.normas.filter((n) => (pick.dataset.libPick === 'tema' ? (st.org === '*' || n.organismo === st.org) : (st.tema === '*' || n.temas.includes(st.tema))));
        const plural = (k) => `${k} ${k === 1 ? 'norma' : 'normas'}`;
        if (pick.dataset.libPick === 'tema') {
          const opts = Object.entries(data.temas).map(([k, label]) => ({ value: k, label, hint: plural(base.filter((n) => n.temas.includes(k)).length) })).filter((o) => !o.hint.startsWith('0 '));
          const v = await window.Picker.choose({ title: 'Tema', groups: [{ options: [{ value: '*', label: 'Todos los temas', hint: plural(base.length) }, ...opts] }], value: st.tema, layout: 'list' });
          if (v === undefined || v === null) return;
          st.tema = v;
        } else {
          const orgs = [...new Set(data.normas.map((n) => n.organismo))].sort((a, b) => a.localeCompare(b, 'es'));
          const opts = orgs.map((o) => ({ value: o, label: o, hint: plural(base.filter((n) => n.organismo === o).length) })).filter((o) => !o.hint.startsWith('0 '));
          const v = await window.Picker.choose({ title: 'Organismo', groups: [{ options: [{ value: '*', label: 'Todos los organismos', hint: plural(base.length) }, ...opts] }], value: st.org, layout: 'list' });
          if (v === undefined || v === null) return;
          st.org = v;
        }
        paint();
        render();
        return;
      }
      const open = e.target.closest('[data-doc-view], [data-doc-open]');
      if (!open) return;
      e.preventDefault();
      const json = data || await normas();
      const n = json?.normas.find((x) => x.slug === open.closest('[data-slug]')?.dataset.slug);
      if (n) preview(n, json); else location.href = open.closest('[data-slug]')?.querySelector('a')?.href;
    });
    void drawn;
  }

  /* ---------- Publicaciones de LinkedIn ---------- */
  if (postsRoot) {
    const track = postsRoot.querySelector('[data-posts-track]');
    const dots = postsRoot.querySelector('[data-posts-dots]');
    const nav = d.querySelector('[data-posts-nav]');
    const company = postsRoot.dataset.company;
    const rel = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
    const when = (iso) => {
      const t = new Date(iso);
      const days = Math.round((t - Date.now()) / 864e5);
      if (Math.abs(days) < 1) return 'hoy';
      if (Math.abs(days) < 30) return rel.format(days, 'day');
      return t.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: t.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
    };
    const initials = (name) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    const empty = (org) => `<li class="posts-empty" style="grid-column: 1 / -1"><span class="post-avatar">${esc(initials(org.nombre))}</span>`
      + `<p><strong>Pronto verás aquí las publicaciones de ${esc(org.nombre)}.</strong>Cada una con la norma relacionada para leerla o descargarla.</p>`
      + `<a class="btn btn-secondary btn-small" href="${esc(org.url || company)}" target="_blank" rel="noopener noreferrer">${ICON.li}Seguir en LinkedIn<span class="sr-only"> (pestaña nueva)</span></a></li>`;
    const post = (p, org, n, i) => `<li class="post" style="--i:${Math.min(i, 6)}">
        <div class="post-by">
          <span class="post-avatar">${org.logo ? `<img src="${esc(org.logo)}" alt="" width="40" height="40" loading="lazy">` : esc(initials(org.nombre))}</span>
          <div><strong>${esc(org.nombre)}</strong><small><time datetime="${esc(p.fecha)}">${when(p.fecha)}</time></small></div>
          <a class="post-in" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" aria-label="Ver la publicación en LinkedIn (pestaña nueva)">${ICON.li}</a>
        </div>
        ${p.imagen ? `<div class="post-media"><img src="${esc(p.imagen)}" alt="" loading="lazy" decoding="async"></div>` : ''}
        <p class="post-text">${esc(p.texto)}</p>
        ${n ? `<div class="post-norm" data-slug="${n.slug}" data-tema="${n.temas[0]}">
          <span class="post-norm-icon doc-icon" aria-hidden="true">${temaIcon(n.temas[0])}</span>
          <small>Norma relacionada</small>
          <strong>${esc(n.corto)} · ${esc(n.tema)}</strong>
          <div class="doc-actions"><button class="btn btn-ink btn-small" type="button" data-doc-view>${ICON.eye}Ver</button><a class="btn btn-quiet btn-small" href="${esc(n.pdf)}" download data-doc-pdf>${ICON.pdf}<span>PDF</span></a></div>
        </div>` : ''}
        <div class="post-foot"><a class="link" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Ver en LinkedIn ${ICON.out}<span class="sr-only"> (pestaña nueva)</span></a></div>
      </li>`;

    Promise.all([fetch(postsRoot.dataset.src, { cache: 'no-cache' }).then((r) => r.json()).catch(() => null), normas()]).then(([feed, norms]) => {
      const org = feed?.organizacion || { nombre: 'Vínculo Verde', url: company };
      const items = (feed?.posts || []).slice(0, 10);
      if (!items.length) { track.innerHTML = empty(org); return; }
      const list = norms?.normas || [];
      track.innerHTML = items.map((p, i) => post(p, org, list.find((n) => n.slug === (p.normas || [])[0]) || related(p.texto, list), i)).join('');
      /* Carrusel: flechas en escritorio, puntos de avance y deslizamiento con el dedo */
      const cards = [...track.children];
      dots.innerHTML = cards.map(() => '<i></i>').join('');
      const step = () => (cards[1] ? cards[1].offsetLeft - cards[0].offsetLeft : track.clientWidth);
      const sync = () => {
        const i = Math.round(track.scrollLeft / step());
        [...dots.children].forEach((dot, k) => dot.classList.toggle('is-on', k === Math.min(i, cards.length - 1)));
        const overflow = track.scrollWidth > track.clientWidth + 4;
        if (nav) {
          nav.hidden = !overflow;
          nav.querySelector('[data-posts-prev]').disabled = track.scrollLeft < 4;
          nav.querySelector('[data-posts-next]').disabled = track.scrollLeft + track.clientWidth > track.scrollWidth - 4;
        }
        dots.hidden = !overflow;
      };
      track.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
      addEventListener('resize', sync);
      nav?.querySelector('[data-posts-prev]').addEventListener('click', () => track.scrollBy({ left: -step(), behavior: motion.matches ? 'smooth' : 'auto' }));
      nav?.querySelector('[data-posts-next]').addEventListener('click', () => track.scrollBy({ left: step(), behavior: motion.matches ? 'smooth' : 'auto' }));
      sync();
      track.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-doc-view]');
        if (!b) return;
        const n = list.find((x) => x.slug === b.closest('[data-slug]')?.dataset.slug);
        if (n) preview(n, norms);
      });
    });
  }
})();
