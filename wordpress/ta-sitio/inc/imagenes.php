<?php
/**
 * Imágenes del sitio que se cambian desde «Ajustes del sitio»: las portadas del hero y las fotos de los servicios.
 *
 * Cada espacio es un texto fijo de la página (la imagen que trae el sitio). Si en los ajustes se elige otra imagen de la
 * biblioteca de medios, al entregar la página se reemplaza ese texto por la dirección de la elegida; sin elegir, queda
 * la del sitio. Las imágenes de la biblioteca son del mismo dominio, así que la política de contenido ya las permite.
 */

defined( 'ABSPATH' ) || exit;

/** [clave => [rótulo, imagen que trae el sitio, texto que se busca, reemplazo («%s» = dirección de la elegida)]] */
function ta_sitio_imagenes_espacios() {
	return array(
		'hero'              => array( 'Portada del inicio', 'assets/transporte/transporte-hero-flota-ciudad-cielo.webp', 'src="assets/transporte/transporte-hero-flota-ciudad-cielo.webp"', 'src="%s"' ),
		'hero_movil'        => array( 'Portada del inicio en el teléfono', 'assets/transporte/transporte-hero-flota-ciudad-movil.webp', 'srcset="assets/transporte/transporte-hero-flota-ciudad-movil.webp"', 'srcset="%s"' ),
		'hero_cotizar'      => array( 'Hero: «Necesito gestionar mis residuos»', '', 'data-route="cotizar">', 'data-route="cotizar" data-foto="%s">' ),
		'hero_buscar'       => array( 'Hero: «¿Buscas un transportista autorizado?»', 'assets/transporte/transporte-hero-panorama.webp', 'data-foto="assets/transporte/transporte-hero-panorama.webp"', 'data-foto="%s"' ),
		'hero_especialista' => array( 'Hero: «¿Necesitas orientación?»', '', 'data-route="especialista">', 'data-route="especialista" data-foto="%s">' ),
		'servicio_1'        => array( 'Servicio: retiro de residuos no peligrosos', 'assets/transporte/transporte-camion-lluvia-1200.webp', 'src="assets/transporte/transporte-camion-lluvia-1200.webp"', 'src="%s"' ),
		'servicio_2'        => array( 'Servicio: retiro de residuos peligrosos', 'assets/transporte/transporte-camion-industrial-dia-1200.webp', 'src="assets/transporte/transporte-camion-industrial-dia-1200.webp"', 'src="%s"' ),
		'servicio_3'        => array( 'Servicio: arriendo de contenedores', 'assets/transporte/transporte-portacontenedor-azul-1200.webp', 'src="assets/transporte/transporte-portacontenedor-azul-1200.webp"', 'src="%s"' ),
	);
}

/** Las elegidas en los ajustes: [clave => id de la biblioteca], solo las que siguen siendo imágenes. */
function ta_sitio_imagenes_elegidas() {
	$op = ta_sitio_opciones();
	$out = array();
	foreach ( (array) $op['imagenes'] as $clave => $id ) {
		if ( isset( ta_sitio_imagenes_espacios()[ $clave ] ) && wp_attachment_is_image( (int) $id ) ) {
			$out[ $clave ] = (int) $id;
		}
	}
	return $out;
}

/** La página con las imágenes elegidas en lugar de las del sitio. */
function ta_sitio_imagenes_aplicar( $html ) {
	$espacios = ta_sitio_imagenes_espacios();
	foreach ( ta_sitio_imagenes_elegidas() as $clave => $id ) {
		$url = wp_get_attachment_image_url( $id, 'full' );
		if ( $url ) {
			$html = str_replace( $espacios[ $clave ][2], sprintf( $espacios[ $clave ][3], esc_url( $url ) ), $html );
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

/** Filas de la sección «Imágenes del sitio» en los ajustes. */
function ta_sitio_imagenes_filas() {
	$elegidas = ta_sitio_imagenes_elegidas();
	foreach ( ta_sitio_imagenes_espacios() as $clave => $e ) {
		$id = $elegidas[ $clave ] ?? 0;
		$vista = $id ? wp_get_attachment_image( $id, 'medium' ) : ( '' !== $e[1] ? '<img src="' . esc_url( TA_SITIO_URL . 'sitio/' . $e[1] ) . '" alt="">' : '<span class="ta-imagen-sin">Sin foto propia: se ve la portada del inicio.</span>' );
		?>
		<tr>
			<th scope="row"><?php echo esc_html( $e[0] ); ?></th>
			<td><div class="ta-firma-imagen ta-imagen" data-ta-firma data-ta-titulo="<?php echo esc_attr( $e[0] ); ?>" data-ta-original="<?php echo esc_attr( '' !== $e[1] ? TA_SITIO_URL . 'sitio/' . $e[1] : '' ); ?>">
					<input type="hidden" name="imagenes[<?php echo esc_attr( $clave ); ?>]" value="<?php echo esc_attr( $id ); ?>" data-ta-firma-id>
					<div class="ta-firma-vista" data-ta-firma-vista><?php echo $vista; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- wp_get_attachment_image o una dirección escapada. ?></div>
					<button type="button" class="button" data-ta-firma-elegir><?php echo $id ? 'Cambiar imagen' : 'Subir o elegir imagen'; ?></button>
					<button type="button" class="button-link button-link-delete" data-ta-firma-quitar <?php echo $id ? '' : 'hidden'; ?>>Volver a la del sitio</button>
				</div></td>
		</tr>
		<?php
	}
}
