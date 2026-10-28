# Phase 1 · Plan B: deploy to postia.wearevision.cl

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PostIA runs at `https://postia.wearevision.cl` on Cloudflare Workers (D23) against a hosted Supabase project: Federico signs in with his code, connects his LinkedIn profile, installs the app on his iPhone and receives a push notice on the lock screen. CI deploys `main` only after every test passes.

**Architecture:** Next.js 16 built with `@opennextjs/cloudflare` (1.20.14, `proxy.ts` supported since 1.20.3) into one Worker named `postia` with a custom domain, the same pattern as `wr3-web`. Build-time values (`NEXT_PUBLIC_*`) come from the build environment; runtime secrets live in Cloudflare and are read through `process.env`. The database is a new hosted Supabase project in the WAV organization, region `sa-east-1`, migrated from `supabase/migrations`. Nothing in the app's code changes unless the Worker runtime proves it must.

**Tech Stack:** `@opennextjs/cloudflare` 1.20.14, `wrangler` (devDependency), Supabase CLI (`link`, `db push`, `config push`), GitHub Actions.

**Checked on 2026-10-28 (sources, not memory):**
- OpenNext supports all Next 16 minors; `proxy.ts` (Node.js middleware) is bundled into a Workers-compatible handler since 1.20.3 (release notes, PR #1309, fix #1359). Latest release 1.20.14 (2026-10-28).
- Worker size limit counts the gzip size: 3 MiB on the Free plan, 10 MiB on Paid.
- `node:crypto` is fully supported in Workers (only DSA/DH key-pair generation, argon2, randomUUIDv7 and ed448/x448 are missing); with `compatibility_date` 2026-08-04 or later `nodejs_compat` is on by default. `web-push` uses `createECDH`, so it should work, but it also imports `https` at load time: proven in Task 3 on `workerd`, not assumed.
- `NEXT_PUBLIC_*` values are inlined at build time; runtime variables are set in Cloudflare, and a deploy can wipe dashboard variables unless it passes `--keep-vars`.
- Supabase's default SMTP only delivers to members of the organization's team, with a low hourly limit. Phase 1 has one user (Federico), so it is enough if his address is a team member; phase 2 (team) needs a custom SMTP.
- DNS for `wearevision.cl` is on Cloudflare. `postia.wearevision.cl` already resolves to Cloudflare but answers nothing: an existing record that must not conflict with the Worker's custom domain.

---

## Gates: stop and ask Federico

1. **Hosted Supabase project** (Task 4): creating `postia` in the WAV organization. The organization already has three active projects, so it is on a paid plan and a new project likely adds compute cost. Federico confirms the cost and either creates it himself or approves `supabase projects create`.
2. **Cloudflare** (Task 6): the first `wrangler login` and deploy run in Federico's terminal against the WAV account. The account's plan decides the Worker size limit (3 or 10 MiB gzip).
3. **DNS** (Task 6): the existing `postia.wearevision.cl` record. Federico says what it is and approves removing it, so the Worker can own the custom domain.
4. **Secrets** (Tasks 5 and 7): Federico types every production value himself (`wrangler secret put`, `gh secret set`, the Supabase dashboard). No value passes through the chat, the repo or a log.

## What Federico does by hand

- Confirm in Supabase (Organization › Team) that `federico@wearevision.cl` is a team member.
- In «Estudio WAV Perfil» › Auth, add `https://postia.wearevision.cl/api/linkedin/callback` (the localhost one stays for development).
- Generate production VAPID keys (`pnpm dlx web-push generate-vapid-keys`): different from the local ones.
- Install PostIA on the iPhone from Safari (Compartir › Agregar a inicio) and allow notices.

## File map

```
wrangler.jsonc                 Worker «postia»: entry, assets, self reference, custom domain
open-next.config.ts            OpenNext config (no incremental cache: every app page is dynamic)
next.config.ts                 + initOpenNextCloudflareForDev()
package.json                   scripts preview, desplegar, cf-typegen, invitar:prod; deps
.gitignore                     + .open-next, .wrangler, .dev.vars
biome.json                     ignore .open-next, cloudflare-env.d.ts
playwright.config.ts           E2E_BASE_URL to run the same specs against preview or production
.github/workflows/ci.yml       job «Deploy» after every test job, only on push to main
supabase/config.toml           site_url and redirect URLs that also cover production (config push)
docs/despliegue.md             runbook: secrets, first deploy, rollback
CLAUDE.md                      commands preview / desplegar
```

---

## Task 1: OpenNext build that runs on workerd

**Files:** Create `wrangler.jsonc`, `open-next.config.ts`. Modify `next.config.ts`, `package.json`, `.gitignore`, `biome.json`.

- [ ] **Step 1: Install.** `pnpm add @opennextjs/cloudflare@1.20.14 && pnpm add -D wrangler`. Decide the new `allowBuilds` entries in `pnpm-workspace.yaml` (`workerd` and `esbuild` need their install scripts: `true`).
- [ ] **Step 2: `wrangler.jsonc`** (custom domain left out until Task 6, so local preview cannot touch DNS):

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "postia",
  "main": ".open-next/worker.js",
  // 2026-08-04 or later turns nodejs_compat on by default; the flag stays explicit for readers.
  "compatibility_date": "2026-10-28",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": { "directory": ".open-next/assets", "binding": "ASSETS" },
  "services": [{ "binding": "WORKER_SELF_REFERENCE", "service": "postia" }],
  "observability": { "enabled": true }
}
```

- [ ] **Step 3: `open-next.config.ts`**

```ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare"

// Every page reads the session, so nothing is statically cached: no incremental cache store is needed.
export default defineCloudflareConfig({})
```

- [ ] **Step 4: `next.config.ts`**: add at the end

```ts
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare"

initOpenNextCloudflareForDev()
```

- [ ] **Step 5: scripts** in `package.json` (`deploy` is a pnpm built-in, so the script is named `desplegar`):

```json
"preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
"desplegar": "opennextjs-cloudflare build && opennextjs-cloudflare deploy -- --keep-vars",
"cf-typegen": "wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts"
```

- [ ] **Step 6: ignores.** `.gitignore` + `/.open-next/`, `/.wrangler/`, `.dev.vars` (`.env*` already covers `.env.produccion`, not `.dev.vars`). `biome.json` `files.includes` + `"!.open-next"`, `"!cloudflare-env.d.ts"`.
- [ ] **Step 7: Build.** `pnpm exec opennextjs-cloudflare build`. Expected: `.open-next/worker.js` exists. If the Turbopack build is refused, retry with `next build --webpack` set as the `build` script and record why in `docs/despliegue.md`.
- [ ] **Step 8: Size.** `pnpm exec wrangler deploy --dry-run --outdir .wrangler/dry` and read «Total Upload … gzip». Expected under 3 MiB (Free) or 10 MiB (Paid). Over the limit: drop the unused animation dependencies from the server bundle before anything else.
- [ ] **Step 9: Commit** — `git commit -m "build: bundle PostIA for Cloudflare Workers with OpenNext"`.

## Task 2: The E2E specs can target any URL

**Files:** Modify `playwright.config.ts`.

- [ ] **Step 1:** `baseURL` and `webServer` read `process.env.E2E_BASE_URL`: when it is set, no web server is started and the specs run against that URL.

```ts
const destino = process.env.E2E_BASE_URL ?? "http://localhost:3000"
// ...
use: { baseURL: destino, trace: "on-first-retry" },
webServer: process.env.E2E_BASE_URL
  ? undefined
  : { command: "pnpm dev", url: destino, reuseExistingServer: !process.env.CI, timeout: 120_000 },
```

- [ ] **Step 2:** `pnpm test:e2e` still passes against `pnpm dev` (2 passed).
- [ ] **Step 3: Commit** — `git commit -m "test: let the E2E specs target a deployed URL"`.

## Task 3: Prove the app on workerd before any cloud resource

Local Supabase, local Worker runtime: this is where Worker-only failures show up for free.

- [ ] **Step 1:** `.dev.vars` (ignored) with the same values as `.env.local` plus `NEXTJS_ENV=development`. Build with the local `NEXT_PUBLIC_*` values.
- [ ] **Step 2:** `pnpm preview` (serves on `http://localhost:8787`). Then `E2E_BASE_URL=http://localhost:8787 pnpm test:e2e` → 2 passed (sign-in with code, stranger gets no email). This proves `proxy.ts`, Server Actions and Supabase Auth on workerd.
- [ ] **Step 3: Icons.** `curl -o /dev/null -w '%{http_code} %{content_type}' http://localhost:8787/icon` and `/apple-icon` → `200 image/png`. If `next/og` fails on workerd, replace `app/icon.tsx` and `app/apple-icon.tsx` with static PNGs in `app/` (`icon.png` 512 px, `apple-icon.png` 180 px) rendered once from the current components, and keep `tests/unit/manifest.test.ts` green.
- [ ] **Step 4: Push.** Sign in at `http://localhost:8787/ajustes` in Chrome, «Activar avisos», «Mandar aviso de prueba». Expected: the notice arrives (the subscription from `localhost:3000` belongs to another origin: a new one is created). If `web-push` cannot load on workerd, write a failing test first and replace `generateRequestDetails` with a Web Crypto implementation of RFC 8291/8292 in `lib/avisos/push.ts`, keeping `ServicioPush` and its tests unchanged.
- [ ] **Step 5: LinkedIn.** Only if `LINKEDIN_REDIRECT_URI` is pointed at `http://localhost:8787/api/linkedin/callback` and that URL is added to the LinkedIn app; otherwise skip and rely on Task 7. Do not publish anything.
- [ ] **Step 6: Commit** whatever Steps 3 and 4 needed (each fix with its test) — `git commit -m "fix: <what workerd required>"`. If nothing changed, nothing to commit.

## Task 4: GATE · hosted Supabase project

- [ ] **Step 1: Ask Federico** (stop): create `postia` in organization `jrgrxznpncrzqvdayuus`, region `sa-east-1`, with the cost his plan shows. He creates it in the dashboard, or approves `supabase projects create postia --org-id jrgrxznpncrzqvdayuus --region sa-east-1` (he types the database password in his terminal).
- [ ] **Step 2: Link and migrate.** `supabase link --project-ref <ref>` (in his terminal: it asks the database password), then `supabase db push`. Expected: the three migrations applied. `supabase migration list` shows them on both sides.
- [ ] **Step 3: Auth.** In `supabase/config.toml` set `site_url = "https://postia.wearevision.cl"` and `additional_redirect_urls = ["https://postia.wearevision.cl", "http://localhost:3000"]` (local keeps working), then `supabase config push`. Confirm in the dashboard: sign-ups off, email OTP length 6, and the magic-link template showing `{{ .Token }}` (if `config push` did not carry the template, paste `supabase/templates/codigo.html` by hand).
- [ ] **Step 4: Vault.** In the SQL editor: `select count(*) from vault.secrets;` runs (the extension is on by default).
- [ ] **Step 5: Invite Federico in production.** Add `"invitar:prod": "tsx --env-file=.env.produccion scripts/invitar.ts"`. Federico writes `.env.produccion` himself (ignored): `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` of the new project. Then `pnpm invitar:prod --correo federico@wearevision.cl --marca "Federico Elgueta" --voz yo` and the same for «WAV We Are Vision» `--voz nosotros`.
- [ ] **Step 6: Commit** — `git commit -m "chore: point Supabase auth at postia.wearevision.cl"`.

## Task 5: Secrets for the Worker

The Worker never gets the service-role key: only the scripts use it.

- [ ] **Step 1: Runtime secrets**, typed by Federico (each command prompts for the value): `pnpm exec wrangler secret put LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Plain vars in `wrangler.jsonc`: `"vars": { "LINKEDIN_REDIRECT_URI": "https://postia.wearevision.cl/api/linkedin/callback" }`.
- [ ] **Step 2: Build-time values.** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` of the hosted project reach the build as environment variables of the deploy command (Task 6 Step 3 by hand, Task 7 from GitHub secrets). Never in `.env.production*`: `next build` always loads those, so `pnpm preview` would compile against production. Next does not override a variable already set in the process, so the command's values win over `.env.local`.
- [ ] **Step 3: Check without values.** `pnpm exec wrangler secret list` shows the five names.

## Task 6: GATE · first deploy and custom domain

- [ ] **Step 1: Ask Federico** about the existing `postia.wearevision.cl` record (what it is, whether to delete it) and the account plan (size limit).
- [ ] **Step 2:** Add `"routes": [{ "pattern": "postia.wearevision.cl", "custom_domain": true }]` to `wrangler.jsonc`.
- [ ] **Step 3: In his terminal:** `pnpm exec wrangler login` (Cloudflare OAuth: his account, his click), then `NEXT_PUBLIC_SUPABASE_URL=<url> NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon> pnpm desplegar` with the hosted project's public values. Expected: the Worker uploads and the custom domain is attached. Check the build used them: `grep -rl "<ref>.supabase.co" .open-next/assets | head -1` finds a file.
- [ ] **Step 4: Smoke.** `curl -sI https://postia.wearevision.cl/` → `307` to `/ingreso`; `/manifest.webmanifest`, `/icon`, `/sw.js` → 200. `E2E_BASE_URL=https://postia.wearevision.cl` is not run against production for the sign-in spec (it would invite test users): only the stranger spec, which creates nothing.
- [ ] **Step 5: Commit** — `git commit -m "chore: serve PostIA at postia.wearevision.cl"`.

## Task 7: CI deploys main after the tests

- [ ] **Step 1:** Federico creates a Cloudflare API token (template «Edit Cloudflare Workers», only the WAV account) and sets GitHub secrets himself: `gh secret set CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `NEXT_PUBLIC_SUPABASE_URL_PROD`, `NEXT_PUBLIC_SUPABASE_ANON_KEY_PROD`.
- [ ] **Step 2:** Job in `.github/workflows/ci.yml`:

```yaml
  deploy:
    name: Deploy
    needs: [test, db, build, e2e]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    concurrency: { group: deploy-production, cancel-in-progress: false }
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 11
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm desplegar
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL_PROD }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY_PROD }}
```

- [ ] **Step 3: Migrations stay manual** in this plan (`supabase db push` by Federico before merging a migration): automating them needs the database password in CI, which is a separate decision.
- [ ] **Step 4: Commit and push** (ask before the push) — `git commit -m "ci: deploy main to Cloudflare after the tests pass"`. The run's Deploy job is green.

## Task 8: Verify on the real domain, on the iPhone

- [ ] **Step 1: Sign-in.** Federico opens `https://postia.wearevision.cl` on the iPhone, asks for a code, receives the email (default SMTP, he is a team member), signs in.
- [ ] **Step 2: LinkedIn.** «Marcas» › add «LinkedIn de Federico» (Perfil, Sale sola) and «Página de WAV» (Página, A mano) in production › «Conectar LinkedIn» → «Conectada · vence en 60 días».
- [ ] **Step 3: Install and push.** Safari › Compartir › Agregar a inicio; open PostIA from the home screen › Ajustes › «Activar avisos» › «Mandar aviso de prueba» → the notice shows on the lock screen; tapping it opens PostIA.
- [ ] **Step 4: Logs.** `pnpm exec wrangler tail postia` during Steps 1–3 shows no errors, and no log line carries a token, a code or a push endpoint.

## Task 9: Docs

- [ ] **Step 1:** `docs/despliegue.md`: what lives where (Worker `postia`, Supabase project ref, secrets by name only), how to deploy, how to roll back (`pnpm exec wrangler rollback`), how to rotate a secret, and the manual migration step.
- [ ] **Step 2:** `CLAUDE.md` commands: `pnpm preview`, `pnpm desplegar`, `pnpm invitar:prod`.
- [ ] **Step 3: Commit** — `git commit -m "docs: add the deploy runbook"`.

---

## Self-review

**Coverage.** D23 (Workers, OpenNext, Supabase in the cloud, deploy from 1a) → Tasks 1, 4, 6. iPhone push on the real domain → Task 8. CI deploys only after tests → Task 7. Gates for cost, DNS, account login and secrets → Tasks 4–7. Trigger.dev is not needed yet: nothing in plan A runs in the background; it arrives with the publishing cycle (plan C).

**Riskiest points, proven early and locally (Task 3), not discovered in production:** `proxy.ts` on workerd, `next/og` icons, `web-push` loading on workerd, `process.env` at runtime. Each has a fallback written in its step.

**Not in this plan:** automated migrations in CI, custom SMTP (phase 2), staging environment, R2 (arrives with carousel rendering).
