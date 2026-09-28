/* Transporte Autorizado: «Documentos» en la cabecera. Al elegirlo, la misma píldora de la cabecera se expande y muestra
   las guías (¿peligroso o no?, autorización sanitaria, antes de contratar) y la normativa, cada una con su explicación:
   en escritorio, lista a la izquierda y explicación a la derecha (se cambia al pasar el puntero); en el teléfono, cada
   tema se despliega en su lugar. El contenido viene en el HTML (tools/documentos.py), así también lo leen los buscadores.
   También da la confirmación de las descargas ([data-download], [data-doc-pdf]) en todas las páginas. */
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
  let open = false;
  let current = null;
  let opener = null;

  const placeGlide = (instant) => {
    const on = current && wide.matches ? tabOf(current) : null;
    glide.classList.toggle('is-on', Boolean(on));
    if (!on) return;
    glide.classList.toggle('is-instant', Boolean(instant) || !motion.matches);
    glide.style.transform = `translateY(${on.offsetTop}px)`;
    glide.style.height = `${on.offsetHeight}px`;
  };
  const select = (item, { instant = false } = {}) => {
    current = item;
    items.forEach((it) => {
      const on = it === item;
      it.classList.toggle('is-on', on);
      tabOf(it).setAttribute('aria-expanded', String(on));
    });
    placeGlide(instant);
  };

  const setOpen = (next, { focus = false } = {}) => {
    if (next === open) return;
    open = next;
    header.classList.toggle('docs-open', open);
    panel.inert = !open;
    triggers.forEach((t) => t.setAttribute('aria-expanded', String(open)));
    if (toggle) toggle.setAttribute('aria-label', open ? 'Cerrar documentos' : 'Abrir menú');
    if (open) {
      /* En escritorio siempre hay un tema a la vista; en el teléfono la lista parte cerrada */
      if (wide.matches) select(current || items[0], { instant: true });
      else if (!current) select(null);
      if (focus) tabOf(current || items[0]).focus({ preventScroll: true });
    } else if (focus) (opener && opener.isConnected ? opener : triggers[0]).focus({ preventScroll: true });
  };

  triggers.forEach((t) => t.addEventListener('click', (e) => {
    e.preventDefault();
    opener = t.getClientRects().length ? t : toggle;
    /* Teclado (Enter/Espacio) lleva el foco al primer tema; con puntero, el foco queda donde está */
    setOpen(!open, { focus: e.detail === 0 });
  }));

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
  /* Si la cabecera pasa a barra de lectura (normas), el panel se cierra */
  new MutationObserver(() => { if (open && header.classList.contains('is-reading')) setOpen(false); }).observe(header, { attributes: true, attributeFilter: ['class'] });
  /* En el teléfono, el botón del menú se vuelve «cerrar» mientras los documentos están abiertos */
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
