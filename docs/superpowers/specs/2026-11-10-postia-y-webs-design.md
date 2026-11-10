# PostIA y las webs: diseño

> 10 de noviembre de 2026. Pedido de Federico: unir PostIA con las webs para aumentar el tráfico y encontrar clientes.
> Lo que se publica de investigación lleva a wr3.wearevision.cl; lo de BTL, a wearevision.cl.

## Objetivo

Que cada post pueda llevar a una página concreta de la web que corresponde, y que cada visita y cada conversación de
WhatsApp que llegue digan qué pieza la trajo. Sin que la app responda ni escriba mensajes: solo publica (regla del
proyecto). Medida de éxito: visitas por pieza en la analítica y contactos con «ref.» en WhatsApp.

## Decisiones (Federico, 10-11-2026)

1. Dos webs separadas y enlazadas entre sí: wearevision.cl para BTL, wr3.wearevision.cl para investigación.
2. El destino se elige **pieza por pieza** en la puerta 1: sin enlace, WR3 o wearevision.cl.
3. El enlace va a una **página concreta elegida de una lista** que publica cada web.
4. WhatsApp recibe **tema + código corto** de la pieza («ref. K7»).
5. wearevision.cl suma una sección **Casos**: unos 20 elegidos por Federico, no un blog.
6. «Lo que aprendió Federico» en cada caso: **Claude lo propone, Federico lo corrige**.
7. Los casos **viven en el repo de la web** (`wav-web2/data/casos.json`), no en PostIA ni en Supabase.
8. El enlace con sus UTM **entra al texto antes de la firma**: la huella lo cubre.

## Repos

| Web | Repo | Cómo se construye |
|---|---|---|
| wearevision.cl | `wearevision/wav-web2` (privado, `~/Projects/wav-web2`) | HTML estático + `build.mjs` → `dist/`, `wrangler deploy` a Cloudflare Workers |
| wr3.wearevision.cl | `wearevision/wr3-web` (`~/Projects/wr3-web`) | HTML estático en `public/` + scripts `scripts/*.mjs`, Worker con formulario de contacto |

## Parte 1 · Sección Casos en wearevision.cl

### Datos

`wav-web2/data/casos.json`: un arreglo con los casos elegidos. Cada uno copia de la ficha de PostIA
(`data/casos/casos.json`) `slug`, `client`, `title`, `year`, `country`, `industry`, `workTypes`, `summary`, `role`,
`era`, `exception`, y agrega:

- `aprendizajes`: 2 o 3 frases aprobadas por Federico.
- `fotos`: rutas en `assets/casos/<slug>/` (webp, ancho máximo 1600 px). Se copian y comprimen desde
  `wav-repository/data/cases/<slug>/frames/`; wav-repository no se modifica.
- `permisoFotos`: `true` cuando Federico confirmó que las fotos con personas tienen permiso.

### Páginas (generadas por `build.mjs`, plantillas HTML sin framework)

- `/casos/`: grilla con foto, cliente, título y año.
- `/casos/<slug>/`: foto principal, contexto (`summary`), rol de Federico (`role`), «Lo que aprendió Federico» y
  botón de WhatsApp. Encabezado: «Trayectoria de Federico Elgueta».
- `sitemap.xml` (para Google) y `paginas.json` (para PostIA, ver Parte 3) incluyen portada, `/casos/` y cada caso.
- La portada suma «Casos» al menú y «Ver casos» en la sección Trabajo.

### Reglas que hacen fallar el build

- Un caso con `exception` distinto de `null`.
- Un caso con `permisoFotos` distinto de `true`.
- Un caso sin fotos (71 de los 105 no tienen fotos en wav-repository; si Federico quiere uno, manda fotos y se agrega
  a mano), con menos de 2 o más de 3 aprendizajes, o con una foto que no está en el repo.
- Texto con montos: `$`, `US$`, `CLP`, «presupuesto».
- Un caso con `year` anterior a 2025 (o `era` = `trayectoria`) cuyo texto diga «WAV» como sujeto de lo hecho. Se
  revisa que `summary`, `role` y `aprendizajes` no contengan «WAV»; si un caso de trayectoria necesita nombrar a WAV,
  se decide a mano y la regla se ajusta.

### Selección (una vez)

1. Página de revisión con los 105 casos y sus fotos; Federico marca unos 20 y confirma permisos de fotos.
2. Claude escribe 2 o 3 aprendizajes por caso a partir de `summary`, `role` y `capabilities`.
3. Federico los corrige en la misma página; lo aprobado se guarda en `wav-web2/data/casos.json`.

### Fuera de esta versión

- Casos en inglés (el sitio cambia idioma con JS; los casos quedan en español).
- Casos propios de WAV desde agosto de 2025: se agregan al mismo `casos.json` cuando existan, con `era` = `wav`.

## Parte 2 · Enlaces desde PostIA

### Puerta 1

Junto al texto, «Destino»: **sin enlace** (por defecto), **WR3** o **wearevision.cl**.

- Al elegir web, PostIA lee su `paginas.json` y muestra la lista; arriba, las páginas cuyo título y tema comparten
  más palabras con el texto de la pieza (sin IA ni gasto).
- Al elegir página, PostIA agrega el enlace al final del texto como una **versión nueva** (origen persona). La firma
  cubre esa versión; cambiar el destino o la página crea otra versión y la firma anterior se cae.
- Los posts de texto y los carruseles se tratan igual: el enlace va en el texto que acompaña.

### El enlace

```
https://wr3.wearevision.cl/guias/focus-group-presencial-u-online/?utm_source=linkedin&utm_medium=social&utm_campaign=federico&utm_content=k7m
```

- `utm_campaign`: la cuenta, `federico` o `wav`.
- `utm_content`: el **código** de la pieza. 3 caracteres del alfabeto `23456789abcdefghjkmnpqrstuvwxyz` (sin 0/o,
  1/l/i), único entre piezas, asignado al elegir destino y que no cambia aunque cambie la página. En WhatsApp se
  muestra en mayúsculas («ref. K7M»).

### Datos

En `piezas`: `destino` (`null` | `wr3` | `wav`), `destino_url` (la página sin UTM), `codigo_ref` (único, solo con
destino). Restricción: `destino_url` empieza por `https://wr3.wearevision.cl/` o `https://wearevision.cl/` según
`destino`.

### Errores

- `paginas.json` no responde o no es válido: la lista muestra «No pude leer las páginas de ‹web›» y no deja elegir.
  No hay entrada manual de direcciones.
- Al publicar, si `destino_url` ya no está en el `paginas.json` de su web, la pieza no sale: vuelve a la puerta 2
  con el motivo «la página de destino ya no existe». Si `paginas.json` no responde en ese momento, se publica igual
  (la página se comprobó al firmar; una caída de la web no debe frenar el calendario).

### Fuera de esta versión

- Registro de contactos: el código queda guardado; cuando exista el registro, «ref. K7M» se cruza con su pieza.
  Cualquiera puede escribir un código válido en una URL: al contar contactos, PostIA solo cuenta códigos que existan
  en sus piezas.
- Sugerencia automática de destino por el motor de escritura.

## Parte 3 · Las dos webs

### `paginas.json`

Generado en el build de cada web: `[{ "url", "titulo", "tema" }]`, con `titulo` desde `<title>` y `tema` desde
`<meta name="description">`. Solo páginas públicas en español (sin `/en/`, 404, privacidad ni demo interna):
los posts son en español. wav-web2 lo hace en
`build.mjs`; WR3, en un script nuevo en `scripts/`. PostIA lo lee desde su servidor, así que no necesita
encabezados CORS.

### `origen.js` (una copia por web, sin dependencias)

- Lee `utm_content`; lo acepta solo si cumple el alfabeto y largo del código.
- Guarda código y título de la página de llegada en `sessionStorage`.
- Reescribe los enlaces `wa.me` de la página:
  - WAV: «Hola WAV, vi «‹título›» y quiero conversar sobre un proyecto (ref. K7M)».
  - WR3: «Hola, vi «‹título›» y quiero conversar sobre un estudio (ref. K7M)».
- Sin código, los enlaces quedan como hoy.
- En WR3, el formulario de contacto envía el código en un campo oculto `ref`.

### Enlaces entre las webs

- wearevision.cl: «WR3 · Investigación» en el menú y un bloque breve en Servicios.
- WR3: «Un servicio de WAV» en el pie, con enlace a wearevision.cl.

### Analítica

Cloudflare Web Analytics (sin cookies, sin banner): WR3 ya lo tiene en 88 páginas; falta wearevision.cl.
Visitas por página y por `utm_content`.

## Pruebas

- **origen.js** (unitarias, en cada web): acepta y rechaza códigos; arma ambos textos de WhatsApp; mantiene el código
  al navegar; no toca los enlaces sin código.
- **Build de wav-web2**: `paginas.json` válido; falla con excepción, sin permiso de fotos, con monto o con «WAV» en
  un caso de trayectoria.
- **Build de WR3**: `paginas.json` válido y sin páginas privadas.
- **PostIA**: código único y del alfabeto; enlace bien armado por cuenta; elegir destino crea versión nueva; cambiar
  destino hace caer la firma; restricción de `destino_url` por web; pieza con página desaparecida vuelve a la puerta 2.
- **E2E por web**: entrar con `?utm_content=k7m` y comprobar «ref. K7M» en el enlace de WhatsApp.

## Orden de construcción

1. Las dos webs: `paginas.json`, `origen.js`, enlaces entre ellas, analítica.
2. Sección Casos en wearevision.cl (incluye la página de revisión y la aprobación de Federico).
3. PostIA: destino, código y enlace en la puerta 1; control al publicar.

Cada paso tiene su plan. Desplegar las webs y aplicar migraciones en producción se pregunta a Federico.
