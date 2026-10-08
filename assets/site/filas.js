/* HDS y Campañas: filas que abren una ventana de selección (seleccion.js), declaradas en el propio HTML.
   Es el mismo lenguaje del formulario de Transporte, sin código por página: cada fila dice qué ventana abre y el dato
   vive en un campo dentro de ella (un <select> oculto o un campo oculto), así el resumen, los campos condicionales
   (data-show-when) y la preselección (data-set) de site.js siguen funcionando igual.

   <div class="pick" data-fila="…" data-title="…" data-sub="…"> con un .pick-btn y, según el tipo:
   - opciones: <select hidden> con las opciones (data-hint en cada <option> agrega una línea). Una se elige con un toque.
   - varias:   <input type="hidden"> y data-options="A|B|C" (data-exclusive="C" si una opción excluye a las demás).
   - fecha:    <input type="hidden">; calendario de un día (data-hasta="365": hasta cuántos días desde hoy).
   - comuna:   <input type="hidden" name="comuna"> y, si se quiere, otro name="region": todas las comunas de Chile.
   - texto:    <input type="hidden">; data-placeholder, data-maxlength y data-optional.
   Una opción que empieza con «Otro», «Otra» u «Otros» despliega un campo para escribir cuál (opciones y varias); lo
   escrito queda como «Otro: …» en la fila, en el resumen y en los mensajes de WhatsApp.
   Además, .seg[data-seg="campo"] es un grupo de botones de un toque en la misma fila (como «Tipo de retiro»). */
(() => {
  const d = document;
  const PICK = window.PICK;
  const Picker = window.Picker;
  if (!PICK || !Picker) return;
  const motion = matchMedia('(prefers-reduced-motion: no-preference)');
  const card = d.querySelector('.hcard');
  const fieldOf = (row) => row.querySelector('select, input[type="hidden"]');
  const sorted = (picked, all) => all.filter((x) => picked.includes(x));

  /* Fecha larga con año: una campaña puede quedar para el año siguiente */
  const fecha = (v) => `${PICK.longDate(v)} de ${v.slice(0, 4)}`;

  /* Texto visible de cada fila y estado de los botones de un toque */
  const paint = () => {
    d.querySelectorAll('[data-fila]').forEach((row) => {
      const f = fieldOf(row);
      const out = row.querySelector('.pick-value');
      if (!f || !out) return;
      const chosen = f.tagName === 'SELECT' ? f.selectedOptions[0] : null;
      const text = chosen ? chosen.textContent.trim() : (f.dataset.text || f.value);
      out.textContent = text || out.dataset.empty || '';
      out.classList.toggle('is-empty', !f.value);
    });
    d.querySelectorAll('.seg[data-seg]').forEach((seg) => {
      const f = seg.closest('.pick')?.querySelector(`[name="${seg.dataset.seg}"]`);
      if (!f) return;
      let on = null;
      seg.querySelectorAll('button').forEach((b) => {
        const is = b.dataset.value === f.value;
        b.setAttribute('aria-checked', String(is));
        if (is) on = b;
      });
      /* El resumen lee data-text: queda al día también cuando el valor lo puso un enlace (data-set) */
      if (on) f.dataset.text = on.textContent.trim(); else delete f.dataset.text;
    });
  };

  /* Guarda el valor y avisa con «change»: site.js aplica los campos condicionales y aquí se repinta la fila */
  const set = (f, value, text) => {
    f.value = value;
    if (f.tagName !== 'SELECT') { if (text) f.dataset.text = text; else delete f.dataset.text; }
    f.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const OPEN = {
    opciones: async (row, f) => {
      /* Una <option hidden> es solo el estado «sin elegir»: no se ofrece en la ventana.
         El texto original de cada opción se guarda en data-base: la de «Otro» puede mostrar además lo escrito */
      const opts = [...f.options].filter((o) => !o.hidden);
      opts.forEach((o) => { if (!o.dataset.base) o.dataset.base = o.textContent.trim(); });
      const r = await Picker.choose({
        title: row.dataset.title, sub: row.dataset.sub || '', layout: row.dataset.layout || 'list', value: f.value,
        otherText: f.selectedOptions[0]?.dataset.otro || '',
        groups: [{ options: opts.map((o) => ({ value: o.value, label: o.dataset.base, hint: o.dataset.hint || '', other: PICK.isOther(o.dataset.base) })) }]
      });
      if (r === undefined) return;
      const v = typeof r === 'object' ? r.value : r;
      opts.forEach((o) => {
        const texto = o.value === v && typeof r === 'object' ? r.text : '';
        if (texto) o.dataset.otro = texto; else delete o.dataset.otro;
        o.textContent = PICK.joinOther(o.dataset.base, texto);
      });
      set(f, v);
      /* Una opción puede decir qué valores de otro campo calzan con ella (data-con="servicio=fdsr|"): si el otro campo
         quedó con uno que no calza, pasa al primero de la lista y se avisa (p. ej., tipo «Residuo» → servicio FDSR) */
      const con = f.selectedOptions[0]?.dataset.con;
      if (!con) return;
      const [name, list] = con.split('=');
      const other = (f.form || d).querySelector(`select[name="${name}"]`);
      const ok = list.split('|');
      if (!other || ok.includes(other.value)) return;
      set(other, ok[0]);
      window.SITE.toast?.(`${other.dataset.label}: ${other.selectedOptions[0]?.textContent.trim()}`);
    },
    varias: async (row, f) => {
      const all = row.dataset.options.split('|');
      /* Lo guardado puede traer «Otro material: lo escrito» */
      const now = (f.value ? f.value.split(', ') : []).map(PICK.splitOther);
      const r = await Picker.choose({
        title: row.dataset.title, sub: row.dataset.sub || '', layout: 'list', multi: true,
        exclusive: row.dataset.exclusive ? row.dataset.exclusive.split('|') : [],
        otherText: now.find(([base]) => PICK.isOther(base))?.[1] || '',
        groups: [{ options: all.map((x) => ({ value: x, label: x, other: PICK.isOther(x) })) }], value: now.map(([base]) => base)
      });
      if (!r) return;
      const values = Array.isArray(r) ? r : r.values;
      const texto = Array.isArray(r) ? '' : r.text.replace(/,\s*/g, '; ');
      set(f, sorted(values, all).map((x) => (PICK.isOther(x) ? PICK.joinOther(x, texto) : x)).join(', '));
    },
    fecha: async (row, f) => {
      const v = await Picker.dates({
        title: row.dataset.title, sub: row.dataset.sub || '', value: f.value ? [f.value] : [],
        hasta: Number(row.dataset.hasta) || 92, domingos: row.hasAttribute('data-domingos')
      });
      if (v?.[0]) set(f, v[0], fecha(v[0]));
    },
    comuna: async (row, f) => {
      const v = await Picker.choose({
        title: row.dataset.title, sub: row.dataset.sub || '', search: 'Buscar comuna', layout: 'grid', value: f.value,
        groups: PICK.REGION_NAMES.map((r) => ({ label: PICK.regionLabel(r), options: PICK.communesOf(r).map((c) => ({ value: c, label: c })) }))
      });
      if (!v) return;
      const region = row.querySelector('[name="region"]');
      if (region) region.value = PICK.regionLabel(PICK.COMMUNES.find((c) => c.name === v)?.region || '');
      set(f, v);
    },
    texto: async (row, f) => {
      const optional = row.hasAttribute('data-optional');
      const v = await Picker.text({
        title: row.dataset.title, sub: row.dataset.sub || '', label: row.querySelector('.pick-label')?.textContent || row.dataset.title,
        value: f.value, placeholder: row.dataset.placeholder || '', maxlength: Number(row.dataset.maxlength) || 600, optional
      });
      if (v !== undefined && (v || optional)) set(f, v);
    }
  };

  d.addEventListener('click', (e) => {
    /* Botones de un toque */
    const b = e.target.closest('.seg[data-seg] button');
    if (b) {
      const row = b.closest('.pick');
      const f = row?.querySelector(`[name="${b.closest('.seg').dataset.seg}"]`);
      if (f) { set(f, b.dataset.value, b.textContent.trim()); row.removeAttribute('data-invalid'); }
      return;
    }
    const row = e.target.closest('.pick-btn')?.closest('[data-fila]');
    const f = row && fieldOf(row);
    if (!f || !OPEN[row.dataset.fila]) return;
    OPEN[row.dataset.fila](row, f).then(() => { if (f.value) row.removeAttribute('data-invalid'); });
  });

  /* Cualquier cambio dentro de la tarjeta (elegir una opción, un enlace que preselecciona) puede mostrar u ocultar filas:
     la tarjeta ajusta su alto con una animación corta, como al cambiar de paso. Se mide antes de que el cambio se aplique. */
  d.addEventListener('change', (e) => {
    if (!card?.contains(e.target) || !motion.matches || !card.animate || !card.getClientRects().length) return;
    const from = card.offsetHeight;
    requestAnimationFrame(() => {
      const to = card.offsetHeight;
      if (Math.abs(to - from) > 1) card.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 340, easing: 'cubic-bezier(.25, 1, .5, 1)' });
    });
  }, true);
  d.addEventListener('change', paint);
  /* Enlaces que suman una opción a una fila de varias (data-add="campo=Opción"), sin borrar lo ya elegido:
     p. ej., «Preparar la ficha» desde un material lo agrega a los materiales de la ficha */
  d.addEventListener('click', (e) => {
    const t = e.target.closest('[data-add]');
    if (!t) return;
    const [name, value] = t.dataset.add.split('=');
    d.querySelectorAll(`[name="${name}"]`).forEach((f) => {
      const row = f.closest('[data-fila="varias"]');
      const list = f.value ? f.value.split(', ') : [];
      if (!list.includes(value)) list.push(value);
      const all = row ? row.dataset.options.split('|') : [];
      /* Se ordena por la opción base, así «Otro material: …» conserva su lugar y su texto */
      set(f, row ? [...list].sort((a, b) => all.indexOf(PICK.splitOther(a)[0]) - all.indexOf(PICK.splitOther(b)[0])).join(', ') : list.join(', '));
      row?.removeAttribute('data-invalid');
      f.form?.goTo?.(0);
    });
  });
  /* Un botón de la tarjeta que elige un dato (data-set) puede desaparecer al elegirlo: el foco pasa a su panel */
  d.addEventListener('click', (e) => {
    const t = e.target.closest('.hcard [data-set]');
    if (t) requestAnimationFrame(() => { if (!t.getClientRects().length) t.closest('.hcard-panel')?.focus({ preventScroll: true }); });
  });

  /* Los formularios de la tarjeta cambian de paso con la misma transición del hero */
  card?.querySelectorAll('form[data-summary]').forEach((form) => {
    form.transition = (update) => (window.HERO ? window.HERO.transition(update) : Promise.resolve(update()));
  });

  /* «Qué incluye» y otros detalles: se leen en una ventana, con su acción al pie.
     <button data-ventana="id"> abre el contenido de <div id="id" hidden data-title="…" data-sub="…"> (queda en la página,
     oculto, para que el texto siga siendo parte de ella); el pie de la ventana es su hijo [data-pie]. Elegir la acción
     cierra la ventana. */
  d.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ventana]');
    const src = b && d.getElementById(b.dataset.ventana);
    if (!src) return;
    const body = src.cloneNode(true);
    const pie = body.querySelector('[data-pie]');
    pie?.remove();
    Picker.content({ title: src.dataset.title, sub: src.dataset.sub || '', html: `<div class="ventana-texto">${body.innerHTML}</div>`, links: pie ? pie.innerHTML : '' });
  });
  d.addEventListener('click', (e) => { if (e.target.closest('.picker-links a, .picker-links button')) Picker.close(); }, true);

  paint();
})();
