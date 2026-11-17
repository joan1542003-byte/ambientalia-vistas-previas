<?php
/**
 * Buscadores (17-11-2026): verificación del sitio en Google Search Console y Bing Webmaster Tools desde los ajustes.
 *
 * Cada servicio entrega dos formas de comprobar que el sitio es tuyo, y las dos se pueden usar aquí:
 * - Una etiqueta <meta> (se pega en «Ajustes → Buscadores»): va en la portada del sitio nuevo y en las páginas de WordPress.
 * - Un archivo (se sube en el mismo lugar): google<código>.html o BingSiteAuth.xml, que el plugin entrega en la raíz del
 *   dominio (https://dominio/google<código>.html). Solo se aceptan esos nombres, con el contenido que generan Google y Bing.
 * Nada de esto cambia cómo se ve el sitio ni su puntaje: son dos etiquetas en el <head> de la portada y dos direcciones.
 */

defined( 'ABSPATH' ) || exit;

/** [servicio => [rótulo, nombre de la etiqueta meta, patrón del archivo, firma que debe traer el archivo]] */
function ta_sitio_buscadores() {
	return array(
		'google' => array( 'Google', 'google-site-verification', '/^google[0-9a-f]{8,40}\.html$/', 'google-site-verification:' ),
		'bing'   => array( 'Bing', 'msvalidate.01', '/^BingSiteAuth\.xml$/', '<user>' ),
	);
}

/** Lo guardado: ['google' => código, 'bing' => código, 'archivos' => [nombre => contenido]]. */
function ta_sitio_verificacion() {
	$v = (array) ( ta_sitio_opciones()['verificacion'] ?? array() );
	return array(
		'google'   => (string) ( $v['google'] ?? '' ),
		'bing'     => (string) ( $v['bing'] ?? '' ),
		'archivos' => is_array( $v['archivos'] ?? null ) ? $v['archivos'] : array(),
	);
}

/** El código de una etiqueta pegada entera (<meta … content="…">) o solo el código. Vacío si no parece un código. */
function ta_sitio_codigo_verificacion( $texto ) {
	$texto = trim( wp_unslash( (string) $texto ) );
	if ( preg_match( '/content\s*=\s*["\']([^"\']+)["\']/i', $texto, $m ) ) {
		$texto = $m[1];
	}
	$texto = trim( $texto );
	return preg_match( '/^[A-Za-z0-9_\-]{8,120}$/', $texto ) ? $texto : '';
}

/** Etiquetas meta de verificación guardadas, listas para el <head>. */
function ta_sitio_verificacion_metas() {
	$v   = ta_sitio_verificacion();
	$out = '';
	foreach ( ta_sitio_buscadores() as $clave => $b ) {
		if ( '' !== $v[ $clave ] ) {
			$out .= '<meta name="' . esc_attr( $b[1] ) . '" content="' . esc_attr( $v[ $clave ] ) . '">' . "\n";
		}
	}
	return $out;
}

/** La portada del sitio nuevo con las etiquetas de verificación (inc/sitio.php la llama al entregarla). */
function ta_sitio_verificacion_aplicar( $html ) {
	$metas = ta_sitio_verificacion_metas();
	return '' === $metas ? $html : (string) preg_replace( '#</head>#i', $metas . '</head>', $html, 1 );
}

/* Las páginas de WordPress también la llevan: así sirve aunque el sitio nuevo siga en privado. */
add_action(
	'wp_head',
	static function () {
		echo ta_sitio_verificacion_metas(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- atributos escapados en ta_sitio_verificacion_metas().
	},
	1
);

/** Si la dirección pedida es un archivo de verificación guardado, lo entrega (inc/sitio.php, antes que el resto). */
function ta_sitio_verificacion_servir( $ruta ) {
	$archivos = ta_sitio_verificacion()['archivos'];
	if ( '' === $ruta || ! isset( $archivos[ $ruta ] ) ) {
		return;
	}
	status_header( 200 );
	header( 'Content-Type: ' . ( '.xml' === substr( $ruta, -4 ) ? 'application/xml' : 'text/html' ) . '; charset=utf-8' );
	header( 'X-Content-Type-Options: nosniff' );
	header( 'Cache-Control: public, max-age=300' );
	echo $archivos[ $ruta ]; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- contenido validado al subirlo (ta_sitio_verificacion_desde_post): solo la línea o el XML de Google o Bing.
	exit;
}

/**
 * Lo enviado desde «Ajustes → Buscadores»: códigos, archivo subido y archivos quitados. Devuelve [verificación, aviso]
 * (aviso vacío, o el motivo por el que el archivo no se aceptó).
 */
function ta_sitio_verificacion_desde_post() {
	$v     = ta_sitio_verificacion();
	$aviso = '';
	// phpcs:disable WordPress.Security.NonceVerification.Missing -- se verifica en el guardado (check_admin_referer).
	foreach ( array_keys( ta_sitio_buscadores() ) as $clave ) {
		if ( isset( $_POST[ 'verificacion_' . $clave ] ) ) {
			// Sin sanitize_text_field: borraría la etiqueta <meta> pegada entera. Solo se guarda el código, si cumple el patrón
			$texto       = substr( (string) wp_unslash( $_POST[ 'verificacion_' . $clave ] ), 0, 500 ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- se valida en ta_sitio_codigo_verificacion().
			$v[ $clave ] = '' === trim( $texto ) ? '' : ta_sitio_codigo_verificacion( $texto );
			if ( '' !== trim( $texto ) && '' === $v[ $clave ] ) {
				$aviso = 'codigo';
			}
		}
	}
	$quitar = isset( $_POST['verificacion_quitar'] ) ? array_map( 'sanitize_file_name', (array) wp_unslash( $_POST['verificacion_quitar'] ) ) : array();
	foreach ( $quitar as $nombre ) {
		unset( $v['archivos'][ $nombre ] );
	}
	if ( ! empty( $_FILES['verificacion_archivo']['name'] ) && UPLOAD_ERR_OK === (int) $_FILES['verificacion_archivo']['error'] ) {
		$nombre = sanitize_file_name( wp_unslash( $_FILES['verificacion_archivo']['name'] ) );
		$tmp    = (string) $_FILES['verificacion_archivo']['tmp_name']; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- ruta temporal de PHP.
		$texto  = is_uploaded_file( $tmp ) && filesize( $tmp ) <= 2048 ? (string) file_get_contents( $tmp ) : ''; // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		$aviso  = 'archivo';
		foreach ( ta_sitio_buscadores() as $b ) {
			if ( preg_match( $b[2], $nombre ) && false !== stripos( $texto, $b[3] ) && ! preg_match( '/<script|<\?php|javascript:/i', $texto ) ) {
				$v['archivos'][ $nombre ] = $texto;
				$aviso                    = '';
			}
		}
	}
	// phpcs:enable
	ksort( $v['archivos'] );
	return array( $v, $aviso );
}

/** Estado de los buscadores, para el resumen y la pestaña: [[rótulo, ¿listo?, detalle]]. */
function ta_sitio_buscadores_estado() {
	$op = ta_sitio_opciones();
	$v  = ta_sitio_verificacion();
	$verificado = static function ( $clave ) use ( $v ) {
		if ( '' !== $v[ $clave ] ) {
			return 'Etiqueta cargada';
		}
		foreach ( array_keys( $v['archivos'] ) as $nombre ) {
			if ( preg_match( ta_sitio_buscadores()[ $clave ][2], $nombre ) ) {
				return 'Archivo ' . $nombre;
			}
		}
		return '';
	};
	$publico = 'publicado' === $op['modo'] && '1' === (string) get_option( 'blog_public', '1' );
	return array(
		array( 'El sitio nuevo está publicado en la portada', 'publicado' === $op['modo'], 'publicado' === $op['modo'] ? 'Sus páginas dicen «index, follow».' : 'En privado, los buscadores no lo ven.' ),
		array( 'WordPress permite a los buscadores entrar', '1' === (string) get_option( 'blog_public', '1' ), '1' === (string) get_option( 'blog_public', '1' ) ? 'Ajustes → Lectura: visible para los buscadores.' : 'Ajustes → Lectura tiene marcado «Pedir a los motores de búsqueda que no indexen este sitio».' ),
		array( 'robots.txt anuncia el mapa del sitio', $publico, $publico ? 'Sitemap: ' . home_url( '/sitemap-sitio.xml' ) : 'Se anuncia al publicar.' ),
		array( 'Verificado en Google Search Console', '' !== $verificado( 'google' ), '' !== $verificado( 'google' ) ? $verificado( 'google' ) : 'Falta: sube el archivo o pega la etiqueta que te da Google.' ),
		array( 'Verificado en Bing Webmaster Tools (opcional)', '' !== $verificado( 'bing' ), '' !== $verificado( 'bing' ) ? $verificado( 'bing' ) : 'Opcional: Bing también alimenta las búsquedas de Copilot y ChatGPT.' ),
	);
}
