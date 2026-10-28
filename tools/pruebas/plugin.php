<?php
/**
 * Comprobaciones del plugin ta-sitio sin WordPress: la dirección del asistente que se acepta en los ajustes y la
 * política de contenido (CSP) que reciben las páginas. Solo se simulan las funciones de WordPress que tocan.
 *
 *     php tools/pruebas/plugin.php      (sale con 1 si algo falla)
 */

define( 'ABSPATH', __DIR__ . '/' );
function add_action() {}
function add_filter() {}
function wp_parse_url( $url, $componente = -1 ) {
	return parse_url( $url, $componente );
}

require __DIR__ . '/../../wordpress/ta-sitio/inc/ajustes.php';
require __DIR__ . '/../../wordpress/ta-sitio/inc/sitio.php';
require __DIR__ . '/../../wordpress/ta-sitio/inc/imagenes.php';  // sitio.php la llama al entregar la página (plugin 1.4.1)

$fallas = 0;
function comprobar( $ok, $que ) {
	global $fallas;
	echo ( $ok ? '  ok    ' : '  FALLA ' ) . $que . "\n";
	$fallas += $ok ? 0 : 1;
}
function regla( array $csp, $nombre ) {
	foreach ( $csp as $r ) {
		if ( 0 === strpos( $r, $nombre . ' ' ) ) {
			return $r;
		}
	}
	return null;
}

echo "Dirección del asistente (Ajustes del sitio)\n";
$casos = array(
	'https://asistente.transporteautorizado.cl'          => 'https://asistente.transporteautorizado.cl',
	'https://asistente.transporteautorizado.cl/'         => 'https://asistente.transporteautorizado.cl',
	'https://Asistente.Ejemplo.cl:8443/base/'            => 'https://asistente.ejemplo.cl:8443/base',
	'http://127.0.0.1:8000'                              => 'http://127.0.0.1:8000',
	'http://asistente.transporteautorizado.cl'           => '',
	'https://usuario:clave@asistente.ejemplo.cl'         => '',
	'https://asistente.ejemplo.cl/?x=1'                  => '',
	'https://asistente.ejemplo.cl/#x'                    => '',
	'javascript:alert(1)'                                => '',
	'https://asistente.ejemplo.cl/"><script>'            => '',
	''                                                   => '',
);
foreach ( $casos as $entrada => $esperado ) {
	comprobar( ta_sitio_url_asistente( $entrada ) === $esperado, sprintf( '%-48s → %s', var_export( $entrada, true ), '' === $esperado ? '(rechazada)' : $esperado ) );
}

echo "Política de contenido\n";
$sellos = array( "'sha256-abc'" );
$base   = ta_sitio_politica( $sellos, array( 'asistente' => '', 'turnstile' => '' ) );
comprobar( "connect-src 'self' https://joan1542003-byte.github.io" === regla( $base, 'connect-src' ), 'sin asistente: connect-src solo el propio sitio' );
comprobar( null === regla( $base, 'frame-src' ), 'sin Turnstile: sin frame-src (rige default-src)' );
comprobar( "script-src 'self' 'sha256-abc'" === regla( $base, 'script-src' ), 'sin Turnstile: script-src igual que antes' );
comprobar( 10 === count( $base ), 'sin configuración: las mismas diez reglas de la 1.2.0' );

$con = ta_sitio_politica( $sellos, array( 'asistente' => 'https://asistente.ejemplo.cl:8443/base', 'turnstile' => '0x4AAAAAAAprueba' ) );
comprobar( "connect-src 'self' https://joan1542003-byte.github.io https://asistente.ejemplo.cl:8443" === regla( $con, 'connect-src' ), 'con asistente: connect-src suma su origen (sin la ruta)' );
comprobar( "script-src 'self' 'sha256-abc' https://challenges.cloudflare.com" === regla( $con, 'script-src' ), 'con Turnstile: script-src suma challenges.cloudflare.com' );
comprobar( "frame-src 'self' https://challenges.cloudflare.com" === regla( $con, 'frame-src' ), 'con Turnstile: frame-src para su marco' );
comprobar( "frame-ancestors 'self'" === regla( $con, 'frame-ancestors' ) && "object-src 'none'" === regla( $con, 'object-src' ), 'el resto de la política no cambia' );
comprobar( false === strpos( implode( ';', $con ), '/base' ), 'la ruta del asistente no entra a la política' );

echo $fallas ? "\n$fallas comprobación(es) fallaron.\n" : "\nTodo bien.\n";
exit( $fallas ? 1 : 0 );
