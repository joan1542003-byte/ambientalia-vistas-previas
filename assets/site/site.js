/* Comportamiento compartido de los tres sitios. */
(() => {
  const d = document;
  const WHATSAPP = '56986067930';
  const motion = matchMedia('(prefers-reduced-motion: no-preference)');
  const smooth = () => (motion.matches ? 'smooth' : 'auto');
  window.SITE = {
    /* Íconos de los canales de envío, para los botones que arma el código (el de WhatsApp es el de la marca) */
    ICON: {
      wa: '<svg class="wa-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>',
      mail: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>'
    },
    whatsapp: (text) => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`,
    /* Correo con el mismo texto (sin los asteriscos de WhatsApp). La primera línea es el asunto. */
    mailto: (to, text) => {
      const [subject, ...rest] = text.replaceAll('*', '').split('\n');
      return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(rest.join('\n').trim())}`;
    }
  };

  /* Dirección del asistente de Transporte Autorizado (servicio Laravel, repositorio aparte), que recibe las cotizaciones
     de Transporte. Una por entorno, sin direcciones fijas en la página publicada:
     - WordPress (pruebas o producción): la deja el plugin en window.TA_API.asistente («Ajustes del sitio») y la suma
       a la política de contenido.
     - Otro alojamiento estático: el atributo de la página (data-cotizar-api en el formulario), con https.
     - Este computador: ?asistente=http://127.0.0.1:8000 la fija para la pestaña y ?asistente= la quita. Solo en
       localhost: en el sitio publicado un enlace no puede desviar a otra dirección los datos de quien escribe.
     Devuelve la dirección sin barra final, o '' si no hay ninguna válida (el envío en línea no está disponible). */
  const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  window.SITE.asistente = (atributo = '') => {
    let local = '';
    if (LOCAL) {
      const pedida = new URLSearchParams(location.search).get('asistente');
      try {
        if (pedida !== null) { if (pedida) sessionStorage.setItem('ta-asistente', pedida); else sessionStorage.removeItem('ta-asistente'); }
        local = sessionStorage.getItem('ta-asistente') || '';
      } catch { local = pedida || ''; }
    }
    try {
      const u = new URL(local || window.TA_API?.asistente || atributo);
      if (u.protocol !== 'https:' && !(LOCAL && u.protocol === 'http:')) return '';
      return (u.origin + u.pathname).replace(/\/+$/, '');
    } catch { return ''; }
  };

  /* Ahorro de batería (pedido del 22-10-2026: con él, el chat en el teléfono oscurece el fondo en vez de desenfocarlo).
     No hay una señal directa: se infiere si el sistema pide menos transparencia, si la batería está baja y sin cargar
     (donde el navegador la informa) o si la pantalla va a 30 cuadros por segundo, como en el modo de bajo consumo del
     iPhone. Deja la clase .ta-ahorro en <html>. */
  {
    const raiz = d.documentElement;
    const pide = matchMedia('(prefers-reduced-transparency: reduce)');
    let bateria = false;
    let cuadros = false;
    const marcar = () => raiz.classList.toggle('ta-ahorro', pide.matches || bateria || cuadros);
    pide.addEventListener?.('change', marcar);
    navigator.getBattery?.().then((b) => {
      const ver = () => { bateria = !b.charging && b.level <= 0.2; marcar(); };
      b.addEventListener('levelchange', ver);
      b.addEventListener('chargingchange', ver);
      ver();
    }).catch(() => {});
    /* 20 cuadros con la página quieta y a la vista: a 30 por segundo cada uno dura unos 33 ms (a 60 o 120, 17 u 8) */
    const medir = () => {
      if (d.visibilityState !== 'visible') { d.addEventListener('visibilitychange', medir, { once: true }); return; }
      const t = [];
      const paso = (ahora) => {
        t.push(ahora);
        if (t.length < 21) { requestAnimationFrame(paso); return; }
        const pasos = t.slice(1).map((x, i) => x - t[i]).sort((a, b) => a - b);
        cuadros = pasos[10] > 26;
        marcar();
      };
      requestAnimationFrame(paso);
    };
    const luego = () => setTimeout(medir, 1500);
    if (d.readyState === 'complete') luego(); else addEventListener('load', luego, { once: true });
    marcar();
  }

  /* Envío al servidor. Solo existe cuando el sitio corre sobre WordPress: el plugin deja window.TA_API con la dirección
     de su servicio, que guarda la solicitud, le pone número y envía los correos. Sin eso (vista previa estática), la
     solicitud se sigue enviando por WhatsApp. El servicio pide un permiso con hora: se solicita al mostrar el resumen
     y vale desde un par de segundos después. */
  if (window.TA_API?.url) {
    let permiso = null;
    const espera = (ms) => new Promise((listo) => setTimeout(listo, ms));
    /* La dirección del servicio puede traer su propia consulta (WordPress sin enlaces permanentes): lo que se agrega va con & */
    const ruta = (r) => { const base = window.TA_API.url; return base + (base.includes('?') ? r.replace('?', '&') : r); };
    const pide = async (r) => {
      const res = await fetch(ruta(r), { credentials: 'omit', cache: 'no-store' });
      const datos = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(datos.message || 'No pudimos enviar la solicitud.');
      return datos;
    };
    /* La solicitud sube con XMLHttpRequest, que informa cuánto va (fetch no): con fotografías se ve el avance */
    const sube = (r, cuerpo, avance) => new Promise((listo, falla) => {
      const x = new XMLHttpRequest();
      x.open('POST', ruta(r));
      x.responseType = 'json';
      x.timeout = 90000;
      x.upload.onprogress = (e) => { if (e.lengthComputable) avance?.(e.loaded / e.total); };
      x.onload = () => {
        const datos = x.response || {};
        if (x.status >= 200 && x.status < 300) listo(datos); else falla(new Error(datos.message || 'No pudimos enviar la solicitud.'));
      };
      x.onerror = x.ontimeout = () => falla(new Error('No hay conexión con el servidor. Inténtalo de nuevo.'));
      x.send(cuerpo);
    });
    window.SITE.permiso = () => {
      if (!permiso || Date.now() - permiso.hora > 3 * 3600e3) permiso = { hora: Date.now(), dato: pide(`permiso?t=${Date.now()}`).catch(() => null) };
      return permiso;
    };
    /* enviar(solicitud, { fotos: [Blob…], avance: (fracción subida) => … }) → { numero, correo, fotos } */
    window.SITE.enviar = async (solicitud, { fotos = [], avance } = {}) => {
      let p = window.SITE.permiso();
      let dato = await p.dato;
      if (!dato) { permiso = null; p = window.SITE.permiso(); dato = await p.dato; }
      if (!dato) throw new Error('No hay conexión con el servidor. Inténtalo de nuevo.');
      const falta = 2500 - (Date.now() - p.hora);
      if (falta > 0) await espera(falta);
      permiso = null;  // cada permiso sirve una vez
      const cuerpo = new FormData();
      cuerpo.append('datos', JSON.stringify({ ...solicitud, permiso: dato.permiso, sitio: '' }));
      fotos.forEach((foto, i) => cuerpo.append('fotos[]', foto, `foto-${i + 1}.jpg`));
      return sube('solicitudes', cuerpo, avance);
    };

    /* Lo que se le dice a la persona cuando la solicitud quedó enviada (respuesta del servidor, fotografías que adjuntó) */
    window.SITE.enviada = (r, adjuntas = 0) => {
      const numero = `Tu número de solicitud es ${r.numero}.`;
      if (!r.correo) return `${numero} Guárdalo: no pudimos enviarte el correo de confirmación.`;
      const recibidas = r.fotos || 0;
      if (adjuntas && recibidas < adjuntas) return `${numero} Te enviamos un correo con el detalle. No pudimos recibir ${recibidas ? 'todas las fotografías' : 'las fotografías'}: respóndelo con ellas.`;
      if (adjuntas) return `${numero} Te enviamos un correo con el detalle y recibimos ${recibidas === 1 ? 'tu fotografía' : `tus ${recibidas} fotografías`}.`;
      return `${numero} Te enviamos un correo con el detalle: si tienes fotografías del residuo o del lugar, respóndelo con ellas.`;
    };

    /* Fotografías adjuntas. Cada imagen se reduce en el navegador antes de subir: pesa menos, sube rápido desde el
       teléfono y sale sin los datos de la cámara (la ubicación entre ellos). El servidor las vuelve a revisar. */
    const FOTOS_MAX = 6;
    const LADO = 1600;
    const ICONO = {
      camara: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>',
      quitar: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
      avion: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/></svg>',
      listo: '<svg width="56" height="56" class="summary-check" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="16"/><path d="M11 18.5l5 5 9-10"/></svg>'
    };
    const abrir = (file) => new Promise((ok, no) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); ok(img); };
      img.onerror = () => { URL.revokeObjectURL(url); no(new Error('No es una imagen')); };
      img.src = url;
    });
    const reducir = async (file) => {
      /* createImageBitmap respeta el giro que anota la cámara; si el navegador no lo tiene (o no acepta la opción), se abre como <img> */
      let origen;
      try { origen = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { origen = await abrir(file); }
      const ancho = origen.naturalWidth || origen.width;
      const alto = origen.naturalHeight || origen.height;
      if (!ancho || !alto) throw new Error('No es una imagen');
      const k = Math.min(1, LADO / Math.max(ancho, alto));
      const lienzo = d.createElement('canvas');
      lienzo.width = Math.max(1, Math.round(ancho * k));
      lienzo.height = Math.max(1, Math.round(alto * k));
      const ctx = lienzo.getContext('2d');
      ctx.fillStyle = '#fff';  // las imágenes con transparencia quedan sobre blanco
      ctx.fillRect(0, 0, lienzo.width, lienzo.height);
      ctx.drawImage(origen, 0, 0, lienzo.width, lienzo.height);
      origen.close?.();
      return new Promise((ok, no) => lienzo.toBlob((b) => (b ? ok(b) : no(new Error('No se pudo preparar la imagen'))), 'image/jpeg', .82));
    };
    /* Franja «Adjuntar fotografías» de un resumen. host: el elemento [data-fotos] (su contenido se arma aquí). */
    window.SITE.fotos = (host) => {
      host.innerHTML = `<div class="fotos-row"><button type="button" class="btn btn-secondary btn-small fotos-add" data-fotos-sumar>${ICONO.camara}<span>Adjuntar fotografías</span></button><ul class="fotos-list" data-fotos-lista aria-label="Fotografías adjuntas"></ul></div>
        <p class="fotos-hint" data-fotos-ayuda></p>
        <input type="file" accept="image/*" multiple hidden tabindex="-1" aria-hidden="true">`;
      const lista = host.querySelector('[data-fotos-lista]');
      const sumar = host.querySelector('[data-fotos-sumar]');
      const ayuda = host.querySelector('[data-fotos-ayuda]');
      const input = host.querySelector('input');
      let fotos = [];
      const pinta = () => {
        lista.innerHTML = fotos.map((f, i) => `<li><button type="button" class="fotos-item" data-fotos-quitar="${i}" aria-label="Quitar la fotografía ${i + 1}"><img src="${f.url}" alt="" width="48" height="48"><i aria-hidden="true">${ICONO.quitar}</i></button></li>`).join('');
        sumar.querySelector('span').textContent = fotos.length ? 'Agregar otra' : 'Adjuntar fotografías';
        sumar.hidden = fotos.length >= FOTOS_MAX;
        ayuda.textContent = fotos.length
          ? `${fotos.length} de ${FOTOS_MAX} fotografías. Toca una para quitarla.`
          : `Opcional: del residuo, su envase o el lugar donde está. Hasta ${FOTOS_MAX}.`;
        host.classList.toggle('has-fotos', fotos.length > 0);
      };
      sumar.addEventListener('click', () => input.click());
      input.addEventListener('change', async () => {
        const elegidas = [...input.files];
        input.value = '';
        const caben = elegidas.slice(0, FOTOS_MAX - fotos.length);
        if (!caben.length) return;
        host.classList.add('is-busy');
        sumar.disabled = true;
        let malas = 0;
        for (const file of caben) {
          try {
            if (!file.type.startsWith('image/')) throw new Error('No es una imagen');
            const blob = await reducir(file);
            fotos.push({ blob, url: URL.createObjectURL(blob) });
          } catch { malas += 1; }
        }
        host.classList.remove('is-busy');
        sumar.disabled = false;
        pinta();
        if (malas) window.SITE.toast(malas === 1 ? 'No pudimos leer una de las imágenes. Prueba con una fotografía en JPG o PNG.' : 'No pudimos leer algunas imágenes. Prueba con fotografías en JPG o PNG.');
        else if (elegidas.length > caben.length) window.SITE.toast(`Se pueden adjuntar hasta ${FOTOS_MAX} fotografías`);
      });
      lista.addEventListener('click', (e) => {
        const b = e.target.closest('[data-fotos-quitar]');
        if (!b || host.classList.contains('is-locked')) return;
        const [fuera] = fotos.splice(Number(b.dataset.fotosQuitar), 1);
        URL.revokeObjectURL(fuera.url);
        pinta();
        (lista.querySelector('button') || sumar).focus({ preventScroll: true });
      });
      pinta();
      return {
        blobs: () => fotos.map((f) => f.blob),
        /* Mientras se envía (o ya enviada) no se agregan ni se quitan */
        bloquear: (si) => { sumar.disabled = si; host.classList.toggle('is-locked', si); },
        vaciar: () => { fotos.forEach((f) => URL.revokeObjectURL(f.url)); fotos = []; pinta(); }
      };
    };

    /* Capa «Enviando…»: cubre `host` (desde el borde inferior de `desde`, si se indica) mientras la solicitud sube.
       paso(texto, fracción): con fracción el anillo muestra el avance; sin ella, gira. listo(texto): cierra con el visto. */
    window.SITE.enviando = (host, desde) => {
      const capa = d.createElement('div');
      capa.className = 'enviando';
      capa.setAttribute('role', 'status');
      capa.innerHTML = `<span class="enviando-anillo"><svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true"><circle class="pista" cx="36" cy="36" r="32"/><circle class="avance" cx="36" cy="36" r="32" pathLength="100"/></svg><i>${ICONO.avion}</i></span><p class="enviando-texto"></p>`;
      if (desde) capa.style.top = `${desde.offsetTop + desde.offsetHeight}px`;
      host.append(capa);
      const texto = capa.querySelector('.enviando-texto');
      const inicio = Date.now();
      return {
        paso: (mensaje, fraccion) => {
          if (texto.textContent !== mensaje) texto.textContent = mensaje;
          capa.classList.toggle('con-avance', fraccion != null);
          if (fraccion != null) capa.style.setProperty('--p', String(Math.round(fraccion * 100)));
        },
        /* El envío puede tardar menos de un segundo: la capa se queda lo justo para que se alcance a ver */
        listo: async (mensaje) => {
          await espera(Math.max(0, 900 - (Date.now() - inicio)));
          capa.querySelector('.enviando-anillo').outerHTML = ICONO.listo;
          capa.classList.add('is-lista');
          texto.textContent = mensaje;
          await espera(1300);
          capa.classList.add('is-saliendo');
          await espera(220);
          capa.remove();
        },
        quitar: () => capa.remove()
      };
    };
  }

  /* Aviso breve */
  const toast = d.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  d.body.append(toast);
  let toastTimer;
  window.SITE.toast = (text) => {
    /* Con una ventana modal abierta (hoja, panel o selector), el aviso va dentro de la última: si no, quedaría tapado */
    const host = [...d.querySelectorAll('dialog[open]')].pop() || d.body;
    if (toast.parentElement !== host) host.append(toast);
    toast.textContent = text;
    toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-on'), 2200);
  };
  /* Confirmación en el propio botón: el ícono pasa a ✓ y el texto a «Copiado» por un momento */
  window.SITE.done = (btn, text = 'Copiado') => {
    const target = btn.querySelector('span:not(.sr-only)');
    if (!target || btn.classList.contains('is-done')) return;
    const label = target.textContent;
    btn.classList.add('is-done'); target.textContent = text;
    setTimeout(() => { btn.classList.remove('is-done'); target.textContent = label; }, 1600);
  };

  /* Teclado en pantalla: mientras se escribe, las hojas inferiores se apoyan sobre él y se alinean con el área visible
     (--vv-top, --vv-bottom). Sin un campo de texto activo valen 0: así las ventanas nunca se corren por valores que el
     teléfono deja desactualizados (p. ej., tras cerrar el teclado o al mostrar u ocultar la barra del navegador). */
  const vv = window.visualViewport;
  if (vv) {
    const root = d.documentElement.style;
    const typing = () => d.activeElement?.matches?.('input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="button"]):not([type="submit"]), textarea');
    const sync = () => {
      if (!typing() || vv.scale > 1.01) {
        root.setProperty('--vv-top', '0px');
        root.setProperty('--vv-bottom', '0px');
        return;
      }
      root.setProperty('--vv-top', `${Math.max(0, Math.round(vv.offsetTop))}px`);
      root.setProperty('--vv-bottom', `${Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop))}px`);
    };
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    d.addEventListener('focusin', sync);
    d.addEventListener('focusout', () => setTimeout(sync, 0));
    sync();
  }

  /* Logo de Transporte: solo mientras el puntero está encima toma otro par de la paleta de la marca [oscuro, claro]
     (cada pasada, el siguiente); al salir vuelve a sus colores oficiales, que define el CSS. El único morado es el
     del logotipo oficial: el par lila con rosado no se usa (pedido del cliente, 15-10-2026) */
  const PARES = [['#0E14DA', '#A8DFFD'], ['#059A3F', '#D7F560'], ['#FF651C', '#FFE357'], ['#E90B2D', '#FEB5A7'], ['#000000', '#FFFFFF']];
  let par = -1;
  d.querySelectorAll('.logo-ta').forEach((logo) => {
    const zona = logo.closest('a') || logo;
    zona.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse') return;
      par = (par + 1) % PARES.length;
      logo.style.setProperty('--logo-a', PARES[par][0]);
      logo.style.setProperty('--logo-b', PARES[par][1]);
    });
    zona.addEventListener('pointerleave', () => { logo.style.removeProperty('--logo-a'); logo.style.removeProperty('--logo-b'); });
  });

  /* iOS solo aplica :active al tocar si la página escucha touchstart; el estado presionado reemplaza al resaltado gris */
  d.addEventListener('touchstart', () => {}, { passive: true });

  /* Header */
  const header = d.querySelector('.site-header');
  const onScroll = () => header?.classList.toggle('is-scrolled', scrollY > 4);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* Menú móvil */
  const toggle = d.querySelector('.menu-toggle');
  const nav = d.getElementById('nav');
  if (toggle && nav) {
    const setOpen = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
      nav.classList.toggle('is-open', open);
    };
    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    d.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('is-open')) { setOpen(false); toggle.focus(); } });
    matchMedia('(min-width: 861px)').addEventListener('change', () => setOpen(false));
  }

  /* Sección activa en la navegación */
  const navLinks = [...d.querySelectorAll('#nav a[href^="#"]:not(.btn)')];
  if ('IntersectionObserver' in window && navLinks.length) {
    const visible = new Set();
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id)));
      const current = navLinks.map((a) => a.hash.slice(1)).filter((id) => visible.has(id)).pop();
      navLinks.forEach((a) => (a.hash.slice(1) === current ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
    }, { rootMargin: '-45% 0px -50% 0px' });
    navLinks.forEach((a) => { const el = d.getElementById(a.hash.slice(1)); if (el) spy.observe(el); });
  }

  /* Animación al entrar en pantalla. Lo que ya se ve al cargar queda quieto y visible. */
  d.querySelectorAll('.reveal-group').forEach((g) => [...g.children].forEach((c, i) => c.style.setProperty('--i', Math.min(i, 6))));
  if ('IntersectionObserver' in window && motion.matches) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px 40px 0px' });
    d.querySelectorAll('.reveal, .reveal-group').forEach((el) => {
      if (el.getBoundingClientRect().top < innerHeight) return;
      io.observe(el);
    });
  }

  /* Acordeones con altura animada */
  d.querySelectorAll('.accordion details').forEach((det) => {
    const summary = det.querySelector('summary');
    let anim = null;
    summary.addEventListener('click', (e) => {
      if (!motion.matches || !det.animate) return;
      e.preventDefault();
      anim?.cancel();
      const closing = det.open;
      const start = det.offsetHeight;
      det.open = !closing;
      const end = det.offsetHeight;
      if (closing) det.open = true;
      det.classList.add('is-animating');
      det.classList.toggle('is-opening', !closing);
      anim = det.animate({ height: [`${start}px`, `${end}px`] }, { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)' });
      const done = () => { det.classList.remove('is-animating', 'is-opening'); anim = null; };
      anim.onfinish = () => { if (closing) det.open = false; done(); };
      anim.oncancel = done;
    });
  });

  /* Pestañas: radios dentro de [data-tabs] y paneles [data-tab-panel="valor"] */
  d.querySelectorAll('[data-tabs]').forEach((tabs) => {
    const panels = [...tabs.querySelectorAll('[data-tab-panel]')];
    const show = () => {
      const value = tabs.querySelector('input[type="radio"]:checked')?.value;
      panels.forEach((p) => { p.hidden = p.dataset.tabPanel !== value; });
    };
    tabs.addEventListener('change', (e) => { if (e.target.type === 'radio' && !e.target.closest('[data-tab-panel]')) show(); });
    show();
  });

  /* Campos condicionales: data-show-when="campo=valor1,valor2" */
  const conditionals = [...d.querySelectorAll('[data-show-when]')];
  const applyConditionals = () => conditionals.forEach((el) => {
    const [name, values] = el.dataset.showWhen.split('=');
    const field = d.querySelector(`[name="${name}"]:checked, select[name="${name}"], input[type="hidden"][name="${name}"]`);
    const on = values.split(',').includes(field?.value);
    el.hidden = !on;
    /* Dentro de un bloque condicional oculto, todo queda fuera del resumen aunque su propia condición se cumpla
       (los bloques se recorren en orden: el de afuera ya quedó resuelto) */
    const off = !on || Boolean(el.parentElement?.closest('[data-show-when][hidden]'));
    el.querySelectorAll('input, select, textarea').forEach((f) => { f.disabled = off; });
  });
  if (conditionals.length) d.addEventListener('change', applyConditionals);
  applyConditionals();

  /* Indicador que se desliza hacia la opción elegida en los controles segmentados */
  const glides = new Set();
  const placeGlide = (group, instant) => {
    const pill = group.querySelector(':scope > .glide');
    const on = group.querySelector('input:checked')?.closest('label');
    if (!pill) return;
    if (!on || !on.offsetWidth) { pill.style.opacity = '0'; return; }
    if (instant) pill.style.transition = 'none';
    pill.style.opacity = '1';
    pill.style.width = `${on.offsetWidth}px`;
    pill.style.height = `${on.offsetHeight}px`;
    pill.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
    if (instant) { void pill.offsetWidth; pill.style.transition = ''; }
  };
  const initGlide = (group) => {
    if (glides.has(group)) { placeGlide(group, true); return; }
    glides.add(group);
    const pill = d.createElement('i');
    pill.className = 'glide';
    pill.setAttribute('aria-hidden', 'true');
    group.prepend(pill);
    group.classList.add('has-glide');
    group.addEventListener('change', () => placeGlide(group));
    placeGlide(group, true);
  };
  const refreshGlides = () => d.querySelectorAll('.segmented').forEach(initGlide);
  refreshGlides();
  if ('ResizeObserver' in window) new ResizeObserver(() => glides.forEach((g) => placeGlide(g, true))).observe(d.body);
  window.SITE.refresh = () => { applyConditionals(); refreshGlides(); };

  /* Enlaces que preseleccionan campos: data-set="campo=valor;campo2=valor2" */
  d.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-set]');
    if (!trigger) return;
    trigger.dataset.set.split(';').forEach((pair) => {
      const [name, value] = pair.split('=');
      d.querySelectorAll(`[name="${name}"]`).forEach((field) => {
        if (field.type === 'radio' || field.type === 'checkbox') field.checked = field.value === value;
        else field.value = value;
        field.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
    const form = d.querySelector(trigger.getAttribute('href'))?.querySelector('form[data-steps]');
    form?.goTo?.(0);
  });

  /* Enlaces de WhatsApp con texto dinámico: data-wa="Texto con {#id-de-campo}" */
  d.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-wa]');
    if (!link) return;
    const text = link.dataset.wa.replace(/\{#([\w-]+)\}/g, (m, id) => {
      const f = d.getElementById(id);
      return f ? (f.tagName === 'SELECT' ? f.selectedOptions[0]?.textContent : f.value).trim() : '';
    });
    link.href = window.SITE.whatsapp(text);
  });

  /* Formularios que preparan un resumen para WhatsApp (con pasos opcionales: data-steps) */
  const labelFor = (field) => {
    if (field.dataset.label) return field.dataset.label;
    if (field.type === 'radio' || field.type === 'checkbox') return field.closest('fieldset, .field')?.querySelector('.label, legend')?.textContent.replace(/\(opcional\)/i, '').trim();
    return field.labels?.[0]?.textContent.replace(/\(opcional\)/i, '').trim() || field.name;
  };
  const valueOf = (field) => {
    if (field.type === 'hidden') return (field.dataset.text || field.value).trim();
    if (field.tagName === 'SELECT') return field.value === '' ? '' : field.selectedOptions[0]?.textContent.trim() || '';
    if (field.type === 'radio' || field.type === 'checkbox') {
      if (field.dataset.text) return field.dataset.text;
      const l = field.closest('label');
      return (l?.querySelector('strong') || l?.querySelector('span'))?.textContent.trim() || field.value;
    }
    if (field.type === 'date' && field.value) return field.value.split('-').reverse().join('-');
    if (field.dataset.suffix && field.value.trim()) {
      const unit = field.form?.querySelector(`[name="${field.dataset.suffix}"]:checked`);
      return `${field.value.trim()} ${unit ? valueOf(unit) : ''}`.trim();
    }
    return field.value.trim();
  };
  const validate = (scope) => {
    const fields = [...scope.querySelectorAll('input, select, textarea')].filter((f) => !f.disabled);
    fields.forEach((f) => {
      /* Una casilla obligatoria (p. ej., aceptar un aviso) dice qué falta: data-required-text */
      if (f.required && f.type === 'checkbox') f.setCustomValidity(f.checked ? '' : f.dataset.requiredText || 'Marca esta casilla para seguir.');
      else if (f.required && f.type !== 'radio') f.setCustomValidity(f.value.trim() ? '' : 'Completa este dato.');
    });
    /* Grupos de casillas que exigen al menos una opción: [data-required-group] */
    scope.querySelectorAll('[data-required-group]').forEach((g) => {
      const boxes = [...g.querySelectorAll('input')].filter((f) => !f.disabled);
      if (!boxes.length) return;
      const ok = boxes.some((f) => f.checked);
      boxes[0].setCustomValidity(ok ? '' : 'Elige al menos una opción.');
      g.toggleAttribute('data-invalid', !ok);
    });
    /* Campos que se eligen en una ventana: [data-required-pick="nombre-del-campo-oculto"] */
    const picks = [...scope.querySelectorAll('[data-required-pick]')].filter((p) => !p.closest('[data-show-when][hidden]'));
    const badPicks = picks.filter((p) => {
      const ok = Boolean(p.querySelector(`[name="${p.dataset.requiredPick}"]`)?.value.trim());
      p.toggleAttribute('data-invalid', !ok);
      return !ok;
    });
    fields.forEach((f) => (f.checkValidity() ? f.removeAttribute('aria-invalid') : f.setAttribute('aria-invalid', 'true')));
    return [...fields.filter((f) => !f.checkValidity()), ...badPicks]
      .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))[0];
  };
  /* Muestra el error: burbuja nativa en campos; en campos de ventana, marca la fila y la enfoca */
  const report = (bad) => {
    if (!bad.matches('[data-required-pick]')) { bad.reportValidity(); return; }
    bad.scrollIntoView({ behavior: smooth(), block: 'nearest' });
    bad.querySelector('button')?.focus({ preventScroll: true });
  };

  d.querySelectorAll('form[data-summary]').forEach((form) => {
    const out = d.getElementById(form.dataset.summary);
    const pre = out?.querySelector('pre');
    const send = out?.querySelector('[data-send]');
    const mail = out?.querySelector('[data-mail]');  // «Enviar por correo»: aparece si el formulario declara su destino (data-mail)
    /* «Enviar solicitud»: solo sobre WordPress (window.SITE.enviar). Al enviarla, el resumen muestra su número.
       La cotización de Transporte (form[data-cotizar-api]) no pasa por aquí, tenga o no dirección: la recibe solo el
       asistente Laravel (transporte-ui.js), y sin dirección no se envía a otro lado en su lugar. */
    const ship = window.SITE.enviar && !form.hasAttribute('data-cotizar-api') ? out?.querySelector('[data-enviar]') : null;
    /* Con envío al servidor, el resumen deja adjuntar fotografías (franja [data-fotos]) */
    const fotosHost = ship ? out.querySelector('[data-fotos]') : null;
    const fotos = fotosHost ? window.SITE.fotos(fotosHost) : null;
    const heading = out?.querySelector('[data-resumen-titulo]');
    const lead = out?.querySelector('[data-resumen-bajada]');
    const texts = { heading: heading?.textContent || '' };
    const copy = out?.querySelector('[data-copy]');
    const edit = out?.querySelector('[data-edit]');
    /* «Editar» pasa a «Nueva solicitud» cuando la solicitud ya se envió al servidor (vuelve al formulario con lo escrito) */
    const editText = edit ? [...edit.childNodes].reverse().find((n) => n.nodeType === 3 && n.textContent.trim()) : null;
    const editIcon = edit?.querySelector('svg');
    const editar = { texto: editText?.textContent || '', icono: editIcon?.innerHTML || '' };
    const pintaEditar = (nueva) => {
      if (editText) editText.textContent = nueva ? 'Nueva solicitud' : editar.texto;
      if (editIcon) editIcon.innerHTML = nueva ? '<path d="M12 5v14M5 12h14"/>' : editar.icono;
    };
    form.addEventListener('change', (e) => {
      const g = e.target.closest('[data-required-group]');
      if (g && e.target.checked) { g.removeAttribute('data-invalid'); g.querySelectorAll('input').forEach((f) => f.setCustomValidity('')); }
    });
    form.addEventListener('input', (e) => {
      if (out && !edit) out.hidden = true;
      if (e.target.getAttribute('aria-invalid') && e.target.checkValidity()) e.target.removeAttribute('aria-invalid');
      e.target.setCustomValidity?.('');
    });

    /* Lleva la vista al formulario sin mover la página si ya está a la vista.
       Dentro de un contenedor con scroll propio ([data-scroll-root]) solo vuelve ese contenedor al inicio. */
    const bring = (el) => {
      const box = el.querySelector('[data-scroll-root]') || el.closest('[data-scroll-root]');
      if (box) box.scrollTo({ top: 0, behavior: smooth() });
      if (el.closest('dialog')) return;  // dentro de una hoja o ventana, la página de atrás no se mueve
      const top = el.getBoundingClientRect().top;
      if (top < 64 || top > innerHeight - 160) el.scrollIntoView({ behavior: smooth(), block: 'start' });
    };
    /* form.transition(update) permite acompañar el cambio (p. ej., animar el alto del contenedor); por defecto es inmediato */
    const run = (update, dir) => Promise.resolve(form.transition ? form.transition(update, dir) : update());

    /* Pasos: [data-step-panel] o, si no hay, los fieldset directos del formulario */
    const marked = [...form.querySelectorAll('[data-step-panel]')];
    const steps = form.hasAttribute('data-steps') ? (marked.length ? marked : [...form.querySelectorAll(':scope > fieldset')]) : [];
    let current = 0;
    if (steps.length) {
      const labels = form.querySelectorAll('.stepper-labels > *');
      const bar = form.querySelector('.stepper-bar i');
      const back = form.querySelector('[data-back]');
      const next = form.querySelector('[data-next]');
      const submit = form.querySelector('[type="submit"]');
      const counter = form.querySelector('[data-step-count]');
      const inCard = Boolean(form.closest('.hcard'));
      const paint = (dir, animate) => {
        steps.forEach((s, n) => {
          s.hidden = n !== current;
          s.classList.remove('is-entering', 'is-entering-back');
        });
        if (animate) steps[current].classList.add(dir > 0 ? 'is-entering' : 'is-entering-back');
        labels.forEach((l, n) => {
          l.classList.toggle('is-done', n < current); l.classList.toggle('is-current', n === current);
          if (l.tagName === 'BUTTON') { l.disabled = n > current; l.setAttribute('aria-current', n === current ? 'step' : 'false'); }
        });
        if (bar) bar.style.setProperty('--p', `${((current + 1) / steps.length) * 100}%`);
        if (counter) counter.textContent = `Paso ${current + 1} de ${steps.length}`;
        /* En el primer paso, «Atrás» vuelve a lo que había antes del formulario cuando este vive en la tarjeta del hero
           (ver el clic, más abajo). Un formulario suelto no tiene adónde volver: ahí se oculta. */
        back.hidden = current === 0 && !inCard;
        next.hidden = current === steps.length - 1;
        submit.hidden = current !== steps.length - 1;
        window.SITE.refresh?.();
      };
      form.goTo = (i, dir = 1) => {
        const target = Math.max(0, Math.min(steps.length - 1, i));
        const changed = target !== current;
        current = target;
        if (!changed) { paint(dir, false); return Promise.resolve(); }
        return run(() => paint(dir, true), dir);
      };
      const move = (i, dir) => form.goTo(i, dir).then(() => {
        bring(form);
        if (dir > 0) steps[current].querySelector('input:not([type="radio"]):not([type="checkbox"]), select, textarea, input:checked, input')?.focus({ preventScroll: true });
      });
      next.addEventListener('click', () => {
        const bad = validate(steps[current]);
        if (bad) { report(bad); return; }
        move(current + 1, 1);
      });
      back.addEventListener('click', () => {
        if (current > 0) { move(current - 1, -1); return; }
        /* Primer paso: la tarjeta del hero se cierra y vuelve al inicio, sin borrar lo ya respondido (transporte-ui.js) */
        form.dispatchEvent(new CustomEvent('hero:close', { bubbles: true }));
      });
      /* Volver a un paso anterior desde la barra de pasos */
      labels.forEach((l, n) => l.tagName === 'BUTTON' && l.addEventListener('click', () => { if (n < current) move(n, -1); }));
      /* Enter en un campo avanza al paso siguiente en vez de enviar */
      form.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.defaultPrevented || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON' || current === steps.length - 1) return;
        if (e.target.matches('input, select')) { e.preventDefault(); next.click(); }
      });
      paint(1, false);
    }

    /* Las filas del resumen, en orden y agrupadas por su fieldset: { section, name, label, value }. El texto para
       WhatsApp sale de aquí, y también lo que se envía: la cotización de Transporte al asistente (form.summaryRows,
       transporte-ui.js) y los demás formularios a WordPress («Enviar solicitud», más abajo). Así todos dicen lo mismo */
    const rowsOf = () => {
      const rows = [];
      const seen = new Set();
      form.querySelectorAll('fieldset').forEach((fs) => {
        const section = fs.dataset.summaryTitle || fs.querySelector('legend')?.textContent.trim() || '';
        const row = (field, value) => rows.push({ group: fs, section, name: field.name, label: labelFor(field), value });
        fs.querySelectorAll('[name]').forEach((field) => {
          if (seen.has(field.name) || field.disabled || 'summarySkip' in field.dataset) return;
          if (field.type === 'radio' && !field.checked) return;
          if (field.type === 'checkbox') {
            seen.add(field.name);
            const on = [...fs.querySelectorAll(`[name="${field.name}"]:checked:not(:disabled)`)].map(valueOf);
            if (on.length) row(field, on.join(', '));
            return;
          }
          seen.add(field.name);
          const value = valueOf(field);
          if (value) row(field, value);
        });
      });
      return rows;
    };
    form.summaryRows = () => rowsOf().map(({ group, ...r }) => r);
    const summaryOf = () => {
      const lines = [`*${form.dataset.title || 'Consulta'}*`];
      let group = null;
      rowsOf().forEach((r) => {
        if (r.group !== group) { group = r.group; lines.push('', `*${r.section}*`); }
        lines.push(`• ${r.label}: ${r.value}`);
      });
      if (form.dataset.closing) lines.push('', form.dataset.closing);
      return lines.join('\n');
    };

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const bad = validate(form);
      if (bad) {
        const step = steps.findIndex((s) => s.contains(bad));
        const show = step > -1 && step !== current ? form.goTo(step, -1) : Promise.resolve();
        show.then(() => requestAnimationFrame(() => report(bad)));
        return;
      }
      const text = summaryOf();
      if (!out) return;
      run(() => {
        pre.textContent = text.replaceAll('*', '');
        send.href = window.SITE.whatsapp(text);
        /* Con las dos vías de envío, el pie dice «Enviar por» una vez y los botones quedan en «WhatsApp» y «Correo» */
        if (mail && form.dataset.mail) {
          mail.href = window.SITE.mailto(form.dataset.mail, text);
          mail.hidden = false;
          mail.parentElement.classList.add('has-mail');
          mail.parentElement.querySelector('.foot-label')?.removeAttribute('hidden');
        }
        if (ship) {  // sobre WordPress: la vía principal es enviarla al servidor; WhatsApp queda como alternativa
          ship.hidden = false; ship.disabled = false;
          if (edit) edit.hidden = false;
          pintaEditar(false);
          ship.parentElement.classList.add('has-envio');
          if (heading) heading.textContent = texts.heading;
          if (lead) lead.textContent = fotos
            ? 'Revísala, adjunta fotografías si las tienes y envíala. Te llegará un correo con su número; usaremos tus datos solo para responder esta solicitud.'
            : 'Revísala y envíala. Te llegará un correo con su número; usaremos tus datos solo para responder esta solicitud.';
          if (fotosHost) { fotosHost.hidden = false; fotos.bloquear(false); }
          window.SITE.permiso();
        }
        out.hidden = false;
        if (edit) form.hidden = true;
        out.classList.toggle('is-shown', !form.transition);
        /* Un resumen nuevo: quien envía la solicitud por otra vía (transporte-ui.js) vuelve a empezar */
        form.dispatchEvent(new CustomEvent('summary:ready', { detail: { text } }));
      }, 1).then(() => {
        if (edit) bring(out); else out.scrollIntoView({ behavior: smooth(), block: 'nearest' });
        (ship || out.querySelector('[data-send-first]:not([hidden])') || send).focus({ preventScroll: true });
      });
    });
    ship?.addEventListener('click', async () => {
      const CONTACTO = ['empresa', 'organizacion', 'nombre', 'telefono', 'correo'];
      const rows = form.summaryRows();
      const dato = (name) => rows.find((r) => r.name === name)?.value || '';
      ship.disabled = true;
      fotos?.bloquear(true);
      const adjuntas = fotos?.blobs() || [];
      /* Mientras sube, una capa cubre el resumen: con fotografías muestra el avance; sin ellas, que se está enviando */
      const capa = window.SITE.enviando(out, out.querySelector('.hcard-head'));
      capa.paso(adjuntas.length ? 'Subiendo fotografías…' : 'Enviando tu solicitud…', adjuntas.length ? 0 : null);
      try {
        const r = await window.SITE.enviar({
          origen: 'formulario', titulo: form.dataset.title || '',
          contacto: { empresa: dato('empresa') || dato('organizacion'), nombre: dato('nombre'), telefono: dato('telefono'), correo: dato('correo') },
          campos: rows.filter((r) => !CONTACTO.includes(r.name)).map((r) => [r.label, r.value])
        }, { fotos: adjuntas, avance: adjuntas.length ? (f) => capa.paso(f < 1 ? 'Subiendo fotografías…' : 'Enviando tu solicitud…', f < 1 ? f : null) : null });
        ship.hidden = true;
        pintaEditar(true);
        if (fotosHost) { fotosHost.hidden = true; fotos.vaciar(); }
        if (heading) heading.textContent = 'Solicitud enviada.';
        if (lead) lead.textContent = window.SITE.enviada(r, adjuntas.length);
        await capa.listo(`Solicitud ${r.numero} enviada`);
        send.focus({ preventScroll: true });
      } catch (err) {
        capa.quitar();
        ship.disabled = false;
        fotos?.bloquear(false);
        window.SITE.toast(`${err.message || 'No pudimos enviar la solicitud.'} También puedes enviarla por WhatsApp.`);
      }
    });
    edit?.addEventListener('click', () => {
      run(() => { out.hidden = true; form.hidden = false; }, -1).then(() => {
        bring(form);
        form.querySelector('[data-next]:not([hidden]), [type="submit"]:not([hidden])')?.focus({ preventScroll: true });
      });
    });
    copy?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pre.textContent); window.SITE.toast('Resumen copiado');
        window.SITE.done(copy);
      }
      catch {
        const range = d.createRange(); range.selectNodeContents(pre);
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
        window.SITE.toast('Texto seleccionado: cópialo con Ctrl+C');
      }
    });
  });

  /* Burbuja de ayuda: aparece al pasar el hero y se oculta sobre el pie de página. Al abrirla se expande
     (CSS: vidrio líquido) y muestra las acciones; se cierra al elegir una, al tocar fuera o con Escape. */
  const dock = d.querySelector('[data-dock]');
  if (dock) {
    const button = dock.querySelector('.dock-toggle');
    const menu = dock.querySelector('.dock-menu');
    const blockers = new Set();
    const hero = d.querySelector('.hero');
    let open = false;
    /* El tamaño abierto sale del propio menú, así la animación termina justo en su borde */
    const measure = () => {
      dock.style.setProperty('--dock-w', `${menu.offsetWidth}px`);
      dock.style.setProperty('--dock-h', `${menu.offsetHeight}px`);
    };
    const setOpen = (next, { focus = false } = {}) => {
      if (next === open) return;
      open = next;
      if (open) measure();
      dock.classList.toggle('is-open', open);
      button.setAttribute('aria-expanded', String(open));
      menu.inert = !open;
      if (!open && focus) button.focus();
    };
    /* Aparece apenas se entra al sitio (pedido del 22-10-2026; antes, al pasar el hero): un instante después de cargar,
       para que se vea su entrada suave */
    let entro = false;
    const refresh = () => {
      const past = entro || dock.hasAttribute('data-dock-always') || (hero ? hero.getBoundingClientRect().bottom < 80 : scrollY > innerHeight * .6);
      /* Con un formulario del hero abierto y a la vista (cotizar, buscar, especialista, asistente) se aparta: si no, podría
         quedar encima de sus botones de abajo (23-10-2026). Con el chat abierto (is-chat, agente.js) se queda: lo cierra */
      const escena = d.querySelector('[data-hero]:not([data-float-only])');
      const formulario = escena && escena.dataset.view && escena.dataset.view !== 'inicio' && escena.getBoundingClientRect().bottom > 80;
      const show = (dock.classList.contains('is-chat') || (past && blockers.size === 0 && !formulario)) && !nav?.classList.contains('is-open');
      if (!show) setOpen(false);
      dock.classList.toggle('is-visible', show);
      dock.inert = !show;
    };
    menu.inert = true;
    button.addEventListener('click', () => setOpen(!open));
    menu.addEventListener('click', (e) => { if (e.target.closest('a, button')) setOpen(false); });
    d.addEventListener('pointerdown', (e) => { if (open && !dock.contains(e.target)) setOpen(false); });
    d.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') setOpen(false, { focus: true }); });
    addEventListener('resize', () => { if (open) measure(); });
    if ('IntersectionObserver' in window) {
      const watch = new IntersectionObserver((entries) => {
        entries.forEach((e) => (e.isIntersecting ? blockers.add(e.target) : blockers.delete(e.target)));
        refresh();
      });
      d.querySelectorAll('[data-hide-dock], .site-footer').forEach((el) => watch.observe(el));
    }
    addEventListener('scroll', refresh, { passive: true });
    dock.addEventListener('dock:refrescar', refresh);
    const escenaHero = d.querySelector('[data-hero]:not([data-float-only])');
    if (escenaHero) new MutationObserver(refresh).observe(escenaHero, { attributes: true, attributeFilter: ['data-view'] });
    dock.addEventListener('dock:abrir', () => { refresh(); setOpen(true); });  // «Volver» del chat: de vuelta a las opciones
    toggle?.addEventListener('click', () => setTimeout(refresh));
    refresh();
    const entrar = () => setTimeout(() => { entro = true; refresh(); }, 650);
    if (d.readyState === 'complete') entrar(); else addEventListener('load', entrar, { once: true });
  }
})();
