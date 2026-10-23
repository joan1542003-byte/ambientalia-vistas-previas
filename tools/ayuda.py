"""«Ayuda» de Transporte Autorizado: guías rápidas, checklist descargable y normativa, todo dentro de la barra de navegación.

Fuente del contenido: «Documentos Página Transporte» del cliente (28-09-2026): tres guías en versión para la web y el
checklist de autorización de transporte (se publica la versión con casillas en assets/transporte/documentos/).
Las citas legales se verificaron en el texto oficial de Ley Chile (normativa/*.html) y enlazan al artículo exacto.

Genera:
- ayuda/<slug>.html: una página por guía (lectura directa, datos estructurados, enlaces a los artículos citados).
- El panel «Ayuda» de la cabecera (la propia cabecera se expande): guías rápidas y documentos (checklist y normativa con
  búsqueda). Va en transporte-autorizado.html (entre <!-- ayuda:menu:inicio --> y <!-- ayuda:menu:fin -->), en cada guía
  y en cada norma (tools/normativa.py lo inserta con menu_html('../')). No hay sección «Documentos» en la página.
Uso: python3 tools/ayuda.py   ·   tools/normativa.py lo ejecuta al final, así todo queda al día con un solo comando.
"""
import json
import re
from pathlib import Path

import normativa as N

ROOT = N.ROOT
SITE = N.SITE
esc = N.esc


def _i(p, w=20, sw=1.8):
    return f'<svg width="{w}" height="{w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{p}</svg>'


ICO = {
    'peligroso': _i(N.TEMA_ICON['peligrosos']),
    'autorizacion': _i('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>'),
    'contratar': _i('<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>'),
    'normativa': _i('<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>'),
    'check': _i('<path d="M20 6 9 17l-5-5"/>', 18, 2.2),
    'x': _i('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', 18, 2.2),
    'flecha': _i('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>', 18, 2),
    'chev': _i('<path d="m9 18 6-6-6-6"/>', 18, 2),
    'abajo': _i('<path d="m6 9 6 6 6-6"/>', 16, 2.2),
    'descarga': _i('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>', 18, 2),
    'hoja': _i('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>'),
    'especialista': _i('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>', 18, 2),
    'buscar': _i('<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>', 18, 2),
    'volver': _i('<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>', 20, 2),
    'cotizar': _i('<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7"/><path d="m7.5 4.27 9 5.15"/>', 18, 2),
    'documentos': _i('<path d="M20 7h-3a2 2 0 0 1-2-2V2"/><path d="M9 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h7l4 4v10a2 2 0 0 1-2 2Z"/><path d="M3 7.6v12.8A1.6 1.6 0 0 0 4.6 22h9.8"/>'),
    'rep': _i(N.TEMA_ICON['rep']),
    'vehiculo': _i(N.TEMA_ICON['transporte']),
    'errores': _i('<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>'),
    'preparar': _i('<path d="M12 22v-9"/><path d="M15.17 2.21a1.67 1.67 0 0 1 1.63 0L21 4.57a1.93 1.93 0 0 1 0 3.36L8.82 14.79a1.655 1.655 0 0 1-1.64 0L3 12.43a1.93 1.93 0 0 1 0-3.36z"/><path d="M20 13v3.87a2.06 2.06 0 0 1-1.11 1.83l-6 3.08a1.93 1.93 0 0 1-1.78 0l-6-3.08A2.06 2.06 0 0 1 4 16.87V13"/><path d="M21 12.43a1.93 1.93 0 0 0 0-3.36L8.83 2.2a1.64 1.64 0 0 0-1.63 0L3 4.57a1.93 1.93 0 0 0 0 3.36l12.18 6.86a1.636 1.636 0 0 0 1.63 0z"/>'),
    'despues': _i('<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>'),
    'gestor': _i('<path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/><rect width="12" height="12" x="6" y="10"/>'),
    'lista': _i('<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>'),
    'excel': _i('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/>', 18, 1.9),
    'pdf': _i('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/>', 18, 1.9),
}

CHECKLIST = {
    'archivo': 'assets/transporte/documentos/checklist-autorizacion-transporte.xlsx',
    'datos': 'assets/transporte/documentos/checklist-autorizacion-transporte.json',  # los 50 puntos, sacados de la planilla
    'pagina': 'ayuda/checklist-autorizacion-transporte.html',                         # versión para usar en línea
    'titulo': 'Checklist de autorización de transporte',
    'sub': '50 puntos en 9 bloques para revisar un caso antes del retiro · Excel',
    'menu': 'Checklist de autorización', 'menu_sub': 'Úsalo en línea o descárgalo en Excel',
    'resumen': '50 puntos para revisar un caso antes del retiro. Úsalo aquí mismo, también en el teléfono, marcando cada punto, o descárgalo en Excel. Cada punto queda como pendiente, por confirmar, cumple, no cumple o no aplica.',
    'bloques': ['Identificación del residuo', 'Clasificación de peligrosidad', 'Producto prioritario', 'Identificación del transportista',
                'Determinación de autorización sanitaria', 'Requisitos del vehículo y operación', 'Documentación para residuos peligrosos',
                'Destino y trazabilidad', 'Cierre de revisión'],
}

TEMA_NORMA = {'ds-148-2003-minsal': 'peligrosos', 'ds-29-2024-minsal': 'rep', 'ley-20920': 'rep', 'ds-298-1994-mtt': 'transporte', 'ds-57-2019-minsal': 'sustancias'}

# Etapas en que se ordenan las guías y los checklists (en el panel «Ayuda» y en «Otras guías»)
ETAPAS = [('antes', 'Antes de coordinar el retiro'), ('preparar', 'Al preparar el retiro'), ('despues', 'Después del retiro')]
NORMA = {  # slug de la página de la norma → nombre corto
    'ds-148-2003-minsal': 'D.S. 148', 'ds-29-2024-minsal': 'D.S. 29', 'ds-298-1994-mtt': 'D.S. 298',
    'ley-20920': 'Ley 20.920', 'ds-57-2019-minsal': 'D.S. 57',
}


def ref(slug, art=None, texto=None):
    return {'slug': slug, 'art': art, 'texto': texto or (f'{NORMA[slug]}, art. {art}' if art else NORMA[slug])}



# Guías 4 a 10 («Documentos oficiales» del cliente, 22-10-2026; versión para la web corregida en ortografía). Las citas
# se verificaron en el texto oficial (normativa/*.html) y enlazan al artículo exacto.
GUIAS_NUEVAS = [
    {
        'slug': 'documentos-retiro-residuos-peligrosos', 'icono': 'documentos', 'tema': 'peligrosos',
        'menu': 'Documentos del retiro peligroso', 'menu_sub': 'Qué revisar antes de cargar',
        'corto': 'Documentos del retiro peligroso',
        'titulo': '¿Qué documentos deben acompañar un retiro de residuos peligrosos?',
        'kicker': 'Guía rápida',
        'descripcion': 'Qué documentos revisar antes de cargar residuos peligrosos en Chile: autorización sanitaria del transportista, Documento de Declaración, hoja de seguridad para el transporte y la excepción del art. 42 del D.S. 148.',
        'intro': 'En residuos peligrosos, la revisión documental debe ocurrir antes de cargar. El D.S. 148 establece requisitos de autorización y de documentación para el transporte. Además, el generador debe entregar la información necesaria para que el transportista conozca las características del residuo.',
        'resumen': 'La revisión documental va antes de cargar: autorización del transportista, Documento de Declaración y hoja de seguridad del residuo.',
        'claves': [
            'El transportista debe estar autorizado por la Autoridad Sanitaria.',
            'Sin el Documento de Declaración no se puede transportar un residuo peligroso.',
            'La excepción del art. 42 exige cumplir todas sus condiciones, no solo la cantidad.',
        ],
        'saber': [
            ('Autorización sanitaria del transportista: como regla, el D.S. 148 establece que solo pueden transportar residuos peligrosos por calles y caminos públicos las personas autorizadas por la Autoridad Sanitaria.', [ref('ds-148-2003-minsal', '36')]),
            ('Documento de Declaración: no se puede transportar un residuo peligroso sin portar el Documento de Declaración del sistema de declaración y seguimiento y las Hojas de Seguridad de Transporte de Residuos Peligrosos.', [ref('ds-148-2003-minsal', '39'), ref('ds-148-2003-minsal', '81')]),
            ('Información del residuo: su clasificación, estado físico, contenedor y las características relevantes para el transporte y para responder ante una emergencia.', []),
            ('Excepción: el artículo 42 contiene un supuesto específico en que el Título V del reglamento no se aplica. No debe usarse sin verificar todas sus condiciones.', [ref('ds-148-2003-minsal', '42')]),
        ],
        'pasos': [
            'Confirma que el residuo esté clasificado y correctamente identificado.',
            'Revisa la autorización sanitaria del transportista.',
            'Completa o revisa el Documento de Declaración cuando corresponda.',
            'Entrega la Hoja de Seguridad para el Transporte del residuo peligroso.',
            'Verifica el vehículo, los contenedores y su compatibilidad con el residuo.',
            'Confirma el destinatario y conserva los respaldos del sistema de seguimiento.',
        ],
        'errores': [
            'Preparar los documentos cuando el vehículo ya está cargado.',
            'Entregar únicamente la HDS del producto original.',
            'No cruzar el Documento de Declaración con la carga real.',
            'Asumir que la excepción del artículo 42 depende solo de la cantidad.',
        ],
        'normas': [ref('ds-148-2003-minsal', None, 'D.S. 148 · Residuos peligrosos'), ref('ds-298-1994-mtt', None, 'D.S. 298 · Transporte de cargas peligrosas')],
        'accion': ('especialista', 'Hablar con un especialista'),
        'etapa': 'preparar', 'checklist': 'checklist-documentos-residuos-peligrosos',
    },
    {
        'slug': 'ley-rep-quien-transporta', 'icono': 'rep', 'tema': 'rep',
        'menu': 'Ley REP y quién transporta', 'menu_sub': 'Generador, transportista, gestor y destino',
        'corto': 'Ley REP y quién transporta',
        'titulo': 'Ley REP: por qué importa quién transporta tus residuos',
        'kicker': 'Guía rápida',
        'descripcion': 'Qué exige la Ley REP (Ley 20.920) y el D.S. 29 a quien transporta residuos: entrega a un gestor autorizado, registro de gestores, destino autorizado y trazabilidad.',
        'intro': 'La salida física del residuo no reemplaza la revisión de quién lo recibe, cómo se transporta y a qué destino se conduce. La Ley 20.920 establece obligaciones para generadores y gestores, y el D.S. 29 agrega reglas específicas para los residuos de productos prioritarios.',
        'resumen': 'Entregar el residuo al camión no cierra la revisión: importa quién lo transporta, con qué registro y a qué destino.',
        'claves': [
            'Todo generador debe entregar sus residuos a un gestor autorizado.',
            'Producto prioritario no peligroso: quien recolecta o transporta debe estar registrado como gestor.',
            'El destino debe poder recibir esos residuos.',
        ],
        'saber': [
            ('La Ley 20.920 establece que todo generador debe entregar sus residuos a un gestor autorizado para su tratamiento, salvo que los maneje por sí mismo conforme a la normativa.', [ref('ley-20920', '5')]),
            ('Los gestores deben manejar los residuos de manera ambientalmente racional y contar con las autorizaciones correspondientes.', [ref('ley-20920', '6')]),
            ('Para los residuos no peligrosos de productos prioritarios, el D.S. 29 exige el registro como gestor a quien realiza la recolección o el transporte, aunque esa actividad no requiera autorización sanitaria según su artículo 29.', [ref('ds-29-2024-minsal', '29')]),
            ('El D.S. 29 exige conducir estos residuos a instalaciones de recepción y almacenamiento que cumplan el reglamento, o a instalaciones de manejo cuya autorización sanitaria comprenda esos residuos.', [ref('ds-29-2024-minsal', '27')]),
            ('La trazabilidad debe respaldarse con documentación y evidencia del origen, el transporte y el destino, según corresponda.', []),
        ],
        'pasos': [
            'Identifica si el residuo corresponde a un producto prioritario.',
            'Define el rol de cada actor: generador, transportista, gestor y destinatario.',
            'Revisa el registro o la autorización según el residuo y la actividad.',
            'Confirma el destino antes del retiro.',
        ],
        'errores': [
            'Pensar que la entrega al camión termina la responsabilidad de revisar.',
            'No distinguir al transportista del gestor o del destinatario.',
            'No confirmar el destino antes de la salida.',
            'Archivar solo la factura y no el respaldo técnico y documental del retiro.',
        ],
        'normas': [ref('ley-20920', None, 'Ley 20.920 · Ley REP'), ref('ds-29-2024-minsal', None, 'D.S. 29 · Residuos de productos prioritarios')],
        'accion': ('buscar', 'Buscar transportista'),
        'etapa': 'antes', 'checklist': 'checklist-ley-rep-quien-transporta',
    },
    {
        'slug': 'requisitos-vehiculo-transporte-residuos', 'icono': 'vehiculo', 'tema': 'transporte',
        'menu': 'Requisitos del vehículo', 'menu_sub': 'Carga, cubierta, lluvia, olores y limpieza',
        'corto': 'Requisitos del vehículo',
        'titulo': 'Requisitos básicos de un vehículo que transporta residuos',
        'kicker': 'Guía rápida',
        'descripcion': 'Requisitos del vehículo que transporta residuos de productos prioritarios según el D.S. 29 (altura de carga, cubierta, lluvia y escurrimientos, ruidos, olores y limpieza) y qué revisar además si el residuo es peligroso.',
        'intro': 'Para los residuos de productos prioritarios alcanzados por el D.S. 29, el vehículo y la forma de cargar deben prevenir la dispersión, el ingreso de lluvia, el escurrimiento, los ruidos y los olores molestos. Además, el vehículo debe mantenerse limpio.',
        'resumen': 'La carga no sobrepasa la altura, va cubierta, no deja entrar lluvia ni escurrir líquidos, y el vehículo se mantiene limpio.',
        'claves': [
            'La carga no supera la altura máxima del vehículo ni del contenedor.',
            'Vehículo y contenedores cubiertos, sin lluvia ni escurrimientos.',
            'Residuo peligroso: se revisan además el D.S. 148 y el D.S. 298.',
        ],
        'saber': [
            ('La carga no debe superar la altura máxima del vehículo ni la del contenedor.', [ref('ds-29-2024-minsal', '30')]),
            ('El vehículo y los contenedores deben cubrirse o taparse para evitar la dispersión de los residuos.', [ref('ds-29-2024-minsal', '30')]),
            ('Debe impedirse el ingreso de aguas lluvia y el escurrimiento de líquidos desde el vehículo.', [ref('ds-29-2024-minsal', '30')]),
            ('Durante el transporte deben controlarse los ruidos y evitarse los olores molestos.', [ref('ds-29-2024-minsal', '30')]),
            ('El vehículo debe mantenerse limpio.', [ref('ds-29-2024-minsal', '30')]),
            ('Si el residuo es peligroso, deben revisarse además los requisitos específicos del D.S. 148 y la normativa de transporte de sustancias peligrosas, cuando corresponda.', [ref('ds-148-2003-minsal'), ref('ds-298-1994-mtt')]),
        ],
        'pasos': [
            'Verifica el estado general y la limpieza del vehículo.',
            'Revisa los contenedores, sus tapas o cubiertas y la altura de la carga.',
            'Busca puntos de escurrimiento o filtración.',
            'Confirma que el tipo de vehículo sea apropiado para el material.',
            'Revisa las medidas de seguridad y la documentación aplicable.',
            'Registra fotografías o un checklist antes de la salida.',
        ],
        'errores': [
            'Cargar por sobre la altura del contenedor.',
            'Cubrir solo en parte los materiales que se pueden dispersar.',
            'Aceptar contenedores con filtraciones.',
            'Usar los requisitos del D.S. 29 en reemplazo de las exigencias especiales para residuos peligrosos.',
        ],
        'normas': [ref('ds-29-2024-minsal', None, 'D.S. 29 · Residuos de productos prioritarios'), ref('ds-148-2003-minsal', None, 'D.S. 148 · Residuos peligrosos'), ref('ds-298-1994-mtt', None, 'D.S. 298 · Transporte de cargas peligrosas')],
        'accion': ('especialista', 'Hablar con un especialista'),
        'etapa': 'preparar', 'checklist': 'checklist-vehiculo-transporte-residuos',
    },
    {
        'slug': 'errores-comunes-retiro-residuos', 'icono': 'errores', 'tema': 'registro',
        'menu': 'Errores comunes en un retiro', 'menu_sub': 'Los seis que más retrasan la coordinación',
        'corto': 'Errores comunes',
        'titulo': 'Errores comunes al gestionar un retiro de residuos',
        'kicker': 'Guía rápida',
        'descripcion': 'Los errores más comunes al coordinar un retiro de residuos (descripción genérica, cantidad sin unidad, contaminación no informada, acceso, documentación y destino) y cómo evitarlos.',
        'intro': 'La mayoría de los retrasos iniciales se pueden reducir con un buen levantamiento de antecedentes. Los errores más comunes se concentran en la identificación, la cantidad, la condición, el embalaje, el acceso y el destino.',
        'resumen': 'La mayoría de los retrasos se evitan con buenos antecedentes: qué residuo es, cuánto hay, cómo está y cómo se llega a él.',
        'claves': [
            'Describe el residuo de forma específica, no «varios residuos».',
            'Indica la cantidad con su unidad.',
            'Avisa el acceso, los horarios y los equipos de carga necesarios.',
        ],
        'saber': [
            ('Error 1: describir el residuo de forma genérica o incorrecta.', []),
            ('Error 2: informar la cantidad sin unidad o con una estimación poco clara.', []),
            ('Error 3: omitir la contaminación, la mezcla o el deterioro del residuo.', []),
            ('Error 4: no informar cómo está almacenado o si requiere trasvasije o equipos de carga.', []),
            ('Error 5: no indicar las restricciones de acceso, los horarios o los espacios disponibles.', []),
            ('Error 6: coordinar el retiro sin confirmar la documentación y el destino.', []),
        ],
        'pasos': [
            'Levanta la información en una ficha estándar.',
            'Pide fotografías del residuo y del punto de carga.',
            'Revisa la clasificación antes de cotizar en forma definitiva.',
            'Confirma la cantidad, su unidad y el embalaje.',
            'Define los requisitos de acceso y de carga.',
            'Verifica la documentación y el destino.',
        ],
        'errores': [
            'Usar «varios residuos» como única descripción.',
            'Informar un volumen sin distinguir líquidos, sólidos o unidades.',
            'Cambiar la carga el día del retiro sin avisar.',
            'No avisar que se necesita grúa, transpaleta o personal adicional.',
        ],
        'normas': [],
        'accion': ('cotizar', 'Cotizar retiro'),
        'etapa': 'preparar', 'checklist': 'checklist-errores-retiro-residuos',
    },
    {
        'slug': 'preparar-residuos-antes-del-retiro', 'icono': 'preparar', 'tema': 'almacenamiento',
        'menu': 'Preparar los residuos', 'menu_sub': 'Segregar, identificar, contener y ordenar',
        'corto': 'Preparar los residuos',
        'titulo': 'Cómo preparar correctamente los residuos antes del retiro',
        'kicker': 'Guía rápida',
        'descripcion': 'Cómo preparar los residuos antes del retiro: segregar materiales incompatibles, identificar contenedores, cerrarlos, ordenar el punto de carga y avisar si se necesitan equipos.',
        'intro': 'La preparación del retiro comienza antes de la llegada del vehículo. Segregar, identificar, contener y disponer el material en un área accesible ayuda a que la operación sea más segura y predecible.',
        'resumen': 'El retiro empieza antes de que llegue el vehículo: residuos separados, identificados, bien contenidos y en un lugar accesible.',
        'claves': [
            'Separa los residuos incompatibles o de distinta clasificación.',
            'Identifica cada contenedor y no lo sobrellenes.',
            'Deja el acceso de carga libre y seguro.',
        ],
        'saber': [
            ('Mantén separados los residuos incompatibles o de distinta clasificación.', []),
            ('Identifica cada contenedor o grupo de materiales para evitar confusiones durante la carga.', []),
            ('Usa contenedores compatibles, cerrados y en buen estado, cuando corresponda.', []),
            ('Evita sobrellenar los contenedores o dejar materiales sueltos que puedan dispersarse.', []),
            ('Mantén libre y seguro el acceso de carga.', []),
            ('Informa con anticipación si se necesita equipo especial, trasvasije, pallets u otra preparación.', []),
        ],
        'pasos': [
            'Segrega los residuos por tipo y condición.',
            'Verifica los contenedores y sus cierres.',
            'Identifica los residuos.',
            'Ordena el punto de retiro.',
            'Confirma la cantidad final.',
            'Prepara los documentos y define quién hará la entrega.',
            'Haz una revisión previa el mismo día.',
        ],
        'errores': [
            'Mezclar materiales después de cotizar.',
            'Dejar contenedores abiertos o dañados.',
            'Ubicar la carga en un punto al que el vehículo no puede acceder.',
            'No tener disponible a la persona que conoce el residuo.',
        ],
        'normas': [],
        'accion': ('cotizar', 'Cotizar retiro'),
        'etapa': 'preparar', 'checklist': 'checklist-preparar-residuos',
    },
    {
        'slug': 'que-pasa-despues-del-retiro', 'icono': 'despues', 'tema': 'registro',
        'menu': 'Después del retiro', 'menu_sub': 'Destino, documentos y trazabilidad',
        'corto': 'Después del retiro',
        'titulo': '¿Qué pasa con mis residuos después de que los retiran?',
        'kicker': 'Guía rápida',
        'descripcion': 'Qué pasa con los residuos después del retiro: quién responde en cada etapa, el sistema de declaración y seguimiento de residuos peligrosos y qué respaldos conservar para cerrar la gestión.',
        'intro': 'El retiro es solo una etapa. Para cerrar bien la gestión, la empresa debe conocer el destino acordado y conservar los documentos que acrediten la operación, según el tipo de residuo y el sistema aplicable.',
        'resumen': 'El retiro es solo una etapa: conoce el destino acordado y conserva los documentos que acreditan la operación.',
        'claves': [
            'Generador, transportista y destinatario tienen funciones distintas.',
            'Los residuos peligrosos se siguen desde que salen hasta que se reciben.',
            'Cruza el respaldo de recepción con la cantidad retirada.',
        ],
        'saber': [
            ('El generador prepara y entrega el residuo con la información necesaria.', []),
            ('El transportista recibe la carga y debe llevarla al destino definido. En residuos peligrosos, responde de que toda la carga se entregue en el sitio de destino fijado en el sistema de declaración y seguimiento.', [ref('ds-148-2003-minsal', '38')]),
            ('El destinatario recibe el residuo y lo procesa, valoriza o elimina dentro del alcance de su autorización.', []),
            ('En residuos peligrosos existe un sistema formal de declaración y seguimiento, desde que salen del establecimiento de generación hasta su recepción en la instalación de eliminación.', [ref('ds-148-2003-minsal', '80')]),
            ('En la Ley REP y en la gestión de residuos, la evidencia de cantidades, origen y destino facilita el cumplimiento, la auditoría y el reporte.', []),
        ],
        'pasos': [
            'Registra la salida: fecha, residuo y cantidades.',
            'Identifica al transportista y el vehículo.',
            'Conserva el documento de transporte o de declaración, cuando corresponda.',
            'Registra el destino acordado previamente.',
            'Recibe y archiva el respaldo de recepción, valorización o eliminación.',
            'Cruza ese respaldo con la factura u orden de servicio y con el registro interno.',
        ],
        'errores': [
            'Cerrar la orden de servicio sin evidencia del destino.',
            'Archivar documentos sin relacionarlos con el retiro específico.',
            'No verificar que la cantidad recibida sea consistente con la retirada.',
            'Confundir la valorización declarada con evidencia del tratamiento efectivamente realizado.',
        ],
        'normas': [ref('ds-148-2003-minsal', None, 'D.S. 148 · Residuos peligrosos'), ref('ley-20920', None, 'Ley 20.920 · Ley REP')],
        'accion': ('especialista', 'Hablar con un especialista'),
        'etapa': 'despues', 'checklist': 'checklist-trazabilidad-despues-del-retiro',
    },
    {
        'slug': 'antes-de-entregar-residuos-a-un-gestor', 'icono': 'gestor', 'tema': 'registro',
        'menu': 'Antes de entregar a un gestor', 'menu_sub': 'Quién transporta, quién recibe y con qué alcance',
        'corto': 'Antes de entregar a un gestor',
        'titulo': 'Qué revisar antes de entregar residuos a un gestor',
        'kicker': 'Guía rápida',
        'descripcion': 'Qué revisar antes de entregar residuos a un gestor: quién transporta y quién recibe, el alcance de su autorización o registro, las condiciones de recepción y el respaldo posterior.',
        'intro': 'El gestor, el transportista y el destinatario pueden ser actores distintos. Antes de entregar un residuo conviene verificar quién asume cada función y si el destino está habilitado para recibir ese residuo específico.',
        'resumen': 'Gestor, transportista y destinatario pueden ser distintos: verifica quién hace cada cosa y si el destino puede recibir tu residuo.',
        'claves': [
            'Un gestor está autorizado y registrado, pero no siempre hace todas las etapas.',
            'Revisa el alcance de la autorización, no solo que exista.',
            'Acuerda qué evidencia acreditará la recepción.',
        ],
        'saber': [
            ('La Ley 20.920 define al gestor como la persona natural o jurídica, pública o privada, que realiza cualquiera de las operaciones de manejo de residuos y que está autorizada y registrada conforme a la normativa vigente.', [ref('ley-20920', '3')]),
            ('El transporte puede ser una etapa separada del tratamiento, la valorización o la eliminación.', []),
            ('Una autorización se revisa por su alcance, no solo por la existencia del documento.', []),
            ('El destino debe poder recibir el residuo en las condiciones y cantidades acordadas.', []),
            ('En residuos peligrosos, el generador afecto a un plan de manejo debe usar transportistas con autorización sanitaria y eliminar sus residuos en instalaciones cuya autorización comprenda esos residuos.', [ref('ds-148-2003-minsal', '27')]),
        ],
        'pasos': [
            'Define quién es el transportista y quién el destinatario.',
            'Solicita la autorización o el registro y los datos del destino.',
            'Revisa que el residuo figure en el alcance autorizado o sea compatible con él.',
            'Confirma las condiciones de recepción.',
            'Acuerda el respaldo que se entregará después.',
            'Archiva la verificación.',
        ],
        'errores': [
            'Asumir que «gestor» significa que realiza todas las etapas.',
            'Aceptar documentos de una razón social distinta de la que presta el servicio.',
            'No revisar que el residuo esté dentro del alcance de la instalación.',
            'No definir qué evidencia acreditará la recepción.',
        ],
        'normas': [ref('ley-20920', None, 'Ley 20.920 · Ley REP'), ref('ds-148-2003-minsal', None, 'D.S. 148 · Residuos peligrosos')],
        'accion': ('buscar', 'Buscar transportista'),
        'etapa': 'antes', 'checklist': 'checklist-entregar-residuos-gestor',
    },
]


GUIAS = [
    {
        'slug': 'residuo-peligroso-o-no-peligroso', 'icono': 'peligroso', 'tema': 'peligrosos',
        'menu': '¿Peligroso o no peligroso?', 'menu_sub': 'Cómo empezar a identificar tu residuo',
        'corto': 'Peligroso o no peligroso',
        'titulo': '¿Residuo peligroso o no peligroso?',
        'kicker': 'Guía rápida para comenzar a identificarlo',
        'descripcion': 'Cómo empezar a identificar si un residuo es peligroso: qué antecedentes reunir, qué no basta (una foto, el nombre) y cuándo pedir una revisión técnica.',
        'intro': 'La peligrosidad de un residuo no se determina por color, olor o fotografía. La revisión debe considerar su origen, composición, contaminación, estado y los antecedentes técnicos disponibles. Cuando falte información, lo correcto es declarar la incertidumbre y reunir antecedentes antes de coordinar el manejo.',
        'resumen': 'No se determina por color, olor ni fotografía: se revisan el origen, la composición, la contaminación y los antecedentes técnicos del residuo.',
        'claves': [
            'La HDS del producto original ayuda, pero el residuo pudo cambiar por uso, mezcla o contaminación.',
            'Una fotografía muestra el estado y el envase; no demuestra la peligrosidad.',
            'Si falta información, se pide análisis o caracterización antes de decidir el transporte.',
        ],
        'saber': [
            ('El D.S. 148 define el residuo peligroso según sus características de peligrosidad y regula su manejo.', [ref('ds-148-2003-minsal', '10'), ref('ds-148-2003-minsal', '11')]),
            ('La HDS del producto original puede ser un antecedente útil, pero el residuo puede haber cambiado por uso, mezcla, contaminación o proceso.', []),
            ('Una fotografía sirve para reconocer el estado físico, el envase o la condición visible, pero no demuestra por sí sola la peligrosidad.', []),
            ('Cuando exista mezcla o contaminación, debe revisarse el conjunto y no solo el material principal.', []),
            ('Si la información es insuficiente, puede ser necesario solicitar un análisis o una caracterización antes de decidir el transporte y el destino.', []),
        ],
        'pasos': [
            'Describe el proceso o la actividad que genera el residuo.',
            'Indica el nombre del material y su composición conocida.',
            'Registra si está limpio, usado, contaminado o mezclado.',
            'Define su estado físico y la cantidad aproximada.',
            'Reúne la HDS o FDS del producto original, la HDSR (hoja de seguridad del residuo), fichas técnicas o análisis, si existen.',
            'Identifica contaminantes, derrames, daños o condiciones anormales.',
            'Con la información reunida, pide una revisión técnica si la clasificación sigue siendo incierta.',
        ],
        'errores': [
            'Clasificar solo por el nombre: «aceite», «plástico», «solvente» o «batería».',
            'Concluir la peligrosidad a partir de una fotografía.',
            'Usar la HDS de un producto como si describiera automáticamente el residuo final.',
        ],
        'normas': [ref('ds-148-2003-minsal', None, 'D.S. 148 · Residuos peligrosos'), ref('ds-57-2019-minsal', None, 'D.S. 57 · Clasificación y etiquetado de sustancias')],
        'accion': ('especialista', 'Hablar con un especialista'),
        'etapa': 'antes', 'checklist': 'checklist-residuo-peligroso',
    },
    {
        'slug': 'autorizacion-sanitaria-transporte', 'icono': 'autorizacion', 'tema': 'transporte',
        'menu': '¿Necesitas autorización sanitaria?', 'menu_sub': 'Qué exige la norma según el residuo',
        'corto': 'Autorización sanitaria',
        'titulo': '¿Necesitas autorización sanitaria para transportar residuos?',
        'kicker': 'Guía rápida',
        'descripcion': 'Cuándo se necesita autorización sanitaria para transportar residuos en Chile: regla del D.S. 148, excepción del art. 42 y el caso de los productos prioritarios (D.S. 29).',
        'intro': 'No existe una respuesta única para todos los residuos. Antes de coordinar un transporte conviene identificar la naturaleza del residuo, si corresponde a un producto prioritario y quién realiza la operación. Con esos antecedentes se puede revisar qué autorización, registro o documentación resulta aplicable.',
        'resumen': 'Depende de si el residuo es peligroso, si viene de un producto prioritario (Ley REP) y de quién lo transporta.',
        'claves': [
            'Residuo peligroso: el transportista debe estar autorizado por la Autoridad Sanitaria.',
            'Excepción acotada: hasta 6 kg de tóxicos agudos o 2 t de otros residuos peligrosos, si los transporta el propio generador exento de plan de manejo.',
            'Producto prioritario no peligroso: no requiere autorización para recolectar o transportar, pero sí registro como gestor.',
        ],
        'saber': [
            ('Para residuos peligrosos transportados por calles y caminos públicos, el D.S. 148 establece como regla que el transportista debe estar autorizado por la Autoridad Sanitaria.', [ref('ds-148-2003-minsal', '36')]),
            ('El D.S. 148 contiene una excepción específica: cantidades que no excedan 6 kg de residuos tóxicos agudos o 2 toneladas de cualquier otra clase de residuo peligroso, cuando el transporte lo efectúa el propio generador y este, además, está exceptuado de presentar un plan de manejo.', [ref('ds-148-2003-minsal', '42')]),
            ('Para residuos no peligrosos de productos prioritarios, la recolección o el transporte no requiere autorización sanitaria para esa actividad, pero exige formar parte del registro de gestores de residuos de productos prioritarios y cumplir los requisitos del Título III del D.S. 29.', [ref('ds-29-2024-minsal', '29'), ref('ds-29-2024-minsal', '30')]),
            ('Si el residuo de producto prioritario es peligroso, el D.S. 29 remite la autorización de recolección y transporte al procedimiento del D.S. 148.', [ref('ds-29-2024-minsal', '28'), ref('ds-29-2024-minsal', '41')]),
            ('Para residuos que no encajen en estas categorías, la respuesta debe revisarse según la clasificación, la operación y la normativa sanitaria aplicable. No debe extrapolarse el artículo 29 del D.S. 29 a todo residuo no peligroso.', []),
        ],
        'matriz': [
            ('Residuo peligroso (regla general)', 'Sí', 'si', 'Transportista autorizado por la Autoridad Sanitaria y vehículo adecuado al tipo, peligrosidad y estado físico del residuo; revisar además el D.S. 298. Documento de Declaración y hojas de seguridad de transporte cuando correspondan.', [ref('ds-148-2003-minsal', '36', 'D.S. 148, arts. 36 a 41')]),
            ('Residuo peligroso: posible excepción', 'Posible excepción', 'quizas', 'Deben cumplirse a la vez: cantidad bajo el umbral, transporte por el propio generador y generador exceptuado de plan de manejo. La declaración y seguimiento tiene su propia excepción, que se revisa por separado.', [ref('ds-148-2003-minsal', '42', 'D.S. 148, art. 42'), ref('ds-148-2003-minsal', '84', 'art. 84')]),
            ('Producto prioritario no peligroso', 'No, para recolectar o transportar', 'no', 'Registro de gestores y requisitos de transporte: altura de la carga, cubierta, lluvia y escurrimientos, ruido y olores, y limpieza del vehículo.', [ref('ds-29-2024-minsal', '29', 'D.S. 29, arts. 29'), ref('ds-29-2024-minsal', '30', '30')]),
            ('Producto prioritario peligroso', 'Sí, por la vía del D.S. 148', 'si', 'Autorización sanitaria para los gestores que transportan residuos peligrosos; revisar el D.S. 148 y el D.S. 298.', [ref('ds-29-2024-minsal', '28', 'D.S. 29, art. 28')]),
            ('Residuo no peligroso y no prioritario', 'No concluir sin revisar', 'revisar', 'Revisar la normativa aplicable al residuo, a la operación y a la autoridad competente. El art. 29 del D.S. 29 no basta para eximir.', []),
        ],
        'pasos': [
            'Identifica qué residuo se transportará y el proceso que lo genera.',
            'Define si hay antecedentes de peligrosidad: análisis, HDS del producto original, HDSR u otra caracterización.',
            'Revisa si el residuo corresponde a un producto prioritario de la Ley REP.',
            'Identifica quién realizará el transporte: el generador, un gestor o un tercero.',
            'Verifica la autorización, el registro, el vehículo, el destino y la documentación según el escenario.',
            'Conserva evidencia de la revisión realizada antes del retiro.',
        ],
        'errores': [
            'Asumir que «no peligroso» equivale siempre a «sin autorización».',
            'Usar una fotografía como única base para definir la peligrosidad.',
            'Confundir la autorización sanitaria del transportista con la del destino o la instalación.',
            'Omitir el registro de gestor cuando aplica el D.S. 29.',
        ],
        'normas': [ref('ds-148-2003-minsal', None, 'D.S. 148 · Residuos peligrosos'), ref('ds-29-2024-minsal', None, 'D.S. 29 · Residuos de productos prioritarios'), ref('ds-298-1994-mtt', None, 'D.S. 298 · Transporte de cargas peligrosas'), ref('ley-20920', None, 'Ley 20.920 · Ley REP')],
        'accion': ('especialista', 'Hablar con un especialista'),
        'etapa': 'antes', 'checklist': 'checklist-autorizacion-sanitaria',
    },
    {
        'slug': 'checklist-contratar-transportista', 'icono': 'contratar', 'tema': 'registro',
        'menu': 'Antes de contratar un transportista', 'menu_sub': 'Qué revisar para evitar retiros fallidos',
        'corto': 'Antes de contratar',
        'titulo': 'Checklist antes de contratar un transportista de residuos',
        'kicker': 'Guía rápida',
        'descripcion': 'Qué revisar antes de contratar un transportista de residuos: identidad, autorización o registro y su alcance, vehículo, destino y respaldo de la trazabilidad.',
        'intro': 'Contratar un transportista implica revisar más que la disponibilidad del vehículo. Una verificación mínima ayuda a reducir rechazos, retiros fallidos y problemas de trazabilidad. El alcance exacto dependerá del tipo de residuo y de la operación.',
        'resumen': 'Es más que confirmar un vehículo: revisa quién transporta, con qué autorización o registro y hacia qué destino.',
        'claves': [
            'Confirma la identidad legal del proveedor y quién hará efectivamente el transporte.',
            'Revisa que la autorización o el registro esté vigente y cubra tu residuo.',
            'Confirma el destino y el respaldo que recibirás al terminar.',
        ],
        'saber': [
            ('Confirma la identidad legal del proveedor y quién ejecutará efectivamente el transporte.', []),
            ('Verifica si el tipo de residuo requiere autorización sanitaria o registro como gestor.', [ref('ds-148-2003-minsal', '36'), ref('ds-29-2024-minsal', '29')]),
            ('Cuando exista autorización sanitaria, revisa que esté vigente y que su alcance sea coherente con la operación.', []),
            ('Asegúrate de que el vehículo y la forma de transporte sean compatibles con el residuo, su estado físico y los contenedores.', []),
            ('Confirma el destino antes del retiro: la instalación de valorización o eliminación que corresponda y que pueda recibir el residuo.', []),
            ('Define qué respaldo se entregará al terminar la operación y cómo se conservará la trazabilidad.', []),
        ],
        'pasos': [
            'Solicita los antecedentes legales y operacionales del proveedor.',
            'Revisa la autorización o el registro y su alcance.',
            'Cruza residuo, vehículo y destino.',
            'Confirma las condiciones de carga, acceso y horarios.',
            'Acuerda la documentación del retiro y el respaldo posterior.',
            'Registra la verificación en una pauta interna.',
        ],
        'errores': [
            'Aceptar una resolución sin revisar su alcance.',
            'No confirmar el destino final antes del retiro.',
            'Confundir a un intermediario comercial con el transportista efectivo.',
            'No acordar previamente certificados, declaraciones o evidencias de recepción.',
        ],
        'normas': [ref('ds-148-2003-minsal', None, 'D.S. 148 · Residuos peligrosos'), ref('ds-29-2024-minsal', None, 'D.S. 29 · Residuos de productos prioritarios'), ref('ds-298-1994-mtt', None, 'D.S. 298 · Transporte de cargas peligrosas')],
        'accion': ('buscar', 'Buscar transportista'),
        'etapa': 'antes', 'checklist': 'checklist-contratar-transportista-residuos',
    },
] + GUIAS_NUEVAS

NORMATIVA_MENU = {
    'menu': 'Normativa', 'menu_sub': 'D.S. 148, Ley de Tránsito, Código Sanitario y más, con su texto oficial',
    'resumen': 'El texto oficial de cada norma, para leerlo, buscar dentro o descargarlo en PDF.',
}


def normas():
    """Normas de la biblioteca (las escribe tools/normativa.py en assets/transporte/normativa.json)."""
    p = ROOT / 'assets/transporte/normativa.json'
    return json.loads(p.read_text(encoding='utf-8'))['normas'] if p.exists() else []


def fila_norma(n, root, i=0):
    """Fila de una norma en la biblioteca del panel (la misma que dibuja assets/site/normativa.js al filtrar)."""
    t = n['temas'][0]
    off = '' if n['vigente'] else ' · <span class="doc-off">Derogada</span>'
    return (f'<li class="doc" data-slug="{n["slug"]}" data-tema="{t}" style="--i:{min(i, 8)}">'
            f'<span class="doc-icon">{N.icono_tema(t)}</span>'
            f'<div class="doc-body"><p class="doc-title"><a href="{root}{n["pagina"]}">{esc(n["tema"])}</a></p>'
            f'<p class="doc-sub"><strong>{esc(n["corto"])}</strong><span class="doc-org"> · {esc(n["organismo"])}</span>{off}</p></div>'
            f'<a class="doc-pdf" href="{root}{n["pdf"]}" download data-doc-pdf aria-label="Descargar PDF de {esc(n["corto"])}">{ICO["descarga"]}<span>PDF</span></a></li>')


BUSCAR = _i('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>', 20, 2)
CERRAR = _i('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', 20, 2)


def biblioteca(root):
    """Buscador y lista de normas (assets/site/normativa.js agrega la búsqueda y el filtro por tema)."""
    filas = ''.join(fila_norma(n, root, i) for i, n in enumerate(normas()))
    return (f'<div class="lib" data-lib data-src="{root}assets/transporte/normativa.json">'
            f'<div class="lib-search"><span class="lib-search-icon" aria-hidden="true">{BUSCAR}</span>'
            f'<label class="sr-only" for="lib-q">Buscar en la normativa</label>'
            f'<input id="lib-q" type="search" data-lib-q placeholder="Busca: 148, REP, RETC…" autocomplete="off" enterkeyhint="search">'
            f'<span class="lib-count" data-lib-count aria-hidden="true"></span>'
            f'<button class="lib-clear" type="button" data-lib-clear aria-label="Borrar búsqueda">{CERRAR}</button></div>'
            f'<p class="sr-only" data-lib-live aria-live="polite"></p>'
            f'<div class="lib-topics" data-lib-topics role="radiogroup" aria-label="Filtrar por tema"></div>'
            f'<ul class="lib-list" data-lib-list>{filas}</ul>'
            f'<div class="lib-empty" data-lib-empty hidden><strong data-lib-empty-title>No encontramos normas con esa búsqueda.</strong>'
            f'<span>Prueba con un número, una sigla o un tema:</span><div class="lib-try"><button type="button" data-lib-try>148</button>'
            f'<button type="button" data-lib-try>REP</button><button type="button" data-lib-try>RETC</button><button type="button" data-lib-try>transporte</button></div>'
            f'<button class="btn btn-quiet btn-small" type="button" data-lib-reset>Ver todas las normas</button></div></div>')


def enlace_norma(r, root):
    return f'{root}normativa/{r["slug"]}.html' + (f'#art-{r["art"]}' if r['art'] else '')


def validar_anclas():
    """Cada cita debe llevar a un artículo que exista en la página de la norma."""
    faltan = []
    for g in GUIAS:
        refs = [r for _, rs in g['saber'] for r in rs] + [r for fila in g.get('matriz', []) for r in fila[4]] + g['normas']
        for r in refs:
            p = ROOT / 'normativa' / f'{r["slug"]}.html'
            if not p.exists():
                faltan.append(f'{g["slug"]}: falta la página {p.name}')
            elif r['art'] and f'id="art-{r["art"]}"' not in p.read_text(encoding='utf-8'):
                faltan.append(f'{g["slug"]}: {r["slug"]} sin #art-{r["art"]}')
    if faltan:
        raise SystemExit('Citas sin destino:\n' + '\n'.join(faltan))


# ---------- Guías y checklists, en orden ----------
# Orden de lectura dentro de cada etapa (ETAPAS): el mismo en el panel, en «Otras guías» y en el resumen para IA
ORDEN = ['residuo-peligroso-o-no-peligroso', 'autorizacion-sanitaria-transporte', 'ley-rep-quien-transporta', 'checklist-contratar-transportista',
         'antes-de-entregar-residuos-a-un-gestor', 'preparar-residuos-antes-del-retiro', 'documentos-retiro-residuos-peligrosos',
         'requisitos-vehiculo-transporte-residuos', 'errores-comunes-retiro-residuos', 'que-pasa-despues-del-retiro']
ANTERIORES = {'residuo-peligroso-o-no-peligroso', 'autorizacion-sanitaria-transporte', 'checklist-contratar-transportista'}  # publicadas antes en documentos/


def guias_en_orden():
    return sorted(GUIAS, key=lambda g: ORDEN.index(g['slug']))


CK = 'assets/transporte/documentos'
# Los diez checklists del cliente (22-10-2026; datos en CK/<slug>.json, tools/checklists.py): título de su página y
# rótulo en el panel. Cada uno acompaña a su guía (GUIAS[…]['checklist']).
CHECKLISTS_NUEVOS = {
    'checklist-residuo-peligroso': ('Checklist: ¿residuo peligroso o no peligroso?', '¿Peligroso o no peligroso?'),
    'checklist-autorizacion-sanitaria': ('Checklist: ¿necesitas autorización sanitaria para transportar residuos?', 'Autorización sanitaria'),
    'checklist-ley-rep-quien-transporta': ('Checklist Ley REP: quién transporta tus residuos', 'Ley REP y quién transporta'),
    'checklist-contratar-transportista-residuos': ('Checklist antes de contratar un transportista de residuos', 'Antes de contratar un transportista'),
    'checklist-entregar-residuos-gestor': ('Checklist antes de entregar residuos a un gestor', 'Antes de entregar a un gestor'),
    'checklist-preparar-residuos': ('Checklist para preparar los residuos antes del retiro', 'Preparar los residuos'),
    'checklist-documentos-residuos-peligrosos': ('Checklist de documentos para un retiro de residuos peligrosos', 'Documentos del retiro peligroso'),
    'checklist-vehiculo-transporte-residuos': ('Checklist del vehículo que transporta residuos', 'Requisitos del vehículo'),
    'checklist-errores-retiro-residuos': ('Checklist para evitar errores en un retiro de residuos', 'Evitar errores en el retiro'),
    'checklist-trazabilidad-despues-del-retiro': ('Checklist de trazabilidad después del retiro', 'Trazabilidad después del retiro'),
}


def checklists():
    """Todos los checklists en el orden del panel: el de 50 puntos (revisión completa, 28-09-2026) y luego uno por guía."""
    completo = json.loads((ROOT / CHECKLIST['datos']).read_text(encoding='utf-8'))
    out = [{'slug': 'checklist-autorizacion-transporte', 'titulo': CHECKLIST['titulo'], 'menu': 'Revisión completa de autorización',
            'etapa': 'antes', 'guia': None, 'completo': True, 'tema': 'rep', 'archivo': CHECKLIST['archivo'],
            'total': sum(len(b['puntos']) for b in completo['bloques'])}]
    for g in guias_en_orden():
        slug = g['checklist']
        datos = json.loads((ROOT / CK / f'{slug}.json').read_text(encoding='utf-8'))
        titulo, menu = CHECKLISTS_NUEVOS[slug]
        out.append({'slug': slug, 'titulo': titulo, 'menu': menu, 'etapa': g['etapa'], 'guia': g, 'datos': datos, 'tema': g['tema'],
                    'archivo': f'{CK}/{slug}.xlsx', 'total': sum(len(b['puntos']) for b in datos['bloques'])})
    return out


def checklist_de(g):
    return next(c for c in checklists() if c['slug'] == g['checklist'])


# ---------- Panel «Ayuda» de la cabecera ----------
def accion(clave, texto, root, clase='btn btn-quiet btn-small'):
    icon = ICO.get(clave, '')
    return f'<button class="{clase}" type="button" data-dock-open="{clave}">{icon}<span>{esc(texto)}</span></button>'


# Temas del panel «Ayuda» (simplificado el 22-10-2026: se elige un tema y se despliega su ayuda): clave, nombre,
# bajada, ícono, color y guías del tema (cada una con su checklist). «Normativa» despliega la biblioteca.
TEMAS = [
    ('clasificar', 'Clasificar el residuo', '¿Es peligroso o no?', 'peligroso', 'peligrosos', ['residuo-peligroso-o-no-peligroso']),
    ('permisos', 'Autorizaciones y Ley REP', 'Qué exige la norma según el residuo', 'autorizacion', 'transporte', ['autorizacion-sanitaria-transporte', 'ley-rep-quien-transporta']),
    ('proveedor', 'Elegir quién retira', 'Transportista, gestor y destino', 'contratar', 'registro', ['checklist-contratar-transportista', 'antes-de-entregar-residuos-a-un-gestor']),
    ('preparar', 'Preparar el retiro', 'Residuos, documentos y vehículo', 'preparar', 'almacenamiento', ['preparar-residuos-antes-del-retiro', 'documentos-retiro-residuos-peligrosos', 'requisitos-vehiculo-transporte-residuos', 'errores-comunes-retiro-residuos']),
    ('despues', 'Después del retiro', 'Destino, respaldos y trazabilidad', 'despues', 'registro', ['que-pasa-despues-del-retiro']),
    # Documentos (23-10-2026: «agrega la categoría checklist»): todos los checklists juntos, y la normativa
    ('checklists', 'Checklists', 'Pautas para revisar tu caso, en línea o en Excel', 'lista', 'rep', []),
    ('normativa', 'Normativa', 'El texto oficial de cada norma', 'normativa', 'marco', []),
]
GRUPOS = [('Guías por tema', ['clasificar', 'permisos', 'proveedor', 'preparar', 'despues']), ('Documentos', ['checklists', 'normativa'])]


def _xls(c, root):
    return (f'<a class="docs-xls" href="{root}{c["archivo"]}" download data-download data-toast="Descargando el checklist (Excel)" '
            f'aria-label="Descargar en Excel: {esc(c["titulo"])}">{ICO["excel"]}<span>Excel</span></a>')


def _fila_guia(g, root):
    c = checklist_de(g)
    return (f'<li class="ayu-guia" data-tema="{g["tema"]}"><span class="doc-icon">{ICO[g["icono"]]}</span><div class="ayu-guia-t">'
            f'<a class="ayu-guia-titulo" href="{root}ayuda/{g["slug"]}.html" data-guia="{g["slug"]}">{esc(g["titulo"])}</a>'
            f'<p>{esc(g["resumen"])}</p><div class="ayu-acciones">'
            f'<a class="ayu-btn is-guia" href="{root}ayuda/{g["slug"]}.html">Leer la guía{ICO["flecha"]}</a>'
            f'<a class="ayu-btn" href="{root}ayuda/{c["slug"]}.html" data-lista="{c["slug"]}">{ICO["lista"]}<span>Checklist · {c["total"]} puntos</span></a>'
            f'{_xls(c, root)}</div></div></li>')


def menu_html(root=''):
    """Panel que se abre dentro de la cabecera al elegir «Ayuda» (simplificado el 22-10-2026): primero los temas; al
    elegir uno se despliega su ayuda, debajo de su fila (en el teléfono, debajo del tema): sus guías, cada una con su
    checklist en línea y en Excel, o la normativa con su buscador. Todo el contenido viene en el HTML (buscadores)."""
    guia = {g['slug']: g for g in GUIAS}
    completo = next(c for c in checklists() if c.get('completo'))
    partes = []
    for k, nombre, bajada, icono, tema, slugs in TEMAS:
        if k == 'normativa':
            cuerpo = f'<p class="docs-lead">{esc(NORMATIVA_MENU["resumen"])}</p>{biblioteca(root)}'
        elif k == 'checklists':
            filas = ''.join(
                f'<li class="ayu-ck" data-tema="{c["tema"]}"><a class="ayu-ck-titulo" href="{root}ayuda/{c["slug"]}.html" data-lista="{c["slug"]}">'
                f'<span class="doc-icon">{ICO["lista"]}</span><span><strong>{esc(c["titulo"])}</strong><small>{c["total"]} puntos'
                f'{" · todo el caso" if c.get("completo") else ""}</small></span></a>{_xls(c, root)}</li>' for c in checklists())
            cuerpo = (f'<p class="docs-lead">Úsalos en línea, marcando cada punto también en el teléfono, y descárgalos con tus marcas en Excel o PDF.</p>'
                      f'<ul class="ayu-cks">{filas}</ul>')
        else:
            filas = ''.join(_fila_guia(guia[x], root) for x in slugs)
            if k == 'permisos':  # el checklist de 50 puntos revisa todo el caso de autorización
                filas += (f'<li class="ayu-guia" data-tema="rep"><span class="doc-icon">{ICO["hoja"]}</span><div class="ayu-guia-t">'
                          f'<a class="ayu-guia-titulo" href="{root}ayuda/{completo["slug"]}.html" data-lista="{completo["slug"]}">{esc(completo["menu"])}</a>'
                          f'<p>{completo["total"]} puntos para revisar todo un caso antes del retiro, en nueve bloques.</p><div class="ayu-acciones">'
                          f'<a class="ayu-btn is-guia" href="{root}ayuda/{completo["slug"]}.html">Usar en línea{ICO["flecha"]}</a>{_xls(completo, root)}</div></div></li>')
            cuerpo = f'<ul class="ayu-guias">{filas}</ul>'
        partes.append((k,
            f'<button class="ayu-tema" type="button" id="ayu-t-{k}" aria-expanded="false" aria-controls="ayu-{k}" data-ayu-tema="{k}" data-tema="{tema}">'
            f'<span class="doc-icon">{ICO[icono]}</span><span class="ayu-tema-t"><strong>{esc(nombre)}</strong><small>{esc(bajada)}</small></span>'
            f'<span class="ayu-tema-chev">{ICO["abajo"]}</span></button>'
            f'<div class="ayu-detalle{" is-normativa" if k == "normativa" else ""}" id="ayu-{k}" role="region" aria-labelledby="ayu-t-{k}" data-ayu-detalle="{k}" inert>'
            f'<div class="ayu-detalle-in">{cuerpo}</div></div>'))
    pie = (f'<div class="docs-pie"><p>¿No encuentras lo que buscas?</p>'
           f'<button class="docs-pie-btn" type="button" data-dock-open="especialista">{ICO["especialista"]}<span>Hablar con un especialista</span></button></div>')
    html = dict(partes)
    grupos = ''.join(f'<p class="ayu-titulo">{esc(nombre)}</p><div class="ayu-temas">{"".join(html[k] for k in claves)}</div>' for nombre, claves in GRUPOS)
    return (f'<div class="docs-panel" id="docs-panel" data-docs-panel inert><div class="docs-inner"><div class="docs-scroll"><div class="docs-wrap">'
            f'<button class="ayu-volver" type="button" data-ayu-volver hidden>{ICO["volver"]}<span>Todos los temas</span></button>'
            f'{grupos}{pie}</div></div></div></div>')


def boton_ayuda(root='', actual=False):
    href = f'{root}transporte-autorizado.html#ayuda' if root else '#ayuda'
    return (f'<a href="{href}" class="nav-docs" data-docs-open aria-controls="docs-panel" aria-expanded="false"{" aria-current=\"true\"" if actual else ""}>'
            f'Ayuda<span class="nav-docs-chev">{ICO["abajo"]}</span></a>')


def franja_checklist(c, root):
    """Fila con el checklist de una guía: usarlo en línea o descargarlo en Excel."""
    return (f'<div class="download-strip"><span class="download-icon">{ICO["lista"]}</span>'
            f'<p><strong>{esc(c["titulo"])}</strong><small>{c["total"]} puntos para revisar tu caso · úsalo en línea o en Excel</small></p>'
            f'<span class="download-actions"><a class="btn btn-ink btn-small" href="{root}ayuda/{c["slug"]}.html">Usar en línea</a>'
            f'<a class="btn btn-quiet btn-small" href="{root}{c["archivo"]}" download data-download data-toast="Descargando el checklist (Excel)">{ICO["descarga"]}<span>Excel</span></a></span></div>')


def reemplazar(s, marca, contenido):
    a, b = f'<!-- {marca}:inicio -->', f'<!-- {marca}:fin -->'
    if a not in s or b not in s:
        raise SystemExit(f'Faltan las marcas {a} … {b} en transporte-autorizado.html')
    return s[:s.index(a) + len(a)] + '\n' + contenido + s[s.index(b):]


# ---------- Página de cada guía ----------
def citas(refs, root):
    if not refs:
        return ''
    return '<span class="law-refs">' + ''.join(f'<a class="law-ref" href="{enlace_norma(r, root)}">{esc(r["texto"])}</a>' for r in refs) + '</span>'


def envoltura(titulo, descripcion, url, ld, tema, cuerpo, version, tools, clase='', scripts='', og='article'):
    """Página de «Ayuda» con la cabecera, el panel y los scripts del sitio; cuerpo = el <main>."""
    root = '../'
    return f'''<!doctype html>
<html lang="es-CL">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{esc(titulo)} | Transporte Autorizado</title>
<meta name="description" content="{esc(descripcion)}">
<meta name="robots" content="noindex,nofollow">
<link rel="canonical" href="{url}">
<meta property="og:locale" content="es_CL">
<meta property="og:type" content="{og}">
<meta property="og:site_name" content="Transporte Autorizado">
<meta property="og:title" content="{esc(titulo)}">
<meta property="og:description" content="{esc(descripcion)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}/assets/transporte/og-transporte.jpg">
<meta property="og:image:alt" content="Fotografía ilustrativa de transporte de carga">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="../assets/transporte/favicon-48.png" sizes="48x48" type="image/png">
<link rel="icon" href="../assets/transporte/favicon-192.png" sizes="192x192" type="image/png">
<link rel="apple-touch-icon" href="../assets/transporte/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/site/site.css?v={version}">
<link rel="stylesheet" href="../assets/site/transporte.css?v={version}">
<script>document.documentElement.classList.add('js')</script>
<script type="application/ld+json">
{json.dumps(ld, ensure_ascii=False, indent=2)}
</script>
</head>
<body data-site="transporte" class="guia-page{clase}" data-tema="{tema}">
<a class="skip" href="#contenido">Saltar al contenido</a>
<header class="site-header has-docs">
  <div class="container">
    <a class="brand" href="../transporte-autorizado.html" aria-label="Transporte Autorizado, inicio">
      <span class="logo-ta" aria-hidden="true"></span>
    </a>
    <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="nav" aria-label="Abrir menú">
      <svg width="20" height="20" class="icon-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="5" x2="19" y1="9" y2="9"/><line x1="5" x2="19" y1="15" y2="15"/></svg>
      <svg width="20" height="20" class="icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
    </button>
    <nav class="nav" id="nav" aria-label="Principal">
      {boton_ayuda(root, actual=True)}
      <a class="btn btn-primary btn-small" href="../transporte-autorizado.html#cotizar" data-dock-open="cotizar">Cotizar retiro</a>
    </nav>
    {menu_html(root)}
  </div>
</header>

{cuerpo}

<div data-hero data-view="inicio" data-float-only hidden><div data-panel hidden>
{tools[0]}
</div></div>
{tools[1]}

<script>window.SITE_ROOT = '../';</script>
<script src="../assets/site/site.js?v={version}" defer></script>
<script src="../assets/site/pickers.js?v={version}" defer></script>
<script src="../assets/site/seleccion.js?v={version}" defer></script>
<script src="../assets/site/interpretar.js?v={version}" defer></script>
<script src="../assets/site/geo.js?v={version}" defer></script>
<script src="../assets/site/mapa.js?v={version}" defer></script>
<script src="../assets/site/transporte.js?v={version}" defer></script>
<script src="../assets/site/transporte-ui.js?v={version}" defer></script>
<script src="../assets/site/asistente.js?v={version}" defer></script>
<script src="../assets/site/normativa.js?v={version}" defer></script>
<script src="../assets/site/ayuda.js?v={version}" defer></script>{scripts}
</body>
</html>
'''


def pagina(g, version, tools):
    root = '../'
    url = f'{SITE}/ayuda/{g["slug"]}.html'
    otras = [x for x in guias_en_orden() if x is not g]
    c = checklist_de(g)
    ld = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'Article', '@id': f'{url}#guia', 'headline': g['titulo'], 'description': g['descripcion'],
                'inLanguage': 'es-CL', 'url': url, 'isAccessibleForFree': True,
                'publisher': {'@type': 'Organization', 'name': 'Transporte Autorizado', 'url': f'{SITE}/'},
                'about': [{'@type': 'Thing', 'name': 'Transporte de residuos'}, {'@type': 'Thing', 'name': 'Residuos peligrosos'}],
                'citation': [{'@type': 'Legislation', 'name': r['texto'], 'url': f'{SITE}/normativa/{r["slug"]}.html'} for r in g['normas']],
                'isPartOf': {'@type': 'CollectionPage', 'name': 'Ayuda de Transporte Autorizado', 'url': f'{SITE}/#ayuda'},
                'hasPart': {'@type': 'HowTo', 'name': c['titulo'], 'url': f'{SITE}/ayuda/{c["slug"]}.html'},
            },
            {
                '@type': 'HowTo', 'name': f'Cómo usar la guía: {g["titulo"]}', 'inLanguage': 'es-CL',
                'step': [{'@type': 'HowToStep', 'position': i + 1, 'text': p} for i, p in enumerate(g['pasos'])],
            },
            {
                '@type': 'BreadcrumbList',
                'itemListElement': [
                    {'@type': 'ListItem', 'position': 1, 'name': 'Transporte Autorizado', 'item': f'{SITE}/'},
                    {'@type': 'ListItem', 'position': 2, 'name': 'Ayuda', 'item': f'{SITE}/#ayuda'},
                    {'@type': 'ListItem', 'position': 3, 'name': g['corto']},
                ],
            },
        ],
    }
    saber = ''.join(f'<li>{ICO["check"]}<span>{esc(t)}{citas(rs, root)}</span></li>' for t, rs in g['saber'])
    pasos = ''.join(f'<li><span>{esc(p)}</span></li>' for p in g['pasos'])
    errores = ''.join(f'<li>{ICO["x"]}<span>{esc(e)}</span></li>' for e in g['errores'])
    matriz = ''
    if g.get('matriz'):
        filas = ''.join(
            f'<tr><th scope="row">{esc(escenario)}</th><td data-label="¿Autorización sanitaria?"><span class="gm-ans is-{k}">{esc(a)}</span></td>'
            f'<td data-label="Qué se exige">{esc(c)}</td><td data-label="Base">{citas(rs, root) or "Revisión específica del caso"}</td></tr>'
            for escenario, a, k, c, rs in g['matriz'])
        matriz = ('<section class="guia-sec" aria-labelledby="escenarios"><h2 id="escenarios">Escenarios frecuentes</h2>'
                  '<p class="guia-sub">Resumen orientativo. Valida siempre la clasificación, quién transporta, la cantidad, el destino y los documentos del caso.</p>'
                  '<div class="guia-matrix"><table><thead><tr><th scope="col">Escenario</th><th scope="col">¿Autorización sanitaria de transporte?</th>'
                  f'<th scope="col">Qué se exige</th><th scope="col">Base</th></tr></thead><tbody>{filas}</tbody></table></div></section>')
    normas = ''.join(f'<li><a href="{root}normativa/{r["slug"]}.html" data-tema="{TEMA_NORMA.get(r["slug"], "marco")}"><span class="doc-icon">{N.icono_tema(TEMA_NORMA.get(r["slug"], "marco"))}</span><span><strong>{esc(r["texto"])}</strong></span>{ICO["chev"]}</a></li>' for r in g['normas'])
    mas = ''.join(f'<li><a href="{x["slug"]}.html" data-tema="{x["tema"]}"><span class="doc-icon">{ICO[x["icono"]]}</span><span><strong>{esc(x["titulo"])}</strong><small>{esc(x["resumen"])}</small></span>{ICO["chev"]}</a></li>' for x in otras)
    cta_principal = accion(*g['accion'], root, 'btn btn-ink btn-small')
    cta_descarga = f'<a class="btn btn-quiet btn-small" href="{root}ayuda/{c["slug"]}.html">{ICO["lista"]}<span>Usar el checklist</span></a>'
    cuerpo = f'''<main id="contenido">
  <article class="container guia">
    <nav class="norm-crumbs" aria-label="Ruta"><a href="../transporte-autorizado.html">Inicio</a><span aria-hidden="true">/</span><a href="../transporte-autorizado.html#ayuda" data-docs-open>Ayuda</a><span aria-hidden="true">/</span><span aria-current="page">{esc(g["corto"])}</span></nav>
    <header class="guia-head">
      <p class="norm-kind"><span class="doc-icon">{ICO[g["icono"]]}</span>{esc(g["kicker"])}</p>
      <h1 class="norm-title">{esc(g["titulo"])}</h1>
      <p class="norm-lead">{esc(g["intro"])}</p>
      <div class="norm-actions guia-actions">{cta_principal}{cta_descarga}</div>
    </header>

    <section class="guia-sec" aria-labelledby="saber"><h2 id="saber">Qué debes saber</h2><ul class="guia-points">{saber}</ul></section>
    {matriz}
    <section class="guia-sec" aria-labelledby="pasos"><h2 id="pasos">Cómo usar esta guía</h2><ol class="guia-steps">{pasos}</ol></section>
    <section class="guia-sec" aria-labelledby="errores"><h2 id="errores">Errores frecuentes</h2><ul class="guia-errors">{errores}</ul></section>
    <section class="guia-sec" aria-label="Checklist de esta guía">{franja_checklist(c, root)}</section>
    {f'<section class="guia-sec" aria-labelledby="normas"><h2 id="normas">Normativa relacionada</h2><ul class="guia-links">{normas}</ul></section>' if g['normas'] else ''}
    <section class="guia-sec" aria-labelledby="otras"><h2 id="otras">Otras guías</h2><ul class="guia-links guia-more">{mas}</ul></section>

    <footer class="norm-source">
      <p>Orientación general para preparar un retiro: no reemplaza la revisión técnica ni legal de cada caso. Las citas enlazan al texto oficial publicado en Ley Chile (Biblioteca del Congreso Nacional).</p>
      <a class="btn btn-quiet btn-small" href="../transporte-autorizado.html#ayuda" data-docs-open>{ICO["volver"]}Ver más ayuda</a>
    </footer>
  </article>
</main>'''
    return envoltura(g['titulo'], g['descripcion'], url, ld, g['tema'], cuerpo, version, tools)


ESTADOS = [  # valor, nombre, clase de color
    ('pendiente', 'Pendiente', ''), ('cumple', 'Cumple', 'is-ok'), ('confirmar', 'Por confirmar', 'is-wait'),
    ('no-cumple', 'No cumple', 'is-no'), ('no-aplica', 'No aplica', 'is-na'),
]


def pagina_checklist(version, tools):
    """Checklist de autorización para usar en línea: cada punto se marca con un toque (y tiene sus otros estados en una
    ventana de selección); las marcas quedan en el dispositivo (assets/site/checklist.js). El texto está en la página,
    así se lee sin scripts y lo encuentran los buscadores."""
    root = '../'
    c = CHECKLIST
    datos = json.loads((ROOT / c['datos']).read_text(encoding='utf-8'))
    total = sum(len(b['puntos']) for b in datos['bloques'])
    url = f'{SITE}/{c["pagina"]}'
    descripcion = f'Checklist de {total} puntos para revisar un caso antes de coordinar el retiro de residuos: identificación, peligrosidad, producto prioritario, transportista, autorización sanitaria, vehículo, documentos, destino y cierre. Úsalo en línea o descárgalo en Excel.'
    ld = {
        '@context': 'https://schema.org',
        '@graph': [
            {'@type': 'HowTo', '@id': f'{url}#checklist', 'name': c['titulo'], 'description': descripcion, 'inLanguage': 'es-CL', 'url': url,
             'step': [{'@type': 'HowToSection', 'name': b['nombre'], 'itemListElement': [{'@type': 'HowToStep', 'position': q['n'], 'text': q['criterio']} for q in b['puntos']]} for b in datos['bloques']]},
            {'@type': 'BreadcrumbList', 'itemListElement': [
                {'@type': 'ListItem', 'position': 1, 'name': 'Transporte Autorizado', 'item': f'{SITE}/'},
                {'@type': 'ListItem', 'position': 2, 'name': 'Ayuda', 'item': f'{SITE}/#ayuda'},
                {'@type': 'ListItem', 'position': 3, 'name': 'Checklist de autorización'}]},
        ],
    }
    chev = _i('<path d="m6 9 6 6 6-6"/>', 14, 2.4)
    bloques = []
    for i, b in enumerate(datos['bloques'], 1):
        puntos = []
        for q in b['puntos']:
            n = q['n']
            refs = citas([{'slug': r['slug'], 'art': r['art'], 'texto': r['texto']} for r in q.get('normas', [])], root)
            puntos.append(
                f'<li class="ck-punto" data-n="{n}" data-estado="pendiente">'
                f'<button type="button" class="ck-marca" role="checkbox" aria-checked="false" aria-labelledby="ck-{n}" aria-describedby="ck-{n}-e" disabled>{ICO["check"]}</button>'
                f'<div class="ck-texto"><p class="ck-criterio" id="ck-{n}"><span class="ck-n">{n}</span>{esc(q["criterio"])}</p>'
                f'<p class="ck-evidencia" id="ck-{n}-e">{esc(q["evidencia"])}</p>{refs}'
                f'<button type="button" class="ck-estado" data-ck-estado disabled><span class="ck-estado-t">Pendiente</span>{chev}</button></div></li>')
        bloques.append(
            f'<section class="ck-bloque" id="bloque-{i}" aria-labelledby="bloque-{i}-t" data-ck-bloque>'
            f'<h2 id="bloque-{i}-t"><span class="ck-num">{i}</span><span class="ck-nombre">{esc(b["nombre"])}</span>'
            f'<small class="ck-avance" data-ck-avance>{len(b["puntos"])} puntos</small></h2>'
            f'<ol class="ck-lista">{"".join(puntos)}</ol></section>')
    leyenda = ''.join(f'<li class="{k}"><i aria-hidden="true"></i>{esc(nombre)}</li>' for _, nombre, k in ESTADOS)
    cuerpo = f'''<main id="contenido">
  <article class="container guia ck" data-checklist data-formato="casillas" data-clave="ta-checklist-autorizacion" data-total="{total}" data-estados='{esc(json.dumps([[v, n] for v, n, _ in ESTADOS], ensure_ascii=False))}'>
    <nav class="norm-crumbs" aria-label="Ruta"><a href="../transporte-autorizado.html">Inicio</a><span aria-hidden="true">/</span><a href="../transporte-autorizado.html#checklists" data-docs-open="checklists">Checklists</a><span aria-hidden="true">/</span><span aria-current="page">Revisión completa de autorización</span></nav>
    <header class="guia-head">
      <p class="norm-kind"><span class="doc-icon">{ICO["hoja"]}</span>Checklist · {total} puntos en {len(datos["bloques"])} bloques</p>
      <h1 class="norm-title">{esc(c["titulo"])}</h1>
      <p class="norm-lead">Para revisar un caso antes de coordinar el retiro. Toca el círculo de cada punto cuando lo hayas verificado; si queda pendiente de confirmar, no cumple o no aplica, cámbialo en su estado. Tus marcas quedan guardadas en este dispositivo.</p>
      <div class="norm-actions guia-actions"><a class="btn btn-ink btn-small" href="{root}{c["archivo"]}" download data-download data-ck-excel data-toast="Descargando el checklist con tus marcas (Excel)">{ICO["excel"]}<span>Descargar Excel</span></a><button class="btn btn-quiet btn-small" type="button" data-ck-pdf data-download data-toast="Descargando el checklist con tus marcas (PDF)" hidden>{ICO["pdf"]}<span>Descargar PDF</span></button></div>
    </header>

    <div class="ck-barra" data-ck-barra hidden>
      <p class="ck-cuenta" aria-live="polite"><strong data-ck-hechos>0</strong> de {total} revisados<span class="ck-detalle" data-ck-detalle></span></p>
      <div class="ck-progreso" aria-hidden="true"><i data-ck-progreso></i></div>
      <button class="ck-borrar" type="button" data-ck-borrar hidden>Borrar marcas</button>
    </div>
    <ul class="ck-leyenda" aria-label="Estados de cada punto">{leyenda}</ul>

    {"".join(bloques)}

    <section class="guia-sec" aria-labelledby="otros"><h2 id="otros">Checklists por tema</h2><ul class="guia-links guia-more">{lista_checklists('checklist-autorizacion-transporte', root)}</ul></section>

    <footer class="norm-source">
      <p>Pauta de revisión preparada por Transporte Autorizado. Orientación general: no reemplaza la revisión técnica ni legal de cada caso. Las citas enlazan al texto oficial publicado en Ley Chile (Biblioteca del Congreso Nacional).</p>
      <a class="btn btn-quiet btn-small" href="../transporte-autorizado.html#checklists" data-docs-open="checklists">{ICO["volver"]}Ver todos los checklists</a>
    </footer>
  </article>
</main>'''
    return envoltura(c['titulo'], descripcion, url, ld, 'rep', cuerpo, version, tools, clase=' ck-page',
                     scripts=f'\n<script src="../assets/site/exportar.js?v={version}" defer></script>\n<script src="../assets/site/checklist.js?v={version}" defer></script>')


ESTADOS_4 = [('pendiente', 'Pendiente', ''), ('cumple', 'Cumple', 'is-ok'), ('no-cumple', 'No cumple', 'is-no'), ('no-aplica', 'No aplica', 'is-na')]
NORMA_REF = {'D.S. 148': 'ds-148-2003-minsal', 'D.S. 29': 'ds-29-2024-minsal', 'Ley 20.920': 'ley-20920'}


def refs_checklist(texto):
    """«D.S. 148 art. 39 / Guía base» → citas a la norma (la guía base ya está enlazada arriba de la página)."""
    out = []
    for parte in texto.split('/'):
        m = re.match(r'\s*(D\.S\. 148|D\.S\. 29|Ley 20\.920)(?:\s+art\.\s*(\d+))?\s*$', parte)
        if m:
            out.append(ref(NORMA_REF[m.group(1)], m.group(2)))
    return out


def lista_checklists(actual, root):
    return ''.join(f'<li><a href="{x["slug"]}.html" data-tema="{x["tema"]}"><span class="doc-icon">{ICO["lista"]}</span><span><strong>{esc(x["titulo"])}</strong>'
                   f'<small>{x["total"]} puntos</small></span>{ICO["chev"]}</a></li>' for x in checklists() if x['slug'] != actual)


def pagina_checklist_cliente(c, version, tools):
    """Checklist del cliente para usar en línea: los mismos puntos, secciones y estados de su Excel (Pendiente, Cumple,
    No cumple, No aplica). Las marcas quedan en el dispositivo (assets/site/checklist.js)."""
    root = '../'
    datos, g = c['datos'], c['guia']
    total = c['total']
    url = f'{SITE}/ayuda/{c["slug"]}.html'
    descripcion = f'{c["titulo"]}: {total} puntos para revisar antes del retiro. {datos["finalidad"]} Úsalo en línea o descárgalo en Excel.'
    ld = {
        '@context': 'https://schema.org',
        '@graph': [
            {'@type': 'HowTo', '@id': f'{url}#checklist', 'name': c['titulo'], 'description': descripcion, 'inLanguage': 'es-CL', 'url': url,
             'tool': [{'@type': 'HowToTool', 'name': 'Planilla Excel del checklist'}],
             'step': [{'@type': 'HowToSection', 'name': b['nombre'], 'itemListElement': [{'@type': 'HowToStep', 'position': q['n'], 'name': q['item'], 'text': q['revisar']} for q in b['puntos']]} for b in datos['bloques']],
             'isBasedOn': {'@type': 'Article', 'name': g['titulo'], 'url': f'{SITE}/ayuda/{g["slug"]}.html'}},
            {'@type': 'BreadcrumbList', 'itemListElement': [
                {'@type': 'ListItem', 'position': 1, 'name': 'Transporte Autorizado', 'item': f'{SITE}/'},
                {'@type': 'ListItem', 'position': 2, 'name': 'Ayuda', 'item': f'{SITE}/#ayuda'},
                {'@type': 'ListItem', 'position': 3, 'name': c['menu']}]},
        ],
    }
    chev = _i('<path d="m6 9 6 6 6-6"/>', 14, 2.4)
    bloques = []
    for i, b in enumerate(datos['bloques'], 1):
        puntos = []
        for q in b['puntos']:
            n = q['n']
            aplica = '' if q['aplica'] == 'Siempre' else f'<p class="ck-aplica">{esc(q["aplica"])}</p>'
            puntos.append(
                f'<li class="ck-punto" data-n="{n}" data-estado="pendiente">'
                f'<button type="button" class="ck-marca" role="checkbox" aria-checked="false" aria-labelledby="ck-{n}" aria-describedby="ck-{n}-e" disabled>{ICO["check"]}</button>'
                f'<div class="ck-texto"><p class="ck-criterio" id="ck-{n}"><span class="ck-n">{n}</span>{esc(q["item"])}</p>'
                f'<p class="ck-evidencia" id="ck-{n}-e">{esc(q["revisar"])}</p>'
                f'<p class="ck-prueba"><span>Evidencia</span>{esc(q["evidencia"])}</p>{aplica}{citas(refs_checklist(q["referencia"]), root)}'
                f'<button type="button" class="ck-estado" data-ck-estado disabled><span class="ck-estado-t">Pendiente</span>{chev}</button></div></li>')
        bloques.append(
            f'<section class="ck-bloque" id="bloque-{i}" aria-labelledby="bloque-{i}-t" data-ck-bloque>'
            f'<h2 id="bloque-{i}-t"><span class="ck-num">{i}</span><span class="ck-nombre">{esc(b["nombre"])}</span>'
            f'<small class="ck-avance" data-ck-avance>{len(b["puntos"])} {"punto" if len(b["puntos"]) == 1 else "puntos"}</small></h2>'
            f'<ol class="ck-lista">{"".join(puntos)}</ol></section>')
    leyenda = ''.join(f'<li class="{k}"><i aria-hidden="true"></i>{esc(nombre)}</li>' for _, nombre, k in ESTADOS_4)
    cuerpo = f"""<main id="contenido">
  <article class="container guia ck is-cliente" data-checklist data-formato="cliente" data-clave="ta-{c["slug"]}" data-total="{total}" data-estados='{esc(json.dumps([[v, n] for v, n, _ in ESTADOS_4], ensure_ascii=False))}'>
    <nav class="norm-crumbs" aria-label="Ruta"><a href="../transporte-autorizado.html">Inicio</a><span aria-hidden="true">/</span><a href="../transporte-autorizado.html#checklists" data-docs-open="checklists">Checklists</a><span aria-hidden="true">/</span><span aria-current="page">{esc(c["menu"])}</span></nav>
    <header class="guia-head">
      <p class="norm-kind"><span class="doc-icon">{ICO["lista"]}</span>Checklist · {total} puntos</p>
      <h1 class="norm-title">{esc(c["titulo"])}</h1>
      <p class="norm-lead">{esc(datos["finalidad"])} Toca el círculo de cada punto cuando lo hayas verificado; si no cumple o no aplica, cámbialo en su estado. Tus marcas quedan guardadas en este dispositivo.</p>
      <div class="norm-actions guia-actions"><a class="btn btn-ink btn-small" href="{root}{c["archivo"]}" download data-download data-ck-excel data-toast="Descargando el checklist con tus marcas (Excel)">{ICO["excel"]}<span>Descargar Excel</span></a><a class="btn btn-quiet btn-small" href="{g["slug"]}.html">{ICO[g["icono"]]}<span>Leer la guía</span></a><button class="btn btn-quiet btn-small" type="button" data-ck-pdf data-download data-toast="Descargando el checklist con tus marcas (PDF)" hidden>{ICO["pdf"]}<span>Descargar PDF</span></button></div>
    </header>

    <div class="ck-barra" data-ck-barra hidden>
      <p class="ck-cuenta" aria-live="polite"><strong data-ck-hechos>0</strong> de {total} revisados<span class="ck-detalle" data-ck-detalle></span></p>
      <div class="ck-progreso" aria-hidden="true"><i data-ck-progreso></i></div>
      <button class="ck-borrar" type="button" data-ck-borrar hidden>Borrar marcas</button>
    </div>
    <ul class="ck-leyenda" aria-label="Estados de cada punto">{leyenda}</ul>

    {"".join(bloques)}

    <section class="guia-sec" aria-labelledby="guia-base"><h2 id="guia-base">Guía de este checklist</h2><ul class="guia-links guia-more">
      <li><a href="{g["slug"]}.html" data-tema="{g["tema"]}"><span class="doc-icon">{ICO[g["icono"]]}</span><span><strong>{esc(g["titulo"])}</strong><small>{esc(g["resumen"])}</small></span>{ICO["chev"]}</a></li>
    </ul></section>
    <section class="guia-sec" aria-labelledby="otros"><h2 id="otros">Otros checklists</h2><ul class="guia-links guia-more">{lista_checklists(c["slug"], root)}</ul></section>

    <footer class="norm-source">
      <p>Pauta de revisión preparada por Transporte Autorizado a partir de su guía «{esc(g["titulo"])}». Orientación general: no reemplaza la revisión técnica ni legal de cada caso; pueden existir requisitos adicionales según el residuo, la operación y la normativa aplicable. Las citas enlazan al texto oficial publicado en Ley Chile.</p>
      <a class="btn btn-quiet btn-small" href="../transporte-autorizado.html#checklists" data-docs-open="checklists">{ICO["volver"]}Ver todos los checklists</a>
    </footer>
  </article>
</main>"""
    return envoltura(c['titulo'], descripcion, url, ld, g['tema'], cuerpo, version, tools, clase=' ck-page',
                     scripts=f'\n<script src="../assets/site/exportar.js?v={version}" defer></script>\n<script src="../assets/site/checklist.js?v={version}" defer></script>')


def validar_checklists():
    """Cada cita de los checklists debe llevar a un artículo que exista."""
    faltan = []
    for c in checklists():
        for b in c.get('datos', {}).get('bloques', []):
            for q in b['puntos']:
                for r in refs_checklist(q['referencia']):
                    page = ROOT / 'normativa' / f'{r["slug"]}.html'
                    if not page.exists() or (r['art'] and f'id="art-{r["art"]}"' not in page.read_text(encoding='utf-8')):
                        faltan.append(f'{c["slug"]} punto {q["n"]}: {r["texto"]}')
    if faltan:
        raise SystemExit('Citas sin destino:\n' + '\n'.join(faltan))


def datos_portada(s):
    """Datos estructurados de la portada: la ayuda (guías y checklists) como parte de la página y el LinkedIn oficial de
    la organización. Se reescriben en cada pasada, así siguen a las guías sin editarlos a mano."""
    a = s.index('<script type="application/ld+json">') + len('<script type="application/ld+json">')
    b = s.index('</script>', a)
    ld = json.loads(s[a:b])
    grafo = [n for n in ld['@graph'] if n.get('@id') != f'{SITE}/#ayuda']
    for n in grafo:
        if n.get('@type') == 'Organization':
            n['sameAs'] = ['https://www.linkedin.com/company/transporte-autorizado/']
    grafo.append({
        '@type': 'CollectionPage', '@id': f'{SITE}/#ayuda', 'name': 'Ayuda: guías rápidas, checklists y normativa', 'inLanguage': 'es-CL',
        'url': f'{SITE}/#ayuda', 'isPartOf': {'@id': f'{SITE}/#website'},
        'hasPart': [{'@type': 'Article', 'name': g['titulo'], 'url': f'{SITE}/ayuda/{g["slug"]}.html'} for g in guias_en_orden()]
                   + [{'@type': 'HowTo', 'name': c['titulo'], 'url': f'{SITE}/ayuda/{c["slug"]}.html'} for c in checklists()],
    })
    ld['@graph'] = grafo
    return s[:a] + '\n' + json.dumps(ld, ensure_ascii=False, indent=2) + '\n' + s[b:]


def main():
    validar_anclas()
    validar_checklists()
    version = N.version_actual()
    tools = N.herramientas()
    (ROOT / 'ayuda').mkdir(exist_ok=True)
    (ROOT / 'documentos').mkdir(exist_ok=True)
    for g in GUIAS:
        (ROOT / 'ayuda' / f'{g["slug"]}.html').write_text(pagina(g, version, tools), encoding='utf-8')
        print(f'ayuda/{g["slug"]}.html')
        if g['slug'] not in ANTERIORES:
            continue
        # Las primeras guías estuvieron publicadas en documentos/: esa dirección lleva a la nueva
        destino = f'../ayuda/{g["slug"]}.html'
        (ROOT / 'documentos' / f'{g["slug"]}.html').write_text(
            f'<!doctype html>\n<html lang="es-CL">\n<head>\n<meta charset="utf-8">\n<title>{esc(g["titulo"])}</title>\n'
            f'<meta name="robots" content="noindex,nofollow">\n<link rel="canonical" href="{destino}">\n'
            f'<meta http-equiv="refresh" content="0; url={destino}">\n</head>\n'
            f'<body>\n<p>Esta guía ahora está en <a href="{destino}">Ayuda</a>.</p>\n</body>\n</html>\n', encoding='utf-8')
    (ROOT / CHECKLIST['pagina']).write_text(pagina_checklist(version, tools), encoding='utf-8')
    print(CHECKLIST['pagina'])
    for c in checklists():
        if c.get('completo'):
            continue
        (ROOT / 'ayuda' / f'{c["slug"]}.html').write_text(pagina_checklist_cliente(c, version, tools), encoding='utf-8')
        print(f'ayuda/{c["slug"]}.html')
    p = ROOT / 'transporte-autorizado.html'
    s = p.read_text(encoding='utf-8')
    s = reemplazar(s, 'ayuda:menu', '    ' + menu_html('') + '\n')
    s = datos_portada(s)
    p.write_text(s, encoding='utf-8')
    print('transporte-autorizado.html: panel de Ayuda')


if __name__ == '__main__':
    main()
