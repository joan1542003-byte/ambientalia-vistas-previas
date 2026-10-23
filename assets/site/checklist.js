/* Checklists en línea (ayuda/checklist-*.html, los genera tools/ayuda.py): el de autorización de 50 puntos y los diez
   del cliente, cada uno con sus marcas guardadas aparte (data-clave).
   Cada punto se marca con un toque en su círculo (Cumple ↔ Pendiente); sus otros estados (Por confirmar, No cumple,
   No aplica) se eligen en la ventana de selección del sitio. Las marcas quedan en este dispositivo (localStorage):
   si no se pueden guardar, el checklist funciona igual mientras la página esté abierta. «Descargar Excel» entrega la
   planilla del cliente con el estado de cada punto ya puesto y «Descargar PDF», un PDF con lo mismo (exportar.js). */
(() => {
  const d = document;
  const root = d.querySelector('article[data-checklist]');
  if (!root) return;
  const CLAVE = root.dataset.clave || 'ta-checklist-autorizacion';
  const ESTADOS = JSON.parse(root.dataset.estados);           // [[valor, nombre]…]
  const NOMBRE = Object.fromEntries(ESTADOS);
  const puntos = [...root.querySelectorAll('.ck-punto')];
  const barra = root.querySelector('[data-ck-barra]');
  const hechos = root.querySelector('[data-ck-hechos]');
  const detalle = root.querySelector('[data-ck-detalle]');
  const progreso = root.querySelector('[data-ck-progreso]');
  const borrar = root.querySelector('[data-ck-borrar]');
  const botonPdf = root.querySelector('[data-ck-pdf]');
  const botonExcel = root.querySelector('[data-ck-excel]');
  const toast = (t) => window.SITE?.toast?.(t);

  let marcas = {};
  try { marcas = JSON.parse(localStorage.getItem(CLAVE) || '{}') || {}; } catch { marcas = {}; }
  const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(marcas)); } catch { /* sin almacenamiento: queda en la página */ } };

  const pinta = (li) => {
    const n = li.dataset.n;
    const estado = marcas[n] || 'pendiente';
    li.dataset.estado = estado;
    const marca = li.querySelector('.ck-marca');
    marca.setAttribute('aria-checked', String(estado === 'cumple'));
    const boton = li.querySelector('[data-ck-estado]');
    boton.querySelector('.ck-estado-t').textContent = NOMBRE[estado];
    boton.setAttribute('aria-label', `Estado del punto ${n}: ${NOMBRE[estado]}. Cambiar`);
  };
  const resume = () => {
    const vals = puntos.map((li) => li.dataset.estado);
    const revisados = vals.filter((v) => v !== 'pendiente').length;
    hechos.textContent = revisados;
    progreso.style.setProperty('--p', `${(revisados / puntos.length) * 100}%`);
    const cuenta = (v) => vals.filter((x) => x === v).length;
    const partes = [['cumple', 'cumplen'], ['confirmar', 'por confirmar'], ['no-cumple', 'no cumplen'], ['no-aplica', 'no aplican']]
      .map(([v, t]) => [cuenta(v), t]).filter(([k]) => k).map(([k, t]) => `${k} ${k === 1 ? t.replace(/n$/, '') : t}`);
    detalle.textContent = partes.length ? ` · ${partes.join(' · ')}` : '';
    borrar.hidden = !revisados;
    root.querySelectorAll('[data-ck-bloque]').forEach((sec) => {
      const lis = [...sec.querySelectorAll('.ck-punto')];
      const listos = lis.filter((li) => li.dataset.estado !== 'pendiente').length;
      sec.querySelector('[data-ck-avance]').textContent = `${listos} de ${lis.length}`;
      sec.classList.toggle('is-completo', listos === lis.length);
    });
  };
  const fija = (li, estado) => {
    if (estado === 'pendiente') delete marcas[li.dataset.n]; else marcas[li.dataset.n] = estado;
    guardar();
    pinta(li);
    resume();
  };

  puntos.forEach((li) => {
    li.querySelectorAll('button[disabled]').forEach((b) => { b.disabled = false; });
    pinta(li);
  });
  barra.hidden = false;
  if (window.EXPORTAR) botonPdf.hidden = false;
  resume();

  /* Para exportar: el nombre del archivo y el contenido, tal como se ve en la página */
  const hoy = () => new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
  const nombre = () => `${location.pathname.split('/').pop().replace(/\.html$/, '')}-${hoy()}`;
  const documento = () => {
    const vals = puntos.map((li) => li.dataset.estado);
    const revisados = vals.filter((v) => v !== 'pendiente').length;
    return {
      titulo: d.querySelector('h1').textContent.trim(),
      sub: `Transporte Autorizado · Checklist · ${hoy()}`,
      resumen: `${revisados} de ${puntos.length} puntos revisados${detalle.textContent}`,
      bloques: [...root.querySelectorAll('[data-ck-bloque]')].map((sec) => ({
        nombre: sec.querySelector('.ck-nombre').textContent.trim(),
        puntos: [...sec.querySelectorAll('.ck-punto')].map((li) => ({
          n: li.dataset.n, valor: li.dataset.estado, estado: NOMBRE[li.dataset.estado],
          texto: li.querySelector('.ck-criterio').textContent.replace(/^\d+/, '').trim(),
          detalle: li.querySelector('.ck-evidencia')?.textContent.trim() || ''
        }))
      }))
    };
  };

  root.addEventListener('click', async (e) => {
    const li = e.target.closest('.ck-punto');
    if (e.target.closest('.ck-marca') && li) {
      fija(li, li.dataset.estado === 'cumple' ? 'pendiente' : 'cumple');
      return;
    }
    if (e.target.closest('[data-ck-estado]') && li && window.Picker) {
      const v = await window.Picker.choose({
        title: `Punto ${li.dataset.n}`, sub: li.querySelector('.ck-criterio').textContent.replace(/^\d+/, '').trim(),
        groups: [{ options: ESTADOS.map(([value, label]) => ({ value, label })) }], value: li.dataset.estado, layout: 'list'
      });
      if (v) fija(li, v);
      li.querySelector('[data-ck-estado]').focus({ preventScroll: true });
      return;
    }
    if (e.target.closest('[data-ck-borrar]')) {
      const v = window.Picker
        ? await window.Picker.choose({ title: '¿Borrar todas las marcas?', sub: `Los ${puntos.length} puntos vuelven a quedar pendientes en este dispositivo.`, groups: [{ options: [{ value: 'si', label: 'Sí, borrar las marcas' }, { value: 'no', label: 'No, mantenerlas' }] }], layout: 'list' })
        : 'si';
      if (v !== 'si') return;
      marcas = {};
      guardar();
      puntos.forEach(pinta);
      resume();
      toast('Marcas borradas');
      return;
    }
    if (e.target.closest('[data-ck-pdf]')) {
      try { window.EXPORTAR.bajar(window.EXPORTAR.pdf(documento()), `${nombre()}.pdf`); } catch { toast('No se pudo armar el PDF. Inténtalo de nuevo.'); }
      return;
    }
    /* Excel: la planilla con las marcas; si este navegador no puede armarla, se descarga la planilla tal cual (el enlace) */
    const xls = e.target.closest('[data-ck-excel]');
    if (xls && window.EXPORTAR && !xls.dataset.directo) {
      e.preventDefault();
      try {
        const puntosMarcados = puntos.filter((li) => li.dataset.estado !== 'pendiente').map((li) => [li.dataset.n, li.dataset.estado, NOMBRE[li.dataset.estado]]);
        const blob = await window.EXPORTAR.excel({ url: xls.getAttribute('href'), formato: root.dataset.formato || 'cliente', puntos: puntosMarcados });
        window.EXPORTAR.bajar(blob, `${nombre()}.xlsx`);
      } catch {
        xls.dataset.directo = '1';
        xls.click();
        delete xls.dataset.directo;
      }
    }
  });
})();
