<?php
/**
 * Solicitudes que llegan desde los formularios del sitio.
 *
 * Cada solicitud se guarda en WordPress (menú «Solicitudes»), recibe un número y genera dos correos: uno al equipo
 * y otro a la persona, con su número. Cuando el equipo pasa la solicitud a «Lista», la persona recibe otro correo.
 *
 * Protección del formulario (es público, sin inicio de sesión): solo se acepta desde las páginas del propio sitio,
 * con un permiso firmado y con hora de un solo uso (corta envíos automáticos y repetidos) y un campo trampa; hay
 * límites por visita, por correo, por hora y por día; se rechazan los correos de los dominios bloqueados en los
 * ajustes, las visitas de los países bloqueados (si el servidor informa el país) y el texto en cirílico; todo llega
 * con tamaño máximo y sin HTML. Las fotografías se revisan y se vuelven a generar antes de guardarlas (inc/fotos.php).
 */

defined( 'ABSPATH' ) || exit;

/* ---------- Tipo de contenido ---------- */

function ta_sitio_tipo_solicitud() {
	register_post_type(
		'ta_solicitud',
		array(
			'labels'              => array(
				'name'               => 'Solicitudes',
				'singular_name'      => 'Solicitud',
				'menu_name'          => 'Solicitudes',
				'all_items'          => 'Todas las solicitudes',
				'edit_item'          => 'Solicitud',
				'search_items'       => 'Buscar solicitudes',
				'not_found'          => 'Todavía no llegan solicitudes.',
				'not_found_in_trash' => 'No hay solicitudes en la papelera.',
			),
			'public'              => false,
			'show_ui'             => true,
			'show_in_menu'        => true,
			'show_in_rest'        => false,
			'exclude_from_search' => true,
			'publicly_queryable'  => false,
			'has_archive'         => false,
			'rewrite'             => false,
			'menu_icon'           => 'dashicons-clipboard',
			'menu_position'       => 26,
			'supports'            => array( 'title' ),
			'capability_type'     => 'page',
			'map_meta_cap'        => true,
			'capabilities'        => array( 'create_posts' => 'do_not_allow' ),  // solo llegan desde el sitio
		)
	);
}
add_action( 'init', 'ta_sitio_tipo_solicitud', 4 );

/* ---------- Entrada desde el sitio (REST) ---------- */

add_action(
	'rest_api_init',
	static function () {
		register_rest_route(
			'ta/v1',
			'/permiso',
			array(
				'methods'             => 'GET',
				'permission_callback' => '__return_true',
				'callback'            => 'ta_sitio_rest_permiso',
			)
		);
		register_rest_route(
			'ta/v1',
			'/solicitudes',
			array(
				'methods'             => 'POST',
				'permission_callback' => '__return_true',
				'callback'            => 'ta_sitio_rest_crear',
			)
		);
	}
);

/** Las respuestas de este servicio no se guardan en ninguna caché. */
function ta_sitio_sin_cache( WP_REST_Response $respuesta ) {
	$respuesta->header( 'Cache-Control', 'no-store, private' );
	$respuesta->header( 'X-LiteSpeed-Cache-Control', 'no-cache' );
	$respuesta->header( 'X-Robots-Tag', 'noindex' );
	do_action( 'litespeed_control_set_nocache', 'solicitudes de Transporte Autorizado' );
	return $respuesta;
}

function ta_sitio_firma( $hora, $azar ) {
	return hash_hmac( 'sha256', 'ta-solicitud|' . $hora . '|' . $azar, wp_salt( 'nonce' ) );
}

/**
 * Permiso para enviar: la hora de emisión y un valor al azar, firmados. Vale desde unos segundos después hasta
 * cuatro horas, una sola vez. El valor al azar hace distinto cada permiso: dos visitas en el mismo segundo no
 * comparten el suyo.
 */
function ta_sitio_rest_permiso() {
	$hora = time();
	$azar = bin2hex( random_bytes( 8 ) );
	return ta_sitio_sin_cache( new WP_REST_Response( array( 'permiso' => $hora . '.' . $azar . '.' . ta_sitio_firma( $hora, $azar ) ) ) );
}

/**
 * Direcciones IP de la visita: la que ve el servidor y la que anota la red del proveedor.
 * De X-Forwarded-For solo sirve la última: la agrega la red que está delante del sitio; las anteriores las puede
 * escribir quien envía, y con ellas se saltaría el límite por visita.
 */
function ta_sitio_ips() {
	$servidor = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
	$cadena   = isset( $_SERVER['HTTP_X_FORWARDED_FOR'] ) ? explode( ',', sanitize_text_field( wp_unslash( $_SERVER['HTTP_X_FORWARDED_FOR'] ) ) ) : array();
	$ultima   = trim( (string) end( $cadena ) );
	return array(
		'servidor' => $servidor,
		'visita'   => filter_var( $ultima, FILTER_VALIDATE_IP ) ? $ultima : $servidor,
	);
}

/** Clave para contar envíos sin guardar el dato (IP o correo) tal cual. */
function ta_sitio_huella( $dato ) {
	return substr( hash_hmac( 'sha256', strtolower( (string) $dato ), wp_salt( 'auth' ) ), 0, 20 );
}

/** Cuenta un envío y dice si se pasó del límite. */
function ta_sitio_sobre_limite( $clave, $maximo, $segundos ) {
	$n = (int) get_transient( $clave );
	if ( $n >= $maximo ) {
		return true;
	}
	set_transient( $clave, $n + 1, $segundos );
	return false;
}

function ta_sitio_error( $codigo, $mensaje, $estado ) {
	return new WP_Error( $codigo, $mensaje, array( 'status' => $estado ) );
}

/** Texto de una línea, sin HTML ni saltos, con largo máximo. Conserva los %XX: el enlace del mapa los necesita. */
function ta_sitio_texto( $valor, $largo ) {
	$valor = is_scalar( $valor ) ? wp_check_invalid_utf8( (string) $valor ) : '';
	$valor = wp_strip_all_tags( $valor, true );
	$valor = trim( (string) preg_replace( '/[\x00-\x1F\x7F\s]+/u', ' ', $valor ) );
	return function_exists( 'mb_substr' ) ? mb_substr( $valor, 0, $largo ) : substr( $valor, 0, $largo );
}

/** ¿El envío viene de una página de este sitio? Un navegador siempre dice desde dónde envía (cabecera Origin). */
function ta_sitio_origen_propio() {
	$origen = isset( $_SERVER['HTTP_ORIGIN'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_ORIGIN'] ) ) : '';
	if ( '' === $origen ) {
		return true;  // sin navegador de por medio no hay otra página que abuse de la visita de alguien
	}
	$sin_www = static function ( $url ) {
		return preg_replace( '/^www\./', '', strtolower( (string) wp_parse_url( $url, PHP_URL_HOST ) ) );
	};
	return $sin_www( $origen ) === $sin_www( home_url() );
}

function ta_sitio_rest_crear( WP_REST_Request $pedido ) {
	// Llega como formulario («datos» en JSON, más las fotografías en «fotos[]») o, sin fotografías, como JSON.
	$crudo = $pedido->get_param( 'datos' );
	$datos = is_string( $crudo ) ? json_decode( $crudo, true ) : $pedido->get_json_params();
	if ( ! is_array( $datos ) || strlen( is_string( $crudo ) ? $crudo : (string) $pedido->get_body() ) > 40000 ) {
		return ta_sitio_error( 'ta_datos', 'No pudimos leer la solicitud.', 400 );
	}

	// 0. Solo desde las páginas del propio sitio, y no desde los países bloqueados (si el servidor informa el país).
	if ( ! ta_sitio_origen_propio() || ta_sitio_pais_bloqueado() ) {
		return ta_sitio_error( 'ta_rechazada', 'No pudimos recibir la solicitud.', 403 );
	}
	// 1. Campo trampa: las personas no lo ven; un programa que rellena todo, sí.
	if ( ! empty( $datos['sitio'] ) ) {
		return ta_sitio_error( 'ta_rechazada', 'No pudimos recibir la solicitud.', 400 );
	}
	// 2. Permiso firmado y con hora.
	$partes = explode( '.', is_string( $datos['permiso'] ?? null ) ? $datos['permiso'] : '' );
	$hora   = isset( $partes[0] ) && ctype_digit( $partes[0] ) ? (int) $partes[0] : 0;
	$azar   = isset( $partes[1] ) && 16 === strlen( $partes[1] ) && ctype_xdigit( $partes[1] ) ? $partes[1] : '';
	$edad   = time() - $hora;
	if ( 3 !== count( $partes ) || '' === $azar || ! hash_equals( ta_sitio_firma( $hora, $azar ), $partes[2] ) || $edad < 2 || $edad > 4 * HOUR_IN_SECONDS ) {
		return ta_sitio_error( 'ta_permiso', 'La página estuvo abierta mucho tiempo. Vuelve a preparar la solicitud.', 403 );
	}
	// 3. Cada permiso sirve una vez.
	$usado = 'ta_p_' . substr( $partes[2], 0, 32 );
	if ( get_transient( $usado ) ) {
		return ta_sitio_error( 'ta_repetida', 'Esta solicitud ya fue enviada.', 409 );
	}

	// 4. Datos de contacto.
	$contacto = is_array( $datos['contacto'] ?? null ) ? $datos['contacto'] : array();
	$correo   = sanitize_email( is_string( $contacto['correo'] ?? null ) ? $contacto['correo'] : '' );
	$c        = array(
		'empresa'  => ta_sitio_texto( $contacto['empresa'] ?? '', 160 ),
		'nombre'   => ta_sitio_texto( $contacto['nombre'] ?? '', 120 ),
		'telefono' => ta_sitio_texto( $contacto['telefono'] ?? '', 30 ),
		'correo'   => $correo,
	);
	if ( '' === $c['nombre'] || ! is_email( $correo ) ) {
		return ta_sitio_error( 'ta_contacto', 'Faltan el nombre o un correo válido.', 422 );
	}
	if ( '' !== $c['telefono'] && strlen( (string) preg_replace( '/\D/', '', $c['telefono'] ) ) < 8 ) {
		return ta_sitio_error( 'ta_contacto', 'Revisa el teléfono: debe tener al menos 8 números.', 422 );
	}
	if ( ta_sitio_correo_bloqueado( $correo ) ) {
		return ta_sitio_error( 'ta_correo', 'No podemos recibir solicitudes con ese correo. Usa otro o escríbenos por WhatsApp.', 422 );
	}
	// 5. Lo que la persona respondió: pares «dato: valor».
	$campos = array();
	foreach ( array_slice( is_array( $datos['campos'] ?? null ) ? $datos['campos'] : array(), 0, 40 ) as $par ) {
		if ( is_array( $par ) && isset( $par[0], $par[1] ) ) {
			$dato  = ta_sitio_texto( $par[0], 80 );
			$valor = ta_sitio_texto( $par[1], 600 );
			if ( '' !== $dato && '' !== $valor ) {
				$campos[] = array( $dato, $valor );
			}
		}
	}
	if ( ! $campos ) {
		return ta_sitio_error( 'ta_vacia', 'La solicitud llegó sin datos.', 422 );
	}
	// 6. Correo basura: texto en cirílico (el sitio atiende en español) o varios enlaces ajenos.
	$todo = implode( ' ', $c );
	foreach ( $campos as $par ) {
		$todo .= ' ' . $par[0] . ' ' . $par[1];
	}
	preg_match_all( '#(?:https?://|(?<![/.\w])www\.)\S+#i', $todo, $enlaces );
	$ajenos = array_filter(
		$enlaces[0],
		static function ( $enlace ) {
			return 0 !== strpos( $enlace, 'https://www.google.com/maps/' );  // el del mapa lo arma el propio sitio
		}
	);
	if ( preg_match( '/\p{Cyrillic}/u', $todo ) || count( $ajenos ) > 2 ) {
		return ta_sitio_error( 'ta_rechazada', 'No pudimos recibir la solicitud.', 400 );
	}
	// 7. Límites: por visita, por correo y en total (evitan que el formulario se use para llenar casillas de correo).
	$ips     = ta_sitio_ips();
	$limites = array(
		array( 'ta_v_' . ta_sitio_huella( $ips['visita'] ), 8, HOUR_IN_SECONDS ),
		array( 'ta_s_' . ta_sitio_huella( $ips['servidor'] ), 30, HOUR_IN_SECONDS ),
		array( 'ta_c_' . ta_sitio_huella( $correo ), 5, HOUR_IN_SECONDS ),
		array( 'ta_cd_' . ta_sitio_huella( $correo ) . gmdate( 'md' ), 12, DAY_IN_SECONDS ),
		array( 'ta_hora_' . gmdate( 'YmdH' ), 60, HOUR_IN_SECONDS ),
		array( 'ta_dia_' . gmdate( 'Ymd' ), 200, DAY_IN_SECONDS ),
	);
	foreach ( $limites as $l ) {
		if ( ta_sitio_sobre_limite( $l[0], $l[1], $l[2] ) ) {
			return ta_sitio_error( 'ta_limite', 'Recibimos muchas solicitudes seguidas. Inténtalo en un rato o escríbenos por WhatsApp.', 429 );
		}
	}
	set_transient( $usado, 1, 4 * HOUR_IN_SECONDS );

	$origen = in_array( $datos['origen'] ?? '', array( 'formulario', 'asistente' ), true ) ? $datos['origen'] : 'formulario';
	$titulo = ta_sitio_texto( $datos['titulo'] ?? '', 120 );
	$id     = wp_insert_post(
		array(
			'post_type'   => 'ta_solicitud',
			'post_status' => 'publish',
			'post_title'  => 'Solicitud',
			'post_author' => 0,
		),
		true
	);
	if ( is_wp_error( $id ) ) {
		return ta_sitio_error( 'ta_guardar', 'No pudimos guardar la solicitud. Escríbenos por WhatsApp.', 500 );
	}
	$codigo = 'TA-' . gmdate( 'y' ) . '-' . str_pad( (string) $id, 5, '0', STR_PAD_LEFT );
	wp_update_post(
		array(
			'ID'         => $id,
			'post_title' => $codigo . ' · ' . ( '' !== $c['empresa'] ? $c['empresa'] : $c['nombre'] ),
		)
	);
	update_post_meta( $id, '_ta_codigo', $codigo );
	update_post_meta( $id, '_ta_estado', 'nueva' );
	update_post_meta( $id, '_ta_contacto', $c );
	update_post_meta( $id, '_ta_campos', $campos );
	update_post_meta( $id, '_ta_origen', $origen );
	update_post_meta( $id, '_ta_titulo', $titulo );

	// Fotografías: se revisan, se vuelven a generar y quedan en una carpeta que no se entrega al público.
	$archivos = $pedido->get_file_params();
	$fotos    = ta_sitio_guardar_fotos( $id, is_array( $archivos['fotos'] ?? null ) ? $archivos['fotos'] : array() );
	if ( $fotos ) {
		update_post_meta( $id, '_ta_fotos', $fotos );
	}

	$al_equipo = ta_sitio_correo_equipo( $id, $codigo, $c, $campos, $origen, $fotos );
	$a_persona = ta_sitio_correo_persona( $id, $codigo, $c, $campos, count( $fotos ) );
	update_post_meta( $id, '_ta_correos', array( 'equipo' => $al_equipo, 'persona' => $a_persona ) );

	return ta_sitio_sin_cache(
		new WP_REST_Response(
			array(
				'numero' => $codigo,
				'correo' => $a_persona,   // false: se guardó, pero el correo de confirmación no salió
				'fotos'  => count( $fotos ),
			),
			201
		)
	);
}

/* ---------- Correos de la solicitud (formato y firma en inc/correos.php) ---------- */

/** Los datos en líneas «• dato: valor». Sin enlaces ajenos: solo se conserva el del mapa que arma el propio sitio. */
function ta_sitio_lineas( $campos ) {
	$lineas = array();
	foreach ( $campos as $par ) {
		$valor = preg_replace_callback(
			'#https?://\S+#i',
			static function ( $m ) {
				return 0 === strpos( $m[0], 'https://www.google.com/maps/' ) ? $m[0] : '[enlace omitido]';
			},
			$par[1]
		);
		$lineas[] = '• ' . $par[0] . ': ' . $valor;
	}
	return implode( "\n", $lineas );
}

function ta_sitio_correo_equipo( $id, $codigo, $c, $campos, $origen, $fotos = array() ) {
	$texto = "Llegó una solicitud desde el sitio.\n\n"
		. "Número: $codigo\n"
		. 'Fecha: ' . wp_date( 'd-m-Y H:i' ) . "\n"
		. 'Origen: ' . ( 'asistente' === $origen ? 'Asistente de retiro' : 'Formulario de cotización' ) . "\n\n"
		. "Contacto\n"
		. '• Empresa: ' . ( '' !== $c['empresa'] ? $c['empresa'] : '—' ) . "\n"
		. '• Nombre: ' . $c['nombre'] . "\n"
		. '• Teléfono: ' . ( '' !== $c['telefono'] ? $c['telefono'] : '—' ) . "\n"
		. '• Correo: ' . $c['correo'] . "\n\n"
		. "Solicitud\n" . ta_sitio_lineas( $campos ) . "\n\n"
		. ( $fotos ? 'Fotografías: ' . count( $fotos ) . " (adjuntas a este correo; también están en la solicitud).\n\n" : '' )
		. "Para escribirle a la persona, responde este correo o usa «Responder» en la solicitud:\n"
		. admin_url( 'post.php?post=' . (int) $id . '&action=edit' );
	return ta_sitio_correo(
		array(
			'id'        => $id,
			'tipo'      => 'equipo',
			'para'      => ta_sitio_correos_destino(),
			'asunto'    => "[$codigo] Nueva solicitud · " . ( '' !== $c['empresa'] ? $c['empresa'] : $c['nombre'] ),
			'texto'     => $texto,
			'responder' => array( $c['nombre'], $c['correo'] ),
			'adjuntos'  => array_values( array_filter( array_map( 'ta_sitio_ruta_foto', $fotos ) ) ),
			'firma'     => false,  // aviso interno: la firma es para lo que recibe la persona
		)
	);
}

function ta_sitio_correo_persona( $id, $codigo, $c, $campos, $fotos = 0 ) {
	$op    = ta_sitio_opciones();
	$texto = 'Hola, ' . $c['nombre'] . ":\n\n"
		. "Recibimos tu solicitud. Su número es $codigo.\n\n"
		. "Revisaremos los antecedentes y te escribiremos a este correo cuando esté lista.\n"
		. ( $fotos
			? ( 1 === $fotos ? 'Recibimos también tu fotografía.' : "Recibimos también tus $fotos fotografías." ) . " Si quieres sumar otras, responde este correo y adjúntalas.\n\n"
			: "Si tienes fotografías del residuo, su envase o el lugar donde está almacenado, responde este correo y adjúntalas: nos ayudan a evaluar tu caso.\n\n" )
		. "Esto fue lo que nos enviaste:\n" . ta_sitio_lineas( $campos );
	return ta_sitio_correo(
		array(
			'id'     => $id,
			'tipo'   => 'confirmacion',
			'para'   => $c['correo'],
			'asunto' => "Recibimos tu solicitud $codigo · " . $op['remitente'],
			'texto'  => $texto,
		)
	);
}

function ta_sitio_correo_lista( $id, $mensaje ) {
	$op     = ta_sitio_opciones();
	$codigo = (string) get_post_meta( $id, '_ta_codigo', true );
	$c      = ta_sitio_meta_lista( $id, '_ta_contacto' );
	if ( empty( $c['correo'] ) || ! is_email( $c['correo'] ) ) {
		return false;
	}
	$texto = 'Hola, ' . ( $c['nombre'] ?? '' ) . ":\n\n"
		. "Tu solicitud $codigo está lista.\n\n"
		. ( '' !== $mensaje ? $mensaje . "\n\n" : '' )
		. 'Si tienes dudas, responde este correo.';
	return ta_sitio_correo(
		array(
			'id'     => $id,
			'tipo'   => 'lista',
			'para'   => $c['correo'],
			'asunto' => "Tu solicitud $codigo está lista · " . $op['remitente'],
			'texto'  => $texto,
		)
	);
}
