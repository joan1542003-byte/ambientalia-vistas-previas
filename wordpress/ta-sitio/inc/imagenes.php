<?php
/**
 * Imágenes del sitio que se cambian desde «Ajustes del sitio»: todas las de assets/transporte/ que usan las páginas
 * (portadas, servicios, otras secciones, imagen al compartir), las miniaturas de los residuos, el logo y el ícono.
 *
 * La lista la arma tools/wordpress.py al armar el paquete (sitio/imagenes.json), así una imagen nueva del sitio aparece
 * sola en los ajustes. Si se elige otra imagen de la biblioteca de medios, al entregar la página se reemplaza su
 * dirección en el HTML; las miniaturas de los residuos las pone el navegador (pickers.js), que las lee de
 * window.TA_API.imagenes. Sin elegir, queda la del sitio. Las imágenes de la biblioteca son del mismo dominio, así que la
 * política de contenido ya las permite.
 */

defined( 'ABSPATH' ) || exit;

/** Orden de los grupos en los ajustes. */
function ta_sitio_imagenes_grupos() {
	return array( 'Portada', 'Servicios', 'Otras secciones', 'Residuos', 'Logo e ícono', 'Al compartir' );
}

/**
 * [clave => [grupo, rotulo, archivos (desde la raíz del sitio), tipo, buscar, reemplazo]]. tipo: '' (se reemplaza la
 * dirección), 'logo' (además, estilos del logo) o 'insertar' (opciones del hero sin foto propia: se agrega el atributo).
 */
function ta_sitio_imagenes_espacios() {
	static $espacios = null;
	if ( null !== $espacios ) {
		return $espacios;
	}
	$espacios = array();
	$lista    = json_decode( (string) @file_get_contents( TA_SITIO_DIR . 'sitio/imagenes.json' ), true ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged,WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
	foreach ( is_array( $lista ) ? $lista : array() as $e ) {
		if ( empty( $e['clave'] ) || empty( $e['archivos'] ) ) {
			continue;
		}
		$espacios[ sanitize_key( $e['clave'] ) ] = array(
			'grupo'    => (string) ( $e['grupo'] ?? 'Otras secciones' ),
			'rotulo'   => (string) ( $e['rotulo'] ?? $e['clave'] ),
			'archivos' => array_map( 'strval', (array) $e['archivos'] ),
			'tipo'     => (string) ( $e['tipo'] ?? '' ),
		);
	}
	// Las opciones del hero que hoy usan la portada del inicio: se les agrega una foto propia
	$espacios['hero_cotizar']      = array( 'grupo' => 'Portada', 'rotulo' => 'Hero: «Necesito gestionar mis residuos»', 'archivos' => array(), 'tipo' => 'insertar', 'buscar' => 'data-route="cotizar">', 'reemplazo' => 'data-route="cotizar" data-foto="%s">' );
	$espacios['hero_especialista'] = array( 'grupo' => 'Portada', 'rotulo' => 'Hero: «¿Necesitas orientación?»', 'archivos' => array(), 'tipo' => 'insertar', 'buscar' => 'data-route="especialista">', 'reemplazo' => 'data-route="especialista" data-foto="%s">' );
	return $espacios;
}

/** Las elegidas en los ajustes: [clave => id de la biblioteca], solo las que siguen siendo imágenes. */
function ta_sitio_imagenes_elegidas() {
	$op       = ta_sitio_opciones();
	$espacios = ta_sitio_imagenes_espacios();
	$out      = array();
	foreach ( (array) $op['imagenes'] as $clave => $id ) {
		if ( isset( $espacios[ $clave ] ) && wp_attachment_is_image( (int) $id ) ) {
			$out[ $clave ] = (int) $id;
		}
	}
	return $out;
}

/** [archivo del sitio => dirección de la elegida], para el navegador (window.TA_API.imagenes). */
function ta_sitio_imagenes_mapa() {
	$espacios = ta_sitio_imagenes_espacios();
	$out      = array();
	foreach ( ta_sitio_imagenes_elegidas() as $clave => $id ) {
		$url = wp_get_attachment_image_url( $id, 'full' );
		foreach ( $url ? $espacios[ $clave ]['archivos'] : array() as $archivo ) {
			$out[ $archivo ] = esc_url_raw( $url );
		}
	}
	return $out;
}

/** La página con las imágenes elegidas en lugar de las del sitio. */
function ta_sitio_imagenes_aplicar( $html ) {
	$espacios = ta_sitio_imagenes_espacios();
	foreach ( ta_sitio_imagenes_elegidas() as $clave => $id ) {
		$url = wp_get_attachment_image_url( $id, 'full' );
		if ( ! $url ) {
			continue;
		}
		$e = $espacios[ $clave ];
		if ( 'insertar' === $e['tipo'] ) {
			$html = str_replace( $e['buscar'], sprintf( $e['reemplazo'], esc_url( $url ) ), $html );
			continue;
		}
		foreach ( $e['archivos'] as $archivo ) {
			// La dirección relativa (también desde ayuda/, normativa/ y legal/), con su ?v=, o la absoluta del dominio
			$html = preg_replace_callback( '#(?:\.\./)*(?:https?://transporteautorizado\.cl/)?' . preg_quote( $archivo, '#' ) . '(?:\?v=[\w.-]*)?#', fn() => esc_url( $url ), $html );
		}
		if ( 'logo' === $e['tipo'] ) {
			$meta  = wp_get_attachment_metadata( $id );
			$ancho = ! empty( $meta['width'] ) && ! empty( $meta['height'] ) ? (int) $meta['width'] . ' / ' . (int) $meta['height'] : '4040 / 1240';
			$css   = '<style>.logo-ta{background:url("' . esc_url( $url ) . '") left center / contain no-repeat !important;aspect-ratio:' . $ancho . '}.logo-ta::before,.logo-ta::after{display:none !important}</style>';
			$html  = preg_replace( '#</head>#i', $css . "\n</head>", $html, 1 );
		}
	}
	return $html;
}

/** Lo enviado desde los ajustes: [clave => id] (0 o ausente = la imagen del sitio). */
function ta_sitio_imagenes_desde_post() {
	$out = array();
	$enviadas = isset( $_POST['imagenes'] ) ? (array) wp_unslash( $_POST['imagenes'] ) : array(); // phpcs:ignore WordPress.Security.NonceVerification.Missing -- se verifica en el guardado (check_admin_referer).
	foreach ( array_keys( ta_sitio_imagenes_espacios() ) as $clave ) {
		$id = isset( $enviadas[ $clave ] ) ? absint( $enviadas[ $clave ] ) : 0;
		if ( $id && wp_attachment_is_image( $id ) ) {
			$out[ $clave ] = $id;
		}
	}
	return $out;
}

/** Filas de la sección «Imágenes del sitio» en los ajustes, por grupo. */
function ta_sitio_imagenes_filas() {
	$elegidas = ta_sitio_imagenes_elegidas();
	$espacios = ta_sitio_imagenes_espacios();
	$grupos   = ta_sitio_imagenes_grupos();
	foreach ( $espacios as $e ) {
		if ( ! in_array( $e['grupo'], $grupos, true ) ) {
			$grupos[] = $e['grupo'];
		}
	}
	foreach ( $grupos as $grupo ) {
		$filas = array_filter( $espacios, fn( $e ) => $e['grupo'] === $grupo );
		if ( ! $filas ) {
			continue;
		}
		$cambiadas = count( array_intersect_key( $elegidas, $filas ) );
		?>
		<tr class="ta-imagen-grupo"><th colspan="2"><h3><?php echo esc_html( $grupo ); ?> <span class="ta-imagen-cuenta"><?php echo esc_html( count( $filas ) . ( 1 === count( $filas ) ? ' imagen' : ' imágenes' ) . ( $cambiadas ? " · {$cambiadas} cambiada" . ( 1 === $cambiadas ? '' : 's' ) : '' ) ); ?></span></h3></th></tr>
		<?php
		foreach ( $filas as $clave => $e ) {
			$id       = $elegidas[ $clave ] ?? 0;
			$original = $e['archivos'] ? TA_SITIO_URL . 'sitio/' . end( $e['archivos'] ) : '';
			$vista    = $id ? wp_get_attachment_image( $id, 'medium' ) : ( '' !== $original ? '<img src="' . esc_url( $original ) . '" alt="">' : '<span class="ta-imagen-sin">Sin foto propia: se ve la portada del inicio.</span>' );
			?>
			<tr>
				<th scope="row"><?php echo esc_html( $e['rotulo'] ); ?></th>
				<td><div class="ta-firma-imagen ta-imagen" data-ta-firma data-ta-titulo="<?php echo esc_attr( $e['rotulo'] ); ?>" data-ta-original="<?php echo esc_attr( $original ); ?>">
						<input type="hidden" name="imagenes[<?php echo esc_attr( $clave ); ?>]" value="<?php echo esc_attr( $id ); ?>" data-ta-firma-id>
						<div class="ta-firma-vista" data-ta-firma-vista><?php echo $vista; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- wp_get_attachment_image o una dirección escapada. ?></div>
						<button type="button" class="button" data-ta-firma-elegir><?php echo $id ? 'Cambiar imagen' : 'Subir o elegir imagen'; ?></button>
						<button type="button" class="button-link button-link-delete" data-ta-firma-quitar <?php echo $id ? '' : 'hidden'; ?>>Volver a la del sitio</button>
					</div></td>
			</tr>
			<?php
		}
	}
}
