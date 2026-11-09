# Rendimiento, bloque API: analíticas de LinkedIn por API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Same «Rules for every task»
> as `2026-11-09-rendimiento-1-importador.md`. Before writing any LinkedIn call, read the current docs with the
> `microsoft-learn` MCP (`LinkedIn-Version` is `VERSION_DE_LINKEDIN` in `lib/linkedin/api.ts`, today `202610`).

**Goal:** with the Community Management API (Development tier, app «Estudio WAV»), PostIA reads the WAV Page's post and
follower statistics and, after Federico authorizes it, the analytics of his own posts; Rendimiento shows them. This is
also what the Standard-tier screencast must show.

**Compliance (LinkedIn Data Storage Requirements, checked 2026-11-09):**
- Page reporting data (share statistics, follower statistics): stored up to **1 year**.
- Member post analytics (`r_member_postAnalytics`, Federico's own posts): treated as members' social activity data,
  stored **48 hours** at most; refreshed, never accumulated.
- API data never reaches Claude (Developer AI Policy): the learnings reader already reads only `origen = 'importacion'`
  — keep it so and add a test if missing.
- Data minimization: the profile analytics consent asks for `r_member_postAnalytics` only.
- Development tier limits: 500 calls/app/day, 100/member/day. Profile: last 10 PostIA posts × 4 metrics per refresh.

## Task 1: Profile analytics connection (OAuth through «Estudio WAV»)

- Reuse the page app's credentials (`LINKEDIN_PAGINA_CLIENT_ID/SECRET`) and its registered callback
  `/api/linkedin/pagina/callback`: the OAuth `state` carries the purpose (`pagina` | `analiticas`) so no new redirect
  URL is needed. Read `lib/linkedin/pagina.ts`, `lib/linkedin/estado-oauth.ts`, `lib/linkedin/oauth.ts`,
  `app/api/linkedin/pagina/*` and `lib/linkedin/conexion.ts` first and follow their patterns (state signing, Vault
  token storage, error messages).
- Scope: `r_member_postAnalytics`. The connection is stored against the person's profile account (cuenta tipo persona)
  as a separate «analytics» connection, with its token in Vault (`analiticas:<cuenta id>`), its expiry and the granted
  scopes; migration `20261109190000_analiticas_api.sql` adds what is needed (a table or columns; owners only; RLS).
- Ajustes: under the profile account, «Conectar analíticas de LinkedIn» (and «Renovar» when expired); Spanish errors
  when the scope was not granted.
- Tests first: unit for URL/state, integration for storing the connection and RLS.

## Task 2: Reading the figures

- `lib/linkedin/analiticas.ts` (pure HTTP with injected fetch, like `lib/linkedin/api.ts`):
  - Page: `organizationalEntityShareStatistics` for the page's PostIA-published shares (`publicaciones.post_urn` of
    pieces of the page account, last 12 months; share URNs; ugcPost URNs are skipped and counted since the endpoint
    does not accept them reliably), and time-bound `organizationalEntityFollowerStatistics` per day for the last 30 days.
  - Profile: `memberCreatorPostAnalytics?q=entity` for the last 10 PostIA posts of the profile, metrics `IMPRESSION`,
    `REACTION`, `COMMENT`, `RESHARE`, aggregation `TOTAL`.
  - Each call respects the version header and Rest.li protocol, maps 401/403 to «reconectar», 429 to «límite diario».
- `lib/rendimiento/sincronizar.ts`: writes `metricas_de_publicacion` / `metricas_diarias` with `origen = 'api'` through
  a service RPC `guardar_metricas_api(p_cuenta, p_datos)` (in the same migration), interactions = reactions + comments +
  reposts, clicks for the page.
- Trigger task `leer-analiticas` (`trigger/analiticas.ts`): daily at 06:00 America/Santiago for every connected page and
  profile, one at a time, no retries; plus an owner action «Actualizar desde LinkedIn» in Rendimiento that queues an
  immediate read for that account (reuse the reading-queue pattern or call the same core from a server action if it is
  Worker-safe — decide by `tests/unit/limites-del-worker.test.ts`).
- Retention in the nightly cleanup (`trigger/limpieza.ts` / its lib): delete `origen = 'api'` rows of persona accounts
  older than 48 hours and of empresa accounts older than 1 year.
- Tests first with recorded-shape fake responses taken from the docs (no real calls in tests).

## Task 3: Rendimiento

- A small source line per account: «Cifras de LinkedIn (API), actualizadas hace N h» and/or «Archivo importado (del …
  al …)»; for the profile, note «LinkedIn permite guardar estas cifras 48 horas: se actualizan cada día».
- Posts from the API show a «LinkedIn» chip; the existing «api wins» merge stays.
- «Actualizar desde LinkedIn» button (owner), disabled while a read is running.
- Tests: unit for the source line and chip; e2e can stay as is.

## Task 4: Release

Migration to production before the merge; CI deploys the Trigger worker. Then Federico connects the profile analytics in
Ajustes, runs «Actualizar desde LinkedIn» for the page and the profile, and checks Rendimiento. Then record the
screencast.
