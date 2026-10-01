# Publicaciones de LinkedIn en Transporte Autorizado

La sección «Publicaciones recientes» muestra las últimas publicaciones de la página de LinkedIn de **Vínculo Verde**
(`https://www.linkedin.com/company/vinculo-verde/`), cada una con la norma relacionada (ver o descargar).

## Cómo se actualiza

El sitio es estático (GitHub Pages) y el navegador no puede leer LinkedIn directamente, así que lo hace una tarea programada:

1. `.github/workflows/linkedin.yml` corre **cada 6 horas** (y a pedido, en Actions → «Publicaciones de LinkedIn» → *Run workflow*).
2. Ejecuta `tools/linkedin.mjs`, que guarda las 8 publicaciones más recientes en `assets/transporte/linkedin.json`, copia la
   portada de cada una en `assets/transporte/linkedin/` (primera página del documento, imagen o carátula del video) y las
   enlaza con su norma según `assets/transporte/normativa.json` (número de la norma, sigla o tema).
3. Si algo cambió, hace un commit y pide a GitHub Pages que publique. La página lee el JSON al cargar, con la más reciente primero.

No hay que tocar el código para cada publicación nueva: basta publicarla en LinkedIn.

### De dónde lee

| Vía | Requiere | Cuándo se usa |
| --- | --- | --- |
| **Página pública** (`https://cl.linkedin.com/company/vinculo-verde`, lo que ve un visitante sin cuenta) | Nada | Por defecto |
| **API de LinkedIn** (oficial) | App aprobada y secretos (ver abajo) | Si los secretos están configurados; si falla, se usa la página pública |

Resguardos del script: si LinkedIn no responde, pide iniciar sesión o cambia el formato de su página, **el archivo queda como
estaba** (nunca se publica una lista vacía) y la tarea deja un aviso en Actions; solo incluye lo publicado por la propia página
(lo compartido desde otras cuentas no entra); si el texto de una publicación no cambió, respeta la norma que ya tenía asignada.

Límites de la página pública, para tenerlos presentes:

- LinkedIn suele pedir inicio de sesión a servidores de centros de datos, y GitHub Actions corre en uno. Si en Actions aparece
  el aviso «LinkedIn no mostró la página pública», la lectura automática desde GitHub no está pasando: las opciones son la API
  oficial (abajo) o ejecutar `node tools/linkedin.mjs --publico` desde un computador de la oficina y subir el cambio.
- Muestra solo las publicaciones más recientes (las anteriores que ya estaban guardadas se conservan).
- Las condiciones de uso de LinkedIn no contemplan la lectura automática de sus páginas; la vía prevista por LinkedIn es la API.
  Aquí se lee una sola página, la propia de la empresa, cuatro veces al día.
- GitHub pausa las tareas programadas de un repositorio que pasa 60 días sin cambios; se reactivan en Actions → *Enable workflow*.

Prueba local: `node tools/linkedin.mjs --publico` (o `--archivo=pagina.html` con una página guardada; `--estricto` termina con
error si no se pudo leer).

## API oficial (opcional, más estable)

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
   - Opcional, en *Variables*: `LINKEDIN_VERSION` (AAAAMM; por defecto se usa la del mes anterior) y `LINKEDIN_PAGE`
     (nombre de la página en la URL; por defecto `vinculo-verde`).
6. En *Actions*, ejecuta «Publicaciones de LinkedIn» a mano y revisa el resultado en la página.

Con la API, los documentos (carruseles PDF) no traen portada: se conserva la que ya estaba guardada para esa publicación.

## Formato de `assets/transporte/linkedin.json`

```json
{ "actualizado": "2026-10-01T12:00:00Z",
  "fuente": "Página pública de LinkedIn",
  "organizacion": { "nombre": "Vínculo Verde", "url": "https://www.linkedin.com/company/vinculo-verde/", "logo": "opcional" },
  "posts": [ { "id": "urn:li:activity:…", "urn": "urn:li:ugcPost:… (opcional)", "url": "https://…linkedin.com/posts/…",
               "fecha": "ISO 8601", "texto": "…", "imagen": "assets/transporte/linkedin/….jpg (opcional)",
               "documento": { "titulo": "…", "paginas": 2 }, "normas": ["ley-20920"] } ] }
```

`documento` aparece solo en los carruseles PDF. `normas[0]` es la norma que la tarjeta ofrece ver o descargar; se puede
corregir a mano y el script la respeta mientras el texto de la publicación no cambie.
