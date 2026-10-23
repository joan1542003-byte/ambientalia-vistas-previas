// Comprobaciones de la integración del sitio con el asistente Laravel (cotizaciones de Transporte → POST /api/quotes).
// No llama a servicios reales: el asistente y el WordPress del plugin se simulan en este computador, y el navegador no
// sale a internet (tipografías, mapas, Turnstile y WhatsApp quedan bloqueados).
//
//   node tools/pruebas/integracion.mjs                 comprobaciones del repositorio y pruebas en el navegador
//   node tools/pruebas/integracion.mjs --sin-navegador solo las del repositorio
//
// El navegador es Chrome, Chromium o Brave sin interfaz (variable CHROME si no está en la ruta habitual), controlado por
// el protocolo DevTools, como tools/normativa-pdf.mjs: sin dependencias (Node 22+ trae WebSocket). Sale con 1 si algo falla.
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
/* Puntas de las dos ramas integradas (cambios-15-10 de Johan y conexion-odoo): lo que debe quedar igual se compara con ellas */
const JOHAN = 'c1f073fb3101e907b2a3b7e49f87dd2732565862';
const ODOO = '906b1c9097ccc817731d2d0d18077d4d7911c5a0';
/* Cambios posteriores de Johan, ya integrados: el plugin 1.3.0 del 16-10 y el diseño del chat del 22-10 */
const JOHAN_PLUGIN = '415821b60ff8c6ac841a3f6778c704aec6e1d3a2';
/* Ayuda del 22-10 (guías, checklists y panel por pestañas), con HDS y Campañas sin «Vista previa de diseño» en el pie */
const JOHAN_AYUDA = '9fcffb533e2cae4d805ab90097f8052317ccba12';
const JOHAN_CHAT = '9fcffb533e2cae4d805ab90097f8052317ccba12';
const leer = (f) => readFileSync(join(ROOT, f), 'utf8');
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
/* Archivos del repositorio, sin repetir (durante una fusión sin cerrar, git ls-files nombra tres veces cada archivo en conflicto) */
const archivos = (...a) => [...new Set(git('ls-files', ...a).split('\n').filter(Boolean))];
const enRama = (ref, f) => { try { return git('show', `${ref}:${f}`); } catch { return null; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fallas = 0;
const avisos = [];
const ok = (cond, que) => { console.log(`  ${cond ? 'ok   ' : 'FALLA'} ${que}`); if (!cond) fallas += 1; return cond; };
const seccion = (t) => console.log(`\n${t}`);

/* El elemento <div …> que empieza en «inicio», con sus divs anidados (igual que bloque() en tools/normativa.py) */
const bloque = (s, inicio) => {
  const i = s.indexOf(inicio);
  if (i < 0) return null;
  let depth = 0;
  for (const m of s.slice(i).matchAll(/<(\/?)div\b/g)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return s.slice(i, s.indexOf('>', i + m.index + m[0].length) + 1);
  }
  return null;
};
const sinVersion = (s) => s.replace(/\?v=[\w.-]+/g, '?v=X');

/* ======================= Comprobaciones del repositorio ======================= */

/* Credenciales o llamadas a Odoo que no deben estar en el sitio ni en el paquete del plugin */
const PATRONES = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'clave privada'],
  [/\bsk-[A-Za-z0-9]{20,}/, 'clave de API (sk-)'],
  [/\bAIza[0-9A-Za-z_-]{30,}/, 'clave de Google'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'token de GitHub'],
  [/\b0x4AAAAAAA[0-9A-Za-z_-]{10,}/, 'clave de Turnstile escrita en un archivo'],
  [/\b(ODOO_API_KEY|ODOO_PASSWORD|TURNSTILE_SECRET_KEY|APP_KEY|DB_PASSWORD)\s*[=:]\s*['"]?[^\s'"$]{6,}/, 'credencial del asistente u Odoo'],
  [/\b(api[_-]?key|secret|password|contrase(?:ñ|n)a)\b\s*[=:]\s*['"][^'"\s]{8,}['"]/i, 'credencial escrita'],
  [/\/jsonrpc\b|xmlrpc\/2|execute_kw/, 'llamada directa a Odoo', /\.(html|js|mjs|php|py)$/]
];
const secretos = (raiz, lista) => lista.flatMap((f) => {
  const s = readFileSync(join(raiz, f), 'utf8');
  return PATRONES.filter(([re, , solo]) => (!solo || solo.test(f)) && re.test(s)).map(([, que]) => `${f}: ${que}`);
});
const TEXTO = /\.(html|js|mjs|css|json|php|py|md|txt|yml|xml)$/;

seccion('1. Sin secretos en el frontend');
{
  const revisados = archivos('-co', '--exclude-standard').filter((f) => f
    && !/^tools\/cache\/|^assets\/transporte\/(direcciones\/|calles)|^tools\/pruebas\//.test(f)
    && TEXTO.test(f) && existsSync(join(ROOT, f)));
  const hallazgos = secretos(ROOT, revisados);
  ok(!hallazgos.length, `${revisados.length} archivos revisados, sin credenciales ni llamadas directas a Odoo${hallazgos.length ? `: ${hallazgos.join('; ')}` : ''}`);
}

seccion('2. Sin direcciones locales fijas en el envío de las páginas publicadas');
{
  const paginas = archivos('*.html');
  const conLocal = paginas.filter((f) => /data-cotizar-api(-local)?="[^"]*(127\.0\.0\.1|localhost)/.test(leer(f)) || leer(f).includes('data-cotizar-api-local'));
  ok(!conLocal.length, `ninguna página lleva data-cotizar-api-local ni una dirección local en el formulario${conLocal.length ? `: ${conLocal.join(', ')}` : ''}`);
  const agente = paginas.filter((f) => /data-agente-api-local|data-agente-api="[^"]+"/.test(leer(f)));
  ok(!agente.length, `ninguna página lleva una dirección fija para el chat (data-agente-api-local ni data-agente-api con valor)${agente.length ? `: ${agente.join(', ')}` : ''}`);
}

seccion('3. Formulario de Transporte: un solo destino, el asistente');
{
  const s = leer('transporte-autorizado.html');
  const forms = s.match(/<form [^>]*data-cotizar-api[^>]*>/g) || [];
  ok(forms.length === 1 && /id="cotizacion"/.test(forms[0]), 'un solo formulario declara el destino (form#cotizacion[data-cotizar-api])');
  ok(/data-cotizar-api=""/.test(forms[0] || ''), 'data-cotizar-api vacío en la página: la dirección la pone cada entorno');
  const resumen = bloque(s, '<div class="summary" id="cotizacion-resumen"');
  ok(!!resumen && (resumen.match(/data-cotizar-enviar/g) || []).length === 1, 'el resumen tiene un solo «Enviar solicitud» (data-cotizar-enviar)');
  ok(!!resumen && !/data-enviar\b/.test(resumen), 'el resumen no tiene el «Enviar solicitud» de WordPress (data-enviar)');
  ok(/data-adjuntos data-max="2"/.test(s), 'fotos: data-max="2", el tope por solicitud del asistente (CHAT_ATTACHMENTS_MAX)');
  ok(/name="aviso" required disabled/.test(s) && /name="website" tabindex="-1"/.test(s), 'conserva la casilla de aviso de privacidad y el campo trampa');
  const site = leer('assets/site/site.js');
  ok(/window\.SITE\.enviar && !form\.hasAttribute\('data-cotizar-api'\)/.test(site), 'site.js no conecta el envío de WordPress a un formulario con data-cotizar-api');
  ok(!/ADJUNTOS/.test(site + leer('assets/site/transporte-ui.js')), 'no queda el puente window.ADJUNTOS (fotos de Transporte hacia WordPress)');
  ok(/Boolean\(window\.SITE\.enviar\) && !d\.querySelector\('form\[data-cotizar-api\]'\)/.test(leer('assets/site/asistente.js')), 'el asistente de retiro no envía a WordPress si la página tiene el formulario del asistente');
  ok(!/wp-json|TA_API\.url/.test(leer('assets/site/transporte-ui.js')), 'transporte-ui.js no llama a WordPress');
}

seccion('4. HDS y Campañas sin cambios de comportamiento');
for (const f of ['hds.html', 'campanas-reciclaje.html']) {
  const s = leer(f);
  const antes = enRama(JOHAN_AYUDA, f);
  if (antes === null) { avisos.push(`No encontré ${JOHAN_AYUDA.slice(0, 7)} para comparar ${f}.`); continue; }
  ok(sinVersion(s) === sinVersion(antes), `${f}: igual a la versión del 22-10 salvo la versión de los archivos (?v=)`);
  ok(!/data-cotizar-api/.test(s) && /data-enviar hidden/.test(s), `${f}: sin destino Laravel; conserva su «Enviar solicitud» de WordPress`);
}
for (const f of ['assets/site/filas.js']) ok(leer(f) === enRama(JOHAN, f), `${f} sin cambios`);

seccion('5. Una sola versión de los archivos en todas las páginas');
{
  const paginas = ['transporte-autorizado.html', 'hds.html', 'campanas-reciclaje.html', 'agente-virtual.html',
    ...archivos('normativa/*.html', 'ayuda/*.html')];
  const versiones = new Set(paginas.flatMap((f) => [...leer(f).matchAll(/assets\/site\/[\w.-]+\.(?:css|js)\?v=([\w.-]+)/g)].map((m) => m[1])));
  ok(versiones.size === 1, `${paginas.length} páginas con la misma versión: ${[...versiones].join(', ')}`);
}

seccion('6. Páginas generadas (normativa y ayuda) al día con la fuente');
{
  const s = leer('transporte-autorizado.html');
  const tarjeta = bloque(s, '<div class="hcard">').replace(/ role="tabpanel" aria-labelledby="tab-[\w-]+"/g, '');
  /* Como en tools/normativa.py: «Chat con IA» abre el chat de Transporte, que estas páginas no cargan */
  const burbuja = bloque(s, '<div class="dock" data-dock>').replace('<div class="dock" data-dock>', '<div class="dock" data-dock data-dock-always>').replace(/\n *<button class="dock-action is-ia"[\s\S]*?<\/button>/, '');
  const paginas = archivos('normativa/*.html', 'ayuda/*.html');
  const malas = paginas.filter((f) => { const p = leer(f); return bloque(p, '<div class="hcard">') !== tarjeta || bloque(p, '<div class="dock" data-dock data-dock-always>') !== burbuja; });
  ok(!malas.length, `${paginas.length} páginas con la tarjeta y la burbuja idénticas a las de transporte-autorizado.html (lo que copian tools/normativa.py y tools/ayuda.py)${malas.length ? `: ${malas.join(', ')}` : ''}`);
  const antes = paginas.filter((f) => enRama(JOHAN_AYUDA, f) !== null);
  const editadas = antes.filter((f) => {
    const neutro = (p) => sinVersion(p.replace(bloque(p, '<div class="hcard">'), '').replace(bloque(p, '<div class="dock" data-dock data-dock-always>'), ''));
    return neutro(leer(f)) !== neutro(enRama(JOHAN_AYUDA, f));
  });
  ok(!editadas.length, `fuera de la tarjeta, la burbuja y la versión, las ${antes.length} páginas quedan como en la versión del 22-10 (contenido normativo y editorial intacto)`);
}

seccion('7. Plugin de WordPress conservado');
{
  const P = 'wordpress/ta-sitio/';
  ok(['ta-sitio.php', 'readme.txt', 'inc/ajustes.php', 'inc/sitio.php', 'inc/fotos.php', 'inc/solicitudes.php'].every((f) => existsSync(join(ROOT, P, f))), 'están los seis archivos del plugin');
  ok(leer(`${P}inc/solicitudes.php`) === enRama(JOHAN_PLUGIN, `${P}inc/solicitudes.php`), 'inc/solicitudes.php sin cambios: el servicio /wp-json/ta/v1/ (permiso y solicitudes) sigue para otros formularios');
  ok(leer(`${P}inc/fotos.php`) === enRama(JOHAN_PLUGIN, `${P}inc/fotos.php`), 'inc/fotos.php sin cambios');
  const main = leer(`${P}ta-sitio.php`);
  const v1 = main.match(/Version:\s+([\d.]+)/)?.[1];
  const v2 = main.match(/TA_SITIO_VERSION', '([\d.]+)'/)?.[1];
  ok(v1 && v1 === v2 && leer(`${P}readme.txt`).includes(`Stable tag: ${v1}`), `versión coherente en cabecera, constante y readme (${v1})`);
  ok(/'asistente'\s*=>/.test(leer(`${P}inc/ajustes.php`)) && /\$api\['asistente'\]/.test(leer(`${P}inc/sitio.php`)), 'los ajustes guardan la dirección del asistente y la página la recibe en window.TA_API');
  let php = false;
  try { execFileSync('php', ['-v'], { stdio: 'ignore' }); php = true; } catch { avisos.push('Sin php: no se revisó la sintaxis del plugin ni su CSP.'); }
  if (php) {
    const sintaxis = ['ta-sitio.php', 'inc/ajustes.php', 'inc/sitio.php', 'inc/fotos.php', 'inc/solicitudes.php'].every((f) => {
      try { execFileSync('php', ['-l', join(ROOT, P, f)], { stdio: 'ignore' }); return true; } catch { return false; }
    });
    ok(sintaxis, 'php -l sin errores en el plugin');
    try { execFileSync('php', [join(ROOT, 'tools/pruebas/plugin.php')], { stdio: 'ignore' }); ok(true, 'tools/pruebas/plugin.php: dirección del asistente y CSP'); }
    catch { ok(false, 'tools/pruebas/plugin.php: dirección del asistente y CSP (córrelo para ver el detalle)'); }
  }
}

seccion('8. Agente (widget del chat): uno solo, conectado por configuración');
{
  /* La maqueta solo cambia en la condición que decide quién responde (el bloque que empieza en «Con la dirección») */
  const sinCondicion = (s) => s.replace(/  \/\* Con (la dirección del asistente|servicio) responde[\s\S]*?\n  if \([^\n]*\) return;\n/, '');
  ok(sinCondicion(leer('assets/site/agente.js')) === sinCondicion(enRama(JOHAN_CHAT, 'assets/site/agente.js')) && leer('assets/site/agente.css') === enRama(JOHAN_CHAT, 'assets/site/agente.css'), 'maqueta (agente.js y agente.css) igual a la del diseño del 22-10 salvo la condición de quién responde');
  const chat = leer('assets/site/agente-chat.js');
  ok(/window\.SITE\?\.asistente\?\.\(panel\.dataset\.agenteApi\)/.test(chat) && /window\.SITE\?\.asistente\?\.\(panel\.dataset\.agenteApi\)/.test(leer('assets/site/agente.js')) && !/agenteApiLocal/.test(chat), 'chat y maqueta toman la dirección de window.SITE.asistente (la misma de las cotizaciones), sin dirección local');
  ok(!/\.innerHTML\s*=(?!\s*v;)|insertAdjacentHTML|outerHTML\s*=|document\.write|conEnlaces|RE_URL/.test(chat), 'el chat no inserta HTML del servicio ni convierte en enlaces las direcciones del texto');
  ok(/client_message_id: p\.id/.test(chat) && /'\/session', \{ method: 'DELETE', body: \{ confirm: true \} \}/.test(chat), 'cada reintento conserva el client_message_id y el borrado usa DELETE /session con confirmación');
  for (const f of ['transporte-autorizado.html', 'agente-virtual.html']) {
    const s = leer(f);
    const veces = (re) => (s.match(re) || []).length;
    ok(veces(/assets\/site\/agente-chat\.js\?/g) === 1 && veces(/assets\/site\/agente\.js\?/g) === 1 && veces(/ data-agente /g) === 1 && veces(/data-agente-abrir/g) === 1,
      `${f}: una burbuja, una ventana y cada script del agente una vez`);
    ok(/data-agente-api="" /.test(s) && /data-turnstile=""/.test(s) && s.indexOf('assets/site/site.js?') < s.indexOf('assets/site/agente.js?'), `${f}: data-agente-api y data-turnstile vacíos (los pone cada entorno) y site.js antes del agente`);
  }
}

seccion('9. Paquete del plugin (tools/wordpress.py, en una carpeta temporal)');
{
  const destino = mkdtempSync(join(tmpdir(), 'ta-plugin-'));
  const sinAgente = mkdtempSync(join(tmpdir(), 'ta-plugin-sin-'));
  try {
    execFileSync('python3', [join(ROOT, 'tools/wordpress.py'), destino], { cwd: ROOT, stdio: 'ignore' });
    const zip = join(destino, 'ta-sitio.zip');
    const lista = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n');
    ok(statSync(zip).size > 0 && ['ta-sitio/ta-sitio.php', 'ta-sitio/inc/solicitudes.php', 'ta-sitio/sitio/transporte-autorizado.html', 'ta-sitio/sitio/assets/site/transporte-ui.js', 'ta-sitio/sitio/llms.txt'].every((f) => lista.includes(f)),
      'se arma el zip con el plugin y el sitio dentro');
    ok(!lista.some((f) => /filas\.js$|tools\/|wordpress\/|docs\//.test(f)), 'el paquete no lleva herramientas, documentación ni lo que es solo de HDS y Campañas');
    /* Desde el 22-10 el sitio oficial lleva el agente: la página empaquetada es la del repositorio, sin tocar, y van sus cuatro archivos */
    const pagina = readFileSync(join(destino, 'ta-sitio/sitio/transporte-autorizado.html'), 'utf8');
    ok(pagina === leer('transporte-autorizado.html') && /data-agente-abrir/.test(pagina) && /data-agente-api="" /.test(pagina),
      'la página empaquetada es la del repositorio, con el agente y sin dirección fija (la pone el plugin)');
    const archivosAgente = ['agente.js', 'agente.css', 'agente-chat.js', 'agente-chat.css'].map((f) => `ta-sitio/sitio/assets/site/${f}`);
    ok(archivosAgente.every((f) => lista.includes(f)) && archivosAgente.every((f) => readFileSync(join(destino, f), 'utf8') === leer(f.replace('ta-sitio/sitio/', ''))),
      'el paquete lleva los cuatro archivos del agente, idénticos a los del repositorio');
    ok(!lista.some((f) => /ta-sitio\/sitio\/(?!transporte-autorizado\.html)[^/]*\.html$/.test(f)), 'del sitio solo va transporte-autorizado.html en la raíz (agente-virtual.html es la maqueta y no se empaqueta)');
    const enPaquete = lista.filter((f) => f && TEXTO.test(f) && !/\/assets\/transporte\/(direcciones\/|calles)/.test(f)).map((f) => f.replace(/^ta-sitio\//, ''));
    const hallazgos = secretos(join(destino, 'ta-sitio'), enPaquete);
    ok(!hallazgos.length, `el paquete no lleva secretos (${enPaquete.length} archivos de texto revisados)${hallazgos.length ? `: ${hallazgos.join('; ')}` : ''}`);

    /* --sin-agente conserva el paquete anterior (pedido del cliente, 16-10): solo se quitan líneas de la página, y no queda nada del agente */
    execFileSync('python3', [join(ROOT, 'tools/wordpress.py'), sinAgente, '--sin-agente'], { cwd: ROOT, stdio: 'ignore' });
    const listaSin = execFileSync('unzip', ['-Z1', join(sinAgente, 'ta-sitio.zip')], { encoding: 'utf8' }).split('\n');
    const paginaSin = readFileSync(join(sinAgente, 'ta-sitio/sitio/transporte-autorizado.html'), 'utf8');
    const lineasPagina = paginaSin.split('\n');
    const quitadas = [];
    let k = 0;
    for (const l of leer('transporte-autorizado.html').split('\n')) { if (k < lineasPagina.length && l === lineasPagina[k]) k += 1; else quitadas.push(l); }
    ok(k === lineasPagina.length && quitadas.some((l) => / data-agente /.test(l)) && !/data-agente|assets\/site\/agente|is-ia/.test(paginaSin) && !listaSin.some((f) => /assets\/site\/agente/.test(f)),
      'con --sin-agente, la página es la del repositorio sin el agente (solo se quitan líneas, y no queda nada de él) y sus archivos no van');
  } catch (e) {
    ok(false, `no se pudo armar el paquete: ${e.message.split('\n')[0]}`);
  } finally { rmSync(destino, { recursive: true, force: true }); rmSync(sinAgente, { recursive: true, force: true }); }
}

seccion('10. WhatsApp: contacto opcional, igual que antes');
{
  /* Cada enlace a wa.me y cada mensaje precargado (data-wa, data-expert-wa) de cada página, contra cambios-15-10 */
  const WA = /https:\/\/wa\.me\/[^"'\s<>]*|data-wa="[^"]*"|data-expert-wa="[^"]*"/g;
  const cuenta = (s) => (s.match(WA) || []).reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
  const iguales = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
  const paginas = archivos('*.html').filter((f) => enRama(JOHAN, f) !== null);
  const distintas = paginas.filter((f) => !iguales(cuenta(leer(f)), cuenta(enRama(JOHAN, f))));
  const total = paginas.reduce((n, f) => n + (leer(f).match(WA) || []).length, 0);
  ok(!distintas.length && total > 0, `${total} enlaces y mensajes de WhatsApp en ${paginas.length} páginas, idénticos a cambios-15-10${distintas.length ? `; cambian en: ${distintas.join(', ')}` : ''}`);
  const site = leer('assets/site/site.js');
  ok(/const WHATSAPP = '56986067930';/.test(site) && site.includes("whatsapp: (text) => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`"), 'site.js conserva el número y cómo se arma el enlace (SITE.whatsapp)');
  const codigo = ['site.js', 'transporte-ui.js', 'asistente.js', 'transporte.js', 'filas.js'].map((f) => leer(`assets/site/${f}`)).join('\n');
  ok(!/window\.open\(|(wa|send)\.hidden\s*=|(wa|send)\.click\(\)|\[data-send\]'\)\??\.click\(\)/.test(codigo), 'ningún script oculta el botón de WhatsApp ni lo abre solo');
  ok(/class="btn btn-wa btn-small" data-send target="_blank"/.test(bloque(leer('transporte-autorizado.html'), '<div class="summary" id="cotizacion-resumen"') || ''), 'el resumen de la cotización conserva su botón de WhatsApp');
}

seccion('11. Frontend y backend desacoplados');
{
  const plugin = archivos('wordpress/').filter((f) => f.endsWith('.php')).map((f) => [f, leer(f)]);
  const acoplado = plugin.filter(([, s]) => /\bmysqli_|new\s+PDO\b|new\s+wpdb\b|wp_remote_(get|post|request)|\bcurl_init\b|fsockopen|stream_socket_client|file_get_contents\(\s*['"]https?:|jsonrpc|execute_kw/i.test(s)).map(([f]) => f);
  ok(!acoplado.length, `el plugin no se conecta desde el servidor a otra base de datos, a Odoo ni al asistente (sin proxy)${acoplado.length ? `: ${acoplado.join(', ')}` : ''}`);
  ok(!['artisan', 'composer.json', 'app/Http/Kernel.php', 'routes/api.php'].some((f) => existsSync(join(ROOT, f))) && !archivos('wordpress/').some((f) => /laravel|vendor\//i.test(f)), 'no hay código Laravel dentro de este repositorio ni del plugin');
  const front = ['transporte-ui.js', 'agente-chat.js', 'site.js', 'asistente.js'].map((f) => leer(`assets/site/${f}`)).join('\n');
  const rutas = new Set([...front.matchAll(/\$\{API\}(\/[\w/-]*)/g)].map((m) => m[1]));
  const CONTRATO = new Set(['/api/quotes', '/api/chat', '/politica-de-privacidad', '/condiciones-del-servicio', '/eliminacion-de-datos']);
  ok([...rutas].every((r) => CONTRATO.has(r)), `el navegador solo usa rutas públicas del contrato: ${[...rutas].sort().join(', ')}`);
  ok(!/project\.task|ir\.attachment|crm_leads|CrmLead|RetryUndelivered|ODOO_|DB_HOST|OPENAI|ANTHROPIC/.test(front + leer('transporte-autorizado.html')), 'el frontend no conoce modelos, tablas, jobs ni variables internas del asistente u Odoo');
  ok(/u\.protocol !== 'https:' && !\(LOCAL && u\.protocol === 'http:'\)/.test(leer('assets/site/site.js')), 'fuera de este computador, la dirección del asistente debe ser https');
}

seccion('12. Sintaxis y estructura');
{
  const js = [...archivos('assets/site/*.js', 'tools/*.mjs'), ...archivos('-o', '--exclude-standard', 'tools/pruebas/*.mjs'), ...archivos('tools/pruebas/*.mjs')].filter((f) => !f.includes('/vendor/'));
  const malos = [...new Set(js)].filter((f) => { try { execFileSync(process.execPath, ['--check', join(ROOT, f)], { stdio: 'ignore' }); return false; } catch { return true; } });
  ok(!malos.length, `node --check sin errores en ${new Set(js).size} scripts${malos.length ? `: ${malos.join(', ')}` : ''}`);
  /* Etiquetas que abren y cierran parejo, y sin id repetidos nuevos respecto de cambios-15-10 */
  const paginas = archivos('*.html');
  const sinComentarios = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[\s\S]*?<\/script>/g, '');
  const desparejas = paginas.filter((f) => {
    const s = sinComentarios(leer(f));
    return ['div', 'form', 'fieldset', 'section', 'details', 'dialog', 'ul', 'ol'].some((t) => (s.match(new RegExp(`<${t}\\b`, 'g')) || []).length !== (s.match(new RegExp(`</${t}>`, 'g')) || []).length);
  });
  ok(!desparejas.length, `${paginas.length} páginas con div, form, fieldset, section, details, dialog y listas balanceados${desparejas.length ? `: ${desparejas.join(', ')}` : ''}`);
  const repetidos = (s) => { const ids = [...sinComentarios(s).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]); return new Set(ids.filter((x, i) => ids.indexOf(x) !== i)); };
  const nuevos = paginas.filter((f) => enRama(JOHAN, f) !== null).flatMap((f) => { const antes = repetidos(enRama(JOHAN, f)); return [...repetidos(leer(f))].filter((x) => !antes.has(x)).map((x) => `${f}#${x}`); });
  ok(!nuevos.length, `sin id repetidos nuevos${nuevos.length ? `: ${nuevos.join(', ')}` : ''}`);
}

/* ======================= Pruebas en el navegador ======================= */

const candidatos = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
].filter(Boolean);
const NAVEGADOR = candidatos.find((p) => existsSync(p));

if (process.argv.includes('--sin-navegador') || !NAVEGADOR) {
  if (!NAVEGADOR) avisos.push('No encontré Chrome, Chromium ni Brave: no se corrieron las pruebas en el navegador (indica CHROME=/ruta).');
  terminar();
} else {
  await enNavegador().catch((e) => { ok(false, `las pruebas en el navegador se interrumpieron: ${e.stack || e}`); });
  terminar();
}

function terminar() {
  if (avisos.length) { seccion('Avisos'); avisos.forEach((a) => console.log(`  · ${a}`)); }
  console.log(fallas ? `\n${fallas} comprobación(es) fallaron.` : '\nTodo bien.');
  process.exit(fallas ? 1 : 0);
}

/* Partes de un multipart/form-data: { campos: {nombre: valor}, archivos: [{ campo, nombre, bytes, tipo }] } */
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
    if (archivo !== undefined) out.archivos.push({ campo: nombre, nombre: archivo, bytes: cuerpo.length, tipo: /Content-Type:\s*(\S+)/i.exec(cab)?.[1] });
    else out.campos[nombre] = cuerpo.toString();
    i = j;
  }
  return out;
}

async function enNavegador() {
  seccion(`13. En el navegador (${NAVEGADOR.split('/').pop()}, sin interfaz; asistente y WordPress simulados)`);

  /* Sitio estático (como GitHub Pages) en 127.0.0.1 */
  const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.xlsx': 'application/octet-stream', '.pdf': 'application/pdf' };
  const sitio = createServer((req, res) => {
    const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = resolve(ROOT, `.${ruta}`);
    if (!f.startsWith(ROOT) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TIPOS[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(readFileSync(f));
  });

  /* Asistente Laravel y WordPress simulados (otro origen): registran cada llamada y responden lo que pida la prueba */
  const llamadas = [];
  let cola = [];
  const asistente = createServer(async (req, res) => {
    const partes = [];
    for await (const c of req) partes.push(c);
    const cuerpo = Buffer.concat(partes);
    const cors = { 'Access-Control-Allow-Origin': req.headers.origin || '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Accept, Content-Type' };
    const url = new URL(req.url, 'http://x');
    llamadas.push({ metodo: req.method, ruta: url.pathname, origen: req.headers.origin || '', ...(String(req.headers['content-type']).startsWith('multipart/') ? multipart(cuerpo, req.headers['content-type']) : { campos: {}, archivos: [] }) });
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    const json = (status, cuerpoJson) => { res.writeHead(status, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(cuerpoJson)); };
    if (url.pathname === '/api/quotes' && req.method === 'POST') {
      const r = cola.shift() || { status: 201, json: { received: true, reference: 'TA-000123', delivered: true } };
      await sleep(r.retardo ?? 250);
      if (r.html !== undefined) { res.writeHead(r.status, { ...cors, 'Content-Type': 'text/html' }); res.end(r.html); return; }
      json(r.status, r.json || {});
      return;
    }
    if (url.pathname === '/wp-json/ta/v1/permiso') { json(200, { permiso: `${Math.floor(Date.now() / 1000)}.0123456789abcdef.firma` }); return; }
    if (url.pathname === '/wp-json/ta/v1/solicitudes') { json(201, { numero: 'TA-26-00001', correo: true, fotos: 0 }); return; }
    res.writeHead(404, cors); res.end();
  });
  await Promise.all([new Promise((r) => sitio.listen(0, '127.0.0.1', r)), new Promise((r) => asistente.listen(0, '127.0.0.1', r))]);
  const SITIO = `http://127.0.0.1:${sitio.address().port}`;
  const API = `http://127.0.0.1:${asistente.address().port}`;
  const de = (ruta) => llamadas.filter((l) => l.ruta === ruta && l.metodo !== 'OPTIONS');
  const aWordPress = () => llamadas.filter((l) => l.ruta.startsWith('/wp-json/'));

  const perfil = mkdtempSync(join(tmpdir(), 'ta-nav-'));
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
  oyentes.add((m) => { if (m.method === 'Runtime.exceptionThrown') errores.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text); });
  const evaluar = async (fn, ...args) => {
    const r = await cdp('Runtime.evaluate', { expression: `(${fn})(${args.map((a) => JSON.stringify(a)).join(',')})`, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result?.result?.value;
  };
  const hasta = async (fn, que, ms = 8000, ...args) => {
    for (const fin = Date.now() + ms; Date.now() < fin; await sleep(80)) if (await evaluar(fn, ...args)) return true;
    throw new Error(`no ocurrió a tiempo: ${que}`);
  };
  const navegar = async (url) => {
    const cargada = new Promise((r) => { const f = (m) => { if (m.method === 'Page.loadEventFired') { oyentes.delete(f); r(); } }; oyentes.add(f); });
    await cdp('Page.navigate', { url });
    await cargada;
    await hasta(() => document.readyState === 'complete' && !!window.SITE, 'página cargada');
  };

  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Network.enable');
  /* Nada sale a internet: tipografías, mapa, Turnstile ni WhatsApp */
  await cdp('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*', '*jsdelivr.net*', '*unpkg.com*', '*openstreetmap.org*', '*challenges.cloudflare.com*', '*wa.me*', '*licdn.com*', '*bcn.cl*'] });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  /* Cualquier ventana que el sitio intentara abrir sola (p. ej., WhatsApp tras una falla) queda registrada */
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__abiertas = []; window.open = (...a) => { window.__abiertas.push(String(a[0])); return null; };' });
  let wp = null;
  const conWordPress = async (config) => {
    if (wp) { await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: wp }); wp = null; }
    if (config) wp = (await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.TA_API = ${JSON.stringify(config)};` })).result.identifier;
  };
  /* Pestañas abiertas además de la de la prueba (p. ej., WhatsApp), según el propio navegador: detecta también enlaces
     con target="_blank" activados por código, que no pasan por window.open */
  const pestanas = async () => (await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json()).filter((t) => t.type === 'page' && t.id !== objetivos[0].id);
  const cerrarPestanas = async () => { for (const t of await pestanas()) await fetch(`http://127.0.0.1:${puerto}/json/close/${t.id}`).catch(() => {}); await sleep(200); };
  /* Un clic de persona (evento de confianza, como el del mouse), no element.click() */
  const clicReal = async (selector) => {
    const p = await evaluar((sel) => { const el = document.querySelector(sel); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, selector);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
  };

  /* Formulario de Transporte: lo completa como lo haría el asistente de retiro («Ir al formulario») y va al último paso */
  const llenar = () => {
    const P = window.PICK;
    window.HERO?.show('cotizar');
    window.QUOTE.fill({ answers: { residuo: P.CATEGORIES.safe[0][0], cantidad: P.AMOUNTS[1], comuna: 'Quilicura', direccion: 'Avenida Prueba 123', modalidad: P.MODE_LABEL.express, empresa: 'Empresa Prueba SpA', nombre: 'Persona Prueba', telefono: '+56 9 1234 5678', correo: 'persona@ejemplo.cl' }, meta: {} });
    document.getElementById('cotizacion').goTo(Infinity);
    return true;
  };
  const preparar = (aceptar) => {
    const f = document.getElementById('cotizacion');
    const aviso = f.querySelector('[name="aviso"]');
    if (!aviso.disabled) aviso.checked = aceptar;
    f.requestSubmit();
    return !document.getElementById('cotizacion-resumen').hidden;
  };
  const otraVez = (aceptar) => {
    const r = document.getElementById('cotizacion-resumen');
    r.querySelector('[data-edit]').click();
    const f = document.getElementById('cotizacion');
    f.querySelector('[name="aviso"]').checked = aceptar;
    f.requestSubmit();
    return !r.hidden;
  };
  const estado = () => {
    const r = document.getElementById('cotizacion-resumen');
    const e = r.querySelector('[data-cotizar-estado]');
    const b = r.querySelector('[data-cotizar-enviar]');
    return {
      titulo: r.querySelector('[data-resumen-titulo]').textContent, bajada: r.querySelector('[data-resumen-bajada]').textContent,
      estado: e.hidden ? '' : e.textContent, info: e.classList.contains('is-info'), boton: !b.hidden, ocupado: b.disabled,
      wp: !!r.querySelector('[data-enviar]'), wa: r.querySelector('[data-send]').getAttribute('href') || '', abiertas: window.__abiertas.length,
      aviso: { visible: !document.querySelector('[data-cotizar-campos]').hidden, activo: !document.querySelector('[name="aviso"]').disabled }
    };
  };
  const enviar = (veces = 1) => { const b = document.querySelector('[data-cotizar-enviar]'); for (let i = 0; i < veces; i++) b.click(); return true; };
  const enviado = () => { const b = document.querySelector('[data-cotizar-enviar]'); return !b.disabled && !b.classList.contains('is-loading'); };
  const fotos = async (n) => {
    const zone = document.querySelector('[data-adjuntos]');
    const dt = new DataTransfer();
    for (let i = 0; i < n; i++) {
      const c = new OffscreenCanvas(64, 48);
      const g = c.getContext('2d');
      g.fillStyle = ['#c33', '#3c3', '#33c'][i % 3];
      g.fillRect(0, 0, 64, 48);
      dt.items.add(new File([await c.convertToBlob({ type: 'image/png' })], `foto-${i + 1}.png`, { type: 'image/png', lastModified: 1000 + i }));
    }
    const input = zone.querySelector('input[type="file"]');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  };
  const cuantasFotos = () => document.querySelector('[data-adjuntos]').fotos().length;

  /* --- a) Sin dirección del asistente (como en GitHub Pages) --- */
  {
    llamadas.length = 0;
    await navegar(`${SITIO}/transporte-autorizado.html?asistente=`);
    await evaluar(llenar);
    const listo = await evaluar(preparar, false);
    const e = await evaluar(estado);
    ok(listo && e.info && /no está disponible/.test(e.estado), 'sin dirección: el resumen avisa que el envío en línea no está disponible');
    ok(!e.boton && !e.wp && !e.aviso.visible && !e.aviso.activo, 'sin dirección: no hay «Enviar solicitud» (ni del asistente ni de WordPress) y no se pide el aviso');
    ok(e.wa.startsWith('https://wa.me/') && e.abiertas === 0, 'WhatsApp queda como enlace que la persona elige; nada se abre solo');
    ok(llamadas.length === 0, 'sin dirección: ninguna llamada a un servidor');
  }

  /* --- b) Con el asistente (dirección de este computador: ?asistente=) --- */
  {
    llamadas.length = 0;
    await navegar(`${SITIO}/transporte-autorizado.html?asistente=${encodeURIComponent(API)}`);
    await evaluar(llenar);
    let e = await evaluar(estado);
    ok(e.aviso.visible && e.aviso.activo, 'con dirección: aparece la casilla de condiciones y aviso de privacidad');
    const sinAviso = await evaluar(preparar, false);
    const invalido = await evaluar(() => document.querySelector('[name="aviso"]').getAttribute('aria-invalid') === 'true');
    ok(!sinAviso && invalido && de('/api/quotes').length === 0, 'consentimiento obligatorio: sin la casilla no se prepara ni se envía');

    await evaluar(fotos, 3);
    await hasta(() => !document.querySelector('[data-adjuntos] .is-loading') && document.querySelector('[data-adjuntos]').fotos().length > 0, 'fotos reducidas', 8000);
    await sleep(300);
    ok(await evaluar(cuantasFotos) === 2, 'fotos: de tres elegidas quedan dos (el tope del asistente)');

    ok(await evaluar(preparar, true), 'con la casilla marcada se prepara el resumen');

    /* WhatsApp con el envío en línea activo: a la vista, con la solicitud precargada, y solo si la persona lo elige */
    const w = await evaluar(() => { const a = document.querySelector('#cotizacion-resumen [data-send]'); return { visible: a.getClientRects().length > 0 && getComputedStyle(a).visibility !== 'hidden', href: a.getAttribute('href') || '' }; });
    ok(w.visible && w.href.startsWith('https://wa.me/56986067930?text=') && decodeURIComponent(w.href).includes('Solicitud de cotización — Transporte Autorizado') && decodeURIComponent(w.href).includes('Empresa Prueba SpA'),
      'con el envío en línea activo, WhatsApp sigue a la vista con la solicitud precargada');
    const antesWa = llamadas.length;
    await clicReal('#cotizacion-resumen [data-send]');
    await sleep(700);
    const conWa = await pestanas();
    e = await evaluar(estado);
    ok(conWa.length === 1 && llamadas.length === antesWa && e.boton && e.titulo === 'Tu solicitud está lista.',
      'elegir WhatsApp abre solo WhatsApp: ninguna llamada al asistente ni a WordPress, y «Enviar solicitud» sigue disponible');
    await cerrarPestanas();

    cola = [{ status: 503, json: { message: 'Server Error' }, retardo: 400 }];
    await evaluar(enviar, 3);
    await hasta(enviado, 'fin del primer envío');
    e = await evaluar(estado);
    const primera = de('/api/quotes');
    ok(primera.length === 1, `tres clics seguidos: una sola solicitud HTTP (hubo ${primera.length})`);
    ok(/no se duplicará/.test(e.estado) && e.boton && e.titulo === 'Tu solicitud está lista.', '503: avisa y deja reintentar, sin darla por enviada');
    ok(aWordPress().length === 0 && e.abiertas === 0, 'tras la falla no se envía a WordPress ni se abre WhatsApp');
    const q = primera[0];
    ok(q.campos.name === 'Persona Prueba' && q.campos.company === 'Empresa Prueba SpA' && q.campos.email === 'persona@ejemplo.cl' && q.campos.phone === '+56 9 1234 5678', 'contrato: name, company, email y phone');
    ok(q.campos.privacy_accepted === '1' && q.campos.marketing_accepted === '0' && q.campos.website === '', 'contrato: privacy_accepted=1, marketing_accepted=0 (opcional) y campo trampa vacío');
    ok(/^[A-Za-z0-9_-]{1,64}$/.test(q.campos.client_request_id || ''), `contrato: client_request_id válido (${q.campos.client_request_id})`);
    const detalles = Object.keys(q.campos).filter((k) => /^details\[\d+\]\[label\]$/.test(k));
    ok(detalles.length > 0 && detalles.length <= 40 && !!q.campos.subject && !('cf-turnstile-response' in q.campos), `contrato: subject y ${detalles.length} details (≤ 40); sin Turnstile configurado no va su campo`);
    ok(q.archivos.length === 2 && q.archivos.every((a) => a.campo === 'photos[]' && a.tipo === 'image/jpeg' && a.bytes < 5120 * 1024), 'contrato: 2 photos[] en JPEG de menos de 5 MB');
    ok(q.origen === SITIO, 'la solicitud sale del origen del sitio (el que el asistente debe tener en CHAT_ALLOWED_ORIGINS)');

    cola = [{ status: 200, json: { received: true, reference: 'TA-000777', delivered: false, duplicate: true } }];
    await evaluar(enviar, 1);
    await hasta(() => document.querySelector('[data-resumen-titulo]').textContent === 'Recibimos tu solicitud.', 'respuesta duplicada');
    e = await evaluar(estado);
    const segunda = de('/api/quotes');
    ok(segunda.length === 2 && segunda[1].campos.client_request_id === q.campos.client_request_id, 'el reintento lleva el mismo client_request_id');
    ok(/TA-000777/.test(e.bajada) && !e.boton && /envi%C3%A9%20la%20solicitud%20TA-000777|envié la solicitud TA-000777/.test(decodeURIComponent(e.wa)), '200 duplicada: la da por recibida con su número; WhatsApp pasa a ser contacto con ese número');

    /* Volver a preparar el mismo resumen después de una falla (sin cambios) conserva el identificador */
    await evaluar(otraVez, true);
    cola = [{ status: 201, json: { received: true, reference: 'TA-000778', delivered: true } }];
    await evaluar(enviar, 1);
    await hasta(() => document.querySelector('[data-resumen-titulo]').textContent === 'Recibimos tu solicitud.', '201');
    const tercera = de('/api/quotes');
    ok(tercera[2].campos.client_request_id !== q.campos.client_request_id, 'después de una recibida, la siguiente solicitud lleva otro identificador');
    ok(/TA-000778/.test((await evaluar(estado)).bajada), '201: muestra el número de la solicitud');

    /* Errores: el mensaje correcto, el botón listo para reintentar y nada enviado a otro lado */
    const CASOS = [
      [403, { json: { error: 'origin_not_allowed' } }, /desde esta página/],
      [409, { json: { error: 'idempotency_conflict', message: 'Ese envío ya se registró con otros datos.' } }, /otros datos/],
      [409, { json: { error: 'busy' } }, /Estamos recibiendo tu envío/],
      [413, { html: '<html><body>413 Request Entity Too Large</body></html>' }, /pesan demasiado/],
      [422, { json: { message: 'Datos inválidos', errors: { email: ['Escribe un correo válido, por ejemplo nombre@empresa.cl.'] } } }, /correo válido/],
      [429, { json: { error: 'too_many', message: 'Recibimos muchas solicitudes desde ese correo hoy.' } }, /muchas solicitudes/],
      [500, { json: { message: 'Server Error' } }, /no se duplicará/],
      [503, { html: '<html><body>503 Service Unavailable</body></html>' }, /no se duplicará/]
    ];
    let iConflicto = -1;  // la solicitud que recibió idempotency_conflict
    for (const [status, r, espera] of CASOS) {
      await evaluar(otraVez, true);
      const antes = de('/api/quotes').length;
      if (r.json?.error === 'idempotency_conflict') iConflicto = antes;
      cola = [{ status, ...r }];
      await evaluar(enviar, 2);
      await hasta(enviado, `fin del envío (${status})`);
      e = await evaluar(estado);
      ok(de('/api/quotes').length === antes + 1 && espera.test(e.estado) && e.boton && !e.ocupado && e.titulo === 'Tu solicitud está lista.' && e.abiertas === 0,
        `${status}${r.json?.error ? ` ${r.json.error}` : ''}: «${e.estado}»`);
    }
    cola = [{ status: 201, json: { received: true, reference: 'TA-000779', delivered: true } }];
    await evaluar(otraVez, true);
    await evaluar(enviar, 1);
    await hasta(() => document.querySelector('[data-resumen-titulo]').textContent === 'Recibimos tu solicitud.', '201 tras errores');
    const ids = de('/api/quotes').map((l) => l.campos.client_request_id);
    ok(iConflicto > 0 && ids[iConflicto + 1] !== ids[iConflicto], 'tras idempotency_conflict, el siguiente intento lleva un identificador nuevo');
    ok(aWordPress().length === 0, 'en todo el recorrido: ninguna llamada a WordPress');
    ok((await pestanas()).length === 0 && (await evaluar(() => window.__abiertas.length)) === 0, 'ningún envío ni falla abrió WhatsApp u otra pestaña por sí solo');
  }

  /* --- b2) Sobre WordPress, con el asistente configurado pero caído (no responde) --- */
  {
    const cerrado = createServer();
    await new Promise((r) => cerrado.listen(0, '127.0.0.1', r));
    const caido = `http://127.0.0.1:${cerrado.address().port}`;
    await new Promise((r) => cerrado.close(r));
    llamadas.length = 0;
    await conWordPress({ url: `${API}/wp-json/ta/v1/`, v: '1.3.0', asistente: caido });
    await navegar(`${SITIO}/transporte-autorizado.html?asistente=`);
    await evaluar(llenar);
    await evaluar(preparar, true);
    await evaluar(enviar, 2);
    await hasta(enviado, 'fin del envío con el asistente caído', 15000);
    const e = await evaluar(estado);
    ok(/no se duplicará/.test(e.estado) && e.boton && e.titulo === 'Tu solicitud está lista.', 'asistente caído: avisa y deja reintentar más tarde');
    ok(llamadas.length === 0 && (await pestanas()).length === 0 && e.abiertas === 0 && e.wa.startsWith('https://wa.me/'),
      'asistente caído: no envía a WordPress en su lugar ni abre WhatsApp; WhatsApp sigue disponible para la persona');
    await conWordPress(null);
  }

  /* --- c) Sobre WordPress (window.TA_API como lo deja el plugin), con el asistente configurado --- */
  {
    llamadas.length = 0;
    await conWordPress({ url: `${API}/wp-json/ta/v1/`, v: '1.3.0', asistente: API });
    await navegar(`${SITIO}/transporte-autorizado.html?asistente=`);
    ok(await evaluar(() => typeof window.SITE.enviar === 'function'), 'WordPress simulado: el envío del plugin existe en la página (window.SITE.enviar)');
    await evaluar(llenar);
    await evaluar(preparar, true);
    let e = await evaluar(estado);
    ok(e.boton && !e.wp, 'el resumen de Transporte ofrece solo el envío al asistente');
    await evaluar(enviar, 2);
    await hasta(enviado, 'envío sobre WordPress');
    e = await evaluar(estado);
    ok(de('/api/quotes').length === 1 && e.titulo === 'Recibimos tu solicitud.', 'la dirección del asistente llega por window.TA_API.asistente: una solicitud a /api/quotes');
    ok(aWordPress().length === 0, 'ninguna llamada a /wp-json/ta/v1/ (ni permiso ni solicitudes)');
  }

  /* --- c2) Asistente de retiro sobre WordPress, en una página nueva: lo que llegue al formulario viene solo de él --- */
  {
    llamadas.length = 0;
    await conWordPress({ url: `${API}/wp-json/ta/v1/`, v: '1.3.0', asistente: API });
    await navegar(`${SITIO}/transporte-autorizado.html?asistente=`);
    const DATOS = { empresa: 'Empresa Asistente Ltda', nombre: 'Persona Asistente', telefono: '+56 2 2345 6789', correo: 'asistente@ejemplo.cl', direccion: 'Calle Asistente 456' };
    await evaluar(() => window.GUIDE.ingest('Necesito retirar 500 kg de cartón en Quilicura, es urgente, en la mañana'));
    for (let paso = 0; paso < 14; paso++) {
      const hecho = await evaluar(async (datos) => {
        const panel = document.getElementById('asistente');
        const acciones = panel.querySelector('[data-guide-actions]');
        if (!acciones.hidden && acciones.querySelector('.btn-wa')) return 'listo';
        const body = panel.querySelector('.guide-step');
        if (panel.querySelector('#g-empresa')) {
          for (const k of ['empresa', 'nombre', 'telefono', 'correo']) panel.querySelector(`#g-${k}`).value = datos[k];
          panel.querySelector('[data-continue]').click();
          return 'contacto';
        }
        const opcion = body?.querySelector('.guide-area .opt:not([disabled])');
        if (opcion) { opcion.click(); body.querySelector('.guide-next:not([hidden]) [data-continue]:not([disabled]), [data-continue]:not([disabled])')?.click(); return 'opción'; }
        const campo = panel.querySelector('[data-guide-composer] input, #guide-input');
        if (campo && !panel.querySelector('[data-guide-composer]').hidden) { campo.value = datos.direccion; panel.querySelector('[data-guide-composer]').requestSubmit(); return 'texto'; }
        return 'esperando';
      }, DATOS);
      if (hecho === 'listo') break;
      await sleep(450);
    }
    const final = await evaluar(() => {
      const a = document.querySelector('#asistente [data-guide-actions]');
      const wa = a.querySelector('.btn-wa');
      return { listo: !a.hidden && !!wa, wp: !!a.querySelector('[data-enviar]'), linea: !!a.querySelector('[data-en-linea]'), fotos: !!document.querySelector('#asistente .fotos'), wa: wa ? decodeURIComponent(wa.getAttribute('href')) : '' };
    });
    ok(final.listo, 'el asistente de retiro llega a su revisión final');
    ok(final.listo && !final.wp && !final.fotos, 'asistente de retiro: sin «Enviar solicitud» ni fotos hacia WordPress');
    ok(final.linea, 'asistente de retiro: ofrece «Enviar en línea» (lleva al formulario del asistente)');
    ok(final.wa.startsWith('https://wa.me/56986067930?text=') && final.wa.includes('Empresa Asistente Ltda'), 'asistente de retiro: WhatsApp sigue disponible con su resumen precargado');
    ok(de('/api/quotes').length === 0 && aWordPress().length === 0, 'el asistente de retiro no crea solicitudes por sí mismo');
    if (final.linea) {
      await clicReal('#asistente [data-en-linea]');
      await sleep(500);
      const enForm = await evaluar(() => {
        const f = document.getElementById('cotizacion');
        const v = (n) => f.elements[n]?.value || '';
        const aviso = f.querySelector('[name="aviso"]');
        return {
          visible: !document.getElementById('cotizar').hidden, paso: f.querySelector('[data-step-count]').textContent,
          contacto: ['empresa', 'nombre', 'telefono', 'correo'].map(v), comuna: v('comuna'), direccion: v('direccion'),
          categoria: v('categoria'), cantidad: v('cantidad'), modalidad: v('modalidad'), aviso: { marcado: aviso.checked, activo: !aviso.disabled }
        };
      });
      ok(enForm.visible && enForm.paso === 'Paso 2 de 2', '«Enviar en línea» abre el formulario en su último paso (contacto, fotos y aviso)');
      ok(enForm.contacto.join('|') === 'Empresa Asistente Ltda|Persona Asistente|+56 2 2345 6789|asistente@ejemplo.cl' && enForm.direccion === 'Calle Asistente 456' && enForm.comuna === 'Quilicura',
        'los datos del asistente llegan al formulario (contacto, dirección y comuna)');
      ok(!!enForm.categoria && !!enForm.cantidad && !!enForm.modalidad, `también el residuo, la cantidad y el plan (${enForm.categoria} · ${enForm.cantidad} · ${enForm.modalidad})`);
      ok(!enForm.aviso.marcado && enForm.aviso.activo, 'el consentimiento no llega marcado: la persona debe aceptarlo');
      const paso1 = await evaluar(() => { const f = document.getElementById('cotizacion'); f.goTo(0); return { paso: f.querySelector('[data-step-count]').textContent, categoria: f.elements.categoria.value }; });
      ok(paso1.paso === 'Paso 1 de 2' && paso1.categoria === enForm.categoria, 'la persona puede volver a revisar el paso del retiro sin perder lo respondido');
      await evaluar(() => { const f = document.getElementById('cotizacion'); f.elements.direccion.value = 'Calle Asistente 789'; f.goTo(Infinity); return true; });
      ok(!(await evaluar(preparar, false)), 'sin aceptar el aviso, lo del asistente no se prepara ni se envía');
      ok(await evaluar(preparar, true), 'con el aviso aceptado se prepara el resumen');
      cola = [{ status: 503, json: { message: 'Server Error' }, retardo: 400 }, { status: 201, json: { received: true, reference: 'TA-000900', delivered: true } }];
      await evaluar(enviar, 2);
      await hasta(enviado, 'envío del asistente');
      const a1 = de('/api/quotes');
      ok(a1.length === 1, `doble clic: una sola solicitud a /api/quotes (hubo ${a1.length})`);
      const q = a1[0] || { campos: {} };
      ok(q.campos.company === 'Empresa Asistente Ltda' && q.campos.email === 'asistente@ejemplo.cl' && Object.entries(q.campos).some(([k, v]) => k.startsWith('details[') && v.includes('Calle Asistente 789')),
        'la solicitud lleva lo del asistente con lo que la persona editó');
      await evaluar(enviar, 1);
      await hasta(() => document.querySelector('[data-resumen-titulo]').textContent === 'Recibimos tu solicitud.', 'reintento del asistente');
      const a2 = de('/api/quotes');
      ok(a2.length === 2 && a2[1].campos.client_request_id === q.campos.client_request_id, 'el reintento conserva el client_request_id');
    }
    ok(aWordPress().length === 0 && (await pestanas()).length === 0, 'asistente de retiro: ninguna llamada a WordPress y nada se abre solo');
  }

  /* --- d) Sobre WordPress sin dirección del asistente en los ajustes --- */
  {
    llamadas.length = 0;
    await conWordPress({ url: `${API}/wp-json/ta/v1/`, v: '1.3.0' });
    await navegar(`${SITIO}/transporte-autorizado.html?asistente=`);
    await evaluar(llenar);
    await evaluar(preparar, false);
    const e = await evaluar(estado);
    ok(e.info && !e.boton && !e.wp && llamadas.length === 0, 'WordPress sin dirección: avisa que no está disponible y no envía a WordPress en su lugar');
  }

  /* --- e) HDS y Campañas conservan su comportamiento --- */
  const llenarHds = () => {
    const f = document.getElementById('solicitud');
    Object.entries({ material: 'Ácido sulfúrico', empresa: 'Empresa Prueba SpA', nombre: 'Persona Prueba', correo: 'persona@ejemplo.cl' }).forEach(([k, v]) => { f.elements[k].value = v; });
    f.requestSubmit();
    const r = document.getElementById('solicitud-resumen');
    return { visible: !r.hidden, wa: r.querySelector('[data-send]').getAttribute('href') || '', wp: !!r.querySelector('[data-enviar]') && !r.querySelector('[data-enviar]').hidden };
  };
  const llenarCampana = () => {
    const f = document.getElementById('ficha');
    f.elements.tipo.value = 'municipal';
    f.elements.materiales.forEach ? [...f.querySelectorAll('[name="materiales"]')].forEach((x, i) => { if (x.type === 'checkbox') x.checked = i === 0; else x.value = 'Neumáticos'; }) : (f.elements.materiales.value = 'Neumáticos');
    f.elements.comuna.value = 'Santiago';
    f.elements.region.value = 'Región Metropolitana de Santiago';
    f.elements.organizacion.value = 'Municipalidad de Prueba';
    f.elements.nombre.value = 'Persona Prueba';
    f.requestSubmit();
    const r = document.getElementById('ficha-resumen');
    return { visible: !r.hidden, wa: r.querySelector('[data-send]').getAttribute('href') || '', wp: !!r.querySelector('[data-enviar]') && !r.querySelector('[data-enviar]').hidden };
  };
  {
    await conWordPress(null);
    llamadas.length = 0;
    await navegar(`${SITIO}/hds.html`);
    let r = await evaluar(llenarHds);
    ok(r.visible && r.wa.startsWith('https://wa.me/') && !r.wp, 'HDS estático: resumen con WhatsApp, sin envío a servidor');
    await navegar(`${SITIO}/campanas-reciclaje.html`);
    r = await evaluar(llenarCampana);
    ok(r.visible && r.wa.startsWith('https://wa.me/') && !r.wp, 'Campañas estático: resumen con WhatsApp, sin envío a servidor');
    ok(llamadas.length === 0, 'HDS y Campañas estáticos: ninguna llamada');

    await conWordPress({ url: `${API}/wp-json/ta/v1/`, v: '1.3.0', asistente: API });
    await navegar(`${SITIO}/hds.html`);
    r = await evaluar(llenarHds);
    ok(r.visible && r.wp, 'HDS sobre WordPress: conserva su «Enviar solicitud» del plugin');
    await evaluar(() => { document.querySelector('#solicitud-resumen [data-enviar]').click(); return true; });
    await hasta(() => /Solicitud enviada/.test(document.querySelector('#solicitud-resumen [data-resumen-titulo]')?.textContent || ''), 'envío de HDS a WordPress', 12000);
    ok(de('/wp-json/ta/v1/solicitudes').length === 1 && de('/api/quotes').length === 0, 'HDS sobre WordPress: una solicitud a /wp-json/ta/v1/solicitudes y ninguna al asistente');
    await conWordPress(null);
  }

  ok(!errores.length, `sin errores de JavaScript en las páginas${errores.length ? `: ${[...new Set(errores)].join(' | ').slice(0, 400)}` : ''}`);
  ws.close();
  nav.kill();
  sitio.close();
  asistente.close();
  await sleep(200);
  rmSync(perfil, { recursive: true, force: true });
}
