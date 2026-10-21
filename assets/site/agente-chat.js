/* Agente conectado al asistente de Transporte Autorizado (prueba local, 15-10-2026).
   Usa la misma burbuja, la misma ventana y los mismos estilos que la maqueta (agente.js, agente.css), pero las
   respuestas las da el servicio del asistente. Su dirección va en la ventana: `data-agente-api`, o
   `data-agente-api-local`, que solo vale cuando el sitio corre en este computador. Sin dirección no hace nada y
   responde la maqueta, que se carga junto a este archivo: así el sitio publicado sigue con la maqueta mientras el
   servicio no tenga una dirección pública. `?agente=maqueta` fuerza la maqueta en local.
   - Antes de conversar se piden nombre, correo y teléfono, y la aceptación del aviso de privacidad: así lo exige el
     servicio, que entrega a cambio una sesión. La sesión se guarda en esta pestaña y la conversación se recupera al volver.
   - Cada turno va y vuelve en una sola llamada. La respuesta llega como texto plano y se muestra como texto, nunca como
     HTML; las direcciones del texto y las fuentes pasan a enlaces, y lo marcado con **…** se ve en negrita.
   - Un enlace a este sitio se muestra en el sitio, como en la maqueta: las vistas del hero se abren con HERO.show, la
     «Ayuda» con su ancla y las secciones se recorren hasta su lugar. En agente-virtual.html, en el sitio de atrás.
   - Las fotos se reducen en el navegador a 1600 px en JPEG antes de subirlas (pesan menos y no llevan la ubicación).
   - Contra bots, la puerta lleva el campo trampa («website», que una persona no ve) y, si la ventana trae
     `data-turnstile` (la clave pública del widget de Cloudflare Turnstile), el token del widget, que sirve una vez.
   Sin lookbehind en las expresiones regulares (Safari < 16.4). */
(() => {
  const d = document;
  const panel = d.querySelector('[data-agente]');
  if (!panel) return;
  const enLocal = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get('agente') !== 'maqueta';
  const API = (panel.dataset.agenteApi || (enLocal ? panel.dataset.agenteApiLocal : '') || '').replace(/\/+$/, '');
  if (!API) return;
  const marco = d.querySelector('[data-agente-sitio]');  // solo en agente-virtual.html: el sitio va detrás, en un <iframe>
  const boton = d.querySelector('[data-agente-abrir]');
  const charla = panel.querySelector('[data-agente-charla]');
  const form = panel.querySelector('[data-agente-form]');
  const campo = form.elements.q;
  const tactil = matchMedia('(pointer: coarse)');
  const motion = matchMedia('(prefers-reduced-motion: no-preference)');
  const suave = () => (motion.matches ? 'smooth' : 'auto');
  const PRINCIPAL = 'transporte-autorizado.html';
  const OFICIAL = 'https://transporteautorizado.cl';
  const BASE = new URL(window.SITE_ROOT || '.', location.href).href;
  const CLAVE = 'agente-chat';
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

  /* Crea un elemento. Lo que viene del servicio siempre entra como texto (nunca como HTML) */
  const h = (tag, props, ...hijos) => {
    const el = d.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'icono') el.innerHTML = v;  // solo íconos escritos en este archivo
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    hijos.flat().forEach((x) => { if (x != null && x !== false) el.append(x); });
    return el;
  };
  const svg = (path) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  const I = {
    doc: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
    foto: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4.5 17l4.5-4.5 3.5 3.5 2.5-2.5 4.5 4.5"/>')
  };

  /* La cabecera y el pie dicen lo que hace esta versión (la maqueta dice que solo muestra lo publicado) */
  const sub = panel.querySelector('.agente-quien p');
  const ROTULO = 'Abrir el asistente de Transporte Autorizado';
  panel.querySelector('#agente-titulo').firstChild.textContent = 'Asistente ';
  panel.querySelector('.agente-tag').textContent = 'Prueba local';
  sub.textContent = 'Conectado al asistente';
  const pie = panel.querySelector('.agente-pie');
  pie.textContent = 'Orientación general con su fuente: no reemplaza la revisión técnica ni legal de cada caso. ';
  boton.setAttribute('aria-label', ROTULO);

  /* ---------- Sesión ---------- */
  const leer = () => { try { return JSON.parse(sessionStorage.getItem(CLAVE)) || null; } catch { return null; } };
  const guardar = (s) => { try { if (s) sessionStorage.setItem(CLAVE, JSON.stringify(s)); else sessionStorage.removeItem(CLAVE); } catch { /* sin almacenamiento: dura lo que la página */ } };
  let sesion = leer();
  if (sesion && Date.parse(sesion.vence) < Date.now()) { sesion = null; guardar(null); }
  let datos = {};  // lo escrito en la puerta, para no volver a pedirlo en esta página (solo en memoria)

  const idMensaje = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const llamar = async (ruta, { method = 'GET', body } = {}) => {
    const headers = { Accept: 'application/json' };
    if (sesion?.token) headers.Authorization = `Bearer ${sesion.token}`;
    if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const r = await fetch(`${API}/api/chat${ruta}`, { method, headers, body: body && !(body instanceof FormData) ? JSON.stringify(body) : body });
    return { estado: r.status, json: await r.json().catch(() => ({})) };
  };
  const uso = (u) => { if (u) sub.textContent = `Conectado al asistente · ${u.remaining} de ${u.max} consultas`; };

  /* ---------- Enlaces: lo que es de este sitio se muestra aquí ---------- */
  const lugar = (href) => {
    let u;
    try { u = new URL(href); } catch { return null; }
    if (u.origin !== OFICIAL || location.origin === OFICIAL) return null;
    const pagina = u.pathname.replace(/^\/+/, '') || PRINCIPAL;
    return /\.html$/.test(pagina) ? { pagina, hash: u.hash } : null;
  };
  const enlace = (href, rotulo) => {
    const f = lugar(href);
    const otra = !f || (!marco && f.pagina !== enSitio());
    return h('a', {
      href: f ? new URL(f.pagina + f.hash, BASE).href : href, target: otra ? '_blank' : null, rel: otra ? 'noopener noreferrer' : null,
      onclick: (e) => { if (otra || e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); mostrar(f); }
    }, rotulo);
  };
  /* Texto con direcciones: el texto como texto y cada dirección como enlace (sin el punto final de la frase) */
  const RE_URL = /https?:\/\/[^\s<>"«»]+/g;
  const conEnlaces = (texto) => {
    const partes = [];
    let desde = 0;
    texto.replace(RE_URL, (url, i) => {
      const limpia = url.replace(/[.,;:!?)\]]+$/, '');
      partes.push(texto.slice(desde, i), enlace(limpia, limpia));
      desde = i + limpia.length;
      return url;
    });
    partes.push(texto.slice(desde));
    return partes.filter((x) => x !== '');
  };
  /* Negritas: **así** se ve en negrita. Se arma con elementos y su texto, nunca como HTML */
  const RE_NEGRITA = /\*\*([^*\n]+?)\*\*/g;
  const conFormato = (texto) => {
    const partes = [];
    let desde = 0;
    texto.replace(RE_NEGRITA, (todo, dentro, i) => {
      partes.push(...conEnlaces(texto.slice(desde, i)), h('strong', {}, conEnlaces(dentro)));
      desde = i + todo.length;
      return todo;
    });
    partes.push(...conEnlaces(texto.slice(desde)));
    return partes;
  };

  /* ---------- Cómo se muestra ---------- */
  const abajo = () => charla.scrollTo({ top: charla.scrollHeight, behavior: suave() });
  const desde = (m) => charla.scrollTo({ top: (m.previousElementSibling || m).offsetTop - 12, behavior: suave() });  // desde la pregunta que la originó
  const decirYo = (texto) => { charla.append(h('div', { class: 'msg is-user' }, h('p', { text: texto }))); abajo(); };
  const decir = (r) => {
    const m = h('div', { class: 'msg is-bot' });
    if (r.text) m.append(h('p', { class: 'msg-texto' }, conFormato(r.text)));
    if (r.sources?.length) {
      m.append(h('div', { class: 'msg-fuentes' },
        h('p', { class: 'msg-chips-t', text: r.sources.length > 1 ? 'Fuentes' : 'Fuente' }),
        h('ul', {}, r.sources.map((s) => h('li', {}, h('span', { icono: I.doc }), s.url ? enlace(s.url, s.label) : h('span', { text: s.label }))))));
    }
    if (r.options?.length) {
      m.append(h('div', { class: 'msg-chips' }, r.options.map((o) => h('button', { class: 'chip', type: 'button', text: o.label, title: o.description || null, onclick: () => enviar({ option_id: o.id }, o.label) }))));
    }
    charla.append(m);
    return m;
  };
  const aviso = (texto) => { const m = decir({ text: texto }); abajo(); return m; };
  const espera = () => {
    const e = h('div', { class: 'msg is-bot is-espera', 'aria-hidden': 'true' }, h('span', {}), h('span', {}), h('span', {}));
    charla.append(e);
    abajo();
    return e;
  };
  const fallo = (estado, json) => {
    if (estado === 401) { olvidar(); aviso('Tu sesión terminó. Vuelve a escribir tus datos para seguir.'); puerta(); return; }
    const texto = {
      409: 'Todavía estoy respondiendo tu mensaje anterior. Espera un momento.',
      429: 'Enviaste muchos mensajes seguidos. Espera un momento y vuelve a intentarlo.'
    }[estado] || json.message || Object.values(json.errors || {}).flat().join('\n') || 'No pude responder en este momento. Vuelve a intentarlo.';
    aviso(texto);
  };

  /* Turnstile: un solo script para la página, aunque lo pidan el chat y el formulario de cotización (transporte-ui.js) */
  const TURNSTILE = panel.dataset.turnstile;
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
    const fila = (name, rotulo, extra) => h('label', { class: 'agente-campo' }, h('span', { text: rotulo }), h('input', { name, required: true, value: datos[name] || null, ...extra }));
    const f = h('form', { class: 'msg is-bot agente-puerta', novalidate: true },
      h('p', { class: 'msg-texto', text: 'Hola. Para empezar, escribe tu nombre, tu correo y tu teléfono.' }),
      fila('name', 'Nombre', { type: 'text', autocomplete: 'name', maxlength: 150 }),
      fila('email', 'Correo', { type: 'email', autocomplete: 'email', maxlength: 150, spellcheck: 'false', placeholder: 'nombre@empresa.cl' }),
      fila('phone', 'Teléfono', { type: 'tel', autocomplete: 'tel', maxlength: 20, placeholder: '+56 9 1234 5678' }),
      h('label', { class: 'agente-acepto' },
        h('input', { type: 'checkbox', name: 'privacy_accepted', checked: datos.privacy_accepted || null }),
        h('span', {}, 'Acepto las ', h('a', { href: `${API}/condiciones-del-servicio`, target: '_blank', rel: 'noopener noreferrer' }, 'condiciones del servicio'), ' y el ', h('a', { href: `${API}/politica-de-privacidad`, target: '_blank', rel: 'noopener noreferrer' }, 'aviso de privacidad'), '.')),
      /* Opcional y sin marcar: no condiciona el chat (el texto es el de chatbot.privacy.marketing.label del asistente) */
      h('label', { class: 'agente-acepto' },
        h('input', { type: 'checkbox', name: 'marketing_accepted', checked: datos.marketing_accepted || null }),
        h('span', { text: 'Acepto que Transporte Autorizado me contacte por correo, teléfono o llamada para hacer seguimiento de mi consulta o cotización y ofrecerme sus servicios (opcional).' })),
      h('div', { class: 'agente-trampa', 'aria-hidden': 'true' }, h('label', {}, 'No completes este campo ', h('input', { name: 'website', tabindex: '-1', autocomplete: 'off' }))),
      humano,
      error,
      h('button', { class: 'btn btn-primary btn-small', type: 'submit', text: 'Comenzar' }));
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
      error.textContent = '';
      if (humano && !token) { error.textContent = 'Estamos comprobando que eres una persona. Espera un momento y vuelve a intentarlo.'; return; }
      f.classList.add('is-enviando');
      try {
        const { estado, json } = await llamar('/sessions', { method: 'POST', body: { ...datos, website: f.elements.website.value, ...(humano ? { 'cf-turnstile-response': token } : {}) } });
        if (estado === 201) {
          if (widget !== null) window.turnstile?.remove(widget);
          sesion = { token: json.token, vence: json.expires_at };
          guardar(sesion);
          salir.hidden = false;
          f.remove();
          form.hidden = false;
          desde(decir(json.reply));
          uso(json.usage);
          if (!tactil.matches) campo.focus({ preventScroll: true });
          return;
        }
        /* Con «error», el mensaje es del asistente (p. ej., el tope de todo el servicio); el 429 genérico es por IP */
        error.textContent = estado === 429 && !json.error ? 'Hubo muchos intentos desde esta conexión. Espera un momento.' : Object.values(json.errors || {}).flat().join('\n') || json.message || 'No pude abrir el chat. Vuelve a intentarlo.';
      } catch {
        error.textContent = 'No pude conectarme con el asistente. Vuelve a intentarlo en un rato.';
      } finally {
        f.classList.remove('is-enviando');
        /* El token sirve una vez: si no se abrió la sesión, el widget entrega otro */
        if (widget !== null && f.isConnected) { token = ''; window.turnstile?.reset(widget); }
      }
    });
    charla.append(f);
    abajo();
    if (!tactil.matches) f.querySelector('input:not([value])')?.focus({ preventScroll: true });
  };
  const salir = h('button', { class: 'agente-salir', type: 'button', text: 'Cambiar mis datos' });
  const olvidar = () => { sesion = null; guardar(null); sub.textContent = 'Conectado al asistente'; salir.hidden = true; };

  /* ---------- Turnos ---------- */
  let ocupado = false;
  /* «visible» es lo que se ve como mensaje propio; sin él (reiniciar) el turno no se muestra */
  const enviar = async (cuerpo, visible) => {
    if (ocupado || !sesion) return;
    ocupado = true;
    if (visible) decirYo(visible);
    const e = espera();
    try {
      const { estado, json } = await llamar('/messages', { method: 'POST', body: { ...cuerpo, client_message_id: idMensaje() } });
      e.remove();
      if (estado === 200 && json.reply) { desde(decir(json.reply)); uso(json.usage); } else if (!json.duplicate) fallo(estado, json);
    } catch {
      e.remove();
      aviso('No pude conectarme con el asistente. Vuelve a intentarlo en un rato.');
    } finally {
      ocupado = false;
    }
  };
  const reiniciar = () => enviar({ text: 'inicio' });

  /* Al volver a abrir con una sesión viva: la conversación tal como quedó (solo los textos) */
  const retomar = async () => {
    const e = espera();
    try {
      const { estado, json } = await llamar('/history');
      e.remove();
      if (estado !== 200) { fallo(estado, json); return; }
      form.hidden = false;
      if (!json.messages?.length) { reiniciar(); return; }
      json.messages.forEach((m) => (m.role === 'user' ? decirYo(m.text) : decir({ text: m.text })));
      charla.append(h('div', { class: 'msg is-bot' }, h('div', { class: 'msg-chips' }, h('button', { class: 'chip', type: 'button', text: 'Ver las opciones', onclick: reiniciar }))));
      abajo();
    } catch {
      e.remove();
      aviso('No pude conectarme con el asistente. Cierra la ventana y vuelve a abrirla en un rato.');
    }
  };
  let empezado = false;
  const empezar = () => {
    if (empezado) return;
    empezado = true;
    if (sesion) retomar(); else puerta();
  };

  /* ---------- Fotos ---------- */
  const reducir = async (archivo) => {
    try {
      const img = await createImageBitmap(archivo);
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const lienzo = h('canvas', { width: Math.round(img.width * k), height: Math.round(img.height * k) });
      lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
      img.close?.();
      const blob = await new Promise((ok) => lienzo.toBlob(ok, 'image/jpeg', 0.85));
      return blob ? new File([blob], `${archivo.name.replace(/\.[^.]+$/, '') || 'foto'}.jpg`, { type: 'image/jpeg' }) : archivo;
    } catch {
      return archivo;  // si el navegador no la puede leer, va tal cual y el servicio decide
    }
  };
  const elegir = h('input', { type: 'file', accept: 'image/*', hidden: true });
  const adjuntar = h('button', { class: 'agente-adjuntar', type: 'button', 'aria-label': 'Adjuntar una foto del residuo', title: 'Adjuntar una foto', icono: I.foto, onclick: () => elegir.click() });
  form.insertBefore(adjuntar, form.querySelector('button[type="submit"]'));
  form.append(elegir);
  elegir.addEventListener('change', async () => {
    const archivo = elegir.files[0];
    elegir.value = '';
    if (!archivo || ocupado || !sesion) return;
    ocupado = true;
    decirYo(`Foto: ${archivo.name}`);
    const e = espera();
    try {
      const cuerpo = new FormData();
      cuerpo.append('image', await reducir(archivo));
      const { estado, json } = await llamar('/attachments', { method: 'POST', body: cuerpo });
      e.remove();
      if (estado === 201) { desde(decir(json.reply)); uso(json.usage); } else fallo(estado, json);
    } catch {
      e.remove();
      aviso('No pude subir la foto. Vuelve a intentarlo.');
    } finally {
      ocupado = false;
    }
  });

  /* ---------- El sitio: la propia página o, en agente-virtual.html, la que se ve detrás ---------- */
  const ventana = () => (marco ? marco.contentWindow : window);
  function enSitio() { try { return ventana().location.href.slice(BASE.length).split(/[?#]/)[0]; } catch { return null; } }
  const ir = (url) => new Promise((ok) => {
    const fin = () => { marco.removeEventListener('load', fin); ok(); };
    marco.addEventListener('load', fin);
    setTimeout(fin, 6000);
    marco.contentWindow.location.href = url;
  });
  const VISTAS = ['cotizar', 'buscar', 'especialista', 'asistente'];
  const AYUDA = ['ayuda', 'documentos', 'normativa', 'checklist'];
  /* Lleva al lugar del sitio que nombra la respuesta: una vista del hero, la «Ayuda» o una sección */
  async function mostrar(f) {
    const actual = enSitio();
    const url = new URL(f.pagina + f.hash, BASE).href;
    if (actual === null || (!marco && actual !== f.pagina)) { open(url, '_blank', 'noopener'); return; }
    cerrar();
    if (actual !== f.pagina) { await ir(url); return; }  // la otra página abre sola su ancla al cargar
    const win = ventana();
    const id = f.hash.slice(1);
    if (VISTAS.includes(id) && win.HERO) { win.HERO.show(id, { from: 'dock' }); return; }  // donde está la persona, como desde la «?»
    const el = id && !AYUDA.includes(id) && win.document.getElementById(id);
    if (!el) { if (id) win.location.hash = f.hash; return; }
    await pausa(60);
    el.scrollIntoView({ behavior: suave(), block: 'start' });
  }

  /* ---------- Burbuja y ventana ---------- */
  const abierto = () => !panel.hidden;
  let saliendo = 0;
  const abrir = () => {
    if (abierto() && !panel.classList.contains('is-saliendo')) return;
    clearTimeout(saliendo);
    panel.classList.remove('is-saliendo');
    panel.hidden = false;
    boton.classList.add('is-abierto');
    boton.classList.remove('is-aparte');
    boton.setAttribute('aria-expanded', 'true');
    boton.setAttribute('aria-label', 'Cerrar el asistente');
    empezar();
    if (!tactil.matches && !form.hidden) campo.focus({ preventScroll: true });
  };
  function cerrar() {
    if (!abierto() || panel.classList.contains('is-saliendo')) return;
    const dentro = panel.contains(d.activeElement);
    const fin = () => { panel.classList.remove('is-saliendo'); panel.hidden = true; seguir(); };
    boton.classList.remove('is-abierto');
    boton.setAttribute('aria-expanded', 'false');
    boton.setAttribute('aria-label', ROTULO);
    if (dentro && !tactil.matches) boton.focus({ preventScroll: true });
    clearTimeout(saliendo);
    if (motion.matches) { panel.classList.add('is-saliendo'); saliendo = setTimeout(fin, 200); } else fin();
  }
  boton.addEventListener('click', () => (abierto() && !panel.classList.contains('is-saliendo') ? cerrar() : abrir()));
  d.addEventListener('keydown', (e) => { if (e.key === 'Escape' && abierto() && !e.defaultPrevented && (panel.contains(d.activeElement) || d.activeElement === boton)) { e.preventDefault(); cerrar(); } });
  panel.querySelector('[data-agente-cerrar]').addEventListener('click', cerrar);
  /* «Empezar una conversación nueva»: la misma sesión, desde el menú */
  panel.querySelector('[data-agente-nuevo]').addEventListener('click', () => {
    if (ocupado) return;
    if (!sesion) { charla.textContent = ''; puerta(); return; }
    charla.textContent = '';
    form.hidden = false;
    reiniciar();
  });
  /* Para probar con otra persona: olvida la sesión de esta pestaña y vuelve a la puerta */
  pie.append(salir);
  salir.hidden = !sesion;
  salir.addEventListener('click', () => { if (ocupado) return; olvidar(); charla.textContent = ''; puerta(); });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = campo.value.trim();
    if (!q || ocupado) return;
    campo.value = '';
    enviar({ text: q }, q);
  });

  /* Cuándo se ve la burbuja. En la página aparece y se oculta junto con la «?» del sitio (al pasar el hero, no sobre
     el pie ni con el menú abierto): así la primera pantalla queda como está. Con la ventana abierta no se oculta. */
  const dock = marco ? null : d.querySelector('[data-dock]');
  function seguir() { if (dock) boton.classList.toggle('is-aparte', !dock.classList.contains('is-visible') && !abierto()); }
  if (dock) new MutationObserver(seguir).observe(dock, { attributes: true, attributeFilter: ['class'] });
  seguir();
  /* En agente-virtual.html: la página de atrás trae su propia burbuja (manda la de adelante), y la burbuja se aparta
     cuando esa página abre una ventana o una hoja, para no tapar sus botones */
  const vigilar = () => {
    let doc;
    try { doc = marco.contentDocument; } catch { return; }
    if (!doc?.head) return;
    doc.head.append(Object.assign(doc.createElement('style'), { textContent: '.agente,.agente-burbuja{display:none!important}' }));
    const ver = () => boton.classList.toggle('is-aparte', !abierto() && (!!doc.querySelector('dialog[open]') || doc.documentElement.classList.contains('sheet-open')));
    new MutationObserver(ver).observe(doc.documentElement, { attributes: true, subtree: true, attributeFilter: ['open', 'class'] });
    ver();
  };
  marco?.addEventListener('load', vigilar);
  if (marco?.contentDocument?.readyState === 'complete') vigilar();

  /* Teclado del teléfono: mientras se escribe, la ventana se apoya sobre el teclado y cabe en el área visible */
  const vv = window.visualViewport;
  if (vv) {
    const ajustar = () => {
      const bajo = vv.scale > 1.01 ? 0 : Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
      panel.style.setProperty('--vv-alto', `${Math.round(vv.height)}px`);
      panel.style.setProperty('--vv-abajo', `${bajo}px`);
      panel.classList.toggle('is-teclado', bajo > 80 && panel.contains(d.activeElement));
    };
    vv.addEventListener('resize', ajustar);
    vv.addEventListener('scroll', ajustar);
    panel.addEventListener('focusin', ajustar);
    panel.addEventListener('focusout', () => setTimeout(ajustar, 0));
    ajustar();
  }

  window.AGENTE = { abrir, cerrar, enviar: (texto) => enviar({ text: texto }, texto), get sesion() { return !!sesion; } };
})();
