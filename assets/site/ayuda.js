/* Transporte Autorizado: «Ayuda» en la cabecera. Al elegirlo, la misma píldora de la cabecera se expande y muestra las
   guías rápidas (¿peligroso o no?, autorización sanitaria, antes de contratar) y los documentos (checklist descargable y
   normativa con búsqueda), cada uno con su explicación: en escritorio, lista a la izquierda y detalle a la derecha (cambia
   al pasar el puntero); en el teléfono, cada tema se despliega en su lugar. El contenido viene en el HTML (tools/ayuda.py),
   así también lo leen los buscadores. Cualquier enlace con [data-docs-open] abre el panel; con valor, en ese tema
   (p. ej. data-docs-open="normativa"). También da la confirmación de las descargas ([data-download], [data-doc-pdf]). */
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
  const wide = matchMedia('(min-width: 861px)');
  const hover = matchMedia('(hover: hover) and (min-width: 861px)');
  const grid = panel.querySelector('.docs-grid');
  const glide = panel.querySelector('.docs-glide');
  const items = [...panel.querySelectorAll('[data-docs-item]')];
  const tabOf = (item) => item.querySelector('[data-docs-tab]');
  const toggle = header.querySelector('.menu-toggle');
  const byKey = (key) => items.find((it) => it.dataset.docsItem === key) || null;
  const scroller = panel.querySelector('.docs-scroll');
  let open = false;
  /* Parte en el tema de la página en que se está: su guía, o la normativa al leer una norma */
  let current = items.find((it) => location.pathname.endsWith(`/ayuda/${it.dataset.docsItem}.html`)) || (location.pathname.includes('/normativa/') ? byKey('normativa') : null);
  let opener = null;

  const placeGlide = (instant) => {
    const on = current && wide.matches ? tabOf(current) : null;
    glide.classList.toggle('is-on', Boolean(on));
    if (!on) return;
    glide.classList.toggle('is-instant', Boolean(instant) || !motion.matches);
    glide.style.transform = `translateY(${on.offsetTop}px)`;
    glide.style.height = `${on.offsetHeight}px`;
  };
  /* Teléfono: el tema que se abre sube hasta el borde superior del panel, al mismo tiempo que se despliega
     (la posición se recalcula en cada cuadro porque el tema anterior se está cerrando) */
  let revealRaf = 0;
  const reveal = (item) => {
    cancelAnimationFrame(revealRaf);
    if (wide.matches || !item || !scroller) return;
    const tab = tabOf(item);
    const want = () => tab.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 2;
    const from = scroller.scrollTop;
    const t0 = performance.now();
    const D = motion.matches ? 480 : 0;
    const step = (now) => {
      const t = D ? Math.min(1, (now - t0) / D) : 1;
      scroller.scrollTop = from + (want() - from) * (1 - (1 - t) ** 3);
      if (t < 1) revealRaf = requestAnimationFrame(step);
    };
    revealRaf = requestAnimationFrame(step);
  };
  ['touchstart', 'wheel'].forEach((ev) => scroller?.addEventListener(ev, () => cancelAnimationFrame(revealRaf), { passive: true }));
  const select = (item, { instant = false } = {}) => {
    current = item;
    items.forEach((it) => {
      const on = it === item;
      it.classList.toggle('is-on', on);
      tabOf(it).setAttribute('aria-expanded', String(on));
      it.querySelector('.docs-detail').inert = !on;
    });
    placeGlide(instant);
    reveal(item);
  };

  const setOpen = (next, { focus = false, item = null } = {}) => {
    if (next && item) current = item;
    if (next === open) { if (open && item) select(item); return; }
    open = next;
    header.classList.toggle('docs-open', open);
    d.documentElement.classList.toggle('docs-is-open', open);  // la burbuja «?» se aparta mientras el panel está abierto
    panel.inert = !open;
    triggers.forEach((t) => t.setAttribute('aria-expanded', String(open)));
    if (toggle) toggle.setAttribute('aria-label', open ? 'Cerrar ayuda' : 'Abrir menú');
    if (open) {
      /* En escritorio siempre hay un tema a la vista; en el teléfono la lista parte cerrada */
      if (wide.matches) select(current || items[0], { instant: true });
      else select(item || null);
      if (focus) tabOf(current || items[0]).focus({ preventScroll: true });
    } else if (focus) (opener && opener.isConnected ? opener : triggers[0]).focus({ preventScroll: true });
  };

  triggers.forEach((t) => t.addEventListener('click', (e) => {
    e.preventDefault();
    opener = t.getClientRects().length ? t : toggle;
    const item = byKey(t.dataset.docsOpen);
    /* Teclado (Enter/Espacio) lleva el foco al primer tema; con puntero, el foco queda donde está.
       Repetir el mismo enlace cierra el panel; pedir otro tema lo cambia sin cerrarlo */
    setOpen(!(open && (!item || item === current)), { focus: e.detail === 0, item });
  }));
  /* Enlaces que llegan desde otra página: …#ayuda abre el panel y …#normativa lo abre en la normativa */
  const HASH = { '#ayuda': null, '#documentos': null, '#normativa': 'normativa', '#checklist': 'checklist' };
  const fromHash = () => {
    if (!(location.hash in HASH)) return;
    setOpen(true, { item: byKey(HASH[location.hash]) });
    history.replaceState(history.state, '', location.pathname + location.search);
  };
  fromHash();
  addEventListener('hashchange', fromHash);

  /* Temas: en escritorio, al pasar el puntero (con una breve intención) o al elegirlo; en el teléfono, se despliegan */
  let intent = 0;
  items.forEach((item) => {
    const tab = tabOf(item);
    tab.addEventListener('click', () => {
      if (wide.matches) select(item);
      else select(item.classList.contains('is-on') ? null : item);
    });
    tab.addEventListener('pointerenter', () => {
      if (!hover.matches) return;
      clearTimeout(intent);
      intent = setTimeout(() => select(item), 70);
    });
    tab.addEventListener('pointerleave', () => clearTimeout(intent));
  });
  grid.addEventListener('keydown', (e) => {
    if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const tabs = items.map(tabOf);
    const k = tabs.indexOf(d.activeElement);
    if (k < 0) return;
    e.preventDefault();
    const next = tabs[(k + (e.key === 'ArrowDown' ? 1 : -1) + tabs.length) % tabs.length];
    next.focus();
    if (wide.matches) select(items[tabs.indexOf(next)]);
  });

  /* Cierre: Escape, tocar fuera, elegir un enlace o una acción, o pasar a leer (barra de lectura de las normas) */
  d.addEventListener('keydown', (e) => { if (open && e.key === 'Escape' && !d.querySelector('dialog[open]')) { e.preventDefault(); setOpen(false, { focus: true }); } });
  d.addEventListener('pointerdown', (e) => { if (open && !header.contains(e.target)) setOpen(false); });
  panel.addEventListener('click', (e) => { if (e.target.closest('a[href], [data-dock-open], [data-docs-close]') && !e.target.closest('[data-download]')) setOpen(false); });
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
  wide.addEventListener('change', () => { if (open) { if (wide.matches && !current) select(items[0], { instant: true }); else placeGlide(true); } });
  addEventListener('resize', () => { if (open) placeGlide(true); });
})();
