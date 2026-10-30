# Fase 1h (4b): templates, carousel render and the single signature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Federico writes a carousel's slides in a form, picks one of his 9 templates, and PostIA renders the exact 1080×1350 PDF in Trigger.dev. Gate 1 then shows every slide as it will be published, and one signature covers text, piece and date (D25).

**Architecture:** The templates live in code as pure functions in `lib/plantillas/`, which is Worker-safe and takes data and returns an HTML string. They are a port of the 9 themes Federico delivered in `wr3-web`. A person's action only queues a design request (`pedidos_de_diseno`). The Trigger.dev task `armar-carruseles`, which runs Chromium through the Playwright build extension, takes it and:
1. Renders each slide as a 2× JPEG and refuses the request if a slide overflows.
2. Composes an image-only PDF.
3. Uploads the PDF and the JPEGs to the private `piezas` bucket.
4. Writes the piece (or a new version) through a service-role RPC.

The version's fingerprint already covers the file's SHA-256, so the existing `firmar_pieza` is the D25 single signature with no change.

**Tech Stack:** Next.js 16 App Router on Cloudflare Workers, Supabase (Postgres, Storage, RLS), Trigger.dev v4 (SDK 4.8.1, `@trigger.dev/build` extensions `playwright` and `additionalFiles`), Playwright 1.59.1 (Chromium), zod 4, Vitest, pdf-lib (tests only).

---

## Design

**Source of the templates.** The source is `~/Projects/wr3-web/scripts/carousels.mjs`, Federico's design, 311 lines. The 9 themes, in this order:

| Family | Themes |
|---|---|
| WR3 | `oscura`, `papel`, `magenta` |
| WAV | `wav-noche`, `wav-papel`, `wav-degradado` |
| Personal | `personal-claro`, `personal-grafito`, `personal-arena` |

Its rendered PDFs (`social/linkedin/out/00-plantilla-<n>-<tema>.pdf`) are the visual reference.

What is ported and what is rewritten:
- **Ported verbatim:** the CSS (base rules, per-theme rules, `wavShared`, `personalShared`), the WAV logo path and gradient, and each brand's mark and sign line. This is design, not app code, and D8 is about Conidolly and Ingesta.
- **Rewritten in PostIA's style:** the HTML builder, with Spanish slide types and fields, escaping of every text, and no `undefined` for missing fields (zod refuses first).

**Slide types.** The wr3 kind and the PostIA type for each, with the zod limits. The word limits are wr3's own test limits; character caps guard the column widths.

| wr3 kind | PostIA type | Fields and limits |
|---|---|---|
| cover | `portada` | `titulo` ≤12 words; `bajada` ≤30 words |
| point | `punto` | `numero` (optional, ≤4 characters); `titulo` ≤12 words; `cuerpo` ≤32 words |
| list | `lista` | `titulo`; `items` 2–4, ≤10 words each |
| compare | `comparacion` | `titulo`; `columnas` exactly 2; `filas` 1–4 of exactly 3 cells, ≤6 words each |
| stat | `cifra` | `cifra` ≤12 characters; `etiqueta` ≤6 words; `cuerpo` ≤32 words |
| bars | `barras` | `titulo`; `barras` 2–5 of `{etiqueta, valor}`, where `valor` is a percentage such as `40,0 %` (0–100) |
| statement | `frase` | `titulo` ≤16 words; `nota` ≤32 words |
| cta | `cierre` | `titulo` ≤6 words; `cuerpo` ≤32 words; `enlace` (no spaces, ≤80) |

Rules for the whole carousel:
- 3 to 10 slides. The first is `portada` and the last is `cierre`, as D24 asks: «portada, láminas y cierre».
- The carousel has an `antetitulo` (the kicker, ≤6 words).
- Every text uses only Latin-1 and General Punctuation, because the fonts are Latin subsets and any other glyph would render in a fallback font.

**Overflow is a refusal, not a resize.** The templates have no auto-fit, and wr3's own rule is «Si no cabe, divide la idea en dos láminas en vez de achicar la letra». The renderer measures each slide's `.content` (scroll height or width above the client size). If any slide overflows, the request fails with «La lámina N no cabe. Acórtala o divídela en dos.». Nothing is uploaded. Claude shortening a slide (plano `armar-carrusel`) waits for 4f, where Claude writes slides.

**Families and brands.** A brand with voice `nosotros` (WAV) uses the WR3 and WAV families. WR3 posts come from WAV's page with WR3 templates, and WR3 is not a brand in the schema. A brand with voice `yo` (Federico) uses the personal family. SQL (`tema_de_la_voz`) and TypeScript (`temasDeLaVoz`) hold the same list, and an integration test keeps them equal.

**Image-only PDF, as in wr3-web.** Chromium exports blurred `box-shadow` as flat boxes plus a blur that some readers drop, so the neumorphic cards break in a text PDF. Each slide is screenshotted at `deviceScaleFactor: 2` as a JPEG (quality 92, 2160×2700). A second page lays the images out with `@page { size: 1080px 1350px; margin: 0 }`, and `page.pdf({ preferCSSPageSize: true, printBackground: true })` gives 810×1012.5 pt pages. The same JPEGs are the gate 1 previews, so what Federico signs is byte-for-byte what is in the PDF. Expect about 2.5 MB per 9-slide PDF, against the 30 MB bucket limit and LinkedIn's 100 MB and 300 pages.

**Fonts.** The five OFL WOFF2 files (206 KB) and their licences are copied from wr3-web into `assets/fuentes/`. The Trigger.dev task reads them from disk and embeds them as `data:font/woff2;base64` URLs. That avoids `file://` loads from an `about:blank` page. The build ships them with `additionalFiles({ files: ["./assets/fuentes/**"] })` and `legacyDevProcessCwdBehaviour: false`, so `process.cwd()` is the build directory in both dev and deploy (Trigger.dev docs, «Additional Files»). The renderer waits for `document.fonts.ready` and fails if any `@font-face` is not `loaded`.

**Why Trigger.dev with Playwright, and not Cloudflare Browser Run.**
- Screenshotting each slide and composing the PDF needs a full browser session.
- The plano already names this path (`t_disenar`: «Render con Playwright en Trigger.dev»).
- It needs no new Cloudflare token.
- Cost: machine `medium-1x` (2 GB) at about US$0.000085 per second; a 30-second render is about US$0.003, roughly US$0.12 a month at 40 renders.
- Not a paid AI provider, so no ledger row.

The Playwright extension auto-detects the version from `playwright` in `dependencies`. It must equal `@playwright/test` (1.59.1), or the docs warn it «will break things».

**Storage paths.**
- PDF: `<marca_id>/<uuid>.pdf`. This is the C1 scheme, already enforced by `poner_huella`.
- Previews: `<marca_id>/<uuid>/01.jpg` … `NN.jpg`, derived from the PDF path and the slide count.
- The bucket's allowed types gain `image/jpeg`.
- Members already read anything under their brand's first folder (`20261029120100_archivos.sql`).
- Orphans (a render whose request became obsolete) stay until the cleanup task learns about files. That is noted in the PR as a follow-up, not built here.

**Data.**
- `versiones` gains `tema text` and `diseno jsonb` (`{antetitulo, laminas}`), both null for hand-made PDFs and text posts. Versions are immutable, so the slides a signature covered never change under it.
- New queue `pedidos_de_diseno`, modelled on 4c's `pedidos_de_texto`. Fields: cuenta, optional pieza, `version_base_id` (the piece's latest version when the edit was asked), tema, titulo, texto, diseno, estado (`pendiente`, `trabajando`, `hecho`, `fallo`, `obsoleto`), motivo, `resultado_pieza_id`, lease, `pedido_por`.
- RPCs:
  - **People:** `pedir_diseno`, owners only, at most 5 open requests per brand, one open request per piece.
  - **Service role:** `tomar_pedidos_de_diseno` (one at a time, 10-minute lease), `guardar_diseno` (creates the piece with a proposed date, or a new version; returns null and closes the request as obsolete when the piece moved on) and `terminar_pedido_de_diseno`.

**The single signature (D25) needs no new RPC.** The `poner_huella` trigger already hashes `archivo_sha256` into the version fingerprint, and `firmar_pieza` binds that fingerprint and the date in one row. What 4b adds is that gate 1 shows the slides (the previews) instead of a «Ver el PDF» link. A new render is a new version, and the existing versions trigger drops the signature and returns a scheduled piece to `por_aprobar`. Editing a designed carousel always goes through the editor and a new render, never through the hand-made PDF path.

**Client review covers the slides.** `textoARevisar` now also gets every text of every slide, so a client exception named only on slide 4 still shows in gate 1's verdict (D13).

**Worker boundary.** `lib/carrusel/` imports `playwright` and `node:fs` and is Trigger.dev only. The import-graph test gains a rule: nothing reachable from `app/`, `components/` or `proxy.ts` imports `lib/carrusel/` or the `playwright` package. `lib/plantillas/` and `lib/disenos/` stay Worker-safe.

**CTA defaults per family.** These prefill the editor's `cierre`:

| Family | Default cierre |
|---|---|
| WR3 | «Lee la guía completa», `wr3.wearevision.cl` |
| WAV | «Conversemos», `wearevision.cl` |
| Personal | «Sígueme para más», with Federico's real profile URL (gate 3) |

**Not in 4b.**
- Claude writing slides. That is 4f, where series bring «esqueleto de láminas»; the queue already takes slides from any author.
- AI images (phase 2).
- Single-image posts.
- Instagram sizes.
- Cleaning orphan files.
- A visual-regression test against the reference PDFs (Federico reviews the 9 previews at the smoke instead).

## Gates: stop and ask Federico

1. Push the branch and open the PR.
2. Production migration: Federico runs `pnpm exec supabase db push` from his terminal. The permission classifier blocks it for Claude.
3. **His LinkedIn profile URL** for the personal CTA default (`PERFIL_DE_FEDERICO` in Task 3). Ask before Task 3's commit; if he has not answered, use `linkedin.com/in/` and flag it in the PR.
4. Merge, which deploys the Worker and the Trigger worker. Check that the worker lists `armar-carruseles`.
5. Smoke in production. Federico creates one carousel per family from the editor's default slides and checks the 3 renders against his reference PDFs. Then he discards them, because the app stays clean.

---

## File map

```
assets/fuentes/                          OFL WOFF2 fonts + licences (copied from wr3-web)
lib/plantillas/laminas.ts                slide and carousel schemas (zod), revisarCarrusel
lib/plantillas/campos.ts                 editor field descriptors, draft <-> slide conversion
lib/plantillas/estilos.ts                base CSS, brand marks and signs (ported)
lib/plantillas/temas.ts                  the 9 themes, families, temasDeLaVoz (ported CSS)
lib/plantillas/iniciales.ts              default carousel per family (editor prefill)
lib/plantillas/html.ts                   htmlDelCarrusel (pure)
lib/plantillas/texto.ts                  textoDeLasLaminas (for the client review)
lib/carrusel/fuentes.ts                  fuentesEmbebidas: read assets/fuentes as data URLs (Trigger only)
lib/carrusel/render.ts                   renderizarCarrusel: overflow check, JPEGs, PDF (Trigger only)
lib/carrusel/armar.ts                    armarCarruseles: take, render, upload, save (Trigger only)
lib/carrusel/repositorio.ts              Supabase ports for armar (Trigger only)
lib/disenos/acciones.ts                  pedirDiseno (Worker-safe)
lib/disenos/lectura.ts                   disenoDePieza, pedidosDeDisenoRecientes (Worker-safe)
trigger/carruseles.ts                    task armar-carruseles
trigger.config.ts                        + playwright and additionalFiles extensions, cwd behaviour
supabase/migrations/20261104120000_disenos.sql
lib/supabase/database.types.ts           regenerated
lib/sesion/rutas.ts                      + RUTA_DE_CARRUSEL, rutaDeEditarCarrusel
lib/clientes/revision.ts                 + textoARevisar takes extra parts
lib/piezas/lectura.ts                    + detalle: tema, diseno, vistas
app/(app)/piezas/carrusel/page.tsx       editor page + recent design requests
app/(app)/piezas/carrusel/editor.tsx     client editor
app/(app)/piezas/carrusel/acciones.ts    pedirDisenoAccion
app/(app)/piezas/[id]/vistas.tsx         slide previews
app/(app)/piezas/[id]/page.tsx           + previews, edit link, design request state
app/(app)/piezas/refrescar.tsx           + mensaje prop
app/(app)/layout or nav                  + link «Nuevo carrusel» (where «Pedir texto» is linked)
package.json                             + playwright 1.59.1 (dep), @trigger.dev/build 4.8.1 (dev), test:render
vitest.render.config.ts                  render tests (real Chromium)
.github/workflows/ci.yml                 e2e job installs chromium and runs test:render
tests/unit/laminas.test.ts
tests/unit/campos.test.ts
tests/unit/temas.test.ts
tests/unit/html-del-carrusel.test.ts
tests/unit/armar-carruseles.test.ts
tests/unit/limites-del-worker.test.ts    + carousel boundary
tests/unit/revision.test.ts (existing)   + slides in the client review
tests/render/render.test.ts
tests/integration/disenos.test.ts
tests/integration/repositorio-de-carruseles.test.ts
tests/e2e/carrusel.spec.ts
```

---

### Task 1: Slide and carousel schemas

**Files:**
- Create: `lib/plantillas/laminas.ts`
- Test: `tests/unit/laminas.test.ts`

- [ ] **Step 0: Branch.** The branch `fase-1h-plantillas` already exists with this plan; `git checkout fase-1h-plantillas`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "vitest"
import { type Carrusel, revisarCarrusel } from "@/lib/plantillas/laminas"

const portada = { tipo: "portada", titulo: "Qué aprendimos en cien focus groups", bajada: "Lo que se lleva quien llega al final." }
const cierre = { tipo: "cierre", titulo: "Conversemos", cuerpo: "Treinta minutos para tu próximo estudio.", enlace: "wearevision.cl" }
const punto = { tipo: "punto", numero: "01", titulo: "Escuchar antes de decidir", cuerpo: "Una sola idea por lámina." }
const base = (laminas: unknown[]) => ({ antetitulo: "Carrusel WAV", laminas })

describe("revisarCarrusel", () => {
  test("accepts a carousel that opens with a cover and ends with a closing slide", () => {
    const r = revisarCarrusel(base([portada, punto, cierre]))
    expect(r.ok).toBe(true)
  })

  test("refuses fewer than 3 or more than 10 slides", () => {
    expect(revisarCarrusel(base([portada, cierre]))).toEqual({ ok: false, error: "Un carrusel lleva de 3 a 10 láminas." })
    const once = [portada, ...Array.from({ length: 9 }, () => punto), cierre]
    expect(revisarCarrusel(base(once))).toEqual({ ok: false, error: "Un carrusel lleva de 3 a 10 láminas." })
  })

  test("refuses a carousel that does not open with a cover or close with a closing slide", () => {
    expect(revisarCarrusel(base([punto, punto, cierre]))).toEqual({ ok: false, error: "La primera lámina es la portada." })
    expect(revisarCarrusel(base([portada, punto, punto]))).toEqual({ ok: false, error: "La última lámina es el cierre." })
  })

  test("names the slide and the field when a field is too long", () => {
    const largo = { ...punto, titulo: "una dos tres cuatro cinco seis siete ocho nueve diez once doce trece" }
    expect(revisarCarrusel(base([portada, largo, cierre]))).toEqual({
      ok: false,
      error: "Lámina 2: El título pasa las 12 palabras.",
    })
  })

  test("refuses a glyph the Latin fonts do not have", () => {
    const emoji = { ...punto, cuerpo: "Escuchar 🎧" }
    expect(revisarCarrusel(base([portada, emoji, cierre]))).toEqual({
      ok: false,
      error: "Lámina 2: El cuerpo tiene un carácter que las fuentes no tienen.",
    })
  })

  test("accepts Spanish punctuation and accents", () => {
    const tildes = { ...punto, cuerpo: "¿Por qué? «Así» — sí: niño, acción…" }
    expect(revisarCarrusel(base([portada, tildes, cierre])).ok).toBe(true)
  })

  test("checks every slide type's structure", () => {
    const lista = { tipo: "lista", titulo: "Tres puntos", items: ["uno"] }
    expect(revisarCarrusel(base([portada, lista, cierre]))).toEqual({ ok: false, error: "Lámina 2: Una lista lleva de 2 a 4 puntos." })
    const tabla = { tipo: "comparacion", titulo: "A o B", columnas: ["A", "B"], filas: [["criterio", "sí"]] }
    expect(revisarCarrusel(base([portada, tabla, cierre]))).toEqual({
      ok: false,
      error: "Lámina 2: Cada fila lleva 3 celdas separadas por «|».",
    })
    const barras = { tipo: "barras", titulo: "Escala", barras: [{ etiqueta: "A", valor: "40 %" }, { etiqueta: "B", valor: "140 %" }] }
    expect(revisarCarrusel(base([portada, barras, cierre]))).toEqual({
      ok: false,
      error: "Lámina 2: Cada barra lleva un porcentaje entre 0 y 100, como «40,0 %».",
    })
  })

  test("trims every text and keeps an empty step number as empty", () => {
    const r = revisarCarrusel(base([{ ...portada, titulo: "  Título  " }, { ...punto, numero: "" }, cierre]))
    expect(r.ok && (r.carrusel as Carrusel).laminas[0]).toMatchObject({ titulo: "Título" })
    expect(r.ok && (r.carrusel as Carrusel).laminas[1]).toMatchObject({ numero: "" })
  })

  test("refuses a link with spaces in the closing slide", () => {
    const malo = { ...cierre, enlace: "wear evision.cl" }
    expect(revisarCarrusel(base([portada, punto, malo]))).toEqual({
      ok: false,
      error: "Lámina 3: El enlace va sin espacios, como «wearevision.cl».",
    })
  })
})
```

- [ ] **Step 2: Run to verify they fail.** Run `pnpm vitest run tests/unit/laminas.test.ts`. Expected: FAIL with «Cannot find module '@/lib/plantillas/laminas'».

- [ ] **Step 3: Implement** `lib/plantillas/laminas.ts`

```ts
import { z } from "zod"

/** The template fonts are Latin subsets: any other glyph would render in a fallback font. */
const GLIFOS = /^[ -ÿ -⁯]*$/
const palabras = (s: string) => s.split(/\s+/).filter(Boolean).length
const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** A trimmed, non-empty text within a word and a character limit. `nombre` carries its article: «el título». */
function texto(nombre: string, maxPalabras: number, maxCaracteres: number) {
  const N = mayuscula(nombre)
  return z
    .string()
    .trim()
    .min(1, `Falta ${nombre}.`)
    .max(maxCaracteres, `${N} pasa los ${maxCaracteres} caracteres.`)
    .refine((s) => GLIFOS.test(s), `${N} tiene un carácter que las fuentes no tienen.`)
    .refine((s) => palabras(s) <= maxPalabras, `${N} pasa las ${maxPalabras} palabras.`)
}

const titulo = texto("el título", 12, 90)
const cuerpo = texto("el cuerpo", 32, 240)
const celda = texto("cada celda", 6, 40)

export const Portada = z.object({ tipo: z.literal("portada"), titulo, bajada: texto("la bajada", 30, 200) })
export const Punto = z.object({
  tipo: z.literal("punto"),
  numero: z.string().trim().max(4, "El número lleva hasta 4 caracteres, como «01»."),
  titulo,
  cuerpo,
})
export const Lista = z.object({
  tipo: z.literal("lista"),
  titulo,
  items: z.array(texto("cada punto", 10, 80)).min(2, "Una lista lleva de 2 a 4 puntos.").max(4, "Una lista lleva de 2 a 4 puntos."),
})
export const Comparacion = z.object({
  tipo: z.literal("comparacion"),
  titulo,
  columnas: z.array(celda).length(2, "Una comparación lleva 2 columnas."),
  filas: z
    .array(z.array(celda).length(3, "Cada fila lleva 3 celdas separadas por «|»."))
    .min(1, "Una comparación lleva de 1 a 4 filas.")
    .max(4, "Una comparación lleva de 1 a 4 filas."),
})
export const Cifra = z.object({
  tipo: z.literal("cifra"),
  cifra: texto("la cifra", 3, 12),
  etiqueta: texto("la etiqueta", 6, 50),
  cuerpo,
})
const PORCENTAJE = /^(100|\d{1,2})(,\d)? ?%$/
export const Barras = z.object({
  tipo: z.literal("barras"),
  titulo,
  barras: z
    .array(
      z.object({
        etiqueta: texto("cada etiqueta", 6, 40),
        valor: z
          .string()
          .trim()
          .regex(PORCENTAJE, "Cada barra lleva un porcentaje entre 0 y 100, como «40,0 %».")
          .refine((v) => Number.parseFloat(v.replace(",", ".")) <= 100, "Cada barra lleva un porcentaje entre 0 y 100, como «40,0 %»."),
      }),
    )
    .min(2, "Unas barras llevan de 2 a 5 cifras.")
    .max(5, "Unas barras llevan de 2 a 5 cifras."),
})
export const Frase = z.object({ tipo: z.literal("frase"), titulo: texto("la frase", 16, 120), nota: texto("la nota", 32, 240) })
export const Cierre = z.object({
  tipo: z.literal("cierre"),
  titulo: texto("el título", 6, 50),
  cuerpo,
  enlace: z
    .string()
    .trim()
    .min(1, "Falta el enlace.")
    .max(80, "El enlace pasa los 80 caracteres.")
    .regex(/^\S+$/, "El enlace va sin espacios, como «wearevision.cl».")
    .refine((s) => GLIFOS.test(s), "El enlace tiene un carácter que las fuentes no tienen."),
})

export const Lamina = z.discriminatedUnion("tipo", [Portada, Punto, Lista, Comparacion, Cifra, Barras, Frase, Cierre])
export type Lamina = z.infer<typeof Lamina>
export type TipoDeLamina = Lamina["tipo"]
export const TIPOS_DE_LAMINA: readonly TipoDeLamina[] = [
  "portada", "punto", "lista", "comparacion", "cifra", "barras", "frase", "cierre",
]

const CANTIDAD = "Un carrusel lleva de 3 a 10 láminas."
export const Carrusel = z.object({
  antetitulo: texto("el antetítulo", 6, 50),
  laminas: z
    .array(Lamina)
    .min(3, CANTIDAD)
    .max(10, CANTIDAD)
    .refine((ls) => ls[0]?.tipo === "portada", "La primera lámina es la portada.")
    .refine((ls) => ls.at(-1)?.tipo === "cierre", "La última lámina es el cierre."),
})
export type Carrusel = z.infer<typeof Carrusel>

export type Revision = { ok: true; carrusel: Carrusel } | { ok: false; error: string }

/** The first problem, in words Federico can act on; a slide's problem names the slide (1-based). */
export function revisarCarrusel(entrada: unknown): Revision {
  const leido = Carrusel.safeParse(entrada)
  if (leido.success) return { ok: true, carrusel: leido.data }
  const issue = leido.error.issues[0]
  if (!issue) return { ok: false, error: "Revisa el carrusel." }
  const [campo, indice] = issue.path
  if (campo === "laminas" && typeof indice === "number") return { ok: false, error: `Lámina ${indice + 1}: ${issue.message}` }
  return { ok: false, error: issue.message }
}
```

Note for the implementer: a `.min` or `.max` on the slides array has the path `["laminas"]` with no index. That is why the count and the first and last rules come back without a slide number. A missing `tipo` gives zod's own discriminator message; that is acceptable, because the editor always sends a type.

- [ ] **Step 4: Run to verify they pass.** Run `pnpm vitest run tests/unit/laminas.test.ts`. Expected: PASS. If an `invalid_union` or `invalid_type` issue comes first for a structural test, use `z.array(...).length(...)` messages as written; do not change the test messages.

- [ ] **Step 5: Commit**

```bash
git add lib/plantillas/laminas.ts tests/unit/laminas.test.ts
git commit -m "feat: slide and carousel schemas with the template limits"
```

---

### Task 2: Editor fields: drafts to slides and back

**Files:**
- Create: `lib/plantillas/campos.ts`
- Test: `tests/unit/campos.test.ts`

The editor keeps each slide as a draft of plain strings, one per field, because a phone form edits text. Lists are one item per line. A table is one row per line with cells split by `|`. Bars are `etiqueta | valor` per line.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "vitest"
import { aBorrador, CAMPOS, deBorrador } from "@/lib/plantillas/campos"
import { Lamina, TIPOS_DE_LAMINA } from "@/lib/plantillas/laminas"

describe("editor fields", () => {
  test("every slide type has fields, and each field is a key of that type", () => {
    for (const tipo of TIPOS_DE_LAMINA) expect(CAMPOS[tipo].length).toBeGreaterThan(0)
  })

  test("a list draft is one item per line, empty lines dropped", () => {
    expect(deBorrador("lista", { titulo: "T", items: "uno\n\n dos \n" })).toEqual({ tipo: "lista", titulo: "T", items: ["uno", "dos"] })
  })

  test("a table draft splits cells on |", () => {
    expect(deBorrador("comparacion", { titulo: "T", columnas: "A | B", filas: "c1 | sí | no\nc2|a|b" })).toEqual({
      tipo: "comparacion", titulo: "T", columnas: ["A", "B"], filas: [["c1", "sí", "no"], ["c2", "a", "b"]],
    })
  })

  test("a bars draft reads «etiqueta | valor» per line", () => {
    expect(deBorrador("barras", { titulo: "T", barras: "Uno | 40,0 %\nDos|65 %" })).toEqual({
      tipo: "barras", titulo: "T", barras: [{ etiqueta: "Uno", valor: "40,0 %" }, { etiqueta: "Dos", valor: "65 %" }],
    })
  })

  test("a slide survives a round trip through its draft", () => {
    const ejemplos: Lamina[] = [
      { tipo: "portada", titulo: "T", bajada: "B" },
      { tipo: "punto", numero: "01", titulo: "T", cuerpo: "C" },
      { tipo: "lista", titulo: "T", items: ["a", "b"] },
      { tipo: "comparacion", titulo: "T", columnas: ["A", "B"], filas: [["x", "y", "z"]] },
      { tipo: "cifra", cifra: "40 %", etiqueta: "E", cuerpo: "C" },
      { tipo: "barras", titulo: "T", barras: [{ etiqueta: "a", valor: "1 %" }, { etiqueta: "b", valor: "2 %" }] },
      { tipo: "frase", titulo: "F", nota: "N" },
      { tipo: "cierre", titulo: "T", cuerpo: "C", enlace: "wearevision.cl" },
    ]
    for (const l of ejemplos) expect(deBorrador(l.tipo, aBorrador(l))).toEqual(l)
  })
})
```

- [ ] **Step 2: Run to verify they fail.** Run `pnpm vitest run tests/unit/campos.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `lib/plantillas/campos.ts`

```ts
import type { Lamina, TipoDeLamina } from "./laminas"

export type FormaDeCampo = "linea" | "parrafo" | "lista" | "tabla" | "barras"
export interface Campo {
  clave: string
  etiqueta: string
  forma: FormaDeCampo
  ayuda?: string
}
export type Borrador = Record<string, string>

export const NOMBRE_DEL_TIPO: Record<TipoDeLamina, string> = {
  portada: "Portada",
  punto: "Idea",
  lista: "Lista",
  comparacion: "Comparación",
  cifra: "Cifra",
  barras: "Barras",
  frase: "Frase",
  cierre: "Cierre",
}

export const CAMPOS: Record<TipoDeLamina, readonly Campo[]> = {
  portada: [
    { clave: "titulo", etiqueta: "Título", forma: "parrafo", ayuda: "Hasta 12 palabras." },
    { clave: "bajada", etiqueta: "Bajada", forma: "parrafo", ayuda: "Hasta 30 palabras." },
  ],
  punto: [
    { clave: "numero", etiqueta: "Número (opcional)", forma: "linea", ayuda: "Solo si las láminas siguen pasos, como «01»." },
    { clave: "titulo", etiqueta: "Título", forma: "parrafo", ayuda: "Hasta 12 palabras." },
    { clave: "cuerpo", etiqueta: "Texto", forma: "parrafo", ayuda: "Hasta 32 palabras." },
  ],
  lista: [
    { clave: "titulo", etiqueta: "Título", forma: "parrafo" },
    { clave: "items", etiqueta: "Puntos", forma: "lista", ayuda: "Uno por línea, de 2 a 4, hasta 10 palabras cada uno." },
  ],
  comparacion: [
    { clave: "titulo", etiqueta: "Título", forma: "parrafo" },
    { clave: "columnas", etiqueta: "Columnas", forma: "linea", ayuda: "Dos nombres separados por «|»." },
    { clave: "filas", etiqueta: "Filas", forma: "tabla", ayuda: "Una por línea: criterio | celda | celda. Hasta 4." },
  ],
  cifra: [
    { clave: "cifra", etiqueta: "Cifra", forma: "linea", ayuda: "Por ejemplo «42,5 %»." },
    { clave: "etiqueta", etiqueta: "Qué mide", forma: "linea" },
    { clave: "cuerpo", etiqueta: "Texto", forma: "parrafo", ayuda: "De dónde sale la cifra y qué significa." },
  ],
  barras: [
    { clave: "titulo", etiqueta: "Título", forma: "parrafo" },
    { clave: "barras", etiqueta: "Barras", forma: "barras", ayuda: "Una por línea: etiqueta | porcentaje. De 2 a 5." },
  ],
  frase: [
    { clave: "titulo", etiqueta: "Frase", forma: "parrafo", ayuda: "Hasta 16 palabras." },
    { clave: "nota", etiqueta: "Nota", forma: "parrafo" },
  ],
  cierre: [
    { clave: "titulo", etiqueta: "Título", forma: "linea" },
    { clave: "cuerpo", etiqueta: "Texto", forma: "parrafo" },
    { clave: "enlace", etiqueta: "Enlace", forma: "linea", ayuda: "Sin https://, como «wearevision.cl»." },
  ],
}

const lineas = (s = "") => s.split("\n").map((l) => l.trim()).filter(Boolean)
const celdas = (l: string) => l.split("|").map((c) => c.trim())

/** The draft as the schema's input. Validation stays with revisarCarrusel. */
export function deBorrador(tipo: TipoDeLamina, b: Borrador): unknown {
  const salida: Record<string, unknown> = { tipo }
  for (const campo of CAMPOS[tipo]) {
    const valor = b[campo.clave] ?? ""
    if (campo.forma === "lista") salida[campo.clave] = lineas(valor)
    else if (campo.forma === "tabla") salida[campo.clave] = lineas(valor).map(celdas)
    else if (campo.forma === "barras")
      salida[campo.clave] = lineas(valor).map((l) => {
        const [etiqueta = "", valorDeBarra = ""] = celdas(l)
        return { etiqueta, valor: valorDeBarra }
      })
    else if (campo.clave === "columnas") salida[campo.clave] = celdas(valor)
    else salida[campo.clave] = valor
  }
  return salida
}

export function aBorrador(l: Lamina): Borrador {
  const b: Borrador = {}
  for (const campo of CAMPOS[l.tipo]) {
    const valor = (l as unknown as Record<string, unknown>)[campo.clave]
    if (campo.forma === "lista") b[campo.clave] = (valor as string[]).join("\n")
    else if (campo.forma === "tabla") b[campo.clave] = (valor as string[][]).map((f) => f.join(" | ")).join("\n")
    else if (campo.forma === "barras")
      b[campo.clave] = (valor as { etiqueta: string; valor: string }[]).map((x) => `${x.etiqueta} | ${x.valor}`).join("\n")
    else if (campo.clave === "columnas") b[campo.clave] = (valor as string[]).join(" | ")
    else b[campo.clave] = String(valor ?? "")
  }
  return b
}
```

- [ ] **Step 4: Run to verify they pass.** Run `pnpm vitest run tests/unit/campos.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/plantillas/campos.ts tests/unit/campos.test.ts
git commit -m "feat: editor drafts for every slide type"
```

---

### Task 3: Themes, styles, fonts and default carousels

**Files:**
- Create: `assets/fuentes/` (5 WOFF2 + `OFL-*.txt`), `lib/plantillas/estilos.ts`, `lib/plantillas/temas.ts`, `lib/plantillas/iniciales.ts`
- Test: `tests/unit/temas.test.ts`

- [ ] **Step 1: Copy the fonts and their licences**

```bash
mkdir -p assets/fuentes
W=~/Projects/wr3-web
cp $W/public/fonts/bricolage-grotesque/bricolage-grotesque-latin-wdth-normal.woff2 \
   $W/public/fonts/inter-tight/inter-tight-latin-wght-normal.woff2 \
   $W/public/fonts/jetbrains-mono/jetbrains-mono-latin-wght-normal.woff2 \
   $W/public/fonts/instrument-serif/instrument-serif-latin-400-normal.woff2 \
   $W/public/fonts/instrument-serif/instrument-serif-latin-400-italic.woff2 assets/fuentes/
cp $W/node_modules/@fontsource-variable/bricolage-grotesque/LICENSE assets/fuentes/OFL-bricolage-grotesque.txt
cp $W/node_modules/@fontsource-variable/inter-tight/LICENSE assets/fuentes/OFL-inter-tight.txt
cp $W/node_modules/@fontsource-variable/jetbrains-mono/LICENSE assets/fuentes/OFL-jetbrains-mono.txt
cp $W/node_modules/@fontsource/instrument-serif/LICENSE assets/fuentes/OFL-instrument-serif.txt
ls -la assets/fuentes
```

Expected: 5 `.woff2` files (about 206 KB in total) and 4 licence files. Check that `.claudeignore` does not hide `assets/`, and that `.gitignore` does not ignore `*.woff2`.

- [ ] **Step 2: Write the failing tests**

```ts
import { describe, expect, test } from "vitest"
import { carruselInicial } from "@/lib/plantillas/iniciales"
import { revisarCarrusel } from "@/lib/plantillas/laminas"
import { familiaDe, TEMAS, temasDeLaVoz } from "@/lib/plantillas/temas"

describe("themes", () => {
  test("there are Federico's 9 themes, in his order", () => {
    expect(Object.keys(TEMAS)).toEqual([
      "oscura", "papel", "magenta", "wav-noche", "wav-papel", "wav-degradado",
      "personal-claro", "personal-grafito", "personal-arena",
    ])
  })

  test("WAV's voice gets the WR3 and WAV families; Federico's gets the personal one", () => {
    expect(temasDeLaVoz("nosotros")).toEqual(["oscura", "papel", "magenta", "wav-noche", "wav-papel", "wav-degradado"])
    expect(temasDeLaVoz("yo")).toEqual(["personal-claro", "personal-grafito", "personal-arena"])
  })

  test("each theme's CSS is scoped to its own class", () => {
    for (const [id, tema] of Object.entries(TEMAS)) {
      if (id === "oscura") continue // the default lives in :root
      expect(tema.css).toContain(`.theme-${id}`)
    }
  })

  test("every family's default carousel passes the schema", () => {
    for (const familia of ["wr3", "wav", "personal"] as const) {
      const r = revisarCarrusel(carruselInicial(familia))
      expect(r.ok, r.ok ? "" : r.error).toBe(true)
    }
    expect(familiaDe("wav-papel")).toBe("wav")
  })

  test("the defaults close with the family's own call to action", () => {
    expect(carruselInicial("wav").laminas.at(-1)).toMatchObject({ titulo: "Conversemos", enlace: "wearevision.cl" })
    expect(carruselInicial("wr3").laminas.at(-1)).toMatchObject({ titulo: "Lee la guía completa" })
    expect(carruselInicial("personal").laminas.at(-1)).toMatchObject({ titulo: "Sígueme para más" })
  })
})
```

- [ ] **Step 3: Run to verify they fail.** Run `pnpm vitest run tests/unit/temas.test.ts`. Expected: FAIL (modules missing).

- [ ] **Step 4: Implement `lib/plantillas/estilos.ts`.** Port from `~/Projects/wr3-web/scripts/carousels.mjs`:
  - `WAV_LOGO` (lines 69-70).
  - The `brands` object (72-96), renamed `MARCAS: Record<Familia, { fuentes(f): string; defs: string; marca: string; firma: string }>`.
  - `WAV_GRADIENT` (99).
  - `wavShared` and `personalShared` (100-125), renamed `compartidoWav` and `compartidoPersonal`.
  - The base CSS (lines 237-292, from `:root {` to `.sign {…}`), as `export const CSS_BASE`.

  Keep every CSS value byte-for-byte. Fonts are not referenced by directory. `fuentes` is a function from a file name (`"inter-tight-latin-wght-normal.woff2"`) to a URL, because the renderer passes `data:` URLs.

```ts
export type Familia = "wr3" | "wav" | "personal"
export type UrlDeFuente = (archivo: string) => string

export const ARCHIVOS_DE_FUENTES = [
  "bricolage-grotesque-latin-wdth-normal.woff2",
  "inter-tight-latin-wght-normal.woff2",
  "jetbrains-mono-latin-wght-normal.woff2",
  "instrument-serif-latin-400-normal.woff2",
  "instrument-serif-latin-400-italic.woff2",
] as const

export function caraDeFuentes(url: UrlDeFuente): string {
  return `
@font-face { font-family: "Bricolage Grotesque"; font-weight: 200 800; font-stretch: 75% 100%; src: url(${url("bricolage-grotesque-latin-wdth-normal.woff2")}) format("woff2-variations"); }
@font-face { font-family: "Inter Tight"; font-weight: 100 900; src: url(${url("inter-tight-latin-wght-normal.woff2")}) format("woff2-variations"); }
@font-face { font-family: "JetBrains Mono"; font-weight: 100 800; src: url(${url("jetbrains-mono-latin-wght-normal.woff2")}) format("woff2-variations"); }`
}

// MARCAS: port of wr3-web carousels.mjs `brands` (72-96). `personal.fuentes(url)` returns the two Instrument Serif
// @font-face rules with url("instrument-serif-latin-400-normal.woff2") and the italic one.
// CSS_BASE: port of carousels.mjs lines 237-292 verbatim (from ":root {" through the ".sign" rule).
// compartidoWav / compartidoPersonal: ports of wavShared / personalShared (100-125).
```

  The ported blocks are written in full in the file. They are Federico's design, copied, not invented.

- [ ] **Step 5: Implement `lib/plantillas/temas.ts`.** Port the `themes` object (`carousels.mjs` 128-210). `TEMAS` keeps the same keys and order, each `{ nombre, familia, css }`. `nombre` is the Spanish label the editor shows:
  - «WR3 oscura», «WR3 papel», «WR3 magenta»
  - «WAV noche», «WAV papel», «WAV degradado»
  - «Personal claro», «Personal grafito», «Personal arena»

  `css` is the theme's string, with the `wavShared` and `personalShared` calls replaced by `compartidoWav` and `compartidoPersonal`.

```ts
import { compartidoPersonal, compartidoWav, type Familia } from "./estilos"

export interface Tema { nombre: string; familia: Familia; css: string }
export const TEMAS = { /* oscura … personal-arena, ported */ } as const satisfies Record<string, Tema>
export type IdDeTema = keyof typeof TEMAS
export const IDS_DE_TEMA = Object.keys(TEMAS) as IdDeTema[]

export const familiaDe = (tema: IdDeTema): Familia => TEMAS[tema].familia
export const esTema = (valor: string): valor is IdDeTema => Object.hasOwn(TEMAS, valor)

/** Mirrors SQL tema_de_la_voz (20261104120000_disenos.sql); an integration test keeps them equal. */
export function temasDeLaVoz(voz: "yo" | "nosotros"): IdDeTema[] {
  return IDS_DE_TEMA.filter((t) => (voz === "yo" ? familiaDe(t) === "personal" : familiaDe(t) !== "personal"))
}
```

- [ ] **Step 6: Implement `lib/plantillas/iniciales.ts`.**
  - It is a port of `wr3-web/social/linkedin/plantilla.json`, translated to PostIA's types (cover→portada and so on), with `antetitulo` from `kicker`.
  - The per-family CTA comes from `build-carousels.mjs` 49-54.
  - **Gate 3:** ask Federico for his profile URL before committing. Without an answer, use `linkedin.com/in/` and say so in the PR.

```ts
import type { Familia } from "./estilos"
import type { Carrusel, Lamina } from "./laminas"

/** Gate 3 of plan 4b: Federico's public profile, without https://. */
export const PERFIL_DE_FEDERICO = "linkedin.com/in/…"

const CUERPO: Lamina[] = [
  { tipo: "portada", titulo: "Portada: la pregunta que responde la guía", bajada: "Bajada de una línea: qué se lleva quien llega hasta el final." },
  { tipo: "punto", numero: "01", titulo: "Idea con número: título de hasta 12 palabras", cuerpo: "Texto de apoyo de hasta 32 palabras. Una sola idea por lámina. Si no cabe, divide la idea en dos láminas en vez de achicar la letra." },
  { tipo: "punto", numero: "", titulo: "Idea sin número", cuerpo: "El número de arriba es opcional: úsalo solo cuando las láminas siguen pasos en orden, como en una guía de cómo hacer algo." },
  { tipo: "lista", titulo: "Lista: de 2 a 4 puntos", items: ["Cada punto con hasta 10 palabras", "Sin punto final ni conectores", "La numeración se pone sola", "Cuatro puntos como máximo"] },
  { tipo: "comparacion", titulo: "Comparación: hasta 4 filas", columnas: ["Opción A", "Opción B"], filas: [["Criterio uno", "Celda breve", "Celda breve"], ["Criterio dos", "Hasta seis palabras por celda", "Sí"], ["Criterio tres", "No", "Depende"], ["Criterio cuatro", "Texto breve", "Texto breve"]] },
  { tipo: "cifra", cifra: "00,0 %", etiqueta: "unidad de la cifra", cuerpo: "Solo cifras que la guía publica y la página de método respalda. Esta línea dice de dónde sale la cifra y qué significa." },
  { tipo: "barras", titulo: "Barras: cifras de una misma escala", barras: [{ etiqueta: "Primera etapa, etiqueta breve", valor: "40,0 %" }, { etiqueta: "Segunda etapa", valor: "65,0 %" }, { etiqueta: "Tercera etapa", valor: "90,0 %" }] },
  { tipo: "frase", titulo: "Frase de cierre: una sola oración que alguien querría citar.", nota: "Nota al pie con el contexto o la fuente de la frase, en una o dos líneas." },
]

const CIERRES: Record<Familia, { antetitulo: string; titulo: string; enlace: string }> = {
  wr3: { antetitulo: "Plantilla · Carrusel WR3", titulo: "Lee la guía completa", enlace: "wr3.wearevision.cl" },
  wav: { antetitulo: "Plantilla · Carrusel WAV", titulo: "Conversemos", enlace: "wearevision.cl" },
  personal: { antetitulo: "Plantilla · Carrusel personal", titulo: "Sígueme para más", enlace: PERFIL_DE_FEDERICO },
}

export function carruselInicial(familia: Familia): Carrusel {
  const c = CIERRES[familia]
  return {
    antetitulo: c.antetitulo,
    laminas: [
      ...CUERPO,
      { tipo: "cierre", titulo: c.titulo, cuerpo: "Cierre de una línea con la invitación a conversar 30 minutos.", enlace: c.enlace },
    ],
  }
}
```

- [ ] **Step 7: Run to verify they pass.** Run `pnpm vitest run tests/unit/temas.test.ts`. Expected: PASS. The template's «Hasta seis palabras por celda» is 5 words, and «Primera etapa, etiqueta breve» is 4, so both pass.

- [ ] **Step 8: Commit**

```bash
git add assets/fuentes lib/plantillas/estilos.ts lib/plantillas/temas.ts lib/plantillas/iniciales.ts tests/unit/temas.test.ts
git commit -m "feat: Federico's 9 carousel themes and their fonts, ported from wr3-web"
```

---

### Task 4: The HTML builder and the slides' text

**Files:**
- Create: `lib/plantillas/html.ts`, `lib/plantillas/texto.ts`
- Test: `tests/unit/html-del-carrusel.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "vitest"
import { htmlDelCarrusel } from "@/lib/plantillas/html"
import { carruselInicial } from "@/lib/plantillas/iniciales"
import type { Carrusel } from "@/lib/plantillas/laminas"
import { textoDeLasLaminas } from "@/lib/plantillas/texto"

const url = (archivo: string) => `data:font/woff2;base64,${archivo}`
const carrusel = carruselInicial("wav")

describe("htmlDelCarrusel", () => {
  test("one section per slide, the theme class on the body and a 1080x1350 page", () => {
    const html = htmlDelCarrusel({ tema: "wav-noche", ...carrusel }, url)
    expect(html.match(/<section class="slide /g)).toHaveLength(carrusel.laminas.length)
    expect(html).toContain('<body class="theme-wav-noche">')
    expect(html).toContain("@page { size: 1080px 1350px; margin: 0; }")
    expect(html).toContain("09 / 09")
  })

  test("escapes every text so a slide cannot inject markup", () => {
    const malo: Carrusel = {
      antetitulo: "<b>x</b>",
      laminas: [
        { tipo: "portada", titulo: '<img src=x onerror="alert(1)">', bajada: "a & b" },
        { tipo: "frase", titulo: "«cita»", nota: '"nota"' },
        { tipo: "cierre", titulo: "Fin", cuerpo: "c", enlace: "a.cl/<x>" },
      ],
    }
    const html = htmlDelCarrusel({ tema: "oscura", ...malo }, url)
    expect(html).not.toContain("<img src=x")
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;")
    expect(html).toContain("a &amp; b")
    expect(html).toContain("a.cl/<wbr>&lt;x&gt;")
  })

  test("loads the fonts through the given URLs and the personal serif only for the personal family", () => {
    expect(htmlDelCarrusel({ tema: "oscura", ...carrusel }, url)).not.toContain("instrument-serif")
    expect(htmlDelCarrusel({ tema: "personal-claro", ...carruselInicial("personal") }, url)).toContain(
      "data:font/woff2;base64,instrument-serif-latin-400-italic.woff2",
    )
  })

  test("the closing slide signs with the family's line and the WAV families carry the logo", () => {
    expect(htmlDelCarrusel({ tema: "papel", ...carrusel }, url)).toContain("WAV Research · focus groups en Santiago de Chile")
    expect(htmlDelCarrusel({ tema: "wav-papel", ...carrusel }, url)).toContain('id="wav-grad"')
  })

  test("a bar's width is its percentage and an empty step number is left out", () => {
    const html = htmlDelCarrusel({ tema: "oscura", ...carrusel }, url)
    expect(html).toContain('style="width:40%"')
    expect(html.match(/class="step"/g)).toHaveLength(1)
  })
})

describe("textoDeLasLaminas", () => {
  test("joins every text of every slide, for the client review", () => {
    const t = textoDeLasLaminas(carrusel)
    expect(t).toContain("Plantilla · Carrusel WAV")
    expect(t).toContain("Criterio cuatro")
    expect(t).toContain("Tercera etapa")
    expect(t).toContain("wearevision.cl")
  })
})
```

- [ ] **Step 2: Run to verify they fail.** Run `pnpm vitest run tests/unit/html-del-carrusel.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement `lib/plantillas/html.ts`**

```ts
import { CSS_BASE, caraDeFuentes, MARCAS, type UrlDeFuente } from "./estilos"
import type { Carrusel, Lamina } from "./laminas"
import { familiaDe, type IdDeTema, TEMAS } from "./temas"

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c)
const dos = (n: number) => String(n).padStart(2, "0")
const porcentaje = (v: string) => Number.parseFloat(v.replace(",", "."))

type Marca = (typeof MARCAS)[keyof typeof MARCAS]

function cuerpo(l: Lamina, antetitulo: string, marca: Marca): string {
  switch (l.tipo) {
    case "portada":
      return `<p class="kicker">${esc(antetitulo)}</p><h1 class="cover-title">${esc(l.titulo)}</h1><p class="sub">${esc(l.bajada)}</p><p class="swipe">Desliza <span aria-hidden="true">›››</span></p>`
    case "punto":
      return `${l.numero ? `<p class="step">${esc(l.numero)}</p>` : ""}<h2 class="title">${esc(l.titulo)}</h2><p class="body">${esc(l.cuerpo)}</p>`
    case "lista":
      return `<h2 class="title">${esc(l.titulo)}</h2><ol class="items raised">${l.items.map((it, i) => `<li><span class="idx">${dos(i + 1)}</span>${esc(it)}</li>`).join("")}</ol>`
    case "comparacion":
      return `<h2 class="title">${esc(l.titulo)}</h2><div class="table raised"><div class="row head"><span></span>${l.columnas.map((c) => `<span>${esc(c)}</span>`).join("")}</div>${l.filas.map((f) => `<div class="row"><span class="rlabel">${esc(f[0] ?? "")}</span>${f.slice(1).map((v) => `<span>${esc(v)}</span>`).join("")}</div>`).join("")}</div>`
    case "cifra":
      return `<p class="figure${l.cifra.length > 6 ? " long" : ""}">${esc(l.cifra)}</p><p class="figure-label">${esc(l.etiqueta)}</p><p class="body">${esc(l.cuerpo)}</p>`
    case "barras":
      return `<h2 class="title">${esc(l.titulo)}</h2><div class="bars raised">${l.barras.map((b, i, todas) => `<div class="bar${i === todas.length - 1 ? " last" : ""}"><div class="bar-head"><span>${esc(b.etiqueta)}</span><span class="bar-value">${esc(b.valor)}</span></div><div class="track"><div class="fill" style="width:${porcentaje(b.valor)}%"></div></div></div>`).join("")}</div>`
    case "frase":
      return `<p class="mark" aria-hidden="true">«</p><p class="statement">${esc(l.titulo)}</p><p class="note">${esc(l.nota)}</p>`
    case "cierre":
      return `<h2 class="cta-title">${esc(l.titulo)}</h2><p class="url raised">${esc(l.enlace).replace(/([/-])/g, "$1<wbr>")}</p><p class="body">${esc(l.cuerpo)}</p><p class="sign">${esc(marca.firma)}</p>`
  }
}

/** The carousel as one HTML page: one .slide section per slide, 1080x1350, in the theme's tokens. Pure. */
export function htmlDelCarrusel(c: { tema: IdDeTema } & Carrusel, fuente: UrlDeFuente): string {
  const tema = TEMAS[c.tema]
  const marca = MARCAS[familiaDe(c.tema)]
  const n = c.laminas.length
  const secciones = c.laminas
    .map(
      (l, i) => `<section class="slide slide--${l.tipo}">
  <header class="top">${marca.marca}</header>
  <div class="content">${cuerpo(l, c.antetitulo, marca)}</div>
  <footer class="foot"><div class="progress"><div style="width:${((i + 1) / n) * 100}%"></div></div><span class="kick">${i === 0 ? "" : esc(c.antetitulo)}</span><span class="count">${dos(i + 1)} / ${dos(n)}</span></footer>
</section>`,
    )
    .join("\n")
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Carrusel</title>
<style>
@page { size: 1080px 1350px; margin: 0; }${caraDeFuentes(fuente)}${marca.fuentes(fuente)}
${CSS_BASE}
${tema.css}
</style></head><body class="theme-${c.tema}">
${marca.defs}
${secciones}
</body></html>`
}
```

Note: wr3's `sign` was inserted unescaped. Here it is escaped. The signs contain only `·`, which `esc` leaves alone, so the render is identical.

- [ ] **Step 4: Implement `lib/plantillas/texto.ts`**

```ts
import type { Carrusel, Lamina } from "./laminas"

function textos(l: Lamina): string[] {
  switch (l.tipo) {
    case "portada": return [l.titulo, l.bajada]
    case "punto": return [l.titulo, l.cuerpo]
    case "lista": return [l.titulo, ...l.items]
    case "comparacion": return [l.titulo, ...l.columnas, ...l.filas.flat()]
    case "cifra": return [l.cifra, l.etiqueta, l.cuerpo]
    case "barras": return [l.titulo, ...l.barras.map((b) => b.etiqueta)]
    case "frase": return [l.titulo, l.nota]
    case "cierre": return [l.titulo, l.cuerpo, l.enlace]
  }
}

/** Every word the slides publish, one line each: the client review reads it like the post's text (D13). */
export function textoDeLasLaminas(c: Carrusel): string {
  return [c.antetitulo, ...c.laminas.flatMap(textos)].join("\n")
}
```

- [ ] **Step 5: Run to verify they pass.** Run `pnpm vitest run tests/unit/html-del-carrusel.test.ts`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/plantillas/html.ts lib/plantillas/texto.ts tests/unit/html-del-carrusel.test.ts
git commit -m "feat: build the carousel HTML from slides, escaping every text"
```

---

### Task 5: Render with real Chromium

**Files:**
- Modify: `package.json` (dependencies, script), `.github/workflows/ci.yml`
- Create: `lib/carrusel/fuentes.ts`, `lib/carrusel/render.ts`, `vitest.render.config.ts`, `tests/render/render.test.ts`

- [ ] **Step 1: Dependencies**

```bash
pnpm add playwright@1.59.1
pnpm add -D @trigger.dev/build@4.8.1
pnpm add -D @playwright/test@1.59.1
pnpm exec playwright install chromium
```

`@playwright/test` is pinned so it stays equal to `playwright`; the Trigger.dev extension reads the version from `playwright`. Add the script `"test:render": "vitest run --config vitest.render.config.ts"`.

- [ ] **Step 2: `vitest.render.config.ts`**

```ts
import path from "node:path"
import { defineConfig } from "vitest/config"

// Real Chromium: run with `pnpm test:render` after `pnpm exec playwright install chromium`.
export default defineConfig({
  test: { environment: "node", include: ["tests/render/**/*.test.ts"], testTimeout: 60_000, hookTimeout: 60_000 },
  resolve: { alias: { "@": path.resolve(__dirname, "./") } },
})
```

- [ ] **Step 3: Write the failing tests** in `tests/render/render.test.ts`

```ts
import { PDFDocument } from "pdf-lib"
import { type Browser, chromium } from "playwright"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { fuentesEmbebidas } from "@/lib/carrusel/fuentes"
import { renderizarCarrusel } from "@/lib/carrusel/render"
import { Falla } from "@/lib/dominio/falla"
import { htmlDelCarrusel } from "@/lib/plantillas/html"
import { carruselInicial } from "@/lib/plantillas/iniciales"
import { IDS_DE_TEMA, familiaDe } from "@/lib/plantillas/temas"

/** Width and height from a JPEG's first SOF marker. */
function medidas(jpeg: Uint8Array): { ancho: number; alto: number } {
  let i = 2
  while (i < jpeg.length) {
    const marcador = jpeg[i + 1] ?? 0
    const largo = ((jpeg[i + 2] ?? 0) << 8) + (jpeg[i + 3] ?? 0)
    if (marcador >= 0xc0 && marcador <= 0xc3)
      return { alto: ((jpeg[i + 5] ?? 0) << 8) + (jpeg[i + 6] ?? 0), ancho: ((jpeg[i + 7] ?? 0) << 8) + (jpeg[i + 8] ?? 0) }
    i += 2 + largo
  }
  throw new Error("JPEG sin SOF")
}

let navegador: Browser
beforeAll(async () => {
  navegador = await chromium.launch()
})
afterAll(async () => {
  await navegador.close()
})

describe("renderizarCarrusel", () => {
  test("every theme renders the default carousel: one 810x1012.5 pt page and one 2160x2700 JPEG per slide", async () => {
    const fuente = await fuentesEmbebidas()
    for (const tema of IDS_DE_TEMA) {
      const c = carruselInicial(familiaDe(tema))
      const r = await renderizarCarrusel(navegador, htmlDelCarrusel({ tema, ...c }, fuente))
      const pdf = await PDFDocument.load(r.pdf)
      expect(pdf.getPageCount(), tema).toBe(c.laminas.length)
      expect(pdf.getPage(0).getSize(), tema).toEqual({ width: 810, height: 1012.5 })
      expect(r.vistas, tema).toHaveLength(c.laminas.length)
      expect(medidas(r.vistas[0] as Uint8Array), tema).toEqual({ ancho: 2160, alto: 2700 })
      expect(new TextDecoder().decode(r.pdf.slice(0, 5))).toBe("%PDF-")
    }
  })

  test("refuses a slide whose text does not fit, naming it", async () => {
    // The schema's limits make overflow rare, so inject it: the first .note is the 8th slide (frase).
    const html = htmlDelCarrusel({ tema: "wav-noche", ...carruselInicial("wav") }, await fuentesEmbebidas()).replace(
      '<p class="note">',
      `<p class="note">${"desborde ".repeat(400)}`,
    )
    await expect(renderizarCarrusel(navegador, html)).rejects.toThrow(new Falla("La lámina 8 no cabe. Acórtala o divídela en dos."))
  })

  test("fails when a font did not load instead of rendering with a fallback", async () => {
    const html = htmlDelCarrusel({ tema: "oscura", ...carruselInicial("wr3") }, () => "data:font/woff2;base64,AAAA")
    await expect(renderizarCarrusel(navegador, html)).rejects.toThrow(/fuente/)
  })
})
```

- [ ] **Step 4: Run to verify they fail.** Run `pnpm test:render`. Expected: FAIL (modules missing).

- [ ] **Step 5: Implement `lib/carrusel/fuentes.ts`**

```ts
import { readFile } from "node:fs/promises"
import path from "node:path"
import { ARCHIVOS_DE_FUENTES, type UrlDeFuente } from "@/lib/plantillas/estilos"

// Trigger.dev only. additionalFiles ships assets/fuentes and legacyDevProcessCwdBehaviour: false makes process.cwd()
// the build directory, in dev and deploy alike (trigger.config.ts). Tests run from the repo root, where it also is.
const CARPETA = path.join(process.cwd(), "assets", "fuentes")

/** Every template font as a data: URL, so the page needs no file:// access. */
export async function fuentesEmbebidas(): Promise<UrlDeFuente> {
  const urls = new Map<string, string>()
  for (const archivo of ARCHIVOS_DE_FUENTES) {
    const datos = await readFile(path.join(CARPETA, archivo))
    urls.set(archivo, `data:font/woff2;base64,${datos.toString("base64")}`)
  }
  return (archivo) => {
    const url = urls.get(archivo)
    if (!url) throw new Error(`Fuente desconocida: ${archivo}`)
    return url
  }
}
```

- [ ] **Step 6: Implement `lib/carrusel/render.ts`**

```ts
import type { Browser } from "playwright"
import { Falla } from "@/lib/dominio/falla"

// Trigger.dev only.

const PAGINAS = (imagenes: string[]) => `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: 1080px 1350px; margin: 0; }
* { margin: 0; }
img { display: block; width: 1080px; height: 1350px; break-after: page; }
</style></head><body>${imagenes.map((src) => `<img src="${src}" alt="">`).join("")}</body></html>`

export interface Render {
  pdf: Uint8Array
  /** One 2160x2700 JPEG per slide: the same images the PDF carries, shown at gate 1. */
  vistas: Uint8Array[]
}

/**
 * Image-only PDF, as in wr3-web: Chromium exports blurred box-shadow as flat boxes plus a blur some readers drop, so
 * each slide ships as a 2x JPEG. Refuses (Falla) a slide whose content overflows; nothing is clipped silently.
 */
export async function renderizarCarrusel(navegador: Browser, html: string): Promise<Render> {
  const contexto = await navegador.newContext({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 })
  try {
    const pagina = await contexto.newPage()
    await pagina.setContent(html, { waitUntil: "load" })
    const fuentes = await pagina.evaluate(async () => {
      await document.fonts.ready
      return [...document.fonts].map((f) => ({ familia: f.family, estado: f.status }))
    })
    // A face no glyph uses stays «unloaded» and is harmless; a used face that cannot decode is «error».
    const rota = fuentes.find((f) => f.estado === "error")
    if (rota) throw new Error(`La fuente ${rota.familia} no cargó`)

    const desbordadas = await pagina.$$eval(".slide .content", (contenidos) =>
      contenidos.flatMap((c, i) => (c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1 ? [i + 1] : [])),
    )
    if (desbordadas.length > 0) throw new Falla(`La lámina ${desbordadas[0]} no cabe. Acórtala o divídela en dos.`)

    const vistas: Uint8Array[] = []
    for (const lamina of await pagina.$$(".slide")) vistas.push(await lamina.screenshot({ type: "jpeg", quality: 92 }))

    const impresora = await contexto.newPage()
    await impresora.setContent(PAGINAS(vistas.map((v) => `data:image/jpeg;base64,${Buffer.from(v).toString("base64")}`)), {
      waitUntil: "load",
    })
    const pdf = await impresora.pdf({ preferCSSPageSize: true, printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } })
    return { pdf: new Uint8Array(pdf), vistas }
  } finally {
    await contexto.close()
  }
}
```

  One thing to check when implementing: a grid or flex child can overflow its own box without growing `.content`. If the overflow test passes but a visual check of the 9 PDFs shows clipping, extend the check to `.slide` descendants whose `getBoundingClientRect().bottom` exceeds the `.foot` top.

- [ ] **Step 7: Run to verify they pass.** Run `pnpm test:render`. Expected: PASS. Open one PDF per family from a scratch script and compare it with `~/Projects/wr3-web/social/linkedin/out/00-plantilla-*.pdf`. The layout must match: the same theme, slide for slide.

- [ ] **Step 8: CI.** In `.github/workflows/ci.yml`, job `e2e`:
  - Change the browser install to `pnpm exec playwright install --with-deps webkit chromium`.
  - Add a step after it: `- run: pnpm test:render`.
  - Leave the `test` job alone: `vitest.config.ts` only includes `tests/unit`.

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.render.config.ts lib/carrusel/fuentes.ts lib/carrusel/render.ts tests/render .github/workflows/ci.yml
git commit -m "feat: render carousels to an image PDF in Chromium, refusing slides that overflow"
```

---

### Task 6: Migration: design requests, slides on versions, previews in the bucket

**Files:**
- Create: `supabase/migrations/20261104120000_disenos.sql`, `tests/integration/disenos.test.ts`
- Modify: `tests/integration/entorno.ts` (helper `carruselDe`), `lib/supabase/database.types.ts` (regenerated)

- [ ] **Step 1: Write the failing tests** in `tests/integration/disenos.test.ts`. Use the existing helpers: `personaConSesion`, `marcaConDueno`, `cuentaDe`, `admin`, `versionVigente`, `enDias`. Read `tests/integration/redaccion.test.ts` first and follow its setup style.

```ts
import { beforeAll, describe, expect, test } from "vitest"
import { carruselInicial } from "@/lib/plantillas/iniciales"
import { IDS_DE_TEMA, temasDeLaVoz } from "@/lib/plantillas/temas"
import { admin, cuentaDe, enDias, marcaConDueno, personaConSesion } from "./entorno"

const diseno = carruselInicial("wav")
const pedido = (cuenta: string, extra: Record<string, unknown> = {}) => ({
  p_cuenta: cuenta, p_tema: "wav-noche", p_titulo: "Documento", p_texto: "Texto del post", p_diseno: diseno, ...extra,
})
const RUTA = (marca: string) => `${marca}/${crypto.randomUUID()}.pdf`
const SHA = "a".repeat(64)

describe("design requests", () => {
  let dueno: Awaited<ReturnType<typeof personaConSesion>>
  let marca: string
  let cuenta: string
  beforeAll(async () => {
    dueno = await personaConSesion("e2e-disenos")
    marca = await marcaConDueno(dueno.userId, "nosotros")
    cuenta = await cuentaDe(marca, "empresa", "api")
  })

  test("SQL and TypeScript agree on which themes each voice may use", async () => {
    for (const voz of ["yo", "nosotros"] as const)
      for (const tema of IDS_DE_TEMA) {
        const { data, error } = await admin().rpc("tema_de_la_voz", { p_tema: tema, p_voz: voz })
        expect(error).toBeNull()
        expect(data, `${voz} ${tema}`).toBe(temasDeLaVoz(voz).includes(tema))
      }
  })

  test("an owner queues a design; a theme of another family is refused", async () => {
    const { data, error } = await dueno.db.rpc("pedir_diseno", pedido(cuenta))
    expect(error).toBeNull()
    expect(data).toMatch(/^[0-9a-f-]{36}$/)
    const otra = await dueno.db.rpc("pedir_diseno", pedido(cuenta, { p_tema: "personal-claro" }))
    expect(otra.error?.message).toBe("tema_de_otra_marca")
  })

  test("the worker takes it, saves a carousel piece with its slides and a proposed date", async () => {
    await admin().from("pedidos_de_diseno").update({ estado: "obsoleto" }).neq("estado", "obsoleto") // one at a time
    const { data: id } = await dueno.db.rpc("pedir_diseno", pedido(cuenta))
    const { data: tomados } = await admin().rpc("tomar_pedidos_de_diseno")
    expect(tomados?.map((p) => p.id)).toEqual([id])
    const ruta = RUTA(marca)
    const { data: guardado, error } = await admin().rpc("guardar_diseno", {
      p_pedido: id, p_archivo_ruta: ruta, p_archivo_sha256: SHA, p_planeada_para: enDias(3),
    })
    expect(error).toBeNull()
    const { pieza } = guardado as { pieza: string; version: string }
    const { data: v } = await admin().from("versiones").select("tema, diseno, archivo_ruta, titulo").eq("pieza_id", pieza).single()
    expect(v).toMatchObject({ tema: "wav-noche", archivo_ruta: ruta, titulo: "Documento" })
    expect(v?.diseno).toEqual(diseno)
    const { data: p } = await admin().from("pedidos_de_diseno").select("estado, resultado_pieza_id").eq("id", id).single()
    expect(p).toEqual({ estado: "hecho", resultado_pieza_id: pieza })
  })

  test("a new render of a signed piece is a new version that drops the signature", async () => {
    const pieza = await carruselDe(dueno.db, cuenta, marca)
    const v1 = await versionVigente(pieza)
    const firma = await dueno.db.rpc("firmar_pieza", { p_pieza: pieza, p_huella: v1.huella, p_programada_para: enDias(4) })
    expect(firma.error).toBeNull()
    const { data: id, error } = await dueno.db.rpc("pedir_diseno", pedido(cuenta, { p_pieza: pieza }))
    expect(error).toBeNull()
    await tomarSolo(id as string)
    const { data: guardado } = await admin().rpc("guardar_diseno", { p_pedido: id, p_archivo_ruta: RUTA(marca), p_archivo_sha256: SHA })
    expect(guardado).not.toBeNull()
    const { data: p } = await admin().from("piezas").select("estado").eq("id", pieza).single()
    expect(p?.estado).toBe("por_aprobar")
    const { data: vigentes } = await admin().from("firmas").select("id").eq("pieza_id", pieza).eq("vigente", true)
    expect(vigentes).toEqual([])
  })

  test("an edit asked on an old version is obsolete when the piece moved on", async () => {
    const pieza = await carruselDe(dueno.db, cuenta, marca)
    const { data: id } = await dueno.db.rpc("pedir_diseno", pedido(cuenta, { p_pieza: pieza }))
    const otra = await dueno.db.rpc("nueva_version", {
      p_pieza: pieza, p_texto: "Cambio a mano", p_titulo: "Documento", p_archivo_ruta: RUTA(marca), p_archivo_sha256: SHA,
    })
    expect(otra.error).toBeNull()
    await tomarSolo(id as string)
    const { data, error } = await admin().rpc("guardar_diseno", { p_pedido: id, p_archivo_ruta: RUTA(marca), p_archivo_sha256: SHA })
    expect(error).toBeNull()
    expect(data).toBeNull()
    const { data: p } = await admin().from("pedidos_de_diseno").select("estado").eq("id", id).single()
    expect(p?.estado).toBe("obsoleto")
  })

  test("at most 5 open requests per brand, one per piece, and only owners ask", async () => {
    const otro = await personaConSesion("e2e-disenos-limite")
    const marcaB = await marcaConDueno(otro.userId, "nosotros")
    const cuentaB = await cuentaDe(marcaB, "empresa", "api")
    const pieza = await carruselDe(otro.db, cuentaB, marcaB)
    expect((await otro.db.rpc("pedir_diseno", pedido(cuentaB, { p_pieza: pieza }))).error).toBeNull()
    const repetido = await otro.db.rpc("pedir_diseno", pedido(cuentaB, { p_pieza: pieza }))
    expect(repetido.error?.message).toBe("pedido_en_curso")
    for (let i = 0; i < 4; i++) expect((await otro.db.rpc("pedir_diseno", pedido(cuentaB))).error).toBeNull()
    const sexto = await otro.db.rpc("pedir_diseno", pedido(cuentaB))
    expect(sexto.error?.message).toBe("demasiados_pedidos")
    const ajeno = await dueno.db.rpc("pedir_diseno", pedido(cuentaB))
    expect(ajeno.error?.message).toBe("solo_el_dueno_pide_disenos")
  })

  test("the bucket takes JPEG previews", async () => {
    const { error } = await admin().storage.from("piezas").upload(`${marca}/${crypto.randomUUID()}/01.jpg`, new Uint8Array([0xff, 0xd8, 0xff]), {
      contentType: "image/jpeg",
    })
    expect(error).toBeNull()
  })
})
```

  Add `versionVigente` and `carruselDe` to the import from `./entorno`. Add `carruselDe` to `tests/integration/entorno.ts` (Task 9 reuses it), and `tomarSolo` to the test file:

```ts
// tests/integration/entorno.ts
/** A hand-made carousel piece (C1 path); a stub PDF is enough, the database never reads it. */
export async function carruselDe(db: SupabaseClient<Database>, cuentaId: string, marcaId?: string): Promise<string> {
  const marca = marcaId ?? (await admin().from("cuentas").select("marca_id").eq("id", cuentaId).single()).data?.marca_id
  const ruta = `${marca}/${crypto.randomUUID()}.pdf`
  await admin().storage.from("piezas").upload(ruta, new TextEncoder().encode("%PDF-1.4"), { contentType: "application/pdf" })
  const { data, error } = await db.rpc("crear_pieza", {
    p_cuenta: cuentaId, p_formato: "carrusel_pdf", p_texto: "Post", p_titulo: "Documento", p_archivo_ruta: ruta,
    p_archivo_sha256: "a".repeat(64),
  })
  if (error) throw error
  return data
}

// tests/integration/disenos.test.ts
/** tomar_pedidos_de_diseno is global and takes the oldest: close every other open request first. */
async function tomarSolo(id: string): Promise<void> {
  await admin().from("pedidos_de_diseno").update({ estado: "obsoleto" }).in("estado", ["pendiente", "trabajando"]).neq("id", id)
  const { data } = await admin().rpc("tomar_pedidos_de_diseno")
  expect(data?.map((p) => p.id)).toEqual([id])
}
```

  The first worker test uses `tomarSolo(id)` too, in place of its own `update` and `tomar` lines. The cap test's brand B is new, so its count starts at zero. The non-owner case uses brand A's owner asking on brand B's account. Check `es_dueno` semantics: a non-member is refused like a member who is not the owner.

- [ ] **Step 2: Run to verify they fail.** Run `pnpm db:reset && pnpm test:db -- tests/integration/disenos.test.ts`. Expected: FAIL («function pedir_diseno does not exist»).

- [ ] **Step 3: Write the migration** `supabase/migrations/20261104120000_disenos.sql`

```sql
-- 4b: carousels from Federico's 9 templates. A person's action only queues a design request; the Trigger.dev task
-- armar-carruseles renders it in Chromium, uploads the PDF and its slide previews, and saves the piece through the
-- service-role RPCs below. The version's huella already covers the file's sha256, so firmar_pieza is the D25 single
-- signature. Plano: «Plantillas (D24)», «Armar diseño», «Puerta 1».

alter table public.versiones add column tema text;
alter table public.versiones add column diseno jsonb;
alter table public.versiones add constraint diseno_completo check ((tema is null) = (diseno is null));
alter table public.versiones add constraint diseno_es_objeto check (
  diseno is null or (jsonb_typeof(diseno) = 'object' and jsonb_typeof(diseno -> 'laminas') = 'array')
);

-- Slide previews (<marca>/<archivo>/NN.jpg) live next to the PDF; members already read their brand's folder.
update storage.buckets set allowed_mime_types = array['application/pdf', 'image/jpeg'] where id = 'piezas';

-- Mirrors temasDeLaVoz (lib/plantillas/temas.ts); tests/integration/disenos.test.ts keeps them equal.
create function public.tema_de_la_voz(p_tema text, p_voz text) returns boolean
language sql immutable set search_path = '' as $$
  select case p_voz
    when 'nosotros' then p_tema in ('oscura', 'papel', 'magenta', 'wav-noche', 'wav-papel', 'wav-degradado')
    when 'yo' then p_tema in ('personal-claro', 'personal-grafito', 'personal-arena')
    else false
  end
$$;

create table public.pedidos_de_diseno (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  pieza_id uuid references public.piezas (id) on delete cascade,
  version_base_id uuid references public.versiones (id) on delete set null,
  tema text not null,
  titulo text not null check (length(btrim(titulo)) between 1 and 100),
  texto text not null check (length(btrim(texto)) between 1 and 3000),
  diseno jsonb not null check (
    jsonb_typeof(diseno) = 'object' and jsonb_typeof(diseno -> 'laminas') = 'array'
    and jsonb_array_length(diseno -> 'laminas') between 3 and 10
  ),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'trabajando', 'hecho', 'fallo', 'obsoleto')),
  motivo text check (length(motivo) <= 500),
  resultado_pieza_id uuid references public.piezas (id) on delete set null,
  arrendado_hasta timestamptz,
  pedido_por uuid not null references auth.users (id),
  creado_en timestamptz not null default now(),
  terminado_en timestamptz,
  constraint edicion_con_base check ((pieza_id is null) = (version_base_id is null))
);
create index pedidos_de_diseno_abiertos on public.pedidos_de_diseno (creado_en) where estado in ('pendiente', 'trabajando');
create index pedidos_de_diseno_por_cuenta on public.pedidos_de_diseno (cuenta_id);
create index pedidos_de_diseno_por_pieza on public.pedidos_de_diseno (pieza_id) where pieza_id is not null;
create index pedidos_de_diseno_por_base on public.pedidos_de_diseno (version_base_id) where version_base_id is not null;
create index pedidos_de_diseno_por_resultado on public.pedidos_de_diseno (resultado_pieza_id) where resultado_pieza_id is not null;
create index pedidos_de_diseno_por_persona on public.pedidos_de_diseno (pedido_por);

alter table public.pedidos_de_diseno enable row level security;
create policy "miembros ven pedidos de diseño" on public.pedidos_de_diseno for select to authenticated
  using (public.es_miembro((select marca_id from public.cuentas where id = cuenta_id)));
revoke all on public.pedidos_de_diseno from anon, authenticated;
grant select on public.pedidos_de_diseno to authenticated;

-- Owners only (D4). The slides' content is checked by revisarCarrusel before this and again in the worker.
create function public.pedir_diseno(
  p_cuenta uuid, p_tema text, p_titulo text, p_texto text, p_diseno jsonb, p_pieza uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_marca uuid;
  v_voz text;
  v_pieza public.piezas;
  v_base uuid;
  v_id uuid;
begin
  select c.marca_id, m.voz into v_marca, v_voz
    from public.cuentas c join public.marcas m on m.id = c.marca_id where c.id = p_cuenta;
  if v_marca is null or not public.es_dueno(v_marca) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_pide_disenos';
  end if;
  if not public.tema_de_la_voz(p_tema, v_voz) then
    raise exception using errcode = '22023', message = 'tema_de_otra_marca';
  end if;
  if p_pieza is not null then
    select * into v_pieza from public.piezas where id = p_pieza for update;
    if not found or v_pieza.cuenta_id <> p_cuenta then
      raise exception using errcode = '22023', message = 'pieza_de_otra_cuenta';
    end if;
    if v_pieza.formato <> 'carrusel_pdf' then
      raise exception using errcode = '22023', message = 'solo_carruseles';
    end if;
    if v_pieza.estado not in ('por_aprobar', 'en_reserva', 'programada', 'a_mano') then
      raise exception using errcode = '22023', message = 'pieza_no_editable';
    end if;
    if exists (select 1 from public.pedidos_de_diseno where pieza_id = p_pieza and estado in ('pendiente', 'trabajando')) then
      raise exception using errcode = '22023', message = 'pedido_en_curso';
    end if;
    select id into v_base from public.versiones where pieza_id = p_pieza order by numero desc limit 1;
  end if;
  perform pg_advisory_xact_lock(hashtext('pedidos_de_diseno:' || v_marca::text));
  if (select count(*) from public.pedidos_de_diseno p join public.cuentas c on c.id = p.cuenta_id
       where c.marca_id = v_marca and p.estado in ('pendiente', 'trabajando')) >= 5 then
    raise exception using errcode = '22023', message = 'demasiados_pedidos';
  end if;
  insert into public.pedidos_de_diseno (cuenta_id, pieza_id, version_base_id, tema, titulo, texto, diseno, pedido_por)
  values (p_cuenta, p_pieza, v_base, p_tema, btrim(p_titulo), btrim(p_texto), p_diseno, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- The renderer (service role only). One at a time: Chromium is the slow part and a run is far below the lease.
create function public.tomar_pedidos_de_diseno() returns setof public.pedidos_de_diseno
language sql security definer set search_path = '' as $$
  update public.pedidos_de_diseno p set estado = 'trabajando', arrendado_hasta = now() + interval '10 minutes'
   where p.id in (
     select id from public.pedidos_de_diseno
      where estado = 'pendiente' or (estado = 'trabajando' and arrendado_hasta < now())
      order by creado_en
      limit 1
      for update skip locked)
  returning p.*
$$;

create function public.terminar_pedido_de_diseno(p_pedido uuid, p_estado text, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_estado not in ('fallo', 'obsoleto') then
    raise exception using errcode = '22023', message = 'estado_de_pedido_invalido';
  end if;
  update public.pedidos_de_diseno
     set estado = p_estado, motivo = left(p_motivo, 500), terminado_en = now(), arrendado_hasta = null
   where id = p_pedido and estado = 'trabajando';
end $$;

-- Null when an edit's piece moved on while it rendered (signed elsewhere, edited, discarded): that decision stands.
create function public.guardar_diseno(
  p_pedido uuid, p_archivo_ruta text, p_archivo_sha256 text, p_planeada_para timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_pedido public.pedidos_de_diseno;
  v_pieza public.piezas;
  v_ultima public.versiones;
  v_pieza_id uuid;
  v_version uuid;
begin
  select * into v_pedido from public.pedidos_de_diseno where id = p_pedido for update;
  if not found or v_pedido.estado <> 'trabajando' then
    raise exception using errcode = '22023', message = 'pedido_no_esta_trabajando';
  end if;
  if v_pedido.pieza_id is null then
    insert into public.piezas (cuenta_id, formato, creada_por, planeada_para)
    values (v_pedido.cuenta_id, 'carrusel_pdf', v_pedido.pedido_por, p_planeada_para)
    returning id into v_pieza_id;
    insert into public.versiones (pieza_id, numero, texto, titulo, archivo_ruta, archivo_sha256, creada_por, tema, diseno)
    values (v_pieza_id, 1, v_pedido.texto, v_pedido.titulo, p_archivo_ruta, p_archivo_sha256, v_pedido.pedido_por,
            v_pedido.tema, v_pedido.diseno)
    returning id into v_version;
  else
    select * into v_pieza from public.piezas where id = v_pedido.pieza_id for update;
    select * into v_ultima from public.versiones where pieza_id = v_pedido.pieza_id order by numero desc limit 1;
    if not found or v_pieza.estado not in ('por_aprobar', 'en_reserva', 'programada', 'a_mano')
       or v_ultima.id is distinct from v_pedido.version_base_id then
      update public.pedidos_de_diseno
         set estado = 'obsoleto', motivo = 'La pieza cambió mientras se armaba el carrusel; no se aplicó.',
             terminado_en = now(), arrendado_hasta = null
       where id = p_pedido;
      return null;
    end if;
    v_pieza_id := v_pieza.id;
    -- The versions trigger drops a vigente signature and sends a scheduled piece back to por_aprobar.
    insert into public.versiones (pieza_id, numero, texto, titulo, archivo_ruta, archivo_sha256, creada_por, tema, diseno)
    values (v_pieza_id, v_ultima.numero + 1, v_pedido.texto, v_pedido.titulo, p_archivo_ruta, p_archivo_sha256,
            v_pedido.pedido_por, v_pedido.tema, v_pedido.diseno)
    returning id into v_version;
  end if;
  update public.pedidos_de_diseno
     set estado = 'hecho', resultado_pieza_id = v_pieza_id, terminado_en = now(), arrendado_hasta = null
   where id = p_pedido;
  return jsonb_build_object('pieza', v_pieza_id, 'version', v_version);
end $$;

revoke execute on function public.pedir_diseno(uuid, text, text, text, jsonb, uuid) from public, anon;
grant execute on function public.pedir_diseno(uuid, text, text, text, jsonb, uuid) to authenticated;
revoke execute on function public.tomar_pedidos_de_diseno() from public, anon, authenticated;
revoke execute on function public.terminar_pedido_de_diseno(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.guardar_diseno(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.tema_de_la_voz(text, text) from public, anon;
grant execute on function public.tomar_pedidos_de_diseno() to service_role;
grant execute on function public.terminar_pedido_de_diseno(uuid, text, text) to service_role;
grant execute on function public.guardar_diseno(uuid, text, text, timestamptz) to service_role;
grant execute on function public.tema_de_la_voz(text, text) to authenticated, service_role;
```

  Before running, check the real column names against the earlier migrations: `versiones.creada_por`, the C2 versions trigger that drops the signature, and `piezas.planeada_para`'s slot index. If the versions trigger only fires for `nueva_version`, call the same internal helper here. Grep for `numero > 1` in `20261030120000_calendario_y_reserva.sql`. Also confirm `es_dueno` and `marcas.voz` exist under those names.

- [ ] **Step 4: Run to verify they pass.**

```bash
pnpm db:reset
pnpm test:db -- tests/integration/disenos.test.ts
pnpm db:types
pnpm type
```

  Expected: PASS, and the types regenerate with `pedidos_de_diseno`, `versiones.tema` and `versiones.diseno`.

- [ ] **Step 5: Run the whole DB suite.** Run `pnpm test:db`. Expected: PASS. Earlier tests that insert versions must still pass with the two new nullable columns.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261104120000_disenos.sql lib/supabase/database.types.ts tests/integration/disenos.test.ts tests/integration/entorno.ts
git commit -m "feat: design requests and slides on versions, saved through service-role RPCs"
```

---

### Task 7: The worker: take, render, upload, save

**Files:**
- Create: `lib/carrusel/armar.ts`, `lib/carrusel/repositorio.ts`
- Test: `tests/unit/armar-carruseles.test.ts`, `tests/integration/repositorio-de-carruseles.test.ts`

- [ ] **Step 1: Write the failing unit tests** (orchestration with fakes)

```ts
import { describe, expect, test, vi } from "vitest"
import { armarCarruseles, type PedidoDeDiseno, type PuertosDeArmado } from "@/lib/carrusel/armar"
import { Falla } from "@/lib/dominio/falla"
import { carruselInicial } from "@/lib/plantillas/iniciales"

const pedido: PedidoDeDiseno = {
  id: "p1", marcaId: "m1", cuentaId: "c1", tema: "wav-noche", titulo: "Doc", texto: "Post", diseno: carruselInicial("wav"),
}
function puertos(over: Partial<PuertosDeArmado> = {}): PuertosDeArmado {
  return {
    tomar: vi.fn(async () => [pedido]),
    renderizar: vi.fn(async () => ({ pdf: new Uint8Array([37, 80, 68, 70, 45]), vistas: [new Uint8Array([1]), new Uint8Array([2])] })),
    subir: vi.fn(async () => {}),
    guardar: vi.fn(async () => ({ piezaId: "pz", versionId: "v" })),
    terminar: vi.fn(async () => {}),
    nuevaRuta: () => "m1/00000000-0000-0000-0000-000000000000",
    ...over,
  }
}

describe("armarCarruseles", () => {
  test("renders, uploads the PDF and its numbered previews, then saves with the PDF's sha256", async () => {
    const p = puertos()
    expect(await armarCarruseles(p)).toEqual({ armados: 1, fallidos: 0 })
    expect(p.subir).toHaveBeenCalledWith("m1/00000000-0000-0000-0000-000000000000.pdf", expect.any(Uint8Array), "application/pdf")
    expect(p.subir).toHaveBeenCalledWith("m1/00000000-0000-0000-0000-000000000000/01.jpg", expect.any(Uint8Array), "image/jpeg")
    expect(p.subir).toHaveBeenCalledWith("m1/00000000-0000-0000-0000-000000000000/02.jpg", expect.any(Uint8Array), "image/jpeg")
    expect(p.guardar).toHaveBeenCalledWith(pedido, "m1/00000000-0000-0000-0000-000000000000.pdf", expect.stringMatching(/^[0-9a-f]{64}$/))
  })

  test("uploads the previews before the PDF is saved, so gate 1 never shows a piece without them", async () => {
    const orden: string[] = []
    const p = puertos({
      subir: vi.fn(async (ruta: string) => { orden.push(ruta) }),
      guardar: vi.fn(async () => { orden.push("guardar"); return { piezaId: "pz", versionId: "v" } }),
    })
    await armarCarruseles(p)
    expect(orden.at(-1)).toBe("guardar")
  })

  test("a slide that does not fit closes the request with its reason and uploads nothing", async () => {
    const p = puertos({ renderizar: vi.fn(async () => { throw new Falla("La lámina 3 no cabe. Acórtala o divídela en dos.") }) })
    expect(await armarCarruseles(p)).toEqual({ armados: 0, fallidos: 1 })
    expect(p.subir).not.toHaveBeenCalled()
    expect(p.terminar).toHaveBeenCalledWith("p1", "fallo", "La lámina 3 no cabe. Acórtala o divídela en dos.")
  })

  test("re-checks the slides before rendering: a request that no longer passes the schema fails without Chromium", async () => {
    const malo = { ...pedido, diseno: { antetitulo: "x", laminas: [] } }
    const p = puertos({ tomar: vi.fn(async () => [malo as unknown as PedidoDeDiseno]) })
    await armarCarruseles(p)
    expect(p.renderizar).not.toHaveBeenCalled()
    expect(p.terminar).toHaveBeenCalledWith("p1", "fallo", "Un carrusel lleva de 3 a 10 láminas.")
  })

  test("an unexpected error closes the request generically and rethrows at the end", async () => {
    const p = puertos({ subir: vi.fn(async () => { throw new Error("storage down") }) })
    await expect(armarCarruseles(p)).rejects.toThrow("Hubo carruseles con errores inesperados")
    expect(p.terminar).toHaveBeenCalledWith("p1", "fallo", "No pude armar el carrusel. Pídelo de nuevo en un rato.")
  })

  test("an obsolete edit is not a failure", async () => {
    const p = puertos({ guardar: vi.fn(async () => null) })
    expect(await armarCarruseles(p)).toEqual({ armados: 0, fallidos: 0 })
    expect(p.terminar).not.toHaveBeenCalled()
  })

  test("with nothing to do it never opens Chromium", async () => {
    const p = puertos({ tomar: vi.fn(async () => []) })
    expect(await armarCarruseles(p)).toEqual({ armados: 0, fallidos: 0 })
    expect(p.renderizar).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify they fail.** Run `pnpm vitest run tests/unit/armar-carruseles.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement `lib/carrusel/armar.ts`**

```ts
import { createHash } from "node:crypto"
import { Falla } from "@/lib/dominio/falla"
import { htmlDelCarrusel } from "@/lib/plantillas/html"
import { type Carrusel, revisarCarrusel } from "@/lib/plantillas/laminas"
import type { IdDeTema } from "@/lib/plantillas/temas"
import type { UrlDeFuente } from "@/lib/plantillas/estilos"
import type { Render } from "./render"

// Trigger.dev only.

export interface PedidoDeDiseno {
  id: string
  marcaId: string
  cuentaId: string
  tema: IdDeTema
  titulo: string
  texto: string
  diseno: Carrusel
}

export interface PuertosDeArmado {
  tomar(): Promise<PedidoDeDiseno[]>
  /** HTML in, render out; the caller owns Chromium and the fonts. */
  renderizar(html: (fuente: UrlDeFuente) => string): Promise<Render>
  subir(ruta: string, datos: Uint8Array, tipo: "application/pdf" | "image/jpeg"): Promise<void>
  /** Null when an edit's piece moved on (the database closed the request as obsolete). */
  guardar(pedido: PedidoDeDiseno, ruta: string, sha256: string): Promise<{ piezaId: string; versionId: string } | null>
  terminar(pedidoId: string, estado: "fallo", motivo: string): Promise<void>
  /** `<marca>/<uuid>`, without extension. */
  nuevaRuta(marcaId: string): string
}

const GENERICO = "No pude armar el carrusel. Pídelo de nuevo en un rato."
const dos = (n: number) => String(n).padStart(2, "0")

async function armarUno(p: PuertosDeArmado, pedido: PedidoDeDiseno): Promise<boolean> {
  const revisado = revisarCarrusel(pedido.diseno)
  if (!revisado.ok) throw new Falla(revisado.error)
  const render = await p.renderizar((fuente) => htmlDelCarrusel({ tema: pedido.tema, ...revisado.carrusel }, fuente))
  const base = p.nuevaRuta(pedido.marcaId)
  for (const [i, vista] of render.vistas.entries()) await p.subir(`${base}/${dos(i + 1)}.jpg`, vista, "image/jpeg")
  await p.subir(`${base}.pdf`, render.pdf, "application/pdf")
  const sha = createHash("sha256").update(render.pdf).digest("hex")
  return (await p.guardar(pedido, `${base}.pdf`, sha)) !== null
}

/** One attempt per request; a failure closes it with a reason Federico can read. Unexpected errors rethrow at the end. */
export async function armarCarruseles(p: PuertosDeArmado): Promise<{ armados: number; fallidos: number }> {
  const pedidos = await p.tomar()
  const inesperados: unknown[] = []
  let armados = 0
  let fallidos = 0
  for (const pedido of pedidos) {
    try {
      if (await armarUno(p, pedido)) armados++
    } catch (error) {
      fallidos++
      if (!(error instanceof Falla)) {
        console.error(`Carrusel ${pedido.id} falló`, error instanceof Error ? error.message : String(error))
        inesperados.push(error)
      }
      try {
        await p.terminar(pedido.id, "fallo", error instanceof Falla ? error.message : GENERICO)
      } catch (alTerminar) {
        inesperados.push(alTerminar)
      }
    }
  }
  if (inesperados.length > 0) throw new AggregateError(inesperados, "Hubo carruseles con errores inesperados")
  return { armados, fallidos }
}
```

- [ ] **Step 4: Run to verify they pass.** Run `pnpm vitest run tests/unit/armar-carruseles.test.ts`. Expected: PASS.

- [ ] **Step 5: Write the failing integration test** `tests/integration/repositorio-de-carruseles.test.ts`. Against local Supabase, with a stub `renderizar` (no Chromium):
  - `repositorioDeCarruseles(admin())` takes a queued request with its `marcaId` and a parsed `diseno`.
  - `subir` puts a file in the bucket.
  - `guardar` creates the piece with `planeada_para` on a free slot of the account (not null).
  - `terminar` closes it as `fallo`.

  Follow `tests/integration/repositorio-de-redaccion.test.ts` (read it first) for setup and cleanup. Call `admin().from("pedidos_de_diseno").update({ estado: "obsoleto" }).in("estado", ["pendiente", "trabajando"])` before each test, because `tomar` is global.

- [ ] **Step 6: Implement `lib/carrusel/repositorio.ts`**

```ts
import { z } from "zod"
import { Carrusel } from "@/lib/plantillas/laminas"
import { esTema } from "@/lib/plantillas/temas"
import { proponerFecha } from "@/lib/piezas/horarios"
import { horariosOcupados, leerTipo } from "@/lib/piezas/lectura"
import type { Db } from "@/lib/supabase/database"
import type { PedidoDeDiseno, PuertosDeArmado } from "./armar"

// Service role only (Trigger.dev).

function fallo(accion: string, error: { message: string }): never {
  throw new Error(`${accion}: ${error.message}`, { cause: error })
}
const Guardado = z.object({ pieza: z.uuid(), version: z.uuid() }).nullable()
// Two saves can race for the same proposed slot; the slot index refuses the second (23505). Same rule as 4c.
const INTENTOS_DE_PLAN = 3

export function repositorioDeCarruseles(db: Db): Omit<PuertosDeArmado, "renderizar"> {
  return {
    async tomar() {
      const { data, error } = await db.rpc("tomar_pedidos_de_diseno")
      if (error) fallo("No pude tomar los pedidos de diseño", error)
      if (data.length === 0) return []
      const { data: cuentas, error: e2 } = await db.from("cuentas").select("id, marca_id").in("id", data.map((p) => p.cuenta_id))
      if (e2) fallo("No pude leer las cuentas de los pedidos de diseño", e2)
      return data.map((p): PedidoDeDiseno => {
        if (!esTema(p.tema)) throw new Error(`Tema desconocido en el pedido ${p.id}: ${p.tema}`)
        return {
          id: p.id,
          marcaId: cuentas.find((c) => c.id === p.cuenta_id)?.marca_id ?? "",
          cuentaId: p.cuenta_id,
          tema: p.tema,
          titulo: p.titulo,
          texto: p.texto,
          // Parsed again (and trimmed) by armarUno through revisarCarrusel; here it only needs the shape.
          diseno: p.diseno as unknown as Carrusel,
        }
      })
    },

    async subir(ruta, datos, tipo) {
      const { error } = await db.storage.from("piezas").upload(ruta, datos, { contentType: tipo, upsert: false })
      if (error) fallo(`No pude subir ${ruta}`, error)
    },

    async guardar(pedido, ruta, sha256) {
      for (let intento = 1; ; intento++) {
        const planeada = await fechaPropuesta(db, pedido)
        const { data, error } = await db.rpc("guardar_diseno", {
          p_pedido: pedido.id,
          p_archivo_ruta: ruta,
          p_archivo_sha256: sha256,
          p_planeada_para: planeada?.toISOString(),
        })
        if (error?.code === "23505" && intento < INTENTOS_DE_PLAN) continue
        if (error) fallo("No pude guardar el carrusel", error)
        const g = Guardado.parse(data)
        return g ? { piezaId: g.pieza, versionId: g.version } : null
      }
    },

    async terminar(pedidoId, estado, motivo) {
      const { error } = await db.rpc("terminar_pedido_de_diseno", { p_pedido: pedidoId, p_estado: estado, p_motivo: motivo })
      if (error) fallo("No pude cerrar el pedido de diseño", error)
    },

    nuevaRuta: (marcaId) => `${marcaId}/${crypto.randomUUID()}`,
  }
}

/** A new carousel gets the account's next free slot, like a text Claude wrote; an edit keeps its piece's plan. */
async function fechaPropuesta(db: Db, pedido: PedidoDeDiseno): Promise<Date | null> {
  const { data: cuenta, error } = await db.from("cuentas").select("tipo").eq("id", pedido.cuentaId).single()
  if (error) fallo("No pude leer la cuenta del carrusel", error)
  const ahora = Date.now()
  try {
    return proponerFecha(leerTipo(cuenta.tipo), await horariosOcupados(db, pedido.cuentaId, ahora), ahora)
  } catch (sinHorario) {
    console.error("No encontré horario para el carrusel", sinHorario instanceof Error ? sinHorario.message : String(sinHorario))
    return null
  }
}
```

  Check `horariosOcupados`'s exact signature in `lib/piezas/lectura.ts:74` before writing this.

- [ ] **Step 7: Run to verify they pass.** Run `pnpm test:db -- tests/integration/repositorio-de-carruseles.test.ts`. Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/carrusel/armar.ts lib/carrusel/repositorio.ts tests/unit/armar-carruseles.test.ts tests/integration/repositorio-de-carruseles.test.ts
git commit -m "feat: take design requests, render, upload the PDF and its previews, save the piece"
```

---

### Task 8: The Trigger.dev task, its build and the Worker boundary

**Files:**
- Create: `trigger/carruseles.ts`
- Modify: `trigger.config.ts`, `tests/unit/limites-del-worker.test.ts`

- [ ] **Step 1: Write the failing boundary test.** Append inside `describe("Worker boundary")` in `tests/unit/limites-del-worker.test.ts`:

```ts
  test("nothing reachable from a route, a component or the proxy imports the carousel renderer or Playwright", () => {
    const entradas = [
      ...archivos("app"),
      ...archivos("components"),
      ...(disco.esArchivo("proxy.ts") ? ["proxy.ts"] : []),
    ]
    const grafo = recorrerImports(entradas, disco)
    expect(grafo.sinResolver).toEqual([])
    expect([...grafo.archivos].filter((a) => a.startsWith("lib/carrusel/"))).toEqual([])
    expect([...grafo.paquetes].filter((p) => p === "playwright" || p.startsWith("playwright/"))).toEqual([])
  })
```

  It passes today, because nothing imports `lib/carrusel` yet. Make it fail once to prove it works: temporarily add `import "@/lib/carrusel/render"` to `app/(app)/piezas/carrusel/page.tsx` or to any page, run it, see it fail, and remove the import.

- [ ] **Step 2: `trigger.config.ts`**

```ts
import { additionalFiles } from "@trigger.dev/build/extensions/core"
import { playwright } from "@trigger.dev/build/extensions/playwright"
import { defineConfig } from "@trigger.dev/sdk"

export default defineConfig({
  project: "proj_cfileylububfgxfoqhyb",
  dirs: ["./trigger"],
  runtime: "node",
  maxDuration: 540,
  // process.cwd() is the build directory in dev as in deploy, so lib/carrusel/fuentes.ts finds assets/fuentes.
  legacyDevProcessCwdBehaviour: false,
  retries: { enabledInDev: false, default: { maxAttempts: 1 } },
  build: {
    extensions: [playwright({ browsers: ["chromium"] }), additionalFiles({ files: ["./assets/fuentes/**"] })],
  },
})
```

  Keep any existing keys exactly as they are; this only adds `legacyDevProcessCwdBehaviour` and `build`. Check that no existing task reads a relative path that depended on the old cwd: `grep -rn "process.cwd\|readFile" trigger lib --include=*.ts`.

- [ ] **Step 3: `trigger/carruseles.ts`**

```ts
import { schedules } from "@trigger.dev/sdk"
import { type Browser, chromium } from "playwright"
import { armarCarruseles } from "@/lib/carrusel/armar"
import { fuentesEmbebidas } from "@/lib/carrusel/fuentes"
import { renderizarCarrusel } from "@/lib/carrusel/render"
import { repositorioDeCarruseles } from "@/lib/carrusel/repositorio"
import { createAdminClient } from "@/lib/supabase/admin"

// Every 2 minutes, one run at a time, on a 2 GB machine (Chromium). No retries: a failed request stays «fallo» with
// its reason and Federico asks again. Chromium starts only when there is a request.
export const armarCarrusel = schedules.task({
  id: "armar-carruseles",
  cron: { pattern: "*/2 * * * *", timezone: "America/Santiago" },
  machine: "medium-1x",
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async () => {
    const repo = repositorioDeCarruseles(createAdminClient())
    const abierto: { navegador?: Browser } = {}
    try {
      return await armarCarruseles({
        ...repo,
        async renderizar(html) {
          abierto.navegador ??= await chromium.launch()
          return renderizarCarrusel(abierto.navegador, html(await fuentesEmbebidas()))
        },
      })
    } finally {
      await abierto.navegador?.close()
    }
  },
})
```

  `machine` on `schedules.task`: check it is accepted as `machine: "medium-1x"` in SDK 4.8.1 with the Trigger.dev MCP (`search_docs` «machine task option»). Older docs nest it as `machine: { preset: "medium-1x" }`.

- [ ] **Step 4: Verify the build locally.** Run `pnpm exec trigger deploy --dry-run --env prod --skip-update-check` (if the flag exists in 4.8.1; otherwise `pnpm exec trigger dev` and trigger the task once against local Supabase with a queued request). Expected: the build includes Chromium and `assets/fuentes`, and in dev a queued request becomes a piece with previews.

- [ ] **Step 5: Run the unit suite.** Run `pnpm test:run`. Expected: PASS, including the new boundary test.

- [ ] **Step 6: Commit**

```bash
git add trigger/carruseles.ts trigger.config.ts tests/unit/limites-del-worker.test.ts
git commit -m "feat: armar-carruseles task with Chromium and the template fonts"
```

---

### Task 9: Asking for a carousel, and reading its state

**Files:**
- Create: `lib/disenos/acciones.ts`, `lib/disenos/lectura.ts`, `app/(app)/piezas/carrusel/acciones.ts`
- Modify: `lib/sesion/rutas.ts`
- Test: `tests/integration/acciones-disenos.test.ts`

- [ ] **Step 1: Write the failing tests** in `tests/integration/acciones-disenos.test.ts`

```ts
import { beforeAll, describe, expect, test } from "vitest"
import { pedirDiseno } from "@/lib/disenos/acciones"
import { disenoDePieza, pedidosDeDisenoRecientes } from "@/lib/disenos/lectura"
import { carruselInicial } from "@/lib/plantillas/iniciales"
import { admin, cuentaDe, marcaConDueno, personaConSesion } from "./entorno"

describe("asking for a carousel", () => {
  let dueno: Awaited<ReturnType<typeof personaConSesion>>
  let cuenta: string
  const entrada = (extra: Record<string, unknown> = {}) => ({
    cuentaId: cuenta, piezaId: null, tema: "wav-noche", titulo: "Documento", texto: "Post", diseno: carruselInicial("wav"), ...extra,
  })
  beforeAll(async () => {
    await admin().from("pedidos_de_diseno").update({ estado: "obsoleto" }).in("estado", ["pendiente", "trabajando"])
    dueno = await personaConSesion("e2e-acciones-disenos")
    cuenta = await cuentaDe(await marcaConDueno(dueno.userId, "nosotros"), "empresa", "api")
  })

  test("queues a valid carousel and lists it as recent", async () => {
    const r = await pedirDiseno(dueno.db, entrada())
    expect(r.ok).toBe(true)
    const recientes = await pedidosDeDisenoRecientes(dueno.db)
    expect(recientes[0]).toMatchObject({ estado: "pendiente", titulo: "Documento" })
  })

  test("refuses a slide over its limit before reaching the database", async () => {
    const diseno = carruselInicial("wav")
    diseno.laminas[1] = { tipo: "punto", numero: "", titulo: "una dos tres cuatro cinco seis siete ocho nueve diez once doce trece", cuerpo: "c" }
    const antes = await admin().from("pedidos_de_diseno").select("id", { count: "exact", head: true })
    expect(await pedirDiseno(dueno.db, entrada({ diseno }))).toEqual({ ok: false, error: "Lámina 2: El título pasa las 12 palabras." })
    const despues = await admin().from("pedidos_de_diseno").select("id", { count: "exact", head: true })
    expect(despues.count).toBe(antes.count)
  })

  test("translates a theme of another family", async () => {
    expect(await pedirDiseno(dueno.db, entrada({ tema: "personal-claro" }))).toEqual({ ok: false, error: "Ese diseño no es de esta marca." })
  })

  test("a piece's design state: open while a request runs, then the failure's reason", async () => {
    const pieza = await carruselDe(dueno.db, cuenta)
    const r = await pedirDiseno(dueno.db, entrada({ piezaId: pieza }))
    expect(r.ok).toBe(true)
    expect(await disenoDePieza(dueno.db, pieza)).toEqual({ abierto: true, ultimoFallo: null })
    const id = r.ok ? r.pedidoId : ""
    await admin().from("pedidos_de_diseno").update({ estado: "obsoleto" }).in("estado", ["pendiente", "trabajando"]).neq("id", id)
    await admin().rpc("tomar_pedidos_de_diseno")
    await admin().rpc("terminar_pedido_de_diseno", { p_pedido: id, p_estado: "fallo", p_motivo: "La lámina 3 no cabe. Acórtala o divídela en dos." })
    expect(await disenoDePieza(dueno.db, pieza)).toEqual({ abierto: false, ultimoFallo: "La lámina 3 no cabe. Acórtala o divídela en dos." })
  })
})
```

  Import `carruselDe` from `./entorno` (added in Task 6). Use the client type that `entorno.ts` already uses for `personaConSesion`'s `db` in `carruselDe`'s signature.

- [ ] **Step 2: Run to verify they fail.** Expected: FAIL (modules missing).

- [ ] **Step 3: Implement `lib/disenos/acciones.ts`**

```ts
import { z } from "zod"
import type { Resultado } from "@/lib/marcas/acciones"
import { revisarCarrusel } from "@/lib/plantillas/laminas"
import { esTema } from "@/lib/plantillas/temas"
import type { Db } from "@/lib/supabase/database"
import type { Json } from "@/lib/supabase/database.types"

const MENSAJES: Record<string, string> = {
  solo_el_dueno_pide_disenos: "Solo el dueño de la marca puede pedir carruseles.",
  tema_de_otra_marca: "Ese diseño no es de esta marca.",
  pieza_de_otra_cuenta: "Esa pieza es de otra cuenta.",
  solo_carruseles: "Esta pieza no es un carrusel.",
  pieza_no_editable: "Esta pieza ya no se puede editar.",
  pedido_en_curso: "Ya se está armando un carrusel para esta pieza.",
  demasiados_pedidos: "Ya hay 5 carruseles armándose para esta marca. Espera a que terminen.",
}

function falla(error: { code?: string; message: string }): { ok: false; error: string } {
  if (Object.hasOwn(MENSAJES, error.message)) return { ok: false, error: MENSAJES[error.message] }
  console.error("Falla inesperada en un pedido de carrusel", error.code, error.message)
  return { ok: false, error: "No pude guardar. Inténtalo de nuevo en un rato." }
}

const Pedido = z.object({
  cuentaId: z.uuid(),
  piezaId: z.uuid().nullable(),
  tema: z.string().refine(esTema, "Elige un diseño."),
  titulo: z.string().trim().min(1, "Falta el título del documento.").max(100, "El título del documento pasa los 100 caracteres."),
  texto: z.string().trim().min(1, "Falta el texto del post.").max(3000, "El texto del post pasa los 3000 caracteres."),
  diseno: z.unknown(),
})

export async function pedirDiseno(db: Db, entrada: unknown): Promise<Resultado<{ pedidoId: string }>> {
  const leido = Pedido.safeParse(entrada)
  if (!leido.success) return { ok: false, error: leido.error.issues[0]?.message ?? "Revisa el carrusel." }
  const carrusel = revisarCarrusel(leido.data.diseno)
  if (!carrusel.ok) return carrusel
  const { data, error } = await db.rpc("pedir_diseno", {
    p_cuenta: leido.data.cuentaId,
    p_tema: leido.data.tema,
    p_titulo: leido.data.titulo,
    p_texto: leido.data.texto,
    p_diseno: carrusel.carrusel as unknown as Json,
    p_pieza: leido.data.piezaId ?? undefined,
  })
  return error ? falla(error) : { ok: true, pedidoId: data }
}
```

  Check the name of the `Json` type export in `lib/supabase/database.types.ts`.

- [ ] **Step 4: Implement `lib/disenos/lectura.ts`.** It holds two readers, both RLS-scoped, both throwing on a read error like the other readers:
  - `pedidosDeDisenoRecientes(db, limite = 10)` returns `{ id, cuenta, estado, motivo, piezaId, creadoEn, titulo }[]` from `pedidos_de_diseno` joined to `cuentas(nombre)`, newest first.
  - `disenoDePieza(db, piezaId)` returns `{ abierto: boolean; ultimoFallo: string | null }` from that piece's requests: open if any is `pendiente` or `trabajando`; `ultimoFallo` is the newest request's `motivo` when it is `fallo` or `obsoleto` and newer than the piece's latest version.

- [ ] **Step 5: Routes and the server action**

  In `lib/sesion/rutas.ts`:

```ts
export const RUTA_DE_CARRUSEL = "/piezas/carrusel"
export function rutaDeEditarCarrusel(piezaId: string): string {
  return `${RUTA_DE_CARRUSEL}?pieza=${encodeURIComponent(piezaId)}`
}
```

  The file `app/(app)/piezas/carrusel/acciones.ts`:

```ts
"use server"

import { revalidatePath } from "next/cache"
import { pedirDiseno } from "@/lib/disenos/acciones"
import type { Resultado } from "@/lib/marcas/acciones"
import { RUTA_DE_CARRUSEL } from "@/lib/sesion/rutas"
import { createActionClient } from "@/lib/supabase/action"

export async function pedirDisenoAccion(entrada: unknown): Promise<Resultado<{ pedidoId: string }>> {
  const resultado = await pedirDiseno(await createActionClient(), entrada)
  if (resultado.ok) revalidatePath(RUTA_DE_CARRUSEL)
  return resultado
}
```

- [ ] **Step 6: Run to verify they pass.** Expected: PASS. Then run `pnpm vitest run tests/unit/limites-del-worker.test.ts`: still PASS, because `lib/disenos` imports only `lib/plantillas`.

- [ ] **Step 7: Commit**

```bash
git add lib/disenos lib/sesion/rutas.ts "app/(app)/piezas/carrusel/acciones.ts" tests/integration/acciones-disenos.test.ts
git commit -m "feat: ask for a carousel and read its design state"
```

---

### Task 10: The carousel editor

**Files:**
- Create: `app/(app)/piezas/carrusel/page.tsx`, `app/(app)/piezas/carrusel/editor.tsx`
- Modify: `app/(app)/piezas/refrescar.tsx` (prop `mensaje`), and the nav or home where «Pedir texto» is linked (find it with `grep -rn RUTA_DE_PEDIR_TEXTO app components`)
- Test: `tests/unit/editor-de-carrusel.test.tsx`

- [ ] **Step 1: Write the failing component tests.** Use Testing Library, as `tests/unit/firma.test.tsx` does:
  - With two accounts (one `nosotros`, one `yo`), choosing the `yo` account shows only the 3 personal themes and resets the theme to `personal-claro`.
  - The default slides are the chosen family's `carruselInicial`, and the closing slide's link follows the family when the account changes.
  - «Agregar lámina» with type «Cifra» inserts a cifra slide before the closing slide. «Subir» and «Bajar» reorder. «Quitar» is disabled for the cover and the closing slide.
  - Submitting calls `pedir` with `{ cuentaId, piezaId: null, tema, titulo, texto, diseno: { antetitulo, laminas } }`, where `laminas` come from `deBorrador`. A returned error is shown in a `role="alert"`.
  - With `inicial` (edit mode), the account is fixed and the fields are prefilled.

- [ ] **Step 2: Run to verify they fail.** Run `pnpm vitest run tests/unit/editor-de-carrusel.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement `editor.tsx`** (client component). The props:

```ts
interface Props {
  cuentas: { id: string; nombre: string; voz: "yo" | "nosotros" }[]
  /** Edit mode: the piece's latest version. */
  inicial?: { piezaId: string; cuentaId: string; tema: IdDeTema; titulo: string; texto: string; diseno: Carrusel }
  pedir: (entrada: unknown) => Promise<Resultado<{ pedidoId: string }>>
}
```

  State:
  - `cuentaId`, `tema`, `titulo`, `texto`, `antetitulo`.
  - `laminas: { id: string; tipo: TipoDeLamina; borrador: Borrador }[]`. The `id` comes from `crypto.randomUUID()` and is used as the React key.

  Layout, mobile-first, `max-w-md`:
  1. The account select, disabled in edit mode.
  2. Theme radios, from `temasDeLaVoz(voz)` with `TEMAS[t].nombre`.
  3. «Título del documento» (input; on a new carousel it defaults to the cover's title until edited).
  4. «Texto del post» (textarea, 3000 characters max, with a counter).
  5. «Antetítulo».
  6. One fieldset per slide: legend «Lámina N · {NOMBRE_DEL_TIPO}», its `CAMPOS` rendered as `input` (linea) or `textarea` (the rest) with the `ayuda` text below, and the buttons «Subir», «Bajar» and «Quitar».
  7. «Agregar lámina» with a type select. Cover and closing are excluded, because there is exactly one of each.
  8. A submit button «Armar carrusel».

  On success:
  - New carousel: `router.push(RUTA_DE_CARRUSEL)` plus `router.refresh()`; the page lists the request as «En cola».
  - Edit: `router.push(rutaDePieza(piezaId))`.

  Follow the existing forms' classes (`min-h-11`, `rounded-lg`, `border-borde`, `text-apagado`) and no hex colours. While the request is in flight, use `useTransition` and disable the button, as `app/(app)/piezas/pedir/formulario.tsx` does.

- [ ] **Step 4: Implement `page.tsx`** (server component).
  - It reads the accounts with their brand's voice (`cuentas(id, nombre, marca_id, marcas(voz))`). Only owners can ask, but the RPC enforces that; members see the form and get the refusal message.
  - With `?pieza=<id>`: read `detalle(db, id)`. If it is not a carousel with `diseno`, or its state is not editable, show «Este carrusel no se puede editar.» with a link back. Otherwise pass `inicial`.
  - Below the editor, «Carruseles recientes» from `pedidosDeDisenoRecientes`, with the same state names as «Pedir texto»: `pendiente` «En cola», `trabajando` «Armando», `hecho` «Listo», `fallo` «No salió», `obsoleto` «No se aplicó». Show the reason and «Ver la pieza» when there is one.
  - While any request is open: `<Refrescar mensaje="Se está armando el carrusel. Esta página se actualiza sola." />`.

- [ ] **Step 5: `Refrescar` takes `mensaje`.** The default stays the current Claude text, so 4c's uses do not change.

- [ ] **Step 6: Link it.** Next to «Pedir texto», add «Nuevo carrusel» → `RUTA_DE_CARRUSEL`.

- [ ] **Step 7: Run to verify they pass.** Run `pnpm vitest run tests/unit/editor-de-carrusel.test.tsx && pnpm type && pnpm lint`. Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/piezas/carrusel" "app/(app)/piezas/refrescar.tsx" tests/unit/editor-de-carrusel.test.tsx <nav file>
git commit -m "feat: carousel editor with Federico's templates"
```

---

### Task 11: Gate 1 shows the slides

**Files:**
- Modify: `lib/piezas/lectura.ts` (`detalle`), `lib/clientes/revision.ts` (`textoARevisar`), `app/(app)/piezas/[id]/page.tsx`
- Create: `app/(app)/piezas/[id]/vistas.tsx`
- Test: `tests/unit/revision.test.ts` (existing file: find it with `grep -rln textoARevisar tests`), `tests/integration/lectura-piezas.test.ts` (existing)

- [ ] **Step 1: Write the failing tests**
  - **Client review:** `textoARevisar("Doc", "Post", "slide text naming Cliente X")` includes the slide text. A carousel whose slide 4 names an excluded client produces a hallazgo when checked with `prepararRevision`. Use the existing tests' style.
  - **detalle:** for a piece saved through `guardar_diseno` with 9 slides, `detalle(db, id).version` has `tema: "wav-noche"`, `diseno` equal to the saved one, and `vistas` with 9 signed URLs whose paths end in `/01.jpg` … `/09.jpg`. Upload the 9 stub JPEGs in the test's setup. For a hand-made PDF piece, `vistas` is `[]` and `diseno` is `null`.

- [ ] **Step 2: Run to verify they fail.** Expected: FAIL.

- [ ] **Step 3: Implement**

  - `textoARevisar(titulo, texto, ...extra: string[])` returns `[titulo, texto, ...extra].filter(Boolean).join("\n")`.
  - `detalle`:
    - Select `tema, diseno` in the versions embed.
    - `version.tema: IdDeTema | null`.
    - `version.diseno: Carrusel | null`, parsed with `Carrusel.safeParse`. A row that fails to parse logs and returns null, so gate 1 still opens and falls back to «Ver el PDF».
    - `version.vistas: string[]`: when `diseno` and `archivo_ruta` are set, build the paths `archivo_ruta.replace(/\.pdf$/, "") + "/" + NN + ".jpg"` for each slide and call `bucket.createSignedUrls(rutas, 600)`, throwing on error like the PDF URLs.
  - `vistas.tsx` is a server component:

```tsx
export function VistasDelCarrusel({ vistas }: { vistas: string[] }) {
  return (
    <ol aria-label="Láminas del carrusel" className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
      {vistas.map((src, i) => (
        <li key={src} className="w-[85%] flex-none snap-center">
          {/* biome-ignore lint/performance/noImgElement: signed Supabase URLs, already the exact published images */}
          <img src={src} alt={`Lámina ${i + 1} de ${vistas.length}`} className="w-full rounded-lg border border-borde" />
        </li>
      ))}
    </ol>
  )
}
```

  Check whether the codebase already uses `<img>` with a Biome ignore, or `next/image` with `unoptimized`; follow whichever exists. Cloudflare has no Next image optimizer here.

  - `page.tsx`:
    - When `version.vistas.length > 0`, render `<VistasDelCarrusel>` above the post text, in every state, and replace the «Ver el PDF» link with a smaller «Descargar el PDF» link (`archivoDescarga`).
    - In `por_aprobar`, show the post text too (gate 1 reads both), and add `Link` «Editar el carrusel» → `rutaDeEditarCarrusel(id)`.
    - In `en_reserva`, `programada` and `a_mano`, show «Editar el carrusel» as well. The editor says editing drops the signature (a line under the submit button in edit mode: «Al armarlo de nuevo, la firma se cae y la pieza vuelve a esperar tu firma.»).
    - Read `disenoDePieza` for carousel pieces. While a request is open, show `<Refrescar mensaje="Se está armando la nueva versión del carrusel. Esta página se actualiza sola." />` instead of the signature form. When the last request failed, show its reason.
    - `revisarAntesDeFirmar` passes `textoDeLasLaminas(version.diseno)` as the extra part when `diseno` is set.

- [ ] **Step 4: Run to verify they pass.** Run `pnpm vitest run && pnpm test:db -- tests/integration/lectura-piezas.test.ts && pnpm type`. Expected: PASS.

- [ ] **Step 5: e2e** `tests/e2e/carrusel.spec.ts`. Follow `tests/e2e/ingreso.ts`, and `piezas.spec.ts` for setup.
  - The owner enters, opens «Nuevo carrusel», keeps the defaults, writes the post text and taps «Armar carrusel».
  - The page lists the request «En cola».
  - No Trigger.dev runs in e2e, so the test stops there.
  - Run with `pnpm test:e2e -- tests/e2e/carrusel.spec.ts`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/piezas/lectura.ts lib/clientes/revision.ts "app/(app)/piezas/[id]" tests
git commit -m "feat: gate 1 shows the carousel's slides and reviews their text for client exceptions"
```

---

### Task 12: Full suite and review

- [ ] **Step 1: Everything green**

```bash
pnpm lint && pnpm type && pnpm test:run && pnpm test:db && pnpm test:render && pnpm build && pnpm test:e2e
```

  Expected: all PASS. Run the full DB suite, not only the new files: data and config changes can break value tests elsewhere (hard-won lesson).

- [ ] **Step 2: Worker bundle.** Run `pnpm exec opennextjs-cloudflare build`, then check the gzip size of `.open-next/worker.js` and its chunks against the 4c figure (about 3,192 KiB gzip) and the 10 MiB limit. `lib/plantillas` adds the CSS strings (about 30 KB), and nothing else should grow. If `playwright` shows up in the Worker bundle, the boundary test missed a path: fix it there.

- [ ] **Step 3: Directive check.** Run `grep -L '^"use client"' $(grep -rl "useState\|useTransition\|useRouter" app --include=*.tsx)`. Expected: no client component is missing its directive (Biome lesson).

- [ ] **Step 4: Visual check of all 9 themes.** Render the 9 default carousels with a scratch script into the scratchpad. It imports `htmlDelCarrusel`, `fuentesEmbebidas` and `renderizarCarrusel`. Compare them with `~/Projects/wr3-web/social/linkedin/out/00-plantilla-<n>-<tema>.pdf`, slide by slide: colours, fonts, logo, tab, progress bar and signature. Any difference is a porting bug, so fix the ported CSS, never the reference.

- [ ] **Step 5: Code review.** Dispatch `superpowers:code-reviewer` on `main...fase-1h-plantillas`. Fix the important findings, each with a test first.

---

### Task 13: Gates

- [ ] **Step 1: Push and open the PR.** Ask first. The PR body lists:
  - the gates;
  - the orphan-files follow-up;
  - the Trigger.dev machine cost (about US$0.003 per render);
  - whether gate 3 (profile URL) is still open.

- [ ] **Step 2: Production migration.** Show the dry run (`pnpm exec supabase db push --dry-run`). Federico runs `pnpm exec supabase db push` himself. Verify with the Supabase MCP `list_migrations` that `20261104120000` is applied.

- [ ] **Step 3: Merge.** Ask first, with CI green. CI deploys the Worker and the Trigger worker. Verify with the Trigger.dev MCP `get_current_worker` (prod) that `armar-carruseles` is listed. Check that the deploy log shows the Playwright layer and `assets/fuentes`.

- [ ] **Step 4: Smoke in production.** Ask first, because it creates real pieces in a clean app.
  1. Federico opens «Nuevo carrusel» on the iPhone and asks one carousel per family (WR3 oscura, WAV noche, Personal claro) with the default slides.
  2. Within about 3 minutes each piece shows its 9 previews.
  3. He compares them with his reference PDFs.
  4. Then he discards the 3 pieces («Descartar»). Nothing is published.
  5. Check the run in Trigger.dev (`list_runs` for `armar-carruseles`: duration, machine) and that no row was added to `gastos`.

- [ ] **Step 5: Memory.** Update `estado-fase-1.md` with 4b's state (PR, migration, worker version, smoke result) and the next sub-plan (4e).
