/* Agente conectado al asistente de Transporte Autorizado (servicio Laravel, repositorio aparte; prueba local del
   15-10-2026, completado el 20-10-2026). Usa la misma burbuja, la misma ventana y los mismos estilos que la maqueta
   (agente.js, agente.css), pero las respuestas las da el asistente por su API (/api/chat/*), que el navegador llama
   directo, sin pasar por WordPress.
   - Dirección: la misma de las cotizaciones, de window.SITE.asistente (site.js): la del plugin en WordPress
     (window.TA_API.asistente), la de `data-agente-api` o, en este computador, `?asistente=…`. Sin dirección, en las
     vistas previas (sin WordPress) responde la maqueta, que se carga junto a este archivo; sobre WordPress la ventana
     dice que el asistente no está disponible y no llama a nada. `?agente=maqueta` fuerza la maqueta en local. La
     misma condición está en agente.js.
   - Antes de conversar se piden nombre, correo y teléfono, y la aceptación de las condiciones y el aviso de privacidad:
     así lo exige el servicio, que entrega a cambio una sesión. La pestaña conserva el token, su vencimiento, el contador
     de fotos y el envío sin respuesta confirmada; el historial se recupera del servicio al volver (GET /history).
   - «Recordar mis datos en este dispositivo» (casilla opcional y sin marcar): guarda en localStorage solo el nombre, el
     correo y el teléfono, durante 30 días desde el último uso, para precargar la puerta. Nunca el token, las casillas
     de aceptación ni nada de la conversación: cada sesión pide su propia aceptación. «Olvidar mis datos en este
     dispositivo» y «Borrar esta conversación» los quitan.
   - Cada mensaje lleva su identificador (client_message_id) y lo conserva en cada reintento: si el servicio ya lo
     procesó, devuelve la misma respuesta sin ejecutarlo otra vez. Si la espera se agota (`data-agente-espera`, en
     segundos; 90 por omisión; o un 504 del proxy) o el servicio responde «ocupado» (409 busy), se reintenta solo dos
     veces; lo demás espera a que la persona toque «Reintentar» (hasta tres veces). Un 409 idempotency_conflict no se
     reintenta.
   - La respuesta llega como texto plano y se muestra como texto, nunca como HTML: las direcciones del texto no pasan a
     enlaces y lo marcado con **…** se ve en negrita. Los enlaces salen solo de las fuentes (reply.sources), con https
     y un destino conocido (este sitio, Ley Chile y BCN, y los dominios del Estado, .gob.cl); si no, la fuente se
     muestra sin enlace.
   - Un enlace a este sitio se muestra en el sitio, como en la maqueta: las vistas del hero se abren con HERO.show, la
     «Ayuda» con su ancla y las secciones se recorren hasta su lugar. En agente-virtual.html, en el sitio de atrás.
   - Fotos: los topes y formatos se consultan en GET /config antes de subir. Se reducen en el navegador a 1600 px
     antes de subirlas, así pesan menos y no llevan la ubicación ni otros datos de la cámara; si no se pueden convertir,
     no se suben. También se pueden pegar o soltar en la ventana, y esas no llegan al formulario de cotización.
   - «Borrar esta conversación» pide confirmación y llama a DELETE /session: solo dice que se borró si el servicio lo
     confirma.
   - Contra bots, la puerta lleva el campo trampa («website», que una persona no ve) y, si hay clave pública de
     Cloudflare Turnstile (la del plugin o `data-turnstile`), el token del widget, que sirve una vez.
   Sin lookbehind en las expresiones regulares (Safari < 16.4). */
(() => {
  const d = document;
  const panel = d.querySelector('[data-agente]');
  if (!panel) return;
  const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const maqueta = LOCAL && new URLSearchParams(location.search).get('agente') === 'maqueta';
  const API = maqueta ? '' : window.SITE?.asistente?.(panel.dataset.agenteApi) || '';
  if (!API && (maqueta || !window.TA_API)) return;  // responde la maqueta (agente.js)
  const marco = d.querySelector('[data-agente-sitio]');  // solo en agente-virtual.html: el sitio va detrás, en un <iframe>
  const boton = d.querySelector('[data-agente-abrir]');
  /* Condiciones, privacidad y borrado: las copias del sitio (legal/, tools/legal.py), con el texto que publica el asistente */
  const LEGAL = (slug) => `${window.SITE_ROOT || ''}legal/${slug}.html`;
  /* El chat se abre desde «Chat con IA», dentro de la «?» del sitio; en agente-virtual.html, desde su burbuja propia */
  const enDock = boton.closest('[data-dock]');
  const toggleDock = enDock?.querySelector('.dock-toggle');
  const volver = toggleDock || boton;  // al cerrar, el foco vuelve aquí (la opción queda dentro del menú cerrado)
  const marcarDock = (si) => {
    enDock.classList.toggle('is-chat', si);
    toggleDock.setAttribute('aria-label', si ? 'Cerrar el asistente' : 'Ayuda y contacto');
    enDock.dispatchEvent(new Event('dock:refrescar'));
  };
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
  const CLAVE_DATOS = 'agente-chat-datos';  // lo que la persona pidió recordar (localStorage), aparte de la sesión
  const RECUERDO_DIAS = 30;                 // desde la última vez que abrió el chat con la casilla marcada
  const ESPERA = Math.max(5, Number(panel.dataset.agenteEspera) || 90) * 1000;  // una respuesta del modelo
  const AUTO = 2;        // reintentos solos de un mensaje: tras una espera agotada o «ocupado»
  const REINTENTOS = 3;  // reintentos que puede pedir la persona con «Reintentar»
  const FOTO_ENTRADA = 25 * 1024 * 1024;  // la original, antes de reducirla
  const TIPOS = ['image/jpeg', 'image/png', 'image/webp'];
  const FORMATOS = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  let limitesFotos = null;
  /* Destinos de las fuentes que pasan a enlace (además de este sitio): las del corpus del asistente y el Estado */
  const FUENTES = ['transporteautorizado.cl', 'bcn.cl', 'leychile.cl'];
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
    guardar: svg('<path d="m5 12 4 4L19 6"/>'),
    foto: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4.5 17l4.5-4.5 3.5 3.5 2.5-2.5 4.5 4.5"/>')
  };

  /* Cabecera limpia: «Asistente»; debajo solo se dice algo si no está disponible (y «Prueba local» en este computador) */
  const sub = panel.querySelector('.agente-quien p');
  const ROTULO = 'Abrir el asistente de Transporte Autorizado';
  panel.querySelector('#agente-titulo').firstChild.textContent = 'Asistente ';
  const tag = panel.querySelector('.agente-tag');
  if (tag && LOCAL) { tag.textContent = 'Prueba local'; tag.hidden = false; } else tag?.remove();
  if (sub) { sub.textContent = API ? '' : 'No disponible por ahora'; sub.hidden = Boolean(API); }
  /* El pie ya no lleva texto: solo «Borrar mis datos» cuando hay una sesión (se agrega más abajo) */
  const pie = panel.querySelector('.agente-pie') || Object.assign(d.createElement('p'), { className: 'agente-pie' });
  if (!pie.isConnected) panel.querySelector('.agente-panel').append(pie);
  if (!enDock) boton.setAttribute('aria-label', ROTULO);  // en la «?» se lee su texto, «Chat con IA»

  /* ---------- Sesión ---------- */
  const leer = () => { try { return JSON.parse(sessionStorage.getItem(CLAVE)) || null; } catch { return null; } };
  const guardar = (s) => { try { if (s) sessionStorage.setItem(CLAVE, JSON.stringify(s)); else sessionStorage.removeItem(CLAVE); } catch { /* sin almacenamiento: dura lo que la página */ } };
  let sesion = API ? leer() : null;
  /* Vencida, sin token o con datos que no son de esta versión: se descarta sin preguntar al servicio */
  if (sesion && (typeof sesion.token !== 'string' || !sesion.token || !(Date.parse(sesion.vence) > Date.now()))) { sesion = null; guardar(null); }
  let datos = {};  // lo escrito en la puerta, para no volver a pedirlo en esta página (solo en memoria)
  let recuerdo = null;  // la casilla «Recordar» tal como la dejó la persona en esta página; null, según lo ya guardado

  /* ---------- Datos recordados en este dispositivo (solo si la persona lo pidió) ---------- */
  /* Nombre, correo y teléfono, nada más. Vencidos, ilegibles o con otra forma: se descartan. Sin almacenamiento
     (navegación privada, bloqueado): no se recuerda nada y la puerta funciona igual */
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

  const idMensaje = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  /* Una llamada al servicio. No lanza: devuelve el estado HTTP y el JSON, o estado 0 con `falla` ('red' o 'espera')
     cuando no hubo respuesta (sin conexión, CORS, o se agotó la espera: el servicio pudo haberla recibido igual) */
  const llamar = async (ruta, { method = 'GET', body, espera = 30000 } = {}) => {
    const headers = { Accept: 'application/json' };
    if (sesion?.token) headers.Authorization = `Bearer ${sesion.token}`;
    const comoJson = body && !(body instanceof FormData);
    if (comoJson) headers['Content-Type'] = 'application/json';
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), espera);
    try {
      const r = await fetch(`${API}/api/chat${ruta}`, { method, headers, body: comoJson ? JSON.stringify(body) : body, signal: control.signal, cache: 'no-store' });
      const json = await r.json().catch(() => null);
      return { estado: r.status, json: json && typeof json === 'object' && !Array.isArray(json) ? json : {} };
    } catch {
      return { estado: 0, falla: control.signal.aborted ? 'espera' : 'red', json: {} };
    } finally {
      clearTimeout(reloj);
    }
  };
  /* Los mensajes de validación del servicio (los de la puerta y las fotos están en español); una clave sin traducir
     («validation.max.string») no se muestra */
  const errores = (json) => Object.values(json.errors || {}).flat().filter((x) => typeof x === 'string' && !/^[\w-]+(\.[\w-]+)+$/.test(x)).join('\n');
  /* Cuántas consultas quedan: solo se dice cuando quedan pocas */
  const uso = (u) => {
    if (!sub || !u || !Number.isFinite(u.remaining) || !Number.isFinite(u.max)) return;
    sub.textContent = u.remaining <= 3 ? `Te ${u.remaining === 1 ? 'queda 1 consulta' : `quedan ${u.remaining} consultas`}` : '';
    sub.hidden = !sub.textContent;
  };

  /* ---------- Enlaces: solo los de las fuentes, y lo que es de este sitio se muestra aquí ---------- */
  /* La dirección de una fuente, si se puede enlazar: http(s) sin usuario ni clave, de este mismo sitio o con https y un
     destino de FUENTES o del Estado. javascript:, data: y el resto quedan fuera */
  const segura = (href) => {
    let u;
    try { u = new URL(href); } catch { return null; }
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
    if (u.origin === location.origin) return u;
    const host = u.hostname.toLowerCase();
    return u.protocol === 'https:' && (host.endsWith('.gob.cl') || FUENTES.some((f) => host === f || host.endsWith(`.${f}`))) ? u : null;
  };
  const lugar = (u) => {
    if (u.origin !== OFICIAL || location.origin === OFICIAL) return null;
    const pagina = u.pathname.replace(/^\/+/, '') || PRINCIPAL;
    return /\.html$/.test(pagina) ? { pagina, hash: u.hash } : null;
  };
  const enlace = (u, rotulo) => {
    const f = lugar(u);
    const otra = !f || (!marco && f.pagina !== enSitio());
    return h('a', {
      href: f ? new URL(f.pagina + f.hash, BASE).href : u.href, target: otra ? '_blank' : null, rel: otra ? 'noopener noreferrer' : null,
      onclick: (e) => { if (otra || e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); mostrar(f); }
    }, rotulo);
  };
  /* Negritas: **así** se ve en negrita. Se arma con elementos y su texto, nunca como HTML; el resto queda tal cual,
     también las direcciones que traiga el texto (no se convierten en enlaces) */
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

  /* ---------- Cómo se muestra ---------- */
  const abajo = () => charla.scrollTo({ top: charla.scrollHeight, behavior: suave() });
  const desde = (m) => charla.scrollTo({ top: (m.previousElementSibling || m).offsetTop - 12, behavior: suave() });  // desde la pregunta que la originó
  const decirYo = (texto) => { charla.append(h('div', { class: 'msg is-user' }, h('p', { text: texto }))); abajo(); };
  /* Las opciones de una respuesta anterior ya no corresponden al estado de la conversación: se desactivan */
  const vencerOpciones = () => charla.querySelectorAll('[data-opcion], [data-edicion] fieldset').forEach((b) => { b.disabled = true; });
  const decir = (r, { opciones = true } = {}) => {
    const m = h('div', { class: 'msg is-bot' });
    if (typeof r.text === 'string' && r.text) m.append(h('p', { class: 'msg-texto' }, conFormato(r.text)));
    const fuentes = (Array.isArray(r.sources) ? r.sources : []).filter((s) => s && typeof s.label === 'string' && s.label);
    if (fuentes.length) {
      m.append(h('div', { class: 'msg-fuentes' },
        h('p', { class: 'msg-chips-t', text: fuentes.length > 1 ? 'Fuentes' : 'Fuente' }),
        h('ul', {}, fuentes.map((s) => {
          const u = typeof s.url === 'string' ? segura(s.url) : null;
          return h('li', {}, h('span', { icono: I.doc }), u ? enlace(u, s.label) : h('span', { text: s.label }));
        }))));
    }
    if (opciones && r.form?.action === 'guardar_datos' && Array.isArray(r.form.fields)) {
      const edicion = h('form', { class: 'agente-edicion', 'data-edicion': true });
      const campos = h('fieldset', {}, h('legend', { text: 'Revisa tus datos' }));
      const permitidos = ['name', 'company_name', 'phone_number', 'email', 'handoff_reason'];
      r.form.fields.filter((f) => permitidos.includes(f.name)).forEach((f) => {
        const errorId = `edicion-${idMensaje()}`;
        const tipo = ['email', 'tel', 'textarea'].includes(f.type) ? f.type : 'text';
        const input = h(tipo === 'textarea' ? 'textarea' : 'input', {
          name: f.name, type: tipo === 'textarea' ? null : tipo, required: f.required === true,
          maxlength: Math.min(2000, Number(f.max_length) || 150),
          autocomplete: ({ name: 'name', email: 'email', phone_number: 'tel', company_name: 'organization' })[f.name] || 'off',
          'aria-invalid': f.error ? 'true' : null, 'aria-describedby': f.error ? errorId : null
        });
        input.value = typeof f.value === 'string' ? f.value : '';
        input.addEventListener('focus', () => input.scrollIntoView({ block: 'nearest', behavior: suave() }));
        campos.append(h('label', { class: 'agente-campo' }, h('span', { text: f.label }), input,
          f.error ? h('span', { id: errorId, class: 'agente-error', text: f.error }) : null));
      });
      campos.append(h('button', { class: 'btn', type: 'submit', icono: I.guardar }, h('span', { text: r.form.submit_label || 'Guardar cambios' })));
      edicion.append(campos);
      edicion.addEventListener('submit', (e) => {
        e.preventDefault();
        if (ocupado || campos.disabled || !edicion.reportValidity()) return;
        enviar({ option_id: r.form.action, form_values: Object.fromEntries(new FormData(edicion)) }, 'Guardar cambios');
      });
      m.append(edicion);
    }
    const lista = opciones && Array.isArray(r.options) ? r.options.filter((o) => !(r.form && (o?.id?.startsWith('contacto:') || o?.id === 'cotiz:editar:contacto')) && o && typeof o.id === 'string' && typeof o.label === 'string' && o.label) : [];
    if (lista.length) {
      m.append(h('div', { class: 'msg-chips' }, lista.map((o) => h('button', {
        class: 'chip', type: 'button', 'data-opcion': true, text: o.label, title: typeof o.description === 'string' ? o.description : null,
        onclick: () => enviar({ option_id: o.id }, o.label)
      }))));
    }
    charla.append(m);
    if (opciones) {
      const foco = m.querySelector('[aria-invalid="true"]') || (!tactil.matches && m.querySelector('[data-edicion] input'));
      if (foco) foco.focus({ preventScroll: true });
    }
    return m;
  };
  const aviso = (texto) => { const m = decir({ text: texto }); abajo(); return m; };
  /* Un aviso con botones (Reintentar, confirmar…), del mismo estilo que las opciones */
  const avisoCon = (texto, botones) => {
    const m = aviso(texto);
    m.append(h('div', { class: 'msg-chips' }, botones.map(([rotulo, accion]) => h('button', { class: 'chip', type: 'button', text: rotulo, onclick: accion }))));
    abajo();
    return m;
  };
  /* Respuesta del servicio a un turno, a una foto o al abrir la sesión */
  const respuesta = (reply, usage) => {
    vencerOpciones();
    desde(decir(reply && typeof reply === 'object' ? reply : {}));
    uso(usage);
    form.hidden = Boolean(reply?.form);
  };
  const espera = () => {
    const e = h('div', { class: 'msg is-bot is-espera', 'aria-hidden': 'true' }, h('span', {}), h('span', {}), h('span', {}));
    charla.append(e);
    abajo();
    return e;
  };
  const SIN_CONEXION = 'No pude conectarme con el asistente. Revisa tu conexión y vuelve a intentarlo en un rato.';
  const NO_DISPONIBLE = 'El asistente en línea no está disponible por ahora. Puedes pedir tu cotización con el formulario o escribirnos por WhatsApp.';

  /* Turnstile: un solo script para la página, aunque lo pidan el chat y el formulario de cotización (transporte-ui.js) */
  const TURNSTILE = window.TA_API?.turnstile || panel.dataset.turnstile;
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
    /* Solo si hay algo guardado: quita los datos de este dispositivo y vacía los campos, sin tocar la sesión */
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
      h('p', { class: 'msg-texto', text: 'Hola. Para empezar, escribe tu nombre, tu correo y tu teléfono.' }),
      fila('name', 'Nombre', { type: 'text', autocomplete: 'name', maxlength: 150 }),
      fila('email', 'Correo', { type: 'email', autocomplete: 'email', maxlength: 150, spellcheck: 'false', placeholder: 'nombre@empresa.cl' }),
      fila('phone', 'Teléfono', { type: 'tel', autocomplete: 'tel', maxlength: 20, placeholder: '+56 9 1234 5678' }),
      h('label', { class: 'agente-acepto' },
        h('input', { type: 'checkbox', name: 'privacy_accepted', checked: datos.privacy_accepted || null }),
        h('span', {}, 'Acepto las ', h('a', { href: LEGAL('condiciones-del-servicio'), target: '_blank', rel: 'noopener' }, 'condiciones del servicio'), ' y el ', h('a', { href: LEGAL('politica-de-privacidad'), target: '_blank', rel: 'noopener' }, 'aviso de privacidad'), '.')),
      /* Opcional y sin marcar: no condiciona el chat (el texto es el de chatbot.privacy.marketing.label del asistente) */
      h('label', { class: 'agente-acepto' },
        h('input', { type: 'checkbox', name: 'marketing_accepted', checked: datos.marketing_accepted || null }),
        h('span', { text: 'Acepto que Transporte Autorizado me contacte por correo, teléfono o llamada para hacer seguimiento de mi consulta o cotización y ofrecerme sus servicios (opcional).' })),
      /* Opcional y sin marcar (marcada solo si ya había datos guardados): es una comodidad de este navegador, no un
         consentimiento, y no se envía al asistente */
      h('label', { class: 'agente-acepto' },
        h('input', { type: 'checkbox', name: 'remember', checked: (recuerdo ?? !!guardados) || null }),
        h('span', { text: `Recordar mi nombre, correo y teléfono en este dispositivo por ${RECUERDO_DIAS} días (opcional). No lo uses en un equipo compartido.` })),
      guardados ? olvidarDatos : null,
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
      recuerdo = f.elements.remember.checked;
      error.textContent = '';
      if (humano && !token) { error.textContent = 'Estamos comprobando que eres una persona. Espera un momento y vuelve a intentarlo.'; return; }
      f.classList.add('is-enviando');
      const { estado, json, falla } = await llamar('/sessions', { method: 'POST', body: { ...datos, website: f.elements.website.value, ...(humano ? { 'cf-turnstile-response': token } : {}) } });
      f.classList.remove('is-enviando');
      if (estado === 201 && typeof json.token === 'string' && json.token) {
        if (widget !== null) window.turnstile?.remove(widget);
        sesion = { token: json.token, vence: json.expires_at, fotos: 0 };
        guardar(sesion);
        /* Solo con datos que el servicio ya aceptó, y la casilla manda: sin marcar, se quita lo que hubiera */
        recordar(recuerdo ? { name: datos.name, email: datos.email, phone: datos.phone } : null);
        salir.hidden = false;
        f.remove();
        form.hidden = false;
        respuesta(json.reply, json.usage);
        if (!tactil.matches) campo.focus({ preventScroll: true });
        return;
      }
      /* Con «error», el mensaje es del asistente (p. ej., el tope de todo el servicio); el 429 genérico es por IP. Fuera
         de 422 y ese 429, el texto del servicio puede venir en inglés («Server Error»): va uno propio */
      const delAsistente = (estado === 422 || (estado === 429 && json.error)) && (errores(json) || (typeof json.message === 'string' && json.message));
      error.textContent = falla ? SIN_CONEXION
        : estado === 403 ? 'El asistente no está disponible desde esta página.'
        : estado === 429 && !json.error ? 'Hubo muchos intentos desde esta conexión. Espera un momento.'
        : delAsistente || 'No pude abrir el chat. Vuelve a intentarlo.';
      /* El token sirve una vez: si no se abrió la sesión, el widget entrega otro */
      if (widget !== null && f.isConnected) { token = ''; window.turnstile?.reset(widget); }
    });
    charla.append(f);
    desde(f);  // el comienzo de la puerta, no su final: es más alta que la ventana, y así se ve primero el saludo y el primer campo
    if (!tactil.matches) f.querySelector('input:not([value])')?.focus({ preventScroll: true });
  };
  const salir = h('button', { class: 'agente-salir', type: 'button', text: 'Borrar esta conversación' });
  const fotosPendientes = new Map();
  const subidas = new Set();  // las fotos que el servicio confirmó en esta página (para no subir dos veces la misma)
  /* Sin sesión: lo local se olvida (el token, sus fotos y el mensaje pendiente) */
  const olvidar = () => { sesion = null; guardar(null); pendiente = null; subidas.clear(); fotosPendientes.clear(); if (sub && API) { sub.textContent = ''; sub.hidden = true; } salir.hidden = true; };
  /* La sesión ya no sirve (401 session_expired): vuelta a la puerta; lo que se estaba escribiendo vuelve al campo */
  const vencida = (texto) => {
    olvidar();
    datos = { name: datos.name, email: datos.email, phone: datos.phone };
    aviso('Tu sesión terminó. Vuelve a escribir tus datos para seguir.');
    puerta();
    if (texto) campo.value = texto;
  };

  /* ---------- Turnos ---------- */
  let ocupado = false;
  /* El mensaje que todavía no tiene respuesta confirmada. Conserva su identificador hasta que el servicio responde o la
     persona escribe otra cosa: así un reintento nunca se procesa dos veces */
  let pendiente = null;  // { id, cuerpo, visible, auto, manuales, nota }
  const guardarPendiente = () => {
    if (!sesion) return;
    if (pendiente) sesion.pendiente = { id: pendiente.id, cuerpo: pendiente.cuerpo, visible: pendiente.visible };
    else delete sesion.pendiente;
    guardar(sesion);
  };
  const mismo = (a, b) => (a.text ?? '') === (b.text ?? '') && (a.option_id ?? '') === (b.option_id ?? '') && JSON.stringify(a.form_values || null) === JSON.stringify(b.form_values || null);
  /* «visible» es lo que se ve como mensaje propio; sin él (reiniciar) el turno no se muestra */
  const enviar = (cuerpo, visible) => {
    if (ocupado || !sesion) return;
    if (pendiente && mismo(pendiente.cuerpo, cuerpo)) { reintentar(); return; }  // lo mismo otra vez: el mismo mensaje
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
    const ediciones = [...charla.querySelectorAll('[data-edicion] fieldset:not(:disabled)')];
    ediciones.forEach((el) => { el.disabled = true; el.closest('form').setAttribute('aria-busy', 'true'); });
    const e = espera();
    let r;
    for (;;) {
      r = await llamar('/messages', { method: 'POST', body: { ...p.cuerpo, client_message_id: p.id }, espera: ESPERA });
      /* Espera agotada (aquí o en el proxy: 504) u «ocupado»: el servicio puede estar respondiendo este mismo mensaje.
         Se vuelve a pedir con el mismo identificador, dos veces y con pausas crecientes; si ya terminó, entrega la
         misma respuesta */
      const enCurso = r.falla === 'espera' || r.estado === 504 || (r.estado === 409 && r.json.error === 'busy');
      if (!enCurso || p.auto >= AUTO || pendiente !== p) break;
      p.auto += 1;
      await pausa(3000 * p.auto);
    }
    e.remove();
    ediciones.forEach((el) => { el.disabled = false; el.closest('form').removeAttribute('aria-busy'); });
    ocupado = false;
    if (pendiente !== p) return;
    const { estado, json } = r;
    if (estado === 200 && json.reply && typeof json.reply === 'object') { pendiente = null; guardarPendiente(); respuesta(json.reply, json.usage); return; }
    if (estado === 200 && json.duplicate) { pendiente = null; guardarPendiente(); uso(json.usage); aviso('Ese mensaje ya lo había recibido. Sigue cuando quieras.'); return; }
    if (estado === 401) { pendiente = null; vencida(p.cuerpo.text && p.visible); return; }
    if (estado === 409 && json.error === 'idempotency_conflict') {
      pendiente = null;
      guardarPendiente();
      aviso(typeof json.message === 'string' && json.message ? json.message : 'Ese envío ya se registró con otros datos. Empieza de nuevo si quieres cambiarlos.');
      return;
    }
    if (estado === 403 || estado === 422) {
      pendiente = null;
      guardarPendiente();
      /* 422: texto vacío o demasiado largo; la validación del turno no tiene textos propios en el asistente */
      aviso(estado === 403 ? 'El asistente no está disponible desde esta página.' : 'No pude enviar ese mensaje. Revisa lo que escribiste y vuelve a intentarlo.');
      if (estado === 422 && p.cuerpo.text && !campo.value) campo.value = p.cuerpo.text;
      return;
    }
    /* Sin respuesta confirmada: el mensaje sigue pendiente con su identificador */
    const texto = r.falla === 'red' ? 'No pude conectarme con el asistente. Revisa tu conexión y vuelve a intentarlo: si tu mensaje ya había llegado, no se repetirá.'
      : r.falla === 'espera' || estado === 504 ? 'La respuesta está tardando más de lo normal. Vuelve a intentarlo en un momento: si tu mensaje ya había llegado, no se repetirá.'
      : estado === 409 ? 'Todavía estoy preparando la respuesta. Vuelve a intentarlo en un momento.'
      : estado === 429 ? 'Enviaste muchos mensajes seguidos. Espera un momento y vuelve a intentarlo.'
      : (json.error === 'unavailable' && typeof json.message === 'string' && json.message) || 'No pude responder en este momento. Vuelve a intentarlo en un rato.';
    if (p.manuales >= REINTENTOS) {
      pendiente = null;
      guardarPendiente();
      aviso('No pude responder este mensaje. Escríbelo de nuevo más tarde o, si prefieres, usa el formulario o WhatsApp.');
      return;
    }
    p.nota = avisoCon(texto, [['Reintentar', reintentar]]);
  };
  const reiniciar = () => enviar({ text: 'inicio' });  // comando del asistente: vuelve al menú (no gasta consultas)

  /* Al volver, el servicio restaura el historial, el cupo y el número de fotos. */
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
    uso(json.usage);
    if (Number.isInteger(json.photos) && json.photos >= 0) { sesion.fotos = json.photos; guardar(sesion); }
    const mensajes = json.messages.filter((m) => m && typeof m.text === 'string');
    const guardado = sesion.pendiente;
    const recuperable = guardado && /^[A-Za-z0-9_-]{1,64}$/.test(guardado.id) && guardado.cuerpo && typeof guardado.cuerpo === 'object';
    const respondido = recuperable && mensajes.some((m) => m.role === 'assistant' && m.client_message_id === guardado.id);
    if (respondido) { delete sesion.pendiente; guardar(sesion); }
    if (!mensajes.length && !recuperable) { reiniciar(); return; }
    const ultimo = mensajes[mensajes.length - 1];
    form.hidden = Boolean(ultimo?.form);
    mensajes.forEach((m) => (m.role === 'user' ? decirYo(m.text) : decir(m, { opciones: m === ultimo })));
    if (recuperable && !respondido) {
      pendiente = { ...guardado, auto: 0, manuales: 0, nota: null };
      if (pendiente.visible && !mensajes.some((m) => m.role === 'user' && m.client_message_id === pendiente.id)) decirYo(pendiente.visible);
      form.hidden = false;
      pendiente.nota = avisoCon('Quedó un envío sin respuesta confirmada. Puedes reintentarlo sin duplicarlo.', [['Reintentar', reintentar]]);
    } else if (ultimo?.role === 'user') {
      /* Un turno sin respuesta (en curso o fallido): se puede volver a leer, sin enviarlo otra vez */
      avisoCon('Tu último mensaje todavía no tiene respuesta.', [['Actualizar', () => { if (ocupado) return; charla.textContent = ''; retomar(); }]]);
    }
    abajo();
  };
  let empezado = false;
  const empezar = () => {
    if (empezado) return;
    empezado = true;
    if (!API) { form.hidden = true; aviso(NO_DISPONIBLE); return; }
    if (sesion) retomar(); else puerta();
  };

  /* ---------- Borrar esta conversación (DELETE /session) ---------- */
  let confirmacion = null;
  const borrar = async (nota, antes) => {
    if (ocupado || !sesion) return;
    ocupado = true;
    nota.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    const e = espera();
    const { estado, json, falla } = await llamar('/session', { method: 'DELETE', body: { confirm: true } });
    e.remove();
    ocupado = false;
    /* Quien pide borrar no encuentra sus datos precargados en la puerta: tampoco los de este dispositivo */
    const fin = (texto) => { nota.remove(); confirmacion = null; olvidar(); recordar(null); datos = {}; recuerdo = null; charla.textContent = ''; aviso(texto); puerta(); };
    if (estado === 200 && json.deleted === true) { fin('Listo: borramos esta conversación y los datos que dejaste en el chat.'); return; }
    /* Se aceptó y la sesión ya no sirve, pero el borrado no terminó: lo completa el propio servicio */
    if (estado === 500 && json.error === 'erasure_pending') { fin('Recibimos tu solicitud y cerramos la sesión. El borrado quedó en curso y el asistente lo completa en breve.'); return; }
    if (estado === 401) {
      fin(antes ? 'La sesión ya está cerrada. Si tu solicitud anterior alcanzó a llegar, la conversación ya se borró; si no, revisa el aviso de privacidad para pedirlo.'
        : 'Tu sesión ya había terminado, así que no pude borrar desde aquí. Revisa el aviso de privacidad para pedirlo.');
      return;
    }
    /* Ocupado, sin conexión o un error: la sesión sigue igual y se puede volver a pedir */
    nota.remove();
    confirmacion = null;
    const texto = estado === 409 ? 'Hay una respuesta en curso. Espera un momento y vuelve a intentarlo: todavía no se borró nada.'
      : falla ? 'No pude confirmar el borrado. Vuelve a intentarlo: tu conversación sigue disponible mientras no se confirme.'
      : estado === 429 ? 'Hiciste muchas solicitudes seguidas. Espera un momento y vuelve a intentarlo: todavía no se borró nada.'
      : 'No pude borrar la conversación en este momento. Vuelve a intentarlo en un rato.';
    const m = avisoCon(texto, [['Reintentar el borrado', () => borrar(m, antes || !!falla)], ['Cancelar', () => m.remove()]]);
  };
  salir.addEventListener('click', () => {
    if (ocupado || !sesion) return;
    if (confirmacion?.isConnected) { abajo(); confirmacion.querySelector('button')?.focus({ preventScroll: true }); return; }
    confirmacion = avisoCon('¿Borrar esta conversación? Se borran los mensajes, las fotos y los datos de contacto que dejaste en el chat, y no se puede deshacer. Si pediste que te contactaran, esa solicitud ya está con el equipo y no se borra desde aquí.', [
      ['Sí, borrar', () => borrar(confirmacion, false)],
      ['Cancelar', () => { confirmacion.remove(); confirmacion = null; }]
    ]);
    confirmacion.querySelector('.msg-texto').append(' ', h('a', { href: LEGAL('eliminacion-de-datos'), target: '_blank', rel: 'noopener' }, 'Más información'));
    if (!tactil.matches) confirmacion.querySelector('button').focus({ preventScroll: true });
  });

  /* ---------- Fotos ---------- */
  const cargarLimitesFotos = async () => {
    if (limitesFotos) return true;
    const { estado, json } = await llamar('/config', { espera: 5000 });
    const v = json.attachments;
    if (estado !== 200 || !v || !['max_per_session', 'max_kilobytes', 'max_pixels'].every((k) => Number.isSafeInteger(v[k]) && v[k] > 0)
      || v.max_kilobytes > Number.MAX_SAFE_INTEGER / 1024 || !Array.isArray(v.mimes)) return false;
    const tipos = [...new Set(v.mimes.filter((m) => typeof m === 'string' && Object.hasOwn(FORMATOS, m)).map((m) => FORMATOS[m]))];
    if (!tipos.length) return false;
    limitesFotos = { ...v, tipos };
    elegir.accept = tipos.join(',');
    return true;
  };
  const valida = (f) => limitesFotos.tipos.includes(f.type || FORMATOS[(f.name || '').split('.').pop().toLowerCase()]);
  const huella = (f) => `${f.name}|${f.size}|${f.lastModified}`;
  /* La foto, a 1600 px como máximo y en un formato permitido (sin los datos de la cámara). Si el navegador no la puede leer, null: no se
     sube la original */
  const reducir = async (archivo, numero) => {
    let img;
    try {
      try { img = await createImageBitmap(archivo, { imageOrientation: 'from-image' }); } catch { img = await createImageBitmap(archivo); }
      const k = Math.min(1, Math.min(1600, limitesFotos.max_pixels) / Math.max(img.width, img.height), Math.sqrt(limitesFotos.max_pixels / (img.width * img.height)));
      const lienzo = h('canvas', { width: Math.max(1, Math.floor(img.width * k)), height: Math.max(1, Math.floor(img.height * k)) });
      const c = lienzo.getContext('2d');
      c.fillStyle = '#fff';  // un PNG transparente queda sobre blanco, no sobre negro
      c.fillRect(0, 0, lienzo.width, lienzo.height);
      c.drawImage(img, 0, 0, lienzo.width, lienzo.height);
      const tipo = limitesFotos.tipos.includes('image/jpeg') ? 'image/jpeg' : limitesFotos.tipos[0];
      const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[tipo];
      const blob = await new Promise((ok) => lienzo.toBlob(ok, tipo, 0.85));
      /* El nombre es neutro: el de la persona puede llevar datos personales */
      return blob?.type === tipo && blob.size <= limitesFotos.max_kilobytes * 1024 ? new File([blob], `foto-${numero}.${extension}`, { type: tipo }) : null;
    } catch {
      return null;
    } finally {
      img?.close?.();
    }
  };
  /* Una foto: se valida, se reduce y se sube. Devuelve false si no tiene sentido seguir con las demás */
  const subirUna = async (archivo) => {
    decirYo(`Foto: ${archivo.name || 'imagen pegada'}`);
    if ((sesion.fotos || 0) >= limitesFotos.max_per_session) { aviso(`Ya adjuntaste ${limitesFotos.max_per_session} fotos, el máximo por conversación.`); return false; }
    if (subidas.has(huella(archivo))) { aviso('Esa foto ya está adjunta.'); return true; }
    if (!valida(archivo)) { aviso(`Los formatos permitidos son: ${limitesFotos.tipos.map((t) => t.slice(6).toUpperCase()).join(', ')}.`); return true; }
    if (archivo.size > FOTO_ENTRADA) { aviso('Esa foto es demasiado pesada. Prueba con otra o con una captura de pantalla.'); return true; }
    const e = espera();
    const anterior = fotosPendientes.get(huella(archivo));
    const foto = anterior?.foto || await reducir(archivo, (sesion.fotos || 0) + 1);
    if (!foto) { e.remove(); aviso('No pude preparar esa foto. Prueba con otra imagen JPG, PNG o WebP.'); return true; }
    const id = anterior?.id || idMensaje();
    fotosPendientes.set(huella(archivo), { foto, id });
    const cuerpo = new FormData();
    cuerpo.append('image', foto);
    cuerpo.append('client_upload_id', id);
    const { estado, json, falla } = await llamar('/attachments', { method: 'POST', body: cuerpo, espera: 60000 });
    e.remove();
    if (estado === 201) {
      subidas.add(huella(archivo));
      fotosPendientes.delete(huella(archivo));
      sesion.fotos = Number.isInteger(json.photos) ? json.photos : (sesion.fotos || 0) + 1;
      guardar(sesion);
      respuesta(json.reply || { text: 'Recibí la foto.' }, json.usage);
      return true;
    }
    if (estado === 401) { vencida(); return false; }
    if (estado === 422 && json.error === 'attachment_limit') { sesion.fotos = limitesFotos.max_per_session; guardar(sesion); }
    if (falla || estado >= 500 || (estado === 409 && json.error === 'busy')) {
      const nota = avisoCon('No pude confirmar si la foto llegó. Puedes reintentar sin duplicarla.', [['Reintentar', () => { if (ocupado) return; nota.remove(); subir([archivo]); }]]);
      return false;
    }
    if (estado === 409) fotosPendientes.delete(huella(archivo));
    aviso(estado === 409 ? 'No pude reconocer este intento de subida. Elige nuevamente la foto.'
      : estado === 403 ? 'El asistente no está disponible desde esta página.'
      : estado === 429 ? 'Enviaste muchas cosas seguidas. Espera un momento y vuelve a intentarlo.'
      : (estado === 422 && ((typeof json.message === 'string' && json.message) || errores(json))) || 'No pude subir la foto. Vuelve a intentarlo.');
    return estado === 422 && json.error !== 'attachment_limit';
  };
  const subir = async (archivos) => {
    if (!archivos.length) return;
    if (!sesion) { aviso('Para adjuntar una foto, primero escribe tus datos y toca «Comenzar».'); return; }
    if (ocupado) { aviso('Espera a que termine la respuesta para adjuntar la foto.'); return; }
    if (charla.querySelector('[data-edicion] fieldset:not(:disabled)')) { aviso('Guarda los cambios o cancela la edición antes de adjuntar una foto.'); return; }
    ocupado = true;
    const consultando = limitesFotos ? null : espera();
    try {
      const disponibles = await cargarLimitesFotos();
      consultando?.remove();
      if (!disponibles) { aviso('No pude comprobar los límites de fotos. Vuelve a intentarlo en un momento.'); return; }
      for (const archivo of archivos) if (!sesion || !(await subirUna(archivo))) break;
    } finally {
      consultando?.remove();
      ocupado = false;
    }
  };
  const elegir = h('input', { type: 'file', accept: TIPOS.join(','), multiple: true, hidden: true });
  const adjuntar = h('button', { class: 'agente-adjuntar', type: 'button', 'aria-label': 'Adjuntar una foto del residuo', title: 'Adjuntar una foto', icono: I.foto, onclick: () => elegir.click() });
  form.insertBefore(adjuntar, form.querySelector('button[type="submit"]'));
  form.append(elegir);
  elegir.addEventListener('change', () => {
    const archivos = [...elegir.files];
    elegir.value = '';
    subir(archivos);
  });
  /* Pegar o soltar una imagen en la ventana la adjunta aquí. No sigue hacia el documento, donde el formulario de
     cotización (transporte-ui.js) la tomaría como foto de la solicitud */
  if (API) {
    const conArchivos = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
    panel.addEventListener('dragenter', (e) => { if (conArchivos(e)) { e.preventDefault(); e.stopPropagation(); } });
    panel.addEventListener('dragover', (e) => { if (conArchivos(e)) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; } });
    panel.addEventListener('drop', (e) => { if (!conArchivos(e)) return; e.preventDefault(); e.stopPropagation(); subir([...e.dataTransfer.files]); });
    panel.addEventListener('paste', (e) => {
      const archivos = [...(e.clipboardData?.files || [])];
      if (!archivos.length) return;  // texto: se pega como siempre
      e.preventDefault();
      e.stopPropagation();
      subir(archivos);
    });
  }

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
    boton.setAttribute('aria-expanded', 'true');
    if (enDock) marcarDock(true);
    else {
      boton.classList.add('is-abierto');
      boton.classList.remove('is-aparte');
      boton.setAttribute('aria-label', 'Cerrar el asistente');
    }
    empezar();
    if (!tactil.matches && !form.hidden) campo.focus({ preventScroll: true });
  };
  function cerrar() {
    if (!abierto() || panel.classList.contains('is-saliendo')) return;
    const dentro = panel.contains(d.activeElement);
    const fin = () => { panel.classList.remove('is-saliendo'); panel.hidden = true; seguir(); };
    boton.setAttribute('aria-expanded', 'false');
    if (enDock) marcarDock(false);
    else {
      boton.classList.remove('is-abierto');
      boton.setAttribute('aria-label', ROTULO);
    }
    if (dentro && !tactil.matches) volver.focus({ preventScroll: true });
    clearTimeout(saliendo);
    if (motion.matches) { panel.classList.add('is-saliendo'); saliendo = setTimeout(fin, 200); } else fin();
  }
  boton.addEventListener('click', () => (abierto() && !panel.classList.contains('is-saliendo') ? cerrar() : abrir()));
  d.addEventListener('keydown', (e) => { if (e.key === 'Escape' && abierto() && !e.defaultPrevented && (panel.contains(d.activeElement) || d.activeElement === volver)) { e.preventDefault(); cerrar(); } });
  /* Con el chat abierto, la «?» muestra «X» y lo cierra (antes que su propio clic, que abriría el menú) */
  toggleDock?.addEventListener('click', (e) => { if (abierto() && !panel.classList.contains('is-saliendo')) { e.stopImmediatePropagation(); cerrar(); } }, true);
  panel.querySelector('[data-agente-cerrar]')?.addEventListener('click', cerrar);  // sin «X» en la cabecera: la burbuja muestra la única
  /* «Volver»: abierto desde la «?», cierra el chat y vuelve a mostrar sus opciones */
  const atras = panel.querySelector('[data-agente-volver]');
  if (atras && enDock) {
    atras.hidden = false;
    atras.addEventListener('click', () => { cerrar(); enDock.dispatchEvent(new Event('dock:abrir')); });
  }
  /* «Empezar una conversación nueva»: la misma sesión, desde el menú (el comando «inicio» del asistente) */
  panel.querySelector('[data-agente-nuevo]').addEventListener('click', () => {
    if (ocupado || !API) return;
    pendiente = null;
    guardarPendiente();
    confirmacion = null;
    charla.textContent = '';
    if (!sesion) { puerta(); return; }
    form.hidden = false;
    reiniciar();
  });
  /* Borra en el servicio la conversación y los datos de esta sesión; después se puede empezar con otros datos */
  pie.append(salir);
  salir.hidden = !sesion;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = campo.value.trim();
    if (!q || ocupado || !sesion) return;
    campo.value = '';
    enviar({ text: q }, q);
  });

  /* Cuándo se ve la burbuja. En la página aparece y se oculta junto con la «?» del sitio (al pasar el hero, no sobre
     el pie ni con el menú abierto): así la primera pantalla queda como está. Con la ventana abierta no se oculta. */
  const dock = marco || enDock ? null : d.querySelector('[data-dock]');
  function seguir() { if (dock) boton.classList.toggle('is-aparte', !dock.classList.contains('is-visible') && !abierto()); }
  if (dock) new MutationObserver(seguir).observe(dock, { attributes: true, attributeFilter: ['class'] });
  seguir();
  /* En agente-virtual.html: la página de atrás trae su propia burbuja (manda la de adelante), y la burbuja se aparta
     cuando esa página abre una ventana o una hoja, para no tapar sus botones */
  const vigilar = () => {
    let doc;
    try { doc = marco.contentDocument; } catch { return; }
    if (!doc?.head) return;
    doc.head.append(Object.assign(doc.createElement('style'), { textContent: '.agente,.agente-burbuja,[data-dock]{display:none!important}' }));
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
