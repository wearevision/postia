# Rendimiento, bloques 3 y 4: aprendizajes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Same «Rules for every task»
> as `2026-11-09-rendimiento-1-importador.md`. Design: `docs/superpowers/specs/2026-11-09-rendimiento-design.md`
> (blocks 3 and 4, «Decisiones de la revisión» 2: option B).

**Goal:** after each import Claude reads the account's posts with their figures and proposes what works; Federico
approves, edits or discards each learning; approved learnings enter the writing context of that account.

**Architecture:** same shape as the text requests (`pedidos_de_texto` + `tomar_pedidos` + Trigger poller):
a queue `lecturas_de_rendimiento` (one row per import or «Leer de nuevo»), leased by a Trigger.dev task every 2
minutes, one at a time, no platform retries. The pure core (`lib/rendimiento/aprendizajes.ts`) builds the prompt,
calls `Pedir` (paid, spend cap, one ledger key per reading) and validates Claude's JSON. Learnings live in
`aprendizajes`; the screen shows them in Rendimiento; `contextoDeRedaccion` loads the approved ones.

**Rules kept:** only figures imported from Federico's own XLSX reach Claude (origin `importacion`); rows with origin
`api` are never sent (LinkedIn Developer AI Policy). No audience data in this block. Spend cap applies; a failed
reading is not retried by the platform.

## Task 1: Tables, queue and RPCs

**Files:** `supabase/migrations/20261109180000_aprendizajes.sql`, `lib/supabase/database.types.ts`,
`tests/integration/aprendizajes.test.ts`.

- `lecturas_de_rendimiento`: `id, cuenta_id (cascade), importacion_id (set null), estado pendiente|trabajando|lista|fallo,
  motivo (≤ 500), arrendado_hasta, pedida_por (auth.users), creada_en, terminada_en`. At most one open
  (pendiente/trabajando) per account: partial unique index.
- `aprendizajes`: `id, cuenta_id (cascade), lectura_id (set null), texto (1..400), porque (≤ 600, Claude's reasoning in
  one or two sentences), respaldo integer ≥ 0, publicaciones uuid[] (metricas_de_publicacion ids),
  estado propuesto|aprobado|descartado|pista, creado_en, decidido_por, decidido_en`.
- RLS: owners of the account's brand read both tables; writes only through RPCs.
- RPCs (owners): `pedir_lectura(p_cuenta)` (refuses `lectura_en_curso`; returns id), `decidir_aprendizaje(p_id,
  p_estado aprobado|descartado, p_texto default null)` (editing the text while approving; a `pista` can be approved
  too). Service role: `tomar_lecturas()` (lease 10 min, one, oldest first, same shape as `tomar_pedidos`),
  `terminar_lectura(p_id, p_estado lista|fallo, p_motivo)`, `guardar_aprendizajes(p_lectura, p_items jsonb)` which
  inserts each item with `estado = case when respaldo >= 8 then 'propuesto' else 'pista' end` and marks the earlier
  still-«propuesto» or «pista» learnings of that account as `descartado` (a new reading replaces undecided ones;
  approved ones stay).
- `importar_metricas` (already in production) is NOT changed: the server action enqueues the reading after a
  successful import (Task 3).
- Integration tests: owner asks / second open refused / other owner refused; lease and finish; `guardar_aprendizajes`
  splits propuesto vs pista at 8 and replaces undecided ones; `decidir_aprendizaje` approves with edited text and
  discards; RLS reads.

## Task 2: Claude reading and the Trigger task

**Files:** `lib/rendimiento/aprendizajes.ts` (pure core, Trigger-only imports allowed like `lib/series/carrusel.ts`),
`lib/rendimiento/repositorio-de-lecturas.ts`, `trigger/rendimiento.ts`, tests `tests/unit/aprendizajes.test.ts`,
`tests/integration/repositorio-de-lecturas.test.ts`.

- Ports: `tomar()`, `publicacionesParaLeer(cuentaId)`, `contexto(cuentaId)` (brand id, voice, account name/type,
  pillar names), `guardar(lecturaId, items)`, `terminar(lecturaId, estado, motivo)`, `pedir: Pedir`.
- `publicacionesParaLeer`: posts of the account with origin `importacion`, with a text (the piece's latest version text,
  else the export's `extracto`); each `{ id, publicadaEl, texto (≤ 1500 chars), formato, pilar, impresiones,
  interacciones, tasa, clics }` plus code-computed traits: `largo` (characters), `abreConCifra` (first line has a
  digit), `tieneEnlace`, `diaDeLaSemana`. Posts without text are left out (counted in the prompt: «N publicaciones sin
  texto»).
- Fewer than 3 posts with text and a rate → the reading ends `lista` with no learnings and motivo «Muy pocas
  publicaciones con texto para aprender todavía.», without calling Claude.
- Prompt (Spanish, system + one user message; posts travel as data inside a tag, never as instructions): the account,
  its voice, the median rate, the posts sorted by rate with their figures and traits; ask for 3 to 6 learnings, each:
  `texto` (one actionable sentence in Federico's words, no figures needed), `porque` (one or two sentences citing what
  the posts show), `publicaciones` (ids of the posts that support it). Structured output with the zod helper as in
  `lib/series/carrusel.ts`; model `claude-opus-5-5`, effort high, `maxTokens` 4000; paso `aprender`, clave
  `aprender:<lectura id>`, marcaId of the account's brand.
- Validation: drop cited ids that are not in the input; `respaldo` = number of valid cited posts; a learning with an
  empty `texto` is dropped; at most 6.
- Errors: a `Falla` (spend cap, refusal) ends the reading `fallo` with its Spanish reason; unexpected errors leave the
  lease to expire and are rethrown (as `atenderPedidos`).
- `trigger/rendimiento.ts`: `schedules.task` id `aprender-de-rendimiento`, cron `*/2 * * * *` America/Santiago,
  `concurrencyLimit: 1`, `retry.maxAttempts: 1`, wired like `trigger/atender-pedidos.ts`.
- Unit tests with a fake `Pedir` (prompt contains figures and traits, only imported posts, ids validated, support count,
  few-posts path makes no call, a Falla ends in fallo). Integration test of the repository against local Supabase.

## Task 3: Screen, enqueueing and the writing context

**Files:** `lib/rendimiento/acciones.ts` (enqueue after import), `lib/rendimiento/acciones-de-aprendizajes.ts`,
`lib/rendimiento/lectura.ts` (add learnings and the open reading), `app/(app)/rendimiento/aprendizajes.tsx` (client),
`app/(app)/rendimiento/acciones.ts` (server actions), `vista.tsx`, `lib/redaccion/instrucciones.ts`,
`lib/redaccion/repositorio.ts`, `lib/series/instrucciones.ts`, `lib/series/repositorio.ts`, tests.

- After a successful `importarEstadisticas`, call `pedir_lectura` for that account (ignore `lectura_en_curso`; any other
  error is logged and does not fail the import). The import summary adds «PostIA está leyendo tus publicaciones para
  proponer aprendizajes.».
- Rendimiento shows a section «Aprendizajes» (before «Publicaciones»):
  - an open reading: «Leyendo tus publicaciones…» (no polling; the page shows the state on reload);
  - «Por decidir»: each proposed learning with its `porque`, «Lo respaldan N publicaciones», buttons «Aprobar»,
    «Editar» (textarea, then «Aprobar con este texto»), «Descartar»;
  - «Pistas» (folded, `details`): same actions, labelled «Con menos de 8 publicaciones: úsala con cuidado»;
  - «Aprobados»: the texts, each with «Quitar» (sets `descartado`);
  - a button «Leer de nuevo» (pide una lectura nueva; disabled while one is open), with the cost note «Cuesta cerca de
    US$0,30».
- Writing context: `ContextoDeRedaccion` gains `aprendizajes: string[]` (approved texts of that account, newest first,
  at most 10). `contextoDeRedaccion` takes the account id to load them. `instruccionesDeEscritura` and
  `sistemaDeCarrusel` add, when there are any, `# Lo que funciona en esta cuenta` with one line per learning, after the
  editorial line. Existing prompts with no learnings stay byte-identical (cache).
- Tests: unit for the section (actions called with the right ids and texts), the prompt sections (present / absent),
  integration for enqueue-after-import and the context loading only approved learnings of that account.

## Task 4: Verification and release

Full `pnpm type`, `lint`, `test:run`, `test:db` (alone), `build`. Migration `20261109180000` to production before the
merge; the CI deploy also deploys the Trigger worker (new task `aprender-de-rendimiento`). Smoke after deploy: import
the profile file again and check one reading ends `lista` with learnings or the few-posts reason, and its real cost in
`gastos`.
