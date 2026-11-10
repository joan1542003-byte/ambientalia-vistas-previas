<?php
/**
 * Plugin Name: Ambientalia · Asistente IA
 * Description: Burbuja «?» de Ambientalia con Contacto, WhatsApp y Chat con IA, presente en todas las páginas del sitio (también las hechas con Elementor). La dirección del asistente se configura en Ajustes → Asistente IA.
 * Version: 1.2.0
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Author: Ambientalia
 * Text Domain: ambientalia-asistente
 *
 * La burbuja y su ventana viven en assets/asistente.js y assets/asistente.css; la ventana se arma dentro de un
 * Shadow DOM, así los estilos del tema y de Elementor no la alteran ni ella altera el sitio. El navegador conversa
 * directo con el asistente (POST /api/chat/sessions, /api/chat/messages, GET /api/chat/history, DELETE
 * /api/chat/session), el mismo contrato del asistente de Transporte Autorizado. WordPress solo entrega la dirección.
 * Ninguna dirección ni clave va dentro del plugin: se ponen en los ajustes de cada instalación.
 */

if (!defined('ABSPATH')) {
    exit;
}

define('AMB_ASISTENTE_VERSION', '1.2.0');
define('AMB_ASISTENTE_OPCION', 'amb_asistente');

/** Ajustes con sus valores por omisión. */
function amb_asistente_ajustes() {
    $porDefecto = [
        'activo' => 1,
        'asistente' => '',
        'turnstile' => '',
        'whatsapp' => '56983082096',
        'contacto' => '',
        'posicion' => 'derecha',
    ];
    $guardado = get_option(AMB_ASISTENTE_OPCION, []);
    return array_merge($porDefecto, is_array($guardado) ? $guardado : []);
}

/**
 * Dirección del asistente: https (http solo para localhost), sin usuario, clave, consulta ni fragmento, y sin barra
 * final. Si no cumple, queda vacía y la burbuja dice que el asistente no está disponible.
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

function amb_asistente_sanear($v) {
    $v = is_array($v) ? $v : [];
    $limpio = [
        'activo' => empty($v['activo']) ? 0 : 1,
        'asistente' => amb_asistente_limpiar_url($v['asistente'] ?? ''),
        'turnstile' => preg_replace('/[^A-Za-z0-9_-]/', '', (string) ($v['turnstile'] ?? '')),
        'whatsapp' => preg_replace('/\D/', '', (string) ($v['whatsapp'] ?? '')),
        'contacto' => esc_url_raw(trim((string) ($v['contacto'] ?? ''))),
        'posicion' => ($v['posicion'] ?? '') === 'izquierda' ? 'izquierda' : 'derecha',
    ];
    if ($limpio['whatsapp'] !== '' && (strlen($limpio['whatsapp']) < 8 || strlen($limpio['whatsapp']) > 15)) {
        $limpio['whatsapp'] = '';
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

function amb_asistente_pagina() {
    if (!current_user_can('manage_options')) {
        return;
    }
    $a = amb_asistente_ajustes();
    $n = AMB_ASISTENTE_OPCION;
    ?>
    <div class="wrap">
        <h1>Asistente IA</h1>
        <p>La burbuja «?» aparece en todas las páginas públicas del sitio, con Contacto, WhatsApp y Chat con IA. Sin dirección del asistente, el chat dice que no está disponible por ahora.</p>
        <form method="post" action="options.php">
            <?php settings_fields('amb_asistente'); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row">Burbuja</th>
                    <td><label><input type="checkbox" name="<?php echo esc_attr($n); ?>[activo]" value="1" <?php checked($a['activo'], 1); ?>> Mostrar la burbuja en el sitio</label></td>
                </tr>
                <tr>
                    <th scope="row"><label for="amb-asistente-url">Dirección del asistente</label></th>
                    <td>
                        <input type="url" id="amb-asistente-url" class="regular-text code" name="<?php echo esc_attr($n); ?>[asistente]" value="<?php echo esc_attr($a['asistente']); ?>" placeholder="https://asistente.ejemplo.cl">
                        <p class="description">La dirección base del servicio, sin barra final (por ejemplo, <code>https://asistente.ambientalia.cl</code>). La ventana llama a <code>/api/chat/…</code> sobre ella. El servicio debe aceptar este sitio como origen (<code><?php echo esc_html(home_url()); ?></code>).</p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="amb-asistente-turnstile">Clave pública de Turnstile</label></th>
                    <td>
                        <input type="text" id="amb-asistente-turnstile" class="regular-text code" name="<?php echo esc_attr($n); ?>[turnstile]" value="<?php echo esc_attr($a['turnstile']); ?>">
                        <p class="description">Opcional. Solo si el asistente exige la verificación de Cloudflare Turnstile. La clave secreta nunca va aquí.</p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="amb-asistente-wa">WhatsApp</label></th>
                    <td>
                        <input type="text" id="amb-asistente-wa" class="regular-text" name="<?php echo esc_attr($n); ?>[whatsapp]" value="<?php echo esc_attr($a['whatsapp']); ?>" inputmode="numeric" placeholder="56912345678">
                        <p class="description">Con código de país y sin «+». Es la acción «WhatsApp» de la burbuja; vacío, no se muestra.</p>
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="amb-asistente-contacto">Página de contacto</label></th>
                    <td>
                        <input type="url" id="amb-asistente-contacto" class="regular-text" name="<?php echo esc_attr($n); ?>[contacto]" value="<?php echo esc_attr($a['contacto']); ?>" placeholder="<?php echo esc_attr(home_url('/contacto/')); ?>">
                        <p class="description">La acción «Contacto» de la burbuja. Vacío: <code><?php echo esc_html(home_url('/contacto/')); ?></code>.</p>
                    </td>
                </tr>
                <tr>
                    <th scope="row">Posición</th>
                    <td>
                        <label><input type="radio" name="<?php echo esc_attr($n); ?>[posicion]" value="derecha" <?php checked($a['posicion'], 'derecha'); ?>> Abajo a la derecha</label><br>
                        <label><input type="radio" name="<?php echo esc_attr($n); ?>[posicion]" value="izquierda" <?php checked($a['posicion'], 'izquierda'); ?>> Abajo a la izquierda</label>
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
    $config = [
        'asistente' => $a['asistente'],
        'turnstile' => $a['turnstile'],
        'whatsapp' => $a['whatsapp'],
        'contacto' => $a['contacto'] !== '' ? $a['contacto'] : home_url('/contacto/'),
        'posicion' => $a['posicion'],
        'css' => $base . 'asistente.css?ver=' . AMB_ASISTENTE_VERSION,
    ];
    wp_add_inline_script('amb-asistente', 'window.AMB_ASISTENTE=' . wp_json_encode($config) . ';', 'before');
    wp_enqueue_script('amb-asistente');
});
