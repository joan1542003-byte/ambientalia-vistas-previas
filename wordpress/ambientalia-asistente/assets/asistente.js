/* Asistente IA de Ambientalia: burbuja siempre presente y ventana de chat conectada al asistente (servicio aparte).
   Misma conversación que el chat de Transporte Autorizado (assets/site/agente-chat.js en ese sitio), armada como un
   componente independiente para WordPress con Elementor. Diseño con el lenguaje del header de ambientalia.cl (vidrio
   verde, curvas de resorte, menta #78DCB4) y la ventana del chat de Transporte (vidrio claro, cabecera liviana,
   sugerencias).
   - Todo vive dentro de un Shadow DOM (#amb-asistente): los estilos del tema y de Elementor no lo alteran, y los suyos
     (asistente.css) no tocan el sitio.
   - Configuración en window.AMB_ASISTENTE (la escribe el plugin): asistente (dirección base), turnstile (clave
     pública), whatsapp, contacto, posicion ('derecha' | 'izquierda'), saludo y css. En este computador (localhost) se
     puede probar con ?asistente=<dirección>.
   - Se puede preguntar de inmediato (escribiendo o con una sugerencia): si no hay sesión, la pregunta queda guardada,
     se piden nombre, correo, teléfono y la aceptación de las condiciones (POST /api/chat/sessions) y, al abrir la
     sesión, se envía sola.
   - La pestaña guarda solo el token, su vencimiento y el envío sin respuesta confirmada (sessionStorage); la
     conversación se recupera del servicio al volver (GET /api/chat/history). «Recordar mis datos» (opcional): nombre,
     correo y teléfono por 30 días en localStorage; nunca el token, las aceptaciones ni la conversación.
   - Cada mensaje lleva su client_message_id y lo conserva en los reintentos: si el servicio ya lo procesó, devuelve la
     misma respuesta. Espera agotada, 504 o 409 busy: dos reintentos solos; lo demás, con «Reintentar».
   - Las respuestas llegan como texto plano y se muestran como texto, nunca como HTML: **negrita**, párrafos y listas.
     Los enlaces salen solo de las fuentes (reply.sources) con https y destino conocido.
   - Teléfono: la ventana ocupa la pantalla visible (visualViewport, así el campo queda sobre el teclado), la página de
     atrás no se desplaza y el botón «atrás» del teléfono cierra el chat.
   Sin lookbehind en las expresiones regulares (Safari < 16.4). */
(() => {
  if (window.__ambAsistente) return;
  window.__ambAsistente = true;
  const d = document;
  const C = window.AMB_ASISTENTE || {};
  const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const RECUERDO_DIAS = 30;
  const CLAVE_SESION = 'amb-asistente';
  const CLAVE_DATOS = 'amb-asistente-datos';
  const CLAVE_SALUDO = 'amb-asistente-saludo';
  const ESPERA = 90000;
  const AUTO = 2;
  const REINTENTOS = 3;
  const MAX_TEXTO = 1000;
  const FUENTES = ['ambientalia.cl', 'bcn.cl', 'leychile.cl', 'diariooficial.interior.gob.cl', 'minsal.cl'];
  const SUGERENCIAS = [
    ['permiso', '¿Mi proyecto necesita un permiso ambiental?'],
    ['declaracion', '¿Qué tengo que declarar en el RETC?'],
    ['rep', '¿Me aplica la Ley REP?'],
    ['acv', '¿Qué es un ACV y para qué sirve?']
  ];

  /* ---------- Dirección del asistente ---------- */
  const limpiar = (url) => {
    let u;
    try { u = new URL(String(url || '').trim()); } catch { return ''; }
    const local = /^(localhost|127\.0\.0\.1)$/.test(u.hostname);
    if (!(u.protocol === 'https:' || (local && u.protocol === 'http:')) || u.username || u.password || u.search || u.hash) return '';
    return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
  };
  const API = (() => {
    if (LOCAL) {
      const q = new URLSearchParams(location.search).get('asistente');
      try {
        if (q !== null) { if (q) sessionStorage.setItem('amb-asistente-url', q); else sessionStorage.removeItem('amb-asistente-url'); }
        const guardada = sessionStorage.getItem('amb-asistente-url');
        if (guardada) return limpiar(guardada);
      } catch { /* sin almacenamiento */ }
    }
    return limpiar(C.asistente);
  })();
  const WA = String(C.whatsapp || '').replace(/\D/g, '');
  const CONTACTO = (() => { if (!C.contacto) return ''; try { const u = new URL(C.contacto, location.href); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch { return ''; } })();
  const IZQUIERDA = C.posicion === 'izquierda';
  const LEGAL = (ruta) => (API ? `${API}/${ruta}` : '');

  /* ---------- Elementos ---------- */
  const SVG = 'http://www.w3.org/2000/svg';
  /* Íconos: trazos fijos de este archivo (nunca texto del servicio) */
  const icono = (paths, size = 20, clase = '') => {
    const s = d.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('width', size);
    s.setAttribute('height', size);
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    if (clase) s.setAttribute('class', clase);
    s.innerHTML = paths;
    return s;
  };
  /* La marca del asistente: un globo de conversación con una chispa (IA) en el degradado menta del sitio */
  let marcas = 0;
  const marca = (size = 28, clase = 'marca') => {
    marcas += 1;
    const id = `amb-chispa-${marcas}`;
    const s = d.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 32 32');
    s.setAttribute('width', size);
    s.setAttribute('height', size);
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('class', clase);
    s.innerHTML = `<defs><linearGradient id="${id}" x1="9" y1="7" x2="23" y2="21" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#A8F0D8"/><stop offset=".55" stop-color="#78DCB4"/><stop offset="1" stop-color="#4DDBF0"/></linearGradient></defs>`
      + '<path class="marca-globo" d="M16 4.5C9.1 4.5 3.5 9.2 3.5 15c0 3.2 1.7 6 4.4 8l-1.1 4.6 5.2-2.7c1.3.4 2.6.6 4 .6 6.9 0 12.5-4.7 12.5-10.5S22.9 4.5 16 4.5Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>'
      + `<path class="marca-chispa" d="M16 8.6c.6 3.2 2.2 4.9 5.4 5.5-3.2.6-4.8 2.3-5.4 5.5-.6-3.2-2.2-4.9-5.4-5.5 3.2-.6 4.8-2.3 5.4-5.5Z" fill="url(#${id})"/>`
      + `<path class="marca-chispa-2" d="M24.4 4.6c.2 1.1.8 1.7 1.9 1.9-1.1.2-1.7.8-1.9 1.9-.2-1.1-.8-1.7-1.9-1.9 1.1-.2 1.7-.8 1.9-1.9Z" fill="url(#${id})"/>`;
    return s;
  };
  const I = {
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    subir: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
    abajo: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
    mas: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    doc: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
    flecha: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    copiar: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    listo: '<path d="M20 6 9 17l-5-5"/>',
    reiniciar: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    borrar: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    legal: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 13h4"/><path d="M10 17h4"/>',
    wa: '<path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21"/><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1"/>',
    correo: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    permiso: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>',
    declaracion: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="8" y="2" rx="1"/><path d="M9 14h6"/><path d="M9 10h6"/>',
    rep: '<path d="M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5"/><path d="M11 19h8.203a1.83 1.83 0 0 0 1.556-.89 1.784 1.784 0 0 0 0-1.775l-1.226-2.12"/><path d="m14 16-3 3 3 3"/><path d="M8.293 13.596 7.196 9.5 3.1 10.598"/><path d="m9.344 5.811 1.093-1.892A1.83 1.83 0 0 1 11.985 3a1.784 1.784 0 0 1 1.546.888l3.943 6.843"/><path d="m13.378 9.633 4.096 1.098 1.097-4.096"/>',
    acv: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>'
  };
  const h = (tag, attrs = {}, ...hijos) => {
    const el = d.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    hijos.flat().forEach((c) => { if (c !== null && c !== undefined && c !== '') el.append(c); });
    return el;
  };
  const pausa = (ms) => new Promise((ok) => { setTimeout(ok, ms); });
  const movimiento = matchMedia('(prefers-reduced-motion: no-preference)');
  const tactil = matchMedia('(hover: none), (pointer: coarse)');
  const telefono = matchMedia('(max-width: 600px)');
  const suave = () => (movimiento.matches ? 'smooth' : 'auto');

  /* ---------- Shadow DOM ---------- */
  const host = h('div', { id: 'amb-asistente', 'data-posicion': IZQUIERDA ? 'izquierda' : 'derecha' });
  host.style.cssText = 'all: initial; display: none;';
  const raiz = host.attachShadow({ mode: 'open' });
  const hoja = h('link', { rel: 'stylesheet', href: C.css || 'assets/asistente.css' });
  const mostrarHost = () => { host.style.display = 'block'; };
  hoja.addEventListener('load', mostrarHost);
  hoja.addEventListener('error', mostrarHost);

  /* Burbuja: la marca; abierta, una X. El punto aparece con la invitación (como el aviso del WhatsApp del sitio) */
  const punto = h('span', { class: 'b-punto', 'aria-hidden': 'true' });
  const burbuja = h('button', { class: 'burbuja', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'ventana', 'aria-label': 'Abrir el asistente de Ambientalia', title: 'Asistente con IA' },
    h('span', { class: 'b-liquido', 'aria-hidden': 'true' }),
    h('span', { class: 'b-abrir' }, marca(30, 'marca b-marca')),
    h('span', { class: 'b-cerrar' }, icono(I.x, 24)),
    punto);

  /* Invitación: «escribiendo…» y luego el saludo, con dos sugerencias que abren el chat con la pregunta puesta */
  const invTexto = h('span', { class: 'inv-texto' });
  const invPuntos = h('span', { class: 'inv-escribe', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'));
  const invChips = h('div', { class: 'inv-chips' },
    h('button', { class: 'inv-chip', type: 'button', onclick: () => { abrir(); preguntar(SUGERENCIAS[0][1]); } }, icono(I.permiso, 14), h('span', { text: 'Permisos ambientales' })),
    h('button', { class: 'inv-chip', type: 'button', onclick: () => { abrir(); preguntar(SUGERENCIAS[2][1]); } }, icono(I.rep, 14), h('span', { text: 'Ley REP' })));
  const invitacion = h('div', { class: 'invitacion', role: 'status', hidden: true },
    h('button', { class: 'inv-cerrar', type: 'button', 'aria-label': 'Cerrar la invitación', onclick: () => ocultarInvitacion(true) }, icono(I.x, 14)),
    h('button', { class: 'inv-cuerpo', type: 'button', onclick: () => abrir() },
      h('span', { class: 'inv-avatar' }, marca(18, 'marca')),
      h('span', { class: 'inv-txt' }, h('span', { class: 'inv-titulo', text: 'Asistente Ambientalia' }), invPuntos, invTexto)),
    invChips);

  /* Ventana */
  const ESTADO_BASE = API ? 'En línea · responde con IA' : 'Fuera de línea por ahora';
  const estadoTxt = h('span', { text: ESTADO_BASE });
  const estado = h('p', { class: `cab-estado${API ? '' : ' is-fuera'}` }, h('i', { class: 'cab-punto', 'aria-hidden': 'true' }), estadoTxt);
  const charla = h('div', { class: 'charla', role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions' });
  const irAbajo = h('button', { class: 'ir-abajo', type: 'button', hidden: true, onclick: () => { abajo(true); } }, icono(I.abajo, 15), h('span', { text: 'Nuevo mensaje' }));
  const campo = h('textarea', { name: 'q', rows: '1', maxlength: String(MAX_TEXTO), placeholder: 'Escribe tu pregunta…', 'aria-label': 'Tu pregunta', enterkeyhint: 'send', autocomplete: 'off' });
  const contador = h('span', { class: 'contador', 'aria-live': 'polite', hidden: true });
  const enviarBtn = h('button', { class: 'enviar', type: 'submit', 'aria-label': 'Enviar', disabled: true }, icono(I.subir, 20));
  const form = h('form', { class: 'entrada' }, h('div', { class: 'entrada-caja' }, campo, contador), enviarBtn);
  const nota = h('p', { class: 'nota-ia' });
  const menuBtn = h('button', { class: 'cab-btn', type: 'button', 'aria-label': 'Más opciones', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, icono(I.mas, 20));
  const menu = h('div', { class: 'menu', role: 'menu', hidden: true });
  const ventana = h('section', { class: 'ventana', id: 'ventana', role: 'dialog', 'aria-label': 'Asistente de Ambientalia', tabindex: '-1', hidden: true },
    h('span', { class: 'v-liquido', 'aria-hidden': 'true' }),
    h('header', { class: 'cab' },
      h('span', { class: 'avatar', 'aria-hidden': 'true' }, marca(22, 'marca')),
      h('div', { class: 'cab-quien' }, h('h2', { text: 'Asistente Ambientalia' }), estado),
      menuBtn,
      h('button', { class: 'cab-btn cab-cerrar', type: 'button', 'aria-label': 'Cerrar el asistente', onclick: () => cerrar() }, icono(I.x, 20)),
      menu),
    charla,
    irAbajo,
    h('div', { class: 'base' }, form, nota));
  raiz.append(hoja, ventana, invitacion, burbuja);

  /* Nota al pie: que es IA y los enlaces legales del asistente */
  nota.append(h('span', { text: 'Respuestas con IA: verifica lo importante con un especialista.' }));
  if (API) {
    nota.append(' ', h('a', { href: LEGAL('condiciones-del-servicio'), target: '_blank', rel: 'noopener', text: 'Condiciones' }), ' · ',
      h('a', { href: LEGAL('politica-de-privacidad'), target: '_blank', rel: 'noopener', text: 'Privacidad' }));
  }

  /* ---------- Menú de la cabecera ---------- */
  const cerrarMenu = () => { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); };
  const itemMenu = (ic, texto, accion, peligro) => h('button', { class: `menu-item${peligro ? ' is-peligro' : ''}`, type: 'button', role: 'menuitem', onclick: () => { cerrarMenu(); accion(); } }, icono(ic, 17), h('span', { text: texto }));
  const enlaceMenu = (ic, texto, href) => h('a', { class: 'menu-item', role: 'menuitem', href, target: '_blank', rel: 'noopener noreferrer', onclick: cerrarMenu }, icono(ic, 17), h('span', { text: texto }));
  const pintarMenu = () => {
    menu.textContent = '';
    if (sesion) {
      menu.append(itemMenu(I.reiniciar, 'Volver al menú', () => enviar({ text: 'inicio' })));
      menu.append(itemMenu(I.borrar, 'Borrar esta conversación', () => pedirBorrar(), true));
    }
    if (API) {
      menu.append(enlaceMenu(I.legal, 'Condiciones del servicio', LEGAL('condiciones-del-servicio')));
      menu.append(enlaceMenu(I.legal, 'Aviso de privacidad', LEGAL('politica-de-privacidad')));
    }
    if (WA) menu.append(enlaceMenu(I.wa, 'Escribir por WhatsApp', `https://wa.me/${WA}`));
    menuBtn.hidden = !menu.childNodes.length;
  };
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!menu.hidden) { cerrarMenu(); return; }
    pintarMenu();
    menu.hidden = false;
    menuBtn.setAttribute('aria-expanded', 'true');
    menu.querySelector('.menu-item')?.focus({ preventScroll: true });
  });
  ventana.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target) && e.target !== menuBtn) cerrarMenu(); });
  menu.addEventListener('keydown', (e) => {
    const items = [...menu.querySelectorAll('.menu-item')];
    const i = items.indexOf(raiz.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      cerrarMenu();
      menuBtn.focus();
    }
  });

  /* ---------- Teléfono: pantalla visible, página quieta y «atrás» ---------- */
  const vv = window.visualViewport;
  let abierta = false;
  let empezado = false;
  const ajustarVista = () => {
    if (!vv) return;
    host.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    host.style.setProperty('--vvt', `${Math.round(vv.offsetTop)}px`);
    if (abierta && telefono.matches && raiz.activeElement === campo) abajo(true);
  };
  vv?.addEventListener('resize', ajustarVista);
  vv?.addEventListener('scroll', ajustarVista);
  let posY = 0;
  let quieta = false;
  const bloquear = (si) => {
    const b = d.body;
    if (si && telefono.matches && !quieta) {
      posY = window.scrollY;
      quieta = true;
      b.dataset.ambEstilo = b.getAttribute('style') || '';
      b.style.position = 'fixed';
      b.style.top = `-${posY}px`;
      b.style.left = '0';
      b.style.right = '0';
      b.style.width = '100%';
      b.style.overflow = 'hidden';
    } else if (!si && quieta) {
      quieta = false;
      const antes = b.dataset.ambEstilo;
      if (antes) b.setAttribute('style', antes); else b.removeAttribute('style');
      delete b.dataset.ambEstilo;
      window.scrollTo(0, posY);
    }
  };
  let historial = false;  // hay una entrada en el historial por el chat abierto (para que «atrás» lo cierre)
  window.addEventListener('popstate', () => { if (historial) { historial = false; cerrar({ desdeAtras: true }); } });

  /* ---------- Abrir y cerrar ---------- */
  const abrir = () => {
    if (abierta) return;
    abierta = true;
    ocultarInvitacion(true);
    punto.classList.remove('is-visible');
    ajustarVista();
    ventana.hidden = false;
    ventana.classList.remove('is-saliendo');
    burbuja.classList.add('is-abierta');
    burbuja.setAttribute('aria-expanded', 'true');
    burbuja.setAttribute('aria-label', 'Cerrar el asistente');
    host.classList.add('is-abierta');
    bloquear(true);
    if (telefono.matches && !historial) { try { history.pushState({ ambAsistente: true }, ''); historial = true; } catch { /* sin historial */ } }
    empezar();
    requestAnimationFrame(() => {
      const foco = !tactil.matches && (form.hidden ? charla.querySelector('.puerta input[name=name]') : campo);
      (foco || ventana).focus({ preventScroll: true });
    });
  };
  const cerrar = ({ desdeAtras = false } = {}) => {
    if (!abierta) return;
    abierta = false;
    cerrarMenu();
    burbuja.classList.remove('is-abierta');
    burbuja.setAttribute('aria-expanded', 'false');
    burbuja.setAttribute('aria-label', 'Abrir el asistente de Ambientalia');
    host.classList.remove('is-abierta');
    bloquear(false);
    if (historial && !desdeAtras) { historial = false; try { history.back(); } catch { /* sin historial */ } }
    if (movimiento.matches) {
      ventana.classList.add('is-saliendo');
      setTimeout(() => { if (!abierta) { ventana.hidden = true; ventana.classList.remove('is-saliendo'); } }, 320);
    } else {
      ventana.hidden = true;
    }
    burbuja.focus({ preventScroll: true });
  };
  burbuja.addEventListener('click', () => (abierta ? cerrar() : abrir()));
  raiz.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !abierta || !menu.hidden) return;
    e.stopPropagation();
    cerrar();
  });
  telefono.addEventListener?.('change', () => bloquear(abierta));
  /* Desde el sitio: un enlace a #asistente (por ejemplo, un botón de Elementor) abre la ventana */
  d.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href$="#asistente"], [data-amb-asistente]');
    if (!a) return;
    e.preventDefault();
    abrir();
  });
  window.ambAsistente = { abrir, cerrar: () => cerrar(), preguntar: (t) => { abrir(); preguntar(t); } };

  /* ---------- Invitación, una vez por visita ---------- */
  let relojInv = 0;
  const ocultarInvitacion = (para) => {
    clearTimeout(relojInv);
    if (!invitacion.hidden) {
      invitacion.classList.add('is-saliendo');
      setTimeout(() => { invitacion.hidden = true; invitacion.classList.remove('is-saliendo'); }, 240);
    }
    if (para) { try { sessionStorage.setItem(CLAVE_SALUDO, '1'); } catch { /* sin almacenamiento */ } }
  };
  if (C.saludo !== false) {
    let visto = false;
    try { visto = sessionStorage.getItem(CLAVE_SALUDO) === '1'; } catch { /* sin almacenamiento */ }
    if (!visto) {
      setTimeout(() => {
        if (abierta) return;
        try { sessionStorage.setItem(CLAVE_SALUDO, '1'); } catch { /* sin almacenamiento */ }
        invitacion.hidden = false;
        invitacion.classList.add('is-escribiendo');
        punto.classList.add('is-visible');
        setTimeout(() => {
          invitacion.classList.remove('is-escribiendo');
          invTexto.textContent = API ? 'Hola. ¿Te ayudo con permisos, declaraciones o la Ley REP?' : 'Hola. ¿Tienes dudas ambientales? Escríbenos.';
        }, movimiento.matches ? 1300 : 0);
        relojInv = setTimeout(() => ocultarInvitacion(false), 16000);
      }, 4000);
    }
  }
  if (!API) invChips.hidden = true;

  /* ---------- Sesión en esta pestaña ---------- */
  const guardar = (s) => {
    try {
      if (s) sessionStorage.setItem(CLAVE_SESION, JSON.stringify({ token: s.token, vence: s.vence, pendiente: s.pendiente }));
      else sessionStorage.removeItem(CLAVE_SESION);
    } catch { /* sin almacenamiento */ }
  };
  let sesion = (() => {
    try {
      const s = JSON.parse(sessionStorage.getItem(CLAVE_SESION));
      const vence = Date.parse(s?.vence);
      if (s && typeof s.token === 'string' && /^[\w.|~-]{8,512}$/.test(s.token) && Number.isFinite(vence) && vence > Date.now()) return s;
    } catch { /* ilegible o sin almacenamiento */ }
    guardar(null);
    return null;
  })();

  /* ---------- Datos recordados en este dispositivo (solo si la persona lo pidió) ---------- */
  const recordar = (v) => {
    try {
      if (v) localStorage.setItem(CLAVE_DATOS, JSON.stringify({ name: v.name, email: v.email, phone: v.phone, vence: Date.now() + RECUERDO_DIAS * 86400000 }));
      else localStorage.removeItem(CLAVE_DATOS);
    } catch { /* sin almacenamiento */ }
  };
  const recordados = () => {
    try {
      const r = JSON.parse(localStorage.getItem(CLAVE_DATOS));
      const texto = (k, max) => (typeof r?.[k] === 'string' && r[k].trim() ? r[k].slice(0, max) : '');
      const v = { name: texto('name', 150), email: texto('email', 150), phone: texto('phone', 20) };
      if (v.name && v.email && v.phone && Number.isFinite(r.vence) && r.vence > Date.now()) return v;
    } catch { /* ilegible o sin almacenamiento */ }
    recordar(null);
    return null;
  };
  let datos = {};
  let recuerdo = null;

  /* ---------- Llamadas al servicio ---------- */
  const idMensaje = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  /* No lanza: devuelve el estado HTTP y el JSON, o estado 0 con `falla` ('red' o 'espera') si no hubo respuesta */
  const llamar = async (ruta, { method = 'GET', body, espera = 30000 } = {}) => {
    const headers = { Accept: 'application/json' };
    if (sesion?.token) headers.Authorization = `Bearer ${sesion.token}`;
    if (body) headers['Content-Type'] = 'application/json';
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), espera);
    try {
      const r = await fetch(`${API}/api/chat${ruta}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: control.signal, cache: 'no-store', credentials: 'omit' });
      const json = await r.json().catch(() => null);
      return { estado: r.status, json: json && typeof json === 'object' && !Array.isArray(json) ? json : {} };
    } catch {
      return { estado: 0, falla: control.signal.aborted ? 'espera' : 'red', json: {} };
    } finally {
      clearTimeout(reloj);
    }
  };
  const errores = (json) => Object.values(json.errors || {}).flat().filter((x) => typeof x === 'string' && !/^[\w-]+(\.[\w-]+)+$/.test(x)).join('\n');
  const uso = (u) => {
    if (!u || !Number.isFinite(u.remaining) || !Number.isFinite(u.max)) return;
    estadoTxt.textContent = u.remaining <= 3 ? `Te ${u.remaining === 1 ? 'queda 1 consulta' : `quedan ${u.remaining} consultas`}` : ESTADO_BASE;
  };

  /* ---------- Texto de las respuestas: siempre como texto ---------- */
  const segura = (href) => {
    let u;
    try { u = new URL(href); } catch { return null; }
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
    if (u.origin === location.origin) return u;
    const nombre = u.hostname.toLowerCase();
    return u.protocol === 'https:' && (nombre.endsWith('.gob.cl') || FUENTES.some((f) => nombre === f || nombre.endsWith(`.${f}`))) ? u : null;
  };
  const RE_NEGRITA = /\*\*([^*\n]+?)\*\*/g;
  const conFormato = (texto) => {
    const partes = [];
    let desde = 0;
    texto.replace(RE_NEGRITA, (todo, dentro, i) => {
      partes.push(texto.slice(desde, i), h('strong', { text: dentro }));
      desde = i + todo.length;
      return todo;
    });
    partes.push(texto.slice(desde));
    return partes.filter((x) => x !== '');
  };
  const RE_VINETA = /^\s*[-•*]\s+(.+)$/;
  const RE_NUMERO = /^\s*(\d{1,2})[.)]\s+(.+)$/;
  const conBloques = (texto) => {
    const lineas = texto.split('\n');
    if (!/\n\s*\n/.test(texto) && !lineas.some((l) => RE_VINETA.test(l) || RE_NUMERO.test(l))) return h('p', { class: 'msg-texto' }, conFormato(texto));
    const caja = h('div', { class: 'msg-texto' });
    let parrafo = [];
    let lista = null;
    const cierra = () => {
      if (parrafo.length) caja.append(h('p', {}, conFormato(parrafo.join('\n'))));
      parrafo = [];
      lista = null;
    };
    lineas.forEach((linea) => {
      const vineta = linea.match(RE_VINETA);
      const numero = vineta ? null : linea.match(RE_NUMERO);
      if (!vineta && !numero) {
        if (!linea.trim()) { cierra(); return; }
        if (lista) cierra();
        parrafo.push(linea);
        return;
      }
      const tipo = vineta ? 'ul' : 'ol';
      if (parrafo.length || (lista && lista.tagName.toLowerCase() !== tipo)) cierra();
      if (!lista) {
        lista = h(tipo, { start: numero && numero[1] !== '1' ? numero[1] : null });
        caja.append(lista);
      }
      lista.append(h('li', {}, conFormato(vineta ? vineta[1] : numero[2])));
    });
    cierra();
    return caja;
  };

  /* ---------- Desplazamiento de la conversación ---------- */
  const cerca = () => charla.scrollHeight - charla.scrollTop - charla.clientHeight < 80;
  const abajo = (forzar) => {
    if (forzar === true || cerca()) charla.scrollTo({ top: charla.scrollHeight, behavior: suave() });
    irAbajo.hidden = true;
  };
  const desdeMsg = (m) => charla.scrollTo({ top: Math.max(0, (m.previousElementSibling || m).offsetTop - 12), behavior: suave() });
  charla.addEventListener('scroll', () => { if (cerca()) irAbajo.hidden = true; }, { passive: true });

  /* ---------- Mensajes ---------- */
  const decirYo = (texto) => {
    charla.append(h('div', { class: 'msg is-yo' }, h('p', { text: texto })));
    abajo(true);
  };
  const vencerOpciones = () => charla.querySelectorAll('[data-opcion]').forEach((b) => { b.disabled = true; });
  const copiar = (m, texto) => {
    const b = h('button', { class: 'msg-copiar', type: 'button', 'aria-label': 'Copiar la respuesta', title: 'Copiar' }, icono(I.copiar, 14, 'i-copiar'), icono(I.listo, 14, 'i-listo'));
    b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(texto.replace(RE_NEGRITA, '$1')); } catch { return; }
      b.classList.add('is-listo');
      b.setAttribute('aria-label', 'Respuesta copiada');
      setTimeout(() => { b.classList.remove('is-listo'); b.setAttribute('aria-label', 'Copiar la respuesta'); }, 1600);
    });
    m.append(b);
  };
  /* Al tocar una opción: queda marcada y las demás se apartan, antes de enviarla */
  let ocupado = false;
  const elegir = (chip, accion) => {
    if (ocupado || chip.disabled) return;
    chip.parentElement.classList.add('is-elegido');
    chip.classList.add('is-elegida');
    setTimeout(accion, movimiento.matches ? 180 : 0);
  };
  const decir = (r, { opciones = true, conCopia = true } = {}) => {
    const m = h('div', { class: 'msg is-ia' });
    const texto = typeof r.text === 'string' ? r.text : '';
    if (texto) m.append(conBloques(texto));
    const fuentes = (Array.isArray(r.sources) ? r.sources : []).filter((s) => s && typeof s.label === 'string' && s.label);
    if (fuentes.length) {
      m.append(h('div', { class: 'fuentes' },
        h('p', { class: 'fuentes-t', text: fuentes.length > 1 ? 'Fuentes' : 'Fuente' }),
        h('ul', {}, fuentes.map((s) => {
          const u = typeof s.url === 'string' ? segura(s.url) : null;
          return h('li', {}, icono(I.doc, 14), u ? h('a', { href: u.href, target: '_blank', rel: 'noopener noreferrer', text: s.label }) : h('span', { text: s.label }));
        }))));
    }
    const lista = opciones && Array.isArray(r.options) ? r.options.filter((o) => o && typeof o.id === 'string' && typeof o.label === 'string' && o.label) : [];
    if (lista.length) {
      m.append(h('div', { class: 'chips' }, lista.map((o, i) => h('button', {
        class: 'chip', type: 'button', 'data-opcion': true, style: `--i:${i}`, title: typeof o.description === 'string' ? o.description : null,
        onclick: (e) => elegir(e.currentTarget, () => enviar({ option_id: o.id }, o.label))
      }, h('span', { text: o.label }), icono(I.flecha, 14, 'chip-flecha')))));
    }
    if (conCopia && texto.length > 60) copiar(m, texto);
    charla.append(m);
    return m;
  };
  const aviso = (texto) => { const m = decir({ text: texto }, { conCopia: false }); abajo(true); return m; };
  const avisoCon = (texto, botones) => {
    const m = aviso(texto);
    m.append(h('div', { class: 'chips' }, botones.map(([rotulo, accion], i) => h('button', { class: 'chip', type: 'button', style: `--i:${i}`, onclick: accion }, h('span', { text: rotulo })))));
    abajo(true);
    return m;
  };
  /* Respuesta nueva: se muestra desde su comienzo; si la persona estaba leyendo más arriba, aparece «Nuevo mensaje» */
  const respuesta = (reply, usage, extra) => {
    vencerOpciones();
    const seguia = cerca();
    const m = decir(reply && typeof reply === 'object' ? reply : {}, extra);
    if (seguia) desdeMsg(m); else irAbajo.hidden = false;
    uso(usage);
    return m;
  };
  /* «Escribiendo…»: si tarda, dice qué está haciendo */
  const espera = () => {
    const txt = h('span', { class: 'espera-txt' });
    const e = h('div', { class: 'msg is-ia is-espera', role: 'status', 'aria-label': 'El asistente está escribiendo' }, h('span', { class: 'espera-puntos' }, h('i'), h('i'), h('i')), txt);
    const relojes = [[3500, 'Pensando…'], [9000, 'Revisando la información…'], [22000, 'Sigue trabajando, ya casi…']]
      .map(([ms, t]) => setTimeout(() => { txt.textContent = t; e.classList.add('con-texto'); }, ms));
    e.quitar = () => { relojes.forEach(clearTimeout); e.remove(); };
    charla.append(e);
    abajo(true);
    return e;
  };
  const SIN_CONEXION = 'No pude conectarme con el asistente. Revisa tu conexión y vuelve a intentarlo en un rato.';

  /* ---------- Bienvenida y sugerencias ---------- */
  const bienvenida = () => {
    const b = h('div', { class: 'bienvenida' },
      h('span', { class: 'bv-avatar', 'aria-hidden': 'true' }, marca(34, 'marca')),
      h('p', { class: 'bv-titulo', text: 'Hola, soy el asistente de Ambientalia' }),
      h('p', { class: 'bv-texto', text: API ? 'Respondo dudas sobre permisos y declaraciones ambientales, Ley REP, ACV y ecodiseño.' : 'El asistente en línea no está disponible por ahora. Escríbenos y te respondemos.' }));
    if (API) {
      b.append(h('p', { class: 'bv-label', text: 'Puedes preguntar, por ejemplo' }),
        h('div', { class: 'sugerencias' }, SUGERENCIAS.map(([ic, t], i) => h('button', { class: 'sug', type: 'button', style: `--i:${i}`, onclick: () => preguntar(t) },
          h('span', { class: 'sug-icono' }, icono(I[ic], 17)), h('span', { class: 'sug-texto', text: t }), icono(I.flecha, 15, 'sug-flecha')))));
    } else {
      const acciones = h('div', { class: 'acciones' });
      if (WA) acciones.append(h('a', { class: 'btn btn-pri', href: `https://wa.me/${WA}?text=${encodeURIComponent('Hola, me gustaría recibir más información.')}`, target: '_blank', rel: 'noopener noreferrer' }, icono(I.wa, 18), h('span', { text: 'Escribir por WhatsApp' })));
      if (CONTACTO) acciones.append(h('a', { class: 'btn btn-sec', href: CONTACTO }, icono(I.correo, 18), h('span', { text: 'Ir a contacto' })));
      if (acciones.childNodes.length) b.append(acciones);
    }
    charla.append(b);
    return b;
  };

  /* Una pregunta (escrita o sugerida): con sesión se envía; sin ella, se guarda y se piden los datos */
  let preguntaPendiente = '';
  const preguntar = (texto) => {
    const t = String(texto || '').trim().slice(0, MAX_TEXTO);
    if (!t || ocupado || !API) return;
    if (sesion) { enviar({ text: t }, t); return; }
    preguntaPendiente = t;
    const previa = charla.querySelector('.msg.is-yo.is-previa p');
    if (previa) {  // la puerta ya está a la vista: se cambia la pregunta
      previa.textContent = t;
      charla.querySelector('.puerta input[name=name]')?.focus({ preventScroll: true });
      return;
    }
    charla.querySelector('.bienvenida')?.classList.add('is-recogida');
    charla.append(h('div', { class: 'msg is-yo is-previa' }, h('p', { text: t })));
    if (!charla.querySelector('.puerta')) puerta();
  };

  /* ---------- Turnstile (solo si hay clave pública) ---------- */
  const TURNSTILE = C.turnstile || '';
  const turnstileListo = () => window.__turnstile || (window.__turnstile = new Promise((ok, mal) => {
    window.__turnstileListo = () => ok(window.turnstile);
    const s = d.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__turnstileListo';
    s.async = true;
    s.onerror = mal;
    d.head.append(s);
  }));

  /* ---------- La puerta: nombre, correo, teléfono y aceptación ---------- */
  const puerta = () => {
    form.hidden = true;
    const error = h('p', { class: 'error', role: 'alert' });
    const humano = TURNSTILE ? h('div', { class: 'humano' }) : null;
    const guardados = recordados();
    const fila = (name, rotulo, extra) => h('label', { class: 'campo' }, h('span', { text: rotulo }), h('input', { name, required: true, value: datos[name] || guardados?.[name] || null, ...extra }));
    const casilla = (name, contenido, marcada) => h('label', { class: 'acepto' },
      h('input', { type: 'checkbox', name, checked: marcada || null }),
      h('span', { class: 'acepto-caja', 'aria-hidden': 'true' }, icono(I.listo, 13)),
      h('span', { class: 'acepto-txt' }, contenido));
    const olvidarDatos = h('button', {
      class: 'olvidar', type: 'button', text: 'Olvidar mis datos en este dispositivo',
      onclick: () => {
        recordar(null);
        datos = {};
        recuerdo = false;
        ['name', 'email', 'phone'].forEach((n) => { f.elements[n].value = ''; });
        f.elements.remember.checked = false;
        olvidarDatos.replaceWith(h('p', { class: 'nota-ok', role: 'status', text: 'Listo: ya no recordamos tus datos en este dispositivo.' }));
      }
    });
    const boton = h('button', { class: 'btn btn-pri btn-ancho', type: 'submit' }, h('span', { class: 'btn-txt', text: preguntaPendiente ? 'Enviar mi pregunta' : 'Comenzar' }), h('span', { class: 'giro', 'aria-hidden': 'true' }));
    const f = h('form', { class: 'msg is-ia puerta', novalidate: true },
      h('p', { class: 'puerta-titulo', text: preguntaPendiente ? 'Antes de responder, déjame tus datos' : 'Para empezar, déjame tus datos' }),
      h('p', { class: 'puerta-sub', text: 'Así podemos hacer seguimiento de tu consulta si lo necesitas.' }),
      fila('name', 'Nombre', { type: 'text', autocomplete: 'name', maxlength: 150, enterkeyhint: 'next' }),
      fila('email', 'Correo', { type: 'email', autocomplete: 'email', inputmode: 'email', maxlength: 150, spellcheck: 'false', placeholder: 'nombre@empresa.cl', enterkeyhint: 'next' }),
      fila('phone', 'Teléfono', { type: 'tel', autocomplete: 'tel', inputmode: 'tel', maxlength: 20, placeholder: '+56 9 1234 5678', enterkeyhint: 'done' }),
      casilla('privacy_accepted', ['Acepto las ', h('a', { href: LEGAL('condiciones-del-servicio'), target: '_blank', rel: 'noopener' }, 'condiciones del servicio'), ' y el ', h('a', { href: LEGAL('politica-de-privacidad'), target: '_blank', rel: 'noopener' }, 'aviso de privacidad'), '.'], datos.privacy_accepted),
      casilla('marketing_accepted', 'Acepto que Ambientalia me contacte para hacer seguimiento de mi consulta y ofrecerme sus servicios (opcional).', datos.marketing_accepted),
      casilla('remember', `Recordar mis datos en este dispositivo por ${RECUERDO_DIAS} días (opcional).`, recuerdo ?? !!guardados),
      guardados ? olvidarDatos : null,
      h('div', { class: 'trampa', 'aria-hidden': 'true' }, h('label', {}, 'No completes este campo ', h('input', { name: 'website', tabindex: '-1', autocomplete: 'off' }))),
      humano,
      error,
      boton);
    /* Enter pasa al siguiente campo */
    [['name', 'email'], ['email', 'phone']].forEach(([de, a]) => f.elements[de].addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); f.elements[a].focus(); }
    }));
    let token = '';
    let widget = null;
    if (humano) {
      turnstileListo().then((ts) => {
        if (!humano.isConnected) return;
        widget = ts.render(humano, {
          sitekey: TURNSTILE, appearance: 'interaction-only', language: 'es',
          callback: (t) => { token = t; }, 'expired-callback': () => { token = ''; }, 'error-callback': () => { token = ''; }
        });
      }).catch(() => {});
    }
    const marcar = (malo, texto) => {
      error.textContent = texto;
      f.querySelectorAll('[aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
      if (malo) { malo.setAttribute('aria-invalid', 'true'); malo.focus({ preventScroll: false }); }
      f.classList.remove('is-sacude');
      void f.offsetWidth;  // reinicia la animación
      f.classList.add('is-sacude');
    };
    f.addEventListener('input', (e) => { if (e.target.hasAttribute('aria-invalid')) e.target.removeAttribute('aria-invalid'); });
    f.addEventListener('change', (e) => { if (e.target.hasAttribute('aria-invalid')) e.target.removeAttribute('aria-invalid'); });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (f.classList.contains('is-enviando')) return;
      datos = { name: f.elements.name.value.trim(), email: f.elements.email.value.trim(), phone: f.elements.phone.value.trim(), privacy_accepted: f.elements.privacy_accepted.checked, marketing_accepted: f.elements.marketing_accepted.checked };
      recuerdo = f.elements.remember.checked;
      error.textContent = '';
      if (datos.name.length < 2) { marcar(f.elements.name, 'Escribe tu nombre.'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.email)) { marcar(f.elements.email, 'Escribe un correo válido.'); return; }
      const digitos = datos.phone.replace(/\D/g, '').length;
      if (digitos < 8 || digitos > 15) { marcar(f.elements.phone, 'Escribe un teléfono con entre 8 y 15 números.'); return; }
      if (!datos.privacy_accepted) { marcar(f.elements.privacy_accepted, 'Para conversar, acepta las condiciones y el aviso de privacidad.'); return; }
      if (humano && !token) { marcar(null, 'Estamos comprobando que eres una persona. Espera un momento y vuelve a intentarlo.'); return; }
      f.classList.add('is-enviando');
      boton.disabled = true;
      const { estado: st, json, falla } = await llamar('/sessions', { method: 'POST', body: { ...datos, website: f.elements.website.value, ...(humano ? { 'cf-turnstile-response': token } : {}) } });
      f.classList.remove('is-enviando');
      boton.disabled = false;
      if (st === 201 && typeof json.token === 'string' && json.token) {
        if (widget !== null) window.turnstile?.remove(widget);
        sesion = { token: json.token, vence: json.expires_at };
        guardar(sesion);
        recordar(recuerdo ? { name: datos.name, email: datos.email, phone: datos.phone } : null);
        f.classList.add('is-lista');
        await pausa(movimiento.matches ? 240 : 0);
        f.remove();
        form.hidden = false;
        pintarMenu();
        const p = preguntaPendiente;
        preguntaPendiente = '';
        charla.querySelector('.msg.is-yo.is-previa')?.classList.remove('is-previa');
        if (p) {
          /* El saludo sin su menú, y la pregunta que ya se había escrito, sin repetirla en pantalla */
          respuesta(json.reply && typeof json.reply.text === 'string' ? { text: json.reply.text } : {}, json.usage, { conCopia: false });
          enviar({ text: p });
        } else {
          respuesta(json.reply, json.usage, { conCopia: false });
          if (!tactil.matches) campo.focus({ preventScroll: true });
        }
        return;
      }
      const delAsistente = (st === 422 || (st === 429 && json.error)) && (errores(json) || (typeof json.message === 'string' && json.message));
      marcar(null, falla ? SIN_CONEXION
        : st === 403 ? 'El asistente no está disponible desde esta página.'
        : st === 429 && !json.error ? 'Hubo muchos intentos desde esta conexión. Espera un momento.'
        : delAsistente || 'No pude abrir el chat. Vuelve a intentarlo.');
      if (widget !== null && f.isConnected) { token = ''; window.turnstile?.reset(widget); }
    });
    charla.append(f);
    desdeMsg(charla.querySelector('.msg.is-yo.is-previa') || f);
    if (!tactil.matches) setTimeout(() => f.elements.name.focus({ preventScroll: true }), 80);
  };

  /* Sin sesión: lo local se olvida */
  let pendiente = null;  // { id, cuerpo, visible, auto, manuales, nota }
  const olvidar = () => { sesion = null; guardar(null); pendiente = null; estadoTxt.textContent = ESTADO_BASE; };
  const vencida = (texto) => {
    olvidar();
    datos = { name: datos.name, email: datos.email, phone: datos.phone };
    aviso('Tu sesión terminó. Vuelve a escribir tus datos para seguir.');
    if (texto) preguntaPendiente = texto;
    pintarMenu();
    puerta();
  };

  /* ---------- Turnos ---------- */
  const guardarPendiente = () => {
    if (!sesion) return;
    if (pendiente) sesion.pendiente = { id: pendiente.id, cuerpo: pendiente.cuerpo, visible: pendiente.visible };
    else delete sesion.pendiente;
    guardar(sesion);
  };
  const mismo = (a, b) => (a.text ?? '') === (b.text ?? '') && (a.option_id ?? '') === (b.option_id ?? '');
  const enviar = (cuerpo, visible) => {
    if (ocupado || !sesion) return;
    if (pendiente && mismo(pendiente.cuerpo, cuerpo)) { reintentar(); return; }
    pendiente?.nota?.remove();
    pendiente = { id: idMensaje(), cuerpo, visible, auto: 0, manuales: 0, nota: null };
    guardarPendiente();
    if (visible) decirYo(visible);
    turno();
  };
  const reintentar = () => {
    if (ocupado || !pendiente) return;
    pendiente.manuales += 1;
    pendiente.nota?.remove();
    pendiente.nota = null;
    turno();
  };
  const ocupar = (si) => { ocupado = si; form.classList.toggle('is-ocupado', si); actualizarEnviar(); };
  const turno = async () => {
    const p = pendiente;
    ocupar(true);
    const e = espera();
    let r;
    for (;;) {
      r = await llamar('/messages', { method: 'POST', body: { ...p.cuerpo, client_message_id: p.id }, espera: ESPERA });
      const enCurso = r.falla === 'espera' || r.estado === 504 || (r.estado === 409 && r.json.error === 'busy');
      if (!enCurso || p.auto >= AUTO || pendiente !== p) break;
      p.auto += 1;
      await pausa(3000 * p.auto);
    }
    e.quitar();
    ocupar(false);
    if (pendiente !== p) return;
    const { estado: st, json } = r;
    if (st === 200 && json.reply && typeof json.reply === 'object') { pendiente = null; guardarPendiente(); respuesta(json.reply, json.usage); return; }
    if (st === 200 && json.duplicate) { pendiente = null; guardarPendiente(); uso(json.usage); aviso('Ese mensaje ya lo había recibido. Sigue cuando quieras.'); return; }
    if (st === 401) { pendiente = null; vencida(p.cuerpo.text); return; }
    if (st === 409 && json.error === 'idempotency_conflict') {
      pendiente = null;
      guardarPendiente();
      aviso(typeof json.message === 'string' && json.message ? json.message : 'Ese envío ya se registró con otros datos.');
      return;
    }
    if (st === 403 || st === 422) {
      pendiente = null;
      guardarPendiente();
      aviso(st === 403 ? 'El asistente no está disponible desde esta página.' : 'No pude enviar ese mensaje. Revisa lo que escribiste y vuelve a intentarlo.');
      if (st === 422 && p.cuerpo.text && !campo.value) { campo.value = p.cuerpo.text; ajustarAlto(); actualizarEnviar(); }
      return;
    }
    const texto = r.falla === 'red' ? 'No pude conectarme con el asistente. Revisa tu conexión y vuelve a intentarlo: si tu mensaje ya había llegado, no se repetirá.'
      : r.falla === 'espera' || st === 504 ? 'La respuesta está tardando más de lo normal. Vuelve a intentarlo en un momento: si tu mensaje ya había llegado, no se repetirá.'
      : st === 409 ? 'Todavía estoy preparando la respuesta. Vuelve a intentarlo en un momento.'
      : st === 429 ? (json.error && typeof json.message === 'string' && json.message) || 'Enviaste muchos mensajes seguidos. Espera un momento y vuelve a intentarlo.'
      : (json.error === 'unavailable' && typeof json.message === 'string' && json.message) || 'No pude responder en este momento. Vuelve a intentarlo en un rato.';
    if (p.manuales >= REINTENTOS) {
      pendiente = null;
      guardarPendiente();
      aviso(`No pude responder este mensaje. Escríbelo de nuevo más tarde${WA ? ' o escríbenos por WhatsApp' : ''}.`);
      return;
    }
    p.nota = avisoCon(texto, [['Reintentar', reintentar]]);
  };

  /* ---------- Al volver: la conversación la guarda el servicio ---------- */
  const retomar = async () => {
    form.hidden = true;
    ocupar(true);
    const e = espera();
    const { estado: st, json, falla } = await llamar('/history');
    e.quitar();
    ocupar(false);
    if (st === 401) { bienvenida(); vencida(); return; }
    if (st !== 200 || !Array.isArray(json.messages)) {
      const m = avisoCon(falla ? SIN_CONEXION : 'No pude recuperar la conversación en este momento.', [['Reintentar', () => { m.remove(); retomar(); }]]);
      return;
    }
    form.hidden = false;
    uso(json.usage);
    const mensajes = json.messages.filter((m) => m && typeof m.text === 'string');
    const guardado = sesion.pendiente;
    const recuperable = guardado && /^[A-Za-z0-9_-]{1,64}$/.test(guardado.id) && guardado.cuerpo && typeof guardado.cuerpo === 'object';
    if (!mensajes.length && !recuperable) { bienvenida(); return; }
    const ultimo = mensajes[mensajes.length - 1];
    mensajes.forEach((m) => (m.role === 'user' ? charla.append(h('div', { class: 'msg is-yo' }, h('p', { text: m.text }))) : decir(m, { opciones: m === ultimo })));
    if (recuperable) {
      pendiente = { ...guardado, auto: 0, manuales: 0, nota: null };
      if (pendiente.visible && !mensajes.some((m) => m.role === 'user' && m.text === pendiente.visible)) decirYo(pendiente.visible);
      pendiente.nota = avisoCon('Quedó un envío sin respuesta confirmada. Puedes reintentarlo sin duplicarlo.', [['Reintentar', reintentar]]);
    } else if (ultimo?.role === 'user') {
      avisoCon('Tu último mensaje todavía no tiene respuesta.', [['Actualizar', () => { if (ocupado) return; charla.textContent = ''; retomar(); }]]);
    }
    charla.scrollTo({ top: charla.scrollHeight });
  };
  const empezar = () => {
    if (empezado) return;
    empezado = true;
    pintarMenu();
    if (!API) { form.hidden = true; bienvenida(); return; }
    if (sesion) retomar(); else bienvenida();
  };

  /* ---------- Escribir ---------- */
  const actualizarEnviar = () => {
    const n = campo.value.length;
    enviarBtn.disabled = ocupado || !campo.value.trim();
    form.classList.toggle('con-texto', !!campo.value.trim());
    contador.hidden = n < MAX_TEXTO - 150;
    contador.textContent = `${n}/${MAX_TEXTO}`;
  };
  const ajustarAlto = () => { campo.style.height = 'auto'; campo.style.height = `${Math.min(campo.scrollHeight, 132)}px`; };
  campo.addEventListener('input', () => { ajustarAlto(); actualizarEnviar(); });
  campo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !tactil.matches) { e.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const texto = campo.value.trim().replace(/[ \t]+\n/g, '\n');
    if (!texto || ocupado) return;
    campo.value = '';
    ajustarAlto();
    actualizarEnviar();
    form.classList.remove('is-disparo');
    void form.offsetWidth;
    form.classList.add('is-disparo');
    preguntar(texto);
  });

  /* ---------- Borrar esta conversación ---------- */
  let confirmacion = null;
  const pedirBorrar = () => {
    if (ocupado || !sesion || confirmacion) return;
    confirmacion = avisoCon('¿Borramos esta conversación y los datos que dejaste en el chat? No se puede deshacer.', [
      ['Sí, borrar', () => borrar(confirmacion)],
      ['Cancelar', () => { confirmacion.remove(); confirmacion = null; }]
    ]);
  };
  const borrar = async (notaBorrar) => {
    if (ocupado || !sesion) return;
    ocupar(true);
    notaBorrar.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    const e = espera();
    const { estado: st, json, falla } = await llamar('/session', { method: 'DELETE', body: { confirm: true } });
    e.quitar();
    ocupar(false);
    const fin = (texto) => {
      notaBorrar.remove();
      confirmacion = null;
      olvidar();
      recordar(null);
      datos = {};
      recuerdo = null;
      charla.textContent = '';
      bienvenida();
      aviso(texto);
      pintarMenu();
    };
    if (st === 200 && json.deleted === true) { fin('Listo: borramos esta conversación y los datos que dejaste en el chat.'); return; }
    if (st === 500 && json.error === 'erasure_pending') { fin('Recibimos tu solicitud y cerramos la sesión. El borrado quedó en curso y el asistente lo completa en breve.'); return; }
    if (st === 401) { fin('Tu sesión ya había terminado, así que no pude borrar desde aquí. Revisa el aviso de privacidad para pedirlo.'); return; }
    notaBorrar.remove();
    confirmacion = null;
    aviso(st === 409 ? 'Hay una respuesta en curso. Espera un momento y vuelve a intentarlo: todavía no se borró nada.'
      : falla ? `${SIN_CONEXION} Todavía no se borró nada.` : 'No pude borrar la conversación en este momento. Vuelve a intentarlo: todavía no se borró nada.');
  };

  /* ---------- Al final del <body>, cuando el DOM esté listo ---------- */
  const montar = () => { if (!host.isConnected) d.body.append(host); ajustarVista(); };
  if (d.body) montar(); else d.addEventListener('DOMContentLoaded', montar);
})();
