/* Página de una norma (normativa/<slug>.html): lectura cómoda.
   - La barra superior pasa a «modo lectura» al bajar: sección actual, avance, buscar, índice y PDF.
   - Índice lateral que sigue la lectura (escritorio) y el mismo índice en una hoja a pantalla completa (teléfono).
   - Buscar en el texto: resalta, cuenta y recorre los resultados sin distinguir tildes ni mayúsculas.
   - Enlace copiable a cada artículo y un destello suave al llegar a uno desde un enlace. */
(() => {
  const d = document;
  const text = d.querySelector('[data-norm-text]');
  const bar = d.querySelector('[data-reader]');
  if (!text || !bar) return;
  const motion = matchMedia('(prefers-reduced-motion: no-preference)');
  const behavior = () => (motion.matches ? 'smooth' : 'auto');
  const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const head = d.querySelector('.norm-head');
  const reader = bar.querySelector('[data-reader-bar]');
  const finder = bar.querySelector('[data-textfind]');
  const now = bar.querySelector('[data-reader-now]');
  const where = now.previousElementSibling;
  const short = where.textContent;
  const progress = bar.querySelector('[data-reader-progress]');
  const tocNav = d.querySelector('[data-toc]');
  const tocLinks = tocNav ? [...tocNav.querySelectorAll('a[href^="#"]')] : [];
  const parts = tocLinks.map((a) => d.getElementById(a.hash.slice(1))).filter(Boolean);
  const arts = [...text.querySelectorAll('.norm-art')];
  const firstTopic = now.textContent;

  /* ---------- Posiciones (se recalculan al cambiar el tamaño o abrir un bloque plegado) ---------- */
  let partTops = [];
  let artTops = [];
  let textTop = 0;
  let textEnd = 0;
  const measure = () => {
    const y = scrollY;
    partTops = parts.map((el) => el.getBoundingClientRect().top + y);
    artTops = arts.map((el) => el.getBoundingClientRect().top + y);
    const r = text.getBoundingClientRect();
    textTop = r.top + y;
    textEnd = r.bottom + y;
  };
  const lastBefore = (tops, y) => {
    let lo = 0;
    let hi = tops.length - 1;
    let k = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (tops[m] <= y) { k = m; lo = m + 1; } else hi = m - 1; }
    return k;
  };

  /* ---------- Índice lateral: la entrada actual se marca con una barra que se desliza ---------- */
  let tocGlide = null;
  if (tocNav) {
    tocGlide = d.createElement('span');
    tocGlide.className = 'norm-toc-glide';
    tocGlide.setAttribute('aria-hidden', 'true');
    tocNav.querySelector('ol').prepend(tocGlide);
  }
  let curPart = -2;
  let curArt = -2;
  const swapText = (el, value) => {
    if (el.textContent === value) return;
    el.textContent = value;
    if (!motion.matches) return;
    el.classList.remove('is-swapping');
    void el.offsetWidth;
    el.classList.add('is-swapping');
  };
  const setPart = (k) => {
    if (k === curPart) return;
    curPart = k;
    tocLinks.forEach((a, i) => (i === k ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current')));
    const a = tocLinks[k];
    if (tocGlide) {
      tocGlide.classList.toggle('is-on', Boolean(a));
      if (a) {
        const li = a.parentElement;
        tocGlide.style.transform = `translateY(${li.offsetTop}px)`;
        tocGlide.style.height = `${li.offsetHeight}px`;
        /* Mantiene visible la entrada actual dentro del índice, sin mover la página */
        const box = tocNav;
        if (box.scrollHeight > box.clientHeight) {
          const top = li.offsetTop - box.clientHeight / 3;
          box.scrollTo({ top, behavior: behavior() });
        }
      }
    }
    const label = a ? (a.querySelector('span')?.textContent || a.textContent) : firstTopic;
    swapText(now, label);
  };
  const setArt = (k) => {
    if (k === curArt) return;
    curArt = k;
    const h = arts[k]?.querySelector('.norm-art-h a');
    swapText(where, h ? `${short} · ${h.textContent.replace(/^Art[íi]culo/i, 'Art.')}` : short);
  };

  /* ---------- Modo lectura y avance ---------- */
  let finding = false;
  const setReading = (on) => {
    on = on || finding;
    if (bar.classList.contains('is-reading') === on) return;
    bar.classList.toggle('is-reading', on);
    reader.inert = !on || finding;
    bar.querySelectorAll('.brand, .nav').forEach((el) => { el.inert = on; });
  };
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = scrollY;
      const barBottom = bar.getBoundingClientRect().bottom;
      setReading(head.getBoundingClientRect().bottom < barBottom);
      const line = y + barBottom + 48;
      setPart(lastBefore(partTops, line));
      setArt(lastBefore(artTops, line));
      const span = Math.max(1, textEnd - textTop - innerHeight + barBottom);
      progress.style.transform = `scaleX(${Math.min(1, Math.max(0, (y + barBottom - textTop) / span))})`;
    });
  };
  const refresh = () => { measure(); curPart = -2; onScroll(); };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', refresh);
  d.fonts?.ready.then(refresh);
  text.addEventListener('toggle', refresh, true);
  refresh();

  /* ---------- Saltos dentro de la página: desplazamiento suave y destello en el destino ---------- */
  const flash = (el) => {
    if (!el) return;
    const target = el.closest('.norm-art, .norm-part, .norm-annex') || el;
    target.classList.remove('is-flash');
    void target.offsetWidth;
    target.classList.add('is-flash');
    setTimeout(() => target.classList.remove('is-flash'), 2400);
  };
  const go = (id, push = true) => {
    const el = d.getElementById(id);
    if (!el) return;
    el.closest('details:not([open])')?.setAttribute('open', '');
    el.scrollIntoView({ behavior: behavior(), block: 'start' });
    if (push) history.replaceState(history.state, '', `#${id}`);
    flash(el);
  };
  d.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.closest('.toc-sheet, .hero-sheet, [data-hero], [data-dock]') || a.classList.contains('skip')) return;
    const id = decodeURIComponent(a.hash.slice(1));
    const target = id && d.getElementById(id);
    if (!target || target.closest('[data-hero], .hero-sheet')) return;
    e.preventDefault();
    go(id);
  });
  if (location.hash.length > 1) requestAnimationFrame(() => flash(d.getElementById(decodeURIComponent(location.hash.slice(1)))));

  /* ---------- Enlace a cada artículo (en pantallas con puntero) ---------- */
  const toast = (t) => window.SITE?.toast?.(t);
  const LINK = '<svg class="i-link" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/></svg>'
    + '<svg class="i-done" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  if (matchMedia('(hover: hover)').matches) {
    text.querySelectorAll('.norm-art-h').forEach((h) => {
      const a = h.querySelector('a');
      h.insertAdjacentHTML('beforeend', `<button class="art-link" type="button" aria-label="Copiar enlace al ${a.textContent}">${LINK}</button>`);
    });
    text.addEventListener('click', async (e) => {
      const b = e.target.closest('.art-link');
      if (!b) return;
      const a = b.parentElement.querySelector('a');
      const url = `${location.origin}${location.pathname}${a.hash}`;
      try { await navigator.clipboard.writeText(url); toast(`Enlace al ${a.textContent} copiado`); } catch { history.replaceState(history.state, '', a.hash); toast('Copia el enlace desde la barra de direcciones'); }
      b.classList.add('is-done');
      setTimeout(() => b.classList.remove('is-done'), 1600);
    });
  }

  /* ---------- Ayudas de los datos: la primera espera un momento; las siguientes aparecen al instante ---------- */
  d.querySelectorAll('[data-tips]').forEach((group) => {
    let warmTimer = 0;
    let coolTimer = 0;
    group.addEventListener('pointerover', (e) => {
      if (!e.target.closest('[data-tip]')) return;
      clearTimeout(coolTimer);
      if (!group.classList.contains('is-warm')) warmTimer = setTimeout(() => group.classList.add('is-warm'), 450);
    });
    group.addEventListener('pointerleave', () => { clearTimeout(warmTimer); coolTimer = setTimeout(() => group.classList.remove('is-warm'), 500); });
  });

  /* ---------- Índice en hoja (teléfono y tablet) ---------- */
  let sheet = null;
  let sheetOpen = false;
  const closeSheet = (fromHistory = false) => {
    if (!sheet || !sheetOpen) return Promise.resolve();
    sheetOpen = false;
    sheet.classList.remove('is-in');
    if (!fromHistory && history.state?.tocSheet) history.back();
    return new Promise((r) => setTimeout(() => { sheet.close(); r(); }, motion.matches ? 280 : 0));
  };
  const openSheet = () => {
    if (!tocNav) return;
    if (!sheet) {
      sheet = d.createElement('dialog');
      sheet.className = 'toc-sheet';
      sheet.setAttribute('aria-labelledby', 'toc-sheet-t');
      sheet.tabIndex = -1;
      sheet.innerHTML = `<div class="toc-sheet-head"><p><strong id="toc-sheet-t">Índice</strong><small>${short}</small></p>`
        + `<button class="reader-btn" type="button" data-close aria-label="Cerrar índice"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`
        + `<ol class="toc-sheet-list">${tocNav.querySelector('ol').innerHTML}</ol>`;
      sheet.querySelector('.norm-toc-glide')?.remove();
      d.body.append(sheet);
      sheet.addEventListener('click', async (e) => {
        if (e.target === sheet || e.target.closest('[data-close]')) { closeSheet(); return; }
        const a = e.target.closest('a[href^="#"]');
        if (!a) return;
        e.preventDefault();
        await closeSheet();
        go(a.hash.slice(1));
      });
      sheet.addEventListener('cancel', (e) => { e.preventDefault(); closeSheet(); });
    }
    sheet.querySelectorAll('a').forEach((a, i) => (i === curPart ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current')));
    sheet.showModal();
    sheet.focus({ preventScroll: true });
    sheetOpen = true;
    history.pushState({ ...(history.state || {}), tocSheet: true }, '');
    requestAnimationFrame(() => {
      sheet.classList.add('is-in');
      const on = sheet.querySelector('[aria-current]');
      if (on) sheet.querySelector('.toc-sheet-list').scrollTop = on.parentElement.offsetTop - 120;
    });
  };
  addEventListener('popstate', () => { if (sheetOpen) closeSheet(true); });
  d.querySelectorAll('[data-toc-open]').forEach((b) => b.addEventListener('click', openSheet));

  /* ---------- Buscar en el texto ---------- */
  const q = finder.querySelector('[data-textfind-q]');
  const out = finder.querySelector('[data-textfind-count]');
  const prev = finder.querySelector('[data-textfind-prev]');
  const next = finder.querySelector('[data-textfind-next]');
  let hits = [];
  let cur = -1;
  let opener = null;
  const clearHits = () => {
    if (!hits.length) return;
    const parents = new Set();
    hits.forEach((m) => { parents.add(m.parentNode); m.replaceWith(...m.childNodes); });
    parents.forEach((p) => p?.normalize());
    hits = [];
    cur = -1;
  };
  const show = (k) => {
    if (!hits.length) return;
    hits[cur]?.classList.remove('is-current');
    cur = (k + hits.length) % hits.length;
    const m = hits[cur];
    m.classList.add('is-current');
    m.closest('details:not([open])')?.setAttribute('open', '');
    m.scrollIntoView({ behavior: behavior(), block: 'center' });
    out.textContent = `${cur + 1} de ${hits.length}`;
  };
  const run = () => {
    clearHits();
    const term = fold(q.value.trim());
    prev.disabled = next.disabled = true;
    if (term.length < 2) { out.textContent = ''; return; }
    const walker = d.createTreeWalker(text, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest('.sr-only, .art-link, summary small') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (hits.length >= 400) break;
      const raw = node.nodeValue;
      let f = '';
      for (let i = 0; i < raw.length; i++) f += fold(raw[i])[0] ?? raw[i];
      const at = [];
      let i = f.indexOf(term);
      while (i !== -1) { at.push(i); i = f.indexOf(term, i + term.length); }
      if (!at.length) continue;
      const marks = [];
      for (let k = at.length - 1; k >= 0; k--) {
        const piece = node.splitText(at[k]);
        piece.splitText(term.length);
        const m = d.createElement('mark');
        m.className = 'find-hit';
        piece.replaceWith(m);
        m.append(piece);
        marks.unshift(m);
      }
      hits.push(...marks);
    }
    if (!hits.length) { out.textContent = 'Sin resultados'; return; }
    prev.disabled = next.disabled = hits.length < 2;
    /* Parte en el primer resultado que está bajo la posición de lectura actual */
    const y = bar.getBoundingClientRect().bottom;
    const k = hits.findIndex((m) => m.getBoundingClientRect().top > y);
    show(k < 0 ? 0 : k);
  };
  const openFinder = (e) => {
    opener = e?.currentTarget || null;
    finding = true;
    bar.classList.add('is-finding', 'is-reading');
    finder.inert = false;
    reader.inert = true;
    bar.querySelectorAll('.brand, .nav').forEach((el) => { el.inert = true; });
    q.focus({ preventScroll: true });
    if (q.value) q.select();
  };
  const closeFinder = () => {
    finding = false;
    clearHits();
    out.textContent = '';
    bar.classList.remove('is-finding');
    finder.inert = true;
    bar.classList.remove('is-reading');
    onScroll();
    requestAnimationFrame(() => { reader.inert = !bar.classList.contains('is-reading'); });
    (opener && opener.isConnected && !opener.closest('[inert]') ? opener : d.querySelector('.norm-actions [data-find-open]'))?.focus({ preventScroll: true });
  };
  d.querySelectorAll('[data-find-open]').forEach((b) => b.addEventListener('click', openFinder));
  finder.querySelector('[data-textfind-close]').addEventListener('click', closeFinder);
  prev.addEventListener('click', () => show(cur - 1));
  next.addEventListener('click', () => show(cur + 1));
  let typing = 0;
  q.addEventListener('input', () => { clearTimeout(typing); typing = setTimeout(run, 220); });
  finder.addEventListener('submit', (e) => { e.preventDefault(); if (hits.length) show(cur + 1); else run(); });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeFinder(); }
    if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); show(cur - 1); }
  });
  /* Ctrl/⌘ + F abre la búsqueda propia (una segunda vez deja la del navegador) */
  d.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && !finding) { e.preventDefault(); openFinder(); }
  });
})();
