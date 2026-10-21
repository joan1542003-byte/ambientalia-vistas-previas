<?php
/**
 * Entrega una página del sitio tal como lo hace el plugin ta-sitio (ta_sitio_pagina), sin WordPress: con
 * window.TA_API y la política de contenido (CSP) dentro de la página. La usa tools/pruebas/widget.mjs para probar el
 * chat bajo la CSP real del plugin. Solo se simulan las funciones de WordPress que tocan.
 *
 *     php tools/pruebas/pagina-wp.php <página.html> [dirección del asistente] [clave de Turnstile]
 */

define( 'ABSPATH', __DIR__ . '/' );
define( 'YEAR_IN_SECONDS', 31536000 );
define( 'DAY_IN_SECONDS', 86400 );
function add_action() {}
function add_filter() {}
function do_action() {}
function status_header() {}
function wp_parse_url( $url, $componente = -1 ) {
	return parse_url( $url, $componente );
}
function wp_parse_args( $a, $b ) {
	return array_merge( $b, $a );
}
function get_option() {
	global $opciones;
	return $opciones;
}
function rest_url( $ruta ) {
	return 'https://wordpress.ejemplo/wp-json/' . $ruta;
}
function esc_url_raw( $url ) {
	return $url;
}
function esc_attr( $texto ) {
	return htmlspecialchars( $texto, ENT_QUOTES );
}
function wp_json_encode( $valor, $opciones = 0 ) {
	return json_encode( $valor, $opciones );
}

define( 'TA_SITIO_VERSION', preg_replace( '/^.*TA_SITIO_VERSION\', \'([\d.]+)\'.*$/s', '$1', (string) file_get_contents( __DIR__ . '/../../wordpress/ta-sitio/ta-sitio.php' ) ) );
require __DIR__ . '/../../wordpress/ta-sitio/inc/ajustes.php';
require __DIR__ . '/../../wordpress/ta-sitio/inc/sitio.php';

$opciones = array(
	'modo'      => 'publicado',
	'asistente' => ta_sitio_url_asistente( $argv[2] ?? '' ),
	'turnstile' => $argv[3] ?? '',
);
ta_sitio_pagina( $argv[1], false );
