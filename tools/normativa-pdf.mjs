// PDF de cada norma a partir de su página (normativa/<slug>.html), con la misma versión del texto oficial y la fuente citada.
// Uso: node tools/normativa-pdf.mjs [slug …]   ·   Requiere Chrome o Chromium (variable CHROME si no está en la ruta habitual).
// Sin dependencias: controla Chrome sin interfaz por el protocolo DevTools (Node 22+ trae WebSocket).
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const index = JSON.parse(readFileSync(join(ROOT, 'assets/transporte/normativa.json'), 'utf8'));
const only = process.argv.slice(2);
const normas = index.normas.filter((n) => !only.length || only.includes(n.slug));
const candidates = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
].filter(Boolean);
const bin = candidates.find((p) => existsSync(p));
if (!bin) { console.error('No encontré Chrome. Indica la ruta con CHROME=/ruta/a/chrome'); process.exit(1); }

const port = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(bin, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'pdf-'))}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets = [];
for (let i = 0; i < 80 && !targets.length; i++) { try { targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter((t) => t.type === 'page'); } catch {} await sleep(100); }
const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map(); const events = [];
ws.addEventListener('message', (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } else events.push(msg); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable');

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fecha = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${y}`; };
mkdirSync(join(ROOT, 'assets/transporte/normativa'), { recursive: true });
for (const n of normas) {
  events.length = 0;
  await send('Page.navigate', { url: pathToFileURL(join(ROOT, n.pagina)).href });
  for (let i = 0; i < 150 && !events.some((e) => e.method === 'Page.loadEventFired'); i++) await sleep(100);
  await send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true });
  await send('Runtime.evaluate', { expression: "document.querySelectorAll('details').forEach((x) => { x.open = true; })" });
  const foot = `<div style="width:100%;font:8px Nunito,Arial,sans-serif;color:#667085;padding:0 16mm;display:flex;justify-content:space-between">
    <span>${n.corto} · Fuente: Ley Chile (BCN), versión del ${fecha(n.version)}, consultada el ${fecha(n.consulta)}. Copia referencial.</span>
    <span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
  const res = await send('Page.printToPDF', {
    printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
    headerTemplate: '<div></div>', footerTemplate: foot, generateDocumentOutline: true, generateTaggedPDF: true
  });
  if (!res.result?.data) { console.error('Falló', n.slug, JSON.stringify(res.error)); continue; }
  const buf = Buffer.from(res.result.data, 'base64');
  writeFileSync(join(ROOT, n.pdf), buf);
  console.log(`${n.corto.padEnd(16)} ${(buf.length / 1024).toFixed(0).padStart(5)} KB  ${n.pdf}`);
}
ws.close(); chrome.kill(); process.exit(0);
