<?php
/**
 * Ajustes del plugin: modo (privado o publicado), dirección de la vista privada, clave para compartirla, correo
 * que recibe las solicitudes, lo que el formulario rechaza (dominios de correo y países) y la dirección del asistente
 * (servicio Laravel) que recibe las cotizaciones de Transporte, con la clave pública de Turnstile.
 */

defined( 'ABSPATH' ) || exit;

/** Comunas de la Región Metropolitana (las mismas de assets/site/pickers.js). */
const TA_SITIO_COMUNAS_RM = 'Santiago, Cerrillos, Cerro Navia, Conchalí, El Bosque, Estación Central, Huechuraba, Independencia, La Cisterna, La Florida, La Granja, La Pintana, La Reina, Las Condes, Lo Barnechea, Lo Espejo, Lo Prado, Macul, Maipú, Ñuñoa, Pedro Aguirre Cerda, Peñalolén, Providencia, Pudahuel, Quilicura, Quinta Normal, Recoleta, Renca, San Joaquín, San Miguel, San Ramón, Vitacura, Puente Alto, Pirque, San José de Maipo, Colina, Lampa, Tiltil, San Bernardo, Buin, Calera de Tango, Paine, Melipilla, Alhué, Curacaví, María Pinto, San Pedro, Talagante, El Monte, Isla de Maipo, Padre Hurtado, Peñaflor';

/** Comunas de la región, ordenadas. */
function ta_sitio_comunas_rm() {
	$lista = array_map( 'trim', explode( ',', TA_SITIO_COMUNAS_RM ) );
	usort( $lista, static function ( $a, $b ) { return strcmp( remove_accents( $a ), remove_accents( $b ) ); } );
	return $lista;
}

/** Comunas que hoy se atienden (el sitio solo ofrece estas en el formulario y el asistente). */
function ta_sitio_comunas() {
	$op = ta_sitio_opciones();
	return array_values( array_intersect( ta_sitio_comunas_rm(), (array) $op['comunas'] ) );
}

/**
 * Horario de retiro que ofrece el formulario (assets/site/pickers.js lo recibe en window.TA_API.horario): la hora en que
 * empieza la mañana, la del corte entre mañana y tarde, la del término de la jornada y si se ofrecen Mañana, Tarde y
 * Vespertino. «Cualquier horario» va siempre. Unas horas incoherentes no se usan: vale la jornada de 9:00 a 17:00.
 */
function ta_sitio_horario() {
	$op     = ta_sitio_opciones();
	$h      = is_array( $op['horario'] ) ? $op['horario'] : array();
	$inicio = isset( $h['inicio'] ) ? (int) $h['inicio'] : 9;
	$corte  = isset( $h['corte'] ) ? (int) $h['corte'] : 13;
	$fin    = isset( $h['fin'] ) ? (int) $h['fin'] : 17;
	if ( ! ta_sitio_horas_validas( $inicio, $corte, $fin ) ) {
		list( $inicio, $corte, $fin ) = array( 9, 13, 17 );
	}
	return array(
		'inicio'     => $inicio,
		'corte'      => $corte,
		'fin'        => $fin,
		'manana'     => ! isset( $h['manana'] ) || (bool) $h['manana'],
		'tarde'      => ! isset( $h['tarde'] ) || (bool) $h['tarde'],
		'vespertino' => ! isset( $h['vespertino'] ) || (bool) $h['vespertino'],
	);
}

/** Horas enteras entre las 5 y las 23, cada una después de la anterior. */
function ta_sitio_horas_validas( $inicio, $corte, $fin ) {
	return $inicio >= 5 && $inicio < $corte && $corte < $fin && $fin <= 23;
}

/*
 * llms.txt y la habilidad para agentes de IA (.well-known/agent-skills/…/SKILL.md) salen del paquete con la cobertura y el
 * horario de siempre; al entregarlos, el plugin los cambia por los de estos ajustes. Los textos deben ser idénticos a
 * COBERTURA_BASE y HORARIO_BASE de tools/wordpress.py (el armado del paquete comprueba que estén).
 */
const TA_SITIO_COBERTURA_BASE = 'Cerrillos, Cerro Navia, Conchalí, El Bosque, Estación Central, Huechuraba, Independencia, La Cisterna, La Florida, La Granja, La Pintana, La Reina, Lampa, Las Condes, Lo Barnechea, Lo Espejo, Lo Prado, Macul, Maipú, Ñuñoa, Pedro Aguirre Cerda, Peñalolén, Providencia, Pudahuel, Puente Alto, Quilicura, Quinta Normal, Recoleta, Renca, San Bernardo, San Joaquín, San Miguel, San Ramón, Santiago y Vitacura (Región Metropolitana)';
const TA_SITIO_HORARIO_BASE   = 'cualquier horario (la hora la define el equipo), mañana (9:00 a 13:00), tarde (13:00 a 17:00) o vespertino (de noche, sujeto a confirmación)';

/** Las comunas que se atienden, para un asistente de IA: todas nombradas (sin elegir ninguna, las del paquete). */
function ta_sitio_cobertura_texto() {
	$comunas = ta_sitio_comunas();
	if ( ! $comunas ) {
		return TA_SITIO_COBERTURA_BASE;  // el sitio usa entonces las comunas por defecto (assets/site/pickers.js)
	}
	if ( count( $comunas ) === count( ta_sitio_comunas_rm() ) ) {
		return 'toda la Región Metropolitana';
	}
	$ultima = array_pop( $comunas );
	return ( $comunas ? implode( ', ', $comunas ) . ' y ' : '' ) . $ultima . ' (Región Metropolitana)';
}

/** El horario de retiro en palabras: las opciones que se ofrecen, con sus horas. */
function ta_sitio_horario_texto() {
	$h        = ta_sitio_horario();
	$opciones = array( 'cualquier horario (la hora la define el equipo)' );
	if ( $h['manana'] ) {
		$opciones[] = 'mañana (' . $h['inicio'] . ':00 a ' . $h['corte'] . ':00)';
	}
	if ( $h['tarde'] ) {
		$opciones[] = 'tarde (' . $h['corte'] . ':00 a ' . $h['fin'] . ':00)';
	}
	if ( $h['vespertino'] ) {
		$opciones[] = 'vespertino (de noche, sujeto a confirmación)';
	}
	$ultima = array_pop( $opciones );
	return ( $opciones ? implode( ', ', $opciones ) . ' o ' : '' ) . $ultima;
}

/** llms.txt o SKILL.md con la cobertura y el horario de los ajustes. */
function ta_sitio_textos_agentes( $texto ) {
	return str_replace( array( TA_SITIO_COBERTURA_BASE, TA_SITIO_HORARIO_BASE ), array( ta_sitio_cobertura_texto(), ta_sitio_horario_texto() ), $texto );
}

/** Respuestas rápidas de los ajustes: [[título, texto]…]. Se separan con una línea «---»; la primera línea es el título. */
function ta_sitio_plantillas() {
	$op  = ta_sitio_opciones();
	$out = array();
	foreach ( preg_split( "/\n-{3,}\s*\n/", trim( str_replace( "\r", '', (string) $op['plantillas'] ) ) ) as $bloque ) {
		$lineas = explode( "\n", trim( $bloque ), 2 );
		if ( '' !== trim( $lineas[0] ) ) {
			$out[] = array( trim( $lineas[0] ), trim( $lineas[1] ?? '' ) );
		}
	}
	return $out;
}

/** Opciones con sus valores por defecto. */
function ta_sitio_opciones() {
	$guardadas = get_option( 'ta_sitio', array() );
	return wp_parse_args(
		is_array( $guardadas ) ? $guardadas : array(),
		array(
			'modo'           => 'privado',  // privado: solo en la dirección de vista previa; publicado: en la portada.
			'ruta'           => 'nuevo',    // dirección de la vista privada: /nuevo/
			'clave'          => '',         // permite ver la vista privada sin iniciar sesión (enlace para compartir).
			'correo_destino' => '',         // correo principal: recibe y es a donde contestan las personas; vacío = administración.
			'correos_guardados' => array(), // casillas que se pueden elegir (se agregan escribiéndolas en los ajustes)
			'correos_destino'   => array(), // las elegidas para recibir las solicitudes (además de la principal)
			'remitente'      => 'Transporte Autorizado',
			// Correos que el formulario no acepta: terminaciones («ru») o dominios completos («yandex.com»).
			'correos_bloqueados' => 'ru su xn--p1ai fr de yandex.com gmx.net gmx.com laposte.net',
			// Países desde los que no se aceptan solicitudes (códigos de dos letras); solo si el servidor informa el país.
			'paises_bloqueados'  => 'RU FR DE',
			// Comunas donde hoy se coordinan retiros (las 35 del sitio publicado, 25-11-2026; antes Quilicura, Lampa y Pudahuel)
			'comunas'            => array( 'Cerrillos', 'Cerro Navia', 'Conchalí', 'El Bosque', 'Estación Central', 'Huechuraba', 'Independencia', 'La Cisterna', 'La Florida', 'La Granja', 'La Pintana', 'La Reina', 'Lampa', 'Las Condes', 'Lo Barnechea', 'Lo Espejo', 'Lo Prado', 'Macul', 'Maipú', 'Ñuñoa', 'Pedro Aguirre Cerda', 'Peñalolén', 'Providencia', 'Pudahuel', 'Puente Alto', 'Quilicura', 'Quinta Normal', 'Recoleta', 'Renca', 'San Bernardo', 'San Joaquín', 'San Miguel', 'San Ramón', 'Santiago', 'Vitacura' ),
			// Horario de retiro (cliente, 16-11-2026): la mañana desde las 9:00 y nada después de las 17:00 (ta_sitio_horario())
			'horario'            => array( 'inicio' => 9, 'corte' => 13, 'fin' => 17, 'manana' => true, 'tarde' => true, 'vespertino' => true ),
			// Firma al final de todos los correos a las personas: texto y una imagen de la biblioteca de medios
			'firma_texto'        => "Equipo Transporte Autorizado\nWhatsApp +56 9 8606 7930\nhttps://transporteautorizado.cl",
			'firma_imagen'       => 0,
			'firma_ancho'        => 220,
			// Respuestas rápidas del gestor. {nombre}, {empresa} y {numero} se reemplazan por los de la solicitud
			'plantillas'         => "Necesitamos más antecedentes\nHola, {nombre}:\n\nGracias por tu solicitud {numero}. Para preparar la cotización necesitamos algunos antecedentes más:\n\n- \n\nPuedes responder este correo con la información y, si las tienes, fotografías del residuo y del lugar.\n---\nCotización adjunta\nHola, {nombre}:\n\nTe enviamos adjunta la cotización de tu solicitud {numero}. Si estás de acuerdo, responde este correo para coordinar el retiro.\n---\nRetiro coordinado\nHola, {nombre}:\n\nTu retiro de la solicitud {numero} quedó coordinado para el día  en el horario . Te escribiremos si hay algún cambio.",
			// Copia oculta de cada respuesta al correo que recibe las solicitudes (queda registro en la casilla del equipo)
			'copia_respuestas'   => true,
			// Asistente de Transporte Autorizado (Laravel): recibe las cotizaciones de Transporte y las registra en Odoo.
			// Una por instalación (pruebas o producción); vacía = el formulario no envía en línea.
			'asistente'          => '',
			'turnstile'          => '',  // clave pública del widget de Cloudflare Turnstile (la secreta va solo en el asistente)
			'whatsapp'           => '56986067930',  // número del sitio (wa.me), con código de país; ta_sitio_whatsapp_aplicar() lo cambia en las páginas
			'imagenes'           => array(),  // portadas y fotos elegidas en la biblioteca de medios: [espacio => id] (inc/imagenes.php)
			'verificacion'       => array(),
			'relacionados'       => array(),  // HDS y Campañas: [clave => [activo, url]] (inc/relacionados.php); vacío = los dos, con sus enlaces  // Google Search Console y Bing: códigos y archivos de verificación (inc/buscadores.php)
		)
	);
}

/** El número como lo usa wa.me (569 y ocho dígitos), o vacío si no es un celular de Chile. */
function ta_sitio_whatsapp_normal( $valor ) {
	$d = preg_replace( '/\D/', '', (string) $valor );
	if ( 9 === strlen( $d ) && '9' === $d[0] ) {
		$d = '56' . $d;
	}
	return preg_match( '/^569\d{8}$/', $d ) ? $d : '';
}

/** 56986067930 → «+56 9 8606 7930». */
function ta_sitio_whatsapp_texto( $numero ) {
	return preg_match( '/^(56)(9)(\d{4})(\d{4})$/', (string) $numero, $m ) ? "+{$m[1]} {$m[2]} {$m[3]} {$m[4]}" : (string) $numero;
}

/** Si en los ajustes hay otro número que el que trae el sitio. */
function ta_sitio_whatsapp_cambiado() {
	$numero = ta_sitio_opciones()['whatsapp'];
	return '' !== $numero && '56986067930' !== $numero;
}

/**
 * Una página o un script con el número de los ajustes en lugar del que trae el sitio (enlaces wa.me, tel: y el texto
 * visible). En las páginas, los scripts cambian de ?v= con el número, para que el navegador no use los guardados.
 */
function ta_sitio_whatsapp_aplicar( $texto ) {
	if ( ! ta_sitio_whatsapp_cambiado() ) {
		return $texto;
	}
	$numero = ta_sitio_opciones()['whatsapp'];
	$texto  = str_replace( array( '56986067930', '+56 9 8606 7930' ), array( $numero, ta_sitio_whatsapp_texto( $numero ) ), $texto );
	return preg_replace( '#(\.js\?v=[\w.-]+)#', '$1-' . substr( $numero, -4 ), $texto );
}

/**
 * Dirección del asistente tal como se guarda: https, sin usuario, clave, consulta ni fragmento, y sin barra final
 * (http solo hacia este mismo computador, para probar). Vacía si no cumple.
 */
function ta_sitio_url_asistente( $valor ) {
	$valor = trim( (string) $valor );
	$p     = '' !== $valor ? wp_parse_url( $valor ) : false;
	if ( ! is_array( $p ) || empty( $p['host'] ) || isset( $p['user'] ) || isset( $p['pass'] ) || isset( $p['query'] ) || isset( $p['fragment'] ) ) {
		return '';
	}
	$esquema = strtolower( (string) ( $p['scheme'] ?? '' ) );
	$host    = strtolower( (string) $p['host'] );
	$ruta    = rtrim( (string) ( $p['path'] ?? '' ), '/' );
	if ( ! ( 'https' === $esquema || ( 'http' === $esquema && in_array( $host, array( 'localhost', '127.0.0.1' ), true ) ) ) || ! preg_match( '#^[A-Za-z0-9.-]+$#', $host ) || ! preg_match( '#^[A-Za-z0-9/._~-]*$#', $ruta ) ) {
		return '';
	}
	return $esquema . '://' . $host . ( isset( $p['port'] ) ? ':' . (int) $p['port'] : '' ) . $ruta;
}

/** Origen de una dirección (esquema, servidor y puerto), como lo nombran la política de contenido y CORS. */
function ta_sitio_origen( $url ) {
	$p = wp_parse_url( (string) $url );
	return empty( $p['host'] ) || empty( $p['scheme'] ) ? '' : strtolower( $p['scheme'] ) . '://' . strtolower( $p['host'] ) . ( isset( $p['port'] ) ? ':' . (int) $p['port'] : '' );
}

/** ¿El correo es de un dominio bloqueado? Una regla sin punto es una terminación; con punto, un dominio y sus subdominios. */
function ta_sitio_correo_bloqueado( $correo ) {
	$op      = ta_sitio_opciones();
	$dominio = strtolower( (string) substr( (string) strrchr( (string) $correo, '@' ), 1 ) );
	foreach ( preg_split( '/[\s,;]+/', strtolower( (string) $op['correos_bloqueados'] ), -1, PREG_SPLIT_NO_EMPTY ) as $regla ) {
		$regla = ltrim( $regla, '.@*' );
		if ( '' !== $regla && '' !== $dominio && ( $dominio === $regla || substr( $dominio, -strlen( $regla ) - 1 ) === '.' . $regla ) ) {
			return true;
		}
	}
	return false;
}

/** País de la visita (código de dos letras) si el servidor lo informa: LiteSpeed o Apache con GeoIP, o Cloudflare. Vacío si no. */
function ta_sitio_pais() {
	foreach ( array( 'GEOIP_COUNTRY_CODE', 'MM_COUNTRY_CODE', 'HTTP_CF_IPCOUNTRY' ) as $clave ) {
		$valor = isset( $_SERVER[ $clave ] ) ? strtoupper( sanitize_text_field( wp_unslash( $_SERVER[ $clave ] ) ) ) : '';
		if ( preg_match( '/^[A-Z]{2}$/', $valor ) && 'XX' !== $valor ) {
			return $valor;
		}
	}
	return '';
}

function ta_sitio_pais_bloqueado() {
	$op   = ta_sitio_opciones();
	$pais = ta_sitio_pais();
	return '' !== $pais && in_array( $pais, preg_split( '/[\s,;]+/', strtoupper( (string) $op['paises_bloqueados'] ), -1, PREG_SPLIT_NO_EMPTY ), true );
}

/** Correo que recibe las solicitudes. */
function ta_sitio_correo_destino() {
	$op = ta_sitio_opciones();
	return is_email( $op['correo_destino'] ) ? $op['correo_destino'] : get_option( 'admin_email' );
}

/** Todas las casillas que reciben las solicitudes: la principal primero. */
function ta_sitio_correos_destino() {
	$op = ta_sitio_opciones();
	return array_values( array_unique( array_filter( array_merge( array( ta_sitio_correo_destino() ), (array) $op['correos_destino'] ), 'is_email' ) ) );
}

/** Casillas que se ofrecen para elegir: las guardadas, la principal y la de administración. */
function ta_sitio_correos_guardados() {
	$op = ta_sitio_opciones();
	return array_values( array_unique( array_filter( array_merge( array( ta_sitio_correo_destino() ), (array) $op['correos_guardados'], (array) $op['correos_destino'], array( get_option( 'admin_email' ) ) ), 'is_email' ) ) );
}

/** Dirección de la vista privada, con la clave si se pide el enlace para compartir. */
function ta_sitio_url_vista( $con_clave = false ) {
	$op  = ta_sitio_opciones();
	$url = home_url( '/' . trim( $op['ruta'], '/' ) . '/' );
	return $con_clave && $op['clave'] ? add_query_arg( 'clave', $op['clave'], $url ) : $url;
}

/** Vacía las cachés de páginas: lo que guardaron antes de un cambio de estado, de dirección o de versión ya no corresponde. */
function ta_sitio_purgar() {
	do_action( 'litespeed_purge_all' );  // LiteSpeed Cache
	foreach ( array( 'rocket_clean_domain', 'w3tc_flush_all', 'wp_cache_clear_cache' ) as $vaciar ) {  // WP Rocket, W3 Total Cache, WP Super Cache
		if ( function_exists( $vaciar ) ) {
			$vaciar();
		}
	}
}

function ta_sitio_activar() {
	$op = ta_sitio_opciones();
	if ( '' === $op['clave'] ) {
		$op['clave'] = wp_generate_password( 32, false, false );
	}
	update_option( 'ta_sitio', $op, false );
	ta_sitio_tipo_solicitud();
	ta_sitio_reglas();
	flush_rewrite_rules( true );
	ta_sitio_purgar();
	update_option( 'ta_sitio_version', TA_SITIO_VERSION );
}

/** Tras actualizar el plugin (subir un zip nuevo no pasa por la activación): reglas y cachés al día. */
add_action(
	'admin_init',
	static function () {
		if ( get_option( 'ta_sitio_version' ) === TA_SITIO_VERSION ) {
			return;
		}
		update_option( 'ta_sitio_version', TA_SITIO_VERSION );
		flush_rewrite_rules( true );
		ta_sitio_purgar();
	}
);

function ta_sitio_desactivar() {
	// Sin las reglas del plugin: al vaciar, WordPress reescribe .htaccess solo con las suyas.
	remove_action( 'init', 'ta_sitio_reglas', 5 );
	global $wp_rewrite;
	if ( $wp_rewrite instanceof WP_Rewrite ) {
		$wp_rewrite->non_wp_rules = array_filter(
			(array) $wp_rewrite->non_wp_rules,
			static function ( $destino ) {
				return false === strpos( (string) $destino, 'ta-sitio/sitio/' );
			}
		);
	}
	flush_rewrite_rules( true );
	ta_sitio_purgar();
}

/* ---------- Guardado de los ajustes (la página, con sus pestañas, está en inc/panel.php) ---------- */

add_action(
	'admin_post_ta_sitio_guardar',
	static function () {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( 'No tienes permiso para cambiar estos ajustes.' );
		}
		check_admin_referer( 'ta_sitio_guardar' );
		$op    = ta_sitio_opciones();
		$antes = $op;
		$modo  = isset( $_POST['modo'] ) ? sanitize_key( wp_unslash( $_POST['modo'] ) ) : 'privado';
		$ruta  = isset( $_POST['ruta'] ) ? sanitize_title( wp_unslash( $_POST['ruta'] ) ) : 'nuevo';
		// Casillas: las guardadas (menos las quitadas) y la que se escribió; la principal y las que reciben, entre ellas
		$quitar    = isset( $_POST['correo_quitar'] ) ? array_map( 'sanitize_email', (array) wp_unslash( $_POST['correo_quitar'] ) ) : array();
		$nueva     = isset( $_POST['correo_nuevo'] ) ? sanitize_email( wp_unslash( $_POST['correo_nuevo'] ) ) : '';
		$guardados = array_values( array_diff( array_merge( ta_sitio_correos_guardados(), is_email( $nueva ) ? array( $nueva ) : array() ), $quitar ) );
		$reciben   = isset( $_POST['correos_reciben'] ) ? array_map( 'sanitize_email', (array) wp_unslash( $_POST['correos_reciben'] ) ) : array();
		if ( is_email( $nueva ) && ! empty( $_POST['correo_nuevo_recibe'] ) ) {
			$reciben[] = $nueva;
		}
		$reciben = array_values( array_intersect( $guardados, $reciben ) );
		$mail    = isset( $_POST['correo_principal'] ) ? sanitize_email( wp_unslash( $_POST['correo_principal'] ) ) : '';
		if ( 'nuevo' === ( $_POST['correo_principal'] ?? '' ) && is_email( $nueva ) ) {
			$mail = $nueva;
		}
		if ( ! in_array( $mail, $guardados, true ) ) {
			$mail = $reciben[0] ?? '';
		}
		if ( $mail && ! in_array( $mail, $reciben, true ) ) {
			array_unshift( $reciben, $mail );  // la principal siempre recibe
		}
		$op['correos_guardados'] = $guardados;
		$op['correos_destino']   = $reciben;
		$op['modo']           = in_array( $modo, array( 'privado', 'publicado' ), true ) ? $modo : 'privado';
		$op['ruta']           = '' !== $ruta ? $ruta : 'nuevo';
		$op['correo_destino'] = is_email( $mail ) ? $mail : '';
		$op['remitente']      = isset( $_POST['remitente'] ) ? sanitize_text_field( wp_unslash( $_POST['remitente'] ) ) : $op['remitente'];
		if ( isset( $_POST['correos_bloqueados'] ) ) {
			$reglas                   = preg_split( '/[\s,;]+/', strtolower( sanitize_textarea_field( wp_unslash( $_POST['correos_bloqueados'] ) ) ), -1, PREG_SPLIT_NO_EMPTY );
			$op['correos_bloqueados'] = implode( ' ', array_unique( array_filter( array_map( static function ( $r ) { return preg_replace( '/[^a-z0-9.-]/', '', ltrim( $r, '.@*' ) ); }, $reglas ) ) ) );
		}
		if ( isset( $_POST['paises_bloqueados'] ) ) {
			preg_match_all( '/\b[A-Z]{2}\b/', strtoupper( sanitize_text_field( wp_unslash( $_POST['paises_bloqueados'] ) ) ), $paises );
			$op['paises_bloqueados'] = implode( ' ', array_unique( $paises[0] ) );
		}
		if ( isset( $_POST['ta_comunas_enviado'] ) ) {
			$pedidas       = isset( $_POST['comunas'] ) ? array_map( 'sanitize_text_field', (array) wp_unslash( $_POST['comunas'] ) ) : array();
			$op['comunas'] = array_values( array_intersect( ta_sitio_comunas_rm(), $pedidas ) );
		}
		$horario_invalido = false;
		if ( isset( $_POST['ta_horario_enviado'] ) ) {
			$guardado = ta_sitio_horario();
			$inicio   = isset( $_POST['horario_inicio'] ) ? absint( wp_unslash( $_POST['horario_inicio'] ) ) : $guardado['inicio'];
			$corte    = isset( $_POST['horario_corte'] ) ? absint( wp_unslash( $_POST['horario_corte'] ) ) : $guardado['corte'];
			$fin      = isset( $_POST['horario_fin'] ) ? absint( wp_unslash( $_POST['horario_fin'] ) ) : $guardado['fin'];
			// Horas incoherentes (la tarde antes que la mañana, p. ej.): se mantienen las guardadas y se avisa
			$horario_invalido = ! ta_sitio_horas_validas( $inicio, $corte, $fin );
			$op['horario']    = array(
				'inicio'     => $horario_invalido ? $guardado['inicio'] : $inicio,
				'corte'      => $horario_invalido ? $guardado['corte'] : $corte,
				'fin'        => $horario_invalido ? $guardado['fin'] : $fin,
				'manana'     => ! empty( $_POST['horario_manana'] ),
				'tarde'      => ! empty( $_POST['horario_tarde'] ),
				'vespertino' => ! empty( $_POST['horario_vespertino'] ),
			);
		}
		if ( isset( $_POST['firma_texto'] ) ) {
			$op['firma_texto']      = sanitize_textarea_field( wp_unslash( $_POST['firma_texto'] ) );
			$imagen                 = isset( $_POST['firma_imagen'] ) ? absint( $_POST['firma_imagen'] ) : 0;
			$op['firma_imagen']     = $imagen && wp_attachment_is_image( $imagen ) ? $imagen : 0;
			$op['firma_ancho']      = isset( $_POST['firma_ancho'] ) ? max( 60, min( 560, absint( $_POST['firma_ancho'] ) ) ) : 220;
			$op['plantillas']       = isset( $_POST['plantillas'] ) ? sanitize_textarea_field( wp_unslash( $_POST['plantillas'] ) ) : $op['plantillas'];
			$op['copia_respuestas'] = ! empty( $_POST['copia_respuestas'] );
		}
		if ( isset( $_POST['whatsapp'] ) ) {
			$numero = ta_sitio_whatsapp_normal( sanitize_text_field( wp_unslash( $_POST['whatsapp'] ) ) );
			$op['whatsapp'] = '' !== $numero ? $numero : $op['whatsapp'];
		}
		if ( isset( $_POST['ta_imagenes_enviado'] ) ) {
			$op['imagenes'] = ta_sitio_imagenes_desde_post();
		}
		$relacionado_invalido = false;
		if ( isset( $_POST['ta_relacionados_enviado'] ) ) {
			list( $op['relacionados'], $relacionado_invalido ) = ta_sitio_relacionados_desde_post();  // inc/relacionados.php
		}
		$aviso_verificacion = '';
		if ( isset( $_POST['ta_buscadores_enviado'] ) ) {
			list( $op['verificacion'], $aviso_verificacion ) = ta_sitio_verificacion_desde_post();  // inc/buscadores.php
		}
		$pedida           = isset( $_POST['asistente'] ) ? sanitize_text_field( wp_unslash( $_POST['asistente'] ) ) : $op['asistente'];
		$op['asistente']  = ta_sitio_url_asistente( $pedida );
		$op['turnstile']  = isset( $_POST['turnstile'] ) ? substr( (string) preg_replace( '/[^A-Za-z0-9_-]/', '', sanitize_text_field( wp_unslash( $_POST['turnstile'] ) ) ), 0, 100 ) : $op['turnstile'];
		if ( ! empty( $_POST['nueva_clave'] ) || '' === $op['clave'] ) {
			$op['clave'] = wp_generate_password( 32, false, false );
		}
		update_option( 'ta_sitio', $op, false );
		ta_sitio_reglas();
		flush_rewrite_rules( true );
		// La portada y la vista previa guardadas en caché son las de antes (con la configuración y la política de antes).
		// Las comunas y el horario también viajan en la página (window.TA_API): al cambiarlos, la caché ya no corresponde
		if ( $antes['modo'] !== $op['modo'] || $antes['ruta'] !== $op['ruta'] || $antes['asistente'] !== $op['asistente'] || $antes['turnstile'] !== $op['turnstile'] || $antes['imagenes'] !== $op['imagenes'] || $antes['whatsapp'] !== $op['whatsapp'] || $antes['comunas'] !== $op['comunas'] || $antes['horario'] !== $op['horario'] || $antes['verificacion'] !== $op['verificacion'] || $antes['relacionados'] !== $op['relacionados'] ) {
			ta_sitio_purgar();
		}
		$aviso = '' !== trim( $pedida ) && '' === $op['asistente'] ? array( 'asistente_invalido' => 1 ) : array();
		if ( $horario_invalido ) {
			$aviso['horario_invalido'] = 1;
		}
		if ( $relacionado_invalido ) {
			$aviso['relacionado_invalido'] = 1;
		}
		if ( '' !== $aviso_verificacion ) {
			$aviso['verificacion'] = $aviso_verificacion;
		}
		$pestana = isset( $_POST['pestana'] ) ? sanitize_key( wp_unslash( $_POST['pestana'] ) ) : '';  // se vuelve a la pestaña en que se estaba
		wp_safe_redirect( add_query_arg( array( 'guardado' => 1 ) + $aviso, ta_sitio_url_ajustes( $pestana ) ) );
		exit;
	}
);
