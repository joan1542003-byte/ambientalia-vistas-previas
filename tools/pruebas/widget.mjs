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
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png' };
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
   una ruta ({ ruta, metodo?, status, json?, html?, retardo?, cortar?, procesar? }); `retardos`, cuánto tarda el modelo */
const llamadas = [];
const S = { tokens: new Set(), n: 0, procesados: new Map(), enCurso: new Set(), ejecuciones: 0, duplicados: 0, guion: [], retardos: [], historial: [], fotos: 0, cortarHasta: 0 };
const USO = { max: 10, used: 1, remaining: 9, resets_at: null };
const MENU = { text: 'Hola, soy el asistente. ¿En qué te ayudo?', options: [{ id: 'residuos', label: 'Retiro de residuos' }, { id: 'normativa', label: 'Normativa' }], sources: [], intent: 'main_menu', lead_status: null };
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
  llamadas.push({ metodo: req.method, ruta: url.pathname, token, origen: req.headers.origin || '', cuerpo, mp });
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
    await sleep(g.retardo || 0);
    if (g.html !== undefined) { res.writeHead(g.status, { ...cors, 'Content-Type': 'text/html' }); res.end(g.html); return; }
    json(g.status, g.json || {});
    return;
  }
  if (url.pathname === '/api/chat/sessions' && req.method === 'POST') {
    const t = `tok-${++S.n}`;
    S.tokens.add(t);
    json(201, { token: t, expires_at: new Date(Date.now() + 3600e3).toISOString(), reply: MENU, usage: { ...USO, used: 0, remaining: 10 } });
    return;
  }
  if (!S.tokens.has(token)) { json(401, { error: 'session_expired' }); return; }
  if (url.pathname === '/api/chat/messages' && req.method === 'POST') { const r = await turno(); json(r.status, r.json); return; }
  if (url.pathname === '/api/chat/history' && req.method === 'GET') { json(200, { messages: S.historial }); return; }
  if (url.pathname === '/api/chat/session' && req.method === 'DELETE') {
    if (cuerpo.confirm !== true) { json(422, { error: 'confirmation_required' }); return; }
    S.tokens.delete(token);
    json(200, { deleted: true });
    return;
  }
  if (url.pathname === '/api/chat/attachments' && req.method === 'POST') {
    if (S.fotos >= 2) { json(422, { error: 'attachment_limit', message: 'Ya adjuntaste el máximo de imágenes para esta conversación.' }); return; }
    S.fotos += 1;
    json(201, { attachment: { id: S.fotos, name: mp?.archivos[0]?.nombre }, reply: { text: 'Recibí la imagen. Quedará adjunta a tu solicitud cuando pidas que un especialista te contacte.', options: [], sources: [] }, usage: USO });
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
  Object.assign(S, { procesados: new Map(), enCurso: new Set(), ejecuciones: 0, duplicados: 0, guion: [], retardos: [], historial: [], fotos: 0, cortarHasta: 0 });
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
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.__abiertas = []; window.open = (...a) => { window.__abiertas.push(String(a[0])); return null; };
  window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));` });
let wp = null;
const conWordPress = async (config) => {
  if (wp) { await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: wp }); wp = null; }
  if (config) wp = (await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.TA_API = ${JSON.stringify(config)};` })).result.identifier;
};
const pestanas = async () => (await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json()).filter((t) => t.type === 'page' && t.id !== objetivos[0].id);
const navegar = async (url, { limpiar = true } = {}) => {
  if (limpiar) await evaluar(() => { try { sessionStorage.clear(); } catch { /* about:blank */ } return true; });
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
    ok((await enCarpeta()) === 'fotos,token,vence' && !/chat@ejemplo|Persona/.test(await guardado()), 'en la pestaña queda solo el token, su vencimiento y el número de fotos: ni nombre ni correo');
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

  seccion('Edición de datos antes de confirmar la solicitud');
  {
    const editor = {
      text: 'Revisa y corrige tus datos. Guardar cambios no envía la solicitud.', intent: 'lead_qualification', sources: [],
      form: { action: 'guardar_datos', submit_label: 'Guardar cambios', fields: [
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
        && !f.querySelector('img') && !window.__xss && document.querySelector('[data-agente-form]').hidden;
    }), 'los cinco campos se precargan con etiquetas y los valores se muestran como texto seguro');
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
      f.elements.handoff_reason.value = 'Retirar madera'; return true;
    });
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
    ok(!(await guardado()).includes('Popito') && !(await guardado()).includes('Retirar madera'), 'los cambios no se guardan en sessionStorage');

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
    S.historial = [{ role: 'user', text: 'Pregunta sin respuesta', options: [], sources: [] }];
    await navegar(local(), { limpiar: false });
    await abrir();
    await hasta(() => /todavía no tiene respuesta/.test(document.querySelector('[data-agente-charla]').textContent), 'último sin respuesta');
    S.historial = [...S.historial, { role: 'assistant', text: 'Ahora sí, la respuesta.', options: [], sources: [] }];
    await tocar('Actualizar');
    await hasta(() => /Ahora sí, la respuesta/.test(document.querySelector('[data-agente-charla]').textContent), 'actualizado');
    ok(de('/history', 'GET').length === 2 && de('/messages', 'POST').length === 0, 'último mensaje sin respuesta: «Actualizar» vuelve a leer el historial, sin reenviar el mensaje');

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
    ok(llamadas.length === 0 && !(await guardado()), 'token vencido en la pestaña: va directo a la puerta, sin llamar al servicio');

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
    await hasta(() => /Solo puedo recibir fotos JPG, PNG o WebP/.test(document.querySelector('[data-agente-charla]').textContent), 'gif');
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

    reiniciarAsistente();
    pagina.wp = { asistente: API, turnstile: '0x4AAAAAAAprueba' };
    await navegar(pagUrl());
    await abrir();
    await hasta(() => !!document.querySelector('.agente-puerta .agente-humano'), 'Turnstile');
    await evaluar(() => { const f = document.querySelector('.agente-puerta'); f.elements.name.value = 'Persona'; f.elements.email.value = 'p@ejemplo.cl'; f.elements.phone.value = '+56 9 1111 2222'; f.elements.privacy_accepted.checked = true; f.requestSubmit(); return true; });
    await hasta(() => /comprobando que eres una persona/.test(document.querySelector('.agente-error').textContent), 'Turnstile pendiente');
    const v = await evaluar(() => window.__csp);
    ok(llamadas.length === 0 && !v.some((x) => /challenges\.cloudflare\.com/.test(x)), 'con la clave de Turnstile del plugin, la puerta espera el token (no abre sesión sin él) y la CSP admite su script');
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
