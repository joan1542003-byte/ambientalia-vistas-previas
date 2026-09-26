/* Transporte Autorizado: interpreta lo que la persona escribe en el chat del hero, sin IA ni servicios externos.
   Reconoce por palabras clave: urgencia y modalidad, residuo (categoría y tipo), cantidad, comuna, día, horario,
   almacenamiento, documentos y la intención (retiro, buscar transportista o hablar con un especialista).
   Lo que no reconoce se pregunta después con opciones. Expone window.PARSE. */
(() => {
  const PICK = window.PICK;
  if (!PICK) return;
  /* Minúsculas sin tildes; la puntuación se quita salvo los separadores dentro de números (1.500, 2,5) */
  const fold = (v) => PICK.fold(v).replace(/(?<!\d)[.,](?!\d)|[.,](?!\d)|(?<!\d)[.,]|[¿?¡!;:()"]/g, ' ').replace(/\s+/g, ' ').trim();

  /* Categorías: primero las peligrosas más específicas, luego las no peligrosas */
  const CATEGORY_RULES = [
    ['peligroso', 'Asbesto', /asbesto|amianto|pizarreno|fibrocemento/],
    ['peligroso', 'Baterías y pilas', /bateria|\bpilas?\b/],
    ['peligroso', 'RAEE, luminarias y mercurio', /fluorescente|luminaria|ampolleta|mercurio|tubos? de luz/],
    ['peligroso', 'Residuos clínicos y farmacéuticos', /clinic|hospital|medicament|farmac|jeringa|\breas\b|sanitari|cortopunzante/],
    ['peligroso', 'Gases y refrigerantes', /refrigerante|\bgas(es)?\b|cilindro|extintor/],
    ['peligroso', 'Químicos, solventes y pinturas', /quimic|solvente|pintura|tinta|acido|reactivo|diluyente|thinner|barniz/],
    ['peligroso', 'Lodos, aguas y suelos', /suelo|(lodo|agua)s? (contaminad|peligros)/],
    ['peligroso', 'Aceites e hidrocarburos', /aceite (usado|de motor|lubricante|quemado|hidraulico)|lubricante|hidrocarburo|petroleo|diesel|bencina|combustible/],
    ['peligroso', 'Metales y metales pesados', /metales? pesados?|plomo|cromo|cadmio/],
    ['peligroso', 'Envases y materiales contaminados', /contaminad|huaipe|trapo|absorbente|envases? (con|de) (quimic|aceite|pintura)/],
    ['no-peligroso', 'Aceites y grasas', /aceite (vegetal|de cocina|comestible)|grasa/],
    ['no-peligroso', 'Construcción y demolición', /escombro|construcc|demolic|hormigon|ladrillo|yeso|ceramica/],
    ['no-peligroso', 'Lodos y aguas', /\blodos?\b|aguas? (servidas?|residual)|fosa/],
    ['no-peligroso', 'Madera', /madera|pallet|palet|tarima/],
    ['no-peligroso', 'Metales', /metal|chatarra|fierro|acero|aluminio|cobre/],
    ['no-peligroso', 'Neumáticos y caucho', /neumatic|llanta|caucho/],
    ['no-peligroso', 'Orgánicos y alimentos', /organic|comida|aliment|poda|compost/],
    ['no-peligroso', 'Papel y cartón', /carton|papel|cajas?\b/],
    ['no-peligroso', 'Plásticos', /plastic|\bfilm\b|\bpet\b|botellas?\b/],
    ['no-peligroso', 'RAEE y electrónicos', /electronic|computador|\braee\b|notebook|celular|impresora|monitor|televisor/],
    ['no-peligroso', 'Textiles y cuero', /textil|\bropa\b|\btela|cuero|uniforme/],
    ['no-peligroso', 'Vidrio', /vidrio|cristal/]
  ];

  /* Cantidad: número y unidad. Kilos, toneladas, litros y m³ se ubican además en un rango. */
  const QTY = /(\d{1,3}(?:[.\s]\d{3})+|\d+(?:[.,]\d+)?)\s*(toneladas?|tons?\b|t\b|kilos?|kgs?\b|k\b|litros?|lts?\b|l\b|m3|m³|metros? cubicos?|tambores?|sacos?|bins?\b|contenedores?|unidades?|pallets?|cajas?|bolsas?)/;
  const rangeOf = (n) => (n <= 100 ? PICK.AMOUNTS[0] : n <= 500 ? PICK.AMOUNTS[1] : n <= 2000 ? PICK.AMOUNTS[2] : PICK.AMOUNTS[3]);
  const quantity = (t) => {
    const m = t.match(QTY);
    if (!m) return null;
    const n = Number(m[1].replace(/[.\s](?=\d{3}\b)/g, '').replace(',', '.'));
    const unit = m[2];
    const shown = m[1].replace(/\s/g, '.');
    let base = null;
    let label = '';
    if (/^(toneladas?|tons?|t)$/.test(unit)) { base = n * 1000; label = `${shown} ${n === 1 ? 'tonelada' : 'toneladas'}`; }
    else if (/^(kilos?|kgs?|k)$/.test(unit)) { base = n; label = `${shown} kg`; }
    else if (/^(litros?|lts?|l)$/.test(unit)) { base = n; label = `${shown} litros`; }
    else if (/^(m3|m³|metros? cubicos?)$/.test(unit)) { base = n * 1000; label = `${shown} m³`; }
    else label = `${shown} ${unit}`;
    return { label, range: base == null ? '' : rangeOf(base) };
  };

  /* Comunas: la coincidencia más larga gana; nombres que también son palabras comunes exigen «en …» o «comuna de …» */
  const AMBIGUOUS = new Set(['retiro', 'pica', 'laja', 'florida', 'colina', 'pinto', 'olivar', 'tome', 'primavera', 'navidad', 'canela', 'cisnes', 'victoria', 'porvenir', 'independencia', 'providencia', 'molina', 'castro', 'algarrobo', 'la cruz', 'el bosque', 'la union', 'maule', 'teno', 'lota']);
  /* Solo se reconocen comunas de la Región Metropolitana; si se nombra otra, se avisa (fueraDeCobertura) */
  const byLength = (list) => [...list].sort((a, b) => b.key.length - a.key.length);
  const COMMUNES = byLength(PICK.COMMUNES.filter((c) => c.region === 'Metropolitana'));
  const OTHERS = byLength(PICK.COMMUNES.filter((c) => c.region !== 'Metropolitana'));
  const commune = (t, list = COMMUNES) => {
    const padded = ` ${t} `;
    for (const c of list) {
      for (let at = padded.indexOf(` ${c.key} `); at > -1; at = padded.indexOf(` ${c.key} `, at + 1)) {
        if (AMBIGUOUS.has(c.key) && !/(?:\ben|comuna de|comuna)\s$/.test(padded.slice(0, at + 1))) continue;
        return { commune: c.name, region: c.region };
      }
    }
    return null;
  };

  /* Día: mañana, pasado mañana, un día de la semana o una fecha (28 de septiembre, 28/09) */
  const WEEK = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const iso = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  const day = (t) => {
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const shift = (n) => { const dt = new Date(today); dt.setDate(dt.getDate() + n); return dt; };
    let dt = null;
    if (/pasado manana/.test(t)) dt = shift(2);
    else if (/(?<!\bla )\bmanana\b/.test(t)) dt = shift(1);
    else {
      const w = t.match(/\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/);
      const m = t.match(/\b(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/) || t.match(/\b(\d{1,2})[/-](\d{1,2})\b/);
      if (m) {
        const month = Number.isNaN(Number(m[2])) ? MONTHS.indexOf(m[2]) : Number(m[2]) - 1;
        dt = new Date(today.getFullYear(), month, Number(m[1]), 12);
        if (dt < shift(1)) dt.setFullYear(dt.getFullYear() + 1);
      } else if (w) {
        const target = WEEK.indexOf(w[1]);
        let n = (target - today.getDay() + 7) % 7;
        if (n === 0) n = 7;
        dt = shift(n);
      }
    }
    if (!dt) return null;
    if (dt.getDay() === 0) return { error: 'Los domingos no coordinamos retiros. Elige otro día.' };
    if (dt < shift(1) || dt > shift(92)) return { error: 'Ese día está fuera del calendario disponible. Elige otro.' };
    return { value: iso(dt) };
  };

  const slot = (t) => {
    if (/(?:en|por|a|de|durante) la manana|\bam\b|temprano/.test(t)) return 'Mañana';
    if (/(?:en|por|a|de|durante) la tarde|\bpm\b/.test(t)) return 'Tarde';
    if (/cualquier (?:hora|horario|momento)|todo el dia/.test(t)) return 'Cualquier horario';
    const r = t.match(/\b(?:de|entre|desde)?\s*(\d{1,2})(?::(\d{2}))?\s*(?:a|y|-|hasta)\s*(\d{1,2})(?::(\d{2}))?\s*(?:hrs?|horas)?\b/);
    if (r && Number(r[1]) >= 6 && Number(r[3]) <= 21 && Number(r[3]) > Number(r[1])) return `Entre ${Number(r[1])}:${r[2] || '00'} y ${Number(r[3])}:${r[4] || '00'}`;
    return '';
  };

  const mode = (t) => {
    if (/sin apuro|no es urgente|no urge|sin prisa|flexible|cuando puedan|ahorr|mas barato|economic/.test(t)) return 'flexible';
    if (/urgent|urgencia|emergencia|lo antes posible|cuanto antes|\bhoy\b|inmediat|\bya\b|rapido|pronto/.test(t)) return 'express';
    if (/mensual|cada mes|todos los meses|periodic|programad|contrato|semanal|cada semana/.test(t)) return 'programado';
    return '';
  };

  const storage = (t) => {
    if (/\bsacos?\b|maxisaco|big bag/.test(t)) return 'Sacos';
    if (/tambor/.test(t)) return 'Tambores';
    if (/\bbins?\b/.test(t)) return 'Bins';
    if (/contenedor|container|tolva/.test(t)) return 'Contenedor';
    if (/granel|suelto/.test(t)) return 'A granel';
    return '';
  };

  const docs = (t) => {
    const out = [];
    if (/\bhds\b|\bfds\b|hoja de (?:datos de )?seguridad|ficha de seguridad/.test(t)) out.push('HDS/FDS');
    if (/analisis|caracterizacion/.test(t)) out.push('Análisis');
    if (/no tengo|sin (?:documento|papel|hds)|ningun documento/.test(t)) return ['No tengo'];
    return out;
  };

  /* Intención: cada grupo de palabras clave suma puntos para cotizar, buscar o hablar; gana el mayor.
     Empate: cotizar (el retiro es el servicio principal). */
  const INTENTS = {
    hablar: [
      [4, /\b(hablar|conversar|llamar|llamen|llamada|llamarme|whatsapp|wsp|wasap|especialista|asesor|asesoria|asesorar|ejecutivo|vendedor|experto|humano|una persona|alguien)\b/],
      [3, /\b(contacto|contactar|contactarme|comunicarme|atencion|orientacion|orientar|oriente|ayuda|ayudar|ayudame|ayudenme|duda|dudas|consulta|consultar|pregunta|preguntar)\b/],
      [3, /no se (que|como|si|donde|cual)|como (clasifico|clasificar|se clasifica|lo hago|funciona|manejo)|que (hago|debo hacer) con|es peligroso\b/]
    ],
    buscar: [
      [4, /\b(busco|buscar|buscando|busca|encontrar|encuentro|listado|lista|directorio|catalogo|proveedor(es)?|comparar|opciones de)\b/],
      [3, /\btransportistas?\b|\bgestor(es)?\b|empresas? (autorizada|que retira|de retiro|transportista)|autorizad[oa]s? (para|en)|quien(es)? retira|resolucion sanitaria|registro/]
    ],
    cotizar: [
      [4, /\b(cotizar|cotizacion|cotizaciones|cotiza|cotice|presupuesto|precio|precios|valor|costo|costos|tarifa|tarifas|cuanto (cuesta|sale|vale|cobran))\b/],
      [3, /\b(retiro|retiros|retirar|retiren|retirarlo|sacar|saquen|llevar|lleven|recoger|recojan|recoleccion|eliminar|deshacerme|botar|desechar|disponer|disposicion|gestionar)\b/],
      [2, /\b(urgente|urgencia|mensual|programar|programado|plan)\b/]
    ]
  };
  const score = (t, rules) => rules.reduce((n, [w, re]) => n + (re.test(t) ? w : 0), 0);
  const intent = (t, hasData) => {
    const pts = Object.fromEntries(Object.entries(INTENTS).map(([k, rules]) => [k, score(t, rules)]));
    if (hasData) pts.cotizar += 2;
    const best = ['cotizar', 'buscar', 'hablar'].reduce((a, b) => (pts[b] > pts[a] ? b : a));
    return { route: pts[best] ? best : 'cotizar', points: pts };
  };
  /* Tema sugerido para el especialista a partir del texto */
  const topic = (t) => {
    if (/urgent|emergencia|hoy|cuanto antes/.test(t)) return 'Necesito un retiro urgente';
    if (/peligros|quimic|aceite|bateria|asbesto|clinic/.test(t)) return 'Tengo un residuo peligroso';
    if (/mensual|periodic|cada mes|contrato/.test(t)) return 'Quiero retiros periódicos';
    if (/clasific|no se (que|cual)|que es/.test(t)) return 'No sé cómo clasificar mi residuo';
    return 'Otro tema';
  };

  const greeting = (t) => /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|alo|saludos)( .{0,12})?$/.test(t);

  const read = (text) => {
    const t = fold(text);
    const cat = CATEGORY_RULES.find(([, , re]) => re.test(t));
    const d = day(t);
    const qty = quantity(t);
    const route = intent(t, Boolean(qty || d));
    return {
      text: text.trim(),
      folded: t,
      greeting: greeting(t),
      intent: route.route,
      points: route.points,
      tema: topic(t),
      tipo: cat ? cat[0] : '',
      categoria: cat ? cat[1] : '',
      cantidad: qty,
      comuna: commune(t),
      fueraDeCobertura: commune(t) ? '' : commune(t, OTHERS)?.commune || '',
      modalidad: mode(t) || (d?.value ? 'programado' : ''),
      fecha: d?.value || '',
      fechaError: d?.error || '',
      horario: slot(t),
      almacenamiento: storage(t),
      documentos: docs(t)
    };
  };

  /* Comunas cuyo nombre contiene el texto (para cuando la persona escribe solo la comuna) */
  const communeSearch = (text) => {
    const k = fold(text);
    if (k.length < 3) return [];
    const exact = COMMUNES.filter((c) => c.key === k);
    return exact.length ? exact : COMMUNES.filter((c) => c.key.includes(k)).slice(0, 8);
  };

  window.PARSE = { read, communeSearch, quantity: (text) => quantity(fold(text)), day: (text) => day(fold(text)), slot: (text) => slot(fold(text)) };
})();
