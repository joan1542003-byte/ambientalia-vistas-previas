/* Agente informativo de Transporte Autorizado: maqueta (08-10-2026). Primera etapa, solo informativa.
   - Responde únicamente con lo que ya está publicado en el sitio y siempre dice de dónde lo tomó.
   - No guarda una copia del contenido: lee la página principal, las guías de «Ayuda» y el índice de normativa tal como
     están publicados (y las categorías del formulario, de pickers.js). Si el sitio cambia, el agente cambia con él.
   - No redacta: busca por palabras (sin IA generativa) y muestra el pasaje tal cual. Lo único propio son frases fijas
     de enlace («Esto dice la página:»), que no afirman nada sobre el servicio.
   - No cotiza ni toma solicitudes: para eso lleva al formulario, al buscador o al especialista del propio sitio.
   Se abre desde una burbuja abajo a la izquierda (la «?» del sitio va a la derecha), en una ventana pequeña que no
   bloquea la página. «Ver en la página» cierra la ventana, va al pasaje y lo destaca; lo que está en otra página del
   sitio (una guía, una norma) se abre en otra pestaña y la conversación sigue aquí. En agente-virtual.html el sitio
   va detrás en un <iframe> y ahí se muestra todo, también las otras páginas.
   Si la ventana tiene la dirección de un servicio del asistente, responde ese servicio (agente-chat.js) y este archivo
   no hace nada; ver la condición más abajo. Sin lookbehind en las expresiones regulares (Safari < 16.4). */
(() => {
  const d = document;
  const panel = d.querySelector('[data-agente]');
  if (!panel) return;
  /* Con la dirección del asistente responde agente-chat.js (window.SITE.asistente: la del plugin, `data-agente-api` o,
     en este computador, ?asistente=…), y sobre WordPress sin dirección agente-chat.js avisa que no está disponible: la
     maqueta responde solo en las vistas previas. `?agente=maqueta` la fuerza en local. La misma condición está en
     agente-chat.js */
  const forzada = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get('agente') === 'maqueta';
  if (!forzada && (window.TA_API || window.SITE?.asistente?.(panel.dataset.agenteApi))) return;
  const marco = d.querySelector('[data-agente-sitio]');  // solo en agente-virtual.html: el sitio va detrás, en un <iframe>
  const boton = d.querySelector('[data-agente-abrir]');
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
  const BASE = new URL(window.SITE_ROOT || '.', location.href).href;
  const AQUI = location.href.slice(BASE.length).split(/[?#]/)[0];

  /* ---------- Utilidades ---------- */
  const limpio = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const sinPunto = (s) => s.replace(/[.:]$/, '');
  /* Texto visible de un elemento, sin lo que es solo para lectores de pantalla ni las citas legales (van aparte) */
  const texto = (el) => {
    if (!el) return '';
    const c = el.cloneNode(true);
    c.querySelectorAll('.sr-only, svg, .law-refs, .plus, .pm, script, style').forEach((x) => x.remove());
    return limpio(c.textContent);
  };
  const MES = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sept.', 'oct.', 'nov.', 'dic.'];
  const fecha = (iso) => { const [y, m, dia] = String(iso || '').split('-').map(Number); return y ? `${dia} ${MES[m - 1]} ${y}` : ''; };
  const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
  /* Crea un elemento. Los textos del sitio siempre entran como texto (nunca como HTML) */
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
  const svg = (path, box = 24) => `<svg width="16" height="16" viewBox="0 0 ${box} ${box}" fill="none" stroke="currentColor" stroke-width="${box === 24 ? 2 : 1.8}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  const I = {
    doc: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
    ir: svg('<path d="M3 8h10M9 4l4 4-4 4"/>', 16),
    fuera: svg('<path d="M5 11l6-6M6 5h5v5"/>', 16),
    bajar: svg('<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14"/>')
  };

  /* Dónde está un elemento dentro de su página: sirve para encontrarlo después en el sitio que se ve detrás.
     Se apoya en un id o en una clase única; si no hay, en la posición entre sus hermanos. */
  const rutaDe = (el) => {
    const partes = [];
    for (let n = el; n && n.tagName !== 'BODY' && n.tagName !== 'HTML'; n = n.parentElement) {
      if (n.id) return [`#${CSS.escape(n.id)}`, ...partes].join(' > ');
      const unica = [...n.classList].find((c) => n.ownerDocument.querySelectorAll(`.${CSS.escape(c)}`).length === 1);
      if (unica) return [`.${CSS.escape(unica)}`, ...partes].join(' > ');
      partes.unshift(`${n.tagName.toLowerCase()}:nth-of-type(${[...n.parentElement.children].filter((x) => x.tagName === n.tagName).indexOf(n) + 1})`);
    }
    return ['body', ...partes].join(' > ');
  };
  const pedir = async (url) => { const r = await fetch(new URL(url, BASE)); if (!r.ok) throw new Error(url); return r; };
  const pagina = async (url) => new DOMParser().parseFromString(await (await pedir(url)).text(), 'text/html');

  /* ---------- Pasajes: lo que el agente puede mostrar ----------
     Cada pasaje es un trozo del sitio tal cual: { tipo, grupo, titulo, sub, parrafos, datos, listas, cita, refs, enlaces,
     fuente: { pagina, etiqueta, sel | hash, abre }, oficial }. «grupo» reúne los pasajes de una misma sección;
     «resumen» marca el que la muestra completa; «claves» son palabras que solo ayudan a encontrarlo (no se muestran). */
  const pasajes = [];
  const vistas = {};
  const pasaje = (p) => { p.id = pasajes.length; p.familia = p.familia || p.grupo; pasajes.push(p); return p; };
  const intento = (f) => { try { f(); } catch (e) { console.warn('Agente: no se pudo leer una parte del sitio', e); } };
  const resumenDe = (p) => pasajes.find((x) => x.grupo === p.grupo && x.resumen);
  let fuentes = [];  // lo que se leyó, para decirlo cuando preguntan de dónde salen las respuestas

  /* Enlace de la página tal como está: a otro dominio o a otra página de este sitio */
  const enlaceDe = (a, rotulo) => {
    const href = a.getAttribute('href');
    return /^https?:/.test(href) ? { rotulo, href, externo: true } : { rotulo, href: href.replace(/^\.\//, ''), sitio: true };
  };
  const leerPrincipal = (doc) => {
    const menu = (hash) => texto(doc.querySelector(`#nav a[href="${hash}"]`));
    const lugar = (id, el, extra) => ({ pagina: PRINCIPAL, etiqueta: `Página principal › ${menu(`#${id}`) || { proceso: 'Proceso', red: 'Gestores y transportistas' }[id] || sinPunto(texto(doc.querySelector(`#${id} h2`)))}`, sel: rutaDe(el), ...extra });
    const antes = pasajes.length;

    intento(() => {
      const copy = doc.querySelector('#top .stage-copy');
      pasaje({ tipo: 'principal', grupo: 'inicio', titulo: sinPunto(texto(copy.querySelector('h1'))), parrafos: [texto(copy.querySelector('.lead'))], fuente: { pagina: PRINCIPAL, etiqueta: 'Página principal › Inicio', sel: rutaDe(copy) }, claves: 'que hacen quienes son a que se dedican empresa transporte autorizado' });
      const rutas = doc.querySelector('[data-routes]');
      pasaje({
        tipo: 'principal', grupo: 'inicio-opciones', titulo: rutas.querySelector('[role="tablist"]')?.getAttribute('aria-label') || 'Opciones del inicio',
        listas: [{ items: [...rutas.querySelectorAll('.route')].map((r) => ({ fuerte: texto(r.querySelector('strong')), texto: texto(r.querySelector('small')) })) }],
        fuente: { pagina: PRINCIPAL, etiqueta: 'Página principal › Inicio', sel: rutaDe(rutas) }, claves: 'opciones que puedo hacer aqui sitio web pagina'
      });
      const base = rutas.querySelector('a.route-link');
      if (base) pasaje({ tipo: 'principal', grupo: 'reciclador', titulo: texto(base.querySelector('strong')), enlaces: [{ rotulo: texto(base.querySelector('small')), href: base.href, externo: true }], fuente: { pagina: PRINCIPAL, etiqueta: 'Página principal › Inicio', sel: rutaDe(base) }, claves: 'reciclador recicladores base convenio' });
    });

    /* Vistas del propio sitio que resuelven lo que el agente no hace: cotizar, buscar transportista y hablar con alguien */
    intento(() => [
      ['cotizar', 'cotizar cotizacion presupuesto solicitar solicitud pedir agendar programar formulario'],
      ['buscar', 'buscar buscador encontrar transportistas gestores listado directorio empresas autorizadas'],
      ['especialista', 'especialista hablar persona humano asesor ejecutivo orientacion consulta duda llamar']
    ].forEach(([id, claves]) => {
      const v = doc.getElementById(id);
      const tab = doc.querySelector(`[data-route="${id}"]`);
      if (!v) return;
      vistas[id] = pasaje({
        tipo: 'vista', grupo: `vista:${id}`, titulo: sinPunto(texto(v.querySelector('h2'))), sub: tab ? texto(tab.querySelector('strong')) : '',
        parrafos: [texto(v.querySelector(':scope > .hcard-head > .hcard-sub'))].filter(Boolean),
        fuente: { pagina: PRINCIPAL, etiqueta: `Página principal › ${menu(`#${id}`) || (tab ? texto(tab.querySelector('small')) : 'Inicio')}`, hash: `#${id}`, abre: true }, claves
      });
    }));

    intento(() => {
      const s = doc.querySelector('#servicios');
      const servicios = [...s.querySelectorAll('.service')].map((el) => ({ el, titulo: texto(el.querySelector('h3')), p: texto(el.querySelector('.service-body > p')), mas: texto(el.querySelector('.more-toggle')), que: texto(el.querySelector('.service-more')) }));
      const extras = [...s.querySelectorAll('.extra')].map((el) => ({ el, titulo: texto(el.querySelector('strong')), p: texto(el.querySelector('.extra-text')) }));
      pasaje({
        tipo: 'principal', grupo: 'servicios', resumen: true, titulo: sinPunto(texto(s.querySelector('h2'))), parrafos: [texto(s.querySelector('.section-head .lead'))],
        listas: [{ items: servicios.map((x) => ({ fuerte: x.titulo, texto: x.p })) }, { titulo: texto(s.querySelector('.extras-title')), items: extras.map((x) => ({ fuerte: x.titulo, texto: x.p })) }],
        fuente: lugar('servicios', s), claves: 'servicios que ofrecen que hacen tipos de servicio', alias: [[/ que servicios | servicios (que )?(ofrecen|tienen|prestan|dan) | que (hacen|ofrecen) /, 3]]
      });
      servicios.forEach((x) => pasaje({ tipo: 'principal', grupo: 'servicios', titulo: x.titulo, parrafos: [x.p], datos: x.que ? [[x.mas, x.que]] : [], fuente: lugar('servicios', x.el) }));
      extras.forEach((x) => pasaje({ tipo: 'principal', grupo: 'servicios-extra', titulo: x.titulo, parrafos: [x.p], fuente: lugar('servicios', x.el) }));
    });

    intento(() => {
      const s = doc.querySelector('#planes');
      const planes = [...s.querySelectorAll('.plan')].map((el) => ({ el, titulo: texto(el.querySelector('h3')), sub: texto(el.querySelector('.plan-cover p')), p: [...el.querySelectorAll('.plan-body > p')].map(texto) }));
      pasaje({ tipo: 'principal', grupo: 'planes', resumen: true, titulo: texto(s.querySelector('h2')), listas: [{ items: planes.map((x) => ({ fuerte: x.titulo, texto: [`${x.sub}.`, ...x.p].join(' ') })) }], fuente: lugar('planes', s), claves: 'planes plan modalidades modalidad tipos de retiro opciones', alias: [[/ (planes|modalidades|(tipos|opciones) de retiro) /, 3]] });
      planes.forEach((x) => pasaje({ tipo: 'principal', grupo: 'planes', titulo: x.titulo, sub: x.sub, parrafos: x.p, fuente: lugar('planes', x.el) }));
    });

    intento(() => {
      const s = doc.querySelector('#proceso');
      const pasos = [...s.querySelectorAll('.timeline > li')].map((el) => ({ el, titulo: texto(el.querySelector('h3')), p: texto(el.querySelector('p')) }));
      pasaje({ tipo: 'principal', grupo: 'proceso', resumen: true, titulo: sinPunto(texto(s.querySelector('h2'))), listas: [{ orden: true, items: pasos.map((x) => ({ fuerte: x.titulo, texto: x.p })) }], fuente: lugar('proceso', s), claves: 'proceso pasos etapas como funciona como trabajan', alias: [[/ como (funciona|funcionan|trabajan|operan|es el proceso) | (pasos|etapas) /, 3]] });
      pasos.forEach((x) => pasaje({ tipo: 'principal', grupo: 'proceso', titulo: x.titulo, parrafos: [x.p], fuente: lugar('proceso', x.el) }));
    });

    intento(() => doc.querySelectorAll('#preguntas details').forEach((q) => pasaje({
      tipo: 'principal', grupo: 'preguntas', pregunta: true, titulo: texto(q.querySelector('summary')), parrafos: [...q.querySelectorAll('.answer p')].map(texto),
      fuente: { pagina: PRINCIPAL, etiqueta: `Página principal › ${sinPunto(texto(doc.querySelector('#preguntas h2')))}`, sel: rutaDe(q) }
    })));

    intento(() => {
      const red = doc.querySelector('#red .partner');
      if (red) pasaje({ tipo: 'principal', grupo: 'red', titulo: texto(red.querySelector('h2, h3')), parrafos: [texto(red.querySelector('p'))], enlaces: [{ rotulo: texto(red.querySelector('a.btn')), href: red.querySelector('a.btn').href, externo: true }], fuente: lugar('red', red), claves: 'gestor transportista sumarme inscribir registrar red plataforma trabajar con ustedes' });
    });

    intento(() => {
      const pie = doc.querySelector('.site-footer');
      const lema = pie.querySelector('.footer-grid p');
      if (lema) pasaje({ tipo: 'principal', grupo: 'pie', titulo: pie.querySelector('.brand img')?.getAttribute('alt') || 'Transporte Autorizado', parrafos: [texto(lema)], fuente: { pagina: PRINCIPAL, etiqueta: 'Página principal › Pie de página', sel: rutaDe(lema) }, claves: 'empresas personas particulares hogares casa chile a quien atienden', alias: [[/ (personas? naturales?|particular(es)?|hogar(es)?|mi casa|domicili[a-z]+|vecinos?) /, 2]] });
      const wa = pie.querySelector('a[href*="wa.me"]');
      if (wa) pasaje({ tipo: 'principal', grupo: 'contacto', titulo: texto(wa.closest('div')?.querySelector('h2')) || 'Contacto', parrafos: [texto(wa)], enlaces: [{ rotulo: 'Abrir WhatsApp', href: wa.href, externo: true }], fuente: { pagina: PRINCIPAL, etiqueta: 'Página principal › Pie de página', sel: rutaDe(wa.closest('div')) }, claves: 'contacto contactar telefono numero celular llamar escribir whatsapp' });
    });

    /* «Ayuda» de la cabecera: el checklist descargable (las guías se leen completas de sus páginas; la normativa, de su índice) */
    intento(() => {
      const c = doc.querySelector('[data-docs-item="checklist"] .docs-detail-in');
      const xls = c.querySelector('a[download]');
      pasaje({
        tipo: 'ayuda', grupo: 'checklist', titulo: texto(c.querySelector('h3')), sub: texto(c.querySelector('.docs-kicker')), parrafos: [texto(c.querySelector('.docs-lead'))],
        listas: [{ orden: true, items: [...c.querySelectorAll('.docs-blocks li')].map((li) => ({ texto: texto(li) })) }],
        enlaces: xls ? [{ rotulo: texto(xls), href: xls.getAttribute('href'), descarga: true }] : [],
        fuente: { pagina: PRINCIPAL, etiqueta: 'Ayuda › Documentos › Checklist de autorización', hash: '#checklist', abre: true }, claves: 'checklist planilla excel descargar lista de verificacion revisar caso'
      });
    });
    fuentes.push({ fuerte: 'Página principal', texto: `${pasajes.length - antes} pasajes: inicio, servicios, planes, proceso, preguntas frecuentes, gestores y transportistas, y contacto.` });
    return {
      guias: [...new Set([...doc.querySelectorAll('[data-docs-item]:not([data-docs-item="checklist"]):not([data-docs-item="normativa"])')].map((x) => `ayuda/${x.dataset.docsItem}.html`))],
      normas: doc.querySelector('[data-lib][data-src]')?.dataset.src,
      biblioteca: doc.querySelector('[data-docs-item="normativa"] .docs-detail-in')
    };
  };

  /* Citas legales de una guía: cada una apunta al artículo exacto en la página de la norma */
  const refsDe = (el, pag) => [...el.querySelectorAll('a.law-ref')].map((a) => {
    const u = new URL(a.getAttribute('href'), new URL(pag, BASE));
    return { texto: texto(a), pagina: u.href.slice(BASE.length).split('#')[0], hash: u.hash };
  });
  const leerGuia = (doc, pag) => {
    const h1 = texto(doc.querySelector('.guia-head h1'));
    const familia = `guia:${pag}`;
    const secciones = [];
    const intro = pasaje({
      tipo: 'guia', grupo: familia, resumen: true, titulo: h1, sub: texto(doc.querySelector('.guia-head .norm-kind')), parrafos: [texto(doc.querySelector('.guia-head .norm-lead'))],
      fuente: { pagina: pag, etiqueta: `Ayuda › Guía rápida: ${h1}`, sel: '.guia-head' }, siguientes: secciones, rotuloSiguientes: 'En esta guía'
    });
    doc.querySelectorAll('.guia-sec').forEach((sec) => {
      const h2 = sec.querySelector('h2[id]');
      if (!h2 || h2.id === 'normas' || h2.id === 'otras') return;
      const nombre = texto(h2);
      const selSec = rutaDe(sec);
      const lugar = (el) => ({ pagina: pag, etiqueta: `Ayuda › ${h1} › ${nombre}`, sel: rutaDe(el), hash: `#${h2.id}`, selGrupo: selSec });
      const items = [...sec.querySelectorAll('.guia-points > li, .guia-steps > li, .guia-errors > li')];
      const filas = [...sec.querySelectorAll('.guia-matrix tbody tr')];
      const nota = texto(sec.querySelector('.guia-sub'));
      const lista = { orden: !!sec.querySelector('.guia-steps'), items: items.map((li) => ({ texto: texto(li), refs: refsDe(li, pag) })) };
      const base = { tipo: 'guia', familia, encabezado: nombre, contexto: `${h1} ${nombre}` };
      if (h2.id === 'saber') {  // lo esencial de la guía va con su presentación
        intro.listas = [{ titulo: nombre, ...lista }];
        items.forEach((li) => pasaje({ ...base, grupo: familia, parrafos: [texto(li)], refs: refsDe(li, pag), fuente: lugar(li) }));
        return;
      }
      const grupo = `${familia}#${h2.id}`;
      secciones.push(pasaje({
        ...base, grupo, resumen: true, titulo: nombre, sub: h1, encabezado: '', parrafos: nota ? [nota] : [],
        listas: [items.length && lista, filas.length && { items: filas.map((tr) => ({ fuerte: texto(tr.querySelector('th')), texto: sinPunto(texto(tr.querySelector('td'))) })) }].filter(Boolean),
        fuente: { pagina: pag, etiqueta: `Ayuda › ${h1} › ${nombre}`, sel: selSec, hash: `#${h2.id}` }
      }));
      items.forEach((li) => pasaje({ ...base, grupo, parrafos: [texto(li)], refs: refsDe(li, pag), fuente: lugar(li) }));
      filas.forEach((tr) => pasaje({
        ...base, grupo, encabezado: '', titulo: texto(tr.querySelector('th')), sub: `${h1} · ${nombre}`,
        datos: [...tr.querySelectorAll('td')].map((td) => [sinPunto(td.dataset.label || ''), texto(td)]).filter(([, v]) => v), refs: refsDe(tr, pag), fuente: lugar(tr)
      }));
    });
    return intro;
  };

  const leerNormas = (j, biblioteca) => {
    const normas = j.normas.map((n) => pasaje({
      tipo: 'norma', grupo: `norma:${n.slug}`, norma: n, titulo: `${n.corto} · ${n.tema}`, sub: [n.tipo, n.organismo, n.vigente ? 'Vigente' : 'No vigente'].join(' · '),
      parrafos: [n.rel], cita: n.objeto ? { texto: n.objeto, rotulo: 'Texto oficial de la norma' } : null,
      datos: [['Publicada', fecha(n.publicacion)], ['Texto al', fecha(n.version)], ['Artículos', String(n.articulos || '')]].filter(([, v]) => v),
      enlaces: n.pdf ? [{ rotulo: 'Descargar PDF', href: n.pdf, descarga: true }] : [],
      fuente: { pagina: n.pagina, etiqueta: `Normativa › ${n.corto}`, sel: '.norm-head' },
      oficial: { etiqueta: j.fuente, href: n.fuente, consulta: n.consulta },
      claves: [n.nombre, n.tema, ...(n.temas || []).map((t) => j.temas?.[t]), ...(n.indice || [])].join(' '),
      alias: (n.alias || []).map(([re, peso]) => [new RegExp(re, 'i'), peso])
    }));
    pasaje({
      tipo: 'ayuda', grupo: 'normativa', resumen: true, titulo: texto(biblioteca?.querySelector('h3')) || 'Normativa', parrafos: [texto(biblioteca?.querySelector('.docs-lead'))].filter(Boolean),
      listas: [{ items: normas.map((p) => ({ fuerte: p.norma.corto, texto: p.norma.tema, pasaje: p })) }],
      fuente: { pagina: PRINCIPAL, etiqueta: 'Ayuda › Documentos › Normativa', hash: '#normativa', abre: true }, claves: 'normativa normas leyes decretos reglamentos legislacion legal biblioteca', alias: [[/ (que|cuales) (normas|normativa|leyes|decretos) /, 3]]
    });
    fuentes.push({ fuerte: `Normativa (${normas.length} normas)`, texto: `Texto oficial de ${j.fuente}, consultado el ${fecha(j.consulta)}. Son copias de referencia: cada respuesta enlaza la fuente oficial.` });
  };

  /* Categorías de residuo del formulario de cotización (las mismas del buscador). Que una categoría esté ahí no confirma
     un retiro: por eso su respuesta va siempre junto a lo que la página dice sobre la revisión de cada caso. */
  const leerCategorias = () => {
    const P = window.PICK;
    if (!P?.CATEGORIES) return;
    const f = { pagina: PRINCIPAL, etiqueta: 'Página principal › Cotizar retiro › Residuo', hash: '#cotizar', abre: true };
    const grupos = [['no-peligroso', P.CATEGORIES.safe], ['peligroso', P.CATEGORIES.hazard]];
    pasaje({ tipo: 'categoria', grupo: 'categorias', resumen: true, titulo: 'Residuos que se pueden elegir al cotizar', listas: grupos.map(([t, lista]) => ({ titulo: P.TIPO_LABEL[t], items: lista.map(([n]) => ({ texto: n })) })), fuente: f, claves: 'que residuos retiran reciben aceptan tipos categorias lista materiales',
      alias: [[/ (que|cuales) (tipos? de )?(residuos|materiales|desechos) (retiran|reciben|aceptan|gestionan|transportan|manejan|puedo|se pueden) | (lista|listado|categorias|tipos) de residuos /, 3]] });
    grupos.forEach(([t, lista]) => lista.forEach(([n]) => pasaje({ tipo: 'categoria', grupo: 'categorias', encabezado: 'Categorías del formulario de cotización', titulo: n, sub: P.TIPO_LABEL[t], fuente: f })));
    fuentes.push({ fuerte: 'Formulario de cotización', texto: 'Las categorías de residuo que se pueden elegir.' });
  };

  /* Un artículo de una norma: se lee de su página solo cuando se pide */
  const leidas = new Map();
  const articulo = async (n, id) => {
    if (!leidas.has(n.slug)) leidas.set(n.slug, pagina(n.pagina));
    const sec = (await leidas.get(n.slug)).getElementById(id);
    if (!sec) return null;
    const nombre = texto(sec.querySelector('.norm-art-h')) || 'Artículo';
    const todo = [...sec.children].filter((x) => !x.matches('.norm-art-h')).map(texto).filter(Boolean);
    const parrafos = [];
    let largo = 0;
    for (const t of todo) {  // un artículo largo se muestra hasta unos 1.200 caracteres y se dice que sigue
      if (largo && largo + t.length > 1200) break;
      parrafos.push(t.length > 1400 ? `${t.slice(0, t.lastIndexOf(' ', 1200))}…` : t);
      largo += t.length;
    }
    const cortado = parrafos.length < todo.length || parrafos.some((t) => t.endsWith('…'));
    const norma = pasajes.find((p) => p.norma === n);
    return {
      tipo: 'articulo', titulo: `${n.corto} · ${nombre}`, sub: n.tema, parrafos, nota: cortado ? 'El artículo sigue: está completo en la página de la norma.' : '',
      fuente: { pagina: n.pagina, etiqueta: `Normativa › ${n.corto} › ${nombre}`, sel: `#${CSS.escape(id)}`, hash: `#${id}` }, oficial: norma?.oficial, norma: n
    };
  };

  /* ---------- Búsqueda por palabras (sin IA) ---------- */
  const plano = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const palabras = (s) => plano(s).match(/[a-z0-9]+/g) || [];
  const STOP = new Set(`a al algo algun alguna algunas algunos ante antes aqui asi aun aunque bien cada casi como con contra cosa cosas cual cuales cuando cuanto cuanta cuantos de del desde donde dos e el ella ellas ellos en entre era eres es esa esas ese eso esos esta estan estar estas este esto estos estoy fue fuera ha hace hacen hacer hago han hasta hay la las le les lo los mas me mi mis mucho muy nada ni no nos o os otra otras otro otros para pero poco por porque pues que quien quienes se sea ser si sin sobre solo son soy su sus tal tambien tan tanto te tengo tener tiene tienen tipo tipos todo todos tu tus u un una uno unas unos usted ustedes va van y ya yo puedo puede pueden podria podrian quiero quisiera necesito necesita necesitan saber dime digame decir favor hola buenas buenos dia dias tardes noches gracias info informacion pregunta consulta duda mismo misma debo debe deben hacia segun mediante dentro cerca caso casos forma manera sirve sirven existe existen ustedes ofrecen dan da usado usada usados usadas viejo vieja viejos viejas nuevo nueva nuevos nuevas ayuda ayudar ayudan ayudas ayudarme ayudarnos ayudenme`.split(/\s+/));
  const SUF = ['amientos', 'imientos', 'amiento', 'imiento', 'aciones', 'acion', 'adores', 'adoras', 'adora', 'ador', 'istas', 'ista', 'idades', 'idad', 'ando', 'iendo', 'aron', 'ieron', 'aban', 'ados', 'adas', 'idos', 'idas', 'ado', 'ada', 'ido', 'ida', 'ar', 'er', 'ir', 'an', 'en'];
  /* Raíz aproximada de una palabra: «retiran», «retiro» y «retirar» quedan en «retir» */
  const raiz = (w) => {
    if (/^\d+$/.test(w) || w.length < 4) return w;
    let s = w;
    if (s.length > 4 && /[lnrdzj]es$/.test(s)) s = s.slice(0, -2);
    else if (s.endsWith('s')) s = s.slice(0, -1);
    const suf = SUF.find((x) => s.endsWith(x) && s.length - x.length >= 4);
    if (suf) s = s.slice(0, -suf.length);
    if (s.length >= 5 && /[aeo]$/.test(s)) s = s.slice(0, -1);
    return s;
  };
  /* Otras formas de decir lo que el sitio dice con sus palabras. Solo ayudan a encontrar: nunca se muestran */
  const SIN = [
    ['precio precios costo costos cuesta cuestan vale valen tarifa tarifas cobran cobro pagar pago caro barato cuanto+sale cuanto+cuesta cuanto+vale cuanto+cobran', 'valor cuestan cotizacion'],
    ['urgente urgencia emergencia rapido hoy inmediato inmediata ahora apuro apurado cuanto+antes ya+mismo lo+antes+posible', 'express urgencias emergencias'],
    ['mensual mensualmente periodico periodicos recurrente recurrentes semanal frecuencia cada+mes todos+los+meses', 'programado mensual periodicos'],
    ['ahorrar economico economica descuento sin+apuro sin+urgencia', 'ahorra espera urgencia'],
    ['donde cobertura zona zonas region regiones ciudad ciudades santiago llegan atienden cubren', 'region metropolitana'],
    ['contacto contactar contactarlos telefono numero celular llamar llamo whatsapp wsp correo email mail escribir escribo', 'whatsapp contacto'],
    ['certificado certificados comprobante comprobantes respaldo respaldos factura facturas', 'certificados respaldos'],
    ['pasos etapas funciona funcionan procedimiento como+es+el+proceso como+trabajan como+operan', 'proceso'],
    ['hds fds hdsr fdsr ficha hoja+de+seguridad hojas+de+seguridad', 'hoja seguridad hds'],
    ['tolva tolvas batea bateas container contenedor contenedores', 'contenedores arriendo'],
    ['arrendar arriendan alquilar alquiler', 'arriendo contenedores'],
    ['permiso permisos resolucion resoluciones seremi', 'autorizacion sanitaria'],
    ['respel toxico toxicos inflamable inflamables corrosivo corrosivos', 'peligrosos'],
    ['llantas neumatico neumaticos pilas baterias envases lubricantes', 'rep prioritarios'],
    ['hospital hospitales clinica clinicas jeringas cortopunzantes hospitalarios', 'reas salud'],
    ['clasificar clasificacion clasifico identificar identifico distinguir es+peligroso si+es+peligroso', 'peligroso identificar'],
    ['proveedor proveedores contratar contrato', 'checklist contratar transportista'],
    ['ley leyes norma normas decreto decretos reglamento reglamentos legislacion legal', 'normativa'],
    ['foto fotos imagen imagenes', 'fotografias fotografia'],
    ['particular particulares hogar hogares casa casas domicilio domiciliario departamento vecino vecinos natural naturales', 'empresas'],
    ['plazo plazos demora demoran demoras tardan tarda tiempo cuando', 'express programado fechas horas'],
    ['escombro escombros demolicion obra obras', 'construccion demolicion'],
    ['carton papeles', 'papel carton'],
    ['electronicos computadores computador celulares raee', 'raee electronicos'],
    ['pintura pinturas solvente solventes quimico quimicos', 'quimicos solventes pinturas']
  ].map(([de, a]) => {
    const lista = de.split(' ');
    return { palabras: new Set(lista.filter((x) => !x.includes('+'))), frases: lista.filter((x) => x.includes('+')).map((x) => x.replaceAll('+', ' ')), exp: palabras(a).map(raiz) };
  });
  /* Comunas y regiones del propio formulario: nombrar una lleva a lo que la página dice sobre dónde se retira */
  let reLugar = null;
  const lugares = () => {
    const P = window.PICK;
    if (!P?.COMMUNES) return;
    /* Un nombre que el sitio usa como palabra común no cuenta como lugar: «Retiro» también es una comuna */
    const nombres = [...P.COMMUNES.map((c) => c.key), ...(P.REGION_NAMES || []).map(plano)].filter((n) => n.length > 3 && !STOP.has(n) && !df.has(raiz(n)));
    reLugar = new RegExp(` (${[...new Set(nombres)].sort((a, b) => b.length - a.length).map((n) => n.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ')).join('|')}) `);
  };

  let N = 0;
  let media = 1;
  let IDF_MAX = 1;
  const df = new Map();
  const indexar = () => {
    let total = 0;
    pasajes.forEach((p) => {
      /* Un resumen se encuentra por su título y sus claves: los ítems de su lista ya son pasajes por su cuenta */
      const lista = p.resumen ? [] : (p.listas || []).flatMap((l) => [l.titulo, ...l.items.flatMap((i) => [i.fuerte, i.texto])]);
      const cuerpo = [...(p.parrafos || []), ...(p.datos || []).flat(), ...lista, p.cita?.texto].filter(Boolean).join(' ');
      p.tf = new Map();
      p.len = 0;
      p.tit = new Set(palabras(p.titulo || '').filter((x) => !STOP.has(x) && x.length > 1).map(raiz));
      [[p.titulo, 3], [p.sub, 1.2], [p.claves, 2], [p.contexto, .6], [cuerpo, 1]].forEach(([t, w]) => palabras(t || '').forEach((x) => {
        if (STOP.has(x)) return;
        const r = raiz(x);
        p.tf.set(r, (p.tf.get(r) || 0) + w);
        p.len += w;
      }));
      p.tf.forEach((_, r) => df.set(r, (df.get(r) || 0) + 1));
      total += p.len;
    });
    N = pasajes.length;
    media = total / N || 1;
    IDF_MAX = Math.log(1 + (N + .5) / .5);
  };
  const idf = (r) => Math.log(1 + (N - (df.get(r) || 0) + .5) / ((df.get(r) || 0) + .5));
  const bm = (p, r) => { const f = p.tf.get(r); return f ? idf(r) * (f * 2.4) / (f + 1.4 * (.4 + .6 * p.len / media)) : 0; };
  /* Una palabra con un error de tipeo se lleva a la más parecida del sitio */
  const distancia = (a, b, max) => {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let fila = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i += 1) {
      const sig = [i];
      for (let j = 1; j <= b.length; j += 1) sig[j] = Math.min(fila[j] + 1, sig[j - 1] + 1, fila[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      fila = sig;
    }
    return fila[b.length];
  };
  const cercana = (r) => {
    if (r.length < 7 || /\d/.test(r)) return null;  // en palabras cortas un cambio de letra es otra palabra («camión», «camino»)
    const max = r.length >= 9 ? 2 : 1;
    let mejor = null;
    df.forEach((n, v) => {
      if (v[0] !== r[0]) return;
      const dist = distancia(r, v, max);
      if (dist <= max && (!mejor || dist < mejor.dist || (dist === mejor.dist && n > mejor.n))) mejor = { v, dist, n };
    });
    return mejor?.v || null;
  };

  /* Qué pregunta la persona: sus palabras con peso («terminos»), más las que sugiere una frase o un lugar («extra») */
  const entender = (q) => {
    let llano = ` ${plano(q).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
    const lugar = reLugar?.exec(llano)?.[1] || '';
    if (lugar) llano = llano.replace(reLugar, ' ');
    const terminos = [];
    const extra = new Set();
    palabras(llano).forEach((w) => {
      const exp = SIN.filter((s) => s.palabras.has(w)).flatMap((s) => s.exp);
      if (STOP.has(w)) { exp.forEach((e) => extra.add(e)); return; }
      const t = { w, r: raiz(w), alt: exp };
      if (!df.has(t.r) && !exp.length) t.r = cercana(t.r) || t.r;
      if (!terminos.some((x) => x.r === t.r)) terminos.push(t);
    });
    SIN.forEach((s) => { if (s.frases.some((f) => llano.includes(` ${f} `))) s.exp.forEach((e) => extra.add(e)); });
    if (lugar) palabras('region metropolitana retiros').map(raiz).forEach((e) => extra.add(e));
    terminos.forEach((t) => { t.imp = df.has(t.r) ? idf(t.r) : t.alt.length ? Math.max(1, ...t.alt.map(idf)) * .8 : IDF_MAX; });
    return { llano, terminos, extra: [...extra], lugar };
  };
  /* Pasajes ordenados por cuánto calzan. «cubre» es la parte de la pregunta que el pasaje efectivamente toca (0 a 1) */
  const PRIMERO = { principal: 1.2, vista: 1.05, norma: .9, categoria: .9 };  // ante la duda, primero lo que dice la página
  const buscar = (c) => {
    const total = c.terminos.reduce((a, t) => a + t.imp, 0);
    const dichas = new Set(c.terminos.map((t) => t.r));
    const central = [...c.terminos].sort((a, b) => b.imp - a.imp)[0]?.r;  // la palabra que más distingue la pregunta
    const orden = pasajes.map((p) => {
      let puntos = 0;
      let tocado = 0;
      c.terminos.forEach((t) => {
        const s = bm(p, t.r) + t.alt.reduce((a, x) => a + .4 * bm(p, x), 0);
        if (s > 0) { puntos += s; tocado += t.imp; }
      });
      const porExtra = c.extra.reduce((a, e) => a + .5 * bm(p, e), 0);
      /* Si la pregunta repite casi todo el título de un pasaje, ese es el pasaje */
      const iguales = [...p.tit].filter((x) => dichas.has(x)).length;
      const porTitulo = iguales >= 2 && p.tipo !== 'categoria' && p.tit.has(central) ? 8 * iguales * iguales / (p.tit.size * dichas.size) : 0;
      let alias = 0;
      (p.alias || []).forEach(([re, peso]) => { if (re.test(c.llano)) alias = Math.max(alias, peso); });
      const cubre = alias >= 3 ? 1 : Math.max(alias === 2 ? .7 : 0, total ? tocado / total : porExtra ? 1 : 0);
      const previo = alias >= 3 ? 1 : PRIMERO[p.tipo] || 1;
      return { p, alias, cubre, f: (puntos + porExtra + porTitulo + (alias >= 3 ? 14 : alias === 2 ? 4 : alias)) * (.35 + .65 * cubre) * previo };
    }).filter((r) => r.f > 0).sort((a, b) => b.f - a.f);
    /* Si gana una norma o una categoría y la página trata lo mismo en un título, primero va la página */
    const propias = c.terminos.filter((t) => (df.get(t.r) || 0) <= N * .15).map((t) => t.r);
    const i = orden.findIndex((r) => r.p.tipo === 'principal' && propias.some((x) => r.p.tit.has(x)));
    if (i > 0 && orden[0].alias < 3 && ['norma', 'categoria'].includes(orden[0].p.tipo) && orden[i].f >= orden[0].f * .6) orden.unshift(...orden.splice(i, 1));
    return orden;
  };

  /* ---------- Respuestas ---------- */
  const ENTRADA = {
    principal: 'Esto dice la página:', guia: 'Esto dice la guía de ayuda del sitio:', ayuda: 'Esto está en «Ayuda», en el sitio:', norma: 'Esto publica el sitio sobre esa norma:',
    articulo: 'Este es el texto que publica el sitio:', categoria: 'En el formulario de cotización del sitio aparece esto:', vista: 'Eso se resuelve en el propio sitio:'
  };
  let ultimaNorma = null;  // para entender «¿y el artículo 42?» después de hablar de una norma
  const guiaDe = (p) => pasajes.find((x) => x.familia === p.familia && x.siguientes);
  const chipDe = (p) => (p.tipo === 'guia' ? guiaDe(p) : p.titulo ? p : resumenDe(p));
  const relacionados = (orden, fuera, corte) => {
    const vistos = new Set(fuera);
    const lista = [];
    const piso = (orden[0]?.cubre || 0) * .5;
    orden.forEach((r) => {
      const p = chipDe(r.p);
      if (lista.length >= 3 || !p || r.f < corte || r.cubre < piso || vistos.has(p.familia) || vistos.has(p.id)) return;
      vistos.add(p.familia).add(p.id);
      lista.push(p);
    });
    return lista;
  };
  /* Arma la respuesta con el mejor pasaje y los de su misma sección que también calzan */
  const conBusqueda = (orden, entrada) => {
    const top = orden[0];
    const resumen = resumenDe(top.p);
    const hermanos = orden.filter((r) => r.p.grupo === top.p.grupo && !r.p.resumen && r.f >= top.f * .6 && r.cubre >= top.cubre * .8);
    const delGrupo = pasajes.filter((p) => p.grupo === top.p.grupo && !p.resumen).length;
    let bloques = hermanos.slice(0, 4).map((r) => r.p).sort((a, b) => a.id - b.id);
    if (top.p.resumen) bloques = [top.p];
    else if (resumen && hermanos.length >= 3 && delGrupo <= 8) bloques = [resumen];
    const partes = [entrada || ENTRADA[bloques[0].tipo], tarjeta(bloques)];
    /* Una categoría del formulario no dice si se retira: se acompaña con lo que la página dice al respecto */
    if (bloques[0].tipo === 'categoria') {
      const faq = pasajes.find((p) => p.pregunta && /retiran/.test(plano(p.titulo)));
      if (faq) partes.push('Que esté en el formulario no confirma el retiro. Sobre eso, la página dice:', tarjeta([faq]));
    }
    const norma = bloques.find((p) => p.norma);
    if (norma) ultimaNorma = norma.norma;
    const sigue = bloques.length === 1 && bloques[0].siguientes?.length ? bloques[0] : null;
    const guia = top.p.tipo === 'guia' ? guiaDe(top.p) : null;
    const padre = guia && !bloques.includes(guia) ? guia : resumen && !bloques.includes(resumen) ? resumen : null;
    const chips = sigue ? sigue.siguientes : [padre, ...relacionados(orden, [top.p.familia, ...bloques.map((p) => p.id)], top.f * .35)].filter(Boolean).slice(0, 3);
    return { partes, chips, rotuloChips: sigue?.rotuloSiguientes };
  };
  const conPasaje = (p) => conBusqueda([{ p, f: 1, cubre: 1 }]);
  const conArticulo = async (n, id) => {
    const a = await articulo(n, id);
    if (!a) return { partes: [`No encontré ese artículo en el texto del ${n.corto} que publica el sitio.`], chips: [pasajes.find((p) => p.norma === n)].filter(Boolean) };
    ultimaNorma = n;
    return { partes: [ENTRADA.articulo, tarjeta([a])], chips: [pasajes.find((p) => p.norma === n)].filter(Boolean), rotuloChips: 'Sobre la norma' };
  };
  const sobreMi = () => ({
    partes: [
      'Busco en lo que ya está publicado en este sitio y te lo muestro tal como está, con su fuente. No cotizo, no tomo solicitudes y no reemplazo a un especialista.',
      h('article', { class: 'cita' }, h('div', { class: 'cita-bloque' }, h('h3', { class: 'cita-titulo', text: 'De dónde salen las respuestas' }), h('ul', { class: 'cita-lista' }, fuentes.map((f) => h('li', {}, h('strong', { text: f.fuerte }), ' ', f.texto)))))
    ],
    chips: inicio()
  });
  const sinRespuesta = (c, orden) => {
    const faltan = c.terminos.filter((t) => !df.has(t.r) && !t.alt.length).map((t) => `«${t.w}»`);
    const cerca = relacionados(orden.filter((r) => r.cubre >= .15), [], 0);
    return {
      partes: [`No encontré eso en lo publicado en el sitio${faltan.length ? ` (no aparece ${faltan.slice(0, 3).join(', ')})` : ''}. Solo puedo mostrarte lo que está ahí.`],
      chips: cerca.length ? cerca : inicio(), rotuloChips: cerca.length ? 'Lo más cercano en el sitio' : 'Puedes preguntar por',
      acciones: vistas.especialista ? [vistas.especialista] : []
    };
  };
  const inicio = () => {
    const faq = pasajes.filter((p) => p.pregunta);
    const guias = pasajes.filter((p) => p.siguientes);
    return [pasajes.find((p) => p.grupo === 'planes' && p.resumen), faq[3] || faq[0], guias.find((g) => /autorizaci/i.test(g.titulo)) || guias[0], faq[2], pasajes.find((p) => p.grupo === 'normativa')].filter(Boolean);
  };

  const RE_ART = /\bart(?:iculo|\.)?s?\s*(\d+)\s*(bis|ter|quater)?\b/;
  const RE_SALUDO = /^ (hola|holi|buenas|buenos dias|buen dia|buenas tardes|buenas noches|hey|alo|saludos)\b/;
  const RE_GRACIAS = /\b(gracias|vale|ok|okey|perfecto|listo|genial|chao|adios|hasta luego)\b/;
  const RE_MI = /\b(quien eres|que eres|eres (un |una )?(ia|robot|bot|persona|humano|maquina)|inteligencia artificial|como funcionas|como respondes|de donde (sacas|sale|salen|obtienes)|(que|cuales son tus|tus) fuentes|que puedes hacer|que sabes|en que (me )?(puedes )?ayuda[rs]?|para que sirves)\b/;
  const RE_PEDIR = /\b(cotiz\w*|presupuesto|agend\w*|reserv\w*|solicit(ar|o|a|ud)|(quiero|necesito|pedir|programar|coordinar|hacer) (un |el |que |pedir |hacer )*(retir\w*|arriend\w*)|vengan a (retirar|buscar)|retiren|me retiran)\b/;

  /* Devuelve qué decir: { partes: [texto | tarjeta], chips, rotuloChips, acciones } */
  const responder = async (q) => {
    const c = entender(q);
    const art = RE_ART.exec(c.llano);
    const orden = buscar(c);
    if (art) {
      const n = orden.find((r) => r.alias >= 2)?.p.norma || ultimaNorma;
      if (n) return conArticulo(n, `art-${art[1]}${art[2] ? `-${art[2]}` : ''}`);
      const todas = pasajes.find((p) => p.grupo === 'normativa');
      return { partes: ['Dime de qué norma, por ejemplo «artículo 36 del D.S. 148». El sitio publica estas:', todas ? tarjeta([todas]) : null].filter(Boolean) };
    }
    if (RE_MI.test(c.llano)) return sobreMi();
    if (!c.terminos.length && !c.extra.length) {
      if (RE_SALUDO.test(c.llano)) return { partes: ['Hola. Pregúntame por retiros, planes, documentos o normativa.'], chips: inicio(), rotuloChips: 'Por ejemplo' };
      if (RE_GRACIAS.test(c.llano)) return { partes: ['De nada. Si te queda otra duda, pregúntame.'] };
      return { partes: ['¿Sobre qué quieres saber? Puedo mostrarte lo que dice el sitio de estos temas:'], chips: inicio(), rotuloChips: 'Temas' };
    }
    if (RE_PEDIR.test(c.llano) && vistas.cotizar) {
      return { partes: ['Por ahora solo informo: no cotizo ni tomo solicitudes. Para eso el sitio tiene su formulario:', tarjeta([vistas.cotizar])], chips: relacionados(orden.filter((r) => r.cubre >= .4), [vistas.cotizar.familia], (orden[0]?.f || 0) * .5), rotuloChips: 'Sobre lo que preguntas' };
    }
    const top = orden[0];
    if (!top || top.cubre < .4) return sinRespuesta(c, orden);
    return conBusqueda(orden, top.cubre < .6 ? 'No encontré todo lo que preguntas. Esto es lo más cercano que publica el sitio:' : '');
  };

  /* ---------- Cómo se muestra ---------- */
  const enlace = (e) => {
    if (e.sitio && marco) return h('a', { href: e.href, onclick: (ev) => { if (ev.metaKey || ev.ctrlKey || ev.shiftKey) return; ev.preventDefault(); mostrar({ pagina: e.href, abre: true, hash: '' }); } }, e.rotulo, h('span', { icono: I.ir }));
    if (e.sitio) e = { ...e, href: new URL(e.href, BASE).href, externo: true };  // otra página del sitio: en otra pestaña
    return h('a', { href: e.href, target: e.externo ? '_blank' : null, rel: e.externo ? 'noopener noreferrer' : null, download: e.descarga || null }, e.descarga ? h('span', { icono: I.bajar }) : null, e.rotulo, e.externo ? h('span', { icono: I.fuera }) : null, e.externo ? h('span', { class: 'sr-only', text: ' (se abre en otra pestaña)' }) : null);
  };
  /* Cita legal de una guía: al tocarla, el agente muestra ese artículo tal como lo publica el sitio */
  const cita = (r) => {
    const n = pasajes.find((p) => p.norma && p.norma.pagina === r.pagina)?.norma;
    if (!n || !r.hash) return h('span', { class: 'ref', text: r.texto });
    const id = r.hash.slice(1);
    return h('button', { class: 'ref', type: 'button', text: r.texto, 'aria-label': `Leer ${r.texto}`, onclick: () => preguntar(`${n.corto}, artículo ${id.replace('art-', '').replace('-', ' ')}`, () => conArticulo(n, id)) });
  };
  const citas = (lista) => (lista?.length ? h('span', { class: 'refs' }, lista.map(cita)) : null);
  const bloque = (p) => {
    const b = h('div', { class: 'cita-bloque' });
    if (p.titulo) b.append(h('h3', { class: 'cita-titulo', text: p.titulo }));
    if (p.sub) b.append(h('p', { class: 'cita-sub', text: p.sub }));
    (p.parrafos || []).forEach((t) => b.append(h('p', { class: p.titulo ? null : 'cita-punto' }, t, p.titulo ? null : citas(p.refs))));
    if (p.datos?.length) b.append(h('dl', { class: 'cita-datos' }, p.datos.map(([k, v]) => h('div', {}, h('dt', { text: k }), h('dd', { text: v })))));
    (p.listas || []).forEach((l) => {
      if (l.titulo) b.append(h('p', { class: 'cita-lista-t', text: l.titulo }));
      /* Nombre y texto: en la misma línea si el texto es corto («D.S. 148/2003 · Residuos peligrosos»); si no, el nombre va arriba */
      const largo = (i) => i.fuerte && (i.texto || '').length > 48;
      b.append(h(l.orden ? 'ol' : 'ul', { class: 'cita-lista' }, l.items.map((i) => h('li', { class: largo(i) ? 'is-largo' : null },
        i.pasaje ? h('button', { class: 'cita-item', type: 'button', onclick: () => preguntar(i.pasaje.titulo, () => conPasaje(i.pasaje)) }, h('strong', { text: i.fuerte }), ' · ', i.texto) : [i.fuerte ? h('strong', { text: i.fuerte }) : null, i.fuerte && i.texto && !largo(i) ? ' · ' : null, i.texto || null],
        citas(i.refs)))));
    });
    if (p.cita) b.append(h('blockquote', { class: 'cita-oficial' }, h('p', { text: p.cita.texto }), h('footer', { text: p.cita.rotulo })));
    if (p.titulo && p.refs?.length) b.append(h('p', { class: 'cita-refs' }, citas(p.refs)));
    if (p.nota) b.append(h('p', { class: 'cita-nota', text: p.nota }));
    if (p.enlaces?.length) b.append(h('p', { class: 'cita-enlaces' }, p.enlaces.map(enlace)));
    return b;
  };
  /* Una tarjeta = uno o más pasajes de la misma sección, tal cual, y al pie su fuente */
  const tarjeta = (bloques) => {
    const p = bloques[0];
    const f = bloques.length > 1 && p.fuente.selGrupo ? { ...p.fuente, sel: p.fuente.selGrupo } : p.fuente;
    const otra = !marco && f.pagina !== AQUI;  // está en otra página del sitio: se abre en otra pestaña y la conversación sigue aquí
    const ver = h('a', { class: 'cita-ver', href: new URL(f.pagina + (f.hash || ''), BASE).href, target: otra ? '_blank' : null, rel: otra ? 'noopener' : null, onclick: (e) => { if (otra || e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); mostrar(f); } },
      otra ? 'Ver en su página' : f.abre ? 'Abrir en el sitio' : 'Ver en la página', h('span', { icono: otra ? I.fuera : I.ir }), otra ? h('span', { class: 'sr-only', text: ' (se abre en otra pestaña)' }) : null);
    return h('article', { class: 'cita' },
      p.encabezado ? h('p', { class: 'cita-cab', text: p.encabezado }) : null,
      bloques.map(bloque),
      h('footer', { class: 'cita-fuente' },
        h('p', { class: 'cita-origen' }, h('span', { icono: I.doc }), h('span', {}, h('span', { class: 'cita-origen-l', text: 'Fuente: ' }), f.etiqueta)), ver,
        p.oficial ? h('p', { class: 'cita-ley' }, `Fuente oficial, consultada el ${fecha(p.oficial.consulta)}: `, h('a', { href: p.oficial.href, target: '_blank', rel: 'noopener noreferrer' }, p.oficial.etiqueta, h('span', { icono: I.fuera }), h('span', { class: 'sr-only', text: ' (se abre en otra pestaña)' }))) : null));
  };
  const abajo = () => charla.scrollTo({ top: charla.scrollHeight, behavior: suave() });
  const decir = (r) => {
    const m = h('div', { class: 'msg is-bot' });
    r.partes.forEach((x) => m.append(typeof x === 'string' ? h('p', { class: 'msg-texto', text: x }) : x));
    if (r.acciones?.length) m.append(h('div', { class: 'msg-acciones' }, r.acciones.map((p) => h('button', { class: 'btn btn-secondary btn-small', type: 'button', onclick: () => mostrar(p.fuente) }, p.titulo))));
    if (r.chips?.length) m.append(h('div', { class: 'msg-chips' }, h('p', { class: 'msg-chips-t', text: r.rotuloChips || 'También en el sitio' }), r.chips.map((p) => h('button', { class: 'chip', type: 'button', text: p.titulo, onclick: () => preguntar(p.titulo, () => conPasaje(p)) }))));
    charla.append(m);
    return m;
  };
  let ocupado = false;
  /* «directo» es una respuesta ya decidida (un chip o una cita): no pasa por la búsqueda */
  const preguntar = async (q, directo) => {
    const pregunta = limpio(q);
    if (!pregunta || ocupado) return;
    ocupado = true;
    charla.append(h('div', { class: 'msg is-user' }, h('p', { text: pregunta })));
    const espera = h('div', { class: 'msg is-bot is-espera', 'aria-hidden': 'true' }, h('span', {}), h('span', {}), h('span', {}));
    charla.append(espera);
    abajo();
    let r;
    try {
      await Promise.all([cargar(), pausa(motion.matches ? 380 : 0)]);
      r = await (directo ? directo() : responder(pregunta));
    } catch (e) {
      console.warn('Agente:', e);
      r = { partes: ['No pude leer el sitio en este momento. Vuelve a intentarlo en un rato.'] };
    }
    espera.remove();
    const m = decir(r);
    charla.scrollTo({ top: (m.previousElementSibling || m).offsetTop - 12, behavior: suave() });  // desde la pregunta que la originó
    ocupado = false;
  };

  /* ---------- Lectura del sitio (una vez) ---------- */
  let listo = null;
  const cargar = () => {
    if (listo) return listo;
    listo = (async () => {
      const info = leerPrincipal(await pagina(PRINCIPAL));
      const guias = await Promise.all(info.guias.map((g) => pagina(g).then((doc) => leerGuia(doc, g)).catch(() => null)));
      const leidasOk = guias.filter(Boolean);
      if (leidasOk.length) fuentes.push({ fuerte: `Guías rápidas (${leidasOk.length})`, texto: `${leidasOk.map((g) => g.titulo).join(' · ')}` });
      if (info.normas) await pedir(info.normas).then((r) => r.json()).then((j) => leerNormas(j, info.biblioteca)).catch(() => null);
      intento(leerCategorias);
      indexar();
      lugares();
    })();
    listo.catch(() => { listo = null; fuentes = []; pasajes.length = 0; });
    return listo;
  };
  let saludado = false;
  const saludar = async () => {
    if (saludado) return;
    saludado = true;
    const espera = h('div', { class: 'msg is-bot is-espera', 'aria-hidden': 'true' }, h('span', {}), h('span', {}), h('span', {}));
    charla.append(espera);
    try {
      await cargar();
      espera.remove();
      decir({ partes: ['Hola. ¿En qué te ayudo?'], chips: inicio(), rotuloChips: 'Puedes preguntar, por ejemplo' });
    } catch {
      espera.remove();
      saludado = false;
      decir({ partes: ['No pude leer el sitio en este momento. Cierra el agente y vuelve a abrirlo en un rato.'] });
    }
  };

  /* ---------- El sitio: la propia página o, en agente-virtual.html, la que se ve detrás ---------- */
  const ventana = () => (marco ? marco.contentWindow : window);
  const enSitio = () => { try { return ventana().location.href.slice(BASE.length).split(/[?#]/)[0]; } catch { return null; } };
  const ir = (url) => new Promise((ok) => {
    const fin = () => { marco.removeEventListener('load', fin); ok(); };
    marco.addEventListener('load', fin);
    setTimeout(fin, 6000);
    marco.contentWindow.location.href = url;
  });
  /* Muestra en el sitio de dónde salió una respuesta: abre lo que esté plegado y destaca el pasaje */
  const mostrar = async (f) => {
    const actual = enSitio();
    const url = new URL(f.pagina + (f.hash || ''), BASE).href;
    if (actual === null || (!marco && actual !== f.pagina)) { open(url, '_blank', 'noopener'); return; }
    cerrar();
    const win = ventana();
    if (f.abre) {  // una vista del sitio: el formulario, el buscador, el especialista o el panel de ayuda
      const vista = (f.hash || '').slice(1);
      if (actual !== f.pagina) await ir(url);
      else if (vista in vistas && win.HERO) win.HERO.show(vista, { from: 'dock' });  // donde está la persona, como desde la burbuja «?»
      else if (f.hash) win.location.hash = f.hash;
      return;
    }
    const propio = f.pagina.startsWith('normativa/') && f.hash;  // la página de la norma ya destaca el artículo al llegar
    if (actual !== f.pagina) await ir(url);
    const el = f.sel && win.document.querySelector(f.sel);
    if (!el || (propio && actual !== f.pagina)) return;
    const plegado = el.closest('details') || (el.matches('details') ? el : null);
    if (plegado) plegado.open = true;
    el.querySelectorAll('[data-toggle][aria-expanded="false"]').forEach((b) => b.click());
    await pausa(60);
    el.scrollIntoView({ behavior: suave(), block: 'center' });
    /* Mismo amarillo con que el sitio marca lo buscado */
    el.animate([{ outline: '3px solid #f5b400', outlineOffset: '6px' }, { outline: '3px solid #f5b400', outlineOffset: '6px', offset: .75 }, { outline: '3px solid rgb(245 180 0 / 0)', outlineOffset: '6px' }], { duration: 3600, easing: 'ease-out' });
  };

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
    saludar();
    if (!tactil.matches) campo.focus({ preventScroll: true });
  };
  function cerrar() {
    if (!abierto() || panel.classList.contains('is-saliendo')) return;
    const dentro = panel.contains(d.activeElement);
    const fin = () => { panel.classList.remove('is-saliendo'); panel.hidden = true; seguir(); };
    boton.setAttribute('aria-expanded', 'false');
    if (enDock) marcarDock(false);
    else {
      boton.classList.remove('is-abierto');
      boton.setAttribute('aria-label', 'Abrir el asistente');
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
  panel.querySelector('[data-agente-nuevo]').addEventListener('click', () => { charla.textContent = ''; saludado = false; ultimaNorma = null; saludar(); });
  form.addEventListener('submit', (e) => { e.preventDefault(); const q = campo.value; campo.value = ''; preguntar(q); });

  /* Cuándo se ve la burbuja. En la página aparece y se oculta junto con la «?» del sitio (al pasar el hero, no sobre
     el pie ni con el menú abierto): así la primera pantalla queda como está. Con la ventana abierta no se oculta. */
  const dock = marco || enDock ? null : d.querySelector('[data-dock]');
  function seguir() { if (dock) boton.classList.toggle('is-aparte', !dock.classList.contains('is-visible') && !abierto()); }
  if (dock) new MutationObserver(seguir).observe(dock, { attributes: true, attributeFilter: ['class'] });
  seguir();
  /* En agente-virtual.html: la página de atrás trae su propia burbuja del agente (manda la de la maqueta), y la burbuja
     se aparta cuando esa página abre una ventana o una hoja, para no tapar sus botones */
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
      const abajo = vv.scale > 1.01 ? 0 : Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
      panel.style.setProperty('--vv-alto', `${Math.round(vv.height)}px`);
      panel.style.setProperty('--vv-abajo', `${abajo}px`);
      panel.classList.toggle('is-teclado', abajo > 80 && panel.contains(d.activeElement));
    };
    vv.addEventListener('resize', ajustar);
    vv.addEventListener('scroll', ajustar);
    panel.addEventListener('focusin', ajustar);
    panel.addEventListener('focusout', () => setTimeout(ajustar, 0));
    ajustar();
  }

  /* El sitio se lee cuando la página queda libre: la primera respuesta no espera */
  (window.requestIdleCallback || ((f) => setTimeout(f, 600)))(() => cargar().catch(() => {}));
  window.AGENTE = { abrir, cerrar, preguntar, responder, cargar, buscar: (q) => buscar(entender(q)), get pasajes() { return pasajes; } };
})();
