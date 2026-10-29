# Fase 1e (4a): spend cap and Claude client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No paid call can happen without first fitting under the monthly cap (D11: US$40, per-brand breakdown with a «General» row, immediate push at 80 % and at the cap), and PostIA gets a Claude client that pays through that ledger.

**Architecture:** One new migration (`20261101120000_tope_de_gasto.sql`). `topes` holds the cap per month (global, plus an optional sub-cap per brand); `gastos` is the ledger, one row per paid step with a unique key; `avisos_de_tope` remembers which thresholds were already pushed this month. Service-role RPCs `reservar_gasto` / `confirmar_gasto` / `liberar_gasto` / `barrer_gastos` serialize per month with an advisory lock. Owners read `resumen_de_gasto` and change caps with `guardar_tope`. In TypeScript, `pagar` is provider-neutral (reserve, call, confirm, release only on a proven 4xx), `lib/gasto/precios.ts` turns token usage into integer micro-dollars, and `lib/ia/claude.ts` wraps the Anthropic SDK with `maxRetries: 0` so every attempt goes through the ledger. Claude is only called from Trigger.dev; the Worker never imports it.

**Tech Stack:** Supabase Postgres (plpgsql, RLS, advisory locks), Next.js 16 server components and actions, Trigger.dev v4, `@anthropic-ai/sdk` (TypeScript), zod, Vitest.

---

## Design

**Money.** Every amount is an integer of micro-dollars (`bigint` in SQL, `number` in TypeScript: the largest value, US$1,000 = 10⁹, is far below 2⁵³). US$40 = `40_000_000`. Prices are micro-dollars per million tokens, so a cost is `ceil(Σ tokens × precio / 1_000_000)`: always rounded up, never below the real cost.

**Month.** `mes_de(ts) = date_trunc('month', ts at time zone 'America/Santiago')::date`. The cap resets at midnight Chile time on the first of the month.

**Caps (`topes`).** A row says «from this month on, this scope's cap is X». The cap in force for a month is the latest row with `desde_mes <= mes`. `marca_id null` is the global cap and always has an amount; a brand row with `monto_micro null` removes that brand's sub-cap. The seed row is global, US$40, `desde_mes = 2000-01-01`, so it applies until an owner changes it (`guardar_tope` writes the current month's row and overwrites it if it already exists). Allowed amounts: US$1 to US$1,000.

**Ledger (`gastos`).** States: `reservado` → `confirmado` (real cost known) | `sin_cobro` (proven 4xx: the provider refused before working) | `vencido` (the nightly sweep found it still reserved after 24 h). The month's spend is `Σ coalesce(real_micro, estimado_micro)` over `reservado` and `confirmado`, so a doubtful call keeps counting at its estimate until it is confirmed or the sweep expires it. Spend without a brand (research, Sunday engine, crosses) has `marca_id null` and shows as «General».

**Keys.** `clave` is unique. A step that may retry puts its attempt in the key (`escribir:<pieza>:<version>:intento-2`); a step that must never repeat leaves the attempt out (`acortar:<pieza>:<version>`). `reservar_gasto` with a key that already exists never reserves again and answers `ya_existe`; `pagar` then refuses to call the provider (`PasoYaPagado`), so a retry can never charge twice.

**Reserving.** Under `pg_advisory_xact_lock` for the month: existing key → `ya_existe`; global spend + estimate > global cap → `tope_alcanzado` (global); brand spend + estimate > brand sub-cap → `tope_alcanzado` (that brand); otherwise insert. The refusal is a returned state, not an exception, so the transaction commits the «cap reached» notice row. The answer carries the thresholds crossed for the first time this month.

**Thresholds and notices (Federico, 2026-10-29).** Per scope (global, and the brand's sub-cap when it has one) and per month: `80` when spend reaches 80 % of the cap, `100` when it reaches the cap or a step is refused by it. `avisos_de_tope (mes, alcance, umbral)` is the primary key, so each push goes out once per month per scope and threshold. They are immediate pushes (urgent, D26) to every owner.

**`pagar`.** Reserve → call → confirm with the real cost. If the call throws a proven 4xx (Anthropic: `APIError` with a status 400-499 except 408, and not `APIConnectionError`), the reservation is released; anything else (timeout, connection, 5xx, unknown) stays reserved. If confirming fails after a successful call, the result is still returned (it is paid) and the failure is logged: the reservation keeps counting at the estimate, which is never below the real cost. A failing push is logged and never loses a paid result.

**Estimate.** Worst case before the call: every input token at the cache-write price (`ceil(caracteres / 2)` tokens, conservative for Spanish), the whole `max_tokens` as output (on Claude Opus 5.5 thinking is always on and counts as output), and every allowed web search at US$0.01.

**Claude client.** Default model `claude-opus-5-5` (claude-api skill), `output_config.effort` always explicit (its default on this model is `medium`), no `thinking` parameter (thinking can't be disabled on Opus 5.5), `cache_control: { type: "ephemeral" }` on the system prompt when it is longer than ~1024 tokens (global rule), `maxRetries: 0` so every retry is a new ledger attempt. Server-side refusal fallbacks are left out of 4a: they bill the fallback model at its own rates, which the price table does not cover yet, and 4a has no product prompts. They are decided with 4c.

**Not in 4a.** Writing, research, Voyage and Gemini prices (they arrive with their sub-plans), web search tool requests (only its price), per-step budgets inside a research run.

## Gates: stop and ask Federico

Every gate is in Task 10:
1. Push the branch and open the PR.
2. Production migration: `supabase db push` of `20261101120000_tope_de_gasto.sql`, after a dry run.
3. `ANTHROPIC_API_KEY` in Trigger.dev prod: Federico runs a script that asks for the key without echoing it and prints only the variable name. Never in code, chat, `.env*` files or logs.
4. Merge (deploys the Worker and the Trigger tasks, including `probar-claude`).
5. Smoke call: Federico runs `probar-claude` from the Trigger.dev dashboard with payload `{"confirmacion":"GASTAR"}`. It costs about US$0.02.

---

## File map

```
supabase/migrations/20261101120000_tope_de_gasto.sql   topes, gastos, avisos_de_tope, RPCs
lib/gasto/precios.ts            prices, costoReal, estimarCosto, enDolares (pure)
lib/gasto/pagar.ts              pagar, TopeAlcanzado, PasoYaPagado, types (pure, ports)
lib/gasto/repositorio.ts        libroDeGastos (RPCs), avisarTope (owners), mensajeDeTope, barrerGastos
lib/gasto/lectura.ts            resumenDeGasto (owner RPC)
lib/gasto/acciones.ts           guardarTope
lib/ia/claude.ts                Claude client, esRechazoProbado, pedirPagando (Trigger and scripts only)
lib/mantenimiento/limpieza.ts   + gastos step in mantenimientoNocturno
trigger/limpieza.ts             + barrerGastos
trigger/probar-claude.ts        smoke task, refuses without confirmacion "GASTAR"
app/(app)/ajustes/{page,gasto,acciones}.tsx|ts   «Gasto del mes»
tests/integration/{gastos,topes}.test.ts, tests/integration/limpieza.ts
tests/unit/{precios,pagar,claude,limites-del-worker,gasto-en-ajustes,probar-claude}.test.ts(x), tests/unit/limpieza.test.ts
```

---

## Task 1: Caps and the spend ledger

**Files:** Create `supabase/migrations/20261101120000_tope_de_gasto.sql`, `tests/integration/gastos.test.ts`. Modify `tests/integration/limpieza.ts`, `lib/supabase/database.types.ts` (generated).

- [ ] **Step 1: Failing test** `tests/integration/gastos.test.ts`

```ts
import { randomUUID } from "node:crypto"
import { describe, expect, test } from "vitest"
import { admin, marcaConDueno, personaConSesion } from "./entorno"

/** A month nobody else uses: each test gets its own ledger and its own caps. */
function mesDePrueba(): { ahora: string; desde: string } {
  const anio = 2400 + Math.floor(Math.random() * 600)
  const mes = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0")
  return { ahora: `${anio}-${mes}-15T12:00:00Z`, desde: `${anio}-${mes}-01` }
}

async function tope(desde: string, montoMicro: number | null, marcaId: string | null = null) {
  const { error } = await admin().from("topes").insert({ marca_id: marcaId, desde_mes: desde, monto_micro: montoMicro })
  if (error) throw error
}

function clave() {
  return `prueba:${randomUUID()}`
}

async function reservar(c: string, estimado: number, ahora: string, marca: string | null = null) {
  const { data, error } = await admin().rpc("reservar_gasto", {
    p_clave: c,
    p_proveedor: "anthropic",
    p_paso: "prueba",
    p_estimado_micro: estimado,
    p_marca: marca ?? undefined,
    p_ahora: ahora,
  })
  if (error) throw error
  return data as { estado: string; alcance?: string; avisos: { alcance: string; umbral: number }[] }
}

describe("reservar_gasto", () => {
  test("reserves while the estimate fits and refuses the step that would pass the cap", async () => {
    const { ahora, desde } = mesDePrueba()
    await tope(desde, 50_000_000)
    expect((await reservar(clave(), 30_000_000, ahora)).estado).toBe("reservado")
    const negado = await reservar(clave(), 30_000_000, ahora)
    expect(negado.estado).toBe("tope_alcanzado")
    expect(negado.alcance).toBe("global")
  })

  test("never reserves twice with the same key", async () => {
    const { ahora, desde } = mesDePrueba()
    await tope(desde, 50_000_000)
    const c = clave()
    expect((await reservar(c, 1_000_000, ahora)).estado).toBe("reservado")
    expect(await reservar(c, 1_000_000, ahora)).toMatchObject({ estado: "ya_existe" })
    const { count } = await admin().from("gastos").select("*", { count: "exact", head: true }).eq("clave", c)
    expect(count).toBe(1)
  })

  test("lets only one of two racing reservations through at the edge of the cap", async () => {
    const { ahora, desde } = mesDePrueba()
    await tope(desde, 50_000_000)
    const [a, b] = await Promise.all([reservar(clave(), 30_000_000, ahora), reservar(clave(), 30_000_000, ahora)])
    expect([a.estado, b.estado].sort()).toEqual(["reservado", "tope_alcanzado"])
  })

  test("applies a brand's sub-cap in the same transaction and charges unbranded spend to General", async () => {
    const { userId } = await personaConSesion("gasto-marca")
    const marca = await marcaConDueno(userId)
    const { ahora, desde } = mesDePrueba()
    await tope(desde, 50_000_000)
    await tope(desde, 5_000_000, marca)
    expect((await reservar(clave(), 4_000_000, ahora, marca)).estado).toBe("reservado")
    expect(await reservar(clave(), 2_000_000, ahora, marca)).toMatchObject({ estado: "tope_alcanzado", alcance: marca })
    expect((await reservar(clave(), 2_000_000, ahora)).estado).toBe("reservado")
  })

  test("reports 80 % once, then the cap once, per month", async () => {
    const { ahora, desde } = mesDePrueba()
    await tope(desde, 10_000_000)
    expect((await reservar(clave(), 7_000_000, ahora)).avisos).toEqual([])
    expect((await reservar(clave(), 1_000_000, ahora)).avisos).toEqual([
      expect.objectContaining({ alcance: "global", umbral: 80 }),
    ])
    expect((await reservar(clave(), 500_000, ahora)).avisos).toEqual([])
    expect((await reservar(clave(), 5_000_000, ahora)).avisos).toEqual([
      expect.objectContaining({ alcance: "global", umbral: 100 }),
    ])
    expect((await reservar(clave(), 5_000_000, ahora)).avisos).toEqual([])
  })

  test("starts every month from zero", async () => {
    const { ahora, desde } = mesDePrueba()
    await tope(desde, 10_000_000)
    expect((await reservar(clave(), 9_000_000, ahora)).estado).toBe("reservado")
    const siguiente = new Date(Date.parse(ahora) + 31 * 86_400_000).toISOString()
    expect((await reservar(clave(), 9_000_000, siguiente)).estado).toBe("reservado")
  })

  test("is not callable by a signed-in person", async () => {
    const { db } = await personaConSesion("gasto-extrano")
    const { error } = await db.rpc("reservar_gasto", {
      p_clave: clave(),
      p_proveedor: "anthropic",
      p_paso: "prueba",
      p_estimado_micro: 1,
    })
    expect(error?.code).toBe("42501")
  })
})

describe("confirmar_gasto and liberar_gasto", () => {
  test("confirms the real cost, which then counts instead of the estimate", async () => {
    const { ahora, desde } = mesDePrueba()
    await tope(desde, 10_000_000)
    const c = clave()
    await reservar(c, 9_000_000, ahora)
    const { error } = await admin().rpc("confirmar_gasto", { p_clave: c, p_real_micro: 1_000_000, p_ahora: ahora })
    expect(error).toBeNull()
    expect((await reservar(clave(), 8_000_000, ahora)).estado).toBe("reservado")
  })

  test("confirming twice with the same cost is a no-op; a different cost is refused", async () => {
    const { ahora, desde } = mesDePrueba()
    await tope(desde, 10_000_000)
    const c = clave()
    await reservar(c, 1_000_000, ahora)
    await admin().rpc("confirmar_gasto", { p_clave: c, p_real_micro: 500_000, p_ahora: ahora })
    const otra = await admin().rpc("confirmar_gasto", { p_clave: c, p_real_micro: 500_000, p_ahora: ahora })
    expect(otra.data).toMatchObject({ estado: "ya_confirmado" })
    const distinta = await admin().rpc("confirmar_gasto", { p_clave: c, p_real_micro: 600_000, p_ahora: ahora })
    expect(distinta.error?.message).toBe("gasto_cerrado")
  })

  test("a released reservation stops counting and cannot be confirmed afterwards", async () => {
    const { ahora, desde } = mesDePrueba()
    await tope(desde, 10_000_000)
    const c = clave()
    await reservar(c, 9_000_000, ahora)
    expect((await admin().rpc("liberar_gasto", { p_clave: c, p_ahora: ahora })).error).toBeNull()
    expect((await reservar(clave(), 9_000_000, ahora)).estado).toBe("reservado")
    const tarde = await admin().rpc("confirmar_gasto", { p_clave: c, p_real_micro: 1, p_ahora: ahora })
    expect(tarde.error?.message).toBe("gasto_cerrado")
  })

  test("an unknown key is refused", async () => {
    const { error } = await admin().rpc("liberar_gasto", { p_clave: clave() })
    expect(error?.message).toBe("gasto_desconocido")
  })
})
```

- [ ] **Step 2: Fail** — `pnpm test:db tests/integration/gastos.test.ts`. Expected: FAIL, `reservar_gasto` not found (PGRST202) and table `topes` missing.

- [ ] **Step 3: Migration** `supabase/migrations/20261101120000_tope_de_gasto.sql`

```sql
-- D11: monthly spend cap. Every paid call reserves here first; money is integer micro-dollars.

create function public.mes_de(p_ahora timestamptz) returns date
language sql stable set search_path = '' as $$
  -- The cap resets at midnight Chile time on the first of the month.
  select date_trunc('month', p_ahora at time zone 'America/Santiago')::date
$$;

-- «From this month on, this scope's cap is X». marca_id null is the global cap; a brand row with a null amount removes
-- that brand's sub-cap.
create table public.topes (
  id bigint generated always as identity primary key,
  marca_id uuid references public.marcas (id) on delete cascade,
  desde_mes date not null check (extract(day from desde_mes) = 1),
  monto_micro bigint check (monto_micro is null or monto_micro between 1000000 and 1000000000),
  puesto_por uuid references auth.users (id) on delete set null,
  puesto_en timestamptz not null default now(),
  constraint global_con_monto check (marca_id is not null or monto_micro is not null)
);
create unique index topes_uno_por_mes
  on public.topes (coalesce(marca_id, '00000000-0000-0000-0000-000000000000'::uuid), desde_mes);

-- US$40 from the start, until an owner changes it in Ajustes.
insert into public.topes (marca_id, desde_mes, monto_micro) values (null, '2000-01-01', 40000000);

create table public.gastos (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique check (length(clave) between 1 and 200),
  -- A deleted brand's spend still counts this month: it moves to «General».
  marca_id uuid references public.marcas (id) on delete set null,
  proveedor text not null check (proveedor in ('anthropic', 'voyage', 'gemini')),
  paso text not null check (length(btrim(paso)) between 1 and 60),
  mes date not null,
  estimado_micro bigint not null check (estimado_micro > 0),
  real_micro bigint check (real_micro >= 0),
  estado text not null default 'reservado' check (estado in ('reservado', 'confirmado', 'sin_cobro', 'vencido')),
  creado_en timestamptz not null default now(),
  cerrado_en timestamptz,
  constraint real_al_confirmar check ((estado = 'confirmado') = (real_micro is not null))
);
create index gastos_que_cuentan on public.gastos (mes, marca_id) where estado in ('reservado', 'confirmado');

-- One row per month, scope ('global' or a brand id) and threshold: each push goes out once.
create table public.avisos_de_tope (
  mes date not null,
  alcance text not null,
  umbral smallint not null check (umbral in (80, 100)),
  creado_en timestamptz not null default now(),
  primary key (mes, alcance, umbral)
);

create function public.tope_vigente(p_marca uuid, p_mes date) returns bigint
language sql stable set search_path = '' as $$
  select monto_micro from public.topes
  where marca_id is not distinct from p_marca and desde_mes <= p_mes
  order by desde_mes desc
  limit 1
$$;

-- A reservation counts at its estimate until confirmed; released and expired ones do not count.
create function public.gastado(p_mes date, p_marca uuid default null) returns bigint
language sql stable set search_path = '' as $$
  select coalesce(sum(coalesce(real_micro, estimado_micro)), 0)::bigint
  from public.gastos
  where mes = p_mes and estado in ('reservado', 'confirmado') and (p_marca is null or marca_id = p_marca)
$$;

-- Inserts the thresholds this scope crossed for the first time this month and returns them.
create function public.umbrales_de(p_mes date, p_marca uuid, p_frenado boolean) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_tope bigint := public.tope_vigente(p_marca, p_mes);
  v_gastado bigint := public.gastado(p_mes, p_marca);
  v_alcance text := coalesce(p_marca::text, 'global');
  v_avisos jsonb := '[]'::jsonb;
  v_umbral smallint;
begin
  if v_tope is null then
    return v_avisos;
  end if;
  foreach v_umbral in array array[80, 100]::smallint[] loop
    if v_gastado * 100 >= v_tope * v_umbral or (v_umbral = 100 and p_frenado) then
      insert into public.avisos_de_tope (mes, alcance, umbral) values (p_mes, v_alcance, v_umbral)
      on conflict do nothing;
      if found then
        v_avisos := v_avisos || jsonb_build_object(
          'alcance', v_alcance, 'umbral', v_umbral, 'gastado_micro', v_gastado, 'tope_micro', v_tope
        );
      end if;
    end if;
  end loop;
  return v_avisos;
end $$;

-- Optional parameters go last with `default null`, so the generated types make them optional (C1 pattern).
create function public.reservar_gasto(
  p_clave text, p_proveedor text, p_paso text, p_estimado_micro bigint,
  p_marca uuid default null, p_ahora timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_mes date := public.mes_de(p_ahora);
  v_estado text;
  v_tope bigint;
begin
  -- One reservation at a time per month: two steps racing at the edge of the cap cannot both pass.
  perform pg_advisory_xact_lock(hashtextextended('gastos:' || v_mes::text, 0));
  select estado into v_estado from public.gastos where clave = p_clave;
  if found then
    return jsonb_build_object('estado', 'ya_existe', 'gasto', v_estado, 'avisos', '[]'::jsonb);
  end if;
  v_tope := public.tope_vigente(null, v_mes);
  if v_tope is null then
    raise exception using errcode = '22023', message = 'sin_tope';
  end if;
  if public.gastado(v_mes) + p_estimado_micro > v_tope then
    -- A returned state, not an exception: the «cap reached» notice row must commit.
    return jsonb_build_object('estado', 'tope_alcanzado', 'alcance', 'global',
      'avisos', public.umbrales_de(v_mes, null, true));
  end if;
  if p_marca is not null then
    v_tope := public.tope_vigente(p_marca, v_mes);
    if v_tope is not null and public.gastado(v_mes, p_marca) + p_estimado_micro > v_tope then
      return jsonb_build_object('estado', 'tope_alcanzado', 'alcance', p_marca::text,
        'avisos', public.umbrales_de(v_mes, p_marca, true));
    end if;
  end if;
  insert into public.gastos (clave, marca_id, proveedor, paso, mes, estimado_micro, creado_en)
  values (p_clave, p_marca, p_proveedor, p_paso, v_mes, p_estimado_micro, p_ahora);
  return jsonb_build_object('estado', 'reservado', 'avisos',
    public.umbrales_de(v_mes, null, false)
      || case when p_marca is null then '[]'::jsonb else public.umbrales_de(v_mes, p_marca, false) end);
end $$;

create function public.confirmar_gasto(p_clave text, p_real_micro bigint, p_ahora timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_gasto public.gastos;
begin
  select * into v_gasto from public.gastos where clave = p_clave;
  if not found then
    raise exception using errcode = '22023', message = 'gasto_desconocido';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('gastos:' || v_gasto.mes::text, 0));
  update public.gastos set estado = 'confirmado', real_micro = p_real_micro, cerrado_en = p_ahora
  where clave = p_clave and estado = 'reservado';
  if not found then
    select * into v_gasto from public.gastos where clave = p_clave;
    if v_gasto.estado = 'confirmado' and v_gasto.real_micro = p_real_micro then
      return jsonb_build_object('estado', 'ya_confirmado', 'avisos', '[]'::jsonb);
    end if;
    raise exception using errcode = '22023', message = 'gasto_cerrado';
  end if;
  -- The real cost can be above the estimate only by rounding; it can still cross a threshold.
  return jsonb_build_object('estado', 'confirmado', 'avisos',
    public.umbrales_de(v_gasto.mes, null, false)
      || case when v_gasto.marca_id is null then '[]'::jsonb
              else public.umbrales_de(v_gasto.mes, v_gasto.marca_id, false) end);
end $$;

-- Only for a proven 4xx: the provider refused before doing any work, so nothing was charged.
create function public.liberar_gasto(p_clave text, p_ahora timestamptz default now()) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_estado text;
begin
  update public.gastos set estado = 'sin_cobro', cerrado_en = p_ahora where clave = p_clave and estado = 'reservado';
  if found then
    return 'liberado';
  end if;
  select estado into v_estado from public.gastos where clave = p_clave;
  if not found then
    raise exception using errcode = '22023', message = 'gasto_desconocido';
  end if;
  if v_estado = 'sin_cobro' then
    return 'ya_liberado';
  end if;
  raise exception using errcode = '22023', message = 'gasto_cerrado';
end $$;

alter table public.topes enable row level security;
alter table public.gastos enable row level security;
alter table public.avisos_de_tope enable row level security;
-- No policies: people read spend only through resumen_de_gasto; the ledger is written only by the service role.
revoke all on public.topes, public.gastos, public.avisos_de_tope from anon, authenticated;

revoke execute on function public.mes_de(timestamptz), public.tope_vigente(uuid, date), public.gastado(date, uuid),
  public.umbrales_de(date, uuid, boolean),
  public.reservar_gasto(text, text, text, bigint, uuid, timestamptz),
  public.confirmar_gasto(text, bigint, timestamptz), public.liberar_gasto(text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.reservar_gasto(text, text, text, bigint, uuid, timestamptz),
  public.confirmar_gasto(text, bigint, timestamptz), public.liberar_gasto(text, timestamptz) to service_role;
```

- [ ] **Step 4: Test cleanup** in `tests/integration/limpieza.ts`, inside the existing cleanup function, before the loop that deletes users (next to the `excepciones` deletes), add:

```ts
  // The spend ledger has no foreign key to test users: test keys and test months are removed by name.
  const { error: errorDeGastos } = await db.from("gastos").delete().like("clave", "prueba:%")
  if (errorDeGastos) throw errorDeGastos
  const { error: errorDeAvisosDeTope } = await db.from("avisos_de_tope").delete().gte("mes", "2400-01-01")
  if (errorDeAvisosDeTope) throw errorDeAvisosDeTope
  const { error: errorDeTopes } = await db.from("topes").delete().gte("desde_mes", "2400-01-01")
  if (errorDeTopes) throw errorDeTopes
```

and inside the batched loop over test user ids (the one that deletes `excepciones` by `puesta_por`), add:

```ts
    const { error: errorDeTopesPuestos } = await db.from("topes").delete().in("puesto_por", lote)
    if (errorDeTopesPuestos) throw errorDeTopesPuestos
```

- [ ] **Step 5: Pass** — `pnpm db:reset && pnpm db:types && pnpm test:db tests/integration/gastos.test.ts`. Expected: 11 passed. Then `pnpm type && pnpm lint`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261101120000_tope_de_gasto.sql tests/integration/gastos.test.ts tests/integration/limpieza.ts lib/supabase/database.types.ts
git commit -m "feat: add the monthly spend cap and its reservation ledger

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 2: Sweep, owner summary and cap changes

**Files:** Modify the migration. Create `tests/integration/topes.test.ts`. Modify `lib/supabase/database.types.ts`.

- [ ] **Step 1: Failing test** `tests/integration/topes.test.ts`

```ts
import { randomUUID } from "node:crypto"
import { describe, expect, test } from "vitest"
import { admin, marcaConDueno, personaConSesion } from "./entorno"

const HACE_DOS_DIAS = () => new Date(Date.now() - 2 * 86_400_000).toISOString()

describe("barrer_gastos", () => {
  test("expires reservations older than 24 hours and leaves fresh and closed ones alone", async () => {
    const vieja = `prueba:${randomUUID()}`
    const nueva = `prueba:${randomUUID()}`
    const confirmada = `prueba:${randomUUID()}`
    for (const [clave, ahora] of [
      [vieja, HACE_DOS_DIAS()],
      [nueva, new Date().toISOString()],
      [confirmada, HACE_DOS_DIAS()],
    ] as const) {
      const { error } = await admin().rpc("reservar_gasto", {
        p_clave: clave,
        p_proveedor: "anthropic",
        p_paso: "prueba",
        p_estimado_micro: 1,
        p_ahora: ahora,
      })
      if (error) throw error
    }
    await admin().rpc("confirmar_gasto", { p_clave: confirmada, p_real_micro: 1 })
    const { data, error } = await admin().rpc("barrer_gastos")
    expect(error).toBeNull()
    expect(data).toBeGreaterThanOrEqual(1)
    const { data: filas } = await admin().from("gastos").select("clave, estado").in("clave", [vieja, nueva, confirmada])
    const estados = Object.fromEntries((filas ?? []).map((f) => [f.clave, f.estado]))
    expect(estados).toEqual({ [vieja]: "vencido", [nueva]: "reservado", [confirmada]: "confirmado" })
  })
})

describe("resumen_de_gasto", () => {
  test("shows an owner the month's total, the cap, «General» and each of their brands", async () => {
    const { db, userId } = await personaConSesion("resumen-gasto")
    const marca = await marcaConDueno(userId)
    const { error } = await admin().rpc("reservar_gasto", {
      p_clave: `prueba:${randomUUID()}`,
      p_proveedor: "anthropic",
      p_paso: "prueba",
      p_estimado_micro: 1_500_000,
      p_marca: marca,
    })
    if (error) throw error
    const { data, error: errorDeResumen } = await db.rpc("resumen_de_gasto")
    expect(errorDeResumen).toBeNull()
    const resumen = data as {
      tope_micro: number
      gastado_micro: number
      filas: { marca_id: string | null; nombre: string; gastado_micro: number }[]
    }
    expect(resumen.tope_micro).toBeGreaterThan(0)
    expect(resumen.gastado_micro).toBeGreaterThanOrEqual(1_500_000)
    expect(resumen.filas[0]).toMatchObject({ marca_id: null, nombre: "General" })
    expect(resumen.filas).toContainEqual(expect.objectContaining({ marca_id: marca, gastado_micro: 1_500_000 }))
  })

  test("is refused to a person without a brand", async () => {
    const { db } = await personaConSesion("resumen-extrano")
    const { error } = await db.rpc("resumen_de_gasto")
    expect(error?.code).toBe("42501")
  })
})

describe("guardar_tope", () => {
  test("an owner changes the global cap from this month on", async () => {
    const { db, userId } = await personaConSesion("tope-global")
    await marcaConDueno(userId)
    const { error } = await db.rpc("guardar_tope", { p_monto_micro: 55_000_000 })
    expect(error).toBeNull()
    const { data } = await db.rpc("resumen_de_gasto")
    expect((data as { tope_micro: number }).tope_micro).toBe(55_000_000)
  })

  test("an owner sets and removes a sub-cap only on their own brand", async () => {
    const { db, userId } = await personaConSesion("tope-marca")
    const marca = await marcaConDueno(userId)
    const otra = await marcaConDueno((await personaConSesion("tope-otra")).userId)
    expect((await db.rpc("guardar_tope", { p_monto_micro: 5_000_000, p_marca: marca })).error).toBeNull()
    expect((await db.rpc("guardar_tope", { p_marca: marca })).error).toBeNull()
    const ajena = await db.rpc("guardar_tope", { p_monto_micro: 5_000_000, p_marca: otra })
    expect(ajena.error?.code).toBe("42501")
  })

  test("refuses amounts outside US$1 to US$1,000 and a global cap without amount", async () => {
    const { db, userId } = await personaConSesion("tope-invalido")
    await marcaConDueno(userId)
    expect((await db.rpc("guardar_tope", { p_monto_micro: 999_999 })).error?.message).toBe("tope_invalido")
    expect((await db.rpc("guardar_tope", { p_monto_micro: 1_000_000_001 })).error?.message).toBe("tope_invalido")
    expect((await db.rpc("guardar_tope", {})).error?.message).toBe("tope_invalido")
  })

  test("a person without a brand cannot change any cap", async () => {
    const { db } = await personaConSesion("tope-extrano")
    expect((await db.rpc("guardar_tope", { p_monto_micro: 50_000_000 })).error?.code).toBe("42501")
  })
})
```

- [ ] **Step 2: Fail** — `pnpm test:db tests/integration/topes.test.ts`. Expected: FAIL, `barrer_gastos` not found.

- [ ] **Step 3: Append to the migration** (before its final `revoke`/`grant` block, then extend those statements as shown)

```sql
-- Plano «Mantenimiento»: a reservation nobody confirmed or released in a day stops counting.
create function public.barrer_gastos(p_ahora timestamptz default now()) returns integer
language sql security definer set search_path = '' as $$
  with vencidos as (
    update public.gastos set estado = 'vencido', cerrado_en = p_ahora
    where estado = 'reservado' and creado_en < p_ahora - interval '24 hours'
    returning 1
  )
  select count(*)::integer from vencidos
$$;

-- Ajustes «Gasto del mes»: the global total and cap, «General», and each brand the person belongs to.
create function public.resumen_de_gasto() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_mes date := public.mes_de(now());
begin
  if not public.es_dueno_de_alguna() then
    raise exception using errcode = '42501', message = 'solo_el_dueno_ve_el_gasto';
  end if;
  return jsonb_build_object(
    'mes', v_mes,
    'tope_micro', public.tope_vigente(null, v_mes),
    'gastado_micro', public.gastado(v_mes),
    'filas', jsonb_build_array(jsonb_build_object(
        'marca_id', null, 'nombre', 'General', 'tope_micro', null,
        'gastado_micro', (select coalesce(sum(coalesce(real_micro, estimado_micro)), 0)::bigint from public.gastos
                          where mes = v_mes and estado in ('reservado', 'confirmado') and marca_id is null)
      )) || coalesce((
        select jsonb_agg(jsonb_build_object(
          'marca_id', m.id, 'nombre', m.nombre, 'tope_micro', public.tope_vigente(m.id, v_mes),
          'gastado_micro', public.gastado(v_mes, m.id)
        ) order by m.nombre)
        from public.marcas m
        where public.es_miembro(m.id)
      ), '[]'::jsonb)
  );
end $$;

create function public.guardar_tope(p_monto_micro bigint default null, p_marca uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_marca is null and not public.es_dueno_de_alguna() then
    raise exception using errcode = '42501', message = 'solo_el_dueno_cambia_el_tope';
  end if;
  if p_marca is not null and not public.es_dueno(p_marca) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_cambia_el_tope';
  end if;
  if (p_marca is null and p_monto_micro is null)
     or (p_monto_micro is not null and p_monto_micro not between 1000000 and 1000000000) then
    raise exception using errcode = '22023', message = 'tope_invalido';
  end if;
  insert into public.topes (marca_id, desde_mes, monto_micro, puesto_por)
  values (p_marca, public.mes_de(now()), p_monto_micro, auth.uid())
  on conflict (coalesce(marca_id, '00000000-0000-0000-0000-000000000000'::uuid), desde_mes)
  do update set monto_micro = excluded.monto_micro, puesto_por = excluded.puesto_por, puesto_en = now();
end $$;
```

Extend the final block of the migration:

```sql
revoke execute on function public.barrer_gastos(timestamptz), public.resumen_de_gasto(),
  public.guardar_tope(bigint, uuid) from public, anon, authenticated;
grant execute on function public.barrer_gastos(timestamptz) to service_role;
grant execute on function public.resumen_de_gasto(), public.guardar_tope(bigint, uuid) to authenticated;
```

- [ ] **Step 4: Pass** — `pnpm db:reset && pnpm db:types && pnpm test:db tests/integration/topes.test.ts tests/integration/gastos.test.ts`. Expected: 18 passed. Then `pnpm type && pnpm lint`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261101120000_tope_de_gasto.sql tests/integration/topes.test.ts lib/supabase/database.types.ts
git commit -m "feat: sweep stale reservations and let owners read and change the cap

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 3: Prices and estimates

**Files:** Create `lib/gasto/precios.ts`, `tests/unit/precios.test.ts`.

- [ ] **Step 1: Failing test** `tests/unit/precios.test.ts`

```ts
import { describe, expect, test } from "vitest"
import { costoReal, enDolares, estimarCosto } from "@/lib/gasto/precios"

describe("costoReal", () => {
  test("prices each kind of token for Claude Opus 5.5 and rounds up to the micro-dollar", () => {
    // 1,000 in × $4 + 500 out × $20 + 2,000 written × $5 + 10,000 read × $0.20, per million tokens.
    expect(
      costoReal("claude-opus-5-5", { entrada: 1000, salida: 500, escrituraDeCache: 2000, lecturaDeCache: 10_000, busquedas: 0 }),
    ).toBe(4000 + 10_000 + 10_000 + 2000)
    expect(costoReal("claude-opus-5-5", { entrada: 1, salida: 0, escrituraDeCache: 0, lecturaDeCache: 1, busquedas: 0 })).toBe(5)
  })

  test("adds US$0.01 per web search", () => {
    expect(costoReal("claude-sonnet-5-5", { entrada: 0, salida: 0, escrituraDeCache: 0, lecturaDeCache: 0, busquedas: 3 })).toBe(
      30_000,
    )
  })
})

describe("estimarCosto", () => {
  test("takes the worst case: every input token written to cache, the whole max_tokens, every search", () => {
    // 2,000 characters ≈ 1,000 tokens at $5 + 1,000 output at $20 + 2 searches.
    expect(estimarCosto("claude-opus-5-5", { caracteresDeEntrada: 2000, maxTokens: 1000, busquedas: 2 })).toBe(
      5000 + 20_000 + 20_000,
    )
  })

  test("is never below the real cost of the same request", () => {
    const estimado = estimarCosto("claude-opus-5-5", { caracteresDeEntrada: 4000, maxTokens: 2000, busquedas: 0 })
    const real = costoReal("claude-opus-5-5", {
      entrada: 1200,
      salida: 2000,
      escrituraDeCache: 0,
      lecturaDeCache: 0,
      busquedas: 0,
    })
    expect(estimado).toBeGreaterThanOrEqual(real)
  })
})

describe("enDolares", () => {
  test("writes micro-dollars as Chilean-formatted dollars", () => {
    expect(enDolares(40_000_000)).toBe("US$40,00")
    expect(enDolares(1_234_567)).toBe("US$1,23")
  })
})
```

- [ ] **Step 2: Fail** — `pnpm vitest run tests/unit/precios.test.ts`. Expected: FAIL, cannot find module `@/lib/gasto/precios`.

- [ ] **Step 3: Implement** `lib/gasto/precios.ts`

```ts
/** Claude models PostIA may call. Prices from the claude-api skill (Anthropic first-party rates, cached 2026-10-06). */
export type ModeloClaude = "claude-opus-5-5" | "claude-sonnet-5-5"

/** Micro-dollars per million tokens. Cache writes use the 5-minute TTL price (1.25× input). */
interface Precio {
  entrada: number
  salida: number
  escrituraDeCache: number
  lecturaDeCache: number
}

const PRECIOS: Record<ModeloClaude, Precio> = {
  "claude-opus-5-5": { entrada: 4_000_000, salida: 20_000_000, escrituraDeCache: 5_000_000, lecturaDeCache: 200_000 },
  "claude-sonnet-5-5": { entrada: 2_000_000, salida: 10_000_000, escrituraDeCache: 2_500_000, lecturaDeCache: 200_000 },
}

/** US$10 per 1,000 web searches. */
const BUSQUEDA_WEB_MICRO = 10_000

// Spanish runs about 3.5 characters per token; two per token keeps the estimate above the real count.
const CARACTERES_POR_TOKEN = 2

export interface Uso {
  entrada: number
  salida: number
  escrituraDeCache: number
  lecturaDeCache: number
  busquedas: number
}

export function costoReal(modelo: ModeloClaude, uso: Uso): number {
  const p = PRECIOS[modelo]
  const porTokens =
    uso.entrada * p.entrada +
    uso.salida * p.salida +
    uso.escrituraDeCache * p.escrituraDeCache +
    uso.lecturaDeCache * p.lecturaDeCache
  return Math.ceil(porTokens / 1_000_000) + uso.busquedas * BUSQUEDA_WEB_MICRO
}

/** The worst case before calling: all input written to cache, the whole max_tokens produced, every allowed search. */
export function estimarCosto(
  modelo: ModeloClaude,
  pedido: { caracteresDeEntrada: number; maxTokens: number; busquedas: number },
): number {
  return costoReal(modelo, {
    entrada: 0,
    salida: pedido.maxTokens,
    escrituraDeCache: Math.ceil(pedido.caracteresDeEntrada / CARACTERES_POR_TOKEN),
    lecturaDeCache: 0,
    busquedas: pedido.busquedas,
  })
}

export function enDolares(micro: number): string {
  return `US$${(micro / 1_000_000).toFixed(2).replace(".", ",")}`
}
```

- [ ] **Step 4: Pass** — `pnpm vitest run tests/unit/precios.test.ts`. Expected: 5 passed. `pnpm type && pnpm lint`.

- [ ] **Step 5: Commit**

```bash
git add lib/gasto/precios.ts tests/unit/precios.test.ts
git commit -m "feat: price Claude calls in micro-dollars and estimate their worst case

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 4: `pagar`

**Files:** Create `lib/gasto/pagar.ts`, `tests/unit/pagar.test.ts`.

- [ ] **Step 1: Failing test** `tests/unit/pagar.test.ts`

```ts
import { describe, expect, test, vi } from "vitest"
import { type LibroDeGastos, PasoYaPagado, type PedidoDeGasto, pagar, TopeAlcanzado } from "@/lib/gasto/pagar"

const PEDIDO: PedidoDeGasto = {
  clave: "escribir:p1:v1:intento-1",
  proveedor: "anthropic",
  paso: "escribir",
  estimadoMicro: 50_000,
  marcaId: null,
}

function libro(reserva: Awaited<ReturnType<LibroDeGastos["reservar"]>> = { estado: "reservado", avisos: [] }) {
  return {
    reservar: vi.fn(async () => reserva),
    confirmar: vi.fn(async () => []),
    liberar: vi.fn(async () => {}),
  } satisfies LibroDeGastos
}

function puertos(l = libro()) {
  return { libro: l, avisar: vi.fn(async () => {}), esRechazoProbado: (e: unknown) => e instanceof RangeError }
}

describe("pagar", () => {
  test("reserves, calls, confirms the real cost and returns the result", async () => {
    const p = puertos()
    const resultado = await pagar(p, PEDIDO, async () => ({ resultado: "texto", costoMicro: 12_000 }))
    expect(resultado).toBe("texto")
    expect(p.libro.reservar).toHaveBeenCalledWith(PEDIDO)
    expect(p.libro.confirmar).toHaveBeenCalledWith(PEDIDO.clave, 12_000)
  })

  test("never calls the provider when the cap refuses, and tells the owners", async () => {
    const aviso = { alcance: "global", umbral: 100 as const, gastadoMicro: 40_000_000, topeMicro: 40_000_000 }
    const p = puertos(libro({ estado: "tope_alcanzado", alcance: "global", avisos: [aviso] }))
    const llamada = vi.fn()
    await expect(pagar(p, PEDIDO, llamada)).rejects.toBeInstanceOf(TopeAlcanzado)
    expect(llamada).not.toHaveBeenCalled()
    expect(p.avisar).toHaveBeenCalledWith([aviso])
  })

  test("never calls the provider again for a key that already exists", async () => {
    const p = puertos(libro({ estado: "ya_existe", avisos: [] }))
    const llamada = vi.fn()
    await expect(pagar(p, PEDIDO, llamada)).rejects.toBeInstanceOf(PasoYaPagado)
    expect(llamada).not.toHaveBeenCalled()
  })

  test("releases the reservation only on a proven refusal and rethrows it", async () => {
    const p = puertos()
    await expect(
      pagar(p, PEDIDO, async () => {
        throw new RangeError("400")
      }),
    ).rejects.toThrow("400")
    expect(p.libro.liberar).toHaveBeenCalledWith(PEDIDO.clave)
  })

  test("keeps the reservation on a doubtful failure", async () => {
    const p = puertos()
    await expect(
      pagar(p, PEDIDO, async () => {
        throw new Error("timeout")
      }),
    ).rejects.toThrow("timeout")
    expect(p.libro.liberar).not.toHaveBeenCalled()
    expect(p.libro.confirmar).not.toHaveBeenCalled()
  })

  test("returns a paid result even when confirming fails, and logs it", async () => {
    const l = libro()
    l.confirmar.mockRejectedValueOnce(new Error("sin base"))
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await pagar(puertos(l), PEDIDO, async () => ({ resultado: 7, costoMicro: 1 }))).toBe(7)
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  test("a failing notice never loses a paid result", async () => {
    const aviso = { alcance: "global", umbral: 80 as const, gastadoMicro: 32_000_000, topeMicro: 40_000_000 }
    const l = libro()
    l.confirmar.mockResolvedValueOnce([aviso])
    const p = { ...puertos(l), avisar: vi.fn(async () => Promise.reject(new Error("push caído"))) }
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await pagar(p, PEDIDO, async () => ({ resultado: "ok", costoMicro: 1 }))).toBe("ok")
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})
```

- [ ] **Step 2: Fail** — `pnpm vitest run tests/unit/pagar.test.ts`. Expected: FAIL, cannot find module `@/lib/gasto/pagar`.

- [ ] **Step 3: Implement** `lib/gasto/pagar.ts`

```ts
export type Proveedor = "anthropic" | "voyage" | "gemini"

export interface PedidoDeGasto {
  /** Unique per paid step: with the attempt when the step may retry, without it when it must never repeat. */
  clave: string
  proveedor: Proveedor
  paso: string
  estimadoMicro: number
  /** null is «General»: research, the Sunday engine and crosses have no brand. */
  marcaId: string | null
}

export interface AvisoDeTope {
  /** "global" or a brand id. */
  alcance: string
  umbral: 80 | 100
  gastadoMicro: number
  topeMicro: number
}

export type Reserva =
  | { estado: "reservado"; avisos: AvisoDeTope[] }
  | { estado: "ya_existe"; avisos: AvisoDeTope[] }
  | { estado: "tope_alcanzado"; alcance: string; avisos: AvisoDeTope[] }

export interface LibroDeGastos {
  reservar(pedido: PedidoDeGasto): Promise<Reserva>
  confirmar(clave: string, realMicro: number): Promise<AvisoDeTope[]>
  liberar(clave: string): Promise<void>
}

export interface PuertosDePago {
  libro: LibroDeGastos
  avisar(avisos: AvisoDeTope[]): Promise<void>
  /** True only when the provider provably refused before working (a 4xx), so nothing was charged. */
  esRechazoProbado(error: unknown): boolean
}

export class TopeAlcanzado extends Error {
  constructor(readonly alcance: string) {
    super(`El tope de gasto (${alcance}) no deja hacer este paso.`)
    this.name = "TopeAlcanzado"
  }
}

export class PasoYaPagado extends Error {
  constructor(readonly clave: string) {
    super(`El paso ${clave} ya se reservó o se pagó: no se vuelve a llamar.`)
    this.name = "PasoYaPagado"
  }
}

async function avisarSinPerder(puertos: PuertosDePago, avisos: AvisoDeTope[]) {
  if (avisos.length === 0) return
  try {
    await puertos.avisar(avisos)
  } catch (error) {
    console.error(`No pude avisar del tope de gasto: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** D11: reserve under the cap, call, confirm the real cost. Release only on a proven refusal; doubt stays reserved. */
export async function pagar<T>(
  puertos: PuertosDePago,
  pedido: PedidoDeGasto,
  llamada: () => Promise<{ resultado: T; costoMicro: number }>,
): Promise<T> {
  const reserva = await puertos.libro.reservar(pedido)
  await avisarSinPerder(puertos, reserva.avisos)
  if (reserva.estado === "tope_alcanzado") throw new TopeAlcanzado(reserva.alcance)
  if (reserva.estado === "ya_existe") throw new PasoYaPagado(pedido.clave)

  let hecho: { resultado: T; costoMicro: number }
  try {
    hecho = await llamada()
  } catch (error) {
    if (puertos.esRechazoProbado(error)) {
      try {
        await puertos.libro.liberar(pedido.clave)
      } catch (errorAlLiberar) {
        console.error(
          `No pude liberar el gasto ${pedido.clave}: ${errorAlLiberar instanceof Error ? errorAlLiberar.message : String(errorAlLiberar)}`,
        )
      }
    }
    throw error
  }

  try {
    await avisarSinPerder(puertos, await puertos.libro.confirmar(pedido.clave, hecho.costoMicro))
  } catch (error) {
    // The call is paid: its result is kept. The reservation keeps counting at the estimate, never below the real cost.
    console.error(`No pude confirmar el gasto ${pedido.clave}: ${error instanceof Error ? error.message : String(error)}`)
  }
  return hecho.resultado
}
```

- [ ] **Step 4: Pass** — `pnpm vitest run tests/unit/pagar.test.ts`. Expected: 7 passed. `pnpm type && pnpm lint`.

- [ ] **Step 5: Commit**

```bash
git add lib/gasto/pagar.ts tests/unit/pagar.test.ts
git commit -m "feat: pay for a provider call through the ledger, releasing only on proven refusals

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 5: The ledger over Supabase and the owners' notices

**Files:** Create `lib/gasto/repositorio.ts`. Modify `tests/integration/gastos.test.ts`.

- [ ] **Step 1: Failing test** — append to `tests/integration/gastos.test.ts`:

```ts
import { vi } from "vitest"
import type { ServicioPush } from "@/lib/avisos/push"
import { avisarTope, barrerGastos, libroDeGastos, mensajeDeTope } from "@/lib/gasto/repositorio"

describe("libroDeGastos", () => {
  test("reserves, confirms and releases through the RPCs with typed answers", async () => {
    const { ahora, desde } = mesDePrueba()
    await tope(desde, 10_000_000)
    const libro = libroDeGastos(admin(), { ahora: () => ahora })
    const pedido = { clave: clave(), proveedor: "anthropic" as const, paso: "prueba", estimadoMicro: 8_500_000, marcaId: null }
    expect(await libro.reservar(pedido)).toEqual({
      estado: "reservado",
      avisos: [{ alcance: "global", umbral: 80, gastadoMicro: 8_500_000, topeMicro: 10_000_000 }],
    })
    expect(await libro.confirmar(pedido.clave, 1_000)).toEqual([])
    const otro = { ...pedido, clave: clave(), estimadoMicro: 1 }
    await libro.reservar(otro)
    await libro.liberar(otro.clave)
    const { data } = await admin().from("gastos").select("estado").eq("clave", otro.clave).single()
    expect(data?.estado).toBe("sin_cobro")
  })

  test("returns the refusal with its scope", async () => {
    const { ahora, desde } = mesDePrueba()
    await tope(desde, 1_000_000)
    const libro = libroDeGastos(admin(), { ahora: () => ahora })
    const reserva = await libro.reservar({
      clave: clave(),
      proveedor: "anthropic",
      paso: "prueba",
      estimadoMicro: 2_000_000,
      marcaId: null,
    })
    expect(reserva).toMatchObject({ estado: "tope_alcanzado", alcance: "global" })
  })
})

describe("avisarTope", () => {
  test("pushes each notice urgently to every owner's devices", async () => {
    const { userId } = await personaConSesion("aviso-tope")
    await marcaConDueno(userId)
    const { error } = await admin()
      .from("suscripciones_push")
      .insert({ user_id: userId, endpoint: `https://push.example/${randomUUID()}`, p256dh: "p", auth: "a", user_agent: "prueba" })
    if (error) throw error
    const enviar = vi.fn(async () => ({ estado: "enviado" as const }))
    const servicio: ServicioPush = { enviar }
    await avisarTope(admin(), servicio, [{ alcance: "global", umbral: 80, gastadoMicro: 32_000_000, topeMicro: 40_000_000 }])
    expect(enviar).toHaveBeenCalledWith(
      expect.anything(),
      { titulo: "Gasto al 80 %", cuerpo: "Van US$32,00 de US$40,00 este mes.", url: "/ajustes" },
      { urgente: true },
    )
  })
})

describe("mensajeDeTope", () => {
  test("names the brand when a sub-cap is reached", () => {
    expect(
      mensajeDeTope({ alcance: "x", umbral: 100, gastadoMicro: 5_000_000, topeMicro: 5_000_000 }, "WAV We Are Vision"),
    ).toEqual({
      titulo: "WAV We Are Vision llegó a su tope",
      cuerpo: "Van US$5,00 de US$5,00. Lo que esa marca gasta queda en pausa hasta el próximo mes o hasta que subas su tope.",
      url: "/ajustes",
    })
  })
})

describe("barrerGastos", () => {
  test("returns how many reservations it expired", async () => {
    expect(typeof (await barrerGastos(admin()))).toBe("number")
  })
})
```

Before writing the insert, check the real column names of `suscripciones_push` in `lib/supabase/database.types.ts` and use them (the test above assumes `user_id, endpoint, p256dh, auth, user_agent`).

- [ ] **Step 2: Fail** — `pnpm test:db tests/integration/gastos.test.ts`. Expected: FAIL, cannot find module `@/lib/gasto/repositorio`.

- [ ] **Step 3: Implement** `lib/gasto/repositorio.ts`

```ts
import { z } from "zod"
import { avisarPersona } from "@/lib/avisos/a-miembros"
import type { ServicioPush } from "@/lib/avisos/push"
import type { MensajePush } from "@/lib/avisos/tipos"
import type { Db } from "@/lib/supabase/database"
import type { AvisoDeTope, LibroDeGastos, Reserva } from "./pagar"
import { enDolares } from "./precios"

const RUTA_DEL_GASTO = "/ajustes"

const Aviso = z
  .object({
    alcance: z.string(),
    umbral: z.union([z.literal(80), z.literal(100)]),
    gastado_micro: z.number(),
    tope_micro: z.number(),
  })
  .transform((a): AvisoDeTope => ({ alcance: a.alcance, umbral: a.umbral, gastadoMicro: a.gastado_micro, topeMicro: a.tope_micro }))

const RespuestaDeReserva = z.discriminatedUnion("estado", [
  z.object({ estado: z.literal("reservado"), avisos: z.array(Aviso) }),
  z.object({ estado: z.literal("ya_existe"), avisos: z.array(Aviso) }),
  z.object({ estado: z.literal("tope_alcanzado"), alcance: z.string(), avisos: z.array(Aviso) }),
])

const RespuestaDeConfirmacion = z.object({ avisos: z.array(Aviso) })

function fallo(accion: string, error: { message: string }): never {
  throw new Error(`${accion}: ${error.message}`, { cause: error })
}

/** The ledger RPCs. `ahora` exists for tests; production uses the database clock. */
export function libroDeGastos(db: Db, opciones: { ahora?: () => string } = {}): LibroDeGastos {
  return {
    async reservar(pedido): Promise<Reserva> {
      const { data, error } = await db.rpc("reservar_gasto", {
        p_clave: pedido.clave,
        p_proveedor: pedido.proveedor,
        p_paso: pedido.paso,
        p_estimado_micro: pedido.estimadoMicro,
        p_marca: pedido.marcaId ?? undefined,
        p_ahora: opciones.ahora?.(),
      })
      if (error) fallo("No pude reservar el gasto", error)
      return RespuestaDeReserva.parse(data)
    },
    async confirmar(clave, realMicro) {
      const { data, error } = await db.rpc("confirmar_gasto", {
        p_clave: clave,
        p_real_micro: realMicro,
        p_ahora: opciones.ahora?.(),
      })
      if (error) fallo("No pude confirmar el gasto", error)
      return RespuestaDeConfirmacion.parse(data).avisos
    },
    async liberar(clave) {
      const { error } = await db.rpc("liberar_gasto", { p_clave: clave, p_ahora: opciones.ahora?.() })
      if (error) fallo("No pude liberar el gasto", error)
    },
  }
}

export function mensajeDeTope(aviso: AvisoDeTope, nombreDeMarca: string | null): MensajePush {
  const cuenta = `Van ${enDolares(aviso.gastadoMicro)} de ${enDolares(aviso.topeMicro)}`
  if (nombreDeMarca === null) {
    return aviso.umbral === 80
      ? { titulo: "Gasto al 80 %", cuerpo: `${cuenta} este mes.`, url: RUTA_DEL_GASTO }
      : {
          titulo: "Llegaste al tope de gasto",
          cuerpo: `${cuenta}. Lo que gasta queda en pausa hasta el próximo mes o hasta que subas el tope en Ajustes.`,
          url: RUTA_DEL_GASTO,
        }
  }
  return aviso.umbral === 80
    ? { titulo: `${nombreDeMarca} va en el 80 % de su tope`, cuerpo: `${cuenta} este mes.`, url: RUTA_DEL_GASTO }
    : {
        titulo: `${nombreDeMarca} llegó a su tope`,
        cuerpo: `${cuenta}. Lo que esa marca gasta queda en pausa hasta el próximo mes o hasta que subas su tope.`,
        url: RUTA_DEL_GASTO,
      }
}

/** Federico's decision: the 80 % mark and the cap are immediate pushes to every owner, not digest lines. */
export async function avisarTope(db: Db, servicio: ServicioPush, avisos: readonly AvisoDeTope[]): Promise<void> {
  if (avisos.length === 0) return
  const { data: duenos, error } = await db.from("miembros").select("user_id, marca_id, marcas(nombre)").eq("rol", "dueno")
  if (error) fallo("No pude leer los dueños", error)
  const nombres = new Map(duenos.map((d) => [d.marca_id, d.marcas?.nombre ?? null]))
  const personas = [...new Set(duenos.map((d) => d.user_id))]
  for (const aviso of avisos) {
    const nombre = aviso.alcance === "global" ? null : (nombres.get(aviso.alcance) ?? "Una marca")
    for (const persona of personas) await avisarPersona(db, servicio, persona, mensajeDeTope(aviso, nombre), true)
  }
}

export async function barrerGastos(db: Db): Promise<number> {
  const { data, error } = await db.rpc("barrer_gastos")
  if (error) fallo("No pude barrer los gastos vencidos", error)
  return data
}
```

If the generated type of the embedded `marcas(nombre)` select is an array instead of an object, read the first element; do not cast.

- [ ] **Step 4: Pass** — `pnpm test:db tests/integration/gastos.test.ts`. Expected: 16 passed. `pnpm type && pnpm lint`.

- [ ] **Step 5: Commit**

```bash
git add lib/gasto/repositorio.ts tests/integration/gastos.test.ts
git commit -m "feat: read and write the spend ledger and push cap notices to owners

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 6: Claude client

**Files:** Modify `package.json`, `pnpm-lock.yaml` (`pnpm add @anthropic-ai/sdk`). Create `lib/ia/claude.ts`, `tests/unit/claude.test.ts`, `tests/unit/limites-del-worker.test.ts`.

- [ ] **Step 1: Install** — `pnpm add @anthropic-ai/sdk` (the claude-api skill names the package `@anthropic-ai/sdk`).

- [ ] **Step 2: Failing tests** `tests/unit/claude.test.ts`

```ts
import Anthropic from "@anthropic-ai/sdk"
import { describe, expect, test, vi } from "vitest"
import type { LibroDeGastos } from "@/lib/gasto/pagar"
import { esRechazoProbado, pedirPagando, solicitudDe, usoDe } from "@/lib/ia/claude"

const SISTEMA_LARGO = "Contexto. ".repeat(600)

describe("solicitudDe", () => {
  test("uses Claude Opus 5.5, an explicit effort and no thinking parameter", () => {
    const s = solicitudDe({ sistema: "Breve.", mensajes: [{ role: "user", content: "Hola" }], maxTokens: 512, esfuerzo: "low" })
    expect(s.model).toBe("claude-opus-5-5")
    expect(s.output_config).toEqual({ effort: "low" })
    expect(s).not.toHaveProperty("thinking")
    expect(s.system).toEqual([{ type: "text", text: "Breve." }])
  })

  test("caches a system prompt over about 1,024 tokens", () => {
    const s = solicitudDe({ sistema: SISTEMA_LARGO, mensajes: [{ role: "user", content: "Hola" }], maxTokens: 512, esfuerzo: "low" })
    expect(s.system).toEqual([{ type: "text", text: SISTEMA_LARGO, cache_control: { type: "ephemeral" } }])
  })
})

describe("usoDe", () => {
  test("reads every billed kind of token from the response usage", () => {
    expect(
      usoDe({
        input_tokens: 10,
        output_tokens: 20,
        cache_creation_input_tokens: 30,
        cache_read_input_tokens: 40,
        server_tool_use: { web_search_requests: 2 },
      }),
    ).toEqual({ entrada: 10, salida: 20, escrituraDeCache: 30, lecturaDeCache: 40, busquedas: 2 })
    expect(usoDe({ input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: null, cache_read_input_tokens: null })).toEqual({
      entrada: 1,
      salida: 1,
      escrituraDeCache: 0,
      lecturaDeCache: 0,
      busquedas: 0,
    })
  })
})

describe("esRechazoProbado", () => {
  test("a 4xx other than 408 proves nothing was charged; network failures and 5xx do not", () => {
    const de = (status: number) => Anthropic.APIError.generate(status, { error: { message: "x" } }, "x", new Headers())
    expect(esRechazoProbado(de(400))).toBe(true)
    expect(esRechazoProbado(de(429))).toBe(true)
    expect(esRechazoProbado(de(408))).toBe(false)
    expect(esRechazoProbado(de(529))).toBe(false)
    expect(esRechazoProbado(new Anthropic.APIConnectionError({ message: "caído" }))).toBe(false)
    expect(esRechazoProbado(new Error("x"))).toBe(false)
  })
})

describe("pedirPagando", () => {
  test("reserves the worst case, calls Claude once and confirms the real cost", async () => {
    const libro: LibroDeGastos = {
      reservar: vi.fn(async () => ({ estado: "reservado" as const, avisos: [] })),
      confirmar: vi.fn(async () => []),
      liberar: vi.fn(async () => {}),
    }
    const crear = vi.fn(async () => ({
      content: [{ type: "text", text: "listo" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    }))
    const respuesta = await pedirPagando(
      { libro, avisar: async () => {}, crear },
      { clave: "probar:1", paso: "probar", marcaId: null },
      { sistema: "Breve.", mensajes: [{ role: "user", content: "Hola" }], maxTokens: 1024, esfuerzo: "low" },
    )
    expect(respuesta).toEqual({ texto: "listo", detenido: "end_turn" })
    expect(crear).toHaveBeenCalledTimes(1)
    expect(libro.reservar).toHaveBeenCalledWith(expect.objectContaining({ clave: "probar:1", proveedor: "anthropic" }))
    // 100 in × $4 + 50 out × $20 per million, rounded up.
    expect(libro.confirmar).toHaveBeenCalledWith("probar:1", 1400)
  })
})
```

`tests/unit/limites-del-worker.test.ts`

```ts
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, test } from "vitest"

function archivos(carpeta: string): string[] {
  if (!existsSync(carpeta)) return []
  return readdirSync(carpeta).flatMap((nombre) => {
    const ruta = path.join(carpeta, nombre)
    return statSync(ruta).isDirectory() ? archivos(ruta) : /\.(ts|tsx)$/.test(nombre) ? [ruta] : []
  })
}

describe("Worker boundary", () => {
  test("no route, component or module the Worker serves imports the Claude client or the Anthropic SDK", () => {
    // lib/gasto/lectura.ts and acciones.ts arrive in Task 8; Ajustes imports them.
    const servidas = [...archivos("app"), ...archivos("components"), "lib/gasto/lectura.ts", "lib/gasto/acciones.ts"].filter(
      (f) => existsSync(f),
    )
    const culpables = servidas.filter((f) => /from "(@\/lib\/ia\/|@anthropic-ai\/sdk)/.test(readFileSync(f, "utf8")))
    expect(culpables).toEqual([])
  })
})
```

- [ ] **Step 3: Fail** — `pnpm vitest run tests/unit/claude.test.ts tests/unit/limites-del-worker.test.ts`. Expected: `claude.test.ts` FAIL (module not found); the boundary test passes already.

- [ ] **Step 4: Implement** `lib/ia/claude.ts`

```ts
import Anthropic from "@anthropic-ai/sdk"
import { exigirEnv } from "@/lib/env"
import { type LibroDeGastos, pagar, type AvisoDeTope } from "@/lib/gasto/pagar"
import { costoReal, estimarCosto, type ModeloClaude, type Uso } from "@/lib/gasto/precios"

// Trigger.dev tasks and scripts only: the Worker never imports this module (tests/unit/limites-del-worker.test.ts).

/** The claude-api skill's default model. */
export const MODELO_POR_DEFECTO: ModeloClaude = "claude-opus-5-5"

// Global rule: cache system prompts over 1,024 tokens. About four characters per token is enough to decide.
const CARACTERES_PARA_CACHE = 4096

export interface PedidoAClaude {
  modelo?: ModeloClaude
  sistema: string
  mensajes: Anthropic.MessageParam[]
  maxTokens: number
  /** Always explicit: Claude Opus 5.5 defaults to "medium". */
  esfuerzo: "low" | "medium" | "high"
}

export interface RespuestaDeClaude {
  texto: string
  /** "refusal" must be handled by the caller before using `texto`. */
  detenido: string | null
}

/**
 * Claude Opus 5.5 cannot disable thinking: no `thinking` parameter, depth comes from `effort`. Server-side refusal
 * fallbacks are left out until a product prompt needs them (4c): they bill another model the price table lacks.
 */
export function solicitudDe(pedido: PedidoAClaude): Anthropic.MessageCreateParamsNonStreaming {
  const bloque: Anthropic.TextBlockParam =
    pedido.sistema.length > CARACTERES_PARA_CACHE
      ? { type: "text", text: pedido.sistema, cache_control: { type: "ephemeral" } }
      : { type: "text", text: pedido.sistema }
  return {
    model: pedido.modelo ?? MODELO_POR_DEFECTO,
    max_tokens: pedido.maxTokens,
    system: [bloque],
    messages: pedido.mensajes,
    output_config: { effort: pedido.esfuerzo },
  }
}

export function usoDe(uso: {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number | null
  cache_read_input_tokens: number | null
  server_tool_use?: { web_search_requests: number } | null
}): Uso {
  return {
    entrada: uso.input_tokens,
    salida: uso.output_tokens,
    escrituraDeCache: uso.cache_creation_input_tokens ?? 0,
    lecturaDeCache: uso.cache_read_input_tokens ?? 0,
    busquedas: uso.server_tool_use?.web_search_requests ?? 0,
  }
}

/** A 4xx (except 408, which may have reached the model) means Anthropic refused before working: nothing was charged. */
export function esRechazoProbado(error: unknown): boolean {
  if (error instanceof Anthropic.APIConnectionError) return false
  if (!(error instanceof Anthropic.APIError)) return false
  const status = error.status
  return typeof status === "number" && status >= 400 && status < 500 && status !== 408
}

type Crear = (solicitud: Anthropic.MessageCreateParamsNonStreaming) => Promise<{
  content: { type: string; text?: string }[]
  stop_reason: string | null
  usage: Parameters<typeof usoDe>[0]
}>

/** Retries are attempts the ledger must see, so the SDK never retries on its own. */
export function crearReal(entorno: Record<string, string | undefined> = process.env): Crear {
  const cliente = new Anthropic({
    apiKey: exigirEnv("ANTHROPIC_API_KEY", entorno.ANTHROPIC_API_KEY),
    maxRetries: 0,
    timeout: 120_000,
  })
  return (solicitud) => cliente.messages.create(solicitud)
}

export async function pedirPagando(
  puertos: { libro: LibroDeGastos; avisar(avisos: AvisoDeTope[]): Promise<void>; crear: Crear },
  paso: { clave: string; paso: string; marcaId: string | null },
  pedido: PedidoAClaude,
): Promise<RespuestaDeClaude> {
  const solicitud = solicitudDe(pedido)
  const modelo = pedido.modelo ?? MODELO_POR_DEFECTO
  const caracteres =
    pedido.sistema.length +
    pedido.mensajes.reduce((n, m) => n + (typeof m.content === "string" ? m.content.length : JSON.stringify(m.content).length), 0)
  return pagar(
    { libro: puertos.libro, avisar: puertos.avisar, esRechazoProbado },
    {
      clave: paso.clave,
      proveedor: "anthropic",
      paso: paso.paso,
      estimadoMicro: estimarCosto(modelo, { caracteresDeEntrada: caracteres, maxTokens: pedido.maxTokens, busquedas: 0 }),
      marcaId: paso.marcaId,
    },
    async () => {
      const respuesta = await puertos.crear(solicitud)
      const texto = respuesta.content.flatMap((b) => (b.type === "text" && b.text ? [b.text] : [])).join("")
      return {
        resultado: { texto, detenido: respuesta.stop_reason },
        costoMicro: costoReal(modelo, usoDe(respuesta.usage)),
      }
    },
  )
}
```

If the installed SDK types reject `output_config` on `MessageCreateParamsNonStreaming` or the `Crear` signature against `cliente.messages.create`, fix the types against the SDK's own exported types (`Anthropic.Message`, `Anthropic.Usage`) and let `pnpm type` guide it; never cast with `as unknown as`, `as any` or `@ts-expect-error`. The unit test fakes `crear` with the plain shape above, so keep `Crear` structural.

- [ ] **Step 5: Pass** — `pnpm vitest run tests/unit/claude.test.ts tests/unit/limites-del-worker.test.ts`. Expected: 6 passed. `pnpm type && pnpm lint`.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml lib/ia/claude.ts tests/unit/claude.test.ts tests/unit/limites-del-worker.test.ts
git commit -m "feat: add a Claude client that only calls through the spend ledger

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 7: Nightly sweep

**Files:** Modify `lib/mantenimiento/limpieza.ts`, `trigger/limpieza.ts`, `tests/unit/limpieza.test.ts`.

- [ ] **Step 1: Failing test** — replace the `describe("mantenimientoNocturno", …)` block in `tests/unit/limpieza.test.ts`:

```ts
describe("mantenimientoNocturno", () => {
  test("every step runs even when another fails, and the failure still surfaces", async () => {
    const avisos = vi.fn(async () => {})
    const gastos = vi.fn(async () => 2)
    await expect(
      mantenimientoNocturno({
        archivos: async () => {
          throw new Error("sin storage")
        },
        avisos,
        gastos,
      }),
    ).rejects.toThrow("sin storage")
    expect(avisos).toHaveBeenCalledTimes(1)
    expect(gastos).toHaveBeenCalledTimes(1)
  })

  test("returns how many files were removed and how many reservations expired", async () => {
    expect(
      await mantenimientoNocturno({ archivos: async () => 3, avisos: async () => {}, gastos: async () => 2 }),
    ).toEqual({ archivos: 3, gastosVencidos: 2 })
  })
})
```

- [ ] **Step 2: Fail** — `pnpm vitest run tests/unit/limpieza.test.ts`. Expected: FAIL (`gastos` is not called; result lacks `gastosVencidos`).

- [ ] **Step 3: Implement** — replace `mantenimientoNocturno` in `lib/mantenimiento/limpieza.ts`:

```ts
/** The nightly jobs are independent: each runs even if another fails, and the first failure still shows. */
export async function mantenimientoNocturno(pasos: {
  archivos(): Promise<number>
  avisos(): Promise<void>
  gastos(): Promise<number>
}): Promise<{ archivos: number; gastosVencidos: number }> {
  const [archivos, avisos, gastos] = await Promise.allSettled([pasos.archivos(), pasos.avisos(), pasos.gastos()])
  if (archivos.status === "rejected") throw archivos.reason
  if (avisos.status === "rejected") throw avisos.reason
  if (gastos.status === "rejected") throw gastos.reason
  return { archivos: archivos.value, gastosVencidos: gastos.value }
}
```

In `trigger/limpieza.ts`, import `barrerGastos` from `@/lib/gasto/repositorio`, add `gastos: () => barrerGastos(db),` to the `mantenimientoNocturno` call, and extend the comment: «…orphan files, digest lines sent over a month ago and spend reservations nobody closed in a day».

- [ ] **Step 4: Pass** — `pnpm vitest run tests/unit/limpieza.test.ts && pnpm test:db tests/integration/limpieza-nocturna.test.ts`. Expected: all pass (adjust the integration test only if it calls `mantenimientoNocturno` directly, by adding the `gastos` step). `pnpm type && pnpm lint`.

- [ ] **Step 5: Commit**

```bash
git add lib/mantenimiento/limpieza.ts trigger/limpieza.ts tests/unit/limpieza.test.ts tests/integration/limpieza-nocturna.test.ts
git commit -m "feat: expire spend reservations nobody closed in a day

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 8: «Gasto del mes» in Ajustes

**Files:** Create `lib/gasto/lectura.ts`, `lib/gasto/acciones.ts`, `app/(app)/ajustes/gasto.tsx`, `tests/unit/gasto-en-ajustes.test.tsx`. Modify `app/(app)/ajustes/page.tsx`, `app/(app)/ajustes/acciones.ts`, `tests/integration/topes.test.ts`.

- [ ] **Step 1: Failing tests**

Append to `tests/integration/topes.test.ts`:

```ts
import { guardarTope } from "@/lib/gasto/acciones"
import { resumenDeGasto } from "@/lib/gasto/lectura"

describe("resumenDeGasto and guardarTope", () => {
  test("an owner reads the month in micro-dollars and saves caps in dollars", async () => {
    const { db, userId } = await personaConSesion("gasto-lib")
    const marca = await marcaConDueno(userId)
    expect(await guardarTope(db, { marcaId: marca, dolares: 12 })).toEqual({ ok: true })
    const resumen = await resumenDeGasto(db)
    expect(resumen.filas).toContainEqual(expect.objectContaining({ marcaId: marca, topeMicro: 12_000_000 }))
    expect(await guardarTope(db, { marcaId: marca, dolares: null })).toEqual({ ok: true })
    expect(await guardarTope(db, { marcaId: null, dolares: 0.5 })).toEqual({
      ok: false,
      error: "El tope va entre US$1 y US$1.000.",
    })
  })
})
```

`tests/unit/gasto-en-ajustes.test.tsx`

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { GastoDelMes } from "@/app/(app)/ajustes/gasto"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const RESUMEN = {
  mes: "2026-11-01",
  topeMicro: 40_000_000,
  gastadoMicro: 33_000_000,
  filas: [
    { marcaId: null, nombre: "General", topeMicro: null, gastadoMicro: 3_000_000 },
    { marcaId: "m1", nombre: "WAV We Are Vision", topeMicro: 20_000_000, gastadoMicro: 30_000_000 },
  ],
}

describe("GastoDelMes", () => {
  test("shows the month's total against the cap and each row", () => {
    render(<GastoDelMes resumen={RESUMEN} guardar={vi.fn()} />)
    expect(screen.getByText("US$33,00 de US$40,00")).toBeTruthy()
    expect(screen.getByText("General")).toBeTruthy()
    expect(screen.getByText(/WAV We Are Vision/)).toBeTruthy()
    expect(screen.getByText(/82 %/)).toBeTruthy()
  })

  test("saves a new global cap in dollars", async () => {
    const guardar = vi.fn(async () => ({ ok: true as const }))
    render(<GastoDelMes resumen={RESUMEN} guardar={guardar} />)
    fireEvent.change(screen.getByLabelText("Tope mensual (US$)"), { target: { value: "50" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar tope" }))
    await waitFor(() => expect(guardar).toHaveBeenCalledWith({ marcaId: null, dolares: 50 }))
    expect(await screen.findByText("Tope guardado.")).toBeTruthy()
  })

  test("shows the action's error", async () => {
    const guardar = vi.fn(async () => ({ ok: false as const, error: "El tope va entre US$1 y US$1.000." }))
    render(<GastoDelMes resumen={RESUMEN} guardar={guardar} />)
    fireEvent.change(screen.getByLabelText("Tope mensual (US$)"), { target: { value: "0" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar tope" }))
    expect((await screen.findByRole("alert")).textContent).toBe("El tope va entre US$1 y US$1.000.")
  })
})
```

- [ ] **Step 2: Fail** — `pnpm vitest run tests/unit/gasto-en-ajustes.test.tsx && pnpm test:db tests/integration/topes.test.ts`. Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`lib/gasto/lectura.ts`

```ts
import { z } from "zod"
import type { Db } from "@/lib/supabase/database"

const Fila = z
  .object({ marca_id: z.string().nullable(), nombre: z.string(), tope_micro: z.number().nullable(), gastado_micro: z.number() })
  .transform((f) => ({ marcaId: f.marca_id, nombre: f.nombre, topeMicro: f.tope_micro, gastadoMicro: f.gastado_micro }))

const Resumen = z
  .object({ mes: z.string(), tope_micro: z.number(), gastado_micro: z.number(), filas: z.array(Fila) })
  .transform((r) => ({ mes: r.mes, topeMicro: r.tope_micro, gastadoMicro: r.gastado_micro, filas: r.filas }))

export type ResumenDeGasto = z.output<typeof Resumen>

export async function resumenDeGasto(db: Db): Promise<ResumenDeGasto> {
  const { data, error } = await db.rpc("resumen_de_gasto")
  if (error) throw new Error(`No pude leer el gasto del mes: ${error.message}`, { cause: error })
  return Resumen.parse(data)
}
```

`lib/gasto/acciones.ts`

```ts
import { z } from "zod"
import type { Resultado } from "@/lib/marcas/acciones"
import type { Db } from "@/lib/supabase/database"

const FUERA_DE_RANGO = "El tope va entre US$1 y US$1.000."

const TopeParaGuardar = z.object({
  marcaId: z.uuid().nullable(),
  // null removes a brand's own cap; the global cap always has one.
  dolares: z.number().min(1).max(1000).nullable(),
})

const MENSAJES: Record<string, string> = {
  solo_el_dueno_cambia_el_tope: "Solo el dueño puede cambiar el tope.",
  tope_invalido: FUERA_DE_RANGO,
}

export async function guardarTope(db: Db, entrada: unknown): Promise<Resultado> {
  const leida = TopeParaGuardar.safeParse(entrada)
  if (!leida.success || (leida.data.marcaId === null && leida.data.dolares === null)) {
    return { ok: false, error: FUERA_DE_RANGO }
  }
  const { marcaId, dolares } = leida.data
  const { error } = await db.rpc("guardar_tope", {
    p_monto_micro: dolares === null ? undefined : Math.round(dolares * 1_000_000),
    p_marca: marcaId ?? undefined,
  })
  if (error) {
    if (Object.hasOwn(MENSAJES, error.message)) return { ok: false, error: MENSAJES[error.message] }
    console.error("Falla inesperada al guardar el tope", error.code, error.message)
    return { ok: false, error: "No pude guardar el tope. Inténtalo de nuevo en un rato." }
  }
  return { ok: true }
}
```

Add to `app/(app)/ajustes/acciones.ts`:

```ts
import { revalidatePath } from "next/cache"
import { guardarTope } from "@/lib/gasto/acciones"
import type { Resultado } from "@/lib/marcas/acciones"

export async function guardarTopeAccion(entrada: unknown): Promise<Resultado> {
  const resultado = await guardarTope(await createActionClient(), entrada)
  if (resultado.ok) revalidatePath("/ajustes")
  return resultado
}
```

`app/(app)/ajustes/gasto.tsx`

```tsx
"use client"

import { useId, useState, useTransition } from "react"
import type { ResumenDeGasto } from "@/lib/gasto/lectura"
import { enDolares } from "@/lib/gasto/precios"
import type { Resultado } from "@/lib/marcas/acciones"

const CAMPO = "w-full rounded-lg border border-borde bg-background px-3 py-3"

export function GastoDelMes({
  resumen,
  guardar,
}: {
  resumen: ResumenDeGasto
  guardar: (entrada: { marcaId: string | null; dolares: number | null }) => Promise<Resultado>
}) {
  const id = useId()
  const [dolares, setDolares] = useState(String(resumen.topeMicro / 1_000_000))
  const [pendiente, empezar] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)
  const porcentaje = Math.floor((resumen.gastadoMicro * 100) / resumen.topeMicro)

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setError(null)
    setGuardado(false)
    empezar(async () => {
      const resultado = await guardar({ marcaId: null, dolares: Number(dolares) })
      if (resultado.ok) setGuardado(true)
      else setError(resultado.error)
    })
  }

  return (
    <section aria-labelledby={`${id}-titulo`} className="space-y-3">
      <h2 id={`${id}-titulo`} className="text-lg font-semibold">
        Gasto del mes
      </h2>
      <p>
        <span>
          {enDolares(resumen.gastadoMicro)} de {enDolares(resumen.topeMicro)}
        </span>{" "}
        <span className="text-sm text-apagado">({porcentaje} %)</span>
      </p>
      <ul className="space-y-1 text-sm">
        {resumen.filas.map((f) => (
          <li key={f.marcaId ?? "general"} className="flex justify-between gap-3">
            <span>{f.nombre}</span>
            <span>
              {enDolares(f.gastadoMicro)}
              {f.topeMicro !== null && ` de ${enDolares(f.topeMicro)}`}
            </span>
          </li>
        ))}
      </ul>
      <form className="space-y-2" onSubmit={enviar}>
        <label className="block space-y-1">
          <span className="text-sm">Tope mensual (US$)</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={1000}
            step={1}
            value={dolares}
            onChange={(e) => setDolares(e.target.value)}
            className={CAMPO}
          />
        </label>
        <button
          type="submit"
          disabled={pendiente}
          className="min-h-11 w-full rounded-lg border border-borde px-4 font-medium disabled:opacity-60"
        >
          Guardar tope
        </button>
        {error && (
          <p role="alert" className="text-sm text-peligro">
            {error}
          </p>
        )}
        <output className="block text-sm">{guardado && "Tope guardado."}</output>
      </form>
    </section>
  )
}
```

`app/(app)/ajustes/page.tsx` becomes async: read `resumenDeGasto(await createClient())` (server client from `@/lib/supabase/server`) and render `<GastoDelMes resumen={resumen} guardar={guardarTopeAccion} />` between `AvisosDelCelular` and the «Más» nav. A person without a brand never reaches the app shell, so the RPC's `42501` would be a real error and should surface.

Per-brand sub-caps are saved by the same action with `marcaId` set; the screen only edits the global cap in 4a (one owner, one rhythm). The plano asks for the per-brand breakdown, which the list shows; a per-brand editor can be added when a second owner exists.

- [ ] **Step 4: Pass** — `pnpm vitest run tests/unit/gasto-en-ajustes.test.tsx tests/unit/limites-del-worker.test.ts && pnpm test:db tests/integration/topes.test.ts`. Expected: all pass. `pnpm type && pnpm lint && pnpm build`. Check `"use client"` is still line 1 of `gasto.tsx`.

- [ ] **Step 5: Commit**

```bash
git add lib/gasto/lectura.ts lib/gasto/acciones.ts "app/(app)/ajustes" tests/unit/gasto-en-ajustes.test.tsx tests/integration/topes.test.ts
git commit -m "feat: show the month's spend in Ajustes and let the owner change the cap

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 9: Smoke task `probar-claude`

**Files:** Create `trigger/probar-claude.ts`, `lib/ia/probar.ts`, `tests/unit/probar-claude.test.ts`.

- [ ] **Step 1: Failing test** `tests/unit/probar-claude.test.ts`

```ts
import { describe, expect, test, vi } from "vitest"
import { probarClaude } from "@/lib/ia/probar"

describe("probarClaude", () => {
  test("does nothing and spends nothing without the typed confirmation", async () => {
    const pedir = vi.fn()
    expect(await probarClaude({ confirmacion: "gastar" }, "run_1", pedir)).toEqual({ hecho: false })
    expect(pedir).not.toHaveBeenCalled()
  })

  test("makes one cheap call keyed by the run, charged to General", async () => {
    const pedir = vi.fn(async () => ({ texto: "listo", detenido: "end_turn" }))
    expect(await probarClaude({ confirmacion: "GASTAR" }, "run_1", pedir)).toEqual({ hecho: true, texto: "listo" })
    expect(pedir).toHaveBeenCalledWith(
      { clave: "probar-claude:run_1", paso: "probar", marcaId: null },
      expect.objectContaining({ maxTokens: 1024, esfuerzo: "low" }),
    )
  })
})
```

- [ ] **Step 2: Fail** — `pnpm vitest run tests/unit/probar-claude.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`lib/ia/probar.ts`

```ts
import type { PedidoAClaude, RespuestaDeClaude } from "./claude"

type Pedir = (paso: { clave: string; paso: string; marcaId: string | null }, pedido: PedidoAClaude) => Promise<RespuestaDeClaude>

/** Production check of key, ledger and cap: about US$0.02, only when Federico types GASTAR in the payload. */
export async function probarClaude(
  carga: { confirmacion?: string },
  runId: string,
  pedir: Pedir,
): Promise<{ hecho: false } | { hecho: true; texto: string }> {
  if (carga.confirmacion !== "GASTAR") return { hecho: false }
  const respuesta = await pedir(
    { clave: `probar-claude:${runId}`, paso: "probar", marcaId: null },
    {
      sistema: "Respondes en español, en una palabra.",
      mensajes: [{ role: "user", content: "Responde solo: listo" }],
      maxTokens: 1024,
      esfuerzo: "low",
    },
  )
  return { hecho: true, texto: respuesta.texto }
}
```

`trigger/probar-claude.ts`

```ts
import { task } from "@trigger.dev/sdk"
import { servicioPushReal } from "@/lib/avisos/push"
import { avisarTope, libroDeGastos } from "@/lib/gasto/repositorio"
import { crearReal, pedirPagando } from "@/lib/ia/claude"
import { probarClaude } from "@/lib/ia/probar"
import { createAdminClient } from "@/lib/supabase/admin"

// Run by hand from the Trigger.dev dashboard with {"confirmacion":"GASTAR"}. No retries: a retry would pay twice.
export const probar = task({
  id: "probar-claude",
  retry: { maxAttempts: 1 },
  run: async (carga: { confirmacion?: string }, { ctx }) => {
    const db = createAdminClient()
    const puertos = {
      libro: libroDeGastos(db),
      avisar: (avisos: Parameters<typeof avisarTope>[2]) => avisarTope(db, servicioPushReal(), avisos),
      crear: crearReal(),
    }
    return probarClaude(carga, ctx.run.id, (paso, pedido) => pedirPagando(puertos, paso, pedido))
  },
})
```

`crearReal()` throws `Falta la variable de entorno ANTHROPIC_API_KEY` when the key is missing; that is the expected failure before gate 3.

- [ ] **Step 4: Pass** — `pnpm vitest run tests/unit/probar-claude.test.ts`. Expected: 2 passed. `pnpm type && pnpm lint && pnpm exec trigger deploy --dry-run` (dry run only: it must build the 5 tasks).

- [ ] **Step 5: Commit**

```bash
git add lib/ia/probar.ts trigger/probar-claude.ts tests/unit/probar-claude.test.ts
git commit -m "feat: add a confirmed smoke task that pays one Claude call through the ledger

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 10: Verify locally, then the production gates

- [ ] **Step 1: Full local verification**

```bash
pnpm db:reset
pnpm db:types
pnpm test:run
pnpm test:db
pnpm type
pnpm lint
pnpm build
pnpm test:e2e
pnpm exec trigger deploy --dry-run
```

Expected: all green; `git status` clean after `db:types` (types were committed per task). Then `pnpm preview` and the E2E against workerd as in plan D; note the Worker gzip size from `pnpm exec wrangler deploy --dry-run --outdir .wrangler/dry` (Workers Paid, 10 MiB limit) and confirm it did not grow by the SDK (it must not: the SDK is only in Trigger code). Every client component keeps `"use client"` on line 1.

- [ ] **Step 2: Gate 1, Federico's OK:** `git push -u origin fase-1e-tope-de-gasto` and `gh pr create` with the PR template of plan D (what it adds, verified locally, before/after merge checklist). Wait for CI green.

- [ ] **Step 3: Gate 2, Federico's OK:** `supabase db push --dry-run` (expect only `20261101120000_tope_de_gasto.sql`), then `supabase db push`, then the dry run again (`Remote database is up to date`). The C2/D code in production ignores the new tables; nothing calls them until the merge.

- [ ] **Step 4: Gate 3, Federico runs it:** write `/private/tmp/…/scratchpad/poner-llave-claude.mjs` (session scratchpad, never committed):

```js
// Asks for the Anthropic key without echoing it and stores it in Trigger.dev prod. Prints only the name.
import { execFileSync } from "node:child_process"
import { stdin, stdout } from "node:process"

const raiz = "/Users/fede/Projects/POSTIA"
stdout.write("Pega la llave de Anthropic y presiona Enter (no se verá): ")
stdin.setRawMode(true)
let llave = ""
for await (const trozo of stdin) {
  const texto = trozo.toString("utf8")
  if (texto.includes("\r") || texto.includes("\n")) {
    llave += texto.split(/[\r\n]/)[0]
    break
  }
  llave += texto
}
stdin.setRawMode(false)
stdout.write("\n")
if (!llave.trim().startsWith("sk-ant-")) throw new Error("Eso no parece una llave de Anthropic.")
execFileSync(
  `${raiz}/node_modules/.bin/trigger`,
  ["env", "set", "ANTHROPIC_API_KEY", llave.trim(), "--env", "prod", "--secret", "--skip-telemetry", "--log-level", "error"],
  { cwd: raiz, stdio: ["ignore", "ignore", "inherit"] },
)
console.log("Trigger.dev prod: ANTHROPIC_API_KEY listo (secreto)")
process.exit(0)
```

Give Federico the command in a `bash` block (`node <path>`); he runs it in his terminal. Never read the key back.

- [ ] **Step 5: Gate 4, Federico's OK:** `gh pr merge <n> --merge`; sync `main`; when he says the deploy finished, check CI conclusion, `wrangler deployments list`, and Trigger `get_current_worker` (5 tasks, including `probar-claude`).

- [ ] **Step 6: Gate 5, Federico runs it:** in the Trigger.dev dashboard, task `probar-claude` → Test → payload `{"confirmacion":"GASTAR"}`. Then verify: the run returned `{ hecho: true, texto: … }`, and Ajustes «Gasto del mes» shows a few cents under «General». If it failed with a 4xx, the ledger row is `sin_cobro`; with a timeout it stays `reservado` until the nightly sweep.
