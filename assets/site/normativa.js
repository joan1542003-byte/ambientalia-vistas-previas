/* Transporte Autorizado: biblioteca de normativa (dentro del panel «Ayuda» de la cabecera, en todas las páginas) y
   publicaciones recientes de LinkedIn con su norma relacionada (página principal).
   Datos: assets/transporte/normativa.json (tools/normativa.py, texto oficial de Ley Chile) y assets/transporte/linkedin.json
   (tools/linkedin.mjs, lo actualiza GitHub Actions). Las filas de la biblioteca ya vienen en el HTML (tools/ayuda.py, para
   buscadores); este script agrega la búsqueda, el filtro por tema y el carrusel de publicaciones. Cada norma se lee en su página. */
(() => {
  const d = document;
  const lib = d.querySelector('[data-lib]');
  const ROOT = window.SITE_ROOT || '';  // '../' en las páginas de normas y guías
  const postsRoot = d.querySelector('[data-posts]');
  if (!lib && !postsRoot) return;
  const motion = matchMedia('(prefers-reduced-motion: no-preference)');
  const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const svg = (p, w = 20, vb = 24, sw = 1.8) => `<svg width="${w}" height="${w}" viewBox="0 0 ${vb} ${vb}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const ICON = {
    pdf: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', 20, 24, 2),
    doc: svg('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>'),
    out: svg('<path d="M5 11l6-6M6 5h5v5"/>', 16, 16, 2),
    li: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z"/></svg>'
  };
  const DATO = { leer: svg('<path d="M5 12h14M13 6l6 6-6 6"/>') };
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
  /* ---------- Datos de normativa (compartidos por la biblioteca y las publicaciones) ---------- */
  const src = lib?.dataset.src || 'assets/transporte/normativa.json';
  let normasPromise = null;
  const normas = () => (normasPromise ||= fetch(src, { cache: 'no-cache' }).then((r) => r.json()).catch(() => null));
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

  /* La confirmación de las descargas está en ayuda.js (sirve en todas las páginas) */

  /* ---------- Biblioteca ---------- */
  if (lib) {
    const list = lib.querySelector('[data-lib-list]');
    const input = lib.querySelector('[data-lib-q]');
    const search = lib.querySelector('.lib-search');
    /* Toda la caja del buscador lleva al campo (salvo el botón de borrar) */
    search.addEventListener('click', (e) => { if (!e.target.closest('button, input')) input.focus(); });
    const count = lib.querySelector('[data-lib-count]');
    const live = lib.querySelector('[data-lib-live]');
    const topics = lib.querySelector('[data-lib-topics]');
    const empty = lib.querySelector('[data-lib-empty]');
    const st = { q: '', tema: '*' };
    let data = null;

    const reEsc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    /* Resalta lo buscado sin distinguir tildes: se compara sobre el texto plegado, carácter a carácter */
    const mark = (text, terms) => {
      const raw = String(text ?? '');
      const folded = [...raw].map((c) => fold(c)[0] ?? c).join('');
      const hits = [];
      terms.filter((t) => t.length > 1).forEach((t) => {
        const re = new RegExp(reEsc(fold(t)), 'g');
        let m;
        while ((m = re.exec(folded))) hits.push([m.index, m.index + m[0].length]);
      });
      if (!hits.length) return esc(raw);
      hits.sort((a, b) => a[0] - b[0]);
      let out = '';
      let at = 0;
      hits.forEach(([a, b]) => { if (a < at) return; out += esc(raw.slice(at, a)) + `<mark>${esc(raw.slice(a, b))}</mark>`; at = b; });
      return out + esc(raw.slice(at));
    };
    const terms = () => st.q.trim().split(/\s+/).filter(Boolean);
    /* ¿La búsqueda coincide solo con la descripción? Entonces se muestra esa línea, para que se entienda por qué apareció */
    const inRel = (n) => {
      const tt = terms().map(fold).filter((t) => t.length > 1);
      if (!tt.length) return false;
      const head = fold(`${n.tema} ${n.corto} ${n.organismo}`);
      return tt.some((t) => !head.includes(t) && fold(n.rel).includes(t));
    };
    const row = (n, i, fresh) => {
      const tt = terms();
      const t = n.temas[0];
      return `<li class="doc${fresh ? ' is-new' : ''}" data-slug="${n.slug}" data-tema="${t}" style="--i:${Math.min(i, 8)}">`
        + `<span class="doc-icon">${temaIcon(t)}</span>`
        + `<div class="doc-body"><p class="doc-title"><a href="${esc(ROOT + n.pagina)}">${mark(n.tema, tt)}</a></p>`
        + `<p class="doc-sub"><strong>${mark(n.corto, tt)}</strong><span class="doc-org"> · ${mark(n.organismo, tt)}</span>${n.vigente ? '' : ' · <span class="doc-off">Derogada</span>'}</p>`
        + `${inRel(n) ? `<p class="doc-rel">${mark(n.rel, tt)}</p>` : ''}</div>`
        + `<a class="doc-pdf" href="${esc(ROOT + n.pdf)}" download data-doc-pdf aria-label="Descargar PDF de ${esc(n.corto)}">${ICON.pdf}<span>PDF</span></a></li>`;
    };
    const byText = (n) => {
      const q = fold(st.q).trim();
      if (!q) return true;
      const hay = fold([n.corto, n.numero, n.tipo, n.tema, n.titulo, n.rel, n.organismo, ...n.temas.map((t) => data.temas[t])].join(' '));
      /* Cada palabra debe aparecer al comienzo de una palabra; las de hasta tres letras, completas («rep» no encuentra «reportes») */
      const word = (t) => new RegExp(`(^|[^a-z0-9])${reEsc(t)}${t.length <= 3 ? '($|[^a-z0-9])' : ''}`).test(hay);
      if (q.split(/\s+/).every((t) => word(t.replace(/^(ds|d\.s\.?)$/, 'd.s')))) return true;
      return (n.alias || []).some(([re, w]) => { try { return w >= 2 && new RegExp(re, 'i').test(q); } catch { return false; } });
    };
    const byTema = (n) => st.tema === '*' || n.temas.includes(st.tema);
    const plural = (k) => `${k} ${k === 1 ? 'norma' : 'normas'}`;
    const setCount = (k) => {
      live.textContent = plural(k);
      if (customElements.get('number-flow')) {
        let flow = count.querySelector('number-flow');
        if (!flow) { flow = d.createElement('number-flow'); flow.locales = 'es-CL'; count.replaceChildren(flow, d.createTextNode('')); }
        count.lastChild.textContent = k === 1 ? ' norma' : ' normas';
        flow.update ? flow.update(k) : (flow.value = k);
      } else count.textContent = plural(k);
    };

    /* Temas: pestañas con un subrayado que se desliza hasta la elegida (sin cambiar de tamaño) */
    const glide = d.createElement('span');
    glide.className = 'lib-topics-glide';
    glide.setAttribute('aria-hidden', 'true');
    const place = (instant) => {
      const on = topics.querySelector('[aria-checked="true"]');
      if (!on) return;
      glide.classList.toggle('is-instant', Boolean(instant) || !motion.matches);
      glide.style.width = `${on.offsetWidth}px`;
      glide.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop + on.offsetHeight - 2}px)`;
    };
    const drawTopics = () => {
      const base = data.normas.filter(byText);
      const chip = (value, label, k) => `<button type="button" role="radio" class="lib-topic" data-topic="${value}" ${value === '*' ? '' : `data-tema="${value}"`} aria-checked="${st.tema === value}"${k ? '' : ' disabled'}>`
        + `${value === '*' ? '' : '<i aria-hidden="true"></i>'}${esc(label)}</button>`;
      const html = chip('*', 'Todas', base.length) + Object.entries(data.temas)
        .map(([k, label]) => [k, label, base.filter((n) => n.temas.includes(k)).length])
        .map(([k, label, c]) => chip(k, label, c)).join('');
      if (!topics.firstChild) { topics.innerHTML = html; topics.prepend(glide); place(true); edges(); return; }
      /* Solo se actualizan contadores y estados: las fichas no se vuelven a dibujar */
      const tmp = d.createElement('div');
      tmp.innerHTML = html;
      tmp.querySelectorAll('.lib-topic').forEach((b) => {
        const cur = topics.querySelector(`[data-topic="${b.dataset.topic}"]`);
        cur.disabled = b.disabled;
        cur.hidden = b.disabled && b.getAttribute('aria-checked') !== 'true';
        cur.setAttribute('aria-checked', b.getAttribute('aria-checked'));
      });
      place(true);
      edges();
    };
    /* Riel de temas: una sola fila; en escritorio, flechas cuando hay más temas a un lado (el borde se difumina) */
    const rail = d.createElement('div');
    rail.className = 'lib-rail';
    topics.before(rail);
    const arrow = (dir) => `<button class="lib-rail-btn is-${dir}" type="button" tabindex="-1" aria-hidden="true">${svg(dir === 'prev' ? '<path d="M15 6l-6 6 6 6"/>' : '<path d="M9 6l6 6-6 6"/>', 18, 24, 2)}</button>`;
    rail.insertAdjacentHTML('beforeend', arrow('prev'));
    rail.append(topics);
    rail.insertAdjacentHTML('beforeend', arrow('next'));
    const edges = () => {
      const max = topics.scrollWidth - topics.clientWidth;
      rail.classList.toggle('can-prev', topics.scrollLeft > 4);
      rail.classList.toggle('can-next', topics.scrollLeft < max - 4);
    };
    topics.addEventListener('scroll', () => requestAnimationFrame(edges), { passive: true });
    rail.addEventListener('click', (e) => {
      const b = e.target.closest('.lib-rail-btn');
      if (b) topics.scrollBy({ left: (b.classList.contains('is-prev') ? -1 : 1) * topics.clientWidth * 0.7, behavior: motion.matches ? 'smooth' : 'auto' });
    });
    const reveal = (b) => {
      const r = b.offsetLeft - (topics.clientWidth - b.offsetWidth) / 2;
      if (topics.scrollWidth > topics.clientWidth) topics.scrollTo({ left: r, behavior: motion.matches ? 'smooth' : 'auto' });
    };

    /* La lista vive en su propio contenedor: en escritorio se desplaza dentro del panel, y el resaltado se mueve con ella */
    const scroll = d.createElement('div');
    scroll.className = 'lib-scroll';
    list.before(scroll);
    scroll.append(list);

    let fadeTimer = 0;
    const render = (animate = true) => {
      if (!data) return;
      if (st.tema !== '*' && !data.normas.filter(byText).some((n) => n.temas.includes(st.tema))) st.tema = '*';
      const found = data.normas.filter((n) => byText(n) && byTema(n));
      setCount(found.length);
      drawTopics();
      search.classList.toggle('has-text', Boolean(st.q));
      clearTimeout(fadeTimer);
      const swap = () => {
        list.innerHTML = found.map((n, i) => row(n, i, animate && motion.matches)).join('');
        list.hidden = !found.length;
        scroll.hidden = !found.length;
        scroll.scrollTop = 0;
        empty.hidden = Boolean(found.length);
        empty.querySelector('[data-lib-empty-title]').textContent = st.q.trim() ? `No encontramos «${st.q.trim()}».` : 'No hay normas con ese filtro.';
        list.classList.remove('is-updating');
        hover(null);
      };
      if (animate && motion.matches) { list.classList.add('is-updating'); fadeTimer = setTimeout(swap, 120); } else swap();
    };

    /* Resaltado que se desliza entre filas al pasar el puntero (en vez de aparecer y desaparecer en cada una) */
    const hl = d.createElement('span');
    hl.className = 'lib-hover';
    hl.setAttribute('aria-hidden', 'true');
    list.before(hl);
    const hover = (li) => {
      if (!li || !matchMedia('(hover: hover)').matches) { hl.classList.remove('is-on'); return; }
      const first = !hl.classList.contains('is-on');
      hl.classList.toggle('is-instant', first || !motion.matches);
      hl.style.transform = `translate(${li.offsetLeft}px, ${li.offsetTop}px)`;
      hl.style.width = `${li.offsetWidth}px`;
      hl.style.height = `${li.offsetHeight}px`;
      if (first) void hl.offsetWidth;
      hl.classList.add('is-on');
      hl.classList.remove('is-instant');
    };
    list.addEventListener('pointerover', (e) => hover(e.target.closest('.doc')));
    list.addEventListener('pointerleave', () => hover(null));
    list.addEventListener('focusin', (e) => hover(e.target.closest('.doc')));

    normas().then((json) => {
      if (!json) return;
      data = json;
      setCount(data.normas.length);
      drawTopics();
    });
    addEventListener('resize', () => { place(true); edges(); });
    if ('ResizeObserver' in window) new ResizeObserver(() => place(true)).observe(topics);

    /* Teclado: «/» lleva a la búsqueda (con el panel abierto); ↓ baja a la lista y ↑ ↓ recorren las normas */
    d.addEventListener('keydown', (e) => {
      if (e.key !== '/' || e.target.closest('input, textarea, select, [contenteditable]') || d.querySelector('dialog[open]')) return;
      /* Solo con la biblioteca a la vista (panel «Ayuda» abierto en Normativa) */
      if (lib.closest('[inert]') || !lib.closest('.docs-item')?.classList.contains('is-on')) return;
      e.preventDefault();
      input.focus();
    });
    const links = () => [...list.querySelectorAll('.doc-title a')];
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && input.value) { e.preventDefault(); input.value = ''; st.q = ''; render(); }
      if (e.key === 'ArrowDown' && links()[0]) { e.preventDefault(); links()[0].focus(); }
      if (e.key === 'Enter') { e.preventDefault(); if (links().length === 1) links()[0].click(); else input.blur(); }
    });
    list.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const all = links();
      const k = all.indexOf(d.activeElement);
      if (k < 0) return;
      e.preventDefault();
      if (e.key === 'ArrowUp' && k === 0) input.focus(); else all[Math.max(0, Math.min(all.length - 1, k + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
    });
    let typing = 0;
    input.addEventListener('input', () => {
      st.q = input.value;
      search.classList.toggle('has-text', Boolean(st.q));
      clearTimeout(typing);
      typing = setTimeout(() => render(), 140);
    });
    lib.querySelector('[data-lib-clear]').addEventListener('click', () => { input.value = ''; st.q = ''; render(); input.focus(); });
    lib.querySelectorAll('[data-lib-reset]').forEach((b) => b.addEventListener('click', () => { input.value = ''; Object.assign(st, { q: '', tema: '*' }); render(); }));
    lib.querySelectorAll('[data-lib-try]').forEach((b) => b.addEventListener('click', () => { input.value = b.textContent; Object.assign(st, { q: b.textContent, tema: '*' }); render(); }));
    topics.addEventListener('click', (e) => {
      const b = e.target.closest('[data-topic]');
      if (!b || b.disabled || !data) return;
      st.tema = st.tema === b.dataset.topic && b.dataset.topic !== '*' ? '*' : b.dataset.topic;
      render();
      reveal(topics.querySelector('[aria-checked="true"]') || b);
    });
    /* Flechas dentro del grupo de temas, como un grupo de opciones */
    topics.addEventListener('keydown', (e) => {
      if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
      const all = [...topics.querySelectorAll('.lib-topic:not(:disabled)')];
      const k = all.indexOf(d.activeElement);
      const next = all[(k + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length];
      if (next) { e.preventDefault(); next.focus(); next.click(); }
    });
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
    const empty = (org) => `<li class="posts-empty"><p><strong>Pronto verás aquí las publicaciones de ${esc(org.nombre)}.</strong>`
      + `Cada una con la norma relacionada para leerla o descargarla.</p>`
      + `<a class="btn btn-quiet btn-small" href="${esc(org.url || company)}" target="_blank" rel="noopener noreferrer">${ICON.li}Seguir en LinkedIn<span class="sr-only"> (pestaña nueva)</span></a></li>`;
    /* Cada publicación: la portada manda; debajo, quién y cuándo, el texto y la norma relacionada como enlace (sin cajas dentro de cajas) */
    const post = (p, org, n, i) => `<li class="post" style="--i:${Math.min(i, 6)}">
        ${p.imagen ? `<a class="post-cover" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" aria-label="Ver la publicación en LinkedIn (pestaña nueva)"><img src="${esc(p.imagen)}" alt="" width="645" height="806" loading="lazy" decoding="async">${p.documento ? `<span class="post-pages">${ICON.doc}${p.documento.paginas} páginas</span>` : ''}</a>` : ''}
        <p class="post-meta"><span class="post-org">${org.logo ? `<img src="${esc(org.logo)}" alt="" width="24" height="24" loading="lazy">` : ''}${esc(org.nombre)}</span><time datetime="${esc(p.fecha)}">${when(p.fecha)}</time></p>
        <p class="post-text">${esc(p.imagen ? p.texto.split(/\n\s*\n/)[0] : p.texto)}</p>
        ${n ? `<div class="post-rel" data-tema="${n.temas[0]}">
          <small>Norma relacionada</small>
          <a class="post-rel-link" href="${esc(ROOT + n.pagina)}"><span class="doc-icon" aria-hidden="true">${temaIcon(n.temas[0])}</span><span><strong>${esc(n.corto)}</strong> · ${esc(n.tema)}</span>${DATO.leer}</a>
          <a class="post-rel-pdf" href="${esc(ROOT + n.pdf)}" download data-doc-pdf aria-label="Descargar PDF de ${esc(n.corto)}">${ICON.pdf}<span>PDF</span></a>
        </div>` : ''}
        <a class="post-li" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Ver en LinkedIn ${ICON.out}<span class="sr-only"> (pestaña nueva)</span></a>
      </li>`;

    Promise.all([fetch(postsRoot.dataset.src, { cache: 'no-cache' }).then((r) => r.json()).catch(() => null), normas()]).then(([feed, norms]) => {
      const org = feed?.organizacion || { nombre: 'Vínculo Verde', url: company };
      const items = (feed?.posts || []).slice(0, 10);
      if (!items.length) { track.innerHTML = empty(org); return; }
      const list = norms?.normas || [];
      track.innerHTML = items.map((p, i) => post(p, org, list.find((n) => n.slug === (p.normas || [])[0]) || related(p.texto, list), i)).join('');
      track.querySelectorAll('.post-cover img').forEach((img) => { const on = () => img.classList.add('is-loaded'); if (img.complete) on(); else { img.addEventListener('load', on, { once: true }); img.addEventListener('error', () => img.closest('.post-cover').remove(), { once: true }); } });
      /* Carrusel: flechas en escritorio, deslizamiento con el dedo y una línea fina que muestra el avance */
      const cards = [...track.children];
      dots.innerHTML = '<i></i>';
      const bar = dots.firstChild;
      const step = () => (cards[1] ? cards[1].offsetLeft - cards[0].offsetLeft : track.clientWidth);
      const sync = () => {
        const max = track.scrollWidth - track.clientWidth;
        const part = track.clientWidth / track.scrollWidth;
        bar.style.width = `${part * 100}%`;
        bar.style.transform = `translateX(${max > 0 ? (track.scrollLeft / max) * ((1 - part) / part) * 100 : 0}%)`;
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
    });
  }
})();
