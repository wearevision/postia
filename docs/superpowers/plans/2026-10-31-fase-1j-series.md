# Fase 1j (4f): series from an approved report, Ideas y series, and Claude writing every piece Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
1. When Federico approves a research report, PostIA proposes a series: distinct ideas, each with a hook, a slide skeleton, its sources, and the account that suits it best with a reason.
2. In «Ideas y series» he approves, discards, edits or asks for another idea and confirms the accounts. The app spreads the dates over each account's slots.
3. Three days before each date, Claude writes the piece in that account's voice: a text post, or a carousel (post copy plus every slide) that renders itself with Federico's templates. It arrives at gate 1 for a single signature.

Federico never writes slides (decision of 2026-10-31).

**Architecture:**
- **Proposing the series.** Approving a report queues a `serie` job on 4e's research queue (`trabajos_de_investigacion`), which `atender-investigaciones` already runs. Claude Opus proposes the ideas as JSON. Each idea is validated against the report's findings and the accounts, embedded with Voyage, and dropped when it is too close to another idea of the series or to an earlier one. The rest is saved in `ideas`.
- **Approving an idea.** This creates one `asignaciones` row per confirmed account, holding the account, the format and the date from 4c's `repartirFechas`. These rows hold their slot in the calendar like pieces do.
- **Writing.** The scheduled task `escribir-piezas` (hourly) takes the assignments due within 3 days, at most 3 per run:
  - A text post is written with 4c's writer, saved as a piece of origin `claude` with the assignment's date, and reviewed automatically.
  - A carousel is written by a new Claude writer that returns the post copy, a theme and the slides in 4b's schema, validated by `revisarCarrusel` with one paid repair. It is queued as a design request carrying the assignment's date, and 4b's renderer turns it into the piece.
- **Spend.** Everything is paid through the 4a ledger: series and alternatives are charged to «General», and each written piece to its account's brand.

**Tech Stack:** Supabase Postgres (plpgsql, RLS, pgvector), Trigger.dev v4 (SDK 4.8.1), `@anthropic-ai/sdk` 1.3 (`zodOutputFormat`), Voyage voyage-4, Next.js 16 on Cloudflare Workers, zod 4, Vitest, Playwright.

---

## Design

**Source.** The plano has five parts here:
- «Armar la serie»: Claude gets the report and the editorial lines of every account. Voyage discards proposals similar to each other and to what was already published or discarded. The suggested account carries a reason that a person confirms. Spend is capped.
- «Ideas y series»: approve, discard, ask for another or edit the skeleton, and confirm the accounts. On approval, the dates are spread by each account's rhythm.
- «Adaptar a cada cuenta»: one piece per target account, rewritten, not copied.
- «Escribir texto»: 3 days before, with the editorial line, approved examples, the topic's findings and the network's limits.
- The `ideas` table.

D25 applies: the templates cost nothing, so the carousel renders before the signature and text, piece and date are signed once.

**An idea** belongs to no brand. It holds:
- the research it came from (`investigacion_id`) and its order in the series;
- `gancho` (≤140), `resumen` (≤600) and `formato` (`texto` or `carrusel_pdf`);
- `esqueleto`: for a carousel, 3–10 items `{ tipo: TipoDeLamina, idea: string }`, first `portada`, last `cierre`; for text, 1–6 items `{ idea }`;
- `fuentes`: the ids of findings from that report, 1–6 of them;
- `cuenta_sugerida` and `razon`, plus an optional `pilar_id`, which must belong to that account's brand;
- `vector` (Voyage);
- `estado`: `propuesta`, `aprobada`, `descartada` or `reemplazada`.

The crosses' two findings (4g) will reuse `fuentes`.

**Distinct ideas.** The new provisional threshold `UMBRALES.idea` is 0.90 (`lib/mapa/umbrales.ts`). Two ideas at or above it count as the same idea:
- Within a series, the later one is dropped.
- Against earlier ideas in any state except `reemplazada`, the new one is dropped. That covers approved ones (already planned or written) and discarded ones (the plano: never come back).

If dropping leaves fewer than half the requested number, the job still saves what is left. The page says «Salieron N de M: las otras se parecían a ideas anteriores.». Calibrate with real data later, like 4d's thresholds.

**How many.** The report's `cantidad` (1–30) is the number of ideas asked for. Claude may return fewer when the findings do not support more. Each idea is one piece per confirmed account, so an idea confirmed for two accounts becomes two pieces, each written in its own voice.

**Assignments instead of empty pieces.** A piece is born with its first version (huella, gate 1), so a planned but unwritten slot lives in `asignaciones`:
- fields: idea, cuenta, formato, `planeada_para`, `pieza_id` (set once written), `pedido_de_diseno_id` (carousel), `intentos`, `motivo`;
- `estado`: `por_escribir`, `escribiendo`, `escrita`, `fallo` or `descartada`.

How they fit with the rest of the app:
- `horariosOcupados` (4c and C2) and the calendar also read open assignments, so nothing else takes that slot. The calendar shows them as «Por escribir».
- Federico can move an assignment's date before it is written; after that he moves the piece as today.
- Discarding an approved idea discards its open assignments.

**Approving.** «Aprobar» on an idea takes the confirmed accounts (by default the suggested one). For each account, `repartirFechas(tipo, ocupados, 1, ahora)` proposes the next free slot after what that account already holds, and the page shows the proposed dates. «Aprobar la serie» approves every proposed idea of a series with its suggested account, and the dates are spread in the series' order. The approve RPC re-checks that every slot is still free (the slot index), and the action retries with fresh slots once on a clash, as 4c does.

**Writing three days before (plano «Escribir texto»).** A constant: `DIAS_ANTES_DE_ESCRIBIR = 3` in `lib/series/escribir.ts`. The plano says «ajustable en Ajustes», but there is no settings table yet, so it is noted, not built. An assignment is due when `planeada_para - 3 días <= ahora`. One whose date is less than 2 hours away when written is still written, but the piece's date becomes the next free slot, so a late write never forces a rushed signature.

**The writers.**
- **Text.**
  - 4c's `escribir` with an encargo built from the idea: the hook, the summary and the skeleton as the post's beats, and «cita la fuente cuando uses un dato».
  - The material is the idea's findings: summary, outlet, date and link, wrapped as data.
  - Then 4c's automatic review (`revisarSinPerder`).
  - The piece gets `planeada_para` = the assignment's date and the idea's pillar.
- **Carousel.**
  - `escribirCarrusel` on Opus, effort `high`, output `{ texto, titulo, tema, antetitulo, laminas }`. The slides follow the idea's skeleton.
  - The system prompt states every slide type's fields and word limits from `lib/plantillas/laminas.ts`, generated from the same constants so the two never drift. The allowed themes come from `temasDeLaVoz(voz)`, each with its family, and Claude picks the one that fits: WR3 themes for research topics, WAV for agency topics.
  - The output is checked with `revisarCarrusel`.
  - On failure, one paid repair call gets the error («Lámina 4: El título pasa las 12 palabras.») and the previous output, wrapped as data.
  - A second failure fails the assignment with that reason. Federico can open the idea and ask again, or write it himself in the editor.
  - Overflow at render time (4b's «La lámina N no cabe») fails the design request as today, and the assignment shows it.
- **Automatic review of carousels.** 4c's review is per text version and keyed by version id. For a carousel the version exists only after the render, so the automatic review is not run in 4f: the gate-1 client review (no AI, slides included since 4b) still runs. This is noted as a follow-up.

**Findings become «usado».** When a piece is written from an idea, its source findings go from `nuevo` to `usado` (4g's Sunday engine prefers `nuevo` ones).

**Notices (D26).** New proposals are not urgent. The digest gains «N ideas esperan tu revisión.». Written pieces already appear as «piezas esperan tu firma».

**Models and costs (estimates; the ledger confirms the real cost).**

| Step | Model | Cost |
|---|---|---|
| Series | Opus 5.5, `high`, no tools, max 16k tokens | About US$0.3–0.5 for 5–10 ideas |
| Another idea | Opus, `medium` | About US$0.1 |
| Text post | 4c's writer and review | About US$0.10 |
| Carousel | Opus | About US$0.15–0.25, plus the free render |

At 6 pieces a week that is about US$5–8 a month, inside the US$40 cap.

**Not in 4f:**
- crosses and the Sunday engine (4g);
- making the 3 days adjustable in Ajustes;
- Claude's automatic review of carousels;
- Instagram formats;
- images.

## Gates: stop and ask Federico

1. Push the branch and open the PR.
2. Production migration: Federico runs `pnpm exec supabase db push`.
3. Merge: Federico runs `gh pr merge N --merge`. Check that the Trigger worker lists `escribir-piezas`.
4. Paid smoke.
   - The report he already approved before 4f has no series job. A one-off button «Armar la serie» on an approved report without ideas queues it.
   - Federico reviews the ideas, approves one carousel idea and one text idea, and moves one date close enough to write now.
   - He checks both pieces at gate 1, then discards them or keeps them.
   - Cost about US$1.

---

## File map

```
supabase/migrations/20261106120000_series.sql
lib/supabase/database.types.ts                regenerated
lib/mapa/umbrales.ts                          + idea 0.90
lib/series/propuestas.ts                      zod Propuesta/Serie, validarSerie (pure)
lib/series/instrucciones.ts                   prompts: serie, otra idea, carrusel, reparación (+ límites from laminas.ts)
lib/series/armar.ts                           armarSerie, otraIdea (Trigger only)
lib/series/carrusel.ts                        escribirCarrusel with one repair (Trigger only)
lib/series/escribir.ts                        escribirPiezas: due assignments → text or carousel (Trigger only)
lib/series/repositorio.ts                     service-role ports (Trigger only)
lib/series/acciones.ts                        people's actions (Worker-safe)
lib/series/lectura.ts                         readers (Worker-safe)
lib/plantillas/laminas.ts                     + export the limits as data (LIMITES) used by the schema and the prompt
lib/investigacion/vigilancia.ts               + serie / otra_idea jobs in atenderInvestigaciones
lib/piezas/lectura.ts                         + horariosOcupados and calendario read open assignments
lib/avisos/resumen.ts, enviar-resumen.ts      + ideas por revisar
trigger/investigaciones.ts                    (unchanged task; dispatcher grows)
trigger/series.ts                             escribir-piezas (hourly)
app/(app)/ideas/page.tsx                      Ideas y series
app/(app)/ideas/idea.tsx                      one idea card (client)
app/(app)/ideas/acciones.ts
app/(app)/investigar/[id]/page.tsx            «Aprobar informe» copy; «Armar la serie» for old approved reports; link to its series
app/(app)/calendario/…                        «Por escribir» slots
app/(app)/page.tsx                            + link «Ideas y series»
lib/sesion/rutas.ts                           + RUTA_DE_IDEAS
tests/unit/propuestas.test.ts
tests/unit/instrucciones-de-series.test.ts
tests/unit/armar-serie.test.ts
tests/unit/escribir-carrusel.test.ts
tests/unit/escribir-piezas.test.ts
tests/unit/laminas.test.ts (existing)         + LIMITES drive the schema
tests/unit/limites-del-worker.test.ts         + lib/series/{armar,carrusel,escribir,repositorio}
tests/unit/idea.test.tsx
tests/integration/series.test.ts
tests/integration/repositorio-de-series.test.ts
tests/integration/acciones-series.test.ts
tests/integration/lectura-piezas.test.ts (existing) + assignments hold slots
tests/e2e/ideas.spec.ts
```

---

### Task 1: Slide limits as data

**Files:** Modify `lib/plantillas/laminas.ts`. Test: `tests/unit/laminas.test.ts`.

The carousel writer's prompt must state the same limits the schema enforces.

- [ ] **Step 0: Branch.** `fase-1j-series` already exists with this plan; check it out.
- [ ] **Step 1: Failing test.** `LIMITES` exports, per slide type and field, `{ palabras?, caracteres?, minimo?, maximo? }`:
  - `LIMITES.punto.titulo` = `{ palabras: 12, caracteres: 90 }`
  - `LIMITES.lista.items` = `{ minimo: 2, maximo: 4, palabras: 10, caracteres: 80 }`
  - `LIMITES.carrusel` = `{ minimo: 3, maximo: 10 }`

  A test builds a title one word over `LIMITES.punto.titulo.palabras` and expects `revisarCarrusel` to refuse it. That proves the schema reads the table.
- [ ] **Step 2: See it fail.**
- [ ] **Step 3: Implement.** Move every numeric limit into one `LIMITES` object (`as const`). The zod builders (`texto(nombre, palabras, caracteres)` and the array bounds) take their numbers from it. Messages and behaviour stay identical, so every existing laminas, campos, temas, html and render test stays green.
- [ ] **Step 4: See it pass.** Run `pnpm test:run` and `pnpm test:render`.
- [ ] **Step 5: Commit** `refactor: slide limits as one table the schema and the writer share`

---

### Task 2: Migration: ideas, assignments, series jobs

**Files:**
- Create: `supabase/migrations/20261106120000_series.sql`, `tests/integration/series.test.ts`
- Modify: `lib/supabase/database.types.ts`

- [ ] **Step 1: Failing tests.** Use `tests/integration/entorno.ts`. Remember:
  - accounts of type `empresa` use ruta `a_mano`;
  - research jobs are taken globally, oldest first;
  - `vectorDe` builds vectors.

  The tests:
  - **`aprobar_informe` queues a series job.** `aprobar_informe` (4e) now also inserts a `serie` job for that research. An approved report with no ideas and no open job can queue one with `pedir_serie(p_investigacion)`, which is owners only. Any other state gets `serie_no_disponible`.
  - **`guardar_serie(p_investigacion, p_ideas jsonb)`** (service role):
    - inserts the ideas (`propuesta`, in order) with their vectors;
    - refuses a source that is not a finding of that research with `fuente_ajena`;
    - refuses a suggested account that does not exist with `cuenta_desconocida`;
    - refuses a pillar that is not the account's brand's with `pilar_no_valido`.
  - **`ideas_parecidas(p_vector text, p_umbral real, p_excepto uuid[])`** (service role) returns earlier ideas at or above the threshold, ignoring `reemplazada`.
  - **`aprobar_idea(p_idea, p_asignaciones jsonb [{cuenta, planeada_para}])`**, owners of each target account's brand only:
    - creates the assignments (`por_escribir`) and sets the idea `aprobada`;
    - a slot already held by a piece or an open assignment of that account gets `horario_ocupado` (23505 mapped);
    - a weekend or a past date gets `fecha_no_valida` (reuse C2's rule for valid days and hours if it lives in SQL; otherwise check only past and weekend).
  - **`descartar_idea`:**
    - on a `propuesta` → `descartada`;
    - on an `aprobada` → `descartada`, and its `por_escribir` assignments → `descartada`; pieces already written stay.
  - **`editar_idea(p_idea, p_gancho, p_esqueleto)`** works only on `propuesta`; the skeleton is validated by shape in SQL (array of 1–10 objects).
  - **`pedir_otra_idea(p_idea)`** queues an `otra_idea` job for that idea, and the job's result marks the old one `reemplazada`.
  - **`mover_asignacion(p_asignacion, p_fecha)`** works only on `por_escribir`, with the same slot checks.
  - **`tomar_asignaciones(p_hasta timestamptz, p_limite int)`** (service role):
    - leases due `por_escribir` assignments (`planeada_para <= p_hasta`) with the 2-attempt guard of 4b and 4e;
    - closes as `fallo` those leased twice with «No pude escribir esta pieza después de dos intentos.».
  - **`crear_pieza_de_asignacion(p_asignacion, p_texto, p_linea_version, p_planeada_para)`** (service role):
    - creates the text piece (origin `claude`, pillar from the idea, `planeada_para`);
    - sets the assignment `escrita` with `pieza_id`;
    - marks the idea's source findings `usado`.
  - **`pedir_diseno_de_asignacion(p_asignacion, p_tema, p_titulo, p_texto, p_diseno, p_linea_version, p_planeada_para)`** (service role):
    - inserts a `pedidos_de_diseno` row with `planeada_para`, `origen 'claude'`, `linea_version`, `asignacion_id`, and `pedido_por` = the idea's approver;
    - `guardar_diseno` (4b) then uses that date, the origin and the line version for the new piece, and sets the assignment `escrita` with the piece;
    - the findings become `usado`.
  - **`fallar_asignacion(p_asignacion, p_motivo)`** (service role) closes the assignment as `fallo`. A design request that fails (`terminar_pedido_de_diseno` with `fallo`) also closes its assignment as `fallo` with the same motivo.
  - **RLS and grants.** Anyone with `tiene_acceso()` reads ideas and assignments. Service RPCs called by a person get 42501.

- [ ] **Step 2: See them fail.**

- [ ] **Step 3: Migration**, following the 4b and 4e patterns. Key parts:

```sql
-- 4f: a series of ideas from an approved report, their assignments to accounts and dates, and the hand-off to the
-- writers (text: a Claude piece; carousel: a design request that 4b renders). Plano: «Armar la serie», «Ideas y
-- series», «Adaptar a cada cuenta», «Escribir texto».

create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  investigacion_id uuid references public.investigaciones (id) on delete set null,
  orden integer not null default 0,
  gancho text not null check (length(btrim(gancho)) between 1 and 140),
  resumen text not null check (length(btrim(resumen)) between 1 and 600),
  formato text not null check (formato in ('texto', 'carrusel_pdf')),
  esqueleto jsonb not null check (jsonb_typeof(esqueleto) = 'array' and jsonb_array_length(esqueleto) between 1 and 10),
  fuentes uuid[] not null check (cardinality(fuentes) between 1 and 6),
  cuenta_sugerida uuid not null references public.cuentas (id) on delete cascade,
  razon text not null check (length(btrim(razon)) between 1 and 300),
  pilar_id uuid references public.pilares (id),
  vector extensions.vector(1024) not null,
  estado text not null default 'propuesta' check (estado in ('propuesta', 'aprobada', 'descartada', 'reemplazada')),
  reemplaza_a uuid references public.ideas (id) on delete set null,
  aprobada_por uuid references auth.users (id),
  creada_en timestamptz not null default now()
);

create table public.asignaciones (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.ideas (id) on delete cascade,
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  formato text not null check (formato in ('texto', 'carrusel_pdf')),
  planeada_para timestamptz not null,
  estado text not null default 'por_escribir' check (estado in ('por_escribir', 'escribiendo', 'escrita', 'fallo', 'descartada')),
  pieza_id uuid references public.piezas (id) on delete set null,
  intentos integer not null default 0,
  arrendado_hasta timestamptz,
  motivo text check (length(motivo) <= 500),
  creada_en timestamptz not null default now()
);
-- An open assignment holds its slot like a planned piece does (C2's slot rule).
create unique index asignaciones_un_horario on public.asignaciones (cuenta_id, planeada_para)
  where estado in ('por_escribir', 'escribiendo');
```

  Also:
  - Extend `trabajos_de_investigacion.tipo` to `('investigar', 'ampliar', 'serie', 'otra_idea')`, and add `idea_id uuid references ideas` for `otra_idea`.
  - Add `asignacion_id`, `planeada_para`, `origen` and `linea_version` to `pedidos_de_diseno`.
  - Redefine `guardar_diseno` (copy 4b's body) so it uses them when set.
  - Redefine `aprobar_informe` and `terminar_pedido_de_diseno` (copy their bodies) with the additions above.
  - Indexes on every foreign key.

  **Slot clash between pieces and assignments.** A piece's slot index and an assignment's slot index are separate. `aprobar_idea`, `mover_asignacion` and the piece-side planning (`planear_pieza` and `firmar_pieza`) must each check the other table under one advisory lock per account (`hashtext('horario:' || cuenta_id)`). Read C2's slot index and `planear_pieza` first, then add the cross-check to `planear_pieza` and `firmar_pieza` by redefining them (copy their bodies). Integration test: a piece cannot be planned onto an assignment's slot, and the reverse.

- [ ] **Step 4: Pass.** Run `pnpm db:reset`, the new file, `pnpm db:types`, `pnpm type`, then the full `pnpm test:db`. Everything must pass, including 4b's design tests and C2's calendar tests.
- [ ] **Step 5: Commit** `feat: ideas, their assignments and series jobs in the database`

---

### Task 3: Proposals: schema and validation

**Files:** Create `lib/series/propuestas.ts`. Test: `tests/unit/propuestas.test.ts`.

- [ ] **Step 1: Failing tests.**
  - `Serie` (zod) is the shape Claude returns:
    - `{ ideas: [{ gancho, resumen, formato, esqueleto: [{ tipo?, idea }], fuentes: string[], cuenta, razon, pilar: string | null }] }`
    - `cuenta` is the account's index in the list given to Claude, so the model never sees uuids it could garble; `fuentes` are finding indices the same way.
  - `validarSerie(serie, contexto)` maps indices to ids and drops an idea when:
    - its account index is out of range;
    - it has no valid source;
    - its format is `carrusel_pdf` and its skeleton is not 3–10 items with valid `TipoDeLamina` types, first `portada` and last `cierre`;
    - its pillar is not one of that account's brand's active pillars (the pillar becomes null instead; the idea is kept).
  - It returns `{ ideas, descartadas: { motivo, gancho }[] }`.
  - `quitarParecidas(ideas with vectors, umbral)` drops later ideas whose cosine similarity to an earlier kept one is ≥ umbral, using `similitud` from `lib/mapa/vectores.ts`.
- [ ] **Step 2: Fail.** **Step 3: Implement.** **Step 4: Pass.**
- [ ] **Step 5: Commit** `feat: validate a proposed series against its report, accounts and pillars`

---

### Task 4: Prompts for the series and the carousel writer

**Files:** Create `lib/series/instrucciones.ts`. Test: `tests/unit/instrucciones-de-series.test.ts`.

- [ ] **Step 1: Failing tests.**
  - `sistemaDeSerie(cuentas)` lists each account by index with its brand's voice, its pillars by index and its line's «temas vetados». It says:
    - ideas must be distinct from each other;
    - each takes 1–6 findings by index and never invents a source;
    - a carousel skeleton follows the slide types with first `portada` and last `cierre`;
    - the suggested account comes with a reason in one sentence;
    - no prices, no client marked confidential (it gets the `no_nombrar` names, as 4c's context does);
    - WAV speaks as «nosotros» and Federico as «yo».
  - `mensajeDeSerie(informe, cantidad, previas)` wraps the angles and findings (index, summary, outlet, date) and the titles of the last 30 ideas as data (`comoDatos`), and asks for up to `cantidad` ideas.
  - `mensajeDeOtraIdea(idea, informe, hermanas)` asks for one replacement, different from its siblings.
  - `sistemaDeCarrusel(c, temas)` contains the voice line from 4c, every slide type with its fields and the numbers from `LIMITES` (the test asserts «12 palabras» appears for the point title and that changing `LIMITES` would change the text), and the allowed theme ids with family names. It also says:
    - the post copy (`texto`) has its own role: it invites people to open the carousel, at most 3000 characters, with links inside the text;
    - the document title is ≤100 characters;
    - the data in the slides cite their source in the post copy.
  - `mensajeDeCarrusel(idea, hallazgos)` wraps the idea and its findings as data.
  - `mensajeDeReparacion(error, anterior)` wraps the previous JSON and gives the exact error.
- [ ] **Step 2–4:** Fail, implement, pass. Follow `lib/redaccion/instrucciones.ts` for the tone and the voice rules, and reuse its helpers (voice, client names) instead of copying them.
- [ ] **Step 5: Commit** `feat: prompts to propose a series and write a carousel within the template limits`

---

### Task 5: Proposing the series and another idea

**Files:**
- Create: `lib/series/armar.ts`, `lib/series/repositorio.ts` (series ports)
- Modify: `lib/investigacion/vigilancia.ts` (dispatcher)
- Test: `tests/unit/armar-serie.test.ts`, `tests/integration/repositorio-de-series.test.ts`

- [ ] **Step 1: Failing tests** (fakes for `pedir`, `embeber`, the repository).
  - `armarSerie(p, trabajo)`:
    1. Reads the report (angles, findings with index), the accounts with ritmo > 0 and their lines, and the last 30 idea titles.
    2. Calls `pedir({ clave: "serie:<job>", paso: "serie", marcaId: null }, { modelo: Opus, esfuerzo: "high", maxTokens: 16000, formato: zodOutputFormat(Serie) })`.
    3. Validates the result, then embeds `gancho + resumen` in one call (`serie:<job>:vectores`).
    4. Drops near-duplicates within the series, then against the database (`ideas_parecidas` per idea, `UMBRALES.idea`).
    5. Saves with `guardar_serie`.
    6. Returns `{ guardadas, parecidas, invalidas }`.
  - With zero ideas left it raises the Falla «No salieron ideas nuevas de este informe: se parecían a ideas anteriores.».
  - `otraIdea(p, trabajo)` writes one replacement for `trabajo.ideaId` the same way, with key `otra:<job>`. It saves the new one with `reemplaza_a`; the RPC marks the old one `reemplazada`.
  - The dispatcher in `atenderInvestigaciones` routes `serie` and `otra_idea` jobs here. A Falla closes the job `fallo` with its message, like the other job types. The report page shows the motivo.
- [ ] **Step 2–4:** Fail, implement (ports through `lib/series/repositorio.ts`, following `lib/investigacion/repositorio.ts`), pass. Run `pnpm test:db -- tests/integration/repositorio-de-series.test.ts`.
- [ ] **Step 5: Commit** `feat: propose a distinct series from an approved report`

---

### Task 6: The carousel writer

**Files:** Create `lib/series/carrusel.ts`. Test: `tests/unit/escribir-carrusel.test.ts`.

- [ ] **Step 1: Failing tests.**
  - `escribirCarrusel(pedir, c, { clave, idea, hallazgos, temas })` returns `{ texto, titulo, tema, diseno: Carrusel }`.
  - It calls `pedir` once with key `<clave>`, paso `carrusel`, `marcaId` = the brand's, Opus, effort `high`, `formato: zodOutputFormat(Escrito)` where `Escrito = { texto, titulo, tema, antetitulo, laminas: unknown[] }`.
  - **Repair.** When `revisarCarrusel` refuses, it calls once more with key `<clave>:reparar` and the error, and returns the repaired one. A second refusal raises a Falla with the error: «No pude ajustar las láminas a la plantilla: Lámina 4: El título pasa las 12 palabras.».
  - **Theme.** A theme outside `temas` is refused like a slide error and repaired once.
  - **Text.** The post copy goes through 4c's `textoValido` rules (normalised, non-empty, ≤3000), and the title must be 1–100 characters.
  - **Refusal.** A refusal or a cut answer raises 4c's Falla messages.
- [ ] **Step 2–4:** Fail, implement, pass.
- [ ] **Step 5: Commit** `feat: Claude writes a carousel's copy and slides within the template limits`

---

### Task 7: Writing the due pieces

**Files:**
- Create: `lib/series/escribir.ts`, `trigger/series.ts`
- Modify: `lib/series/repositorio.ts` (writing ports), `tests/unit/limites-del-worker.test.ts`
- Test: `tests/unit/escribir-piezas.test.ts`, more cases in `tests/integration/repositorio-de-series.test.ts`

- [ ] **Step 1: Failing tests.**
  - `escribirPiezas(p, ahora)` takes up to 3 assignments with `planeada_para <= ahora + 3 días`.
  - **Text.**
    1. Builds the account's `ContextoDeRedaccion` (reuse 4c's repository function, or extract it to a shared place if it is private, without copying).
    2. Calls 4c's `escribir` with key `escribir:asignacion:<id>`, the encargo from the idea, and the material from its findings.
    3. Calls `crear_pieza_de_asignacion`.
    4. Runs the automatic review as 4c does.
  - **Carousel.** Calls `escribirCarrusel` with key `carrusel:asignacion:<id>` and the account's allowed themes, then `pedir_diseno_de_asignacion`.
  - **The piece's date.** It is the assignment's date, or, when that is less than 2 hours away, the account's next free slot.
  - **Failures.** A Falla closes the assignment with `fallar_asignacion`. An unexpected error closes it with «No pude escribir esta pieza. Se vuelve a intentar en la próxima hora.», leaves the lease to expire, and is rethrown at the end. The 2-attempt guard decides when it stops.
  - **Spend.** Every paid call uses the account's brand as `marcaId`: it is that brand's piece.
- [ ] **Step 2: Fail.**
- [ ] **Step 3: Implement.** The task:

```ts
// Every hour at :20, one run at a time: writes what is due in the next 3 days (plano «Escribir texto»). A carousel is
// only queued here; armar-carruseles renders it.
export const escribirPiezas = schedules.task({
  id: "escribir-piezas",
  cron: { pattern: "20 * * * *", timezone: "America/Santiago" },
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  maxDuration: 840,
  run: async (payload) => { /* ports like trigger/atender-pedidos.ts; escribirPiezas(ports, payload.timestamp.getTime()) */ },
})
```

  Extend the Worker boundary test to forbid `lib/series/{armar,carrusel,escribir,repositorio}.ts` from app code.
- [ ] **Step 4: Pass.** Run the unit tests, the integration tests, `pnpm type` and `pnpm test:run`.
- [ ] **Step 5: Commit** `feat: write each assigned piece three days before its date`

---

### Task 8: Assignments hold slots and show in the calendar

**Files:** Modify `lib/piezas/lectura.ts` (`horariosOcupados`, `calendario`) and the calendar page components. Test: `tests/integration/lectura-piezas.test.ts`, plus the calendar's component tests if they exist.

- [ ] **Step 1: Failing tests.**
  - `horariosOcupados(db, cuenta, desde)` includes the `planeada_para` of that account's `por_escribir` and `escribiendo` assignments.
  - `proponerFecha` therefore skips them; check it through 4c's and 4b's repository tests, which use it.
  - `calendario(...)` returns them as entries of kind `asignacion` with the idea's hook, state «Por escribir» and a link to the idea.
  - C2's gap count («Faltan N en …») counts them as filled.
- [ ] **Step 2–4:** Fail, implement, pass. The calendar shows an assignment with a dashed border and «Por escribir · {gancho}». Keep the page light (Worker CPU).
- [ ] **Step 5: Commit** `feat: planned ideas hold their slot and show in the calendar`

---

### Task 9: People's actions and readers

**Files:**
- Create: `lib/series/acciones.ts`, `lib/series/lectura.ts`, `app/(app)/ideas/acciones.ts`
- Modify: `lib/sesion/rutas.ts`
- Test: `tests/integration/acciones-series.test.ts`

- [ ] **Step 1: Failing tests.**
  - **Actions:**
    - `aprobarIdea(db, { ideaId, cuentas })` proposes each account's next free date with `repartirFechas` (reading `horariosOcupados`), calls `aprobar_idea`, and retries once with fresh slots on `horario_ocupado`.
    - `aprobarSerie(db, investigacionId)` approves every `propuesta` idea of the series in order, with its suggested account, and spreads the dates.
    - `descartarIdea`, `editarIdea` (the skeleton edited as one line per item, `tipo: idea`, parsed in the action), `pedirOtraIdea`, `moverAsignacion` and `pedirSerie`.
    - Every RPC error maps to a Spanish message, as in 4e.
  - **Readers:**
    - `series(db)` returns every series with its research theme and its ideas (state, hook, summary, format, skeleton, sources with outlet and link, suggested account with reason, assignments with account, date, state and motivo), newest series first.
    - `ideasPorRevisar(db)` returns the count of `propuesta` ideas.
- [ ] **Step 2–4:** Fail, implement, pass. Add `RUTA_DE_IDEAS = "/ideas"` and `rutaDeSerie(id)` (`/ideas?serie=…`).
- [ ] **Step 5: Commit** `feat: approve, edit, discard and replace ideas`

---

### Task 10: Ideas y series page

**Files:**
- Create: `app/(app)/ideas/page.tsx`, `app/(app)/ideas/idea.tsx`
- Modify: Inicio (link «Ideas y series»), `app/(app)/investigar/[id]/page.tsx`
- Test: `tests/unit/idea.test.tsx`, `tests/e2e/ideas.spec.ts`

- [ ] **Step 1: Failing component tests** for the idea card:
  - It shows the hook, summary, format, the skeleton as a numbered list (`Portada: …`), the sources as links (outlet · date), and the suggested account with «Por qué: {razón}».
  - In `propuesta`:
    - account checkboxes, with the suggested one checked;
    - «Aprobar» and «Descartar»;
    - «Pedir otra»;
    - «Editar» (hook plus skeleton textarea).
  - In `aprobada`, each assignment shows its account, date and state. A `por_escribir` one has a date input to move it, and a `fallo` one shows its reason. A link «Ver la pieza» appears once it is written.
  - Errors show in `role="alert"`, and buttons disable while pending.
- [ ] **Step 2: Fail.**
- [ ] **Step 3: Implement.**
  - **Page.** Series grouped under their research theme, each with «Aprobar la serie» while it has proposals. Optional filter chips by state («Por revisar», «Aprobadas», «Descartadas»). `<Refrescar mensaje="Se está armando la serie. Esta página se actualiza sola." />` while a series or another-idea job is open.
  - **Report page (4e).**
    - «Aprobar informe» drops «(llega pronto)» and says «Al aprobarlo, PostIA arma la serie de propuestas.».
    - An approved report links «Ver la serie».
    - An approved report with no ideas and no open job shows «Armar la serie», which calls `pedirSerie`; that is how the report Federico approved before 4f gets its series.
  - Mobile-first, semantic tokens, `min-h-11`, `"use client"` on line 1 of the client components.
- [ ] **Step 4: e2e.**
  1. Standing in for the worker through the admin client: a report approved, `guardar_serie` with two ideas (vectors from a random-unit helper as in 4e's e2e).
  2. The owner opens «Ideas y series» and sees both.
  3. Approves one for its suggested account: the assignment shows with a date.
  4. Discards the other.
  5. The calendar shows «Por escribir».
- [ ] **Step 5: Pass.** Run the component tests, `pnpm type`, `pnpm lint` and the e2e.
- [ ] **Step 6: Commit** `feat: Ideas y series: review the proposals and plan them`

---

### Task 11: Digest line

**Files:** `lib/avisos/resumen.ts`, `lib/avisos/enviar-resumen.ts` and their tests.

- [ ] Steps as in 4e's Task 9. «N ideas esperan tu revisión.» / «1 idea espera tu revisión.», counted once and global, placed after the reports line.
- [ ] Commit `feat: the digest counts ideas waiting for review`

---

### Task 12: Full suite and review

- [ ] **Run everything:** `pnpm lint && pnpm type && pnpm test:run && pnpm test:db && pnpm test:render && pnpm build && pnpm test:e2e`. All green.
- [ ] **Worker bundle and directives:** run `pnpm exec wrangler deploy --dry-run` to check the Worker bundle, and check every client component still has `"use client"`.
- [ ] **Read the prompts:** print the series prompt for the production report's shape (4 angles, 15 findings, 2 accounts) and one carousel prompt, and read them. Check the voice rules, «no inventes fuentes», the limits matching `LIMITES`, and that everything from the web is wrapped as data.
- [ ] **Code review:** run `superpowers:code-reviewer` on `main...fase-1j-series`, focused on:
  - the slot invariants between pieces and assignments;
  - spend keys, so a retry never pays twice for a piece;
  - the carousel repair bound;
  - findings marked `usado` only on success;
  - RLS and grants;
  - prompt injection from findings.

  Fix each finding, test first.

---

### Task 13: Gates

- [ ] **Push and open the PR** (ask first). The PR lists the gates and the costs.
- [ ] **Migration:** dry run, then Federico runs `pnpm exec supabase db push`. Verify with `list_migrations`.
- [ ] **Merge:** Federico runs `gh pr merge N --merge`. Verify that the worker lists `escribir-piezas` and that the Investigar page shows «Armar la serie» on the approved report.
- [ ] **Paid smoke** (ask first, about US$1):
  1. «Armar la serie» on the approved report.
  2. Check that the ideas are distinct, that their sources are the report's findings, and that the reasons make sense.
  3. Approve one carousel idea and one text idea, and move their dates to within 3 days.
  4. After the next hourly run, the text piece is at gate 1 with Claude's review, and the carousel is rendered with 9 or fewer slides from the skeleton.
  5. Check the ledger rows (`serie:`, `escribir:asignacion:`, `carrusel:asignacion:`), with brands as expected.
  6. Federico keeps or discards the pieces.
- [ ] **Memory:** update `estado-fase-1.md` and set the next sub-plan to 4g.
