<?php
/**
 * Correos del sitio: todos salen por aquí, con el mismo formato (HTML con versión de texto), la firma de los ajustes
 * al final y su registro en el historial de la solicitud.
 *
 * La firma (texto e imagen) se configura en «Solicitudes → Ajustes del sitio». La imagen se elige de la biblioteca de
 * medios y se muestra con su dirección pública; el texto también va en la versión sin formato.
 */

defined( 'ABSPATH' ) || exit;

/** Nombres de cada tipo de correo en el historial. */
const TA_SITIO_TIPOS_CORREO = array(
	'equipo'       => 'Aviso al equipo',
	'confirmacion' => 'Confirmación a la persona',
	'lista'        => 'Aviso de «Lista»',
	'respuesta'    => 'Respuesta',
	'nota'         => 'Nota interna',
	'recibido'     => 'Respuesta recibida',
	'estado'       => 'Cambio de estado',
);

/** Metadato guardado como lista (o arreglo): vacío si no existe (get_post_meta devuelve '' y (array) '' no es vacío). */
function ta_sitio_meta_lista( $id, $clave ) {
	$v = get_post_meta( $id, $clave, true );
	return is_array( $v ) ? $v : array();
}

/** Agrega una entrada al historial de una solicitud. */
function ta_sitio_historial_agregar( $id, $entrada ) {
	if ( ! $id ) {
		return;
	}
	$historial   = ta_sitio_meta_lista( $id, '_ta_historial' );
	$usuario     = wp_get_current_user();
	$historial[] = array_merge(
		array(
			'fecha' => time(),
			'autor' => $usuario && $usuario->exists() ? $usuario->display_name : 'Sitio',
		),
		$entrada
	);
	update_post_meta( $id, '_ta_historial', array_slice( $historial, -200 ) );
}

/** Texto a HTML: párrafos, listas «• dato: valor» como tabla y enlaces activos. Todo escapado. */
function ta_sitio_texto_html( $texto ) {
	$enlaces = static function ( $s ) {
		return preg_replace_callback(
			'#https?://[^\s<]+#i',
			static function ( $m ) {
				$url = html_entity_decode( $m[0] );
				$ver = strlen( $url ) > 60 ? substr( $url, 0, 57 ) . '…' : $url;
				return '<a href="' . esc_url( $url ) . '" style="color:#6708C7">' . esc_html( $ver ) . '</a>';
			},
			$s
		);
	};
	$html = '';
	foreach ( preg_split( "/\n\s*\n/", trim( str_replace( "\r", '', (string) $texto ) ) ) as $bloque ) {
		$lineas = array_values( array_filter( array_map( 'trim', explode( "\n", $bloque ) ), 'strlen' ) );
		if ( ! $lineas ) {
			continue;
		}
		$titulo = '';
		if ( count( $lineas ) > 1 && 0 !== strpos( $lineas[0], '• ' ) && 0 === strpos( $lineas[1], '• ' ) ) {
			$titulo = array_shift( $lineas );  // «Contacto», «Solicitud»: el título de la lista
		}
		$todas_lista = ! array_filter(
			$lineas,
			static function ( $l ) {
				return 0 !== strpos( $l, '• ' );
			}
		);
		if ( $todas_lista ) {
			$filas = '';
			foreach ( $lineas as $l ) {
				$l     = substr( $l, strlen( '• ' ) );
				$corte = strpos( $l, ': ' );
				$dato  = false === $corte ? '' : substr( $l, 0, $corte );
				$valor = false === $corte ? $l : substr( $l, $corte + 2 );
				$filas .= '<tr><td style="padding:6px 12px 6px 0;color:#6b7185;font-size:13px;vertical-align:top;white-space:nowrap">' . esc_html( $dato ) . '</td>'
					. '<td style="padding:6px 0;color:#1d2233;font-size:14px;font-weight:bold;vertical-align:top">' . $enlaces( esc_html( $valor ) ) . '</td></tr>';
			}
			$html .= ( '' !== $titulo ? '<p style="margin:18px 0 4px;color:#1d2233;font-size:15px;font-weight:bold">' . esc_html( $titulo ) . '</p>' : '' )
				. '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border-top:1px solid #e4e7ee;margin:0 0 8px">' . $filas . '</table>';
		} else {
			$html .= ( '' !== $titulo ? '<p style="margin:0 0 4px;font-weight:bold">' . esc_html( $titulo ) . '</p>' : '' )
				. '<p style="margin:0 0 14px">' . $enlaces( implode( '<br>', array_map( 'esc_html', $lineas ) ) ) . '</p>';
		}
	}
	return $html;
}

/** Firma de los correos: [html, texto]. Vacía si no está configurada. */
function ta_sitio_firma_correo() {
	$op     = ta_sitio_opciones();
	$texto  = trim( (string) $op['firma_texto'] );
	$imagen = $op['firma_imagen'] ? wp_get_attachment_image_url( (int) $op['firma_imagen'], 'full' ) : '';
	if ( '' === $texto && ! $imagen ) {
		return array( '', '' );
	}
	$ancho = max( 60, min( 560, (int) $op['firma_ancho'] ) );
	$html  = '<tr><td style="padding:18px 32px 26px;border-top:1px solid #e4e7ee">'
		. ( '' !== $texto ? '<p style="margin:0 0 12px;color:#3e4459;font-size:14px;line-height:1.55">' . ta_sitio_texto_html_lineas( $texto ) . '</p>' : '' )
		. ( $imagen ? '<img src="' . esc_url( $imagen ) . '" alt="' . esc_attr( $op['remitente'] ) . '" width="' . $ancho . '" style="display:block;width:' . $ancho . 'px;max-width:100%;height:auto;border:0">' : '' )
		. '</td></tr>';
	return array( $html, $texto );
}

function ta_sitio_texto_html_lineas( $texto ) {
	return preg_replace_callback(
		'#https?://[^\s<]+#i',
		static function ( $m ) {
			return '<a href="' . esc_url( html_entity_decode( $m[0] ) ) . '" style="color:#6708C7">' . $m[0] . '</a>';
		},
		implode( '<br>', array_map( 'esc_html', array_map( 'trim', explode( "\n", str_replace( "\r", '', $texto ) ) ) ) )
	);
}

/** Página completa del correo. */
function ta_sitio_correo_pagina( $cuerpo_html, $firma_html, $asunto ) {
	$op   = ta_sitio_opciones();
	$logo = TA_SITIO_URL . 'sitio/assets/transporte/logo/logotipo-correo.png';
	return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>' . esc_html( $asunto ) . '</title></head>'
		. '<body style="margin:0;padding:0;background:#f5f3fa">'
		. '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3fa"><tr><td align="center" style="padding:24px 12px">'
		. '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e4e7ee;border-radius:14px;font-family:Arial,Helvetica,sans-serif;color:#1d2233;font-size:15px;line-height:1.6">'
		. '<tr><td style="padding:24px 32px 8px"><img src="' . esc_url( $logo ) . '" alt="' . esc_attr( $op['remitente'] ) . '" width="150" style="display:block;width:150px;height:auto;border:0"></td></tr>'
		. '<tr><td style="padding:12px 32px 18px">' . $cuerpo_html . '</td></tr>'
		. $firma_html
		. '</table>'
		. '<p style="margin:14px 0 0;color:#8a8fa0;font-family:Arial,Helvetica,sans-serif;font-size:12px">' . esc_html( $op['remitente'] ) . ' · <a href="' . esc_url( home_url( '/' ) ) . '" style="color:#8a8fa0">' . esc_html( wp_parse_url( home_url(), PHP_URL_HOST ) ) . '</a></p>'
		. '</td></tr></table></body></html>';
}

/**
 * Envía un correo con el formato del sitio y lo anota en el historial de la solicitud.
 *
 * @param array $a id, tipo, para (texto o lista), cc (lista), asunto, texto, responder ([nombre, correo]),
 *                 adjuntos (rutas), firma (true por defecto).
 * @return bool Si el servidor de correo lo aceptó.
 */
function ta_sitio_correo( $a ) {
	$a = wp_parse_args(
		$a,
		array( 'id' => 0, 'tipo' => '', 'para' => '', 'cc' => array(), 'cco' => array(), 'asunto' => '', 'texto' => '', 'responder' => null, 'adjuntos' => array(), 'firma' => true )
	);
	$op = ta_sitio_opciones();
	list( $firma_html, $firma_texto ) = $a['firma'] ? ta_sitio_firma_correo() : array( '', '' );
	$html = ta_sitio_correo_pagina( ta_sitio_texto_html( $a['texto'] ), $firma_html, $a['asunto'] );
	$alt  = $a['texto'] . ( '' !== $firma_texto ? "\n\n--\n" . $firma_texto : "\n\n" . $op['remitente'] . "\n" . home_url( '/' ) );

	list( $nombre, $correo ) = $a['responder'] ? $a['responder'] : array( $op['remitente'], ta_sitio_correo_destino() );
	$nombre    = trim( preg_replace( '/[\r\n"<>]+/', ' ', (string) $nombre ) );
	$cabeceras = array( 'Content-Type: text/html; charset=UTF-8', 'Reply-To: ' . ( '' !== $nombre ? '"' . $nombre . '" ' : '' ) . '<' . $correo . '>' );
	foreach ( array_filter( (array) $a['cc'], 'is_email' ) as $cc ) {
		$cabeceras[] = 'Cc: ' . $cc;
	}
	foreach ( array_filter( (array) $a['cco'], 'is_email' ) as $cco ) {
		$cabeceras[] = 'Bcc: ' . $cco;
	}

	// Versión de texto para los programas de correo que no muestran HTML
	$texto_alt = static function ( $phpmailer ) use ( $alt ) {
		$phpmailer->AltBody = $alt; // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase
	};
	add_action( 'phpmailer_init', $texto_alt );
	$ok = (bool) wp_mail( $a['para'], $a['asunto'], $html, $cabeceras, (array) $a['adjuntos'] );
	remove_action( 'phpmailer_init', $texto_alt );

	ta_sitio_historial_agregar(
		(int) $a['id'],
		array(
			'tipo'     => $a['tipo'],
			'para'     => implode( ', ', (array) $a['para'] ),
			'cc'       => implode( ', ', array_filter( (array) $a['cc'], 'is_email' ) ),
			'asunto'   => $a['asunto'],
			'texto'    => $a['texto'],
			'adjuntos' => array_map( 'basename', (array) $a['adjuntos'] ),
			'ok'       => $ok,
		)
	);
	return $ok;
}
