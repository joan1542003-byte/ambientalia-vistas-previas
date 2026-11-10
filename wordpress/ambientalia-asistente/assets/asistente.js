/* Asistente IA de Ambientalia: burbuja siempre presente y ventana de chat conectada al asistente (servicio aparte).
   Es la misma conversación que el chat de Transporte Autorizado (assets/site/agente-chat.js en ese sitio), armada como
   un componente independiente para WordPress con Elementor:
   - Todo vive dentro de un Shadow DOM (#amb-asistente): los estilos del tema y de Elementor no lo alteran, y los suyos
     (asistente.css) no tocan el sitio.
   - Configuración en window.AMB_ASISTENTE (la escribe el plugin): asistente (dirección base), turnstile (clave
     pública), whatsapp, contacto, posicion ('izquierda' | 'derecha'), saludo y css. En este computador (localhost) se
     puede probar con ?asistente=<dirección>.
   - Sin dirección, la burbuja sigue presente y la ventana ofrece WhatsApp y contacto; no llama a nada.
   - Antes de conversar se piden nombre, correo, teléfono y la aceptación de las condiciones y el aviso de privacidad
     (POST /api/chat/sessions). La pestaña guarda solo el token, su vencimiento y el envío sin respuesta confirmada
     (sessionStorage); la conversación se recupera del servicio al volver (GET /api/chat/history).
   - «Recordar mis datos en este dispositivo» (opcional, sin marcar): nombre, correo y teléfono por 30 días en
     localStorage. Nunca el token, las aceptaciones ni la conversación.
   - Cada mensaje lleva su client_message_id y lo conserva en los reintentos: si el servicio ya lo procesó, devuelve la
     misma respuesta. Espera agotada, 504 o 409 busy: dos reintentos solos; lo demás, con «Reintentar».
   - Las respuestas llegan como texto plano y se muestran como texto, nunca como HTML: **negrita**, párrafos y listas.
     Los enlaces salen solo de las fuentes (reply.sources) con https y destino conocido.
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
  const FUENTES = ['ambientalia.cl', 'bcn.cl', 'leychile.cl', 'diariooficial.interior.gob.cl', 'sma.gob.cl', 'mma.gob.cl', 'sea.gob.cl', 'minsal.cl', 'retc.mma.gob.cl'];

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
  const DERECHA = C.posicion === 'derecha';
  const LEGAL = (ruta) => (API ? `${API}/${ruta}` : '');

  /* ---------- Elementos ---------- */
  const SVG = 'http://www.w3.org/2000/svg';
  const icono = (paths, size = 20) => {
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
    s.innerHTML = paths;  // trazos fijos de este archivo, nunca texto del servicio
    return s;
  };
  const I = {
    chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M8 12h.01"/><path d="M12 12h.01"/><path d="M16 12h.01"/>',
    chispa: '<path d="M9.94 14.06 8 20l-1.94-5.94L0 12l6.06-1.94L8 4l1.94 6.06L16 12Z" transform="translate(4 -1) scale(.85)"/><path d="M19 3v4"/><path d="M21 5h-4"/>',
    hoja: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    enviar: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
    doc: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
    wa: '<path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21"/><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1"/>',
    correo: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    borrar: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>'
  };
  const h = (tag, attrs = {}, ...hijos) => {
    const el = d.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') el.textContent = v;
      else if (k === 'icono') el.append(icono(v));
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    hijos.flat().forEach((c) => { if (c !== null && c !== undefined && c !== '') el.append(c); });
    return el;
  };
  const pausa = (ms) => new Promise((ok) => { setTimeout(ok, ms); });
  const movimiento = matchMedia('(prefers-reduced-motion: no-preference)');
  const tactil = matchMedia('(hover: none)');
  const suave = () => (movimiento.matches ? 'smooth' : 'auto');

  /* ---------- Shadow DOM: la burbuja, la invitación y la ventana ---------- */
  const host = h('div', { id: 'amb-asistente', 'data-posicion': DERECHA ? 'derecha' : 'izquierda' });
  host.style.cssText = 'all: initial; display: none;';
  const raiz = host.attachShadow({ mode: 'open' });
  const hoja = h('link', { rel: 'stylesheet', href: C.css || 'assets/asistente.css' });
  hoja.addEventListener('load', () => { host.style.display = 'block'; });
  hoja.addEventListener('error', () => { host.style.display = 'block'; });

  const burbuja = h('button', { class: 'burbuja', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'ventana', 'aria-label': 'Abrir el asistente de Ambientalia' },
    h('span', { class: 'b-abrir' }, icono(I.chat, 26), h('span', { class: 'b-chispa' }, icono(I.chispa, 14))),
    h('span', { class: 'b-cerrar' }, icono(I.x, 24)));
  const invitacion = h('div', { class: 'invitacion', role: 'status', hidden: true },
    h('button', { class: 'inv-texto', type: 'button', text: '¿Tienes dudas ambientales? Pregúntale al asistente.' }),
    h('button', { class: 'inv-cerrar', type: 'button', 'aria-label': 'Cerrar la invitación' }, icono(I.x, 14)));

  const sub = h('p', { class: 'cab-sub', text: 'Permisos, declaraciones, Ley REP y más' });
  const charla = h('div', { class: 'charla', 'aria-live': 'polite', 'aria-relevant': 'additions' });
  const campo = h('textarea', { name: 'q', rows: '1', maxlength: '1000', placeholder: 'Escribe tu pregunta…', 'aria-label': 'Tu pregunta', enterkeyhint: 'send' });
  const form = h('form', { class: 'entrada', hidden: true },
    campo,
    h('button', { class: 'enviar', type: 'submit', 'aria-label': 'Enviar' }, icono(I.enviar, 19)));
  const salir = h('button', { class: 'pie-borrar', type: 'button', hidden: true }, icono(I.borrar, 14), h('span', { text: 'Borrar esta conversación' }));
  const legales = h('p', { class: 'pie-legal' });
  const ventana = h('section', { class: 'ventana', id: 'ventana', role: 'dialog', 'aria-label': 'Asistente de Ambientalia', tabindex: '-1', hidden: true },
    h('header', { class: 'cab' },
      h('span', { class: 'avatar', 'aria-hidden': 'true' }, icono(I.hoja, 20)),
      h('div', { class: 'cab-quien' },
        h('h2', {}, 'Asistente Ambientalia', h('span', { class: 'cab-ia', text: 'IA' })),
        sub),
      h('button', { class: 'cerrar', type: 'button', 'aria-label': 'Cerrar el asistente', onclick: () => cerrar() }, icono(I.x, 20))),
    charla,
    form,
    h('footer', { class: 'pie' }, salir, legales));
  raiz.append(hoja, ventana, invitacion, burbuja);

  /* Enlaces legales del asistente (los publica el propio servicio) */
  if (API) {
    legales.append(
      h('a', { href: LEGAL('condiciones-del-servicio'), target: '_blank', rel: 'noopener', text: 'Condiciones' }), ' · ',
      h('a', { href: LEGAL('politica-de-privacidad'), target: '_blank', rel: 'noopener', text: 'Privacidad' }));
  } else {
    legales.hidden = true;
  }

  /* ---------- Abrir y cerrar ---------- */
  const telefono = matchMedia('(max-width: 600px)');
  let abierta = false;
  let empezado = false;
  const bloquear = (si) => {
    d.documentElement.style.overflow = si && telefono.matches ? 'hidden' : '';
  };
  const abrir = () => {
    if (abierta) return;
    abierta = true;
    ocultarInvitacion(true);
    ventana.hidden = false;
    ventana.classList.remove('is-saliendo');
    burbuja.classList.add('is-abierta');
    burbuja.setAttribute('aria-expanded', 'true');
    burbuja.setAttribute('aria-label', 'Cerrar el asistente');
    host.classList.add('is-abierta');
    bloquear(true);
    empezar();
    requestAnimationFrame(() => {
      const foco = !tactil.matches && (form.hidden ? charla.querySelector('input:not([type=checkbox])') : campo);
      (foco || ventana).focus({ preventScroll: true });
    });
  };
  const cerrar = () => {
    if (!abierta) return;
    abierta = false;
    burbuja.classList.remove('is-abierta');
    burbuja.setAttribute('aria-expanded', 'false');
    burbuja.setAttribute('aria-label', 'Abrir el asistente de Ambientalia');
    host.classList.remove('is-abierta');
    bloquear(false);
    if (movimiento.matches) {
      ventana.classList.add('is-saliendo');
      setTimeout(() => { if (!abierta) { ventana.hidden = true; ventana.classList.remove('is-saliendo'); } }, 260);
    } else {
      ventana.hidden = true;
    }
    burbuja.focus({ preventScroll: true });
  };
  burbuja.addEventListener('click', () => (abierta ? cerrar() : abrir()));
  raiz.addEventListener('keydown', (e) => { if (e.key === 'Escape' && abierta) { e.stopPropagation(); cerrar(); } });
  telefono.addEventListener?.('change', () => bloquear(abierta));
  /* Desde el sitio: cualquier enlace a #asistente (por ejemplo, un botón de Elementor) abre la ventana */
  d.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href$="#asistente"], [data-amb-asistente]');
    if (!a) return;
    e.preventDefault();
    abrir();
  });
  window.ambAsistente = { abrir, cerrar };

  /* ---------- Invitación, una vez por visita ---------- */
  let relojInvitacion = 0;
  const ocultarInvitacion = (para) => {
    clearTimeout(relojInvitacion);
    if (!invitacion.hidden) {
      invitacion.classList.add('is-saliendo');
      setTimeout(() => { invitacion.hidden = true; invitacion.classList.remove('is-saliendo'); }, 220);
    }
    if (para) { try { sessionStorage.setItem(CLAVE_SALUDO, '1'); } catch { /* sin almacenamiento */ } }
  };
  invitacion.querySelector('.inv-texto').addEventListener('click', abrir);
  invitacion.querySelector('.inv-cerrar').addEventListener('click', () => ocultarInvitacion(true));
  if (C.saludo !== false) {
    let visto = false;
    try { visto = sessionStorage.getItem(CLAVE_SALUDO) === '1'; } catch { /* sin almacenamiento */ }
    if (!visto) {
      setTimeout(() => {
        if (abierta) return;
        invitacion.hidden = false;
        try { sessionStorage.setItem(CLAVE_SALUDO, '1'); } catch { /* sin almacenamiento */ }
        relojInvitacion = setTimeout(() => ocultarInvitacion(false), 12000);
      }, 5000);
    }
  }

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
    sub.textContent = u.remaining <= 3 ? `Te ${u.remaining === 1 ? 'queda 1 consulta' : `quedan ${u.remaining} consultas`}` : 'Permisos, declaraciones, Ley REP y más';
  };

  /* ---------- Texto de las respuestas: siempre como texto ---------- */
  const segura = (href) => {
    let u;
    try { u = new URL(href); } catch { return null; }
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
    if (u.origin === location.origin) return u;
    const host = u.hostname.toLowerCase();
    return u.protocol === 'https:' && (host.endsWith('.gob.cl') || FUENTES.some((f) => host === f || host.endsWith(`.${f}`))) ? u : null;
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

  /* ---------- Mensajes ---------- */
  const abajo = () => charla.scrollTo({ top: charla.scrollHeight, behavior: suave() });
  const desdeMsg = (m) => charla.scrollTo({ top: (m.previousElementSibling || m).offsetTop - 12, behavior: suave() });
  const decirYo = (texto) => { charla.append(h('div', { class: 'msg is-yo' }, h('p', { text: texto }))); abajo(); };
  const vencerOpciones = () => charla.querySelectorAll('[data-opcion]').forEach((b) => { b.disabled = true; });
  const decir = (r, { opciones = true } = {}) => {
    const m = h('div', { class: 'msg is-ia' });
    if (typeof r.text === 'string' && r.text) m.append(conBloques(r.text));
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
      m.append(h('div', { class: 'chips' }, lista.map((o) => h('button', {
        class: 'chip', type: 'button', 'data-opcion': true, text: o.label, title: typeof o.description === 'string' ? o.description : null,
        onclick: () => enviar({ option_id: o.id }, o.label)
      }))));
    }
    charla.append(m);
    return m;
  };
  const aviso = (texto) => { const m = decir({ text: texto }); abajo(); return m; };
  const avisoCon = (texto, botones) => {
    const m = aviso(texto);
    m.append(h('div', { class: 'chips' }, botones.map(([rotulo, accion]) => h('button', { class: 'chip', type: 'button', text: rotulo, onclick: accion }))));
    abajo();
    return m;
  };
  const respuesta = (reply, usage) => {
    vencerOpciones();
    desdeMsg(decir(reply && typeof reply === 'object' ? reply : {}));
    uso(usage);
  };
  const espera = () => {
    const e = h('div', { class: 'msg is-ia is-espera', 'aria-label': 'El asistente está escribiendo' }, h('span', {}), h('span', {}), h('span', {}));
    charla.append(e);
    abajo();
    return e;
  };
  const SIN_CONEXION = 'No pude conectarme con el asistente. Revisa tu conexión y vuelve a intentarlo en un rato.';

  /* Sin dirección: la burbuja sigue presente y ofrece los otros canales */
  const noDisponible = () => {
    const m = decir({ text: 'El asistente en línea no está disponible por ahora. Puedes escribirnos y te respondemos.' });
    const acciones = h('div', { class: 'acciones' });
    if (WA) acciones.append(h('a', { class: 'btn btn-wa', href: `https://wa.me/${WA}?text=${encodeURIComponent('Hola, me gustaría recibir más información.')}`, target: '_blank', rel: 'noopener noreferrer' }, icono(I.wa, 18), h('span', { text: 'Escribir por WhatsApp' })));
    if (CONTACTO) acciones.append(h('a', { class: 'btn btn-sec', href: CONTACTO }, icono(I.correo, 18), h('span', { text: 'Ir a contacto' })));
    if (acciones.childNodes.length) m.append(acciones);
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
    const olvidarDatos = h('button', {
      class: 'olvidar', type: 'button', text: 'Olvidar mis datos en este dispositivo',
      onclick: () => {
        recordar(null);
        datos = {};
        recuerdo = false;
        ['name', 'email', 'phone'].forEach((n) => { f.elements[n].value = ''; });
        f.elements.remember.checked = false;
        olvidarDatos.replaceWith(h('p', { class: 'nota', role: 'status', text: 'Listo: ya no recordamos tus datos en este dispositivo.' }));
      }
    });
    const f = h('form', { class: 'msg is-ia puerta', novalidate: true },
      h('p', { class: 'msg-texto' }, h('strong', { text: 'Hola, soy el asistente de Ambientalia.' }), ' Te ayudo con permisos y declaraciones ambientales, Ley REP, ACV y ecodiseño. Para empezar, déjame tus datos.'),
      fila('name', 'Nombre', { type: 'text', autocomplete: 'name', maxlength: 150 }),
      fila('email', 'Correo', { type: 'email', autocomplete: 'email', maxlength: 150, spellcheck: 'false', placeholder: 'nombre@empresa.cl' }),
      fila('phone', 'Teléfono', { type: 'tel', autocomplete: 'tel', maxlength: 20, placeholder: '+56 9 1234 5678' }),
      h('label', { class: 'acepto' },
        h('input', { type: 'checkbox', name: 'privacy_accepted', checked: datos.privacy_accepted || null }),
        h('span', {}, 'Acepto las ', h('a', { href: LEGAL('condiciones-del-servicio'), target: '_blank', rel: 'noopener' }, 'condiciones del servicio'), ' y el ', h('a', { href: LEGAL('politica-de-privacidad'), target: '_blank', rel: 'noopener' }, 'aviso de privacidad'), '.')),
      h('label', { class: 'acepto' },
        h('input', { type: 'checkbox', name: 'marketing_accepted', checked: datos.marketing_accepted || null }),
        h('span', { text: 'Acepto que Ambientalia me contacte por correo, teléfono o llamada para hacer seguimiento de mi consulta y ofrecerme sus servicios (opcional).' })),
      h('label', { class: 'acepto' },
        h('input', { type: 'checkbox', name: 'remember', checked: (recuerdo ?? !!guardados) || null }),
        h('span', { text: `Recordar mi nombre, correo y teléfono en este dispositivo por ${RECUERDO_DIAS} días (opcional). No lo uses en un equipo compartido.` })),
      guardados ? olvidarDatos : null,
      h('div', { class: 'trampa', 'aria-hidden': 'true' }, h('label', {}, 'No completes este campo ', h('input', { name: 'website', tabindex: '-1', autocomplete: 'off' }))),
      humano,
      error,
      h('button', { class: 'btn btn-pri', type: 'submit', text: 'Comenzar' }));
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
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (f.classList.contains('is-enviando')) return;
      datos = { name: f.elements.name.value.trim(), email: f.elements.email.value.trim(), phone: f.elements.phone.value.trim(), privacy_accepted: f.elements.privacy_accepted.checked, marketing_accepted: f.elements.marketing_accepted.checked };
      recuerdo = f.elements.remember.checked;
      error.textContent = '';
      const falta = !datos.name ? 'Escribe tu nombre.' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.email) ? 'Escribe un correo válido.'
        : datos.phone.replace(/\D/g, '').length < 8 ? 'Escribe un teléfono con al menos 8 números.' : !datos.privacy_accepted ? 'Para conversar, acepta las condiciones y el aviso de privacidad.' : '';
      if (falta) { error.textContent = falta; return; }
      if (humano && !token) { error.textContent = 'Estamos comprobando que eres una persona. Espera un momento y vuelve a intentarlo.'; return; }
      f.classList.add('is-enviando');
      const { estado, json, falla } = await llamar('/sessions', { method: 'POST', body: { ...datos, website: f.elements.website.value, ...(humano ? { 'cf-turnstile-response': token } : {}) } });
      f.classList.remove('is-enviando');
      if (estado === 201 && typeof json.token === 'string' && json.token) {
        if (widget !== null) window.turnstile?.remove(widget);
        sesion = { token: json.token, vence: json.expires_at };
        guardar(sesion);
        recordar(recuerdo ? { name: datos.name, email: datos.email, phone: datos.phone } : null);
        salir.hidden = false;
        f.remove();
        form.hidden = false;
        respuesta(json.reply, json.usage);
        if (!tactil.matches) campo.focus({ preventScroll: true });
        return;
      }
      const delAsistente = (estado === 422 || (estado === 429 && json.error)) && (errores(json) || (typeof json.message === 'string' && json.message));
      error.textContent = falla ? SIN_CONEXION
        : estado === 403 ? 'El asistente no está disponible desde esta página.'
        : estado === 429 && !json.error ? 'Hubo muchos intentos desde esta conexión. Espera un momento.'
        : delAsistente || 'No pude abrir el chat. Vuelve a intentarlo.';
      if (widget !== null && f.isConnected) { token = ''; window.turnstile?.reset(widget); }
    });
    charla.append(f);
    desdeMsg(f);
  };

  /* Sin sesión: lo local se olvida */
  const olvidar = () => { sesion = null; guardar(null); pendiente = null; salir.hidden = true; sub.textContent = 'Permisos, declaraciones, Ley REP y más'; };
  const vencida = (texto) => {
    olvidar();
    datos = { name: datos.name, email: datos.email, phone: datos.phone };
    aviso('Tu sesión terminó. Vuelve a escribir tus datos para seguir.');
    puerta();
    if (texto) campo.value = texto;
  };

  /* ---------- Turnos ---------- */
  let ocupado = false;
  let pendiente = null;  // { id, cuerpo, visible, auto, manuales, nota }
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
  const turno = async () => {
    const p = pendiente;
    ocupado = true;
    form.classList.add('is-ocupado');
    const e = espera();
    let r;
    for (;;) {
      r = await llamar('/messages', { method: 'POST', body: { ...p.cuerpo, client_message_id: p.id }, espera: ESPERA });
      const enCurso = r.falla === 'espera' || r.estado === 504 || (r.estado === 409 && r.json.error === 'busy');
      if (!enCurso || p.auto >= AUTO || pendiente !== p) break;
      p.auto += 1;
      await pausa(3000 * p.auto);
    }
    e.remove();
    ocupado = false;
    form.classList.remove('is-ocupado');
    if (pendiente !== p) return;
    const { estado, json } = r;
    if (estado === 200 && json.reply && typeof json.reply === 'object') { pendiente = null; guardarPendiente(); respuesta(json.reply, json.usage); return; }
    if (estado === 200 && json.duplicate) { pendiente = null; guardarPendiente(); uso(json.usage); aviso('Ese mensaje ya lo había recibido. Sigue cuando quieras.'); return; }
    if (estado === 401) { pendiente = null; vencida(p.cuerpo.text && p.visible); return; }
    if (estado === 409 && json.error === 'idempotency_conflict') {
      pendiente = null;
      guardarPendiente();
      aviso(typeof json.message === 'string' && json.message ? json.message : 'Ese envío ya se registró con otros datos.');
      return;
    }
    if (estado === 403 || estado === 422) {
      pendiente = null;
      guardarPendiente();
      aviso(estado === 403 ? 'El asistente no está disponible desde esta página.' : 'No pude enviar ese mensaje. Revisa lo que escribiste y vuelve a intentarlo.');
      if (estado === 422 && p.cuerpo.text && !campo.value) campo.value = p.cuerpo.text;
      return;
    }
    const texto = r.falla === 'red' ? 'No pude conectarme con el asistente. Revisa tu conexión y vuelve a intentarlo: si tu mensaje ya había llegado, no se repetirá.'
      : r.falla === 'espera' || estado === 504 ? 'La respuesta está tardando más de lo normal. Vuelve a intentarlo en un momento: si tu mensaje ya había llegado, no se repetirá.'
      : estado === 409 ? 'Todavía estoy preparando la respuesta. Vuelve a intentarlo en un momento.'
      : estado === 429 ? (typeof json.message === 'string' && json.error && json.message) || 'Enviaste muchos mensajes seguidos. Espera un momento y vuelve a intentarlo.'
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
    ocupado = true;
    const e = espera();
    const { estado, json, falla } = await llamar('/history');
    e.remove();
    ocupado = false;
    if (estado === 401) { vencida(); return; }
    if (estado !== 200 || !Array.isArray(json.messages)) {
      const m = avisoCon(falla ? SIN_CONEXION : 'No pude recuperar la conversación en este momento.', [['Reintentar', () => { m.remove(); retomar(); }]]);
      return;
    }
    form.hidden = false;
    salir.hidden = false;
    uso(json.usage);
    const mensajes = json.messages.filter((m) => m && typeof m.text === 'string');
    const guardado = sesion.pendiente;
    const recuperable = guardado && /^[A-Za-z0-9_-]{1,64}$/.test(guardado.id) && guardado.cuerpo && typeof guardado.cuerpo === 'object';
    if (!mensajes.length && !recuperable) { enviar({ text: 'inicio' }); return; }
    const ultimo = mensajes[mensajes.length - 1];
    mensajes.forEach((m) => (m.role === 'user' ? decirYo(m.text) : decir(m, { opciones: m === ultimo })));
    if (recuperable) {
      pendiente = { ...guardado, auto: 0, manuales: 0, nota: null };
      if (pendiente.visible && !mensajes.some((m) => m.role === 'user' && m.text === pendiente.visible)) decirYo(pendiente.visible);
      pendiente.nota = avisoCon('Quedó un envío sin respuesta confirmada. Puedes reintentarlo sin duplicarlo.', [['Reintentar', reintentar]]);
    } else if (ultimo?.role === 'user') {
      avisoCon('Tu último mensaje todavía no tiene respuesta.', [['Actualizar', () => { if (ocupado) return; charla.textContent = ''; retomar(); }]]);
    }
    abajo();
  };
  const empezar = () => {
    if (empezado) return;
    empezado = true;
    if (!API) { noDisponible(); return; }
    if (sesion) retomar(); else puerta();
  };

  /* ---------- Escribir ---------- */
  const ajustarAlto = () => { campo.style.height = 'auto'; campo.style.height = `${Math.min(campo.scrollHeight, 120)}px`; };
  campo.addEventListener('input', ajustarAlto);
  campo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const texto = campo.value.trim().replace(/\s+\n/g, '\n');
    if (!texto || ocupado) return;
    campo.value = '';
    ajustarAlto();
    enviar({ text: texto.slice(0, 1000) }, texto.slice(0, 1000));
  });

  /* ---------- Borrar esta conversación ---------- */
  let confirmacion = null;
  salir.addEventListener('click', () => {
    if (ocupado || !sesion || confirmacion) return;
    confirmacion = avisoCon('¿Borramos esta conversación y los datos que dejaste en el chat? No se puede deshacer.', [
      ['Sí, borrar', () => borrar(confirmacion)],
      ['Cancelar', () => { confirmacion.remove(); confirmacion = null; }]
    ]);
  });
  const borrar = async (nota) => {
    if (ocupado || !sesion) return;
    ocupado = true;
    nota.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    const e = espera();
    const { estado, json, falla } = await llamar('/session', { method: 'DELETE', body: { confirm: true } });
    e.remove();
    ocupado = false;
    const fin = (texto) => { nota.remove(); confirmacion = null; olvidar(); recordar(null); datos = {}; recuerdo = null; charla.textContent = ''; aviso(texto); puerta(); };
    if (estado === 200 && json.deleted === true) { fin('Listo: borramos esta conversación y los datos que dejaste en el chat.'); return; }
    if (estado === 500 && json.error === 'erasure_pending') { fin('Recibimos tu solicitud y cerramos la sesión. El borrado quedó en curso y el asistente lo completa en breve.'); return; }
    if (estado === 401) { fin('Tu sesión ya había terminado, así que no pude borrar desde aquí. Revisa el aviso de privacidad para pedirlo.'); return; }
    nota.remove();
    confirmacion = null;
    aviso(estado === 409 ? 'Hay una respuesta en curso. Espera un momento y vuelve a intentarlo: todavía no se borró nada.'
      : falla ? `${SIN_CONEXION} Todavía no se borró nada.` : 'No pude borrar la conversación en este momento. Vuelve a intentarlo: todavía no se borró nada.');
  };

  /* ---------- Al final del <body>, cuando el DOM esté listo ---------- */
  const montar = () => { if (!host.isConnected) d.body.append(host); };
  if (d.body) montar(); else d.addEventListener('DOMContentLoaded', montar);
})();
