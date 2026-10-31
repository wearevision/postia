# Criterios de aceptación: flujo de firma

Qué debe cumplir la app real para dar por buena la firma (puerta 2) y el gasto (puerta 1). Salen del plano, de las reglas del proyecto y de seis críticas de diseño del prototipo (`docs/maquetas/prototipo.html`). Cada criterio es verificable; los marcados **[app real]** no se pueden probar en el prototipo.

Vocabulario fijo: *turno* (periodo del día para firmar), *cupo* (hueco semanal de publicación), *margen* (los 30 min para que salga), *huella* (identifica la versión exacta).

## 1. Puerta de lectura

1. La firma queda **bloqueada** hasta que la persona haya visto las 6 láminas **y** llegado al final del texto del post.
2. El botón bloqueado nombra lo que se firmaría («Firmar WAV · mar 3 nov, 15:00»), muestra un candado y dice la razón al lado («Viste 2 de 6 láminas. Faltan 4 por ver.» o «Falta leer el texto»).
3. Una lámina cuenta como vista solo si está visible al menos al 90 %.
4. «Ver las 6 juntas» abre una hoja que solo marca como vistas las láminas realmente mostradas; su botón de confirmar se habilita al llegar al final, y en pantallas altas, donde no hay nada que desplazar, se habilita al instante porque todas ya se ven.
5. La hoja se cierra con un botón visible y con Escape; mientras está abierta el fondo no es alcanzable con el teclado (`inert`), tiene `aria-modal` y el foco entra en su título.
6. Cuando el texto o las láminas cambian, el estado de lectura se reinicia.

## 2. Firmar

7. Al pulsar el botón aparece «Firmando…» con `aria-busy` y la pantalla no se puede cerrar por error; el cambio de estado se anuncia con una región `aria-live="polite"` que no se reemplaza.
8. La firma guarda texto, pieza, fecha y hora como una sola huella; se publica exactamente esa versión. **[app real: verificar la huella en el servidor]**
9. Firmar no genera gasto y la pantalla lo dice. Si una pieza sí gasta, el costo y el saldo del mes se ven antes del botón.
10. La firma es **idempotente**: reintentar tras un fallo de red no duplica la firma ni el gasto. **[app real]**

## 3. Después de firmar

11. Se ve lo que se firmó: el texto y las láminas, colapsables, con la huella como código copiable.
12. «Deshacer firma» está disponible hasta la hora de salida (un solo modelo; sin cuenta regresiva de 8 s) y deshacer devuelve la pieza a «Por firmar».
13. El botón de la siguiente pieza nombra cuenta, fecha y hora, y no es el elemento más llamativo mientras se muestra la confirmación de la anterior.
14. «Listo por ahora» devuelve a Inicio.

## 4. Firma caída

15. Si cambia el texto o la pieza, la firma se cae: el estado vuelve a «Por firmar», un aviso lo explica y dice qué cambió, y hay que firmar la versión nueva.
16. Si cambia el texto, la puerta de lectura se reinicia (criterio 6).

## 5. Error de red

17. Si falla el guardado, la pantalla dice qué pasó, que no se publicó nada, que el texto está intacto y qué ocurre si no vuelve la conexión antes de la hora de salida (con fecha completa).
18. Ofrece «Reintentar ahora» y «Volver a la pieza»; además reintenta sola y muestra el intento («2 de 3»).
19. El foco se mueve a la alerta cuando aparece. Tras el último intento fallido el estado final es claro. **[app real: cola offline]**
20. Si una pieza no sale dentro del margen, no se publica tarde: vuelve a «Revisar» con la causa y la acción «Volver a firmar». **[app real]**

## 6. Descartar

21. «Descartar pieza» abre una confirmación en la misma pantalla (no un modal) con «Conservar pieza» como acción principal, dice si la pieza ya gastó y se puede ofrecer «dejarla en la reserva» como enlace de texto.
22. Descartar muestra un aviso con «Deshacer» durante varios segundos antes de borrar de forma definitiva.

## 7. Datos y contadores

23. Los contadores («2 de 6 firmadas», «3 por firmar», «Terminaste esta ronda») se calculan siempre desde el estado real, también tras descartar o deshacer.
24. El orden de «Por firmar» es por fecha de salida y coincide con «Firmar la primera», con «Pieza 1 de N» y con «Sigue».
25. Las fechas usan un solo formato («mar 3 nov, 15:00»).

## 8. Gasto

26. El indicador de gasto es visible en el encabezado de cada pantalla, con marca en el 80 %, y abre un desglose por cuenta (si no hace nada, no parece un botón).
27. Al pasar el 80 % aparece un aviso con lo que queda; al llegar a 100 % el botón de gasto se bloquea con la razón y el formulario se inhabilita completo (`fieldset disabled`), con el enlace a Ajustes dentro del aviso y una nota sobre las búsquedas ya pagadas que siguen en curso.

## 9. Accesibilidad y táctil

28. Todo elemento pulsable mide al menos 44 × 44 px (incluidos «Ver las 6 juntas», los enlaces de fuente y las flechas de semana).
29. Un solo estilo de foco: `outline` de 2 px en `primario` con separación de 3 px, también en el carrusel y en `summary`.
30. El carrusel se puede recorrer con las flechas del teclado.
31. Tras cada cambio de vista el foco queda en el título (`tabindex="-1"`) o en la alerta; no cae al `body`.
32. Texto con contraste mínimo de 4,5:1 y controles con borde de 3:1 (`--control`) en claro y oscuro; lo comprueba una prueba automática sobre los tokens.
33. Estado nunca solo por color: palabra y forma (punto, check, triángulo, candado).
34. Texto crítico (reglas del producto) en 13 px o más y fuera de `apagado`.
35. `prefers-reduced-motion` desactiva giros y desplazamiento suave; `prefers-color-scheme` aplica el tema oscuro.

## 10. Ayuda en el lugar

36. «Margen», «turno», «cupo» y «huella» se explican una vez en contexto (detalle plegable o texto de una línea) y hay un glosario corto accesible desde Ajustes.

## Solo con la app real

VoiceOver (orden de lectura y anuncios), safe areas y teclado virtual de iOS, notificaciones push de lo urgente, comportamiento sin conexión real, expiración del deshacer y del margen contra el reloj del servidor, rendimiento del carrusel con inercia táctil y las sombras neumórficas en pantallas OLED.
