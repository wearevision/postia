# Fase 1k: the WAV page publishes through the Community Management API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LinkedIn approved the app «Estudio WAV» for the Community Management API (Development Tier, 2026-10-31). With it, Federico connects the WAV page in Marcas, switches «Página de WAV» from «a mano» to «sale sola», and the existing publisher posts each signed piece as the organization at its signed time: text posts and PDF carousels. Today he publishes those by hand.

**Architecture:** This adds a second LinkedIn app next to «Estudio WAV Perfil»:
- **The app.** It has its own OAuth start and callback, its own client id and secret, and its own scopes: `r_basicprofile`, `rw_organization_admin` and `w_organization_social`.
- **The member.** The callback identifies the member with `GET /v2/me`. It then lists the pages where that member is an approved ADMINISTRATOR (`organizationAcls`).
- **Picking the page.** If there is exactly one, it is linked straight away. If there are several, Federico picks one on a short page. The token is stored in Vault, as for the profile.
- **The connection row.** A connection now records its app and, for a page, its organization URN.
- **Publishing.** The publisher takes the post's author from the connection: the organization URN for a page, the person URN for the profile. The Posts and Documents calls are unchanged.
- **Refresh.** If LinkedIn returns a refresh token (365 days for Marketing partners), a daily task renews the access token before it expires. If it doesn't, the 60-day reconnect and the existing connection watch stay as they are.

**Tech Stack:** Next.js 16 on Cloudflare Workers (route handlers), Supabase (Postgres, Vault, RLS), Trigger.dev v4, LinkedIn REST API (`Linkedin-Version: 202610`, Restli 2.0), Vitest, Playwright.

---

## Design

**Facts (Microsoft Learn, li-lms-2026-10, checked 2026-10-31).**

| Topic | What the docs say |
|---|---|
| Scopes | Community Management offers `r_basicprofile`, `rw_organization_admin`, `w_organization_social`, `r_organization_social`, `w_member_social`, `r_member_postAnalytics`. There is no OpenID Connect on a Community Management app, so the member is identified with `r_basicprofile` and `GET /v2/me`, which is also the review's «heartbeat /me». The person id is per app, so it differs from the profile app's. |
| Who may post | `w_organization_social` allows ADMINISTRATOR, CONTENT_ADMINISTRATOR and DIRECT_SPONSORED_CONTENT_POSTER. The Documents docs list only ADMIN and DSC for an organization-owned upload, so PostIA requires **ADMINISTRATOR**. |
| Listing pages | `GET /rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED`, with `X-Restli-Protocol-Version: 2.0.0`. Elements carry `organization` (some examples say `organizationTarget`; accept both), `role`, `roleAssignee` and `state`. |
| Posting | Same calls as the profile, with `author` and the document `owner` set to `urn:li:organization:{id}`. |
| Tokens | 60 days. Programmatic refresh tokens (365 days, fixed) are documented for approved Marketing partners. Whether Development Tier gets one is unconfirmed: the first exchange tells us (`refresh_token` present or not). |
| Development Tier limits | 500 calls a day per app, 100 per member, no BATCH_GET. A publish is 3–6 calls, so 3 posts a week is far inside. |
| Data storage | IDs and URNs: no limit. Organization profile data (name, logo): 8 weeks. PostIA does **not** store the page's name: the account already has its own («Página de WAV»), and a 60-day connection would outlive the 8 weeks. The list of pages shown during the pick lives only in that short flow (≤10 minutes) and is then deleted. |

**Data changes (migration `20261107120000_pagina_por_api.sql`).**
- **`conexiones`:**
  - `app in ('estudio_wav_perfil', 'estudio_wav')`
  - new `organizacion text check (organizacion ~ '^urn:li:organization:[0-9]+$')`
  - `constraint pagina_con_organizacion check ((app = 'estudio_wav') = (organizacion is not null))`
  - the scopes check becomes `w_member_social` for the profile app and `w_organization_social` for the page app
  - `unique (app, titular)` becomes `unique (app, titular, organizacion)` (nulls not distinct), so one admin can connect two pages
  - new `renovacion_expira_en timestamptz`
- **The refresh token**, when present, lives in a second Vault secret, `conexion:<id>:renovacion`, so it never shares a row with the access token's reads.
- **`cuentas`:** drop `api_solo_perfil`. Its replacement lives in the connect RPC: an `empresa` account can only be linked to an `estudio_wav` connection, and a `persona` account only to an `estudio_wav_perfil` one.
- **New RPC `cambiar_ruta(p_cuenta, p_ruta)`**, owner only. It switches between `api` and `a_mano`. Switching to `a_mano` unlinks the connection, like `desconectar_cuenta`. Pieces already signed keep their content and date: the signature covers text, piece and time, not the route. The publisher reads the route when it sends.
- **`conectar_linkedin`:**
  - It gains `p_app` and `p_organizacion`, with defaults that keep the profile behaviour, and checks the pairing above.
  - `credencial_de_cuenta` returns `autor` as `coalesce(organizacion, titular)`.
  - New service-role RPCs `renovaciones_pendientes(p_hasta)` and `guardar_renovacion(p_conexion, p_token, p_expira_en, p_renovacion, p_renovacion_expira_en)`.
- **Choosing a page.**
  - Table `elecciones_de_pagina (id, conectada_por, cuenta_id, paginas jsonb [{urn, nombre}], creada_en)`, readable only by its creator, with rows older than 10 minutes ignored and deleted by the nightly cleanup.
  - The token for a pending choice goes into Vault as `eleccion:<id>`.
  - `elegir_pagina(p_eleccion, p_organizacion)` moves it into the connection and deletes the choice and its secret.

**OAuth.**
- **Configuration.** New config `leerAppDePagina(env)` reads `LINKEDIN_PAGINA_CLIENT_ID`, `LINKEDIN_PAGINA_CLIENT_SECRET` and `LINKEDIN_PAGINA_REDIRECT_URI`. The redirect URI is `https://postia.wearevision.cl/api/linkedin/pagina/callback`, a `wrangler.jsonc` var.
- **Routes.** `app/api/linkedin/pagina/conectar/route.ts` and `…/callback/route.ts` mirror the profile routes. State uses the same cookie helper with its own cookie name, `postia_linkedin_pagina_estado`.
- **Exchange.** `intercambiarCodigoLinkedin` also returns `refreshToken` and `refreshTokenExpiraEn` when present. The profile flow ignores them.
- **Callback steps (`lib/linkedin/pagina.ts`).**
  1. Check the state and exchange the code.
  2. Require `w_organization_social` and `rw_organization_admin` in the returned scopes. Otherwise redirect with `?linkedin=permisos`.
  3. Read the member with `GET /v2/me`, giving `urn:li:person:{id}`.
  4. List ADMINISTRATOR pages, then decide:
     - **0 pages:** `?linkedin=sin_pagina`, with the message «Tu cuenta de LinkedIn no administra ninguna página. Pide el rol de administrador en la página de WAV y vuelve a conectar.».
     - **1 page:** look up its name for this screen only (`GET /rest/organizations/{id}`, not stored), connect, then `?linkedin=conectada`.
     - **Several pages:** create an election and redirect to `/marcas/pagina?eleccion=<id>`, which lists the names. Tapping one connects it.

**Publisher.**
- `publicar.ts` uses `credencial.autor` instead of `credencial.titular`, for both the document owner and the post author.
- Messages that say «perfil» become neutral: «revisa la conexión de LinkedIn».
- `revision.ts` already sends a non-`api` route to `a_mano` and an expired connection to `a_mano`, and keeps doing so.
- The 30-minute window, the fingerprint check and the doubtful-send handling are unchanged.

**Refresh.**
- New task `renovar-conexiones`, daily at 07:30 Chile, before 8:00's `vigilar-conexiones`.
- For every `estudio_wav` connection with a refresh token, an access token expiring within 10 days and an unexpired refresh token, it calls `POST /oauth/v2/accessToken` with `grant_type=refresh_token`. Trigger.dev needs `LINKEDIN_PAGINA_CLIENT_ID` and `LINKEDIN_PAGINA_CLIENT_SECRET`.
- A refusal is logged and left to the watch, which already pushes before expiry.
- `vigilar-conexiones` and the chip skip their 14- and 3-day warnings for a connection that will renew itself (refresh token valid past the access token's expiry). They warn instead 14 days before the refresh token's own expiry: «La página de WAV se vuelve a conectar en 14 días».

**Marcas UI.**
- An `empresa` account shows «Conectar página de LinkedIn» or «Renovar página», pointing to the page route.
- An account can switch «a mano» ↔ «sale sola», which calls `cambiar_ruta`.
- New messages: `sin_pagina`, `permisos` (page scopes) and `sin_app_pagina`.
- The add-account form stops refusing `empresa` + `api`; the old 23514 message goes.

**Tests that change on purpose.** These encode the old rule and get rewritten:
- `tests/integration/cuentas.test.ts:41`: company + api refused.
- `acciones-marcas.test.ts:41`.
- `acciones-disenos.test.ts:22`.
- `tests/e2e/carrusel.spec.ts:13`.

**Not in this plan:**
- Moving Federico's profile to the Community Management app (plano D2 suggests it for analytics and the refresh).
- Page statistics (D12, later).
- The Standard Tier screencast (gate 6 says when).
- Metricool.

## Gates: stop and ask Federico

1. **Screenshot of «OAuth 2.0 scopes»** in Estudio WAV → Auth. Confirm `r_basicprofile`, `rw_organization_admin` and `w_organization_social` are listed. If any is missing, stop and adjust the scopes.
2. **Redirect URL.** In Estudio WAV → Auth, add `https://postia.wearevision.cl/api/linkedin/pagina/callback`. Federico does this himself in the LinkedIn portal.
3. **Secrets.** `LINKEDIN_PAGINA_CLIENT_ID` and `LINKEDIN_PAGINA_CLIENT_SECRET` go in Cloudflare (Worker secrets) and Trigger.dev prod. Federico sets them himself; they never pass through chat.
4. **Push, PR, production migration and merge.** Federico runs `supabase db push` and `gh pr merge`.
5. **Connect and switch.**
   1. In Marcas, Federico taps «Conectar página de LinkedIn» on «Página de WAV» and authorizes.
   2. Check the connection row (app, organization URN, expiry, whether a refresh token arrived).
   3. Switch the account to «sale sola».
6. **First real publish.** It is public, so ask first. The next signed WAV piece goes out at its time. Check the post on the page, its URN in `publicaciones`, and the call count in LinkedIn's Analytics tab. After a week of clean publishing, record the screencast and request the Standard Tier («Request upgrade»).

---

## File map

```
supabase/migrations/20261107120000_pagina_por_api.sql
lib/supabase/database.types.ts                   regenerated
lib/linkedin/oauth.ts                            + exchange returns refresh token; leerMiembroPorMe (/v2/me)
lib/linkedin/organizaciones.ts                   paginasQueAdministra (organizationAcls), nombreDePagina (lookup)
lib/linkedin/pagina.ts                           leerAppDePagina, urlDeAutorizacionDePagina, terminarConexionDePagina
lib/linkedin/renovar.ts                          renovarConexiones (Trigger only)
lib/publicacion/publicar.ts, revision.ts         author from credencial.autor; neutral messages
lib/publicacion/repositorio.ts                   credencial: autor
lib/avisos/conexiones.ts, lib/marcas/estado-conexion.ts   self-renewing connections
lib/marcas/acciones.ts                           cambiarRuta; add-account rule
app/api/linkedin/pagina/conectar/route.ts
app/api/linkedin/pagina/callback/route.ts
app/(app)/marcas/pagina/page.tsx                 pick one of several pages
app/(app)/marcas/page.tsx, formulario-cuenta.tsx, acciones.ts
trigger/conexiones.ts                            + renovar-conexiones
wrangler.jsonc                                   + LINKEDIN_PAGINA_REDIRECT_URI
docs/despliegue.md, .env.example                 + the new names (no values)
tests/unit/linkedin-organizaciones.test.ts, linkedin-pagina.test.ts, renovar-conexiones.test.ts
tests/unit/publicar.test.ts, conexiones.test.ts, estado-conexion.test.ts, linkedin-oauth.test.ts (existing)
tests/integration/pagina-por-api.test.ts
tests/integration/cuentas.test.ts, acciones-marcas.test.ts, acciones-disenos.test.ts, repositorio-publicacion.test.ts (existing)
tests/e2e/carrusel.spec.ts (existing), tests/e2e/marcas-ruta.spec.ts
```

---

### Task 1: Migration: page connections, routes and refresh

**Files:** `supabase/migrations/20261107120000_pagina_por_api.sql`, `tests/integration/pagina-por-api.test.ts`, the existing integration tests listed above, `lib/supabase/database.types.ts`.

- [ ] **Step 0: Branch.** `fase-1k-pagina-wav` already exists with this plan; check it out.
- [ ] **Step 1: Failing tests.**
  - **Connecting a page.** An owner's `conectar_linkedin` with `p_app 'estudio_wav'` and `p_organizacion 'urn:li:organization:123'` connects an `empresa` account and stores the token in Vault.
  - **Wrong pairings are refused** with `cuenta_y_app_no_calzan`: the same call on a `persona` account, and the profile app on an `empresa` account.
  - **A page connection without an organization** fails the check constraint.
  - **`credencial_de_cuenta`** (service role) returns `autor = urn:li:organization:123` for the page, and the person URN for the profile.
  - **`cambiar_ruta`:**
    - By an owner it switches `a_mano` → `api` and back; going back unlinks the connection and deletes it when unused.
    - A non-owner gets `solo_el_dueno_cambia_cuentas`.
    - `metricool` is refused, since there is no Metricool path.
  - **The add-account insert** of `empresa` + `api` now succeeds. Rewrite `cuentas.test.ts:41`, `acciones-marcas.test.ts:41` and `acciones-disenos.test.ts:22` to the new rule.
  - **Refresh token:**
    - `guardar_renovacion` stores the new access token in `conexion:<id>`, the refresh token in `conexion:<id>:renovacion`, and both expiries.
    - `renovaciones_pendientes(p_hasta)` (service role) returns the connections whose token expires before `p_hasta` and that have a valid refresh token, with the refresh token decrypted.
    - A person calling either gets 42501.
  - **Choosing a page:**
    - `guardar_eleccion(p_cuenta, p_titular, p_paginas, p_token, p_expira_en, …)` (owner) stores the choice, with its token in Vault as `eleccion:<id>`.
    - `elegir_pagina(p_eleccion, p_organizacion)` connects only an organization present in the list, and only within 10 minutes. It refuses another person's choice.
    - The nightly cleanup deletes expired choices and their secrets. Add this to `limpieza_nocturna`'s function and copy its current body.
- [ ] **Step 2: See them fail.**
- [ ] **Step 3: Migration.**
  - Redefine `conectar_linkedin` (keep its signature compatible: add the new params with defaults), `desconectar_cuenta` (also delete `:renovacion`) and `credencial_de_cuenta`. Copy their bodies from `20261028120100_cuentas_y_conexiones.sql` and change only what is listed.
  - `security definer`, `search_path = ''`, grants as today.
  - Drop and re-add the constraints by name.
- [ ] **Step 4: Pass.** Run `pnpm db:reset`, the new file, `pnpm db:types`, `pnpm type`, then the full `pnpm test:db`.
- [ ] **Step 5: Commit** `feat: page connections for the Community Management app, account routes and refresh tokens in the database`

### Task 2: LinkedIn calls: /me, the pages a member administers, the refresh

**Files:** `lib/linkedin/oauth.ts`, `lib/linkedin/organizaciones.ts`. Tests: `linkedin-oauth.test.ts`, `linkedin-organizaciones.test.ts` (msw, as the existing LinkedIn tests do).

- [ ] **Step 1: Failing tests.**
  - `intercambiarCodigoLinkedin` returns `refreshToken` and `refreshTokenExpiraEn` when the response has them, and null when it doesn't.
  - `leerMiembroPorMe(token)` calls `GET {api}/v2/me` and returns `urn:li:person:{id}`. A 401 raises `TokenDeLinkedinVencido`.
  - `paginasQueAdministra(token)` calls `GET {api}/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=50` with `Linkedin-Version: 202610` and Restli 2.0. It returns organization URNs, read from `organization` or `organizationTarget`, deduplicated and ignoring non-ADMINISTRATOR or non-APPROVED rows defensively.
  - `nombreDePagina(token, urn)` calls `GET {api}/rest/organizations/{id}` and returns `localizedName`.
  - `renovarToken(app, refreshToken)` posts `grant_type=refresh_token` form-encoded to `{oauth}/oauth/v2/accessToken`. It returns the new token and expiries; a 4xx raises `RechazoDeLinkedin`.
- [ ] **Step 2–4:** Fail, implement (reuse `cabeceras`, the base-URL overrides and the error classes in `lib/linkedin/api.ts` and `oauth.ts`), pass.
- [ ] **Step 5: Commit** `feat: read the member, the pages they administer and refresh a token`

### Task 3: The page's OAuth flow

**Files:** `lib/linkedin/pagina.ts`, `app/api/linkedin/pagina/conectar/route.ts`, `…/callback/route.ts`, `app/(app)/marcas/pagina/page.tsx`, `wrangler.jsonc`, `.env.example`, `docs/despliegue.md`. Tests: `linkedin-pagina.test.ts`, plus route tests if the profile routes have them.

- [ ] **Step 1: Failing tests** for `terminarConexionDePagina` (fakes for exchange, me, pages and lookup, and the `guardar` and `guardarEleccion` ports).
  - A bad state returns `estado`; LinkedIn's cancel returns `cancelada`.
  - Missing page scopes return `permisos`.
  - With 0 pages it returns `sin_pagina` and saves nothing.
  - With 1 page it saves the connection with that organization and the refresh token if present, and returns `conectada`.
  - With 2 or more pages it saves a choice with each page's name and returns `elegir:<id>`.
  - `leerAppDePagina(env)` returns null when any of the three variables is missing; the route then redirects to `?linkedin=sin_app_pagina`.
- [ ] **Step 2–4:** Fail, implement, pass.
  - The routes mirror the profile routes, with the page scopes `["r_basicprofile", "rw_organization_admin", "w_organization_social"]`.
  - `/marcas/pagina?eleccion=<id>` lists the pages: names from the choice row, which belongs to its creator only. Tapping one calls `elegir_pagina` through an action.
  - Add `LINKEDIN_PAGINA_REDIRECT_URI` to `wrangler.jsonc`. List the secret names (no values) in `docs/despliegue.md` and `.env.example`.
  - Keep the Worker CPU light: the callback does 3–4 network calls and no heavy work.
- [ ] **Step 5: Commit** `feat: connect the WAV page with the Community Management app`

### Task 4: The publisher posts as the page

**Files:** `lib/publicacion/{publicar,revision,repositorio}.ts`. Tests: `publicar.test.ts`, `repositorio-publicacion.test.ts`, `revision.test.ts`.

- [ ] **Step 1: Failing tests.**
  - With a credential whose `autor` is `urn:li:organization:123`, `publicarPieza` passes that author to `subirDocumento` (owner) and to `crearPost` for both a text piece and a carousel.
  - The profile keeps its person author.
  - The messages no longer say «perfil».
  - The repository's `credencial` maps the RPC's `autor`.
- [ ] **Step 2–4:** Fail, implement, pass. `credencial.titular` stays only where the member matters (logs). The author is always `autor`.
- [ ] **Step 5: Commit** `feat: publish as the organization when the connection is a page`

### Task 5: Refresh and the watch

**Files:** `lib/linkedin/renovar.ts`, `trigger/conexiones.ts`, `lib/avisos/conexiones.ts`, `lib/marcas/estado-conexion.ts`. Tests: `renovar-conexiones.test.ts`, `conexiones.test.ts`, `estado-conexion.test.ts`, `vigilar-conexiones.test.ts`.

- [ ] **Step 1: Failing tests.**
  - `renovarConexiones(p, ahora)` renews each pending connection, where pending means the token expires within 10 days and the refresh token is valid. It saves the new tokens and expiries. A refusal is logged per connection and the others still run. Unexpected errors are rethrown at the end.
  - It never logs a token.
  - `revisarConexion` and the chip treat a connection whose refresh token outlives its access token as self-renewing:
    - no 14- or 3-day lines for the access token;
    - a line 14 and 3 days before the refresh token's expiry;
    - the chip shows «Se renueva sola».
- [ ] **Step 2–4:** Fail, implement, pass. Add the task `renovar-conexiones` (cron `30 7 * * *` America/Santiago, `maxAttempts 1`) to `trigger/conexiones.ts`. It reads `LINKEDIN_PAGINA_CLIENT_ID` and `LINKEDIN_PAGINA_CLIENT_SECRET` from the Trigger env, and with them missing it logs once and does nothing.
- [ ] **Step 5: Commit** `feat: renew page tokens before they expire and stop warning about self-renewing connections`

### Task 6: Marcas: connect the page and switch the route

**Files:** `app/(app)/marcas/{page,formulario-cuenta,acciones}.tsx`, `lib/marcas/acciones.ts`. Tests: the existing Marcas component and integration tests, `tests/e2e/marcas-ruta.spec.ts`, `tests/e2e/carrusel.spec.ts`.

- [ ] **Step 1: Failing tests.**
  - An `empresa` account on `api` shows «Conectar página de LinkedIn» (or «Renovar página»), linking to `/api/linkedin/pagina/conectar?cuenta=<id>`.
  - Each account has a switch «Sale sola / A mano» that calls `cambiarRuta`, with errors mapped to Spanish.
  - The add-account form accepts `empresa` + `api`.
  - The new `?linkedin=` messages render.
  - e2e: switch «Página de WAV» to «sale sola» and see «Conectar página de LinkedIn»; switch back.
  - Update `carrusel.spec.ts:13`, which relied on the old constraint.
- [ ] **Step 2–4:** Fail, implement, pass. Mobile-first, semantic tokens, `"use client"` on line 1.
- [ ] **Step 5: Commit** `feat: Marcas connects the page and switches an account between sale sola and a mano`

### Task 7: Full suite and review

- [ ] `pnpm lint && pnpm type && pnpm test:run && pnpm test:db && pnpm test:render && pnpm build && pnpm test:e2e`. All green, with lint run from the repo root and the stray worktree excluded if it still breaks Biome.
- [ ] Worker bundle check (`wrangler deploy --dry-run`).
- [ ] `superpowers:code-reviewer` on `main...fase-1k-pagina-wav`, focused on:
  - OAuth (state, the choice's ownership and expiry, open redirects);
  - token handling (Vault only; never logged or returned to the browser);
  - the account and app pairing;
  - the publisher's author;
  - LinkedIn data storage (no page names kept);
  - the refresh task.

  Fix each finding, test first.

### Task 8: Gates

- [ ] Gates 1–6 above, in order. Never publish to the page before Federico says so. Update memory (`estado-fase-1.md`) at the end.
