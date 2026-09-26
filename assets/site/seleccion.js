/* Transporte Autorizado: ventanas de selección. En escritorio es un diálogo centrado; en móvil, una hoja inferior.
   Todo se elige tocando: opciones con imagen o ícono, región y comuna, calendario y horario.
   window.Picker expone las ventanas (choose, chooseEach, commune, when) y los renderizadores en línea
   (options, communes, calendar), que también usa el asistente del hero. */
(() => {
  const d = document;
  const PICK = window.PICK;
  if (!PICK) return;
  const motion = matchMedia('(prefers-reduced-motion: no-preference)');
  const coarse = matchMedia('(pointer: coarse)');
  const fold = PICK.fold;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const ICON = {
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    back: svg('<path d="M15 5l-7 7 7 7"/>'),
    next: svg('<path d="M9 5l7 7-7 7"/>'),
    search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7"/>'),
    help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17h.01"/>')
  };

  /* ---------- Renderizadores en línea ---------- */
  const optionHTML = (o, on) => `<button type="button" class="opt" data-value="${esc(o.value)}" aria-pressed="${on}">${
    o.img ? `<img src="${esc(o.img)}" alt="" width="48" height="48" loading="lazy" decoding="async">` : o.icon ? `<span class="opt-icon" aria-hidden="true">${o.icon}</span>` : ''
  }<span class="opt-text"><strong>${esc(o.label)}</strong>${o.hint ? `<small>${esc(o.hint)}</small>` : ''}</span><i class="opt-check" aria-hidden="true"></i></button>`;

  /* Opciones agrupadas. layout: 'tiles' (imagen), 'cards' (ícono y texto), 'list' (filas) o 'chips'. */
  const options = (host, { groups, value, multi = false, max = 0, exclusive = [], layout = 'list', onPick, onChange }) => {
    const picked = new Set(multi ? [].concat(value || []).filter(Boolean) : []);
    const draw = (q = '') => {
      const k = fold(q);
      const html = groups.map((g) => {
        const list = g.options.filter((o) => !k || fold(`${o.label} ${o.hint || ''}`).includes(k));
        if (!list.length) return '';
        return `<section class="opt-group">${g.label ? `<h3>${esc(g.label)}</h3>` : ''}<div class="opts is-${g.layout || layout}">${list.map((o) => optionHTML(o, multi ? picked.has(o.value) : o.value === value)).join('')}</div></section>`;
      }).join('');
      host.innerHTML = html || `<p class="opt-empty">No encontramos resultados para «${esc(q)}».</p>`;
    };
    draw();
    host.onclick = (e) => {
      const b = e.target.closest('.opt[data-value]');
      if (!b) return;
      const v = b.dataset.value;
      if (!multi) {
        host.querySelectorAll('.opt[data-value]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        onPick?.(v);
        return;
      }
      if (picked.has(v)) picked.delete(v);
      else {
        if (exclusive.includes(v)) picked.clear(); else exclusive.forEach((x) => picked.delete(x));
        picked.add(v);
        if (max && picked.size > max) picked.delete(picked.values().next().value);
      }
      host.querySelectorAll('.opt[data-value]').forEach((x) => x.setAttribute('aria-pressed', String(picked.has(x.dataset.value))));
      onChange?.([...picked]);
    };
    return { filter: draw, get: () => [...picked] };
  };

  /* Comunas de la Región Metropolitana (cobertura del servicio): todas a la vista; buscar es opcional */
  const REGION = 'Metropolitana';
  const communes = (host, { value = {}, onPick }) => {
    const list = PICK.communesOf(REGION);
    const draw = (names, q = '') => {
      host.innerHTML = names.length
        ? `<div class="opts is-grid">${names.map((c) => `<button type="button" class="opt" data-commune="${esc(c)}" aria-pressed="${c === value.commune}"><span class="opt-text"><strong>${esc(c)}</strong></span><i class="opt-check" aria-hidden="true"></i></button>`).join('')}</div>`
        : `<p class="opt-empty">No encontramos «${esc(q)}» entre las comunas de la Región Metropolitana.</p>`;
    };
    const search = (q) => {
      const k = fold(q);
      if (!k) { draw(list); return; }
      draw(list.filter((c) => fold(c).includes(k)).sort((a, b) => Number(fold(b).startsWith(k)) - Number(fold(a).startsWith(k))), q);
    };
    host.onclick = (e) => {
      const c = e.target.closest('[data-commune]');
      if (c) onPick?.({ commune: c.dataset.commune, region: REGION });
    };
    draw(list);
    return { search };
  };

  /* Calendario mensual: lunes a sábado, desde mañana y hasta tres meses. */
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const iso = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  const parse = (v) => { const [y, m, dd] = v.split('-').map(Number); return new Date(y, m - 1, dd, 12); };
  const calendar = (host, { multi = false, max = 3, value = [], onChange }) => {
    const picked = [].concat(value).filter(Boolean);
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const min = new Date(today); min.setDate(min.getDate() + 1);
    const lim = new Date(today); lim.setDate(lim.getDate() + 92);
    const view = picked[0] ? parse(picked[0]) : new Date(min);
    view.setDate(1);
    const draw = () => {
      const y = view.getFullYear();
      const m = view.getMonth();
      const lead = (new Date(y, m, 1, 12).getDay() + 6) % 7;
      const count = new Date(y, m + 1, 0).getDate();
      const at = y * 12 + m;
      let cells = '<span></span>'.repeat(lead);
      for (let n = 1; n <= count; n += 1) {
        const dt = new Date(y, m, n, 12);
        const v = iso(dt);
        const off = dt < min || dt > lim || dt.getDay() === 0;
        cells += `<button type="button" class="cal-day${v === iso(today) ? ' is-today' : ''}" data-date="${v}" aria-pressed="${picked.includes(v)}" aria-label="${PICK.longDate(v)}"${off ? ' disabled' : ''}>${n}</button>`;
      }
      host.innerHTML = `<div class="cal">
        <div class="cal-head">
          <button type="button" class="cal-nav" data-cal-nav="-1" aria-label="Mes anterior"${at > min.getFullYear() * 12 + min.getMonth() ? '' : ' disabled'}>${ICON.back}</button>
          <strong aria-live="polite">${MONTHS[m]} ${y}</strong>
          <button type="button" class="cal-nav" data-cal-nav="1" aria-label="Mes siguiente"${at < lim.getFullYear() * 12 + lim.getMonth() ? '' : ' disabled'}>${ICON.next}</button>
        </div>
        <div class="cal-week" aria-hidden="true"><span>lu</span><span>ma</span><span>mi</span><span>ju</span><span>vi</span><span>sá</span><span>do</span></div>
        <div class="cal-grid">${cells}</div>
      </div>`;
    };
    host.onclick = (e) => {
      const nav = e.target.closest('[data-cal-nav]');
      if (nav && !nav.disabled) {
        view.setMonth(view.getMonth() + Number(nav.dataset.calNav));
        draw();
        host.querySelector(`[data-cal-nav="${nav.dataset.calNav}"]:not([disabled])`)?.focus({ preventScroll: true });
        return;
      }
      const b = e.target.closest('[data-date]');
      if (!b || b.disabled) return;
      const v = b.dataset.date;
      if (!multi) picked.splice(0, picked.length, v);
      else if (picked.includes(v)) picked.splice(picked.indexOf(v), 1);
      else { picked.push(v); if (picked.length > max) picked.shift(); }
      host.querySelectorAll('[data-date]').forEach((x) => x.setAttribute('aria-pressed', String(picked.includes(x.dataset.date))));
      onChange?.([...picked].sort());
    };
    draw();
    return { get: () => [...picked].sort() };
  };

  /* Señal implícita de que hay más contenido: el borde por donde continúa se difumina (arriba o abajo),
     sin textos ni botones que pidan desplazarse. Marca data-more y data-scrolled en el contenedor. */
  const hint = (scroller) => {
    if (!scroller || scroller.dataset.hint) return () => {};
    scroller.dataset.hint = '1';
    const update = () => {
      const rest = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      const scrollable = scroller.scrollHeight > scroller.clientHeight + 2 && getComputedStyle(scroller).overflowY !== 'visible';
      scroller.toggleAttribute('data-more', scrollable && rest > 8);
      scroller.toggleAttribute('data-scrolled', scrollable && scroller.scrollTop > 4);
    };
    scroller.addEventListener('scroll', update, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(update).observe(scroller);
    new MutationObserver(() => requestAnimationFrame(update)).observe(scroller, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    update();
    return update;
  };

  /* ---------- Ventana ---------- */
  let dlg; let el; let resolver = null; let lastFocus = null;
  const hooks = { back: null, search: null, done: null, action: null, tab: null };
  const build = () => {
    dlg = d.createElement('dialog');
    dlg.className = 'picker';
    dlg.setAttribute('aria-labelledby', 'picker-title');
    dlg.innerHTML = `
      <div class="picker-card">
        <span class="picker-grab" aria-hidden="true"></span>
        <header class="picker-head">
          <button class="picker-icon" type="button" data-back hidden aria-label="Volver">${ICON.back}</button>
          <div class="picker-titles"><h2 id="picker-title"></h2><p hidden></p></div>
          <button class="picker-icon" type="button" data-close aria-label="Cerrar">${ICON.close}</button>
        </header>
        <label class="picker-search" hidden>${ICON.search}<span class="sr-only">Buscar</span><input type="search" autocomplete="off" spellcheck="false" enterkeyhint="search"></label>
        <div class="picker-tabs" role="tablist" hidden></div>
        <div class="picker-body"></div>
        <footer class="picker-foot" hidden><button class="btn btn-quiet btn-small" type="button" data-action hidden></button><span class="picker-count" aria-live="polite"></span><button class="btn btn-primary btn-small" type="button" data-done>Listo</button></footer>
      </div>`;
    d.body.append(dlg);
    el = {
      title: dlg.querySelector('h2'), sub: dlg.querySelector('.picker-titles p'), back: dlg.querySelector('[data-back]'),
      searchWrap: dlg.querySelector('.picker-search'), search: dlg.querySelector('.picker-search input'),
      body: dlg.querySelector('.picker-body'), foot: dlg.querySelector('.picker-foot'), tabs: dlg.querySelector('.picker-tabs'),
      done: dlg.querySelector('[data-done]'), count: dlg.querySelector('.picker-count'), action: dlg.querySelector('[data-action]')
    };
    hint(el.body);
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg || e.target.closest('[data-close]')) finish();
      else if (e.target.closest('[data-back]')) hooks.back?.();
      else if (e.target.closest('[data-done]')) hooks.done?.();
      else if (e.target.closest('[data-action]')) hooks.action?.();
      else if (e.target.closest('[data-tab]')) hooks.tab?.(Number(e.target.closest('[data-tab]').dataset.tab));
    });
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(); });
    el.search.addEventListener('input', () => hooks.search?.(el.search.value));
    el.search.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      el.body.querySelector('button:not([disabled])')?.click();
    });
  };
  const finish = (value) => {
    if (!dlg?.open) return;
    const done = resolver;
    resolver = null;
    const end = () => {
      dlg.close();
      dlg.classList.remove('is-closing');
      d.documentElement.classList.remove('picker-open');
      lastFocus?.focus?.({ preventScroll: true });
      done?.(value);
    };
    if (motion.matches) { dlg.classList.add('is-closing'); setTimeout(end, 180); } else end();
  };
  const open = ({ title, sub = '', search = '', done = '' }) => {
    if (!dlg) build();
    if (dlg.open) { resolver?.(); resolver = null; dlg.close(); }
    lastFocus = d.activeElement;
    Object.keys(hooks).forEach((k) => { hooks[k] = null; });
    el.title.textContent = title;
    el.sub.textContent = sub;
    el.sub.hidden = !sub;
    el.back.hidden = true;
    el.searchWrap.hidden = !search;
    el.search.value = '';
    el.search.placeholder = search;
    el.foot.hidden = !done;
    el.done.hidden = !done;
    el.done.innerHTML = `${ICON.check}${esc(done || 'Listo')}`;
    el.done.disabled = false;
    el.count.textContent = '';
    el.action.hidden = true;
    el.tabs.hidden = true;
    el.tabs.innerHTML = '';
    el.body.innerHTML = '';
    el.body.onclick = null;
    el.body.scrollTop = 0;
    d.documentElement.classList.add('picker-open');
    dlg.showModal();
    return new Promise((res) => { resolver = res; });
  };
  const focusFirst = () => requestAnimationFrame(() => {
    const on = el.body.querySelector('[aria-pressed="true"]');
    const target = on || (!el.searchWrap.hidden && !coarse.matches ? el.search : el.body.querySelector('button:not([disabled]), input, select'));
    target?.focus({ preventScroll: true });
    on?.scrollIntoView({ block: 'center' });
  });
  const counter = (n, one, many) => (n ? `${n} ${n === 1 ? one : many}` : '');

  /* Una opción (se cierra al tocar) o varias (con «Listo») */
  /* Con tabs, cada grupo se muestra en su pestaña (así ningún grupo queda escondido bajo el scroll);
     al buscar, se muestran los resultados de todos los grupos. action agrega un botón al pie (p. ej. «No lo sé»). */
  const choose = (o) => {
    const p = open({ title: o.title, sub: o.sub, search: o.search, done: o.multi ? (o.done || 'Listo') : '' });
    const sync = (list) => {
      el.done.disabled = Boolean(o.required) && !list.length;
      el.count.textContent = counter(list.length, 'elegida', 'elegidas');
    };
    let active = Math.max(0, o.groups.findIndex((g) => g.options.some((x) => [].concat(o.value).includes(x.value))));
    let ctrl;
    const render = (q = '') => {
      const tabbed = o.tabs && !q.trim();
      if (o.tabs) {
        el.tabs.hidden = !tabbed;
        el.tabs.innerHTML = o.groups.map((g, i) => `<button type="button" role="tab" data-tab="${i}" aria-selected="${i === active}">${esc(g.tab || g.label)}<span>${g.count ?? g.options.length}</span></button>`).join('');
      }
      const groups = tabbed ? [{ ...o.groups[active], label: '' }] : o.groups;
      ctrl = options(el.body, { ...o, groups, value: o.multi && ctrl ? ctrl.get() : o.value, onPick: (v) => finish(v), onChange: sync });
      if (q) ctrl.filter(q);
    };
    render();
    hooks.search = (q) => render(q);
    hooks.tab = (i) => { active = i; render(); el.body.scrollTop = 0; el.tabs.querySelector(`[data-tab="${i}"]`)?.focus({ preventScroll: true }); };
    if (o.multi) { sync(ctrl.get()); hooks.done = () => finish(ctrl.get()); }
    if (o.action) {
      el.foot.hidden = false;
      el.action.hidden = false;
      el.action.innerHTML = `${ICON.help}${esc(o.action.label)}`;
      hooks.action = () => finish(o.action.value);
    }
    focusFirst();
    return p;
  };

  /* Varios grupos en una ventana, con «Listo»: cada grupo es de una opción o, con multi, de varias */
  const chooseEach = ({ title, sub, groups, value = {}, layout = 'chips' }) => {
    const p = open({ title, sub, done: 'Listo' });
    const picked = Object.fromEntries(groups.map((g) => [g.key, g.multi ? [].concat(value[g.key] || []) : value[g.key] || '']));
    const on = (g, v) => (g.multi ? picked[g.key].includes(v) : picked[g.key] === v);
    el.body.innerHTML = groups.map((g) => `<section class="opt-group" data-group="${esc(g.key)}"><h3>${esc(g.label)}</h3><div class="opts is-${g.layout || layout}">${g.options.map((o) => optionHTML(o, on(g, o.value))).join('')}</div></section>`).join('');
    el.body.onclick = (e) => {
      const b = e.target.closest('.opt[data-value]');
      if (!b) return;
      const g = groups.find((x) => x.key === b.closest('[data-group]').dataset.group);
      const v = b.dataset.value;
      if (g.multi) picked[g.key] = on(g, v) ? picked[g.key].filter((x) => x !== v) : [...picked[g.key], v];
      else picked[g.key] = picked[g.key] === v ? '' : v;
      b.closest('.opts').querySelectorAll('.opt').forEach((x) => x.setAttribute('aria-pressed', String(on(g, x.dataset.value))));
    };
    hooks.done = () => finish(picked);
    focusFirst();
    return p;
  };

  /* Comuna (Región Metropolitana) */
  const commune = ({ value = {}, title = '¿En qué comuna está el residuo?' } = {}) => {
    const p = open({ title, sub: 'Comunas de la Región Metropolitana', search: 'Buscar comuna' });
    const ctrl = communes(el.body, { value, onPick: (v) => finish(v) });
    hooks.search = (q) => ctrl.search(q);
    focusFirst();
    return p;
  };

  /* Modalidad, día(s) y horario del retiro */
  const MODES = [
    { value: 'express', label: 'Retiro Express', hint: 'Prioridad dentro de las próximas 24 horas.' },
    { value: 'programado', label: 'Retiro Programado', hint: 'Eliges el día del retiro.' },
    { value: 'flexible', label: 'Espera y ahorra', hint: 'Propones hasta tres días.' }
  ];
  const when = ({ value = {} } = {}) => {
    const p = open({ title: '¿Cuándo necesitas el retiro?', done: 'Listo' });
    const st = {
      modalidad: value.modalidad || '', dates: [...(value.dates || [])],
      slot: value.slot || 'Cualquier horario', desde: value.desde || '8:00', hasta: value.hasta || '17:00'
    };
    const slots = [...PICK.SLOTS.map(([t, h]) => ({ value: t, label: t, hint: h })), { value: 'otro', label: 'Otro rango', hint: 'Desde y hasta' }];
    const hours = (sel) => PICK.HOURS.map((h) => `<option${h === sel ? ' selected' : ''}>${h}</option>`).join('');
    el.body.innerHTML = `<div class="when">
      <div class="opts is-modes" role="group" aria-label="Modalidad">${MODES.map((m) => optionHTML(m, st.modalidad === m.value).replace('class="opt"', `class="opt" data-tone="${m.value}"`)).join('')}</div>
      <div class="when-detail" data-detail></div>
      <section class="opt-group"><h3>Horario de retiro</h3>
        <div class="opts is-chips" data-slots role="group" aria-label="Horario">${slots.map((s) => optionHTML(s, st.slot === s.value)).join('')}</div>
        <div class="when-range" data-range${st.slot === 'otro' ? '' : ' hidden'}>
          <label>Desde<select data-desde>${hours(st.desde)}</select></label>
          <label>Hasta<select data-hasta>${hours(st.hasta)}</select></label>
        </div>
      </section>
    </div>`;
    const detail = el.body.querySelector('[data-detail]');
    const range = el.body.querySelector('[data-range]');
    const desde = el.body.querySelector('[data-desde]');
    const hasta = el.body.querySelector('[data-hasta]');
    const sync = () => {
      el.done.disabled = !(st.modalidad === 'express' || (st.modalidad && st.dates.length));
      el.count.textContent = st.modalidad === 'flexible' ? counter(st.dates.length, 'día elegido', 'días elegidos') : '';
    };
    const drawDetail = () => {
      if (!st.modalidad) { detail.innerHTML = '<p class="when-hint">Elige una modalidad para ver los días disponibles.</p>'; return; }
      if (st.modalidad === 'express') { detail.innerHTML = '<p class="when-note">Te contactamos para coordinar el retiro dentro de las próximas 24 horas, sujeto a disponibilidad, tipo de residuo y comuna.</p>'; return; }
      const multi = st.modalidad === 'flexible';
      if (!multi) st.dates = st.dates.slice(0, 1);
      detail.innerHTML = `<p class="when-label">${multi ? 'Elige hasta tres días posibles' : 'Elige el día'}</p><div data-cal></div>`;
      calendar(detail.querySelector('[data-cal]'), { multi, max: 3, value: st.dates, onChange: (list) => { st.dates = list; sync(); } });
    };
    const fixRange = () => {
      [...hasta.options].forEach((o, i) => { o.disabled = i <= desde.selectedIndex; });
      if (hasta.selectedIndex <= desde.selectedIndex) hasta.selectedIndex = Math.min(desde.selectedIndex + 1, hasta.options.length - 1);
      st.desde = desde.value;
      st.hasta = hasta.value;
    };
    el.body.onclick = (e) => {
      const b = e.target.closest('.opt[data-value]');
      if (!b) return;
      if (b.closest('.is-modes')) {
        st.modalidad = b.dataset.value;
        b.parentElement.querySelectorAll('.opt').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        drawDetail();
      } else if (b.closest('[data-slots]')) {
        st.slot = b.dataset.value;
        b.parentElement.querySelectorAll('.opt').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        range.hidden = st.slot !== 'otro';
      }
      sync();
    };
    desde.addEventListener('change', fixRange);
    hasta.addEventListener('change', fixRange);
    fixRange();
    drawDetail();
    sync();
    hooks.done = () => finish({ ...st });
    focusFirst();
    return p;
  };

  window.Picker = { choose, chooseEach, commune, when, options, communes, calendar, hint, MODES, close: () => finish() };
})();
