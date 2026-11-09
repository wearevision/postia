# Rendimiento y aprendizaje: diseño

> 9 de noviembre de 2026. Pedido de Federico: que PostIA aprenda qué publicaciones rinden mejor y use eso para
> escribir piezas nuevas y proponer mejoras a las programadas; y un importador de estadísticas para verlas en la app.

## Objetivo

Que cada cuenta escriba más parecido a lo que le funciona. Métrica principal: **tasa de interacción**
(interacciones ÷ impresiones) de cada publicación, comparada con la mediana de su cuenta. Las impresiones se muestran
como segundo dato (alcance), sin usarse para aprender.

## Decisión que cambia: D12

Antes: sin métricas hasta la API de LinkedIn; sin entrada a mano.
Ahora (9 de noviembre de 2026): **dos caminos**.

- **Principal:** la API de LinkedIn, cuando apruebe Community Management (página y `r_member_postAnalytics`).
- **Opcional:** importar a mano el XLSX que exporta LinkedIn, mientras no haya API o para lo que la API no traiga.

Cada número guarda su origen (`api` o `importacion`). Si una publicación tiene ambos, vale el de la API.

## Lo que trae el archivo de LinkedIn (perfil)

Probado con `AnalisisConjunto_Federico_Elgueta_Edwards_2025-11-10_2026-11-09.xlsx`.

| Hoja | Contenido | Uso |
|---|---|---|
| PUBLICACIONES PRINCIPALES | Hasta 50 publicaciones: URL, fecha, interacciones (izquierda) e impresiones (derecha), en dos listas que pueden no coincidir | Cifras por publicación |
| INTERACCIÓN | Impresiones e interacciones por día | Tendencia mensual |
| SEGUIDORES | Total y nuevos por día | Tendencia mensual |
| DESCUBRIMIENTO | Totales del período | Encabezado del informe |
| INFORMACIÓN DETALLADA DEL PÚBLICO / DEL CONTENIDO | Top 10 por categoría (empresa, cargo, sector, ubicación, tamaño de empresa, nivel de responsabilidad) con su porcentaje; «público» son los seguidores y «contenido» quienes vieron las publicaciones | Se guarda (decidido por Federico el 9 de noviembre de 2026): son agregados, sin personas |

- La URL trae el identificador de la publicación: `…-share-7395845008874020865-…` o `…-ugcPost-7396634456431751170-…`.
  Equivale al `post_urn` que PostIA guarda al publicar (`urn:li:share:…` / `urn:li:ugcPost:…`): el cruce es exacto.
- El archivo de prueba trae **12** publicaciones en el año. La muestra es chica: ver «Aprendizajes».
- El archivo de la página de WAV tiene otro formato: entra en un bloque aparte (bloque 6).

## Bloques (un PR cada uno, pruebas primero)

### 1. Importador del perfil

- Pantalla en Ajustes → «Importar estadísticas»: subo el XLSX y elijo la cuenta (perfil de Federico).
- Se lee en el servidor; el archivo no se guarda, solo lo que se extrae.
- Por cada publicación de la lista: URN (desde la URL), fecha, interacciones e impresiones. Si sale en una sola de las
  dos listas, la otra cifra queda vacía, no en cero.
- Cruce por URN con las piezas publicadas de esa cuenta. Las que no son de PostIA se guardan aparte como
  «anteriores», sin texto.
- Totales diarios de impresiones, interacciones y seguidores, para la tendencia.
- Información detallada del público: por cada importación, cada fila de las dos hojas (tipo «público» o «contenido»,
  categoría, valor y porcentaje). «< 1 %» se guarda como menor a 1, no como cero.
- **Idempotente:** reimportar el mismo período actualiza las cifras, no duplica. Cada importación guarda su fecha y
  período.
- Errores en palabras de Federico: archivo que no es de LinkedIn, hoja faltante, cuenta equivocada (si ninguna URL
  calza con esa cuenta, se avisa antes de guardar).

**Tablas nuevas:** `metricas_de_publicacion` (cuenta, URN, pieza si la hay, fecha, interacciones, impresiones, origen,
leída_en), `metricas_diarias` (cuenta, día, impresiones, interacciones, seguidores_nuevos, origen) e
`importaciones_de_metricas` (cuenta, período, filas, creada_por) y `publico_de_la_cuenta` (importación, tipo, categoría,
valor, porcentaje, menor_a_uno). RLS: solo el dueño de la marca.

### 2. Pantalla «Rendimiento»

- Por cuenta: lista de publicaciones con fecha, extracto, tasa de interacción e impresiones; se ordena por cualquiera.
- Marca las 3 mejores y las 3 peores frente a la mediana.
- Tendencia mensual de impresiones, interacciones y seguidores.
- «Tu público»: el top de cada categoría, separando seguidores y quienes vieron; si hay dos importaciones, muestra qué
  subió o bajó.
- **Empresas: potenciales clientes y alianzas.** Las empresas del público se cruzan con `data/casos/casos.json`:
  las que ya son clientes se marcan como tales; las demás aparecen como potenciales. Claude sugiere para cada potencial
  si es cliente o alianza posible y por qué, con lo que sabe del rubro y de los casos de WAV. Federico las marca
  (interesa, descartar). Nada sale de la app: no se contacta a nadie ni se busca en LinkedIn.
- Aviso visible cuando hay menos de 8 publicaciones con cifras: «Todavía son pocas para sacar conclusiones».
- «Anteriores a PostIA»: se pueden completar pegando su texto a mano (para las 10 mejores), así entran al aprendizaje.

### 3. Aprendizajes

- **Rasgos calculados con código** de cada publicación: formato, pilar, número de láminas, largo del texto, si abre
  con una cifra, si tiene enlace, día y hora.
- Por rasgo, la app compara la tasa de las publicaciones que lo tienen contra las que no. Propone un aprendizaje solo
  si lo respaldan **al menos 8 publicaciones**; con menos, aparece como «pista», sin usarse al escribir.
- **Lectura de Claude** (una por importación): recibe el texto y las cifras de cada publicación importada, la mediana
  y los rasgos; devuelve aprendizajes en palabras de Federico, cada uno con las publicaciones que lo respaldan.
- Federico aprueba, edita o descarta cada aprendizaje, por ejemplo «Los carruseles con cifra en la portada funcionan
  mejor que los de pregunta». Con menos de 8 publicaciones de respaldo queda como «pista».
- Tabla `aprendizajes` (cuenta, texto, rasgo, respaldo, estado: propuesto/aprobado/descartado/pista).

### 4. Uso al escribir

- Los aprendizajes **aprobados** de la cuenta entran al contexto de redacción como sección «Lo que funciona en esta
  cuenta», junto a la línea editorial.
- Aplica al escribir piezas nuevas (series, ideas del domingo, encargos).

### 5. Mejoras a piezas programadas

- Después de cada importación que deje aprendizajes nuevos aprobados, la app elige **hasta 3 piezas por semana** que
  salen en más de 48 horas y les propone una versión revisada, con el porqué en una línea.
- Si Federico la acepta, es una **versión nueva**: la firma anterior se cae y la pieza vuelve a la puerta que le toca
  (texto en puerta 1; si tiene diseño pagado, diseño otra vez). Si la descarta, la pieza sigue como estaba.
- Nunca cambia sola una pieza firmada.

### 6. Importador de la página de WAV

Mismo flujo con el formato del archivo de estadísticas de páginas. Se diseña cuando haya un archivo de ejemplo.

## Reglas que se mantienen

- **Estadísticas y Claude (regla cambiada el 9 de noviembre de 2026).** Lo importado desde el XLSX de la cuenta de
  Federico sí llega a Claude: cifras de nuestras publicaciones y el público agregado, con nombres de empresa. Lo que
  llegue por la API de LinkedIn sigue fuera de Claude (Developer AI Policy) hasta revisar la documentación vigente y
  que Federico lo apruebe.
- Se publica exactamente la versión firmada; si cambia, la firma se cae.
- Tope de gasto: los bloques 1 y 2 no llaman a Claude; los aprendizajes y las sugerencias de empresas son una llamada
  por importación. El bloque 5 cuesta una redacción por pieza propuesta
  (máximo 3 por semana) y pasa por el tope mensual, con cobro único por intento.
- Datos que llegan por la API: dentro de los plazos de guardado de LinkedIn (actividad de miembros 48 h, reportes de
  la página 1 año).

## Decisiones de la revisión

1. **Plazo de las cifras importadas.** Decidido por Federico el 9 de noviembre de 2026: se guardan sin vencimiento,
   con su origen, y se pueden borrar desde Rendimiento.
2. **Aprendizajes con Claude.** Decidido por Federico el 9 de noviembre de 2026: opción B. Además de los rasgos
   calculados con código, Claude recibe los textos con sus cifras y la mediana de la cuenta, y describe qué tienen en
   común los que funcionan (tono, tipo de historia, gancho). Una llamada por importación, dentro del tope de gasto.

## Pruebas

- Unitarias: lector del XLSX con el archivo de ejemplo anonimizado (URL → URN, listas desparejas, hojas faltantes),
  cálculo de rasgos, mediana y umbral de 8, contexto de redacción con aprendizajes aprobados.
- Integración (Supabase local): importación idempotente, cruce con piezas, RLS de las tablas nuevas, versión nueva al
  aceptar una mejora (la firma se cae).
- E2E iPhone: importar un archivo y ver la pantalla Rendimiento.
