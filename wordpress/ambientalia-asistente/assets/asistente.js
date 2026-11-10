/* Asistente de Ambientalia: la burbuja «?» y el chat de Transporte Autorizado, idénticos, para ambientalia.cl
   (WordPress con Elementor) y en el verde de Ambientalia.
   - La burbuja es la de Transporte (assets/site/site.js, [data-dock]): vidrio con «?»; al tocarla se expande como vidrio
     líquido y muestra las acciones (Contacto, WhatsApp, Chat con IA y «¿En qué te ayudamos?»). Se cierra al elegir una, al
     tocar fuera o con Escape. Aquí siempre está a la vista.
   - «Chat con IA» abre la ventana de Transporte (assets/site/agente.js y agente-chat.js): nace desde la burbuja, que pasa
     a «X» y la cierra; «Volver» la cierra y vuelve a mostrar las opciones; en el teléfono se apoya sobre el teclado.
   - La conversación es la del chat conectado de Transporte (agente-chat.js): el navegador llama directo al asistente
     (POST /api/chat/sessions, /api/chat/messages, GET /api/chat/history, DELETE /api/chat/session). Al abrir sin sesión
     saluda y ofrece preguntas de ejemplo; al elegir una o escribir, pide nombre, correo, teléfono y la aceptación de las
     condiciones y, al entrar, envía la pregunta sola. La pestaña guarda solo el token, su vencimiento y el envío sin
     respuesta confirmada; «Recordar mis datos» (opcional) guarda nombre, correo y teléfono por 30 días. Cada mensaje
     conserva su client_message_id en los reintentos. Las respuestas se muestran como texto, nunca como HTML.
   - Todo vive en un Shadow DOM (#amb-asistente): los estilos del tema y de Elementor no lo alteran y los suyos
     (asistente.css) no tocan el sitio.
   - Configuración en window.AMB_ASISTENTE (la escribe el plugin, Ajustes → Asistente IA): posicion, leyenda, destacada
     ('contacto' | 'whatsapp' | 'ninguna'), chat y chatTexto, asistente (dirección) y turnstile, whatsapp, waTexto y
     waMensaje, contacto y contactoTexto, y css. Una acción apagada llega vacía y no se muestra; sin ninguna, no hay
     burbuja. En este computador (localhost) se puede probar con ?asistente=<dirección>.
   Sin lookbehind en las expresiones regulares (Safari < 16.4). */
(() => {
  if (window.__ambAsistente) return;
  window.__ambAsistente = true;
  const d = document;
  const C = window.AMB_ASISTENTE || {};
  const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const RECUERDO_DIAS = 30;
  const CLAVE = 'amb-asistente';
  const CLAVE_DATOS = 'amb-asistente-datos';
  const ESPERA = 90000;
  const AUTO = 2;
  const REINTENTOS = 3;
  const FUENTES = ['ambientalia.cl', 'bcn.cl', 'leychile.cl', 'diariooficial.interior.gob.cl', 'minsal.cl'];
  const EJEMPLOS = ['¿Mi proyecto necesita un permiso ambiental?', '¿Qué tengo que declarar en el RETC?', '¿Me aplica la Ley REP?', '¿Qué es un ACV y para qué sirve?'];

  /* ---------- Dirección del asistente y datos de contacto ---------- */
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
  const CONTACTO = (() => { if (!C.contacto) return ''; try { const u = new URL(C.contacto, location.href); return /^(https?|mailto):$/.test(u.protocol) ? u.href : ''; } catch { return ''; } })();
  const CHAT = C.chat !== false;
  const corto = (t, max, defecto) => (typeof t === 'string' && t.trim() ? t.trim().slice(0, max) : defecto);
  const TEXTOS = {
    contacto: corto(C.contactoTexto, 30, 'Contacto'),
    wa: corto(C.waTexto, 30, 'WhatsApp'),
    chat: corto(C.chatTexto, 30, 'Chat con IA'),
    leyenda: corto(C.leyenda, 40, '¿En qué te ayudamos?'),
    waMensaje: corto(C.waMensaje, 300, 'Hola, me gustaría recibir más información.')
  };
  const DESTACADA = ['contacto', 'whatsapp', 'ninguna'].includes(C.destacada) ? C.destacada : 'contacto';
  if (!CONTACTO && !WA && !CHAT) return;  // sin acciones, no hay burbuja
  const LEGAL = (ruta) => (API ? `${API}/${ruta}` : '');

  /* ---------- Elementos (los íconos son los de Transporte: trazos fijos, nunca texto del servicio) ---------- */
  const SVG = 'http://www.w3.org/2000/svg';
  const icono = (paths, { size = 20, ancho = 2, clase = '', relleno = false } = {}) => {
    const s = d.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('width', size);
    s.setAttribute('height', size);
    s.setAttribute('aria-hidden', 'true');
    if (relleno) s.setAttribute('fill', 'currentColor');
    else {
      s.setAttribute('fill', 'none');
      s.setAttribute('stroke', 'currentColor');
      s.setAttribute('stroke-width', ancho);
      s.setAttribute('stroke-linecap', 'round');
      s.setAttribute('stroke-linejoin', 'round');
    }
    if (clase) s.setAttribute('class', clase);
    s.innerHTML = paths;
    return s;
  };
  const I = {
    q: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    correo: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    wa: '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>',
    ia: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
    volver: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    avatar: '<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z"/><path d="M9 10.5h6M9 14h3.5"/>',
    nuevo: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5"/><path d="M20 4v4.5h-4.5"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5"/><path d="M4 20v-4.5h4.5"/>',
    enviar: '<path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/>',
    doc: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>'
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
  const motion = matchMedia('(prefers-reduced-motion: no-preference)');
  const tactil = matchMedia('(hover: none)');
  const suave = () => (motion.matches ? 'smooth' : 'auto');

  /* El giro del borde de «Chat con IA» anima un ángulo: @property no rige dentro de un Shadow DOM, así que se registra en
     la página (una sola vez; si ya existe o el navegador no lo admite, el borde queda quieto) */
  try { CSS.registerProperty({ name: '--ia-giro', syntax: '<angle>', inherits: false, initialValue: '0deg' }); } catch { /* ya registrada o sin soporte */ }

  /* ---------- Shadow DOM ---------- */
  const host = h('div', { id: 'amb-asistente', 'data-posicion': C.posicion === 'izquierda' ? 'izquierda' : 'derecha' });
  host.style.cssText = 'all: initial; display: none;';
  const raiz = host.attachShadow({ mode: 'open' });
  const hoja = h('link', { rel: 'stylesheet', href: C.css || 'assets/asistente.css' });
  const mostrar = () => { host.style.display = 'block'; };
  hoja.addEventListener('load', mostrar);
  hoja.addEventListener('error', mostrar);

  /* La burbuja «?» con sus acciones */
  const toggle = h('button', { class: 'dock-toggle', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'dock-menu', 'aria-label': 'Ayuda y contacto' },
    icono(I.q, { size: 24, clase: 'dock-q' }), icono(I.x, { size: 24, clase: 'dock-x' }));
  const abrirChat = h('button', { class: 'dock-action is-ia', type: 'button', 'aria-haspopup': 'dialog', 'aria-controls': 'agente', 'aria-expanded': 'false' }, icono(I.ia), TEXTOS.chat);
  /* La destacada va arriba, en verde (la «Cotizar retiro» de Transporte) */
  const accionContacto = CONTACTO ? h('a', { class: `dock-action${DESTACADA === 'contacto' ? ' is-primary' : ''}`, href: CONTACTO }, icono(I.correo), TEXTOS.contacto) : null;
  const accionWa = WA ? h('a', { class: `dock-action${DESTACADA === 'whatsapp' ? ' is-primary' : ''}`, href: `https://wa.me/${WA}?text=${encodeURIComponent(TEXTOS.waMensaje)}`, target: '_blank', rel: 'noopener noreferrer' }, icono(I.wa, { relleno: true }), TEXTOS.wa, h('span', { class: 'sr-only', text: ' (pestaña nueva)' })) : null;
  const menu = h('nav', { class: 'dock-menu', id: 'dock-menu', 'aria-label': 'Acciones rápidas' },
    DESTACADA === 'whatsapp' ? [accionWa, accionContacto] : [accionContacto, accionWa],
    CHAT ? abrirChat : null,
    h('p', { class: 'dock-caption', 'aria-hidden': 'true', text: TEXTOS.leyenda }));
  const dock = h('div', { class: 'dock', 'data-dock': true }, toggle, menu);

  /* La ventana del chat */
  const sub = h('p', { hidden: true });
  const tag = LOCAL ? h('span', { class: 'agente-tag', text: 'Prueba local' }) : null;
  const atras = h('button', { class: 'agente-icono', type: 'button', 'aria-label': 'Volver a las opciones' }, icono(I.volver, { ancho: 2.2 }));
  const nuevo = h('button', { class: 'agente-icono', type: 'button', 'aria-label': 'Empezar una conversación nueva' }, icono(I.nuevo));
  const charla = h('div', { class: 'agente-charla', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversación con el asistente', tabindex: '0' });
  const campo = h('input', { id: 'agente-q', name: 'q', type: 'text', maxlength: '240', enterkeyhint: 'send', placeholder: 'Escribe tu pregunta', autocomplete: 'off' });
  const form = h('form', { class: 'agente-escribir', autocomplete: 'off' },
    h('label', { class: 'sr-only', for: 'agente-q', text: 'Escribe tu pregunta' }),
    campo,
    h('button', { type: 'submit', 'aria-label': 'Enviar la pregunta' }, icono(I.enviar, { ancho: 2.2 })));
  const salir = h('button', { class: 'agente-salir', type: 'button', text: 'Borrar esta conversación', hidden: true });
  const pie = h('p', { class: 'agente-pie' }, salir);
  const panel = h('div', { class: 'agente', id: 'agente', role: 'dialog', 'aria-labelledby': 'agente-titulo', hidden: true },
    h('div', { class: 'agente-panel' },
      h('div', { class: 'agente-cab' },
        atras,
        h('span', { class: 'agente-avatar', 'aria-hidden': 'true' }, icono(I.avatar, { ancho: 2.2 })),
        h('div', { class: 'agente-quien' }, h('h2', { id: 'agente-titulo' }, 'Asistente ', tag), sub),
        nuevo),
      charla,
      form,
      pie));
  raiz.append(hoja, panel, dock);
  if (!API) { sub.textContent = 'No disponible por ahora'; sub.hidden = false; }

  /* ---------- La burbuja: se expande con las acciones (site.js) ---------- */
  let abiertoMenu = false;
  /* El tamaño abierto sale del propio menú, así la animación termina justo en su borde */
  const medir = () => {
    dock.style.setProperty('--dock-w', `${menu.offsetWidth}px`);
    dock.style.setProperty('--dock-h', `${menu.offsetHeight}px`);
  };
  const setMenu = (si, { foco = false } = {}) => {
    if (si === abiertoMenu) return;
    abiertoMenu = si;
    if (si) medir();
    dock.classList.toggle('is-open', si);
    toggle.setAttribute('aria-expanded', String(si));
    menu.inert = !si;
    if (!si && foco) toggle.focus();
  };
  menu.inert = true;
  /* Con el chat abierto, la «?» muestra «X» y lo cierra (antes que su propio clic, que abriría el menú) */
  toggle.addEventListener('click', () => { if (abierto() && !panel.classList.contains('is-saliendo')) { cerrar(); return; } setMenu(!abiertoMenu); });
  menu.addEventListener('click', (e) => { if (e.target.closest('a, button')) setMenu(false); });
  const dentro = (e, el) => e.composedPath().includes(el);
  d.addEventListener('pointerdown', (e) => { if (abiertoMenu && !dentro(e, dock)) setMenu(false); });
  d.addEventListener('keydown', (e) => { if (abiertoMenu && e.key === 'Escape') setMenu(false, { foco: true }); });
  addEventListener('resize', () => { if (abiertoMenu) medir(); });
  /* Aparece un instante después de cargar, para que se vea su entrada suave; aquí queda siempre a la vista */
  const entrar = () => setTimeout(() => dock.classList.add('is-visible'), 650);
  if (d.readyState === 'complete') entrar(); else addEventListener('load', entrar, { once: true });

  /* ---------- La ventana del chat (agente.js) ---------- */
  const abierto = () => !panel.hidden;
  let saliendo = 0;
  const marcarDock = (si) => {
    dock.classList.toggle('is-chat', si);
    toggle.setAttribute('aria-label', si ? 'Cerrar el asistente' : 'Ayuda y contacto');
    abrirChat.setAttribute('aria-expanded', String(si));
  };
  const abrir = () => {
    if (!CHAT || (abierto() && !panel.classList.contains('is-saliendo'))) return;
    clearTimeout(saliendo);
    setMenu(false);
    panel.classList.remove('is-saliendo');
    panel.hidden = false;
    marcarDock(true);
    empezar();
    if (!tactil.matches) (form.hidden ? charla.querySelector('input:not([type=checkbox])') || panel : campo).focus({ preventScroll: true });
  };
  function cerrar() {
    if (!abierto() || panel.classList.contains('is-saliendo')) return;
    const enVentana = panel.contains(raiz.activeElement);
    const fin = () => { panel.classList.remove('is-saliendo'); panel.hidden = true; };
    marcarDock(false);
    if (enVentana && !tactil.matches) toggle.focus({ preventScroll: true });
    clearTimeout(saliendo);
    if (motion.matches) { panel.classList.add('is-saliendo'); saliendo = setTimeout(fin, 200); } else fin();
  }
  abrirChat.addEventListener('click', abrir);
  raiz.addEventListener('keydown', (e) => { if (e.key === 'Escape' && abierto() && !e.defaultPrevented) { e.preventDefault(); cerrar(); } });
  /* «Volver»: cierra el chat y vuelve a mostrar las opciones de la burbuja */
  atras.addEventListener('click', () => { cerrar(); setMenu(true); });
  /* Desde el sitio: un enlace a #asistente (por ejemplo, un botón de Elementor) abre el chat */
  d.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href$="#asistente"], [data-amb-asistente]');
    if (!a) return;
    e.preventDefault();
    abrir();
  });
  window.ambAsistente = { abrir, cerrar, preguntar: (t) => { abrir(); preguntar(t); } };

  /* Teclado del teléfono: mientras se escribe, la ventana se apoya sobre el teclado y cabe en el área visible */
  const vv = window.visualViewport;
  if (vv) {
    const ajustar = () => {
      const abajo = vv.scale > 1.01 ? 0 : Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
      panel.style.setProperty('--vv-alto', `${Math.round(vv.height)}px`);
      panel.style.setProperty('--vv-abajo', `${abajo}px`);
      panel.classList.toggle('is-teclado', abajo > 80 && panel.contains(raiz.activeElement));
    };
    vv.addEventListener('resize', ajustar);
    vv.addEventListener('scroll', ajustar);
    panel.addEventListener('focusin', ajustar);
    panel.addEventListener('focusout', () => setTimeout(ajustar, 0));
    ajustar();
  }

  /* ---------- Sesión en esta pestaña ---------- */
  const guardar = (s) => {
    try {
      if (s) sessionStorage.setItem(CLAVE, JSON.stringify({ token: s.token, vence: s.vence, pendiente: s.pendiente }));
      else sessionStorage.removeItem(CLAVE);
    } catch { /* sin almacenamiento */ }
  };
  let sesion = (() => {
    try {
      const s = JSON.parse(sessionStorage.getItem(CLAVE));
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
  /* Cuántas consultas quedan: solo se dice cuando quedan pocas */
  const uso = (u) => {
    if (!u || !Number.isFinite(u.remaining) || !Number.isFinite(u.max)) return;
    sub.textContent = u.remaining <= 3 ? `Te ${u.remaining === 1 ? 'queda 1 consulta' : `quedan ${u.remaining} consultas`}` : '';
    sub.hidden = !sub.textContent;
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
    texto.replace(RE_NEGRITA, (todo, dentroN, i) => {
      partes.push(texto.slice(desde, i), h('strong', { text: dentroN }));
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
    const caja = h('div', { class: 'msg-texto is-bloques' });
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

  /* ---------- Cómo se muestra (agente-chat.js) ---------- */
  const abajo = () => charla.scrollTo({ top: charla.scrollHeight, behavior: suave() });
  const desde = (m) => charla.scrollTo({ top: (m.previousElementSibling || m).offsetTop - 12, behavior: suave() });
  const decirYo = (texto) => { charla.append(h('div', { class: 'msg is-user' }, h('p', { text: texto }))); abajo(); };
  const vencerOpciones = () => charla.querySelectorAll('[data-opcion]').forEach((b) => { b.disabled = true; });
  const decir = (r, { opciones = true } = {}) => {
    const m = h('div', { class: 'msg is-bot' });
    if (typeof r.text === 'string' && r.text) m.append(conBloques(r.text));
    const fuentes = (Array.isArray(r.sources) ? r.sources : []).filter((s) => s && typeof s.label === 'string' && s.label);
    if (fuentes.length) {
      m.append(h('div', { class: 'msg-fuentes' },
        h('p', { class: 'msg-chips-t', text: fuentes.length > 1 ? 'Fuentes' : 'Fuente' }),
        h('ul', {}, fuentes.map((s) => {
          const u = typeof s.url === 'string' ? segura(s.url) : null;
          return h('li', {}, icono(I.doc, { size: 14 }), u ? h('a', { href: u.href, target: '_blank', rel: 'noopener noreferrer', text: s.label }) : h('span', { text: s.label }));
        }))));
    }
    const lista = opciones && Array.isArray(r.options) ? r.options.filter((o) => o && typeof o.id === 'string' && typeof o.label === 'string' && o.label) : [];
    if (lista.length) {
      m.append(h('div', { class: 'msg-chips' }, lista.map((o) => h('button', {
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
    m.append(h('div', { class: 'msg-chips' }, botones.map(([rotulo, accion]) => h('button', { class: 'chip', type: 'button', text: rotulo, onclick: accion }))));
    abajo();
    return m;
  };
  const respuesta = (reply, usage) => {
    vencerOpciones();
    desde(decir(reply && typeof reply === 'object' ? reply : {}));
    uso(usage);
  };
  const espera = () => {
    const e = h('div', { class: 'msg is-bot is-espera', 'aria-hidden': 'true' }, h('span', {}), h('span', {}), h('span', {}));
    charla.append(e);
    abajo();
    return e;
  };
  const SIN_CONEXION = 'No pude conectarme con el asistente. Revisa tu conexión y vuelve a intentarlo en un rato.';
  const NO_DISPONIBLE = `El asistente en línea no está disponible por ahora.${WA || CONTACTO ? ' Puedes escribirnos por WhatsApp o desde la página de contacto.' : ''}`;

  /* ---------- Saludo con preguntas de ejemplo (como el de Transporte) ---------- */
  const saludar = () => {
    form.hidden = false;
    const m = h('div', { class: 'msg is-bot' },
      h('p', { class: 'msg-texto', text: 'Hola. ¿En qué te ayudo?' }),
      h('div', { class: 'msg-chips' }, h('p', { class: 'msg-chips-t', text: 'Puedes preguntar, por ejemplo' }),
        EJEMPLOS.map((t) => h('button', { class: 'chip', type: 'button', 'data-opcion': true, text: t, onclick: () => preguntar(t) }))));
    charla.append(m);
    return m;
  };

  /* Una pregunta (escrita o de ejemplo): con sesión se envía; sin ella, queda a la vista y se piden los datos */
  let preguntaPendiente = '';
  const preguntar = (texto) => {
    const t = String(texto || '').trim().slice(0, 240);
    if (!t || ocupado || !API) return;
    if (sesion) { enviar({ text: t }, t); return; }
    preguntaPendiente = t;
    const previa = charla.querySelector('[data-previa] p');
    if (previa) { previa.textContent = t; charla.querySelector('.agente-puerta input[name=name]')?.focus({ preventScroll: true }); return; }
    vencerOpciones();
    charla.append(h('div', { class: 'msg is-user', 'data-previa': true }, h('p', { text: t })));
    puerta();
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

  /* ---------- La puerta: nadie conversa sin dejar sus datos ---------- */
  const puerta = () => {
    form.hidden = true;
    const error = h('p', { class: 'agente-error', role: 'alert' });
    const humano = TURNSTILE ? h('div', { class: 'agente-humano' }) : null;
    const guardados = recordados();
    const fila = (name, rotulo, extra) => h('label', { class: 'agente-campo' }, h('span', { text: rotulo }), h('input', { name, required: true, value: datos[name] || guardados?.[name] || null, ...extra }));
    const olvidarDatos = h('button', {
      class: 'agente-olvidar', type: 'button', text: 'Olvidar mis datos en este dispositivo',
      onclick: () => {
        recordar(null);
        datos = {};
        recuerdo = false;
        ['name', 'email', 'phone'].forEach((n) => { f.elements[n].value = ''; });
        f.elements.remember.checked = false;
        olvidarDatos.replaceWith(h('p', { class: 'agente-nota', role: 'status', text: 'Listo: ya no recordamos tus datos en este dispositivo.' }));
      }
    });
    const f = h('form', { class: 'msg is-bot agente-puerta', novalidate: true },
      h('p', { class: 'msg-texto', text: preguntaPendiente ? 'Para responderte, escribe tu nombre, tu correo y tu teléfono.' : 'Hola. Para empezar, escribe tu nombre, tu correo y tu teléfono.' }),
      fila('name', 'Nombre', { type: 'text', autocomplete: 'name', maxlength: 150, enterkeyhint: 'next' }),
      fila('email', 'Correo', { type: 'email', autocomplete: 'email', inputmode: 'email', maxlength: 150, spellcheck: 'false', placeholder: 'nombre@empresa.cl', enterkeyhint: 'next' }),
      fila('phone', 'Teléfono', { type: 'tel', autocomplete: 'tel', inputmode: 'tel', maxlength: 20, placeholder: '+56 9 1234 5678', enterkeyhint: 'done' }),
      h('label', { class: 'agente-acepto' },
        h('input', { type: 'checkbox', name: 'privacy_accepted', checked: datos.privacy_accepted || null }),
        h('span', {}, 'Acepto las ', h('a', { href: LEGAL('condiciones-del-servicio'), target: '_blank', rel: 'noopener' }, 'condiciones del servicio'), ' y el ', h('a', { href: LEGAL('politica-de-privacidad'), target: '_blank', rel: 'noopener' }, 'aviso de privacidad'), '.')),
      h('label', { class: 'agente-acepto' },
        h('input', { type: 'checkbox', name: 'marketing_accepted', checked: datos.marketing_accepted || null }),
        h('span', { text: 'Acepto que Ambientalia me contacte por correo, teléfono o llamada para hacer seguimiento de mi consulta y ofrecerme sus servicios (opcional).' })),
      h('label', { class: 'agente-acepto' },
        h('input', { type: 'checkbox', name: 'remember', checked: (recuerdo ?? !!guardados) || null }),
        h('span', { text: `Recordar mi nombre, correo y teléfono en este dispositivo por ${RECUERDO_DIAS} días (opcional). No lo uses en un equipo compartido.` })),
      guardados ? olvidarDatos : null,
      h('div', { class: 'agente-trampa', 'aria-hidden': 'true' }, h('label', {}, 'No completes este campo ', h('input', { name: 'website', tabindex: '-1', autocomplete: 'off' }))),
      humano,
      error,
      h('button', { class: 'btn btn-primary btn-small', type: 'submit', text: preguntaPendiente ? 'Enviar mi pregunta' : 'Comenzar' }));
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
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (f.classList.contains('is-enviando')) return;
      datos = { name: f.elements.name.value.trim(), email: f.elements.email.value.trim(), phone: f.elements.phone.value.trim(), privacy_accepted: f.elements.privacy_accepted.checked, marketing_accepted: f.elements.marketing_accepted.checked };
      recuerdo = f.elements.remember.checked;
      error.textContent = '';
      const falta = datos.name.length < 2 ? ['name', 'Escribe tu nombre.']
        : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.email) ? ['email', 'Escribe un correo válido.']
        : (datos.phone.replace(/\D/g, '').length < 8 || datos.phone.replace(/\D/g, '').length > 15) ? ['phone', 'Escribe un teléfono con entre 8 y 15 números.']
        : !datos.privacy_accepted ? ['privacy_accepted', 'Para conversar, acepta las condiciones y el aviso de privacidad.'] : null;
      if (falta) { error.textContent = falta[1]; f.elements[falta[0]].focus(); return; }
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
        const p = preguntaPendiente;
        preguntaPendiente = '';
        charla.querySelector('[data-previa]')?.removeAttribute('data-previa');
        if (p) {
          /* El saludo sin su menú, y la pregunta que ya estaba escrita, sin repetirla */
          if (json.reply && typeof json.reply.text === 'string' && json.reply.text) decir({ text: json.reply.text }, { opciones: false });
          uso(json.usage);
          enviar({ text: p });
        } else {
          respuesta(json.reply, json.usage);
          if (!tactil.matches) campo.focus({ preventScroll: true });
        }
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
    desde(charla.querySelector('[data-previa]') || f);
    if (!tactil.matches) setTimeout(() => f.querySelector('input:not([value])')?.focus({ preventScroll: true }), 60);
  };

  /* Sin sesión: lo local se olvida */
  let ocupado = false;
  let pendiente = null;  // { id, cuerpo, visible, auto, manuales, nota }
  const olvidar = () => { sesion = null; guardar(null); pendiente = null; if (API) { sub.textContent = ''; sub.hidden = true; } salir.hidden = true; };
  const vencida = (texto) => {
    olvidar();
    datos = { name: datos.name, email: datos.email, phone: datos.phone };
    aviso('Tu sesión terminó. Vuelve a escribir tus datos para seguir.');
    if (texto) preguntaPendiente = texto;
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
  /* «visible» es lo que se ve como mensaje propio; sin él (reiniciar o una pregunta ya a la vista) no se repite */
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
    if (pendiente !== p) return;
    const { estado, json } = r;
    if (estado === 200 && json.reply && typeof json.reply === 'object') { pendiente = null; guardarPendiente(); respuesta(json.reply, json.usage); return; }
    if (estado === 200 && json.duplicate) { pendiente = null; guardarPendiente(); uso(json.usage); aviso('Ese mensaje ya lo había recibido. Sigue cuando quieras.'); return; }
    if (estado === 401) { pendiente = null; vencida(p.cuerpo.text); return; }
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
      : estado === 429 ? (json.error && typeof json.message === 'string' && json.message) || 'Enviaste muchos mensajes seguidos. Espera un momento y vuelve a intentarlo.'
      : (json.error === 'unavailable' && typeof json.message === 'string' && json.message) || 'No pude responder en este momento. Vuelve a intentarlo en un rato.';
    if (p.manuales >= REINTENTOS) {
      pendiente = null;
      guardarPendiente();
      aviso(`No pude responder este mensaje. Escríbelo de nuevo más tarde${WA ? ' o escríbenos por WhatsApp' : ''}.`);
      return;
    }
    p.nota = avisoCon(texto, [['Reintentar', reintentar]]);
  };
  const reiniciar = () => enviar({ text: 'inicio' });  // comando del asistente: vuelve al menú (no gasta consultas)

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
    if (!mensajes.length && !recuperable) { reiniciar(); return; }
    const ultimo = mensajes[mensajes.length - 1];
    mensajes.forEach((m) => (m.role === 'user' ? charla.append(h('div', { class: 'msg is-user' }, h('p', { text: m.text }))) : decir(m, { opciones: m === ultimo })));
    if (recuperable) {
      pendiente = { ...guardado, auto: 0, manuales: 0, nota: null };
      if (pendiente.visible && !mensajes.some((m) => m.role === 'user' && m.text === pendiente.visible)) decirYo(pendiente.visible);
      pendiente.nota = avisoCon('Quedó un envío sin respuesta confirmada. Puedes reintentarlo sin duplicarlo.', [['Reintentar', reintentar]]);
    } else if (ultimo?.role === 'user') {
      avisoCon('Tu último mensaje todavía no tiene respuesta.', [['Actualizar', () => { if (ocupado) return; charla.textContent = ''; retomar(); }]]);
    }
    charla.scrollTo({ top: charla.scrollHeight });
  };
  let empezado = false;
  const empezar = () => {
    if (empezado) return;
    empezado = true;
    if (!API) { form.hidden = true; aviso(NO_DISPONIBLE); return; }
    if (sesion) retomar(); else saludar();
  };

  /* «Empezar una conversación nueva»: con sesión, el menú del asistente (comando «inicio»); sin ella, el saludo */
  nuevo.addEventListener('click', () => {
    if (ocupado || !API) return;
    pendiente = null;
    guardarPendiente();
    confirmacion = null;
    preguntaPendiente = '';
    charla.textContent = '';
    if (!sesion) { saludar(); return; }
    form.hidden = false;
    reiniciar();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = campo.value.trim();
    if (!q || ocupado) return;
    campo.value = '';
    preguntar(q);
  });

  /* ---------- Borrar esta conversación (DELETE /session) ---------- */
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
    const fin = (texto) => { nota.remove(); confirmacion = null; olvidar(); recordar(null); datos = {}; recuerdo = null; charla.textContent = ''; aviso(texto); saludar(); };
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
