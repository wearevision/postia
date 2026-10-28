# Phase 1 · Plan A: clean base, sign-in, brands and accounts, LinkedIn smoke test

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Leave PostIA with a lint-clean, tested base; invite-only sign-in with Supabase Auth; brands and accounts with Federico's LinkedIn profile connected through the «Estudio WAV Perfil» app (OpenID Connect + `w_member_social`); a signed smoke script that publishes one text post and one PDF carousel on his profile (closing phase 0); and the mobile-first shell (installable on the iPhone home screen, web push).

**Architecture:** Next.js 16 App Router on Supabase (Postgres + RLS by brand membership, Auth by 6-digit email code, Vault for tokens). Pure domain functions under `lib/` with ports for every external call (Supabase Auth, LinkedIn, push service), so unit tests use fakes or MSW and integration tests hit a local Supabase. Everything is written from scratch, per D8: no code is copied from Conidolly (`~/Projects/estudio-coni`) or Ingesta. Where the plano cites a Conidolly reference, read it to understand the behavior, then write PostIA's own code test-first. Deploy target (D23): Cloudflare Workers through `@opennextjs/cloudflare` (1.20.3 or newer), with Supabase and Trigger.dev in the cloud.

**Tech Stack:** Next.js 16.2, React 19, TypeScript strict, Supabase (`@supabase/ssr`, local CLI 2.117), Tailwind v4, Zod 4, Vitest 4 + Testing Library + MSW 2, Playwright (iPhone 14 profile), `tsx` scripts, `pdf-lib`, `web-push`, Biome 2.2, pnpm.

**Source of truth:** `docs/plano/plano-postia.html` (Fase 1, Reglas, Decisiones D2, D4, D8, D15, D16; Redes y APIs). Where the plano is silent, this plan says so and asks; it does not invent.

---

## Scope

In this plan (the four steps Federico ordered, plus the mobile shell he required):

| Part | What | Plano pieces |
|---|---|---|
| A | Fix the 20 Biome diagnostics (14 errors, 6 warnings) and leave a real minimal test so `pnpm test:run` passes | — |
| B | Invite-only sign-in (Supabase Auth, 6-digit email code), session, guard, installable shell | Ingreso, Sesión y miembros, marcas, miembros |
| C | Brands and accounts; connect Federico's LinkedIn profile to «Estudio WAV Perfil» | Marcas y cuentas, Acciones de marcas y cuentas, cuentas, conexiones, bóveda de llaves, LinkedIn |
| D | Smoke script: one text post, then one PDF carousel on Federico's profile (phase 0 «Listo cuando») | LinkedIn: crearPost, subirDocumento, estadoDelDocumento |
| E | Web push: subscribe the installed app and send a test notice | Avisos push (VAPID) |

Not in this plan (next Phase 1 plans, in this order): B · ideas, puerta 1/puerta 2, huella and the state machine; C · publish with reservation, ventana de atraso, Vigilar conexiones, Publicar a mano, calendario; D · motor semanal, voz y línea editorial, clientes, tope de gasto. Production deploy to `postia.wearevision.cl` and a hosted Supabase project are also out: phase 0 runs fully on local Supabase (LinkedIn accepts an `http://localhost` redirect).

## Gates: stop and ask Federico

These are hard stops. The executor does not pass them on its own judgment.

1. **Before the initial commit** (Task 0). The repo has no commits yet.
2. **Before creating the GitHub repo** (Task 0). Always `--private` (global rule).
3. **Before anything real goes to LinkedIn** (Task 19). Federico runs the publish command himself in his own terminal and types `PUBLICAR`. The agent never pipes, fakes or automates that confirmation.
4. Before creating any paid or hosted resource (a hosted Supabase project, a Vercel project, a domain). Not needed in this plan.

## What Federico does by hand (no agent can or should)

- Add `http://localhost:3000/api/linkedin/callback` to **Authorized redirect URLs** in the «Estudio WAV Perfil» app (LinkedIn Developer Portal → Auth). Confirm its products are Share on LinkedIn + Sign In with LinkedIn using OpenID Connect.
- Paste `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` into `.env.local` himself. Keys never go into chat, code or screen (hard rule «Llaves fuera»).
- Generate VAPID keys (`pnpm dlx web-push generate-vapid-keys`) and paste them into `.env.local`.
- Click «Conectar LinkedIn» and accept the consent screen (Task 15 check).
- Write the text of the test post and the slides of the test carousel in his own voice (Task 19).
- Install the app on his iPhone and allow notices (Task 23 check). Note: an iPhone only reaches `localhost` through a tunnel or a deploy; if that is not available, the iPhone check moves to the deploy plan and this plan verifies push on desktop Chrome.

## File map

```
lib/dominio/falla.ts                 Falla (user-facing) and FallaDeConfiguracion (WAV-facing) errors
lib/env.ts                           exigirEnv(nombre, valor)
lib/supabase/{client,server,action}.ts  Supabase clients, typed, no non-null assertions
lib/supabase/admin.ts                service-role client (scripts and server only)
lib/supabase/database.ts             Db type alias
lib/supabase/database.types.ts       generated (pnpm db:types), ignored by Biome
lib/proveedores/bases.ts             baseDe: API base override for tests, refused in production
lib/sesion/rutas.ts                  route constants + destinoDe (proxy decision)
lib/sesion/sesion.ts                 leerSesion: anonima | sin_acceso | miembro
lib/ingreso/ingreso.ts               pedirCodigo, verificarCodigo (email typed by the person)
lib/equipo/invitar.ts                invitar: creates user + brand membership (service role)
lib/diseno/marca.ts                  the two colors the manifest and icons need (CSS tokens cannot reach them)
lib/marcas/estado-conexion.ts        estadoDeConexion(expiraEn, ahora)
lib/marcas/acciones.ts               crearMarca, agregarCuenta, desconectarCuenta (Zod-validated)
lib/linkedin/dominio.ts              aLittleText, esUrnDePost, enlaceDePost, tituloDelDocumento, limits
lib/linkedin/estado-oauth.ts         state value, cookie, pack/unpack with the account id
lib/linkedin/oauth.ts                authorization URL, code exchange, /v2/userinfo
lib/linkedin/conexion.ts             terminarConexionLinkedin (callback logic)
lib/linkedin/api.ts                  crearPost, subirDocumento, estadoDelDocumento (/rest, version 202610)
lib/fase0/pdf-de-prueba.ts           pdfDePrueba, repartir (test carousel)
lib/fase0/prueba-linkedin.ts         publicarPrueba (signed smoke orchestration)
lib/avisos/tipos.ts                  MensajePush, SuscripcionDelNavegador
lib/avisos/push.ts                   servicioPushVapid (web-push + fetch)
lib/avisos/dispositivo.ts            estadoDeAvisos
lib/avisos/navegador.ts              browser port (Notification, service worker, PushManager)
lib/avisos/acciones.ts               guardarSuscripcion, quitarSuscripcion, enviarAvisoDePrueba
proxy.ts                             Next 16 proxy: refresh session, send anonymous to /ingreso
app/layout.tsx                       es, viewport, apple web app meta
app/manifest.ts, app/icon.tsx, app/apple-icon.tsx
app/ingreso/{page.tsx,formulario-ingreso.tsx,acciones.ts}
app/salir/route.ts
app/(app)/layout.tsx                 guard + bottom navigation
app/(app)/page.tsx                   Inicio (placeholder until Plan B)
app/(app)/navegacion.tsx
app/(app)/marcas/{page.tsx,acciones.ts,formulario-marca.tsx,formulario-cuenta.tsx,estado-de-conexion.tsx}
app/(app)/ajustes/{page.tsx,acciones.ts,avisos-del-celular.tsx}
app/api/linkedin/{conectar,callback}/route.ts
public/sw.js                         push → notification, tap → open own route
scripts/invitar.ts, scripts/prueba-linkedin.ts, scripts/supabase-env.sh
supabase/config.toml, supabase/templates/codigo.html
supabase/migrations/20261028120000_marcas_y_miembros.sql
supabase/migrations/20261028120100_cuentas_y_conexiones.sql
supabase/migrations/20261028120200_suscripciones_push.sql
tests/setup.ts, tests/msw.ts
tests/unit/**                        Vitest + jsdom
tests/integration/**                 Vitest + local Supabase (pnpm test:db)
tests/e2e/**                         Playwright
vitest.integration.config.ts
.env.example
```

Naming: Spanish domain identifiers, English comments and commits, Spanish UI.

---

## Task 0: Gate — initial commit and GitHub repo

**Files:** none changed.

- [ ] **Step 1: Ask Federico** (stop and wait): «¿Hago el commit inicial con el scaffold de wnew tal como está (sin cambios), y creo el repo privado `postia` en GitHub con `gh repo create --private`?» Two separate yes/no answers.
- [x] **Step 2: If yes to the commit** (done on 2026-10-28, with the plano, the editorial data and this plan; the GitHub repo in Step 3 is still pending Federico's answer)

```bash
git add -A
git status --short   # confirm no .env* file is staged
git commit -m "chore: scaffold postia from create-wav-app"
```

- [ ] **Step 3: If yes to the repo** (the GitHub MCP failed to connect this session; use the CLI)

```bash
gh repo create postia --private --source=. --remote=origin --push
```

If either answer is no, keep working uncommitted and ask again at the end of Part A. Every later «Commit» step assumes Gate 1 was approved.

---

# Part A — Clean base

## Task 1: Required environment values without non-null assertions

Fixes 6 `lint/style/noNonNullAssertion` errors and gives `pnpm test:run` a real first test.

**Files:**
- Create: `lib/dominio/falla.ts`, `lib/env.ts`, `tests/unit/env.test.ts`
- Modify: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/action.ts`

- [ ] **Step 1: Write the failing test** `tests/unit/env.test.ts`

```ts
import { describe, expect, test } from "vitest"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { exigirEnv } from "@/lib/env"

describe("exigirEnv", () => {
  test("returns the trimmed value when the variable is set", () => {
    expect(exigirEnv("NEXT_PUBLIC_SUPABASE_URL", " http://127.0.0.1:54421 ")).toBe("http://127.0.0.1:54421")
  })

  test("throws a configuration error naming the variable when it is missing or blank", () => {
    expect(() => exigirEnv("SUPABASE_SERVICE_ROLE_KEY", undefined)).toThrow(FallaDeConfiguracion)
    expect(() => exigirEnv("SUPABASE_SERVICE_ROLE_KEY", "   ")).toThrow("SUPABASE_SERVICE_ROLE_KEY")
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `pnpm test:run tests/unit/env.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/dominio/falla"`.

- [ ] **Step 3: Implement** `lib/dominio/falla.ts`

```ts
/** Error whose message is written to be shown to the person as-is. */
export class Falla extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "Falla"
  }
}

/** Configuration error meant for WAV: callers log it and show the person a generic notice. */
export class FallaDeConfiguracion extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "FallaDeConfiguracion"
  }
}
```

`lib/env.ts`

```ts
import { FallaDeConfiguracion } from "@/lib/dominio/falla"

/**
 * A required environment value. The caller passes the value, not the name to look up, so `NEXT_PUBLIC_*` reads stay
 * literal (`process.env.NEXT_PUBLIC_X`) and Next can inline them into the browser bundle.
 */
export function exigirEnv(nombre: string, valor: string | undefined): string {
  const limpio = valor?.trim()
  if (!limpio) throw new FallaDeConfiguracion(`Falta la variable de entorno ${nombre}.`)
  return limpio
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `pnpm test:run tests/unit/env.test.ts` → Expected: 2 passed.

- [ ] **Step 5: Use it in the three Supabase clients.** `lib/supabase/client.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr"
import { exigirEnv } from "@/lib/env"

export function createClient() {
  return createBrowserClient(
    exigirEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    exigirEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  )
}
```

`lib/supabase/server.ts`:

```ts
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { exigirEnv } from "@/lib/env"

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    exigirEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    exigirEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // Server Components cannot write cookies: actions and route handlers use action.ts.
        },
      },
    },
  )
}
```

`lib/supabase/action.ts` (also fixes `useIterableCallbackReturn`: the `forEach` arrow returned a value):

```ts
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { exigirEnv } from "@/lib/env"

export async function createActionClient() {
  const cookieStore = await cookies()

  return createServerClient(
    exigirEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    exigirEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options)
        },
      },
    },
  )
}
```

- [ ] **Step 6: Run the suite** — `pnpm test:run` → Expected: 2 passed, exit 0.
- [ ] **Step 7: Commit**

```bash
git add lib/dominio/falla.ts lib/env.ts lib/supabase tests/unit/env.test.ts
git commit -m "fix: require Supabase env values instead of non-null assertions"
```

## Task 2: Biome clean, scoped Vitest, type check in CI

**Files:**
- Modify: `vitest.config.ts`, `package.json`, `biome.json`, `.github/workflows/ci.yml`, plus whatever `biome check --write` formats (`lib/animation/*.ts`, `lib/utils.ts`, `playwright.config.ts`, `tests/setup.ts`)

- [ ] **Step 1: See the remaining diagnostics** — `pnpm lint` → Expected: organizeImports ×4, format ×7, `useNodejsImportProtocol` ×1 (6 assertions and the forEach are gone after Task 1).
- [ ] **Step 2: Rewrite `vitest.config.ts`** so unit runs never pick up integration or Playwright files (the default glob also matches `*.spec.ts`):

```ts
import path from "node:path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
})
```

- [ ] **Step 3: Apply only Biome's safe fixes.** Never `--unsafe`: it once dropped `"use client"` from 21 files (hard-won lesson).

```bash
pnpm exec biome check --write
head -1 lib/animation/gsap.ts lib/animation/lenis.ts   # both must still print "use client"
```

- [ ] **Step 4: Ignore generated types in Biome.** In `biome.json` set `"includes": ["**", "!node_modules", "!.next", "!dist", "!build", "!lib/supabase/database.types.ts"]`.
- [ ] **Step 5: Add scripts** to `package.json`: `"type": "tsc --noEmit"`.
- [ ] **Step 6: Add the type check to CI.** In `.github/workflows/ci.yml`, job `build`, insert `- run: pnpm type` between `pnpm lint` and `pnpm build`.
- [ ] **Step 7: Verify everything**

```bash
pnpm lint      # Expected: "Checked N files ... No fixes applied." and exit 0, zero diagnostics
pnpm type      # Expected: exit 0
pnpm test:run  # Expected: 2 passed
pnpm build     # Expected: compiled successfully
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: clear the template's Biome diagnostics and type-check in CI"
```

---

# Part B — Invite-only sign-in and the mobile shell

## Task 3: Local Supabase, brands and memberships with RLS

**Files:**
- Create: `supabase/config.toml` (via CLI), `supabase/templates/codigo.html`, `supabase/migrations/20261028120000_marcas_y_miembros.sql`, `lib/supabase/database.ts`, `lib/supabase/admin.ts`, `vitest.integration.config.ts`, `tests/integration/entorno.ts`, `tests/integration/acceso.test.ts`, `scripts/supabase-env.sh`, `.env.example`
- Modify: `package.json`, `.gitignore`, the three clients in `lib/supabase/` (add `<Database>`)

- [ ] **Step 1: Init and isolate ports.** `supabase init` (answer no to editor settings). Conidolly's local stack uses 543xx, so PostIA moves to 544xx to run beside it. In `supabase/config.toml` set: `project_id = "postia"`; `[api] port = 54421`; `[db] port = 54422`, `shadow_port = 54420`; `[db.pooler] port = 54429`; `[studio] port = 54423`; `[inbucket] port = 54424` (Mailpit); `[analytics] port = 54427`. Then in `[auth]`:

```toml
site_url = "http://localhost:3000"
additional_redirect_urls = ["http://localhost:3000"]
# No public sign-up: people arrive by invitation (pnpm invitar), never by typing an address.
enable_signup = false
enable_anonymous_sign_ins = false
```

and in `[auth.email]` keep `otp_length = 6`, `otp_expiry = 3600`, `max_frequency = "1s"`, then add:

```toml
# Sign-in with a six-digit code: the magic-link email carries {{ .Token }}. A hosted project needs the same template in
# Authentication > Email templates.
[auth.email.template.magic_link]
subject = "Tu código para entrar a PostIA"
content_path = "./supabase/templates/codigo.html"
```

`supabase/templates/codigo.html`:

```html
<h2>Tu código para entrar a PostIA</h2>
<p style="font-size: 28px; font-weight: bold; letter-spacing: 6px">{{ .Token }}</p>
<p>Vence en 1 hora. Si no lo pediste tú, ignora este correo.</p>
```

- [ ] **Step 2: Scripts and env plumbing.** Add to `package.json` scripts:

```json
"db:start": "supabase start",
"db:reset": "supabase db reset",
"db:types": "supabase gen types typescript --local > lib/supabase/database.types.ts",
"test:db": "vitest run --config vitest.integration.config.ts",
"invitar": "tsx --env-file=.env.local scripts/invitar.ts",
"prueba:linkedin": "tsx --env-file=.env.local scripts/prueba-linkedin.ts"
```

Install: `pnpm add zod && pnpm add -D tsx msw`.

`scripts/supabase-env.sh` (prints the three local values; never writes over `.env.local`, which also holds LinkedIn keys):

```bash
#!/usr/bin/env bash
# Prints the local Supabase values PostIA needs, in .env format. Paste them into .env.local once.
set -euo pipefail
supabase status -o env | sed -n \
  -e 's/^API_URL=/NEXT_PUBLIC_SUPABASE_URL=/p' \
  -e 's/^ANON_KEY=/NEXT_PUBLIC_SUPABASE_ANON_KEY=/p' \
  -e 's/^SERVICE_ROLE_KEY=/SUPABASE_SERVICE_ROLE_KEY=/p'
```

`.env.example` (and add `!.env.example` to `.gitignore` under `.env*`):

```bash
# Local Supabase: bash scripts/supabase-env.sh
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
# LinkedIn app «Estudio WAV Perfil» (Share on LinkedIn + OpenID Connect). Federico pastes these himself.
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_REDIRECT_URI=http://localhost:3000/api/linkedin/callback
# Web push: pnpm dlx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:
```

- [ ] **Step 3: Integration harness.** `vitest.integration.config.ts`:

```ts
import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    // One database: files run one after another.
    fileParallelism: false,
    testTimeout: 20_000,
  },
  resolve: { alias: { "@": path.resolve(__dirname, "./") } },
})
```

`tests/integration/entorno.ts`:

```ts
import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import type { Db } from "@/lib/supabase/database"
import type { Database } from "@/lib/supabase/database.types"

interface Entorno {
  url: string
  anon: string
  servicio: string
}

let cache: Entorno | null = null

export function entornoLocal(): Entorno {
  if (cache) return cache
  const salida = execFileSync("supabase", ["status", "-o", "env"], { encoding: "utf8" })
  const valores = new Map(
    salida
      .split("\n")
      .map((linea) => /^([A-Z_]+)="?(.*?)"?$/.exec(linea.trim()))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => [m[1], m[2]] as const),
  )
  const url = valores.get("API_URL")
  const anon = valores.get("ANON_KEY")
  const servicio = valores.get("SERVICE_ROLE_KEY")
  if (!url || !anon || !servicio) throw new Error("Supabase local no está corriendo: pnpm db:start")
  cache = { url, anon, servicio }
  return cache
}

export function admin(): Db {
  const { url, servicio } = entornoLocal()
  return createClient<Database>(url, servicio, { auth: { persistSession: false, autoRefreshToken: false } })
}

export function correoUnico(prefijo: string): string {
  return `${prefijo}-${randomUUID().slice(0, 8)}@prueba.postia.test`
}

/** A real user with a session. Tests sign in with a password the app never offers: only the RLS is under test. */
export async function personaConSesion(prefijo: string): Promise<{ db: Db; userId: string }> {
  const correo = correoUnico(prefijo)
  const clave = `clave-${randomUUID()}`
  const { data, error } = await admin().auth.admin.createUser({ email: correo, password: clave, email_confirm: true })
  if (error) throw error
  const { url, anon } = entornoLocal()
  const db = createClient<Database>(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: errorDeIngreso } = await db.auth.signInWithPassword({ email: correo, password: clave })
  if (errorDeIngreso) throw errorDeIngreso
  return { db, userId: data.user.id }
}

export async function marcaConDueno(userId: string, voz: "yo" | "nosotros" = "yo"): Promise<string> {
  const { data, error } = await admin()
    .from("marcas")
    .insert({ nombre: `Marca ${randomUUID().slice(0, 8)}`, voz })
    .select("id")
    .single()
  if (error) throw error
  const { error: errorDeMiembro } = await admin().from("miembros").insert({ marca_id: data.id, user_id: userId })
  if (errorDeMiembro) throw errorDeMiembro
  return data.id
}
```

- [ ] **Step 4: Write the failing test** `tests/integration/acceso.test.ts`

```ts
import { describe, expect, test } from "vitest"
import { admin, marcaConDueno, personaConSesion } from "./entorno"

describe("brands and memberships", () => {
  test("a member sees only the brands they belong to", async () => {
    const ana = await personaConSesion("ana")
    const otra = await personaConSesion("otra")
    const suya = await marcaConDueno(ana.userId)
    await marcaConDueno(otra.userId)

    const { data, error } = await ana.db.from("marcas").select("id")
    expect(error).toBeNull()
    expect(data?.map((m) => m.id)).toEqual([suya])
  })

  test("a signed-in person without membership sees no brand and has no access", async () => {
    const nadie = await personaConSesion("nadie")
    const { data } = await nadie.db.from("marcas").select("id")
    expect(data).toEqual([])
    const { data: acceso } = await nadie.db.rpc("tiene_acceso")
    expect(acceso).toBe(false)
  })

  test("an owner creates a brand and becomes its owner; someone who owns nothing cannot", async () => {
    const dueno = await personaConSesion("dueno")
    await marcaConDueno(dueno.userId)
    const { data: id, error } = await dueno.db.rpc("crear_marca", { p_nombre: `Nueva ${Date.now()}`, p_voz: "nosotros" })
    expect(error).toBeNull()
    const { data: miembro } = await admin().from("miembros").select("rol").eq("marca_id", id as string).single()
    expect(miembro?.rol).toBe("dueno")

    const extrano = await personaConSesion("extrano")
    const { error: rechazo } = await extrano.db.rpc("crear_marca", { p_nombre: "No", p_voz: "yo" })
    expect(rechazo?.code).toBe("42501")
  })

  test("nobody signed in reads anything", async () => {
    const { createClient } = await import("@supabase/supabase-js")
    const { entornoLocal } = await import("./entorno")
    const anonimo = createClient(entornoLocal().url, entornoLocal().anon)
    const { data, error } = await anonimo.from("marcas").select("id")
    expect(data ?? []).toEqual([])
    expect(error === null || error.code === "42501").toBe(true)
  })
})
```

- [ ] **Step 5: Run it and see it fail** — `pnpm db:start && pnpm test:db` → Expected: FAIL, `relation "public.marcas" does not exist` (and type import errors until Step 7).
- [ ] **Step 6: Write the migration** `supabase/migrations/20261028120000_marcas_y_miembros.sql`

```sql
-- Brands and who belongs to each one. Every later table is scoped by brand through es_miembro / es_dueno.
create table public.marcas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (length(btrim(nombre)) between 1 and 80),
  -- «Cada marca con su voz»: WAV speaks as «nosotros», Federico as «yo».
  voz text not null check (voz in ('yo', 'nosotros')),
  creada_en timestamptz not null default now()
);

-- Phase 1 (D4): only owners. Approvers and editors arrive in phase 2 by widening this check.
create table public.miembros (
  marca_id uuid not null references public.marcas (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rol text not null default 'dueno' check (rol = 'dueno'),
  creado_en timestamptz not null default now(),
  primary key (marca_id, user_id)
);

create function public.es_miembro(p_marca uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.miembros where marca_id = p_marca and user_id = auth.uid())
$$;

create function public.es_dueno(p_marca uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.miembros where marca_id = p_marca and user_id = auth.uid() and rol = 'dueno')
$$;

-- An invited person with no brand left signs out: the app has nothing to show them.
create function public.tiene_acceso() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.miembros where user_id = auth.uid())
$$;

create function public.crear_marca(p_nombre text, p_voz text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  -- Phase 1: whoever owns a brand can open another. Roles arrive in phase 2.
  if not exists (select 1 from public.miembros where user_id = auth.uid() and rol = 'dueno') then
    raise exception using errcode = '42501', message = 'solo_un_dueno_crea_marcas';
  end if;
  insert into public.marcas (nombre, voz) values (btrim(p_nombre), p_voz) returning id into v_id;
  insert into public.miembros (marca_id, user_id, rol) values (v_id, auth.uid(), 'dueno');
  return v_id;
end $$;

alter table public.marcas enable row level security;
alter table public.miembros enable row level security;

create policy "miembros ven sus marcas" on public.marcas for select to authenticated using (public.es_miembro(id));
create policy "cada persona ve sus membresias" on public.miembros for select to authenticated
  using (user_id = auth.uid());

revoke all on public.marcas, public.miembros from anon, authenticated;
grant select on public.marcas, public.miembros to authenticated;

revoke execute on function public.es_miembro(uuid), public.es_dueno(uuid), public.tiene_acceso(),
  public.crear_marca(text, text) from public, anon;
grant execute on function public.es_miembro(uuid), public.es_dueno(uuid), public.tiene_acceso(),
  public.crear_marca(text, text) to authenticated;
```

- [ ] **Step 7: Types and typed clients.**

```bash
pnpm db:reset && pnpm db:types
```

`lib/supabase/database.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"

export type Db = SupabaseClient<Database>
```

`lib/supabase/admin.ts`:

```ts
import { createClient } from "@supabase/supabase-js"
import { exigirEnv } from "@/lib/env"
import type { Db } from "./database"
import type { Database } from "./database.types"

/** Service role: bypasses RLS. Only scripts and server code import this; never a client component. */
export function createAdminClient(): Db {
  return createClient<Database>(
    exigirEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    exigirEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
```

In `client.ts`, `server.ts` and `action.ts`, change `createBrowserClient(` / `createServerClient(` to `createBrowserClient<Database>(` / `createServerClient<Database>(` and add `import type { Database } from "./database.types"`.

- [ ] **Step 8: Run and see it pass** — `pnpm test:db` → 4 passed. `pnpm type` → exit 0.
- [ ] **Step 9: Add the database job to CI** (`.github/workflows/ci.yml`):

```yaml
  db:
    name: Database (RLS) Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 11
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: pnpm install --frozen-lockfile
      - run: supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor
      - run: pnpm test:db
```

- [ ] **Step 10: Commit**

```bash
git add supabase lib/supabase vitest.integration.config.ts tests/integration scripts/supabase-env.sh .env.example .gitignore package.json pnpm-lock.yaml .github
git commit -m "feat: add brands and owner memberships with RLS on local Supabase"
```

## Task 4: Sign-in logic (6-digit email code, invited only)

Written new (reference: Conidolly `lib/acciones/ingreso.ts`). The person types the address (many members, not one fixed email), and an address with no user gets the same answer as an invited one, so nobody can probe who is invited.

**Files:** Create `lib/ingreso/ingreso.ts`, `tests/unit/ingreso.test.ts`

- [ ] **Step 1: Write the failing test** `tests/unit/ingreso.test.ts`

```ts
import { describe, expect, test, vi } from "vitest"
import { type AuthDeIngreso, pedirCodigo, verificarCodigo } from "@/lib/ingreso/ingreso"

function auth(respuestas: Partial<Record<"otp" | "verificar", { message: string; status?: number; code?: string }>>) {
  return {
    signInWithOtp: vi.fn(async () => ({ error: respuestas.otp ?? null })),
    verifyOtp: vi.fn(async () => ({ error: respuestas.verificar ?? null })),
  } satisfies AuthDeIngreso
}

describe("pedirCodigo", () => {
  test("asks Supabase for a code without ever creating a user, with the address normalized", async () => {
    const fake = auth({})
    expect(await pedirCodigo({ auth: fake }, "  Federico@WAV.cl ")).toEqual({ ok: true })
    expect(fake.signInWithOtp).toHaveBeenCalledWith({ email: "federico@wav.cl", options: { shouldCreateUser: false } })
  })

  test("answers as if the code was sent when the address has no user", async () => {
    const fake = auth({ otp: { message: "Signups not allowed for otp", status: 422, code: "otp_disabled" } })
    expect(await pedirCodigo({ auth: fake }, "nadie@prueba.cl")).toEqual({ ok: true })
  })

  test("rejects a malformed address without calling Supabase", async () => {
    const fake = auth({})
    expect(await pedirCodigo({ auth: fake }, "sin-arroba")).toEqual({ ok: false, error: "Revisa tu correo: le falta algo." })
    expect(fake.signInWithOtp).not.toHaveBeenCalled()
  })

  test("tells how long to wait when rate limited", async () => {
    const fake = auth({ otp: { message: "you can only request this after 42 seconds", status: 429 } })
    expect(await pedirCodigo({ auth: fake }, "a@b.cl")).toEqual({ ok: false, error: "Espera 42 segundos para pedir otro código." })
  })
})

describe("verificarCodigo", () => {
  test("accepts exactly six digits and verifies them as an email code", async () => {
    const fake = auth({})
    expect(await verificarCodigo({ auth: fake }, "a@b.cl", " 123456 ")).toEqual({ ok: true })
    expect(fake.verifyOtp).toHaveBeenCalledWith({ email: "a@b.cl", token: "123456", type: "email" })
  })

  test("refuses anything that is not six digits without calling Supabase", async () => {
    const fake = auth({})
    expect(await verificarCodigo({ auth: fake }, "a@b.cl", "12345")).toEqual({ ok: false, error: "El código tiene seis números." })
    expect(fake.verifyOtp).not.toHaveBeenCalled()
  })

  test("says the code expired when Supabase rejects it", async () => {
    const fake = auth({ verificar: { message: "Token has expired or is invalid", status: 403, code: "otp_expired" } })
    expect(await verificarCodigo({ auth: fake }, "a@b.cl", "123456")).toEqual({
      ok: false,
      error: "Ese código no sirve o ya venció. Pide otro.",
    })
  })
})
```

- [ ] **Step 2: Run and see it fail** — `pnpm test:run tests/unit/ingreso.test.ts` → FAIL, module not found.
- [ ] **Step 3: Implement** `lib/ingreso/ingreso.ts`

```ts
import type { AuthError } from "@supabase/supabase-js"

type ErrorDeAuth = Pick<AuthError, "message" | "status" | "code">
type Respuesta = { error: ErrorDeAuth | null }

/** The two Supabase Auth calls sign-in needs; a test passes a fake. */
export interface AuthDeIngreso {
  signInWithOtp(args: { email: string; options: { shouldCreateUser: false } }): PromiseLike<Respuesta>
  verifyOtp(args: { email: string; token: string; type: "email" }): PromiseLike<Respuesta>
}

export interface DepsIngreso {
  auth: AuthDeIngreso
}

export type ResultadoIngreso = { ok: true } | { ok: false; error: string }

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// What Supabase answers for an address without a user. The screen answers as if there was one: who is invited is not
// something a stranger can find out by trying addresses.
const SIN_USUARIO = new Set(["otp_disabled", "signup_disabled", "user_not_found"])

const estaLimitado = (error: ErrorDeAuth) =>
  error.status === 429 || error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit"

function esperaDelError(mensaje: string): string | null {
  const segundos = /(\d+)\s*seconds?/i.exec(mensaje)?.[1]
  return segundos ? `${segundos} segundos` : null
}

export function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase()
}

export async function pedirCodigo(deps: DepsIngreso, correo: string): Promise<ResultadoIngreso> {
  const email = normalizarCorreo(correo)
  if (!CORREO.test(email)) return { ok: false, error: "Revisa tu correo: le falta algo." }
  const { error } = await deps.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
  if (!error || (error.code !== undefined && SIN_USUARIO.has(error.code))) return { ok: true }
  if (estaLimitado(error)) {
    const espera = esperaDelError(error.message)
    return { ok: false, error: espera ? `Espera ${espera} para pedir otro código.` : "Espera un momento para pedir otro código." }
  }
  console.error("No pude mandar el código de ingreso", error)
  return { ok: false, error: "No pude mandar el código. Inténtalo de nuevo en un rato." }
}

export async function verificarCodigo(deps: DepsIngreso, correo: string, codigo: string): Promise<ResultadoIngreso> {
  const token = codigo.trim()
  if (!/^\d{6}$/.test(token)) return { ok: false, error: "El código tiene seis números." }
  const { error } = await deps.auth.verifyOtp({ email: normalizarCorreo(correo), token, type: "email" })
  if (!error) return { ok: true }
  if (estaLimitado(error)) return { ok: false, error: "Demasiados intentos. Espera un momento y pide otro código." }
  if (error.code === "otp_expired" || error.status === 403 || error.status === 400) {
    return { ok: false, error: "Ese código no sirve o ya venció. Pide otro." }
  }
  console.error("No pude verificar el código de ingreso", error)
  return { ok: false, error: "No pude revisar el código. Inténtalo de nuevo en un rato." }
}
```

- [ ] **Step 4: Run and see it pass** → 7 passed.
- [ ] **Step 5: Commit** — `git add lib/ingreso tests/unit/ingreso.test.ts && git commit -m "feat: add invite-only email code sign-in logic"`

## Task 5: Session and route decisions

**Files:** Create `lib/sesion/rutas.ts`, `lib/sesion/sesion.ts`, `tests/unit/rutas.test.ts`, `tests/integration/sesion.test.ts`

- [ ] **Step 1: Write the failing unit test** `tests/unit/rutas.test.ts`

```ts
import { describe, expect, test } from "vitest"
import { destinoDe } from "@/lib/sesion/rutas"

describe("destinoDe", () => {
  test("sends someone without a session to sign-in from any app route", () => {
    expect(destinoDe("/", false)).toBe("/ingreso")
    expect(destinoDe("/marcas", false)).toBe("/ingreso")
    expect(destinoDe("/api/linkedin/callback", false)).toBe("/ingreso")
  })

  test("lets someone without a session see sign-in", () => {
    expect(destinoDe("/ingreso", false)).toBeNull()
  })

  test("sends someone already signed in away from sign-in", () => {
    expect(destinoDe("/ingreso", true)).toBe("/")
    expect(destinoDe("/marcas", true)).toBeNull()
  })
})
```

- [ ] **Step 2: Run and fail** — `pnpm test:run tests/unit/rutas.test.ts`.
- [ ] **Step 3: Implement** `lib/sesion/rutas.ts`

```ts
export const RUTA_DE_INICIO = "/"
export const RUTA_DE_INGRESO = "/ingreso"
export const RUTA_DE_SALIR = "/salir"
export const RUTA_DE_MARCAS = "/marcas"
export const RUTA_DE_AJUSTES = "/ajustes"

const PUBLICAS = new Set([RUTA_DE_INGRESO])

/** Where the proxy redirects a request, or null to let it through. Brand access is checked by the app layout. */
export function destinoDe(ruta: string, conSesion: boolean): string | null {
  if (!conSesion) return PUBLICAS.has(ruta) ? null : RUTA_DE_INGRESO
  return ruta === RUTA_DE_INGRESO ? RUTA_DE_INICIO : null
}
```

- [ ] **Step 4: Pass** → 3 passed.
- [ ] **Step 5: Write the failing integration test** `tests/integration/sesion.test.ts`

```ts
import { createClient } from "@supabase/supabase-js"
import { describe, expect, test } from "vitest"
import { leerSesion } from "@/lib/sesion/sesion"
import type { Database } from "@/lib/supabase/database.types"
import { entornoLocal, marcaConDueno, personaConSesion } from "./entorno"

describe("leerSesion", () => {
  test("is anonymous without a session", async () => {
    const db = createClient<Database>(entornoLocal().url, entornoLocal().anon, { auth: { persistSession: false } })
    expect(await leerSesion(db)).toEqual({ estado: "anonima" })
  })

  test("has no access when the person belongs to no brand", async () => {
    const { db, userId } = await personaConSesion("sin-marca")
    expect(await leerSesion(db)).toEqual({ estado: "sin_acceso", userId })
  })

  test("lists the brands of a member", async () => {
    const { db, userId } = await personaConSesion("miembro")
    const marca = await marcaConDueno(userId)
    const sesion = await leerSesion(db)
    expect(sesion.estado).toBe("miembro")
    if (sesion.estado === "miembro") expect(sesion.marcas.map((m) => m.id)).toEqual([marca])
  })
})
```

- [ ] **Step 6: Fail** — `pnpm test:db tests/integration/sesion.test.ts`.
- [ ] **Step 7: Implement** `lib/sesion/sesion.ts`

```ts
import type { Db } from "@/lib/supabase/database"

export interface MarcaVisible {
  id: string
  nombre: string
  rol: string
}

export type Sesion =
  | { estado: "anonima" }
  | { estado: "sin_acceso"; userId: string }
  | { estado: "miembro"; userId: string; correo: string; marcas: MarcaVisible[] }

export async function leerSesion(db: Db): Promise<Sesion> {
  const { data, error } = await db.auth.getUser()
  // No session or an invalid one is simply anonymous; an outage of Auth must not look like a sign-out.
  if (error && (error.status ?? 0) >= 500) throw new Error(`Supabase Auth no respondió: ${error.message}`, { cause: error })
  const usuario = data.user
  if (!usuario) return { estado: "anonima" }

  const { data: filas, error: errorDeMarcas } = await db
    .from("miembros")
    .select("rol, marcas(id, nombre)")
    .eq("user_id", usuario.id)
    .order("creado_en")
  if (errorDeMarcas) throw new Error(`No pude leer las marcas de la sesión: ${errorDeMarcas.message}`, { cause: errorDeMarcas })

  const marcas = filas.flatMap((fila) => (fila.marcas ? [{ id: fila.marcas.id, nombre: fila.marcas.nombre, rol: fila.rol }] : []))
  if (marcas.length === 0) return { estado: "sin_acceso", userId: usuario.id }
  return { estado: "miembro", userId: usuario.id, correo: usuario.email ?? "", marcas }
}
```

- [ ] **Step 8: Pass** — `pnpm test:db` → all passed.
- [ ] **Step 9: Commit** — `git add lib/sesion tests && git commit -m "feat: read the session with its visible brands"`

## Task 6: Proxy, sign-out and the guarded app layout

**Files:** Create `proxy.ts`, `app/salir/route.ts`, `app/(app)/layout.tsx`, `app/(app)/navegacion.tsx`, `app/(app)/page.tsx`. Delete `app/page.tsx`.

Note: Next 16 renamed `middleware.ts` to `proxy.ts` with an exported `proxy` function. Confirm in `node_modules/next/dist/docs` (or the Next 16 upgrade guide) before writing; if the build warns about the file name, follow the installed version.

- [ ] **Step 1: `proxy.ts`** (wiring only; its decision is `destinoDe`, tested in Task 5)

```ts
import { createServerClient } from "@supabase/ssr"
import { type NextRequest, NextResponse } from "next/server"
import { exigirEnv } from "@/lib/env"
import { destinoDe } from "@/lib/sesion/rutas"
import type { Database } from "@/lib/supabase/database.types"

/** Refreshes the Supabase session cookie on every request and sends anyone without a session to sign-in. */
export async function proxy(request: NextRequest) {
  let respuesta = NextResponse.next({ request })
  const supabase = createServerClient<Database>(
    exigirEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    exigirEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
          respuesta = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) respuesta.cookies.set(name, value, options)
        },
      },
    },
  )
  // getUser (not getSession): it asks Auth, so a forged cookie does not count as a session.
  const { data } = await supabase.auth.getUser()
  const destino = destinoDe(request.nextUrl.pathname, data.user !== null)
  if (!destino) return respuesta
  const url = request.nextUrl.clone()
  url.pathname = destino
  url.search = ""
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icon|apple-icon).*)"],
}
```

- [ ] **Step 2: `app/salir/route.ts`**

```ts
import { type NextRequest, NextResponse } from "next/server"
import { RUTA_DE_INGRESO } from "@/lib/sesion/rutas"
import { createActionClient } from "@/lib/supabase/action"

export async function GET(request: NextRequest) {
  const db = await createActionClient()
  const { error } = await db.auth.signOut()
  // The cookie is cleared locally either way; the log tells WAV the server-side revoke failed.
  if (error) console.error("No pude cerrar la sesión en Supabase", error)
  const motivo = request.nextUrl.searchParams.get("motivo") === "sin_acceso" ? "?motivo=sin_acceso" : ""
  return NextResponse.redirect(new URL(`${RUTA_DE_INGRESO}${motivo}`, request.url), 303)
}
```

- [ ] **Step 3: `app/(app)/layout.tsx`**

```tsx
import { redirect } from "next/navigation"
import { leerSesion } from "@/lib/sesion/sesion"
import { RUTA_DE_INGRESO, RUTA_DE_SALIR } from "@/lib/sesion/rutas"
import { createClient } from "@/lib/supabase/server"
import { Navegacion } from "./navegacion"

export default async function LayoutDeLaApp({ children }: { children: React.ReactNode }) {
  const sesion = await leerSesion(await createClient())
  if (sesion.estado === "anonima") redirect(RUTA_DE_INGRESO)
  if (sesion.estado === "sin_acceso") redirect(`${RUTA_DE_SALIR}?motivo=sin_acceso`)
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex-1 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-28">{children}</main>
      <Navegacion />
    </div>
  )
}
```

`app/(app)/navegacion.tsx` (bottom bar: thumb reach on the phone):

```tsx
import Link from "next/link"
import { RUTA_DE_AJUSTES, RUTA_DE_INICIO, RUTA_DE_MARCAS } from "@/lib/sesion/rutas"

const ENLACES = [
  { href: RUTA_DE_INICIO, texto: "Inicio" },
  { href: RUTA_DE_MARCAS, texto: "Marcas" },
  { href: RUTA_DE_AJUSTES, texto: "Ajustes" },
]

export function Navegacion() {
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 border-t border-borde bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-md justify-around">
        {ENLACES.map((enlace) => (
          <li key={enlace.href}>
            <Link href={enlace.href} className="block min-h-11 px-6 py-3 text-sm font-medium">
              {enlace.texto}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
```

`app/(app)/page.tsx`:

```tsx
import { leerSesion } from "@/lib/sesion/sesion"
import { createClient } from "@/lib/supabase/server"

export default async function Inicio() {
  const sesion = await leerSesion(await createClient())
  const marcas = sesion.estado === "miembro" ? sesion.marcas : []
  return (
    <section className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold">Inicio</h1>
      <p className="text-apagado">Aquí vas a firmar lo que sale. Por ahora, tus marcas:</p>
      <ul className="space-y-2">
        {marcas.map((marca) => (
          <li key={marca.id} className="rounded-lg border border-borde p-3">
            {marca.nombre}
          </li>
        ))}
      </ul>
    </section>
  )
}
```

- [ ] **Step 4: Design tokens.** Add to `app/globals.css` (hex is allowed in token definitions, never in components): under `:root` add `--apagado: #6b6b6b; --borde: #e5e5e5; --primario: #171717; --primario-texto: #ffffff; --peligro: #b42318;` and the dark-mode equivalents `--apagado: #a3a3a3; --borde: #262626; --primario: #ededed; --primario-texto: #0a0a0a; --peligro: #f97066;`; in `@theme inline` map `--color-apagado: var(--apagado); --color-borde: var(--borde); --color-primario: var(--primario); --color-primario-texto: var(--primario-texto); --color-peligro: var(--peligro);`.
- [ ] **Step 5: Verify** — `rm app/page.tsx && pnpm type && pnpm lint && pnpm build` → all exit 0. `pnpm dev`, open `http://localhost:3000/` → redirected to `/ingreso` (404 until Task 7 is fine).
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: guard the app behind a session with a mobile bottom bar"`

## Task 7: Sign-in screen and installable shell

**Files:** Create `app/ingreso/page.tsx`, `app/ingreso/formulario-ingreso.tsx`, `app/ingreso/acciones.ts`, `lib/diseno/marca.ts`, `app/manifest.ts`, `app/icon.tsx`, `app/apple-icon.tsx`, `tests/unit/formulario-ingreso.test.tsx`, `tests/unit/manifest.test.ts`. Modify `app/layout.tsx`.

- [ ] **Step 1: Failing component test** `tests/unit/formulario-ingreso.test.tsx`

```tsx
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { FormularioIngreso } from "@/app/ingreso/formulario-ingreso"

describe("FormularioIngreso", () => {
  test("asks for the code after sending the address, with the same answer for everyone", async () => {
    const pedirCodigo = vi.fn(async () => ({ ok: true as const }))
    render(<FormularioIngreso pedirCodigo={pedirCodigo} verificarCodigo={vi.fn()} />)
    fireEvent.change(screen.getByLabelText("Tu correo"), { target: { value: "federico@wav.cl" } })
    fireEvent.click(screen.getByRole("button", { name: "Mandar código" }))
    expect(await screen.findByText(/Si tu correo está invitado, te llegó un código de 6 números/)).toBeInTheDocument()
    expect(pedirCodigo).toHaveBeenCalledWith("federico@wav.cl")
    expect(screen.getByLabelText("Código de 6 números")).toHaveAttribute("inputmode", "numeric")
  })

  test("shows the error as an alert and stays on the address step", async () => {
    const pedirCodigo = vi.fn(async () => ({ ok: false as const, error: "Revisa tu correo: le falta algo." }))
    render(<FormularioIngreso pedirCodigo={pedirCodigo} verificarCodigo={vi.fn()} />)
    fireEvent.change(screen.getByLabelText("Tu correo"), { target: { value: "x" } })
    fireEvent.click(screen.getByRole("button", { name: "Mandar código" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Revisa tu correo: le falta algo.")
    expect(screen.getByLabelText("Tu correo")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Fail** — `pnpm test:run tests/unit/formulario-ingreso.test.tsx`.
- [ ] **Step 3: Implement** `app/ingreso/formulario-ingreso.tsx`

```tsx
"use client"

import { useState, useTransition } from "react"
import type { ResultadoIngreso } from "@/lib/ingreso/ingreso"

interface Props {
  pedirCodigo: (correo: string) => Promise<ResultadoIngreso>
  verificarCodigo: (correo: string, codigo: string) => Promise<ResultadoIngreso>
  aviso?: string
}

const CAMPO = "w-full rounded-lg border border-borde bg-background px-4 py-3 text-base"
const BOTON = "w-full min-h-11 rounded-lg bg-primario px-4 py-3 font-medium text-primario-texto disabled:opacity-60"

export function FormularioIngreso({ pedirCodigo, verificarCodigo, aviso }: Props) {
  const [paso, setPaso] = useState<"correo" | "codigo">("correo")
  const [correo, setCorreo] = useState("")
  const [codigo, setCodigo] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()

  function mandarCorreo(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    iniciar(async () => {
      const resultado = await pedirCodigo(correo)
      if (!resultado.ok) return setError(resultado.error)
      setError(null)
      setPaso("codigo")
    })
  }

  function mandarCodigo(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    iniciar(async () => {
      // On success the server action redirects to Inicio.
      const resultado = await verificarCodigo(correo, codigo)
      if (!resultado.ok) setError(resultado.error)
    })
  }

  return (
    <div className="space-y-4">
      {aviso && <p className="rounded-lg border border-borde p-3 text-sm">{aviso}</p>}
      {paso === "correo" ? (
        <form onSubmit={mandarCorreo} className="space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Tu correo</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              className={CAMPO}
            />
          </label>
          <button type="submit" disabled={pendiente} className={BOTON}>
            Mandar código
          </button>
        </form>
      ) : (
        <form onSubmit={mandarCodigo} className="space-y-3">
          <p className="text-sm">Si tu correo está invitado, te llegó un código de 6 números.</p>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Código de 6 números</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              className={`${CAMPO} tracking-[0.4em]`}
            />
          </label>
          <button type="submit" disabled={pendiente} className={BOTON}>
            Entrar
          </button>
          <button type="button" onClick={() => setPaso("correo")} className="w-full min-h-11 text-sm text-apagado">
            Usar otro correo
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-peligro">
          {error}
        </p>
      )}
    </div>
  )
}
```

`app/ingreso/acciones.ts`:

```ts
"use server"

import { redirect } from "next/navigation"
import { pedirCodigo, type ResultadoIngreso, verificarCodigo } from "@/lib/ingreso/ingreso"
import { RUTA_DE_INICIO } from "@/lib/sesion/rutas"
import { createActionClient } from "@/lib/supabase/action"

export async function pedirCodigoAccion(correo: string): Promise<ResultadoIngreso> {
  const db = await createActionClient()
  return pedirCodigo({ auth: db.auth }, correo)
}

export async function verificarCodigoAccion(correo: string, codigo: string): Promise<ResultadoIngreso> {
  const db = await createActionClient()
  const resultado = await verificarCodigo({ auth: db.auth }, correo, codigo)
  if (resultado.ok) redirect(RUTA_DE_INICIO)
  return resultado
}
```

`app/ingreso/page.tsx`:

```tsx
import { pedirCodigoAccion, verificarCodigoAccion } from "./acciones"
import { FormularioIngreso } from "./formulario-ingreso"

const AVISOS: Record<string, string> = {
  sin_acceso: "Tu correo no tiene marcas asignadas. Pídele acceso a Federico.",
}

export default async function Ingreso({ searchParams }: { searchParams: Promise<{ motivo?: string }> }) {
  const { motivo } = await searchParams
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-[max(2rem,env(safe-area-inset-top))]">
      <h1 className="mb-6 text-3xl font-semibold">PostIA</h1>
      <FormularioIngreso
        pedirCodigo={pedirCodigoAccion}
        verificarCodigo={verificarCodigoAccion}
        aviso={motivo ? AVISOS[motivo] : undefined}
      />
    </main>
  )
}
```

- [ ] **Step 4: Pass** → 2 passed.
- [ ] **Step 5: Failing manifest test** `tests/unit/manifest.test.ts`

```ts
import { describe, expect, test } from "vitest"
import manifest from "@/app/manifest"

describe("manifest", () => {
  test("opens standalone from the home screen at Inicio, with a 512 px icon", () => {
    const m = manifest()
    expect(m.display).toBe("standalone")
    expect(m.start_url).toBe("/")
    expect(m.name).toBe("PostIA")
    expect(m.icons?.some((icono) => icono.sizes === "512x512")).toBe(true)
  })
})
```

- [ ] **Step 6: Fail**, then implement. `lib/diseno/marca.ts`:

```ts
// The manifest and the generated icons are rendered outside the page, where CSS tokens do not exist. These mirror
// --background and --foreground in app/globals.css; change both together. WAV's brand colors replace them later.
export const COLOR_DE_FONDO = "#ffffff"
export const COLOR_DEL_TEXTO = "#171717"
```

`app/manifest.ts`:

```ts
import type { MetadataRoute } from "next"
import { COLOR_DE_FONDO } from "@/lib/diseno/marca"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PostIA",
    short_name: "PostIA",
    description: "Publica en LinkedIn e Instagram con tu firma antes de cada publicación.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "es-CL",
    background_color: COLOR_DE_FONDO,
    theme_color: COLOR_DE_FONDO,
    icons: [{ src: "/icon", sizes: "512x512", type: "image/png" }],
  }
}
```

`app/icon.tsx`:

```tsx
import { ImageResponse } from "next/og"
import { COLOR_DE_FONDO, COLOR_DEL_TEXTO } from "@/lib/diseno/marca"

export const size = { width: 512, height: 512 }
export const contentType = "image/png"

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: COLOR_DE_FONDO,
        color: COLOR_DEL_TEXTO,
        fontSize: 280,
        fontWeight: 700,
      }}
    >
      P
    </div>,
    size,
  )
}
```

`app/apple-icon.tsx`: same body with `export const size = { width: 180, height: 180 }`, `fontSize: 100`, function name `AppleIcon`.

`app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { COLOR_DE_FONDO } from "@/lib/diseno/marca"
import "./globals.css"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  title: "PostIA",
  description: "Publica en LinkedIn e Instagram con tu firma antes de cada publicación.",
  applicationName: "PostIA",
  appleWebApp: { capable: true, title: "PostIA", statusBarStyle: "default" },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: COLOR_DE_FONDO,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  )
}
```

- [ ] **Step 7: Pass and verify** — `pnpm test:run && pnpm type && pnpm lint && pnpm build`. Then `pnpm dev`, open `/ingreso` at 390 px wide: form fits without horizontal scroll; `/manifest.webmanifest` and `/icon` respond 200.
- [ ] **Step 8: Commit** — `git add -A && git commit -m "feat: add the sign-in screen and the installable app shell"`

## Task 8: Invitations

**Files:** Create `lib/equipo/invitar.ts`, `scripts/invitar.ts`, `tests/integration/invitar.test.ts`

- [ ] **Step 1: Failing test** `tests/integration/invitar.test.ts`

```ts
import { describe, expect, test } from "vitest"
import { invitar } from "@/lib/equipo/invitar"
import { admin, correoUnico } from "./entorno"

describe("invitar", () => {
  test("creates the user and makes them owner of the brand, creating the brand if needed", async () => {
    const correo = correoUnico("invitada")
    const marca = `Marca ${Date.now()}`
    const { userId, marcaId } = await invitar(admin(), { correo, marca, voz: "yo" })
    const { data } = await admin().from("miembros").select("rol").eq("user_id", userId).eq("marca_id", marcaId).single()
    expect(data?.rol).toBe("dueno")
  })

  test("is idempotent: inviting twice keeps one user and one membership", async () => {
    const correo = correoUnico("dos-veces")
    const marca = `Marca ${Date.now()}`
    const primera = await invitar(admin(), { correo, marca, voz: "nosotros" })
    const segunda = await invitar(admin(), { correo: correo.toUpperCase(), marca, voz: "nosotros" })
    expect(segunda).toEqual(primera)
    const { count } = await admin().from("miembros").select("*", { count: "exact", head: true }).eq("user_id", primera.userId)
    expect(count).toBe(1)
  })
})
```

- [ ] **Step 2: Fail** — `pnpm test:db tests/integration/invitar.test.ts`.
- [ ] **Step 3: Implement** `lib/equipo/invitar.ts`

```ts
import type { Db } from "@/lib/supabase/database"

export interface Invitacion {
  correo: string
  marca: string
  voz: "yo" | "nosotros"
}

/** Service role only. Sign-up is closed (config.toml), so this is the one door into the app. */
export async function invitar(db: Db, invitacion: Invitacion): Promise<{ userId: string; marcaId: string }> {
  const correo = invitacion.correo.trim().toLowerCase()
  const marcaId = await marcaPorNombre(db, invitacion.marca.trim(), invitacion.voz)
  const userId = await usuarioPorCorreo(db, correo)
  const { error } = await db
    .from("miembros")
    .upsert({ marca_id: marcaId, user_id: userId, rol: "dueno" }, { onConflict: "marca_id,user_id", ignoreDuplicates: true })
  if (error) throw new Error(`No pude dar acceso a ${correo}: ${error.message}`, { cause: error })
  return { userId, marcaId }
}

async function marcaPorNombre(db: Db, nombre: string, voz: Invitacion["voz"]): Promise<string> {
  const { data, error } = await db.from("marcas").select("id").eq("nombre", nombre).maybeSingle()
  if (error) throw new Error(`No pude buscar la marca ${nombre}: ${error.message}`, { cause: error })
  if (data) return data.id
  const { data: nueva, error: errorAlCrear } = await db.from("marcas").insert({ nombre, voz }).select("id").single()
  if (errorAlCrear) throw new Error(`No pude crear la marca ${nombre}: ${errorAlCrear.message}`, { cause: errorAlCrear })
  return nueva.id
}

async function usuarioPorCorreo(db: Db, correo: string): Promise<string> {
  const { data, error } = await db.auth.admin.createUser({ email: correo, email_confirm: true })
  if (!error) return data.user.id
  if (error.code !== "email_exists") throw new Error(`No pude crear a ${correo}: ${error.message}`, { cause: error })
  // The admin API has no lookup by email; the team is a handful of people, so one page holds everyone.
  const { data: lista, error: errorDeLista } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (errorDeLista) throw new Error(`No pude listar usuarios: ${errorDeLista.message}`, { cause: errorDeLista })
  const usuario = lista.users.find((u) => u.email?.toLowerCase() === correo)
  if (!usuario) throw new Error(`Supabase dice que ${correo} existe, pero no aparece en la lista.`)
  return usuario.id
}
```

`scripts/invitar.ts`:

```ts
import { parseArgs } from "node:util"
import { invitar } from "@/lib/equipo/invitar"
import { createAdminClient } from "@/lib/supabase/admin"

async function main() {
  const { values } = parseArgs({
    options: { correo: { type: "string" }, marca: { type: "string" }, voz: { type: "string" } },
  })
  const { correo, marca, voz } = values
  if (!correo || !marca || (voz !== "yo" && voz !== "nosotros")) {
    console.error("Uso: pnpm invitar --correo <correo> --marca <nombre> --voz yo|nosotros")
    process.exitCode = 1
    return
  }
  await invitar(createAdminClient(), { correo, marca, voz })
  console.log(`Listo: ${correo} es dueño de «${marca}».`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
```

- [ ] **Step 4: Pass** — `pnpm test:db` → all passed.
- [ ] **Step 5: Commit** — `git add lib/equipo scripts/invitar.ts tests/integration/invitar.test.ts && git commit -m "feat: invite a person as owner of a brand"`

## Task 9: End-to-end sign-in on an iPhone profile

**Files:** Modify `playwright.config.ts`, `.github/workflows/ci.yml`. Create `tests/e2e/ingreso.spec.ts`.

- [ ] **Step 1: Mobile project.** In `playwright.config.ts` replace `projects` with `[{ name: "iphone", use: { ...devices["iPhone 14"] } }]` and `baseURL`/`webServer.url` with `http://localhost:3000`. Run `pnpm exec playwright install webkit`.
- [ ] **Step 2: Write the test** `tests/e2e/ingreso.spec.ts`

```ts
import { execFileSync } from "node:child_process"
import { type APIRequestContext, expect, test } from "@playwright/test"

const MAILPIT = "http://127.0.0.1:54424"

async function codigoPara(request: APIRequestContext, correo: string): Promise<string> {
  for (let intento = 0; intento < 20; intento++) {
    const busqueda = await request.get(`${MAILPIT}/api/v1/search`, { params: { query: `to:"${correo}"` } })
    const { messages } = (await busqueda.json()) as { messages: { ID: string }[] }
    const ultimo = messages[0]
    if (ultimo) {
      const mensaje = (await (await request.get(`${MAILPIT}/api/v1/message/${ultimo.ID}`)).json()) as { Text: string }
      const codigo = /\b(\d{6})\b/.exec(mensaje.Text)?.[1]
      if (codigo) return codigo
    }
    await new Promise((listo) => setTimeout(listo, 500))
  }
  throw new Error(`No llegó el código a ${correo}`)
}

test("an invited person signs in with the six-digit code and lands on Inicio", async ({ page, request }) => {
  const correo = `e2e-${Date.now()}@prueba.postia.test`
  execFileSync("pnpm", ["invitar", "--correo", correo, "--marca", "Marca E2E", "--voz", "yo"], { stdio: "inherit" })

  await page.goto("/")
  await expect(page).toHaveURL(/\/ingreso$/)
  await page.getByLabel("Tu correo").fill(correo)
  await page.getByRole("button", { name: "Mandar código" }).click()
  await expect(page.getByText(/Si tu correo está invitado/)).toBeVisible()
  await page.getByLabel("Código de 6 números").fill(await codigoPara(request, correo))
  await page.getByRole("button", { name: "Entrar" }).click()
  await expect(page.getByRole("heading", { name: "Inicio" })).toBeVisible()
  await expect(page.getByText("Marca E2E")).toBeVisible()
})

test("a person who was not invited gets the same answer and no email", async ({ page, request }) => {
  const correo = `extrano-${Date.now()}@prueba.postia.test`
  await page.goto("/ingreso")
  await page.getByLabel("Tu correo").fill(correo)
  await page.getByRole("button", { name: "Mandar código" }).click()
  await expect(page.getByText(/Si tu correo está invitado/)).toBeVisible()
  await new Promise((listo) => setTimeout(listo, 2000))
  const busqueda = await request.get(`${MAILPIT}/api/v1/search`, { params: { query: `to:"${correo}"` } })
  expect(((await busqueda.json()) as { messages: unknown[] }).messages).toHaveLength(0)
})
```

- [ ] **Step 3: Run** — with `.env.local` holding the local values (`bash scripts/supabase-env.sh`): `pnpm test:e2e` → 2 passed. If the second test fails because Supabase answers a different code for an unknown address, read the actual `error.code` from the dev log and add it to `SIN_USUARIO` with a unit test first (Task 4 pattern).
- [ ] **Step 4: CI job** (`.github/workflows/ci.yml`):

```yaml
  e2e:
    name: E2E (iPhone profile)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 11
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: pnpm install --frozen-lockfile
      - run: supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor
      - run: bash scripts/supabase-env.sh > .env.local
      - run: pnpm exec playwright install --with-deps webkit
      - run: pnpm test:e2e
```

- [ ] **Step 5: Commit** — `git add -A && git commit -m "test: cover invite-only sign-in end to end on an iPhone profile"`
- [ ] **Step 6: Invite Federico locally** — `pnpm invitar --correo <his email> --marca "Federico Elgueta" --voz yo` and `pnpm invitar --correo <his email> --marca "WAV We Are Vision" --voz nosotros`. He signs in at `http://localhost:3000` reading the code from Mailpit (`http://127.0.0.1:54424`).

---

# Part C — Brands, accounts and the LinkedIn profile connection

## Task 10: Accounts, connections and tokens in Vault

**Files:** Create `supabase/migrations/20261028120100_cuentas_y_conexiones.sql`, `tests/integration/cuentas.test.ts`. Regenerate types.

- [ ] **Step 1: Failing test** `tests/integration/cuentas.test.ts`

```ts
import { describe, expect, test } from "vitest"
import { admin, marcaConDueno, personaConSesion } from "./entorno"

const EN_60_DIAS = () => new Date(Date.now() + 60 * 86_400_000).toISOString()

async function duenoConCuenta(ruta: "api" | "a_mano" = "api") {
  const dueno = await personaConSesion("dueno")
  const marca = await marcaConDueno(dueno.userId)
  const { data, error } = await dueno.db
    .from("cuentas")
    .insert({ marca_id: marca, red: "linkedin", tipo: "persona", ruta, nombre: "LinkedIn de Federico" })
    .select("id")
    .single()
  if (error) throw error
  return { ...dueno, marca, cuenta: data.id }
}

function conectar(db: Awaited<ReturnType<typeof duenoConCuenta>>["db"], cuenta: string, titular = "urn:li:person:abc123") {
  return db.rpc("conectar_linkedin", {
    p_cuenta: cuenta,
    p_token: "token-secreto",
    p_titular: titular,
    p_nombre: "Federico Elgueta",
    p_scopes: ["openid", "profile", "w_member_social"],
    p_expira_en: EN_60_DIAS(),
  })
}

describe("accounts and connections", () => {
  test("an owner adds an account that only members of the brand can see", async () => {
    const { cuenta } = await duenoConCuenta()
    const extrano = await personaConSesion("extrano")
    const { data } = await extrano.db.from("cuentas").select("id").eq("id", cuenta)
    expect(data).toEqual([])
  })

  test("a company page cannot publish by API in phase 1 (Community Management is not approved)", async () => {
    const dueno = await personaConSesion("pagina")
    const marca = await marcaConDueno(dueno.userId, "nosotros")
    const { error } = await dueno.db
      .from("cuentas")
      .insert({ marca_id: marca, red: "linkedin", tipo: "empresa", ruta: "api", nombre: "Página de WAV" })
    expect(error?.code).toBe("23514")
  })

  test("connecting stores the token in Vault, readable by the service role and never by the person", async () => {
    const { db, cuenta } = await duenoConCuenta()
    const { error } = await conectar(db, cuenta)
    expect(error).toBeNull()

    const { data: visible } = await db.from("cuentas").select("conexiones(titular, expira_en)").eq("id", cuenta).single()
    expect(visible?.conexiones?.titular).toBe("urn:li:person:abc123")
    expect(JSON.stringify(visible)).not.toContain("token-secreto")

    const { error: denegado } = await db.rpc("credencial_de_cuenta", { p_cuenta: cuenta })
    expect(denegado).not.toBeNull()
    const { data: credencial } = await admin().rpc("credencial_de_cuenta", { p_cuenta: cuenta }).single()
    expect(credencial?.token).toBe("token-secreto")
  })

  test("only an owner of the brand can connect, and only an API account", async () => {
    const { cuenta } = await duenoConCuenta()
    const extrano = await personaConSesion("extrano")
    expect((await conectar(extrano.db, cuenta)).error?.code).toBe("42501")
    const aMano = await duenoConCuenta("a_mano")
    expect((await conectar(aMano.db, aMano.cuenta)).error?.code).toBe("22023")
  })

  test("reconnecting the same member keeps one connection with the new expiry", async () => {
    const { db, cuenta } = await duenoConCuenta()
    const titular = `urn:li:person:re${Date.now()}`
    await conectar(db, cuenta, titular)
    await conectar(db, cuenta, titular)
    const { count } = await admin().from("conexiones").select("*", { count: "exact", head: true }).eq("titular", titular)
    expect(count).toBe(1)
  })

  test("disconnecting the last account of a connection deletes the token", async () => {
    const { db, cuenta } = await duenoConCuenta()
    await conectar(db, cuenta, `urn:li:person:fin${Date.now()}`)
    expect((await db.rpc("desconectar_cuenta", { p_cuenta: cuenta })).error).toBeNull()
    const { data } = await admin().rpc("credencial_de_cuenta", { p_cuenta: cuenta })
    expect(data).toEqual([])
  })
})
```

- [ ] **Step 2: Fail** — `pnpm test:db tests/integration/cuentas.test.ts`.
- [ ] **Step 3: Migration** `supabase/migrations/20261028120100_cuentas_y_conexiones.sql`

```sql
-- An authorization with a network: whose it is, which app issued it, its scopes and expiry. The token itself lives in
-- Vault as 'conexion:<id>' («Llaves fuera»). One connection can serve several accounts (a page admin's token).
create table public.conexiones (
  id uuid primary key default gen_random_uuid(),
  red text not null check (red = 'linkedin'),
  -- «Estudio WAV Perfil»: Share on LinkedIn + Sign In with LinkedIn using OpenID Connect (D2).
  app text not null check (app = 'estudio_wav_perfil'),
  titular text not null check (titular ~ '^urn:li:person:[A-Za-z0-9_-]+$'),
  nombre text check (length(nombre) <= 120),
  scopes text[] not null check ('w_member_social' = any (scopes)),
  expira_en timestamptz not null,
  conectada_en timestamptz not null default now(),
  conectada_por uuid not null references auth.users (id),
  unique (app, titular)
);

-- One presence of a brand on a network. Phase 1 is LinkedIn only (D6); Instagram widens the check in phase 2.
create table public.cuentas (
  id uuid primary key default gen_random_uuid(),
  marca_id uuid not null references public.marcas (id) on delete cascade,
  red text not null check (red = 'linkedin'),
  tipo text not null check (tipo in ('persona', 'empresa')),
  ruta text not null check (ruta in ('api', 'metricool', 'a_mano')),
  nombre text not null check (length(btrim(nombre)) between 1 and 80),
  -- Phase 0 rhythm: 3 posts a week on each LinkedIn account.
  ritmo_semanal smallint not null default 3 check (ritmo_semanal between 0 and 21),
  conexion_id uuid references public.conexiones (id) on delete set null,
  creada_en timestamptz not null default now(),
  unique (marca_id, red, nombre),
  -- Only the profile publishes by API until LinkedIn approves Community Management for the page (D2).
  constraint api_solo_perfil check (ruta <> 'api' or tipo = 'persona'),
  constraint conexion_solo_api check (conexion_id is null or ruta = 'api')
);

alter table public.cuentas enable row level security;
alter table public.conexiones enable row level security;

create policy "miembros ven las cuentas de sus marcas" on public.cuentas for select to authenticated
  using (public.es_miembro(marca_id));
create policy "duenos agregan cuentas" on public.cuentas for insert to authenticated
  with check (public.es_dueno(marca_id));
create policy "miembros ven las conexiones de sus cuentas" on public.conexiones for select to authenticated
  using (exists (select 1 from public.cuentas c where c.conexion_id = conexiones.id and public.es_miembro(c.marca_id)));

revoke all on public.cuentas, public.conexiones from anon, authenticated;
grant select on public.cuentas, public.conexiones to authenticated;
-- conexion_id is not insertable: an account only gets a connection through conectar_linkedin.
grant insert (marca_id, red, tipo, ruta, nombre, ritmo_semanal) on public.cuentas to authenticated;

create function public.conectar_linkedin(
  p_cuenta uuid, p_token text, p_titular text, p_nombre text, p_scopes text[], p_expira_en timestamptz
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_cuenta public.cuentas;
  v_conexion uuid;
  v_secreto uuid;
begin
  select * into v_cuenta from public.cuentas where id = p_cuenta for update;
  if not found or not public.es_dueno(v_cuenta.marca_id) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_conecta';
  end if;
  if v_cuenta.ruta <> 'api' or v_cuenta.tipo <> 'persona' then
    raise exception using errcode = '22023', message = 'cuenta_no_publica_por_api';
  end if;
  if nullif(btrim(p_token), '') is null or p_expira_en is null or p_expira_en <= now() then
    raise exception using errcode = '22023', message = 'conexion_incompleta';
  end if;

  insert into public.conexiones (red, app, titular, nombre, scopes, expira_en, conectada_por)
  values ('linkedin', 'estudio_wav_perfil', p_titular, nullif(btrim(p_nombre), ''), p_scopes, p_expira_en, auth.uid())
  on conflict (app, titular) do update
    set nombre = excluded.nombre, scopes = excluded.scopes, expira_en = excluded.expira_en,
        conectada_en = now(), conectada_por = excluded.conectada_por
  returning id into v_conexion;

  select id into v_secreto from vault.secrets where name = 'conexion:' || v_conexion;
  if found then
    perform vault.update_secret(v_secreto, btrim(p_token));
  else
    perform vault.create_secret(btrim(p_token), 'conexion:' || v_conexion);
  end if;

  update public.cuentas set conexion_id = v_conexion where id = p_cuenta;
  return v_conexion;
end $$;

-- LinkedIn documents no revoke endpoint for this app: disconnecting forgets our copy.
create function public.desconectar_cuenta(p_cuenta uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_cuenta public.cuentas;
begin
  select * into v_cuenta from public.cuentas where id = p_cuenta for update;
  if not found or not public.es_dueno(v_cuenta.marca_id) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_desconecta';
  end if;
  if v_cuenta.conexion_id is null then
    return;
  end if;
  update public.cuentas set conexion_id = null where id = p_cuenta;
  if not exists (select 1 from public.cuentas where conexion_id = v_cuenta.conexion_id) then
    delete from vault.secrets where name = 'conexion:' || v_cuenta.conexion_id;
    delete from public.conexiones where id = v_cuenta.conexion_id;
  end if;
end $$;

-- Server tasks and scripts only (service role): the token never reaches a browser.
create function public.credencial_de_cuenta(p_cuenta uuid)
returns table (token text, titular text, expira_en timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret, c.titular, c.expira_en
    from public.cuentas a
    join public.conexiones c on c.id = a.conexion_id
    join vault.decrypted_secrets s on s.name = 'conexion:' || c.id
   where a.id = p_cuenta
$$;

revoke execute on function public.conectar_linkedin(uuid, text, text, text, text[], timestamptz),
  public.desconectar_cuenta(uuid), public.credencial_de_cuenta(uuid) from public, anon, authenticated;
grant execute on function public.conectar_linkedin(uuid, text, text, text, text[], timestamptz),
  public.desconectar_cuenta(uuid) to authenticated;
grant execute on function public.credencial_de_cuenta(uuid) to service_role;
```

- [ ] **Step 4: Pass** — `pnpm db:reset && pnpm db:types && pnpm test:db` → all passed; `pnpm type` → 0.
- [ ] **Step 5: Commit** — `git add supabase lib/supabase/database.types.ts tests/integration/cuentas.test.ts && git commit -m "feat: add accounts and LinkedIn connections with tokens in Vault"`

## Task 11: LinkedIn domain helpers and connection status

Written new (reference: Conidolly `lib/dominio/linkedin.ts`): only what this plan uses, plus a status function.

**Files:** Create `lib/linkedin/dominio.ts`, `lib/marcas/estado-conexion.ts`, `tests/unit/linkedin-dominio.test.ts`, `tests/unit/estado-conexion.test.ts`

- [ ] **Step 1: Failing tests** `tests/unit/linkedin-dominio.test.ts`

```ts
import { describe, expect, test } from "vitest"
import { aLittleText, enlaceDePost, esUrnDePost, tituloDelDocumento } from "@/lib/linkedin/dominio"

describe("aLittleText", () => {
  test("escapes LinkedIn's reserved characters and keeps hashtags as hashtags", () => {
    expect(aLittleText("Hola (mundo) #IA")).toBe("Hola \\(mundo\\) {hashtag|\\#|IA}")
  })
  test("leaves plain Spanish text untouched", () => {
    expect(aLittleText("¿Qué aprendí en 20 años? Mucho.")).toBe("¿Qué aprendí en 20 años? Mucho.")
  })
})

describe("post URNs", () => {
  test("accepts share and ugcPost URNs and builds the feed link", () => {
    expect(esUrnDePost("urn:li:share:7123")).toBe(true)
    expect(esUrnDePost("urn:li:ugcPost:7123")).toBe(true)
    expect(esUrnDePost("urn:li:person:abc")).toBe(false)
    expect(enlaceDePost("urn:li:share:7123")).toBe("https://www.linkedin.com/feed/update/urn:li:share:7123/")
  })
})

describe("tituloDelDocumento", () => {
  test("keeps one line and cuts past 100 characters at a word boundary", () => {
    expect(tituloDelDocumento("Tres  lecciones\nde un evento")).toBe("Tres lecciones de un evento")
    const largo = `${"palabra ".repeat(20)}fin`
    const titulo = tituloDelDocumento(largo)
    expect(titulo.length).toBeLessThanOrEqual(100)
    expect(titulo.endsWith("palabra")).toBe(true)
  })
})
```

`tests/unit/estado-conexion.test.ts`

```ts
import { describe, expect, test } from "vitest"
import { estadoDeConexion } from "@/lib/marcas/estado-conexion"

const AHORA = Date.parse("2026-10-28T12:00:00Z")
const DIA = 86_400_000

describe("estadoDeConexion", () => {
  test("has no connection without an expiry", () => {
    expect(estadoDeConexion(null, AHORA)).toEqual({ estado: "sin_conexion" })
  })
  test("is connected with more than 14 days left, rounding days up", () => {
    expect(estadoDeConexion(new Date(AHORA + 59.5 * DIA).toISOString(), AHORA)).toEqual({ estado: "conectada", dias: 60 })
  })
  test("is about to expire with 14 days or fewer", () => {
    expect(estadoDeConexion(new Date(AHORA + 14 * DIA).toISOString(), AHORA)).toEqual({ estado: "por_vencer", dias: 14 })
  })
  test("is expired at or after its expiry", () => {
    expect(estadoDeConexion(new Date(AHORA).toISOString(), AHORA)).toEqual({ estado: "vencida" })
  })
})
```

- [ ] **Step 2: Fail.**
- [ ] **Step 3: Implement** `lib/linkedin/dominio.ts`

```ts
// LinkedIn "little" text: reserved characters are escaped; a hashtag becomes a hashtag element.
// https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/little-text-format
const RESERVADOS = /[|{}@[\]()<>#\\*_~]/g
const ETIQUETA = /(^|\s)#([\p{L}\p{N}_]+)/gu

function escapar(texto: string): string {
  return texto.replace(RESERVADOS, (caracter) => `\\${caracter}`)
}

/** The signed text as LinkedIn's `commentary`: shown exactly as signed, hashtags still hashtags. */
export function aLittleText(texto: string): string {
  let salida = ""
  let desde = 0
  for (const encontrado of texto.matchAll(ETIQUETA)) {
    const inicio = (encontrado.index ?? 0) + (encontrado[1]?.length ?? 0)
    const etiqueta = encontrado[2] ?? ""
    salida += `${escapar(texto.slice(desde, inicio))}{hashtag|\\#|${escapar(etiqueta)}}`
    desde = inicio + 1 + etiqueta.length
  }
  return salida + escapar(texto.slice(desde))
}

const URN_DE_POST = /^urn:li:(share|ugcPost):[0-9]+$/

export function esUrnDePost(urn: string): boolean {
  return URN_DE_POST.test(urn)
}

export function enlaceDePost(urn: string): string {
  if (!esUrnDePost(urn)) throw new Error(`No es un post de LinkedIn: ${urn}`)
  return `https://www.linkedin.com/feed/update/${urn}/`
}

/** Commentary limit of a LinkedIn post. */
export const LARGO_MAXIMO_DEL_TEXTO = 3000
/** Documents API (plano, Redes y APIs, ms.date 2026-06-19): up to 100 MB and 300 pages. */
export const BYTES_MAXIMOS_DEL_DOCUMENTO = 100 * 1024 * 1024
export const PAGINAS_MAXIMAS_DEL_DOCUMENTO = 300

const LARGO_MAXIMO_DEL_TITULO = 100

/** A carousel's `content.media.title`: one line, cut after the last whole word within 100 characters. */
export function tituloDelDocumento(portada: string): string {
  const titulo = portada.replace(/\s+/g, " ").trim()
  if (titulo.length <= LARGO_MAXIMO_DEL_TITULO) return titulo
  const corte = titulo.slice(0, LARGO_MAXIMO_DEL_TITULO + 1).lastIndexOf(" ")
  if (corte <= 0) return Array.from(titulo).slice(0, LARGO_MAXIMO_DEL_TITULO).join("")
  return titulo.slice(0, corte)
}
```

`lib/marcas/estado-conexion.ts`

```ts
const DIA_MS = 86_400_000
// Warn at 14 days: a Share on LinkedIn token has no refresh and lives 60 days.
const DIAS_DE_AVISO = 14

export type EstadoDeConexion =
  | { estado: "sin_conexion" }
  | { estado: "vencida" }
  | { estado: "por_vencer"; dias: number }
  | { estado: "conectada"; dias: number }

export function estadoDeConexion(expiraEn: string | null, ahora: number): EstadoDeConexion {
  if (expiraEn === null) return { estado: "sin_conexion" }
  const restante = Date.parse(expiraEn) - ahora
  if (restante <= 0) return { estado: "vencida" }
  const dias = Math.ceil(restante / DIA_MS)
  return dias <= DIAS_DE_AVISO ? { estado: "por_vencer", dias } : { estado: "conectada", dias }
}
```

- [ ] **Step 4: Pass** → all passed.
- [ ] **Step 5: Commit** — `git add lib/linkedin/dominio.ts lib/marcas/estado-conexion.ts tests/unit && git commit -m "feat: add LinkedIn text helpers and connection status"`

## Task 12: LinkedIn OAuth provider (OpenID Connect + w_member_social)

Written new (reference: Conidolly `lib/proveedores/linkedin-oauth.ts` and `bases.ts`).

**Files:** Create `lib/proveedores/bases.ts`, `lib/linkedin/oauth.ts`, `tests/msw.ts`, `tests/unit/linkedin-oauth.test.ts`, `tests/unit/bases.test.ts`. Modify `tests/setup.ts`.

- [ ] **Step 1: MSW harness.** `tests/msw.ts`:

```ts
import { setupServer } from "msw/node"

export const servidor = setupServer()
```

`tests/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest"
import { afterAll, afterEach, beforeAll } from "vitest"
import { servidor } from "./msw"

// Every unhandled request fails the test: nothing real is ever called from a unit test.
beforeAll(() => servidor.listen({ onUnhandledRequest: "error" }))
afterEach(() => servidor.resetHandlers())
afterAll(() => servidor.close())
```

- [ ] **Step 2: Failing tests** `tests/unit/bases.test.ts`

```ts
import { describe, expect, test } from "vitest"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { baseDe } from "@/lib/proveedores/bases"

describe("baseDe", () => {
  test("uses the default when there is no override", () => {
    expect(baseDe({}, "LINKEDIN_API_BASE_URL", "https://api.linkedin.com")).toBe("https://api.linkedin.com")
  })
  test("uses a local override without its trailing slash", () => {
    expect(baseDe({ LINKEDIN_API_BASE_URL: "http://127.0.0.1:9999/" }, "LINKEDIN_API_BASE_URL", "x")).toBe("http://127.0.0.1:9999")
  })
  test("refuses an override on Vercel or in a production build, where the token would travel there", () => {
    expect(() => baseDe({ LINKEDIN_API_BASE_URL: "http://a", VERCEL: "1" }, "LINKEDIN_API_BASE_URL", "x")).toThrow(FallaDeConfiguracion)
    expect(() => baseDe({ LINKEDIN_API_BASE_URL: "http://a", NODE_ENV: "production" }, "LINKEDIN_API_BASE_URL", "x")).toThrow(FallaDeConfiguracion)
  })
})
```

`tests/unit/linkedin-oauth.test.ts`

```ts
import { HttpResponse, http } from "msw"
import { describe, expect, test, vi } from "vitest"
import { Falla } from "@/lib/dominio/falla"
import { intercambiarCodigoLinkedin, leerMiembro, urlDeAutorizacionLinkedin } from "@/lib/linkedin/oauth"
import { servidor } from "../msw"

const APP = { clientId: "cliente", clientSecret: "secreto-de-la-app", redirectUri: "http://localhost:3000/api/linkedin/callback" }

describe("urlDeAutorizacionLinkedin", () => {
  test("asks for OpenID Connect and w_member_social, space-encoded, with the state", () => {
    const url = new URL(urlDeAutorizacionLinkedin({ clientId: APP.clientId, redirectUri: APP.redirectUri, estado: "e1" }))
    expect(url.origin + url.pathname).toBe("https://www.linkedin.com/oauth/v2/authorization")
    expect(url.searchParams.get("scope")).toBe("openid profile w_member_social")
    expect(url.toString()).toContain("scope=openid%20profile%20w_member_social")
    expect(url.searchParams.get("state")).toBe("e1")
    expect(url.searchParams.get("redirect_uri")).toBe(APP.redirectUri)
  })
})

describe("intercambiarCodigoLinkedin", () => {
  test("exchanges the code and reads comma-separated scopes", async () => {
    let cuerpo = new URLSearchParams()
    servidor.use(
      http.post("https://www.linkedin.com/oauth/v2/accessToken", async ({ request }) => {
        cuerpo = new URLSearchParams(await request.text())
        return HttpResponse.json({ access_token: "tok", expires_in: 5_184_000, scope: "openid,profile,w_member_social" })
      }),
    )
    const acceso = await intercambiarCodigoLinkedin({ ...APP, codigo: "c1" })
    expect(acceso).toEqual({ token: "tok", expiraEnSegundos: 5_184_000, scopes: ["openid", "profile", "w_member_social"] })
    expect(cuerpo.get("grant_type")).toBe("authorization_code")
    expect(cuerpo.get("code")).toBe("c1")
  })

  test("a definitive refusal is a Falla, and the logged detail never carries the secret", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined)
    servidor.use(http.post("https://www.linkedin.com/oauth/v2/accessToken", () => HttpResponse.text("bad secreto-de-la-app", { status: 401 })))
    await expect(intercambiarCodigoLinkedin({ ...APP, codigo: "c1" })).rejects.toBeInstanceOf(Falla)
    expect(JSON.stringify(log.mock.calls)).not.toContain("secreto-de-la-app")
    log.mockRestore()
  })

  test("a server error is not a Falla (it may work on retry)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    servidor.use(http.post("https://www.linkedin.com/oauth/v2/accessToken", () => HttpResponse.text("down", { status: 503 })))
    const error = await intercambiarCodigoLinkedin({ ...APP, codigo: "c1" }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(Falla)
  })
})

describe("leerMiembro", () => {
  test("reads the member URN and name from /v2/userinfo", async () => {
    servidor.use(http.get("https://api.linkedin.com/v2/userinfo", () => HttpResponse.json({ sub: "abc-123", name: " Federico Elgueta " })))
    expect(await leerMiembro({ token: "tok" })).toEqual({ miembro: "urn:li:person:abc-123", nombre: "Federico Elgueta" })
  })
})
```

- [ ] **Step 3: Fail.**
- [ ] **Step 4: Implement** `lib/proveedores/bases.ts`

```ts
import { FallaDeConfiguracion } from "@/lib/dominio/falla"

type Entorno = Record<string, string | undefined>

/**
 * A provider's API address. Local E2E can point it at a fake with an environment variable; a deployed app refuses the
 * override, because Federico's token would travel to that address.
 */
export function baseDe(entorno: Entorno, variable: string, porDefecto: string): string {
  const valor = entorno[variable]
  if (!valor) return porDefecto
  if (entorno.VERCEL || entorno.NODE_ENV === "production") {
    throw new FallaDeConfiguracion(`${variable} no puede estar definida en producción: las llaves irían a otra dirección.`)
  }
  return valor.replace(/\/+$/, "")
}
```

`lib/linkedin/oauth.ts`

```ts
import { z } from "zod"
import { Falla } from "@/lib/dominio/falla"
import { baseDe } from "@/lib/proveedores/bases"

// Authorization code flow: https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
// OIDC userinfo: https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2
// No refresh token for a self-serve app: renewing is this same flow every 60 days.
export const SCOPES_DE_LINKEDIN = ["openid", "profile", "w_member_social"] as const

const BASE_OAUTH = "https://www.linkedin.com"
const BASE_API = "https://api.linkedin.com"
const ESPERA_MS = 30_000

export const REFUSADA_LINKEDIN = "LinkedIn no aceptó la conexión. Vuelve a conectarla desde Marcas."

interface App {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export function urlDeAutorizacionLinkedin(entrada: Omit<App, "clientSecret"> & { estado: string }): string {
  const consulta = new URLSearchParams({
    response_type: "code",
    client_id: entrada.clientId,
    redirect_uri: entrada.redirectUri,
    state: entrada.estado,
    scope: SCOPES_DE_LINKEDIN.join(" "),
  })
  // URLSearchParams writes a space as "+"; LinkedIn documents URL-encoded, space-delimited scopes.
  const base = baseDe(process.env, "LINKEDIN_OAUTH_BASE_URL", BASE_OAUTH)
  return `${base}/oauth/v2/authorization?${consulta.toString().replace(/\+/g, "%20")}`
}

function sinSecretos(texto: string, secretos: readonly string[]): string {
  return secretos.reduce((limpio, secreto) => (secreto ? limpio.split(secreto).join("[x]") : limpio), texto)
}

async function pedir(url: string, init: RequestInit, secretos: readonly string[]): Promise<unknown> {
  let respuesta: Response
  try {
    respuesta = await fetch(url, { ...init, signal: AbortSignal.timeout(ESPERA_MS) })
  } catch (error) {
    throw new Error("No pude conectar con LinkedIn.", { cause: error })
  }
  if (!respuesta.ok) {
    const detalle = sinSecretos((await respuesta.text()).slice(0, 300), secretos)
    console.error(`LinkedIn respondió HTTP ${respuesta.status} al conectar la cuenta: ${detalle}`)
    const deCliente = respuesta.status >= 400 && respuesta.status < 500 && respuesta.status !== 408 && respuesta.status !== 429
    if (deCliente) throw new Falla(REFUSADA_LINKEDIN)
    throw new Error(`LinkedIn respondió HTTP ${respuesta.status} al conectar la cuenta.`)
  }
  try {
    return await respuesta.json()
  } catch (error) {
    throw new Error("LinkedIn devolvió una respuesta ilegible.", { cause: error })
  }
}

const RespuestaDeToken = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
  scope: z.string().optional(),
})

export async function intercambiarCodigoLinkedin(
  entrada: App & { codigo: string },
): Promise<{ token: string; expiraEnSegundos: number; scopes: string[] | null }> {
  const cuerpo = await pedir(
    `${baseDe(process.env, "LINKEDIN_OAUTH_BASE_URL", BASE_OAUTH)}/oauth/v2/accessToken`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: entrada.codigo,
        client_id: entrada.clientId,
        client_secret: entrada.clientSecret,
        redirect_uri: entrada.redirectUri,
      }).toString(),
    },
    [entrada.clientSecret, entrada.codigo],
  )
  const leida = RespuestaDeToken.safeParse(cuerpo)
  if (!leida.success) throw new Error("LinkedIn devolvió una respuesta inesperada en /oauth/v2/accessToken.")
  return {
    token: leida.data.access_token,
    expiraEnSegundos: leida.data.expires_in,
    // The separator is not documented: commas and blanks are both read.
    scopes: leida.data.scope ? leida.data.scope.split(/[\s,]+/).filter(Boolean) : null,
  }
}

const RespuestaDeUsuario = z.object({ sub: z.string().regex(/^[A-Za-z0-9_-]+$/), name: z.string().optional() })

/** The author of a member's posts is `urn:li:person:{sub}`. */
export async function leerMiembro(entrada: { token: string }): Promise<{ miembro: string; nombre: string | null }> {
  const cuerpo = await pedir(
    `${baseDe(process.env, "LINKEDIN_API_BASE_URL", BASE_API)}/v2/userinfo`,
    { method: "GET", headers: { Authorization: `Bearer ${entrada.token}` } },
    [entrada.token],
  )
  const leido = RespuestaDeUsuario.safeParse(cuerpo)
  if (!leido.success) throw new Error("LinkedIn devolvió una respuesta inesperada en /v2/userinfo.")
  return { miembro: `urn:li:person:${leido.data.sub}`, nombre: leido.data.name?.trim() || null }
}
```

- [ ] **Step 5: Pass** — `pnpm test:run` → all passed.
- [ ] **Step 6: Commit** — `git add lib/proveedores lib/linkedin/oauth.ts tests && git commit -m "feat: port the LinkedIn OAuth provider with OpenID Connect scopes"`

## Task 13: Connection callback logic

**Files:** Create `lib/linkedin/estado-oauth.ts`, `lib/linkedin/conexion.ts`, `tests/unit/estado-oauth.test.ts`, `tests/unit/linkedin-conexion.test.ts`

- [ ] **Step 1: Failing tests** `tests/unit/estado-oauth.test.ts`

```ts
import { describe, expect, test } from "vitest"
import { desempacarEstado, empacarEstado, estadoCoincide, nuevoEstado } from "@/lib/linkedin/estado-oauth"

const CUENTA = "8c0a2f6e-1b2c-4d3e-9f40-123456789abc"

describe("OAuth state", () => {
  test("a new state is 64 hex characters and unique", () => {
    expect(nuevoEstado()).toMatch(/^[0-9a-f]{64}$/)
    expect(nuevoEstado()).not.toBe(nuevoEstado())
  })
  test("matches only the same value", () => {
    expect(estadoCoincide("abc", "abc")).toBe(true)
    expect(estadoCoincide("abc", "abd")).toBe(false)
    expect(estadoCoincide(undefined, "abc")).toBe(false)
  })
  test("packs the account with the state and refuses anything malformed", () => {
    expect(desempacarEstado(empacarEstado("e".repeat(64), CUENTA))).toEqual({ estado: "e".repeat(64), cuenta: CUENTA })
    expect(desempacarEstado("e:no-es-uuid")).toBeNull()
    expect(desempacarEstado(undefined)).toBeNull()
  })
})
```

`tests/unit/linkedin-conexion.test.ts`

```ts
import { HttpResponse, http } from "msw"
import { describe, expect, test, vi } from "vitest"
import { terminarConexionLinkedin } from "@/lib/linkedin/conexion"
import { servidor } from "../msw"

const APP = { clientId: "c", clientSecret: "s", redirectUri: "http://localhost:3000/api/linkedin/callback" }
const CUENTA = "8c0a2f6e-1b2c-4d3e-9f40-123456789abc"
const AHORA = Date.parse("2026-10-28T12:00:00Z")

function linkedin(scope = "openid,profile,w_member_social") {
  servidor.use(
    http.post("https://www.linkedin.com/oauth/v2/accessToken", () =>
      HttpResponse.json({ access_token: "tok", expires_in: 5_184_000, scope }),
    ),
    http.get("https://api.linkedin.com/v2/userinfo", () => HttpResponse.json({ sub: "abc", name: "Federico" })),
  )
}

function deps(guardar = vi.fn(async () => ({ error: null }))) {
  return { app: APP, ahora: () => AHORA, guardar }
}

const llegadaValida = { codigo: "c1", estado: "e1", guardado: { estado: "e1", cuenta: CUENTA }, errorDeLinkedin: null }

describe("terminarConexionLinkedin", () => {
  test("saves the connection for the account with a 60-day expiry", async () => {
    linkedin()
    const d = deps()
    expect(await terminarConexionLinkedin(d, llegadaValida)).toEqual({ ok: true, nombre: "Federico" })
    expect(d.guardar).toHaveBeenCalledWith({
      p_cuenta: CUENTA,
      p_token: "tok",
      p_titular: "urn:li:person:abc",
      p_nombre: "Federico",
      p_scopes: ["openid", "profile", "w_member_social"],
      p_expira_en: new Date(AHORA + 5_184_000_000).toISOString(),
    })
  })

  test("a state that does not match stops before calling LinkedIn", async () => {
    const d = deps()
    expect(await terminarConexionLinkedin(d, { ...llegadaValida, estado: "otro" })).toEqual({ ok: false, motivo: "estado" })
    expect(d.guardar).not.toHaveBeenCalled()
  })

  test("a cancelled consent is reported as cancelled", async () => {
    expect(await terminarConexionLinkedin(deps(), { ...llegadaValida, errorDeLinkedin: "user_cancelled_authorize" })).toEqual({
      ok: false,
      motivo: "cancelada",
    })
  })

  test("a token without w_member_social is not saved", async () => {
    linkedin("openid,profile")
    const d = deps()
    expect(await terminarConexionLinkedin(d, llegadaValida)).toEqual({ ok: false, motivo: "permisos" })
    expect(d.guardar).not.toHaveBeenCalled()
  })

  test("a database refusal is a failure, logged", async () => {
    linkedin()
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const d = deps(vi.fn(async () => ({ error: { message: "solo_el_dueno_conecta" } })))
    expect(await terminarConexionLinkedin(d, llegadaValida)).toEqual({ ok: false, motivo: "fallo" })
  })

  test("without the app configured nothing happens", async () => {
    expect(await terminarConexionLinkedin({ ...deps(), app: null }, llegadaValida)).toEqual({ ok: false, motivo: "sin_app" })
  })
})
```

- [ ] **Step 2: Fail.**
- [ ] **Step 3: Implement** `lib/linkedin/estado-oauth.ts`

```ts
import { randomBytes, timingSafeEqual } from "node:crypto"

export const COOKIE_DE_ESTADO_LINKEDIN = "postia_linkedin_estado"
export const RUTA_DE_LA_COOKIE_LINKEDIN = "/api/linkedin"
const DIEZ_MINUTOS = 10 * 60
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A one-use value that goes out with the redirect and must come back: it proves this browser started the connection. */
export function nuevoEstado(): string {
  return randomBytes(32).toString("hex")
}

export function estadoCoincide(guardado: string | null | undefined, recibido: string | null | undefined): boolean {
  if (!guardado || !recibido) return false
  const a = Buffer.from(guardado)
  const b = Buffer.from(recibido)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function esUuid(valor: string | null | undefined): valor is string {
  return !!valor && UUID.test(valor)
}

/** The cookie also carries which account is being connected, so the callback needs nothing from the URL but LinkedIn's. */
export function empacarEstado(estado: string, cuenta: string): string {
  return `${estado}:${cuenta}`
}

export function desempacarEstado(valor: string | undefined): { estado: string; cuenta: string } | null {
  const [estado, cuenta] = valor?.split(":") ?? []
  return estado && esUuid(cuenta) ? { estado, cuenta } : null
}

export function opcionesDeLaCookieLinkedin(https: boolean) {
  return { httpOnly: true, sameSite: "lax" as const, secure: https, path: RUTA_DE_LA_COOKIE_LINKEDIN, maxAge: DIEZ_MINUTOS }
}
```

`lib/linkedin/conexion.ts`

```ts
import { Falla } from "@/lib/dominio/falla"
import { estadoCoincide } from "./estado-oauth"
import { intercambiarCodigoLinkedin, leerMiembro } from "./oauth"

type Entorno = Record<string, string | undefined>

export interface AppDeLinkedin {
  clientId: string
  clientSecret: string
  redirectUri: string
}

/** The «Estudio WAV Perfil» app from the environment; null until its three variables are set. */
export function leerAppDeLinkedin(entorno: Entorno): AppDeLinkedin | null {
  const { LINKEDIN_CLIENT_ID: clientId, LINKEDIN_CLIENT_SECRET: clientSecret, LINKEDIN_REDIRECT_URI: redirectUri } = entorno
  return clientId && clientSecret && redirectUri ? { clientId, clientSecret, redirectUri } : null
}

export interface ArgsDeConexion {
  p_cuenta: string
  p_token: string
  p_titular: string
  p_nombre: string
  p_scopes: string[]
  p_expira_en: string
}

export interface DepsDeConexion {
  app: AppDeLinkedin | null
  ahora: () => number
  /** `conectar_linkedin` with the person's session: the database checks they own the brand. */
  guardar: (args: ArgsDeConexion) => Promise<{ error: { message: string } | null }>
}

export type MotivoDeFallo = "estado" | "cancelada" | "rechazada" | "permisos" | "sin_app" | "fallo"
export type ResultadoDeConexion = { ok: true; nombre: string | null } | { ok: false; motivo: MotivoDeFallo }

export interface Llegada {
  codigo: string | null
  estado: string | null
  guardado: { estado: string; cuenta: string } | null
  errorDeLinkedin: string | null
}

/** The callback of «Conectar LinkedIn». Whatever fails leaves Vault and the account as they were. */
export async function terminarConexionLinkedin(deps: DepsDeConexion, llegada: Llegada): Promise<ResultadoDeConexion> {
  if (!deps.app) return { ok: false, motivo: "sin_app" }
  if (!llegada.guardado || !estadoCoincide(llegada.guardado.estado, llegada.estado)) return { ok: false, motivo: "estado" }
  if (llegada.errorDeLinkedin) return { ok: false, motivo: "cancelada" }
  if (!llegada.codigo) return { ok: false, motivo: "fallo" }

  try {
    const acceso = await intercambiarCodigoLinkedin({ ...deps.app, codigo: llegada.codigo })
    if (acceso.scopes !== null && !acceso.scopes.includes("w_member_social")) return { ok: false, motivo: "permisos" }
    const { miembro, nombre } = await leerMiembro({ token: acceso.token })
    const { error } = await deps.guardar({
      p_cuenta: llegada.guardado.cuenta,
      p_token: acceso.token,
      p_titular: miembro,
      p_nombre: nombre ?? "",
      p_scopes: acceso.scopes ?? ["openid", "profile", "w_member_social"],
      p_expira_en: new Date(deps.ahora() + acceso.expiraEnSegundos * 1000).toISOString(),
    })
    if (error) throw new Error(`No pude guardar la conexión de LinkedIn: ${error.message}`)
    return { ok: true, nombre }
  } catch (error) {
    if (error instanceof Falla) return { ok: false, motivo: "rechazada" }
    console.error("No pude conectar LinkedIn", error)
    return { ok: false, motivo: "fallo" }
  }
}
```

- [ ] **Step 4: Pass.**
- [ ] **Step 5: Commit** — `git add lib/linkedin tests/unit && git commit -m "feat: finish a LinkedIn connection for one account"`

## Task 14: Brand and account actions

**Files:** Create `lib/marcas/acciones.ts`, `tests/integration/acciones-marcas.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, test } from "vitest"
import { agregarCuenta, crearMarca } from "@/lib/marcas/acciones"
import { marcaConDueno, personaConSesion } from "./entorno"

describe("brand and account actions", () => {
  test("an owner creates a brand; a repeated name gets a clear message", async () => {
    const { db, userId } = await personaConSesion("acciones")
    await marcaConDueno(userId)
    const nombre = `WAV ${Date.now()}`
    expect(await crearMarca(db, { nombre, voz: "nosotros" })).toEqual({ ok: true })
    expect(await crearMarca(db, { nombre, voz: "nosotros" })).toEqual({ ok: false, error: "Ya existe una marca con ese nombre." })
  })

  test("invalid input never reaches the database", async () => {
    const { db } = await personaConSesion("invalida")
    expect(await crearMarca(db, { nombre: "", voz: "ellos" })).toEqual({ ok: false, error: "Revisa el nombre y la voz de la marca." })
  })

  test("adds a LinkedIn account, and explains why a page cannot publish by API yet", async () => {
    const { db, userId } = await personaConSesion("cuenta")
    const marcaId = await marcaConDueno(userId)
    expect(await agregarCuenta(db, { marcaId, tipo: "persona", ruta: "api", nombre: "LinkedIn de Federico", ritmoSemanal: "3" })).toEqual({ ok: true })
    expect(await agregarCuenta(db, { marcaId, tipo: "empresa", ruta: "api", nombre: "Página", ritmoSemanal: "3" })).toEqual({
      ok: false,
      error: "Por API solo publica el perfil personal hasta que LinkedIn apruebe Community Management. Elige «a mano».",
    })
  })
})
```

- [ ] **Step 2: Fail.**
- [ ] **Step 3: Implement** `lib/marcas/acciones.ts`

```ts
import { z } from "zod"
import type { Db } from "@/lib/supabase/database"

export type Resultado = { ok: true } | { ok: false; error: string }

const NuevaMarca = z.object({ nombre: z.string().trim().min(1).max(80), voz: z.enum(["yo", "nosotros"]) })

const NuevaCuenta = z.object({
  marcaId: z.uuid(),
  tipo: z.enum(["persona", "empresa"]),
  ruta: z.enum(["api", "metricool", "a_mano"]),
  nombre: z.string().trim().min(1).max(80),
  ritmoSemanal: z.coerce.number().int().min(0).max(21),
})

function falla(error: { code?: string; message: string }, porCodigo: Record<string, string>): Resultado {
  const mensaje = error.code ? porCodigo[error.code] : undefined
  if (mensaje) return { ok: false, error: mensaje }
  console.error("Falla inesperada de la base", error)
  return { ok: false, error: "No pude guardar. Inténtalo de nuevo en un rato." }
}

export async function crearMarca(db: Db, entrada: unknown): Promise<Resultado> {
  const leida = NuevaMarca.safeParse(entrada)
  if (!leida.success) return { ok: false, error: "Revisa el nombre y la voz de la marca." }
  const { error } = await db.rpc("crear_marca", { p_nombre: leida.data.nombre, p_voz: leida.data.voz })
  if (!error) return { ok: true }
  return falla(error, { "23505": "Ya existe una marca con ese nombre.", "42501": "Solo un dueño puede crear marcas." })
}

export async function agregarCuenta(db: Db, entrada: unknown): Promise<Resultado> {
  const leida = NuevaCuenta.safeParse(entrada)
  if (!leida.success) return { ok: false, error: "Revisa los datos de la cuenta." }
  const { marcaId, tipo, ruta, nombre, ritmoSemanal } = leida.data
  const { error } = await db
    .from("cuentas")
    .insert({ marca_id: marcaId, red: "linkedin", tipo, ruta, nombre, ritmo_semanal: ritmoSemanal })
  if (!error) return { ok: true }
  return falla(error, {
    "23514": "Por API solo publica el perfil personal hasta que LinkedIn apruebe Community Management. Elige «a mano».",
    "23505": "Esa marca ya tiene una cuenta con ese nombre.",
    "42501": "Solo el dueño de la marca puede agregar cuentas.",
  })
}

export async function desconectarCuenta(db: Db, cuentaId: string): Promise<Resultado> {
  const { error } = await db.rpc("desconectar_cuenta", { p_cuenta: cuentaId })
  if (!error) return { ok: true }
  return falla(error, { "42501": "Solo el dueño de la marca puede desconectar." })
}
```

- [ ] **Step 4: Pass** — `pnpm test:db`.
- [ ] **Step 5: Commit** — `git add lib/marcas/acciones.ts tests/integration && git commit -m "feat: create brands and add LinkedIn accounts"`

## Task 15: «Marcas y cuentas» screen and the LinkedIn routes

**Files:** Create `app/api/linkedin/conectar/route.ts`, `app/api/linkedin/callback/route.ts`, `app/(app)/marcas/page.tsx`, `app/(app)/marcas/acciones.ts`, `app/(app)/marcas/formulario-marca.tsx`, `app/(app)/marcas/formulario-cuenta.tsx`, `app/(app)/marcas/estado-de-conexion.tsx`, `tests/unit/estado-de-conexion.test.tsx`

- [ ] **Step 1: Failing component test** `tests/unit/estado-de-conexion.test.tsx`

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { EstadoDeConexionChip } from "@/app/(app)/marcas/estado-de-conexion"

describe("EstadoDeConexionChip", () => {
  test("says how many days are left, never anything about the token", () => {
    render(<EstadoDeConexionChip estado={{ estado: "conectada", dias: 45 }} />)
    expect(screen.getByText("Conectada · vence en 45 días")).toBeInTheDocument()
  })
  test("asks to renew when about to expire or expired", () => {
    const { rerender } = render(<EstadoDeConexionChip estado={{ estado: "por_vencer", dias: 1 }} />)
    expect(screen.getByText("Vence en 1 día · renuévala")).toBeInTheDocument()
    rerender(<EstadoDeConexionChip estado={{ estado: "vencida" }} />)
    expect(screen.getByText("Vencida · vuelve a conectar")).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Fail.**
- [ ] **Step 3: Implement** `app/(app)/marcas/estado-de-conexion.tsx`

```tsx
import type { EstadoDeConexion } from "@/lib/marcas/estado-conexion"

const dias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`

function texto(estado: EstadoDeConexion): string {
  switch (estado.estado) {
    case "sin_conexion":
      return "Sin conectar"
    case "vencida":
      return "Vencida · vuelve a conectar"
    case "por_vencer":
      return `Vence en ${dias(estado.dias)} · renuévala`
    case "conectada":
      return `Conectada · vence en ${dias(estado.dias)}`
  }
}

export function EstadoDeConexionChip({ estado }: { estado: EstadoDeConexion }) {
  const alerta = estado.estado === "vencida" || estado.estado === "por_vencer"
  return (
    <span className={`rounded-full border px-2 py-1 text-xs ${alerta ? "border-peligro text-peligro" : "border-borde text-apagado"}`}>
      {texto(estado)}
    </span>
  )
}
```

- [ ] **Step 4: Pass.**
- [ ] **Step 5: Routes.** `app/api/linkedin/conectar/route.ts`

```ts
import { type NextRequest, NextResponse } from "next/server"
import { leerAppDeLinkedin } from "@/lib/linkedin/conexion"
import {
  COOKIE_DE_ESTADO_LINKEDIN,
  empacarEstado,
  esUuid,
  nuevoEstado,
  opcionesDeLaCookieLinkedin,
} from "@/lib/linkedin/estado-oauth"
import { urlDeAutorizacionLinkedin } from "@/lib/linkedin/oauth"
import { RUTA_DE_INGRESO, RUTA_DE_MARCAS } from "@/lib/sesion/rutas"
import { leerSesion } from "@/lib/sesion/sesion"
import { createClient } from "@/lib/supabase/server"

const irA = (request: NextRequest, ruta: string) => NextResponse.redirect(new URL(ruta, request.url), 303)

// «Conectar LinkedIn» and «Renovar»: sends the owner to LinkedIn with a state only this browser knows.
export async function GET(request: NextRequest) {
  const sesion = await leerSesion(await createClient())
  if (sesion.estado !== "miembro") return irA(request, RUTA_DE_INGRESO)
  const cuenta = request.nextUrl.searchParams.get("cuenta")
  if (!esUuid(cuenta)) return irA(request, `${RUTA_DE_MARCAS}?linkedin=fallo`)
  const app = leerAppDeLinkedin(process.env)
  if (!app) return irA(request, `${RUTA_DE_MARCAS}?linkedin=sin_app`)

  const estado = nuevoEstado()
  const respuesta = NextResponse.redirect(urlDeAutorizacionLinkedin({ clientId: app.clientId, redirectUri: app.redirectUri, estado }))
  respuesta.cookies.set(COOKIE_DE_ESTADO_LINKEDIN, empacarEstado(estado, cuenta), opcionesDeLaCookieLinkedin(request.nextUrl.protocol === "https:"))
  return respuesta
}
```

`app/api/linkedin/callback/route.ts`

```ts
import { type NextRequest, NextResponse } from "next/server"
import { leerAppDeLinkedin, terminarConexionLinkedin } from "@/lib/linkedin/conexion"
import { COOKIE_DE_ESTADO_LINKEDIN, desempacarEstado, RUTA_DE_LA_COOKIE_LINKEDIN } from "@/lib/linkedin/estado-oauth"
import { RUTA_DE_INGRESO, RUTA_DE_MARCAS } from "@/lib/sesion/rutas"
import { leerSesion } from "@/lib/sesion/sesion"
import { createActionClient } from "@/lib/supabase/action"

// Where LinkedIn sends the owner back. Only the outcome travels to the screen, as a fixed word.
export async function GET(request: NextRequest) {
  const db = await createActionClient()
  const sesion = await leerSesion(db)
  if (sesion.estado !== "miembro") return NextResponse.redirect(new URL(RUTA_DE_INGRESO, request.url), 303)

  const parametros = request.nextUrl.searchParams
  const resultado = await terminarConexionLinkedin(
    {
      app: leerAppDeLinkedin(process.env),
      ahora: () => Date.now(),
      guardar: async (args) => {
        const { error } = await db.rpc("conectar_linkedin", args)
        return { error }
      },
    },
    {
      codigo: parametros.get("code"),
      estado: parametros.get("state"),
      guardado: desempacarEstado(request.cookies.get(COOKIE_DE_ESTADO_LINKEDIN)?.value),
      errorDeLinkedin: parametros.get("error"),
    },
  )

  const destino = `${RUTA_DE_MARCAS}?linkedin=${resultado.ok ? "conectada" : resultado.motivo}`
  const respuesta = NextResponse.redirect(new URL(destino, request.url), 303)
  respuesta.cookies.set(COOKIE_DE_ESTADO_LINKEDIN, "", { path: RUTA_DE_LA_COOKIE_LINKEDIN, maxAge: 0 })
  return respuesta
}
```

- [ ] **Step 6: Server actions** `app/(app)/marcas/acciones.ts`

```ts
"use server"

import { revalidatePath } from "next/cache"
import { agregarCuenta, crearMarca, desconectarCuenta, type Resultado } from "@/lib/marcas/acciones"
import { RUTA_DE_MARCAS } from "@/lib/sesion/rutas"
import { createActionClient } from "@/lib/supabase/action"

function despues(resultado: Resultado): Resultado {
  if (resultado.ok) revalidatePath(RUTA_DE_MARCAS)
  return resultado
}

export async function crearMarcaAccion(_previo: Resultado | null, datos: FormData): Promise<Resultado> {
  return despues(await crearMarca(await createActionClient(), { nombre: datos.get("nombre"), voz: datos.get("voz") }))
}

export async function agregarCuentaAccion(_previo: Resultado | null, datos: FormData): Promise<Resultado> {
  return despues(
    await agregarCuenta(await createActionClient(), {
      marcaId: datos.get("marcaId"),
      tipo: datos.get("tipo"),
      ruta: datos.get("ruta"),
      nombre: datos.get("nombre"),
      ritmoSemanal: datos.get("ritmoSemanal"),
    }),
  )
}

export async function desconectarCuentaAccion(datos: FormData): Promise<void> {
  const cuentaId = datos.get("cuentaId")
  if (typeof cuentaId !== "string") return
  const resultado = await desconectarCuenta(await createActionClient(), cuentaId)
  if (!resultado.ok) throw new Error(resultado.error)
  revalidatePath(RUTA_DE_MARCAS)
}
```

- [ ] **Step 7: Forms.** `app/(app)/marcas/formulario-marca.tsx`

```tsx
"use client"

import { useActionState } from "react"
import { crearMarcaAccion } from "./acciones"

export function FormularioMarca() {
  const [resultado, enviar, pendiente] = useActionState(crearMarcaAccion, null)
  return (
    <form action={enviar} className="space-y-3 rounded-lg border border-borde p-4">
      <h2 className="font-medium">Nueva marca</h2>
      <label className="block space-y-1">
        <span className="text-sm">Nombre</span>
        <input name="nombre" required maxLength={80} className="w-full rounded-lg border border-borde bg-background px-3 py-3" />
      </label>
      <fieldset className="space-y-1">
        <legend className="text-sm">Habla como</legend>
        <label className="mr-4"><input type="radio" name="voz" value="yo" defaultChecked /> «yo»</label>
        <label><input type="radio" name="voz" value="nosotros" /> «nosotros»</label>
      </fieldset>
      <button type="submit" disabled={pendiente} className="min-h-11 w-full rounded-lg bg-primario px-4 font-medium text-primario-texto">
        Crear marca
      </button>
      {resultado && !resultado.ok && <p role="alert" className="text-sm text-peligro">{resultado.error}</p>}
    </form>
  )
}
```

`app/(app)/marcas/formulario-cuenta.tsx`

```tsx
"use client"

import { useActionState } from "react"
import { agregarCuentaAccion } from "./acciones"

export function FormularioCuenta({ marcaId }: { marcaId: string }) {
  const [resultado, enviar, pendiente] = useActionState(agregarCuentaAccion, null)
  return (
    <form action={enviar} className="space-y-2">
      <input type="hidden" name="marcaId" value={marcaId} />
      <input
        name="nombre"
        required
        maxLength={80}
        placeholder="Nombre de la cuenta de LinkedIn"
        className="w-full rounded-lg border border-borde bg-background px-3 py-3"
      />
      <div className="flex gap-2">
        <select name="tipo" className="flex-1 rounded-lg border border-borde bg-background px-3 py-3" defaultValue="persona">
          <option value="persona">Perfil</option>
          <option value="empresa">Página</option>
        </select>
        <select name="ruta" className="flex-1 rounded-lg border border-borde bg-background px-3 py-3" defaultValue="api">
          <option value="api">Sale sola (API)</option>
          <option value="a_mano">A mano</option>
          <option value="metricool">Metricool</option>
        </select>
        <input name="ritmoSemanal" type="number" min={0} max={21} defaultValue={3} aria-label="Publicaciones por semana" className="w-16 rounded-lg border border-borde bg-background px-2 py-3" />
      </div>
      <button type="submit" disabled={pendiente} className="min-h-11 w-full rounded-lg border border-borde px-4 font-medium">
        Agregar cuenta
      </button>
      {resultado && !resultado.ok && <p role="alert" className="text-sm text-peligro">{resultado.error}</p>}
    </form>
  )
}
```

- [ ] **Step 8: Page** `app/(app)/marcas/page.tsx`

```tsx
import Link from "next/link"
import { estadoDeConexion } from "@/lib/marcas/estado-conexion"
import { createClient } from "@/lib/supabase/server"
import { desconectarCuentaAccion } from "./acciones"
import { EstadoDeConexionChip } from "./estado-de-conexion"
import { FormularioCuenta } from "./formulario-cuenta"
import { FormularioMarca } from "./formulario-marca"

const MENSAJES: Record<string, string> = {
  conectada: "LinkedIn quedó conectado.",
  cancelada: "Cancelaste la conexión en LinkedIn.",
  estado: "La conexión expiró o se abrió en otra pestaña. Vuelve a intentarlo.",
  permisos: "LinkedIn no dio permiso para publicar. Vuelve a conectar y acepta todos los permisos.",
  rechazada: "LinkedIn no aceptó la conexión. Vuelve a intentarlo.",
  sin_app: "Falta configurar la app de LinkedIn en el servidor.",
  fallo: "No pude conectar LinkedIn. Inténtalo de nuevo en un rato.",
}

const RUTAS: Record<string, string> = { api: "sale sola", a_mano: "a mano", metricool: "por Metricool" }

export default async function Marcas({ searchParams }: { searchParams: Promise<{ linkedin?: string }> }) {
  const { linkedin } = await searchParams
  const db = await createClient()
  const { data: marcas, error } = await db
    .from("marcas")
    .select("id, nombre, voz, cuentas(id, nombre, tipo, ruta, ritmo_semanal, conexiones(nombre, expira_en))")
    .order("creada_en")
  if (error) throw new Error(`No pude leer las marcas: ${error.message}`, { cause: error })
  const ahora = Date.now()

  return (
    <section className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">Marcas y cuentas</h1>
      {linkedin && MENSAJES[linkedin] && <p role="status" className="rounded-lg border border-borde p-3 text-sm">{MENSAJES[linkedin]}</p>}
      {marcas.map((marca) => (
        <article key={marca.id} className="space-y-3 rounded-lg border border-borde p-4">
          <header>
            <h2 className="text-lg font-medium">{marca.nombre}</h2>
            <p className="text-sm text-apagado">Habla como «{marca.voz}»</p>
          </header>
          <ul className="space-y-3">
            {marca.cuentas.map((cuenta) => (
              <li key={cuenta.id} className="space-y-2">
                <p className="font-medium">{cuenta.nombre}</p>
                <p className="text-sm text-apagado">
                  {cuenta.tipo === "persona" ? "Perfil" : "Página"} de LinkedIn · {RUTAS[cuenta.ruta]} · {cuenta.ritmo_semanal} por semana
                </p>
                {cuenta.ruta === "api" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <EstadoDeConexionChip estado={estadoDeConexion(cuenta.conexiones?.expira_en ?? null, ahora)} />
                    <Link href={`/api/linkedin/conectar?cuenta=${cuenta.id}`} className="min-h-11 rounded-lg border border-borde px-3 py-2 text-sm">
                      {cuenta.conexiones ? "Renovar LinkedIn" : "Conectar LinkedIn"}
                    </Link>
                    {cuenta.conexiones && (
                      <form action={desconectarCuentaAccion}>
                        <input type="hidden" name="cuentaId" value={cuenta.id} />
                        <button type="submit" className="min-h-11 px-3 text-sm text-apagado">Desconectar</button>
                      </form>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <FormularioCuenta marcaId={marca.id} />
        </article>
      ))}
      <FormularioMarca />
    </section>
  )
}
```

- [ ] **Step 9: Verify** — `pnpm test:run && pnpm type && pnpm lint && pnpm build`.
- [ ] **Step 10: Manual check with Federico (real LinkedIn consent, publishes nothing).** Prereqs from «What Federico does by hand» done. Open `http://localhost:3000` (not `127.0.0.1`: the state cookie must share the redirect's host). In «Federico Elgueta» add «LinkedIn de Federico» (Perfil, Sale sola, 3). In «WAV We Are Vision» add «Página de WAV» (Página, A mano, 3). Federico taps «Conectar LinkedIn» and accepts. Expected: «LinkedIn quedó conectado.» and «Conectada · vence en 60 días». Then `curl -s localhost:3000/marcas` while signed out returns a redirect, and the page HTML never contains the token (grep the first 8 characters of `credencial_de_cuenta` output run via the admin client in a scratch script; never print the full token).
- [ ] **Step 11: Commit** — `git add -A && git commit -m "feat: add the brands and accounts screen with LinkedIn connect"`

---

# Part D — Phase 0 smoke test: text post and PDF carousel

## Task 16: LinkedIn publishing API (text and document)

Written new (reference: Conidolly `lib/proveedores/linkedin.ts`): documents and posts only (no video), plus a text-only post. Version per the plano: `202610` (202511 sunsets 2026-11-16).

**Files:** Create `lib/linkedin/api.ts`, `tests/unit/linkedin-api.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { HttpResponse, http } from "msw"
import { describe, expect, test } from "vitest"
import { crearPost, estadoDelDocumento, RechazoDeLinkedin, RespuestaDudosa, subirDocumento, TokenDeLinkedinVencido } from "@/lib/linkedin/api"
import { servidor } from "../msw"

const API = "https://api.linkedin.com"
const AUTOR = "urn:li:person:abc"

describe("crearPost", () => {
  test("a text post has no content, carries the version headers and returns the URN", async () => {
    let cuerpo: Record<string, unknown> = {}
    let version: string | null = null
    servidor.use(
      http.post(`${API}/rest/posts`, async ({ request }) => {
        cuerpo = (await request.json()) as Record<string, unknown>
        version = request.headers.get("linkedin-version")
        return new HttpResponse(null, { status: 201, headers: { "x-restli-id": "urn:li:share:7001" } })
      }),
    )
    const urn = await crearPost({ token: "t", autor: AUTOR, commentary: "Hola", visibilidad: "CONNECTIONS" })
    expect(urn).toBe("urn:li:share:7001")
    expect(version).toBe("202610")
    expect(cuerpo).toMatchObject({ author: AUTOR, commentary: "Hola", visibility: "CONNECTIONS", lifecycleState: "PUBLISHED" })
    expect(cuerpo).not.toHaveProperty("content")
  })

  test("a carousel post points at the document with its title", async () => {
    let cuerpo: Record<string, unknown> = {}
    servidor.use(
      http.post(`${API}/rest/posts`, async ({ request }) => {
        cuerpo = (await request.json()) as Record<string, unknown>
        return new HttpResponse(null, { status: 201, headers: { "x-restli-id": "urn:li:share:7002" } })
      }),
    )
    await crearPost({ token: "t", autor: AUTOR, commentary: "x", visibilidad: "PUBLIC", documento: "urn:li:document:D1", titulo: "Tres lecciones" })
    expect(cuerpo.content).toEqual({ media: { id: "urn:li:document:D1", title: "Tres lecciones" } })
  })

  test("a 201 without a post id is doubtful: never send it again", async () => {
    servidor.use(http.post(`${API}/rest/posts`, () => new HttpResponse(null, { status: 201 })))
    await expect(crearPost({ token: "t", autor: AUTOR, commentary: "x", visibilidad: "PUBLIC" })).rejects.toBeInstanceOf(RespuestaDudosa)
  })

  test("401 means the connection expired; another 4xx is a definitive refusal without the token in the message", async () => {
    servidor.use(http.post(`${API}/rest/posts`, () => HttpResponse.text("expired", { status: 401 })))
    await expect(crearPost({ token: "t", autor: AUTOR, commentary: "x", visibilidad: "PUBLIC" })).rejects.toBeInstanceOf(TokenDeLinkedinVencido)
    servidor.use(http.post(`${API}/rest/posts`, () => HttpResponse.text("nope token-largo", { status: 422 })))
    const error = await crearPost({ token: "token-largo", autor: AUTOR, commentary: "x", visibilidad: "PUBLIC" }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RechazoDeLinkedin)
    expect(String(error)).not.toContain("token-largo")
  })
})

describe("documents", () => {
  test("initializes the upload for the member and PUTs the whole file with the token", async () => {
    let autorizacion: string | null = null
    let bytes = 0
    servidor.use(
      http.post(`${API}/rest/documents`, () =>
        HttpResponse.json({ value: { uploadUrl: "https://www.linkedin.com/dms-uploads/D1/0", document: "urn:li:document:D1" } }),
      ),
      http.put("https://www.linkedin.com/dms-uploads/D1/0", async ({ request }) => {
        autorizacion = request.headers.get("authorization")
        bytes = (await request.arrayBuffer()).byteLength
        return new HttpResponse(null, { status: 201 })
      }),
    )
    expect(await subirDocumento({ token: "t", autor: AUTOR, datos: new Uint8Array(10) })).toBe("urn:li:document:D1")
    expect(autorizacion).toBe("Bearer t")
    expect(bytes).toBe(10)
  })

  test("refuses an upload address that is not LinkedIn's", async () => {
    servidor.use(
      http.post(`${API}/rest/documents`, () =>
        HttpResponse.json({ value: { uploadUrl: "https://evil.example/u", document: "urn:li:document:D1" } }),
      ),
    )
    await expect(subirDocumento({ token: "t", autor: AUTOR, datos: new Uint8Array(1) })).rejects.toBeInstanceOf(RechazoDeLinkedin)
  })

  test("reads AVAILABLE as ready and PROCESSING_FAILED as failed", async () => {
    servidor.use(http.get(`${API}/rest/documents/:urn`, () => HttpResponse.json({ status: "AVAILABLE" })))
    expect(await estadoDelDocumento({ token: "t", documento: "urn:li:document:D1" })).toBe("listo")
    servidor.use(http.get(`${API}/rest/documents/:urn`, () => HttpResponse.json({ status: "PROCESSING_FAILED" })))
    expect(await estadoDelDocumento({ token: "t", documento: "urn:li:document:D1" })).toBe("fallido")
  })
})
```

- [ ] **Step 2: Fail.**
- [ ] **Step 3: Implement** `lib/linkedin/api.ts`

```ts
import { z } from "zod"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { baseDe } from "@/lib/proveedores/bases"
import { esUrnDePost } from "./dominio"

// Versioned REST APIs for a member (plano, Redes y APIs: Posts API ms.date 2026-05-07, Documents API 2026-06-19).
// Each version lives at least a year; bump it with a reviewed commit when it nears its sunset.
export const VERSION_DE_LINKEDIN = "202610"

const BASE_API = "https://api.linkedin.com"
const ESPERA_MS = 30_000
const ESPERA_SUBIDA_MS = 120_000

/** 401: expired or revoked. The owner renews it in Marcas. */
export class TokenDeLinkedinVencido extends FallaDeConfiguracion {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "TokenDeLinkedinVencido"
  }
}

/** A definitive "no" (4xx other than 401, 408, 429), including 426 for a sunset version. */
export class RechazoDeLinkedin extends FallaDeConfiguracion {
  constructor(
    readonly http: number,
    mensaje: string,
  ) {
    super(mensaje)
    this.name = "RechazoDeLinkedin"
  }
}

/** The post may or may not exist: a person checks the profile; it is never sent again. */
export class RespuestaDudosa extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "RespuestaDudosa"
  }
}

export type Visibilidad = "PUBLIC" | "CONNECTIONS"

const base = () => baseDe(process.env, "LINKEDIN_API_BASE_URL", BASE_API)

function cabeceras(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Linkedin-Version": VERSION_DE_LINKEDIN,
    "X-Restli-Protocol-Version": "2.0.0",
    "Content-Type": "application/json",
  }
}

async function llamar(url: string, init: RequestInit, ruta: string, token: string, espera = ESPERA_MS): Promise<Response> {
  let respuesta: Response
  try {
    respuesta = await fetch(url, { ...init, signal: AbortSignal.timeout(espera) })
  } catch (error) {
    // Deliberately without the URL: an upload URL is a credential.
    throw new Error(`No pude conectar con LinkedIn en ${ruta}.`, { cause: error })
  }
  if (respuesta.ok) return respuesta
  const detalle = (await respuesta.text()).slice(0, 300).split(token).join("[x]")
  const mensaje = `LinkedIn respondió HTTP ${respuesta.status} en ${ruta}: ${detalle}`
  if (respuesta.status === 401) throw new TokenDeLinkedinVencido(mensaje)
  if (respuesta.status >= 400 && respuesta.status < 500 && respuesta.status !== 408 && respuesta.status !== 429) {
    throw new RechazoDeLinkedin(respuesta.status, mensaje)
  }
  throw new Error(mensaje)
}

function esDireccionDeLinkedin(direccion: string): boolean {
  const url = new URL(direccion)
  if (url.origin === new URL(base()).origin) return true
  if (url.protocol !== "https:") return false
  return ["linkedin.com", "licdn.com"].some((d) => url.hostname === d || url.hostname.endsWith(`.${d}`))
}

const DocumentoIniciado = z.object({
  value: z.object({ uploadUrl: z.url(), document: z.string().regex(/^urn:li:document:[A-Za-z0-9_-]+$/) }),
})

/** A carousel's PDF: initializeUpload for the member, then one PUT of the whole file. Returns the document URN. */
export async function subirDocumento(entrada: { token: string; autor: string; datos: Uint8Array }): Promise<string> {
  const { token, autor, datos } = entrada
  const inicio = await llamar(
    `${base()}/rest/documents?action=initializeUpload`,
    { method: "POST", headers: cabeceras(token), body: JSON.stringify({ initializeUploadRequest: { owner: autor } }) },
    "initializeUpload del documento",
    token,
  )
  const leida = DocumentoIniciado.safeParse(await inicio.json())
  if (!leida.success) throw new Error("LinkedIn devolvió una respuesta inesperada en initializeUpload del documento.")
  const { uploadUrl, document } = leida.data.value
  // The PUT carries the member's token: it goes only to LinkedIn over https.
  if (!esDireccionDeLinkedin(uploadUrl)) {
    throw new RechazoDeLinkedin(inicio.status, "LinkedIn devolvió una dirección de subida que no es suya.")
  }
  await llamar(
    uploadUrl,
    { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" }, body: datos.slice() },
    "la subida del documento",
    token,
    ESPERA_SUBIDA_MS,
  )
  return document
}

export type EstadoDeDocumento = "listo" | "procesando" | "fallido"

export async function estadoDelDocumento(entrada: { token: string; documento: string }): Promise<EstadoDeDocumento> {
  const respuesta = await llamar(
    `${base()}/rest/documents/${encodeURIComponent(entrada.documento)}`,
    { method: "GET", headers: cabeceras(entrada.token) },
    "el estado del documento",
    entrada.token,
  )
  const leido = z.object({ status: z.string() }).safeParse(await respuesta.json())
  if (!leido.success) throw new Error("LinkedIn devolvió una respuesta inesperada al leer el documento.")
  if (leido.data.status === "AVAILABLE") return "listo"
  if (leido.data.status === "PROCESSING_FAILED") return "fallido"
  return "procesando"
}

export type PedidoDePost = { token: string; autor: string; commentary: string; visibilidad: Visibilidad } & (
  | { documento?: undefined }
  | { documento: string; titulo: string }
)

/** The 201 carries the post URN in `x-restli-id`. A text post has no `content`. */
export async function crearPost(pedido: PedidoDePost): Promise<string> {
  const respuesta = await llamar(
    `${base()}/rest/posts`,
    {
      method: "POST",
      headers: cabeceras(pedido.token),
      body: JSON.stringify({
        author: pedido.autor,
        commentary: pedido.commentary,
        visibility: pedido.visibilidad,
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        ...(pedido.documento ? { content: { media: { id: pedido.documento, title: pedido.titulo } } } : {}),
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
    },
    "posts",
    pedido.token,
  )
  const urn = respuesta.headers.get("x-restli-id")?.trim() ?? ""
  if (!esUrnDePost(urn)) throw new RespuestaDudosa(`LinkedIn respondió ${respuesta.status} sin un id de post válido.`)
  return urn
}
```

- [ ] **Step 4: Pass.**
- [ ] **Step 5: Commit** — `git add lib/linkedin/api.ts tests/unit/linkedin-api.test.ts && git commit -m "feat: port LinkedIn text and document publishing"`

## Task 17: Test carousel PDF

**Files:** Create `lib/fase0/pdf-de-prueba.ts`, `tests/unit/pdf-de-prueba.test.ts`. Install: `pnpm add -D pdf-lib`.

- [ ] **Step 1: Failing test**

```ts
import { PDFDocument } from "pdf-lib"
import { describe, expect, test } from "vitest"
import { Falla } from "@/lib/dominio/falla"
import { pdfDePrueba, repartir } from "@/lib/fase0/pdf-de-prueba"

describe("pdfDePrueba", () => {
  test("makes one 1080×1350 page per slide, with Spanish accents", async () => {
    const pdf = await PDFDocument.load(await pdfDePrueba(["Primera lámina", "Señal: ¿qué aprendí?"]))
    expect(pdf.getPageCount()).toBe(2)
    expect(pdf.getPage(0).getSize()).toEqual({ width: 1080, height: 1350 })
  })
  test("refuses an empty carousel", async () => {
    await expect(pdfDePrueba([])).rejects.toBeInstanceOf(Falla)
  })
})

describe("repartir", () => {
  test("wraps by words without cutting any and keeps explicit line breaks", () => {
    const cabe = (linea: string) => linea.length <= 10
    expect(repartir("uno dos tres cuatro\ncinco", cabe)).toEqual(["uno dos", "tres", "cuatro", "cinco"])
  })
})
```

- [ ] **Step 2: Fail.**
- [ ] **Step 3: Implement** `lib/fase0/pdf-de-prueba.ts`

```ts
import { PDFDocument, rgb, StandardFonts } from "pdf-lib"
import { Falla } from "@/lib/dominio/falla"
import { PAGINAS_MAXIMAS_DEL_DOCUMENTO } from "@/lib/linkedin/dominio"

// Phase 0 only proves that LinkedIn accepts a PDF from this app. The real carousel render (Playwright + brand
// templates) arrives with Plan C; this is plain black text on white, 4:5.
const ANCHO = 1080
const ALTO = 1350
const MARGEN = 96
const TAMANO = 64
const INTERLINEA = 84

export function repartir(texto: string, cabe: (linea: string) => boolean): string[] {
  const lineas: string[] = []
  for (const parrafo of texto.split("\n")) {
    let actual = ""
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const candidata = actual ? `${actual} ${palabra}` : palabra
      if (actual && !cabe(candidata)) {
        lineas.push(actual)
        actual = palabra
      } else {
        actual = candidata
      }
    }
    lineas.push(actual)
  }
  return lineas
}

/** Standard Helvetica covers Spanish (WinAnsi) but not emoji: pdf-lib throws on a character it cannot encode. */
export async function pdfDePrueba(laminas: readonly string[]): Promise<Uint8Array> {
  if (laminas.length === 0 || laminas.length > PAGINAS_MAXIMAS_DEL_DOCUMENTO) {
    throw new Falla(`Un carrusel de LinkedIn lleva entre 1 y ${PAGINAS_MAXIMAS_DEL_DOCUMENTO} láminas.`)
  }
  const pdf = await PDFDocument.create()
  const fuente = await pdf.embedFont(StandardFonts.HelveticaBold)
  const cabe = (linea: string) => fuente.widthOfTextAtSize(linea, TAMANO) <= ANCHO - 2 * MARGEN
  for (const lamina of laminas) {
    const pagina = pdf.addPage([ANCHO, ALTO])
    for (const [indice, linea] of repartir(lamina, cabe).entries()) {
      pagina.drawText(linea, { x: MARGEN, y: ALTO - MARGEN - TAMANO - indice * INTERLINEA, size: TAMANO, font: fuente, color: rgb(0, 0, 0) })
    }
  }
  return pdf.save()
}
```

- [ ] **Step 4: Pass.**
- [ ] **Step 5: Commit** — `git add lib/fase0/pdf-de-prueba.ts tests/unit/pdf-de-prueba.test.ts package.json pnpm-lock.yaml && git commit -m "feat: generate the phase 0 test carousel PDF"`

## Task 18: Signed smoke orchestration and its CLI

The plano's gate 2 in miniature: nothing goes out until a person sees the exact text (and the PDF) and signs. Here the signature is Federico typing `PUBLICAR` in his own terminal.

**Files:** Create `lib/fase0/prueba-linkedin.ts`, `scripts/prueba-linkedin.ts`, `tests/unit/prueba-linkedin.test.ts`. Modify `.gitignore` (add `/.fase0/`).

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, test, vi } from "vitest"
import { Falla } from "@/lib/dominio/falla"
import { type DepsDePrueba, publicarPrueba } from "@/lib/fase0/prueba-linkedin"

const AHORA = Date.parse("2026-10-28T12:00:00Z")
const CREDENCIAL = { token: "t", titular: "urn:li:person:abc", expiraEn: "2026-12-27T12:00:00Z" }

function deps(opciones: { firma?: boolean; estados?: ("listo" | "procesando" | "fallido")[] } = {}): DepsDePrueba {
  const estados = [...(opciones.estados ?? ["listo"])]
  return {
    api: {
      crearPost: vi.fn(async () => "urn:li:share:9001"),
      subirDocumento: vi.fn(async () => "urn:li:document:D1"),
      estadoDelDocumento: vi.fn(async () => (estados.length > 1 ? estados.shift() : estados[0]) ?? "listo"),
    },
    confirmar: vi.fn(async () => opciones.firma ?? true),
    esperar: vi.fn(async () => undefined),
    ahora: () => AHORA,
  }
}

describe("publicarPrueba", () => {
  test("publishes nothing and uploads nothing when the person does not sign", async () => {
    const d = deps({ firma: false })
    const pdf = new Uint8Array(5)
    expect(await publicarPrueba(d, CREDENCIAL, { paso: "carrusel", texto: "Hola", pdf, titulo: "T", visibilidad: "PUBLIC" })).toEqual({ estado: "cancelada" })
    expect(d.api.subirDocumento).not.toHaveBeenCalled()
    expect(d.api.crearPost).not.toHaveBeenCalled()
  })

  test("a signed text post goes out escaped and returns its link", async () => {
    const d = deps()
    const r = await publicarPrueba(d, CREDENCIAL, { paso: "texto", texto: "Prueba (1) #IA", visibilidad: "CONNECTIONS" })
    expect(r).toEqual({ estado: "publicada", urn: "urn:li:share:9001", enlace: "https://www.linkedin.com/feed/update/urn:li:share:9001/" })
    expect(d.api.crearPost).toHaveBeenCalledWith({
      token: "t",
      autor: "urn:li:person:abc",
      commentary: "Prueba \\(1\\) {hashtag|\\#|IA}",
      visibilidad: "CONNECTIONS",
    })
  })

  test("a signed carousel waits for the document to be ready before posting", async () => {
    const d = deps({ estados: ["procesando", "procesando", "listo"] })
    const r = await publicarPrueba(d, CREDENCIAL, { paso: "carrusel", texto: "x", pdf: new Uint8Array(5), titulo: "Tres lecciones", visibilidad: "PUBLIC" })
    expect(r.estado).toBe("publicada")
    expect(d.api.estadoDelDocumento).toHaveBeenCalledTimes(3)
    expect(d.api.crearPost).toHaveBeenCalledWith(expect.objectContaining({ documento: "urn:li:document:D1", titulo: "Tres lecciones" }))
  })

  test("a failed or slow document never becomes a post", async () => {
    const fallida = deps({ estados: ["fallido"] })
    expect((await publicarPrueba(fallida, CREDENCIAL, { paso: "carrusel", texto: "x", pdf: new Uint8Array(5), titulo: "T", visibilidad: "PUBLIC" })).estado).toBe("documento_fallido")
    const lenta = deps({ estados: ["procesando"] })
    expect((await publicarPrueba(lenta, CREDENCIAL, { paso: "carrusel", texto: "x", pdf: new Uint8Array(5), titulo: "T", visibilidad: "PUBLIC" })).estado).toBe("documento_tarde")
    expect(fallida.api.crearPost).not.toHaveBeenCalled()
    expect(lenta.api.crearPost).not.toHaveBeenCalled()
  })

  test("an expired connection or a text over 3000 characters stops before asking for the signature", async () => {
    const d = deps()
    await expect(publicarPrueba(d, { ...CREDENCIAL, expiraEn: "2026-10-01T00:00:00Z" }, { paso: "texto", texto: "x", visibilidad: "PUBLIC" })).rejects.toBeInstanceOf(Falla)
    await expect(publicarPrueba(d, CREDENCIAL, { paso: "texto", texto: "a".repeat(3001), visibilidad: "PUBLIC" })).rejects.toBeInstanceOf(Falla)
    expect(d.confirmar).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Fail.**
- [ ] **Step 3: Implement** `lib/fase0/prueba-linkedin.ts`

```ts
import { Falla } from "@/lib/dominio/falla"
import type { crearPost, EstadoDeDocumento, Visibilidad } from "@/lib/linkedin/api"
import { aLittleText, BYTES_MAXIMOS_DEL_DOCUMENTO, enlaceDePost, LARGO_MAXIMO_DEL_TEXTO, tituloDelDocumento } from "@/lib/linkedin/dominio"

const SONDEOS_MAXIMOS = 20
const ESPERA_ENTRE_SONDEOS_MS = 3_000

export interface DepsDePrueba {
  api: {
    crearPost: typeof crearPost
    subirDocumento: (entrada: { token: string; autor: string; datos: Uint8Array }) => Promise<string>
    estadoDelDocumento: (entrada: { token: string; documento: string }) => Promise<EstadoDeDocumento>
  }
  /** Shows what will go out, exactly, and answers true only if the person signs. */
  confirmar: (resumen: string) => Promise<boolean>
  esperar: (ms: number) => Promise<void>
  ahora: () => number
}

export interface Credencial {
  token: string
  titular: string
  expiraEn: string
}

export type PedidoDePrueba =
  | { paso: "texto"; texto: string; visibilidad: Visibilidad }
  | { paso: "carrusel"; texto: string; pdf: Uint8Array; titulo: string; visibilidad: Visibilidad }

export type ResultadoDePrueba =
  | { estado: "cancelada" }
  | { estado: "publicada"; urn: string; enlace: string }
  | { estado: "documento_fallido" | "documento_tarde"; documento: string }

function resumenDe(pedido: PedidoDePrueba): string {
  const lineas = [`Paso: ${pedido.paso}`, `Visibilidad: ${pedido.visibilidad}`, "Texto exacto:", "-----", pedido.texto, "-----"]
  if (pedido.paso === "carrusel") lineas.push(`Título del documento: ${tituloDelDocumento(pedido.titulo)}`, `PDF: ${pedido.pdf.byteLength} bytes`)
  return lineas.join("\n")
}

async function esperarDocumento(deps: DepsDePrueba, token: string, documento: string): Promise<EstadoDeDocumento> {
  for (let sondeo = 0; sondeo < SONDEOS_MAXIMOS; sondeo++) {
    const estado = await deps.api.estadoDelDocumento({ token, documento })
    if (estado !== "procesando") return estado
    await deps.esperar(ESPERA_ENTRE_SONDEOS_MS)
  }
  return "procesando"
}

/** Phase 0: one signed post on Federico's profile. No retries: a doubtful answer is checked by a person. */
export async function publicarPrueba(deps: DepsDePrueba, credencial: Credencial, pedido: PedidoDePrueba): Promise<ResultadoDePrueba> {
  if (Date.parse(credencial.expiraEn) <= deps.ahora()) throw new Falla("La conexión de LinkedIn venció. Renuévala en Marcas.")
  const texto = pedido.texto.trim()
  if (!texto || texto.length > LARGO_MAXIMO_DEL_TEXTO) throw new Falla(`El texto debe tener entre 1 y ${LARGO_MAXIMO_DEL_TEXTO} caracteres.`)
  if (pedido.paso === "carrusel" && pedido.pdf.byteLength > BYTES_MAXIMOS_DEL_DOCUMENTO) throw new Falla("El PDF pasa los 100 MB que acepta LinkedIn.")

  if (!(await deps.confirmar(resumenDe(pedido)))) return { estado: "cancelada" }

  const base = { token: credencial.token, autor: credencial.titular, commentary: aLittleText(texto), visibilidad: pedido.visibilidad }
  if (pedido.paso === "texto") {
    const urn = await deps.api.crearPost(base)
    return { estado: "publicada", urn, enlace: enlaceDePost(urn) }
  }

  const documento = await deps.api.subirDocumento({ token: credencial.token, autor: credencial.titular, datos: pedido.pdf })
  const estado = await esperarDocumento(deps, credencial.token, documento)
  if (estado === "fallido") return { estado: "documento_fallido", documento }
  if (estado === "procesando") return { estado: "documento_tarde", documento }
  const urn = await deps.api.crearPost({ ...base, documento, titulo: tituloDelDocumento(pedido.titulo) })
  return { estado: "publicada", urn, enlace: enlaceDePost(urn) }
}
```

`scripts/prueba-linkedin.ts`

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { createInterface } from "node:readline/promises"
import { parseArgs } from "node:util"
import { Falla } from "@/lib/dominio/falla"
import { pdfDePrueba } from "@/lib/fase0/pdf-de-prueba"
import { type PedidoDePrueba, publicarPrueba } from "@/lib/fase0/prueba-linkedin"
import { crearPost, estadoDelDocumento, RespuestaDudosa, subirDocumento } from "@/lib/linkedin/api"
import { createAdminClient } from "@/lib/supabase/admin"

const USO =
  "Uso: pnpm prueba:linkedin texto --texto <archivo> --visibilidad PUBLIC|CONNECTIONS\n" +
  "     pnpm prueba:linkedin carrusel --texto <archivo> --laminas <archivo> --titulo <texto> --visibilidad PUBLIC|CONNECTIONS"

async function firmar(resumen: string): Promise<boolean> {
  console.log(`\n${resumen}\n`)
  const consola = createInterface({ input: process.stdin, output: process.stdout })
  const respuesta = await consola.question("Escribe PUBLICAR para firmar y publicar en tu LinkedIn (cualquier otra cosa cancela): ")
  consola.close()
  return respuesta.trim() === "PUBLICAR"
}

async function credencial() {
  const db = createAdminClient()
  const { data: cuentas, error } = await db
    .from("cuentas")
    .select("id, nombre")
    .eq("red", "linkedin")
    .eq("tipo", "persona")
    .eq("ruta", "api")
    .not("conexion_id", "is", null)
  if (error) throw new Error(`No pude leer las cuentas: ${error.message}`)
  const [cuenta, ...otras] = cuentas
  if (!cuenta || otras.length > 0) throw new Falla("Debe haber exactamente un perfil de LinkedIn conectado por API.")
  const { data, error: errorDeCredencial } = await db.rpc("credencial_de_cuenta", { p_cuenta: cuenta.id }).single()
  if (errorDeCredencial) throw new Error(`No pude leer la conexión: ${errorDeCredencial.message}`)
  console.log(`Cuenta: ${cuenta.nombre}`)
  return { token: data.token, titular: data.titular, expiraEn: data.expira_en }
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { texto: { type: "string" }, laminas: { type: "string" }, titulo: { type: "string" }, visibilidad: { type: "string" } },
  })
  const [paso] = positionals
  const visibilidad = values.visibilidad
  if ((paso !== "texto" && paso !== "carrusel") || !values.texto || (visibilidad !== "PUBLIC" && visibilidad !== "CONNECTIONS")) {
    console.error(USO)
    process.exitCode = 1
    return
  }
  const texto = await readFile(values.texto, "utf8")
  let pedido: PedidoDePrueba = { paso: "texto", texto, visibilidad }
  if (paso === "carrusel") {
    if (!values.laminas || !values.titulo) {
      console.error(USO)
      process.exitCode = 1
      return
    }
    const laminas = (await readFile(values.laminas, "utf8")).split(/\n\s*\n/).map((l) => l.trim()).filter(Boolean)
    const pdf = await pdfDePrueba(laminas)
    await mkdir(".fase0", { recursive: true })
    await writeFile(".fase0/carrusel-de-prueba.pdf", pdf)
    console.log(`PDF de ${laminas.length} láminas en .fase0/carrusel-de-prueba.pdf: ábrelo antes de firmar.`)
    pedido = { paso: "carrusel", texto, pdf, titulo: values.titulo, visibilidad }
  }

  const resultado = await publicarPrueba(
    {
      api: { crearPost, subirDocumento, estadoDelDocumento },
      confirmar: firmar,
      esperar: (ms) => new Promise((listo) => setTimeout(listo, ms)),
      ahora: Date.now,
    },
    await credencial(),
    pedido,
  )
  switch (resultado.estado) {
    case "cancelada":
      console.log("Cancelado. No salió nada.")
      break
    case "publicada":
      console.log(`Publicado: ${resultado.enlace}`)
      break
    default:
      console.log(`LinkedIn no dejó listo el documento (${resultado.estado}, ${resultado.documento}). No se creó el post.`)
  }
}

main().catch((error: unknown) => {
  if (error instanceof RespuestaDudosa) {
    console.error("LinkedIn no respondió claro: puede que el post haya salido. Revisa tu perfil y NO lo vuelvas a correr.")
  } else {
    console.error(error instanceof Error ? error.message : error)
  }
  process.exitCode = 1
})
```

- [ ] **Step 4: Pass** — `pnpm test:run && pnpm type && pnpm lint`.
- [ ] **Step 5: Dry check without publishing** — `pnpm prueba:linkedin carrusel --texto README.md --laminas README.md --titulo "x" --visibilidad CONNECTIONS`, answer anything but `PUBLICAR` → «Cancelado. No salió nada.» and `.fase0/carrusel-de-prueba.pdf` exists. No network call to `/rest/*` was made (it is not reached before the signature).
- [ ] **Step 6: Commit** — `git add lib/fase0 scripts/prueba-linkedin.ts tests/unit/prueba-linkedin.test.ts .gitignore && git commit -m "feat: add the signed phase 0 LinkedIn smoke script"`

## Task 19: GATE — real publication on Federico's profile (closes phase 0)

**Files:** Create `docs/fase-0/post-de-prueba.md`, `docs/fase-0/carrusel-de-prueba.md`, `docs/fase-0/resultados.md`

- [ ] **Step 1: Ask Federico** (stop and wait) for: the text of the post and the carousel slides in his voice («yo»), the visibility (`CONNECTIONS` makes less noise; `PUBLIC` is the real case), and whether he wants to run now. The agent may propose drafts; Federico edits and approves them. Respect the voice rules: no client named without registered permission; «+20 años» and «+200 proyectos» are Federico's, not WAV's.
- [ ] **Step 2: Save his approved text** as `docs/fase-0/post-de-prueba.md` (post text) and `docs/fase-0/carrusel-de-prueba.md` (slides separated by a blank line; plain Spanish, no emoji).
- [ ] **Step 3: Federico runs, in his own terminal** (the agent gives him the commands and does not run them):

```bash
pnpm prueba:linkedin texto --texto docs/fase-0/post-de-prueba.md --visibilidad CONNECTIONS
```

```bash
pnpm prueba:linkedin carrusel --texto docs/fase-0/post-de-prueba.md --laminas docs/fase-0/carrusel-de-prueba.md --titulo "Título del carrusel" --visibilidad CONNECTIONS
```

He reads the summary, opens the PDF for the second one, and types `PUBLICAR` himself each time.

- [ ] **Step 4: Record the outcome** in `docs/fase-0/resultados.md`: date, both links, visibility, and the D2 plan-B answer: if the carousel posted, «Share on LinkedIn (`w_member_social`) acepta documentos PDF por /rest/posts: el perfil publica carruseles PDF por API»; if `initializeUpload` or the post was refused (`RechazoDeLinkedin`, HTTP code), record the code and «plan B: multiimagen o a mano». Ask Federico to update the plano's phase 0 checklist (first real PDF carousel by API) and D2 with this result.
- [ ] **Step 5: Commit** (after asking) — `git add docs/fase-0 && git commit -m "docs: record the phase 0 LinkedIn smoke results"`

---

# Part E — Web push on the installed app

## Task 20: Push subscriptions table

**Files:** Create `supabase/migrations/20261028120200_suscripciones_push.sql`, `tests/integration/suscripciones.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, test } from "vitest"
import { marcaConDueno, personaConSesion } from "./entorno"

const fila = (sufijo: string) => ({ endpoint: `https://push.prueba.test/${sufijo}`, p256dh: "clave", auth: "auth" })

describe("push subscriptions", () => {
  test("a member stores and sees only their own devices", async () => {
    const ana = await personaConSesion("push-ana")
    await marcaConDueno(ana.userId)
    const otra = await personaConSesion("push-otra")
    await marcaConDueno(otra.userId)
    expect((await ana.db.from("suscripciones_push").insert(fila(`a${Date.now()}`))).error).toBeNull()
    const { data } = await otra.db.from("suscripciones_push").select("id")
    expect(data).toEqual([])
  })

  test("someone without a brand cannot subscribe, and an endpoint must be https", async () => {
    const nadie = await personaConSesion("push-nadie")
    expect((await nadie.db.from("suscripciones_push").insert(fila(`n${Date.now()}`))).error).not.toBeNull()
    const ana = await personaConSesion("push-http")
    await marcaConDueno(ana.userId)
    const { error } = await ana.db.from("suscripciones_push").insert({ ...fila("x"), endpoint: "http://inseguro.test/x" })
    expect(error?.code).toBe("23514")
  })
})
```

- [ ] **Step 2: Fail.**
- [ ] **Step 3: Migration** (written new, one row per member and device)

```sql
-- Devices where a member asked for notices. Whoever has an endpoint and its keys can push to that phone, so only the
-- owner sees their own and the sender (service role) reads them.
create table public.suscripciones_push (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 2048),
  p256dh text not null check (length(p256dh) between 1 and 512),
  auth text not null check (length(auth) between 1 and 512),
  user_agent text check (length(user_agent) <= 300),
  creada_en timestamptz not null default now()
);

alter table public.suscripciones_push enable row level security;

create policy "cada miembro ve sus aparatos" on public.suscripciones_push for select to authenticated
  using (user_id = auth.uid());
create policy "cada miembro suscribe su aparato" on public.suscripciones_push for insert to authenticated
  with check (user_id = auth.uid() and public.tiene_acceso());
create policy "cada miembro quita su aparato" on public.suscripciones_push for delete to authenticated
  using (user_id = auth.uid());

revoke all on public.suscripciones_push from anon, authenticated;
grant select, insert, delete on public.suscripciones_push to authenticated;
```

- [ ] **Step 4: Pass** — `pnpm db:reset && pnpm db:types && pnpm test:db`.
- [ ] **Step 5: Commit** — `git add supabase lib/supabase/database.types.ts tests/integration/suscripciones.test.ts && git commit -m "feat: store push subscriptions per member"`

## Task 21: Push sender and device state

**Files:** Create `lib/avisos/tipos.ts`, `lib/avisos/push.ts`, `lib/avisos/dispositivo.ts`, `tests/unit/push.test.ts`, `tests/unit/dispositivo.test.ts`. Install: `pnpm add web-push && pnpm add -D @types/web-push`.

- [ ] **Step 1: Failing tests** `tests/unit/push.test.ts`

```ts
import { createECDH, randomBytes } from "node:crypto"
import { HttpResponse, http } from "msw"
import { generateVAPIDKeys } from "web-push"
import { describe, expect, test } from "vitest"
import { servicioPushVapid } from "@/lib/avisos/push"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { servidor } from "../msw"

function suscripcion() {
  const ecdh = createECDH("prime256v1")
  ecdh.generateKeys()
  return {
    endpoint: "https://push.prueba.test/aparato",
    p256dh: ecdh.getPublicKey().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
  }
}

function servicio() {
  const { publicKey, privateKey } = generateVAPIDKeys()
  return servicioPushVapid({ clavePublica: publicKey, clavePrivada: privateKey, asunto: "mailto:avisos@prueba.test" })
}

const MENSAJE = { titulo: "PostIA", cuerpo: "Así se ven tus avisos.", url: "/" }

describe("servicioPushVapid", () => {
  test("sends an encrypted push to the endpoint", async () => {
    let cifrado: string | null = null
    servidor.use(
      http.post("https://push.prueba.test/aparato", ({ request }) => {
        cifrado = request.headers.get("content-encoding")
        return new HttpResponse(null, { status: 201 })
      }),
    )
    expect(await servicio().enviar(suscripcion(), MENSAJE, { urgente: false })).toEqual({ estado: "enviado" })
    expect(cifrado).toBe("aes128gcm")
  })

  test("a 410 means the device forgot the subscription", async () => {
    servidor.use(http.post("https://push.prueba.test/aparato", () => new HttpResponse(null, { status: 410 })))
    expect(await servicio().enviar(suscripcion(), MENSAJE, { urgente: false })).toEqual({ estado: "caducada" })
  })

  test("refuses malformed VAPID keys", () => {
    expect(() => servicioPushVapid({ clavePublica: "x", clavePrivada: "y", asunto: "mailto:a@b.cl" })).toThrow(FallaDeConfiguracion)
  })
})
```

`tests/unit/dispositivo.test.ts`

```ts
import { describe, expect, test } from "vitest"
import { estadoDeAvisos } from "@/lib/avisos/dispositivo"

const BASE = { configurado: true, ios: false, instalada: false, soportado: true, permiso: "default" as const, suscrito: false }

describe("estadoDeAvisos", () => {
  test("an iPhone in Safari is told to install the app, not that it cannot", () => {
    expect(estadoDeAvisos({ ...BASE, ios: true, soportado: false })).toBe("instalar")
  })
  test("is ready to activate, active once subscribed, and blocked when denied", () => {
    expect(estadoDeAvisos(BASE)).toBe("listo")
    expect(estadoDeAvisos({ ...BASE, permiso: "granted", suscrito: true })).toBe("activo")
    expect(estadoDeAvisos({ ...BASE, permiso: "denied" })).toBe("denegado")
  })
  test("is unavailable without server keys", () => {
    expect(estadoDeAvisos({ ...BASE, configurado: false })).toBe("no_disponible")
  })
})
```

- [ ] **Step 2: Fail.**
- [ ] **Step 3: Implement.** `lib/avisos/tipos.ts`

```ts
/** What a push carries. The service worker shows `titulo`/`cuerpo` and opens `url` (own paths only). */
export interface MensajePush {
  titulo: string
  cuerpo: string
  url: string
}

export interface SuscripcionDelNavegador {
  endpoint: string
  p256dh: string
  auth: string
  userAgent: string
}
```

`lib/avisos/push.ts`

```ts
import { generateRequestDetails } from "web-push"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { exigirEnv } from "@/lib/env"
import type { MensajePush } from "./tipos"

export interface SuscripcionPush {
  endpoint: string
  p256dh: string
  auth: string
}

export type ResultadoPush = { estado: "enviado" } | { estado: "caducada" } | { estado: "fallo"; detalle: string }

export interface ServicioPush {
  enviar(suscripcion: SuscripcionPush, mensaje: MensajePush, opciones: { urgente: boolean }): Promise<ResultadoPush>
}

// RFC 8030: a notice not delivered within a day is useless.
const VIDA_DEL_MENSAJE_S = 86_400
const MAXIMO_DE_CARGA_BYTES = 3000
const ESPERA_MS = 15_000
const ASUNTO_VALIDO = /^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/

function exigirClave(nombre: string, valor: string, bytes: number) {
  if (Buffer.from(valor, "base64url").length !== bytes) {
    throw new FallaDeConfiguracion(`${nombre} no es una llave VAPID válida (${bytes} bytes en base64 url-safe).`)
  }
}

/**
 * Web Push with VAPID: `web-push` builds the request (RFC 8291 encryption, RFC 8292 signature) and `fetch` sends it,
 * with a timeout and visible to MSW. The endpoint is a capability: it never appears in an error or a log.
 */
export function servicioPushVapid(opciones: { clavePublica: string; clavePrivada: string; asunto: string }): ServicioPush {
  exigirClave("VAPID_PUBLIC_KEY", opciones.clavePublica, 65)
  exigirClave("VAPID_PRIVATE_KEY", opciones.clavePrivada, 32)
  if (!ASUNTO_VALIDO.test(opciones.asunto)) throw new FallaDeConfiguracion("VAPID_SUBJECT debe ser una dirección mailto: o https:.")
  return {
    async enviar(suscripcion, mensaje, { urgente }) {
      const carga = JSON.stringify(mensaje)
      if (Buffer.byteLength(carga) > MAXIMO_DE_CARGA_BYTES) throw new Error("El mensaje de push es demasiado grande.")
      const detalles = generateRequestDetails(
        { endpoint: suscripcion.endpoint, keys: { p256dh: suscripcion.p256dh, auth: suscripcion.auth } },
        carga,
        {
          TTL: VIDA_DEL_MENSAJE_S,
          urgency: urgente ? "high" : "normal",
          vapidDetails: { subject: opciones.asunto, publicKey: opciones.clavePublica, privateKey: opciones.clavePrivada },
        },
      )
      let respuesta: Response
      try {
        respuesta = await fetch(detalles.endpoint, {
          method: "POST",
          headers: detalles.headers,
          body: new Uint8Array(detalles.body),
          signal: AbortSignal.timeout(ESPERA_MS),
        })
      } catch (error) {
        const causa = error instanceof Error ? error.name : "error desconocido"
        return { estado: "fallo", detalle: `No pude conectar con el servicio de push (${causa}).` }
      }
      if (respuesta.ok) return { estado: "enviado" }
      if (respuesta.status === 404 || respuesta.status === 410) return { estado: "caducada" }
      return { estado: "fallo", detalle: `El servicio de push respondió HTTP ${respuesta.status}.` }
    },
  }
}

export function servicioPushReal(entorno: Record<string, string | undefined> = process.env): ServicioPush {
  return servicioPushVapid({
    clavePublica: exigirEnv("VAPID_PUBLIC_KEY", entorno.VAPID_PUBLIC_KEY),
    clavePrivada: exigirEnv("VAPID_PRIVATE_KEY", entorno.VAPID_PRIVATE_KEY),
    asunto: exigirEnv("VAPID_SUBJECT", entorno.VAPID_SUBJECT),
  })
}
```

`lib/avisos/dispositivo.ts` (written new; Conidolly is only a reference)

```ts
/** What the device reports, plus whether the server has VAPID keys. */
export interface EntornoDeAvisos {
  configurado: boolean
  ios: boolean
  instalada: boolean
  soportado: boolean
  permiso: NotificationPermission
  suscrito: boolean
}

export type EstadoDeAvisos = "no_disponible" | "instalar" | "denegado" | "listo" | "activo"

/** Order matters: an iPhone in Safari reports no push support, but the fix there is installing the app. */
export function estadoDeAvisos(e: EntornoDeAvisos): EstadoDeAvisos {
  if (!e.configurado) return "no_disponible"
  if (e.ios && !e.instalada) return "instalar"
  if (!e.soportado) return "no_disponible"
  if (e.permiso === "denied") return "denegado"
  if (e.suscrito && e.permiso === "granted") return "activo"
  return "listo"
}
```

- [ ] **Step 4: Pass.**
- [ ] **Step 5: Commit** — `git add lib/avisos tests/unit/push.test.ts tests/unit/dispositivo.test.ts package.json pnpm-lock.yaml && git commit -m "feat: add the VAPID push sender and device state"`

## Task 22: Subscribe actions and test notice

**Files:** Create `lib/avisos/acciones.ts`, `tests/integration/acciones-avisos.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, test, vi } from "vitest"
import { enviarAvisoDePrueba, guardarSuscripcion } from "@/lib/avisos/acciones"
import type { ServicioPush } from "@/lib/avisos/push"
import { marcaConDueno, personaConSesion } from "./entorno"

const aparato = (n: string) => ({ endpoint: `https://push.prueba.test/${n}`, p256dh: "k", auth: "a", userAgent: "iPhone" })

describe("notice actions", () => {
  test("rejects a non-https endpoint before touching the database", async () => {
    const { db, userId } = await personaConSesion("av-http")
    await marcaConDueno(userId)
    expect(await guardarSuscripcion(db, { ...aparato("x"), endpoint: "http://x.test" })).toEqual({ ok: false, error: "Ese aparato no se puede suscribir." })
  })

  test("sends the test notice to every own device and forgets the expired ones", async () => {
    const { db, userId } = await personaConSesion("av-envio")
    await marcaConDueno(userId)
    const vivo = `vivo${Date.now()}`
    const muerto = `muerto${Date.now()}`
    await guardarSuscripcion(db, aparato(vivo))
    await guardarSuscripcion(db, aparato(muerto))
    const servicio: ServicioPush = {
      enviar: vi.fn(async (s) => (s.endpoint.endsWith(muerto) ? { estado: "caducada" as const } : { estado: "enviado" as const })),
    }
    expect(await enviarAvisoDePrueba(db, servicio)).toEqual({ enviados: 1, caducadas: 1, fallos: 0 })
    const { data } = await db.from("suscripciones_push").select("endpoint")
    expect(data?.map((f) => f.endpoint)).toEqual([`https://push.prueba.test/${vivo}`])
  })
})
```

- [ ] **Step 2: Fail.**
- [ ] **Step 3: Implement** `lib/avisos/acciones.ts`

```ts
import { z } from "zod"
import type { Db } from "@/lib/supabase/database"
import type { ServicioPush } from "./push"

const Suscripcion = z.object({
  endpoint: z.url().startsWith("https://").max(2048),
  p256dh: z.string().min(1).max(512),
  auth: z.string().min(1).max(512),
  userAgent: z.string().max(300),
})

export type Resultado = { ok: true } | { ok: false; error: string }

export async function guardarSuscripcion(db: Db, entrada: unknown): Promise<Resultado> {
  const leida = Suscripcion.safeParse(entrada)
  if (!leida.success) return { ok: false, error: "Ese aparato no se puede suscribir." }
  const { endpoint, p256dh, auth, userAgent } = leida.data
  const { error } = await db.from("suscripciones_push").insert({ endpoint, p256dh, auth, user_agent: userAgent })
  // The same device subscribing again is already there.
  if (!error || error.code === "23505") return { ok: true }
  console.error("No pude guardar la suscripción", error.code)
  return { ok: false, error: "No pude activar los avisos. Inténtalo de nuevo." }
}

export async function quitarSuscripcion(db: Db, endpoint: string): Promise<void> {
  const { error } = await db.from("suscripciones_push").delete().eq("endpoint", endpoint)
  if (error) throw new Error(`No pude quitar el aparato: ${error.message}`, { cause: error })
}

export async function enviarAvisoDePrueba(db: Db, servicio: ServicioPush): Promise<{ enviados: number; caducadas: number; fallos: number }> {
  const { data, error } = await db.from("suscripciones_push").select("endpoint, p256dh, auth")
  if (error) throw new Error(`No pude leer tus aparatos: ${error.message}`, { cause: error })
  const cuenta = { enviados: 0, caducadas: 0, fallos: 0 }
  for (const suscripcion of data) {
    const resultado = await servicio.enviar(suscripcion, { titulo: "PostIA", cuerpo: "Así se ven tus avisos.", url: "/" }, { urgente: false })
    if (resultado.estado === "enviado") cuenta.enviados++
    else if (resultado.estado === "caducada") {
      cuenta.caducadas++
      await quitarSuscripcion(db, suscripcion.endpoint)
    } else {
      cuenta.fallos++
      console.error(resultado.detalle)
    }
  }
  return cuenta
}
```

- [ ] **Step 4: Pass** — `pnpm test:db`.
- [ ] **Step 5: Commit** — `git add lib/avisos/acciones.ts tests/integration/acciones-avisos.test.ts && git commit -m "feat: subscribe devices and send a test notice"`

## Task 23: Service worker and the «Avisos en tu celular» section

**Files:** Create `public/sw.js`, `lib/avisos/navegador.ts`, `app/(app)/ajustes/page.tsx`, `app/(app)/ajustes/acciones.ts`, `app/(app)/ajustes/avisos-del-celular.tsx`, `tests/unit/avisos-del-celular.test.tsx`

- [ ] **Step 1: Failing component test**

```tsx
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { AvisosDelCelular } from "@/app/(app)/ajustes/avisos-del-celular"
import type { PuertoDeAvisos } from "@/lib/avisos/navegador"

function puerto(datos: Partial<Awaited<ReturnType<PuertoDeAvisos["leer"]>>> = {}): PuertoDeAvisos {
  return {
    leer: vi.fn(async () => ({ ios: false, instalada: false, soportado: true, permiso: "default" as const, suscrito: false, ...datos })),
    activar: vi.fn(async () => ({ estado: "activada" as const, suscripcion: { endpoint: "https://p.test/1", p256dh: "k", auth: "a", userAgent: "x" } })),
    desactivar: vi.fn(async () => null),
  }
}

describe("AvisosDelCelular", () => {
  test("on an iPhone outside the installed app, explains how to install it", async () => {
    render(<AvisosDelCelular claveVapid="k" puerto={puerto({ ios: true, soportado: false })} guardar={vi.fn()} probar={vi.fn()} />)
    expect(await screen.findByText(/Compartir.*Agregar a inicio/)).toBeInTheDocument()
  })

  test("activating subscribes this device and saves it", async () => {
    const p = puerto()
    const guardar = vi.fn(async () => ({ ok: true as const }))
    render(<AvisosDelCelular claveVapid="k" puerto={p} guardar={guardar} probar={vi.fn()} />)
    fireEvent.click(await screen.findByRole("button", { name: "Activar avisos" }))
    expect(await screen.findByRole("button", { name: "Mandar aviso de prueba" })).toBeInTheDocument()
    expect(p.activar).toHaveBeenCalledWith("k")
    expect(guardar).toHaveBeenCalledWith({ endpoint: "https://p.test/1", p256dh: "k", auth: "a", userAgent: "x" })
  })
})
```

- [ ] **Step 2: Fail.**
- [ ] **Step 3: Implement.** `lib/avisos/navegador.ts` (written new)

```ts
import type { SuscripcionDelNavegador } from "./tipos"

export interface DatosDelDispositivo {
  ios: boolean
  instalada: boolean
  soportado: boolean
  permiso: NotificationPermission
  suscrito: boolean
}

export type ResultadoDeActivar = { estado: "activada"; suscripcion: SuscripcionDelNavegador } | { estado: "denegada" }

/** The only door to browser push APIs, so components can be tested with a fake. */
export interface PuertoDeAvisos {
  leer(): Promise<DatosDelDispositivo>
  activar(claveVapid: string): Promise<ResultadoDeActivar>
  desactivar(): Promise<null>
}

function bytesDeBase64Url(texto: string): Uint8Array<ArrayBuffer> {
  const base64 = (texto + "=".repeat((4 - (texto.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

function esIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
}

function estaInstalada(): boolean {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone
  return window.matchMedia("(display-mode: standalone)").matches || standalone === true
}

function soportaPush(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
}

export function puertoDelNavegador(): PuertoDeAvisos {
  return {
    async leer() {
      const soportado = soportaPush()
      let suscrito = false
      if (soportado) {
        const registro = await navigator.serviceWorker.getRegistration("/")
        suscrito = Boolean(await registro?.pushManager.getSubscription())
      }
      const permiso: NotificationPermission = soportado ? Notification.permission : "default"
      return { ios: esIos(), instalada: estaInstalada(), soportado, permiso, suscrito }
    },
    async activar(claveVapid) {
      // Called straight from the tap: iOS only shows the permission prompt inside a user gesture.
      const permiso = await Notification.requestPermission()
      if (permiso !== "granted") return { estado: "denegada" }
      await navigator.serviceWorker.register("/sw.js", { scope: "/" })
      const registro = await navigator.serviceWorker.ready
      const suscripcion =
        (await registro.pushManager.getSubscription()) ??
        (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytesDeBase64Url(claveVapid) }))
      const { keys } = suscripcion.toJSON()
      return {
        estado: "activada",
        suscripcion: { endpoint: suscripcion.endpoint, p256dh: keys?.p256dh ?? "", auth: keys?.auth ?? "", userAgent: navigator.userAgent },
      }
    },
    async desactivar() {
      const registro = await navigator.serviceWorker.getRegistration("/")
      await (await registro?.pushManager.getSubscription())?.unsubscribe()
      return null
    },
  }
}
```

`public/sw.js` (written new)

```js
// PostIA service worker: shows each push as a notification and opens only the app's own routes.
// No fetch handler and no cache: the app is always online.
const TITULO_POR_DEFECTO = "PostIA"

self.addEventListener("push", (event) => {
  let datos = {}
  try {
    datos = event.data ? event.data.json() : {}
  } catch {
    datos = { cuerpo: event.data ? event.data.text() : "" }
  }
  const url = typeof datos.url === "string" ? datos.url : "/"
  event.waitUntil(
    self.registration.showNotification(datos.titulo || TITULO_POR_DEFECTO, {
      body: datos.cuerpo || "",
      icon: "/icon",
      data: { url },
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const destino = new URL(event.notification.data?.url || "/", self.location.origin)
  if (destino.origin !== self.location.origin) return
  event.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      for (const ventana of ventanas) {
        if ("focus" in ventana) {
          await ventana.navigate(destino.href)
          return ventana.focus()
        }
      }
      return self.clients.openWindow(destino.href)
    })(),
  )
})
```

`app/(app)/ajustes/avisos-del-celular.tsx`

```tsx
"use client"

import { useEffect, useState, useTransition } from "react"
import { estadoDeAvisos, type EstadoDeAvisos } from "@/lib/avisos/dispositivo"
import { type PuertoDeAvisos, puertoDelNavegador } from "@/lib/avisos/navegador"
import type { SuscripcionDelNavegador } from "@/lib/avisos/tipos"

interface Props {
  claveVapid: string | null
  guardar: (suscripcion: SuscripcionDelNavegador) => Promise<{ ok: true } | { ok: false; error: string }>
  probar: () => Promise<string>
  puerto?: PuertoDeAvisos
}

const BOTON = "min-h-11 w-full rounded-lg bg-primario px-4 font-medium text-primario-texto disabled:opacity-60"

export function AvisosDelCelular({ claveVapid, guardar, probar, puerto }: Props) {
  const [aparato] = useState(() => puerto ?? puertoDelNavegador())
  const [estado, setEstado] = useState<EstadoDeAvisos | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()

  useEffect(() => {
    aparato.leer().then((datos) => setEstado(estadoDeAvisos({ ...datos, configurado: claveVapid !== null })))
  }, [aparato, claveVapid])

  function activar() {
    if (!claveVapid) return
    iniciar(async () => {
      const resultado = await aparato.activar(claveVapid)
      if (resultado.estado === "denegada") return setEstado("denegado")
      const guardado = await guardar(resultado.suscripcion)
      if (!guardado.ok) return setMensaje(guardado.error)
      setEstado("activo")
    })
  }

  if (estado === null) return null
  return (
    <section className="space-y-3 rounded-lg border border-borde p-4">
      <h2 className="font-medium">Avisos en tu celular</h2>
      {estado === "instalar" && <p className="text-sm">En Safari toca Compartir y luego «Agregar a inicio». Abre PostIA desde ahí y vuelve a esta pantalla.</p>}
      {estado === "no_disponible" && <p className="text-sm text-apagado">Este navegador no puede recibir avisos.</p>}
      {estado === "denegado" && <p className="text-sm">Bloqueaste los avisos. Actívalos en Ajustes del iPhone › Notificaciones › PostIA.</p>}
      {estado === "listo" && (
        <button type="button" onClick={activar} disabled={pendiente} className={BOTON}>
          Activar avisos
        </button>
      )}
      {estado === "activo" && (
        <button type="button" onClick={() => iniciar(async () => setMensaje(await probar()))} disabled={pendiente} className={BOTON}>
          Mandar aviso de prueba
        </button>
      )}
      {mensaje && <p role="status" className="text-sm">{mensaje}</p>}
    </section>
  )
}
```

`app/(app)/ajustes/acciones.ts`

```ts
"use server"

import { enviarAvisoDePrueba, guardarSuscripcion } from "@/lib/avisos/acciones"
import { servicioPushReal } from "@/lib/avisos/push"
import type { SuscripcionDelNavegador } from "@/lib/avisos/tipos"
import { createActionClient } from "@/lib/supabase/action"

export async function guardarSuscripcionAccion(suscripcion: SuscripcionDelNavegador) {
  return guardarSuscripcion(await createActionClient(), suscripcion)
}

export async function probarAvisoAccion(): Promise<string> {
  const { enviados, fallos } = await enviarAvisoDePrueba(await createActionClient(), servicioPushReal())
  if (enviados > 0) return `Listo: mandé el aviso a ${enviados} ${enviados === 1 ? "aparato" : "aparatos"}.`
  return fallos > 0 ? "No pude mandar el aviso. Inténtalo de nuevo." : "No hay aparatos activos. Activa los avisos otra vez."
}
```

`app/(app)/ajustes/page.tsx`

```tsx
import { RUTA_DE_SALIR } from "@/lib/sesion/rutas"
import { guardarSuscripcionAccion, probarAvisoAccion } from "./acciones"
import { AvisosDelCelular } from "./avisos-del-celular"

export default function Ajustes() {
  return (
    <section className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">Ajustes</h1>
      <AvisosDelCelular claveVapid={process.env.VAPID_PUBLIC_KEY?.trim() || null} guardar={guardarSuscripcionAccion} probar={probarAvisoAccion} />
      <a href={RUTA_DE_SALIR} className="block min-h-11 py-3 text-sm text-apagado">
        Salir
      </a>
    </section>
  )
}
```

- [ ] **Step 4: Pass** — `pnpm test:run && pnpm type && pnpm lint && pnpm build`.
- [ ] **Step 5: Manual check.** Desktop Chrome at `http://localhost:3000/ajustes`: «Activar avisos» → allow → «Mandar aviso de prueba» → a notification «PostIA · Así se ven tus avisos.» appears; tapping it opens `/`. iPhone (needs HTTPS reachable from the phone; if not available now, record it as pending for the deploy plan): Safari shows the install hint; installed app shows «Activar avisos»; the test notice arrives on the lock screen.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: let the installed app subscribe to notices and send a test one"`

---

## Task 24: Final verification and docs

- [ ] **Step 1: Full suite**

```bash
pnpm lint && pnpm type && pnpm test:run && pnpm test:db && pnpm test:e2e && pnpm build
```

Expected: every command exits 0. Report counts and any failure verbatim; do not mark done otherwise.

- [ ] **Step 2: Banned-pattern sweep on new code** (hard-won lesson: my own code obeys the rules I enforce)

```bash
grep -rnE '#[0-9a-fA-F]{3,8}\b' app components --include=*.tsx | grep -v 'lib/diseno'   # Expected: no hex in components
grep -rnE 'as any|@ts-expect-error|!\)' lib app scripts --include=*.ts --include=*.tsx  # Expected: none
grep -rn 'catch {' lib app scripts                                                     # Expected: none (no silent catch)
head -1 app/ingreso/formulario-ingreso.tsx app/\(app\)/marcas/formulario-*.tsx app/\(app\)/ajustes/avisos-del-celular.tsx  # "use client"
```

- [ ] **Step 3: Update `CLAUDE.md` «Comandos»** with `pnpm type`, `pnpm db:start`, `pnpm db:reset`, `pnpm db:types`, `pnpm test:db`, `pnpm invitar`, `pnpm prueba:linkedin` (keep the file ≤ 80 lines).
- [ ] **Step 4: Commit** — `git add CLAUDE.md && git commit -m "docs: list the database, invitation and smoke commands"`
- [ ] **Step 5: Ask Federico** whether to push to `origin` (only if Gate 0 created the repo).

---

## Self-review

**Spec coverage.** (1) Biome 20 → Tasks 1–2, with a real test (not a placeholder) making `pnpm test:run` pass. (2) Supabase Auth, invited only → Tasks 3–9: sign-up closed in config, `shouldCreateUser: false`, `pnpm invitar` as the only door, same answer for strangers (verified E2E), `sin_acceso` signs out. (3) Brands and accounts + «Estudio WAV Perfil» with OpenID Connect + `w_member_social` → Tasks 10–15: scopes `openid profile w_member_social`, scope check on callback, token in Vault, never on screen. (4) Smoke script: text post then PDF carousel, closing phase 0 → Tasks 16–19 with the result recorded for D2's plan B. Mobile-first + installable + web push → Tasks 6–7 (bottom bar, safe areas, viewport, manifest, icons), 9 (iPhone E2E profile), 20–23. Gates for initial commit, GitHub repo and real LinkedIn publication → Task 0 and Task 19, and Federico types the signature himself.

**Plano rules touched.** Llaves fuera (Vault, `.env.local`, token scrubbed from errors). Solo publica (scopes ask for nothing but posting). Puerta 2 in miniature (exact text shown, human signature, no retries, doubtful answers checked by a person). Voz por marca (`voz` per brand, Federico writes the test text). D4 (only owners in phase 1). D16 (no email for notices; email is used only for the sign-in code, as the plano's Ingreso specifies).

**Placeholders.** None: every file is written in this plan, from scratch. Conidolly is cited only as a reference for behavior (D8).

**Known risks the executor must check, not assume.**
- Cloudflare (D23): `proxy.ts` (Node.js middleware) is supported only experimentally by `@opennextjs/cloudflare` 1.20.3+ with `nodejs_compat`. Deploy a preview to Workers as soon as Task 6 lands, not at the end; also confirm `web-push` signs and sends from a Worker, or send pushes from Trigger.dev instead.
- Next 16 `proxy.ts` naming (Task 6): confirm against the installed Next docs.
- The Supabase error code for an unknown address with `shouldCreateUser: false` (Task 4): the E2E in Task 9 proves it; adjust `SIN_USUARIO` test-first if it differs.
- `supabase status -o env` key names (`API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`) on CLI 2.117: confirm once; newer CLIs also print publishable/secret keys.
- Whether Share on LinkedIn accepts `/rest/documents` is exactly what Task 19 answers; a refusal is a valid phase 0 result, not a bug.
- iPhone push needs HTTPS reachable from the phone; without a tunnel or deploy that check moves to the deploy plan.

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-10-28-fase-1a-base-ingreso-linkedin.md`. Two options:

1. **Subagent-driven (recommended):** a fresh subagent per task, review between tasks.
2. **Inline:** execute here with superpowers:executing-plans, with checkpoints.
