<?php
/**
 * Ajustes del plugin: modo (privado o publicado), dirección de la vista privada, clave para compartirla, correo
 * que recibe las solicitudes y lo que el formulario rechaza (dominios de correo y países).
 */

defined( 'ABSPATH' ) || exit;

/** Opciones con sus valores por defecto. */
function ta_sitio_opciones() {
	$guardadas = get_option( 'ta_sitio', array() );
	return wp_parse_args(
		is_array( $guardadas ) ? $guardadas : array(),
		array(
			'modo'           => 'privado',  // privado: solo en la dirección de vista previa; publicado: en la portada.
			'ruta'           => 'nuevo',    // dirección de la vista privada: /nuevo/
			'clave'          => '',         // permite ver la vista privada sin iniciar sesión (enlace para compartir).
			'correo_destino' => '',         // quién recibe las solicitudes; vacío = correo de administración del sitio.
			'remitente'      => 'Transporte Autorizado',
			// Correos que el formulario no acepta: terminaciones («ru») o dominios completos («yandex.com»).
			'correos_bloqueados' => 'ru su xn--p1ai fr de yandex.com gmx.net gmx.com laposte.net',
			// Países desde los que no se aceptan solicitudes (códigos de dos letras); solo si el servidor informa el país.
			'paises_bloqueados'  => 'RU FR DE',
		)
	);
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
		$mail  = isset( $_POST['correo_destino'] ) ? sanitize_email( wp_unslash( $_POST['correo_destino'] ) ) : '';
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
		if ( ! empty( $_POST['nueva_clave'] ) || '' === $op['clave'] ) {
			$op['clave'] = wp_generate_password( 32, false, false );
		}
		update_option( 'ta_sitio', $op, false );
		ta_sitio_reglas();
		flush_rewrite_rules( true );
		if ( $antes['modo'] !== $op['modo'] || $antes['ruta'] !== $op['ruta'] ) {
			ta_sitio_purgar();  // la portada y la vista previa guardadas en caché son las de antes
		}
		wp_safe_redirect( add_query_arg( array( 'post_type' => 'ta_solicitud', 'page' => 'ta-sitio', 'guardado' => 1 ), admin_url( 'edit.php' ) ) );
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
					<th scope="row"><label for="ta-correo">Correo que recibe las solicitudes</label></th>
					<td><input id="ta-correo" name="correo_destino" type="email" class="regular-text" value="<?php echo esc_attr( $op['correo_destino'] ); ?>" placeholder="<?php echo esc_attr( get_option( 'admin_email' ) ); ?>">
						<p class="description">Si queda vacío, llegan al correo de administración del sitio (<?php echo esc_html( get_option( 'admin_email' ) ); ?>). La persona que envía la solicitud responde a esta dirección.</p></td>
				</tr>
				<tr>
					<th scope="row"><label for="ta-remitente">Nombre con que se firman los correos</label></th>
					<td><input id="ta-remitente" name="remitente" type="text" class="regular-text" value="<?php echo esc_attr( $op['remitente'] ); ?>"></td>
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
