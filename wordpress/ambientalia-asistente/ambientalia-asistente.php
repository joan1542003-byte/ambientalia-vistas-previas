<?php
/**
 * Plugin Name: Ambientalia · Asistente IA
 * Description: Burbuja «?» de Ambientalia con Contacto, WhatsApp y Chat con IA, presente en todas las páginas del sitio (también las hechas con Elementor). Se configura en Ajustes → Asistente IA.
 * Version: 1.3.0
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Author: Ambientalia
 * Text Domain: ambientalia-asistente
 *
 * La burbuja y su ventana viven en assets/asistente.js y assets/asistente.css; la ventana se arma dentro de un
 * Shadow DOM, así los estilos del tema y de Elementor no la alteran ni ella altera el sitio. El navegador conversa
 * directo con el asistente (POST /api/chat/sessions, /api/chat/messages, GET /api/chat/history, DELETE
 * /api/chat/session), el mismo contrato del asistente de Transporte Autorizado. WordPress solo entrega los ajustes.
 * Ninguna dirección ni clave va dentro del plugin: se ponen en los ajustes de cada instalación.
 */

if (!defined('ABSPATH')) {
    exit;
}

define('AMB_ASISTENTE_VERSION', '1.3.0');
define('AMB_ASISTENTE_OPCION', 'amb_asistente');

/** Ajustes con sus valores por omisión (los guardados por versiones anteriores se completan con estos). */
function amb_asistente_por_defecto() {
    return [
        'activo' => 1,
        'posicion' => 'derecha',
        'leyenda' => '¿En qué te ayudamos?',
        'destacada' => 'contacto',
        'chat_activo' => 1,
        'chat_texto' => 'Chat con IA',
        'asistente' => '',
        'turnstile' => '',
        'wa_activo' => 1,
        'wa_texto' => 'WhatsApp',
        'whatsapp' => '56983082096',
        'wa_mensaje' => 'Hola, me gustaría recibir más información.',
        'contacto_activo' => 1,
        'contacto_texto' => 'Contacto',
        'contacto' => '',
    ];
}

function amb_asistente_ajustes() {
    $guardado = get_option(AMB_ASISTENTE_OPCION, []);
    return array_merge(amb_asistente_por_defecto(), is_array($guardado) ? $guardado : []);
}

/**
 * Dirección del asistente: https (http solo para localhost), sin usuario, clave, consulta ni fragmento, y sin barra
 * final. Si no cumple, queda vacía y el chat dice que el asistente no está disponible.
 */
function amb_asistente_limpiar_url($url) {
    $url = trim((string) $url);
    if ($url === '') {
        return '';
    }
    $p = wp_parse_url($url);
    if (!$p || empty($p['scheme']) || empty($p['host'])) {
        return '';
    }
    $local = in_array($p['host'], ['localhost', '127.0.0.1'], true);
    if ($p['scheme'] !== 'https' && !($local && $p['scheme'] === 'http')) {
        return '';
    }
    if (isset($p['user']) || isset($p['pass']) || isset($p['query']) || isset($p['fragment'])) {
        return '';
    }
    $base = $p['scheme'] . '://' . strtolower($p['host']) . (isset($p['port']) ? ':' . (int) $p['port'] : '');
    $ruta = isset($p['path']) ? rtrim($p['path'], '/') : '';
    return esc_url_raw($base . $ruta);
}

/** Un texto corto de una línea; vacío, vuelve al valor por omisión. */
function amb_asistente_texto($valor, $max, $defecto) {
    $t = trim(sanitize_text_field((string) $valor));
    if ($t === '') {
        return $defecto;
    }
    return function_exists('mb_substr') ? mb_substr($t, 0, $max) : substr($t, 0, $max);
}

function amb_asistente_sanear($v) {
    $v = is_array($v) ? $v : [];
    $d = amb_asistente_por_defecto();
    $limpio = [
        'activo' => empty($v['activo']) ? 0 : 1,
        'posicion' => ($v['posicion'] ?? '') === 'izquierda' ? 'izquierda' : 'derecha',
        'leyenda' => amb_asistente_texto($v['leyenda'] ?? '', 40, $d['leyenda']),
        'destacada' => in_array($v['destacada'] ?? '', ['contacto', 'whatsapp', 'ninguna'], true) ? $v['destacada'] : 'contacto',
        'chat_activo' => empty($v['chat_activo']) ? 0 : 1,
        'chat_texto' => amb_asistente_texto($v['chat_texto'] ?? '', 30, $d['chat_texto']),
        'asistente' => amb_asistente_limpiar_url($v['asistente'] ?? ''),
        'turnstile' => preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($v['turnstile'] ?? '')),
        'wa_activo' => empty($v['wa_activo']) ? 0 : 1,
        'wa_texto' => amb_asistente_texto($v['wa_texto'] ?? '', 30, $d['wa_texto']),
        'whatsapp' => preg_replace('/\D/', '', (string) ($v['whatsapp'] ?? '')),
        'wa_mensaje' => amb_asistente_texto($v['wa_mensaje'] ?? '', 300, $d['wa_mensaje']),
        'contacto_activo' => empty($v['contacto_activo']) ? 0 : 1,
        'contacto_texto' => amb_asistente_texto($v['contacto_texto'] ?? '', 30, $d['contacto_texto']),
        'contacto' => esc_url_raw(trim((string) ($v['contacto'] ?? ''))),
    ];
    if ($limpio['whatsapp'] !== '' && (strlen($limpio['whatsapp']) < 8 || strlen($limpio['whatsapp']) > 15)) {
        $limpio['whatsapp'] = '';
        add_settings_error(AMB_ASISTENTE_OPCION, 'amb-wa', 'El número de WhatsApp no se guardó: debe tener entre 8 y 15 dígitos, con código de país (por ejemplo, 56912345678).');
    }
    if (!empty($v['asistente']) && $limpio['asistente'] === '') {
        add_settings_error(AMB_ASISTENTE_OPCION, 'amb-url', 'La dirección del asistente no se guardó: debe empezar con https:// y no llevar consulta (?…), fragmento (#…) ni datos de acceso.');
    }
    amb_asistente_vaciar_caches();
    return $limpio;
}

/** Al cambiar los ajustes o la versión, las cachés de páginas (LiteSpeed, WP Rocket, W3TC…) deben mostrar lo nuevo. */
function amb_asistente_vaciar_caches() {
    do_action('litespeed_purge_all');
    if (function_exists('rocket_clean_domain')) {
        rocket_clean_domain();
    }
    if (function_exists('w3tc_flush_all')) {
        w3tc_flush_all();
    }
    if (function_exists('wp_cache_clear_cache')) {
        wp_cache_clear_cache();
    }
}

add_action('admin_init', function () {
    if (get_option('amb_asistente_version') !== AMB_ASISTENTE_VERSION) {
        update_option('amb_asistente_version', AMB_ASISTENTE_VERSION);
        amb_asistente_vaciar_caches();
    }
    register_setting('amb_asistente', AMB_ASISTENTE_OPCION, ['sanitize_callback' => 'amb_asistente_sanear']);
});

/* ---------- Ajustes → Asistente IA ---------- */

add_action('admin_menu', function () {
    add_options_page('Asistente IA', 'Asistente IA', 'manage_options', 'amb-asistente', 'amb_asistente_pagina');
});

add_filter('plugin_action_links_' . plugin_basename(__FILE__), function ($enlaces) {
    array_unshift($enlaces, '<a href="' . esc_url(admin_url('options-general.php?page=amb-asistente')) . '">Ajustes</a>');
    return $enlaces;
});

/** Campos de la página de ajustes. */
function amb_asistente_casilla($a, $clave, $texto) {
    printf(
        '<label><input type="checkbox" name="%1$s[%2$s]" value="1" %3$s> %4$s</label>',
        esc_attr(AMB_ASISTENTE_OPCION), esc_attr($clave), checked($a[$clave], 1, false), esc_html($texto)
    );
}

function amb_asistente_campo($a, $clave, $tipo = 'text', $clase = 'regular-text', $extra = '') {
    printf(
        '<input type="%1$s" id="amb-%2$s" class="%3$s" name="%4$s[%2$s]" value="%5$s" %6$s>',
        esc_attr($tipo), esc_attr($clave), esc_attr($clase), esc_attr(AMB_ASISTENTE_OPCION), esc_attr($a[$clave]), $extra
    );
}

function amb_asistente_pagina() {
    if (!current_user_can('manage_options')) {
        return;
    }
    $a = amb_asistente_ajustes();
    $n = AMB_ASISTENTE_OPCION;
    $contacto = home_url('/contacto/');
    ?>
    <div class="wrap">
        <h1>Asistente IA</h1>
        <p>La burbuja «?» aparece en todas las páginas públicas del sitio. Al tocarla muestra las acciones que actives aquí: Contacto, WhatsApp y Chat con IA.</p>
        <form method="post" action="options.php">
            <?php settings_fields('amb_asistente'); ?>

            <h2 class="title">Burbuja</h2>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row">Mostrar</th>
                    <td><?php amb_asistente_casilla($a, 'activo', 'Mostrar la burbuja en el sitio'); ?></td>
                </tr>
                <tr>
                    <th scope="row">Posición</th>
                    <td>
                        <label><input type="radio" name="<?php echo esc_attr($n); ?>[posicion]" value="derecha" <?php checked($a['posicion'], 'derecha'); ?>> Abajo a la derecha</label><br>
                        <label><input type="radio" name="<?php echo esc_attr($n); ?>[posicion]" value="izquierda" <?php checked($a['posicion'], 'izquierda'); ?>> Abajo a la izquierda</label>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="amb-leyenda">Texto junto a la X</label></th>
                    <td><?php amb_asistente_campo($a, 'leyenda', 'text', 'regular-text', 'maxlength="40"'); ?></td>
                </tr>
                <tr>
                    <th scope="row">Acción destacada</th>
                    <td>
                        <label><input type="radio" name="<?php echo esc_attr($n); ?>[destacada]" value="contacto" <?php checked($a['destacada'], 'contacto'); ?>> Contacto</label><br>
                        <label><input type="radio" name="<?php echo esc_attr($n); ?>[destacada]" value="whatsapp" <?php checked($a['destacada'], 'whatsapp'); ?>> WhatsApp</label><br>
                        <label><input type="radio" name="<?php echo esc_attr($n); ?>[destacada]" value="ninguna" <?php checked($a['destacada'], 'ninguna'); ?>> Ninguna</label>
                        <p class="description">La que va arriba, en verde.</p>
                    </td>
                </tr>
            </table>

            <h2 class="title">Contacto</h2>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row">Mostrar</th>
                    <td><?php amb_asistente_casilla($a, 'contacto_activo', 'Mostrar «Contacto» en la burbuja'); ?></td>
                </tr>
                <tr>
                    <th scope="row"><label for="amb-contacto_texto">Texto del botón</label></th>
                    <td><?php amb_asistente_campo($a, 'contacto_texto', 'text', 'regular-text', 'maxlength="30"'); ?></td>
                </tr>
                <tr>
                    <th scope="row"><label for="amb-contacto">Página de contacto</label></th>
                    <td>
                        <?php amb_asistente_campo($a, 'contacto', 'url', 'regular-text', 'placeholder="' . esc_attr($contacto) . '"'); ?>
                        <p class="description">Vacío: <code><?php echo esc_html($contacto); ?></code>. También sirve un correo (<code>mailto:contacto@ambientalia.cl</code>).</p>
                    </td>
                </tr>
            </table>

            <h2 class="title">WhatsApp</h2>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row">Mostrar</th>
                    <td><?php amb_asistente_casilla($a, 'wa_activo', 'Mostrar «WhatsApp» en la burbuja'); ?></td>
                </tr>
                <tr>
                    <th scope="row"><label for="amb-wa_texto">Texto del botón</label></th>
                    <td><?php amb_asistente_campo($a, 'wa_texto', 'text', 'regular-text', 'maxlength="30"'); ?></td>
                </tr>
                <tr>
                    <th scope="row"><label for="amb-whatsapp">Número</label></th>
                    <td>
                        <?php amb_asistente_campo($a, 'whatsapp', 'text', 'regular-text', 'inputmode="numeric" placeholder="56912345678"'); ?>
                        <p class="description">Con código de país y sin «+». Sin número, el botón no se muestra.</p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="amb-wa_mensaje">Mensaje inicial</label></th>
                    <td>
                        <?php amb_asistente_campo($a, 'wa_mensaje', 'text', 'large-text', 'maxlength="300"'); ?>
                        <p class="description">El texto que aparece escrito al abrir WhatsApp.</p>
                    </td>
                </tr>
            </table>

            <h2 class="title">Chat con IA</h2>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row">Mostrar</th>
                    <td><?php amb_asistente_casilla($a, 'chat_activo', 'Mostrar «Chat con IA» en la burbuja'); ?></td>
                </tr>
                <tr>
                    <th scope="row"><label for="amb-chat_texto">Texto del botón</label></th>
                    <td><?php amb_asistente_campo($a, 'chat_texto', 'text', 'regular-text', 'maxlength="30"'); ?></td>
                </tr>
                <tr>
                    <th scope="row"><label for="amb-asistente">Dirección del asistente</label></th>
                    <td>
                        <?php amb_asistente_campo($a, 'asistente', 'url', 'regular-text code', 'placeholder="https://asistente.ejemplo.cl"'); ?>
                        <p class="description">La dirección base del servicio, sin barra final (por ejemplo, <code>https://asistente.ambientalia.cl</code>). La ventana llama a <code>/api/chat/…</code> sobre ella. El servicio debe aceptar este sitio como origen (<code><?php echo esc_html(home_url()); ?></code>). Vacía, el chat dice que no está disponible por ahora.</p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="amb-turnstile">Clave pública de Turnstile</label></th>
                    <td>
                        <?php amb_asistente_campo($a, 'turnstile', 'text', 'regular-text code'); ?>
                        <p class="description">Opcional. Solo si el asistente exige la verificación de Cloudflare Turnstile. La clave secreta nunca va aquí.</p>
                    </td>
                </tr>
            </table>

            <?php submit_button('Guardar ajustes'); ?>
        </form>
    </div>
    <?php
}

/* ---------- La burbuja en el sitio ---------- */

/** No en el escritorio ni dentro del editor o la vista previa de Elementor (ahí estorbaría al editar). */
function amb_asistente_va() {
    if (is_admin() || wp_doing_ajax() || is_feed() || (defined('REST_REQUEST') && REST_REQUEST)) {
        return false;
    }
    if (isset($_GET['elementor-preview']) || isset($_GET['elementor_library'])) {
        return false;
    }
    $a = amb_asistente_ajustes();
    return (bool) apply_filters('amb_asistente_mostrar', !empty($a['activo']));
}

add_action('wp_enqueue_scripts', function () {
    if (!amb_asistente_va()) {
        return;
    }
    $a = amb_asistente_ajustes();
    $base = plugin_dir_url(__FILE__) . 'assets/';
    wp_register_script('amb-asistente', $base . 'asistente.js', [], AMB_ASISTENTE_VERSION, ['in_footer' => true, 'strategy' => 'defer']);
    /* Una acción apagada llega vacía: la burbuja no la muestra */
    $config = [
        'posicion' => $a['posicion'],
        'leyenda' => $a['leyenda'],
        'destacada' => $a['destacada'],
        'chat' => !empty($a['chat_activo']),
        'chatTexto' => $a['chat_texto'],
        'asistente' => $a['asistente'],
        'turnstile' => $a['turnstile'],
        'whatsapp' => !empty($a['wa_activo']) ? $a['whatsapp'] : '',
        'waTexto' => $a['wa_texto'],
        'waMensaje' => $a['wa_mensaje'],
        'contacto' => !empty($a['contacto_activo']) ? ($a['contacto'] !== '' ? $a['contacto'] : home_url('/contacto/')) : '',
        'contactoTexto' => $a['contacto_texto'],
        'css' => $base . 'asistente.css?ver=' . AMB_ASISTENTE_VERSION,
    ];
    wp_add_inline_script('amb-asistente', 'window.AMB_ASISTENTE=' . wp_json_encode($config) . ';', 'before');
    wp_enqueue_script('amb-asistente');
});
