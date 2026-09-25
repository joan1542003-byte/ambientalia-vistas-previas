# Catálogo visual: categorías de residuos

Biblioteca de **23 imágenes WebP individuales** para las categorías del selector/buscador de Transporte Autorizado: 13 no peligrosas y 10 peligrosas. Todas tienen encuadre cuadrado, fondo simple e iluminación degradada sutil. Los recursos están en `assets/transporte/` para que el HTML estático del preview pueda cargarlos sin dependencias externas.

La categoría descrita en el nombre corresponde al catálogo de filtros de transportistas de referencia. **La fotografía no determina la clasificación ni demuestra que un residuo sea seguro, peligroso, aceptado por un gestor o transportable bajo una condición determinada.** La clasificación real depende de la información y caracterización aplicables al residuo.

## No peligrosos

| Categoría | Archivo |
|---|---|
| Aceites y grasas | [residuo-np-aceites-grasas.webp](../assets/transporte/residuo-np-aceites-grasas.webp) |
| Construcción y demolición | [residuo-np-construccion-demolicion.webp](../assets/transporte/residuo-np-construccion-demolicion.webp) |
| Lodos y aguas | [residuo-np-lodos-aguas.webp](../assets/transporte/residuo-np-lodos-aguas.webp) |
| Madera | [residuo-np-madera.webp](../assets/transporte/residuo-np-madera.webp) |
| Metales | [residuo-np-metales.webp](../assets/transporte/residuo-np-metales.webp) |
| Neumáticos y caucho | [residuo-np-neumaticos-caucho.webp](../assets/transporte/residuo-np-neumaticos-caucho.webp) |
| Orgánicos y alimentos | [residuo-np-organicos-alimentos.webp](../assets/transporte/residuo-np-organicos-alimentos.webp) |
| Otros residuos no peligrosos | [residuo-np-otros-residuos.webp](../assets/transporte/residuo-np-otros-residuos.webp) |
| Papel y cartón | [residuo-np-papel-carton.webp](../assets/transporte/residuo-np-papel-carton.webp) |
| Plásticos | [residuo-np-plasticos.webp](../assets/transporte/residuo-np-plasticos.webp) |
| RAEE y electrónicos | [residuo-np-raee-electronicos.webp](../assets/transporte/residuo-np-raee-electronicos.webp) |
| Textiles y cuero | [residuo-np-textiles-cuero.webp](../assets/transporte/residuo-np-textiles-cuero.webp) |
| Vidrio | [residuo-np-vidrio.webp](../assets/transporte/residuo-np-vidrio.webp) |

## Peligrosos

| Categoría | Archivo |
|---|---|
| Aceites e hidrocarburos | [residuo-p-aceites-hidrocarburos.webp](../assets/transporte/residuo-p-aceites-hidrocarburos.webp) |
| Asbesto | [residuo-p-asbesto.webp](../assets/transporte/residuo-p-asbesto.webp) |
| Baterías y pilas | [residuo-p-baterias-pilas.webp](../assets/transporte/residuo-p-baterias-pilas.webp) |
| Envases y materiales contaminados | [residuo-p-envases-materiales-contaminados.webp](../assets/transporte/residuo-p-envases-materiales-contaminados.webp) |
| Gases y refrigerantes | [residuo-p-gases-refrigerantes.webp](../assets/transporte/residuo-p-gases-refrigerantes.webp) |
| Lodos, aguas y suelos | [residuo-p-lodos-aguas-suelos.webp](../assets/transporte/residuo-p-lodos-aguas-suelos.webp) |
| Metales y metales pesados | [residuo-p-metales-pesados.webp](../assets/transporte/residuo-p-metales-pesados.webp) |
| Químicos, solventes y pinturas | [residuo-p-quimicos-solventes-pinturas.webp](../assets/transporte/residuo-p-quimicos-solventes-pinturas.webp) |
| RAEE, luminarias y mercurio | [residuo-p-raee-luminarias-mercurio.webp](../assets/transporte/residuo-p-raee-luminarias-mercurio.webp) |
| Residuos clínicos y farmacéuticos | [residuo-p-residuos-clinicos-farmaceuticos.webp](../assets/transporte/residuo-p-residuos-clinicos-farmaceuticos.webp) |

## Uso y estilo

- Mantener los archivos separados y sin repetir la misma imagen entre los tres sitios.
- Las imágenes peligrosas usan un fondo rojo/ámbar sutil; las no peligrosas, un fondo verde apagado. Es una clave visual de interfaz, no un código de clasificación reglamentario.
- Mostrar las imágenes con `object-fit: cover` dentro de sus tarjetas y usar `alt` según el contexto. Si la imagen es puramente decorativa, dejar `alt=""`.
- No añadir pictogramas, rótulos ni afirmaciones legales sobreimpresas.
- Las imágenes son ilustrativas y no representan gestores, instalaciones, autorizaciones o evidencia técnica real.
