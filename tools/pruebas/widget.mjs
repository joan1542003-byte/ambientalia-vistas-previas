// Pruebas del widget del chat (assets/site/agente-chat.js) contra un asistente Laravel simulado en este computador.
// No llama a servicios reales ni crea datos fuera: el asistente se simula con el contrato de /api/chat/* (incluida la
// idempotencia por client_message_id: un identificador ya procesado devuelve la misma respuesta, uno en curso responde
// 409 busy) y el navegador no sale a internet.
//
//   node tools/pruebas/widget.mjs
//
// Usa el mismo navegador que tools/pruebas/integracion.mjs (Chrome, Chromium o Brave sin interfaz, variable CHROME) y,
// para la página de WordPress, el código real del plugin (php tools/pruebas/pagina-wp.php). Sale con 1 si algo falla.
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fallas = 0;
const avisos = [];
const ok = (cond, que) => { console.log(`  ${cond ? 'ok   ' : 'FALLA'} ${que}`); if (!cond) fallas += 1; return cond; };
const seccion = (t) => console.log(`\n${t}`);

const NAVEGADOR = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
].filter(Boolean).find((p) => existsSync(p));
if (!NAVEGADOR) { console.log('No encontré Chrome, Chromium ni Brave (indica CHROME=/ruta).'); process.exit(1); }
let PHP = true;
try { execFileSync('php', ['-v'], { stdio: 'ignore' }); } catch { PHP = false; avisos.push('Sin php: no se probó la página de WordPress con la CSP del plugin.'); }

/* Partes de un multipart/form-data, con el contenido de los archivos */
function multipart(buf, tipo) {
  const b = /boundary=(?:"([^"]+)"|([^;]+))/.exec(tipo || '');
  const out = { campos: {}, archivos: [] };
  if (!b) return out;
  const sep = Buffer.from(`--${b[1] || b[2]}`);
  let i = buf.indexOf(sep);
  while (i !== -1) {
    const j = buf.indexOf(sep, i + sep.length);
    if (j === -1) break;
    const parte = buf.subarray(i + sep.length + 2, j - 2);
    const k = parte.indexOf('\r\n\r\n');
    const cab = parte.subarray(0, k).toString();
    const cuerpo = parte.subarray(k + 4);
    const nombre = /name="([^"]*)"/.exec(cab)?.[1];
    const archivo = /filename="([^"]*)"/.exec(cab)?.[1];
    if (archivo !== undefined) out.archivos.push({ campo: nombre, nombre: archivo, bytes: cuerpo.length, tipo: /Content-Type:\s*(\S+)/i.exec(cab)?.[1], contenido: Buffer.from(cuerpo) });
    else out.campos[nombre] = cuerpo.toString();
    i = j;
  }
  return out;
}

/* ======================= Sitio estático y asistente simulado ======================= */

/* El sitio, como en GitHub Pages. Con `pagina.wp` la página principal sale procesada por el plugin (TA_API y CSP);
   con `pagina.espera`, la ventana del chat lleva data-agente-espera (segundos) */
const pagina = { wp: null, espera: null };
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8' };
const sitio = createServer((req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = resolve(ROOT, `.${ruta}`);
  if (!f.startsWith(ROOT) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  let cuerpo = readFileSync(f);
  if (ruta === '/transporte-autorizado.html') {
    if (pagina.wp) cuerpo = execFileSync('php', [join(ROOT, 'tools/pruebas/pagina-wp.php'), f, pagina.wp.asistente || '', pagina.wp.turnstile || ''], { maxBuffer: 16 << 20 });
    if (pagina.espera) cuerpo = Buffer.from(cuerpo.toString().replace(' data-agente data-agente-api=', ` data-agente data-agente-espera="${pagina.espera}" data-agente-api=`));
  }
  res.writeHead(200, { 'Content-Type': TIPOS[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(cuerpo);
});

/* El asistente: registra cada llamada y responde como Laravel. `guion` fuerza la respuesta de la próxima llamada a
   una ruta ({ ruta, metodo?, status, json?, html?, retardo?, cortar?, procesar? }); `retardos`, cuánto tarda el modelo.
   Responde con el contrato nuevo (25-11-2026): GET /config con `remember`, GET /history con `reply` (la última
   respuesta: `S.reply` o la última del asistente en `S.historial`) y GET /session con la copia de los datos. Con
   `S.antiguo`, como el asistente anterior: sin `remember` ni `reply`, y GET /session responde 405 */
const llamadas = [];
const S = { tokens: new Set(), n: 0, procesados: new Map(), enCurso: new Set(), ejecuciones: 0, duplicados: 0, guion: [], retardos: [], historial: [], subidas: new Map(), fotos: 0, cortarHasta: 0, reply: undefined, antiguo: false, remember: undefined, anteriores: null };
const USO = { max: 10, used: 1, remaining: 9, resets_at: null };
const LIMITES_FOTOS = { max_per_session: 2, max_kilobytes: 5120, max_pixels: 50000000, mimes: ['jpg', 'jpeg', 'png', 'webp'] };
S.limites = { ...LIMITES_FOTOS };
const MENU = { text: 'Hola, soy el asistente. ¿En qué te ayudo?', options: [{ id: 'residuos', label: 'Retiro de residuos' }, { id: 'normativa', label: 'Normativa' }], sources: [], intent: 'main_menu', lead_status: null };
/* «Recordar» del asistente nuevo (GET /config → remember, chatbot.remember de D-23); `S.remember` lo reemplaza */
const RECORDAR = {
  enabled: true, label: 'Recordar mi sesión y conversación (opcional)',
  help: 'Guarda en este navegador el acceso a esta conversación mientras siga vigente y tus datos de contacto para un próximo registro. Úsalo solo en un navegador personal.',
  forget_label: 'Olvidar este dispositivo', contact_days: 30
};
/* El formulario de contacto en una sola pantalla (LeadForm::present): empresa obligatoria, lo opcional plegado y un select */
const FORMULARIO = {
  text: 'Déjanos tus datos y un especialista te contacta.', intent: 'lead_form', sources: [], lead_status: 'collecting',
  options: [{ id: 'cancelar', label: 'Cancelar' }],
  form: {
    action: 'guardar_datos', title: 'Tus datos de contacto', description: 'Revisa lo que ya sabemos y completa tu empresa.', submit_label: 'Revisar y enviar', draft_id: 'lead-7',
    optional_section: { title: 'Agregar más detalles (opcional)', hint: 'Si nos cuentas el residuo, preparamos mejor la llamada.' },
    fields: [
      { name: 'name', label: 'Nombre', type: 'text', value: 'Persona Chat', required: true, max_length: 150, error: '' },
      { name: 'company_name', label: 'Empresa', type: 'text', value: '', required: true, max_length: 150, error: '', placeholder: 'Razón social o nombre de fantasía' },
      { name: 'phone_number', label: 'Teléfono', type: 'tel', value: '+56 9 8765 4321', required: true, max_length: 30, error: '' },
      { name: 'email', label: 'Correo', type: 'email', value: 'chat@ejemplo.cl', required: true, max_length: 150, error: '' },
      { name: 'contact_time', label: '¿Cuándo te llamamos?', type: 'select', value: '', required: false, max_length: 20, error: '', placeholder: 'Cuando puedan',
        options: [{ value: 'manana', label: 'En la mañana' }, { value: 'tarde', label: 'En la tarde' }] },
      { name: 'handoff_reason', label: 'Motivo', type: 'textarea', value: '', required: false, max_length: 2000, error: '', placeholder: 'Ej.: retiro de 3 tambores de aceite usado en Lampa' }
    ]
  }
};
/* El mismo formulario con valores y errores del servicio */
const formularioCon = (valores = {}, errores = {}) => ({ ...FORMULARIO, form: { ...FORMULARIO.form, fields: FORMULARIO.form.fields.map((f) => ({ ...f, value: valores[f.name] ?? f.value, error: errores[f.name] || '' })) } });
/* La copia de los datos (GET /api/chat/session) */
const COPIA = { generado: '2026-11-25T12:00:00-03:00', registro: { nombre: 'Persona Chat', correo: 'chat@ejemplo.cl', telefono: '+56 9 8765 4321' }, mensajes: [{ rol: 'tú', texto: 'Hola' }] };
const XSS = {
  text: 'Mira <img src=x onerror="window.__xss=1"> y <script>window.__xss=2</script> en https://evil.example/robar y javascript:window.__xss=3 & «comillas» "dobles" \'simples\' ñandú 10 < 20 > 5 **en negrita <b>no</b>**',
  sources: [
    { label: 'Esquema javascript', url: 'javascript:window.__xss=4' },
    { label: 'Esquema data', url: 'data:text/html,<script>window.__xss=5</script>' },
    { label: 'Sin https', url: 'http://www.bcn.cl/leychile/navegar?idNorma=1' },
    { label: 'Dominio ajeno', url: 'https://evil.example/' },
    { label: 'Parecido', url: 'https://bcn.cl.evil.example/' },
    { label: 'Casi .gob.cl', url: 'https://evil-gob.cl/' },
    { label: 'Con usuario', url: 'https://usuario:clave@www.bcn.cl/' },
    { label: 'Relativa', url: '/ayuda' },
    { label: '"><img src=x onerror="window.__xss=6">', url: 'https://www.bcn.cl/leychile/navegar?idNorma=226458' }
  ],
  options: [{ id: 'x" onclick="window.__xss=7', label: '<b onmouseover="window.__xss=8">Opción</b>', description: '"><script>window.__xss=9</script>' }]
};
const FUENTES = {
  text: 'Estas son las fuentes.',
  sources: [
    { label: 'D.S. 148 (Ley Chile)', url: 'https://www.bcn.cl/leychile/navegar?idNorma=226458' },
    { label: 'BCN', url: 'https://bcn.cl/2f6ze' },
    { label: 'Ley Chile', url: 'https://www.leychile.cl/Navegar?idNorma=1' },
    { label: 'Ventanilla única (MMA)', url: 'https://portalvu.mma.gob.cl/' },
    { label: 'Guía del sitio', url: 'https://transporteautorizado.cl/ayuda/residuo-peligroso-o-no-peligroso.html' },
    { label: 'Sin dirección' }
  ],
  options: []
};
const respuestaPara = (c) => {
  if (c.text === 'inicio') return MENU;
  if (c.text === 'xss') return XSS;
  if (c.text === 'fuentes') return FUENTES;
  if (c.option_id === 'residuos') return { text: 'Elegiste retiro de residuos.', options: [{ id: 'peligrosos', label: 'Peligrosos' }, { id: 'no-peligrosos', label: 'No peligrosos' }], sources: [] };
  if (c.text === 'especialista') return FORMULARIO;
  /* Guardar el formulario: sin empresa vuelve con el error; con ella, el resumen para confirmar (lo que lleva a enviar es `primary`) */
  if (c.option_id === 'guardar_datos' && c.form_values && typeof c.form_values === 'object') {
    if (!String(c.form_values.company_name || '').trim()) return formularioCon(c.form_values, { company_name: 'Escribe el nombre de tu empresa.' });
    return { text: `Revisa: ${c.form_values.name}, ${c.form_values.company_name}. ¿Lo enviamos?`, intent: 'lead_confirm', sources: [],
      options: [{ id: 'cancelar', label: 'Cancelar' }, { id: 'corregir', label: 'Corregir' }, { id: 'confirmar', label: 'Sí, enviar', primary: true }] };
  }
  return { text: `Respuesta a «${c.text || c.option_id}».`, options: [{ id: 'otra', label: 'Otra consulta' }], sources: [] };
};
const asistente = createServer(async (req, res) => {
  const partes = [];
  for await (const c of req) partes.push(c);
  const crudo = Buffer.concat(partes);
  const url = new URL(req.url, 'http://x');
  const tipo = String(req.headers['content-type'] || '');
  let cuerpo = {};
  if (tipo.startsWith('application/json')) { try { cuerpo = JSON.parse(crudo.toString()); } catch { cuerpo = { invalido: true }; } }
  const mp = tipo.startsWith('multipart/') ? multipart(crudo, tipo) : null;
  const cors = { 'Access-Control-Allow-Origin': req.headers.origin || '*', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Accept, Content-Type, Authorization, X-Chat-Token' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
  llamadas.push({ metodo: req.method, ruta: url.pathname, consulta: url.search, token, origen: req.headers.origin || '', cuerpo, mp });
  const json = (status, j) => { if (res.destroyed) return; res.writeHead(status, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(j)); };
  /* Un turno como el de ChatController::message: procesado → la misma respuesta; en curso → 409 busy */
  const turno = async () => {
    const id = `${token}:${cuerpo.client_message_id}`;
    if (S.procesados.has(id)) { S.duplicados += 1; return { status: 200, json: { duplicate: true, reply: S.procesados.get(id), usage: USO } }; }
    if (S.enCurso.has(id)) return { status: 409, json: { error: 'busy' } };
    S.enCurso.add(id);
    S.ejecuciones += 1;
    await sleep(S.retardos.shift() ?? 120);
    const reply = respuestaPara(cuerpo);
    S.procesados.set(id, reply);
    S.enCurso.delete(id);
    return { status: 200, json: { reply, usage: USO } };
  };
  const foto = () => {
    const key = `${token}:${mp?.campos.client_upload_id}`;
    if (S.subidas.has(key)) return { status: 201, json: S.subidas.get(key) };
    if (S.fotos >= S.limites.max_per_session) return { status: 422, json: { error: 'attachment_limit', message: 'Ya adjuntaste el máximo de imágenes para esta conversación.' } };
    S.fotos += 1;
    const result = { attachment: { id: S.fotos, name: mp?.archivos[0]?.nombre }, photos: S.fotos, reply: { text: 'Recibí la imagen.', options: [], sources: [] }, usage: USO };
    S.subidas.set(key, result);
    return { status: 201, json: result };
  };
  const i = S.guion.findIndex((g) => g.ruta === url.pathname && (!g.metodo || g.metodo === req.method));
  const g = i >= 0 ? S.guion.splice(i, 1)[0] : null;
  /* Conexión caída: la respuesta se pierde (el servidor pudo haber procesado el mensaje igual). Se corta todo lo que
     llegue durante 1,5 s, también el reenvío que el propio navegador hace cuando falla un socket reutilizado */
  if (S.cortarHasta > Date.now()) { req.socket.destroy(); return; }
  if (g?.cortar) {
    if (g.procesar) await turno();
    S.cortarHasta = Date.now() + 1500;
    req.socket.destroy();
    return;
  }
  if (g) {
    if (g.procesarFoto) foto();
    await sleep(g.retardo || 0);
    if (g.html !== undefined) { res.writeHead(g.status, { ...cors, 'Content-Type': 'text/html' }); res.end(g.html); return; }
    json(g.status, g.json || {});
    return;
  }
  if (url.pathname === '/api/chat/config' && req.method === 'GET') { json(200, { attachments: S.limites, ...(S.antiguo ? {} : { remember: S.remember ?? RECORDAR }) }); return; }
  /* El formulario «Cotiza tu retiro» (POST /api/quotes): con el token de una sesión del chat queda ligada a ella y
     trae el mensaje que el chat muestra (D-17 del asistente); sin token, como desde el sitio */
  if (url.pathname === '/api/quotes' && req.method === 'POST') {
    const ligada = S.tokens.has(token);
    json(201, { received: true, reference: 'TA-000777', delivered: true, ...(ligada ? { chat_message: 'Listo, recibimos tu solicitud de cotización. Tu número es TA-000777.' } : {}) });
    return;
  }
  if (url.pathname === '/api/chat/sessions' && req.method === 'POST') {
    const t = `tok-${++S.n}`;
    S.tokens.add(t);
    json(201, { token: t, expires_at: new Date(Date.now() + 3600e3).toISOString(), reply: MENU, usage: { ...USO, used: 0, remaining: 10 } });
    return;
  }
  /* El asistente anterior solo tiene DELETE /session: Laravel responde 405 antes de mirar el token */
  if (S.antiguo && url.pathname === '/api/chat/session' && req.method === 'GET') { json(405, { message: 'The GET method is not supported for route api/chat/session. Supported methods: DELETE.' }); return; }
  if (!S.tokens.has(token)) { json(401, { error: 'session_expired' }); return; }
  if (url.pathname === '/api/chat/messages' && req.method === 'POST') { const r = await turno(); json(r.status, r.json); return; }
  if (url.pathname === '/api/chat/history' && req.method === 'GET') {
    const ultimaDelAsistente = [...S.historial].reverse().find((m) => m.role === 'assistant');
    const reply = S.reply !== undefined ? S.reply : ultimaDelAsistente ? (({ role, client_message_id, ...r }) => r)(ultimaDelAsistente) : null;
    /* De a 50: con `S.anteriores`, la primera página trae next_before y ?before= entrega esos mensajes */
    if (!S.antiguo && url.searchParams.has('before')) { json(200, { messages: url.searchParams.get('before') === 'pagina-2' ? S.anteriores || [] : [], next_before: null, reply, usage: USO, photos: S.fotos }); return; }
    json(200, { messages: S.historial, usage: USO, photos: S.fotos, ...(S.antiguo ? {} : { reply, next_before: S.anteriores ? 'pagina-2' : null }) });
    return;
  }
  if (url.pathname === '/api/chat/session' && req.method === 'GET') { json(200, COPIA); return; }
  if (url.pathname === '/api/chat/session' && req.method === 'DELETE') {
    if (cuerpo.confirm !== true) { json(422, { error: 'confirmation_required' }); return; }
    S.tokens.delete(token);
    json(200, { deleted: true });
    return;
  }
  if (url.pathname === '/api/chat/attachments' && req.method === 'POST') {
    const r = foto();
    json(r.status, r.json);
    return;
  }
  res.writeHead(404, cors);
  res.end();
});

await Promise.all([new Promise((r) => sitio.listen(0, '127.0.0.1', r)), new Promise((r) => asistente.listen(0, '127.0.0.1', r))]);
const SITIO = `http://127.0.0.1:${sitio.address().port}`;
const API = `http://127.0.0.1:${asistente.address().port}`;
const de = (ruta, metodo) => llamadas.filter((l) => l.ruta === `/api/chat${ruta}` && (!metodo || l.metodo === metodo));
const reiniciarAsistente = () => {
  llamadas.length = 0;
  Object.assign(S, { subidas: new Map(), procesados: new Map(), enCurso: new Set(), ejecuciones: 0, duplicados: 0, guion: [], retardos: [], historial: [], fotos: 0, cortarHasta: 0, limites: { ...LIMITES_FOTOS }, reply: undefined, antiguo: false, remember: undefined, anteriores: null });
};

/* ======================= Navegador ======================= */

const perfil = mkdtempSync(join(tmpdir(), 'ta-widget-'));
const puerto = 9400 + Math.floor(Math.random() * 400);
const nav = spawn(NAVEGADOR, ['--headless=new', `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });
let objetivos = [];
for (let i = 0; i < 100 && !objetivos.length; i++) { try { objetivos = (await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json()).filter((t) => t.type === 'page'); } catch { /* aún arranca */ } await sleep(100); }
if (!objetivos.length) throw new Error('el navegador no abrió una página');
const ws = new WebSocket(objetivos[0].webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pendientes = new Map();
const oyentes = new Set();
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pendientes.has(msg.id)) { pendientes.get(msg.id)(msg); pendientes.delete(msg.id); } else oyentes.forEach((f) => f(msg));
});
const cdp = (method, params = {}) => new Promise((r) => { const i = ++id; pendientes.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const errores = [];
const pedidos = [];  // todas las direcciones que pidió la página (para saber que nada sale a WordPress ni a internet)
oyentes.add((m) => {
  if (m.method === 'Runtime.exceptionThrown') errores.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
  if (m.method === 'Network.requestWillBeSent') pedidos.push(m.params.request.url);
});
const evaluar = async (fn, ...args) => {
  const r = await cdp('Runtime.evaluate', { expression: `(${fn})(${args.map((a) => JSON.stringify(a)).join(',')})`, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
const hasta = async (fn, que, ms = 8000, ...args) => {
  for (const fin = Date.now() + ms; Date.now() < fin; await sleep(80)) if (await evaluar(fn, ...args)) return true;
  throw new Error(`no ocurrió a tiempo: ${que}`);
};
/* Lo mismo, con una condición de este lado (las llamadas que recibió el asistente) */
const hastaAca = async (cond, que, ms = 8000) => {
  for (const fin = Date.now() + ms; Date.now() < fin; await sleep(80)) if (await cond()) return true;
  throw new Error(`no ocurrió a tiempo: ${que}`);
};
const sinEspera = () => evaluar(() => !document.querySelector('[data-agente-charla] .is-espera'));
await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Network.enable');
await cdp('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*', '*jsdelivr.net*', '*unpkg.com*', '*openstreetmap.org*', '*challenges.cloudflare.com*', '*wa.me*', '*bcn.cl*', '*evil.example*', '*wordpress.ejemplo*'] });
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
/* Ventanas abiertas, violaciones de CSP y descargas: «Descargar mis datos» arma un blob: y hace clic en un enlace con
   download; aquí se anota su nombre y su contenido y no se descarga nada */
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.__abiertas = []; window.open = (...a) => { window.__abiertas.push(String(a[0])); return null; };
  window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));
  window.__descargas = []; const __blobs = new Map(); const __crear = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (b) => { const u = __crear(b); __blobs.set(u, b); return u; };
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[download]');
    if (!a) return;
    e.preventDefault();
    const d = { nombre: a.download, conectado: a.isConnected, tipo: __blobs.get(a.href)?.type || '', texto: null };
    window.__descargas.push(d);
    __blobs.get(a.href)?.text().then((t) => { d.texto = t; });
  }, true);` });
let wp = null;
const conWordPress = async (config) => {
  if (wp) { await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: wp }); wp = null; }
  if (config) wp = (await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.TA_API = ${JSON.stringify(config)};` })).result.identifier;
};
const pestanas = async () => (await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json()).filter((t) => t.type === 'page' && t.id !== objetivos[0].id);
const navegar = async (url, { limpiar = true } = {}) => {
  if (limpiar) await evaluar(() => { try { sessionStorage.clear(); localStorage.removeItem('agente-chat-datos'); localStorage.removeItem('agente-chat-sesion'); } catch { /* about:blank */ } return true; });
  const cargada = new Promise((r) => { const f = (m) => { if (m.method === 'Page.loadEventFired') { oyentes.delete(f); r(); } }; oyentes.add(f); });
  await cdp('Page.navigate', { url });
  await cargada;
  await hasta(() => document.readyState === 'complete' && !!document.querySelector('[data-agente]'), 'página cargada');
  await sleep(150);
};
const pagUrl = (q = '') => `${SITIO}/transporte-autorizado.html${q}`;
const local = (extra = '') => pagUrl(`?asistente=${encodeURIComponent(API)}${extra}`);

/* ---------- Acciones en la página ---------- */
const abrir = () => evaluar(() => { window.AGENTE.abrir(); return true; });
const entrar = async () => {
  await hasta(() => !!document.querySelector('.agente-puerta'), 'la puerta del chat');
  await evaluar(() => {
    const f = document.querySelector('.agente-puerta');
    f.elements.name.value = 'Persona Chat';
    f.elements.email.value = 'chat@ejemplo.cl';
    f.elements.phone.value = '+56 9 8765 4321';
    f.elements.privacy_accepted.checked = true;
    f.requestSubmit();
    return true;
  });
  await hasta(() => !document.querySelector('.agente-puerta') && !document.querySelector('[data-agente-form]').hidden, 'sesión abierta');
};
const escribir = (texto) => evaluar((t) => { const f = document.querySelector('[data-agente-form]'); f.elements.q.value = t; f.requestSubmit(); return true; }, texto);
const textos = () => evaluar(() => [...document.querySelectorAll('[data-agente-charla] .msg')].map((m) => (m.classList.contains('is-user') ? `> ${m.textContent}` : m.querySelector('.msg-texto')?.textContent || (m.classList.contains('is-espera') ? '…' : ''))));
const ultimo = () => evaluar(() => { const m = [...document.querySelectorAll('[data-agente-charla] .msg.is-bot:not(.is-espera)')].pop(); return m?.querySelector('.msg-texto')?.textContent || ''; });
const botones = () => evaluar(() => { const m = [...document.querySelectorAll('[data-agente-charla] .msg.is-bot:not(.is-espera)')].pop(); return [...(m?.querySelectorAll('.msg-chips button') || [])].map((b) => `${b.textContent}${b.disabled ? ' (inactivo)' : ''}`); });
const tocar = (rotulo, veces = 1) => evaluar((r, n) => {
  const b = [...document.querySelectorAll('[data-agente-charla] .msg-chips button')].filter((x) => x.textContent === r).pop();
  if (!b) return false;
  for (let i = 0; i < n; i++) b.click();
  return true;
}, rotulo, veces);
const esperaVisible = () => evaluar(() => !!document.querySelector('[data-agente-charla] .is-espera'));
const guardado = () => evaluar(() => sessionStorage.getItem('agente-chat'));
const ids = (ruta = '/messages') => de(ruta, 'POST').map((l) => l.cuerpo.client_message_id);
const iguales = (a) => a.length > 0 && a.every((x) => x === a[0]);
const enCarpeta = async () => {
  const s = await guardado();
  return s ? Object.keys(JSON.parse(s)).sort().join(',') : '';
};

/* Imágenes armadas en la página: PNG con transparencia, JPEG con un bloque EXIF (con «ubicación») y un archivo roto */
const fotos = {
  png: `async (nombre) => { const c = document.createElement('canvas'); c.width = 2400; c.height = 1200; const x = c.getContext('2d'); x.fillStyle = 'rgba(200,30,30,.6)'; x.fillRect(100, 100, 1000, 600);
    return new File([await new Promise((r) => c.toBlob(r, 'image/png'))], nombre || 'Foto de Juan Pérez 12.345.678-9.png', { type: 'image/png', lastModified: 1 }); }`,
  exif: `async () => { const c = document.createElement('canvas'); c.width = 800; c.height = 600; const x = c.getContext('2d'); x.fillStyle = '#4a7'; x.fillRect(0, 0, 800, 600);
    const jpg = new Uint8Array(await (await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9))).arrayBuffer());
    const datos = new TextEncoder().encode('Exif\\0\\0MM\\0*\\0\\0\\0\\x08\\0\\0UBICACION-SECRETA-33.45-70.66');
    const app1 = new Uint8Array([0xFF, 0xE1, (datos.length + 2) >> 8, (datos.length + 2) & 255, ...datos]);
    return new File([jpg.slice(0, 2), app1, jpg.slice(2)], 'camara.jpg', { type: 'image/jpeg', lastModified: 2 }); }`,
  rota: `async () => new File([new Uint8Array([0xFF, 0xD8, 0xFF, 1, 2, 3, 4, 5, 6, 7])], 'rota.jpg', { type: 'image/jpeg', lastModified: 3 })`,
  gif: `async () => new File([new Uint8Array([71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 0, 0, 0, 59])], 'animada.gif', { type: 'image/gif', lastModified: 4 })`,
  pesada: `async () => new File([new Uint8Array(26 * 1024 * 1024)], 'enorme.png', { type: 'image/png', lastModified: 5 })`
};
const FABRICA = `({ ${Object.entries(fotos).map(([k, v]) => `${k}: ${v}`).join(', ')} })`;
const elegirFotos = (...tipos) => evaluar(`async () => {
  const F = ${FABRICA};
  const dt = new DataTransfer();
  for (const t of ${JSON.stringify(tipos)}) dt.items.add(await F[t]());
  const input = document.querySelector('[data-agente-form] input[type="file"]');
  input.files = dt.files;
  input.dispatchEvent(new Event('change'));
  return true;
}`);
const fotosForm = () => evaluar(() => document.querySelectorAll('[data-adjuntos] .adjuntos-list .adjunto').length);
/* El formulario de la última respuesta y la casilla «Recordar» de la puerta, ya con lo que dice el asistente */
const ultimoFormulario = `() => [...document.querySelectorAll('[data-agente-charla] [data-edicion]')].pop()`;
const formularioListo = () => hasta(() => !!document.querySelector('[data-agente-charla] [data-edicion] fieldset:not(:disabled)'), 'el formulario de la respuesta');
const casillaLista = () => hasta(() => document.querySelector('.agente-puerta input[name="remember"]')?.disabled === false, 'la casilla «Recordar» lista');
const charlaTexto = () => evaluar(() => document.querySelector('[data-agente-charla]').textContent);
/* Otro documento del mismo sitio (un <iframe>, con el mismo localStorage): lo que cambia ahí llega a la página como un
   evento storage, igual que desde otra pestaña */
const desdeOtroDocumento = (codigo) => evaluar(`async () => {
  const f = document.createElement('iframe');
  f.src = '${SITIO}/robots.txt';
  f.hidden = true;
  const cargado = await new Promise((r) => { f.onload = () => r(true); setTimeout(() => r(false), 5000); document.body.append(f); });
  if (!cargado) throw new Error('el documento de prueba no cargó');
  (${codigo})(f.contentWindow);
  await new Promise((r) => setTimeout(r, 50));
  f.remove();
  return true;
}`);

/* ======================= Pruebas ======================= */

try {
  seccion(`Widget del chat (${NAVEGADOR.split('/').pop()} sin interfaz; asistente Laravel simulado)`);

  seccion('1. Configuración de la API por entorno');
  {
    reiniciarAsistente();
    await conWordPress(null);
    await navegar(pagUrl());
    await abrir();
    await sleep(300);
    const v = await evaluar(() => ({ maqueta: typeof window.AGENTE?.buscar === 'function', tag: document.querySelector('.agente-tag')?.textContent || '' }));
    ok(v.maqueta && v.tag === '' && llamadas.length === 0, 'vista previa sin dirección (GitHub Pages): responde la maqueta, sin rótulo de maqueta (22-10), y no hay llamadas al asistente');

    await conWordPress({ url: 'https://wordpress.ejemplo/wp-json/ta/v1/', v: '1.3.0' });
    await navegar(pagUrl());
    await abrir();
    await hasta(() => /no está disponible/.test(document.querySelector('[data-agente-charla]').textContent), 'aviso de no disponible');
    const w = await evaluar(() => ({ maqueta: typeof window.AGENTE?.buscar === 'function', form: document.querySelector('[data-agente-form]').hidden, sub: document.querySelector('.agente-quien p').textContent }));
    ok(!w.maqueta && w.form && /No disponible/.test(w.sub), 'WordPress sin dirección del asistente: la ventana avisa que no está disponible, sin campo para escribir ni maqueta');
    ok(llamadas.length === 0 && !pedidos.some((u) => /wordpress\.ejemplo|\/api\/chat/.test(u)), 'sin dirección no hay llamadas al asistente ni a WordPress');

    await conWordPress({ url: 'https://wordpress.ejemplo/wp-json/ta/v1/', v: '1.3.0', asistente: API });
    await navegar(pagUrl());
    await abrir();
    await hasta(() => !!document.querySelector('.agente-puerta'), 'puerta con la dirección del plugin');
    ok(!(await evaluar(() => typeof window.AGENTE?.buscar === 'function')), 'WordPress con la dirección del plugin (TA_API.asistente): responde el asistente y la maqueta se aparta');

    await conWordPress(null);
    await navegar(local());
    await abrir();
    await hasta(() => !!document.querySelector('.agente-puerta'), 'puerta con ?asistente=');
    await navegar(pagUrl(), { limpiar: false });
    await abrir();
    const recordada = await evaluar(() => !!document.querySelector('.agente-puerta') && sessionStorage.getItem('ta-asistente'));
    ok(recordada === API, 'en este computador, ?asistente=… configura la dirección y la pestaña la recuerda (la misma de las cotizaciones)');
    await navegar(pagUrl('?agente=maqueta'), { limpiar: false });
    ok(await evaluar(() => typeof window.AGENTE?.buscar === 'function'), '?agente=maqueta fuerza la maqueta en local aunque haya dirección');
    const html = readFileSync(join(ROOT, 'transporte-autorizado.html'), 'utf8') + readFileSync(join(ROOT, 'agente-virtual.html'), 'utf8');
    ok(!/data-agente-api-local|data-agente-api="[^"]+"/.test(html), 'las páginas publicadas no llevan una dirección fija del asistente (ni local ni otra)');
    const https = await evaluar(() => sessionStorage.removeItem('ta-asistente') || [window.SITE.asistente('https://asistente.ejemplo.cl/base/'), window.SITE.asistente('javascript:alert(1)'), window.SITE.asistente('ftp://x.cl')]);
    ok(https[0] === 'https://asistente.ejemplo.cl/base' && https[1] === '' && https[2] === '', 'la dirección se valida (https; fuera de este computador no se acepta http, ver tools/pruebas/plugin.php y integracion.mjs)');
  }

  seccion('2-4. Sesión, mensaje y opciones');
  {
    reiniciarAsistente();
    await navegar(local());
    await abrir();
    await entrar();
    const s = de('/sessions', 'POST');
    ok(s.length === 1 && s[0].cuerpo.name === 'Persona Chat' && s[0].cuerpo.privacy_accepted === true && s[0].cuerpo.marketing_accepted === false && s[0].cuerpo.website === '' && s[0].origen === SITIO,
      'la puerta abre la sesión con POST /api/chat/sessions (datos, aviso aceptado, contacto comercial sin marcar, campo trampa vacío) desde el origen del sitio');
    ok((await enCarpeta()) === 'fotos,token,vence' && !/chat@ejemplo|Persona/.test(await guardado()), 'sin «Recordar» y sin formulario abierto, la pestaña guarda el token, su vencimiento y el número de fotos: ni nombre ni correo');
    ok(!(await evaluar(() => localStorage.getItem('agente-chat-sesion') || localStorage.getItem('agente-chat-datos'))), 'con la casilla sin marcar, nada queda en este dispositivo (ni la sesión ni los datos)');
    ok((await botones()).join('|') === 'Retiro de residuos|Normativa', 'el saludo trae las opciones del asistente');
    await escribir('¿Qué es un residuo peligroso?');
    await hasta(() => /Respuesta a «¿Qué es un residuo peligroso\?»/.test(document.querySelector('[data-agente-charla]').textContent), 'respuesta');
    const m = de('/messages', 'POST')[0];
    ok(m && m.cuerpo.text === '¿Qué es un residuo peligroso?' && /^[A-Za-z0-9_-]{8,64}$/.test(m.cuerpo.client_message_id) && m.token === 'tok-1', 'el mensaje va con su texto, un client_message_id válido y el token Bearer');
    ok((await evaluar(() => document.querySelector('.agente-quien p').textContent)) === '', 'con muchas consultas disponibles (usage 9 de 10) no muestra el consumo: solo avisa cuando quedan 3 o menos');
    ok((await evaluar(() => [...document.querySelectorAll('[data-agente-charla] [data-opcion]')].filter((b) => b.disabled).length)) === 2, 'las opciones del saludo quedan inactivas al llegar otra respuesta');
    await tocar('Otra consulta');
    await hasta(() => /Respuesta a «otra»/.test(document.querySelector('[data-agente-charla]').textContent), 'respuesta a la opción');
    const o = de('/messages', 'POST').pop();
    ok(o.cuerpo.option_id === 'otra' && o.cuerpo.text === undefined && (await textos()).includes('> Otra consulta'), 'una opción envía su option_id y se ve su rótulo como mensaje propio');
  }

  seccion('2-4b. «Solicitar cotización» del buscador de transportistas');
  {
    reiniciarAsistente();
    await navegar(local());
    const CTX = { carrier: 'Transportes Ejemplo SpA', place: 'Lampa', resolution: 'Res. 1/2020', waste_kind: 'peligroso', waste: 'Asbesto' };
    const aceptado = await evaluar((c) => window.AGENTE.cotizar(c), CTX);
    await hasta(() => !!document.querySelector('.agente-puerta'), 'la puerta, sin sesión');
    ok(aceptado === true && de('/messages', 'POST').length === 0, 'sin sesión, el pedido espera la puerta: no se envía nada antes de los datos');
    await entrar();
    await hasta(() => /Respuesta a «cotizar_retiro»/.test(document.querySelector('[data-agente-charla]').textContent), 'cotización abierta');
    const c = de('/messages', 'POST');
    ok(c.length === 1 && c[0].cuerpo.option_id === 'cotizar_retiro' && JSON.stringify(c[0].cuerpo.quote_context) === JSON.stringify(CTX),
      'al abrir la sesión se abre la cotización (option_id cotizar_retiro) con el transportista y el residuo del buscador');
    ok((await textos()).includes('> Solicitar cotización a Transportes Ejemplo SpA'), 'el mensaje propio nombra al transportista');
    await evaluar(() => window.AGENTE.cotizar({ carrier: 'Otro Transportista', waste_kind: 'no-peligroso', waste: 'Vidrio' }));
    await hasta(() => /Solicitar cotización a Otro Transportista/.test(document.querySelector('[data-agente-charla]').textContent) && !document.querySelector('.is-espera'), 'segundo pedido');
    for (let n = 0; n < 40 && de('/messages', 'POST').length < 2; n++) await sleep(50);
    const d2 = de('/messages', 'POST')[1];
    ok(d2.cuerpo.quote_context.carrier === 'Otro Transportista' && d2.cuerpo.client_message_id !== c[0].cuerpo.client_message_id, 'con sesión se envía al tiro, como otro mensaje (otro identificador)');
    ok((await evaluar(() => window.AGENTE.cotizar({}))) === false, 'sin transportista no hace nada (el buscador abre WhatsApp)');
  }

  seccion('Cotizar desde el chat: abre el formulario «Cotiza tu retiro» del sitio (D-17 del asistente)');
  {
    reiniciarAsistente();
    await navegar(local());
    await abrir();
    await entrar();
    await hasta(() => !document.querySelector('[data-agente-charla] .is-espera') && !document.querySelector('[data-agente-form]').hidden, 'el chat listo');
    const ABRE = {
      text: 'Te abro el formulario «Cotiza tu retiro» con tus datos de contacto ya puestos.', intent: 'quote_form',
      sources: [{ label: 'Formulario «Cotiza tu retiro»', url: 'https://transporteautorizado.cl/#cotizar' }],
      options: [{ id: 'hablar_especialista', label: 'Hablar con un especialista' }],
      form: { action: 'abrir_cotizacion', answers: { nombre: 'Persona Chat', correo: 'chat@ejemplo.cl', telefono: '+56 9 8765 4321', empresa: 'Empresa Chat' } }
    };
    S.guion.push({ ruta: '/api/chat/messages', status: 200, json: { reply: ABRE, usage: USO } });
    await escribir('Necesito retirar 500 kg de cartón en Quilicura');
    await hasta(() => document.getElementById('cotizacion')?.checkVisibility?.() && document.querySelector('[data-agente]').hidden, 'el formulario abierto y el chat cerrado');
    const f = await evaluar(() => { const e = document.getElementById('cotizacion').elements; return Object.fromEntries(['nombre', 'correo', 'telefono', 'empresa', 'categoria', 'cantidad', 'comuna', 'tipo'].map((k) => [k, e[k].value])); });
    ok(f.nombre === 'Persona Chat' && f.correo === 'chat@ejemplo.cl' && f.telefono === '+56 9 8765 4321' && f.empresa === 'Empresa Chat', 'el formulario llega con los datos de contacto del chat');
    ok(f.categoria === 'Papel y cartón' && f.tipo === 'no-peligroso' && !!f.cantidad && f.comuna === 'Quilicura', `y con lo que se entendió de lo escrito (${f.categoria} · ${f.cantidad} · ${f.comuna})`);
    const tipoMarcado = await evaluar(() => document.querySelector('[data-tipo-residuo][aria-checked="true"]')?.dataset.tipoResiduo);
    ok(tipoMarcado === 'no-peligroso', 'el tipo de residuo queda marcado en su fila de un toque');
    const plegado = await evaluar(() => {
      const fo = document.getElementById('cotizacion');
      const mas = fo.querySelector('[data-mas-detalles]');
      const antes = mas.open;
      fo.querySelector('[data-tipo-residuo="peligroso"]').click();
      const peligroso = { tipo: fo.elements.tipo.value, categoria: fo.elements.categoria.value };
      fo.querySelector('[data-tipo-residuo="no-peligroso"]').click();
      window.QUOTE.fill({ answers: { residuo: 'Papel y cartón', almacenamiento: window.PICK.STORAGE?.[0]?.[0] || 'Sacos' } });
      return { antes, peligroso, despues: mas.open };
    });
    ok(plegado.peligroso.tipo === 'peligroso' && plegado.peligroso.categoria === '', 'tocar «Peligroso» quita un residuo no peligroso ya elegido');
    ok(plegado.antes === false && plegado.despues === true, '«Agregar más detalles» parte cerrado y se abre solo cuando llega algo para adentro');
    /* El chat: un botón para volver a abrirlo, sin la fuente del respaldo y con la caja de texto disponible */
    await abrir();
    const enChat = await evaluar(() => { const m = [...document.querySelectorAll('[data-agente-charla] .msg.is-bot')].pop(); return { boton: [...m.querySelectorAll('button')].some((b) => b.textContent.includes('Abrir el formulario')), fuente: !!m.querySelector('.msg-fuentes'), caja: !document.querySelector('[data-agente-form]').hidden }; });
    ok(enChat.boton && !enChat.fuente && enChat.caja, 'en el chat queda «Abrir el formulario», sin la fuente de respaldo y con la caja de texto');
    /* Enviar desde el formulario: lleva el token del chat y la confirmación vuelve a la conversación */
    await evaluar(() => {
      const b = [...[...document.querySelectorAll('[data-agente-charla] .msg.is-bot')].pop().querySelectorAll('button')].find((x) => x.textContent.includes('Abrir el formulario'));
      b.click();
      return true;
    });
    await hasta(() => document.getElementById('cotizacion')?.checkVisibility?.(), 'el formulario abierto otra vez');
    const listo = await evaluar(() => {
      const fo = document.getElementById('cotizacion');
      window.QUOTE.fill({ answers: { direccion: 'Avenida Chat 123', modalidad: window.PICK.MODE_LABEL.express } });
      fo.goTo(Infinity);
      const aviso = fo.querySelector('[name="aviso"]');
      if (!aviso.disabled) aviso.checked = true;
      fo.requestSubmit();
      const resumen = document.getElementById('cotizacion-resumen');
      if (resumen.hidden) return false;
      document.querySelector('[data-cotizar-enviar]').click();
      return true;
    });
    ok(listo, 'el formulario prellenado se prepara con la dirección y el plan');
    for (let n = 0; n < 60 && !llamadas.some((l) => l.ruta === '/api/quotes'); n++) await sleep(50);
    const q = llamadas.filter((l) => l.ruta === '/api/quotes');
    const sesionToken = JSON.parse(await guardado()).token;
    ok(q.length === 1 && q[0].token === sesionToken, 'la solicitud va a /api/quotes con el token de la conversación');
    await hasta(() => [...document.querySelectorAll('[data-agente-charla] .msg.is-bot')].some((m) => m.textContent.includes('TA-000777')), 'la confirmación en el chat');
    ok(true, 'el chat muestra la confirmación con el número de la solicitud');
    /* Después de enviarla se suelta: otra solicitud desde el sitio ya no va ligada */
    const otra = await evaluar(() => {
      document.querySelector('#cotizacion-resumen [data-edit]').click();
      const fo = document.getElementById('cotizacion');
      fo.elements.comentarios.value = 'otra';
      fo.goTo(Infinity);
      fo.querySelector('[name="aviso"]').checked = true;
      fo.requestSubmit();
      document.querySelector('[data-cotizar-enviar]').click();
      return true;
    });
    for (let n = 0; n < 60 && llamadas.filter((l) => l.ruta === '/api/quotes').length < 2; n++) await sleep(50);
    const q2 = llamadas.filter((l) => l.ruta === '/api/quotes');
    ok(otra && q2.length === 2 && q2[1].token === '', 'la solicitud siguiente, ya sin abrirla desde el chat, va sin token');
    /* Deja la página como la encontró: el formulario cerrado y el chat abierto, para las secciones que siguen */
    await evaluar(() => { document.dispatchEvent(new CustomEvent('hero:close', { bubbles: true })); return true; });
    await hasta(() => !document.getElementById('cotizacion')?.checkVisibility?.() || !document.querySelector('.hero-sheet[open]'), 'el formulario cerrado');
    await abrir();
    await hasta(() => !document.querySelector('[data-agente]').hidden && !document.querySelector('[data-agente-form]').hidden, 'el chat abierto otra vez');
  }

  seccion('Edición de datos antes de confirmar la solicitud');
  {
    const editor = {
      text: 'Revisa y corrige tus datos. Guardar cambios no envía la solicitud.', intent: 'lead_qualification', sources: [],
      form: { action: 'guardar_datos', submit_label: 'Guardar cambios', draft_id: 'edicion-1', fields: [
        { name: 'name', label: 'Nombre', type: 'text', value: 'Persona Chat', required: true, max_length: 150 },
        { name: 'company_name', label: 'Empresa', type: 'text', value: 'Empresa de prueba', required: true, max_length: 150 },
        { name: 'phone_number', label: 'Teléfono', type: 'tel', value: '+56 9 8765 4321', required: true, max_length: 30 },
        { name: 'email', label: 'Correo', type: 'email', value: 'chat@ejemplo.cl', required: true, max_length: 150 },
        { name: 'handoff_reason', label: 'Motivo', type: 'textarea', value: 'Retirar cartón <img src=x onerror="window.__xss=1">', required: true, max_length: 2000 }
      ] }, options: [{ id: 'contacto:name', label: 'Nombre' }, { id: 'cancelar', label: 'Cancelar' }]
    };
    const mostrarEditor = async () => {
      S.guion.push({ ruta: '/api/chat/messages', status: 200, json: { reply: editor, usage: USO } });
      await escribir('Quiero corregir mis datos');
      await hasta(() => !!document.querySelector('[data-edicion] fieldset:not(:disabled)'), 'campos de edición');
    };
    await mostrarEditor();
    ok(await evaluar(() => {
      const f = document.querySelector('[data-edicion]');
      return f.elements.name.value === 'Persona Chat' && f.elements.email.value === 'chat@ejemplo.cl'
        && f.elements.handoff_reason.tagName === 'TEXTAREA' && f.querySelectorAll('label').length === 5
        && !f.querySelector('img') && !window.__xss && !document.querySelector('[data-agente-form]').hidden;
    }), 'los cinco campos se precargan con etiquetas, los valores se muestran como texto seguro y la caja de texto sigue a la vista');
    ok((await botones()).join('|') === 'Cancelar', 'con inputs no se repiten los botones para corregir campo por campo');
    const antes = de('/messages', 'POST').length;
    await evaluar(() => {
      const f = document.querySelector('[data-edicion]');
      f.elements.email.value = 'correo incorrecto'; f.requestSubmit(); return true;
    });
    await sleep(150);
    ok(de('/messages', 'POST').length === antes, 'un correo inválido impide guardar desde el navegador');
    await evaluar(() => {
      const f = document.querySelector('[data-edicion]');
      f.elements.email.value = 'popito@example.test'; f.elements.name.value = 'Popito Zalas';
      f.elements.handoff_reason.value = 'Retirar madera';
      ['email', 'name', 'handoff_reason'].forEach((n) => f.elements[n].dispatchEvent(new Event('input', { bubbles: true }))); return true;
    });
    const enEdicion = JSON.parse(await guardado()).borrador;
    ok(enEdicion?.id === 'edicion-1' && enEdicion.valores.name === 'Popito Zalas' && enEdicion.valores.handoff_reason === 'Retirar madera' && !('company_name' in enEdicion.valores),
      'mientras se escribe, lo cambiado (solo eso) queda en la pestaña como borrador del draft_id del formulario');
    for (const [width, height] of [[1280, 900], [390, 844]]) {
      await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
      ok(await evaluar(() => {
        const f = document.querySelector('[data-edicion]');
        return [...f.querySelectorAll('input, textarea')].every((el) => {
          const b = el.getBoundingClientRect(); const p = f.getBoundingClientRect();
          return b.width > 0 && b.left >= p.left && b.right <= p.right + 1 && parseFloat(getComputedStyle(el).fontSize) >= 16;
        });
      }), `los inputs caben y conservan 16 px a ${width} px`);
    }
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    S.guion.push({ ruta: '/api/chat/messages', status: 200, json: { reply: { text: 'Datos revisados: Popito Zalas. Motivo: Retirar madera. Confirma para enviar.', options: [{ id: 'confirmar', label: 'Sí, enviar' }], sources: [] }, usage: USO } });
    await evaluar(() => { const f = document.querySelector('[data-edicion]'); f.requestSubmit(); f.requestSubmit(); return true; });
    await hasta(() => /Datos revisados/.test(document.querySelector('[data-agente-charla]').textContent), 'resumen actualizado');
    const enviados = de('/messages', 'POST').slice(antes);
    ok(enviados.length === 1 && enviados[0].cuerpo.option_id === 'guardar_datos'
      && enviados[0].cuerpo.form_values.name === 'Popito Zalas' && enviados[0].cuerpo.form_values.handoff_reason === 'Retirar madera',
      'nombre y motivo se guardan juntos, estructurados y una sola vez, sin confirmar el envío');
    ok(await evaluar(() => document.querySelector('[data-edicion] fieldset').disabled && !document.querySelector('[data-agente-form]').hidden), 'el editor anterior queda inactivo tras guardar');
    ok(!JSON.parse(await guardado()).borrador && !(await guardado()).includes('Popito') && !(await guardado()).includes('Retirar madera'), 'al guardar se borra el borrador: la respuesta ya no trae ese formulario y nada de lo escrito queda en la pestaña');

    S.historial = [{ role: 'assistant', ...editor }];
    await navegar(local(), { limpiar: false }); await abrir();
    await hasta(() => !!document.querySelector('[data-edicion]'), 'editor restaurado del historial');
    ok(await evaluar(() => !document.querySelector('[data-edicion] fieldset').disabled), 'al recargar se restaura el editor pendiente');
    S.guion.push({ ruta: '/api/chat/messages', status: 200, json: { reply: { ...editor, form: { ...editor.form, fields: editor.form.fields.map((f) => f.name === 'phone_number' ? { ...f, value: '123', error: 'Revisa el teléfono.' } : f) } }, usage: USO } });
    await evaluar(() => { const f = document.querySelector('[data-edicion]'); f.elements.phone_number.value = '123'; f.requestSubmit(); return true; });
    await hasta(() => !!document.querySelector('[aria-invalid="true"]'), 'error del servidor');
    ok(await evaluar(() => {
      const el = document.querySelector('[data-edicion]:last-of-type [aria-invalid="true"]') || document.querySelector('[aria-invalid="true"]');
      return el.value === '123' && !!document.getElementById(el.getAttribute('aria-describedby')) && document.activeElement === el;
    }), 'el error del servidor conserva el dato y enfoca el campo con su explicación accesible');
  }

  seccion('5-10. Reintentos con el mismo identificador');
  {
    /* 503 del modelo: «Reintentar» usa el mismo identificador */
    reiniciarAsistente();
    S.guion.push({ ruta: '/api/chat/messages', status: 503, json: { error: 'unavailable', message: 'No pude generar una respuesta en este momento.' } });
    await escribir('Primera pregunta');
    await hasta(() => !document.querySelector('.is-espera') && /No pude generar/.test(document.querySelector('[data-agente-charla]').textContent), '503');
    ok((await botones()).includes('Reintentar'), '503 unavailable: muestra el mensaje del asistente y «Reintentar»');
    await tocar('Reintentar', 3);
    await hasta(() => /Respuesta a «Primera pregunta»/.test(document.querySelector('[data-agente-charla]').textContent), 'respuesta tras reintentar');
    ok(ids().length === 2 && iguales(ids()), 'el reintento manual conserva el client_message_id (y tres toques a «Reintentar» hacen una sola llamada)');

    /* 409 busy: dos reintentos solos, con el mismo identificador */
    reiniciarAsistente();
    S.guion.push({ ruta: '/api/chat/messages', status: 409, json: { error: 'busy' } }, { ruta: '/api/chat/messages', status: 409, json: { error: 'busy' } });
    await escribir('Pregunta ocupada');
    await hasta(() => /Respuesta a «Pregunta ocupada»/.test(document.querySelector('[data-agente-charla]').textContent), 'respuesta tras busy', 15000);
    ok(ids().length === 3 && iguales(ids()) && !(await botones()).includes('Reintentar'), '409 busy: se reintenta solo (dos veces, con pausa) con el mismo identificador y llega la respuesta');
    reiniciarAsistente();
    for (let i = 0; i < 3; i++) S.guion.push({ ruta: '/api/chat/messages', status: 409, json: { error: 'busy' } });
    await escribir('Siempre ocupada');
    await hasta(() => !document.querySelector('.is-espera') && /Todavía estoy preparando/.test(document.querySelector('[data-agente-charla]').textContent), 'busy agotado', 15000);
    ok(ids().length === 3 && (await botones()).includes('Reintentar'), '409 busy repetido: después de dos reintentos solos se detiene y ofrece «Reintentar» (sin bucle)');
    await escribir('Siempre ocupada');
    await hasta(() => /Respuesta a «Siempre ocupada»/.test(document.querySelector('[data-agente-charla]').textContent), 'misma pregunta escrita otra vez');
    ok(ids().length === 4 && iguales(ids()) && (await textos()).filter((t) => t === '> Siempre ocupada').length === 1, 'escribir otra vez lo mismo mientras está pendiente es el mismo mensaje: mismo identificador, sin repetirlo en la conversación');

    /* 409 idempotency_conflict: no se reintenta */
    reiniciarAsistente();
    S.guion.push({ ruta: '/api/chat/messages', status: 409, json: { error: 'idempotency_conflict', message: 'Ese envío ya se registró con otros datos. Inicia una nueva solicitud si quieres cambiarlos.' } });
    await escribir('Confirmo');
    await hasta(() => /ya se registró con otros datos/.test(document.querySelector('[data-agente-charla]').textContent), 'conflicto');
    await sleep(3500);
    ok(ids().length === 1 && !(await botones()).includes('Reintentar'), '409 idempotency_conflict: muestra el mensaje del asistente, no se reintenta solo ni ofrece «Reintentar»');
    await escribir('Confirmo');
    await hasta(() => /Respuesta a «Confirmo»/.test(document.querySelector('[data-agente-charla]').textContent), 'nuevo envío tras conflicto');
    ok(ids().length === 2 && ids()[0] !== ids()[1], 'después de un conflicto, un mensaje nuevo lleva otro identificador (distinto de 409 busy)');

    /* 422: el mensaje no se procesó; lo escrito vuelve al campo y no se muestran textos internos ni en inglés */
    reiniciarAsistente();
    S.guion.push({ ruta: '/api/chat/messages', status: 422, json: { message: 'The text field must not be greater than 1000 characters.', errors: { text: ['validation.max.string'] } } });
    await escribir('Texto rechazado');
    await hasta(() => /No pude enviar ese mensaje/.test(document.querySelector('[data-agente-charla]').textContent), '422');
    const t422 = await evaluar(() => ({ chat: document.querySelector('[data-agente-charla]').textContent, campo: document.querySelector('[data-agente-form] input[name="q"]').value }));
    ok(!/validation\.|The text field/.test(t422.chat) && t422.campo === 'Texto rechazado' && !(await botones()).includes('Reintentar'), '422: mensaje propio en español (sin claves ni textos en inglés del servicio), lo escrito vuelve al campo y no se reintenta');
    await evaluar(() => { document.querySelector('[data-agente-form] input[name="q"]').value = ''; return true; });

    /* 503 de un proxy (HTML) */
    reiniciarAsistente();
    S.guion.push({ ruta: '/api/chat/messages', status: 503, html: '<html><body>Service Unavailable</body></html>' });
    await escribir('Con proxy caído');
    await hasta(() => !document.querySelector('.is-espera') && /No pude responder en este momento/.test(document.querySelector('[data-agente-charla]').textContent), '503 html');
    await tocar('Reintentar');
    await hasta(() => /Respuesta a «Con proxy caído»/.test(document.querySelector('[data-agente-charla]').textContent), 'tras 503 html');
    ok(ids().length === 2 && iguales(ids()), '503 en HTML (proxy o mantenimiento): mensaje propio y reintento con el mismo identificador');

    /* 504 del proxy: se trata como una espera agotada (reintento solo, mismo identificador) */
    reiniciarAsistente();
    S.guion.push({ ruta: '/api/chat/messages', status: 504, html: '<html><body>504 Gateway Time-out</body></html>' });
    await escribir('Tras un 504');
    await hasta(() => /Respuesta a «Tras un 504»/.test(document.querySelector('[data-agente-charla]').textContent), 'tras 504', 15000);
    ok(ids().length === 2 && iguales(ids()) && !(await botones()).includes('Reintentar'), '504 del proxy (el asistente puede seguir respondiendo): se reintenta solo con el mismo identificador');

    /* Pérdida de la respuesta: el servidor lo procesó, la conexión se cortó */
    reiniciarAsistente();
    S.guion.push({ ruta: '/api/chat/messages', cortar: true, procesar: true });
    await escribir('Se cortó la conexión');
    await hasta(() => !document.querySelector('.is-espera') && /No pude conectarme/.test(document.querySelector('[data-agente-charla]').textContent), 'red');
    await sleep(3500);
    ok(iguales(ids()) && (await botones()).includes('Reintentar'), `sin conexión: el widget no reintenta solo (${ids().length} llamada(s), contando el reenvío propio del navegador, todas con el mismo identificador); ofrece «Reintentar» y dice que no se repetirá`);
    await tocar('Reintentar');
    await hasta(() => /Respuesta a «Se cortó la conexión»/.test(document.querySelector('[data-agente-charla]').textContent), 'recuperada');
    ok(iguales(ids()) && S.ejecuciones === 1 && S.duplicados >= 1, 'respuesta perdida: el reintento recupera la respuesta ya procesada (duplicate) y el modelo se ejecutó una sola vez');

    /* Tiempo de espera agotado (data-agente-espera="5"): el mensaje sigue en curso en el servidor */
    reiniciarAsistente();
    pagina.espera = 5;
    await navegar(local());
    pagina.espera = null;
    await abrir();
    await entrar();
    S.retardos.push(9000);
    const t0 = Date.now();
    await escribir('Respuesta lenta');
    await hasta(() => /Respuesta a «Respuesta lenta»/.test(document.querySelector('[data-agente-charla]').textContent), 'respuesta tras la espera', 30000);
    const r = de('/messages', 'POST');
    ok(r.length === 3 && iguales(ids()) && S.ejecuciones === 1 && Date.now() - t0 >= 13000, `espera agotada a los 5 s: reintenta solo con el mismo identificador (409 busy mientras sigue en curso) y recupera la respuesta; el modelo se ejecutó una vez (${r.length} llamadas, ${S.ejecuciones} ejecución)`);
  }

  seccion('11-12. Historial y sesión vencida');
  {
    reiniciarAsistente();
    await navegar(local()); await abrir();
    await hasta(() => !!document.querySelector('.agente-puerta'), 'puerta');
    await evaluar(() => { document.querySelector('.agente-puerta').elements.marketing_accepted.checked = true; return true; });
    await entrar();
    S.guion.push({ ruta: '/api/chat/messages', status: 401, json: { error: 'session_expired' } });
    await escribir('Consulta antes de vencer');
    await hasta(() => !!document.querySelector('.agente-puerta'), 'puerta tras vencimiento');
    ok(await evaluar(() => {
      const f = document.querySelector('.agente-puerta');
      return !f.elements.privacy_accepted.checked && !f.elements.marketing_accepted.checked && f.elements.email.value === 'chat@ejemplo.cl';
    }), 'tras vencer la sesión se conservan los datos de contacto, pero ambas aceptaciones vuelven sin marcar');
    await entrar();
    reiniciarAsistente();
    const token = JSON.parse(await guardado()).token;
    S.historial = [
      { role: 'assistant', text: 'Hola, soy el asistente.', options: [{ id: 'residuos', label: 'Retiro de residuos' }], sources: [], intent: 'main_menu', lead_status: null },
      { role: 'user', text: '¿Qué dice el D.S. 148?', options: [], sources: [], intent: null, lead_status: null },
      { role: 'assistant', text: 'El **D.S. 148** regula los residuos peligrosos.', options: [{ id: 'mas', label: 'Ver más' }], sources: [{ label: 'D.S. 148', url: 'https://www.bcn.cl/leychile/navegar?idNorma=226458' }], intent: 'normativa', lead_status: null }
    ];
    await navegar(local(), { limpiar: false });
    await abrir();
    await hasta(() => /regula los residuos peligrosos/.test(document.querySelector('[data-agente-charla]').textContent), 'historial');
    const h = await evaluar(() => {
      const c = document.querySelector('[data-agente-charla]');
      return { opciones: [...c.querySelectorAll('[data-opcion]')].map((b) => b.textContent), fuentes: [...c.querySelectorAll('.msg-fuentes a')].map((a) => a.href), negrita: c.querySelector('.msg-texto strong')?.textContent, puerta: !!c.querySelector('.agente-puerta') };
    });
    ok(de('/history', 'GET').length === 1 && de('/history', 'GET')[0].token === token && !h.puerta, 'recarga con token vigente: GET /api/chat/history con el mismo token, sin volver a pedir los datos');
    ok(h.opciones.join() === 'Ver más' && h.fuentes.length === 1 && h.negrita === 'D.S. 148', 'el historial repinta mensajes, negritas y fuentes; solo las opciones de la última respuesta');
    ok(de('/messages', 'POST').length === 0, 'repintar el historial no envía mensajes');

    reiniciarAsistente();
    S.historial = [{ role: 'assistant', text: 'Sí, retiramos **ambos tipos**.\n\nPara cotizar necesitamos:\n- qué residuo es;\n- la comuna <img src=x onerror="window.__xss=1">;\n- si es peligroso, la **HDS/FDS**.\n\n1. Toca «Cotizar retiro».\n2. Responde las preguntas.\n\nSe hace con un transportista autorizado (D.S. 148/2003, art. 36).', options: [], sources: [{ label: 'D.S. 148/2003', url: 'https://www.bcn.cl/leychile/navegar?idNorma=226458' }], intent: 'modelo', lead_status: null }];
    await navegar(local(), { limpiar: false });
    await abrir();
    await hasta(() => /Responde las preguntas/.test(document.querySelector('[data-agente-charla]').textContent), 'bloques');
    const b = await evaluar(() => {
      const t = document.querySelector('[data-agente-charla] .msg-texto.is-bloques');
      return {
        parrafos: t ? t.querySelectorAll(':scope > p').length : 0,
        vinetas: [...(t?.querySelectorAll('ul > li') || [])].map((li) => li.textContent),
        pasos: [...(t?.querySelectorAll('ol > li') || [])].map((li) => li.textContent),
        negritas: [...(t?.querySelectorAll('strong') || [])].map((x) => x.textContent),
        etiquetas: t ? t.querySelectorAll('img, script').length : -1, xss: window.__xss || 0,
        fuentes: document.querySelectorAll('[data-agente-charla] .msg-fuentes li').length
      };
    });
    ok(b.parrafos === 3 && b.vinetas.length === 3 && b.pasos.join('|') === 'Toca «Cotizar retiro».|Responde las preguntas.', 'una respuesta con bloques muestra párrafos, una lista con viñetas y una numerada');
    ok(b.negritas.join('|') === 'ambos tipos|HDS/FDS' && b.etiquetas === 0 && b.xss === 0 && /<img/.test(b.vinetas[1]), 'en los bloques las negritas siguen y el HTML del texto queda como texto');
    ok(b.fuentes === 1, 'la respuesta con bloques sigue mostrando sus fuentes');

    reiniciarAsistente();
    S.historial = [{ role: 'user', text: 'Pregunta sin respuesta', options: [], sources: [] }];
    await navegar(local(), { limpiar: false });
    await abrir();
    await hasta(() => /todavía no tiene respuesta/.test(document.querySelector('[data-agente-charla]').textContent), 'último sin respuesta');
    S.historial = [...S.historial, { role: 'assistant', text: 'Ahora sí, la respuesta.', options: [], sources: [] }];
    await tocar('Actualizar');
    await hasta(() => /Ahora sí, la respuesta/.test(document.querySelector('[data-agente-charla]').textContent), 'actualizado');
    ok(de('/history', 'GET').length === 2 && de('/messages', 'POST').length === 0, 'último mensaje sin respuesta: «Actualizar» vuelve a leer el historial, sin reenviar el mensaje');

    reiniciarAsistente();
    const original = { id: 'recarga-b28', cuerpo: { text: 'Retomar exactamente este mensaje' }, visible: 'Retomar exactamente este mensaje' };
    await evaluar((p) => { const s = JSON.parse(sessionStorage.getItem('agente-chat')); s.pendiente = p; sessionStorage.setItem('agente-chat', JSON.stringify(s)); return true; }, original);
    S.historial = [{ role: 'user', text: original.visible, client_message_id: original.id }];
    await navegar(local(), { limpiar: false });
    await abrir();
    await hasta(() => /Quedó un envío/.test(document.querySelector('[data-agente-charla]').textContent), 'envío recuperado');
    ok(de('/messages', 'POST').length === 0, 'recargar no reenvía automáticamente el turno pendiente');
    await tocar('Reintentar');
    await hasta(() => /Respuesta a/.test(document.querySelector('[data-agente-charla]').textContent), 'respuesta recuperada');
    ok(ids()[0] === original.id && de('/messages', 'POST')[0].cuerpo.text === original.cuerpo.text, 'reintentar tras recargar conserva el identificador y el cuerpo original');
    ok(!JSON.parse(await guardado()).pendiente, 'la respuesta confirmada borra el envío temporal');

    reiniciarAsistente();
    await evaluar((p) => { const s = JSON.parse(sessionStorage.getItem('agente-chat')); s.pendiente = p; sessionStorage.setItem('agente-chat', JSON.stringify(s)); return true; }, original);
    S.historial = [{ role: 'user', text: original.visible, client_message_id: original.id }, { role: 'assistant', text: 'Respuesta ya guardada', client_message_id: original.id, options: [], sources: [] }];
    await navegar(local(), { limpiar: false });
    await abrir();
    await hasta(() => /Respuesta ya guardada/.test(document.querySelector('[data-agente-charla]').textContent), 'respuesta ya guardada');
    ok(!JSON.parse(await guardado()).pendiente && de('/messages', 'POST').length === 0, 'si el historial ya contiene la respuesta del envío, se descarta el pendiente sin reenviarlo');

    reiniciarAsistente();
    S.historial = [];
    await navegar(local(), { limpiar: false });
    await abrir();
    await hasta(() => /¿En qué te ayudo\?/.test(document.querySelector('[data-agente-charla]').textContent), 'historial vacío');
    ok(de('/messages', 'POST').length === 1 && de('/messages', 'POST')[0].cuerpo.text === 'inicio' && !(await textos()).includes('> inicio'), 'historial vacío: pide el menú con el comando «inicio» del asistente, sin mostrarlo como mensaje');

    reiniciarAsistente();
    S.tokens.delete(token);
    await navegar(local(), { limpiar: false });
    await abrir();
    await hasta(() => !!document.querySelector('.agente-puerta') && /Tu sesión terminó/.test(document.querySelector('[data-agente-charla]').textContent), 'sesión inválida');
    ok(!(await guardado()), 'token inválido en el servidor (401 session_expired al leer el historial): vuelve a la puerta y olvida el token');

    reiniciarAsistente();
    await evaluar(() => { sessionStorage.setItem('agente-chat', JSON.stringify({ token: 'tok-viejo', vence: '2020-01-01T00:00:00Z', fotos: 0 })); return true; });
    await navegar(local(), { limpiar: false });
    await abrir();
    await hasta(() => !!document.querySelector('.agente-puerta'), 'puerta con token vencido');
    ok(llamadas.every((l) => l.ruta === '/api/chat/config') && !(await guardado()), 'token vencido en la pestaña: va directo a la puerta, sin llamar al servicio con ese token (la puerta solo lee GET /config)');

    reiniciarAsistente();
    await entrar();
    S.tokens.clear();
    await escribir('Mensaje con sesión vencida');
    await hasta(() => !!document.querySelector('.agente-puerta') && /Tu sesión terminó/.test(document.querySelector('[data-agente-charla]').textContent), '401 al enviar');
    ok((await evaluar(() => document.querySelector('[data-agente-form] input[name="q"]').value)) === 'Mensaje con sesión vencida' && !(await guardado()), 'sesión vencida al enviar (401): vuelve a la puerta y lo escrito vuelve al campo, para no perderlo');
    await entrar();
  }

  seccion('13-15. Borrar esta conversación (DELETE /api/chat/session)');
  {
    reiniciarAsistente();
    const token = JSON.parse(await guardado()).token;
    ok((await evaluar(() => { const b = document.querySelector('.agente-salir'); return !b.hidden && b.textContent; })) === 'Borrar esta conversación', 'el pie ofrece «Borrar esta conversación» (el nombre que usa la política del asistente)');
    await evaluar(() => { document.querySelector('.agente-salir').click(); return true; });
    ok((await botones()).join('|') === 'Sí, borrar|Cancelar' && llamadas.length === 0, 'pide confirmación antes de llamar al servicio');
    await tocar('Cancelar');
    ok(llamadas.length === 0 && !!(await guardado()), '«Cancelar» no borra nada');

    /* 429 del limitador de Laravel: su texto viene en inglés; el widget muestra uno propio y conserva el token */
    S.guion.push({ ruta: '/api/chat/session', metodo: 'DELETE', status: 429, json: { message: 'Too Many Attempts.' } });
    await evaluar(() => { document.querySelector('.agente-salir').click(); return true; });
    await tocar('Sí, borrar');
    await hasta(() => /Hiciste muchas solicitudes seguidas/.test(document.querySelector('[data-agente-charla]').textContent), 'borrado 429');
    ok(!/Too Many/.test(await evaluar(() => document.querySelector('[data-agente-charla]').textContent)) && JSON.parse(await guardado()).token === token, '429 al borrar: texto propio en español (no el del limitador, en inglés), conserva el token y no dice que se borró');
    await tocar('Cancelar');
    llamadas.length = 0;

    S.guion.push({ ruta: '/api/chat/session', metodo: 'DELETE', status: 409, json: { error: 'busy' }, retardo: 200 });
    await evaluar(() => { document.querySelector('.agente-salir').click(); return true; });
    await tocar('Sí, borrar', 3);
    await hasta(() => /Hay una respuesta en curso/.test(document.querySelector('[data-agente-charla]').textContent), 'borrado ocupado');
    ok(de('/session', 'DELETE').length === 1 && JSON.parse(await guardado()).token === token && !/borramos/i.test(await ultimo()), '409 busy: una sola llamada (tres toques), conserva el token y no dice que se borró');
    await tocar('Reintentar el borrado');
    await hasta(() => /Listo: borramos esta conversación/.test(document.querySelector('[data-agente-charla]').textContent), 'borrado');
    const b = de('/session', 'DELETE');
    ok(b.length === 2 && b.every((x) => x.cuerpo.confirm === true && x.token === token), 'DELETE /api/chat/session con {confirm: true} y el token de la sesión');
    ok(!(await guardado()) && (await evaluar(() => !!document.querySelector('.agente-puerta') && document.querySelector('.agente-salir').hidden)), 'borrado confirmado (200 deleted): olvida el token y vuelve a la puerta (se puede empezar con otros datos)');

    reiniciarAsistente();
    await entrar();
    S.guion.push({ ruta: '/api/chat/session', metodo: 'DELETE', status: 500, json: { error: 'erasure_pending' } });
    await evaluar(() => { document.querySelector('.agente-salir').click(); return true; });
    await tocar('Sí, borrar');
    await hasta(() => /El borrado quedó en curso/.test(document.querySelector('[data-agente-charla]').textContent), 'pendiente');
    const txt = await evaluar(() => document.querySelector('[data-agente-charla]').textContent);
    ok(!/borramos/i.test(txt) && !(await guardado()), '500 erasure_pending: dice que quedó en curso (no que se borró) y deja la sesión, que el servicio ya revocó');

    reiniciarAsistente();
    await entrar();
    S.guion.push({ ruta: '/api/chat/session', metodo: 'DELETE', cortar: true });
    await evaluar(() => { document.querySelector('.agente-salir').click(); return true; });
    await tocar('Sí, borrar');
    await hasta(() => /No pude confirmar el borrado/.test(document.querySelector('[data-agente-charla]').textContent), 'borrado sin conexión');
    ok(!!(await guardado()) && (await botones()).includes('Reintentar el borrado'), 'sin conexión: conserva el token y permite repetir');
    S.tokens.clear();
    await sleep(1600);  // pasada la caída
    await tocar('Reintentar el borrado');
    await hasta(() => /La sesión ya está cerrada/.test(document.querySelector('[data-agente-charla]').textContent), 'repetido con 401');
    ok(!/borramos/i.test(await evaluar(() => document.querySelector('[data-agente-charla]').textContent)), 'repetido tras perder la respuesta (401): no afirma que se borró, explica cómo seguir');
    await entrar();
  }

  seccion('Fotos: respuesta perdida y recuperación al recargar');
  {
    reiniciarAsistente();
    S.subidas.clear();
    await navegar(local());
    await abrir();
    await entrar();
    S.guion.push({ ruta: '/api/chat/attachments', status: 500, procesarFoto: true });
    await elegirFotos('png');
    await hasta(() => /Puedes reintentar sin duplicarla/.test(document.querySelector('[data-agente-charla]').textContent), 'foto sin acuse');
    await tocar('Reintentar');
    await hastaAca(async () => de('/attachments', 'POST').length === 2 && await sinEspera(), 'foto reintentada');
    const intentos = de('/attachments', 'POST');
    ok(intentos[0].mp.campos.client_upload_id && intentos[0].mp.campos.client_upload_id === intentos[1].mp.campos.client_upload_id
      && intentos[0].mp.archivos[0].contenido.equals(intentos[1].mp.archivos[0].contenido)
      && S.fotos === 1 && JSON.parse(await guardado()).fotos === 1, 'respuesta perdida: reintenta el mismo identificador y los mismos bytes, con una sola foto y un solo cupo');
    await evaluar(() => { const s = JSON.parse(sessionStorage.getItem('agente-chat')); s.fotos = 0; sessionStorage.setItem('agente-chat', JSON.stringify(s)); return true; });
    S.historial = [{ role: 'assistant', ...MENU }];
    await navegar(local(), { limpiar: false });
    await abrir();
    await hasta(() => /¿En qué te ayudo/.test(document.querySelector('[data-agente-charla]').textContent), 'historial con fotos');
    ok(JSON.parse(await guardado()).fotos === 1, 'al recargar restaura las fotos desde el servidor aunque el contador local esté desactualizado');
    reiniciarAsistente();
    S.subidas.clear();
    await navegar(local());
    await abrir();
    await entrar();
  }

  seccion('16-18. Fotos');
  {
    reiniciarAsistente();
    await elegirFotos('png');
    await hasta(() => /Recibí la imagen/.test(document.querySelector('[data-agente-charla]').textContent), 'foto png');
    let a = de('/attachments', 'POST');
    const f1 = a[0]?.mp?.archivos[0];
    ok(f1 && f1.campo === 'image' && f1.tipo === 'image/jpeg' && f1.nombre === 'foto-1.jpg' && f1.bytes <= 5120 * 1024, `PNG válida: se sube reducida en JPEG, con nombre neutro (${f1?.nombre}, ${Math.round((f1?.bytes || 0) / 1024)} KB), sin el nombre original`);
    await elegirFotos('png');
    await hasta(() => /ya está adjunta/.test(document.querySelector('[data-agente-charla]').textContent), 'duplicada');
    ok(de('/attachments', 'POST').length === 1, 'la misma foto otra vez no se sube dos veces');
    await elegirFotos('exif');
    await hastaAca(async () => de('/attachments', 'POST').length === 2 && await sinEspera(), 'foto exif');
    a = de('/attachments', 'POST');
    const c = a[1].mp.archivos[0].contenido.toString('latin1');
    ok(!c.includes('Exif') && !c.includes('UBICACION-SECRETA'), 'JPEG con EXIF: lo que se sube no lleva el bloque EXIF (ubicación ni datos de la cámara)');
    await elegirFotos('png');
    await hasta(() => /el máximo por conversación/.test(document.querySelector('[data-agente-charla]').textContent), 'tope');
    ok(de('/attachments', 'POST').length === 2 && JSON.parse(await guardado()).fotos === 2, 'límite de 2 fotos: la tercera no se sube y el número queda en la pestaña');
    ok(!/Juan|camara|\.png|\.jpg/.test(await guardado()), 'la pestaña no guarda nombres de archivo');

    reiniciarAsistente();
    await evaluar(() => { const s = JSON.parse(sessionStorage.getItem('agente-chat')); s.fotos = 0; sessionStorage.setItem('agente-chat', JSON.stringify(s)); return true; });
    await navegar(local(), { limpiar: false });
    await abrir();
    await hasta(() => !document.querySelector('[data-agente-form]').hidden && !document.querySelector('.is-espera') && /¿En qué te ayudo\?/.test(document.querySelector('[data-agente-charla]').textContent), 'chat listo');
    await elegirFotos('gif');
    await hasta(() => /Los formatos permitidos son/.test(document.querySelector('[data-agente-charla]').textContent), 'gif');
    await elegirFotos('rota');
    await hasta(() => /No pude preparar esa foto/.test(document.querySelector('[data-agente-charla]').textContent), 'rota');
    await elegirFotos('pesada');
    await hasta(() => /demasiado pesada/.test(document.querySelector('[data-agente-charla]').textContent), 'pesada');
    ok(de('/attachments', 'POST').length === 0, 'fotos inválidas (GIF, archivo que no se puede leer, más de 25 MB): no se sube nada, ni la original');
    S.fotos = 2;
    await elegirFotos('png');
    await hasta(() => /Ya adjuntaste el máximo de imágenes/.test(document.querySelector('[data-agente-charla]').textContent), 'tope del servidor');
    ok(JSON.parse(await guardado()).fotos === 2, '422 attachment_limit del asistente: muestra su mensaje y no permite más');
    S.fotos = 0;
    await evaluar(() => { const s = JSON.parse(sessionStorage.getItem('agente-chat')); s.fotos = 0; sessionStorage.setItem('agente-chat', JSON.stringify(s)); return true; });
    await navegar(local(), { limpiar: false });
    await abrir();
    await hasta(() => !document.querySelector('[data-agente-form]').hidden && !document.querySelector('.is-espera') && /¿En qué te ayudo\?/.test(document.querySelector('[data-agente-charla]').textContent), 'chat listo');
    S.guion.push({ ruta: '/api/chat/attachments', status: 413, json: { message: 'Content Too Large' } });
    await elegirFotos('png');
    await hasta(() => /No pude subir la foto/.test(document.querySelector('[data-agente-charla]').textContent), 'foto 413');
    ok(!/Too Large/.test(await evaluar(() => document.querySelector('[data-agente-charla]').textContent)), 'foto rechazada con 413: texto propio en español, no el de Laravel en inglés');

    /* Pegar y soltar: van al chat y no al formulario de cotización */
    reiniciarAsistente();
    await evaluar(() => { const s = JSON.parse(sessionStorage.getItem('agente-chat')); s.fotos = 0; sessionStorage.setItem('agente-chat', JSON.stringify(s)); return true; });
    await navegar(local(), { limpiar: false });
    await abrir();
    await hasta(() => !document.querySelector('[data-agente-form]').hidden && !document.querySelector('.is-espera') && /¿En qué te ayudo\?/.test(document.querySelector('[data-agente-charla]').textContent), 'chat listo');
    await evaluar(() => { window.HERO.show('cotizar'); return true; });
    await hasta(() => document.querySelector('[data-adjuntos]').closest('.hcard-panel').getClientRects().length > 0, 'formulario a la vista');
    const antes = await fotosForm();
    await evaluar(`async () => { const dt = new DataTransfer(); dt.items.add(await (${fotos.png})('pegada.png'));
      const e = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }); document.querySelector('[data-agente-form] input[name="q"]').dispatchEvent(e); return true; }`);
    await hasta(() => /Recibí la imagen/.test(document.querySelector('[data-agente-charla]').textContent), 'pegada');
    await evaluar(`async () => { const dt = new DataTransfer(); dt.items.add(await (${fotos.png})('soltada.png'));
      document.querySelector('[data-agente-charla]').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); return true; }`);
    await hastaAca(async () => de('/attachments', 'POST').length === 2 && await sinEspera(), 'soltada');
    await sleep(800);
    ok(de('/attachments', 'POST').length === 2 && (await fotosForm()) === antes, 'una imagen pegada o soltada en el chat se adjunta al chat y no entra al formulario de cotización (a la vista)');
    await evaluar(`async () => { const dt = new DataTransfer(); dt.items.add(await (${fotos.png})('al-formulario.png'));
      document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return true; }`);
    await hasta(() => document.querySelectorAll('[data-adjuntos] .adjuntos-list .adjunto').length === 1, 'foto al formulario');
    ok(de('/attachments', 'POST').length === 2, 'pegada fuera del chat, la foto sigue yendo al formulario, como antes');
    await evaluar(() => { window.HERO?.show?.('cotizar'); document.querySelector('[data-adjuntos] .adjunto-quitar')?.click(); return true; });
  }

  seccion('19-21. Enlaces, fuentes y seguridad del DOM');
  {
    reiniciarAsistente();
    await escribir('xss');
    await hasta(() => /Mira/.test(document.querySelector('[data-agente-charla]').textContent), 'respuesta xss');
    await sleep(300);
    const x = await evaluar(() => {
      const m = [...document.querySelectorAll('[data-agente-charla] .msg.is-bot')].pop();
      const todo = [...document.querySelectorAll('[data-agente-charla] *')];
      return {
        xss: window.__xss || 0, texto: m.querySelector('.msg-texto').textContent,
        enlacesTexto: m.querySelectorAll('.msg-texto a').length, etiquetas: m.querySelectorAll('.msg-texto img, .msg-texto script, .msg-texto b').length,
        fuentes: [...m.querySelectorAll('.msg-fuentes li')].map((li) => ({ t: li.textContent, a: li.querySelector('a')?.getAttribute('href') || '' })),
        on: todo.filter((el) => [...el.attributes].some((a) => /^on/i.test(a.name))).length,
        opcion: m.querySelector('[data-opcion]') && { texto: m.querySelector('[data-opcion]').textContent, title: m.querySelector('[data-opcion]').title, hijos: m.querySelector('[data-opcion]').children.length }
      };
    });
    ok(x.enlacesTexto === 0 && x.texto.includes('https://evil.example/robar') && x.texto.includes('javascript:window.__xss=3'), 'las direcciones escritas en reply.text quedan como texto: no se convierten en enlaces');
    ok(x.etiquetas === 0 && x.texto.includes('<img src=x onerror="window.__xss=1">') && x.texto.includes('«comillas» "dobles" \'simples\' ñandú 10 < 20 > 5'), 'el HTML del texto se ve como texto (sin elementos), con comillas, tildes y signos intactos');
    ok(x.fuentes.filter((f) => f.a).length === 1 && x.fuentes.find((f) => f.a)?.a === 'https://www.bcn.cl/leychile/navegar?idNorma=226458', 'de nueve fuentes, solo pasa a enlace la de https y destino conocido; javascript:, data:, http, dominios ajenos o parecidos, usuario:clave y relativas quedan sin enlace');
    ok(x.fuentes.length === 9 && x.fuentes.some((f) => f.t.includes('"><img src=x onerror="window.__xss=6">')), 'las fuentes sin enlace se siguen mostrando con su rótulo, como texto');
    ok(x.on === 0 && x.opcion?.hijos === 0 && x.opcion?.texto === '<b onmouseover="window.__xss=8">Opción</b>' && x.opcion?.title === '"><script>window.__xss=9</script>', 'rótulos y descripciones de opciones quedan como texto; ningún elemento del chat tiene atributos de evento');
    await tocar('<b onmouseover="window.__xss=8">Opción</b>');
    await hastaAca(async () => de('/messages', 'POST').length === 2 && await sinEspera(), 'opción maliciosa');
    ok(de('/messages', 'POST')[1].cuerpo.option_id === 'x" onclick="window.__xss=7' && (await evaluar(() => window.__xss || 0)) === 0, 'el id de la opción solo viaja en el JSON; no se ejecutó nada del modelo (window.__xss sin tocar)');

    await escribir('fuentes');
    await hasta(() => /Estas son las fuentes/.test(document.querySelector('[data-agente-charla]').textContent), 'fuentes');
    const f = await evaluar(() => [...[...document.querySelectorAll('[data-agente-charla] .msg.is-bot')].pop().querySelectorAll('.msg-fuentes li')].map((li) => { const a = li.querySelector('a'); return a ? `${a.getAttribute('href')}|${a.target}|${a.rel}` : `(sin enlace) ${li.textContent}`; }));
    ok(f.length === 6 && f.slice(0, 4).every((s) => /^https:\/\/.+\|_blank\|noopener noreferrer$/.test(s)), 'fuentes autorizadas (www.bcn.cl, bcn.cl, leychile.cl, portalvu.mma.gob.cl) enlazadas en otra pestaña con noopener');
    ok(f[4].startsWith(`${SITIO}/ayuda/residuo-peligroso-o-no-peligroso.html|`) && f[5] === '(sin enlace) Sin dirección', 'una guía de transporteautorizado.cl se abre en este sitio; una fuente sin dirección queda como texto');
    ok((await evaluar(() => window.__abiertas.length)) === 0 && (await pestanas()).length === 0, 'el chat no abrió ventanas ni pestañas por su cuenta');
  }

  seccion('22. WordPress: la página del plugin, con su CSP');
  if (PHP) {
    reiniciarAsistente();
    await conWordPress(null);
    pagina.wp = { asistente: API };
    pedidos.length = 0;
    await navegar(pagUrl());
    await abrir();
    await entrar();
    await escribir('Desde WordPress');
    await hasta(() => /Respuesta a «Desde WordPress»/.test(document.querySelector('[data-agente-charla]').textContent), 'respuesta bajo CSP');
    const csp = await evaluar(() => ({ meta: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || '', violaciones: window.__csp, api: window.TA_API?.asistente }));
    const conexiones = csp.meta.split(';').find((directive) => directive.trim().startsWith('connect-src '))?.trim().split(/\s+/).slice(1) || [];
    ok(conexiones.includes("'self'") && conexiones.includes(API) && csp.api === API, 'la página del plugin trae window.TA_API.asistente y su CSP permite conectar con el asistente (connect-src)');
    ok(!csp.violaciones.length, `el chat funciona bajo la CSP del plugin sin violaciones${csp.violaciones.length ? `: ${csp.violaciones.join('; ')}` : ''}`);
    ok(!pedidos.some((u) => /wordpress\.ejemplo/.test(u)) && de('/sessions', 'POST')[0]?.origen === SITIO, 'el navegador llama directo al asistente; nada pasa por WordPress (sin proxy)');
    await evaluar(() => { document.querySelector('[data-agente-descargar]').click(); return true; });
    await hasta(() => window.__descargas.length === 1 && window.__descargas[0].texto !== null, 'descarga bajo la CSP');
    ok(!(await evaluar(() => window.__csp)).length && de('/session', 'GET').length === 1, '«Descargar mis datos» funciona bajo la CSP del plugin, sin violaciones');

    reiniciarAsistente();
    pagina.wp = { asistente: API, turnstile: '0x4AAAAAAAprueba' };
    await navegar(pagUrl());
    await abrir();
    await hasta(() => !!document.querySelector('.agente-puerta .agente-humano'), 'Turnstile');
    await evaluar(() => { const f = document.querySelector('.agente-puerta'); f.elements.name.value = 'Persona'; f.elements.email.value = 'p@ejemplo.cl'; f.elements.phone.value = '+56 9 1111 2222'; f.elements.privacy_accepted.checked = true; f.requestSubmit(); return true; });
    await hasta(() => /comprobando que eres una persona/.test(document.querySelector('.agente-error').textContent), 'Turnstile pendiente');
    const v = await evaluar(() => window.__csp);
    ok(!de('/sessions', 'POST').length && llamadas.every((l) => l.ruta === '/api/chat/config') && !v.some((x) => /challenges\.cloudflare\.com/.test(x)), 'con la clave de Turnstile del plugin, la puerta espera el token (no abre sesión sin él) y la CSP admite su script');
    pagina.wp = { asistente: API };
    await navegar(pagUrl());
    await abrir();
    S.guion.push({ ruta: '/api/chat/sessions', status: 500, json: { message: 'Server Error' } });
    await evaluar(() => { const f = document.querySelector('.agente-puerta'); f.elements.name.value = 'Persona'; f.elements.email.value = 'p@ejemplo.cl'; f.elements.phone.value = '+56 9 1111 2222'; f.elements.privacy_accepted.checked = true; f.requestSubmit(); return true; });
    await hasta(() => /No pude abrir el chat/.test(document.querySelector('.agente-error').textContent), 'sesión 500');
    ok(!/Server Error/.test(await evaluar(() => document.querySelector('.agente-error').textContent)), '500 al abrir la sesión: texto propio en español, no el «Server Error» de Laravel');
    pagina.wp = null;
  } else avisos.push('Sección 22 omitida (sin php).');

  seccion('23. Sin envíos duplicados');
  {
    reiniciarAsistente();
    await navegar(local());
    await abrir();
    await hasta(() => !!document.querySelector('.agente-puerta'), 'puerta');
    S.guion.push({ ruta: '/api/chat/sessions', status: 201, retardo: 400, json: { token: 'tok-lento', expires_at: new Date(Date.now() + 3600e3).toISOString(), reply: MENU, usage: USO } });
    S.tokens.add('tok-lento');
    await evaluar(() => { const f = document.querySelector('.agente-puerta'); f.elements.name.value = 'Persona'; f.elements.email.value = 'p@ejemplo.cl'; f.elements.phone.value = '+56 9 1111 2222'; f.elements.privacy_accepted.checked = true; f.requestSubmit(); f.requestSubmit(); f.requestSubmit(); return true; });
    await hasta(() => !document.querySelector('.agente-puerta'), 'sesión');
    ok(de('/sessions', 'POST').length === 1, 'la puerta enviada tres veces seguidas abre una sola sesión');
    S.retardos.push(500);
    await evaluar(() => { const f = document.querySelector('[data-agente-form]'); f.elements.q.value = 'Una vez'; f.requestSubmit(); f.elements.q.value = 'Una vez'; f.requestSubmit(); f.elements.q.value = 'Otra'; f.requestSubmit(); return true; });
    await hasta(() => /Respuesta a «Una vez»/.test(document.querySelector('[data-agente-charla]').textContent), 'una vez');
    await sleep(400);
    ok(de('/messages', 'POST').length === 1, 'mientras espera una respuesta no sale otro mensaje (Enter repetido)');
    await tocar('Otra consulta', 3);
    await hastaAca(async () => de('/messages', 'POST').length === 2 && await sinEspera(), 'opción');
    await sleep(400);
    ok(de('/messages', 'POST').length === 2, 'tres toques a una opción: un solo mensaje');
    await evaluar(() => { document.querySelector('[data-agente-nuevo]').click(); return true; });
    await hasta(() => !document.querySelector('.is-espera') && document.querySelectorAll('[data-agente-charla] [data-opcion]:not(:disabled)').length === 2, 'menú con dos opciones');
    await evaluar(() => { document.querySelectorAll('[data-agente-charla] [data-opcion]').forEach((b) => b.click()); return true; });
    await hastaAca(async () => de('/messages', 'POST').length >= 4 && await sinEspera(), 'una de las dos opciones');
    await sleep(400);
    ok(de('/messages', 'POST').length === 4 && de('/messages', 'POST')[3].cuerpo.option_id === 'residuos', 'dos opciones distintas tocadas seguidas: sale solo la primera (no hay dos turnos a la vez)');
    ok(!errores.length, `sin errores de JavaScript en la página${errores.length ? `: ${errores.slice(0, 3).join(' | ')}` : ''}`);
  }

  seccion('24. Asistente anterior (sin remember): recordar solo los datos de contacto (localStorage, 30 días)');
  {
    /* Con el asistente de antes, la casilla es la del 23-10: nombre, correo y teléfono, nunca el token */
    const antiguo = () => { reiniciarAsistente(); S.antiguo = true; };
    const CLAVE_DATOS = 'agente-chat-datos';
    const DIA = 86400000;
    const recuerdo = () => evaluar((k) => localStorage.getItem(k), CLAVE_DATOS);
    /* Una pestaña nueva: sin sesión, pero con el mismo localStorage. La casilla se puede marcar cuando ya se sabe qué
       ofrece el asistente (GET /config) */
    const listaLaCasilla = () => hasta(() => document.querySelector('.agente-puerta input[name="remember"]')?.disabled === false, 'la casilla «Recordar» lista');
    const pestanaNueva = async () => { await evaluar(() => { sessionStorage.clear(); return true; }); await navegar(local(), { limpiar: false }); await abrir(); await hasta(() => !!document.querySelector('.agente-puerta'), 'puerta'); await listaLaCasilla(); };
    const puertaAhora = () => evaluar(() => {
      const f = document.querySelector('.agente-puerta');
      return {
        name: f.elements.name.value, email: f.elements.email.value, phone: f.elements.phone.value,
        remember: f.elements.remember.checked, privacy: f.elements.privacy_accepted.checked, marketing: f.elements.marketing_accepted.checked,
        olvidar: !!f.querySelector('.agente-olvidar')
      };
    });
    const entrarCon = async ({ recordar, datos }) => {
      await evaluar((r, d) => {
        const f = document.querySelector('.agente-puerta');
        if (d) { f.elements.name.value = d.name; f.elements.email.value = d.email; f.elements.phone.value = d.phone; }
        f.elements.privacy_accepted.checked = true;
        f.elements.remember.checked = r;
        f.requestSubmit();
        return true;
      }, recordar, datos || null);
      await hasta(() => !document.querySelector('.agente-puerta') && !document.querySelector('[data-agente-form]').hidden, 'sesión abierta');
    };

    /* Sin marcar: no se guarda nada */
    antiguo();
    await navegar(local());
    await abrir();
    await hasta(() => !!document.querySelector('.agente-puerta'), 'puerta');
    await listaLaCasilla();
    let p = await puertaAhora();
    ok(p.remember === false && p.olvidar === false && p.name === '' && !(await recuerdo()), 'la puerta ofrece «Recordar mis datos» sin marcar y sin «Olvidar» cuando no hay nada guardado');
    ok(/30 días/.test(await evaluar(() => document.querySelector('.agente-puerta input[name="remember"]').closest('label').textContent)) && /equipo compartido/.test(await evaluar(() => document.querySelector('.agente-puerta input[name="remember"]').closest('label').textContent)), 'la casilla dice cuánto dura y advierte sobre los equipos compartidos');
    await entrarCon({ recordar: false, datos: { name: 'Persona Chat', email: 'chat@ejemplo.cl', phone: '+56 9 8765 4321' } });
    ok(!(await recuerdo()), 'con la casilla sin marcar no queda nada en localStorage');
    await pestanaNueva();
    p = await puertaAhora();
    ok(p.name === '' && p.email === '' && p.phone === '' && !p.remember, 'en una pestaña nueva la puerta sigue vacía');

    /* Marcada: quedan nombre, correo, teléfono y el vencimiento, y nada más */
    antiguo();
    const antes = Date.now();
    await entrarCon({ recordar: true, datos: { name: 'Persona Chat', email: 'chat@ejemplo.cl', phone: '+56 9 8765 4321' } });
    const g = JSON.parse(await recuerdo());
    ok(Object.keys(g).sort().join(',') === 'email,name,phone,vence' && g.name === 'Persona Chat' && g.email === 'chat@ejemplo.cl' && g.phone === '+56 9 8765 4321', 'con la casilla marcada se guarda solo nombre, correo y teléfono (más el vencimiento)');
    ok(g.vence >= antes + 30 * DIA - 60000 && g.vence <= Date.now() + 30 * DIA, 'el vencimiento es de 30 días');
    const token = JSON.parse(await guardado()).token;
    ok(!(await evaluar((t) => JSON.stringify(localStorage).includes(t), token)) && !(await evaluar(() => localStorage.getItem('agente-chat-sesion'))) && /privacy|marketing|accepted/i.test(await recuerdo()) === false && !JSON.parse(await guardado()).recordada,
      'con un asistente que no ofrece remember, el token no va a localStorage aunque la casilla esté marcada (queda solo en la pestaña), ni las casillas de aceptación');
    ok((await evaluar(() => document.querySelector('[data-agente-olvidar]').hidden && document.querySelector('[data-agente-descargar]').hidden)) && !de('/session', 'GET').length, 'sin sesión recordada no se ofrece «Olvidar este dispositivo», y sin la copia de los datos tampoco «Descargar mis datos»');
    ok(de('/sessions', 'POST')[0].cuerpo.remember === undefined, 'la casilla «Recordar» no se envía al asistente');

    /* Pestaña nueva con datos guardados: puerta precargada, aceptaciones sin marcar */
    antiguo();
    await pestanaNueva();
    p = await puertaAhora();
    ok(p.name === 'Persona Chat' && p.email === 'chat@ejemplo.cl' && p.phone === '+56 9 8765 4321' && p.remember && p.olvidar, 'pestaña nueva: la puerta trae los datos guardados, la casilla marcada y «Olvidar mis datos»');
    ok(!p.privacy && !p.marketing && llamadas.every((l) => l.ruta === '/api/chat/config' && l.metodo === 'GET'), 'las casillas de condiciones y de contacto comercial siguen sin marcar y, fuera de la configuración, no se llama al asistente hasta que la persona toque «Comenzar»');
    const v1 = JSON.parse(await recuerdo()).vence;
    await sleep(20);
    await entrarCon({ recordar: true });
    const s2 = de('/sessions', 'POST');
    ok(s2.length === 1 && s2[0].cuerpo.name === 'Persona Chat' && s2[0].cuerpo.email === 'chat@ejemplo.cl' && s2[0].cuerpo.privacy_accepted === true && s2[0].cuerpo.marketing_accepted === false, 'abrir con los datos precargados envía lo mismo que escribirlos, con su propia aceptación');
    ok(JSON.parse(await recuerdo()).vence > v1, 'cada uso renueva los 30 días');

    /* Reabrir y cerrar varias veces: sigue precargada */
    for (let i = 0; i < 3; i++) await pestanaNueva();
    p = await puertaAhora();
    ok(p.name === 'Persona Chat' && p.remember, 'abrir y cerrar la pestaña varias veces no pierde los datos');

    /* Vencidos o con otra forma: se descartan y se borran */
    await evaluar((k) => { localStorage.setItem(k, JSON.stringify({ name: 'Persona Chat', email: 'chat@ejemplo.cl', phone: '+56 9 8765 4321', vence: Date.now() - 1000 })); return true; }, CLAVE_DATOS);
    await pestanaNueva();
    p = await puertaAhora();
    ok(p.name === '' && !p.remember && !p.olvidar && !(await recuerdo()), 'datos vencidos: la puerta vuelve vacía y se borran');
    for (const raro of ['no es json', JSON.stringify({ name: 'Solo nombre', vence: Date.now() + 86400000 }), JSON.stringify({ name: 'A', email: 'a@ejemplo.cl', phone: '+56 9 1', vence: 'mañana' }), JSON.stringify([1, 2]), 'null']) {
      await evaluar((k, v) => { localStorage.setItem(k, v); return true; }, CLAVE_DATOS, raro);
      await pestanaNueva();
      p = await puertaAhora();
      ok(p.name === '' && p.email === '' && !p.olvidar && !(await recuerdo()), `datos ilegibles o incompletos (${raro.slice(0, 24)}): se ignoran y se borran`);
    }
    const largo = 'x'.repeat(400);
    await evaluar((k, l) => { localStorage.setItem(k, JSON.stringify({ name: l, email: `${l}@ejemplo.cl`, phone: l, vence: Date.now() + 86400000 })); return true; }, CLAVE_DATOS, largo);
    await pestanaNueva();
    p = await puertaAhora();
    ok(p.name.length === 150 && p.phone.length === 20, 'lo guardado se acota al largo de los campos');
    await evaluar((k) => { localStorage.setItem(k, JSON.stringify({ name: '"><img src=x onerror="window.__xss=10">', email: 'a@ejemplo.cl', phone: '+56 9 1111 2222', vence: Date.now() + 86400000 })); return true; }, CLAVE_DATOS);
    await pestanaNueva();
    ok((await evaluar(() => !window.__xss && !document.querySelector('.agente-puerta img'))) && (await puertaAhora()).name.startsWith('"><img'), 'lo guardado entra a los campos como texto, nunca como HTML');

    /* «Olvidar mis datos en este dispositivo» */
    await evaluar((k) => { localStorage.setItem(k, JSON.stringify({ name: 'Persona Chat', email: 'chat@ejemplo.cl', phone: '+56 9 8765 4321', vence: Date.now() + 86400000 })); return true; }, CLAVE_DATOS);
    await pestanaNueva();
    await evaluar(() => { document.querySelector('.agente-olvidar').click(); return true; });
    p = await puertaAhora();
    ok(!(await recuerdo()) && p.name === '' && p.email === '' && p.phone === '' && !p.remember && !p.olvidar && /ya no recordamos/.test(await evaluar(() => document.querySelector('.agente-nota')?.textContent || '')), '«Olvidar mis datos»: borra lo guardado, vacía los campos, desmarca la casilla y lo confirma');
    await entrarCon({ recordar: false, datos: { name: 'Otra Persona', email: 'otra@ejemplo.cl', phone: '+56 9 5555 6666' } });
    ok(!(await recuerdo()), 'tras olvidar y entrar sin marcar la casilla, no vuelve a guardarse nada');

    /* Entrar sin marcar la casilla quita lo que hubiera */
    await evaluar((k) => { localStorage.setItem(k, JSON.stringify({ name: 'Persona Chat', email: 'chat@ejemplo.cl', phone: '+56 9 8765 4321', vence: Date.now() + 86400000 })); return true; }, CLAVE_DATOS);
    await pestanaNueva();
    await entrarCon({ recordar: false });
    ok(!(await recuerdo()), 'si la persona desmarca «Recordar» al entrar, se borra lo guardado');

    /* Una puerta rechazada no guarda nada */
    antiguo();
    await pestanaNueva();
    S.guion.push({ ruta: '/api/chat/sessions', status: 422, json: { errors: { email: ['Escribe un correo válido.'] } } });
    await evaluar(() => { const f = document.querySelector('.agente-puerta'); f.elements.name.value = 'Persona'; f.elements.email.value = 'malo'; f.elements.phone.value = '+56 9 1111 2222'; f.elements.privacy_accepted.checked = true; f.elements.remember.checked = true; f.requestSubmit(); return true; });
    await hasta(() => /correo válido/.test(document.querySelector('.agente-error').textContent), 'error de la puerta');
    ok(!(await recuerdo()), 'si el asistente rechaza los datos (422), no se guardan');

    /* Borrar la conversación quita también lo recordado */
    antiguo();
    await pestanaNueva();
    await entrarCon({ recordar: true, datos: { name: 'Persona Chat', email: 'chat@ejemplo.cl', phone: '+56 9 8765 4321' } });
    ok(!!(await recuerdo()), 'antes de borrar hay datos recordados');
    await evaluar(() => { document.querySelector('.agente-salir').click(); return true; });
    await tocar('Sí, borrar');
    await hasta(() => /Listo: borramos esta conversación/.test(document.querySelector('[data-agente-charla]').textContent) && !!document.querySelector('.agente-puerta'), 'borrado');
    p = await puertaAhora();
    ok(!(await recuerdo()) && p.name === '' && p.email === '' && !p.remember && !p.olvidar, '«Borrar esta conversación» borra también los datos de este dispositivo y la puerta vuelve vacía');

    ok(!errores.length, `sin errores de JavaScript en la página${errores.length ? `: ${errores.slice(0, 3).join(' | ')}` : ''}`);
  }
  seccion('25. Límites de fotos desde la configuración del asistente');
  {
    reiniciarAsistente();
    S.limites = { max_per_session: 1, max_kilobytes: 8, max_pixels: 100, mimes: ['png'] };
    await conWordPress(null);
    await navegar(local()); await abrir(); await entrar();
    const configPuerta = de('/config', 'GET').length;  // la de la puerta (remember); las fotos consultan la suya
    await elegirFotos('png', 'exif');
    await hastaAca(async () => de('/attachments', 'POST').length === 1 && await sinEspera(), 'foto con topes dinámicos');
    const archivo = de('/attachments', 'POST')[0].mp.archivos[0];
    ok(archivo.tipo === 'image/png' && archivo.nombre === 'foto-1.png' && archivo.bytes <= 8 * 1024, 'el formato y el peso de salida respetan los límites publicados, sin forzar JPEG');
    const area = await evaluar(async (base64) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const img = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const area = img.width * img.height;
      img.close();
      return area;
    }, archivo.contenido.toString('base64'));
    ok(area <= 100, 'la imagen se reduce también al máximo de píxeles configurado');
    ok(de('/config', 'GET').length - configPuerta === 1 && (await evaluar(() => document.querySelector('[data-agente-form] input[type="file"]').accept)) === 'image/png', 'se consulta una vez y el selector refleja los formatos permitidos');
    ok(de('/attachments', 'POST').length === 1 && JSON.parse(await guardado()).fotos === 1, 'el máximo dinámico de una foto impide subir la siguiente');

    for (const config of [
      { status: 503, json: {} },
      { status: 200, json: { attachments: { ...LIMITES_FOTOS, max_pixels: 0 } } },
      { status: 200, json: { attachments: { ...LIMITES_FOTOS, mimes: ['__proto__'] } } }
    ]) {
      reiniciarAsistente();
      await navegar(local()); await abrir(); await entrar();
      const enLaPuerta = de('/config', 'GET').length;
      S.guion.push({ ruta: '/api/chat/config', ...config });
      await elegirFotos('png');
      await hasta(() => /No pude comprobar los límites/.test(document.querySelector('[data-agente-charla]').textContent), 'configuración no disponible');
      ok(de('/attachments', 'POST').length === 0 && !!(await guardado()), 'sin límites válidos no se envía la imagen ni se pierde la sesión');
      await elegirFotos('png');
      await hastaAca(async () => de('/attachments', 'POST').length === 1 && await sinEspera(), 'recuperación de configuración');
      ok(de('/config', 'GET').length - enLaPuerta === 2, 'la consulta fallida se puede repetir y la foto se sube al recuperarse');
    }
    reiniciarAsistente();
    S.limites = { ...LIMITES_FOTOS, max_kilobytes: 1 };
    await navegar(local()); await abrir(); await entrar();
    await elegirFotos('png');
    await hasta(() => /No pude preparar esa foto/.test(document.querySelector('[data-agente-charla]').textContent), 'peso de salida excedido');
    ok(de('/attachments', 'POST').length === 0, 'si la imagen reducida supera el peso publicado, no se envía');
    ok(!errores.length, 'los límites dinámicos no producen errores de JavaScript');
  }

  seccion('26. Formulario en pantalla: título, lo opcional plegado, select, errores y opciones principales');
  {
    reiniciarAsistente();
    await navegar(local()); await abrir(); await entrar();
    await escribir('especialista');
    await formularioListo();
    const v = await evaluar(`() => {
      const f = (${ultimoFormulario})();
      const det = f.querySelector('details');
      const nombres = (raiz) => [...raiz.querySelectorAll(':scope > .agente-campo')].map((l) => l.querySelector('input, select, textarea').name);
      return {
        titulo: f.querySelector('legend').textContent, nota: f.querySelector('fieldset > .agente-nota')?.textContent, boton: f.querySelector('button[type="submit"]').textContent,
        visibles: nombres(f.querySelector('fieldset')), plegados: det ? nombres(det) : [], abierto: det?.open, resumen: det?.querySelector('summary').textContent, pista: det?.querySelector('.agente-nota')?.textContent,
        select: [...f.elements.contact_time.options].map((o) => o.value + ':' + o.textContent), placeholder: f.elements.company_name.placeholder, obligatoria: f.elements.company_name.required,
        caja: !document.querySelector('[data-agente-form]').hidden, foco: document.activeElement?.name
      };
    }`);
    ok(v.titulo === FORMULARIO.form.title && v.nota === FORMULARIO.form.description && v.boton === 'Revisar y enviar', 'título, descripción y botón vienen del asistente');
    ok(v.visibles.join() === 'name,company_name,phone_number,email' && v.plegados.join() === 'contact_time,handoff_reason' && v.abierto === false && v.resumen === 'Agregar más detalles (opcional)' && v.pista === FORMULARIO.form.optional_section.hint,
      'lo obligatorio a la vista y lo opcional plegado en su sección (título y pista del asistente), cerrada si no trae nada');
    ok(v.select.join('|') === ':Cuando puedan|manana:En la mañana|tarde:En la tarde' && v.placeholder === 'Razón social o nombre de fantasía' && v.obligatoria, 'el select trae sus opciones (primero el texto del asistente) y la empresa, obligatoria, su placeholder');
    ok(v.caja && v.foco === 'company_name', 'la caja de texto sigue a la vista y el foco va al primer dato que falta (la empresa)');
    const antes = de('/messages', 'POST').length;
    await evaluar(`() => { (${ultimoFormulario})().requestSubmit(); return true; }`);
    await sleep(200);
    ok(de('/messages', 'POST').length === antes, 'sin la empresa no se envía (lo valida el navegador antes que el asistente)');
    await evaluar(`() => { const f = (${ultimoFormulario})(); f.querySelector('details').open = true; f.elements.contact_time.value = 'tarde'; f.elements.handoff_reason.value = 'Retiro de tambores'; f.elements.company_name.value = 'Empresa Chat SpA'; f.requestSubmit(); return true; }`);
    await hasta(() => /Revisa: Persona Chat, Empresa Chat SpA/.test(document.querySelector('[data-agente-charla]').textContent), 'el resumen');
    const env = de('/messages', 'POST').pop();
    ok(env.cuerpo.option_id === 'guardar_datos' && Object.keys(env.cuerpo.form_values).join() === 'name,company_name,phone_number,email,contact_time,handoff_reason'
      && env.cuerpo.form_values.contact_time === 'tarde' && env.cuerpo.form_values.handoff_reason === 'Retiro de tambores', 'envía todos los campos del asistente (también los plegados y el select) con option_id guardar_datos');
    ok((await textos()).includes('> Revisar y enviar'), 'el mensaje propio es el rótulo del botón del asistente');
    const opciones = () => evaluar(() => [...[...document.querySelectorAll('[data-agente-charla] .msg.is-bot')].pop().querySelectorAll('[data-opcion]')].map((b) => `${b.textContent}${b.classList.contains('is-principal') ? '*' : ''}`).join('|'));
    ok((await opciones()) === 'Sí, enviar*|Cancelar|Corregir', 'la opción primary va primero y destacada; las demás, en el orden del asistente');
    S.guion.push({ ruta: '/api/chat/messages', status: 200, json: { reply: { ...MENU, options: [{ id: 'a', label: 'Primera' }, { id: 'b', label: 'Segunda', primary: true }] }, usage: USO } });
    await escribir('menú');
    await hasta(() => /Primera/.test([...document.querySelectorAll('[data-agente-charla] .msg.is-bot')].pop().textContent), 'el menú');
    ok((await opciones()) === 'Primera|Segunda', 'en el menú principal (main_menu) se respeta el orden del asistente');
    /* Un error del asistente en lo opcional: la sección se abre, el campo se marca y recibe el foco */
    S.guion.push({ ruta: '/api/chat/messages', status: 200, json: { reply: formularioCon({ company_name: 'Empresa Chat SpA', handoff_reason: 'Motivo largo' }, { handoff_reason: 'Cuéntanos el motivo en menos palabras.' }), usage: USO } });
    await escribir('corregir');
    await hasta(() => !!document.querySelector('[data-agente-charla] [data-edicion] fieldset:not(:disabled) [aria-invalid="true"]'), 'el error del asistente');
    const e = await evaluar(`() => {
      const f = (${ultimoFormulario})();
      const el = f.elements.handoff_reason;
      return { abierto: f.querySelector('details').open, aria: el.getAttribute('aria-invalid'), error: document.getElementById(el.getAttribute('aria-describedby'))?.textContent, foco: document.activeElement === el, empresa: f.elements.company_name.value };
    }`);
    ok(e.abierto && e.aria === 'true' && e.error === 'Cuéntanos el motivo en menos palabras.' && e.foco && e.empresa === 'Empresa Chat SpA',
      'un error del asistente en lo opcional abre la sección, marca el campo (aria-invalid y aria-describedby con su explicación) y le da el foco');
    /* Lo opcional también se abre si trae un valor; una pregunta escrita sin tocar nada deja lo que manda el asistente */
    S.guion.push({ ruta: '/api/chat/messages', status: 200, json: { reply: formularioCon({ contact_time: 'manana' }), usage: USO } });
    await escribir('de nuevo');
    await hasta(() => !document.querySelector('.is-espera') && document.querySelectorAll('[data-agente-charla] [data-edicion]').length >= 3, 'el formulario otra vez');
    await formularioListo();
    const o = await evaluar(`() => { const f = (${ultimoFormulario})(); return { abierto: f.querySelector('details').open, hora: f.elements.contact_time.value, motivo: f.elements.handoff_reason.value }; }`);
    ok(o.abierto && o.hora === 'manana' && o.motivo === '', 'lo opcional se abre si trae un valor, y lo que la persona no tocó viene del asistente');
    ok(!errores.length, `sin errores de JavaScript${errores.length ? `: ${errores.slice(0, 3).join(' | ')}` : ''}`);
  }

  seccion('27. Borrador del formulario en la pestaña (draft_id) y al recargar');
  {
    reiniciarAsistente();
    await navegar(local()); await abrir(); await entrar();
    await escribir('especialista');
    await formularioListo();
    await evaluar(`() => {
      const f = (${ultimoFormulario})();
      f.elements.company_name.value = 'Borrador SpA'; f.elements.company_name.dispatchEvent(new Event('input', { bubbles: true }));
      f.elements.contact_time.value = 'manana'; f.elements.contact_time.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }`);
    const b = JSON.parse(await guardado()).borrador;
    ok(b?.id === 'lead-7' && b.valores.company_name === 'Borrador SpA' && b.valores.contact_time === 'manana' && !('name' in b.valores), 'al escribir, la pestaña guarda lo cambiado con el draft_id del formulario (solo los campos tocados)');
    ok(!(await evaluar(() => JSON.stringify(localStorage))).includes('Borrador SpA'), 'el borrador no sale de la pestaña (nada en localStorage)');
    S.historial = [{ role: 'user', text: 'especialista' }, { role: 'assistant', ...FORMULARIO }];
    const enviadosAntes = de('/messages', 'POST').length;
    await navegar(local(), { limpiar: false }); await abrir();
    await formularioListo();
    const leerForm = () => evaluar(`() => { const f = (${ultimoFormulario})(); return { empresa: f.elements.company_name.value, hora: f.elements.contact_time.value, nombre: f.elements.name.value, abierto: f.querySelector('details').open, caja: !document.querySelector('[data-agente-form]').hidden }; }`);
    let r = await leerForm();
    ok(r.empresa === 'Borrador SpA' && r.hora === 'manana' && r.nombre === 'Persona Chat' && r.abierto, 'al recargar vuelve el formulario pendiente (reply de /history) con el borrador encima; lo opcional, abierto porque trae algo');
    ok(de('/messages', 'POST').length === enviadosAntes && r.caja, 'retomar no envía nada y deja la caja de texto a la vista');
    await evaluar(() => { const s = JSON.parse(sessionStorage.getItem('agente-chat')); s.borrador = { id: 'otro-formulario', valores: { company_name: 'Ajena SpA' } }; sessionStorage.setItem('agente-chat', JSON.stringify(s)); return true; });
    await navegar(local(), { limpiar: false }); await abrir();
    await formularioListo();
    r = await leerForm();
    ok(r.empresa === '' && !JSON.parse(await guardado()).borrador, 'el borrador de otro formulario (otro draft_id) no se usa y se borra');
    await evaluar(`() => { const f = (${ultimoFormulario})(); f.elements.company_name.value = 'Se cancela SpA'; f.elements.company_name.dispatchEvent(new Event('input', { bubbles: true })); return true; }`);
    ok(!!JSON.parse(await guardado()).borrador, 'antes de cancelar hay borrador');
    await tocar('Cancelar');
    await hasta(() => /Respuesta a «cancelar»/.test(document.querySelector('[data-agente-charla]').textContent), 'cancelado');
    ok(!JSON.parse(await guardado()).borrador, 'una respuesta que ya no trae ese formulario borra el borrador');
    await escribir('especialista');
    await formularioListo();
    await evaluar(`() => { const f = (${ultimoFormulario})(); f.elements.company_name.value = 'Enviada SpA'; f.elements.company_name.dispatchEvent(new Event('input', { bubbles: true })); f.requestSubmit(); return true; }`);
    await hasta(() => /Revisa: Persona Chat, Enviada SpA/.test(document.querySelector('[data-agente-charla]').textContent), 'enviado');
    const s27 = JSON.parse(await guardado());
    ok(!s27.borrador && !s27.pendiente && !JSON.stringify(s27).includes('Enviada SpA'), 'al enviar el formulario se borra el borrador y, con la respuesta, nada de lo escrito queda en la pestaña');
  }

  seccion('28. Una pregunta escrita con el formulario abierto');
  {
    reiniciarAsistente();
    await navegar(local()); await abrir(); await entrar();
    await escribir('especialista');
    await formularioListo();
    await evaluar(`() => { const f = (${ultimoFormulario})(); f.elements.company_name.value = 'Mientras SpA'; f.elements.company_name.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-agente-form] input[name="q"]').focus(); return true; }`);
    S.guion.push({ ruta: '/api/chat/messages', status: 200, json: { reply: { ...FORMULARIO, text: 'Sí, retiramos aceite usado. Cuando quieras, sigue con tus datos.' }, usage: USO } });
    await escribir('¿Retiran aceite usado?');
    await hasta(() => /retiramos aceite usado/.test(document.querySelector('[data-agente-charla]').textContent), 'la respuesta');
    await hasta(() => {
      const m = [...document.querySelectorAll('[data-agente-charla] .msg.is-bot')].find((x) => /retiramos aceite usado/.test(x.textContent));
      const a = m.getBoundingClientRect();
      const c = document.querySelector('[data-agente-charla]').getBoundingClientRect();
      return a.top >= c.top - 1 && a.top < c.bottom - 40;
    }, 'la respuesta a la vista');
    ok(true, 'la respuesta a la pregunta queda a la vista, aunque el formulario vuelva debajo');
    const t = de('/messages', 'POST').pop();
    ok(t.cuerpo.text === '¿Retiran aceite usado?' && !t.cuerpo.form_values && !t.cuerpo.option_id, 'la pregunta va como texto, sin los datos del formulario');
    const v = await evaluar(`() => ({ foco: document.activeElement?.name, empresa: (${ultimoFormulario})().elements.company_name.value,
      formularios: document.querySelectorAll('[data-agente-charla] [data-edicion]').length, inactivos: document.querySelectorAll('[data-agente-charla] [data-edicion] fieldset:disabled').length })`);
    ok(v.foco === 'q', 'el foco sigue en la caja de texto: la pregunta no se lo pasa al formulario');
    ok(v.empresa === 'Mientras SpA' && v.formularios === 2 && v.inactivos === 1, 'el mismo formulario vuelve debajo de la respuesta con lo que se había escrito; el anterior queda inactivo');
    /* Un asistente anterior (sin draft_id): lo escrito vuelve igual, desde la memoria de la página */
    await tocar('Cancelar');
    await hasta(() => /Respuesta a «cancelar»/.test(document.querySelector('[data-agente-charla]').textContent), 'cancelado');
    const SIN_ID = { ...FORMULARIO, form: { ...FORMULARIO.form, draft_id: undefined } };
    S.guion.push({ ruta: '/api/chat/messages', status: 200, json: { reply: SIN_ID, usage: USO } });
    await escribir('formulario sin borrador');
    await formularioListo();
    await evaluar(`() => { const f = (${ultimoFormulario})(); f.elements.company_name.value = 'Memoria SpA'; f.elements.company_name.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-agente-form] input[name="q"]').focus(); return true; }`);
    S.guion.push({ ruta: '/api/chat/messages', status: 200, json: { reply: { ...SIN_ID, text: 'También atendemos Lampa.' }, usage: USO } });
    await escribir('¿Atienden Lampa?');
    await hasta(() => /También atendemos Lampa/.test(document.querySelector('[data-agente-charla]').textContent), 'la respuesta sin draft_id');
    await formularioListo();
    const w = await evaluar(`() => ({ foco: document.activeElement?.name, empresa: (${ultimoFormulario})().elements.company_name.value })`);
    ok(w.foco === 'q' && w.empresa === 'Memoria SpA' && !JSON.parse(await guardado()).borrador, 'sin draft_id (asistente anterior), lo escrito vuelve desde la memoria de la página, sin guardarse en la pestaña');
  }

  seccion('29. Recordar la sesión en este dispositivo (remember del asistente)');
  {
    const DIA = 86400000;
    const enDispositivo = () => evaluar(() => localStorage.getItem('agente-chat-sesion'));
    const datosEnDispositivo = () => evaluar(() => localStorage.getItem('agente-chat-datos'));
    const entrarRecordando = async (marcar) => {
      await hasta(() => !!document.querySelector('.agente-puerta'), 'la puerta');
      await casillaLista();
      await evaluar((x) => {
        const f = document.querySelector('.agente-puerta');
        f.elements.name.value = 'Persona Chat'; f.elements.email.value = 'chat@ejemplo.cl'; f.elements.phone.value = '+56 9 8765 4321';
        f.elements.privacy_accepted.checked = true; f.elements.remember.checked = x; f.requestSubmit(); return true;
      }, marcar);
      await hasta(() => !document.querySelector('.agente-puerta') && !document.querySelector('[data-agente-form]').hidden, 'sesión abierta');
    };
    const pie = () => evaluar(() => ({
      borrar: !document.querySelector('.agente-salir').hidden, descargar: !document.querySelector('[data-agente-descargar]').hidden,
      olvidar: document.querySelector('[data-agente-olvidar]').hidden ? '' : document.querySelector('[data-agente-olvidar]').textContent
    }));
    const retomada = () => hasta(() => /¿En qué te ayudo\?/.test(document.querySelector('[data-agente-charla]').textContent) && !document.querySelector('.agente-puerta') && !document.querySelector('.is-espera'), 'conversación retomada');

    reiniciarAsistente();
    await navegar(local()); await abrir();
    await hasta(() => !!document.querySelector('.agente-puerta'), 'la puerta');
    await casillaLista();
    const c = await evaluar(() => { const x = document.querySelector('.agente-puerta input[name="remember"]'); return { marcada: x.checked, texto: x.closest('label').textContent, ayuda: document.getElementById(x.getAttribute('aria-describedby'))?.textContent }; });
    ok(!c.marcada && c.texto.startsWith(RECORDAR.label) && c.ayuda === RECORDAR.help, 'la puerta ofrece «Recordar» sin marcar, con el rótulo y la ayuda del asistente (GET /config → remember)');
    ok((await evaluar(() => document.querySelector('.agente-puerta button[type="submit"]').textContent)) === 'Comenzar', 'el botón de la puerta dice «Comenzar»');
    await entrarRecordando(false);
    ok(!(await enDispositivo()) && !(await datosEnDispositivo()) && !JSON.parse(await guardado()).recordada, 'sin marcar, ni la sesión ni los datos quedan en este dispositivo');
    let p = await pie();
    ok(p.borrar && p.descargar && !p.olvidar, 'con la sesión abierta, el pie ofrece «Borrar esta conversación» y «Descargar mis datos»; «Olvidar este dispositivo» no, porque no se recordó');

    reiniciarAsistente();
    await navegar(local()); await abrir();
    await entrarRecordando(true);
    const tab = JSON.parse(await guardado());
    const dev = JSON.parse(await enDispositivo());
    ok(Object.keys(dev).sort().join() === 'token,vence' && dev.token === tab.token && dev.vence === tab.vence && tab.recordada === true, 'marcada: el token y su vencimiento también quedan en localStorage, y nada más');
    const dd = JSON.parse(await datosEnDispositivo());
    ok(dd.name === 'Persona Chat' && dd.vence > Date.now() + 29 * DIA && dd.vence <= Date.now() + 30 * DIA, 'y los datos de contacto, por los días del asistente (contact_days)');
    ok(!/Persona|chat@ejemplo/.test(await enDispositivo()) && de('/sessions', 'POST')[0].cuerpo.remember === undefined, 'la sesión recordada no lleva datos personales y la casilla no se envía al asistente');
    ok((await pie()).olvidar === RECORDAR.forget_label, 'con la sesión recordada, el pie ofrece «Olvidar este dispositivo» (forget_label del asistente)');
    ok((await evaluar(() => [document.querySelector('.agente-salir'), document.querySelector('[data-agente-descargar]'), document.querySelector('[data-agente-olvidar]')].map((b) => b.textContent).join('|'))) === 'Borrar esta conversación|Descargar mis datos|Olvidar este dispositivo',
      'los rótulos del pie son exactamente «Borrar esta conversación», «Descargar mis datos» y «Olvidar este dispositivo»');
    /* Punto 1 de la política: fuera de la pestaña, solo la sesión y los datos de contacto; el borrador y el pendiente, en la pestaña */
    await escribir('especialista');
    await formularioListo();
    await evaluar(`() => { const f = (${ultimoFormulario})(); f.elements.company_name.value = 'Solo Pestaña SpA'; f.elements.company_name.dispatchEvent(new Event('input', { bubbles: true })); return true; }`);
    S.retardos.push(1500);
    await escribir('Pregunta que tarda');
    await hasta(() => !!document.querySelector('[data-agente-charla] .is-espera'), 'el turno en curso');
    const almacen = await evaluar(() => ({ claves: Object.keys(localStorage).filter((k) => k.startsWith('agente')).sort(), local: JSON.stringify(localStorage), pestana: sessionStorage.getItem('agente-chat') || '' }));
    ok(almacen.claves.join() === 'agente-chat-datos,agente-chat-sesion' && !/Solo Pestaña|Pregunta que tarda/.test(almacen.local) && /Solo Pestaña/.test(almacen.pestana) && /Pregunta que tarda/.test(almacen.pestana),
      'fuera de la pestaña quedan solo la sesión (token y vencimiento) y los datos de contacto; el borrador y el mensaje pendiente, solo en la pestaña');
    await hasta(() => /Respuesta a «Pregunta que tarda»/.test(document.querySelector('[data-agente-charla]').textContent), 'la respuesta');

    S.historial = [{ role: 'assistant', ...MENU }];
    await evaluar(() => { sessionStorage.clear(); return true; });
    await navegar(local(), { limpiar: false }); await abrir();
    await retomada();
    ok(de('/history', 'GET').pop()?.token === dev.token && de('/sessions', 'POST').length === 1, 'una pestaña nueva retoma la sesión recordada (GET /history con ese token) sin pedir los datos');
    ok(JSON.parse(await guardado()).recordada === true && (await pie()).olvidar !== '', 'y la anota en la pestaña como recordada, con «Olvidar este dispositivo» a la vista');
    ok(JSON.parse(await datosEnDispositivo()).vence === dd.vence && JSON.parse(await enDispositivo()).vence === dev.vence, 'retomar y conversar no renuevan nada: los datos se renuevan solo al abrir una sesión con la casilla marcada, y la sesión vence cuando dijo el asistente');

    S.tokens.add('tok-pestana');
    await evaluar(() => { sessionStorage.setItem('agente-chat', JSON.stringify({ token: 'tok-pestana', vence: new Date(Date.now() + 3600e3).toISOString(), fotos: 0 })); return true; });
    await navegar(local(), { limpiar: false }); await abrir();
    await retomada();
    ok(de('/history', 'GET').pop()?.token === 'tok-pestana' && JSON.parse(await enDispositivo()).token === dev.token && !(await pie()).olvidar, 'al cargar manda la sesión de la pestaña; la recordada sigue guardada para las demás');

    await evaluar(() => { sessionStorage.clear(); return true; });
    await navegar(local(), { limpiar: false }); await abrir();
    await retomada();
    await desdeOtroDocumento(`(w) => w.localStorage.removeItem('agente-chat-sesion')`);
    await hasta(() => !!document.querySelector('.agente-puerta') && /La sesión recordada se cerró/.test(document.querySelector('[data-agente-charla]').textContent), 'cerrada desde otro documento');
    ok(!(await guardado()) && (await evaluar(() => document.querySelector('.agente-puerta').elements.name.value)) === 'Persona Chat', 'si otra pestaña quita la sesión recordada (evento storage), esta también la cierra y vuelve a la puerta, con los datos de contacto precargados');

    const puertaPrecargada = await evaluar(() => { const f = document.querySelector('.agente-puerta'); return { privacidad: f.elements.privacy_accepted.checked, olvidar: f.querySelector('.agente-olvidar')?.textContent || '' }; });
    ok(!puertaPrecargada.privacidad && !de('/sessions', 'POST').slice(1).length, 'los datos recordados solo precargan la puerta: no se envían ni se aceptan las condiciones hasta tocar «Comenzar»');
    await casillaLista();
    ok((await evaluar(() => document.querySelector('.agente-puerta .agente-olvidar').textContent)) === 'Olvidar este dispositivo', 'en la puerta precargada, el botón para quitarlos es «Olvidar este dispositivo»');
    await evaluar(() => { document.querySelector('.agente-puerta .agente-olvidar').click(); return true; });
    ok(!(await enDispositivo()) && !(await datosEnDispositivo()) && (await evaluar(() => document.querySelector('.agente-puerta').elements.name.value)) === '', 'y quita las dos cosas (sesión y datos recordados) y vacía la puerta');
    await entrarRecordando(true);
    ok(JSON.parse(await datosEnDispositivo()).vence > dd.vence, 'abrir una sesión con la casilla marcada vuelve a contar los días de los datos de contacto');
    llamadas.length = 0;
    await evaluar(() => { document.querySelector('[data-agente-olvidar]').click(); return true; });
    await hasta(() => !!document.querySelector('.agente-puerta'), 'la puerta tras olvidar');
    ok(!(await enDispositivo()) && !(await datosEnDispositivo()) && !(await guardado()) && /ya no recordamos tu sesión ni tus datos/.test(await charlaTexto())
      && (await evaluar(() => document.querySelector('.agente-puerta').elements.name.value)) === '', '«Olvidar este dispositivo» con la sesión abierta: quita la sesión y los datos recordados, cierra el chat aquí y la puerta vuelve vacía');
    ok(!de('/session', 'DELETE').length && /no borra la conversación/.test(await charlaTexto()), 'y no borra nada en el asistente (lo dice)');

    await entrarRecordando(true);
    S.tokens.delete(JSON.parse(await guardado()).token);
    await evaluar(() => { sessionStorage.clear(); return true; });
    await navegar(local(), { limpiar: false }); await abrir();
    await hasta(() => !!document.querySelector('.agente-puerta') && /Tu sesión terminó/.test(document.querySelector('[data-agente-charla]').textContent), 'el 401');
    ok(!(await enDispositivo()) && !(await guardado()), 'una sesión recordada que el asistente ya no reconoce (401) se quita de este dispositivo');
    ok(!!(await datosEnDispositivo()) && (await evaluar(() => document.querySelector('.agente-puerta').elements.name.value)) === 'Persona Chat', 'los datos de contacto siguen, para precargar la puerta');
    await entrarRecordando(false);
    ok(!(await enDispositivo()) && !(await datosEnDispositivo()), 'abrir otra sesión sin marcar la casilla quita lo recordado');
    await evaluar(() => { document.querySelector('.agente-salir').click(); return true; });
    await tocar('Sí, borrar');
    await hasta(() => /Listo: borramos esta conversación/.test(document.querySelector('[data-agente-charla]').textContent) && !!document.querySelector('.agente-puerta'), 'borrada la que no se recordó');

    await entrarRecordando(true);
    ok(!!(await enDispositivo()) && !!(await datosEnDispositivo()), 'antes de borrar hay sesión y datos recordados');
    await evaluar(() => { document.querySelector('.agente-salir').click(); return true; });
    await tocar('Sí, borrar');
    await hasta(() => /Listo: borramos esta conversación/.test(document.querySelector('[data-agente-charla]').textContent) && !!document.querySelector('.agente-puerta'), 'borrada');
    ok(!(await enDispositivo()) && !(await datosEnDispositivo()), '«Borrar esta conversación» quita también la sesión y los datos recordados');

    /* remember.enabled sin textos: los de respaldo, que son los de la política */
    reiniciarAsistente();
    S.remember = { enabled: true, label: '', help: '', forget_label: '', contact_days: 30 };
    await navegar(local()); await abrir();
    await hasta(() => !!document.querySelector('.agente-puerta'), 'la puerta');
    await casillaLista();
    const r = await evaluar(() => { const x = document.querySelector('.agente-puerta input[name="remember"]'); return { rotulo: x.nextElementSibling.firstChild.textContent, ayuda: document.getElementById(x.getAttribute('aria-describedby')).textContent }; });
    ok(r.rotulo === 'Recordar mi sesión y conversación (opcional)' && r.ayuda === 'Guarda en este navegador el acceso a esta conversación mientras siga vigente y tus datos de contacto para un próximo registro. Úsalo solo en un navegador personal.',
      'sin label ni help del asistente, la casilla usa los textos de respaldo');
    await entrarRecordando(true);
    ok(!!(await enDispositivo()) && (await pie()).olvidar === 'Olvidar este dispositivo', 'y sin forget_label, el pie dice «Olvidar este dispositivo»');
    ok(!errores.length, `sin errores de JavaScript${errores.length ? `: ${errores.slice(0, 3).join(' | ')}` : ''}`);
  }

  seccion('30. Retomar con la última respuesta (reply de /history)');
  {
    reiniciarAsistente();
    await navegar(local()); await abrir(); await entrar();
    S.historial = [
      { role: 'assistant', text: 'Hola, soy el asistente.', options: [{ id: 'x', label: 'Vieja' }], sources: [] },
      { role: 'user', text: 'Quiero cotizar' },
      { role: 'assistant', text: 'Elige cómo seguimos.' }  // como la plantilla: los mensajes sin opciones ni formulario
    ];
    S.reply = { text: 'Elige cómo seguimos.', intent: 'quote', sources: [], options: [{ id: 'mas', label: 'Ver más' }, { id: 'cotizar', label: 'Cotizar retiro', primary: true }] };
    await navegar(local(), { limpiar: false }); await abrir();
    await hasta(() => /Elige cómo seguimos/.test(document.querySelector('[data-agente-charla]').textContent) && !document.querySelector('.is-espera'), 'retomada');
    const v = await evaluar(() => ({
      opciones: [...document.querySelectorAll('[data-agente-charla] [data-opcion]')].map((b) => b.textContent),
      bot: document.querySelectorAll('[data-agente-charla] .msg.is-bot').length,
      ultimo: [...document.querySelectorAll('[data-agente-charla] .msg.is-bot')].pop().querySelectorAll('[data-opcion]').length
    }));
    ok(v.opciones.join('|') === 'Cotizar retiro|Ver más' && v.bot === 2 && v.ultimo === 2, 'las opciones salen de reply y van en su propio mensaje (la primary primero); las de mensajes anteriores no se muestran');
    ok(!de('/messages', 'POST').length && !(await evaluar(() => document.querySelector('[data-agente-descargar]').hidden)), 'retomar no envía nada, y con reply (asistente nuevo) se ofrece «Descargar mis datos»');
    S.historial = [];
    S.reply = MENU;
    await navegar(local(), { limpiar: false }); await abrir();
    await hasta(() => /¿En qué te ayudo\?/.test(document.querySelector('[data-agente-charla]').textContent) && !document.querySelector('.is-espera'), 'el saludo');
    ok(!de('/messages', 'POST').length && (await botones()).join('|') === 'Retiro de residuos|Normativa', 'sin mensajes pero con reply (el saludo de la apertura): lo muestra con sus opciones, sin pedir el menú con «inicio»');
    /* De a 50: next_before trae «Ver mensajes anteriores», que pide ?before= y los agrega arriba, sin opciones */
    S.historial = [{ role: 'user', text: 'Pregunta reciente' }, { role: 'assistant', text: 'Respuesta reciente.', options: [], sources: [] }];
    S.reply = undefined;
    S.anteriores = [{ role: 'user', text: 'Pregunta antigua' }, { role: 'assistant', text: 'Respuesta antigua.', options: [{ id: 'z', label: 'Opción antigua' }], sources: [] }];
    await navegar(local(), { limpiar: false }); await abrir();
    await hasta(() => /Respuesta reciente/.test(document.querySelector('[data-agente-charla]').textContent) && !document.querySelector('.is-espera'), 'la página reciente');
    ok((await evaluar(() => document.querySelector('[data-agente-charla]').firstElementChild.textContent)) === 'Ver mensajes anteriores', 'con next_before, arriba aparece «Ver mensajes anteriores»');
    await evaluar(() => { document.querySelector('[data-agente-charla] .agente-anteriores button').click(); return true; });
    await hasta(() => /Pregunta antigua/.test(document.querySelector('[data-agente-charla]').textContent), 'la página anterior');
    const pag = de('/history', 'GET').pop();
    ok(pag.consulta === '?before=pagina-2' && pag.token === JSON.parse(await guardado()).token, 'pide la página anterior con ?before= y el token');
    ok((await textos()).join('|') === '> Pregunta antigua|Respuesta antigua.|> Pregunta reciente|Respuesta reciente.' && !(await evaluar(() => !!document.querySelector('.agente-anteriores')))
      && !(await evaluar(() => [...document.querySelectorAll('[data-opcion]')].some((b) => b.textContent === 'Opción antigua'))), 'los anteriores van arriba, en orden y sin opciones; sin más páginas, el botón se va');
  }

  seccion('31. Descargar mis datos (GET /api/chat/session)');
  {
    reiniciarAsistente();
    await navegar(local()); await abrir(); await entrar();
    await hasta(() => !document.querySelector('[data-agente-descargar]').hidden, 'el botón');
    const antes = await evaluar(() => window.__descargas.length);
    await evaluar(() => { document.querySelector('[data-agente-descargar]').click(); return true; });
    await hasta((n) => window.__descargas.length === n + 1 && window.__descargas[n].texto !== null, 'la descarga', 8000, antes);
    const d = await evaluar((n) => window.__descargas[n], antes);
    const g = de('/session', 'GET');
    ok(g.length === 1 && g[0].token === JSON.parse(await guardado()).token, '«Descargar mis datos» pide GET /api/chat/session con el token de la sesión');
    ok(d.nombre === 'mis-datos-del-chat.json' && d.tipo === 'application/json' && d.conectado && JSON.stringify(JSON.parse(d.texto)) === JSON.stringify(COPIA), 'y descarga «mis-datos-del-chat.json» con la copia que entrega el asistente');
    S.guion.push({ ruta: '/api/chat/session', metodo: 'GET', status: 409, json: { error: 'busy' } });
    await evaluar(() => { document.querySelector('[data-agente-descargar]').click(); return true; });
    await hasta(() => /Hay una respuesta en curso/.test([...document.querySelectorAll('[data-agente-charla] .msg.is-bot')].pop().textContent), 'busy al descargar');
    ok((await evaluar(() => window.__descargas.length)) === antes + 1 && (await botones()).includes('Reintentar'), '409 busy (un turno en curso): avisa y ofrece «Reintentar», sin descargar nada');
    await tocar('Reintentar');
    await hasta((n) => window.__descargas.length === n + 2, 'la descarga reintentada', 8000, antes);
    ok(de('/session', 'GET').length === 3, '«Reintentar» la pide otra vez y descarga');
    S.guion.push({ ruta: '/api/chat/session', metodo: 'GET', status: 404, json: { message: 'Not Found' } });
    await evaluar(() => { document.querySelector('[data-agente-descargar]').click(); return true; });
    await hasta(() => document.querySelector('[data-agente-descargar]').hidden, 'oculto tras el 404');
    const aviso404 = await evaluar(() => { const m = [...document.querySelectorAll('[data-agente-charla] .msg.is-bot')].pop(); return { texto: m.textContent, enlace: m.querySelector('a')?.getAttribute('href') || '' }; });
    ok(/todavía no se puede descargar/.test(aviso404.texto) && /legal\/politica-de-privacidad\.html$/.test(aviso404.enlace) && (await evaluar(() => window.__descargas.length)) === antes + 2,
      'si el asistente no tiene la copia (404), el botón se oculta y se explica cómo pedirla, sin descargar nada');
  }

  seccion('32. Asistente anterior: sin remember, sin reply y sin GET /session');
  {
    reiniciarAsistente();
    S.antiguo = true;
    await navegar(local()); await abrir();
    await hasta(() => !!document.querySelector('.agente-puerta'), 'la puerta');
    await casillaLista();
    const rotulo = await evaluar(() => document.querySelector('.agente-puerta input[name="remember"]').closest('label').textContent);
    ok(/^Recordar mi nombre, correo y teléfono en este dispositivo por 30 días/.test(rotulo), 'la casilla es la de antes, con su texto: solo los datos de contacto');
    await evaluar(() => {
      const f = document.querySelector('.agente-puerta');
      f.elements.name.value = 'Persona Chat'; f.elements.email.value = 'chat@ejemplo.cl'; f.elements.phone.value = '+56 9 8765 4321';
      f.elements.privacy_accepted.checked = true; f.elements.remember.checked = true; f.requestSubmit(); return true;
    });
    await hasta(() => !document.querySelector('.agente-puerta') && !document.querySelector('[data-agente-form]').hidden, 'sesión abierta');
    ok(!(await evaluar(() => localStorage.getItem('agente-chat-sesion'))) && !!(await evaluar(() => localStorage.getItem('agente-chat-datos'))) && !JSON.parse(await guardado()).recordada,
      'marcada, guarda solo los datos de contacto: la sesión no se recuerda');
    ok(await evaluar(() => !document.querySelector('.agente-salir').hidden && document.querySelector('[data-agente-descargar]').hidden && document.querySelector('[data-agente-olvidar]').hidden),
      'el pie ofrece solo «Borrar esta conversación»: sin la copia de los datos no hay «Descargar mis datos»');
    const VIEJO = {
      text: 'Revisa tus datos.', intent: 'lead_qualification', sources: [], options: [{ id: 'contacto:name', label: 'Nombre' }, { id: 'cancelar', label: 'Cancelar' }],
      form: { action: 'guardar_datos', fields: [
        { name: 'name', label: 'Nombre', type: 'text', value: 'Persona Chat', required: true, max_length: 150 },
        { name: 'company_name', label: 'Empresa', type: 'text', value: '', required: true, max_length: 150 }
      ] }
    };
    S.guion.push({ ruta: '/api/chat/messages', status: 200, json: { reply: VIEJO, usage: USO } });
    await escribir('corregir');
    await formularioListo();
    const f = await evaluar(`() => { const f = (${ultimoFormulario})(); return { titulo: f.querySelector('legend').textContent, boton: f.querySelector('button[type="submit"]').textContent, detalles: !!f.querySelector('details'), caja: !document.querySelector('[data-agente-form]').hidden }; }`);
    ok(f.titulo === 'Revisa tus datos' && f.boton === 'Guardar cambios' && !f.detalles && f.caja && (await botones()).join('|') === 'Cancelar',
      'un formulario sin título ni rótulos usa los textos de respaldo, con la caja de texto a la vista y sin los botones de corregir dato por dato');
    await evaluar(`() => { const f = (${ultimoFormulario})(); f.elements.company_name.value = 'Vieja SpA'; f.elements.company_name.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-agente-form] input[name="q"]').focus(); return true; }`);
    ok(!JSON.parse(await guardado()).borrador, 'sin draft_id no se guarda borrador en la pestaña');
    S.historial = [
      { role: 'assistant', text: 'Hola.', options: [{ id: 'a', label: 'A' }], sources: [] },
      { role: 'assistant', text: 'Último.', options: [{ id: 'b', label: 'B' }], sources: [] }
    ];
    await navegar(local(), { limpiar: false }); await abrir();
    await hasta(() => /Último\./.test(document.querySelector('[data-agente-charla]').textContent) && !document.querySelector('.is-espera'), 'retomada sin reply');
    ok((await botones()).join('|') === 'B' && (await evaluar(() => document.querySelector('[data-agente-descargar]').hidden)), 'sin reply retoma como antes: las opciones del último mensaje');
    await evaluar(() => { sessionStorage.clear(); return true; });
    await navegar(local(), { limpiar: false }); await abrir();
    await hasta(() => !!document.querySelector('.agente-puerta'), 'la puerta en otra pestaña');
    ok((await evaluar(() => document.querySelector('.agente-puerta').elements.name.value)) === 'Persona Chat', 'en una pestaña nueva vuelve la puerta (la sesión no se recordó), precargada con los datos de contacto');
    ok(!de('/session', 'GET').length, 'con un asistente anterior nunca se llama GET /session');
    ok(!errores.length, `sin errores de JavaScript${errores.length ? `: ${errores.slice(0, 3).join(' | ')}` : ''}`);
  }
} catch (e) {
  ok(false, `las pruebas se interrumpieron: ${e.stack || e}`);
} finally {
  ws.close();
  nav.kill();
  sitio.close();
  asistente.close();
  await sleep(300);
  rmSync(perfil, { recursive: true, force: true });
}
if (avisos.length) { seccion('Avisos'); avisos.forEach((a) => console.log(`  · ${a}`)); }
console.log(fallas ? `\n${fallas} comprobación(es) fallaron.` : '\nTodo bien.');
process.exit(fallas ? 1 : 0);
