<?php
/**
 * Gestor de solicitudes en el escritorio de WordPress (menú «Solicitudes»).
 *
 * - Lista: estado con color, contacto, lo pedido, fotografías y último movimiento; filtros por estado con su cantidad,
 *   búsqueda por número, empresa, nombre, correo o teléfono, cambio de estado en grupo y exportación a CSV.
 * - Cada solicitud: datos y fotografías, estado (con el aviso de «Lista»), «Responder» con respuestas rápidas e
 *   imágenes o archivos de la biblioteca de medios, notas internas (también para dejar registro de lo que la persona
 *   contestó por correo) e historial de todo lo enviado.
 * - Escritorio: resumen de solicitudes y el número de nuevas junto al menú.
 *
 * Los correos salen por inc/correos.php (formato, firma e historial).
 */

defined( 'ABSPATH' ) || exit;

const TA_SITIO_ESTADOS = array(
	'nueva'       => 'Nueva',
	'en_revision' => 'En revisión',
	'lista'       => 'Lista',
	'cerrada'     => 'Cerrada',
);

function ta_sitio_estado( $id ) {
	$e = (string) get_post_meta( $id, '_ta_estado', true );
	return isset( TA_SITIO_ESTADOS[ $e ] ) ? $e : 'nueva';
}

function ta_sitio_insignia( $estado ) {
	return '<span class="ta-estado is-' . esc_attr( $estado ) . '">' . esc_html( TA_SITIO_ESTADOS[ $estado ] ?? 'Nueva' ) . '</span>';
}

/** Cambia el estado y lo anota en el historial. */
function ta_sitio_cambiar_estado( $id, $estado ) {
	$antes = ta_sitio_estado( $id );
	if ( $antes === $estado || ! isset( TA_SITIO_ESTADOS[ $estado ] ) ) {
		return false;
	}
	update_post_meta( $id, '_ta_estado', $estado );
	ta_sitio_historial_agregar( $id, array( 'tipo' => 'estado', 'texto' => TA_SITIO_ESTADOS[ $antes ] . ' → ' . TA_SITIO_ESTADOS[ $estado ] ) );
	return true;
}

/** Cantidad de solicitudes por estado (publicadas). */
function ta_sitio_conteo_estados() {
	global $wpdb;
	$filas = $wpdb->get_results( // phpcs:ignore WordPress.DB.DirectDatabaseQuery
		"SELECT COALESCE(m.meta_value, 'nueva') AS estado, COUNT(*) AS n FROM {$wpdb->posts} p
		 LEFT JOIN {$wpdb->postmeta} m ON m.post_id = p.ID AND m.meta_key = '_ta_estado'
		 WHERE p.post_type = 'ta_solicitud' AND p.post_status = 'publish' GROUP BY estado"
	);
	$out = array_fill_keys( array_keys( TA_SITIO_ESTADOS ), 0 );
	foreach ( (array) $filas as $f ) {
		if ( isset( $out[ $f->estado ] ) ) {
			$out[ $f->estado ] += (int) $f->n;
		}
	}
	return $out;
}

/* ---------- Recursos del escritorio ---------- */

add_action(
	'admin_enqueue_scripts',
	static function ( $hook ) {
		$pantalla = get_current_screen();
		$nuestra  = $pantalla && ( 'ta_solicitud' === $pantalla->post_type || false !== strpos( (string) $hook, 'ta-sitio' ) );
		if ( ! $nuestra && 'index.php' !== $hook ) {
			return;
		}
		wp_enqueue_style( 'ta-gestor', TA_SITIO_URL . 'admin/gestor.css', array(), TA_SITIO_VERSION );
		if ( $nuestra ) {
			wp_enqueue_media();
			wp_enqueue_script( 'ta-gestor', TA_SITIO_URL . 'admin/gestor.js', array( 'jquery' ), TA_SITIO_VERSION, true );
		}
	}
);

/* ---------- Lista ---------- */

add_filter(
	'manage_ta_solicitud_posts_columns',
	static function ( $columnas ) {
		return array(
			'cb'           => $columnas['cb'] ?? '',
			'title'        => 'Solicitud',
			'ta_estado'    => 'Estado',
			'ta_contacto'  => 'Contacto',
			'ta_pedido'    => 'Pedido',
			'ta_fotos'     => 'Fotos',
			'ta_actividad' => 'Último movimiento',
			'date'         => 'Recibida',
		);
	}
);

add_action(
	'manage_ta_solicitud_posts_custom_column',
	static function ( $columna, $id ) {
		if ( 'ta_estado' === $columna ) {
			echo ta_sitio_insignia( ta_sitio_estado( $id ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		} elseif ( 'ta_contacto' === $columna ) {
			$c = ta_sitio_meta_lista( $id, '_ta_contacto' );
			echo '<strong>' . esc_html( $c['nombre'] ?? '' ) . '</strong><br>' . esc_html( $c['correo'] ?? '' ) . ( ! empty( $c['telefono'] ) ? '<br>' . esc_html( $c['telefono'] ) : '' );
		} elseif ( 'ta_pedido' === $columna ) {
			$campos = array_filter(
				ta_sitio_meta_lista( $id, '_ta_campos' ),
				static function ( $par ) {
					return 0 !== strpos( (string) ( $par[1] ?? '' ), 'http' );  // el enlace del mapa no cabe en la lista
				}
			);
			foreach ( array_slice( $campos, 0, 4 ) as $par ) {
				echo '<span class="ta-dato">' . esc_html( ( $par[0] ?? '' ) . ': ' . ( $par[1] ?? '' ) ) . '</span>';
			}
		} elseif ( 'ta_fotos' === $columna ) {
			$n = count( ta_sitio_meta_lista( $id, '_ta_fotos' ) );
			echo $n ? (int) $n : '—';
		} elseif ( 'ta_actividad' === $columna ) {
			$h = ta_sitio_meta_lista( $id, '_ta_historial' );
			$u = end( $h );
			if ( $u ) {
				echo esc_html( TA_SITIO_TIPOS_CORREO[ $u['tipo'] ] ?? $u['tipo'] ) . '<br><span class="ta-gris">' . esc_html( wp_date( 'd-m-Y H:i', $u['fecha'] ) ) . '</span>';
			} else {
				echo '—';
			}
		}
	},
	10,
	2
);

/* Sin «Edición rápida»: el estado se cambia en la ficha o en grupo */
add_filter(
	'post_row_actions',
	static function ( $acciones, $post ) {
		if ( 'ta_solicitud' === $post->post_type ) {
			unset( $acciones['inline hide-if-no-js'] );
			if ( isset( $acciones['edit'] ) ) {
				$acciones['edit'] = '<a href="' . esc_url( get_edit_post_link( $post->ID ) ) . '">Abrir y responder</a>';
			}
		}
		return $acciones;
	},
	10,
	2
);

/* Filtros por estado, con su cantidad */
add_filter(
	'views_edit-ta_solicitud',
	static function ( $vistas ) {
		$actual = isset( $_GET['ta_estado'] ) ? sanitize_key( wp_unslash( $_GET['ta_estado'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$base   = admin_url( 'edit.php?post_type=ta_solicitud' );
		$nuevas = array();
		foreach ( ta_sitio_conteo_estados() as $estado => $n ) {
			$nuevas[ 'ta_' . $estado ] = '<a href="' . esc_url( add_query_arg( 'ta_estado', $estado, $base ) ) . '"' . ( $actual === $estado ? ' class="current" aria-current="page"' : '' ) . '>'
				. esc_html( TA_SITIO_ESTADOS[ $estado ] ) . ' <span class="count">(' . (int) $n . ')</span></a>';
		}
		if ( $actual && isset( $vistas['all'] ) ) {
			$vistas['all'] = str_replace( array( ' class="current"', ' aria-current="page"' ), '', $vistas['all'] );
		}
		$todas = isset( $vistas['all'] ) ? array( 'all' => $vistas['all'] ) : array();
		unset( $vistas['all'], $vistas['publish'] );
		return $todas + $nuevas + $vistas;
	}
);

/* Filtro por estado y búsqueda por número, empresa, nombre, correo o teléfono */
add_action(
	'pre_get_posts',
	static function ( $q ) {
		if ( ! is_admin() || ! $q->is_main_query() || 'ta_solicitud' !== $q->get( 'post_type' ) ) {
			return;
		}
		$estado = isset( $_GET['ta_estado'] ) ? sanitize_key( wp_unslash( $_GET['ta_estado'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		if ( isset( TA_SITIO_ESTADOS[ $estado ] ) ) {
			$q->set(
				'meta_query',
				'nueva' === $estado
					? array( 'relation' => 'OR', array( 'key' => '_ta_estado', 'value' => 'nueva' ), array( 'key' => '_ta_estado', 'compare' => 'NOT EXISTS' ) )
					: array( array( 'key' => '_ta_estado', 'value' => $estado ) )
			);
		}
		$texto = trim( (string) $q->get( 's' ) );
		if ( '' !== $texto ) {
			global $wpdb;
			$like = '%' . $wpdb->esc_like( $texto ) . '%';
			$ids  = $wpdb->get_col( // phpcs:ignore WordPress.DB.DirectDatabaseQuery
				$wpdb->prepare(
					"SELECT DISTINCT p.ID FROM {$wpdb->posts} p LEFT JOIN {$wpdb->postmeta} m ON m.post_id = p.ID AND m.meta_key IN ('_ta_codigo', '_ta_contacto', '_ta_campos')
					 WHERE p.post_type = 'ta_solicitud' AND (p.post_title LIKE %s OR m.meta_value LIKE %s)",
					$like,
					$like
				)
			);
			$q->set( 's', '' );
			$q->set( 'post__in', $ids ? array_map( 'intval', $ids ) : array( 0 ) );
		}
		if ( ! $q->get( 'orderby' ) ) {
			$q->set( 'orderby', 'date' );
			$q->set( 'order', 'DESC' );
		}
	}
);

/* Acciones en grupo: cambiar estado (sin enviar correos) y exportar */
add_filter(
	'bulk_actions-edit-ta_solicitud',
	static function ( $acciones ) {
		unset( $acciones['edit'] );
		return array(
			'ta_en_revision' => 'Pasar a «En revisión»',
			'ta_cerrada'     => 'Pasar a «Cerrada»',
			'ta_nueva'       => 'Volver a «Nueva»',
			'ta_exportar'    => 'Exportar a CSV',
		) + $acciones;
	}
);

add_filter(
	'handle_bulk_actions-edit-ta_solicitud',
	static function ( $volver, $accion, $ids ) {
		if ( 'ta_exportar' === $accion ) {
			ta_sitio_csv( array_map( 'intval', $ids ) );
		}
		$estado = substr( (string) $accion, 3 );
		if ( 0 === strpos( (string) $accion, 'ta_' ) && isset( TA_SITIO_ESTADOS[ $estado ] ) ) {
			$n = 0;
			foreach ( $ids as $id ) {
				if ( current_user_can( 'edit_post', $id ) && ta_sitio_cambiar_estado( (int) $id, $estado ) ) {
					++$n;
				}
			}
			$volver = add_query_arg( 'ta_cambiadas', $n, $volver );
		}
		return $volver;
	},
	10,
	3
);

/** CSV de solicitudes (todas si no se indican). */
function ta_sitio_csv( $ids = array() ) {
	if ( ! current_user_can( 'edit_pages' ) ) {
		wp_die( 'No tienes permiso para exportar.' );
	}
	$posts = get_posts(
		array( 'post_type' => 'ta_solicitud', 'post_status' => 'publish', 'numberposts' => -1, 'post__in' => $ids, 'orderby' => 'date', 'order' => 'DESC' )
	);
	nocache_headers();
	header( 'Content-Type: text/csv; charset=utf-8' );
	header( 'Content-Disposition: attachment; filename="solicitudes-' . gmdate( 'Y-m-d' ) . '.csv"' );
	$out = fopen( 'php://output', 'w' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
	fwrite( $out, "\xEF\xBB\xBF" ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fwrite -- BOM: Excel abre bien los tildes
	fputcsv( $out, array( 'Número', 'Recibida', 'Estado', 'Empresa', 'Nombre', 'Teléfono', 'Correo', 'Origen', 'Solicitud', 'Fotos' ), ';' );
	foreach ( $posts as $p ) {
		$c      = ta_sitio_meta_lista( $p->ID, '_ta_contacto' );
		$campos = array_map(
			static function ( $par ) {
				return ( $par[0] ?? '' ) . ': ' . ( $par[1] ?? '' );
			},
			ta_sitio_meta_lista( $p->ID, '_ta_campos' )
		);
		// Una celda que empieza con = + - @ se abriría como fórmula: se antepone un apóstrofo
		$celda = static function ( $v ) {
			$v = (string) $v;
			return preg_match( '/^(?:[=@\t\r]|[+\-](?!\d))/', $v ) ? "'" . $v : $v;  // un teléfono «+56…» queda tal cual
		};
		fputcsv(
			$out,
			array_map(
				$celda,
				array(
					get_post_meta( $p->ID, '_ta_codigo', true ),
					get_the_date( 'd-m-Y H:i', $p ),
					TA_SITIO_ESTADOS[ ta_sitio_estado( $p->ID ) ],
					$c['empresa'] ?? '',
					$c['nombre'] ?? '',
					$c['telefono'] ?? '',
					$c['correo'] ?? '',
					'asistente' === get_post_meta( $p->ID, '_ta_origen', true ) ? 'Asistente' : 'Formulario',
					implode( ' | ', $campos ),
					count( ta_sitio_meta_lista( $p->ID, '_ta_fotos' ) ),
				)
			),
			';'
		);
	}
	fclose( $out ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
	exit;
}

add_action(
	'admin_post_ta_sitio_exportar',
	static function () {
		check_admin_referer( 'ta_sitio_exportar' );
		ta_sitio_csv();
	}
);

/* Botón «Exportar todo» junto a los filtros de la lista */
add_action(
	'manage_posts_extra_tablenav',
	static function ( $donde ) {
		if ( 'top' !== $donde || 'ta_solicitud' !== get_current_screen()->post_type ) {
			return;
		}
		echo '<div class="alignleft actions"><a class="button" href="' . esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=ta_sitio_exportar' ), 'ta_sitio_exportar' ) ) . '">Exportar todo a CSV</a></div>';
	}
);

/* Número de nuevas junto al menú */
add_action(
	'admin_menu',
	static function () {
		global $menu;
		$n = ta_sitio_conteo_estados()['nueva'];
		if ( ! $n || ! is_array( $menu ) ) {
			return;
		}
		foreach ( $menu as $i => $item ) {
			if ( 'edit.php?post_type=ta_solicitud' === ( $item[2] ?? '' ) ) {
				$menu[ $i ][0] .= ' <span class="awaiting-mod"><span class="pending-count">' . (int) $n . '</span></span>'; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
			}
		}
	},
	99
);

/* Resumen en el escritorio */
add_action(
	'wp_dashboard_setup',
	static function () {
		if ( ! current_user_can( 'edit_pages' ) ) {
			return;
		}
		wp_add_dashboard_widget(
			'ta_solicitudes',
			'Solicitudes de Transporte Autorizado',
			static function () {
				$base = admin_url( 'edit.php?post_type=ta_solicitud' );
				echo '<ul class="ta-resumen">';
				foreach ( ta_sitio_conteo_estados() as $estado => $n ) {
					echo '<li><a href="' . esc_url( add_query_arg( 'ta_estado', $estado, $base ) ) . '">' . ta_sitio_insignia( $estado ) . ' <strong>' . (int) $n . '</strong></a></li>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
				}
				echo '</ul>';
				$ultimas = get_posts( array( 'post_type' => 'ta_solicitud', 'post_status' => 'publish', 'numberposts' => 5 ) );
				if ( ! $ultimas ) {
					echo '<p>Todavía no llegan solicitudes.</p>';
					return;
				}
				echo '<table class="widefat striped ta-ultimas"><tbody>';
				foreach ( $ultimas as $p ) {
					echo '<tr><td><a href="' . esc_url( get_edit_post_link( $p->ID ) ) . '">' . esc_html( $p->post_title ) . '</a><br><span class="ta-gris">' . esc_html( get_the_date( 'd-m-Y H:i', $p ) ) . '</span></td><td>' . ta_sitio_insignia( ta_sitio_estado( $p->ID ) ) . '</td></tr>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
				}
				echo '</tbody></table><p><a href="' . esc_url( $base ) . '">Ver todas las solicitudes</a></p>';
			}
		);
	}
);

/* ---------- Ficha de cada solicitud ---------- */

add_action(
	'add_meta_boxes_ta_solicitud',
	static function () {
		add_meta_box( 'ta-solicitud-datos', 'Solicitud', 'ta_sitio_caja_datos', 'ta_solicitud', 'normal', 'high' );
		add_meta_box( 'ta-solicitud-responder', 'Responder a la persona', 'ta_sitio_caja_responder', 'ta_solicitud', 'normal', 'high' );
		add_meta_box( 'ta-solicitud-historial', 'Historial', 'ta_sitio_caja_historial', 'ta_solicitud', 'normal', 'default' );
		add_meta_box( 'ta-solicitud-estado', 'Estado y aviso a la persona', 'ta_sitio_caja_estado', 'ta_solicitud', 'side', 'high' );
		add_meta_box( 'ta-solicitud-nota', 'Notas internas', 'ta_sitio_caja_nota', 'ta_solicitud', 'side', 'default' );
		remove_meta_box( 'submitdiv', 'ta_solicitud', 'side' );
		remove_meta_box( 'slugdiv', 'ta_solicitud', 'normal' );
	}
);

function ta_sitio_caja_datos( $post ) {
	$c      = ta_sitio_meta_lista( $post->ID, '_ta_contacto' );
	$campos = ta_sitio_meta_lista( $post->ID, '_ta_campos' );
	$tel    = preg_replace( '/\D/', '', (string) ( $c['telefono'] ?? '' ) );
	echo '<p class="ta-cabecera"><strong>' . esc_html( (string) get_post_meta( $post->ID, '_ta_codigo', true ) ) . '</strong> · Recibida el ' . esc_html( get_the_date( 'd-m-Y H:i', $post ) )
		. ' · ' . ( 'asistente' === get_post_meta( $post->ID, '_ta_origen', true ) ? 'Asistente de retiro' : 'Formulario de cotización' ) . ' · ' . ta_sitio_insignia( ta_sitio_estado( $post->ID ) ) . '</p>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	echo '<h3>Contacto</h3><table class="widefat striped ta-tabla"><tbody>';
	foreach ( array( 'empresa' => 'Empresa', 'nombre' => 'Nombre', 'telefono' => 'Teléfono', 'correo' => 'Correo' ) as $k => $titulo ) {
		$valor = (string) ( $c[ $k ] ?? '' );
		if ( 'correo' === $k && is_email( $valor ) ) {
			$valor = '<a href="' . esc_url( 'mailto:' . $valor ) . '">' . esc_html( $valor ) . '</a>';
		} elseif ( 'telefono' === $k && strlen( $tel ) >= 8 ) {
			$wa    = 9 === strlen( $tel ) ? '56' . $tel : $tel;
			$valor = esc_html( $valor ) . ' · <a href="' . esc_url( 'tel:+' . $wa ) . '">Llamar</a> · <a href="' . esc_url( 'https://wa.me/' . $wa ) . '" target="_blank" rel="noopener">WhatsApp</a>';
		} else {
			$valor = esc_html( $valor );
		}
		echo '<tr><th>' . esc_html( $titulo ) . '</th><td>' . $valor . '</td></tr>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	}
	echo '</tbody></table><h3>Lo que pidió</h3><table class="widefat striped ta-tabla"><tbody>';
	foreach ( $campos as $par ) {
		$valor = (string) ( $par[1] ?? '' );
		$html  = 0 === strpos( $valor, 'https://www.google.com/maps/' ) ? '<a href="' . esc_url( $valor ) . '" target="_blank" rel="noopener">Ver en Google Maps</a>' : esc_html( $valor );
		echo '<tr><th>' . esc_html( $par[0] ?? '' ) . '</th><td>' . $html . '</td></tr>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	}
	echo '</tbody></table>';
}

function ta_sitio_caja_estado( $post ) {
	$estado  = ta_sitio_estado( $post->ID );
	$avisada = (int) get_post_meta( $post->ID, '_ta_aviso_lista', true );
	wp_nonce_field( 'ta_sitio_estado_' . $post->ID, 'ta_sitio_estado_nonce' );
	echo '<p><label for="ta-estado"><strong>Estado</strong></label><br><select id="ta-estado" name="ta_estado" style="width:100%">';
	foreach ( TA_SITIO_ESTADOS as $valor => $nombre ) {
		echo '<option value="' . esc_attr( $valor ) . '"' . selected( $estado, $valor, false ) . '>' . esc_html( $nombre ) . '</option>';
	}
	echo '</select></p>';
	echo '<p><label for="ta-mensaje"><strong>Mensaje del aviso de «Lista»</strong></label><br><textarea id="ta-mensaje" name="ta_mensaje" rows="4" style="width:100%" placeholder="Opcional. Va en el correo que avisa que la solicitud está lista.">' . esc_textarea( (string) get_post_meta( $post->ID, '_ta_mensaje', true ) ) . '</textarea></p>';
	if ( $avisada ) {
		echo '<p class="ta-gris">El aviso de «Lista» se envió el ' . esc_html( wp_date( 'd-m-Y H:i', $avisada ) ) . '.</p>';
		echo '<p><label><input type="checkbox" name="ta_reenviar" value="1"> Enviar el aviso de nuevo</label></p>';
	} else {
		echo '<p class="description">Al pasar a «Lista» y guardar, la persona recibe un correo con su número de solicitud.</p>';
	}
	submit_button( 'Guardar', 'primary', 'save', false );
}

function ta_sitio_caja_responder( $post ) {
	$c       = ta_sitio_meta_lista( $post->ID, '_ta_contacto' );
	$codigo  = (string) get_post_meta( $post->ID, '_ta_codigo', true );
	$op      = ta_sitio_opciones();
	$reemp   = array( '{nombre}' => $c['nombre'] ?? '', '{empresa}' => $c['empresa'] ?? '', '{numero}' => $codigo );
	$fotos   = ta_sitio_meta_lista( $post->ID, '_ta_fotos' );
	$correo  = (string) ( $c['correo'] ?? '' );
	if ( ! is_email( $correo ) ) {
		echo '<p>Esta solicitud no tiene un correo válido para responder.</p>';
		return;
	}
	wp_nonce_field( 'ta_sitio_responder_' . $post->ID, 'ta_sitio_responder_nonce' );
	echo '<input type="hidden" name="ta_id" value="' . (int) $post->ID . '">';
	echo '<div class="ta-responder">';
	echo '<p class="ta-para"><strong>Para:</strong> ' . esc_html( ( $c['nombre'] ?? '' ) . ' <' . $correo . '>' ) . '</p>';
	$plantillas = ta_sitio_plantillas();
	if ( $plantillas ) {
		echo '<p><label for="ta-r-plantilla"><strong>Respuesta rápida</strong></label><br><select id="ta-r-plantilla" data-ta-plantilla><option value="">Escribir desde cero</option>';
		foreach ( $plantillas as $i => $p ) {
			echo '<option value="' . (int) $i . '" data-texto="' . esc_attr( strtr( $p[1], $reemp ) ) . '">' . esc_html( $p[0] ) . '</option>';
		}
		echo '</select></p>';
	}
	echo '<p><label for="ta-r-asunto"><strong>Asunto</strong></label><input id="ta-r-asunto" name="ta_r_asunto" type="text" class="large-text" value="' . esc_attr( "Tu solicitud $codigo · " . $op['remitente'] ) . '"></p>';
	echo '<p><label for="ta-r-mensaje"><strong>Mensaje</strong></label><textarea id="ta-r-mensaje" name="ta_r_mensaje" rows="9" class="large-text" placeholder="' . esc_attr( 'Hola, ' . ( $c['nombre'] ?? '' ) . ':' ) . '"></textarea></p>';
	echo '<div class="ta-adjuntos" data-ta-adjuntos><input type="hidden" name="ta_r_adjuntos" value="" data-ta-adjuntos-ids><ul class="ta-adjuntos-lista" data-ta-adjuntos-lista></ul>'
		. '<button type="button" class="button" data-ta-adjuntar><span class="dashicons dashicons-paperclip"></span> Adjuntar imágenes o archivos</button>'
		. ( $fotos ? ' <label class="ta-check"><input type="checkbox" name="ta_r_fotos" value="1"> ' . ( 1 === count( $fotos ) ? 'Adjuntar también la fotografía de la solicitud' : 'Adjuntar también las ' . count( $fotos ) . ' fotografías de la solicitud' ) . '</label>' : '' )
		. '</div>';
	echo '<p><label for="ta-r-cc"><strong>Con copia a</strong> <span class="ta-gris">(opcional)</span></label><input id="ta-r-cc" name="ta_r_cc" type="email" multiple class="regular-text" placeholder="otro@empresa.cl"></p>';
	echo '<p><label for="ta-r-estado"><strong>Después de enviar, pasar a</strong></label> <select id="ta-r-estado" name="ta_r_estado"><option value="">Dejar como está</option>';
	foreach ( TA_SITIO_ESTADOS as $valor => $nombre ) {
		echo '<option value="' . esc_attr( $valor ) . '">' . esc_html( $nombre ) . '</option>';
	}
	echo '</select></p>';
	echo '<p class="ta-acciones"><button type="submit" class="button button-primary" name="action" value="ta_sitio_responder" formaction="' . esc_url( admin_url( 'admin-post.php' ) ) . '" formnovalidate data-ta-enviar>Enviar respuesta</button>'
		. ' <span class="ta-gris">Sale con la firma de los ajustes' . ( $op['copia_respuestas'] ? ' y con copia oculta a ' . esc_html( ta_sitio_correo_destino() ) : '' ) . '. Si la persona contesta, su respuesta llega a ' . esc_html( ta_sitio_correo_destino() ) . '.</span></p>';
	echo '</div>';
}

function ta_sitio_caja_nota( $post ) {
	wp_nonce_field( 'ta_sitio_nota_' . $post->ID, 'ta_sitio_nota_nonce' );
	echo '<p><select name="ta_n_tipo" style="width:100%"><option value="nota">Nota interna</option><option value="recibido">Respuesta recibida de la persona</option></select></p>';
	echo '<p><textarea name="ta_n_texto" rows="4" style="width:100%" placeholder="Solo la ve el equipo. Para registrar lo que la persona contestó por correo, pega su respuesta aquí."></textarea></p>';
	echo '<p><button type="submit" class="button" name="action" value="ta_sitio_nota" formaction="' . esc_url( admin_url( 'admin-post.php' ) ) . '" formnovalidate>Agregar al historial</button></p>';
}

function ta_sitio_caja_historial( $post ) {
	$historial = array_reverse( array_filter( ta_sitio_meta_lista( $post->ID, '_ta_historial' ), 'is_array' ) );
	if ( ! $historial ) {
		echo '<p class="ta-gris">Todavía no hay movimientos.</p>';
		return;
	}
	echo '<ol class="ta-historial">';
	foreach ( $historial as $h ) {
		$tipo  = (string) ( $h['tipo'] ?? '' );
		$falla = isset( $h['ok'] ) && ! $h['ok'];
		echo '<li class="is-' . esc_attr( $tipo ) . ( $falla ? ' is-falla' : '' ) . '"><div class="ta-h-cab"><strong>' . esc_html( TA_SITIO_TIPOS_CORREO[ $tipo ] ?? $tipo ) . '</strong>'
			. ( $falla ? ' <span class="ta-falla">No se pudo enviar</span>' : '' )
			. ' <span class="ta-gris">' . esc_html( wp_date( 'd-m-Y H:i', (int) ( $h['fecha'] ?? 0 ) ) . ' · ' . ( $h['autor'] ?? '' ) ) . '</span></div>';
		if ( ! empty( $h['para'] ) ) {
			echo '<div class="ta-gris">Para ' . esc_html( $h['para'] ) . ( ! empty( $h['cc'] ) ? ' · copia a ' . esc_html( $h['cc'] ) : '' ) . ( ! empty( $h['asunto'] ) ? ' · «' . esc_html( $h['asunto'] ) . '»' : '' ) . '</div>';
		}
		if ( ! empty( $h['texto'] ) ) {
			$texto = (string) $h['texto'];
			echo strlen( $texto ) > 220 && in_array( $tipo, array( 'equipo', 'confirmacion', 'lista', 'respuesta' ), true )
				? '<details><summary>Ver el texto</summary><div class="ta-h-texto">' . nl2br( esc_html( $texto ) ) . '</div></details>'
				: '<div class="ta-h-texto">' . nl2br( esc_html( $texto ) ) . '</div>';
		}
		if ( ! empty( $h['adjuntos'] ) ) {
			echo '<div class="ta-gris"><span class="dashicons dashicons-paperclip"></span> ' . esc_html( implode( ', ', (array) $h['adjuntos'] ) ) . '</div>';
		}
		echo '</li>';
	}
	echo '</ol>';
}

/* Guardar estado (y enviar el aviso de «Lista») */
add_action(
	'save_post_ta_solicitud',
	static function ( $id ) {
		if ( ! isset( $_POST['ta_sitio_estado_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['ta_sitio_estado_nonce'] ) ), 'ta_sitio_estado_' . $id ) ) {
			return;
		}
		if ( ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) || ! current_user_can( 'edit_post', $id ) ) {
			return;
		}
		$estado  = isset( $_POST['ta_estado'] ) ? sanitize_key( wp_unslash( $_POST['ta_estado'] ) ) : 'nueva';
		$estado  = isset( TA_SITIO_ESTADOS[ $estado ] ) ? $estado : 'nueva';
		$mensaje = isset( $_POST['ta_mensaje'] ) ? sanitize_textarea_field( wp_unslash( $_POST['ta_mensaje'] ) ) : '';
		ta_sitio_cambiar_estado( $id, $estado );
		update_post_meta( $id, '_ta_mensaje', $mensaje );
		$avisada = (int) get_post_meta( $id, '_ta_aviso_lista', true );
		if ( 'lista' === $estado && ( ! $avisada || ! empty( $_POST['ta_reenviar'] ) ) ) {
			if ( ta_sitio_correo_lista( $id, $mensaje ) ) {
				update_post_meta( $id, '_ta_aviso_lista', time() );
			} else {
				set_transient( 'ta_aviso_fallo_' . get_current_user_id(), 1, 60 );
			}
		}
	}
);

/** Vuelve a la ficha con un aviso. */
function ta_sitio_volver( $id, $aviso ) {
	wp_safe_redirect( add_query_arg( array( 'post' => (int) $id, 'action' => 'edit', 'ta_aviso' => $aviso ), admin_url( 'post.php' ) ) );
	exit;
}

/* Enviar una respuesta */
add_action(
	'admin_post_ta_sitio_responder',
	static function () {
		$id = isset( $_POST['ta_id'] ) ? absint( $_POST['ta_id'] ) : 0;
		if ( ! $id || 'ta_solicitud' !== get_post_type( $id ) || ! current_user_can( 'edit_post', $id ) ) {
			wp_die( 'No tienes permiso para responder esta solicitud.' );
		}
		check_admin_referer( 'ta_sitio_responder_' . $id, 'ta_sitio_responder_nonce' );
		$c       = ta_sitio_meta_lista( $id, '_ta_contacto' );
		$asunto  = isset( $_POST['ta_r_asunto'] ) ? sanitize_text_field( wp_unslash( $_POST['ta_r_asunto'] ) ) : '';
		$mensaje = isset( $_POST['ta_r_mensaje'] ) ? sanitize_textarea_field( wp_unslash( $_POST['ta_r_mensaje'] ) ) : '';
		if ( '' === trim( $mensaje ) || empty( $c['correo'] ) || ! is_email( $c['correo'] ) ) {
			ta_sitio_volver( $id, 'vacio' );
		}
		$cc       = array_filter( array_map( 'sanitize_email', explode( ',', isset( $_POST['ta_r_cc'] ) ? sanitize_text_field( wp_unslash( $_POST['ta_r_cc'] ) ) : '' ) ), 'is_email' );
		$adjuntos = array();
		foreach ( array_filter( array_map( 'absint', explode( ',', isset( $_POST['ta_r_adjuntos'] ) ? sanitize_text_field( wp_unslash( $_POST['ta_r_adjuntos'] ) ) : '' ) ) ) as $adjunto ) {
			$ruta = get_attached_file( $adjunto );
			if ( $ruta && is_file( $ruta ) && 'attachment' === get_post_type( $adjunto ) ) {
				$adjuntos[] = $ruta;
			}
		}
		if ( ! empty( $_POST['ta_r_fotos'] ) ) {
			$adjuntos = array_merge( $adjuntos, array_filter( array_map( 'ta_sitio_ruta_foto', ta_sitio_meta_lista( $id, '_ta_fotos' ) ) ) );
		}
		$op = ta_sitio_opciones();
		$ok = ta_sitio_correo(
			array(
				'id'       => $id,
				'tipo'     => 'respuesta',
				'para'     => $c['correo'],
				'cc'       => $cc,
				'cco'      => $op['copia_respuestas'] ? array( ta_sitio_correo_destino() ) : array(),
				'asunto'   => '' !== $asunto ? $asunto : 'Tu solicitud ' . get_post_meta( $id, '_ta_codigo', true ),
				'texto'    => $mensaje,
				'adjuntos' => $adjuntos,
			)
		);
		$estado = isset( $_POST['ta_r_estado'] ) ? sanitize_key( wp_unslash( $_POST['ta_r_estado'] ) ) : '';
		if ( $ok && isset( TA_SITIO_ESTADOS[ $estado ] ) ) {
			ta_sitio_cambiar_estado( $id, $estado );
		}
		ta_sitio_volver( $id, $ok ? 'enviada' : 'fallo' );
	}
);

/* Agregar una nota o una respuesta recibida */
add_action(
	'admin_post_ta_sitio_nota',
	static function () {
		$id = isset( $_POST['post_ID'] ) ? absint( $_POST['post_ID'] ) : ( isset( $_POST['ta_id'] ) ? absint( $_POST['ta_id'] ) : 0 );
		if ( ! $id || 'ta_solicitud' !== get_post_type( $id ) || ! current_user_can( 'edit_post', $id ) ) {
			wp_die( 'No tienes permiso para esta solicitud.' );
		}
		check_admin_referer( 'ta_sitio_nota_' . $id, 'ta_sitio_nota_nonce' );
		$texto = isset( $_POST['ta_n_texto'] ) ? sanitize_textarea_field( wp_unslash( $_POST['ta_n_texto'] ) ) : '';
		$tipo  = isset( $_POST['ta_n_tipo'] ) && 'recibido' === $_POST['ta_n_tipo'] ? 'recibido' : 'nota';
		if ( '' === trim( $texto ) ) {
			ta_sitio_volver( $id, 'vacio' );
		}
		ta_sitio_historial_agregar( $id, array( 'tipo' => $tipo, 'texto' => $texto ) );
		ta_sitio_volver( $id, 'nota' );
	}
);

/* Vista previa de un correo con la firma guardada */
add_action(
	'admin_post_ta_sitio_vista_correo',
	static function () {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( 'No tienes permiso.' );
		}
		check_admin_referer( 'ta_sitio_vista_correo' );
		$texto = "Hola, María:\n\nRecibimos tu solicitud. Su número es TA-26-00001.\n\nRevisaremos los antecedentes y te escribiremos a este correo cuando esté lista.\n\nEsto fue lo que nos enviaste:\n• Servicio: Retiro de residuos\n• Residuo: Papel y cartón\n• Comuna: Quilicura";
		list( $firma ) = ta_sitio_firma_correo();
		header( 'Content-Type: text/html; charset=utf-8' );
		echo ta_sitio_correo_pagina( ta_sitio_texto_html( $texto ), $firma, 'Vista previa' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		exit;
	}
);

/* Avisos de la ficha y de la lista */
add_action(
	'admin_notices',
	static function () {
		if ( get_transient( 'ta_aviso_fallo_' . get_current_user_id() ) ) {
			delete_transient( 'ta_aviso_fallo_' . get_current_user_id() );
			echo '<div class="notice notice-error"><p>La solicitud quedó guardada, pero el correo de aviso no se pudo enviar. Revisa la configuración de correo del sitio.</p></div>';
		}
		$aviso = isset( $_GET['ta_aviso'] ) ? sanitize_key( wp_unslash( $_GET['ta_aviso'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$textos = array(
			'enviada' => array( 'success', 'Respuesta enviada. Quedó en el historial.' ),
			'fallo'   => array( 'error', 'No se pudo enviar la respuesta. Revisa la configuración de correo del sitio (FluentSMTP).' ),
			'vacio'   => array( 'warning', 'Escribe un mensaje antes de enviar.' ),
			'nota'    => array( 'success', 'Nota agregada al historial.' ),
		);
		if ( isset( $textos[ $aviso ] ) ) {
			echo '<div class="notice notice-' . esc_attr( $textos[ $aviso ][0] ) . ' is-dismissible"><p>' . esc_html( $textos[ $aviso ][1] ) . '</p></div>';
		}
		if ( isset( $_GET['ta_cambiadas'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			$n = absint( $_GET['ta_cambiadas'] ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			echo '<div class="notice notice-success is-dismissible"><p>' . esc_html( 1 === $n ? '1 solicitud cambió de estado.' : "$n solicitudes cambiaron de estado." ) . '</p></div>';
		}
	}
);

/* En la ficha no se edita el título */
add_filter(
	'enter_title_here',
	static function ( $texto, $post ) {
		return 'ta_solicitud' === $post->post_type ? '' : $texto;
	},
	10,
	2
);
