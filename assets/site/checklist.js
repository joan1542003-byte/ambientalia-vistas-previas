/* Checklist de autorización en línea (ayuda/checklist-autorizacion-transporte.html, lo genera tools/ayuda.py).
   Cada punto se marca con un toque en su círculo (Cumple ↔ Pendiente); sus otros estados (Por confirmar, No cumple,
   No aplica) se eligen en la ventana de selección del sitio. Las marcas quedan en este dispositivo (localStorage):
   si no se pueden guardar, el checklist funciona igual mientras la página esté abierta. «Guardar con mis marcas»
   imprime la página (o la guarda en PDF) con el estado de cada punto. */
(() => {
  const d = document;
  const root = d.querySelector('[data-checklist]');
  if (!root) return;
  const CLAVE = 'ta-checklist-autorizacion';
  const ESTADOS = JSON.parse(root.dataset.estados);           // [[valor, nombre]…]
  const NOMBRE = Object.fromEntries(ESTADOS);
  const puntos = [...root.querySelectorAll('.ck-punto')];
  const barra = root.querySelector('[data-ck-barra]');
  const hechos = root.querySelector('[data-ck-hechos]');
  const detalle = root.querySelector('[data-ck-detalle]');
  const progreso = root.querySelector('[data-ck-progreso]');
  const borrar = root.querySelector('[data-ck-borrar]');
  const imprimir = root.querySelector('[data-ck-imprimir]');
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
  imprimir.hidden = false;
  resume();

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
        ? await window.Picker.choose({ title: '¿Borrar todas las marcas?', sub: 'Los 50 puntos vuelven a quedar pendientes en este dispositivo.', groups: [{ options: [{ value: 'si', label: 'Sí, borrar las marcas' }, { value: 'no', label: 'No, mantenerlas' }] }], layout: 'list' })
        : 'si';
      if (v !== 'si') return;
      marcas = {};
      guardar();
      puntos.forEach(pinta);
      resume();
      toast('Marcas borradas');
      return;
    }
    if (e.target.closest('[data-ck-imprimir]')) window.print();
  });
})();
