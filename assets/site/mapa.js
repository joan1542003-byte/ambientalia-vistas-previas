/* Mapa de la dirección del retiro, conectado con lo que se escribe (ventana de la dirección, seleccion.js):
   - Al escribir una calle, el mapa la muestra; si OpenStreetMap conoce ese número, deja el punto marcado.
   - Al mover el mapa, tocar un lugar o usar «Mi ubicación», el punto queda marcado y se escribe la dirección de ese lugar.
   El marcador está fijo al centro: lo que se mueve es el mapa. El punto marcado viaja en la solicitud como enlace de
   Google Maps: «Ubicación en el mapa: https://www.google.com/maps/…». Una ubicación solo aproximada (se reconoció la
   calle, pero no el número; o el dispositivo no dio una ubicación precisa) se muestra con el marcador gris y no se
   envía hasta que la persona la confirme: tocando el lugar, moviendo el mapa o con «Marcar aquí».
   Para que el punto sea preciso, solo se puede marcar con el mapa acercado (ZOOM_MARCA): más lejos, tocar acerca el
   mapa a esa zona y arrastrar solo sirve para recorrerlo.

   Qué se carga y de dónde, solo cuando el mapa aparece:
   - Leaflet 1.9.4 (BSD-2) desde jsDelivr, o unpkg si falla, con verificación de integridad (SRI).
   - Las imágenes del mapa, desde los servidores de OpenStreetMap (© colaboradores de OpenStreetMap). Su política admite
     un uso liviano como este; con mucho tráfico hay que contratar un proveedor de mapas y cambiar TILES.
   - La conversión dirección ↔ punto la hace geo.js con archivos del propio sitio (no consulta servicios externos).
   No se usa la API de Google Maps (requiere clave y facturación): el enlace que se genera es un enlace público normal.
   Si el mapa no carga, la dirección escrita sigue funcionando igual. */
(() => {
  const d = document;
  const CDN = ['https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/', 'https://unpkg.com/leaflet@1.9.4/dist/'];
  const SRI = {
    'leaflet.css': 'sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H',
    'leaflet.js': 'sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH'
  };
  const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const ATRIBUCION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';
  /* Región Metropolitana: vista inicial sin comuna y límites del mapa */
  const RM = { lat: -33.45, lng: -70.66, zoom: 11, limites: [[-34.4, -71.85], [-32.8, -69.65]] };
  /* Contorno de la región (OpenStreetMap, simplificado a 79 vértices y con unos 2 km de margen): un punto fuera no se acepta */
  const BORDE = [[-33.164,-70.257],[-33.113,-70.263],[-33.087,-70.368],[-33.006,-70.41],[-33.068,-70.508],[-32.923,-70.605],[-32.937,-70.715],[-32.903,-70.741],[-32.904,-70.849],[-32.96,-71.027],[-33.034,-71.013],[-33.068,-71.042],[-33.184,-71.011],[-33.223,-71.232],[-33.301,-71.213],[-33.363,-71.241],[-33.41,-71.362],[-33.605,-71.356],[-33.679,-71.458],[-33.773,-71.38],[-33.767,-71.565],[-33.877,-71.576],[-33.951,-71.734],[-34.041,-71.607],[-33.992,-71.583],[-34.021,-71.467],[-34.084,-71.408],[-34.039,-71.319],[-34.169,-71.201],[-34.198,-71.086],[-34.16,-70.928],[-34.104,-70.952],[-34.091,-70.906],[-34.053,-70.903],[-34.041,-70.82],[-34.009,-70.805],[-33.967,-70.84],[-33.945,-70.811],[-33.958,-70.771],[-33.921,-70.72],[-33.956,-70.666],[-33.906,-70.526],[-33.868,-70.43],[-33.899,-70.362],[-33.945,-70.365],[-34.015,-70.31],[-34.076,-70.32],[-34.087,-70.25],[-34.048,-70.228],[-34.051,-70.164],[-34.135,-70.129],[-34.174,-70.151],[-34.219,-70.056],[-34.296,-70.04],[-34.264,-69.958],[-34.306,-69.895],[-34.258,-69.789],[-34.205,-69.785],[-34.143,-69.856],[-34.024,-69.803],[-33.971,-69.836],[-33.973,-69.887],[-33.898,-69.836],[-33.852,-69.88],[-33.775,-69.885],[-33.717,-69.844],[-33.534,-69.852],[-33.511,-69.816],[-33.321,-69.758],[-33.278,-69.783],[-33.262,-69.888],[-33.233,-69.901],[-33.311,-69.987],[-33.257,-70.023],[-33.219,-70.013],[-33.191,-70.051],[-33.122,-70.038],[-33.036,-70.083],[-33.164,-70.257]];
  const enRegion = ({ lat, lng }) => {
    let dentro = false;
    for (let i = 0, j = BORDE.length - 1; i < BORDE.length; j = i++) {
      const [y1, x1] = BORDE[i];
      const [y2, x2] = BORDE[j];
      if ((y1 > lat) !== (y2 > lat) && lng < ((x2 - x1) * (lat - y1)) / (y2 - y1) + x1) dentro = !dentro;
    }
    return dentro;
  };
  const ZOOM_MARCA = 16;  // desde este acercamiento el centro del mapa se puede marcar: más lejos, un dedo abarca varias cuadras
  /* «Mi ubicación»: el dispositivo afina su posición durante unos segundos y se usa la mejor lectura */
  const UBICA = {
    precisa: 20,     // m: con este margen o menos, la ubicación queda marcada como punto (alcanza para distinguir un edificio)
    suficiente: 10,  // m: con este margen ya no se espera una lectura mejor
    espera: 8000,    // ms, como máximo, desde la primera lectura
    calma: 4000,     // ms sin mejorar una lectura ya razonable (100 m o menos): no va a mejorar
    limite: 15000    // ms sin ninguna lectura
  };
  const TEXTO = {
    inicio: 'Mueve el mapa o toca el lugar del retiro: escribiremos la dirección.',
    lejos: 'Acerca el mapa al lugar del retiro: toca la zona o usa los botones + y −.',
    acercado: 'Ahora toca el lugar exacto o mueve el mapa para marcar el punto.',
    aproximada: 'Ubicación aproximada. Toca el lugar exacto o mueve el mapa para marcar el punto.',
    exacta: 'Encontramos esa dirección. Si el marcador no quedó en el lugar, mueve el mapa.',
    listo: 'Punto marcado. Se enviará como enlace de Google Maps.',
    cargando: 'Cargando el mapa…',
    error: 'No se pudo cargar el mapa. Puedes continuar solo con la dirección.',
    fuera: 'Ese punto queda fuera de la Región Metropolitana.',
    buscando: 'Buscando tu ubicación…',
    sinPermiso: 'No hay permiso para usar tu ubicación. Mueve el mapa a mano.',
    sinUbicacion: 'No pudimos obtener tu ubicación. Mueve el mapa a mano.',
    ubicacionFuera: 'Tu ubicación está fuera de la Región Metropolitana. Mueve el mapa a mano.'
  };
  const margen = (m) => (m >= 950 ? `${String(Math.round(m / 100) / 10).replace('.', ',')} km` : `${Math.max(5, Math.round(m / 5) * 5)} m`);
  const PIN = '<svg width="38" height="46" viewBox="0 0 38 46" fill="none" aria-hidden="true"><path class="map-pin-body" d="M19 44S4 30.5 4 18a15 15 0 1 1 30 0c0 12.5-15 26-15 26z"/><circle class="map-pin-dot" cx="19" cy="18" r="5.5"/></svg>';
  const MIRA = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/></svg>';

  /* Leaflet se descarga una sola vez, al abrir el primer mapa */
  let lib = null;
  const tag = (name, attrs) => new Promise((ok, fail) => {
    const el = Object.assign(d.createElement(name), attrs);
    el.onload = () => ok(el);
    el.onerror = () => { el.remove(); fail(new Error(`No cargó ${attrs.href || attrs.src}`)); };
    d.head.append(el);
  });
  const desde = (base) => Promise.all([
    tag('link', { rel: 'stylesheet', href: `${base}leaflet.css`, integrity: SRI['leaflet.css'], crossOrigin: 'anonymous' }),
    window.L ? null : tag('script', { src: `${base}leaflet.js`, integrity: SRI['leaflet.js'], crossOrigin: 'anonymous' })
  ]);
  const ready = () => (lib ||= desde(CDN[0]).catch(() => desde(CDN[1])).then(() => window.L).catch((e) => { lib = null; throw e; }));

  const redondo = (ll) => ({ lat: Number(ll.lat.toFixed(5)), lng: Number(ll.lng.toFixed(5)) });
  /* Enlace público de Google Maps (formato oficial «Maps URLs»); abre la app en el teléfono.
     La coma va codificada (%2C) para que WhatsApp y el correo enlacen la dirección completa */
  const enlace = (p) => (p ? `https://www.google.com/maps/search/?api=1&query=${p.lat}%2C${p.lng}` : '');
  const punto = (valor) => {
    const m = String(valor || '').match(/query=(-?\d+(?:\.\d+)?)(?:,|%2C)(-?\d+(?:\.\d+)?)/i);
    return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
  };

  /* Monta el mapa dentro de `host`. `vista` (o una promesa) dice dónde partir: { lat, lng, zoom }; si no hay punto
     marcado, esa vista es solo aproximada. Devuelve { get, show, note, release, clear, destroy }.
     onChange(punto | null, origen, extra) avisa lo que hace la persona: 'mapa' (movió, tocó o confirmó), 'ubicacion'
     (con extra.margen, el margen de error del dispositivo), 'quitar' o 'lejos' (recorrió el mapa desde lejos y el
     punto dejó de estar bajo el marcador). */
  const mount = (host, { value = null, vista = null, onChange = null } = {}) => {
    let actual = value;
    let map = null;
    let vivo = true;
    let auto = 0;          // movimientos que hace el propio mapa (centrar, ajustar tamaño): no marcan el punto
    let pendiente = null;  // vista pedida con show() antes de que el mapa esté listo
    let cola = null;       // vista pedida mientras el mapa todavía se movía hacia la anterior
    let aviso = '';        // mensaje que se está mostrando, si no es el habitual del estado
    let avisoFijo = false; // ese mensaje vale con el mapa alejado también (los de «Mi ubicación»)
    let rastreo = null;    // búsqueda de «Mi ubicación» en curso: { id, reloj }
    let aqui = null;       // dónde dice el dispositivo que está la persona: punto y círculo de precisión
    host.classList.add('map-box');
    host.innerHTML = `<div class="map-frame">
        <div class="map-canvas" role="application" aria-label="Mapa de la dirección. ${TEXTO.inicio} Con teclado: flechas para mover, más y menos para acercar."></div>
        <span class="map-pin" aria-hidden="true">${PIN}</span>
        ${'geolocation' in navigator ? `<button type="button" class="map-locate" data-map-locate>${MIRA}<span>Mi ubicación</span></button>` : ''}
      </div>
      <p class="map-status"><span data-map-status aria-live="polite">${TEXTO.cargando}</span><button type="button" class="map-mark" data-map-mark hidden>Marcar aquí</button><button type="button" class="map-clear" data-map-clear hidden>Quitar punto</button></p>`;
    const canvas = host.querySelector('.map-canvas');
    const status = host.querySelector('[data-map-status]');
    const clearBtn = host.querySelector('[data-map-clear]');
    const markBtn = host.querySelector('[data-map-mark]');
    const locateBtn = host.querySelector('[data-map-locate]');
    const cerca = () => Boolean(map) && map.getZoom() >= ZOOM_MARCA;
    const paint = (msg = '', fijo = false) => {
      aviso = msg;
      avisoFijo = fijo;
      host.classList.toggle('has-point', Boolean(actual));
      clearBtn.hidden = !actual;
      markBtn.hidden = Boolean(actual) || !cerca();  // sin punto y con el mapa acercado, el lugar bajo el marcador se puede confirmar
      status.textContent = msg || (actual ? TEXTO.listo : map && !cerca() ? TEXTO.lejos : TEXTO.inicio);
    };
    /* La persona fijó el punto (movió el mapa, tocó un lugar, lo confirmó o usó su ubicación) */
    const fijar = (ll, origen, extra) => {
      const p = redondo(ll);
      actual = enRegion(p) ? p : null;
      paint(actual ? '' : TEXTO.fuera);
      onChange?.(actual, origen, extra);
    };
    /* El lugar bajo el marcador deja de ser un punto marcado; se avisa solo si había uno */
    const soltar = (msg, origen, fijo = false) => {
      const habia = actual;
      actual = null;
      paint(msg, fijo);
      if (habia) onChange?.(null, origen);
    };
    /* Movimiento propio: mientras dura, el «moveend» no cuenta como si la persona hubiera movido el mapa */
    const propio = (fn) => {
      auto += 1;
      let hecho = false;
      const fin = () => {
        if (hecho) return;
        hecho = true;
        auto = Math.max(0, auto - 1);
        if (!auto && cola && map) { const [v, z] = cola; cola = null; mover(v, z); }
      };
      map.once('moveend', () => setTimeout(fin, 0));
      fn();
      setTimeout(fin, 1200);
    };
    /* Leaflet ignora un cambio de vista pedido mientras anima el anterior: el último pedido espera a que termine */
    const mover = (v, z) => {
      if (auto) { cola = [v, z]; return; }
      const c = map.getCenter();
      if (Math.abs(c.lat - v.lat) > 1e-6 || Math.abs(c.lng - v.lng) > 1e-6 || map.getZoom() !== z) propio(() => map.setView([v.lat, v.lng], z));
    };
    /* Lleva el mapa a una vista. Con `marcar`, el punto queda marcado (dirección exacta); si no, es aproximada y no se envía */
    const show = (v, { marcar = false, aviso: msg = '' } = {}) => {
      if (!v) return;
      dejarDeBuscar();
      actual = marcar ? redondo(v) : null;  // vale desde ya, aunque el mapa todavía esté cargando
      if (!map) { pendiente = { v, marcar, aviso: msg }; return; }
      mover(v, v.zoom || Math.max(map.getZoom(), ZOOM_MARCA));
      paint(msg || (marcar ? TEXTO.exacta : TEXTO.aproximada));
    };

    /* «Mi ubicación». La primera lectura de un dispositivo suele ser gruesa (antenas o Wi-Fi) y mejora en segundos: se
       sigue escuchando y se usa la mejor. Solo una lectura precisa deja el punto marcado; con una gruesa (lo normal en
       un computador, que no tiene GPS), el mapa va a la zona, muestra el margen de error y la persona marca el lugar. */
    const dejarDeBuscar = () => {
      if (!rastreo) return;
      navigator.geolocation.clearWatch(rastreo.id);
      clearTimeout(rastreo.reloj);
      clearTimeout(rastreo.calma);
      rastreo = null;
      if (locateBtn) locateBtn.disabled = false;
    };
    const dibujarAqui = (p) => {
      const L = window.L;
      const ll = [p.lat, p.lng];
      if (aqui) { aqui.halo.setLatLng(ll).setRadius(p.margen); aqui.punto.setLatLng(ll); return; }
      aqui = {
        halo: L.circle(ll, { radius: p.margen, interactive: false, color: '#151a2d', weight: 1, opacity: .28, fillColor: '#151a2d', fillOpacity: .07 }).addTo(map),
        punto: L.circleMarker(ll, { radius: 6, interactive: false, color: '#fff', weight: 2.5, fillColor: '#151a2d', fillOpacity: 1 }).addTo(map)
      };
    };
    const zoomDe = (m) => (m <= UBICA.precisa ? 18 : m <= 80 ? 17 : m <= 200 ? 16 : m <= 500 ? 15 : m <= 1500 ? 14 : 12);
    const ubicar = () => {
      if (rastreo || !map) return;
      let mejor = null;
      const terminar = () => {
        if (!rastreo) return;
        dejarDeBuscar();
        if (!vivo) return;
        if (!mejor) { paint(TEXTO.sinUbicacion, true); return; }
        mover(mejor, zoomDe(mejor.margen));
        if (mejor.margen <= UBICA.precisa) { fijar(mejor, 'ubicacion', { margen: margen(mejor.margen) }); return; }
        soltar(`Tu dispositivo dio una ubicación aproximada (±${margen(mejor.margen)}). ${zoomDe(mejor.margen) >= ZOOM_MARCA ? 'Toca el lugar exacto o mueve el mapa.' : 'Acerca el mapa y toca el lugar exacto.'}`, 'ubicacion', true);
      };
      locateBtn.disabled = true;
      paint(TEXTO.buscando, true);
      const id = navigator.geolocation.watchPosition((pos) => {
        if (!vivo || !rastreo) return;
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, margen: Math.max(1, Number(pos.coords.accuracy) || 5000) };
        if (!enRegion(p)) { if (!mejor) { dejarDeBuscar(); paint(TEXTO.ubicacionFuera, true); } return; }
        if (!mejor) {
          rastreo.reloj = setTimeout(terminar, UBICA.espera);
          soltar('', 'ubicacion');  // el mapa se va a la ubicación: el punto anterior deja de estar bajo el marcador
        }
        if (!mejor || p.margen < mejor.margen) {
          mejor = p;
          dibujarAqui(p);
          mover(p, zoomDe(p.margen));
          paint(`Afinando tu ubicación… (±${margen(p.margen)})`, true);
          clearTimeout(rastreo.calma);
          if (p.margen <= 100) rastreo.calma = setTimeout(terminar, UBICA.calma);
        }
        if (p.margen <= UBICA.suficiente) terminar();
      }, (err) => {
        if (!rastreo) return;
        if (mejor) { terminar(); return; }
        dejarDeBuscar();
        if (vivo) paint(err.code === 1 ? TEXTO.sinPermiso : TEXTO.sinUbicacion, true);
      }, { enableHighAccuracy: true, timeout: UBICA.limite, maximumAge: 0 });
      rastreo = { id, reloj: 0, calma: 0 };
    };

    Promise.all([ready(), Promise.race([Promise.resolve(vista).catch(() => null), new Promise((r) => setTimeout(r, 1500))])]).then(([L, v]) => {
      if (!vivo) return;
      const ini = actual ? { ...actual, zoom: 17 } : v || RM;
      /* El zoom (rueda, doble clic, pellizco, botones) se hace siempre en torno al centro, que es donde está el marcador:
         acercar o alejar no cambia el lugar marcado */
      map = L.map(canvas, {
        center: [ini.lat, ini.lng], zoom: ini.zoom || 15, minZoom: 9, maxZoom: 19, zoomControl: false,
        scrollWheelZoom: 'center', doubleClickZoom: 'center', touchZoom: 'center', inertiaMaxSpeed: 1000,  // sin lanzamientos largos
        maxBounds: RM.limites, maxBoundsViscosity: .8, bounceAtZoomLimits: false
      });
      map.attributionControl.setPrefix(false);
      /* Leaflet enfoca el mapa al presionarlo y el navegador, al enfocar algo que no se ve entero, desplaza la ventana
         para mostrarlo: el mapa se corría bajo el dedo y el toque quedaba marcado en otro lugar. El foco se toma
         antes que Leaflet y sin desplazar nada */
      canvas.addEventListener('mousedown', () => { if (d.activeElement !== canvas) canvas.focus({ preventScroll: true }); }, true);
      L.control.zoom({ position: 'bottomright', zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(map);
      L.tileLayer(TILES, { maxZoom: 19, attribution: ATRIBUCION }).addTo(map);
      /* El marcador está fijo al centro: lo que se mueve es el mapa. Al soltar, ese centro es el punto.
         Solo un desplazamiento real cuenta: si el centro no cambió (fue solo zoom), no pasa nada. Y solo con el mapa
         acercado: recorrerlo desde lejos no marca (y deja sin efecto el punto que había, que ya no está bajo el marcador) */
      let desde = map.getCenter();
      map.on('movestart', () => {
        if (auto) return;
        cola = null;
        if (rastreo) { dejarDeBuscar(); paint(); }  // la persona tomó el mapa mientras se afinaba su ubicación: manda ella
        desde = map.getCenter();
        host.classList.add('is-moving');
      });
      map.on('moveend', () => {
        host.classList.remove('is-moving');
        if (auto) return;
        const corrido = map.latLngToContainerPoint(desde).distanceTo(map.getSize().divideBy(2));
        if (corrido <= 2) return;
        if (cerca()) fijar(map.getCenter(), 'mapa'); else soltar('', 'lejos');
      });
      /* Tocar un lugar lo marca. Desde lejos, tocar solo acerca el mapa a esa zona: el siguiente toque ya es preciso */
      map.on('click', (e) => {
        dejarDeBuscar();
        const z = map.getZoom();
        if (z < ZOOM_MARCA) {
          const z2 = z < 14 ? z + 3 : 17;
          soltar('', 'lejos');
          cola = null;
          propio(() => map.setView(e.latlng, z2));
          paint(z2 >= ZOOM_MARCA ? TEXTO.acercado : '');
          return;
        }
        if (map.latLngToContainerPoint(e.latlng).distanceTo(map.getSize().divideBy(2)) <= 3) fijar(map.getCenter(), 'mapa');  // tocó justo bajo el marcador
        else map.panTo(e.latlng);
      });
      /* Al cambiar el acercamiento sin punto marcado, el mensaje y «Marcar aquí» se ponen al día: desde lejos no se marca */
      map.on('zoomend', () => { if (!actual) paint(cerca() || avisoFijo ? aviso : '', avisoFijo); });
      /* Si la caja cambia de tamaño (gira el teléfono, cambia el ancho de la ventana), el centro se conserva. El primer
         aviso del observador llega con el tamaño inicial: se ignora, porque recentrar ahí cortaría una animación en curso */
      if ('ResizeObserver' in window) {
        let medida = `${canvas.clientWidth}x${canvas.clientHeight}`;
        new ResizeObserver(() => {
          const ahora = `${canvas.clientWidth}x${canvas.clientHeight}`;
          if (!map || ahora === medida) return;
          medida = ahora;
          const c = map.getCenter();
          propio(() => { map.invalidateSize({ pan: false }); map.setView(c, map.getZoom(), { animate: false }); });
        }).observe(canvas);
      }
      host.classList.add('is-ready');
      if (pendiente) { const q = pendiente; pendiente = null; show(q.v, q); } else paint(actual ? '' : v?.nivel === 'calle' ? TEXTO.aproximada : '');
    }).catch(() => { if (vivo) { host.classList.add('is-failed'); status.textContent = TEXTO.error; } });

    host.addEventListener('click', (e) => {
      if (e.target.closest('[data-map-clear]')) { dejarDeBuscar(); actual = null; paint(); onChange?.(null, 'quitar'); return; }
      if (e.target.closest('[data-map-mark]')) { if (cerca()) { dejarDeBuscar(); fijar(map.getCenter(), 'mapa'); } return; }
      if (e.target.closest('[data-map-locate]') && !locateBtn.disabled) ubicar();
    });

    return {
      get: () => actual,
      show,
      note: (msg) => paint(msg),
      release: () => { actual = null; paint(TEXTO.aproximada); },  // el punto dejó de valer (cambió la dirección escrita), sin mover el mapa
      clear: () => { actual = null; paint(); onChange?.(null, 'quitar'); },
      destroy: () => { vivo = false; dejarDeBuscar(); map?.remove(); map = null; },
      get map() { return map; }
    };
  };

  /* Lo que la ventana de la dirección (Picker.text) necesita para conectar texto y mapa; `comuna` es una función que
     devuelve la comuna elegida en ese momento. Las consultas las resuelve geo.js. */
  const paraTexto = ({ comuna = () => '', value = null, onDone = null, onPlace = null } = {}) => {
    const GEO = window.GEO;
    if (!GEO) return null;
    return {
      value, onDone, onPlace,
      key: (t) => GEO.nucleo(GEO.partes(t).calle),
      parts: GEO.partes,
      locate: (t, preferida = '') => GEO.locate(t, { comuna: comuna(), preferida }),
      search: (t, preferida = '') => GEO.search(t, { comuna: comuna(), preferida }),
      reverse: (p) => GEO.reverse(p),
      near: (t, p, metros) => GEO.junto(t, p, metros),
      warm: () => GEO.calentar(comuna())
    };
  };

  window.MAPA = { ready, mount, paraTexto, enlace, punto, enRegion, RM };
})();
