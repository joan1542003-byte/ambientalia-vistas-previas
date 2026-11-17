<?php
/**
 * Panel del sitio en el escritorio de WordPress (17-11-2026): el «comando central» de Transporte Autorizado.
 *
 * Un menú propio, «Transporte Autorizado», con:
 * - Resumen: el estado de todo en una mirada (publicación, buscadores, cotizaciones, contacto, retiros, imágenes y
 *   solicitudes), cada tarjeta con su atajo a la pestaña que lo cambia.
 * - Solicitudes: la lista de siempre (inc/gestor.php).
 * - Ajustes: un solo formulario repartido en pestañas (Sitio, Contacto, Retiros, Imágenes, Correos a clientes, Buscadores
 *   y SEO, Cotizaciones y chat, Seguridad). Las pestañas solo muestran u ocultan: se guarda todo junto, como antes
 *   (el guardado está en inc/ajustes.php). Sin JavaScript se ven todas las secciones, una debajo de otra.
 */

defined( 'ABSPATH' ) || exit;

/** Pestañas de los ajustes: [clave => [rótulo, dashicon]]. */
function ta_sitio_pestanas() {
	return array(
		'sitio'        => array( 'Sitio', 'admin-site-alt3' ),
		'contacto'     => array( 'Contacto', 'phone' ),
		'retiros'      => array( 'Retiros', 'calendar-alt' ),
		'imagenes'     => array( 'Imágenes', 'format-image' ),
		'correos'      => array( 'Correos a clientes', 'email-alt' ),
		'buscadores'   => array( 'Buscadores y SEO', 'search' ),
		'cotizaciones' => array( 'Cotizaciones y chat', 'format-chat' ),
		'seguridad'    => array( 'Seguridad', 'shield' ),
	);
}

/** Dirección de una pestaña de los ajustes. */
function ta_sitio_url_ajustes( $pestana = '' ) {
	return add_query_arg( array_filter( array( 'page' => 'ta-sitio-ajustes', 'pestana' => $pestana ) ), admin_url( 'admin.php' ) );
}

/** Ícono del menú: el camión de la marca (Lucide «truck»), en blanco para que WordPress lo pinte con su color. */
function ta_sitio_icono_menu() {
	$svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#a7aaad" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>';
	return 'data:image/svg+xml;base64,' . base64_encode( $svg ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode
}

/* «Solicitudes» pasa al menú «Transporte Autorizado»: se cambia al registrarse, sin tocar inc/solicitudes.php */
add_filter(
	'register_post_type_args',
	static function ( $args, $tipo ) {
		if ( 'ta_solicitud' !== $tipo ) {
			return $args;
		}
		$args['show_in_menu']        = 'ta-sitio';
		$args['labels']['all_items'] = 'Solicitudes';  // el rótulo dentro del menú
		return $args;
	},
	10,
	2
);

add_action(
	'admin_menu',
	static function () {
		add_menu_page( 'Transporte Autorizado', 'Transporte Autorizado', 'edit_pages', 'ta-sitio', 'ta_sitio_pagina_resumen', ta_sitio_icono_menu(), 3 );
		add_submenu_page( 'ta-sitio', 'Resumen del sitio', 'Resumen', 'edit_pages', 'ta-sitio', 'ta_sitio_pagina_resumen', 0 );
		// «Solicitudes» (el tipo de contenido, show_in_menu = ta-sitio) se agrega solo, entre Resumen y Ajustes
		add_submenu_page( 'ta-sitio', 'Ajustes del sitio', 'Ajustes', 'manage_options', 'ta-sitio-ajustes', 'ta_sitio_pagina_ajustes', 20 );
	}
);

/* La dirección anterior de los ajustes (debajo de «Solicitudes») lleva a la nueva */
add_action(
	'admin_init',
	static function () {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		if ( isset( $_GET['page'], $_GET['post_type'] ) && 'ta-sitio' === $_GET['page'] && 'ta_solicitud' === $_GET['post_type'] ) {
			wp_safe_redirect( ta_sitio_url_ajustes() );
			exit;
		}
	}
);

/* Vaciar la caché de páginas a mano (LiteSpeed y otras), desde el resumen */
add_action(
	'admin_post_ta_sitio_vaciar',
	static function () {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( 'No tienes permiso para hacer esto.' );
		}
		check_admin_referer( 'ta_sitio_vaciar' );
		ta_sitio_purgar();
		wp_safe_redirect( add_query_arg( array( 'page' => 'ta-sitio', 'vaciada' => 1 ), admin_url( 'admin.php' ) ) );
		exit;
	}
);

/** Cabecera común: título, estado del sitio y atajos. */
function ta_sitio_cabecera( $titulo ) {
	$op        = ta_sitio_opciones();
	$publicado = 'publicado' === $op['modo'];
	?>
	<header class="ta-cab">
		<div class="ta-cab-titulo">
			<h1><?php echo esc_html( $titulo ); ?></h1>
			<span class="ta-pill <?php echo $publicado ? 'is-ok' : 'is-off'; ?>"><?php echo $publicado ? 'Publicado' : 'Privado'; ?></span>
		</div>
		<div class="ta-cab-acciones">
			<a class="button" href="<?php echo esc_url( $publicado ? home_url( '/' ) : ta_sitio_url_vista() ); ?>" target="_blank" rel="noopener"><span class="dashicons dashicons-external" aria-hidden="true"></span> Ver el sitio</a>
		</div>
	</header>
	<?php
}

/* ---------- Resumen ---------- */

/** Una tarjeta del resumen. $filas: [[rótulo, valor HTML]]; $estado: ok | aviso | off. */
function ta_sitio_tarjeta( $icono, $titulo, $estado, $texto_estado, array $filas, $pestana, $extra = '' ) {
	?>
	<section class="ta-tarjeta">
		<header>
			<span class="ta-tarjeta-icono dashicons dashicons-<?php echo esc_attr( $icono ); ?>" aria-hidden="true"></span>
			<h2><?php echo esc_html( $titulo ); ?></h2>
			<span class="ta-pill is-<?php echo esc_attr( $estado ); ?>"><?php echo esc_html( $texto_estado ); ?></span>
		</header>
		<dl>
			<?php foreach ( $filas as $f ) : ?>
				<div><dt><?php echo esc_html( $f[0] ); ?></dt><dd><?php echo wp_kses_post( $f[1] ); ?></dd></div>
			<?php endforeach; ?>
		</dl>
		<?php echo $extra; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- HTML armado aquí con valores escapados. ?>
		<?php if ( $pestana && current_user_can( 'manage_options' ) ) : ?>
			<a class="ta-tarjeta-editar" href="<?php echo esc_url( ta_sitio_url_ajustes( $pestana ) ); ?>">Cambiar <span aria-hidden="true">→</span></a>
		<?php endif; ?>
	</section>
	<?php
}

function ta_sitio_pagina_resumen() {
	if ( ! current_user_can( 'edit_pages' ) ) {
		return;
	}
	$op        = ta_sitio_opciones();
	$publicado = 'publicado' === $op['modo'];
	$buscador  = ta_sitio_buscadores_estado();
	$listos    = count( array_filter( array_slice( $buscador, 0, 4 ), static fn( $b ) => $b[1] ) );
	$conteo    = ta_sitio_conteo_estados();
	$imagenes  = count( ta_sitio_imagenes_elegidas() );
	$espacios  = count( ta_sitio_imagenes_espacios() );
	$paginas   = count( ta_sitio_paginas() );
	$h         = ta_sitio_horario();
	?>
	<div class="wrap ta-app">
		<?php ta_sitio_cabecera( 'Transporte Autorizado' ); ?>
		<?php if ( isset( $_GET['vaciada'] ) ) : // phpcs:ignore WordPress.Security.NonceVerification.Recommended ?>
			<div class="notice notice-success is-dismissible"><p>Caché vaciada: las próximas visitas ven la versión actual del sitio.</p></div>
		<?php endif; ?>
		<p class="ta-bajada">Todo el sitio en una mirada. Cada tarjeta lleva a la pestaña de «Ajustes» donde se cambia.</p>
		<div class="ta-tarjetas">
			<?php
			ta_sitio_tarjeta(
				'admin-site-alt3', 'Sitio', $publicado ? 'ok' : 'off', $publicado ? 'Publicado' : 'Privado',
				array(
					array( 'Dirección', '<a href="' . esc_url( $publicado ? home_url( '/' ) : ta_sitio_url_vista() ) . '" target="_blank" rel="noopener">' . esc_html( $publicado ? home_url( '/' ) : ta_sitio_url_vista() ) . '</a>' ),
					array( 'Páginas', esc_html( $paginas . ' (portada, guías, checklists, normativa y legales)' ) ),
					array( 'Sitios relacionados', esc_html( implode( ', ', array_map( static fn( $r ) => $r['nombre'] . ( $r['activo'] ? '' : ' (oculto)' ), ta_sitio_relacionados() ) ) ) ),
					array( 'Versión del plugin', esc_html( TA_SITIO_VERSION ) ),
				),
				'sitio',
				current_user_can( 'manage_options' ) ? '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" class="ta-tarjeta-form"><input type="hidden" name="action" value="ta_sitio_vaciar">' . wp_nonce_field( 'ta_sitio_vaciar', '_wpnonce', true, false ) . '<button type="submit" class="button button-small">Vaciar caché</button> <span class="ta-gris">tras subir imágenes o cambiar algo que no se ve</span></form>' : ''
			);
			ta_sitio_tarjeta(
				'search', 'Buscadores y SEO', 4 === $listos ? 'ok' : 'aviso', 4 === $listos ? 'Listo para Google' : ( 4 - $listos ) . ' pendiente' . ( 3 === $listos ? '' : 's' ),
				array_map(
					static fn( $b ) => array( $b[0], ( $b[1] ? '<span class="ta-si">Sí</span> ' : '<span class="ta-no">No</span> ' ) . esc_html( $b[2] ) ),
					$buscador
				),
				'buscadores'
			);
			ta_sitio_tarjeta(
				'format-chat', 'Cotizaciones y chat', '' !== $op['asistente'] ? 'ok' : 'aviso', '' !== $op['asistente'] ? 'Conectado' : 'Sin asistente',
				array(
					array( 'Asistente', '' !== $op['asistente'] ? '<code>' . esc_html( $op['asistente'] ) . '</code>' : 'Sin dirección: el formulario no envía en línea y ofrece WhatsApp.' ),
					array( 'Protección (Turnstile)', '' !== $op['turnstile'] ? 'Activa' : 'Sin clave (opcional)' ),
				),
				'cotizaciones'
			);
			ta_sitio_tarjeta(
				'phone', 'Contacto', 'ok', 'Al día',
				array(
					array( 'WhatsApp', esc_html( ta_sitio_whatsapp_texto( $op['whatsapp'] ) ) ),
					array( 'Correo principal', '<code>' . esc_html( ta_sitio_correo_destino() ) . '</code>' ),
					array( 'Casillas que reciben', esc_html( (string) count( ta_sitio_correos_destino() ) ) ),
				),
				'contacto'
			);
			ta_sitio_tarjeta(
				'calendar-alt', 'Retiros', 'ok', count( ta_sitio_comunas() ) . ' comuna' . ( 1 === count( ta_sitio_comunas() ) ? '' : 's' ),
				array(
					array( 'Comunas', esc_html( ta_sitio_cobertura_texto() ) ),
					array( 'Horario', esc_html( ucfirst( ta_sitio_horario_texto() ) ) ),
					array( 'Anticipación', 'Programado y Espera y ahorra, desde pasado mañana; Express, dentro de 24 horas hábiles.' ),
				),
				'retiros'
			);
			ta_sitio_tarjeta(
				'format-image', 'Imágenes', $imagenes ? 'ok' : 'off', $imagenes ? $imagenes . ' cambiada' . ( 1 === $imagenes ? '' : 's' ) : 'Las del sitio',
				array( array( 'Espacios', esc_html( $espacios . ' imágenes que se pueden cambiar (portada, servicios, residuos, logo, ícono y al compartir)' ) ) ),
				'imagenes'
			);
			$base = admin_url( 'edit.php?post_type=ta_solicitud' );
			ta_sitio_tarjeta(
				'clipboard', 'Solicitudes', $conteo['nueva'] ? 'aviso' : 'ok', $conteo['nueva'] ? $conteo['nueva'] . ' nueva' . ( 1 === $conteo['nueva'] ? '' : 's' ) : 'Al día',
				array_map(
					static fn( $estado, $n ) => array( TA_SITIO_ESTADOS[ $estado ], '<a href="' . esc_url( add_query_arg( 'ta_estado', $estado, $base ) ) . '">' . (int) $n . '</a>' ),
					array_keys( $conteo ),
					$conteo
				),
				'',
				'<p class="ta-gris">Las cotizaciones del formulario van al asistente (y a Odoo); aquí llegan las que pasan por WordPress.</p><a class="ta-tarjeta-editar" href="' . esc_url( $base ) . '">Ver solicitudes <span aria-hidden="true">→</span></a>'
			);
			?>
		</div>
	</div>
	<?php
}

/* ---------- Ajustes ---------- */

/** Abre una sección de los ajustes (pestaña). */
function ta_sitio_panel_abrir( $clave, $bajada = '' ) {
	$p = ta_sitio_pestanas()[ $clave ];
	echo '<section class="ta-panel" id="ta-panel-' . esc_attr( $clave ) . '" role="tabpanel" aria-labelledby="ta-tab-' . esc_attr( $clave ) . '" tabindex="-1">';
	echo '<h2><span class="dashicons dashicons-' . esc_attr( $p[1] ) . '" aria-hidden="true"></span>' . esc_html( $p[0] ) . '</h2>';
	if ( '' !== $bajada ) {
		echo '<p class="ta-bajada">' . wp_kses_post( $bajada ) . '</p>';
	}
}

function ta_sitio_pagina_ajustes() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$op      = ta_sitio_opciones();
	$pestana = isset( $_GET['pestana'] ) ? sanitize_key( wp_unslash( $_GET['pestana'] ) ) : 'sitio'; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	$pestana = isset( ta_sitio_pestanas()[ $pestana ] ) ? $pestana : 'sitio';
	$v       = ta_sitio_verificacion();
	?>
	<div class="wrap ta-app">
		<?php ta_sitio_cabecera( 'Ajustes del sitio' ); ?>
		<?php // phpcs:disable WordPress.Security.NonceVerification.Recommended ?>
		<?php if ( isset( $_GET['guardado'] ) ) : ?>
			<div class="notice notice-success is-dismissible"><p>Ajustes guardados.</p></div>
		<?php endif; ?>
		<?php if ( isset( $_GET['asistente_invalido'] ) ) : ?>
			<div class="notice notice-error"><p>La dirección del asistente no se guardó: debe empezar con <code>https://</code> y no llevar consulta, fragmento ni datos de acceso. Mientras falte, el formulario de cotización no envía en línea.</p></div>
		<?php endif; ?>
		<?php if ( isset( $_GET['horario_invalido'] ) ) : ?>
			<div class="notice notice-error"><p>Las horas del horario de retiro no se guardaron: la tarde debe empezar después de la mañana y la jornada terminar después de la tarde. Se mantienen las anteriores; las opciones marcadas sí se guardaron.</p></div>
		<?php endif; ?>
		<?php if ( isset( $_GET['relacionado_invalido'] ) ) : ?>
			<div class="notice notice-error"><p>Un enlace de los sitios relacionados no se guardó: debe ser una dirección completa, como <code>https://hds.cl</code>. Se mantiene el anterior.</p></div>
		<?php endif; ?>
		<?php if ( isset( $_GET['verificacion'] ) ) : ?>
			<div class="notice notice-error"><p><?php echo 'archivo' === $_GET['verificacion'] ? 'El archivo de verificación no se subió: debe ser el que descargas de Google (<code>google….html</code>) o de Bing (<code>BingSiteAuth.xml</code>), sin cambiarle el nombre ni el contenido.' : 'Un código de verificación no se guardó: pega la etiqueta completa que te da Google o Bing, o solo lo que va entre las comillas de <code>content="…"</code>.'; ?></p></div>
		<?php endif; ?>
		<?php // phpcs:enable ?>

		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" enctype="multipart/form-data" class="ta-ajustes" data-ta-pestanas>
			<input type="hidden" name="action" value="ta_sitio_guardar">
			<input type="hidden" name="pestana" value="<?php echo esc_attr( $pestana ); ?>" data-ta-pestana-actual>
			<?php wp_nonce_field( 'ta_sitio_guardar' ); ?>

			<nav class="ta-pestanas" role="tablist" aria-label="Secciones de los ajustes" aria-orientation="vertical">
				<?php foreach ( ta_sitio_pestanas() as $clave => $p ) : ?>
					<button type="button" role="tab" id="ta-tab-<?php echo esc_attr( $clave ); ?>" aria-controls="ta-panel-<?php echo esc_attr( $clave ); ?>" aria-selected="<?php echo $clave === $pestana ? 'true' : 'false'; ?>" data-ta-pestana="<?php echo esc_attr( $clave ); ?>"><span class="dashicons dashicons-<?php echo esc_attr( $p[1] ); ?>" aria-hidden="true"></span><?php echo esc_html( $p[0] ); ?></button>
				<?php endforeach; ?>
			</nav>

			<div class="ta-paneles">
				<?php ta_sitio_panel_abrir( 'sitio', 'El sitio nuevo vive dentro de este plugin. En <strong>privado</strong> solo se ve en la dirección de vista previa, con una sesión iniciada o con el enlace con clave, y los buscadores no lo ven. <strong>Publicado</strong>, reemplaza la portada del dominio.' ); ?>
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
				</table>
				<h3>Sitios relacionados</h3>
				<p class="description">Las tarjetas de «Servicios relacionados» de la portada, la columna «Sitios relacionados» del pie y llms.txt. Apagado, el sitio deja de mostrarse en los tres; sin ninguno, la sección muestra solo «¿Eres gestor o transportista autorizado?». El enlace vacío vuelve al de siempre.</p>
				<input type="hidden" name="ta_relacionados_enviado" value="1">
				<table class="form-table ta-relacionados" role="presentation">
					<?php foreach ( ta_sitio_relacionados() as $clave => $r ) : ?>
						<tr>
							<th scope="row"><?php echo esc_html( $r['nombre'] ); ?></th>
							<td>
								<label class="ta-interruptor"><input type="checkbox" name="relacionado_activo_<?php echo esc_attr( $clave ); ?>" value="1" <?php checked( $r['activo'] ); ?>> Mostrar en el sitio</label>
								<label class="ta-relacionado-url"><span class="screen-reader-text">Enlace de <?php echo esc_html( $r['nombre'] ); ?></span><input type="url" name="relacionado_url_<?php echo esc_attr( $clave ); ?>" class="regular-text code" value="<?php echo esc_attr( $r['url'] ); ?>" placeholder="<?php echo esc_attr( ta_sitio_relacionados_base()[ $clave ][1] ); ?>"></label>
							</td>
						</tr>
					<?php endforeach; ?>
				</table>
				</section>

				<?php ta_sitio_panel_abrir( 'contacto', 'Cómo te encuentran y a dónde llegan las solicitudes.' ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><label for="ta-whatsapp">WhatsApp del sitio</label></th>
						<td><input id="ta-whatsapp" name="whatsapp" type="tel" class="regular-text code" value="<?php echo esc_attr( ta_sitio_whatsapp_texto( $op['whatsapp'] ) ); ?>" placeholder="+56 9 1234 5678">
							<p class="description">El número de todos los botones y enlaces de WhatsApp del sitio, del texto que lo muestra y del pie de los PDF. Un celular de Chile: +56 9 y ocho dígitos. Si no es válido, queda el anterior.</p></td>
					</tr>
					<tr>
						<th scope="row">Correos que reciben las solicitudes</th>
						<td><?php $reciben = ta_sitio_correos_destino(); $principal = ta_sitio_correo_destino(); ?>
							<table class="ta-casillas">
								<thead><tr><th>Recibe</th><th>Principal</th><th>Correo</th><th></th></tr></thead>
								<tbody>
								<?php foreach ( ta_sitio_correos_guardados() as $casilla ) : ?>
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
				</table>
				</section>

				<?php ta_sitio_panel_abrir( 'retiros', 'Dónde y cuándo se retira. Lo usan el formulario de cotización, el asistente de retiro, <code>llms.txt</code> y la habilidad para agentes de IA.' ); ?>
				<h3>Comunas que se atienden</h3>
				<p class="description">El formulario y el asistente solo ofrecen estas comunas; si alguien escribe otra, el sitio le dice que por ahora no se atiende y le ofrece WhatsApp. Con hasta cinco marcadas, los avisos las nombran («Por ahora atendemos Lampa, Pudahuel y Quilicura»); con más, dicen cuántas son.</p>
				<input type="hidden" name="ta_comunas_enviado" value="1">
				<fieldset class="ta-comunas"><legend class="screen-reader-text">Comunas que se atienden</legend>
					<?php foreach ( ta_sitio_comunas_rm() as $comuna ) : ?>
						<label><input type="checkbox" name="comunas[]" value="<?php echo esc_attr( $comuna ); ?>" <?php checked( in_array( $comuna, (array) $op['comunas'], true ) ); ?>> <?php echo esc_html( $comuna ); ?></label>
					<?php endforeach; ?>
				</fieldset>
				<h3>Horario de retiro</h3>
				<p class="description">Las opciones de «Horario» del formulario y del asistente. «Cualquier horario» (la hora la definen ustedes) aparece siempre.</p>
				<input type="hidden" name="ta_horario_enviado" value="1">
				<?php
				$horario = ta_sitio_horario();
				$horas   = static function ( $nombre, $elegida ) {
					echo '<select name="' . esc_attr( $nombre ) . '">';
					foreach ( range( 5, 23 ) as $hora ) {
						echo '<option value="' . esc_attr( $hora ) . '"' . selected( $hora, $elegida, false ) . '>' . esc_html( $hora . ':00' ) . '</option>';
					}
					echo '</select>';
				};
				?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row">Horas</th>
						<td>
							<label>La mañana empieza a las <?php $horas( 'horario_inicio', $horario['inicio'] ); ?></label>,
							<label>la tarde empieza a las <?php $horas( 'horario_corte', $horario['corte'] ); ?></label>
							<label>y la jornada termina a las <?php $horas( 'horario_fin', $horario['fin'] ); ?></label>
							<p class="description">Hoy se ofrecen «Mañana (<?php echo esc_html( $horario['inicio'] . ':00 a ' . $horario['corte'] . ':00' ); ?>)» y «Tarde (<?php echo esc_html( $horario['corte'] . ':00 a ' . $horario['fin'] . ':00' ); ?>)». Cada hora debe ser posterior a la anterior.</p>
						</td>
					</tr>
					<tr>
						<th scope="row">Opciones que se ofrecen</th>
						<td>
							<label><input type="checkbox" name="horario_manana" value="1" <?php checked( $horario['manana'] ); ?>> Mañana</label><br>
							<label><input type="checkbox" name="horario_tarde" value="1" <?php checked( $horario['tarde'] ); ?>> Tarde</label><br>
							<label><input type="checkbox" name="horario_vespertino" value="1" <?php checked( $horario['vespertino'] ); ?>> Vespertino (de noche, sujeto a confirmación)</label>
							<p class="description">Una opción desmarcada deja de aparecer en el formulario y en el asistente. Las solicitudes ya enviadas no cambian.</p>
						</td>
					</tr>
				</table>
				</section>

				<?php ta_sitio_panel_abrir( 'imagenes', 'Cualquier imagen del sitio se puede cambiar por una de la biblioteca de medios: portada, opciones del hero, servicios, otros sitios, las miniaturas de cada residuo, el logo, el ícono de la pestaña y la imagen al compartir el enlace. Usa imágenes con la misma forma que la original; WordPress genera solo las medidas más livianas. «Volver a la del sitio» deja la original.' ); ?>
				<input type="hidden" name="ta_imagenes_enviado" value="1">
				<table class="form-table ta-imagenes" role="presentation">
					<?php ta_sitio_imagenes_filas(); ?>
				</table>
				</section>

				<?php ta_sitio_panel_abrir( 'correos', 'Todos los correos a las personas (confirmación, «Lista» y respuestas) llevan al final esta firma. Se envían con formato y con una versión de solo texto.' ); ?>
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
				</section>

				<?php ta_sitio_panel_abrir( 'buscadores', 'Para que Google (y Bing) indexen el sitio: el sitio debe estar publicado y verificado como tuyo en sus herramientas para webmasters. Nada de esto cambia cómo se ve el sitio ni su puntaje.' ); ?>
				<ul class="ta-lista-estado">
					<?php foreach ( ta_sitio_buscadores_estado() as $b ) : ?>
						<li class="<?php echo $b[1] ? 'is-ok' : 'is-falta'; ?>"><span class="dashicons dashicons-<?php echo $b[1] ? 'yes-alt' : 'marker'; ?>" aria-hidden="true"></span><strong><?php echo esc_html( $b[0] ); ?></strong> <span class="ta-gris"><?php echo esc_html( $b[2] ); ?></span></li>
					<?php endforeach; ?>
				</ul>
				<input type="hidden" name="ta_buscadores_enviado" value="1">
				<h3>Verificar el sitio en Google Search Console</h3>
				<ol class="ta-pasos">
					<li>Entra a <a href="https://search.google.com/search-console" target="_blank" rel="noopener">Google Search Console</a> y agrega una propiedad de tipo <strong>«Prefijo de la URL»</strong> con <code><?php echo esc_html( home_url( '/' ) ); ?></code>.</li>
					<li>Elige <strong>«Archivo HTML»</strong>, descárgalo y súbelo aquí abajo (o elige <strong>«Etiqueta HTML»</strong> y pégala), y guarda.</li>
					<li>Vuelve a Search Console y toca <strong>«Verificar»</strong>. No borres el archivo ni la etiqueta después: Google los revisa de vez en cuando.</li>
					<li>En <strong>«Sitemaps»</strong>, agrega <code>sitemap-sitio.xml</code>. Para ver una página en Google antes, usa <strong>«Inspección de URLs» → «Solicitar indexación»</strong>.</li>
				</ol>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><label for="ta-verificacion-archivo">Archivo de verificación</label></th>
						<td><input id="ta-verificacion-archivo" name="verificacion_archivo" type="file" accept=".html,.xml,text/html,application/xml">
							<p class="description">El de Google (<code>google….html</code>) o el de Bing (<code>BingSiteAuth.xml</code>), tal como lo descargas. Queda en <code><?php echo esc_html( home_url( '/' ) ); ?>nombre-del-archivo</code>.</p>
							<?php if ( $v['archivos'] ) : ?>
								<ul class="ta-archivos">
									<?php foreach ( array_keys( $v['archivos'] ) as $nombre ) : ?>
										<li><a href="<?php echo esc_url( home_url( '/' . $nombre ) ); ?>" target="_blank" rel="noopener"><code><?php echo esc_html( $nombre ); ?></code></a> <label class="ta-quitar-casilla"><input type="checkbox" name="verificacion_quitar[]" value="<?php echo esc_attr( $nombre ); ?>"> Quitar</label></li>
									<?php endforeach; ?>
								</ul>
							<?php endif; ?>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="ta-verificacion-google">Etiqueta de Google</label></th>
						<td><input id="ta-verificacion-google" name="verificacion_google" type="text" class="large-text code" value="<?php echo esc_attr( $v['google'] ); ?>" placeholder='&lt;meta name="google-site-verification" content="…" /&gt;' autocomplete="off">
							<p class="description">En vez del archivo: pega la etiqueta completa o solo su código. Va en el <code>&lt;head&gt;</code> de la portada.</p></td>
					</tr>
					<tr>
						<th scope="row"><label for="ta-verificacion-bing">Etiqueta de Bing (opcional)</label></th>
						<td><input id="ta-verificacion-bing" name="verificacion_bing" type="text" class="large-text code" value="<?php echo esc_attr( $v['bing'] ); ?>" placeholder='&lt;meta name="msvalidate.01" content="…" /&gt;' autocomplete="off">
							<p class="description">En <a href="https://www.bing.com/webmasters" target="_blank" rel="noopener">Bing Webmaster Tools</a> puedes importar el sitio directo desde Search Console, sin verificar de nuevo.</p></td>
					</tr>
				</table>
				<h3>Lo que leen buscadores y asistentes de IA</h3>
				<ul class="ta-enlaces">
					<li><a href="<?php echo esc_url( home_url( '/sitemap-sitio.xml' ) ); ?>" target="_blank" rel="noopener">Mapa del sitio</a> <span class="ta-gris"><?php echo esc_html( count( ta_sitio_paginas() ) ); ?> páginas</span></li>
					<li><a href="<?php echo esc_url( home_url( '/robots.txt' ) ); ?>" target="_blank" rel="noopener">robots.txt</a> <span class="ta-gris">anuncia el mapa y el manifiesto para agentes</span></li>
					<li><a href="<?php echo esc_url( home_url( '/llms.txt' ) ); ?>" target="_blank" rel="noopener">llms.txt</a> <span class="ta-gris">resumen del sitio para asistentes de IA</span></li>
					<li><a href="<?php echo esc_url( home_url( '/.well-known/ard.json' ) ); ?>" target="_blank" rel="noopener">Manifiesto para agentes (ARD)</a> <span class="ta-gris">navegación con agentes de IA</span></li>
				</ul>
				<?php if ( 'publicado' !== $op['modo'] ) : ?>
					<p class="description">Estas direcciones responden cuando el sitio está publicado.</p>
				<?php endif; ?>
				</section>

				<?php ta_sitio_panel_abrir( 'cotizaciones', 'El formulario de cotización envía cada solicitud, con sus fotografías, al asistente de Transporte Autorizado (servicio aparte), que la registra en Odoo y le da su número. El chat («Chat con IA») usa el mismo asistente. Sin dirección, el formulario avisa que el envío en línea no está disponible y ofrece WhatsApp.' ); ?>
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
				</section>

				<?php ta_sitio_panel_abrir( 'seguridad', 'Cada solicitud pasa por un permiso de un solo uso, un campo trampa y límites por visita, por correo, por hora y por día; las fotografías se revisan y se vuelven a generar antes de guardarlas. Además se rechaza lo siguiente:' ); ?>
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
				</section>
			</div>

			<div class="ta-guardar" data-ta-guardar>
				<span class="ta-guardar-estado" data-ta-guardar-estado aria-live="polite"></span>
				<?php submit_button( 'Guardar cambios', 'primary', 'submit', false ); ?>
			</div>
		</form>
	</div>
	<?php
}
