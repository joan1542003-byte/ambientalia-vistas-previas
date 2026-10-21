<?php
/**
 * Sirve el sitio (carpeta sitio/ del plugin) desde WordPress.
 *
 * - Privado: solo en la dirección de vista previa (/nuevo/ por defecto), con sesión iniciada o con la clave del enlace
 *   para compartir. Para todos los demás esa dirección no existe (404 del tema). Nada se indexa.
 * - Publicado: la portada del dominio muestra el sitio, y también /normativa/, /ayuda/, /documentos/ y /assets/.
 *
 * Las páginas pasan por aquí (se les agrega la conexión con los formularios y las cabeceras de seguridad). Los
 * archivos (CSS, JS, imágenes, datos) los entrega el servidor directamente gracias a una regla en .htaccess; si esa
 * regla no está, este mismo código los entrega.
 */

defined( 'ABSPATH' ) || exit;

/** Reglas externas (.htaccess): los archivos del sitio los sirve el servidor web, sin pasar por PHP. */
function ta_sitio_reglas() {
	$op      = ta_sitio_opciones();
	$destino = ltrim( str_replace( wp_normalize_path( ABSPATH ), '', wp_normalize_path( TA_SITIO_DIR . 'sitio/assets/' ) ), '/' );
	add_rewrite_rule( '^' . preg_quote( trim( $op['ruta'], '/' ), '#' ) . '/assets/(.*)$', $destino . '$1', 'top' );
	if ( 'publicado' === $op['modo'] ) {
		add_rewrite_rule( '^assets/(.*)$', $destino . '$1', 'top' );
	}
}
add_action( 'init', 'ta_sitio_reglas', 5 );

/** Ruta pedida, relativa a la portada del sitio y sin la consulta. */
function ta_sitio_ruta_pedida() {
	$uri  = isset( $_SERVER['REQUEST_URI'] ) ? wp_unslash( $_SERVER['REQUEST_URI'] ) : '/'; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
	$ruta = (string) wp_parse_url( $uri, PHP_URL_PATH );
	$base = (string) wp_parse_url( home_url( '/' ), PHP_URL_PATH );
	if ( '' !== $base && '/' !== $base && 0 === strpos( $ruta, $base ) ) {
		$ruta = substr( $ruta, strlen( $base ) );
	}
	return ltrim( rawurldecode( $ruta ), '/' );
}

/** Archivo del sitio que corresponde a una ruta interna, o null si no existe o la ruta no es válida. */
function ta_sitio_archivo( $interna ) {
	if ( ! preg_match( '#^[A-Za-z0-9][A-Za-z0-9._/-]*$#', $interna ) || false !== strpos( $interna, '..' ) ) {
		return null;
	}
	$base = realpath( TA_SITIO_DIR . 'sitio' );
	$ruta = $base ? realpath( $base . '/' . $interna ) : false;
	if ( ! $ruta || 0 !== strpos( wp_normalize_path( $ruta ), wp_normalize_path( $base ) . '/' ) || ! is_file( $ruta ) ) {
		return null;
	}
	return $ruta;
}

/** ¿Puede esta visita ver la vista privada? Sesión con permiso de edición, o la clave del enlace para compartir. */
function ta_sitio_puede_ver() {
	if ( current_user_can( 'edit_posts' ) ) {
		return true;
	}
	$op = ta_sitio_opciones();
	if ( '' === $op['clave'] ) {
		return false;
	}
	$firma  = hash_hmac( 'sha256', $op['clave'], wp_salt( 'auth' ) );
	$cookie = isset( $_COOKIE['ta_vista'] ) ? sanitize_text_field( wp_unslash( $_COOKIE['ta_vista'] ) ) : '';
	if ( '' !== $cookie && hash_equals( $firma, $cookie ) ) {
		return true;
	}
	$clave = isset( $_GET['clave'] ) ? sanitize_text_field( wp_unslash( $_GET['clave'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	if ( '' !== $clave && hash_equals( $op['clave'], $clave ) ) {
		// La clave queda en una cookie y sale de la dirección, para que no viaje en enlaces ni en el historial.
		setcookie(
			'ta_vista',
			$firma,
			array(
				'expires'  => time() + 30 * DAY_IN_SECONDS,
				'path'     => COOKIEPATH ? COOKIEPATH : '/',
				'secure'   => is_ssl(),
				'httponly' => true,
				'samesite' => 'Lax',
			)
		);
		nocache_headers();
		wp_safe_redirect( remove_query_arg( 'clave' ) );
		exit;
	}
	return false;
}

/** Marca la respuesta para que ninguna caché de páginas la guarde (LiteSpeed Cache y las que respetan DONOTCACHEPAGE). */
function ta_sitio_no_guardar() {
	if ( ! defined( 'DONOTCACHEPAGE' ) ) {
		define( 'DONOTCACHEPAGE', true );
	}
	do_action( 'litespeed_control_set_nocache', 'vista privada de Transporte Autorizado' );
	if ( ! headers_sent() ) {
		header( 'X-LiteSpeed-Cache-Control: no-cache' );
	}
}

/** Decide si la visita es del sitio nuevo y la atiende. Corre temprano: si no es suya, WordPress sigue como siempre. */
function ta_sitio_despachar() {
	if ( is_admin() || wp_doing_ajax() || wp_doing_cron() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) || ( defined( 'WP_CLI' ) && WP_CLI ) || ( defined( 'XMLRPC_REQUEST' ) && XMLRPC_REQUEST ) ) {
		return;
	}
	$metodo = isset( $_SERVER['REQUEST_METHOD'] ) ? strtoupper( sanitize_key( wp_unslash( $_SERVER['REQUEST_METHOD'] ) ) ) : 'GET';
	if ( 'GET' !== $metodo && 'HEAD' !== $metodo ) {
		return;
	}
	$op    = ta_sitio_opciones();
	$ruta  = ta_sitio_ruta_pedida();
	$vista = trim( $op['ruta'], '/' );

	// Vista privada: /nuevo/…
	if ( '' !== $vista && ( $ruta === $vista || 0 === strpos( $ruta, $vista . '/' ) ) ) {
		$interna = (string) substr( $ruta, strlen( $vista ) + 1 );
		$es_dato = 0 === strpos( $interna, 'assets/' );  // los archivos no llevan sesión ni clave: solo las páginas son privadas
		if ( ! $es_dato ) {
			// Tampoco el 404 de quien no tiene acceso: una caché compartida se lo entregaría después a quien sí lo tiene.
			ta_sitio_no_guardar();
		}
		if ( ! $es_dato && ! ta_sitio_puede_ver() ) {
			return;  // para quien no tiene acceso, la dirección no existe
		}
		if ( $ruta === $vista ) {
			nocache_headers();
			wp_safe_redirect( home_url( '/' . $vista . '/' ) );  // con barra final, para que las rutas relativas funcionen
			exit;
		}
		ta_sitio_entregar( '' === $interna ? 'transporte-autorizado.html' : $interna, true );
		return;
	}

	if ( 'publicado' !== $op['modo'] ) {
		return;
	}
	// Publicado: la portada y las carpetas del sitio.
	if ( '' === $ruta ) {
		$consulta = isset( $_GET ) ? array_keys( $_GET ) : array(); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$propias  = array_filter(
			$consulta,
			static function ( $k ) {
				return ! preg_match( '/^(utm_|fbclid$|gclid$|gad_|msclkid$|ref$)/', (string) $k );
			}
		);
		if ( $propias ) {
			return;  // ?p=, ?s=, vista previa de Elementor…: es de WordPress
		}
		ta_sitio_entregar( 'transporte-autorizado.html', false );
		return;
	}
	if ( 'transporte-autorizado.html' === $ruta ) {
		wp_safe_redirect( home_url( '/' ), 301 );
		exit;
	}
	if ( 'llms.txt' === $ruta || preg_match( '#^(normativa|ayuda|documentos|assets)/#', $ruta ) ) {
		ta_sitio_entregar( $ruta, false );
		return;
	}
	if ( 'sitemap-sitio.xml' === $ruta ) {
		ta_sitio_mapa();
	}
}
add_action( 'init', 'ta_sitio_despachar', 20 );

/** Entrega una página o un archivo del sitio. Si no existe, no hace nada (WordPress responde su 404). */
function ta_sitio_entregar( $interna, $privado ) {
	$archivo = ta_sitio_archivo( $interna );
	if ( null === $archivo ) {
		return;
	}
	$ext = strtolower( pathinfo( $archivo, PATHINFO_EXTENSION ) );
	if ( 'html' === $ext ) {
		ta_sitio_pagina( $archivo, $privado );
	}
	$tipos = array(
		'css'  => 'text/css; charset=utf-8',
		'js'   => 'text/javascript; charset=utf-8',
		'mjs'  => 'text/javascript; charset=utf-8',
		'json' => 'application/json; charset=utf-8',
		'svg'  => 'image/svg+xml',
		'webp' => 'image/webp',
		'jpg'  => 'image/jpeg',
		'jpeg' => 'image/jpeg',
		'png'  => 'image/png',
		'ico'  => 'image/x-icon',
		'pdf'  => 'application/pdf',
		'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		'txt'  => 'text/plain; charset=utf-8',
		'xml'  => 'application/xml; charset=utf-8',
	);
	if ( ! isset( $tipos[ $ext ] ) ) {
		return;
	}
	$fecha    = (int) filemtime( $archivo );
	$etiqueta = '"' . md5( $archivo . '|' . $fecha . '|' . filesize( $archivo ) ) . '"';
	header( 'Content-Type: ' . $tipos[ $ext ] );
	header( 'X-Content-Type-Options: nosniff' );
	header( 'ETag: ' . $etiqueta );
	header( 'Last-Modified: ' . gmdate( 'D, d M Y H:i:s', $fecha ) . ' GMT' );
	// Con ?v= el archivo no cambia bajo esa dirección: se guarda por un año. Sin versión, un día.
	header( 'Cache-Control: public, max-age=' . ( isset( $_GET['v'] ) ? YEAR_IN_SECONDS . ', immutable' : DAY_IN_SECONDS ) ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	if ( $privado ) {
		header( 'X-Robots-Tag: noindex, nofollow' );
	}
	$pedida = isset( $_SERVER['HTTP_IF_NONE_MATCH'] ) ? trim( wp_unslash( $_SERVER['HTTP_IF_NONE_MATCH'] ) ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
	if ( $pedida === $etiqueta ) {
		status_header( 304 );
		exit;
	}
	status_header( 200 );
	header( 'Content-Length: ' . filesize( $archivo ) );
	if ( isset( $_SERVER['REQUEST_METHOD'] ) && 'HEAD' !== $_SERVER['REQUEST_METHOD'] ) {
		readfile( $archivo ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_readfile
	}
	exit;
}

/** Entrega una página: conexión con los formularios, estado de indexación y cabeceras de seguridad. */
function ta_sitio_pagina( $archivo, $privado ) {
	$html = (string) file_get_contents( $archivo ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents

	// Configuración de la página (assets/site/site.js lee window.TA_API): el servicio de solicitudes de este WordPress
	// (url) y, si está configurado, el asistente que recibe las cotizaciones de Transporte con su clave de Turnstile.
	// La cotización de Transporte no usa url: va solo al asistente (transporte-ui.js).
	$op  = ta_sitio_opciones();
	$api = array(
		'url' => esc_url_raw( rest_url( 'ta/v1/' ) ),
		'v'   => TA_SITIO_VERSION,
	);
	if ( '' !== $op['asistente'] ) {
		$api['asistente'] = $op['asistente'];
	}
	if ( '' !== $op['turnstile'] ) {
		$api['turnstile'] = $op['turnstile'];
	}
	$config = '<script>window.TA_API=' . wp_json_encode( $api, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES ) . ';</script>';
	$html   = preg_replace( '#</head>#i', $config . "\n</head>", $html, 1 );

	if ( ! $privado ) {
		// Publicado: se puede indexar y deja de decir que es una vista previa.
		$html = preg_replace( '#<meta name="robots" content="[^"]*">#i', '<meta name="robots" content="index,follow,max-image-preview:large">', $html, 1 );
		$html = str_replace( ' Vista previa de diseño.', '', $html );
	}

	// Seguridad: el navegador solo ejecuta los scripts del propio sitio y los escritos en la página (por su sello).
	$sellos = array();
	if ( preg_match_all( '#<script(?![^>]*\bsrc=)(?![^>]*application/ld\+json)[^>]*>(.*?)</script>#is', $html, $m ) ) {
		foreach ( $m[1] as $codigo ) {
			$sellos[] = "'sha256-" . base64_encode( hash( 'sha256', $codigo, true ) ) . "'"; // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode
		}
	}
	$csp = ta_sitio_politica( $sellos, $op );

	// La misma política va también dentro de la página: hay servidores (el del cliente entre ellos) que reemplazan
	// la cabecera Content-Security-Policy por la suya, y sin esto la página quedaría sin política. En una etiqueta
	// no se admite frame-ancestors: de eso se encarga X-Frame-Options.
	$en_pagina = array_filter(
		$csp,
		static function ( $regla ) {
			return 0 !== strpos( $regla, 'frame-ancestors' );
		}
	);
	$etiqueta  = '<meta http-equiv="Content-Security-Policy" content="' . esc_attr( implode( '; ', $en_pagina ) ) . '">';
	$html      = preg_replace( '#(<meta charset="[^"]*">)#i', '$1' . "\n" . $etiqueta, $html, 1, $puesta );
	if ( ! $puesta ) {
		$html = preg_replace( '#<head([^>]*)>#i', '<head$1>' . "\n" . $etiqueta, $html, 1 );
	}

	status_header( 200 );
	header( 'Content-Type: text/html; charset=utf-8' );
	header( 'Content-Security-Policy: ' . implode( '; ', $csp ) );
	header( 'X-Content-Type-Options: nosniff' );
	header( 'X-Frame-Options: SAMEORIGIN' );
	header( 'Referrer-Policy: strict-origin-when-cross-origin' );
	header( 'Permissions-Policy: geolocation=(self), camera=(), microphone=(), payment=()' );
	if ( $privado ) {
		// Privado: ni buscadores ni cachés (una caché compartida podría mostrarle la página a quien no tiene acceso).
		header( 'X-Robots-Tag: noindex, nofollow' );
		header( 'Cache-Control: no-store, private' );
		ta_sitio_no_guardar();
	} else {
		header( 'Cache-Control: public, max-age=300' );
	}
	if ( ! isset( $_SERVER['REQUEST_METHOD'] ) || 'HEAD' !== $_SERVER['REQUEST_METHOD'] ) {
		echo $html; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- página estática del propio plugin.
	}
	exit;
}

/**
 * Política de contenido (CSP) de las páginas. Scripts: los del propio sitio y los escritos en la página (sus sellos).
 * De fuera solo llegan las tipografías (Google Fonts) y las imágenes del mapa (OpenStreetMap). Con el asistente
 * configurado, la página lo puede llamar (connect-src: cotizaciones y, después, el chat); con la clave de Turnstile,
 * cargar su script y su marco (challenges.cloudflare.com). Sin ellos, la política es la de siempre.
 */
function ta_sitio_politica( array $sellos, array $op ) {
	$asistente = '' !== ( $op['asistente'] ?? '' ) ? ta_sitio_origen( $op['asistente'] ) : '';
	$turnstile = '' !== ( $op['turnstile'] ?? '' ) ? 'https://challenges.cloudflare.com' : '';
	return array_values(
		array_filter(
			array(
				"default-src 'self'",
				"script-src 'self' " . implode( ' ', array_unique( $sellos ) ) . ( '' !== $turnstile ? ' ' . $turnstile : '' ),
				"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
				"font-src 'self' https://fonts.gstatic.com",
				"img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org",  // blob: miniaturas de las fotografías que se adjuntan
				"connect-src 'self'" . ( '' !== $asistente ? ' ' . $asistente : '' ),
				'' !== $turnstile ? "frame-src 'self' " . $turnstile : '',
				"frame-ancestors 'self'",
				"base-uri 'self'",
				"form-action 'self'",
				"object-src 'none'",
			)
		)
	);
}

/** Páginas del sitio con su fecha, para el mapa del sitio. */
function ta_sitio_paginas() {
	$base    = TA_SITIO_DIR . 'sitio/';
	$paginas = array( '' => (int) @filemtime( $base . 'transporte-autorizado.html' ) ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
	foreach ( array( 'ayuda', 'normativa' ) as $carpeta ) {
		foreach ( (array) glob( $base . $carpeta . '/*.html' ) as $archivo ) {
			$paginas[ $carpeta . '/' . basename( $archivo ) ] = (int) filemtime( $archivo );
		}
	}
	return $paginas;
}

/** /sitemap-sitio.xml (solo publicado). */
function ta_sitio_mapa() {
	status_header( 200 );
	header( 'Content-Type: application/xml; charset=utf-8' );
	header( 'X-Robots-Tag: noindex' );
	echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
	foreach ( ta_sitio_paginas() as $ruta => $fecha ) {
		echo "\t<url><loc>" . esc_url( home_url( '/' . $ruta ) ) . '</loc><lastmod>' . esc_html( gmdate( 'Y-m-d', $fecha ) ) . "</lastmod></url>\n";
	}
	echo '</urlset>';
	exit;
}

/** robots.txt: publicado, anuncia el mapa del sitio. La vista privada no se nombra ahí: delataría su dirección. */
add_filter(
	'robots_txt',
	static function ( $texto ) {
		$op = ta_sitio_opciones();
		return 'publicado' === $op['modo'] ? $texto . "\nSitemap: " . home_url( '/sitemap-sitio.xml' ) . "\n" : $texto;
	},
	20
);
