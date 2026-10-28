/* Transporte Autorizado: «Ayuda» en la cabecera (rediseño del 22-10-2026). Al elegirlo, la misma píldora de la cabecera
   se expande y muestra arriba tres pestañas con lo que hay —Guías rápidas, Checklists y Normativa—, cada una con su
   cantidad. Guías y checklists se ordenan por etapa del retiro (antes, al preparar, después); la normativa trae su
   buscador. Al cambiar de pestaña el panel ajusta su alto con una animación corta y el contenido entra con un fundido.
   El contenido viene en el HTML (tools/ayuda.py), así también lo leen los buscadores. Cualquier enlace con
   [data-docs-open] abre el panel; con valor, en esa pestaña (data-docs-open="normativa" o "checklists").
   También da la confirmación de las descargas ([data-download], [data-doc-pdf]). */
(() => {
  const d = document;
  const motion = matchMedia('(prefers-reduced-motion: no-preference)');

  /* ---------- Descargas: el ícono se transforma en ✓ (se dibuja) y aparece un aviso ---------- */
  const CHECK = '<svg class="done-mark" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  d.addEventListener('click', (e) => {
    const a = e.target.closest('[data-download], [data-doc-pdf]');
    if (!a || a.classList.contains('is-downloading')) return;
    a.classList.add('is-downloading');
    a.insertAdjacentHTML('beforeend', CHECK);
    window.SITE?.toast?.(a.dataset.toast || 'Descargando el PDF de la norma');
    setTimeout(() => { a.classList.remove('is-downloading'); a.querySelector('.done-mark')?.remove(); }, 2000);
  });

  const header = d.querySelector('.site-header.has-docs');
  const panel = header?.querySelector('[data-docs-panel]');
  const triggers = [...d.querySelectorAll('[data-docs-open]')];
  if (!header || !panel || !triggers.length) return;
  const tabs = [...panel.querySelectorAll('[data-docs-cat]')];
  const panes = [...panel.querySelectorAll('[data-docs-pane]')];
  const glide = panel.querySelector('.docs-cats-glide');
  const inner = panel.querySelector('.docs-inner');
  const scroller = panel.querySelector('.docs-scroll');
  const toggle = header.querySelector('.menu-toggle');
  const paneOf = (cat) => panes.find((p) => p.dataset.docsPane === cat);
  const tabOf = (cat) => tabs.find((t) => t.dataset.docsCat === cat);
  const ALIAS = { checklist: 'checklists', guia: 'guias', ayuda: null, documentos: null };
  const catOf = (v) => (v in ALIAS ? ALIAS[v] : tabOf(v) ? v : null);
  let open = false;
  let current = 'guias';
  let opener = null;

  /* La página en que se está queda señalada, y el panel abre en su pestaña (checklist, guía o norma) */
  const aqui = location.pathname.split('/').pop();
  const propia = [...panel.querySelectorAll('.docs-card')].find((a) => a.getAttribute('href').split('/').pop() === aqui);
  if (propia) propia.setAttribute('aria-current', 'page');
  const inicial = propia?.closest('[data-docs-pane]')?.dataset.docsPane || (location.pathname.includes('/normativa/') ? 'normativa' : 'guias');

  /* Pestañas: la elegida lleva un fondo que se desliza bajo ella */
  const placeGlide = (instant) => {
    const t = tabOf(current);
    if (!t || !glide) return;
    glide.classList.toggle('is-instant', Boolean(instant) || !motion.matches);
    glide.style.width = `${t.offsetWidth}px`;
    glide.style.transform = `translateX(${t.offsetLeft}px)`;
  };
  let sizing = null;
  const select = (cat, { instant = false, focus = false } = {}) => {
    if (!tabOf(cat)) cat = 'guias';
    const from = inner.offsetHeight;
    const changed = cat !== current;
    current = cat;
    tabs.forEach((t) => {
      const on = t.dataset.docsCat === cat;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    panes.forEach((p) => { p.hidden = p.dataset.docsPane !== cat; });
    placeGlide(instant);
    if (focus) tabOf(cat).focus({ preventScroll: true });
    if (!changed || instant || !open || !motion.matches || !inner.animate) return;
    if (scroller) scroller.scrollTop = 0;
    /* Alto animado y entrada del contenido nuevo (el mismo lenguaje del hero) */
    const to = inner.offsetHeight;
    sizing?.cancel();
    if (Math.abs(to - from) > 1) sizing = inner.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 440, easing: 'cubic-bezier(.32, .72, 0, 1)' });
    const pane = paneOf(cat);
    pane.classList.remove('is-entering');
    void pane.offsetWidth;
    pane.classList.add('is-entering');
  };

  const setOpen = (next, { focus = false, cat = null } = {}) => {
    if (next === open) { if (open && cat) select(cat); return; }
    open = next;
    header.classList.toggle('docs-open', open);
    d.documentElement.classList.toggle('docs-is-open', open);  // la burbuja «?» se aparta mientras el panel está abierto
    panel.inert = !open;
    triggers.forEach((t) => t.setAttribute('aria-expanded', String(open)));
    if (toggle) toggle.setAttribute('aria-label', open ? 'Cerrar ayuda' : 'Abrir menú');
    if (open) {
      sizing?.cancel();
      select(cat || inicial, { instant: true, focus });
      requestAnimationFrame(() => placeGlide(true));
    } else if (focus) (opener && opener.isConnected ? opener : triggers[0]).focus({ preventScroll: true });
  };

  triggers.forEach((t) => t.addEventListener('click', (e) => {
    e.preventDefault();
    opener = t.getClientRects().length ? t : toggle;
    const cat = catOf(t.dataset.docsOpen || '');
    /* Repetir el mismo enlace cierra el panel; pedir otra pestaña la cambia sin cerrarlo. Con teclado, el foco va a la pestaña */
    setOpen(!(open && (!cat || cat === current)), { focus: e.detail === 0, cat });
  }));
  /* Enlaces que llegan desde otra página: …#ayuda abre el panel, …#normativa o …#checklists en esa pestaña */
  const HASH = { '#ayuda': null, '#documentos': null, '#guias': 'guias', '#normativa': 'normativa', '#checklist': 'checklists', '#checklists': 'checklists' };
  const fromHash = () => {
    if (!(location.hash in HASH)) return;
    setOpen(true, { cat: HASH[location.hash] });
    history.replaceState(history.state, '', location.pathname + location.search);
  };
  fromHash();
  addEventListener('hashchange', fromHash);

  tabs.forEach((t) => t.addEventListener('click', () => select(t.dataset.docsCat)));
  /* Teclado en las pestañas: ← → (y Inicio/Fin) cambian de pestaña, como en cualquier lista de pestañas */
  panel.querySelector('[role="tablist"]')?.addEventListener('keydown', (e) => {
    const k = tabs.indexOf(d.activeElement);
    if (k < 0) return;
    const next = { ArrowRight: k + 1, ArrowLeft: k - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(tabs[(next + tabs.length) % tabs.length].dataset.docsCat, { focus: true });
  });

  /* Cierre: Escape, tocar fuera, elegir un enlace o una acción, o pasar a leer (barra de lectura de las normas) */
  d.addEventListener('keydown', (e) => { if (open && e.key === 'Escape' && !d.querySelector('dialog[open]')) { e.preventDefault(); setOpen(false, { focus: true }); } });
  d.addEventListener('pointerdown', (e) => { if (open && !header.contains(e.target)) setOpen(false); });
  panel.addEventListener('click', (e) => { if (e.target.closest('a[href], [data-dock-open], [data-docs-close]') && !e.target.closest('[data-download], [data-doc-pdf]')) setOpen(false); });
  /* Si la cabecera pasa a barra de lectura (normas) con el panel abierto, se cierra; desde la barra de lectura sí se puede abrir */
  let reading = header.classList.contains('is-reading');
  new MutationObserver(() => {
    const now = header.classList.contains('is-reading');
    if (now && !reading && open) setOpen(false);
    reading = now;
  }).observe(header, { attributes: true, attributeFilter: ['class'] });
  /* En el teléfono, el botón del menú se vuelve «cerrar» mientras la ayuda está abierta */
  if (toggle) d.addEventListener('click', (e) => {
    if (!open || !e.target.closest('.menu-toggle')) return;
    e.preventDefault();
    e.stopPropagation();
    setOpen(false, { focus: false });
    toggle.focus({ preventScroll: true });
  }, true);
  addEventListener('resize', () => { if (open) placeGlide(true); });
  if ('ResizeObserver' in window) new ResizeObserver(() => { if (open) placeGlide(true); }).observe(panel.querySelector('[role="tablist"]'));
})();
