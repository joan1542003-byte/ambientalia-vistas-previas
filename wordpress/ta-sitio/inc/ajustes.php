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
			// Comunas donde hoy se coordinan retiros (cliente, 16-10-2026)
			'comunas'            => array( 'Quilicura', 'Lampa', 'Pudahuel' ),
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

/* ---------- Página de ajustes ---------- */

add_action(
	'admin_menu',
	static function () {
		add_submenu_page( 'edit.php?post_type=ta_solicitud', 'Ajustes del sitio', 'Ajustes del sitio', 'manage_options', 'ta-sitio', 'ta_sitio_pagina_ajustes' );
	}
);

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
		$pedida           = isset( $_POST['asistente'] ) ? sanitize_text_field( wp_unslash( $_POST['asistente'] ) ) : $op['asistente'];
		$op['asistente']  = ta_sitio_url_asistente( $pedida );
		$op['turnstile']  = isset( $_POST['turnstile'] ) ? substr( (string) preg_replace( '/[^A-Za-z0-9_-]/', '', sanitize_text_field( wp_unslash( $_POST['turnstile'] ) ) ), 0, 100 ) : $op['turnstile'];
		if ( ! empty( $_POST['nueva_clave'] ) || '' === $op['clave'] ) {
			$op['clave'] = wp_generate_password( 32, false, false );
		}
		update_option( 'ta_sitio', $op, false );
		ta_sitio_reglas();
		flush_rewrite_rules( true );
		// La portada y la vista previa guardadas en caché son las de antes (con la configuración y la política de antes)
		if ( $antes['modo'] !== $op['modo'] || $antes['ruta'] !== $op['ruta'] || $antes['asistente'] !== $op['asistente'] || $antes['turnstile'] !== $op['turnstile'] || $antes['imagenes'] !== $op['imagenes'] || $antes['whatsapp'] !== $op['whatsapp'] ) {
			ta_sitio_purgar();
		}
		$aviso = '' !== trim( $pedida ) && '' === $op['asistente'] ? array( 'asistente_invalido' => 1 ) : array();
		wp_safe_redirect( add_query_arg( array( 'post_type' => 'ta_solicitud', 'page' => 'ta-sitio', 'guardado' => 1 ) + $aviso, admin_url( 'edit.php' ) ) );
		exit;
	}
);

function ta_sitio_pagina_ajustes() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$op = ta_sitio_opciones();
	?>
	<div class="wrap">
		<h1>Transporte Autorizado: sitio nuevo</h1>
		<?php if ( isset( $_GET['guardado'] ) ) : // phpcs:ignore WordPress.Security.NonceVerification.Recommended ?>
			<div class="notice notice-success is-dismissible"><p>Ajustes guardados.</p></div>
		<?php endif; ?>
		<?php if ( isset( $_GET['asistente_invalido'] ) ) : // phpcs:ignore WordPress.Security.NonceVerification.Recommended ?>
			<div class="notice notice-error"><p>La dirección del asistente no se guardó: debe empezar con <code>https://</code> y no llevar consulta, fragmento ni datos de acceso. Mientras falte, el formulario de cotización no envía en línea.</p></div>
		<?php endif; ?>
		<p>El sitio nuevo vive dentro de este plugin. Mientras esté en <strong>privado</strong> solo se ve en la dirección de vista previa, con una sesión iniciada o con el enlace con clave; los buscadores no lo indexan. Al <strong>publicarlo</strong>, reemplaza la portada actual.</p>
		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
			<input type="hidden" name="action" value="ta_sitio_guardar">
			<?php wp_nonce_field( 'ta_sitio_guardar' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row">Estado</th>
					<td>
						<label><input type="radio" name="modo" value="privado" <?php checked( $op['modo'], 'privado' ); ?>> Privado (vista previa)</label><br>
						<label><input type="radio" name="modo" value="publicado" <?php checked( $op['modo'], 'publicado' ); ?>> Publicado: reemplaza la portada de <?php echo esc_html( home_url( '/' ) ); ?></label>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="ta-ruta">Dirección de la vista previa</label></th>
					<td><code><?php echo esc_html( home_url( '/' ) ); ?></code><input id="ta-ruta" name="ruta" type="text" class="regular-text" style="width:12em" value="<?php echo esc_attr( $op['ruta'] ); ?>"><code>/</code>
						<p class="description">Con tu sesión iniciada: <a href="<?php echo esc_url( ta_sitio_url_vista() ); ?>" target="_blank" rel="noopener"><?php echo esc_html( ta_sitio_url_vista() ); ?></a></p></td>
				</tr>
				<tr>
					<th scope="row">Enlace para compartir</th>
					<td><input type="text" class="large-text code" readonly value="<?php echo esc_attr( ta_sitio_url_vista( true ) ); ?>" onfocus="this.select()">
						<p class="description">Quien tenga este enlace ve la vista previa sin iniciar sesión. <label><input type="checkbox" name="nueva_clave" value="1"> Cambiar la clave (el enlace anterior deja de servir)</label></p></td>
				</tr>
				<tr>
					<th scope="row">Correos que reciben las solicitudes</th>
					<td><?php $reciben = ta_sitio_correos_destino(); $principal = ta_sitio_correo_destino(); ?>
						<table class="ta-casillas">
							<thead><tr><th>Recibe</th><th>Principal</th><th>Correo</th><th></th></tr></thead>
							<tbody>
							<?php foreach ( ta_sitio_correos_guardados() as $i => $casilla ) : ?>
								<tr>
									<td><input type="checkbox" name="correos_reciben[]" value="<?php echo esc_attr( $casilla ); ?>" aria-label="<?php echo esc_attr( "Recibe: $casilla" ); ?>" <?php checked( in_array( $casilla, $reciben, true ) ); ?>></td>
									<td><input type="radio" name="correo_principal" value="<?php echo esc_attr( $casilla ); ?>" aria-label="<?php echo esc_attr( "Principal: $casilla" ); ?>" <?php checked( $casilla, $principal ); ?>></td>
									<td><code><?php echo esc_html( $casilla ); ?></code><?php echo get_option( 'admin_email' ) === $casilla ? ' <span class="description">(administración de WordPress)</span>' : ''; ?></td>
									<td><?php if ( get_option( 'admin_email' ) !== $casilla ) : ?><label class="ta-quitar-casilla"><input type="checkbox" name="correo_quitar[]" value="<?php echo esc_attr( $casilla ); ?>"> Quitar de la lista</label><?php endif; ?></td>
								</tr>
							<?php endforeach; ?>
								<tr>
									<td><input type="checkbox" name="correo_nuevo_recibe" value="1" checked aria-label="El correo nuevo recibe"></td>
									<td><input type="radio" name="correo_principal" value="nuevo" aria-label="El correo nuevo es el principal"></td>
									<td colspan="2"><input name="correo_nuevo" type="email" class="regular-text" placeholder="Escribe otro correo para agregarlo" aria-label="Agregar otro correo"></td>
								</tr>
							</tbody>
						</table>
						<p class="description">Marca en «Recibe» todas las casillas a las que debe llegar cada solicitud (pueden ser varias). La <strong>principal</strong> es a donde llegan las respuestas de las personas y la copia de tus respuestas; siempre recibe. Para agregar una casilla, escríbela en la última fila y guarda.</p></td>
				</tr>
				<tr>
					<th scope="row"><label for="ta-remitente">Nombre con que se firman los correos</label></th>
					<td><input id="ta-remitente" name="remitente" type="text" class="regular-text" value="<?php echo esc_attr( $op['remitente'] ); ?>"></td>
				</tr>
				<tr>
					<th scope="row"><label for="ta-whatsapp">WhatsApp del sitio</label></th>
					<td><input id="ta-whatsapp" name="whatsapp" type="tel" class="regular-text code" value="<?php echo esc_attr( ta_sitio_whatsapp_texto( $op['whatsapp'] ) ); ?>" placeholder="+56 9 1234 5678">
						<p class="description">El número de todos los botones y enlaces de WhatsApp del sitio, del texto que lo muestra y del pie de los PDF. Un celular de Chile: +56 9 y ocho dígitos. Si no es válido, queda el anterior.</p></td>
				</tr>
			</table>
			<h2>Comunas que se atienden</h2>
			<p>El formulario y el asistente solo ofrecen estas comunas; si alguien escribe otra, el sitio le dice que por ahora no se atiende y le ofrece WhatsApp.</p>
			<input type="hidden" name="ta_comunas_enviado" value="1">
			<fieldset class="ta-comunas"><legend class="screen-reader-text">Comunas que se atienden</legend>
				<?php foreach ( ta_sitio_comunas_rm() as $comuna ) : ?>
					<label><input type="checkbox" name="comunas[]" value="<?php echo esc_attr( $comuna ); ?>" <?php checked( in_array( $comuna, (array) $op['comunas'], true ) ); ?>> <?php echo esc_html( $comuna ); ?></label>
				<?php endforeach; ?>
			</fieldset>

			<h2>Correos y firma</h2>
			<p>Todos los correos a las personas (confirmación, «Lista» y respuestas) llevan al final esta firma. Se envían con formato y con una versión de solo texto.</p>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="ta-firma-texto">Texto de la firma</label></th>
					<td><textarea id="ta-firma-texto" name="firma_texto" rows="4" class="large-text"><?php echo esc_textarea( $op['firma_texto'] ); ?></textarea>
						<p class="description">Una línea por renglón. Las direcciones web quedan como enlace.</p></td>
				</tr>
				<tr>
					<th scope="row">Imagen de la firma</th>
					<td><div class="ta-firma-imagen" data-ta-firma>
							<input type="hidden" name="firma_imagen" value="<?php echo esc_attr( (int) $op['firma_imagen'] ); ?>" data-ta-firma-id>
							<div class="ta-firma-vista" data-ta-firma-vista><?php echo $op['firma_imagen'] ? wp_get_attachment_image( (int) $op['firma_imagen'], 'medium' ) : ''; ?></div>
							<button type="button" class="button" data-ta-firma-elegir><?php echo $op['firma_imagen'] ? 'Cambiar imagen' : 'Subir o elegir imagen'; ?></button>
							<button type="button" class="button-link button-link-delete" data-ta-firma-quitar <?php echo $op['firma_imagen'] ? '' : 'hidden'; ?>>Quitar</button>
						</div>
						<p class="description">PNG o JPG (por ejemplo, el logo con tus datos de contacto). <label>Ancho en el correo: <input type="number" name="firma_ancho" min="60" max="560" step="10" value="<?php echo esc_attr( (int) $op['firma_ancho'] ); ?>" style="width:6em"> px</label></p></td>
				</tr>
				<tr>
					<th scope="row"><label for="ta-plantillas">Respuestas rápidas</label></th>
					<td><textarea id="ta-plantillas" name="plantillas" rows="10" class="large-text code"><?php echo esc_textarea( $op['plantillas'] ); ?></textarea>
						<p class="description">Aparecen al responder una solicitud. Sepáralas con una línea <code>---</code>; la primera línea de cada una es su nombre. <code>{nombre}</code>, <code>{empresa}</code> y <code>{numero}</code> se completan con los datos de la solicitud.</p></td>
				</tr>
				<tr>
					<th scope="row">Copia de las respuestas</th>
					<td><label><input type="checkbox" name="copia_respuestas" value="1" <?php checked( $op['copia_respuestas'] ); ?>> Enviar una copia oculta de cada respuesta a <?php echo esc_html( ta_sitio_correo_destino() ); ?></label></td>
				</tr>
				<tr>
					<th scope="row">Vista previa</th>
					<td><a class="button" href="<?php echo esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=ta_sitio_vista_correo' ), 'ta_sitio_vista_correo' ) ); ?>" target="_blank" rel="noopener">Ver cómo se ve un correo</a>
						<p class="description">Muestra la firma guardada; guarda los ajustes antes de mirarla.</p></td>
				</tr>
			</table>

			<h2>Imágenes del sitio</h2>
			<p>Cualquier imagen del sitio se puede cambiar por una de la biblioteca de medios: portadas, servicios, otras secciones, las miniaturas de cada residuo, el logo, el ícono de la pestaña y la imagen que se ve al compartir el enlace. Las del hero para cada opción se ven en escritorio, al pasar el mouse por la opción. Usa imágenes livianas (WebP o JPG de menos de 400 KB) con la misma forma que la original; «Volver a la del sitio» deja la original.</p>
			<input type="hidden" name="ta_imagenes_enviado" value="1">
			<table class="form-table" role="presentation">
				<?php ta_sitio_imagenes_filas(); ?>
			</table>
			<h2>Cotizaciones de Transporte</h2>
			<p>El formulario de cotización envía cada solicitud, con sus fotografías, al asistente de Transporte Autorizado (servicio aparte), que la registra en Odoo y le da su número. WordPress no la recibe ni la guarda en «Solicitudes». El asistente de retiro lleva al mismo formulario. Sin dirección, el formulario avisa que el envío en línea no está disponible.</p>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="ta-asistente">Dirección del asistente</label></th>
					<td><input id="ta-asistente" name="asistente" type="url" class="regular-text code" value="<?php echo esc_attr( $op['asistente'] ); ?>" placeholder="https://asistente.transporteautorizado.cl">
						<p class="description">Con <code>https://</code>, la de esta instalación (pruebas o producción). Las páginas la pueden llamar (se agrega a su política de contenido). En el asistente, <code>CHAT_ALLOWED_ORIGINS</code> debe incluir <code><?php echo esc_html( ta_sitio_origen( home_url( '/' ) ) ); ?></code>.</p></td>
				</tr>
				<tr>
					<th scope="row"><label for="ta-turnstile">Clave pública de Turnstile</label></th>
					<td><input id="ta-turnstile" name="turnstile" type="text" class="regular-text code" value="<?php echo esc_attr( $op['turnstile'] ); ?>" autocomplete="off">
						<p class="description">Opcional: solo si el asistente tiene la clave secreta del mismo widget de Cloudflare. La clave secreta nunca va aquí.</p></td>
				</tr>
			</table>
			<h2>Protección del formulario</h2>
			<p>Cada solicitud pasa por un permiso de un solo uso, un campo trampa y límites por visita, por correo, por hora y por día; las fotografías se revisan y se vuelven a generar antes de guardarlas. Además se rechaza lo siguiente:</p>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="ta-correos-bloqueados">Correos que no se aceptan</label></th>
					<td><textarea id="ta-correos-bloqueados" name="correos_bloqueados" rows="2" class="large-text code"><?php echo esc_textarea( $op['correos_bloqueados'] ); ?></textarea>
						<p class="description">Separados por espacios. Sin punto es una terminación (<code>ru</code> rechaza todo correo que termine en <code>.ru</code>); con punto, un dominio (<code>yandex.com</code>). Por defecto: Rusia, Francia y Alemania, con sus proveedores más usados.</p></td>
				</tr>
				<tr>
					<th scope="row"><label for="ta-paises-bloqueados">Países que no se aceptan</label></th>
					<td><input id="ta-paises-bloqueados" name="paises_bloqueados" type="text" class="regular-text code" value="<?php echo esc_attr( $op['paises_bloqueados'] ); ?>">
						<p class="description">Códigos de dos letras (<code>RU FR DE</code>).
							<?php if ( '' !== ta_sitio_pais() ) : ?>
								El servidor informa el país de cada visita: la tuya llega desde <code><?php echo esc_html( ta_sitio_pais() ); ?></code>.
							<?php else : ?>
								<strong>Este servidor no informa el país de las visitas, así que por ahora esta lista no se aplica.</strong> El bloqueo por correo y los demás controles sí.
							<?php endif; ?>
						</p></td>
				</tr>
				<tr>
					<th scope="row">Tu visita, según el servidor</th>
					<td><?php $ips = ta_sitio_ips(); ?>
						<code><?php echo esc_html( $ips['visita'] ); ?></code><?php echo $ips['visita'] !== $ips['servidor'] ? ' (red del proveedor: <code>' . esc_html( $ips['servidor'] ) . '</code>)' : ''; ?>
						<p class="description">Con esta dirección se cuentan los envíos por visita. Debería ser la de tu conexión a internet.</p></td>
				</tr>
			</table>
			<?php submit_button( 'Guardar ajustes' ); ?>
		</form>
	</div>
	<?php
}
