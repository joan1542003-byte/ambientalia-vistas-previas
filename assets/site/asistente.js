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

  /* Tipos de residuo: [valor, nombre, clave en PICK.CATEGORIES, ejemplos, ícono] */
  const svg = (trazos) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${trazos}</svg>`;
  const TIPOS = [
    ['no-peligroso', 'No peligrosos', 'safe', 'Papel y cartón, plásticos, metales y más', svg('<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7"/><path d="m7.5 4.27 9 5.15"/>')],
    ['peligroso', 'Peligrosos', 'hazard', 'Aceites, baterías, solventes y más', svg('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>')]
  ];
  /* Teléfono: solo caracteres de teléfono y al menos 8 números (lo mismo que pide el formulario y revisa el servidor) */
  const TEL = { patron: String.raw`(?=(?:\D*\d){8})[+\d\s.\-\(\)]{8,30}`, titulo: 'Escribe un teléfono con al menos 8 números' };
  const MODES = Picker.MODES.map((m) => ({ ...m, value: PICK.MODE_LABEL[m.value], key: m.value }));
  const SLOT_OPTIONS = PICK.SLOTS.map(([t, h]) => ({ value: PICK.slotText(t), label: t, hint: h, icon: PICK.SLOT_ICONS[t] }));

  const STEPS = [
    { id: 'residuo', label: 'Residuo', type: 'residuo', ask: '¿Qué necesitas retirar?', help: 'Elige el tipo de residuo o escríbelo abajo con tus palabras.', hint: 'Ej.: 20 sacos de cartón en Quilicura' },
    { id: 'cantidad', label: 'Cantidad aproximada', type: 'options', layout: 'list', ask: '¿Cuánto residuo tienes aproximadamente?', help: 'Un rango aproximado basta; lo precisamos al cotizar.', hint: 'Ej.: 600 kg',
      options: PICK.AMOUNTS.map((a, i) => ({ value: a, label: a, icon: PICK.AMOUNT_ICONS[i] })) },
    { id: 'comuna', label: 'Comuna', type: 'commune', ask: '¿En qué comuna se encuentra?', help: `Por ahora atendemos ${PICK.coberturaTexto}. Elige la tuya.`, hint: 'Escribe tu comuna' },
    { id: 'direccion', label: 'Dirección', type: 'text', sub: true, ask: '¿Cuál es la dirección del retiro?', help: 'Calle, número y alguna referencia.', hint: 'Escribe la dirección' },
    { id: 'almacenamiento', label: 'Almacenamiento', type: 'options', layout: 'cards', ask: '¿Cómo está almacenado?', hint: 'Ej.: en tambores',
      options: PICK.STORAGE.map(([x, icon]) => ({ value: x, label: x, icon })) },
    { id: 'modalidad', label: 'Plan', type: 'options', layout: 'list', ask: '¿Cuándo necesitas retirarlo?', hint: 'Ej.: es urgente', options: MODES },
    { id: 'fecha', label: 'Fecha', type: 'calendar', sub: true, skip: 'Aún no lo sé', when: (a) => a.modalidad === 'Retiro Programado',
      ask: '¿Qué día te acomoda?', help: 'Lo confirmamos según disponibilidad, tipo de residuo y comuna.', hint: 'Ej.: el lunes' },
    { id: 'fechas', label: 'Fechas posibles', type: 'calendar', multi: 3, sub: true, when: (a) => a.modalidad === 'Espera y ahorra',
      ask: '¿Qué días te acomodan?', help: 'Elige hasta tres; coordinamos según nuestra disponibilidad.', hint: 'Ej.: lunes 5 de octubre' },
    { id: 'horario', label: 'Horario', type: 'options', layout: 'cards', sub: true, ask: '¿En qué horario se puede retirar?', hint: 'Ej.: en la mañana', options: SLOT_OPTIONS },
    { id: 'documentos', label: 'Documentación del residuo', type: 'multi', layout: 'list', exclusive: 'Sin documentos por ahora', hint: 'Ej.: tengo la HDS',
      ask: '¿Tienes algún antecedente o documento del residuo?', help: 'Si tienes HDS/FDS, análisis u otra documentación, podrás adjuntarla por WhatsApp.',
      options: PICK.DOCS.map((x) => ({ value: x, label: x, icon: PICK.DOC_ICONS[x] })) },
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
  let choice = null; // opciones del paso actual (Picker.options)
  let other = '';    // opción «Otro» elegida en el paso actual, a la espera de su texto
  let exchange = null; // última conversación: { user, bot }
  let enviada = null;  // la solicitud ya se envió al servidor: { r: respuesta, n: fotografías adjuntas }. Desde ahí no se cambia ni se reenvía

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
    if (done) count.textContent = enviada ? 'Solicitud enviada' : 'Solicitud lista';
    else if (customElements.get('number-flow')) {
      let flow = count.querySelector('number-flow');
      if (!flow) { count.textContent = 'Paso '; flow = d.createElement('number-flow'); count.append(flow, ` de ${TOTAL}`); }
      flow.update(stepNumber(index));
    } else count.textContent = `Paso ${stepNumber(index)} de ${TOTAL}`;
    bar.style.setProperty('--p', `${done ? 100 : Math.max(((stepNumber(index) - 1) / TOTAL) * 100, 5)}%`);
    /* La flecha está en todos los pasos: en el primero vuelve al inicio (cierra la tarjeta), como «Atrás» del formulario */
    backBtn.hidden = Boolean(enviada);
    backBtn.setAttribute('aria-label', !done && index === 0 ? 'Volver' : 'Paso anterior');
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
    next: '<svg width="20" height="20" class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>',
    check: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
    copy: '<svg width="20" height="20" class="icon-idle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
    done: '<svg width="20" height="20" class="icon-done" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
    send: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/></svg>',
    skip: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
  };
  const nextButton = (label, disabled = false) => `<div class="guide-next"><button type="button" class="btn btn-primary btn-small" data-continue${disabled ? ' disabled' : ''}>${label === 'Continuar' ? `${esc(label)} ${ICON.next}` : `${ICON.check}${esc(label)}`}</button></div>`;
  const enable = (on) => { const b = body.querySelector('[data-continue]'); if (b) b.disabled = !on; };

  const renderStep = (s) => {
    const value = answers[s.id];
    /* Sin campo para escribir donde no hace falta: en los datos de contacto y en las preguntas de varias opciones
       (los antecedentes), donde el campo dejaba «Continuar» fuera de la vista */
    composer.hidden = s.type === 'contact' || s.type === 'multi';
    actions.hidden = true;
    input.placeholder = s.hint || 'Escribe tu respuesta';
    if (s.type === 'residuo') {
      /* Solo dos opciones a la vista, los dos tipos de residuo (corrección del cliente, 09-10-2026: con las categorías
         en el propio paso había que bajar para verlas todas). Cada tipo abre la ventana con todas sus categorías, la
         misma del formulario; la otra forma de responder es escribirlo abajo. */
      body.innerHTML = `<div class="guide-step">${heading(s)}
        <div class="opts is-list guide-area guide-tipos">${TIPOS.map(([kind, label, key, ejemplos, icono]) => {
          const suyo = Boolean(value) && meta.tipo === kind;
          return `<button type="button" class="opt" data-tipo="${kind}" aria-haspopup="dialog" aria-pressed="${suyo}"><span class="opt-icon" aria-hidden="true">${icono}</span><span class="opt-text"><strong>${label}</strong><small>${suyo ? esc(value) : `${ejemplos} · ${PICK.CATEGORIES[key].length} categorías`}</small></span><i class="opt-chev" aria-hidden="true"></i></button>`;
        }).join('')}</div></div>`;
      return;
    }
    if (s.type === 'options' || s.type === 'multi') {
      const multi = s.type === 'multi';
      if (multi) draft = value ? value.split(', ') : [];
      /* Una opción «Otro» despliega su campo para escribir cuál, igual que en el formulario: no avanza sola, se
         continúa con el botón (o con Enter) y queda como «Otro: lo escrito» */
      const options = s.options.map((o) => ({ ...o, other: !multi && PICK.isOther(o.label) }));
      const [base, texto] = !multi && PICK.isOther(value || '') ? PICK.splitOther(value) : [value, ''];
      const withOther = options.some((o) => o.other);
      other = withOther && PICK.isOther(base || '') ? base : '';
      body.innerHTML = `<div class="guide-step">${heading(s)}<div class="guide-area" data-area></div>${multi ? nextButton('Continuar', !draft.length) : withOther ? nextButton('Continuar') : ''}</div>`;
      if (withOther) body.querySelector('.guide-next').hidden = !other;
      choice = Picker.options(body.querySelector('[data-area]'), {
        groups: [{ options }], value: multi ? draft : base, multi, otherText: texto, otherLabel: s.ask,
        exclusive: s.exclusive ? [s.exclusive] : [], layout: s.layout,
        onPick: (v) => {
          if (choice.others.includes(v)) { other = v; const next = body.querySelector('.guide-next'); next.hidden = false; if (!matchMedia('(pointer: coarse)').matches) Picker.reveal(next); return; }
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
      const mapa = s.id === 'direccion' && window.MAPA && window.GEO;
      body.innerHTML = `<div class="guide-step">${heading(s)}${geo ? `<ul class="text-suggest" data-geo aria-label="Sugerencias" hidden></ul><p class="text-source" hidden>${esc(window.GEO.fuente)}</p>` : ''}${mapa ? `<div class="text-map" data-guide-map><button type="button" class="map-open" data-guide-map-open aria-haspopup="dialog"><span class="map-open-icon" aria-hidden="true">${PIN}</span><span class="map-open-text"><strong></strong><small></small></span><span class="map-open-chev" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></span></button></div>` : ''}</div>`;
      input.value = value || '';
      paintMapRow();
      return;
    }
    if (s.type === 'contact') {
      body.innerHTML = `<div class="guide-step">${heading(s)}<div class="picks">${s.fields.map((f) => `
        <div class="pick pick-field"><span class="pick-text"><label class="pick-label" for="g-${f.id}">${esc(f.label)}</label><input id="g-${f.id}" name="${f.id}" type="${f.type || 'text'}" required maxlength="160" autocomplete="${f.autocomplete}"${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''}${f.type === 'email' ? ' spellcheck="false"' : ''}${f.type === 'tel' ? ` inputmode="tel" pattern="${TEL.patron}" title="${TEL.titulo}"` : ''} value="${esc(answers[f.id] || '')}"></span></div>`).join('')}</div>${nextButton('Preparar solicitud')}</div>`;
    }
  };

  /* Las cotizaciones de Transporte las recibe solo el asistente Laravel, por el formulario (form[data-cotizar-api],
     transporte-ui.js): este asistente no las envía a WordPress aunque el sitio corra ahí. Para enviarla en línea lleva
     lo respondido a ese formulario («Enviar en línea»), que pide aceptar el aviso de privacidad y la envía con sus fotos.
     El envío a WordPress (servidor) solo valdría en una página sin ese formulario, y hoy no hay ninguna. */
  const servidor = Boolean(window.SITE.enviar) && !d.querySelector('form[data-cotizar-api]');
  const enLinea = () => 'cotizarOn' in (d.querySelector('form[data-cotizar-api]')?.dataset || {});
  const alFormulario = (alFinal) => {
    const form = d.getElementById('cotizacion');
    const out = form && d.getElementById(form.dataset.summary);
    if (out && !out.hidden) out.querySelector('[data-edit]')?.click();  // un resumen anterior a la vista: vuelve al formulario
    window.QUOTE?.fill({ answers, meta });
    if (alFinal) form?.goTo?.(Infinity);  // contacto, fotos y la aceptación del aviso: de ahí sale la solicitud
    window.HERO?.show('cotizar');
  };

  /* Fotografías adjuntas (solo con el envío a WordPress). La franja se arma una vez y se conserva entre pasos: lo
     adjuntado no se pierde si la persona vuelve a cambiar una respuesta. */
  const fotosHost = servidor && window.SITE.fotos ? Object.assign(d.createElement('div'), { className: 'fotos' }) : null;
  const fotos = fotosHost ? window.SITE.fotos(fotosHost) : null;

  /* Tras enviar una solicitud, la siguiente parte de cero */
  const reiniciar = () => {
    Object.keys(answers).forEach((k) => delete answers[k]);
    Object.keys(meta).forEach((k) => delete meta[k]);
    Object.assign(meta, { tipo: '', region: '', dates: {}, search: '' });
    geoPicked = null; index = 0; done = false; editing = false; describing = false; draft = []; choice = null; other = ''; exchange = null; enviada = null;
  };

  const renderDone = () => {
    composer.hidden = true;
    const linea = !servidor && enLinea();
    actions.hidden = false;
    const rows = active().flatMap((s, i) => (s.type === 'contact'
      ? [{ label: 'Contacto', value: s.fields.map((f) => answers[f.id]).filter(Boolean).join(' · '), i }]
      : answers[s.id] ? [{ label: s.label, value: shown(s), i }, ...(s.id === 'direccion' && meta.punto ? [{ label: 'Ubicación en el mapa', value: 'Punto marcado (va como enlace de Google Maps)', i }] : [])] : []));
    body.innerHTML = `<div class="guide-step guide-final">
      <div class="guide-done"><svg width="28" height="28" class="summary-check" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="16"/><path d="M11 18.5l5 5 9-10"/></svg>
        <div><h3 class="guide-q" tabindex="-1">${enviada ? 'Solicitud enviada.' : 'Tu solicitud está lista.'}</h3><p class="guide-help">${enviada ? esc(window.SITE.enviada(enviada.r, enviada.n)) : `${servidor ? 'Adjunta fotografías si las tienes y envíala' : 'Envíala con las fotografías'}; con eso revisamos el residuo, la cobertura, la disponibilidad y las condiciones del retiro para preparar la propuesta.`}</p></div></div>
      <dl class="review">${rows.map((r) => `<div><dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd>${enviada ? '' : `<button type="button" class="text-link" data-edit="${r.i}">Cambiar<span class="sr-only"> ${esc(r.label)}</span></button>`}</div>`).join('')}</dl>
      ${enviada ? '' : `<p class="guide-note">${servidor ? 'Al enviarla te llegará un correo con su número; usaremos tus datos solo para responder esta solicitud.' : linea ? 'Para enviarla en línea y recibir su número, «Enviar en línea» la lleva al formulario: ahí agregas las fotos y aceptas el aviso de privacidad.' : 'Se abrirá con tu solicitud ya escrita. Revísala, adjunta las fotografías y envíala.'}</p>`}
    </div>`;
    /* La franja de fotografías queda fija sobre los botones, fuera de la zona que se desplaza */
    if (fotosHost && !enviada) { actions.before(fotosHost); fotos.bloquear(false); }
    /* WhatsApp (verde, con su ícono) y, si el formulario de cotización declara su correo de destino, también correo */
    const correo = d.getElementById('cotizacion')?.dataset.mail;
    /* Con el envío a WordPress (servidor) la vía principal es enviarla allí; con el asistente Laravel (linea), seguir
       en el formulario, que la envía */
    if (servidor && !enviada) window.SITE.permiso();
    actions.classList.toggle('has-mail', !!correo && !servidor && !linea);
    actions.classList.toggle('has-envio', servidor || linea);
    actions.innerHTML = `${enviada ? '' : servidor ? `<button type="button" class="btn btn-primary btn-small" data-enviar>${ICON.send}<span>Enviar solicitud</span></button>` : linea ? `<button type="button" class="btn btn-primary btn-small" data-en-linea>${ICON.send}<span>Enviar en línea</span></button>` : correo ? '<span class="foot-label">Enviar por</span>' : ''
    }<a class="btn btn-wa btn-small" href="${window.SITE.whatsapp(summaryText())}" target="_blank" rel="noopener noreferrer">${window.SITE.ICON.wa}<span><span class="btn-pre">Enviar por </span>WhatsApp<span class="sr-only"> (se abre en otra pestaña)</span></span></a>${
      correo && !servidor && !linea ? `<a class="btn btn-secondary btn-small" href="${esc(window.SITE.mailto(correo, summaryText()))}">${window.SITE.ICON.mail}<span><span class="btn-pre">Enviar por </span><span class="btn-cap">correo</span></span></a>` : ''
    }<span class="foot-more"><button type="button" class="btn btn-secondary btn-small" data-copy>${ICON.copy}${ICON.done}<span>Copiar</span></button>${
      enviada ? '<button type="button" class="btn btn-quiet btn-small" data-nueva>Nueva solicitud</button>' : ''}</span>`;
  };

  const render = () => {
    paintHead();
    if (!done || enviada) fotosHost?.remove();
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
      const fuera = Boolean(g?.comuna) && !PICK.enCobertura(g.comuna);
      const cambia = Boolean(g?.comuna) && !fuera && g.comuna !== answers.comuna;
      if (cambia) answers.comuna = g.comuna;
      geoPicked = null;
      exchange = { user: raw, bot: fuera ? `Anoté la dirección, pero queda en ${g.comuna} y por ahora atendemos ${PICK.coberturaTexto}. Si quieres, escríbenos por WhatsApp y lo revisamos.`
        : cambia ? `Perfecto, anoté la dirección y la comuna: ${g.comuna}.` : 'Perfecto, anoté la dirección.' };
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
        const todas = PARSE.communeSearch(raw);
        const hits = todas.filter((c) => PICK.enCobertura(c.name));
        if (hits.length === 1) { answers.comuna = hits[0].name; got.push(hits[0].name); }
        else if (hits.length) { meta.search = raw; reply = `Encontré ${hits.length} comunas con «${raw}». Elige la tuya.`; }
        else if (todas.length) reply = `Por ahora atendemos ${PICK.coberturaTexto}; ${todas[0].name} queda fuera. Si quieres, escríbenos por WhatsApp y lo revisamos.`;
        else reply = `No encontré «${raw}». Por ahora atendemos ${PICK.coberturaTexto}: elige la tuya en la lista.`;
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
      if (r.fueraDeCobertura) parts.push(`Por ahora coordinamos retiros en ${PICK.coberturaTexto}, y ${r.fueraDeCobertura} queda fuera. Si quieres, un especialista revisa tu caso.`);
      reply = parts.length ? (got.length ? parts.join(' ') : `Entendido. ${parts.join(' ')}`) : 'No logré entenderlo. Elige una opción o escríbelo de otra forma.';
    }
    exchange = { user: raw, bot: reply };
    if (got.length || r.modalidad) firstMissing();
  };

  /* Dirección: sugerencias de calles reales mientras se escribe; al tocar una queda escrita abajo para completarla y enviarla */
  /* Mapa (opcional): abre la misma ventana de dirección del formulario, donde el texto y el mapa se completan entre sí.
     Al confirmar, la dirección queda respondida; el punto marcado viaja como enlace de Google Maps */
  const paintMapRow = () => {
    const zone = body.querySelector('[data-guide-map]');
    if (!zone) return;
    zone.classList.toggle('has-point', Boolean(meta.punto));
    zone.querySelector('strong').textContent = meta.punto ? 'Punto marcado en el mapa' : 'Ubicar en el mapa';
    zone.querySelector('small').textContent = meta.punto ? 'Toca para verlo o cambiarlo' : 'Toca el lugar y escribimos la dirección';
  };
  body.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-guide-map-open]')) return;
    const GEO = window.GEO;
    let punto = meta.punto || null;
    let elegido = null;
    let lugar = null;
    const v = await Picker.text({
      title: '¿Dónde retiramos?', sub: 'Calle y número, y una referencia si ayuda: bodega, portón o piso.', label: 'Dirección del retiro',
      value: input.value.trim() || answers.direccion || '', placeholder: 'Ej.: Av. Las Industrias 1234, bodega 3', autocomplete: 'street-address',
      suggest: (q, signal) => GEO.suggest(q, { comuna: answers.comuna || '', signal }).then((l) => l.filter((x) => !x.comuna || PICK.enCobertura(x.comuna))), onSuggest: (it) => { elegido = it; }, source: GEO.fuente,
      map: window.MAPA.paraTexto({ comuna: () => answers.comuna || '', value: punto, onDone: (p) => { punto = p; }, onPlace: (x) => { lugar = x; } })
    });
    if (!v) return;  // cerró sin confirmar
    meta.punto = punto;
    /* La comuna queda la del punto marcado o, si no hay, la de la calle sugerida (interpret la aplica) */
    geoPicked = punto && lugar?.comuna ? { label: v, comuna: lugar.comuna } : elegido;
    input.value = '';
    geoDraw([]);
    go(() => interpret(v));
  });
  const PIN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>';
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
      try { list = (await window.GEO.suggest(q, { comuna: answers.comuna || '', signal: geoCtrl.signal })).filter((x) => !x.comuna || PICK.enCobertura(x.comuna)); } catch { list = []; }
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
    const tipo = e.target.closest('[data-tipo]');
    if (tipo) {
      const grupo = ([kind, label, key]) => ({ label, options: PICK.CATEGORIES[key].map(([n, file]) => ({ value: `${kind}|${n}`, label: n, img: PICK.thumb(file) })) });
      const orden = [...TIPOS].sort((x, y) => Number(y[0] === tipo.dataset.tipo) - Number(x[0] === tipo.dataset.tipo));  // la pestaña del tipo elegido va primero
      const v = await Picker.choose({ title: '¿Qué residuo necesitas retirar?', sub: 'Las imágenes son ilustrativas: la clasificación se confirma con los antecedentes.', groups: orden.map(grupo), tabs: true, value: `${meta.tipo}|${answers.residuo}`, search: 'Buscar residuo', layout: 'tiles' });
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
    else if (s.type === 'options') answers[s.id] = PICK.joinOther(other, choice.other());
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
    if (e.key === 'Enter' && e.target.matches('.pick-field input, [data-other] input')) { e.preventDefault(); body.querySelector('[data-continue]')?.click(); }
  });
  trail.addEventListener('click', (e) => {
    const edit = e.target.closest('[data-edit]');
    if (edit && !enviada) go(() => { editing = true; exchange = null; index = Number(edit.dataset.edit); });
  });
  backBtn.addEventListener('click', () => {
    if (!done && index === 0) { panel.dispatchEvent(new CustomEvent('hero:close', { bubbles: true })); return; }  // primer paso: cierra la tarjeta
    go(() => {
      exchange = null;
      if (done) { done = false; index = active().length - 1; } else index = Math.max(0, index - 1);
    });
  });
  /* «Ir al formulario»: se lleva todo lo respondido */
  panel.querySelector('[data-mode="form"]')?.addEventListener('click', () => alFormulario(false));
  d.addEventListener('numberflow:ready', paintHead);
  actions.addEventListener('click', async (e) => {
    const ship = e.target.closest('[data-enviar]');
    if (ship) {
      ship.disabled = true;
      fotos?.bloquear(true);
      const adjuntas = fotos?.blobs() || [];
      /* Mientras sube, una capa cubre el asistente (bajo su encabezado): avance de las fotografías o «enviando» */
      const capa = window.SITE.enviando(panel, panel.querySelector('.hcard-head'));
      capa.paso(adjuntas.length ? 'Subiendo fotografías…' : 'Enviando tu solicitud…', adjuntas.length ? 0 : null);
      try {
        const campos = active().flatMap((s) => (s.type !== 'contact' && answers[s.id] ? [[s.label, s.id === 'residuo' ? shown(s) : answers[s.id]], ...(s.id === 'direccion' && meta.punto && window.MAPA ? [['Ubicación en el mapa', window.MAPA.enlace(meta.punto)]] : [])] : []));
        const r = await window.SITE.enviar(
          { origen: 'asistente', titulo: TITLE, contacto: { empresa: answers.empresa, nombre: answers.nombre, telefono: answers.telefono, correo: answers.correo }, campos },
          { fotos: adjuntas, avance: adjuntas.length ? (f) => capa.paso(f < 1 ? 'Subiendo fotografías…' : 'Enviando tu solicitud…', f < 1 ? f : null) : null }
        );
        enviada = { r, n: adjuntas.length };
        if (fotosHost) { fotosHost.remove(); fotos.vaciar(); }
        render();  // bajo la capa: queda el número, sin «Cambiar» ni «Enviar solicitud»
        await capa.listo(`Solicitud ${r.numero} enviada`);
        body.querySelector('.guide-q')?.focus({ preventScroll: true });
      } catch (err) {
        capa.quitar();
        ship.disabled = false;
        fotos?.bloquear(false);
        window.SITE.toast(`${err.message || 'No pudimos enviar la solicitud.'} También puedes enviarla por WhatsApp.`);
      }
      return;
    }
    if (e.target.closest('[data-en-linea]')) { alFormulario(true); return; }
    if (e.target.closest('[data-nueva]')) { go(reiniciar); return; }
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
      if (enviada) reiniciar();  // lo escrito después de enviar una solicitud es otra consulta
      if (window.HERO?.view === 'asistente') return go(() => interpret(text));
      interpret(text);
      render();
      return Promise.resolve(window.HERO?.show('asistente', { tab: 'cotizar' })).then(() => body.querySelector('.guide-q')?.focus({ preventScroll: true }));
    }
  };
  render();
})();
