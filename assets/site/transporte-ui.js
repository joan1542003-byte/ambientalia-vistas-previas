/* Transporte Autorizado: el hero cambia en el mismo lugar según la opción elegida (cotizar, buscar,
   especialista o asistente guiado). Los campos del formulario se eligen en ventanas de selección (seleccion.js).
   Transiciones: el cambio se aplica de inmediato; la tarjeta ajusta su alto con una animación corta y el contenido
   nuevo entra con CSS (transporte.css). Sin View Transitions: se ve igual en todos los navegadores y en móvil. */
(() => {
  const d = document;
  const PICK = window.PICK;
  const Picker = window.Picker;
  const motion = matchMedia('(prefers-reduced-motion: no-preference)');
  const mobile = matchMedia('(max-width: 860px)');

  /* Cambio de estado: aplica el cambio y anima solo el alto de la tarjeta (de su alto anterior al nuevo).
     El contenido que aparece entra con CSS. Devuelve una promesa que se cumple con el DOM ya actualizado. */
  let resize = null;
  const transition = (update) => {
    const card = d.querySelector('.hcard');
    const visible = () => !!card && card.getClientRects().length > 0;
    const from = visible() ? card.offsetHeight : 0;
    update();
    if (motion.matches && from && visible() && card.animate) {
      const to = card.offsetHeight;
      if (Math.abs(to - from) > 1) {
        resize?.cancel();
        resize = card.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 340, easing: 'cubic-bezier(.25, 1, .5, 1)' });
      }
    }
    return Promise.resolve();
  };

  /* ---------- Formulario: filas que abren una ventana de selección ---------- */
  const form = d.getElementById('cotizacion');
  const when = { modalidad: '', dates: [], slot: 'Cualquier horario', desde: '8:00', hasta: '17:00' };
  if (form && PICK && Picker) {
    const field = (n) => form.querySelector(`[name="${n}"]`);
    const set = (n, value = '', text) => {
      const el = field(n);
      if (!el) return;
      el.value = value;
      if (text) el.dataset.text = text; else delete el.dataset.text;
    };
    const list = (v) => (v ? v.split(', ') : []);
    const sorted = (picked, all) => all.filter((x) => picked.includes(x));
    const slotText = () => {
      if (when.slot === 'otro') return `Entre ${when.desde} y ${when.hasta}`;
      const s = PICK.SLOTS.find(([t]) => t === when.slot);
      return s && s[0] !== 'Cualquier horario' ? `${s[0]} (${s[1]})` : when.slot;
    };

    /* Vuelca el estado de fecha y horario a los campos ocultos que lee el resumen */
    const writeWhen = () => {
      const m = when.modalidad;
      const one = m === 'programado' && when.dates[0];
      const many = m === 'flexible' && when.dates.length;
      set('modalidad', m, PICK.MODE_LABEL[m]);
      set('fecha', one ? when.dates[0] : '', one ? PICK.longDate(when.dates[0]) : '');
      set('fechas', many ? when.dates.join(',') : '', many ? when.dates.map(PICK.longDate).join(', ') : '');
      set('fecha-ok', one || many ? 'ok' : '');
      set('horario', when.slot, slotText());
    };

    const MODE_HINT = {
      '': 'Elige qué tan pronto lo necesitas.',
      express: 'Priorizamos tu retiro dentro de las próximas 24 horas, sujeto a disponibilidad.',
      programado: 'Eliges el día y coordinamos el retiro.',
      flexible: 'Tú propones hasta tres días y coordinamos según disponibilidad.'
    };
    /* Texto visible de cada fila */
    const paint = () => {
      const show = (name, text, placeholder) => {
        const v = form.querySelector(`[data-pick="${name}"] .pick-value`);
        if (!v) return;
        v.textContent = text || placeholder || v.dataset.empty;
        v.classList.toggle('is-empty', !text);
      };
      const tipo = field('tipo').value;
      const cat = field('categoria').value;
      show('servicio', PICK.SERVICES.find(([k]) => k === field('servicio').value)?.[1]);
      show('residuo', tipo === 'no-se' ? 'No lo sé: lo describes abajo' : cat ? `${cat} · ${PICK.TIPO_LABEL[tipo]}` : '',
        tipo === 'peligroso' ? 'Elige el residuo peligroso' : tipo === 'no-peligroso' ? 'Elige el residuo no peligroso' : '');
      show('cantidad', field('cantidad').value);
      show('comuna', field('comuna').value);
      show('direccion', field('direccion').value);
      /* Tipo de retiro: tres botones en la misma fila y una línea que explica el elegido */
      form.querySelectorAll('[data-modalidad]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.modalidad === when.modalidad)));
      const hint = form.querySelector('[data-modalidad-hint]');
      if (hint) hint.textContent = MODE_HINT[when.modalidad] || MODE_HINT[''];
      const multi = when.modalidad === 'flexible';
      const label = form.querySelector('[data-fecha-label]');
      if (label) label.textContent = multi ? 'Días posibles' : 'Día del retiro';
      show('fecha', multi ? when.dates.map(PICK.shortDate).join(', ') : when.dates[0] ? PICK.longDate(when.dates[0]) : '', multi ? 'Elige hasta tres días' : 'Elige el día');
      show('horario', slotText());
      show('antecedentes', field('documentos').value);
      show('detalles', [field('acceso').value, field('estado').value, field('almacenamiento').value].filter(Boolean).join(' · '));
    };

    /* Coherencia cuando un enlace preselecciona valores (planes y servicios usan data-set) */
    const normalize = () => {
      const serv = field('servicio');
      serv.dataset.text = PICK.SERVICES.find(([k]) => k === serv.value)?.[1] || 'Retiro de residuos';
      const tipo = field('tipo').value;
      if (tipo) field('tipo').dataset.text = PICK.TIPO_LABEL[tipo];
      const cat = field('categoria').value;
      const inKind = tipo === 'peligroso' ? PICK.CATEGORIES.hazard : PICK.CATEGORIES.safe;
      if (cat && (tipo === 'no-se' || !inKind.some(([n]) => n === cat))) set('categoria', '');
      set('residuo-ok', tipo === 'no-se' || field('categoria').value ? 'ok' : '');
      const m = field('modalidad').value;
      if (m !== when.modalidad) {
        when.modalidad = m;
        if (m === 'programado') when.dates = when.dates.slice(0, 1);
        if (m === 'express') when.dates = [];
      }
      writeWhen();
      paint();
    };

    const OPEN = {
      servicio: async () => {
        const v = await Picker.choose({ title: 'Servicio', groups: [{ options: PICK.SERVICES.map(([value, label]) => ({ value, label })) }], value: field('servicio').value });
        if (v) set('servicio', v, PICK.SERVICES.find(([k]) => k === v)[1]);
        return v;
      },
      residuo: async () => {
        const tipo = field('tipo').value;
        const safe = { label: 'No peligrosos', options: PICK.CATEGORIES.safe.map(([n, file]) => ({ value: `no-peligroso|${n}`, label: n, img: PICK.thumb(file) })) };
        const hazard = { label: 'Peligrosos', options: PICK.CATEGORIES.hazard.map(([n, file]) => ({ value: `peligroso|${n}`, label: n, img: PICK.thumb(file) })) };
        const v = await Picker.choose({
          title: '¿Qué residuo necesitas retirar?',
          sub: 'Las imágenes son ilustrativas: la clasificación se confirma con los antecedentes.',
          groups: tipo === 'peligroso' ? [hazard, safe] : [safe, hazard], tabs: true,
          value: `${tipo}|${field('categoria').value}`,
          search: 'Buscar residuo', layout: 'tiles',
          action: { label: 'No sé cuál es', value: 'no-se|' }
        });
        if (!v) return v;
        const [t, c] = v.split('|');
        set('tipo', t, PICK.TIPO_LABEL[t]);
        set('categoria', c);
        set('residuo-ok', 'ok');
        if (t === 'no-se') setTimeout(() => field('descripcion')?.focus(), 250);
        return v;
      },
      cantidad: async () => {
        const v = await Picker.choose({
          title: '¿Cuánto residuo hay?', sub: 'Un rango aproximado basta; lo precisamos al cotizar.',
          groups: [{ options: PICK.AMOUNTS.map((a, i) => ({ value: a, label: a, icon: PICK.AMOUNT_ICONS[i] })) }],
          value: field('cantidad').value, layout: 'list'
        });
        if (v) set('cantidad', v);
        return v;
      },
      comuna: async () => {
        const v = await Picker.commune({ value: { commune: field('comuna').value } });
        if (v) set('comuna', v.commune);
        return v;
      },
      /* La dirección se escribe en su propia ventana: el campo queda arriba y el teclado no mueve la pantalla */
      direccion: async () => {
        const v = await Picker.text({
          title: '¿Dónde retiramos?', sub: 'Calle y número, y una referencia si ayuda: bodega, portón o piso.',
          label: 'Dirección del retiro', value: field('direccion').value, placeholder: 'Ej.: Av. Las Industrias 1234, bodega 3', autocomplete: 'street-address'
        });
        if (v) set('direccion', v);
        return v;
      },
      fecha: async () => {
        const multi = when.modalidad === 'flexible';
        const v = await Picker.dates({
          title: multi ? '¿Qué días te acomodan?' : '¿Qué día retiramos?',
          sub: multi ? 'Elige hasta tres días posibles, de lunes a sábado.' : 'De lunes a sábado.', multi, max: 3, value: when.dates
        });
        if (v) { when.dates = v; writeWhen(); }
        return v;
      },
      horario: async () => {
        const v = await Picker.time({ value: when });
        if (v) { Object.assign(when, v); writeWhen(); }
        return v;
      },
      antecedentes: async () => {
        const v = await Picker.choose({
          title: '¿Qué antecedentes tienes?', sub: 'Podrás adjuntarlos al enviar la solicitud por WhatsApp.',
          groups: [{ options: PICK.DOCS.map((x) => ({ value: x, label: x })) }],
          value: list(field('documentos').value), multi: true, exclusive: ['Sin documentos por ahora'], layout: 'list'
        });
        if (v) set('documentos', sorted(v, PICK.DOCS).join(', '));
        return v;
      },
      detalles: async () => {
        const v = await Picker.chooseEach({
          title: 'Detalles del retiro', sub: 'Todo es opcional, pero ayuda a evitar retiros fallidos.',
          groups: [
            { key: 'acceso', label: '¿Hay alguna condición especial de acceso?', multi: true, options: PICK.ACCESS.map((x) => ({ value: x, label: x })) },
            { key: 'estado', label: 'Estado del residuo', options: PICK.STATES.map((x) => ({ value: x, label: x })) },
            { key: 'almacenamiento', label: '¿Cómo está almacenado?', layout: 'cards', options: PICK.STORAGE.map(([x, icon]) => ({ value: x, label: x, icon })) }
          ],
          value: { acceso: list(field('acceso').value), estado: field('estado').value, almacenamiento: field('almacenamiento').value }
        });
        if (v) { set('acceso', sorted(v.acceso, PICK.ACCESS).join(', ')); set('estado', v.estado || ''); set('almacenamiento', v.almacenamiento || ''); }
        return v;
      }
    };

    form.addEventListener('click', async (e) => {
      const pick = e.target.closest('.pick-btn')?.closest('[data-pick]');
      if (!pick || !OPEN[pick.dataset.pick]) return;
      const v = await OPEN[pick.dataset.pick]();
      if (v === undefined || v === null) return;
      if (form.querySelector(`[name="${pick.dataset.requiredPick}"]`)?.value) pick.removeAttribute('data-invalid');
      field('tipo').dispatchEvent(new Event('change', { bubbles: true }));
    });
    form.addEventListener('change', (e) => { if (e.target.type === 'hidden') normalize(); });
    /* Tipo de retiro: se elige con un toque en la misma fila */
    form.addEventListener('click', (e) => {
      const b = e.target.closest('[data-modalidad]');
      if (!b) return;
      when.modalidad = b.dataset.modalidad;
      if (when.modalidad === 'express') when.dates = [];
      if (when.modalidad === 'programado') when.dates = when.dates.slice(0, 1);
      writeWhen();
      b.closest('.pick')?.removeAttribute('data-invalid');
      field('modalidad').dispatchEvent(new Event('change', { bubbles: true }));
    });
    form.transition = (update) => transition(update);

    /* Recibe lo que ya se respondió en la conversación, para seguir en el formulario sin repetir nada */
    const DOC_MAP = { 'HDS/FDS': 'HDS/FDS del producto original', 'Análisis': 'Análisis o caracterización', 'No tengo': 'Sin documentos por ahora' };
    window.QUOTE = {
      fill: ({ answers: a = {}, meta = {} } = {}) => {
        const known = [...PICK.CATEGORIES.safe, ...PICK.CATEGORIES.hazard].some(([n]) => n === a.residuo);
        if (a.residuo && known) {
          const tipo = PICK.CATEGORIES.hazard.some(([n]) => n === a.residuo) ? 'peligroso' : 'no-peligroso';
          set('tipo', tipo, PICK.TIPO_LABEL[tipo]); set('categoria', a.residuo); set('residuo-ok', 'ok');
        } else if (a.residuo) {
          set('tipo', 'no-se', PICK.TIPO_LABEL['no-se']); set('categoria', ''); set('residuo-ok', 'ok');
          field('descripcion').value = a.residuo;
        }
        if (a.cantidad) set('cantidad', a.cantidad);
        if (a.comuna) set('comuna', a.comuna);
        if (a.direccion) field('direccion').value = a.direccion;
        const mode = Object.entries(PICK.MODE_LABEL).find(([, label]) => label === a.modalidad)?.[0];
        if (mode) {
          when.modalidad = mode;
          when.dates = (mode === 'programado' ? meta.dates?.fecha : mode === 'flexible' ? meta.dates?.fechas : []) || [];
          const range = String(a.horario || '').match(/(\d{1,2}:\d{2}) y (\d{1,2}:\d{2})/);
          if (range) Object.assign(when, { slot: 'otro', desde: range[1], hasta: range[2] });
          else if (a.horario) when.slot = a.horario.split(' (')[0];
          writeWhen();
        }
        if (a.almacenamiento) set('almacenamiento', a.almacenamiento);
        if (a.documentos) set('documentos', a.documentos.split(', ').map((x) => DOC_MAP[x]).filter(Boolean).join(', '));
        ['empresa', 'nombre', 'telefono', 'correo'].forEach((k) => { if (a[k]) field(k).value = a[k]; });
        field('tipo').dispatchEvent(new Event('change', { bubbles: true }));
      }
    };
    form.closest('.hcard-panel').querySelector('.mode-toggle')?.addEventListener('click', (e) => {
      if (e.target.closest('[data-mode="chat"]')) window.GUIDE?.open();
    });
    normalize();
    window.SITE.refresh?.();
  }

  /* ---------- Hero: en escritorio la opción elegida cambia el propio hero; en móvil se abre en una hoja inferior ---------- */
  const hero = d.querySelector('[data-hero]');
  if (hero) {
    const routes = hero.querySelector('[data-routes]');
    const tabs = [...routes.querySelectorAll('[data-route]')];
    const pill = routes.querySelector('.routes-pill');
    const wrap = hero.querySelector('[data-panel]');
    const panels = { cotizar: d.getElementById('cotizar'), buscar: d.getElementById('buscar'), especialista: d.getElementById('especialista'), asistente: d.getElementById('asistente') };
    let view = 'inicio';
    let tab = null;
    const card = wrap.querySelector('.hcard');

    /* Hoja inferior (móvil): la misma tarjeta, con su estado, pasa a un <dialog> que sube desde abajo sobre el hero */
    const sheetMode = () => mobile.matches;
    let sheet = null;
    let panel = null;  // lo que sube: el <dialog> queda quieto a pantalla completa
    let sheetInstant = false;
    let sheetTimer = 0;
    const buildSheet = () => {
      sheet = d.createElement('dialog');
      sheet.className = 'hero-sheet';
      sheet.setAttribute('aria-label', 'Opción del inicio');
      /* El foco inicial va a un punto fijo fuera del panel que sube: enfocar algo que todavía viene subiendo hacía que el
         navegador desplazara la vista (la hoja «se iba hacia arriba» y volvía) */
      sheet.innerHTML = '<span class="dialog-start" tabindex="-1" autofocus></span><div class="sheet-panel"><span class="sheet-grab" aria-hidden="true"></span></div>';
      panel = sheet.querySelector('.sheet-panel');
      d.body.append(sheet);
      sheet.addEventListener('click', (e) => {
        if (e.target === sheet || e.target.closest('[data-hero-close]')) close();  // fondo velado o X
      });
      sheet.addEventListener('cancel', (e) => { e.preventDefault(); close(); });  // Escape
      /* Si el sistema la cierra por su cuenta (p. ej., gesto «atrás» en Android), el hero se pone al día */
      sheet.addEventListener('close', () => { if (view !== 'inicio') { sheetInstant = true; close(); } });
      Picker?.drag?.(panel, { handles: '.sheet-grab, .hcard-head', dismiss: () => { sheetInstant = true; close(); } });
      /* Al tocar un campo para escribir, su fila sube al inicio de la lista antes de que abra el teclado: así el teléfono
         no desplaza la pantalla para mostrarlo (en iPhone eso movía toda la hoja) */
      const coarse = matchMedia('(pointer: coarse)');
      sheet.addEventListener('focusin', (e) => {
        const f = e.target;
        if (!coarse.matches || !f.matches('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea')) return;
        const body = f.closest('.hcard-body');
        if (!body) return;
        sheet.classList.add('is-typing');
        const row = f.closest('.pick, .pick-field, .field') || f;
        const delta = row.getBoundingClientRect().top - body.getBoundingClientRect().top - 8;
        if (Math.abs(delta) > 4) body.scrollTop += delta;
      });
      sheet.addEventListener('focusout', () => setTimeout(() => {
        const a = d.activeElement;
        if (!a || !sheet.contains(a) || !a.matches('input, textarea')) sheet.classList.remove('is-typing');
      }, 60));
    };
    const openSheet = () => {
      if (!sheet) buildSheet();
      clearTimeout(sheetTimer);
      sheet.classList.remove('is-closing');
      panel.style.transform = panel.style.transition = '';
      if (card.parentElement !== panel) panel.append(card);
      const label = panels[view]?.querySelector('h2')?.textContent;
      if (label) sheet.setAttribute('aria-label', label.replace(/\.$/, ''));
      if (!sheet.open) {
        d.documentElement.classList.add('sheet-open');
        sheet.showModal();
      }
    };
    const closeSheet = () => {
      if (!sheet) return;
      const end = () => {
        if (sheet.open) sheet.close();
        sheet.classList.remove('is-closing');
        panel.style.transform = panel.style.transition = '';
        d.documentElement.classList.remove('sheet-open');
        if (card.parentElement !== wrap) wrap.append(card);
      };
      clearTimeout(sheetTimer);
      if (sheet.open && motion.matches && !sheetInstant) { sheet.classList.add('is-closing'); sheetTimer = setTimeout(end, 240); }
      else end();
      sheetInstant = false;
    };

    const placePill = () => {
      const on = tabs.find((t) => t.dataset.route === tab);
      pill.hidden = !on;
      if (!on) return;
      pill.style.width = `${on.offsetWidth}px`;
      pill.style.height = `${on.offsetHeight}px`;
      pill.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
    };
    const apply = (name, active = name) => {
      view = name;
      tab = name === 'inicio' ? null : active;
      hero.dataset.view = name;
      if (sheetMode()) {
        wrap.hidden = true;
        if (name === 'inicio') closeSheet(); else openSheet();
      } else {
        closeSheet();
        wrap.hidden = name === 'inicio';
      }
      tabs.forEach((t) => {
        const on = t.dataset.route === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on || !tab ? 0 : -1;
      });
      Object.entries(panels).forEach(([k, p]) => { if (p) p.hidden = k !== name; });
      placePill();
      window.SITE.refresh?.();
    };
    /* Deja el hero a la vista bajo la barra de navegación (llegadas desde otro punto de la página). En móvil no hace falta:
       la hoja se abre donde está la persona, sin mover la página */
    const align = () => {
      if (sheetMode()) return;
      const top = Math.max(0, hero.getBoundingClientRect().top + scrollY - 84);
      if (Math.abs(scrollY - top) > 2) window.scrollTo({ top, behavior: 'instant' });
    };
    const show = (name, { from = 'hero', tab: active } = {}) => {
      if (name !== 'inicio' && !panels[name]) return Promise.resolve();
      if (name === 'buscar') window.FINDER_LOAD?.();
      const move = from !== 'hero';
      const before = view;
      const target = active || (name === 'asistente' ? tab || 'cotizar' : name);
      return transition(() => {
        apply(name, target);
        if (move) align();
      }).then(() => {
        /* Historial: abrir una opción desde el inicio agrega una entrada, así «atrás» en el teléfono vuelve al inicio
           del hero en vez de salir del sitio. Cambiar de opción solo reemplaza la entrada. */
        const url = name === 'inicio' ? location.pathname + location.search : `#${name}`;
        if (from !== 'history') {
          if (before === 'inicio' && name !== 'inicio') history.pushState({ hero: name, pushed: true }, '', url);
          else history.replaceState(name === 'inicio' ? null : { hero: name, pushed: !!history.state?.pushed }, '', url);
        }
        /* En la hoja táctil el foco queda en la propia hoja; con teclado o fuera de la hoja, en el panel */
        const touchSheet = sheetMode() && matchMedia('(pointer: coarse)').matches;
        if (!touchSheet && ((from !== 'hero' && from !== 'history') || (sheetMode() && name !== 'inicio'))) panels[name]?.focus({ preventScroll: true });
      });
    };
    window.HERO = { show, transition, get view() { return view; } };

    tabs.forEach((t) => {
      t.addEventListener('click', () => { if (view !== t.dataset.route) show(t.dataset.route); });
      if (t.dataset.route === 'buscar') t.addEventListener('pointerenter', () => window.FINDER_LOAD?.(), { once: true });
    });
    routes.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(d.activeElement);
      if (i < 0 || !['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const n = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (/Down|Right/.test(e.key) ? 1 : -1) + tabs.length) % tabs.length;
      tabs[n].focus();
      show(tabs[n].dataset.route);
    });
    let refocus = null;
    let closing = 0;
    const close = () => {
      if (view === 'inicio' || Date.now() - closing < 400) return;  // un solo cierre aunque lleguen varios avisos juntos
      closing = Date.now();
      const was = tabs.find((t) => t.dataset.route === tab);
      /* Si la opción se abrió con su propia entrada, cerrar es lo mismo que «atrás» */
      if (history.state?.pushed) { refocus = was; history.back(); return; }
      show('inicio').then(() => was?.focus({ preventScroll: true }));
    };
    hero.addEventListener('click', (e) => { if (e.target.closest('[data-hero-close]')) close(); });
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !e.target.closest('select')) close();
    });

    /* Los enlaces a #cotizar, #buscar y #especialista (planes, servicios, cierre, barra móvil) abren esa opción en el hero */
    const HASH = { '#cotizar': 'cotizar', '#buscar': 'buscar', '#especialista': 'especialista', '#asistente': 'asistente' };
    d.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a || !HASH[a.hash]) return;
      e.preventDefault();
      if (a.hash === '#cotizar' && a.hasAttribute('data-set') && form?.hidden) d.querySelector('#cotizacion-resumen [data-edit]')?.click();
      const name = HASH[a.hash];
      if (view === name) { align(); panels[name]?.focus({ preventScroll: true }); } else show(name, { from: 'link' });
    });
    /* Atrás y adelante del navegador: muestran la opción de esa entrada (otros anclajes, como #servicios, no tocan el hero) */
    addEventListener('popstate', () => {
      const name = HASH[location.hash] || (location.hash ? null : 'inicio');
      if (!name || name === view) return;
      show(name, { from: 'history' }).then(() => {
        if (name === 'inicio') refocus?.focus({ preventScroll: true });
        refocus = null;
      });
    });
    if (HASH[location.hash]) {
      apply(HASH[location.hash], HASH[location.hash] === 'asistente' ? 'cotizar' : HASH[location.hash]);
      if (location.hash === '#buscar') window.FINDER_LOAD?.();
      requestAnimationFrame(align);
    }
    /* Con el teclado abierto, el campo activo queda a la vista dentro de la hoja (la hoja ya se apoya sobre el teclado) */
    window.visualViewport?.addEventListener('resize', () => {
      const a = d.activeElement;
      if (sheet?.open && a && sheet.contains(a) && a.matches('input, textarea')) a.scrollIntoView({ block: 'nearest' });
    });
    /* Al girar una tablet o cambiar el ancho, la opción abierta pasa a la hoja o vuelve al hero */
    mobile.addEventListener('change', () => { if (view !== 'inicio') apply(view, tab); });
    if ('ResizeObserver' in window) new ResizeObserver(placePill).observe(routes);
  }

  /* ---------- Especialista: el tema se elige en una ventana y va escrito en WhatsApp ---------- */
  const expertLink = d.querySelector('[data-expert-wa]');
  if (expertLink && Picker) {
    const scope = expertLink.closest('.hcard-panel');
    const input = scope.querySelector('[name="tema"]');
    const value = scope.querySelector('[data-pick="tema"] .pick-value');
    const TEMAS = ['No sé cómo clasificar mi residuo', 'Tengo un residuo peligroso', 'Necesito un retiro urgente', 'Quiero retiros periódicos', 'Otro tema'];
    const sync = () => {
      expertLink.href = window.SITE.whatsapp(`Hola, quiero hablar con un especialista sobre la gestión de mis residuos.${input.value ? `\nTema: ${input.value}` : ''}`);
      value.textContent = input.value || value.dataset.empty;
      value.classList.toggle('is-empty', !input.value);
    };
    let note = '';
    const syncAll = () => {
      sync();
      if (note) expertLink.href = window.SITE.whatsapp(`Hola, quiero hablar con un especialista sobre la gestión de mis residuos.${input.value ? `\nTema: ${input.value}` : ''}\nMi consulta: ${note}`);
    };
    scope.querySelector('[data-pick="tema"] .pick-btn').addEventListener('click', async () => {
      const v = await Picker.choose({ title: '¿Sobre qué quieres hablar?', groups: [{ options: TEMAS.map((t) => ({ value: t, label: t })) }], value: input.value });
      if (v) { input.value = v; syncAll(); }
    });
    /* Desde el campo del hero: tema sugerido y la consulta escrita, listos para WhatsApp */
    window.EXPERT = { set: ({ tema = '', texto = '' } = {}) => { input.value = TEMAS.includes(tema) ? tema : ''; note = texto; syncAll(); } };
    sync();
  }

  /* ---------- Detalles desplegables (+ / −) ---------- */
  d.addEventListener('click', (e) => {
    const b = e.target.closest('[data-toggle]');
    if (!b) return;
    const box = d.getElementById(b.getAttribute('aria-controls'));
    const open = b.getAttribute('aria-expanded') !== 'true';
    b.setAttribute('aria-expanded', String(open));
    box.classList.toggle('is-open', open);
    box.inert = !open;
  });
  d.querySelectorAll('.collapse').forEach((c) => { c.inert = true; });

  /* Zonas con scroll del hero: el borde por donde continúa el contenido se difumina */
  d.querySelectorAll('.hcard-body').forEach((b) => Picker?.hint(b));

  /* ---------- Campo de conversación del hero: se escribe como en WhatsApp y el hero responde ---------- */
  const ask = d.querySelector('[data-ask]');
  if (ask && window.PARSE) {
    const field = ask.querySelector('input');
    /* Ejemplos que se escriben y borran solos en el placeholder (uno por cada camino: cotizar, buscar y hablar) */
    const EXAMPLES = ['Necesito un retiro urgente', '600 kg de cartón en Quilicura', 'Busco un transportista para aceite', 'Quiero hablar con un especialista'];
    /* Al tocar el campo se muestra una instrucción completa, nunca una frase a medio escribir */
    const HINT = 'Escribe lo que necesitas retirar';
    let timer = 0;
    let line = 0;
    let at = EXAMPLES[0].length;
    let erase = false;
    field.placeholder = EXAMPLES[0];
    if (motion.matches) {
      /* Se escribe un ejemplo, se sostiene y se borra; empieza con el primero ya escrito para que el campo nunca se vea vacío */
      const tick = () => {
        let wait = erase ? 26 : 52;
        if (field.value || d.activeElement === field || d.hidden) wait = 700;
        else {
          const text = EXAMPLES[line];
          at += erase ? -1 : 1;
          field.placeholder = text.slice(0, at);
          if (!erase && at >= text.length) { erase = true; wait = 1900; }
          else if (erase && at <= 0) { erase = false; line = (line + 1) % EXAMPLES.length; wait = 380; }
        }
        timer = setTimeout(tick, wait);
      };
      erase = true;
      timer = setTimeout(tick, 2400);
    }
    field.addEventListener('focus', () => { field.placeholder = HINT; });
    field.addEventListener('blur', () => {
      if (field.value) return;
      at = EXAMPLES[line].length;
      field.placeholder = EXAMPLES[line];
      erase = false;  /* el siguiente paso lo sostiene completo antes de borrarlo */
    });
    ask.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = field.value.trim();
      if (!text) { field.focus(); return; }
      const r = window.PARSE.read(text);
      field.value = '';
      if (r.intent === 'hablar') { window.EXPERT?.set({ tema: r.tema, texto: text }); window.HERO?.show('especialista'); return; }
      if (r.intent === 'buscar') {
        window.FINDER?.set({ tipo: r.tipo, categoria: r.categoria, comuna: r.comuna?.commune });
        window.HERO?.show('buscar');
        return;
      }
      window.GUIDE?.ingest(text);
    });
    addEventListener('pagehide', () => clearTimeout(timer));
  }

  /* NumberFlow (MIT, number-flow.barvian.me): los números cambian con una animación de dígitos. Opcional. */
  if (motion.matches) {
    import('https://cdn.jsdelivr.net/npm/number-flow@0.6.2/+esm')
      .then(() => d.dispatchEvent(new Event('numberflow:ready')))
      .catch(() => {});
  }
})();
