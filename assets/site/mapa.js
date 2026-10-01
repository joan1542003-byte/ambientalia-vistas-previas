/* Mapa para marcar el punto exacto del retiro (opcional, junto a la dirección escrita).
   La persona mueve el mapa hasta dejar el marcador (fijo al centro) sobre el lugar, toca un punto o usa su ubicación.
   El resultado es un enlace de Google Maps que viaja en la solicitud: «Ubicación en el mapa: https://www.google.com/maps/…».

   Qué se carga y de dónde, solo cuando alguien abre el mapa:
   - Leaflet 1.9.4 (BSD-2) desde jsDelivr, o unpkg si falla, con verificación de integridad (SRI).
   - Las imágenes del mapa, desde los servidores de OpenStreetMap (© colaboradores de OpenStreetMap). Su política admite
     un uso liviano como este; con mucho tráfico hay que contratar un proveedor de mapas y cambiar TILES.
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
  const TEXTO = {
    inicio: 'Mueve el mapa hasta dejar el marcador sobre el lugar del retiro.',
    listo: 'Punto marcado. Se enviará como enlace de Google Maps.',
    cargando: 'Cargando el mapa…',
    error: 'No se pudo cargar el mapa. Puedes continuar solo con la dirección.',
    fuera: 'Ese punto queda fuera de la Región Metropolitana.'
  };
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

  /* Monta el mapa dentro de `host`. `vista` (o una promesa) dice dónde partir: { lat, lng, zoom }.
     Devuelve { get, clear, destroy }; avisa cada cambio con onChange(punto | null). */
  const mount = (host, { value = null, vista = null, onChange = null } = {}) => {
    let actual = value;
    let map = null;
    let vivo = true;
    let auto = 0;  // movimientos que hace el propio mapa (centrar, ajustar tamaño): no marcan el punto
    host.classList.add('map-box');
    host.innerHTML = `<div class="map-frame">
        <div class="map-canvas" role="application" aria-label="Mapa. ${TEXTO.inicio} Con teclado: flechas para mover, más y menos para acercar."></div>
        <span class="map-pin" aria-hidden="true">${PIN}</span>
        ${'geolocation' in navigator ? `<button type="button" class="map-locate" data-map-locate>${MIRA}<span>Mi ubicación</span></button>` : ''}
      </div>
      <p class="map-status"><span data-map-status aria-live="polite">${TEXTO.cargando}</span><button type="button" class="map-clear" data-map-clear hidden>Quitar punto</button></p>`;
    const canvas = host.querySelector('.map-canvas');
    const status = host.querySelector('[data-map-status]');
    const clearBtn = host.querySelector('[data-map-clear]');
    const paint = (msg) => {
      host.classList.toggle('has-point', Boolean(actual));
      clearBtn.hidden = !actual;
      status.textContent = msg || (actual ? TEXTO.listo : TEXTO.inicio);
    };
    const fijar = (ll) => {
      const p = redondo(ll);
      actual = enRegion(p) ? p : null;
      paint(actual ? '' : TEXTO.fuera);
      onChange?.(actual);
    };
    const propio = (fn) => { auto += 1; fn(); setTimeout(() => { auto = Math.max(0, auto - 1); }, 450); };

    Promise.all([ready(), Promise.race([Promise.resolve(vista).catch(() => null), new Promise((r) => setTimeout(r, 1500))])]).then(([L, v]) => {
      if (!vivo) return;
      const ini = actual ? { ...actual, zoom: 17 } : v || RM;
      map = L.map(canvas, {
        center: [ini.lat, ini.lng], zoom: ini.zoom || 15, minZoom: 9, maxZoom: 19, zoomControl: false,
        maxBounds: RM.limites, maxBoundsViscosity: .8, bounceAtZoomLimits: false
      });
      map.attributionControl.setPrefix(false);
      L.control.zoom({ position: 'bottomright', zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(map);
      L.tileLayer(TILES, { maxZoom: 19, attribution: ATRIBUCION }).addTo(map);
      /* El marcador está fijo al centro: lo que se mueve es el mapa. Al soltar, ese centro es el punto */
      map.on('movestart', () => { if (!auto) host.classList.add('is-moving'); });
      map.on('moveend', () => { host.classList.remove('is-moving'); if (!auto) fijar(map.getCenter()); });
      map.on('click', (e) => map.panTo(e.latlng));
      /* Si la caja cambia de tamaño (se despliega, gira el teléfono), el centro se conserva */
      if ('ResizeObserver' in window) {
        new ResizeObserver(() => {
          if (!map) return;
          const c = map.getCenter();
          propio(() => { map.invalidateSize({ pan: false }); map.setView(c, map.getZoom(), { animate: false }); });
        }).observe(canvas);
      }
      host.classList.add('is-ready');
      paint();
    }).catch(() => { if (vivo) { host.classList.add('is-failed'); status.textContent = TEXTO.error; } });

    host.addEventListener('click', (e) => {
      if (e.target.closest('[data-map-clear]')) { actual = null; paint(); onChange?.(null); return; }
      const b = e.target.closest('[data-map-locate]');
      if (!b || !map || b.disabled) return;
      b.disabled = true;
      status.textContent = 'Buscando tu ubicación…';
      navigator.geolocation.getCurrentPosition((pos) => {
        b.disabled = false;
        if (!vivo) return;
        const ll = window.L.latLng(pos.coords.latitude, pos.coords.longitude);
        if (!enRegion({ lat: ll.lat, lng: ll.lng })) { paint('Tu ubicación está fuera de la Región Metropolitana. Mueve el mapa a mano.'); return; }
        propio(() => map.setView(ll, 17));
        fijar(ll);
      }, (err) => {
        b.disabled = false;
        if (vivo) paint(err.code === 1 ? 'No hay permiso para usar tu ubicación. Mueve el mapa a mano.' : 'No pudimos obtener tu ubicación. Mueve el mapa a mano.');
      }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
    });

    return {
      get: () => actual,
      clear: () => { actual = null; paint(); onChange?.(null); },
      destroy: () => { vivo = false; map?.remove(); map = null; },
      get map() { return map; }
    };
  };

  window.MAPA = { ready, mount, enlace, punto, enRegion, RM };
})();
