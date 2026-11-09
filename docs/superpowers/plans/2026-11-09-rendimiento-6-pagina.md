# Rendimiento, bloque 6: importador de la página de WAV — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Same rules as
> `2026-11-09-rendimiento-1-importador.md` («Rules for every task»). Goes into the same PR (#28): the migration
> `20261109170000_metricas.sql` is **not in production yet**, so it is edited in place, not followed by a new one.

**Goal:** the WAV page's LinkedIn exports (content, followers, visitors; legacy `.xls`, English, dates `MM/DD/YYYY`)
import into the same tables as the profile, chosen per account in Ajustes.

**Decided by Federico (9 Nov 2026):** read with SheetJS (both `.xls` and `.xlsx`); match page posts by date and the
start of their text; page interactions = reactions + comments + reposts, with clicks and follows stored apart; page
audience from the followers and visitors files (counts, no company names).

## The three page files (checked with real exports)

All sheets: row 0 = header unless noted; numbers come as `"84.0"`-style strings; dates `MM/DD/YYYY`.

- **Content** `…_content_….xls`
  - `Metrics`: row 0 title, row 1 header: `Date, Impressions (organic|sponsored|total), Unique impressions (organic),
    Clicks (organic|sponsored|total), Reactions (…|total), Comments (…|total), Reposts (…|total),
    Engagement rate (…)`. Use the `(total)` columns.
  - `All posts`: row 0 title, row 1 header: `Post title, Post link, Post type, Campaign name, Posted by, Created date,
    Campaign start date, Campaign end date, Audience, Impressions, Views, Offsite Views, Clicks,
    Click through rate (CTR), Likes, Comments, Reposts, Follows, Engagement rate, Content Type`.
    `Post link` = `https://www.linkedin.com/feed/update/urn:li:activity:<id>`. `Post title` = start of the text.
- **Followers** `…_followers_….xls`: `New followers` (`Date, Sponsored followers, Organic followers,
  Auto-invited followers, Total followers`); `Location`, `Job function`, `Seniority`, `Industry`, `Company size`
  (`<category>, Total followers`).
- **Visitors** `…_visitors_….xls`: `Visitor metrics` (`Date, …, Total page views (total), …,
  Total unique visitors (total)`); `Location`, `Job function`, `Seniority`, `Company size` (`<category>, Total views`).

Real test files (do not copy into the repo, do not print personal rows):
`/Users/fede/Downloads/wavwearevision_content_1794238401205.xls`,
`/Users/fede/Downloads/wavwearevision_followers_1794238644242.xls`,
`/Users/fede/Downloads/wavwearevision_visitors_1794238636194.xls`. Profile file:
`/Users/fede/.claude/uploads/821003fd-2182-47f9-a60c-4d6678641684/cf84cbdb-AnalisisConjunto_Federico_Elgueta_Edwards_2025-11-10_2026-11-09.xlsx`.

---

### Task A: SheetJS reader and the page parser

**Files:** modify `package.json`, `lib/rendimiento/lector.ts`; create `lib/rendimiento/exportacion-pagina.ts`,
`tests/unit/exportacion-de-pagina.test.ts`.

1. Replace `read-excel-file` with SheetJS from the official CDN, pinned:
   `pnpm remove read-excel-file && pnpm add https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`
   (never the npm `xlsx` 0.18.x: abandoned, known advisories). Confirm `package.json` records that exact URL.
2. `lector.ts`: `leerHojas(archivo: File): Promise<Hojas>` with `XLSX.read(await archivo.arrayBuffer(), { type: "array", cellDates: false })`
   and `XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false, defval: null })` per sheet. Then
   `leerArchivosDeLinkedin(archivos: File[]): Promise<Resultado<Exportacion>>`:
   - one file whose sheets look like the profile export → `leerExportacion` (unchanged);
   - otherwise each file is classified by its sheets (`All posts` → content, `New followers` → followers,
     `Visitor metrics` → visitors) and the set goes to `leerExportacionDePagina`;
   - a file of none of these kinds → `«No reconozco el archivo «<name>». Sube las exportaciones de LinkedIn.»`.
   Keep the profile parser's real-file behaviour (50 posts, 3448 followers, 103 audience rows).
3. Extend the shared types in `exportacion.ts` (backwards compatible for the profile):
   - `PublicacionExportada`: add `extracto: string | null` (page post title; `null` for the profile),
     `clics: number | null`, `seguidoresNuevos: number | null`. `postUrn` may also be `urn:li:activity:<id>`.
   - `DiaExportado`: add `visitas: number | null`, `visitantesUnicos: number | null`.
   - `FilaDePublico`: `tipo` adds `"seguidores" | "visitantes"`; add `cantidad: number | null` (page rows carry counts;
     profile rows keep `porcentaje`/`menorAUno`, page rows have `porcentaje: null, menorAUno: false`).
   - `Exportacion`: `seguidoresTotal` may be null for the page; `desde`/`hasta` = min/max date seen.
4. `leerExportacionDePagina({ contenido?, seguidores?, visitantes? }: Partial<Record<…, Hojas>>)`: needs at least
   one file. From content: posts (`urn:li:activity:<id>` from the link, `publicadaEl` from `Created date`,
   `impresiones`, `interacciones = Likes + Comments + Reposts`, `clics`, `seguidoresNuevos = Follows`, `extracto`)
   and days (`impresiones`/`interacciones` from `Metrics` totals: reactions + comments + reposts). From followers:
   `seguidoresNuevos` per day (`Total followers` column of `New followers`) merged into days; audience rows
   `tipo: "seguidores"` (`Job function` → categoría `Área`, `Seniority` → `Nivel de responsabilidad`,
   `Industry` → `Sector`, `Company size` → `Tamaño de la empresa`, `Location` → `Ubicación`). From visitors:
   `visitas`/`visitantesUnicos` per day; audience rows `tipo: "visitantes"`. Dates `MM/DD/YYYY` → ISO.
5. **Profile export in English** (LinkedIn UI in English; real file
   `/Users/fede/Downloads/AggregateAnalytics_Federico Elgueta Edwards_2025-11-10_2026-11-09.xlsx`): same content,
   sheets `DISCOVERY` («Overall Performance», `11/10/2025 - 11/9/2026`), `ENGAGEMENT` (`Date, Impressions,
   Engagements`), `TOP POSTS`, `FOLLOWERS` («Total followers on 11/9/2026»), `AUDIENCE DEMOGRAPHICS`,
   `CONTENT DEMOGRAPHICS` (`Top Demographics, Value, Percentage`; `< 1%`), plus `MOST RECENT POSTS`
   (`Post URL, Post Publish Date, Post type, Impressions, …, Members reached`). `leerExportacion` accepts both
   languages: Spanish names as today, English names as aliases; dates `D/M/YYYY` for Spanish and `M/D/YYYY` for
   English (decided by which sheet names matched, never guessed per cell). `MOST RECENT POSTS` adds or fills
   impressions of recent posts (the top lists win when both have a value). Audience categories are stored in Spanish
   (`Company` → `Empresa`, `Job title` → `Cargo`, `Location` → `Ubicación`, `Industry` → `Sector`,
   `Seniority` → `Nivel de responsabilidad`, `Company size` → `Tamaño de la empresa`), so both languages land the same.
6. TDD: unit tests with small inline fixtures (no real data) for each file kind, the merge of days, `"84.0"` numbers,
   the activity URN, a missing-everything error; then a throwaway script in the session scratchpad (outside the repo)
   that parses the three real page files and the profile file through `leerHojas` (use SheetJS `XLSX.readFile` in
   Node) and reports counts only.
7. `pnpm format`, `pnpm type`, `pnpm lint`, unit tests, `tests/unit/limites-del-worker.test.ts` (SheetJS only in
   client code). Commit: `feat: read the WAV page's LinkedIn exports with SheetJS`.

### Task B: Migration, action and form for the page

**Files:** modify `supabase/migrations/20261109170000_metricas.sql`, `lib/supabase/database.types.ts`,
`lib/rendimiento/acciones.ts`, `app/(app)/ajustes/importar-estadisticas.tsx`, `app/(app)/ajustes/page.tsx`,
`tests/integration/metricas.test.ts`, `tests/integration/acciones-rendimiento.test.ts`,
`tests/unit/importar-estadisticas.test.tsx`.

1. Migration (edited in place; locally re-apply by `supabase migration down --local --last 1` is NOT allowed —
   instead drop the four tables and the function by hand in a local-only `psql` session against the local DB, then
   `supabase migration repair --local --status reverted 20261109170000` and `supabase migration up --local`; never
   `db reset`, never `db push`):
   - `metricas_de_publicacion.post_urn` also accepts `^urn:li:activity:[0-9]+$`; add `extracto text`
     (≤ 300 chars), `clics integer`, `seguidores_nuevos integer`.
   - `metricas_diarias`: add `visitas integer`, `visitantes_unicos integer`.
   - `publico_de_la_cuenta.tipo` adds `'seguidores'`, `'visitantes'`; add `cantidad integer`.
   - `importaciones_de_metricas`: `seguidores_total` stays nullable.
   - `importar_metricas`: payload carries the new fields. Match to a piece: by `publicaciones.post_urn` (profile), else
     for a post with `extracto`: a piece of that account published that day in Chile
     (`(publicaciones.enviado_en at time zone 'America/Santiago')::date = publicada_el`, or `piezas.publicada_en` if
     that is the column the manual flow fills; check the schema) whose current text, lowercased and with whitespace
     collapsed, starts with the `extracto` lowercased, collapsed and with a trailing `…`/`...` removed. One match only;
     ambiguous → no piece.
2. `lib/rendimiento/acciones.ts`: zod schema with the new optional fields and URN regex; payload mapping; the
   «no PostIA post» confirm check also counts extract matches (or skip the check when the export has `extracto`s and
   leave it to the RPC result: if `de_postia = 0` the UI still shows the summary).
3. Form: the account select lists all accounts (profile and page); the file input takes `multiple` (up to 3);
   `leer` becomes `(archivos: File[]) => Promise<Resultado<Exportacion>>`. Copy: «Perfil: el .xlsx de Analytics.
   Página: los .xls de contenido, seguidores y visitantes (puedes subir los tres juntos).».
4. Tests first: integration (activity URN accepted; a page post matched by date + text; ambiguous match → none;
   counts audience rows stored with `cantidad`), unit form test with two files. Then full `pnpm type`, `lint`,
   unit, the two integration files. Regenerate types with `pnpm db:types`.
5. Commit: `feat: import the WAV page's statistics alongside the profile`.
