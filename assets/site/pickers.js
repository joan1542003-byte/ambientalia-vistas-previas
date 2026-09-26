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

  const SLOTS = [
    ['Mañana', '8:00 a 13:00'],
    ['Tarde', '13:00 a 18:00'],
    ['Cualquier horario', 'Dentro de la jornada']
  ];
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
    help: ic('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17h.01"/>'),
    grid: ic('<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>'),
    edit: ic('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
    sun: ic('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>'),
    sunset: ic('<path d="M4 18h16M7 18a5 5 0 0 1 10 0M12 6v3M5.5 11.5l1.5 1M18.5 11.5l-1.5 1"/>'),
    clock: ic('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>')
  };
  const AMOUNT_ICONS = [bars(1), bars(2), bars(3), bars(4), ICONS.help];
  const STORAGE = [
    ['Sacos', ic('<path d="M8.5 4h7l-1.6 3.2c2.8 1.4 4.3 4.3 3.8 7.8A4 4 0 0 1 13.8 18h-3.6a4 4 0 0 1-3.9-3c-.5-3.5 1-6.4 3.8-7.8z"/>')],
    ['Tambores', ic('<ellipse cx="12" cy="5.5" rx="6" ry="2"/><path d="M6 5.5v13c0 1.1 2.7 2 6 2s6-.9 6-2v-13M6 10.5c0 1.1 2.7 2 6 2s6-.9 6-2M6 15c0 1.1 2.7 2 6 2s6-.9 6-2"/>')],
    ['Bins', ic('<path d="M4 8h16M6 8l1.1 11a2 2 0 0 0 2 1.8h5.8a2 2 0 0 0 2-1.8L18 8M9 8l1-4h4l1 4"/>')],
    ['Contenedor', ic('<rect x="3" y="7" width="18" height="11" rx="1.5"/><path d="M7.5 7v11M12 7v11M16.5 7v11"/>')],
    ['A granel', ic('<path d="M3 19c1.8-4.6 3.8-7.5 6-7.5 1.7 0 2.8 1.6 3.8 3.4.9-1.3 1.9-1.9 2.9-1.9 2 0 3.6 2.4 5.3 6z"/>')],
    ['Otro', ic('<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>')]
  ];
  const STATES = ['Sólido', 'Líquido', 'Lodo', 'Mixto'];
  const DOCS = ['HDS/FDS del producto original', 'FDSR u hoja del residuo', 'Análisis o caracterización', 'Sin documentos por ahora'];
  const ACCESS = ['Acceso restringido para camión', 'Bodega subterránea', 'Altura máxima', 'Grúa requerida', 'Horario de carga definido'];
  const SERVICES = [['retiro', 'Retiro de residuos'], ['rep', 'Gestión REP y productos prioritarios'], ['marcas', 'Destrucción de marcas'], ['reas', 'Gestión de REAS'], ['patios', 'Limpieza y patios de residuos']];
  const TIPO_LABEL = { 'no-peligroso': 'No peligroso', peligroso: 'Peligroso', 'no-se': 'No lo sé' };
  const MODE_LABEL = { express: 'Retiro Express', programado: 'Retiro Programado', flexible: 'Espera y ahorra' };
  const SLOT_ICONS = { 'Mañana': ICONS.sun, 'Tarde': ICONS.sunset, 'Cualquier horario': ICONS.clock };
  const thumb = (file) => `assets/transporte/cat/residuo-${file}.webp`;
  const WD_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const shortDate = (value) => {
    const [y, m, dd] = value.split('-').map(Number);
    return `${WD_SHORT[new Date(y, m - 1, dd, 12).getDay()]} ${dd} ${MONTH_SHORT[m - 1]}`;
  };

  window.PICK = { CATEGORIES, AMOUNTS, shortAmount, ICONS, AMOUNT_ICONS, STORAGE, STATES, DOCS, ACCESS, SERVICES, TIPO_LABEL, MODE_LABEL, SLOT_ICONS, thumb, shortDate, REGIONS, REGION_NAMES, regionLabel, communesOf, COMMUNES, days, longDate, SLOTS, HOURS, fold };
})();
