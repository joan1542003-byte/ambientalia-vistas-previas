<?php
/**
 * Plugin Name:       Transporte Autorizado – Sitio
 * Description:       Sirve el sitio nuevo de Transporte Autorizado desde WordPress (en una dirección privada o publicado en la portada), recibe las solicitudes de sus formularios, les asigna un número y envía los correos.
 * Version:           1.3.0
 * Requires at least: 6.2
 * Requires PHP:      7.4
 * Author:            Transporte Autorizado
 * Text Domain:       ta-sitio
 */

defined( 'ABSPATH' ) || exit;

define( 'TA_SITIO_VERSION', '1.3.0' );
define( 'TA_SITIO_ARCHIVO', __FILE__ );
define( 'TA_SITIO_DIR', plugin_dir_path( __FILE__ ) );
define( 'TA_SITIO_URL', plugin_dir_url( __FILE__ ) );

require_once TA_SITIO_DIR . 'inc/ajustes.php';
require_once TA_SITIO_DIR . 'inc/sitio.php';
require_once TA_SITIO_DIR . 'inc/fotos.php';
require_once TA_SITIO_DIR . 'inc/correos.php';
require_once TA_SITIO_DIR . 'inc/solicitudes.php';
require_once TA_SITIO_DIR . 'inc/gestor.php';

register_activation_hook( __FILE__, 'ta_sitio_activar' );
register_deactivation_hook( __FILE__, 'ta_sitio_desactivar' );
