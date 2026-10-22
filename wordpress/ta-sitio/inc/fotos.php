<?php
/**
 * Fotografías que la persona adjunta a su solicitud.
 *
 * Son archivos que sube cualquiera, sin iniciar sesión, así que nada de lo que llega se guarda tal cual:
 * - solo imágenes JPEG, PNG o WebP, reconocidas por su contenido (no por el nombre ni por el tipo que declara quien envía);
 * - con tope de cantidad, de peso y de tamaño en píxeles;
 * - cada una se vuelve a generar como imagen nueva (lo que no sea imagen, o venga escondido en ella, no sobrevive);
 * - quedan en una carpeta con nombre al azar, que el servidor no entrega; se ven desde el escritorio de WordPress,
 *   con la sesión iniciada, y van adjuntas al correo del equipo.
 */

defined( 'ABSPATH' ) || exit;

const TA_SITIO_FOTOS_MAX    = 6;         // por solicitud
const TA_SITIO_FOTO_BYTES   = 6291456;   // 6 MB cada una (el sitio las envía ya reducidas, bajo 1 MB)
const TA_SITIO_FOTO_PIXELES = 12000000;  // 12 megapíxeles: acota la memoria que usa el servidor al abrirla
const TA_SITIO_FOTO_LADO    = 1600;      // lado mayor con que se guardan
const TA_SITIO_FOTOS_DIA    = 400;       // en total, por día

/** Carpeta de las fotografías dentro de las subidas de WordPress, protegida. Vacío si no se pudo crear. */
function ta_sitio_carpeta_fotos() {
	$subidas = wp_upload_dir( null, false );
	if ( ! empty( $subidas['error'] ) ) {
		return '';
	}
	$carpeta = trailingslashit( $subidas['basedir'] ) . 'ta-solicitudes';
	if ( ! is_dir( $carpeta ) && ! wp_mkdir_p( $carpeta ) ) {
		return '';
	}
	if ( ! file_exists( $carpeta . '/.htaccess' ) ) {
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
		file_put_contents( $carpeta . '/.htaccess', "# Fotografías de solicitudes: no se entregan al público.\n<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nOrder allow,deny\nDeny from all\n</IfModule>\n" );
		file_put_contents( $carpeta . '/index.php', "<?php // Silencio.\n" ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
	}
	return $carpeta;
}

/** Ruta completa de una fotografía guardada (viene relativa a la carpeta), o vacío si no existe o no es de ahí. */
function ta_sitio_ruta_foto( $relativa ) {
	$base = ta_sitio_carpeta_fotos();
	if ( '' === $base || ! is_string( $relativa ) || ! preg_match( '#^[0-9]+-[a-z0-9]{20}/foto-[0-9]+\.(jpg|jpeg|png|webp)$#', $relativa ) ) {
		return '';
	}
	$ruta = realpath( $base . '/' . $relativa );
	$raiz = realpath( $base );
	return $ruta && $raiz && 0 === strpos( wp_normalize_path( $ruta ), wp_normalize_path( $raiz ) . '/' ) && is_file( $ruta ) ? $ruta : '';
}

/** $_FILES['fotos'] (arreglos paralelos) como lista de archivos. */
function ta_sitio_fotos_recibidas( $campo ) {
	$lista = array();
	if ( ! is_array( $campo['tmp_name'] ?? null ) ) {
		return $lista;
	}
	foreach ( $campo['tmp_name'] as $i => $temporal ) {
		$lista[] = array(
			'tmp_name' => is_string( $temporal ) ? $temporal : '',
			'error'    => isset( $campo['error'][ $i ] ) ? (int) $campo['error'][ $i ] : UPLOAD_ERR_NO_FILE,
			'size'     => isset( $campo['size'][ $i ] ) ? (int) $campo['size'][ $i ] : 0,
		);
	}
	return array_slice( $lista, 0, TA_SITIO_FOTOS_MAX );
}

/**
 * Revisa y guarda las fotografías de una solicitud. Devuelve las que quedaron, como rutas relativas a la carpeta.
 * La que no pasa una revisión se descarta en silencio: la solicitud se recibe igual.
 */
function ta_sitio_guardar_fotos( $id, $campo ) {
	$recibidas = ta_sitio_fotos_recibidas( $campo );
	$base      = $recibidas ? ta_sitio_carpeta_fotos() : '';
	if ( '' === $base ) {
		return array();
	}
	$hoy     = 'ta_fotos_' . gmdate( 'Ymd' );
	$usadas  = (int) get_transient( $hoy );
	$nombre  = (int) $id . '-' . strtolower( wp_generate_password( 20, false, false ) );
	$carpeta = $base . '/' . $nombre;
	$fotos   = array();
	foreach ( $recibidas as $f ) {
		if ( $usadas + count( $fotos ) >= TA_SITIO_FOTOS_DIA ) {
			break;
		}
		if ( UPLOAD_ERR_OK !== $f['error'] || $f['size'] <= 0 || $f['size'] > TA_SITIO_FOTO_BYTES || ! is_uploaded_file( $f['tmp_name'] ) ) {
			continue;
		}
		$info = @getimagesize( $f['tmp_name'] ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- un archivo que no es imagen devuelve false.
		if ( ! $info || ! in_array( $info[2], array( IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP ), true ) || $info[0] < 16 || $info[1] < 16 || $info[0] * $info[1] > TA_SITIO_FOTO_PIXELES ) {
			continue;
		}
		$editor = wp_get_image_editor( $f['tmp_name'], array( 'mime_type' => $info['mime'] ) );
		if ( is_wp_error( $editor ) ) {
			continue;
		}
		if ( ! is_dir( $carpeta ) && ! wp_mkdir_p( $carpeta ) ) {
			break;
		}
		if ( max( $info[0], $info[1] ) > TA_SITIO_FOTO_LADO ) {
			$editor->resize( TA_SITIO_FOTO_LADO, TA_SITIO_FOTO_LADO, false );
		}
		$editor->set_quality( 82 );
		// Imagen nueva, en JPEG: sin los datos de la cámara y sin nada que no sean píxeles.
		$hecha = $editor->save( $carpeta . '/foto-' . ( count( $fotos ) + 1 ) . '.jpg', 'image/jpeg' );
		if ( is_wp_error( $hecha ) || empty( $hecha['path'] ) || ! is_file( $hecha['path'] ) ) {
			continue;
		}
		$relativa = $nombre . '/' . basename( $hecha['path'] );
		if ( '' === ta_sitio_ruta_foto( $relativa ) ) {
			wp_delete_file( $hecha['path'] );
			continue;
		}
		$fotos[] = $relativa;
	}
	if ( $fotos ) {
		set_transient( $hoy, $usadas + count( $fotos ), DAY_IN_SECONDS );
	}
	return $fotos;
}

/** Borra la carpeta de fotografías de una solicitud cuando esta se elimina para siempre. */
add_action(
	'before_delete_post',
	static function ( $id ) {
		if ( 'ta_solicitud' !== get_post_type( $id ) ) {
			return;
		}
		$carpetas = array();
		foreach ( ta_sitio_meta_lista( $id, '_ta_fotos' ) as $relativa ) {
			$ruta = ta_sitio_ruta_foto( $relativa );
			if ( '' !== $ruta ) {
				wp_delete_file( $ruta );
				$carpetas[ dirname( $ruta ) ] = true;
			}
		}
		foreach ( array_keys( $carpetas ) as $carpeta ) {
			@rmdir( $carpeta ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged, WordPress.WP.AlternativeFunctions.file_system_operations_rmdir -- solo si quedó vacía.
		}
	}
);

/* ---------- Escritorio: verlas con la sesión iniciada ---------- */

/** Dirección para ver una fotografía de una solicitud desde el escritorio. */
function ta_sitio_url_foto( $id, $n ) {
	return wp_nonce_url( admin_url( 'admin-post.php?action=ta_sitio_foto&id=' . (int) $id . '&n=' . (int) $n ), 'ta_sitio_foto_' . (int) $id );
}

add_action(
	'admin_post_ta_sitio_foto',
	static function () {
		$id = isset( $_GET['id'] ) ? absint( $_GET['id'] ) : 0;
		$n  = isset( $_GET['n'] ) ? absint( $_GET['n'] ) : 0;
		if ( ! $id || 'ta_solicitud' !== get_post_type( $id ) || ! current_user_can( 'edit_post', $id ) ) {
			wp_die( 'No tienes permiso para ver esta fotografía.', '', array( 'response' => 403 ) );
		}
		check_admin_referer( 'ta_sitio_foto_' . $id );
		$fotos = ta_sitio_meta_lista( $id, '_ta_fotos' );
		$ruta  = ta_sitio_ruta_foto( $fotos[ $n ] ?? '' );
		if ( '' === $ruta ) {
			wp_die( 'La fotografía ya no está.', '', array( 'response' => 404 ) );
		}
		$tipos = array( 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp' );
		nocache_headers();
		header( 'Content-Type: ' . $tipos[ strtolower( pathinfo( $ruta, PATHINFO_EXTENSION ) ) ] );
		header( 'Content-Length: ' . filesize( $ruta ) );
		header( 'Content-Disposition: inline; filename="solicitud-' . $id . '-foto-' . ( $n + 1 ) . '.' . pathinfo( $ruta, PATHINFO_EXTENSION ) . '"' );
		header( 'X-Content-Type-Options: nosniff' );
		header( 'Content-Security-Policy: default-src \'none\'; img-src \'self\'; style-src \'unsafe-inline\'' );
		readfile( $ruta ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_readfile
		exit;
	}
);

add_action(
	'add_meta_boxes_ta_solicitud',
	static function ( $post ) {
		if ( get_post_meta( $post->ID, '_ta_fotos', true ) ) {
			add_meta_box( 'ta-solicitud-fotos', 'Fotografías', 'ta_sitio_caja_fotos', 'ta_solicitud', 'normal', 'high' );
		}
	},
	11
);

function ta_sitio_caja_fotos( $post ) {
	$fotos = ta_sitio_meta_lista( $post->ID, '_ta_fotos' );
	echo '<p class="description">Las adjuntó la persona al enviar la solicitud. Haz clic en una para verla completa.</p><div style="display:flex;flex-wrap:wrap;gap:10px">';
	foreach ( array_keys( $fotos ) as $n ) {
		$url = ta_sitio_url_foto( $post->ID, $n );
		echo '<a href="' . esc_url( $url ) . '" target="_blank" rel="noopener"><img src="' . esc_url( $url ) . '" alt="' . esc_attr( 'Fotografía ' . ( $n + 1 ) ) . '" loading="lazy" style="display:block;width:180px;height:135px;object-fit:cover;border:1px solid #c3c4c7;border-radius:4px"></a>';
	}
	echo '</div>';
}
