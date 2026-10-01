/* Transporte Autorizado: asistente de retiro dentro del hero (copy aprobado, docs/copy/transporte-autorizado.md).
   Se puede conversar o tocar opciones: lo que la persona escribe se interpreta sin IA (interpretar.js)
   —por ejemplo «necesito un retiro urgente» queda como Retiro Express— y el asistente solo pregunta lo que falta.
   Una pregunta por pantalla; arriba quedan las respuestas previas, que se pueden cambiar; termina con una revisión.
   No analiza fotos ni envía nada por sí solo: arma un resumen y abre WhatsApp. Se abre con [data-assistant-open]
   o desde el campo de texto del hero (window.GUIDE.ingest). */
(() => {
  const d = document;
  const PICK = window.PICK;
  const Picker = window.Picker;
  const PARSE = window.PARSE;
  const panel = d.querySelector('[data-guide]');
  if (!panel || !PICK || !Picker || !PARSE || !window.SITE) return;

  const body = panel.querySelector('[data-guide-body]');
  const composer = panel.querySelector('[data-guide-composer]');
  const input = composer.querySelector('input');
  const actions = panel.querySelector('[data-guide-actions]');
  const trail = panel.querySelector('[data-guide-trail]');
  const count = panel.querySelector('[data-guide-count]');
  const backBtn = panel.querySelector('[data-guide-back]');
  const bar = panel.querySelector('.stepper-bar i');
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  /* Deja ver la selección antes de avanzar; un doble toque no avanza dos veces (solo si la pregunta sigue siendo la misma) */
  const later = (fn) => { const at = index; setTimeout(() => { if (index === at) fn(); }, 160); };

  const POPULAR = [
    ['no-peligroso', 'Papel y cartón', 'np-papel-carton'], ['no-peligroso', 'Plásticos', 'np-plasticos'],
    ['no-peligroso', 'Metales', 'np-metales'], ['no-peligroso', 'Madera', 'np-madera'],
    ['no-peligroso', 'Construcción y demolición', 'np-construccion-demolicion'], ['no-peligroso', 'RAEE y electrónicos', 'np-raee-electronicos'],
    ['peligroso', 'Aceites e hidrocarburos', 'p-aceites-hidrocarburos'], ['peligroso', 'Baterías y pilas', 'p-baterias-pilas']
  ];
  const MODES = Picker.MODES.map((m) => ({ ...m, value: PICK.MODE_LABEL[m.value], key: m.value }));
  const SLOT_OPTIONS = PICK.SLOTS.map(([t, h]) => ({ value: t === 'Cualquier horario' ? t : `${t} (${h})`, label: t, hint: h, icon: PICK.SLOT_ICONS[t] }));

  const STEPS = [
    { id: 'residuo', label: 'Residuo', type: 'residuo', ask: '¿Qué necesitas retirar?', help: 'Elige una opción o escríbelo abajo con tus palabras.', hint: 'Ej.: 20 sacos de cartón en Quilicura' },
    { id: 'cantidad', label: 'Cantidad aproximada', type: 'options', layout: 'list', ask: '¿Cuánto residuo tienes aproximadamente?', help: 'Un rango aproximado basta; lo precisamos al cotizar.', hint: 'Ej.: 600 kg',
      options: PICK.AMOUNTS.map((a, i) => ({ value: a, label: a, icon: PICK.AMOUNT_ICONS[i] })) },
    { id: 'comuna', label: 'Comuna', type: 'commune', ask: '¿En qué comuna se encuentra?', help: 'Comunas de la Región Metropolitana. Elige la tuya o escríbela abajo.', hint: 'Escribe tu comuna' },
    { id: 'direccion', label: 'Dirección', type: 'text', sub: true, ask: '¿Cuál es la dirección del retiro?', help: 'Calle, número y alguna referencia.', hint: 'Escribe la dirección' },
    { id: 'almacenamiento', label: 'Almacenamiento', type: 'options', layout: 'cards', ask: '¿Cómo está almacenado?', hint: 'Ej.: en tambores',
      options: PICK.STORAGE.map(([x, icon]) => ({ value: x, label: x, icon })) },
    { id: 'modalidad', label: 'Modalidad', type: 'options', layout: 'list', ask: '¿Cuándo necesitas retirarlo?', hint: 'Ej.: es urgente', options: MODES },
    { id: 'fecha', label: 'Fecha', type: 'calendar', sub: true, skip: 'Aún no lo sé', when: (a) => a.modalidad === 'Retiro Programado',
      ask: '¿Qué día te acomoda?', help: 'Lo confirmamos según disponibilidad, tipo de residuo y comuna.', hint: 'Ej.: el lunes' },
    { id: 'fechas', label: 'Fechas posibles', type: 'calendar', multi: 3, sub: true, when: (a) => a.modalidad === 'Espera y ahorra',
      ask: '¿Qué días te acomodan?', help: 'Elige hasta tres; coordinamos según nuestra disponibilidad.', hint: 'Ej.: lunes 5 de octubre' },
    { id: 'horario', label: 'Horario', type: 'options', layout: 'cards', sub: true, ask: '¿En qué horario se puede retirar?', hint: 'Ej.: en la mañana', options: SLOT_OPTIONS },
    { id: 'documentos', label: 'Documentación del residuo', type: 'multi', layout: 'list', exclusive: 'Sin documentos por ahora', hint: 'Ej.: tengo la HDS',
      ask: '¿Tienes algún antecedente o documento del residuo?', help: 'Si tienes HDS/FDS, análisis u otra documentación, podrás adjuntarla por WhatsApp.',
      options: PICK.DOCS.map((x) => ({ value: x, label: x })) },
    { id: 'contacto', type: 'contact', ask: 'Necesito algunos datos para preparar tu solicitud.', help: 'Usaremos estos datos para enviarte la propuesta.',
      fields: [
        { id: 'empresa', label: 'Empresa', autocomplete: 'organization' },
        { id: 'nombre', label: 'Nombre de contacto', autocomplete: 'name' },
        { id: 'telefono', label: 'Teléfono', type: 'tel', autocomplete: 'tel', placeholder: '+56 9 1234 5678' },
        { id: 'correo', label: 'Correo electrónico', type: 'email', autocomplete: 'email', placeholder: 'nombre@empresa.cl' }
      ] }
  ];
  const TITLE = 'Solicitud de cotización — Transporte Autorizado';
  const CLOSING = 'Adjuntaré fotografías del residuo, su envase y el lugar donde está almacenado.';
  const GREETING = 'Hola, te ayudo a gestionar tu residuo. Te haré algunas preguntas para preparar una solicitud de cotización.';

  const answers = {};
  const meta = { tipo: '', region: '', dates: {}, search: '' };
  let geoPicked = null;  // calle elegida entre las sugerencias de dirección
  let index = 0;
  let done = false;
  let editing = false;
  let describing = false;
  let draft = [];
  let exchange = null; // última conversación: { user, bot }

  const active = () => STEPS.filter((s) => !s.when || s.when(answers));
  const TOTAL = STEPS.filter((s) => !s.sub).length;
  const stepNumber = (i) => active().slice(0, i + 1).filter((s) => !s.sub).length;
  const answered = (s) => (s.type === 'contact' ? Boolean(answers.empresa) : s.id in answers);
  const shown = (s) => {
    if (s.type === 'contact') return answers.empresa;
    if (s.id === 'residuo' && meta.tipo === 'peligroso') return `${answers.residuo} (peligroso)`;
    return answers[s.id] || s.skip || '';
  };
  const transition = (update) => (window.HERO?.transition || ((u) => { u(); return Promise.resolve(); }))(update);

  const summaryText = () => {
    const rows = [];
    active().forEach((s) => {
      if (s.type === 'contact') s.fields.forEach((f) => { if (answers[f.id]) rows.push(`• ${f.label}: ${answers[f.id]}`); });
      else if (answers[s.id]) rows.push(`• ${s.label}: ${s.id === 'residuo' ? shown(s) : answers[s.id]}`);
      if (s.id === 'direccion' && answers.direccion && meta.punto && window.MAPA) rows.push(`• Ubicación en el mapa: ${window.MAPA.enlace(meta.punto)}`);
    });
    return [`*${TITLE}*`, '', ...rows, '', CLOSING].join('\n');
  };

  /* ---------- Pintado ---------- */
  const paintHead = () => {
    const steps = active();
    if (done) count.textContent = 'Solicitud lista';
    else if (customElements.get('number-flow')) {
      let flow = count.querySelector('number-flow');
      if (!flow) { count.textContent = 'Paso '; flow = d.createElement('number-flow'); count.append(flow, ` de ${TOTAL}`); }
      flow.update(stepNumber(index));
    } else count.textContent = `Paso ${stepNumber(index)} de ${TOTAL}`;
    bar.style.setProperty('--p', `${done ? 100 : Math.max(((stepNumber(index) - 1) / TOTAL) * 100, 5)}%`);
    backBtn.hidden = !done && index === 0;
    const chips = done ? [] : steps.map((s, i) => (i !== index && answered(s) && shown(s) ? `<button type="button" class="trail-chip" data-edit="${i}"><span class="sr-only">Cambiar ${esc(s.label || 'contacto')}: </span>${esc(shown(s))}</button>` : ''));
    trail.innerHTML = chips.join('');
    trail.hidden = !chips.some(Boolean);
  };

  const chat = () => {
    const bot = exchange ? exchange.bot : index === 0 && !done && !Object.keys(answers).length ? GREETING : '';
    if (!bot) return '';
    return `<div class="guide-chat">${exchange?.user ? `<p class="bubble is-user">${esc(exchange.user)}</p>` : ''}<p class="bubble is-bot">${esc(bot)}</p></div>`;
  };
  const heading = (s) => `${chat()}<h3 class="guide-q" tabindex="-1">${esc(s.ask)}</h3>${s.help ? `<p class="guide-help">${esc(s.help)}</p>` : ''}`;
  const ICON = {
    next: '<svg width="20" height="20" class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    check: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
    copy: '<svg width="20" height="20" class="icon-idle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    done: '<svg width="20" height="20" class="icon-done" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
    send: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 3L10.5 13.5"/><path d="M21 3l-6.5 18-4-7.5L3 9.5z"/></svg>',
    skip: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>'
  };
  const nextButton = (label, disabled = false) => `<div class="guide-next"><button type="button" class="btn btn-primary btn-small" data-continue${disabled ? ' disabled' : ''}>${label === 'Continuar' ? `${esc(label)} ${ICON.next}` : `${ICON.check}${esc(label)}`}</button></div>`;
  const enable = (on) => { const b = body.querySelector('[data-continue]'); if (b) b.disabled = !on; };

  const renderStep = (s) => {
    const value = answers[s.id];
    composer.hidden = s.type === 'contact';
    actions.hidden = true;
    input.placeholder = s.hint || 'Escribe tu respuesta';
    if (s.type === 'residuo') {
      body.innerHTML = `<div class="guide-step">${heading(s)}<div class="guide-area" data-area></div>
        <div class="opts is-list guide-extra">
          <button type="button" class="opt" data-all><span class="opt-icon" aria-hidden="true">${PICK.ICONS.grid}</span><span class="opt-text"><strong>Ver todos los residuos</strong><small>No peligrosos y peligrosos</small></span><i class="opt-chev" aria-hidden="true"></i></button>
          <button type="button" class="opt" data-describe><span class="opt-icon" aria-hidden="true">${PICK.ICONS.edit}</span><span class="opt-text"><strong>No sé cuál es</strong><small>Descríbelo abajo con tus palabras</small></span><i class="opt-chev" aria-hidden="true"></i></button>
        </div></div>`;
      Picker.options(body.querySelector('[data-area]'), {
        groups: [{ options: POPULAR.map(([kind, name, file]) => ({ value: `${kind}|${name}`, label: name, img: PICK.thumb(file) })) }],
        value: `${meta.tipo}|${value}`, layout: 'tiles',
        onPick: (v) => { const [kind, name] = v.split('|'); meta.tipo = kind; answers.residuo = name; exchange = null; later(advance); }
      });
      return;
    }
    if (s.type === 'options' || s.type === 'multi') {
      const multi = s.type === 'multi';
      if (multi) draft = value ? value.split(', ') : [];
      body.innerHTML = `<div class="guide-step">${heading(s)}<div class="guide-area" data-area></div>${multi ? nextButton('Continuar', !draft.length) : ''}</div>`;
      Picker.options(body.querySelector('[data-area]'), {
        groups: [{ options: s.options }], value: multi ? draft : value, multi,
        exclusive: s.exclusive ? [s.exclusive] : [], layout: s.layout,
        onPick: (v) => {
          if (s.id === 'modalidad' && answers.modalidad !== v) { delete answers.fecha; delete answers.fechas; meta.dates = {}; }
          answers[s.id] = v;
          exchange = null;
          later(advance);
        },
        onChange: (list) => { draft = list; enable(list.length); }
      });
      if (s.layout === 'modes') body.querySelectorAll('.opt').forEach((b, i) => { b.dataset.tone = MODES[i].key; });
      return;
    }
    if (s.type === 'commune') {
      body.innerHTML = `<div class="guide-step">${heading(s)}<div class="guide-area" data-area></div></div>`;
      const ctrl = Picker.communes(body.querySelector('[data-area]'), {
        value: { commune: value || '' },
        onPick: (v) => { answers.comuna = v.commune; exchange = null; later(advance); }
      });
      if (meta.search) { ctrl.search(meta.search); meta.search = ''; }
      return;
    }
    if (s.type === 'calendar') {
      draft = meta.dates[s.id] || [];
      body.innerHTML = `<div class="guide-step">${heading(s)}<div class="guide-area" data-area></div>${s.multi ? nextButton('Continuar', !draft.length) : `<div class="guide-next"><button type="button" class="btn btn-quiet btn-small" data-skip>${ICON.skip}${esc(s.skip)}</button></div>`}</div>`;
      Picker.calendar(body.querySelector('[data-area]'), {
        multi: Boolean(s.multi), max: s.multi || 1, value: draft,
        onChange: (list) => {
          draft = list;
          if (!s.multi) { meta.dates[s.id] = list; answers[s.id] = PICK.longDate(list[0]); exchange = null; later(advance); } else enable(list.length);
        }
      });
      return;
    }
    if (s.type === 'text') {
      /* En la dirección aparecen calles reales mientras se escribe abajo (geo.js) */
      const geo = s.id === 'direccion' && window.GEO;
      if (geo) window.GEO.prepare();
      const mapa = s.id === 'direccion' && window.MAPA && Picker.map;
      body.innerHTML = `<div class="guide-step">${heading(s)}${geo ? `<ul class="text-suggest" data-geo aria-label="Sugerencias" hidden></ul><p class="text-source" hidden>${esc(window.GEO.fuente)}</p>` : ''}${mapa ? `<div class="text-map" data-guide-map><button type="button" class="map-open" data-guide-map-open aria-haspopup="dialog"><span class="map-open-icon" aria-hidden="true">${PIN}</span><span class="map-open-text"><strong></strong><small></small></span><span class="map-open-chev" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg></span></button></div>` : ''}</div>`;
      input.value = value || '';
      paintMapRow();
      return;
    }
    if (s.type === 'contact') {
      body.innerHTML = `<div class="guide-step">${heading(s)}<div class="picks">${s.fields.map((f) => `
        <div class="pick pick-field"><span class="pick-text"><label class="pick-label" for="g-${f.id}">${esc(f.label)}</label><input id="g-${f.id}" name="${f.id}" type="${f.type || 'text'}" required maxlength="160" autocomplete="${f.autocomplete}"${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''}${f.type === 'email' ? ' spellcheck="false"' : ''}${f.type === 'tel' ? ' inputmode="tel"' : ''} value="${esc(answers[f.id] || '')}"></span></div>`).join('')}</div>${nextButton('Preparar solicitud')}</div>`;
    }
  };

  const renderDone = () => {
    composer.hidden = true;
    actions.hidden = false;
    const rows = active().flatMap((s, i) => (s.type === 'contact'
      ? [{ label: 'Contacto', value: s.fields.map((f) => answers[f.id]).filter(Boolean).join(' · '), i }]
      : answers[s.id] ? [{ label: s.label, value: shown(s), i }, ...(s.id === 'direccion' && meta.punto ? [{ label: 'Ubicación en el mapa', value: 'Punto marcado (va como enlace de Google Maps)', i }] : [])] : []));
    body.innerHTML = `<div class="guide-step guide-final">
      <div class="guide-done"><svg width="28" height="28" class="summary-check" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="16"/><path d="M11 18.5l5 5 9-10"/></svg>
        <div><h3 class="guide-q" tabindex="-1">Tu solicitud está lista.</h3><p class="guide-help">Envíala por WhatsApp con las fotografías; con eso revisamos el residuo, la cobertura, la disponibilidad y las condiciones del retiro para preparar la propuesta.</p></div></div>
      <dl class="review">${rows.map((r) => `<div><dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd><button type="button" class="text-link" data-edit="${r.i}">Cambiar<span class="sr-only"> ${esc(r.label)}</span></button></div>`).join('')}</dl>
      <p class="guide-note">Se abrirá WhatsApp con tu solicitud escrita. Revísala, adjunta las fotografías y envíala.</p>
    </div>`;
    actions.innerHTML = `<button type="button" class="btn btn-secondary btn-small" data-copy>${ICON.copy}${ICON.done}<span>Copiar</span></button><a class="btn btn-primary btn-small" href="${window.SITE.whatsapp(summaryText())}" target="_blank" rel="noopener noreferrer">${ICON.send}Enviar por WhatsApp<span class="sr-only"> (se abre en otra pestaña)</span></a>`;
  };

  const render = () => {
    paintHead();
    if (done) renderDone(); else renderStep(active()[index]);
    body.scrollTop = 0;
  };
  const go = (update) => transition(() => { update(); render(); }).then(() => {
    const q = body.querySelector('.guide-q');
    q?.focus({ preventScroll: true });
    if (!done && active()[index]?.type === 'contact') body.querySelector('input')?.focus({ preventScroll: true });
  });
  const firstMissing = () => {
    const steps = active();
    const at = steps.findIndex((s) => !answered(s));
    if (at === -1) { done = true; editing = false; index = steps.length; } else { done = false; index = at; }
  };
  const advance = () => go(() => {
    const steps = active();
    index += 1;
    if (editing) while (index < steps.length && answered(steps[index])) index += 1;
    if (index >= steps.length) { done = true; editing = false; index = steps.length; }
  });

  /* ---------- Conversación: interpreta el texto, completa lo que reconoce y pregunta lo que falta ---------- */
  const interpret = (text) => {
    const raw = String(text || '').trim();
    if (!raw) return;
    const step = done ? null : active()[index];
    /* En la pregunta de dirección, lo escrito es la dirección (no se busca nada más en el texto) */
    if (step?.id === 'direccion') {
      answers.direccion = raw;
      /* Si se eligió una calle sugerida, la comuna queda la de esa calle */
      const g = geoPicked && raw.startsWith(geoPicked.label) ? geoPicked : null;
      const cambia = Boolean(g?.comuna) && g.comuna !== answers.comuna;
      if (cambia) answers.comuna = g.comuna;
      geoPicked = null;
      exchange = { user: raw, bot: cambia ? `Perfecto, anoté la dirección y la comuna: ${g.comuna}.` : 'Perfecto, anoté la dirección.' };
      firstMissing();
      return;
    }
    const r = PARSE.read(raw);
    const got = [];
    let reply = '';
    const hasData = r.categoria || r.cantidad || r.comuna || r.modalidad || r.fecha || r.horario || r.almacenamiento || r.documentos.length;
    if (r.greeting && !hasData) {
      exchange = { user: raw, bot: 'Hola. Cuéntame qué necesitas retirar, dónde está y para cuándo; o elige una opción.' };
      return;
    }
    /* Lo escrito completa lo que falta o responde la pregunta actual; no cambia respuestas anteriores (para eso están los «Cambiar») */
    const may = (...ids) => ids.some((id) => !(id in answers) || step?.id === id);
    if (r.categoria && may('residuo')) { answers.residuo = r.categoria; meta.tipo = r.tipo; got.push(r.categoria); }
    if (r.cantidad && may('cantidad')) { answers.cantidad = r.cantidad.label; got.push(r.cantidad.label); }
    if (r.comuna && may('comuna')) { answers.comuna = r.comuna.commune; got.push(r.comuna.commune); }
    if (r.almacenamiento && may('almacenamiento')) {
      answers.almacenamiento = r.almacenamiento;
      if (!PICK.fold(r.cantidad?.label || '').includes(PICK.fold(r.almacenamiento).slice(0, 4))) got.push(`en ${r.almacenamiento.toLowerCase()}`);
    }
    if (r.modalidad && may('modalidad')) {
      const label = PICK.MODE_LABEL[r.modalidad];
      if (answers.modalidad !== label) { delete answers.fecha; delete answers.fechas; meta.dates = {}; }
      answers.modalidad = label;
    }
    if (r.fecha && may('fecha', 'fechas')) {
      if (answers.modalidad === 'Espera y ahorra') {
        const list = [...new Set([...(meta.dates.fechas || []), r.fecha])].sort().slice(-3);
        meta.dates.fechas = list;
        answers.fechas = list.map(PICK.longDate).join(', ');
      } else {
        answers.modalidad = 'Retiro Programado';
        meta.dates.fecha = [r.fecha];
        answers.fecha = PICK.longDate(r.fecha);
      }
      got.push(PICK.shortDate(r.fecha));
    }
    if (r.horario && may('horario')) {
      answers.horario = SLOT_OPTIONS.find((o) => o.label === r.horario)?.value || r.horario;
      got.push(r.horario.toLowerCase());
    }
    if (r.documentos.length && may('documentos')) { answers.documentos = r.documentos.join(', '); got.push(r.documentos.join(', ')); }
    const understood = got.length || r.modalidad || r.fueraDeCobertura;

    /* Si no se reconoció nada, el texto se toma como respuesta a la pregunta actual */
    if (step && !answered(step) && !understood) {
      if (step.id === 'residuo') { answers.residuo = cap(raw); meta.tipo = ''; got.push(`«${raw}»`); }
      else if (step.id === 'cantidad' && /\d/.test(raw)) { answers.cantidad = raw; got.push(raw); }
      else if (step.id === 'comuna') {
        const hits = PARSE.communeSearch(raw);
        if (hits.length === 1) { answers.comuna = hits[0].name; got.push(hits[0].name); }
        else if (hits.length) { meta.search = raw; reply = `Encontré ${hits.length} comunas con «${raw}». Elige la tuya.`; }
        else reply = `No encontré «${raw}» entre las comunas de la Región Metropolitana. Elígela en la lista.`;
      } else if (step.id === 'almacenamiento') { answers.almacenamiento = cap(raw); got.push(raw); }
      else if (step.id === 'documentos') { answers.documentos = cap(raw); got.push(raw); }
      else if (step.type === 'calendar') reply = r.fechaError || 'No reconocí el día. Elígelo en el calendario.';
      else if (step.id === 'horario') reply = 'No reconocí el horario. Elige una opción.';
      else if (step.id === 'cantidad') reply = 'No reconocí la cantidad. Elige un rango o escríbela con su unidad, por ejemplo 600 kg.';
      else reply = 'No logré entenderlo. Elige una opción o escríbelo de otra forma.';
    }
    if (!reply) {
      const parts = [];
      if (got.length) parts.push(`Anoté: ${got.join(' · ')}.`);
      if (r.modalidad === 'express') parts.push('Lo tratamos como Retiro Express: priorizamos tu retiro dentro de las próximas 24 horas, sujeto a disponibilidad, tipo de residuo y comuna.');
      else if (r.modalidad === 'programado') parts.push('Lo coordinamos como Retiro Programado.');
      else if (r.modalidad === 'flexible') parts.push('Lo coordinamos como Espera y ahorra, según nuestra disponibilidad.');
      if (r.fechaError && !r.fecha) parts.push(r.fechaError);
      if (r.fueraDeCobertura) parts.push(`Por ahora coordinamos retiros en la Región Metropolitana, y ${r.fueraDeCobertura} queda fuera. Si quieres, un especialista revisa tu caso.`);
      reply = parts.length ? (got.length ? parts.join(' ') : `Entendido. ${parts.join(' ')}`) : 'No logré entenderlo. Elige una opción o escríbelo de otra forma.';
    }
    exchange = { user: raw, bot: reply };
    if (got.length || r.modalidad) firstMissing();
  };

  /* Dirección: sugerencias de calles reales mientras se escribe; al tocar una queda escrita abajo para completarla y enviarla */
  /* Punto en el mapa (opcional): se marca en una ventana aparte y viaja como enlace de Google Maps */
  const paintMapRow = () => {
    const zone = body.querySelector('[data-guide-map]');
    if (!zone) return;
    zone.classList.toggle('has-point', Boolean(meta.punto));
    zone.querySelector('strong').textContent = meta.punto ? 'Punto marcado en el mapa' : 'Marcar el punto en el mapa';
    zone.querySelector('small').textContent = meta.punto ? 'Toca para verlo o cambiarlo' : 'Opcional: ayuda a llegar al lugar exacto';
  };
  body.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-guide-map-open]')) return;
    const r = await Picker.map({
      title: 'Marca el punto del retiro', sub: 'Mueve el mapa hasta dejar el marcador sobre el lugar.', value: meta.punto || null,
      vista: window.GEO?.locate(input.value || answers.direccion || '', { comuna: answers.comuna || '' }) ?? null
    });
    if (r === undefined) return;  // cerró sin confirmar
    meta.punto = r;
    paintMapRow();
  });
  const PIN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 1 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/></svg>';
  let geoItems = [];
  let geoCtrl = null;
  let geoTimer = 0;
  let geoTurn = 0;
  const geoDraw = (list) => {
    const box = body.querySelector('[data-geo]');
    if (!box) return;
    box.classList.toggle('is-fresh', box.hidden && list.length > 0);
    const same = list.length === geoItems.length && list.every((it, i) => it.label === geoItems[i].label && it.sub === geoItems[i].sub);
    geoItems = list;
    if (same && !box.hidden) return;
    box.innerHTML = list.map((it, i) => `<li><button type="button" class="suggest" data-i="${i}"><span class="suggest-pin">${PIN}</span><span class="suggest-text"><strong>${esc(it.label)}</strong><small>${esc(it.sub)}</small></span></button></li>`).join('');
    box.hidden = !list.length;
    box.nextElementSibling.hidden = !list.length;
    /* Con el teclado abierto queda poco espacio: la lista sube hasta quedar a la vista (sin mover la página) */
    if (list.length) requestAnimationFrame(() => {
      const area = body.getBoundingClientRect();
      const r = box.getBoundingClientRect();
      const falta = Math.min(r.bottom + 28 - area.bottom, r.top - area.top - 8);
      if (falta > 0) body.scrollTo({ top: body.scrollTop + falta, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
  };
  input.addEventListener('input', () => {
    if (!window.GEO || done || active()[index]?.id !== 'direccion') return;
    clearTimeout(geoTimer);
    const q = input.value.trim();
    if (q.length < 3 || (geoPicked && q.startsWith(geoPicked.label))) { geoCtrl?.abort(); geoTurn += 1; geoDraw([]); return; }
    geoTimer = setTimeout(async () => {
      geoCtrl?.abort();
      geoCtrl = new AbortController();
      const mine = ++geoTurn;
      let list = [];
      try { list = await window.GEO.suggest(q, { comuna: answers.comuna || '', signal: geoCtrl.signal }); } catch { list = []; }
      if (mine === geoTurn) geoDraw(list || []);
    }, 140);
  });
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-geo] .suggest');
    const it = b && geoItems[Number(b.dataset.i)];
    if (!it) return;
    geoPicked = it;
    input.value = it.value;
    geoDraw([]);
    input.focus({ preventScroll: true });
  });

  composer.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value;
    input.value = '';
    if (text.trim()) go(() => interpret(text));
  });

  body.addEventListener('click', async (e) => {
    const s = active()[index];
    if (e.target.closest('[data-describe]')) { input.placeholder = 'Ej.: polvo gris de la limpieza de hornos'; input.focus(); return; }
    if (e.target.closest('[data-all]')) {
      const group = (kind, label) => ({ label, options: PICK.CATEGORIES[kind === 'peligroso' ? 'hazard' : 'safe'].map(([n, file]) => ({ value: `${kind}|${n}`, label: n, img: PICK.thumb(file) })) });
      const v = await Picker.choose({ title: '¿Qué residuo necesitas retirar?', sub: 'Las imágenes son ilustrativas: la clasificación se confirma con los antecedentes.', groups: [group('no-peligroso', 'No peligrosos'), group('peligroso', 'Peligrosos')], value: `${meta.tipo}|${answers.residuo}`, search: 'Buscar residuo', layout: 'tiles', tabs: true });
      if (!v) return;
      const [kind, name] = v.split('|');
      meta.tipo = kind; answers.residuo = name; exchange = null;
      advance();
      return;
    }
    if (e.target.closest('[data-skip]')) { answers[s.id] = ''; meta.dates[s.id] = []; exchange = null; advance(); return; }
    const edit = e.target.closest('[data-edit]');
    if (edit) { go(() => { done = false; editing = true; exchange = null; index = Number(edit.dataset.edit); }); return; }
    if (!e.target.closest('[data-continue]') || !s) return;
    if (s.type === 'multi') answers[s.id] = s.options.map((o) => o.value).filter((v) => draft.includes(v)).join(', ');
    else if (s.type === 'calendar') { meta.dates[s.id] = draft; answers[s.id] = draft.map(PICK.longDate).join(', '); }
    else if (s.type === 'contact') {
      const fields = [...body.querySelectorAll('input')];
      const bad = fields.find((f) => {
        f.setCustomValidity(!f.value.trim() ? 'Completa este dato.' : f.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.value.trim()) ? 'Revisa el correo, por ejemplo: nombre@empresa.cl' : '');
        return !f.checkValidity();
      });
      if (bad) { bad.reportValidity(); bad.focus(); return; }
      fields.forEach((f) => { answers[f.name] = f.value.trim(); });
    }
    exchange = null;
    advance();
  });
  body.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('.pick-field input')) { e.preventDefault(); body.querySelector('[data-continue]')?.click(); }
  });
  trail.addEventListener('click', (e) => {
    const edit = e.target.closest('[data-edit]');
    if (edit) go(() => { editing = true; exchange = null; index = Number(edit.dataset.edit); });
  });
  backBtn.addEventListener('click', () => go(() => {
    exchange = null;
    if (done) { done = false; index = active().length - 1; } else index = Math.max(0, index - 1);
  }));
  /* «Ir al formulario»: se lleva todo lo respondido */
  panel.querySelector('[data-mode="form"]')?.addEventListener('click', () => {
    window.QUOTE?.fill({ answers, meta });
    window.HERO?.show('cotizar');
  });
  d.addEventListener('numberflow:ready', paintHead);
  actions.addEventListener('click', async (e) => {
    const copy = e.target.closest('[data-copy]');
    if (!copy) return;
    try { await navigator.clipboard.writeText(summaryText().replaceAll('*', '')); window.SITE.toast('Resumen copiado'); window.SITE.done(copy); }
    catch { window.SITE.toast('No se pudo copiar'); }
  });

  /* Abrir en el hero: botones [data-assistant-open] (formulario, especialista, botón flotante, barra móvil) */
  const open = (from = 'link', tab = 'cotizar') => {
    if (window.HERO?.view !== 'asistente') render();
    return window.HERO?.show('asistente', { from, tab });
  };
  d.querySelectorAll('[data-assistant-open]').forEach((b) => {
    b.hidden = false;
    b.addEventListener('click', (e) => {
      e.preventDefault();
      open(b.closest('[data-hero]') ? 'hero' : 'link', b.closest('#especialista') ? 'especialista' : 'cotizar')
        ?.then(() => body.querySelector('.guide-q')?.focus({ preventScroll: true }));
    });
  });

  window.GUIDE = {
    open: (from = 'hero') => Promise.resolve(open(from, 'cotizar')).then(() => body.querySelector('.guide-q')?.focus({ preventScroll: true })),
    /* Desde el campo de texto del hero: abre el asistente y procesa lo escrito */
    ingest: (text) => {
      if (window.HERO?.view === 'asistente') return go(() => interpret(text));
      interpret(text);
      render();
      return Promise.resolve(window.HERO?.show('asistente', { tab: 'cotizar' })).then(() => body.querySelector('.guide-q')?.focus({ preventScroll: true }));
    }
  };
  render();
})();
