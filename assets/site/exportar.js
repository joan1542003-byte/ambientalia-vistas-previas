/* Exportar un checklist con las marcas de la persona (pedido del 23-10-2026: «la exportación de Excel debe ser en Excel,
   la de PDF debe ser en PDF»). Sin bibliotecas ni servidor: todo se arma en el navegador.
   - Excel: la misma planilla que entregó el cliente (formato, listas y colores intactos) con el estado de cada punto ya
     puesto y el resumen al día. El .xlsx es un zip: se abre, se cambia solo la hoja del checklist y se vuelve a cerrar.
     Dos formatos: «cliente» (columna «Estado» con Pendiente, Cumple, No cumple o No aplica; los diez del 22-10-2026) y
     «casillas» (☐/☑ en cinco columnas; el de autorización de 50 puntos).
   - PDF: un documento A4 con el título, la fecha, el resumen y cada punto con su estado (Helvetica, sin imágenes).
   Expone window.EXPORTAR = { excel, pdf, bajar }. */
(() => {
  /* ---------- Zip (lo justo para un .xlsx) ---------- */
  const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = (bytes) => { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

  const leerZip = (buf) => {
    const v = new DataView(buf);
    let fin = buf.byteLength - 22;
    while (fin >= 0 && v.getUint32(fin, true) !== 0x06054b50) fin -= 1;
    if (fin < 0) throw new Error('El archivo no es un zip');
    const total = v.getUint16(fin + 10, true);
    let p = v.getUint32(fin + 16, true);
    const entradas = [];
    for (let i = 0; i < total; i++) {
      if (v.getUint32(p, true) !== 0x02014b50) throw new Error('Directorio del zip dañado');
      const largoNombre = v.getUint16(p + 28, true);
      const e = {
        flags: v.getUint16(p + 8, true), metodo: v.getUint16(p + 10, true), hora: v.getUint16(p + 12, true), fecha: v.getUint16(p + 14, true),
        crc: v.getUint32(p + 16, true), comprimido: v.getUint32(p + 20, true), tamano: v.getUint32(p + 24, true),
        nombreBytes: new Uint8Array(buf, p + 46, largoNombre)
      };
      e.nombre = new TextDecoder().decode(e.nombreBytes);
      const local = v.getUint32(p + 42, true);
      const inicio = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      e.datos = new Uint8Array(buf, inicio, e.comprimido);
      entradas.push(e);
      p += 46 + largoNombre + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
    }
    return entradas;
  };

  const inflar = async (e) => {
    if (e.metodo === 0) return e.datos;
    if (e.metodo !== 8 || !('DecompressionStream' in window)) throw new Error('No se puede abrir la planilla en este navegador');
    return new Uint8Array(await new Response(new Blob([e.datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  };

  /* Vuelve a armar el zip: las entradas sin cambios van tal cual (comprimidas); las cambiadas, guardadas sin comprimir */
  const escribirZip = (entradas) => {
    const partes = [];
    const central = [];
    let pos = 0;
    const cabecera = (tam) => { const b = new Uint8Array(tam); return [b, new DataView(b.buffer)]; };
    entradas.forEach((e) => {
      const flags = e.flags & 0x0800;  // sin descriptor de datos: los tamaños van en la cabecera
      const [l, lv] = cabecera(30);
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, flags, true); lv.setUint16(8, e.metodo, true);
      lv.setUint16(10, e.hora, true); lv.setUint16(12, e.fecha, true); lv.setUint32(14, e.crc, true);
      lv.setUint32(18, e.datos.length, true); lv.setUint32(22, e.tamano, true); lv.setUint16(26, e.nombreBytes.length, true); lv.setUint16(28, 0, true);
      const [c, cv] = cabecera(46);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, flags, true); cv.setUint16(10, e.metodo, true);
      cv.setUint16(12, e.hora, true); cv.setUint16(14, e.fecha, true); cv.setUint32(16, e.crc, true); cv.setUint32(20, e.datos.length, true);
      cv.setUint32(24, e.tamano, true); cv.setUint16(28, e.nombreBytes.length, true); cv.setUint32(42, pos, true);
      partes.push(l, e.nombreBytes, e.datos);
      central.push(c, e.nombreBytes);
      pos += 30 + e.nombreBytes.length + e.datos.length;
    });
    const tamCentral = central.reduce((s, b) => s + b.length, 0);
    const [f, fv] = cabecera(22);
    fv.setUint32(0, 0x06054b50, true); fv.setUint16(8, entradas.length, true); fv.setUint16(10, entradas.length, true);
    fv.setUint32(12, tamCentral, true); fv.setUint32(16, pos, true);
    return new Blob([...partes, ...central, f], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  };

  /* ---------- Excel ---------- */
  const P = '(?:\\w+:)?';  // la planilla puede usar el prefijo «x:» en sus etiquetas
  const escXml = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const hoy = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`; };

  /* Una celda con texto: reemplaza la que haya (vacía o con valor) conservando su estilo */
  const ponerCelda = (xml, ref, texto) => xml.replace(new RegExp(`<(${P})c r="${ref}"([^>]*?)\\s*(?:/>|>[\\s\\S]*?</${P}c>)`), (m, px, attrs) =>
    `<${px}c r="${ref}"${attrs.replace(/\s+t="[^"]*"/, '')} t="str"><${px}v>${escXml(texto)}</${px}v></${px}c>`);

  /* «cliente»: el estado va en la columna I de la fila cuyo N° (columna A) es el del punto; el resumen se recalcula */
  const marcarCliente = (xml, estados) => {
    xml = xml.replace(new RegExp(`<(${P})row\\b[^>]*>[\\s\\S]*?</${P}row>`, 'g'), (fila) => {
      const a = fila.match(new RegExp(`<${P}c r="A(\\d+)"[^>]*>\\s*<${P}v>(\\d+)</${P}v>`));
      if (!a || !estados.has(a[2])) return fila;
      return ponerCelda(fila, `I${a[1]}`, estados.get(a[2]));
    });
    /* El resumen se cuenta en la propia hoja (también los que siguen en «Pendiente») */
    const cuenta = {};
    for (const fila of xml.match(new RegExp(`<${P}row\\b[^>]*>[\\s\\S]*?</${P}row>`, 'g')) || []) {
      const a = fila.match(new RegExp(`<${P}c r="A(\\d+)"[^>]*>\\s*<${P}v>\\d+</${P}v>`));
      const estado = a && fila.match(new RegExp(`<${P}c r="I${a[1]}"[^>]*>\\s*<${P}v>([^<]*)</${P}v>`))?.[1];
      if (estado) cuenta[estado] = (cuenta[estado] || 0) + 1;
    }
    xml = xml.replace(new RegExp(`(<${P}f>COUNTIF\\([^,]+,"(Cumple|No cumple|Pendiente|No aplica)"\\)</${P}f>\\s*<${P}v>)\\d+(</${P}v>)`, 'g'),
      (m, antes, estado, despues) => `${antes}${cuenta[estado] || 0}${despues}`);
    return xml.replace(new RegExp(`<(${P})c r="F4"([^>]*?)\\s*/>`), (m, px, attrs) => `<${px}c r="F4"${attrs.replace(/\s+t="[^"]*"/, '')} t="str"><${px}v>${hoy()}</${px}v></${px}c>`);
  };

  /* «casillas»: fila = N° + 1; columnas E a I = Pendiente, Por confirmar, Cumple, No cumple, No aplica */
  const COLUMNAS = { pendiente: 'E', confirmar: 'F', cumple: 'G', 'no-cumple': 'H', 'no-aplica': 'I' };
  const marcarCasillas = (xml, valores) => {
    for (const [n, valor] of valores) {
      const fila = Number(n) + 1;
      for (const [v, col] of Object.entries(COLUMNAS)) xml = ponerCelda(xml, `${col}${fila}`, v === valor ? '☑' : '☐');
    }
    return xml;
  };

  /* url: la planilla del cliente; formato: «cliente» o «casillas»; puntos: [[n, valor, nombre del estado]…] */
  const excel = async ({ url, formato, puntos }) => {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error('No se pudo leer la planilla');
    const entradas = leerZip(await res.arrayBuffer());
    const libro = new TextDecoder().decode(await inflar(entradas.find((e) => e.nombre === 'xl/workbook.xml')));
    const rels = new TextDecoder().decode(await inflar(entradas.find((e) => e.nombre === 'xl/_rels/workbook.xml.rels')));
    /* La hoja del checklist: la primera del libro (su archivo sale de las relaciones) */
    const rid = libro.match(new RegExp(`<${P}sheet\\b[^>]*\\br:id="([^"]+)"`))?.[1] || libro.match(/<(?:\w+:)?sheet\b[^>]*\bid="([^"]+)"/)?.[1];
    const destino = rels.match(new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`))?.[1] || rels.match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`))?.[1];
    const ruta = destino ? (destino.startsWith('/') ? destino.slice(1) : `xl/${destino}`) : 'xl/worksheets/sheet1.xml';
    const hoja = entradas.find((e) => e.nombre === ruta);
    if (!hoja) throw new Error('La planilla no trae la hoja del checklist');
    let xml = new TextDecoder().decode(await inflar(hoja));
    xml = formato === 'casillas'
      ? marcarCasillas(xml, puntos.map(([n, valor]) => [n, valor]))
      : marcarCliente(xml, new Map(puntos.map(([n, , nombre]) => [String(n), nombre])));
    const bytes = new TextEncoder().encode(xml);
    Object.assign(hoja, { metodo: 0, datos: bytes, tamano: bytes.length, crc: crc32(bytes) });
    return escribirZip(entradas);
  };

  /* ---------- PDF ---------- */
  /* Anchos de Helvetica (por 1000) para cortar las líneas; las letras con tilde miden lo mismo que sin ella */
  const ANCHO = {};
  ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'.split('').forEach((ch, i) => {
    ANCHO[ch] = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
      1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
      333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584][i];
  });
  Object.assign(ANCHO, { '¿': 611, '¡': 333, '«': 556, '»': 556, '—': 1000, '–': 556, '·': 278, '°': 400, 'º': 365, 'ª': 370, '“': 333, '”': 333, '‘': 222, '’': 222, '…': 1000, '•': 350 });
  const anchoDe = (texto, tam, negrita) => [...texto].reduce((s, ch) => s + (ANCHO[ch] ?? ANCHO[ch.normalize('NFD')[0]] ?? 556), 0) * tam / 1000 * (negrita ? 1.07 : 1);
  const cortar = (texto, tam, negrita, max) => {
    const lineas = [];
    let linea = '';
    for (const palabra of String(texto).replace(/\s+/g, ' ').trim().split(' ')) {
      const prueba = linea ? `${linea} ${palabra}` : palabra;
      if (linea && anchoDe(prueba, tam, negrita) > max) { lineas.push(linea); linea = palabra; } else linea = prueba;
    }
    if (linea) lineas.push(linea);
    return lineas;
  };
  /* Texto en WinAnsi (la codificación de las fuentes estándar del PDF), con los paréntesis y la barra escapados */
  const WIN = { '€': 128, '‚': 130, '„': 132, '…': 133, '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, '–': 150, '—': 151, '™': 153 };
  const enPdf = (t) => [...String(t)].map((ch) => {
    const c = WIN[ch] ?? ch.charCodeAt(0);
    const b = c < 256 && !(c >= 128 && c < 160 && !Object.values(WIN).includes(c)) ? String.fromCharCode(c) : '?';
    return b === '(' || b === ')' || b === '\\' ? `\\${b}` : b;
  }).join('');

  const A4 = [595, 842];
  const MARGEN = 48;
  const COLOR = { tinta: '0.08 0.10 0.18', gris: '0.40 0.43 0.52', marca: '0.40 0.03 0.78', cumple: '0.11 0.48 0.29', 'no-cumple': '0.75 0.19 0.12', confirmar: '0.77 0.27 0.04', 'no-aplica': '0.40 0.43 0.52', pendiente: '0.55 0.57 0.64' };

  /* doc: { titulo, sub, resumen, bloques: [{ nombre, puntos: [{ n, texto, detalle, valor, estado }] }] } */
  const pdf = (doc) => {
    const paginas = [];
    let ops = [];
    let y = 0;
    const ancho = A4[0] - MARGEN * 2;
    const nueva = () => { ops = []; paginas.push(ops); y = A4[1] - MARGEN; };
    const texto = (t, x, tam, negrita, color) => ops.push(`BT /${negrita ? 'F2' : 'F1'} ${tam} Tf ${COLOR[color] || color} rg ${x.toFixed(1)} ${y.toFixed(1)} Td (${enPdf(t)}) Tj ET`);
    const espacio = (alto) => { if (y - alto < MARGEN + 24) nueva(); };
    nueva();
    cortar(doc.titulo, 17, true, ancho).forEach((l) => { y -= 21; texto(l, MARGEN, 17, true, 'tinta'); });
    y -= 16; texto(doc.sub, MARGEN, 9, false, 'gris');
    y -= 16; texto(doc.resumen, MARGEN, 10, true, 'marca');
    y -= 8;
    doc.bloques.forEach((b) => {
      espacio(48);
      y -= 22; texto(b.nombre, MARGEN, 11.5, true, 'marca');
      ops.push(`${COLOR.marca} RG 0.6 w ${MARGEN} ${(y - 5).toFixed(1)} m ${A4[0] - MARGEN} ${(y - 5).toFixed(1)} l S`);
      y -= 4;
      b.puntos.forEach((q) => {
        const anchoEstado = anchoDe(q.estado, 9, true) + 10;
        const titulo = cortar(`${q.n}. ${q.texto}`, 10, true, ancho - anchoEstado);
        const detalle = q.detalle ? cortar(q.detalle, 9, false, ancho - 14) : [];
        espacio(titulo.length * 13 + detalle.length * 11.5 + 10);
        y -= 15;
        texto(q.estado, A4[0] - MARGEN - anchoEstado + 10, 9, true, q.valor);
        titulo.forEach((l, i) => { if (i) y -= 13; texto(l, MARGEN, 10, true, 'tinta'); });
        detalle.forEach((l) => { y -= 11.5; texto(l, MARGEN + 14, 9, false, 'gris'); });
        y -= 4;
      });
    });
    /* Pie de cada página */
    paginas.forEach((p, i) => p.push(`BT /F1 8 Tf ${COLOR.gris} rg ${MARGEN} 28 Td (${enPdf(`Transporte Autorizado · transporteautorizado.cl · Página ${i + 1} de ${paginas.length}`)}) Tj ET`));
    /* Objetos: 1 catálogo, 2 páginas, 3 y 4 fuentes, 5 información; luego cada página con su contenido */
    const objetos = [];
    const kids = paginas.map((_, i) => `${6 + i * 2} 0 R`).join(' ');
    objetos.push('<< /Type /Catalog /Pages 2 0 R >>');
    objetos.push(`<< /Type /Pages /Kids [${kids}] /Count ${paginas.length} >>`);
    objetos.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    objetos.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    objetos.push(`<< /Title (${enPdf(doc.titulo)}) /Producer (Transporte Autorizado) >>`);
    paginas.forEach((p, i) => {
      const flujo = p.join('\n');
      objetos.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4[0]} ${A4[1]}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${7 + i * 2} 0 R >>`);
      objetos.push(`<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`);
    });
    let salida = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
    const pos = [];
    objetos.forEach((o, i) => { pos.push(salida.length); salida += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = salida.length;
    salida += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${pos.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`;
    salida += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return new Blob([Uint8Array.from(salida, (c) => c.charCodeAt(0))], { type: 'application/pdf' });
  };

  /* Descarga un archivo armado aquí (en el iPhone se abre la vista para guardarlo o compartirlo) */
  const bajar = (blob, nombre) => {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  window.EXPORTAR = { excel, pdf, bajar };
})();
