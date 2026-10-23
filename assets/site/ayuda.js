/* Transporte Autorizado: «Ayuda» en la cabecera (simplificada el 22-10-2026). Al elegirla, la misma píldora de la
   cabecera se expande y muestra los temas (clasificar el residuo, autorizaciones y Ley REP, elegir quién retira,
   preparar el retiro y después del retiro) y los documentos (checklists y normativa). Al elegir uno se despliega su ayuda debajo de su fila —en el
   teléfono, debajo del tema—: sus guías, cada una con su checklist en línea y en Excel, o la normativa con su buscador.
   Un tema a la vez; se cierra al elegirlo de nuevo. El contenido viene en el HTML (tools/ayuda.py), así también lo leen
   los buscadores. Cualquier enlace con [data-docs-open] abre el panel; con valor, en ese tema (data-docs-open="normativa").
   También da la confirmación de las descargas ([data-download], [data-doc-pdf]). */
(() => {
  const d = document;
  const motion = matchMedia('(prefers-reduced-motion: no-preference)');

  /* ---------- Descargas: el ícono se transforma en ✓ (se dibuja) y aparece un aviso ---------- */
  const CHECK = '<svg class="done-mark" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
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
  const temas = [...panel.querySelectorAll('[data-ayu-tema]')];
  const detalleDe = (b) => panel.querySelector(`#${b.getAttribute('aria-controls')}`);
  const temaDe = (k) => temas.find((b) => b.dataset.ayuTema === k) || null;
  const scroller = panel.querySelector('.docs-scroll');
  const toggle = header.querySelector('.menu-toggle');
  const ALIAS = { checklist: 'checklists', guias: null, ayuda: null, documentos: null };
  const temaPedido = (v) => (v in ALIAS ? ALIAS[v] : temaDe(v) ? v : null);
  let open = false;
  let actual = null;
  let opener = null;

  /* La página en que se está queda señalada, y el panel abre en su tema (guía, checklist o norma) */
  const aqui = location.pathname.split('/').pop();
  const es = (a) => a.getAttribute('href').split('/').pop() === aqui;
  /* Un checklist se señala en «Checklists»; una guía, en su tema */
  const propia = [...panel.querySelectorAll('.ayu-ck a[href]')].find(es) || [...panel.querySelectorAll('.ayu-guia a[href]')].find(es);
  if (propia) propia.closest('.ayu-ck, .ayu-guia').setAttribute('aria-current', 'page');
  const inicial = propia?.closest('[data-ayu-detalle]')?.dataset.ayuDetalle || (location.pathname.includes('/normativa/') ? 'normativa' : null);

  /* Un tema a la vez: el elegido se despliega (alto animado en CSS) y, si no se ve entero, el panel lo acerca */
  const wrap = panel.querySelector('.docs-wrap');
  const volverTemas = panel.querySelector('[data-ayu-volver]');
  /* Al elegir un tema, los demás se van y queda solo el elegido, con «Todos los temas» para volver (23-10-2026) */
  const elegir = (k, { acercar = true } = {}) => {
    actual = k;
    wrap?.classList.toggle('is-tema', Boolean(k));
    if (volverTemas) volverTemas.hidden = !k;
    temas.forEach((b) => {
      const on = b.dataset.ayuTema === k;
      b.setAttribute('aria-expanded', String(on));
      const det = detalleDe(b);
      det.classList.toggle('is-on', on);
      det.inert = !on;
    });
    if (scroller) scroller.scrollTop = 0;
    void acercar;
  };

  const setOpen = (next, { focus = false, tema } = {}) => {
    if (next === open) { if (open && tema !== undefined) elegir(tema); return; }
    open = next;
    header.classList.toggle('docs-open', open);
    d.documentElement.classList.toggle('docs-is-open', open);  // la burbuja «?» se aparta mientras el panel está abierto
    panel.inert = !open;
    triggers.forEach((t) => t.setAttribute('aria-expanded', String(open)));
    if (toggle) toggle.setAttribute('aria-label', open ? 'Cerrar ayuda' : 'Abrir menú');
    if (open) {
      if (scroller) scroller.scrollTop = 0;
      elegir(tema !== undefined ? tema : inicial, { acercar: false });
      if (focus) (temaDe(actual) || temas[0]).focus({ preventScroll: true });
    } else if (focus) (opener && opener.isConnected ? opener : triggers[0]).focus({ preventScroll: true });
  };

  triggers.forEach((t) => t.addEventListener('click', (e) => {
    e.preventDefault();
    opener = t.getClientRects().length ? t : toggle;
    const tema = temaPedido(t.dataset.docsOpen || '');
    /* Repetir el mismo enlace cierra el panel; pedir otro tema lo cambia sin cerrarlo. Con teclado, el foco va al tema */
    if (open && tema && tema !== actual) { elegir(tema); return; }
    setOpen(!open, { focus: e.detail === 0, tema: tema || undefined });
  }));
  /* Enlaces que llegan desde otra página: …#ayuda abre el panel; …#normativa, en la normativa */
  const HASH = { '#ayuda': undefined, '#documentos': undefined, '#guias': undefined, '#checklist': 'checklists', '#checklists': 'checklists', '#normativa': 'normativa' };
  const fromHash = () => {
    if (!(location.hash in HASH)) return;
    setOpen(true, { tema: HASH[location.hash] });
    history.replaceState(history.state, '', location.pathname + location.search);
  };
  fromHash();
  addEventListener('hashchange', fromHash);

  temas.forEach((b) => b.addEventListener('click', () => elegir(b.getAttribute('aria-expanded') === 'true' ? null : b.dataset.ayuTema)));
  volverTemas?.addEventListener('click', () => {
    const antes = actual;
    elegir(null);
    temaDe(antes)?.focus({ preventScroll: true });
  });
  /* Teclado: ↑ ↓ recorren los temas */
  panel.addEventListener('keydown', (e) => {
    const k = temas.indexOf(d.activeElement);
    if (k < 0 || !['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    temas[(k + (e.key === 'ArrowDown' ? 1 : -1) + temas.length) % temas.length].focus();
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
})();
