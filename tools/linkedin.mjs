// Publicaciones recientes de la página de LinkedIn → assets/transporte/linkedin.json (lo lee la sección «Publicaciones recientes»).
// Corre sola en GitHub Actions (.github/workflows/linkedin.yml) cada 6 horas, o a mano: node tools/linkedin.mjs   (Node 20+)
//
// Dos fuentes, en este orden:
//   1. API de LinkedIn (Community Management API, permiso r_organization_social), si están sus secretos:
//        LINKEDIN_ORG_ID          número de la organización (URL de administración: linkedin.com/company/<número>/admin)
//        LINKEDIN_ACCESS_TOKEN    token de acceso vigente (dura 60 días), o bien, para renovarlo solo:
//        LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_REFRESH_TOKEN (el token de renovación dura 365 días)
//        LINKEDIN_VERSION         opcional, versión de la API en formato AAAAMM (por defecto, la del mes anterior)
//   2. Página pública de la empresa, sin clave ni inicio de sesión: lo que ve un visitante sin cuenta en
//      https://cl.linkedin.com/company/vinculo-verde. Se usa si no hay secretos, si la API falla o con --publico.
//
// Resguardos: si LinkedIn no responde, pide iniciar sesión o cambia su página, el archivo queda como estaba (nunca se
// publica una lista vacía); solo se escribe cuando algo cambió; lo compartido desde otras páginas no se incluye.
// Opciones: --publico (omite la API) · --estricto (termina con error si no se pudo leer) · --archivo=pagina.html (prueba
// con una página guardada) · LINKEDIN_PAGE (nombre de la página en la URL; por defecto, vinculo-verde).
// Cada publicación queda enlazada con su norma (assets/transporte/normativa.json, mismos criterios que la página).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const OUT = 'assets/transporte/linkedin.json';
const IMG_DIR = 'assets/transporte/linkedin';
const MAX = 8;
const env = process.env;
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opcion = (n) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const PAGINA = env.LINKEDIN_PAGE || 'vinculo-verde';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const aviso = (msg) => console.warn(env.GITHUB_ACTIONS ? `::warning title=Publicaciones de LinkedIn::${msg}` : `Aviso: ${msg}`);
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const previos = prev.posts || [];
const previo = (...ids) => previos.find((o) => ids.some((id) => id && (o.id === id || o.urn === id)));
const fechaIso = (v) => new Date(v).toISOString().replace(/\.\d{3}Z$/, 'Z');

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const normas = JSON.parse(readFileSync('assets/transporte/normativa.json', 'utf8')).normas;
const related = (text) => {
  const t = fold(text);
  return normas
    .map((n) => ({ slug: n.slug, s: (n.alias || []).reduce((a, [re, w]) => a + (new RegExp(re, 'i').test(t) ? w : 0), 0) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 2)
    .map((x) => x.slug);
};
/* Si el texto no cambió, se respeta la norma que ya tenía (pudo ajustarse a mano) */
const normasDe = (texto, old) => (old && old.texto === texto && old.normas?.length ? old.normas : related(texto));

/* Las imágenes de LinkedIn caducan o cambian de dirección: se guarda una copia en el sitio */
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const guardada = (nombre) => Object.values(EXT).map((x) => `${IMG_DIR}/${nombre}.${x}`).find(existsSync);
async function bajar(url, nombre) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`imagen ${res.status}`);
  const ext = EXT[(res.headers.get('content-type') || '').split(';')[0].trim()];
  if (!ext) throw new Error(`no es una imagen (${res.headers.get('content-type')})`);
  const file = `${IMG_DIR}/${nombre}.${ext}`;
  mkdirSync(IMG_DIR, { recursive: true });
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

/* ───── 1. API de LinkedIn ───── */
async function desdeApi() {
  const version = env.LINKEDIN_VERSION || (() => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() - 1); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`; })();
  let auth = null;
  if (env.LINKEDIN_REFRESH_TOKEN && env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET) {
    const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: env.LINKEDIN_REFRESH_TOKEN, client_id: env.LINKEDIN_CLIENT_ID, client_secret: env.LINKEDIN_CLIENT_SECRET })
    });
    if (res.ok) auth = (await res.json()).access_token;
    else console.warn('No se pudo renovar el token:', res.status);
  }
  auth ||= env.LINKEDIN_ACCESS_TOKEN;
  if (!auth) throw new Error('falta LINKEDIN_ACCESS_TOKEN o los datos para renovarlo');
  const api = (path) => fetch(`https://api.linkedin.com/rest/${path}`, {
    headers: { Authorization: `Bearer ${auth}`, 'LinkedIn-Version': version, 'X-Restli-Protocol-Version': '2.0.0' }
  });
  // Texto de LinkedIn («little text»): menciones y hashtags a texto simple
  const plain = (s = '') => s
    .replace(/@\[([^\]]+)\]\(urn:li:[^)]+\)/g, '$1')
    .replace(/\{hashtag\|\\?#\|([^}]+)\}/g, '#$1')
    .replace(/\\([\\()[\]{}@|*_~<>#])/g, '$1')
    .trim();

  const author = encodeURIComponent(`urn:li:organization:${env.LINKEDIN_ORG_ID}`);
  const res = await api(`posts?author=${author}&q=author&count=20&sortBy=LAST_MODIFIED`);
  if (!res.ok) throw new Error(`respondió ${res.status}`);
  const { elements = [] } = await res.json();
  const posts = [];
  for (const p of elements) {
    if (p.lifecycleState !== 'PUBLISHED' || p.visibility !== 'PUBLIC') continue;
    const texto = plain(p.commentary);
    if (!texto) continue;  // compartidos sin texto propio
    const old = previo(p.id);
    const item = { id: p.id, url: `https://www.linkedin.com/feed/update/${p.id}/`, fecha: fechaIso(p.publishedAt || p.createdAt), texto };
    const media = p.content?.media?.id;
    if (media?.startsWith('urn:li:image:')) {
      try {
        const nombre = media.split(':').pop();
        item.imagen = guardada(nombre);
        if (!item.imagen) {
          const im = await api(`images/${encodeURIComponent(media)}`);
          const url = im.ok ? (await im.json()).downloadUrl : null;
          if (url) item.imagen = await bajar(url, nombre);
        }
      } catch (e) { console.warn('Imagen omitida', media, e.message); }
    }
    // Documentos (carruseles PDF): la API no entrega portada; se conserva la que ya estaba guardada para esa publicación
    if (!item.imagen && old?.imagen) item.imagen = old.imagen;
    if (!item.imagen) delete item.imagen;
    if (old?.documento) item.documento = old.documento;
    if (old?.url && !old.url.includes('/feed/update/')) item.url = old.url;
    item.normas = normasDe(texto, old);
    posts.push(item);
  }
  return posts;
}

/* ───── 2. Página pública ───── */
const decode = (s) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(/^#x/i.test(e) ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }[e.toLowerCase()] ?? m;
});

async function paginaPublica() {
  const archivo = opcion('archivo');
  if (archivo) return readFileSync(archivo, 'utf8');
  // El subdominio de país es el que LinkedIn muestra sin iniciar sesión; «www» suele pedir cuenta
  const urls = [`https://cl.linkedin.com/company/${PAGINA}`, `https://www.linkedin.com/company/${PAGINA}/`];
  let ultimo = '';
  for (const url of urls) {
    for (let k = 0; k < 2; k++) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'es-CL,es;q=0.9' },
          signal: AbortSignal.timeout(30000)
        });
        const html = res.ok ? await res.text() : '';
        const pideCuenta = /\/(authwall|login|checkpoint|uas)\b/.test(new URL(res.url).pathname);
        if (res.ok && !pideCuenta && html.includes('application/ld+json')) return html;
        ultimo = `${url} → ${res.status}${pideCuenta ? ' (pide iniciar sesión)' : ''}`;
      } catch (e) { ultimo = `${url} → ${e.message}`; }
      await pausa(4000);
    }
  }
  throw new Error(`LinkedIn no mostró la página pública (${ultimo})`);
}

/* Portada: primera página del documento (carrusel PDF), o la imagen, la carátula del video o del artículo */
async function portada(card, nombre) {
  const out = {};
  const cfg = card.match(/data-native-document-config="([^"]+)"/);
  let src = null;
  if (cfg) {
    let doc = {};
    try { doc = JSON.parse(decode(cfg[1])).doc || {}; } catch { /* marcado distinto: queda sin portada */ }
    const paginas = doc.totalPageCount || doc.coverPages?.length;
    if (doc.title) out.documento = { titulo: doc.title, ...(paginas ? { paginas } : {}) };
    if (!guardada(nombre)) {
      try {
        const json = async (u) => (await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) })).json();
        const medidas = ((await json(doc.manifestUrl)).perResolutions || []).filter((r) => r.width >= 600).sort((a, b) => a.width - b.width);
        if (medidas[0]) src = (await json(medidas[0].imageManifestUrl)).pages?.[0];
      } catch { /* sin manifiesto: sirve la carátula pequeña */ }
      src ||= doc.coverPages?.[0]?.config?.src;
    }
  } else if (!guardada(nombre)) {
    src = [...card.matchAll(/(?:data-delayed-url|data-poster-url|src)="(https:\/\/media\.licdn\.com\/dms\/image\/[^"]+)"/g)]
      .map((m) => decode(m[1]))
      .find((u) => /\/(feedshare-|image-shrink|videocover-|article-cover_image)/.test(u));
  }
  out.imagen = guardada(nombre);
  if (!out.imagen && src) {
    try { out.imagen = await bajar(src, nombre); } catch (e) { console.warn('Portada omitida', nombre, e.message); }
  }
  if (!out.imagen) delete out.imagen;
  return out;
}

async function desdePagina() {
  const html = await paginaPublica();
  const grafo = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => {
    try { const j = JSON.parse(m[1]); return j['@graph'] || [j]; } catch { return []; }
  });
  // Solo lo publicado por la propia página (lo compartido desde otras cuentas trae otro autor)
  const propia = new RegExp(`/company/${PAGINA}/?$`, 'i');
  const propias = grafo.filter((g) => g['@type'] === 'SocialMediaPosting' && propia.test(g.author?.url || ''));
  const inicios = [...html.matchAll(/<article\b[^>]*data-activity-urn="urn:li:activity:(\d+)"/g)];
  const tarjeta = (id) => {
    const i = inicios.findIndex((m) => m[1] === id);
    if (i < 0) return '';
    const fin = inicios[i + 1]?.index ?? html.indexOf('</article>', inicios[i].index);
    return html.slice(inicios[i].index, fin < 0 ? undefined : fin);
  };
  const posts = [];
  for (const g of propias) {
    const url = g.url || g.mainEntityOfPage || '';
    const id = url.match(/activity[-:](\d+)/)?.[1];
    const texto = (g.text || g.articleBody || g.headline || '').trim();
    if (!id || !texto || !g.datePublished) continue;
    const card = tarjeta(id);
    const urn = card.match(/data-attributed-urn="([^"]+)"/)?.[1];
    const old = previo(`urn:li:activity:${id}`, urn);
    const media = card ? await portada(card, id) : {};
    posts.push({
      id: `urn:li:activity:${id}`,
      ...(urn ? { urn } : old?.urn ? { urn: old.urn } : {}),
      url,
      fecha: fechaIso(g.datePublished),
      texto,
      ...(media.imagen ? { imagen: media.imagen } : old?.imagen && existsSync(old.imagen) ? { imagen: old.imagen } : {}),
      ...(media.documento ? { documento: media.documento } : old?.documento ? { documento: old.documento } : {}),
      normas: normasDe(texto, old)
    });
  }
  if (!posts.length) throw new Error('la página pública no trae publicaciones propias (¿cambió su formato?)');
  // La página pública muestra solo las más recientes: las anteriores a esa ventana se conservan
  const vistos = new Set(posts.flatMap((p) => [p.id, p.urn]).filter(Boolean));
  const masAntigua = Math.min(...posts.map((p) => Date.parse(p.fecha)));
  const resto = previos.filter((o) => !vistos.has(o.id) && !vistos.has(o.urn) && Date.parse(o.fecha) < masAntigua);
  return [...posts, ...resto];
}

/* ───── Guardar ───── */
let posts = null;
let fuente = '';
if (env.LINKEDIN_ORG_ID && !flag('publico') && !opcion('archivo')) {
  try { posts = await desdeApi(); fuente = 'API de LinkedIn'; } catch (e) { aviso(`La API de LinkedIn falló (${e.message}); se intenta con la página pública.`); }
}
if (!posts?.length) {
  try { posts = await desdePagina(); fuente = 'Página pública de LinkedIn'; } catch (e) { aviso(`${e.message}. Se conservan las publicaciones que ya estaban.`); }
}
if (!posts?.length) process.exit(flag('estricto') ? 1 : 0);

posts = posts.sort((a, b) => Date.parse(b.fecha) - Date.parse(a.fecha)).slice(0, MAX);
if (JSON.stringify(posts) === JSON.stringify(previos)) {
  console.log(`Sin publicaciones nuevas (${posts.length} vigentes; fuente: ${fuente})`);
} else {
  const out = { ...prev, actualizado: new Date().toISOString(), fuente, posts };
  writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`${posts.length} publicaciones guardadas en ${OUT} (fuente: ${fuente})`);
}
