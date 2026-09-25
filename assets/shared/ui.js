/*
  Capa compartida de interacción para las vistas previas.
  Configuración por página con atributos en <body>:
    data-ui-cta-label, data-ui-cta-href  → botón principal de la barra móvil
    data-ui-chat-text                    → mensaje inicial de WhatsApp
*/
(() => {
  const d = document;
  const root = d.documentElement;
  const body = d.body;
  const motion = matchMedia('(prefers-reduced-motion: no-preference)');
  const canObserve = 'IntersectionObserver' in window;
  const WHATSAPP = '56986067930';

  /* Progreso de lectura y header */
  const header = d.querySelector('.header');
  const bar = d.createElement('div');
  bar.className = 'ui-progress';
  bar.setAttribute('aria-hidden', 'true');
  body.prepend(bar);
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const max = root.scrollHeight - innerHeight;
      bar.style.setProperty('--ui-p', max > 0 ? Math.min(1, scrollY / max).toFixed(4) : 0);
      header?.classList.toggle('ui-scrolled', scrollY > 8);
    });
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* Navegación: marca la sección visible */
  const links = [...d.querySelectorAll('.nav a[href^="#"]:not(.nav-cta)')];
  if (canObserve && links.length) {
    const byId = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
    const visible = new Set();
    const spy = new IntersectionObserver(entries => {
      entries.forEach(e => (e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id)));
      const current = [...byId.keys()].filter(id => visible.has(id)).pop();
      links.forEach(a => {
        const on = a === byId.get(current);
        a.classList.toggle('ui-current', on);
        on ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current');
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    byId.forEach((_, id) => { const el = d.getElementById(id); if (el) spy.observe(el); });
  }

  /* Entrada del hero */
  if (motion.matches) {
    const intro = [...d.querySelectorAll('.experience-intro h1, .experience-intro p, .experience-intro .hero-actions, .experience-routes > *, .hero-copy > *')];
    intro.forEach((el, i) => {
      el.style.setProperty('--ui-i', Math.min(i, 8));
      el.classList.add(el.tagName === 'H1' ? 'ui-intro-soft' : 'ui-intro');
      el.addEventListener('animationend', () => el.classList.remove('ui-intro', 'ui-intro-soft'), { once: true });
    });
    d.querySelectorAll('.experience-cover, .hero-photo > img').forEach(img => img.classList.add('ui-settle'));
  }

  /* Tarjetas que aparecen escalonadas */
  const groups = [...d.querySelectorAll('.service-grid, .support-services-grid, .transport-law-grid, .legal-grid, .law-links, .ecosystem-grid, .flow-steps, .picker-options')]
    .filter(g => g.children.length > 1 && !g.closest('.experience-workspace'));
  if (canObserve && motion.matches && groups.length) {
    const reveal = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const g = entry.target;
        reveal.unobserve(g);
        g.classList.add('ui-in');
        // Al terminar se quitan las clases para que el hover no herede el retraso.
        setTimeout(() => g.classList.remove('ui-stagger', 'ui-in'), 900 + g.children.length * 70);
      });
    }, { rootMargin: '0px 0px -4% 0px' });
    groups.forEach(g => {
      [...g.children].forEach((c, i) => c.style.setProperty('--ui-i', Math.min(i, 6)));
      g.classList.add('ui-stagger');
      reveal.observe(g);
    });
  }

  /* Imágenes diferidas */
  d.querySelectorAll('img[loading="lazy"]').forEach(img => {
    if (img.complete && img.naturalWidth) return;
    img.classList.add('ui-img');
    const done = () => img.classList.add('ui-loaded');
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
  });

  /* Details con apertura y cierre suaves */
  d.querySelectorAll('details').forEach(det => {
    const summary = det.querySelector(':scope > summary');
    if (!summary) return;
    let anim = null;
    summary.addEventListener('click', event => {
      if (!motion.matches || !det.animate || det.hidden) return;
      event.preventDefault();
      anim?.cancel();
      const closing = det.open;
      const start = det.offsetHeight;
      det.open = !closing;
      const end = det.offsetHeight;
      if (closing) det.open = true;
      det.classList.add('ui-animating');
      det.classList.toggle('ui-opening', !closing);
      anim = det.animate({ height: [start + 'px', end + 'px'] }, {
        duration: Math.max(240, Math.min(520, Math.abs(end - start) * 1.1)),
        easing: 'cubic-bezier(.22,1,.36,1)'
      });
      const finish = () => { det.classList.remove('ui-animating', 'ui-opening'); anim = null; };
      anim.onfinish = () => { if (closing) det.open = false; finish(); };
      anim.oncancel = finish;
    });
  });

  /* Carruseles en móvil */
  d.querySelectorAll('.support-services-grid, .hds-services, #servicios .service-grid:not(.transport-services)').forEach(track => {
    const items = [...track.children];
    if (items.length < 3) return;
    track.classList.add('ui-carousel');
    const dots = d.createElement('div');
    dots.className = 'ui-dots';
    dots.setAttribute('aria-hidden', 'true');
    items.forEach(() => dots.append(d.createElement('span')));
    track.after(dots);
    const update = () => {
      const step = items[1] ? items[1].offsetLeft - items[0].offsetLeft : track.clientWidth;
      const index = step > 0 ? Math.round(track.scrollLeft / step) : 0;
      [...dots.children].forEach((dot, i) => dot.classList.toggle('ui-on', i === Math.min(index, items.length - 1)));
    };
    track.addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });
    addEventListener('resize', update);
    update();
  });

  /* Barra de acción en móvil */
  const label = body.dataset.uiCtaLabel;
  if (label) {
    const dock = d.createElement('nav');
    dock.className = 'ui-dock';
    dock.setAttribute('aria-label', 'Acciones rápidas');
    const primary = d.createElement('a');
    primary.className = 'ui-dock-primary';
    primary.href = body.dataset.uiCtaHref || '#contacto';
    primary.textContent = label;
    const chat = d.createElement('a');
    chat.className = 'ui-dock-chat';
    chat.href = 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(body.dataset.uiChatText || 'Hola, quiero hacer una consulta.');
    chat.target = '_blank';
    chat.rel = 'noopener noreferrer';
    chat.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.5L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5z"/></svg><span>WhatsApp</span>';
    chat.setAttribute('aria-label', 'Escribir por WhatsApp (abre una pestaña nueva)');
    dock.append(primary, chat);
    dock.inert = true;
    body.append(dock);

    const blockers = new Set();
    const nav = d.querySelector('.nav');
    const refresh = () => {
      const show = scrollY > innerHeight * .7 && blockers.size === 0 && !nav?.classList.contains('open');
      dock.classList.toggle('ui-show', show);
      dock.inert = !show;
    };
    if (canObserve) {
      const watch = new IntersectionObserver(entries => {
        entries.forEach(e => (e.isIntersecting ? blockers.add(e.target) : blockers.delete(e.target)));
        refresh();
      });
      d.querySelectorAll('#contacto, .footer').forEach(el => watch.observe(el));
    }
    addEventListener('scroll', refresh, { passive: true });
    d.querySelector('.menu')?.addEventListener('click', () => setTimeout(refresh));
    refresh();
  }
})();
