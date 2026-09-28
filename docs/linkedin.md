# Publicaciones de LinkedIn en Transporte Autorizado

La sección «Publicaciones recientes» muestra las últimas publicaciones de la página de LinkedIn de **Vínculo Verde**
(`https://www.linkedin.com/company/vinculo-verde/`), cada una con la norma relacionada (ver o descargar).

## Cómo se actualiza

LinkedIn no permite leer las publicaciones de una página sin su API, y el sitio es estático (GitHub Pages). Por eso:

1. `.github/workflows/linkedin.yml` corre cada 6 horas (y a pedido, en Actions → «Publicaciones de LinkedIn» → *Run workflow*).
2. Ejecuta `tools/linkedin.mjs`, que llama a la API de LinkedIn con los secretos del repositorio, guarda las 8 publicaciones
   públicas más recientes en `assets/transporte/linkedin.json` (y sus imágenes en `assets/transporte/linkedin/`) y las
   enlaza con su norma según `assets/transporte/normativa.json` (número de la norma, sigla o tema).
3. Si hay cambios, hace un commit y pide a GitHub Pages que publique. La página lee el JSON al cargar.

Mientras no estén configurados los secretos, la sección muestra «Pronto verás aquí las publicaciones de Vínculo Verde» y el
botón para seguir la página.

## Qué API y cómo obtener el acceso (una vez)

API: **LinkedIn Community Management API** (producto de LinkedIn Marketing), permiso `r_organization_social`
(leer las publicaciones de una página que administras). Endpoint usado: `GET https://api.linkedin.com/rest/posts?author=urn:li:organization:{ID}&q=author`.

1. Con una cuenta **administradora de la página de Vínculo Verde**, crea una app en <https://www.linkedin.com/developers/apps>
   y asóciala a la página de Vínculo Verde. Un administrador de la página debe verificar la app (pestaña *Settings* → *Verify*).
2. En la pestaña *Products*, solicita **Community Management API**. LinkedIn revisa la solicitud (verificación de la empresa);
   el nivel de desarrollo basta para leer las publicaciones de tu propia página.
3. En *Auth*, agrega una *Redirect URL* (por ejemplo `https://www.linkedin.com/developers/tools/oauth/redirect`) y genera un
   token con el **OAuth Token Generator** (*Docs and tools* → *OAuth Token Tools*) marcando `r_organization_social`,
   autorizando con la cuenta administradora. Guarda el **access token** (dura 60 días) y, si LinkedIn lo entrega, el
   **refresh token** (dura 365 días; con él el token se renueva solo).
4. El **ID de la organización** es el número de la URL de administración: `https://www.linkedin.com/company/<ID>/admin/`.
5. En GitHub: repositorio → *Settings* → *Secrets and variables* → *Actions* → *New repository secret*:
   - `LINKEDIN_ORG_ID`
   - `LINKEDIN_ACCESS_TOKEN` (si no hay refresh token, renuévalo cada 60 días)
   - `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REFRESH_TOKEN` (para la renovación automática)
   - Opcional, en *Variables*: `LINKEDIN_VERSION` (AAAAMM; por defecto se usa la del mes anterior).
6. En *Actions*, ejecuta «Publicaciones de LinkedIn» a mano para la primera carga y revisa el resultado en la página.

Alternativa si LinkedIn demora la aprobación: un servicio de terceros que entregue el feed de la página en JSON (de pago; revisar
su política de datos). Basta con que `tools/linkedin.mjs` lea esa fuente y escriba el mismo formato de `linkedin.json`.

## Formato de `assets/transporte/linkedin.json`

```json
{ "actualizado": "2026-09-28T12:00:00Z",
  "organizacion": { "nombre": "Vínculo Verde", "url": "https://www.linkedin.com/company/vinculo-verde/", "logo": "opcional" },
  "posts": [ { "id": "urn:li:share:…", "url": "https://www.linkedin.com/feed/update/urn:li:share:…/", "fecha": "ISO 8601",
               "texto": "…", "imagen": "assets/transporte/linkedin/….jpg (opcional)", "normas": ["ds-148-2003-minsal"] } ] }
```
