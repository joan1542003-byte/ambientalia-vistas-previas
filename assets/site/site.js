/* Comportamiento compartido de los tres sitios. */
(() => {
  const d = document;
  const WHATSAPP = '56986067930';
  const motion = matchMedia('(prefers-reduced-motion: no-preference)');
  const phone = matchMedia('(max-width: 760px)');
  const smooth = () => (motion.matches ? 'smooth' : 'auto');
  const EASE = 'cubic-bezier(.22,1,.36,1)';
  const ICON = {
    close: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
    prev: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3.5L5.5 8l4.5 4.5"/></svg>',
    next: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5"/></svg>',
    x: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 5l6 6M11 5l-6 6"/></svg>'
  };
  const SITE = window.SITE = { whatsapp: (text) => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`, motion };

  /* Aviso breve */
  const toast = d.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  d.body.append(toast);
  let toastTimer;
  SITE.toast = (text) => {
    toast.textContent = text;
    toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-on'), 2200);
  };

  /* Cambios de altura suaves: mide, aplica el cambio y anima desde la altura anterior */
  SITE.morph = (el, mutate, duration = 440) => {
    if (!el || !motion.matches || !el.animate || !el.getClientRects().length) { mutate(); return; }
    const from = el.getBoundingClientRect().height;
    mutate();
    const to = el.getBoundingClientRect().height;
    if (Math.abs(to - from) < 2) return;
    el.style.overflow = 'clip';
    const anim = el.animate({ height: [`${from}px`, `${to}px`] }, { duration, easing: EASE });
    anim.onfinish = anim.oncancel = () => { el.style.overflow = ''; };
  };
  SITE.shake = (el) => {
    if (!el || !motion.matches) return;
    el.classList.remove('is-shaking');
    void el.offsetWidth;
    el.classList.add('is-shaking');
    el.addEventListener('animationend', () => el.classList.remove('is-shaking'), { once: true });
  };

  /* Header */
  const header = d.querySelector('.site-header');
  const onScroll = () => header?.classList.toggle('is-scrolled', scrollY > 8);
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
    d.addEventListener('click', (e) => { if (nav.classList.contains('is-open') && !e.target.closest('.site-header')) setOpen(false); });
    d.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('is-open')) { setOpen(false); toggle.focus(); } });
    matchMedia('(min-width: 861px)').addEventListener('change', () => setOpen(false));
  }

  /* Sección activa en la navegación */
  const navLinks = [...d.querySelectorAll('#nav a[href^="#"]:not(.btn):not([data-open])')];
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
      anim = det.animate({ height: [`${start}px`, `${end}px`] }, { duration: 380, easing: EASE });
      const done = () => { det.classList.remove('is-animating', 'is-opening'); anim = null; };
      anim.onfinish = () => { if (closing) det.open = false; done(); };
      anim.oncancel = done;
    });
  });

  /* Controles segmentados: indicador que se desliza hasta la opción elegida */
  const placeThumb = (seg, animate) => {
    const thumb = seg.querySelector(':scope > .thumb');
    const label = seg.querySelector('input:checked')?.closest('label');
    if (!thumb) return;
    if (!label || !label.offsetWidth) { thumb.style.opacity = label ? '' : '0'; return; }
    thumb.style.opacity = '';
    if (!animate) thumb.classList.remove('is-live');
    thumb.style.setProperty('--x', `${label.offsetLeft}px`);
    thumb.style.setProperty('--w', `${label.offsetWidth}px`);
    if (!animate) { void thumb.offsetWidth; requestAnimationFrame(() => thumb.classList.add('is-live')); }
    if (seg.scrollWidth > seg.clientWidth + 2) {
      seg.scrollTo({ left: label.offsetLeft - (seg.clientWidth - label.offsetWidth) / 2, behavior: animate ? smooth() : 'auto' });
    }
  };
  const segments = [...d.querySelectorAll('.segmented')];
  const segObserver = 'ResizeObserver' in window ? new ResizeObserver((entries) => entries.forEach((e) => placeThumb(e.target, false))) : null;
  segments.forEach((seg) => {
    const thumb = d.createElement('i');
    thumb.className = 'thumb';
    thumb.setAttribute('aria-hidden', 'true');
    seg.prepend(thumb);
    seg.classList.add('has-thumb');
    placeThumb(seg, false);
    segObserver?.observe(seg);
  });
  d.fonts?.ready.then(() => segments.forEach((s) => placeThumb(s, false)));
  d.addEventListener('change', (e) => { const seg = e.target.closest?.('.segmented'); if (seg) placeThumb(seg, true); });

  /* Pestañas: radios dentro de [data-tabs] y paneles [data-tab-panel="valor"] */
  d.querySelectorAll('[data-tabs]').forEach((tabs) => {
    const panels = [...tabs.querySelectorAll('[data-tab-panel]')];
    const show = (animate) => {
      const value = tabs.querySelector('input[type="radio"]:checked')?.value;
      const apply = () => panels.forEach((p) => { p.hidden = p.dataset.tabPanel !== value; });
      if (animate) SITE.morph(tabs, apply, 380); else apply();
    };
    tabs.addEventListener('change', (e) => { if (e.target.type === 'radio' && !e.target.closest('[data-tab-panel]')) show(true); });
    show(false);
  });

  /* ---------- Calendario con selección de uno o varios días ---------- */
  const DAY_NAMES = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const fmtLong = new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const fmtShort = new Intl.DateTimeFormat('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });
  const fmtMonth = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric' });
  const toIso = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  const fromIso = (s) => { const [y, m, day] = s.split('-').map(Number); return new Date(y, m - 1, day); };
  const addDays = (dt, n) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + n);

  function calendar(root) {
    const required = root.hasAttribute('data-required');
    const max = Number(root.dataset.max || 3);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const minDate = () => addDays(today, Number(root.dataset.minOffset || 0));
    const maxDate = new Date(today.getFullYear(), today.getMonth() + 12, 0);
    const multi = () => root.dataset.mode === 'multi';
    let picked = [];
    let view = new Date(minDate().getFullYear(), minDate().getMonth(), 1);

    root.innerHTML = `<div class="cal-head"><button type="button" class="cal-nav" data-step="-1" aria-label="Mes anterior">${ICON.prev}</button><strong aria-live="polite"></strong><button type="button" class="cal-nav" data-step="1" aria-label="Mes siguiente">${ICON.next}</button></div>`
      + `<div class="cal-week" aria-hidden="true">${DAY_NAMES.map((n) => `<span>${n}</span>`).join('')}</div><div class="cal-grid" role="group"></div><div class="cal-foot" aria-live="polite"></div>`;
    const title = root.querySelector('.cal-head strong');
    const [prev, next] = root.querySelectorAll('.cal-nav');
    const grid = root.querySelector('.cal-grid');
    const foot = root.querySelector('.cal-foot');
    const input = Object.assign(d.createElement('input'), { type: 'hidden', name: root.dataset.name });
    input.dataset.label = root.dataset.label || 'Fecha';
    if (required) input.dataset.required = '';
    root.append(input);

    const renderFoot = () => {
      if (multi()) {
        const chips = picked.map((s) => {
          const b = d.createElement('button');
          b.type = 'button'; b.className = 'cal-chip'; b.dataset.remove = s;
          b.setAttribute('aria-label', `Quitar ${fmtLong.format(fromIso(s))}`);
          b.innerHTML = `${fmtShort.format(fromIso(s))}${ICON.x}`;
          return b;
        });
        const hint = d.createElement('span');
        hint.className = 'cal-hint';
        hint.textContent = picked.length ? `${picked.length} de ${max}` : `Elige hasta ${max} fechas posibles.`;
        foot.replaceChildren(...chips, hint);
      } else {
        const hint = d.createElement('span');
        hint.className = 'cal-hint';
        hint.textContent = picked[0] ? fmtLong.format(fromIso(picked[0])) : 'Elige un día en el calendario.';
        foot.replaceChildren(hint);
      }
    };
    const sync = () => {
      picked.sort();
      input.value = picked.join(',');
      input.dataset.display = picked.map((s) => fmtLong.format(fromIso(s))).join(' · ');
      grid.querySelectorAll('.cal-day').forEach((b) => b.setAttribute('aria-pressed', String(picked.includes(b.dataset.iso))));
      renderFoot();
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const render = (dir = 0, focusIso = null) => {
      const y = view.getFullYear(); const m = view.getMonth();
      title.textContent = fmtMonth.format(view);
      grid.setAttribute('aria-label', fmtMonth.format(view));
      prev.disabled = view <= new Date(minDate().getFullYear(), minDate().getMonth(), 1);
      next.disabled = view >= new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
      const cells = [];
      for (let i = 0; i < (view.getDay() + 6) % 7; i++) { const s = d.createElement('span'); s.className = 'cal-day is-blank'; cells.push(s); }
      const days = new Date(y, m + 1, 0).getDate();
      const lo = minDate();
      for (let n = 1; n <= days; n++) {
        const dt = new Date(y, m, n); const iso = toIso(dt);
        const b = d.createElement('button');
        b.type = 'button'; b.className = 'cal-day'; b.textContent = n; b.dataset.iso = iso; b.tabIndex = -1;
        b.setAttribute('aria-label', fmtLong.format(dt));
        b.setAttribute('aria-pressed', String(picked.includes(iso)));
        if (dt < lo || dt > maxDate) b.disabled = true;
        if (+dt === +today) { b.classList.add('is-today'); b.setAttribute('aria-current', 'date'); }
        cells.push(b);
      }
      grid.replaceChildren(...cells);
      const enabled = [...grid.querySelectorAll('.cal-day:not([disabled]):not(.is-blank)')];
      const target = (focusIso && grid.querySelector(`[data-iso="${focusIso}"]:not([disabled])`)) || enabled.find((b) => b.getAttribute('aria-pressed') === 'true') || enabled[0];
      if (target) target.tabIndex = 0;
      if (focusIso) target?.focus();
      if (dir && motion.matches && grid.animate) grid.animate([{ opacity: 0, transform: `translateX(${dir * 18}px)` }, { opacity: 1, transform: 'none' }], { duration: 320, easing: EASE });
    };
    const select = (iso) => {
      if (multi()) {
        if (picked.includes(iso)) picked = picked.filter((s) => s !== iso);
        else if (picked.length >= max) { SITE.toast(`Puedes elegir hasta ${max} fechas.`); SITE.shake(foot); return; }
        else picked.push(iso);
      } else {
        picked = picked[0] === iso && !required ? [] : [iso];
      }
      sync();
    };
    root.addEventListener('click', (e) => {
      const day = e.target.closest('.cal-day:not(.is-blank)');
      if (day && !day.disabled) {
        grid.querySelectorAll('.cal-day').forEach((b) => { b.tabIndex = b === day ? 0 : -1; });
        select(day.dataset.iso);
        return;
      }
      const step = e.target.closest('.cal-nav');
      if (step) { view = new Date(view.getFullYear(), view.getMonth() + Number(step.dataset.step), 1); render(Number(step.dataset.step)); return; }
      const chip = e.target.closest('.cal-chip');
      if (chip) { picked = picked.filter((s) => s !== chip.dataset.remove); sync(); }
    });
    grid.addEventListener('keydown', (e) => {
      const day = e.target.closest('.cal-day');
      if (!day) return;
      const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      let target = null;
      const cur = fromIso(day.dataset.iso);
      if (e.key in moves) target = addDays(cur, moves[e.key]);
      else if (e.key === 'PageUp') target = new Date(cur.getFullYear(), cur.getMonth() - 1, cur.getDate());
      else if (e.key === 'PageDown') target = new Date(cur.getFullYear(), cur.getMonth() + 1, cur.getDate());
      else if (e.key === 'Home') target = addDays(cur, -((cur.getDay() + 6) % 7));
      else if (e.key === 'End') target = addDays(cur, 6 - ((cur.getDay() + 6) % 7));
      if (!target) return;
      e.preventDefault();
      if (target < minDate() || target > maxDate) return;
      const dir = target.getMonth() !== view.getMonth() || target.getFullYear() !== view.getFullYear() ? Math.sign(target - view) : 0;
      if (dir) { view = new Date(target.getFullYear(), target.getMonth(), 1); render(dir, toIso(target)); }
      else { grid.querySelectorAll('.cal-day').forEach((b) => { b.tabIndex = -1; }); const b = grid.querySelector(`[data-iso="${toIso(target)}"]`); if (b) { b.tabIndex = 0; b.focus(); } }
    });
    root.calendar = {
      setMode(mode) {
        if (root.dataset.mode === mode) return;
        root.dataset.mode = mode;
        if (mode !== 'multi' && picked.length > 1) picked = picked.slice(0, 1);
        sync();
      },
      reset() { picked = []; view = new Date(minDate().getFullYear(), minDate().getMonth(), 1); render(); sync(); },
      focus() { (grid.querySelector('.cal-day[tabindex="0"]') || grid.querySelector('.cal-day:not([disabled]):not(.is-blank)'))?.focus(); }
    };
    render();
    renderFoot();
  }
  d.querySelectorAll('[data-calendar]').forEach(calendar);

  /* Campos condicionales: data-show-when="campo=valor1,valor2"; calendarios con data-multi-when */
  const conditionals = [...d.querySelectorAll('[data-show-when]')];
  const multiCals = [...d.querySelectorAll('[data-multi-when]')];
  const fieldValue = (name) => d.querySelector(`[name="${name}"]:checked, select[name="${name}"]`)?.value;
  const applyConditionals = (e) => {
    conditionals.forEach((el) => {
      const [name, values] = el.dataset.showWhen.split('=');
      const on = values.split(',').includes(fieldValue(name));
      if (on === !el.hidden) return;
      const change = () => { el.hidden = !on; el.querySelectorAll('input, select, textarea').forEach((f) => { f.disabled = !on; }); };
      if (e) SITE.morph(el.closest('fieldset') || el.parentElement, change, 380); else change();
    });
    multiCals.forEach((cal) => {
      const [name, values] = cal.dataset.multiWhen.split('=');
      cal.calendar?.setMode(values.split(',').includes(fieldValue(name)) ? 'multi' : 'single');
    });
  };
  if (conditionals.length || multiCals.length) {
    d.addEventListener('change', (e) => { if (e.target.type !== 'hidden') applyConditionals(e); });
    applyConditionals();
  }

  /* ---------- Validación con mensajes en línea ---------- */
  const MSG = { required: 'Completa este dato.', choose: 'Elige una opción.', email: 'Revisa el correo electrónico.', date: 'Elige una fecha en el calendario.' };
  const boxOf = (f) => f.closest('[data-calendar]') || f.closest('.field') || f.parentElement;
  const setError = (box, msg) => {
    let note = box.querySelector(':scope > .field-error');
    if (!msg) { note?.remove(); box.classList.remove('is-invalid'); return; }
    if (!note) { note = d.createElement('p'); note.className = 'field-error'; box.append(note); }
    note.textContent = msg;
    box.classList.add('is-invalid');
  };
  const check = (f, form) => {
    if (f.disabled || f.dataset.skip !== undefined) return '';
    if (f.type === 'hidden') return f.dataset.required !== undefined && !f.value ? MSG.date : '';
    if (f.type === 'radio' || f.type === 'checkbox') {
      if (!f.required) return '';
      return [...form.querySelectorAll(`[name="${f.name}"]`)].some((r) => r.checked) ? '' : MSG.choose;
    }
    if (f.required && !f.value.trim()) return MSG.required;
    if (f.type === 'email' && f.value && !f.checkValidity()) return MSG.email;
    return f.checkValidity() ? '' : (f.validationMessage || MSG.required);
  };
  const validate = (scope, form) => {
    const seen = new Set();
    let first = null;
    scope.querySelectorAll('input, select, textarea').forEach((f) => {
      const key = f.type === 'radio' || f.type === 'checkbox' ? `g:${f.name}` : f;
      if (seen.has(key)) return;
      seen.add(key);
      const msg = check(f, form);
      const box = boxOf(f);
      setError(box, msg);
      if (!['radio', 'checkbox', 'hidden'].includes(f.type)) { if (msg) f.setAttribute('aria-invalid', 'true'); else f.removeAttribute('aria-invalid'); }
      if (msg && !first) first = { f, box };
    });
    return first;
  };
  const inView = (el) => { const r = el.getBoundingClientRect(); return r.top >= 70 && r.bottom <= innerHeight - 20; };
  const report = ({ f, box }) => {
    SITE.shake(box);
    if (!inView(box)) box.scrollIntoView({ behavior: smooth(), block: 'center' });
    if (f.type === 'hidden') box.calendar?.focus();
    else if (f.type === 'radio' || f.type === 'checkbox') box.querySelector('input:not([disabled])')?.focus({ preventScroll: true });
    else f.focus({ preventScroll: true });
  };
  d.addEventListener('change', (e) => { const f = e.target; if (f.form && boxOf(f).classList.contains('is-invalid') && !check(f, f.form)) setError(boxOf(f), ''); });
  d.addEventListener('input', (e) => { const f = e.target; if (f.form && f.getAttribute('aria-invalid') && !check(f, f.form)) { f.removeAttribute('aria-invalid'); setError(boxOf(f), ''); } });

  /* ---------- Formularios que preparan un resumen para WhatsApp (con pasos: data-steps) ---------- */
  const labelFor = (field) => {
    if (field.dataset.label) return field.dataset.label;
    if (field.type === 'radio' || field.type === 'checkbox') return field.closest('fieldset, .field')?.querySelector('.label, legend')?.textContent.trim();
    return field.labels?.[0]?.textContent.replace(/\(opcional\)/i, '').trim() || field.name;
  };
  const valueOf = (field) => {
    if (field.dataset.display !== undefined) return field.dataset.display;
    if (field.tagName === 'SELECT') return field.value === '' ? '' : field.selectedOptions[0]?.textContent.trim() || '';
    if (field.type === 'radio' || field.type === 'checkbox') { const l = field.closest('label'); return (l?.querySelector('strong') || l?.querySelector('span'))?.textContent.trim() || field.value; }
    if (field.type === 'date' && field.value) return field.value.split('-').reverse().join('-');
    return field.value.trim();
  };
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  d.querySelectorAll('form[data-summary]').forEach((form) => {
    const out = d.getElementById(form.dataset.summary);
    const receipt = out?.querySelector('[data-receipt]');
    const pre = out?.querySelector('pre');
    const send = out?.querySelector('[data-send]');
    const replace = out?.hasAttribute('data-replace');
    let text = '';
    const hideSummary = () => { if (out && !out.hidden && !replace) out.hidden = true; };
    form.addEventListener('input', hideSummary);
    form.addEventListener('change', hideSummary);
    const settle = () => {
      const body = form.closest('.sheet-body');
      if (body) body.scrollTo({ top: 0, behavior: smooth() });
      else if (form.getBoundingClientRect().top < 80) form.scrollIntoView({ behavior: smooth(), block: 'start' });
    };

    /* Pasos */
    const steps = form.hasAttribute('data-steps') ? [...form.querySelectorAll(':scope > fieldset')] : [];
    let current = 0;
    if (steps.length) {
      const marks = form.querySelectorAll('.stepper li');
      const back = form.querySelector('[data-back]');
      const next = form.querySelector('[data-next]');
      const submit = form.querySelector('[type="submit"]');
      const counter = form.querySelector('[data-step-count]');
      form.querySelector('.stepper')?.style.setProperty('--n', steps.length);
      steps.forEach((s) => { s.tabIndex = -1; });
      form.goTo = (i, dir = 1) => {
        const target = Math.max(0, Math.min(steps.length - 1, i));
        const changed = target !== current;
        const apply = () => {
          current = target;
          steps.forEach((s, n) => { s.hidden = n !== current; s.classList.remove('is-entering', 'is-entering-back'); });
          if (changed && dir) steps[current].classList.add(dir > 0 ? 'is-entering' : 'is-entering-back');
          marks.forEach((l, n) => { l.classList.toggle('is-done', n < current); l.classList.toggle('is-current', n === current); });
          if (counter) counter.textContent = `Paso ${current + 1} de ${steps.length}`;
          back.hidden = current === 0;
          next.hidden = current === steps.length - 1;
          submit.hidden = current !== steps.length - 1;
        };
        if (changed && dir) SITE.morph(form, apply); else apply();
      };
      next.addEventListener('click', () => {
        const bad = validate(steps[current], form);
        if (bad) { report(bad); return; }
        form.goTo(current + 1, 1);
        settle();
        steps[current].focus({ preventScroll: true });
      });
      back.addEventListener('click', () => { form.goTo(current - 1, -1); settle(); steps[current].focus({ preventScroll: true }); });
      form.goTo(0, 0);
    }

    form.resetFlow = () => {
      if (out) out.hidden = true;
      form.hidden = false;
      form.goTo?.(0, 0);
    };

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const bad = validate(form, form);
      if (bad) {
        const step = steps.findIndex((s) => s.contains(bad.f));
        if (step > -1 && step !== current) form.goTo(step, -1);
        requestAnimationFrame(() => report(bad));
        return;
      }
      const sections = [];
      const seen = new Set();
      form.querySelectorAll('fieldset').forEach((fs) => {
        const rows = [];
        fs.querySelectorAll('[name]').forEach((field) => {
          if (seen.has(field.name) || field.disabled || field.dataset.skip !== undefined) return;
          if ((field.type === 'radio' || field.type === 'checkbox') && !field.checked) return;
          seen.add(field.name);
          let value = field.type === 'checkbox'
            ? [...fs.querySelectorAll(`[name="${field.name}"]:checked`)].map(valueOf).join(', ')
            : valueOf(field);
          if (value && field.dataset.join) {
            const unit = form.querySelector(`[name="${field.dataset.join}"]:checked`);
            if (unit) value = `${value} ${valueOf(unit)}`;
          }
          if (value) rows.push([labelFor(field), value]);
        });
        if (rows.length) sections.push({ title: fs.querySelector('legend')?.textContent.trim() || '', rows });
      });
      const closing = form.dataset.closing;
      text = [`*${form.dataset.title || 'Consulta'}*`,
        ...sections.flatMap((s) => ['', `*${s.title}*`, ...s.rows.map(([l, v]) => `• ${l}: ${v}`)]),
        ...(closing ? ['', closing] : [])].join('\n');
      if (!out) return;
      if (receipt) {
        receipt.innerHTML = sections.map((s) => `<section><h4>${esc(s.title)}</h4><dl>${s.rows.map(([l, v]) => `<div><dt>${esc(l)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></section>`).join('')
          + (closing ? `<p class="receipt-note">${esc(closing)}</p>` : '');
      }
      if (pre) pre.textContent = text.replaceAll('*', '');
      if (send) send.href = SITE.whatsapp(text);
      if (replace) SITE.morph(out.parentElement, () => { form.hidden = true; out.hidden = false; });
      else out.hidden = false;
      const body = out.closest('.sheet-body');
      if (body) body.scrollTo({ top: 0, behavior: smooth() });
      else if (!inView(out)) out.scrollIntoView({ behavior: smooth(), block: replace ? 'start' : 'nearest' });
      out.focus({ preventScroll: true });
    });
    out?.querySelector('[data-edit]')?.addEventListener('click', () => {
      SITE.morph(out.parentElement, () => { out.hidden = true; form.hidden = false; });
      settle();
      steps[current]?.focus({ preventScroll: true });
    });
    out?.querySelector('[data-copy]')?.addEventListener('click', async () => {
      const plain = text.replaceAll('*', '');
      try { await navigator.clipboard.writeText(plain); SITE.toast('Resumen copiado'); }
      catch {
        const target = pre || receipt;
        const range = d.createRange(); range.selectNodeContents(target);
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
        SITE.toast('Texto seleccionado: cópialo con Ctrl+C');
      }
    });
    send?.addEventListener('click', () => SITE.toast('Se abrió WhatsApp con tu solicitud'));
  });

  /* ---------- Hoja modal: las acciones se abren sobre la página, sin desplazarla ---------- */
  const sheet = d.createElement('dialog');
  sheet.className = 'sheet';
  sheet.setAttribute('aria-labelledby', 'sheet-title');
  sheet.innerHTML = `<div class="sheet-bar"><span class="sheet-grabber" aria-hidden="true"></span><h2 class="sheet-title" id="sheet-title" tabindex="-1"></h2><button class="sheet-close" type="button" aria-label="Cerrar">${ICON.close}</button></div><div class="sheet-body"></div>`;
  d.body.append(sheet);
  const sheetTitle = sheet.querySelector('.sheet-title');
  const sheetBody = sheet.querySelector('.sheet-body');
  const sheetBar = sheet.querySelector('.sheet-bar');
  let sheetView = null; let sheetHome = null; let opener = null; let closing = false;

  const restoreView = () => {
    if (!sheetView) return;
    sheetHome.marker.replaceWith(sheetView);
    sheetView.hidden = sheetHome.hidden;
    sheetView.dispatchEvent(new CustomEvent('view:return', { bubbles: true }));
    sheetView = null;
  };
  const sheetIn = () => {
    if (!motion.matches || !sheet.animate) return;
    if (phone.matches) sheet.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { duration: 540, easing: 'cubic-bezier(.32,.72,0,1)' });
    else sheet.animate([{ opacity: 0, transform: 'translateY(18px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: EASE });
  };
  SITE.sheet = {
    get view() { return sheetView; },
    open(view, trigger) {
      if (sheetView === view && sheet.open) return;
      const swapping = sheet.open;
      restoreView();
      const marker = d.createComment('vista');
      view.before(marker);
      sheetHome = { marker, hidden: view.hidden };
      view.hidden = false;
      sheetBody.replaceChildren(view);
      sheetView = view;
      sheetTitle.textContent = view.dataset.viewTitle || '';
      if (swapping) {
        if (motion.matches) view.animate([{ opacity: 0, transform: 'translateX(18px)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: EASE });
      } else {
        opener = trigger || d.activeElement;
        sheet.showModal();
        sheetIn();
      }
      sheetBody.scrollTop = 0;
      sheetTitle.focus({ preventScroll: true });
      view.dispatchEvent(new CustomEvent('view:show', { bubbles: true }));
    },
    close(fromY = 0) {
      if (!sheet.open || closing) return;
      closing = true;
      sheet.classList.add('is-closing');
      const finish = () => {
        sheet.close();
        sheet.classList.remove('is-closing');
        sheet.style.transform = '';
        closing = false;
        restoreView();
        opener?.focus?.({ preventScroll: true });
      };
      if (!motion.matches || !sheet.animate) { finish(); return; }
      const anim = phone.matches
        ? sheet.animate([{ transform: `translateY(${fromY}px)` }, { transform: 'translateY(100%)' }], { duration: 300, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' })
        : sheet.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(10px) scale(.97)' }], { duration: 220, easing: 'ease-in', fill: 'forwards' });
      anim.onfinish = () => { anim.cancel(); finish(); };
    }
  };
  sheet.querySelector('.sheet-close').addEventListener('click', () => SITE.sheet.close());
  sheet.addEventListener('cancel', (e) => { e.preventDefault(); SITE.sheet.close(); });
  sheet.addEventListener('click', (e) => {
    if (e.target !== sheet) return;
    const r = sheet.getBoundingClientRect();
    if (e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right) SITE.sheet.close();
  });
  /* Deslizar hacia abajo para cerrar (teléfono) */
  let drag = null;
  sheetBar.addEventListener('pointerdown', (e) => {
    if (!phone.matches || e.target.closest('button')) return;
    drag = { y: e.clientY, t: performance.now(), dy: 0 };
    sheetBar.setPointerCapture(e.pointerId);
  });
  sheetBar.addEventListener('pointermove', (e) => {
    if (!drag) return;
    drag.dy = Math.max(0, e.clientY - drag.y);
    sheet.style.transform = `translateY(${drag.dy}px)`;
  });
  const endDrag = () => {
    if (!drag) return;
    const { dy, t } = drag;
    drag = null;
    const fast = dy / (performance.now() - t) > 0.6;
    if (dy > 110 || (fast && dy > 30)) { SITE.sheet.close(dy); return; }
    if (motion.matches) sheet.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: 380, easing: 'cubic-bezier(.34,1.3,.64,1)' });
    sheet.style.transform = '';
  };
  sheetBar.addEventListener('pointerup', endDrag);
  sheetBar.addEventListener('pointercancel', endDrag);

  /* Presentar una vista: primero la página decide (SITE.presenter); si la vista ya está a la vista, se enfoca; si no, hoja. */
  const focusIn = (view) => {
    const target = view.querySelector('input:not([type="hidden"]):not([disabled]), select, textarea, button');
    target?.focus({ preventScroll: true });
  };
  SITE.present = (view, trigger) => {
    if (SITE.presenter?.(view, trigger)) return;
    if (!sheet.contains(view)) {
      const r = view.getBoundingClientRect();
      if (r.height && r.top > 60 && r.top < innerHeight * .5) { focusIn(view); return; }
    }
    SITE.sheet.open(view, trigger);
  };

  /* Disparadores: data-set preselecciona campos y data-open abre la vista correspondiente en el lugar */
  d.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-set], [data-open]');
    if (!trigger) return;
    const view = trigger.dataset.open ? d.getElementById(trigger.dataset.open) : null;
    const href = trigger.getAttribute('href');
    const scope = view || (href?.startsWith('#') && href.length > 1 ? d.querySelector(href) : null) || d;
    if (trigger.dataset.set) {
      scope.querySelectorAll?.('form[data-summary]').forEach((f) => f.resetFlow?.());
      trigger.dataset.set.split(';').forEach((pair) => {
        const [name, value] = pair.split('=');
        let fields = scope.querySelectorAll(`[name="${name}"]`);
        if (!fields.length) fields = d.querySelectorAll(`[name="${name}"]`);
        fields.forEach((field) => {
          if (field.type === 'radio' || field.type === 'checkbox') field.checked = field.value === value;
          else field.value = value;
          field.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
    }
    if (view) { e.preventDefault(); SITE.present(view, trigger); }
  });

  /* Enlaces de WhatsApp con texto dinámico: data-wa="Texto con {#id-de-campo}" */
  d.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-wa]');
    if (!link) return;
    const text = link.dataset.wa.replace(/\{#([\w-]+)\}/g, (m, id) => {
      const f = d.getElementById(id);
      return f ? (f.tagName === 'SELECT' ? f.selectedOptions[0]?.textContent : f.value).trim() : '';
    });
    link.href = SITE.whatsapp(text);
  });

  /* Abrir una vista si la dirección la nombra (#cotizar, #buscar…) */
  d.addEventListener('DOMContentLoaded', () => {
    const view = location.hash.length > 1 ? d.getElementById(location.hash.slice(1)) : null;
    if (view?.matches('[data-view]')) SITE.present(view, null);
  });

  /* Barra de acción en móvil */
  const dock = d.querySelector('.dock');
  if (dock) {
    const blockers = new Set();
    const hero = d.querySelector('.hero, .app-hero');
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
    addEventListener('resize', refresh, { passive: true });
    toggle?.addEventListener('click', () => setTimeout(refresh));
    SITE.refreshDock = refresh;
    refresh();
  }
})();
