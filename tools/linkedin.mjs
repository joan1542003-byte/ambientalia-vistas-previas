// Publicaciones recientes de la página de LinkedIn → assets/transporte/linkedin.json (lo lee la sección «Publicaciones recientes»).
// Corre en GitHub Actions (.github/workflows/linkedin.yml) cada 6 horas o a pedido. Requiere Node 20+ y la API de LinkedIn
// (Community Management API, permiso r_organization_social). Variables (secretos del repositorio):
//   LINKEDIN_ORG_ID          número de la organización (URL de administración: linkedin.com/company/<número>/admin)
//   LINKEDIN_ACCESS_TOKEN    token de acceso vigente (dura 60 días), o bien, para renovarlo solo:
//   LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_REFRESH_TOKEN (el token de renovación dura 365 días)
//   LINKEDIN_VERSION         opcional, versión de la API en formato AAAAMM (por defecto, la del mes anterior)
// Cada publicación queda enlazada con su norma (assets/transporte/normativa.json, mismos criterios que la página).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const OUT = 'assets/transporte/linkedin.json';
const IMG_DIR = 'assets/transporte/linkedin';
const env = process.env;
const fail = (msg) => { console.error(msg); process.exit(1); };
if (!env.LINKEDIN_ORG_ID) fail('Falta LINKEDIN_ORG_ID');

const version = env.LINKEDIN_VERSION || (() => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() - 1); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`; })();

async function token() {
  if (env.LINKEDIN_REFRESH_TOKEN && env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET) {
    const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: env.LINKEDIN_REFRESH_TOKEN, client_id: env.LINKEDIN_CLIENT_ID, client_secret: env.LINKEDIN_CLIENT_SECRET })
    });
    if (res.ok) return (await res.json()).access_token;
    console.warn('No se pudo renovar el token:', res.status, await res.text());
  }
  if (env.LINKEDIN_ACCESS_TOKEN) return env.LINKEDIN_ACCESS_TOKEN;
  fail('Falta LINKEDIN_ACCESS_TOKEN (o los datos para renovarlo)');
}

const auth = await token();
const api = (path) => fetch(`https://api.linkedin.com/rest/${path}`, {
  headers: { Authorization: `Bearer ${auth}`, 'LinkedIn-Version': version, 'X-Restli-Protocol-Version': '2.0.0' }
});

// Texto de LinkedIn («little text»): menciones y hashtags a texto simple
const plain = (s = '') => s
  .replace(/@\[([^\]]+)\]\(urn:li:[^)]+\)/g, '$1')
  .replace(/\{hashtag\|\\?#\|([^}]+)\}/g, '#$1')
  .replace(/\\([\\()[\]{}@|*_~<>#])/g, '$1')
  .trim();

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

const author = encodeURIComponent(`urn:li:organization:${env.LINKEDIN_ORG_ID}`);
const res = await api(`posts?author=${author}&q=author&count=20&sortBy=LAST_MODIFIED`);
if (!res.ok) fail(`LinkedIn respondió ${res.status}: ${await res.text()}`);
const { elements = [] } = await res.json();

const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
mkdirSync(IMG_DIR, { recursive: true });
const posts = [];
for (const p of elements) {
  if (p.lifecycleState !== 'PUBLISHED' || p.visibility !== 'PUBLIC') continue;
  const texto = plain(p.commentary);
  if (!texto) continue;  // compartidos sin texto propio
  const item = {
    id: p.id,
    url: `https://www.linkedin.com/feed/update/${p.id}/`,
    fecha: new Date(p.publishedAt || p.createdAt).toISOString(),
    texto,
    normas: related(texto)
  };
  // Imagen: el enlace de LinkedIn caduca, por eso se guarda una copia en el sitio
  const media = p.content?.media?.id;
  if (media?.startsWith('urn:li:image:')) {
    try {
      const im = await api(`images/${encodeURIComponent(media)}`);
      const url = im.ok ? (await im.json()).downloadUrl : null;
      if (url) {
        const file = `${IMG_DIR}/${media.split(':').pop()}.jpg`;
        if (!existsSync(file)) writeFileSync(file, Buffer.from(await (await fetch(url)).arrayBuffer()));
        item.imagen = file;
      }
    } catch (e) { console.warn('Imagen omitida', media, e.message); }
  }
  // Documentos (carruseles PDF): la API no entrega portada; se conserva la que ya estaba guardada para esa publicación
  const old = (prev.posts || []).find((o) => o.id === p.id || o.urn === p.id);
  if (!item.imagen && old?.imagen) item.imagen = old.imagen;
  if (old?.documento) item.documento = old.documento;
  if (old?.url && !old.url.includes('/feed/update/')) item.url = old.url;
  posts.push(item);
  if (posts.length >= 8) break;
}

const out = { ...prev, actualizado: new Date().toISOString(), posts };
writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
console.log(`${posts.length} publicaciones guardadas en ${OUT}`);
