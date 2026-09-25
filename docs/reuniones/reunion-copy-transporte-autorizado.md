# Reunión: copy de Transporte autorizado. Decisiones

Síntesis de las ideas y decisiones tomadas al revisar los textos de `transporte-autorizado.html`. El copy final está en [copy/transporte-autorizado.md](../copy/transporte-autorizado.md).

## Diagnóstico
- En Chile hay poca publicidad y poco posicionamiento en gestión de residuos. Al buscar «reciclaje» aparecen empresas genéricas. Hay espacio para una página que venda con claridad.
- El público es **empresarial**, no de hogar. El usuario típico es un **prevencionista en terreno**: quiere sacar una foto, mandarla y resolver.

## Decisiones de negocio
1. **Prioridad al retiro.** El 80 % de los ingresos viene del retiro de residuos, el 10 % de la suscripción de gestores y transportistas, y el 10 % de los permisos. La parte superior de la página empuja a **cotizar un retiro**. Gestores y permisos van como líneas secundarias más abajo.
2. **Imagen del hero:** tres vehículos (camión grande, camión mediano y camioneta). Transmite de inmediato «transporte de residuos».
3. **Promesas que se repiten en toda la página:** el texto siempre dice «te lo hacemos».
   - «Nos hacemos cargo de tus residuos» (principal).
   - «Coordinamos todo el proceso, de principio a fin».
   - «Siempre recibes el respaldo de cada gestión»: certificados y respaldos tributarios en menos de **48 h** (24 h se consideró una promesa demasiado exigente).
4. **Clientes permanentes y esporádicos:** se ofrece un plan de retiro periódico. Se prefiere «optimizamos» a «planificamos», porque sugiere ahorro. La promesa «al menor costo» queda en evaluación, para no posicionarse como la opción barata.

## Modalidades de retiro
Tomado del modelo de niveles de Uber:

| Modalidad | Idea |
|---|---|
| Express | Urgencias y emergencias, prioridad dentro de 24 h, tarifa mayor. |
| Programado (plan mensual) | Contrato de servicio con retiros organizados mes a mes. |
| Espera y ahorra | El cliente da opciones de fecha y se coordina según la disponibilidad del servicio. Tarifa menor. |

## Criterios de redacción
- Decir **gestor autorizado** o **transportista autorizado**, no «operador».
- Escribir en español de Chile y en lenguaje directo, sin detalle operativo interno en las tarjetas («revisamos acceso, destino…»). Ese detalle es parte de la gestión y el cliente no necesita leerlo.
- Todas las tarjetas terminan en una acción concreta (Cotizar retiro, Buscar transportista, Hablar con un especialista).
- En residuos peligrosos, pedir de forma explícita una **fotografía y antecedentes técnicos** (HDS/FDS, análisis).

## Canales y formulario
- **WhatsApp** es el canal más rápido y permite enviar fotos. Se ofrece junto al formulario.
- El **formulario se mantiene siempre**, porque junta datos completos y validables y puede derivarse a un tercero o al transportista como **ficha de retiro**.
- Datos imprescindibles: empresa, **nombre y teléfono de contacto**, correo, comuna y dirección, fecha estimada.
- Campos agregados en la reunión:
  - **Horario de retiro** con rango «desde / hasta».
  - **Condiciones especiales de acceso**, con ejemplos (bodega subterránea, altura máxima, acceso de camión, grúa…). Es una causa frecuente de retiros fallidos.
  - **Correo al que enviar la ficha de retiro**, para derivarla a un tercero.

## Pendientes
- **Chatbot con IA que analice fotos:** se pospone por el costo en tokens. Por ahora el flujo guiado del chatbot funciona sin analizar imágenes.
- **Destino del formulario:** falta definir el correo que recibe las solicitudes.
- **Campos del formulario:** el copy final no incluye el horario de retiro (rango), el correo para la ficha de retiro ni «Espera y ahorra». Hay que decidir si se agregan.
