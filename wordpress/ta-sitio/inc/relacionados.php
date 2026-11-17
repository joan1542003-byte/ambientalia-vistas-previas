<?php
/**
 * Sitios relacionados (17-11-2026): HDS y Campañas de reciclaje se muestran u ocultan, y se cambian sus enlaces, desde
 * «Ajustes → Sitio». Aparecen en la sección «Servicios relacionados» de la portada, en la columna «Sitios relacionados»
 * del pie y en llms.txt. El HTML marca cada uno con data-relacionado="hds|campanas" (transporte-autorizado.html); al
 * entregar la página se quitan los apagados y se cambian los enlaces. Sin ninguno, se van también el título de la sección
 * y la columna del pie (la sección queda con «¿Eres gestor o transportista autorizado?»).
 */

defined( 'ABSPATH' ) || exit;

/** [clave => [nombre, enlace que trae el sitio]] */
function ta_sitio_relacionados_base() {
	return array(
		'hds'      => array( 'HDS', 'https://hds.cl' ),
		'campanas' => array( 'Campañas de reciclaje', 'https://campanasdereciclaje.cl' ),
	);
}

/** [clave => ['nombre', 'activo', 'url']] con lo guardado en los ajustes. */
function ta_sitio_relacionados() {
	$guardado = (array) ( ta_sitio_opciones()['relacionados'] ?? array() );
	$out      = array();
	foreach ( ta_sitio_relacionados_base() as $clave => $b ) {
		$g             = (array) ( $guardado[ $clave ] ?? array() );
		$out[ $clave ] = array(
			'nombre' => $b[0],
			'activo' => ! isset( $g['activo'] ) || (bool) $g['activo'],
			'url'    => ! empty( $g['url'] ) ? (string) $g['url'] : $b[1],
		);
	}
	return $out;
}

/** Dirección como se guarda: http(s) con dominio. Vacía si no cumple. */
function ta_sitio_relacionado_url( $valor ) {
	$url = esc_url_raw( trim( (string) $valor ), array( 'https', 'http' ) );
	$p   = $url ? wp_parse_url( $url ) : false;
	return is_array( $p ) && ! empty( $p['host'] ) && false !== strpos( $p['host'], '.' ) ? untrailingslashit( $url ) : '';
}

/** La portada con los sitios relacionados de los ajustes. */
function ta_sitio_relacionados_aplicar( $html ) {
	$todos   = ta_sitio_relacionados();
	$activos = 0;
	foreach ( $todos as $clave => $r ) {
		$base = ta_sitio_relacionados_base()[ $clave ][1];
		if ( ! $r['activo'] ) {
			$html = (string) preg_replace( '#\s*<a class="related" data-relacionado="' . $clave . '".*?</a>#s', '', $html );
			$html = (string) preg_replace( '#\s*<li data-relacionado="' . $clave . '">.*?</li>#s', '', $html );
			continue;
		}
		++$activos;
		if ( $r['url'] !== $base ) {
			$html = str_replace( 'href="' . $base . '"', 'href="' . esc_url( $r['url'] ) . '"', $html );
		}
	}
	if ( ! $activos ) {
		$html = (string) preg_replace( '#\s*<div class="section-head reveal" data-relacionados-titulo>.*?</div>#s', '', $html, 1 );
		$html = (string) preg_replace( '#\s*<div class="grid grid-2 reveal-group" data-relacionados>\s*</div>#s', '', $html, 1 );
		$html = (string) preg_replace( '#\s*<div data-relacionados-pie>.*?</div>#s', '', $html, 1 );
		$html = str_replace( ' aria-labelledby="relacionados-title"', ' aria-label="Gestores y transportistas"', $html );  // el título ya no está
	}
	return $html;
}

/** llms.txt con los sitios relacionados de los ajustes (las líneas «- [HDS](https://hds.cl): …»). */
function ta_sitio_relacionados_llms( $texto ) {
	foreach ( ta_sitio_relacionados() as $clave => $r ) {
		$base = ta_sitio_relacionados_base()[ $clave ][1];
		if ( ! $r['activo'] ) {
			$texto = (string) preg_replace( '#^- \[[^\]]+\]\(' . preg_quote( $base, '#' ) . '\)[^\n]*\n#m', '', $texto );
		} elseif ( $r['url'] !== $base ) {
			$texto = str_replace( '](' . $base . ')', '](' . $r['url'] . ')', $texto );
		}
	}
	return $texto;
}

/** Lo enviado desde «Ajustes → Sitio». Devuelve [relacionados, ¿hubo una dirección inválida?]. */
function ta_sitio_relacionados_desde_post() {
	$out      = array();
	$invalida = false;
	$antes    = ta_sitio_relacionados();
	// phpcs:disable WordPress.Security.NonceVerification.Missing -- se verifica en el guardado (check_admin_referer).
	foreach ( ta_sitio_relacionados_base() as $clave => $b ) {
		$pedida = isset( $_POST[ 'relacionado_url_' . $clave ] ) ? sanitize_text_field( wp_unslash( $_POST[ 'relacionado_url_' . $clave ] ) ) : '';
		$url    = '' === trim( $pedida ) ? $b[1] : ta_sitio_relacionado_url( $pedida );  // vacía: la del sitio
		if ( '' === $url ) {
			$invalida = true;
			$url      = $antes[ $clave ]['url'];
		}
		$out[ $clave ] = array(
			'activo' => ! empty( $_POST[ 'relacionado_activo_' . $clave ] ),
			'url'    => $url,
		);
	}
	// phpcs:enable
	return array( $out, $invalida );
}
