/* Transporte Autorizado: datos y utilidades compartidos por el formulario del hero y el asistente.
   Buscan que la persona seleccione en vez de escribir: categorías, cantidades por rango, región y comuna,
   días hábiles y franjas horarias. Se exponen en window.PICK. */
(() => {
  const d = document;

  /* Comunas de Chile por región (346). Se usan solo como sugerencias: la comuna se confirma al cotizar. */
  const REGIONS = {
    'Arica y Parinacota': 'Arica, Camarones, Putre, General Lagos',
    'Tarapacá': 'Iquique, Alto Hospicio, Pozo Almonte, Camiña, Colchane, Huara, Pica',
    'Antofagasta': 'Antofagasta, Mejillones, Sierra Gorda, Taltal, Calama, Ollagüe, San Pedro de Atacama, Tocopilla, María Elena',
    'Atacama': 'Copiapó, Caldera, Tierra Amarilla, Chañaral, Diego de Almagro, Vallenar, Alto del Carmen, Freirina, Huasco',
    'Coquimbo': 'La Serena, Coquimbo, Andacollo, La Higuera, Paiguano, Vicuña, Illapel, Canela, Los Vilos, Salamanca, Ovalle, Combarbalá, Monte Patria, Punitaqui, Río Hurtado',
    'Valparaíso': 'Valparaíso, Casablanca, Concón, Juan Fernández, Puchuncaví, Quintero, Viña del Mar, Isla de Pascua, Los Andes, Calle Larga, Rinconada, San Esteban, La Ligua, Cabildo, Papudo, Petorca, Zapallar, Quillota, La Calera, Hijuelas, La Cruz, Nogales, San Antonio, Algarrobo, Cartagena, El Quisco, El Tabo, Santo Domingo, San Felipe, Catemu, Llaillay, Panquehue, Putaendo, Santa María, Quilpué, Limache, Olmué, Villa Alemana',
    'Metropolitana': 'Santiago, Cerrillos, Cerro Navia, Conchalí, El Bosque, Estación Central, Huechuraba, Independencia, La Cisterna, La Florida, La Granja, La Pintana, La Reina, Las Condes, Lo Barnechea, Lo Espejo, Lo Prado, Macul, Maipú, Ñuñoa, Pedro Aguirre Cerda, Peñalolén, Providencia, Pudahuel, Quilicura, Quinta Normal, Recoleta, Renca, San Joaquín, San Miguel, San Ramón, Vitacura, Puente Alto, Pirque, San José de Maipo, Colina, Lampa, Tiltil, San Bernardo, Buin, Calera de Tango, Paine, Melipilla, Alhué, Curacaví, María Pinto, San Pedro, Talagante, El Monte, Isla de Maipo, Padre Hurtado, Peñaflor',
    "O'Higgins": 'Rancagua, Codegua, Coinco, Coltauco, Doñihue, Graneros, Las Cabras, Machalí, Malloa, Mostazal, Olivar, Peumo, Pichidegua, Quinta de Tilcoco, Rengo, Requínoa, San Vicente, Pichilemu, La Estrella, Litueche, Marchigüe, Navidad, Paredones, San Fernando, Chépica, Chimbarongo, Lolol, Nancagua, Palmilla, Peralillo, Placilla, Pumanque, Santa Cruz',
    'Maule': 'Talca, Constitución, Curepto, Empedrado, Maule, Pelarco, Pencahue, Río Claro, San Clemente, San Rafael, Cauquenes, Chanco, Pelluhue, Curicó, Hualañé, Licantén, Molina, Rauco, Romeral, Sagrada Familia, Teno, Vichuquén, Linares, Colbún, Longaví, Parral, Retiro, San Javier, Villa Alegre, Yerbas Buenas',
    'Ñuble': 'Chillán, Bulnes, Chillán Viejo, El Carmen, Pemuco, Pinto, Quillón, San Ignacio, Yungay, Quirihue, Cobquecura, Coelemu, Ninhue, Portezuelo, Ránquil, Treguaco, San Carlos, Coihueco, Ñiquén, San Fabián, San Nicolás',
    'Biobío': 'Concepción, Coronel, Chiguayante, Florida, Hualqui, Lota, Penco, San Pedro de la Paz, Santa Juana, Talcahuano, Tomé, Hualpén, Lebu, Arauco, Cañete, Contulmo, Curanilahue, Los Álamos, Tirúa, Los Ángeles, Antuco, Cabrero, Laja, Mulchén, Nacimiento, Negrete, Quilaco, Quilleco, San Rosendo, Santa Bárbara, Tucapel, Yumbel, Alto Biobío',
    'Araucanía': 'Temuco, Carahue, Cunco, Curarrehue, Freire, Galvarino, Gorbea, Lautaro, Loncoche, Melipeuco, Nueva Imperial, Padre Las Casas, Perquenco, Pitrufquén, Pucón, Saavedra, Teodoro Schmidt, Toltén, Vilcún, Villarrica, Cholchol, Angol, Collipulli, Curacautín, Ercilla, Lonquimay, Los Sauces, Lumaco, Purén, Renaico, Traiguén, Victoria',
    'Los Ríos': 'Valdivia, Corral, Lanco, Los Lagos, Máfil, Mariquina, Paillaco, Panguipulli, La Unión, Futrono, Lago Ranco, Río Bueno',
    'Los Lagos': 'Puerto Montt, Calbuco, Cochamó, Fresia, Frutillar, Los Muermos, Llanquihue, Maullín, Puerto Varas, Castro, Ancud, Chonchi, Curaco de Vélez, Dalcahue, Puqueldón, Queilén, Quellón, Quemchi, Quinchao, Osorno, Puerto Octay, Purranque, Puyehue, Río Negro, San Juan de la Costa, San Pablo, Chaitén, Futaleufú, Hualaihué, Palena',
    'Aysén': "Coyhaique, Lago Verde, Aysén, Cisnes, Guaitecas, Cochrane, O'Higgins, Tortel, Chile Chico, Río Ibáñez",
    'Magallanes': 'Punta Arenas, Laguna Blanca, Río Verde, San Gregorio, Cabo de Hornos, Antártica, Porvenir, Primavera, Timaukel, Natales, Torres del Paine'
  };
  /* Metropolitana primero (concentra la mayor parte de los retiros); luego de norte a sur */
  const REGION_NAMES = ['Metropolitana', ...Object.keys(REGIONS).filter((r) => r !== 'Metropolitana')];
  const regionLabel = (r) => (r === 'Metropolitana' ? 'Región Metropolitana' : r);
  const communesOf = (region) => (REGIONS[region] || '').split(', ').filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'));
  const fold = (v) => String(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es-CL').trim();
  const COMMUNES = Object.entries(REGIONS).flatMap(([region, list]) => list.split(', ').map((name) => ({ name, region, key: fold(name) })));

  /* Días hábiles (lunes a sábado) desde mañana */
  const WD = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const WD_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const iso = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  const days = (count = 12, from = 1) => {
    const out = [];
    const dt = new Date();
    dt.setHours(12, 0, 0, 0);
    dt.setDate(dt.getDate() + from);
    while (out.length < count) {
      if (dt.getDay() !== 0) {
        out.push({
          value: iso(dt), wd: WD[dt.getDay()], day: dt.getDate(), month: MONTHS[dt.getMonth()],
          long: `${WD_LONG[dt.getDay()]} ${dt.getDate()} de ${MONTHS_LONG[dt.getMonth()]}`
        });
      }
      dt.setDate(dt.getDate() + 1);
    }
    return out;
  };
  const longDate = (value) => {
    const [y, m, dd] = value.split('-').map(Number);
    const dt = new Date(y, m - 1, dd, 12);
    return `${WD_LONG[dt.getDay()]} ${dd} de ${MONTHS_LONG[m - 1]}`;
  };

  /* [nombre, lo que se ve en la opción, cómo queda en el resumen (si difiere)]. El horario vespertino (de noche) no se
     promete: siempre queda sujeto a confirmación y la opción lo dice (pedido del cliente, 08-10-2026) */
  const SLOTS = [
    ['Mañana', '8:00 a 13:00'],
    ['Tarde', '13:00 a 18:00'],
    ['Vespertino', 'De noche · sujeto a confirmación', 'de noche, sujeto a confirmación'],
    ['Cualquier horario', 'Dentro de la jornada']
  ];
  const slotText = (name) => {
    const s = SLOTS.find(([t]) => t === name);
    return s && name !== 'Cualquier horario' ? `${s[0]} (${s[2] || s[1]})` : name;
  };
  const HOURS = Array.from({ length: 15 }, (_, i) => `${i + 6}:00`);

  /* Categorías del listado de transportistas (misma fuente que el buscador) con su miniatura en assets/transporte/cat/ */
  const CATEGORIES = {
    safe: [
      ['Aceites y grasas', 'np-aceites-grasas'], ['Construcción y demolición', 'np-construccion-demolicion'],
      ['Lodos y aguas', 'np-lodos-aguas'], ['Madera', 'np-madera'], ['Metales', 'np-metales'],
      ['Neumáticos y caucho', 'np-neumaticos-caucho'], ['Orgánicos y alimentos', 'np-organicos-alimentos'],
      ['Papel y cartón', 'np-papel-carton'], ['Plásticos', 'np-plasticos'], ['RAEE y electrónicos', 'np-raee-electronicos'],
      ['Textiles y cuero', 'np-textiles-cuero'], ['Vidrio', 'np-vidrio'], ['Otros residuos no peligrosos', 'np-otros-residuos']
    ],
    hazard: [
      ['Aceites e hidrocarburos', 'p-aceites-hidrocarburos'], ['Asbesto', 'p-asbesto'], ['Baterías y pilas', 'p-baterias-pilas'],
      ['Envases y materiales contaminados', 'p-envases-materiales-contaminados'], ['Gases y refrigerantes', 'p-gases-refrigerantes'],
      ['Lodos, aguas y suelos', 'p-lodos-aguas-suelos'], ['Metales y metales pesados', 'p-metales-pesados'],
      ['Químicos, solventes y pinturas', 'p-quimicos-solventes-pinturas'], ['RAEE, luminarias y mercurio', 'p-raee-luminarias-mercurio'],
      ['Residuos clínicos y farmacéuticos', 'p-residuos-clinicos-farmaceuticos']
    ]
  };

  /* Cantidades por rango (como en la versión anterior del sitio): se eligen sin escribir */
  const AMOUNTS = ['Hasta 100 kg o L', '100 a 500 kg o L', '500 a 2.000 kg o L', 'Más de 2.000 kg o L', 'Aún no lo sé'];
  const shortAmount = (a) => a.replace(' kg o L', '');

  /* Opciones y etiquetas comunes del formulario y el asistente */
  const ic = (d) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const bars = (n) => ic([0, 1, 2, 3].map((i) => `<path d="M${5 + i * 4.5} 19v-${4 + i * 3}"${i < n ? '' : ' opacity=".25"'}/>`).join(''));
  const ICONS = {
    help: ic('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>'),
    grid: ic('<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>'),
    edit: ic('<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>'),
    sun: ic('<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>'),
    sunset: ic('<path d="M12 10V2"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m16 6-4 4-4-4"/><path d="M16 18a4 4 0 0 0-8 0"/>'),
    clock: ic('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
    moon: ic('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>')
  };
  const AMOUNT_ICONS = [bars(1), bars(2), bars(3), bars(4), ICONS.help];
  const STORAGE = [
    ['Sacos', ic('<path d="M8.5 4h7l-1.6 3.2c2.8 1.4 4.3 4.3 3.8 7.8A4 4 0 0 1 13.8 18h-3.6a4 4 0 0 1-3.9-3c-.5-3.5 1-6.4 3.8-7.8z"/>')],
    ['Tambores', ic('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/>')],
    ['Bins', ic('<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>')],
    ['Contenedor', ic('<path d="M22 7.7c0-.6-.4-1.2-.8-1.5l-6.3-3.9a1.72 1.72 0 0 0-1.7 0l-10.3 6c-.5.2-.9.8-.9 1.4v6.6c0 .5.4 1.2.8 1.5l6.3 3.9a1.72 1.72 0 0 0 1.7 0l10.3-6c.5-.3.9-1 .9-1.5Z"/><path d="M10 21.9V14L2.1 9.1"/><path d="m10 14 11.9-6.9"/><path d="M14 19.8v-8.1"/><path d="M18 17.5V9.4"/>')],
    ['A granel', ic('<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>')],
    ['Otro', ic('<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>')]
  ];
  const STATES = ['Sólido', 'Líquido', 'Lodo', 'Mixto'];
  /* Almacenamiento posible según el estado del residuo (cliente, 22-10-2026): al elegir el estado, el resto se oculta */
  const STORAGE_BY_STATE = { 'Sólido': ['Sacos', 'Contenedor', 'A granel', 'Otro'], 'Líquido': ['Tambores', 'Bins', 'Otro'], 'Lodo': ['Tambores', 'Bins', 'Otro'], 'Mixto': ['Tambores', 'Bins', 'Otro'] };
  const DOCS = ['HDS/FDS del producto original', 'HDSR u hoja del residuo', 'Análisis o caracterización', 'Sin documentos por ahora'];
  const ACCESS = ['Acceso restringido para camión', 'Bodega subterránea', 'Altura máxima', 'Grúa requerida', 'Horario de carga definido', 'Otra condición'];
  /* Las opciones «Otro», «Otra…» despliegan un campo para escribir cuál (seleccion.js) */
  const isOther = (label) => /^Otr[oa]s?\b/.test(label);
  /* «Otro: jaulas» → ['Otro', 'jaulas'] */
  const splitOther = (v) => { const at = String(v || '').indexOf(': '); return at < 0 ? [v || '', ''] : [v.slice(0, at), v.slice(at + 2)]; };
  const joinOther = (base, text) => (base && text ? `${base}: ${text}` : base || '');
  const SERVICES = [['retiro', 'Retiro de residuos'], ['contenedores', 'Arriendo de contenedores'], ['rep', 'Gestión REP y productos prioritarios'], ['marcas', 'Destrucción de marcas'], ['reas', 'Gestión de REAS'], ['patios', 'Limpieza y patios de residuos']];
  /* Arriendo de contenedores: primero el período, después el residuo y recién entonces el contenedor */
  const PERIODS = [['mensual', 'Mensual'], ['semanal', 'Semanal'], ['diario', 'Diario']];
  /* Vehículos y contenedores que se pueden pedir. Cada uno dice con qué tipo de residuo está disponible
     (tipos: 'no-peligroso', 'peligroso'); con otro tipo se muestra, pero no se puede elegir.
     NO INVENTAR: la lista la entrega el cliente. Vacía, la fila correspondiente no aparece en el formulario.
     Vehículos: lista del cliente (09-10-2026), sin distinción por tipo de residuo ni capacidades: todos quedan
     disponibles para ambos tipos y sin descripción. La primera opción deja la elección al equipo.
     Contenedores: el cliente todavía no entrega la lista. */
  const AMBOS = ['no-peligroso', 'peligroso'];
  const VEHICLES = [
    { label: 'Elijan ustedes', hint: 'Lo definimos según tu residuo y la cantidad', tipos: AMBOS },
    ...['Camión ampliroll (hook lift)', 'Camión cerrado 3/4', 'Camión recolector/compactador de residuos trasero', 'Camioneta', 'Camión doble', 'Camión con acoplado', 'Camión cerrado de mayor tamaño']
      .map((label) => ({ label, tipos: AMBOS }))
  ];
  const CONTAINERS = [];
  const allowed = (item, tipo) => !tipo || tipo === 'no-se' || item.tipos.includes(tipo);
  const TIPO_LABEL = { 'no-peligroso': 'No peligroso', peligroso: 'Peligroso', 'no-se': 'No lo sé' };
  const MODE_LABEL = { express: 'Retiro Express', programado: 'Retiro Programado', flexible: 'Espera y ahorra' };
  const SLOT_ICONS = { 'Mañana': ICONS.sun, 'Tarde': ICONS.sunset, 'Vespertino': ICONS.moon, 'Cualquier horario': ICONS.clock };
  const thumb = (file) => `${window.SITE_ROOT || ''}assets/transporte/cat/residuo-${file}.webp`;
  const WD_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const shortDate = (value) => {
    const [y, m, dd] = value.split('-').map(Number);
    return `${WD_SHORT[new Date(y, m - 1, dd, 12).getDay()]} ${dd} ${MONTH_SHORT[m - 1]}`;
  };

  /* Comunas donde hoy se coordinan retiros (cliente, 16-10-2026). Sobre WordPress las fija el plugin («Comunas que se
     atienden», window.TA_API.comunas). Solo se aceptan nombres de la Región Metropolitana. */
  const COBERTURA_BASE = ['Quilicura', 'Lampa', 'Pudahuel'];
  const RM = communesOf('Metropolitana');
  const pedidas = Array.isArray(window.TA_API?.comunas) && window.TA_API.comunas.length ? window.TA_API.comunas : COBERTURA_BASE;
  const COBERTURA = RM.filter((c) => pedidas.includes(c));
  const enCobertura = (c) => COBERTURA.includes(c);
  const coberturaTexto = COBERTURA.length > 1 ? `${COBERTURA.slice(0, -1).join(', ')} y ${COBERTURA[COBERTURA.length - 1]}` : COBERTURA[0] || '';

  window.PICK = { COBERTURA, enCobertura, coberturaTexto, CATEGORIES, AMOUNTS, shortAmount, ICONS, AMOUNT_ICONS, STORAGE, STATES, STORAGE_BY_STATE, DOCS, ACCESS, SERVICES, PERIODS, VEHICLES, CONTAINERS, allowed, TIPO_LABEL, MODE_LABEL, SLOT_ICONS, slotText, isOther, splitOther, joinOther, thumb, shortDate, REGIONS, REGION_NAMES, regionLabel, communesOf, COMMUNES, days, longDate, SLOTS, HOURS, fold };
})();
