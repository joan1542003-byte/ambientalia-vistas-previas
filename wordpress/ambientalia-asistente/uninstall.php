<?php
/* Al borrar el plugin desde WordPress, se van también sus ajustes. */
if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}
delete_option('amb_asistente');
delete_option('amb_asistente_version');
