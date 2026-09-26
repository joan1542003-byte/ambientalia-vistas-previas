/* Comportamiento compartido de los tres sitios. */
(() => {
  const d = document;
  const WHATSAPP = '56986067930';
  const motion = matchMedia('(prefers-reduced-motion: no-preference)');
  const smooth = () => (motion.matches ? 'smooth' : 'auto');
  window.SITE = { whatsapp: (text) => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}` };

  /* Aviso breve */
  const toast = d.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  d.body.append(toast);
  let toastTimer;
  window.SITE.toast = (text) => {
    toast.textContent = text;
    toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-on'), 2200);
  };
  /* Confirmación en el propio botón: el ícono pasa a ✓ y el texto a «Copiado» por un momento */
  window.SITE.done = (btn, text = 'Copiado') => {
    const target = btn.querySelector('span:not(.sr-only)');
    if (!target || btn.classList.contains('is-done')) return;
    const label = target.textContent;
    btn.classList.add('is-done'); target.textContent = text;
    setTimeout(() => { btn.classList.remove('is-done'); target.textContent = label; }, 1600);
  };

  /* iOS solo aplica :active al tocar si la página escucha touchstart; el estado presionado reemplaza al resaltado gris */
  d.addEventListener('touchstart', () => {}, { passive: true });

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

  /* Animación al entrar en pantalla. Lo que ya se ve al cargar queda quieto y visible. */
  d.querySelectorAll('.reveal-group').forEach((g) => [...g.children].forEach((c, i) => c.style.setProperty('--i', Math.min(i, 6))));
  if ('IntersectionObserver' in window && motion.matches) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px 40px 0px' });
    d.querySelectorAll('.reveal, .reveal-group').forEach((el) => {
      if (el.getBoundingClientRect().top < innerHeight) return;
      io.observe(el);
    });
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

  /* Pestañas: radios dentro de [data-tabs] y paneles [data-tab-panel="valor"] */
  d.querySelectorAll('[data-tabs]').forEach((tabs) => {
    const panels = [...tabs.querySelectorAll('[data-tab-panel]')];
    const show = () => {
      const value = tabs.querySelector('input[type="radio"]:checked')?.value;
      panels.forEach((p) => { p.hidden = p.dataset.tabPanel !== value; });
    };
    tabs.addEventListener('change', (e) => { if (e.target.type === 'radio' && !e.target.closest('[data-tab-panel]')) show(); });
    show();
  });

  /* Campos condicionales: data-show-when="campo=valor1,valor2" */
  const conditionals = [...d.querySelectorAll('[data-show-when]')];
  const applyConditionals = () => conditionals.forEach((el) => {
    const [name, values] = el.dataset.showWhen.split('=');
    const field = d.querySelector(`[name="${name}"]:checked, select[name="${name}"], input[type="hidden"][name="${name}"]`);
    const on = values.split(',').includes(field?.value);
    el.hidden = !on;
    el.querySelectorAll('input, select, textarea').forEach((f) => { f.disabled = !on; });
  });
  if (conditionals.length) d.addEventListener('change', applyConditionals);
  applyConditionals();

  /* Indicador que se desliza hacia la opción elegida en los controles segmentados */
  const glides = new Set();
  const placeGlide = (group, instant) => {
    const pill = group.querySelector(':scope > .glide');
    const on = group.querySelector('input:checked')?.closest('label');
    if (!pill) return;
    if (!on || !on.offsetWidth) { pill.style.opacity = '0'; return; }
    if (instant) pill.style.transition = 'none';
    pill.style.opacity = '1';
    pill.style.width = `${on.offsetWidth}px`;
    pill.style.height = `${on.offsetHeight}px`;
    pill.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
    if (instant) { void pill.offsetWidth; pill.style.transition = ''; }
  };
  const initGlide = (group) => {
    if (glides.has(group)) { placeGlide(group, true); return; }
    glides.add(group);
    const pill = d.createElement('i');
    pill.className = 'glide';
    pill.setAttribute('aria-hidden', 'true');
    group.prepend(pill);
    group.classList.add('has-glide');
    group.addEventListener('change', () => placeGlide(group));
    placeGlide(group, true);
  };
  const refreshGlides = () => d.querySelectorAll('.segmented').forEach(initGlide);
  refreshGlides();
  if ('ResizeObserver' in window) new ResizeObserver(() => glides.forEach((g) => placeGlide(g, true))).observe(d.body);
  window.SITE.refresh = () => { applyConditionals(); refreshGlides(); };

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
    const form = d.querySelector(trigger.getAttribute('href'))?.querySelector('form[data-steps]');
    form?.goTo?.(0);
  });

  /* Enlaces de WhatsApp con texto dinámico: data-wa="Texto con {#id-de-campo}" */
  d.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-wa]');
    if (!link) return;
    const text = link.dataset.wa.replace(/\{#([\w-]+)\}/g, (m, id) => {
      const f = d.getElementById(id);
      return f ? (f.tagName === 'SELECT' ? f.selectedOptions[0]?.textContent : f.value).trim() : '';
    });
    link.href = window.SITE.whatsapp(text);
  });

  /* Formularios que preparan un resumen para WhatsApp (con pasos opcionales: data-steps) */
  const labelFor = (field) => {
    if (field.dataset.label) return field.dataset.label;
    if (field.type === 'radio' || field.type === 'checkbox') return field.closest('fieldset, .field')?.querySelector('.label, legend')?.textContent.replace(/\(opcional\)/i, '').trim();
    return field.labels?.[0]?.textContent.replace(/\(opcional\)/i, '').trim() || field.name;
  };
  const valueOf = (field) => {
    if (field.type === 'hidden') return (field.dataset.text || field.value).trim();
    if (field.tagName === 'SELECT') return field.value === '' ? '' : field.selectedOptions[0]?.textContent.trim() || '';
    if (field.type === 'radio' || field.type === 'checkbox') {
      if (field.dataset.text) return field.dataset.text;
      const l = field.closest('label');
      return (l?.querySelector('strong') || l?.querySelector('span'))?.textContent.trim() || field.value;
    }
    if (field.type === 'date' && field.value) return field.value.split('-').reverse().join('-');
    if (field.dataset.suffix && field.value.trim()) {
      const unit = field.form?.querySelector(`[name="${field.dataset.suffix}"]:checked`);
      return `${field.value.trim()} ${unit ? valueOf(unit) : ''}`.trim();
    }
    return field.value.trim();
  };
  const validate = (scope) => {
    const fields = [...scope.querySelectorAll('input, select, textarea')].filter((f) => !f.disabled);
    fields.forEach((f) => { if (f.required && f.type !== 'radio') f.setCustomValidity(f.value.trim() ? '' : 'Completa este dato.'); });
    /* Grupos de casillas que exigen al menos una opción: [data-required-group] */
    scope.querySelectorAll('[data-required-group]').forEach((g) => {
      const boxes = [...g.querySelectorAll('input')].filter((f) => !f.disabled);
      if (!boxes.length) return;
      const ok = boxes.some((f) => f.checked);
      boxes[0].setCustomValidity(ok ? '' : 'Elige al menos una opción.');
      g.toggleAttribute('data-invalid', !ok);
    });
    /* Campos que se eligen en una ventana: [data-required-pick="nombre-del-campo-oculto"] */
    const picks = [...scope.querySelectorAll('[data-required-pick]')].filter((p) => !p.closest('[data-show-when][hidden]'));
    const badPicks = picks.filter((p) => {
      const ok = Boolean(p.querySelector(`[name="${p.dataset.requiredPick}"]`)?.value.trim());
      p.toggleAttribute('data-invalid', !ok);
      return !ok;
    });
    fields.forEach((f) => (f.checkValidity() ? f.removeAttribute('aria-invalid') : f.setAttribute('aria-invalid', 'true')));
    return [...fields.filter((f) => !f.checkValidity()), ...badPicks]
      .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))[0];
  };
  /* Muestra el error: burbuja nativa en campos; en campos de ventana, marca la fila y la enfoca */
  const report = (bad) => {
    if (!bad.matches('[data-required-pick]')) { bad.reportValidity(); return; }
    bad.scrollIntoView({ behavior: smooth(), block: 'nearest' });
    bad.querySelector('button')?.focus({ preventScroll: true });
  };

  d.querySelectorAll('form[data-summary]').forEach((form) => {
    const out = d.getElementById(form.dataset.summary);
    const pre = out?.querySelector('pre');
    const send = out?.querySelector('[data-send]');
    const copy = out?.querySelector('[data-copy]');
    const edit = out?.querySelector('[data-edit]');
    form.addEventListener('change', (e) => {
      const g = e.target.closest('[data-required-group]');
      if (g && e.target.checked) { g.removeAttribute('data-invalid'); g.querySelectorAll('input').forEach((f) => f.setCustomValidity('')); }
    });
    form.addEventListener('input', (e) => {
      if (out && !edit) out.hidden = true;
      if (e.target.getAttribute('aria-invalid') && e.target.checkValidity()) e.target.removeAttribute('aria-invalid');
      e.target.setCustomValidity?.('');
    });

    /* Lleva la vista al formulario sin mover la página si ya está a la vista.
       Dentro de un contenedor con scroll propio ([data-scroll-root]) solo vuelve ese contenedor al inicio. */
    const bring = (el) => {
      const box = el.querySelector('[data-scroll-root]') || el.closest('[data-scroll-root]');
      if (box) box.scrollTo({ top: 0, behavior: smooth() });
      const top = el.getBoundingClientRect().top;
      if (top < 64 || top > innerHeight - 160) el.scrollIntoView({ behavior: smooth(), block: 'start' });
    };
    /* form.transition(update) permite acompañar el cambio (p. ej., animar el alto del contenedor); por defecto es inmediato */
    const run = (update, dir) => Promise.resolve(form.transition ? form.transition(update, dir) : update());

    /* Pasos: [data-step-panel] o, si no hay, los fieldset directos del formulario */
    const marked = [...form.querySelectorAll('[data-step-panel]')];
    const steps = form.hasAttribute('data-steps') ? (marked.length ? marked : [...form.querySelectorAll(':scope > fieldset')]) : [];
    let current = 0;
    if (steps.length) {
      const labels = form.querySelectorAll('.stepper-labels > *');
      const bar = form.querySelector('.stepper-bar i');
      const back = form.querySelector('[data-back]');
      const next = form.querySelector('[data-next]');
      const submit = form.querySelector('[type="submit"]');
      const counter = form.querySelector('[data-step-count]');
      const paint = (dir, animate) => {
        steps.forEach((s, n) => {
          s.hidden = n !== current;
          s.classList.remove('is-entering', 'is-entering-back');
        });
        if (animate) steps[current].classList.add(dir > 0 ? 'is-entering' : 'is-entering-back');
        labels.forEach((l, n) => {
          l.classList.toggle('is-done', n < current); l.classList.toggle('is-current', n === current);
          if (l.tagName === 'BUTTON') { l.disabled = n > current; l.setAttribute('aria-current', n === current ? 'step' : 'false'); }
        });
        if (bar) bar.style.setProperty('--p', `${((current + 1) / steps.length) * 100}%`);
        if (counter) counter.textContent = `Paso ${current + 1} de ${steps.length}`;
        back.hidden = current === 0;
        next.hidden = current === steps.length - 1;
        submit.hidden = current !== steps.length - 1;
        window.SITE.refresh?.();
      };
      form.goTo = (i, dir = 1) => {
        const target = Math.max(0, Math.min(steps.length - 1, i));
        const changed = target !== current;
        current = target;
        if (!changed) { paint(dir, false); return Promise.resolve(); }
        return run(() => paint(dir, true), dir);
      };
      const move = (i, dir) => form.goTo(i, dir).then(() => {
        bring(form);
        if (dir > 0) steps[current].querySelector('input:not([type="radio"]):not([type="checkbox"]), select, textarea, input:checked, input')?.focus({ preventScroll: true });
      });
      next.addEventListener('click', () => {
        const bad = validate(steps[current]);
        if (bad) { report(bad); return; }
        move(current + 1, 1);
      });
      back.addEventListener('click', () => move(current - 1, -1));
      /* Volver a un paso anterior desde la barra de pasos */
      labels.forEach((l, n) => l.tagName === 'BUTTON' && l.addEventListener('click', () => { if (n < current) move(n, -1); }));
      /* Enter en un campo avanza al paso siguiente en vez de enviar */
      form.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.defaultPrevented || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON' || current === steps.length - 1) return;
        if (e.target.matches('input, select')) { e.preventDefault(); next.click(); }
      });
      paint(1, false);
    }

    const summaryOf = () => {
      const lines = [`*${form.dataset.title || 'Consulta'}*`];
      const seen = new Set();
      form.querySelectorAll('fieldset').forEach((fs) => {
        const rows = [];
        fs.querySelectorAll('[name]').forEach((field) => {
          if (seen.has(field.name) || field.disabled || 'summarySkip' in field.dataset) return;
          if (field.type === 'radio' && !field.checked) return;
          if (field.type === 'checkbox') {
            seen.add(field.name);
            const on = [...fs.querySelectorAll(`[name="${field.name}"]:checked:not(:disabled)`)].map(valueOf);
            if (on.length) rows.push(`• ${labelFor(field)}: ${on.join(', ')}`);
            return;
          }
          seen.add(field.name);
          const value = valueOf(field);
          if (value) rows.push(`• ${labelFor(field)}: ${value}`);
        });
        if (rows.length) lines.push('', `*${fs.dataset.summaryTitle || fs.querySelector('legend')?.textContent.trim() || ''}*`, ...rows);
      });
      if (form.dataset.closing) lines.push('', form.dataset.closing);
      return lines.join('\n');
    };

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const bad = validate(form);
      if (bad) {
        const step = steps.findIndex((s) => s.contains(bad));
        const show = step > -1 && step !== current ? form.goTo(step, -1) : Promise.resolve();
        show.then(() => requestAnimationFrame(() => report(bad)));
        return;
      }
      const text = summaryOf();
      if (!out) return;
      run(() => {
        pre.textContent = text.replaceAll('*', '');
        send.href = window.SITE.whatsapp(text);
        out.hidden = false;
        if (edit) form.hidden = true;
        out.classList.toggle('is-shown', !form.transition);
      }, 1).then(() => {
        if (edit) bring(out); else out.scrollIntoView({ behavior: smooth(), block: 'nearest' });
        send.focus({ preventScroll: true });
      });
    });
    edit?.addEventListener('click', () => {
      run(() => { out.hidden = true; form.hidden = false; }, -1).then(() => {
        bring(form);
        form.querySelector('[data-next]:not([hidden]), [type="submit"]:not([hidden])')?.focus({ preventScroll: true });
      });
    });
    copy?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pre.textContent); window.SITE.toast('Resumen copiado');
        window.SITE.done(copy);
      }
      catch {
        const range = d.createRange(); range.selectNodeContents(pre);
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
        window.SITE.toast('Texto seleccionado: cópialo con Ctrl+C');
      }
    });
  });

  /* Burbuja de ayuda: aparece al pasar el hero y se oculta sobre el pie de página. Al abrirla se expande
     (CSS: vidrio líquido) y muestra las acciones; se cierra al elegir una, al tocar fuera o con Escape. */
  const dock = d.querySelector('[data-dock]');
  if (dock) {
    const button = dock.querySelector('.dock-toggle');
    const menu = dock.querySelector('.dock-menu');
    const blockers = new Set();
    const hero = d.querySelector('.hero');
    let open = false;
    /* El tamaño abierto sale del propio menú, así la animación termina justo en su borde */
    const measure = () => {
      dock.style.setProperty('--dock-w', `${menu.offsetWidth}px`);
      dock.style.setProperty('--dock-h', `${menu.offsetHeight}px`);
    };
    const setOpen = (next, { focus = false } = {}) => {
      if (next === open) return;
      open = next;
      if (open) measure();
      dock.classList.toggle('is-open', open);
      button.setAttribute('aria-expanded', String(open));
      menu.inert = !open;
      if (!open && focus) button.focus();
    };
    const refresh = () => {
      const past = hero ? hero.getBoundingClientRect().bottom < 80 : scrollY > innerHeight * .6;
      const show = past && blockers.size === 0 && !nav?.classList.contains('is-open');
      if (!show) setOpen(false);
      dock.classList.toggle('is-visible', show);
      dock.inert = !show;
    };
    menu.inert = true;
    button.addEventListener('click', () => setOpen(!open));
    menu.addEventListener('click', (e) => { if (e.target.closest('a, button')) setOpen(false); });
    d.addEventListener('pointerdown', (e) => { if (open && !dock.contains(e.target)) setOpen(false); });
    d.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') setOpen(false, { focus: true }); });
    addEventListener('resize', () => { if (open) measure(); });
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
