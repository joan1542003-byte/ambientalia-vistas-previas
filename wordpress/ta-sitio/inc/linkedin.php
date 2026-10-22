<?php
/**
 * Publicaciones recientes de LinkedIn en el sitio oficial, sin subir otro zip.
 *
 * Las lee una tarea de GitHub cada 6 horas (tools/linkedin.mjs → assets/transporte/linkedin.json de la copia publicada
 * en GitHub Pages). El plugin trae esa lista por /wp-json/ta/v1/linkedin y la guarda una hora; la página la pide ahí
 * (window.TA_API.linkedin, assets/site/normativa.js). Si GitHub no responde, entrega la lista que venía en el zip.
 * Las portadas se quedan en GitHub Pages (la política de contenido las permite: ta_sitio_politica).
 */

defined( 'ABSPATH' ) || exit;

define( 'TA_SITIO_LINKEDIN_BASE', 'https://joan1542003-byte.github.io/ambientalia-vistas-previas/' );

add_action(
	'rest_api_init',
	static function () {
		register_rest_route(
			'ta/v1',
			'/linkedin',
			array(
				'methods'             => 'GET',
				'permission_callback' => '__return_true',
				'callback'            => 'ta_sitio_rest_linkedin',
			)
		);
	}
);

/** La lista publicada en GitHub Pages, con las portadas en dirección completa; null si no se pudo leer. */
function ta_sitio_linkedin_remota() {
	$respuesta = wp_remote_get( TA_SITIO_LINKEDIN_BASE . 'assets/transporte/linkedin.json', array( 'timeout' => 8 ) );
	if ( is_wp_error( $respuesta ) || 200 !== (int) wp_remote_retrieve_response_code( $respuesta ) ) {
		return null;
	}
	$datos = json_decode( wp_remote_retrieve_body( $respuesta ), true );
	if ( ! is_array( $datos ) || ! isset( $datos['posts'] ) || ! is_array( $datos['posts'] ) ) {
		return null;
	}
	foreach ( $datos['posts'] as $i => $post ) {
		if ( ! is_array( $post ) ) {
			unset( $datos['posts'][ $i ] );
			continue;
		}
		if ( ! empty( $post['imagen'] ) && preg_match( '#^assets/transporte/linkedin/[\w.-]+$#', (string) $post['imagen'] ) ) {
			$datos['posts'][ $i ]['imagen'] = TA_SITIO_LINKEDIN_BASE . $post['imagen'];
		} else {
			unset( $datos['posts'][ $i ]['imagen'] );
		}
	}
	$datos['posts'] = array_values( $datos['posts'] );
	return $datos;
}

/** GET /wp-json/ta/v1/linkedin */
function ta_sitio_rest_linkedin() {
	$datos = get_transient( 'ta_sitio_linkedin' );
	if ( ! is_array( $datos ) ) {
		$datos = ta_sitio_linkedin_remota();
		if ( null === $datos ) {
			$local = TA_SITIO_DIR . 'sitio/assets/transporte/linkedin.json';
			$datos = is_readable( $local ) ? json_decode( (string) file_get_contents( $local ), true ) : null; // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			$datos = is_array( $datos ) ? $datos : array( 'posts' => array() );
			set_transient( 'ta_sitio_linkedin', $datos, 10 * MINUTE_IN_SECONDS );  // GitHub no respondió: se vuelve a intentar pronto
		} else {
			set_transient( 'ta_sitio_linkedin', $datos, HOUR_IN_SECONDS );
		}
	}
	$respuesta = new WP_REST_Response( $datos );
	$respuesta->header( 'Cache-Control', 'public, max-age=900' );
	$respuesta->header( 'X-Robots-Tag', 'noindex' );
	return $respuesta;
}
