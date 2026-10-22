/* Gestor de solicitudes (escritorio de WordPress): respuestas rápidas, adjuntos de la biblioteca de medios y firma. */
(function ($) {
  /* Respuesta rápida: llena el mensaje (si ya hay texto, pregunta antes de reemplazarlo) */
  $(document).on('change', '[data-ta-plantilla]', function () {
    var texto = $(this).find(':selected').data('texto');
    var $m = $('#ta-r-mensaje');
    if (!texto) return;
    if ($.trim($m.val()) && !window.confirm('¿Reemplazar el mensaje escrito por esta respuesta rápida?')) { $(this).val(''); return; }
    $m.val(texto).trigger('focus');
  });

  /* Adjuntos: imágenes o archivos de la biblioteca de medios (se pueden subir ahí mismo) */
  var marco;
  $(document).on('click', '[data-ta-adjuntar]', function (e) {
    e.preventDefault();
    var $caja = $(this).closest('[data-ta-adjuntos]');
    marco = marco || wp.media({ title: 'Adjuntar a la respuesta', button: { text: 'Adjuntar' }, multiple: 'add' });
    marco.off('select').on('select', function () {
      var $ids = $caja.find('[data-ta-adjuntos-ids]');
      var ids = $ids.val() ? $ids.val().split(',') : [];
      marco.state().get('selection').each(function (a) {
        var d = a.toJSON();
        if (ids.indexOf(String(d.id)) > -1) return;
        ids.push(String(d.id));
        var vista = d.type === 'image' ? '<img src="' + (d.sizes && d.sizes.thumbnail ? d.sizes.thumbnail.url : d.url) + '" alt="">' : '<span class="dashicons dashicons-media-default"></span>';
        $caja.find('[data-ta-adjuntos-lista]').append($('<li>').attr('data-id', d.id).append(vista, $('<span class="ta-nombre">').text(d.filename), '<button type="button" class="button-link ta-quitar" aria-label="Quitar">×</button>'));
      });
      $ids.val(ids.join(','));
    });
    marco.open();
  });
  $(document).on('click', '.ta-quitar', function () {
    var $li = $(this).closest('li');
    var $ids = $li.closest('[data-ta-adjuntos]').find('[data-ta-adjuntos-ids]');
    $ids.val($ids.val().split(',').filter(function (x) { return x !== String($li.data('id')); }).join(','));
    $li.remove();
  });

  /* Enviar: el mensaje no puede ir vacío */
  $(document).on('click', '[data-ta-enviar]', function (e) {
    if (!$.trim($('#ta-r-mensaje').val())) { e.preventDefault(); window.alert('Escribe un mensaje antes de enviar.'); $('#ta-r-mensaje').trigger('focus'); return; }
    if (!window.confirm('¿Enviar esta respuesta a la persona?')) e.preventDefault();
  });

  /* Firma: elegir o subir la imagen (ajustes) */
  var marcoFirma;
  $(document).on('click', '[data-ta-firma-elegir]', function (e) {
    e.preventDefault();
    var $caja = $(this).closest('[data-ta-firma]');
    marcoFirma = marcoFirma || wp.media({ title: 'Imagen de la firma', button: { text: 'Usar esta imagen' }, library: { type: 'image' }, multiple: false });
    marcoFirma.off('select').on('select', function () {
      var d = marcoFirma.state().get('selection').first().toJSON();
      $caja.find('[data-ta-firma-id]').val(d.id);
      $caja.find('[data-ta-firma-vista]').html('<img src="' + (d.sizes && d.sizes.medium ? d.sizes.medium.url : d.url) + '" alt="">');
      $caja.find('[data-ta-firma-quitar]').prop('hidden', false);
      $caja.find('[data-ta-firma-elegir]').text('Cambiar imagen');
    });
    marcoFirma.open();
  });
  $(document).on('click', '[data-ta-firma-quitar]', function (e) {
    e.preventDefault();
    var $caja = $(this).closest('[data-ta-firma]');
    $caja.find('[data-ta-firma-id]').val('0');
    $caja.find('[data-ta-firma-vista]').empty();
    $(this).prop('hidden', true);
    $caja.find('[data-ta-firma-elegir]').text('Subir o elegir imagen');
  });
})(jQuery);
