# Fase 1l (4g): crosses of findings and the Sunday idea engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PostIA proposes ideas without being asked.

- **Every Sunday afternoon** it crosses findings from the map at a middle distance (neither the same nor unrelated, preferably from topics that never crossed). Claude writes the idea born from each pair, with both sources.
- **Then it fills the week** with loose ideas drawn from the week's findings and the editorial lines, favouring pillars that have gone two weeks without a post (D20).
- **When Federico approves a research report**, it also crosses that report's findings with the rest of the map.

All of these ideas land in «Ideas y series» like a series' ideas. Approving one writes the piece right away (4f), and it waits for his signature.

**Architecture:**
- **Origin.** `ideas` gains `origen` (`serie`, `cruce`, `domingo`).
- **Pairs.** A SQL function returns candidate pairs of findings within a similarity band, ranked by «topics never crossed», then freshness, then distance from the band's middle.
- **The crossing step** (`lib/ideas/cruzar.ts`) sends up to 3 pairs to Claude in one call (JSON schema). It validates the ideas (accounts, pillars, skeleton: 4f's `validarSerie` rules), drops near-duplicates with Voyage (`UMBRALES.idea`) and saves them through a new service-role RPC, `guardar_ideas_sueltas`.
- **The Sunday engine** (`lib/ideas/domingo.ts`, Trigger task `motor-del-domingo`, Sunday 17:00 Chile):
  1. Runs the crossing step.
  2. If the week still needs ideas and spend allows, asks Claude for loose ideas from the week's findings, the editorial lines, recent idea titles (to avoid repeats) and the pillars that need a post.
  3. Saves them after the same validation and dedupe.
- **On report approval.** `aprobar_informe` also queues a `cruces` job on 4e's research queue. It crosses that report's findings against the rest of the map.
- **Calibration.** A free manual task (`probar-cruces`) prints the similarity distribution of candidate pairs, so the band is calibrated with real data before spending.

**Tech Stack:** Supabase Postgres + pgvector, Trigger.dev v4 (SDK 4.8.1), `@anthropic-ai/sdk` 1.3 (`zodOutputFormat`), Voyage voyage-4, Next.js 16 on Cloudflare Workers, zod 4, Vitest, Playwright.

---

## Design

**Source.** The plano's «Cruces: ideas que nacen de dos hallazgos», «Motor semanal: ideas sueltas», «Cruzar hallazgos» and «Motor semanal de ideas».

What it says:
- **The band.** It has a minimum and a maximum, calibrated with real data. Prefer pairs from topics that never crossed. Each idea keeps its two findings.
- **When it runs.** With the Sunday engine and on report approval.
- **The Sunday engine:**
  - one run for all accounts (D17);
  - loose ideas come mostly from crosses;
  - ranking by results is done in code;
  - Claude never gets LinkedIn statistics;
  - Voyage drops ideas similar to what was published or discarded;
  - capped by ideas and by spend.

**The band (provisional, `UMBRALES.cruce = { minimo: 0.56, maximo: 0.74 }` in `lib/mapa/umbrales.ts`).** It is based on the voyage-4 calibration of 2026-10-30:

| Pair type | Similarity |
|---|---|
| Unrelated | 0.35, 0.54 |
| Neighbours | 0.58, 0.60 |
| Same topic | 0.60, 0.85 |
| Repeat | 0.98 |

The band sits above «unrelated» and below where topics form (0.80). Task 1's `probar-cruces` prints the real distribution of the map's pairs, and Federico approves the numbers before the Sunday engine spends (gate 4), as 4d did.

**Candidate pairs (`pares_para_cruzar`, service role).**
- **Inputs:** `p_desde` (side A only takes findings created since then: the week, or a report's findings when `p_investigacion` is set), the band, and `p_limite`.
- **Which findings count:** side B is any finding not `descartado`. Both findings must be non-discarded.
- **Ranking:**
  1. The pair's topics differ, or one has no topic.
  2. That topic pair was never crossed: no earlier `cruce` idea has one finding in each topic.
  3. Newer A first.
  4. Closer to the band's middle first.
- **Exclusions:**
  - pairs already used together by any idea, whatever its state;
  - a finding used by more than one pair in the same result, so each finding appears once.
- **Scale.** The map holds hundreds of findings at most this year. Side A has at most 200 rows and side B at most 3,000; the cross join is computed in SQL with `extensions.<=>`.

**How many.**
- **Crosses:** at most `CRUCES_POR_CORRIDA = 3` per run (Sunday or report).
- **Loose ideas on Sunday:** up to `IDEAS_DEL_DOMINGO = 6` in total, counting the crosses. The engine asks for `6 − crosses saved`.
- **Skip rule:** if the accounts' open assignments for the coming Tuesday–Thursday already cover their weekly rhythm (each account `ritmo_semanal`), Sunday saves only crosses and skips the loose ideas. It never piles ideas on a full week.

**Pillars (D20).** `lib/voz/balance.ts` already computes pillars that went two weeks without coming out, used for the digest's alert. The engine passes those pillars to Claude as «pilares que necesitan una pieza». The validation keeps a proposed pillar only if it belongs to the suggested account's brand (4f's rule).

**Metrics.** There are none yet (D12, metrics come later). The «what worked» input is empty today. The code takes a list of «texts of the posts that worked best», ranked in code, empty for now, so D12 only has to fill it. Claude never receives statistics.

**Prompts.**
- **Crosses:** the two findings of each pair (summary, outlet, date, topic name) wrapped as data. Claude names the idea that only exists because of the pair: «qué dice uno sobre el otro». It returns hook, summary, format, skeleton, suggested account with reason and optional pillar, following the same rules as 4f's series prompt (voice, no prices, client exceptions).
- **Sunday:** the accounts with their lines, the week's findings (index, summary, outlet, date), pillars that need a post, the titles of the last 40 ideas (any state, to avoid repeats), and how many to propose.
- **Reuse:** both use 4f's helpers in `lib/series/instrucciones.ts` (account list, voice and client rules). Shared helpers are exported, not copied.

**Saving.**
- `guardar_ideas_sueltas(p_ideas jsonb, p_origen text)` (service role) inserts ideas with `investigacion_id` null.
- `fuentes` must be existing, non-discarded findings, else `fuente_no_valida`. A `cruce` idea has exactly two.
- It reuses `guardar_serie`'s per-idea checks (account, pillar, skeleton shape).

**Spend.**
- Everything is charged to «General».
- Keys:
  - `cruces:<YYYY-MM-DD>` (Sunday) or `cruces:<job>` (report), plus `:vectores`;
  - `domingo:<YYYY-MM-DD>` plus `:vectores`.
- A Sunday run repeated the same day therefore never pays twice.
- Opus at effort `medium`, max 8,000 tokens per call. Roughly US$0.10–0.20 per Sunday, plus about US$0.05 per approved report.

**Notices.** New ideas are not urgent (D26). Monday's 9:00 digest already says «N ideas esperan tu revisión» (4f).

**UI («Ideas y series»).**
- The page gains two groups above the series: «Cruces» and «Ideas sueltas del domingo», newest first.
- A cross idea shows «Nace de:» with both findings (outlet, date, link) side by side.
- Approve, discard, edit and ask for another work as in 4f. «Pedir otra» on a loose or cross idea asks for one replacement through the same job type `otra_idea`, which must accept ideas with no research. Read 4f's `otraIdea`; for a cross it reuses the same pair.

**Not in 4g:**
- metrics ranking (D12);
- own material (phase 3);
- the 3-day Ajustes setting;
- the Standard Tier screencast.

## Gates: stop and ask Federico

1. Push the branch and open the PR.
2. Production migration: Federico runs `pnpm exec supabase db push`, then `gh pr merge N --merge`, one right after the other.
3. Run `probar-cruces` in production (free: SQL only).
4. Show Federico the distribution and propose the band. He approves the numbers, or they change in `UMBRALES.cruce` before any paid run.
5. Paid smoke (about US$0.2): trigger `motor-del-domingo` once by hand. Check the crosses (two real findings each, topics that differ), the loose ideas, the dedupe and the ledger rows.

---

## File map

```
supabase/migrations/20261108120000_cruces_y_domingo.sql
lib/supabase/database.types.ts                 regenerated
lib/mapa/umbrales.ts                           + cruce { minimo, maximo }
lib/ideas/instrucciones.ts                     prompts: crosses, Sunday (reusing lib/series/instrucciones.ts helpers)
lib/ideas/propuestas.ts                        zod schemas for crosses and loose ideas; validation (reusing validarSerie rules)
lib/ideas/cruzar.ts                            cruzar(p, { clave, desde, investigacionId? })  (Trigger only)
lib/ideas/domingo.ts                           motorDelDomingo(p, ahora)  (Trigger only)
lib/ideas/repositorio.ts                       service-role ports  (Trigger only)
lib/ideas/calibrar.ts                          distribution of candidate pairs (Trigger only, free)
lib/investigacion/vigilancia.ts                + `cruces` jobs in the dispatcher
lib/series/{armar,instrucciones}.ts            exports only (otraIdea for ideas with no research)
lib/series/lectura.ts                          + crosses and loose ideas for the page
trigger/ideas.ts                               motor-del-domingo (Sun 17:00), probar-cruces (manual)
app/(app)/ideas/page.tsx, idea.tsx             + groups and «Nace de:»
tests/unit/propuestas-de-ideas.test.ts, instrucciones-de-ideas.test.ts, cruzar.test.ts, motor-del-domingo.test.ts
tests/unit/idea.test.tsx (existing)            + cross card
tests/unit/limites-del-worker.test.ts          + lib/ideas/{cruzar,domingo,repositorio,calibrar}
tests/integration/cruces-y-domingo.test.ts
tests/integration/repositorio-de-ideas.test.ts
tests/e2e/ideas.spec.ts (existing)             + a cross idea shows both sources
```

---

### Task 1: Migration: idea origin, candidate pairs, loose ideas, cross jobs, calibration

**Files:** `supabase/migrations/20261108120000_cruces_y_domingo.sql`, `tests/integration/cruces-y-domingo.test.ts`, `lib/supabase/database.types.ts`.

- [ ] **Step 0: Branch.** `fase-1l-cruces-y-domingo` already exists with this plan; check it out.
- [ ] **Step 1: Failing tests.** Use `tests/integration/entorno.ts`'s `vectorDe(eje, { hacia, similitud })` to build findings at known similarities, and `limpiarMapa`. Accounts of type `empresa` may use any route now.
  - **Idea origin.** `ideas.origen` defaults to `serie` for existing rows. A `cruce` or `domingo` idea has `investigacion_id` null, and a `serie` idea has it set (check constraint).
  - **`pares_para_cruzar(p_desde, p_minimo, p_maximo, p_limite, p_investigacion default null)`** (service role):
    - it returns pairs only within the band;
    - side A is limited to findings created since `p_desde`, or to that research's findings;
    - discarded findings are excluded;
    - pairs whose topics differ rank above pairs within one topic;
    - a topic pair already crossed by an earlier `cruce` idea ranks below a new one;
    - a pair already used together by any idea is excluded;
    - each finding appears at most once in the result;
    - `p_limite` is respected.
  - **`guardar_ideas_sueltas(p_ideas jsonb, p_origen text)`** (service role):
    - inserts `cruce` or `domingo` ideas with vectors;
    - a `cruce` idea needs exactly 2 sources;
    - a source that is discarded or doesn't exist gets `fuente_no_valida`;
    - `p_origen = 'serie'` is refused;
    - account and pillar checks are as in `guardar_serie`.
  - **Report approval.** `aprobar_informe` on an `encargo` queues, besides the `serie` job, a `cruces` job for that research. Extend `trabajos_de_investigacion.tipo` with `cruces`. Taking a `cruces` job does not flip the report's state (same rule 4f gave `serie`).
  - **`otra_idea` for ideas with no research.** It is accepted, and `guardar_ideas_sueltas` with `reemplaza_a` marks the old one `reemplazada` and keeps the origin.
  - **`similitudes_de_pares(p_desde, p_limite)`** (service role, for calibration) returns the similarities of the closest non-identical pairs between recent findings and the rest: `(a, b, similitud, mismo_tema boolean)`, up to `p_limite` rows.
  - **Grants.** People calling any of these get 42501.
- [ ] **Step 2: See them fail.**
- [ ] **Step 3: Migration.**
  - Redefine `aprobar_informe` and `tomar_trabajo_de_investigacion` / `terminar_trabajo_de_investigacion` as needed. Copy their current bodies from `20261106120000_series.sql`, as amended in place by 4f's review fixes, and change only what is listed.
  - Add the `otra_idea` relaxation the same way. Read how 4f's `pedir_otra_idea` and `guardar_serie` handle `reemplaza_a`.
  - `security definer`, `search_path = ''`, grants as in 4f.
- [ ] **Step 4: Pass.** Run `pnpm db:reset`, the new file (`pnpm test:db tests/integration/cruces-y-domingo.test.ts`), `pnpm db:types`, `pnpm type`, then the full `pnpm test:db`.
- [ ] **Step 5: Commit** `feat: idea origins, candidate pairs of findings and loose ideas in the database`

### Task 2: Thresholds, schemas and prompts

**Files:** `lib/mapa/umbrales.ts`, `lib/ideas/propuestas.ts`, `lib/ideas/instrucciones.ts`. Tests: `propuestas-de-ideas.test.ts`, `instrucciones-de-ideas.test.ts`.

- [ ] **Step 1: Failing tests.**
  - **Thresholds.** `UMBRALES.cruce` is `{ minimo: 0.56, maximo: 0.74 }`, and a test asserts `minimo < maximo < UMBRALES.tema`.
  - **`Cruces` (zod).** `{ ideas: [{ par: number, gancho, resumen, formato, esqueleto, cuenta, razon, pilar }] }`, with `par` 1-based into the pairs sent.
  - **`validarCruces(cruces, { pares, cuentas })`** maps each idea to the pair's two finding ids, drops ideas pointing to a missing pair, and applies 4f's per-idea rules. Reuse the functions in `lib/series/propuestas.ts`; export what is needed rather than copy.
  - **`IdeasDelDomingo` / `validarIdeasDelDomingo`** are the same as a series, with sources taken from the week's findings by index (reuse `validarSerie`).
  - **Cross prompts.** `sistemaDeCruces(cuentas, noNombrar)` and `mensajeDeCruces(pares)`: every finding's text is wrapped with `comoDatos`, the prompt says the idea must need both findings, and the voice and client rules are present.
  - **Sunday prompts.** `sistemaDelDomingo(cuentas, noNombrar)` and `mensajeDelDomingo({ hallazgos, pilaresPendientes, previas, cantidad, funcionaron })`:
    - `funcionaron` (texts only) is rendered only when non-empty;
    - statistics never appear: the type has no numbers, so a test passes texts only.
- [ ] **Step 2–4:** Fail, implement, pass.
- [ ] **Step 5: Commit** `feat: prompts and validation for crossed and Sunday ideas`

### Task 3: The crossing step

**Files:** `lib/ideas/cruzar.ts`, `lib/ideas/repositorio.ts`, `lib/investigacion/vigilancia.ts` (dispatcher). Tests: `cruzar.test.ts`, `repositorio-de-ideas.test.ts`.

- [ ] **Step 1: Failing tests** (fakes).
  - `cruzar(p, { clave, desde, investigacionId? })`:
    1. Reads up to `CRUCES_POR_CORRIDA` pairs. With none, it pays nothing and returns `{ guardadas: 0 }`.
    2. Asks Opus once (`clave`, paso `cruces`, `marcaId: null`, effort `medium`, `zodOutputFormat(Cruces)`).
    3. Validates the answer and embeds the kept ideas (`<clave>:vectores`).
    4. Drops near-duplicates against the database (`ideas_parecidas`, `UMBRALES.idea`) and within the batch.
    5. Saves with `guardar_ideas_sueltas(…, 'cruce')`.
    6. Returns `{ guardadas, parecidas, invalidas }`.
  - A refusal or unreadable JSON raises a `Falla`.
  - The dispatcher in `atenderInvestigaciones` routes `cruces` jobs here with `clave = "cruces:" + job.id` and `investigacionId`. Zero pairs closes the job `hecho` without error.
- [ ] **Step 2–4:** Fail, implement (ports in `lib/ideas/repositorio.ts`, following `lib/series/repositorio.ts`), pass. Run `pnpm test:db tests/integration/repositorio-de-ideas.test.ts`.
- [ ] **Step 5: Commit** `feat: cross findings at a middle distance into ideas with both sources`

### Task 4: The Sunday engine, calibration task and Worker boundary

**Files:** `lib/ideas/domingo.ts`, `lib/ideas/calibrar.ts`, `trigger/ideas.ts`, `tests/unit/limites-del-worker.test.ts`. Tests: `motor-del-domingo.test.ts`, plus more in `repositorio-de-ideas.test.ts`.

- [ ] **Step 1: Failing tests.**
  - `motorDelDomingo(p, ahora)`:
    1. Runs `cruzar` with `clave = cruces:<YYYY-MM-DD Santiago>` and `desde = ahora − 7 días`.
    2. Then decides whether loose ideas are needed: the coming Tuesday–Thursday open assignments plus scheduled pieces against each account's `ritmo_semanal`. If the week is covered, it stops after the crosses.
    3. Otherwise it asks for `IDEAS_DEL_DOMINGO − cruces` loose ideas:
       - key `domingo:<day>`, the week's findings (non-discarded, created since 7 days ago);
       - the pillars needing a post, from `lib/voz/balance.ts`;
       - the last 40 idea titles;
       - `funcionaron: []`.
    4. Validates, embeds and dedupes them, then saves with origin `domingo`.
    5. Returns the counts.
  - `TopeAlcanzado` at any step stops the run cleanly and logs: «Se alcanzó el tope de gasto; el motor del domingo no propuso más ideas.». A `PasoYaPagado` (a re-run the same day) skips that step.
  - With no findings this week and no pairs, it pays nothing.
  - `calibrarCruces(p)` returns a histogram of `similitudes_de_pares` in 0.05 buckets, split by same topic or different topic, plus the counts that fall inside the current band. It pays nothing.
  - The Worker boundary test forbids `lib/ideas/{cruzar,domingo,repositorio,calibrar}.ts` from app code.
- [ ] **Step 2: Fail.**
- [ ] **Step 3: Implement** `trigger/ideas.ts`:

```ts
// Sunday 17:00 Chile: crosses first, then loose ideas if the week needs them (plano «Motor semanal de ideas»).
export const motorDelDomingo = schedules.task({
  id: "motor-del-domingo",
  cron: { pattern: "0 17 * * 0", timezone: "America/Santiago" },
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  maxDuration: 840,
  run: async (payload) => { /* ports as in trigger/investigaciones.ts; motorDelDomingo(ports, payload.timestamp.getTime()) */ },
})

// Manual and free: the similarity distribution of candidate pairs, to calibrate UMBRALES.cruce with real data.
export const probarCruces = task({ id: "probar-cruces", retry: { maxAttempts: 1 }, run: async () => { /* calibrarCruces */ } })
```

- [ ] **Step 4: Pass.** Run the unit tests, the integration tests, `pnpm type` and `pnpm test:run`.
- [ ] **Step 5: Commit** `feat: Sunday engine proposes crosses and loose ideas for the week`

### Task 5: «Ideas y series» shows crosses and loose ideas

**Files:** `lib/series/lectura.ts`, `app/(app)/ideas/page.tsx`, `app/(app)/ideas/idea.tsx`. Tests: `idea.test.tsx`, the series readers' integration test, `tests/e2e/ideas.spec.ts`.

- [ ] **Step 1: Failing tests.**
  - The reader returns `{ cruces, sueltas, series }`. Crosses and loose ideas come with their sources (summary excerpt, outlet, date, link), newest first, at most 30 each.
  - A cross card shows «Nace de:» with both sources side by side, stacked on mobile.
  - A loose idea shows «Idea del domingo».
  - Approve, discard, edit and ask for another work as for a series idea.
  - e2e: standing in for the worker through the admin client:
    1. Two findings, then `guardar_ideas_sueltas` with one cross idea.
    2. The owner sees it under «Cruces» with both sources and approves it.
- [ ] **Step 2–4:** Fail, implement, pass. Mobile-first, semantic tokens, `"use client"` on line 1 of client components, and keep the page light.
- [ ] **Step 5: Commit** `feat: Ideas y series shows crosses with both sources and the Sunday ideas`

### Task 6: Full suite and review

- [ ] **Run everything:** Biome on all source folders, `pnpm type`, `pnpm test:run`, `pnpm test:db`, `pnpm test:render`, `pnpm build`. Run the e2e against `next build` + `next start` on a free port if the old dev server still hangs.
- [ ] **Read the prompts:** print the crosses and Sunday prompts for the production map's shape and read them. Check the voice and client rules, that everything from the web is data, that no statistics appear, and «both findings needed».
- [ ] **Code review:** `superpowers:code-reviewer` on `main...fase-1l-cruces-y-domingo`, focused on:
  - pair ranking and exclusions;
  - spend keys and the re-run behaviour;
  - the week-is-covered rule;
  - grants and RLS;
  - prompt injection from findings;
  - the redefined RPCs' fidelity.

  Fix each finding, test first.

### Task 7: Gates

- [ ] Gates 1–5 above, in order. Never run the paid engine before Federico approves the band. At the end, update memory (`estado-fase-1.md`): 4g done means phase 1's build is complete, and what follows is the usage goal (8 weeks, 3 posts a week per account, under 30 minutes of Federico's time a week).
