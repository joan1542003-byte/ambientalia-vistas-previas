/* Comportamiento compartido de los tres sitios. */
(() => {
  const d = document;
  const WHATSAPP = '56986067930';
  const motion = matchMedia('(prefers-reduced-motion: no-preference)');
  window.SITE = { whatsapp: (text) => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}` };

  /* Header */
  const header = d.querySelector('.site-header');
  const onScroll = () => header?.classList.toggle('is-scrolled', scrollY > 4);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* Menú móvil */
  const toggle = d.querySelector('.menu-toggle');
  const nav = d.getElementById('nav');
  if (toggle && nav) {
    const setOpen = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
      nav.classList.toggle('is-open', open);
    };
    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    d.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('is-open')) { setOpen(false); toggle.focus(); } });
    matchMedia('(min-width: 861px)').addEventListener('change', () => setOpen(false));
  }

  /* Sección activa en la navegación */
  const navLinks = [...d.querySelectorAll('#nav a[href^="#"]:not(.btn)')];
  if ('IntersectionObserver' in window && navLinks.length) {
    const visible = new Set();
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id)));
      const current = navLinks.map((a) => a.hash.slice(1)).filter((id) => visible.has(id)).pop();
      navLinks.forEach((a) => (a.hash.slice(1) === current ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
    }, { rootMargin: '-45% 0px -50% 0px' });
    navLinks.forEach((a) => { const el = d.getElementById(a.hash.slice(1)); if (el) spy.observe(el); });
  }

  /* Aparición al entrar en pantalla */
  const revealables = d.querySelectorAll('.reveal, .reveal-group');
  d.querySelectorAll('.reveal-group').forEach((g) => [...g.children].forEach((c, i) => c.style.setProperty('--i', Math.min(i, 6))));
  if ('IntersectionObserver' in window && motion.matches) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -6% 0px' });
    revealables.forEach((el) => io.observe(el));
  } else {
    revealables.forEach((el) => el.classList.add('is-in'));
  }

  /* Acordeones con altura animada */
  d.querySelectorAll('.accordion details').forEach((det) => {
    const summary = det.querySelector('summary');
    let anim = null;
    summary.addEventListener('click', (e) => {
      if (!motion.matches || !det.animate) return;
      e.preventDefault();
      anim?.cancel();
      const closing = det.open;
      const start = det.offsetHeight;
      det.open = !closing;
      const end = det.offsetHeight;
      if (closing) det.open = true;
      det.classList.add('is-animating');
      det.classList.toggle('is-opening', !closing);
      anim = det.animate({ height: [`${start}px`, `${end}px`] }, { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)' });
      const done = () => { det.classList.remove('is-animating', 'is-opening'); anim = null; };
      anim.onfinish = () => { if (closing) det.open = false; done(); };
      anim.oncancel = done;
    });
  });

  /* Pestañas: radios name=X dentro de [data-tabs] y paneles [data-tab-panel="valor"] */
  d.querySelectorAll('[data-tabs]').forEach((tabs) => {
    const panels = [...tabs.querySelectorAll('[data-tab-panel]')];
    const show = () => {
      const value = tabs.querySelector('input[type="radio"]:checked')?.value;
      panels.forEach((p) => { p.hidden = p.dataset.tabPanel !== value; });
    };
    tabs.addEventListener('change', (e) => { if (e.target.type === 'radio') show(); });
    show();
  });

  /* Campos condicionales: data-show-when="campo=valor1,valor2" */
  const conditionals = [...d.querySelectorAll('[data-show-when]')];
  const applyConditionals = () => conditionals.forEach((el) => {
    const [name, values] = el.dataset.showWhen.split('=');
    const field = d.querySelector(`[name="${name}"]:checked, select[name="${name}"]`);
    const on = values.split(',').includes(field?.value);
    el.hidden = !on;
    el.querySelectorAll('input, select, textarea').forEach((f) => { f.disabled = !on; });
  });
  if (conditionals.length) { d.addEventListener('change', applyConditionals); applyConditionals(); }

  /* Enlaces que preseleccionan campos: data-set="campo=valor;campo2=valor2" */
  d.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-set]');
    if (!trigger) return;
    trigger.dataset.set.split(';').forEach((pair) => {
      const [name, value] = pair.split('=');
      d.querySelectorAll(`[name="${name}"]`).forEach((field) => {
        if (field.type === 'radio' || field.type === 'checkbox') field.checked = field.value === value;
        else field.value = value;
        field.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
  });

  /* Enlaces de WhatsApp con texto dinámico: data-wa="Texto con {#id-de-campo}" */
  d.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-wa]');
    if (!link) return;
    const text = link.dataset.wa.replace(/\{#([\w-]+)\}/g, (m, id) => {
      const f = d.getElementById(id);
      return f ? (f.tagName === 'SELECT' ? f.selectedOptions[0]?.textContent : f.value).trim() : '';
    });
    link.href = window.SITE.whatsapp(text.replace(/\\n/g, '\n'));
  });

  /* Formularios que preparan un resumen para WhatsApp */
  const labelFor = (field) => {
    if (field.dataset.label) return field.dataset.label;
    if (field.type === 'radio') return field.closest('fieldset, .field')?.querySelector('legend, .label')?.textContent.trim();
    return field.labels?.[0]?.textContent.replace(/\(opcional\)/i, '').trim() || field.name;
  };
  const valueOf = (field) => {
    if (field.tagName === 'SELECT') return field.value === '' ? '' : field.selectedOptions[0]?.textContent.trim() || '';
    if (field.type === 'radio') { const l = field.closest('label'); return (l?.querySelector('strong') || l?.querySelector('span'))?.textContent.trim() || field.value; }
    if (field.type === 'date' && field.value) return field.value.split('-').reverse().join('-');
    return field.value.trim();
  };
  d.querySelectorAll('form[data-summary]').forEach((form) => {
    const out = d.getElementById(form.dataset.summary);
    const pre = out?.querySelector('pre');
    const send = out?.querySelector('[data-send]');
    const copy = out?.querySelector('[data-copy]');
    const status = out?.querySelector('.status');
    const required = [...form.querySelectorAll('[required]')];
    required.forEach((f) => f.addEventListener('input', () => { f.setCustomValidity(''); f.removeAttribute('aria-invalid'); }));
    form.addEventListener('invalid', (e) => e.target.setAttribute('aria-invalid', 'true'), true);
    form.addEventListener('input', () => { if (out) out.hidden = true; });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      required.forEach((f) => { if (f.type !== 'radio') f.setCustomValidity(f.value.trim() ? '' : 'Completa este dato.'); });
      if (!form.reportValidity()) return;
      const lines = [`*${form.dataset.title || 'Consulta'}*`];
      const seen = new Set();
      form.querySelectorAll('fieldset').forEach((fs) => {
        const rows = [];
        fs.querySelectorAll('[name]').forEach((field) => {
          if (seen.has(field.name) || field.disabled) return;
          if (field.type === 'radio' && !field.checked) return;
          seen.add(field.name);
          const value = valueOf(field);
          if (value) rows.push(`• ${labelFor(field)}: ${value}`);
        });
        if (rows.length) lines.push('', `*${fs.querySelector('legend')?.textContent.trim() || ''}*`, ...rows);
      });
      if (form.dataset.closing) lines.push('', form.dataset.closing);
      const text = lines.join('\n');
      if (!out) return;
      pre.textContent = text.replaceAll('*', '');
      send.href = window.SITE.whatsapp(text);
      out.hidden = false;
      if (status) status.textContent = '';
      out.scrollIntoView({ behavior: motion.matches ? 'smooth' : 'auto', block: 'nearest' });
      send.focus({ preventScroll: true });
    });
    copy?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(pre.textContent); status.textContent = 'Resumen copiado.'; }
      catch { status.textContent = 'No se pudo copiar. Selecciona el texto y cópialo manualmente.'; }
    });
  });

  /* Barra de acción en móvil */
  const dock = d.querySelector('.dock');
  if (dock) {
    const blockers = new Set();
    const hero = d.querySelector('.hero');
    const refresh = () => {
      const past = hero ? hero.getBoundingClientRect().bottom < 80 : scrollY > innerHeight * .6;
      const show = past && blockers.size === 0 && !nav?.classList.contains('is-open');
      dock.classList.toggle('is-visible', show);
      dock.inert = !show;
    };
    if ('IntersectionObserver' in window) {
      const watch = new IntersectionObserver((entries) => {
        entries.forEach((e) => (e.isIntersecting ? blockers.add(e.target) : blockers.delete(e.target)));
        refresh();
      });
      d.querySelectorAll('[data-hide-dock], .site-footer').forEach((el) => watch.observe(el));
    }
    addEventListener('scroll', refresh, { passive: true });
    toggle?.addEventListener('click', () => setTimeout(refresh));
    refresh();
  }
})();
