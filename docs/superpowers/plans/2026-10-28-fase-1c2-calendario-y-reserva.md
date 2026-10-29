# Phase 1 · Plan C2: planned dates, the reserve week, the calendar and grouped notices

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every piece has a slot before anyone signs it, so the week can be seen and its gaps counted. Federico can sign a piece «for the reserve» (D21): signed without a date, it fills a slot whose piece he did not sign in time, and the unsigned piece moves to the next free slot. He gets one push at 9:00 and one at 17:00 with everything pending (D26); only urgent things push at once. A daily watch warns before the LinkedIn connection expires, and a nightly task clears orphan files and old notices. The 9 WR3 carousels arrive with planned dates.

**Architecture:** One new migration (`20261030120000_calendario_y_reserva.sql`, the C1 migrations are in production and are not edited). `piezas.planeada_para` is a proposed slot, never a signature; a trigger keeps it equal to `programada_para` while a piece is signed, so a single unique index `(cuenta_id, planeada_para)` stops two pieces of an account from holding the same slot, signed or planned. A new state `en_reserva` (signed, no date) is guarded like `programada`. The service-only RPC `cubrir_con_reserva` swaps a due unsigned piece for the oldest reserve piece of its account in one transaction; the publisher calls it before taking due pieces, so the reserve piece goes out in the same run through the normal path (window, huella, `reservar_envio`). Non-urgent notices are queued in `avisos_pendientes` and sent by a Trigger.dev digest task; connection watch and maintenance are two more scheduled tasks. Every rule that can be pure is pure and unit-tested; every RPC is integration-tested with its refusals.

**Tech Stack:** Next.js 16 on Workers, Supabase (Postgres, RLS, Storage), Trigger.dev v4 (`schedules.task`), existing `lib/avisos/push.ts`, `lib/piezas/horarios.ts`, `lib/publicacion/publicar.ts`.

**Source of truth:** plano «Estados de una pieza», «Lógica del calendario» (`huecosLibres`, `proponerFecha`, `repartir`, `horarioLibreEnCuenta`, `usarReserva`), «Calendario» (`verSemana`, `marcarHuecos`, `moverFecha`), «Vigilar conexiones», «Mantenimiento»; decisions D19, D21, D26. `CLAUDE.md` hard rules (Puerta 2, «Sale lo que se aprobó», «Ventana de atraso»).

---

## Design (what C2 builds, and what it leaves out)

**States after C2** (the C1 table plus `en_reserva`):

| From | To |
|---|---|
| `por_aprobar` | `programada` (sign with a date), `en_reserva` (sign for the reserve), `descartada` |
| `en_reserva` | `programada` (the app gives it a slot), `por_aprobar` (taken out, or a new version), `descartada` |
| `programada` | `por_aprobar`, `publicando`, `a_mano`, `descartada` |
| `publicando` | `publicada`, `envio_dudoso`, `a_mano`, `error` |
| `error` | `programada`, `por_aprobar`, `descartada` |
| `envio_dudoso` | `publicada`, `a_mano`, `descartada` |
| `a_mano` | `publicada`, `por_aprobar`, `descartada` |

**Planned date.** `planeada_para` is the slot a piece holds. Unsigned pieces get one from `proponerFecha` right after creation (owner RPC `planear_pieza`, not a change to `crear_pieza`: one validation path serves both «plan at creation» and «move the date», the production `crear_pieza` stays untouched, and a failed plan never loses a created piece). A trigger copies `programada_para` into `planeada_para` whenever a piece is `programada`, `publicando` or `publicada`, so after `firmar_pieza` (unchanged) the plan equals the signed date and occupancy is one column. Pieces that leave the signed states keep their slot as plan (a piece sent back to the gate still holds its day). The signing screen proposes the planned date when it is still in the future.

**Reserve (D21).** «Firmar para la reserva» binds the current huella without a date (`firmas.para_reserva`, `firmas.programada_para` null) and frees the piece's planned slot. When a planned unsigned piece is due, the publisher computes the next free slot of its account and calls `cubrir_con_reserva`: the pending piece moves to that slot, and if the account has a reserve piece **and the slot is still inside that piece's window**, the oldest reserve piece takes the slot (its signature gets the slot as date, it becomes `programada`) and publishes in that same run. Past the window no reserve is used: that would publish late. Target per account: `cuentas.ritmo_semanal` pieces (one week).

**Grouped notices (D26).** Urgent notices stay immediate (the publisher's, an expiring connection). Everything else is queued in `avisos_pendientes` and sent at 9:00 and 17:00 Chile time as **one push per person** with all their brands together (Federico owns both brands; one push per brand would be two pushes per window). The digest also recounts current state: pieces to sign, by hand, to review, reserve below target, missing pieces against the weekly rhythm.

**Connection watch.** Every day at 8:00, for each LinkedIn connection that serves an `api` account: expired or under one day left → urgent push; exactly 14 or 3 days left → a digest line; a signed piece scheduled after the expiry, within the last 14 days → a digest line.

**Maintenance.** Every night at 3:00: Storage objects in `piezas` older than 24 h that no version references are removed; digest lines sent more than 30 days ago are deleted.

**Not in C2:** D20 pillar balance (needs pillars, block 3); signing in batch; per-account hours in Ajustes (D19 stays fixed in `lib/piezas/horarios.ts`); editing from the month view; Instagram; Metricool; an automatic retry policy for `error` (nothing moves a piece to `error` today: the publisher parks every failure as `por_aprobar`, `a_mano` or `envio_dudoso`, so a retry policy would have no input; it arrives with the first path that writes `error`); deleting LinkedIn data past its retention (no metrics are stored yet).

## Gates: stop and ask Federico

1. **Production migration** (Task 18): `supabase db push` before the merge that needs it. Federico approves.
2. **Trigger.dev deploy** (Task 18): the three new scheduled tasks deploy through CI on merge (`TRIGGER_ACCESS_TOKEN` is already set). No new secrets: they use the same `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` and VAPID pair as the publisher. Confirm in the dashboard that the plan allows 4 schedules.
3. **Production data** (Task 18): re-running `pnpm cargar:wr3:prod` (it plans the WR3 pieces that have no date) only after his yes.

---

## File map

```
supabase/migrations/20261030120000_calendario_y_reserva.sql   planeada_para, en_reserva, firmas for the reserve, RPCs, avisos_pendientes
lib/piezas/estados.ts                       + en_reserva
lib/piezas/horarios.ts                      export fechaEnSantiago, + repartirFechas
lib/piezas/calendario.ts                    semanaDe, diasDeLaSemana, huecosDeLaSemana, cuadriculaDelMes, leerVista (pure)
lib/piezas/lectura.ts                       + horariosOcupados, calendario; bandeja and detalle know plans and the reserve
lib/piezas/acciones.ts                      + planearPieza, planearConFechaPropuesta, firmarParaReserva, sacarDeReserva
lib/publicacion/publicar.ts                 + cubrirSinFirma, called first in publicarPendientes
lib/publicacion/repositorio.ts              + vencidasSinFirma, horariosOcupados, cubrirConReserva, anotarAviso
lib/avisos/a-miembros.ts                    + avisarPersona
lib/avisos/repositorio-de-avisos.ts         anotarAviso, avisosSinEnviar, marcarEnviados, borrarAvisosEnviados
lib/avisos/resumen.ts                       armarResumen (pure)
lib/avisos/enviar-resumen.ts                enviarResumenes
lib/avisos/conexiones.ts                    revisarConexion (pure), vigilarConexiones
lib/mantenimiento/limpieza.ts               archivosParaBorrar (pure), limpiarArchivos
trigger/resumen.ts, trigger/conexiones.ts, trigger/limpieza.ts
lib/sesion/rutas.ts                         + RUTA_DE_CALENDARIO, rutaDeCalendario
app/(app)/calendario/{page,semana,mes}.tsx
app/(app)/piezas/[id]/{page,firma,plan,controles,acciones}.tsx
app/(app)/piezas/nueva/acciones.ts          plans the new piece
app/(app)/page.tsx, app/(app)/navegacion.tsx
scripts/cargar-wr3.ts                       planned dates for the page account
```

---

# Part 1 — Data and rules

## Task 1: The reserve state in the machine

**Files:** Modify `lib/piezas/estados.ts`, `tests/unit/estados.test.ts`

- [ ] **Step 1: Failing test** (append to `tests/unit/estados.test.ts`)

```ts
describe("the reserve (D21)", () => {
  test("a piece waiting for its signature can be signed for the reserve, and the reserve only leaves to a slot, the gate or the bin", () => {
    expect(transicionPermitida("por_aprobar", "en_reserva")).toBe(true)
    expect(transicionPermitida("en_reserva", "programada")).toBe(true)
    expect(transicionPermitida("en_reserva", "por_aprobar")).toBe(true)
    expect(transicionPermitida("en_reserva", "descartada")).toBe(true)
    expect(transicionPermitida("en_reserva", "publicando")).toBe(false)
    expect(transicionPermitida("programada", "en_reserva")).toBe(false)
  })
  test("en_reserva is a known state", () => {
    expect(esEstado("en_reserva")).toBe(true)
  })
})
```

- [ ] **Step 2: Fail** — `pnpm test:run tests/unit/estados.test.ts`.
- [ ] **Step 3: Implement** in `lib/piezas/estados.ts`: add `"en_reserva"` to `ESTADOS` right after `"por_aprobar"`, and in `TRANSICIONES`:

```ts
// The plano's machine for hand-made pieces (C1) plus the reserve (C2, D21). The database guard holds the same table
// (transiciones_de_pieza in 20261030120000_calendario_y_reserva.sql); tests/integration/piezas.test.ts checks they agree.
export const TRANSICIONES: Record<EstadoDePieza, readonly EstadoDePieza[]> = {
  por_aprobar: ["programada", "en_reserva", "descartada"],
  en_reserva: ["programada", "por_aprobar", "descartada"],
  programada: ["por_aprobar", "publicando", "a_mano", "descartada"],
  publicando: ["publicada", "envio_dudoso", "a_mano", "error"],
  error: ["programada", "por_aprobar", "descartada"],
  envio_dudoso: ["publicada", "a_mano", "descartada"],
  a_mano: ["publicada", "por_aprobar", "descartada"],
  publicada: [],
  descartada: [],
}
```

  `app/(app)/piezas/[id]/page.tsx` has a `Record<EstadoDePieza, string>`: add `en_reserva: "En reserva"` now so `pnpm type` stays green.
- [ ] **Step 4: Pass** — `pnpm test:run tests/unit/estados.test.ts && pnpm type`. `tests/integration/piezas.test.ts` («the guard table in SQL matches the app's») is red until Task 3; that is expected and closes there.
- [ ] **Step 5: Commit** — `git commit -m "feat: add the reserve state to the piece machine"`

## Task 2: Planned date, one slot per account, `planear_pieza`

**Files:** Create `supabase/migrations/20261030120000_calendario_y_reserva.sql`, `tests/integration/plan-y-reserva.test.ts`. Modify `tests/integration/entorno.ts`.

- [ ] **Step 1: Helpers** in `tests/integration/entorno.ts`

```ts
export async function piezaDe(db: Db, cuentaId: string, texto = "Hola desde PostIA"): Promise<string> {
  const { data, error } = await db.rpc("crear_pieza", { p_cuenta: cuentaId, p_formato: "texto", p_texto: texto })
  if (error) throw error
  return data
}

export async function versionVigente(piezaId: string): Promise<{ id: string; huella: string }> {
  const { data, error } = await admin()
    .from("versiones")
    .select("id, huella")
    .eq("pieza_id", piezaId)
    .order("numero", { ascending: false })
    .limit(1)
    .single()
  if (error) throw error
  return data
}

export const enDias = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString()
export const haceMinutos = (minutos: number) => new Date(Date.now() - minutos * 60_000).toISOString()
```

- [ ] **Step 2: Failing test** `tests/integration/plan-y-reserva.test.ts`

```ts
import { describe, expect, test } from "vitest"
import { admin, cuentaDe, enDias, marcaConDueno, personaConSesion, piezaDe, versionVigente } from "./entorno"

async function cuentaConDueno(prefijo = "plan") {
  const dueno = await personaConSesion(prefijo)
  const marca = await marcaConDueno(dueno.userId)
  return { ...dueno, marca, cuenta: await cuentaDe(marca) }
}

async function planeada(pieza: string) {
  const { data } = await admin().from("piezas").select("estado, planeada_para, programada_para").eq("id", pieza).single()
  return data
}

describe("planear_pieza", () => {
  test("an owner plans an unsigned piece for a future slot", async () => {
    const { db, cuenta } = await cuentaConDueno()
    const pieza = await piezaDe(db, cuenta)
    const cuando = enDias(2)
    expect((await db.rpc("planear_pieza", { p_pieza: pieza, p_fecha: cuando })).error).toBeNull()
    expect(Date.parse((await planeada(pieza))?.planeada_para ?? "")).toBe(Date.parse(cuando))
  })

  test("a stranger cannot plan someone else's piece", async () => {
    const { db, cuenta } = await cuentaConDueno()
    const pieza = await piezaDe(db, cuenta)
    const extrano = await personaConSesion("plan-extrano")
    const { error } = await extrano.db.rpc("planear_pieza", { p_pieza: pieza, p_fecha: enDias(2) })
    expect(error?.code).toBe("42501")
  })

  test("refuses the past and a piece that is not waiting for its signature", async () => {
    const { db, cuenta } = await cuentaConDueno()
    const pieza = await piezaDe(db, cuenta)
    const pasado = new Date(Date.now() - 60_000).toISOString()
    expect((await db.rpc("planear_pieza", { p_pieza: pieza, p_fecha: pasado })).error?.message).toBe("fecha_en_el_pasado")
    const { huella } = await versionVigente(pieza)
    await db.rpc("firmar_pieza", { p_pieza: pieza, p_huella: huella, p_programada_para: enDias(3) })
    expect((await db.rpc("planear_pieza", { p_pieza: pieza, p_fecha: enDias(4) })).error?.message).toBe(
      "pieza_no_esta_por_aprobar",
    )
  })

  test("a slot taken by a planned or a signed piece of the same account is refused", async () => {
    const { db, cuenta } = await cuentaConDueno()
    const [a, b, c] = [await piezaDe(db, cuenta), await piezaDe(db, cuenta), await piezaDe(db, cuenta)]
    const lunes = enDias(5)
    await db.rpc("planear_pieza", { p_pieza: a, p_fecha: lunes })
    expect((await db.rpc("planear_pieza", { p_pieza: b, p_fecha: lunes })).error?.code).toBe("23505")
    const martes = enDias(6)
    const { huella } = await versionVigente(c)
    await db.rpc("firmar_pieza", { p_pieza: c, p_huella: huella, p_programada_para: martes })
    expect((await db.rpc("planear_pieza", { p_pieza: b, p_fecha: martes })).error?.code).toBe("23505")
  })

  test("another account may use the same slot", async () => {
    const uno = await cuentaConDueno()
    const otra = await cuentaDe(uno.marca, "empresa", "a_mano")
    const cuando = enDias(7)
    await uno.db.rpc("planear_pieza", { p_pieza: await piezaDe(uno.db, uno.cuenta), p_fecha: cuando })
    const { error } = await uno.db.rpc("planear_pieza", { p_pieza: await piezaDe(uno.db, otra), p_fecha: cuando })
    expect(error).toBeNull()
  })

  test("signing moves the plan to the signed date and frees the old slot", async () => {
    const { db, cuenta } = await cuentaConDueno()
    const [a, b] = [await piezaDe(db, cuenta), await piezaDe(db, cuenta)]
    const plan = enDias(8)
    const firmada = enDias(9)
    await db.rpc("planear_pieza", { p_pieza: a, p_fecha: plan })
    const { huella } = await versionVigente(a)
    expect((await db.rpc("firmar_pieza", { p_pieza: a, p_huella: huella, p_programada_para: firmada })).error).toBeNull()
    expect(Date.parse((await planeada(a))?.planeada_para ?? "")).toBe(Date.parse(firmada))
    expect((await db.rpc("planear_pieza", { p_pieza: b, p_fecha: plan })).error).toBeNull()
  })

  test("a piece sent back to the gate keeps its slot as plan", async () => {
    const { db, cuenta } = await cuentaConDueno()
    const pieza = await piezaDe(db, cuenta)
    const cuando = enDias(10)
    const { huella } = await versionVigente(pieza)
    await db.rpc("firmar_pieza", { p_pieza: pieza, p_huella: huella, p_programada_para: cuando })
    await db.rpc("desprogramar_pieza", { p_pieza: pieza })
    const fila = await planeada(pieza)
    expect(fila?.estado).toBe("por_aprobar")
    expect(Date.parse(fila?.planeada_para ?? "")).toBe(Date.parse(cuando))
  })
})
```

- [ ] **Step 3: Fail** — `pnpm db:reset && pnpm test:db tests/integration/plan-y-reserva.test.ts` (no `planear_pieza`).
- [ ] **Step 4: Migration** `supabase/migrations/20261030120000_calendario_y_reserva.sql` (first section)

```sql
-- C2: a proposed slot for pieces nobody signed yet, the reserve week (D21) and grouped notices (D26).
-- Plano: «Lógica del calendario» (proponerFecha, horarioLibreEnCuenta, usarReserva), «Estados de una pieza».
-- The C1 migrations are in production: anything they defined is changed here with alter / create or replace.

-- A proposed slot, never a signature: programada_para keeps meaning «the signed date».
alter table public.piezas add column planeada_para timestamptz;

-- While a piece is signed its plan is its signed date, so one column answers «which slot does this piece hold»
-- (the slot index below and lib/piezas/lectura.ts horariosOcupados rely on it). Leaving the signed states keeps the slot.
create function public.alinear_plan() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.estado in ('programada', 'publicando', 'publicada') then
    new.planeada_para := new.programada_para;
  end if;
  return new;
end $$;
create trigger piezas_alinear_plan before insert or update on public.piezas
  for each row execute function public.alinear_plan();

-- Pieces that went through a signature keep their day as plan; unsigned pieces start without one (a stale date of a
-- piece unscheduled before C2 could collide with a slot signed since).
update public.piezas set planeada_para = programada_para where programada_para is not null and estado <> 'por_aprobar';

-- One account never holds two pieces in one slot, signed or planned (plano: horarioLibreEnCuenta, only inside the account).
create unique index piezas_un_plan_por_cuenta on public.piezas (cuenta_id, planeada_para)
  where estado in ('por_aprobar', 'programada', 'publicando', 'publicada');

-- Moving a proposed slot (plano: moverFecha). The slot index answers 23505 when the slot is taken.
create function public.planear_pieza(p_pieza uuid, p_fecha timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_dueno(public.marca_de_pieza(p_pieza)) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_planea';
  end if;
  if p_fecha is null or p_fecha < now() + interval '1 minute' then
    raise exception using errcode = '22023', message = 'fecha_en_el_pasado';
  end if;
  update public.piezas set planeada_para = p_fecha where id = p_pieza and estado = 'por_aprobar';
  if not found then
    raise exception using errcode = '22023', message = 'pieza_no_esta_por_aprobar';
  end if;
end $$;

revoke execute on function public.planear_pieza(uuid, timestamptz) from public, anon;
grant execute on function public.planear_pieza(uuid, timestamptz) to authenticated;
revoke execute on function public.alinear_plan() from public, anon, authenticated;
```

- [ ] **Step 5: Pass** — `pnpm db:reset && pnpm db:types && pnpm test:db` (the existing `reserva-envio` and `repositorio-publicacion` helpers move `programada_para` of a `programada` piece with the service role; the trigger moves the plan with it, so they stay green); `pnpm type`.
- [ ] **Step 6: Commit** — `git commit -m "feat: give unsigned pieces a planned slot, one slot per account"`

## Task 3: Signing for the reserve, taking a piece out, and the guard

**Files:** Modify the migration, `tests/integration/plan-y-reserva.test.ts`

- [ ] **Step 1: Failing test** (append)

```ts
describe("the reserve (D21)", () => {
  test("signing for the reserve binds the current huella without a date and frees the planned slot", async () => {
    const { db, cuenta } = await cuentaConDueno("reserva")
    const pieza = await piezaDe(db, cuenta)
    const cuando = enDias(2)
    await db.rpc("planear_pieza", { p_pieza: pieza, p_fecha: cuando })
    const { huella } = await versionVigente(pieza)
    const { data: firma, error } = await db.rpc("firmar_para_reserva", { p_pieza: pieza, p_huella: huella })
    expect(error).toBeNull()
    expect(await planeada(pieza)).toMatchObject({ estado: "en_reserva", planeada_para: null, programada_para: null })
    const { data: fila } = await admin().from("firmas").select("para_reserva, programada_para, vigente, huella").eq("id", firma as string).single()
    expect(fila).toEqual({ para_reserva: true, programada_para: null, vigente: true, huella })
    const otra = await piezaDe(db, cuenta)
    expect((await db.rpc("planear_pieza", { p_pieza: otra, p_fecha: cuando })).error).toBeNull()
  })

  test("refuses a stale huella, a stranger and a piece that is not waiting for its signature", async () => {
    const { db, cuenta } = await cuentaConDueno("reserva-no")
    const pieza = await piezaDe(db, cuenta)
    expect((await db.rpc("firmar_para_reserva", { p_pieza: pieza, p_huella: "0".repeat(64) })).error?.message).toBe(
      "firma_de_otra_version",
    )
    const { huella } = await versionVigente(pieza)
    const extrano = await personaConSesion("reserva-extrano")
    expect((await extrano.db.rpc("firmar_para_reserva", { p_pieza: pieza, p_huella: huella })).error?.code).toBe("42501")
    await db.rpc("firmar_para_reserva", { p_pieza: pieza, p_huella: huella })
    expect((await db.rpc("firmar_para_reserva", { p_pieza: pieza, p_huella: huella })).error?.message).toBe(
      "pieza_no_esta_por_aprobar",
    )
  })

  test("the guard refuses entering the reserve without a reserve signature, even for the service role", async () => {
    const { db, cuenta } = await cuentaConDueno("reserva-guardia")
    const pieza = await piezaDe(db, cuenta)
    const { error } = await admin().from("piezas").update({ estado: "en_reserva" }).eq("id", pieza)
    expect(error?.code).toBe("23514")
    expect(error?.message).toBe("reservar_sin_firma_vigente")
  })

  test("the guard refuses scheduling a reserve piece whose signature has no date for that slot", async () => {
    const { db, cuenta } = await cuentaConDueno("reserva-sin-fecha")
    const pieza = await piezaDe(db, cuenta)
    const { huella } = await versionVigente(pieza)
    await db.rpc("firmar_para_reserva", { p_pieza: pieza, p_huella: huella })
    const { error } = await admin().from("piezas").update({ estado: "programada", programada_para: enDias(2) }).eq("id", pieza)
    expect(error?.message).toBe("programar_sin_firma_vigente")
  })

  test("a signature has a date unless it is for the reserve", async () => {
    const { db, cuenta, userId } = await cuentaConDueno("reserva-check")
    const pieza = await piezaDe(db, cuenta)
    const version = await versionVigente(pieza)
    const { error } = await admin().from("firmas").insert({
      pieza_id: pieza,
      version_id: version.id,
      huella: version.huella,
      programada_para: null,
      firmada_por: userId,
    })
    expect(error?.code).toBe("23514")
  })

  test("a new version sends a reserve piece back to the gate and drops its signature", async () => {
    const { db, cuenta } = await cuentaConDueno("reserva-version")
    const pieza = await piezaDe(db, cuenta)
    await db.rpc("firmar_para_reserva", { p_pieza: pieza, p_huella: (await versionVigente(pieza)).huella })
    expect((await db.rpc("nueva_version", { p_pieza: pieza, p_texto: "Otro texto" })).error).toBeNull()
    expect((await planeada(pieza))?.estado).toBe("por_aprobar")
    const { count } = await admin().from("firmas").select("*", { count: "exact", head: true }).eq("pieza_id", pieza).eq("vigente", true)
    expect(count).toBe(0)
  })

  test("taking a piece out of the reserve drops its signature; only a reserve piece can be taken out", async () => {
    const { db, cuenta } = await cuentaConDueno("reserva-sacar")
    const pieza = await piezaDe(db, cuenta)
    expect((await db.rpc("sacar_de_reserva", { p_pieza: pieza })).error?.message).toBe("pieza_no_esta_en_reserva")
    await db.rpc("firmar_para_reserva", { p_pieza: pieza, p_huella: (await versionVigente(pieza)).huella })
    const extrano = await personaConSesion("sacar-extrano")
    expect((await extrano.db.rpc("sacar_de_reserva", { p_pieza: pieza })).error?.code).toBe("42501")
    expect((await db.rpc("sacar_de_reserva", { p_pieza: pieza })).error).toBeNull()
    expect((await planeada(pieza))?.estado).toBe("por_aprobar")
    const { count } = await admin().from("firmas").select("*", { count: "exact", head: true }).eq("pieza_id", pieza).eq("vigente", true)
    expect(count).toBe(0)
  })

  test("a reserve piece can be discarded", async () => {
    const { db, cuenta } = await cuentaConDueno("reserva-descartar")
    const pieza = await piezaDe(db, cuenta)
    await db.rpc("firmar_para_reserva", { p_pieza: pieza, p_huella: (await versionVigente(pieza)).huella })
    expect((await db.rpc("descartar_pieza", { p_pieza: pieza, p_motivo: "" })).error).toBeNull()
    expect((await planeada(pieza))?.estado).toBe("descartada")
  })
})
```

- [ ] **Step 2: Fail.**
- [ ] **Step 3: Migration** (append). The state check was declared inline in C1, so Postgres named it `piezas_estado_check`; confirm with `\d public.piezas` in `supabase db` locally before relying on the name.

```sql
-- D21: «en_reserva» is signed without a date; the app gives it one when a signed piece is missing.
alter table public.piezas drop constraint piezas_estado_check;
alter table public.piezas add constraint piezas_estado_check check (estado in (
  'por_aprobar', 'en_reserva', 'programada', 'publicando', 'publicada', 'envio_dudoso', 'a_mano', 'error', 'descartada'
));

-- A reserve signature binds a huella without a date; cubrir_con_reserva writes the slot on it when it is used.
alter table public.firmas alter column programada_para drop not null;
alter table public.firmas add column para_reserva boolean not null default false;
alter table public.firmas add constraint firma_con_fecha_o_reserva check (para_reserva or programada_para is not null);

-- Same table as lib/piezas/estados.ts. create or replace keeps the C1 grants.
create or replace function public.transiciones_de_pieza() returns table (de text, a text[])
language sql immutable set search_path = '' as $$
  values
    ('por_aprobar', array['programada', 'en_reserva', 'descartada']),
    ('en_reserva', array['programada', 'por_aprobar', 'descartada']),
    ('programada', array['por_aprobar', 'publicando', 'a_mano', 'descartada']),
    ('publicando', array['publicada', 'envio_dudoso', 'a_mano', 'error']),
    ('error', array['programada', 'por_aprobar', 'descartada']),
    ('envio_dudoso', array['publicada', 'a_mano', 'descartada']),
    ('a_mano', array['publicada', 'por_aprobar', 'descartada']),
    ('publicada', array[]::text[]),
    ('descartada', array[]::text[])
$$;

create or replace function public.guardia_de_estado() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_huella text;
begin
  if new.estado is distinct from old.estado then
    if not exists (select 1 from public.transiciones_de_pieza() t where t.de = old.estado and new.estado = any (t.a)) then
      raise exception using errcode = '23514', message = format('transicion_no_permitida %s -> %s', old.estado, new.estado);
    end if;
    select v.huella into v_huella from public.versiones v where v.pieza_id = new.id order by v.numero desc limit 1;
    -- Scheduling needs the signature of the current version for exactly this date (Puerta 2). The date check is new in
    -- C2: a reserve piece only becomes programada once cubrir_con_reserva wrote its slot on the signature.
    if new.estado = 'programada' and not exists (
      select 1 from public.firmas f
       where f.pieza_id = new.id and f.vigente and f.huella = v_huella and f.programada_para = new.programada_para
    ) then
      raise exception using errcode = '23514', message = 'programar_sin_firma_vigente';
    end if;
    if new.estado = 'en_reserva' and not exists (
      select 1 from public.firmas f where f.pieza_id = new.id and f.vigente and f.para_reserva and f.huella = v_huella
    ) then
      raise exception using errcode = '23514', message = 'reservar_sin_firma_vigente';
    end if;
    -- Sending needs the signature of the current version for exactly this date (Puerta 2, Sale lo que se aprobó).
    if new.estado = 'publicando' and not exists (
      select 1 from public.firmas f
       where f.pieza_id = new.id and f.vigente and f.programada_para = new.programada_para and f.huella = v_huella
    ) then
      raise exception using errcode = '23514', message = 'publicar_sin_firma_vigente';
    end if;
    insert into public.eventos (pieza_id, de, a, por, motivo) values (new.id, old.estado, new.estado, auth.uid(), new.motivo);
  end if;
  return new;
end $$;

-- A new version drops any signature; scheduled, by-hand and reserve pieces go back to the gate (Sale lo que se aprobó).
create or replace function public.version_nueva_cae_firma() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.numero > 1 then
    update public.firmas set vigente = false where pieza_id = new.pieza_id and vigente;
    update public.piezas set estado = 'por_aprobar', arrendada_hasta = null,
           motivo = 'Cambió el texto o el archivo: hay que firmar de nuevo.'
     where id = new.pieza_id and estado in ('programada', 'a_mano', 'en_reserva');
  end if;
  return new;
end $$;

-- C1 body plus en_reserva among the editable states.
create or replace function public.nueva_version(
  p_pieza uuid, p_texto text,
  p_titulo text default null, p_archivo_ruta text default null, p_archivo_sha256 text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_estado text;
  v_numero integer;
  v_id uuid;
begin
  if not public.es_dueno(public.marca_de_pieza(p_pieza)) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_cambia_piezas';
  end if;
  select estado into v_estado from public.piezas where id = p_pieza for update;
  if v_estado not in ('por_aprobar', 'en_reserva', 'programada', 'a_mano') then
    raise exception using errcode = '22023', message = 'pieza_no_editable';
  end if;
  select coalesce(max(numero), 0) + 1 into v_numero from public.versiones where pieza_id = p_pieza;
  insert into public.versiones (pieza_id, numero, texto, titulo, archivo_ruta, archivo_sha256, creada_por)
  values (p_pieza, v_numero, p_texto, p_titulo, p_archivo_ruta, p_archivo_sha256, auth.uid()) returning id into v_id;
  return v_id;
end $$;

create function public.firmar_para_reserva(p_pieza uuid, p_huella text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_version public.versiones;
  v_firma uuid;
begin
  if not public.es_dueno(public.marca_de_pieza(p_pieza)) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_firma';
  end if;
  perform 1 from public.piezas where id = p_pieza and estado = 'por_aprobar' for update;
  if not found then
    raise exception using errcode = '22023', message = 'pieza_no_esta_por_aprobar';
  end if;
  select * into v_version from public.versiones where pieza_id = p_pieza order by numero desc limit 1;
  if v_version.huella is distinct from p_huella then
    raise exception using errcode = '22023', message = 'firma_de_otra_version';
  end if;
  update public.firmas set vigente = false where pieza_id = p_pieza and vigente;
  insert into public.firmas (pieza_id, version_id, huella, programada_para, para_reserva, firmada_por)
  values (p_pieza, v_version.id, v_version.huella, null, true, auth.uid()) returning id into v_firma;
  -- In the reserve a piece holds no slot; the one it had becomes free for another piece.
  update public.piezas set estado = 'en_reserva', planeada_para = null, programada_para = null,
         arrendada_hasta = null, motivo = null
   where id = p_pieza;
  return v_firma;
end $$;

create function public.sacar_de_reserva(p_pieza uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_dueno(public.marca_de_pieza(p_pieza)) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_saca_de_la_reserva';
  end if;
  perform 1 from public.piezas where id = p_pieza and estado = 'en_reserva' for update;
  if not found then
    raise exception using errcode = '22023', message = 'pieza_no_esta_en_reserva';
  end if;
  update public.firmas set vigente = false where pieza_id = p_pieza and vigente;
  update public.piezas set estado = 'por_aprobar', motivo = 'Salió de la reserva.' where id = p_pieza;
end $$;

revoke execute on function public.firmar_para_reserva(uuid, text), public.sacar_de_reserva(uuid) from public, anon;
grant execute on function public.firmar_para_reserva(uuid, text), public.sacar_de_reserva(uuid) to authenticated;
```

- [ ] **Step 4: Pass** — `pnpm db:reset && pnpm db:types && pnpm test:db` (all files: the guard's new date check must not break any C1 flow; `piezas.test.ts` «the guard table in SQL matches the app's» turns green with Task 1); `pnpm type` (`firmas.programada_para` becomes `string | null` in the generated types: fix any reader the compiler points at).
- [ ] **Step 5: Commit** — `git commit -m "feat: sign pieces for the reserve without a date (D21)"`

## Task 4: `cubrir_con_reserva` and the reserve end to end

**Files:** Modify the migration, `tests/integration/plan-y-reserva.test.ts`

- [ ] **Step 1: Failing test** (append)

```ts
import { haceMinutos } from "./entorno" // merge into the existing import

/** A planned unsigned piece whose slot just passed. Planning refuses the past, so the slot is moved by the service role. */
async function pendienteVencida(db: Db, cuenta: string, minutos = 2) {
  const pieza = await piezaDe(db, cuenta, "Pendiente sin firma")
  const hueco = haceMinutos(minutos)
  const { error } = await admin().from("piezas").update({ planeada_para: hueco }).eq("id", pieza)
  if (error) throw error
  return { pieza, hueco }
}

async function enReserva(db: Db, cuenta: string, texto = "De la reserva") {
  const pieza = await piezaDe(db, cuenta, texto)
  const { error } = await db.rpc("firmar_para_reserva", { p_pieza: pieza, p_huella: (await versionVigente(pieza)).huella })
  if (error) throw error
  return pieza
}

const cubrir = (pendiente: string, siguiente: string) =>
  admin().rpc("cubrir_con_reserva", { p_pendiente: pendiente, p_siguiente: siguiente })

describe("cubrir_con_reserva (D21)", () => {
  test("the oldest reserve piece takes the slot, its signature gets the date, and reservar_envio accepts it", async () => {
    const { db, cuenta } = await cuentaConDueno("cubrir")
    const vieja = await enReserva(db, cuenta, "Primera de la reserva")
    await enReserva(db, cuenta, "Segunda de la reserva")
    const { pieza: pendiente, hueco } = await pendienteVencida(db, cuenta)
    const siguiente = enDias(3)

    const { data: usada, error } = await cubrir(pendiente, siguiente)
    expect(error).toBeNull()
    expect(usada).toBe(vieja)

    const reserva = await planeada(vieja)
    expect(reserva?.estado).toBe("programada")
    expect(Date.parse(reserva?.programada_para ?? "")).toBe(Date.parse(hueco))
    expect(Date.parse(reserva?.planeada_para ?? "")).toBe(Date.parse(hueco))
    const { data: firma } = await admin().from("firmas").select("id, programada_para, para_reserva").eq("pieza_id", vieja).eq("vigente", true).single()
    expect(Date.parse(firma?.programada_para ?? "")).toBe(Date.parse(hueco))
    expect(firma?.para_reserva).toBe(true)

    const movida = await planeada(pendiente)
    expect(movida?.estado).toBe("por_aprobar")
    expect(Date.parse(movida?.planeada_para ?? "")).toBe(Date.parse(siguiente))

    const version = await versionVigente(vieja)
    const envio = await admin().rpc("reservar_envio", { p_pieza: vieja, p_version: version.id, p_firma: firma?.id as string })
    expect(envio.error).toBeNull()
    expect(envio.data).toBe("reservado")
  })

  test("without a reserve the pending piece still moves, and nothing else changes", async () => {
    const { db, cuenta } = await cuentaConDueno("cubrir-sin")
    const { pieza } = await pendienteVencida(db, cuenta)
    const siguiente = enDias(3)
    const { data, error } = await cubrir(pieza, siguiente)
    expect(error).toBeNull()
    expect(data).toBeNull()
    expect(Date.parse((await planeada(pieza))?.planeada_para ?? "")).toBe(Date.parse(siguiente))
  })

  test("past the slot's window no reserve is used: it would publish late", async () => {
    const { db, cuenta } = await cuentaConDueno("cubrir-tarde")
    const reserva = await enReserva(db, cuenta)
    const { pieza } = await pendienteVencida(db, cuenta, 45)
    expect((await cubrir(pieza, enDias(3))).data).toBeNull()
    expect((await planeada(reserva))?.estado).toBe("en_reserva")
  })

  test("only a reserve piece of the same account is used", async () => {
    const { db, cuenta, marca } = await cuentaConDueno("cubrir-otra")
    const otraCuenta = await cuentaDe(marca, "empresa", "a_mano")
    const ajena = await enReserva(db, otraCuenta)
    const { pieza } = await pendienteVencida(db, cuenta)
    expect((await cubrir(pieza, enDias(3))).data).toBeNull()
    expect((await planeada(ajena))?.estado).toBe("en_reserva")
  })

  test("refuses a piece that is not a due unsigned planned piece, and a next slot in the past", async () => {
    const { db, cuenta } = await cuentaConDueno("cubrir-no")
    const futura = await piezaDe(db, cuenta)
    await db.rpc("planear_pieza", { p_pieza: futura, p_fecha: enDias(2) })
    expect((await cubrir(futura, enDias(3))).error?.message).toBe("pieza_no_espera_reserva")
    const { pieza } = await pendienteVencida(db, cuenta)
    expect((await cubrir(pieza, haceMinutos(1))).error?.message).toBe("fecha_en_el_pasado")
  })

  test("a taken next slot rolls everything back", async () => {
    const { db, cuenta } = await cuentaConDueno("cubrir-choque")
    const reserva = await enReserva(db, cuenta)
    const ocupada = await piezaDe(db, cuenta)
    const siguiente = enDias(3)
    await db.rpc("planear_pieza", { p_pieza: ocupada, p_fecha: siguiente })
    const { pieza, hueco } = await pendienteVencida(db, cuenta)
    expect((await cubrir(pieza, siguiente)).error?.code).toBe("23505")
    expect(Date.parse((await planeada(pieza))?.planeada_para ?? "")).toBe(Date.parse(hueco))
    expect((await planeada(reserva))?.estado).toBe("en_reserva")
  })

  test("a person cannot call it", async () => {
    const { db, cuenta } = await cuentaConDueno("cubrir-persona")
    const { pieza } = await pendienteVencida(db, cuenta)
    const { error } = await db.rpc("cubrir_con_reserva", { p_pendiente: pieza, p_siguiente: enDias(3) })
    expect(error?.code).toBe("42501")
  })
})
```

  (`Db` comes from `@/lib/supabase/database`.)
- [ ] **Step 2: Fail.**
- [ ] **Step 3: Migration** (append)

```sql
-- D21, plano usarReserva (service role only): a due piece nobody signed gives its slot to the oldest reserve piece of
-- its account and moves to p_siguiente (computed by the app with proponerFecha). One transaction: a taken p_siguiente
-- (23505) undoes everything. Returns the reserve piece used, or null when there was none to use.
create function public.cubrir_con_reserva(p_pendiente uuid, p_siguiente timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_pendiente public.piezas;
  v_hueco timestamptz;
  v_reserva uuid;
begin
  select * into v_pendiente from public.piezas where id = p_pendiente for update;
  if not found or v_pendiente.estado <> 'por_aprobar' or v_pendiente.planeada_para is null
     or v_pendiente.planeada_para > now() then
    raise exception using errcode = '22023', message = 'pieza_no_espera_reserva';
  end if;
  if p_siguiente is null or p_siguiente < now() + interval '1 minute' then
    raise exception using errcode = '22023', message = 'fecha_en_el_pasado';
  end if;
  v_hueco := v_pendiente.planeada_para;
  -- The pending piece leaves the slot first: the slot index would otherwise see two pieces in it.
  update public.piezas set planeada_para = p_siguiente,
         motivo = 'No alcanzó firma a tiempo: la corrí al siguiente espacio libre.'
   where id = p_pendiente;

  -- Past the slot's window the reserve piece would go out late («Ventana de atraso»): then no reserve is used.
  select p.id into v_reserva
    from public.piezas p
    join public.firmas f on f.pieza_id = p.id and f.vigente and f.para_reserva
   where p.cuenta_id = v_pendiente.cuenta_id and p.estado = 'en_reserva'
     and now() <= v_hueco + make_interval(mins => p.ventana_minutos)
   order by f.firmada_en, p.id
   limit 1
   for update of p, f skip locked;
  if v_reserva is null then
    return null;
  end if;

  -- Signature first: the guard checks that the signature's date is the piece's date. reservar_envio checks it again.
  update public.firmas set programada_para = v_hueco where pieza_id = v_reserva and vigente;
  update public.piezas set estado = 'programada', programada_para = v_hueco, arrendada_hasta = null,
         motivo = 'Salió de la reserva para cubrir un espacio sin firma.'
   where id = v_reserva;
  return v_reserva;
end $$;

-- Service role only: Supabase's default privileges grant execute to anon and authenticated otherwise.
revoke execute on function public.cubrir_con_reserva(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.cubrir_con_reserva(uuid, timestamptz) to service_role;
```

- [ ] **Step 4: Pass** — `pnpm db:reset && pnpm db:types && pnpm test:db`; `pnpm type`.
- [ ] **Step 5: Commit** — `git commit -m "feat: cover an unsigned slot with the oldest reserve piece (D21)"`

## Task 5: Queue for grouped notices

**Files:** Modify the migration. Create `tests/integration/avisos-pendientes.test.ts`, `lib/avisos/repositorio-de-avisos.ts`.

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, test } from "vitest"
import { anotarAviso, avisosSinEnviar, borrarAvisosEnviados, marcarEnviados } from "@/lib/avisos/repositorio-de-avisos"
import { admin, marcaConDueno, personaConSesion } from "./entorno"

const AVISO = { titulo: "Página de WAV", cuerpo: "No firmaste «Hola» a tiempo; la corrí al martes.", url: "/piezas/x" }

describe("avisos_pendientes", () => {
  test("only the service role reads or writes the queue", async () => {
    const { db, userId } = await personaConSesion("cola")
    const marca = await marcaConDueno(userId)
    expect((await db.from("avisos_pendientes").select("id")).error?.code).toBe("42501")
    const { error } = await db.from("avisos_pendientes").insert({ marca_id: marca, ...AVISO })
    expect(error?.code).toBe("42501")
  })

  test("a line is queued, read once unsent, marked sent and deleted after 30 days", async () => {
    const { userId } = await personaConSesion("cola-ciclo")
    const marca = await marcaConDueno(userId)
    const db = admin()
    await anotarAviso(db, marca, AVISO)
    const mias = (await avisosSinEnviar(db)).filter((l) => l.marcaId === marca)
    expect(mias).toEqual([expect.objectContaining({ marcaId: marca, ...AVISO })])
    const ahora = Date.now()
    await marcarEnviados(db, mias.map((l) => l.id), ahora)
    expect((await avisosSinEnviar(db)).filter((l) => l.marcaId === marca)).toEqual([])
    await borrarAvisosEnviados(db, ahora + 29 * 86_400_000)
    expect((await db.from("avisos_pendientes").select("id").eq("marca_id", marca)).data).toHaveLength(1)
    await borrarAvisosEnviados(db, ahora + 31 * 86_400_000)
    expect((await db.from("avisos_pendientes").select("id").eq("marca_id", marca)).data).toHaveLength(0)
  })

  test("a line only opens a path inside the app", async () => {
    const { userId } = await personaConSesion("cola-url")
    const marca = await marcaConDueno(userId)
    const { error } = await admin().from("avisos_pendientes").insert({ marca_id: marca, ...AVISO, url: "https://ejemplo.com" })
    expect(error?.code).toBe("23514")
  })
})
```

- [ ] **Step 2: Fail.**
- [ ] **Step 3: Migration** (append)

```sql
-- D26: non-urgent notices wait here for the 9:00 and 17:00 digest (trigger/resumen.ts). Service role only.
create table public.avisos_pendientes (
  id uuid primary key default gen_random_uuid(),
  marca_id uuid not null references public.marcas (id) on delete cascade,
  titulo text not null check (length(titulo) between 1 and 120),
  cuerpo text not null check (length(cuerpo) between 1 and 300),
  url text not null check (url ~ '^/[^/]'),
  creado_en timestamptz not null default now(),
  enviado_en timestamptz
);
create index avisos_pendientes_sin_enviar on public.avisos_pendientes (marca_id) where enviado_en is null;

alter table public.avisos_pendientes enable row level security;
-- No policies: people never see the queue. The revoke matters because Supabase grants new tables to anon and authenticated.
revoke all on public.avisos_pendientes from anon, authenticated;
```

- [ ] **Step 4: Implement** `lib/avisos/repositorio-de-avisos.ts`

```ts
import type { Db } from "@/lib/supabase/database"
import type { MensajePush } from "./tipos"

export interface LineaPendiente extends MensajePush {
  id: string
  marcaId: string
}

const TREINTA_DIAS_MS = 30 * 86_400_000

function fallo(accion: string, error: { message: string }): never {
  throw new Error(`${accion}: ${error.message}`, { cause: error })
}

export async function anotarAviso(db: Db, marcaId: string, aviso: MensajePush): Promise<void> {
  const { error } = await db
    .from("avisos_pendientes")
    .insert({ marca_id: marcaId, titulo: aviso.titulo, cuerpo: aviso.cuerpo, url: aviso.url })
  if (error) fallo("No pude anotar el aviso", error)
}

export async function avisosSinEnviar(db: Db): Promise<LineaPendiente[]> {
  const { data, error } = await db
    .from("avisos_pendientes")
    .select("id, marca_id, titulo, cuerpo, url")
    .is("enviado_en", null)
    .order("creado_en")
  if (error) fallo("No pude leer los avisos pendientes", error)
  return data.map((f) => ({ id: f.id, marcaId: f.marca_id, titulo: f.titulo, cuerpo: f.cuerpo, url: f.url }))
}

export async function marcarEnviados(db: Db, ids: readonly string[], ahora: number): Promise<void> {
  if (ids.length === 0) return
  const { error } = await db
    .from("avisos_pendientes")
    .update({ enviado_en: new Date(ahora).toISOString() })
    .in("id", [...ids])
  if (error) fallo("No pude marcar los avisos como enviados", error)
}

export async function borrarAvisosEnviados(db: Db, ahora: number): Promise<void> {
  const { error } = await db
    .from("avisos_pendientes")
    .delete()
    .lt("enviado_en", new Date(ahora - TREINTA_DIAS_MS).toISOString())
  if (error) fallo("No pude borrar los avisos viejos", error)
}
```

- [ ] **Step 5: Pass** — `pnpm db:reset && pnpm db:types && pnpm test:db`; `pnpm type`.
- [ ] **Step 6: Commit** — `git commit -m "feat: queue non-urgent notices for the daily digest (D26)"`

## Task 6: Calendar arithmetic in Chile time

**Files:** Create `lib/piezas/calendario.ts`, `tests/unit/calendario.test.ts`. Modify `lib/piezas/horarios.ts` (export `fechaEnSantiago`, add `repartirFechas`), `tests/unit/horarios.test.ts`.

- [ ] **Step 1: Failing tests**

```ts
// tests/unit/calendario.test.ts
import { describe, expect, test } from "vitest"
import {
  cuadriculaDelMes,
  diasDeLaSemana,
  huecosDeLaSemana,
  leerVista,
  limitesDelMes,
  semanaDe,
} from "@/lib/piezas/calendario"

describe("semanaDe", () => {
  test("a Wednesday belongs to the week starting Monday at 00:00 Chile time", () => {
    expect(semanaDe(Date.parse("2026-10-28T13:00:00Z"))).toEqual({
      lunes: "2026-10-26",
      desde: "2026-10-26T03:00:00.000Z",
      hasta: "2026-11-02T03:00:00.000Z",
    })
  })
  test("Sunday 23:30 in Chile is still the same week, even though it is Monday in UTC", () => {
    expect(semanaDe(Date.parse("2026-11-02T02:30:00Z")).lunes).toBe("2026-10-26")
  })
  test("a week that crosses the end of summer time ends at the winter offset", () => {
    // Chile leaves summer time the night of Saturday 3 April 2027.
    expect(semanaDe(Date.parse("2027-04-01T15:00:00Z"))).toEqual({
      lunes: "2027-03-29",
      desde: "2027-03-29T03:00:00.000Z",
      hasta: "2027-04-05T04:00:00.000Z",
    })
  })
})

describe("diasDeLaSemana", () => {
  test("Monday to Sunday, across a month", () => {
    expect(diasDeLaSemana("2026-10-26")).toEqual([
      "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01",
    ])
  })
})

describe("huecosDeLaSemana", () => {
  test("counts planned and signed pieces against the rhythm; the reserve and discarded pieces do not fill it", () => {
    const cuentas = [
      { id: "perfil", ritmoSemanal: 3 },
      { id: "pagina", ritmoSemanal: 3 },
    ]
    const piezas = [
      { cuentaId: "perfil", estado: "programada" as const },
      { cuentaId: "perfil", estado: "por_aprobar" as const },
      { cuentaId: "perfil", estado: "descartada" as const },
      { cuentaId: "pagina", estado: "publicada" as const },
      { cuentaId: "pagina", estado: "a_mano" as const },
      { cuentaId: "pagina", estado: "programada" as const },
      { cuentaId: "pagina", estado: "programada" as const },
    ]
    expect(huecosDeLaSemana(cuentas, piezas)).toEqual({ perfil: 1, pagina: 0 })
  })
})

describe("cuadriculaDelMes", () => {
  test("November 2026 starts on a Sunday and ends on a Monday: six rows, Monday first", () => {
    const filas = cuadriculaDelMes("2026-11")
    expect(filas).toHaveLength(6)
    expect(filas[0]).toEqual([null, null, null, null, null, null, "2026-11-01"])
    expect(filas[5]).toEqual(["2026-11-30", null, null, null, null, null, null])
    expect(filas.flat().filter((d) => d !== null)).toHaveLength(30)
  })
  test("its bounds are the first of the month and the first of the next, Chile time", () => {
    expect(limitesDelMes("2026-12")).toEqual({ desde: "2026-12-01T03:00:00.000Z", hasta: "2027-01-01T03:00:00.000Z" })
  })
})

describe("leerVista", () => {
  const AHORA = Date.parse("2026-10-28T13:00:00Z")
  test("defaults to this week", () => {
    expect(leerVista({}, AHORA)).toMatchObject({ vista: "semana", semana: { lunes: "2026-10-26" } })
  })
  test("any day of a week opens that week", () => {
    expect(leerVista({ semana: "2026-11-05" }, AHORA)).toMatchObject({ vista: "semana", semana: { lunes: "2026-11-02" } })
  })
  test("the month view, and garbage falling back to the present", () => {
    expect(leerVista({ vista: "mes", mes: "2026-12" }, AHORA)).toEqual({ vista: "mes", mes: "2026-12" })
    expect(leerVista({ vista: "mes", mes: "diciembre" }, AHORA)).toEqual({ vista: "mes", mes: "2026-10" })
    expect(leerVista({ semana: "2026-13-45" }, AHORA)).toMatchObject({ vista: "semana", semana: { lunes: "2026-10-26" } })
  })
})
```

```ts
// append to tests/unit/horarios.test.ts
import { repartirFechas } from "@/lib/piezas/horarios" // merge into the existing import

describe("repartirFechas", () => {
  test("gives consecutive free slots of one account, never reusing one (plano: repartir)", () => {
    const AHORA = Date.parse("2026-10-28T13:00:00Z") // Wednesday 10:00 in Chile
    const ocupado = [Date.parse("2026-10-29T18:00:00Z")]
    expect(repartirFechas("empresa", ocupado, 3, AHORA).map((f) => f.toISOString())).toEqual([
      "2026-10-28T18:00:00.000Z",
      "2026-11-03T18:00:00.000Z",
      "2026-11-04T18:00:00.000Z",
    ])
  })
})
```

- [ ] **Step 2: Fail.** If a time-zone expectation disagrees, check it against `new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", timeZoneName: "short" })` before touching the code: the test may be wrong about the date of a change, not the code.
- [ ] **Step 3: Implement.** In `lib/piezas/horarios.ts`, export `fechaEnSantiago` (add `export`) and append:

```ts
/** Consecutive free slots for `cuantas` new pieces of one account (plano: repartir). */
export function repartirFechas(
  tipo: "persona" | "empresa",
  ocupados: readonly number[],
  cuantas: number,
  ahora: number,
): Date[] {
  const tomados = [...ocupados]
  const fechas: Date[] = []
  for (let i = 0; i < cuantas; i++) {
    const fecha = proponerFecha(tipo, tomados, ahora)
    fechas.push(fecha)
    tomados.push(fecha.getTime())
  }
  return fechas
}
```

  `lib/piezas/calendario.ts`:

```ts
import type { EstadoDePieza } from "@/lib/piezas/estados"
import { enSantiago, fechaEnSantiago } from "@/lib/piezas/horarios"

/** A calendar day in Chile, «YYYY-MM-DD». */
export type Dia = string
/** A calendar month in Chile, «YYYY-MM». */
export type Mes = string

export interface Semana {
  lunes: Dia
  /** Monday 00:00 in Chile, inclusive. */
  desde: string
  /** The next Monday 00:00 in Chile, exclusive. */
  hasta: string
}

const DIA = /^(\d{4})-(\d{2})-(\d{2})$/
const MES = /^(\d{4})-(\d{2})$/

function dos(n: number): string {
  return String(n).padStart(2, "0")
}

function partesDelDia(dia: Dia): [number, number, number] | null {
  const m = DIA.exec(dia)
  if (!m) return null
  const [anio, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const fecha = new Date(Date.UTC(anio, mes - 1, d))
  // 2026-02-31 would roll over to March: refuse it instead.
  return fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === d ? [anio, mes, d] : null
}

function exigirDia(dia: Dia): [number, number, number] {
  const partes = partesDelDia(dia)
  if (!partes) throw new Error(`Día inválido: ${dia}`)
  return partes
}

export function sumarDias(dia: Dia, n: number): Dia {
  const [anio, mes, d] = exigirDia(dia)
  const f = new Date(Date.UTC(anio, mes - 1, d + n))
  return `${f.getUTCFullYear()}-${dos(f.getUTCMonth() + 1)}-${dos(f.getUTCDate())}`
}

export function diaEnSantiago(instante: number): Dia {
  const { anio, mes, dia } = fechaEnSantiago(instante)
  return `${anio}-${dos(mes)}-${dos(dia)}`
}

function inicioDelDia(dia: Dia): string {
  const [anio, mes, d] = exigirDia(dia)
  return enSantiago(anio, mes, d, 0, 0).toISOString()
}

export function semanaDelLunes(lunes: Dia): Semana {
  return { lunes, desde: inicioDelDia(lunes), hasta: inicioDelDia(sumarDias(lunes, 7)) }
}

/** The Monday-to-Sunday week, in Chile, that holds an instant (plano: verSemana). */
export function semanaDe(instante: number): Semana {
  const { diaSemana } = fechaEnSantiago(instante)
  return semanaDelLunes(sumarDias(diaEnSantiago(instante), -((diaSemana + 6) % 7)))
}

export function diasDeLaSemana(lunes: Dia): Dia[] {
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i))
}

// What fills a week's rhythm: a piece with a slot that is out or may still go out. Reserve pieces hold no slot yet.
const CUENTAN_PARA_EL_RITMO: ReadonlySet<EstadoDePieza> = new Set<EstadoDePieza>([
  "por_aprobar",
  "programada",
  "publicando",
  "publicada",
  "a_mano",
  "envio_dudoso",
])

/** How many pieces each account still lacks in one week against its weekly rhythm (plano: marcarHuecos). */
export function huecosDeLaSemana(
  cuentas: readonly { id: string; ritmoSemanal: number }[],
  piezas: readonly { cuentaId: string; estado: EstadoDePieza }[],
): Record<string, number> {
  return Object.fromEntries(
    cuentas.map((c) => {
      const tiene = piezas.filter((p) => p.cuentaId === c.id && CUENTAN_PARA_EL_RITMO.has(p.estado)).length
      return [c.id, Math.max(0, c.ritmoSemanal - tiene)]
    }),
  )
}

export function mesDe(instante: number): Mes {
  return diaEnSantiago(instante).slice(0, 7)
}

export function mesVecino(mes: Mes, paso: number): Mes {
  const [anio, m] = exigirDia(`${mes}-01`)
  const f = new Date(Date.UTC(anio, m - 1 + paso, 1))
  return `${f.getUTCFullYear()}-${dos(f.getUTCMonth() + 1)}`
}

export function limitesDelMes(mes: Mes): { desde: string; hasta: string } {
  return { desde: inicioDelDia(`${mes}-01`), hasta: inicioDelDia(`${mesVecino(mes, 1)}-01`) }
}

/** The weeks of a month as rows from Monday to Sunday; days of the neighbouring months are null. */
export function cuadriculaDelMes(mes: Mes): (Dia | null)[][] {
  const [anio, m] = exigirDia(`${mes}-01`)
  const largo = new Date(Date.UTC(anio, m, 0)).getUTCDate()
  const desfase = (new Date(Date.UTC(anio, m - 1, 1)).getUTCDay() + 6) % 7
  const celdas: (Dia | null)[] = [
    ...Array.from({ length: desfase }, () => null),
    ...Array.from({ length: largo }, (_, i) => sumarDias(`${mes}-01`, i)),
  ]
  while (celdas.length % 7 !== 0) celdas.push(null)
  return Array.from({ length: celdas.length / 7 }, (_, i) => celdas.slice(i * 7, i * 7 + 7))
}

export type Vista = { vista: "semana"; semana: Semana } | { vista: "mes"; mes: Mes }

/** What /calendario shows from its query string; anything malformed falls back to the present. */
export function leerVista(params: { vista?: string; semana?: string; mes?: string }, ahora: number): Vista {
  if (params.vista === "mes") {
    const valido = params.mes !== undefined && MES.test(params.mes) && partesDelDia(`${params.mes}-01`) !== null
    return { vista: "mes", mes: valido && params.mes ? params.mes : mesDe(ahora) }
  }
  const partes = params.semana ? partesDelDia(params.semana) : null
  // Noon, not midnight: any instant inside the chosen day finds its week.
  const instante = partes ? enSantiago(partes[0], partes[1], partes[2], 12, 0).getTime() : ahora
  return { vista: "semana", semana: semanaDe(instante) }
}
```

- [ ] **Step 4: Pass** — `pnpm test:run tests/unit/calendario.test.ts tests/unit/horarios.test.ts`.
- [ ] **Step 5: Commit** — `git commit -m "feat: add Chile-time week and month arithmetic for the calendar"`

## Task 7: Reading: occupied slots, the calendar, the tray and the detail

**Files:** Modify `lib/piezas/lectura.ts`, `tests/integration/lectura-piezas.test.ts`. Create `tests/integration/calendario.test.ts`.

- [ ] **Step 1: Failing tests**

```ts
// tests/integration/calendario.test.ts
import { describe, expect, test } from "vitest"
import { calendario, horariosOcupados } from "@/lib/piezas/lectura"
import { admin, cuentaDe, enDias, marcaConDueno, personaConSesion, piezaDe, versionVigente } from "./entorno"

async function escenario() {
  const dueno = await personaConSesion("calendario")
  const marca = await marcaConDueno(dueno.userId)
  const cuenta = await cuentaDe(marca)
  const [planeada, firmada, reserva] = [
    await piezaDe(dueno.db, cuenta, "Planeada"),
    await piezaDe(dueno.db, cuenta, "Firmada"),
    await piezaDe(dueno.db, cuenta, "Reserva"),
  ]
  const plan = enDias(2)
  const firma = enDias(3)
  await dueno.db.rpc("planear_pieza", { p_pieza: planeada, p_fecha: plan })
  await dueno.db.rpc("firmar_pieza", { p_pieza: firmada, p_huella: (await versionVigente(firmada)).huella, p_programada_para: firma })
  await dueno.db.rpc("firmar_para_reserva", { p_pieza: reserva, p_huella: (await versionVigente(reserva)).huella })
  return { ...dueno, marca, cuenta, planeada, firmada, reserva, plan, firma }
}

describe("horariosOcupados", () => {
  test("planned and signed slots of the account, from now on, optionally without one piece", async () => {
    const e = await escenario()
    const todos = await horariosOcupados(e.db, e.cuenta, Date.now())
    expect(todos.sort()).toEqual([Date.parse(e.plan), Date.parse(e.firma)].sort())
    expect(await horariosOcupados(e.db, e.cuenta, Date.now(), e.planeada)).toEqual([Date.parse(e.firma)])
  })
})

describe("calendario", () => {
  test("returns the member's accounts with rhythm and reserve, and the pieces whose slot falls in the range", async () => {
    const e = await escenario()
    const { cuentas, piezas } = await calendario(e.db, new Date().toISOString(), enDias(30))
    expect(cuentas).toEqual([
      expect.objectContaining({ id: e.cuenta, marcaId: e.marca, tipo: "persona", ritmoSemanal: 3, enReserva: 1 }),
    ])
    expect(piezas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: e.planeada, estado: "por_aprobar", firmada: false, extracto: "Planeada" }),
        expect.objectContaining({ id: e.firmada, estado: "programada", firmada: true }),
      ]),
    )
    expect(piezas.find((p) => p.id === e.reserva)).toBeUndefined()
  })

  test("a stranger sees nothing", async () => {
    await escenario()
    const extrano = await personaConSesion("calendario-extrano")
    expect(await calendario(extrano.db, new Date().toISOString(), enDias(30))).toEqual({ cuentas: [], piezas: [] })
  })
})
```

  Append to `tests/integration/lectura-piezas.test.ts`: `bandeja` puts a reserve piece in `enReserva` (not in `porFirmar`) and carries `planeadaPara` on a planned card; `detalle` of a piece planned in the future returns `planeadaPara` and `fechaPropuesta` equal to it; `detalle` of an unplanned piece of an account whose next free slot is planned by another piece proposes the slot after it (the piece's own plan is excluded from the occupancy, another piece's is not).
- [ ] **Step 2: Fail.**
- [ ] **Step 3: Implement** in `lib/piezas/lectura.ts`:

```ts
// The states that hold a slot: the plan of an unsigned piece, or the signed date (planeada_para follows it while signed).
const CON_HORARIO = ["por_aprobar", "programada", "publicando", "publicada"] as const
// What the calendar shows: anything with a slot that is out, may still go out, or needs a person.
const EN_EL_CALENDARIO = ["por_aprobar", "programada", "publicando", "publicada", "a_mano", "envio_dudoso", "error"] as const

function extractoDe(versiones: { numero: number; texto: string; titulo: string | null }[], largo = LARGO_DEL_EXTRACTO) {
  const ultima = ultimaVersion(versiones)
  const base = [...(ultima?.titulo ?? ultima?.texto ?? "")]
  return base.length > largo ? `${base.slice(0, largo).join("")}…` : base.join("")
}

/** The slots an account holds from `desde` on, signed and planned alike (plano: huecosLibres reads this). */
export async function horariosOcupados(db: Db, cuentaId: string, desde: number, excepto?: string): Promise<number[]> {
  let consulta = db
    .from("piezas")
    .select("planeada_para")
    .eq("cuenta_id", cuentaId)
    .in("estado", [...CON_HORARIO])
    .gte("planeada_para", new Date(desde).toISOString())
  if (excepto) consulta = consulta.neq("id", excepto)
  const { data, error } = await consulta
  if (error) throw new Error(`No pude leer los horarios: ${error.message}`, { cause: error })
  return data.flatMap((f) => (f.planeada_para === null ? [] : [Date.parse(f.planeada_para)]))
}

export interface CuentaDelCalendario {
  id: string
  nombre: string
  marcaId: string
  tipo: "persona" | "empresa"
  ritmoSemanal: number
  enReserva: number
}

export interface PiezaDelCalendario {
  id: string
  cuentaId: string
  estado: EstadoDePieza
  instante: string
  firmada: boolean
  extracto: string
}

export async function calendario(
  db: Db,
  desde: string,
  hasta: string,
): Promise<{ cuentas: CuentaDelCalendario[]; piezas: PiezaDelCalendario[] }> {
  const [cuentas, reservas, piezas] = await Promise.all([
    db.from("cuentas").select("id, nombre, marca_id, tipo, ritmo_semanal").order("nombre"),
    db.from("piezas").select("cuenta_id").eq("estado", "en_reserva"),
    db
      .from("piezas")
      .select("id, cuenta_id, estado, planeada_para, versiones(numero, texto, titulo)")
      .in("estado", [...EN_EL_CALENDARIO])
      .gte("planeada_para", desde)
      .lt("planeada_para", hasta)
      .order("planeada_para"),
  ])
  for (const r of [cuentas, reservas, piezas]) {
    if (r.error) throw new Error(`No pude leer el calendario: ${r.error.message}`, { cause: r.error })
  }
  const enReserva = new Map<string, number>()
  for (const r of reservas.data ?? []) enReserva.set(r.cuenta_id, (enReserva.get(r.cuenta_id) ?? 0) + 1)
  return {
    cuentas: (cuentas.data ?? []).map((c) => ({
      id: c.id,
      nombre: c.nombre,
      marcaId: c.marca_id,
      tipo: leerTipo(c.tipo),
      ritmoSemanal: c.ritmo_semanal,
      enReserva: enReserva.get(c.id) ?? 0,
    })),
    piezas: (piezas.data ?? []).flatMap((p) =>
      p.planeada_para === null
        ? []
        : [
            {
              id: p.id,
              cuentaId: p.cuenta_id,
              estado: leerEstado(p.estado),
              instante: p.planeada_para,
              firmada: p.estado !== "por_aprobar",
              extracto: extractoDe(p.versiones, 60),
            },
          ],
    ),
  }
}
```

  If the generated types make `r.data` non-null only inside a narrowed branch, destructure each result separately instead of the loop; keep the explicit throw.

  `bandeja`: add `"en_reserva"` to the states read, select `planeada_para`, order by `planeada_para` (ascending, nulls last) then `creada_en` (the plan equals the signed date for signed pieces), add `planeadaPara: string | null` to `TarjetaDePieza` and `enReserva: TarjetaDePieza[]` to `Bandeja`, and build the extract with `extractoDe`.

  `detalle`: add `planeadaPara: string | null` to `DetalleDePieza`; replace the occupancy query with `horariosOcupados(db, p.cuentas.id, ahora, p.id)`; `fechaPropuesta` is `p.planeada_para` when it is more than one minute ahead of `ahora`, otherwise `proponerFecha(tipo, horarios, ahora)`.
- [ ] **Step 4: Pass** — `pnpm test:db && pnpm type`.
- [ ] **Step 5: Commit** — `git commit -m "feat: read occupied slots, the calendar and the reserve"`

## Task 8: Actions: plan, sign for the reserve, take out of the reserve

**Files:** Modify `lib/piezas/acciones.ts`, `tests/integration/acciones-piezas.test.ts`

- [ ] **Step 1: Failing test** (append)

```ts
import { firmarParaReserva, planearConFechaPropuesta, planearPieza, sacarDeReserva } from "@/lib/piezas/acciones"
import { enDias, versionVigente } from "./entorno" // merge into the existing imports

describe("plans and the reserve", () => {
  test("two new pieces of one account get consecutive proposed slots", async () => {
    const { db, userId } = await personaConSesion("acc-plan")
    const cuenta = await cuentaDe(await marcaConDueno(userId))
    const a = await crearPieza(db, { cuentaId: cuenta, formato: "texto", texto: "Una" })
    const b = await crearPieza(db, { cuentaId: cuenta, formato: "texto", texto: "Otra" })
    if (!a.ok || !b.ok) throw new Error("no se crearon")
    const planA = await planearConFechaPropuesta(db, a.piezaId)
    const planB = await planearConFechaPropuesta(db, b.piezaId)
    if (!planA.ok || !planB.ok) throw new Error("no se planearon")
    expect(Date.parse(planB.planeadaPara)).toBeGreaterThan(Date.parse(planA.planeadaPara))
  })

  test("moving the plan explains a taken slot and the past in words", async () => {
    const { db, userId } = await personaConSesion("acc-mover")
    const cuenta = await cuentaDe(await marcaConDueno(userId))
    const a = await crearPieza(db, { cuentaId: cuenta, formato: "texto", texto: "Una" })
    const b = await crearPieza(db, { cuentaId: cuenta, formato: "texto", texto: "Otra" })
    if (!a.ok || !b.ok) throw new Error("no se crearon")
    const cuando = enDias(4)
    expect(await planearPieza(db, { piezaId: a.piezaId, planeadaPara: cuando })).toEqual({ ok: true })
    expect(await planearPieza(db, { piezaId: b.piezaId, planeadaPara: cuando })).toEqual({
      ok: false,
      error: "Esa cuenta ya tiene una pieza a esa hora. Elige otra.",
    })
    expect(await planearPieza(db, { piezaId: b.piezaId, planeadaPara: new Date(Date.now() - 60_000).toISOString() })).toEqual({
      ok: false,
      error: "Elige una fecha y hora futuras.",
    })
  })

  test("signs for the reserve, refuses a stale version, and takes the piece out again", async () => {
    const { db, userId } = await personaConSesion("acc-reserva")
    const cuenta = await cuentaDe(await marcaConDueno(userId))
    const creada = await crearPieza(db, { cuentaId: cuenta, formato: "texto", texto: "Para la reserva" })
    if (!creada.ok) throw new Error(creada.error)
    expect(await firmarParaReserva(db, { piezaId: creada.piezaId, huella: "0".repeat(64) })).toEqual({
      ok: false,
      error: "La pieza cambió desde que la abriste. Revísala de nuevo antes de firmar.",
    })
    const { huella } = await versionVigente(creada.piezaId)
    expect(await firmarParaReserva(db, { piezaId: creada.piezaId, huella })).toEqual({ ok: true })
    expect(await sacarDeReserva(db, creada.piezaId)).toEqual({ ok: true })
    expect(await sacarDeReserva(db, creada.piezaId)).toEqual({ ok: false, error: "Esta pieza ya no está en la reserva." })
  })
})
```

- [ ] **Step 2: Fail.**
- [ ] **Step 3: Implement** in `lib/piezas/acciones.ts`. Add to `MENSAJES`:

```ts
  solo_el_dueno_planea: "Solo el dueño de la marca puede mover la fecha planeada.",
  solo_el_dueno_saca_de_la_reserva: "Solo el dueño de la marca puede sacar piezas de la reserva.",
  pieza_no_esta_en_reserva: "Esta pieza ya no está en la reserva.",
  pieza_no_espera_reserva: "Esta pieza ya no espera una pieza de la reserva.",
```

  add `"reservar_sin_firma_vigente"` to `MENSAJES_DE_LA_GUARDIA`, and append:

```ts
import { proponerFecha } from "@/lib/piezas/horarios"
import { horariosOcupados } from "@/lib/piezas/lectura"

const Plan = z.object({ piezaId: z.uuid(), planeadaPara: z.iso.datetime({ offset: true }) })

export async function planearPieza(db: Db, entrada: unknown): Promise<Resultado> {
  const leida = Plan.safeParse(entrada)
  if (!leida.success) return { ok: false, error: "Revisa la fecha y la hora." }
  const { error } = await db.rpc("planear_pieza", { p_pieza: leida.data.piezaId, p_fecha: leida.data.planeadaPara })
  return error ? falla(error) : { ok: true }
}

// Two pieces created at once can race for the same proposed slot; the slot index refuses the second (23505).
const INTENTOS_DE_PLAN = 3

/** Plans an unsigned piece in the first free slot of its account (D19). Used after creating it and after the reserve. */
export async function planearConFechaPropuesta(
  db: Db,
  piezaId: string,
  ahora = Date.now(),
): Promise<Resultado<{ planeadaPara: string }>> {
  if (!Id.safeParse(piezaId).success) return { ok: false, error: DATOS_DE_PIEZA }
  const { data: pieza, error } = await db.from("piezas").select("cuenta_id, cuentas(tipo)").eq("id", piezaId).maybeSingle()
  if (error) return falla(error)
  if (!pieza?.cuentas) return { ok: false, error: DATOS_DE_PIEZA }
  const tipo = pieza.cuentas.tipo === "empresa" ? "empresa" : "persona"
  const ocupados = await horariosOcupados(db, pieza.cuenta_id, ahora, piezaId)
  for (let intento = 0; intento < INTENTOS_DE_PLAN; intento++) {
    const fecha = proponerFecha(tipo, ocupados, ahora)
    const { error: errorDePlan } = await db.rpc("planear_pieza", { p_pieza: piezaId, p_fecha: fecha.toISOString() })
    if (!errorDePlan) return { ok: true, planeadaPara: fecha.toISOString() }
    if (errorDePlan.code !== "23505") return falla(errorDePlan)
    ocupados.push(fecha.getTime())
  }
  return { ok: false, error: "No encontré un horario libre. Elige la fecha a mano." }
}

const FirmaDeReserva = z.object({ piezaId: z.uuid(), huella: z.string().regex(/^[0-9a-f]{64}$/) })

export async function firmarParaReserva(db: Db, entrada: unknown): Promise<Resultado> {
  const leida = FirmaDeReserva.safeParse(entrada)
  if (!leida.success) return { ok: false, error: DATOS_DE_PIEZA }
  const { error } = await db.rpc("firmar_para_reserva", { p_pieza: leida.data.piezaId, p_huella: leida.data.huella })
  return error ? falla(error) : { ok: true }
}

export async function sacarDeReserva(db: Db, piezaId: string): Promise<Resultado> {
  if (!Id.safeParse(piezaId).success) return { ok: false, error: DATOS_DE_PIEZA }
  const { error } = await db.rpc("sacar_de_reserva", { p_pieza: piezaId })
  return error ? falla(error) : { ok: true }
}
```

  (`pieza.cuentas.tipo` is checked by the database to be `persona` or `empresa`; if the generated type is `string`, use `leerTipo` exported from `lectura.ts` instead of the ternary.)
- [ ] **Step 4: Pass** — `pnpm test:db && pnpm type`.
- [ ] **Step 5: Commit** — `git commit -m "feat: plan pieces and manage the reserve through owner actions"`

# Part 2 — Screens

## Task 9: Piece detail: planned date, signing for the reserve, the reserve state

**Files:** Create `app/(app)/piezas/[id]/plan.tsx`, `tests/unit/plan.test.tsx`, `tests/unit/reserva.test.tsx`. Modify `app/(app)/piezas/[id]/{page.tsx,firma.tsx,controles.tsx,acciones.ts}`, `tests/unit/firma.test.tsx`.

- [ ] **Step 1: Failing component tests**

```tsx
// tests/unit/plan.test.tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { PlanDePieza } from "@/app/(app)/piezas/[id]/plan"

const PIEZA = "11111111-1111-4111-8111-111111111111"

function montar(planeadaPara: string | null, planear = vi.fn(async () => ({ ok: true as const }))) {
  render(<PlanDePieza piezaId={PIEZA} planeadaPara={planeadaPara} planear={planear} />)
  return planear
}

describe("PlanDePieza", () => {
  test("shows the planned date in Chile time and says it is not a signature", () => {
    montar("2026-11-03T14:00:00.000Z")
    expect(screen.getByRole("heading", { name: "Fecha planeada" })).toBeInTheDocument()
    expect(screen.getByText("martes 3 de noviembre, 11:00")).toBeInTheDocument()
    expect(screen.getByText("Es una propuesta: sale solo si la firmas.")).toBeInTheDocument()
  })

  test("says so when there is no plan", () => {
    montar(null)
    expect(screen.getByText("Sin fecha planeada")).toBeInTheDocument()
  })

  test("moves the plan with the field read as Chile time", async () => {
    const planear = montar("2026-11-03T14:00:00.000Z")
    fireEvent.click(screen.getByRole("button", { name: "Mover fecha" }))
    fireEvent.change(screen.getByLabelText("Nueva fecha planeada"), { target: { value: "2026-11-05T11:00" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar fecha" }))
    await waitFor(() => expect(planear).toHaveBeenCalledWith({ piezaId: PIEZA, planeadaPara: "2026-11-05T14:00:00.000Z" }))
  })

  test("shows a refusal as an alert", async () => {
    montar("2026-11-03T14:00:00.000Z", vi.fn(async () => ({ ok: false as const, error: "Esa cuenta ya tiene una pieza a esa hora. Elige otra." })))
    fireEvent.click(screen.getByRole("button", { name: "Mover fecha" }))
    fireEvent.click(screen.getByRole("button", { name: "Guardar fecha" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Esa cuenta ya tiene una pieza a esa hora. Elige otra.")
  })
})
```

```tsx
// tests/unit/reserva.test.tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { SacarDeReserva } from "@/app/(app)/piezas/[id]/controles"

describe("SacarDeReserva", () => {
  test("takes the piece out of the reserve and shows a refusal as an alert", async () => {
    const sacar = vi.fn(async () => ({ ok: false as const, error: "Esta pieza ya no está en la reserva." }))
    render(<SacarDeReserva piezaId="p1" sacar={sacar} />)
    fireEvent.click(screen.getByRole("button", { name: "Sacar de la reserva" }))
    await waitFor(() => expect(sacar).toHaveBeenCalledWith("p1"))
    expect(await screen.findByRole("alert")).toHaveTextContent("Esta pieza ya no está en la reserva.")
  })
})
```

  Append to `tests/unit/firma.test.tsx` (and give `montar` a default `firmarParaReserva={vi.fn(async () => ({ ok: true as const }))}`):

```tsx
describe("signing for the reserve", () => {
  test("offers it as a secondary action with one line that explains it", () => {
    montar()
    expect(screen.getByRole("button", { name: "Firmar para la reserva" })).toBeInTheDocument()
    expect(screen.getByText("Sin fecha: la app se la pone cuando a esta cuenta le falte una pieza firmada.")).toBeInTheDocument()
  })

  test("signs the exact version without a date", async () => {
    const firmarParaReserva = vi.fn(async () => ({ ok: true as const }))
    const firmar = montar({ firmarParaReserva })
    fireEvent.click(screen.getByRole("button", { name: "Firmar para la reserva" }))
    await waitFor(() => expect(firmarParaReserva).toHaveBeenCalledWith({ piezaId: PIEZA, huella: HUELLA }))
    expect(firmar).not.toHaveBeenCalled()
  })

  test("shows its error as an alert", async () => {
    montar({ firmarParaReserva: vi.fn(async () => ({ ok: false as const, error: "Esta pieza ya no espera tu firma." })) })
    fireEvent.click(screen.getByRole("button", { name: "Firmar para la reserva" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Esta pieza ya no espera tu firma.")
  })
})
```

- [ ] **Step 2: Fail**, then **implement** (same rules as C1: client components, tokens only, `min-h-11`, Chilean Spanish, no em dashes in strings, dates through `fechaLarga`, `valorLocal`, `instanteDesdeValorLocal`):
  - `plan.tsx` (client) `PlanDePieza({ piezaId, planeadaPara, planear })`: `<h2>Fecha planeada</h2>`, the date with `fechaLarga` or «Sin fecha planeada», the line «Es una propuesta: sale solo si la firmas.» in `text-apagado`, a secondary button «Mover fecha» that reveals a `datetime-local` labelled «Nueva fecha planeada» (prefilled with `valorLocal(planeadaPara)` when there is one) and a primary «Guardar fecha»; an error from `planear` shows as `role="alert"`; when the field is empty the alert reads «Elige la fecha y la hora.».
  - `firma.tsx`: new prop `firmarParaReserva(entrada: { piezaId; huella }) => Promise<Resultado>`. Below «Firmar y programar», a bordered secondary button «Firmar para la reserva» (`type="button"`, same transition and alert) and under it the line «Sin fecha: la app se la pone cuando a esta cuenta le falte una pieza firmada.» in `text-sm text-apagado`.
  - `controles.tsx`: `SacarDeReserva({ piezaId, sacar })`, same shape as `Desprogramar`, button «Sacar de la reserva».
  - `acciones.ts`: `planearAccion`, `firmarParaReservaAccion`, and `sacarDeReservaAccion`, which after `sacarDeReserva` succeeds calls `planearConFechaPropuesta` (a failed plan is logged with `console.error` and the piece simply shows «Sin fecha planeada»; the take-out already happened), all through `despues` (also `revalidatePath(RUTA_DE_CALENDARIO)` once Task 11 adds it).
  - `page.tsx`: `por_aprobar` renders `PlanDePieza` above `FirmaDePieza` (which now receives `firmarParaReserva`); `en_reserva` shows the text, the PDF link, the line «En reserva. La app le pone fecha cuando a {cuenta.nombre} le falte una pieza firmada.» and `SacarDeReserva`; add `en_reserva` to `SE_PUEDE_DESCARTAR`.
- [ ] **Step 3: Pass** — `pnpm test:run && pnpm type && pnpm lint`.
- [ ] **Step 4: Commit** — `git commit -m "feat: move a piece's planned date and sign it for the reserve from its page"`

## Task 10: New pieces arrive planned; Inicio shows plans and the reserve

**Files:** Modify `app/(app)/piezas/nueva/acciones.ts`, `app/(app)/page.tsx`

- [ ] **Step 1:** `crearPiezaAccion`: after `crearPieza` succeeds, `await planearConFechaPropuesta(db, resultado.piezaId)` with the same action client; if it fails, `console.error("No pude planear la pieza nueva", resultado.piezaId, plan.error)` and still return the created piece (its page offers «Mover fecha»). The integration test of Task 8 covers the planning; the E2E of Task 11 covers the screen.
- [ ] **Step 2:** Inicio: a `por_aprobar` card shows «{cuenta} · planeada para el {fechaLarga}» when `planeadaPara` is set (signed cards keep «{cuenta} · {fechaLarga}»); a new section «En reserva» after «Más adelante» with the reserve cards; the empty test counts it. Order stays: Por firmar, Publicar a mano, Revisar, Próximas, Más adelante, En reserva.
- [ ] **Step 3: Verify** — `pnpm test:run && pnpm test:db && pnpm type && pnpm lint`; at 390 px create a piece and see «planeada para el …» under «Por firmar».
- [ ] **Step 4: Commit** — `git commit -m "feat: plan new pieces on creation and show the reserve in Inicio"`

## Task 11: The calendar screen

**Files:** Create `app/(app)/calendario/{page.tsx,semana.tsx,mes.tsx}`, `tests/unit/calendario-semana.test.tsx`, `tests/unit/calendario-mes.test.tsx`. Modify `lib/sesion/rutas.ts`, `tests/unit/rutas.test.ts`, `app/(app)/navegacion.tsx`, `tests/e2e/piezas.spec.ts`.

- [ ] **Step 1: Failing tests**

```ts
// append to tests/unit/rutas.test.ts
import { RUTA_DE_CALENDARIO, rutaDeCalendario } from "@/lib/sesion/rutas" // merge

describe("rutaDeCalendario", () => {
  test("a week or a month of the calendar", () => {
    expect(RUTA_DE_CALENDARIO).toBe("/calendario")
    expect(rutaDeCalendario({ semana: "2026-11-02" })).toBe("/calendario?semana=2026-11-02")
    expect(rutaDeCalendario({ mes: "2026-11" })).toBe("/calendario?vista=mes&mes=2026-11")
  })
})
```

```tsx
// tests/unit/calendario-semana.test.tsx
import { render, screen, within } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { VistaDeSemana } from "@/app/(app)/calendario/semana"

const CUENTAS = [
  { id: "perfil", nombre: "Federico", marcaId: "m1", tipo: "persona" as const, ritmoSemanal: 3, enReserva: 1 },
  { id: "pagina", nombre: "Página de WAV", marcaId: "m2", tipo: "empresa" as const, ritmoSemanal: 1, enReserva: 0 },
]
const PIEZAS = [
  { id: "p1", cuentaId: "perfil", estado: "programada" as const, instante: "2026-10-27T14:00:00.000Z", firmada: true, extracto: "Firmada" },
  { id: "p2", cuentaId: "perfil", estado: "por_aprobar" as const, instante: "2026-10-28T14:00:00.000Z", firmada: false, extracto: "Sin firma" },
  { id: "p3", cuentaId: "pagina", estado: "a_mano" as const, instante: "2026-10-27T18:00:00.000Z", firmada: true, extracto: "A mano" },
]

describe("VistaDeSemana", () => {
  test("one section per account with its reserve and what is missing against the rhythm", () => {
    render(<VistaDeSemana lunes="2026-10-26" cuentas={CUENTAS} piezas={PIEZAS} />)
    const perfil = screen.getByRole("region", { name: "Federico" })
    expect(within(perfil).getByText("Reserva: 1 de 3")).toBeInTheDocument()
    expect(within(perfil).getByText("Faltan 1")).toBeInTheDocument()
    const pagina = screen.getByRole("region", { name: "Página de WAV" })
    expect(within(pagina).queryByText(/^Faltan/)).not.toBeInTheDocument()
  })

  test("planned pieces read as unsigned, signed ones show their state; each links to its piece", () => {
    render(<VistaDeSemana lunes="2026-10-26" cuentas={CUENTAS} piezas={PIEZAS} />)
    const sinFirma = screen.getByRole("link", { name: /Sin firma/ })
    expect(sinFirma).toHaveAttribute("href", "/piezas/p2")
    expect(within(sinFirma).getByText("Planeada, sin firma")).toBeInTheDocument()
    expect(within(sinFirma).getByText("miércoles 28 de octubre, 11:00")).toBeInTheDocument()
    expect(within(screen.getByRole("link", { name: /Firmada/ })).getByText("Programada")).toBeInTheDocument()
  })

  test("the header names the week and links to the neighbouring weeks", () => {
    render(<VistaDeSemana lunes="2026-10-26" cuentas={CUENTAS} piezas={PIEZAS} />)
    expect(screen.getByRole("heading", { name: "Semana del 26 de octubre" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Semana anterior" })).toHaveAttribute("href", "/calendario?semana=2026-10-19")
    expect(screen.getByRole("link", { name: "Semana siguiente" })).toHaveAttribute("href", "/calendario?semana=2026-11-02")
  })
})
```

```tsx
// tests/unit/calendario-mes.test.tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { VistaDelMes } from "@/app/(app)/calendario/mes"

describe("VistaDelMes", () => {
  test("a grid of the month's days with one labelled dot per piece, each day opening its week", () => {
    render(
      <VistaDelMes
        mes="2026-11"
        piezas={[
          { id: "p1", cuentaId: "perfil", estado: "programada", instante: "2026-11-03T14:00:00.000Z", firmada: true, extracto: "A" },
          { id: "p2", cuentaId: "pagina", estado: "por_aprobar", instante: "2026-11-03T18:00:00.000Z", firmada: false, extracto: "B" },
        ]}
      />,
    )
    expect(screen.getByRole("heading", { name: "noviembre de 2026" })).toBeInTheDocument()
    const martes = screen.getByRole("link", { name: /^3 de noviembre/ })
    expect(martes).toHaveAttribute("href", "/calendario?semana=2026-11-03")
    expect(martes).toHaveAccessibleName("3 de noviembre: 1 programada, 1 sin firma")
    expect(screen.getAllByRole("link", { name: /de noviembre/ })).toHaveLength(30)
  })
})
```

- [ ] **Step 2: Fail**, then **implement**:
  - `lib/sesion/rutas.ts`: `RUTA_DE_CALENDARIO = "/calendario"` and `rutaDeCalendario(destino: { semana: string } | { mes: string })`.
  - `semana.tsx` (no hooks, renders on the server): header `<h2>Semana del {d} de {mes}</h2>` (format the Monday with `Intl.DateTimeFormat("es-CL", { timeZone: "UTC", day: "numeric", month: "long" })` on `Date.UTC` of the day), links «Semana anterior» / «Semana siguiente» (`sumarDias(lunes, ∓7)`, `min-h-11`). Then one `<section aria-label={cuenta.nombre}>` per account: name, «Reserva: {enReserva} de {ritmoSemanal}» in `text-apagado` (hidden when the rhythm is 0), a chip «Faltan N» (`border-peligro text-peligro`) when `huecosDeLaSemana` says N > 0, and the account's pieces of the week ordered by `instante`, each a `Link` to `rutaDePieza(id)` with `fechaLarga(instante)`, the extract, and the state: signed pieces `border-borde` with the state word (same words as the piece page; move that `Record<EstadoDePieza, string>` to `lib/piezas/estados.ts` as `NOMBRE_DEL_ESTADO` so both screens share it), planned ones `border-dashed text-apagado` with «Planeada, sin firma». An account without pieces that week shows «Nada esta semana.».
  - `mes.tsx`: `<h2>` with the month and year (`Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric", timeZone: "UTC" })`), a 7-column grid with weekday initials (L M M J V S D, `aria-hidden`), `cuadriculaDelMes` cells; each day a `Link` to `rutaDeCalendario({ semana: dia })` whose accessible name is «{n} de {mes}» plus «: 1 programada, 1 sin firma» when it has pieces (counts per state word, lowercase), showing the day number and one `size-2 rounded-full` dot per piece: `bg-primario` signed and pending to go out, `bg-apagado` published, `bg-peligro` `a_mano` / `envio_dudoso` / `error`, `border border-primario` (hollow) planned without signature. No editing here.
  - `page.tsx` (server): `const vista = leerVista(await searchParams, Date.now())`; range from `vista.semana` or `limitesDelMes(vista.mes)`; `calendario(await createClient(), desde, hasta)`; a two-link toggle «Semana» / «Mes» (`aria-current="page"` on the active one) above the view; the month toggle opens `mesDe(Date.parse(semana.desde))`, the week toggle the current week.
  - `navegacion.tsx`: «Calendario» between «Nueva» and «Marcas». Five items do not fit at `px-6` in 390 px: make each `li` `flex-1` and the link `px-1 text-center`.
  - Revalidate `RUTA_DE_CALENDARIO` in the piece actions (`despues`) and in `crearPiezaAccion`.
- [ ] **Step 3: E2E** (append to `tests/e2e/piezas.spec.ts`, same setup as the C1 test): create a text piece; its page shows «Fecha planeada» with a date; tap «Firmar para la reserva»; Inicio shows it under «En reserva»; «Calendario» in the nav shows «Reserva: 1 de 3» in the account's section; «Mes» shows the month heading.
- [ ] **Step 4: Verify** — `pnpm test:run && pnpm test:db && pnpm type && pnpm lint && pnpm build && pnpm test:e2e`; at 390 px: the nav fits on one line, the week and month views have no horizontal scroll, every target is at least 44 px tall.
- [ ] **Step 5: Commit** — `git commit -m "feat: show each account's week and month with its gaps and reserve"`

# Part 3 — Background tasks

## Task 12: The publisher covers unsigned slots from the reserve

**Files:** Modify `lib/publicacion/publicar.ts`, `lib/publicacion/repositorio.ts`, `tests/unit/publicar.test.ts`, `tests/integration/repositorio-publicacion.test.ts`

- [ ] **Step 1: Failing unit tests.** In `tests/unit/publicar.test.ts` add to the fake (`m`): `vencidasSinFirma: vi.fn(async (): Promise<PendienteSinFirma[]> => [])`, `horariosOcupados: vi.fn(async (): Promise<number[]> => [])`, `cubrirConReserva: vi.fn(async (): Promise<string | null> => null)`, `anotarAviso: vi.fn(async () => {})`, then:

```ts
const PENDIENTE: PendienteSinFirma = {
  id: "pendiente-1",
  marcaId: "marca-1",
  cuentaId: "cuenta-1",
  cuentaNombre: "Federico",
  tipo: "persona",
  planeadaPara: "2026-11-03T14:00:00.000Z",
  extracto: "Hola",
}

describe("cubrirSinFirma (D21)", () => {
  test("uses the reserve, moves the unsigned piece to the next free slot and queues a digest line", async () => {
    const { p, m } = puertos({
      vencidasSinFirma: vi.fn(async () => [PENDIENTE]),
      horariosOcupados: vi.fn(async () => [Date.parse("2026-11-04T14:00:00Z")]),
      cubrirConReserva: vi.fn(async () => "reserva-1"),
    })
    expect(await cubrirSinFirma(p)).toBe(1)
    expect(p.cubrirConReserva).toHaveBeenCalledWith("pendiente-1", "2026-11-05T14:00:00.000Z")
    expect(p.anotarAviso).toHaveBeenCalledWith("marca-1", {
      titulo: "Federico",
      cuerpo:
        "Usé una pieza de la reserva de Federico para el martes 3 de noviembre, 11:00; «Hola» pasó al jueves 5 de noviembre, 11:00.",
      url: "/piezas/reserva-1",
    })
    expect(m.avisar).not.toHaveBeenCalled()
  })

  test("without a reserve the line says the piece was moved", async () => {
    const { p } = puertos({ vencidasSinFirma: vi.fn(async () => [PENDIENTE]) })
    expect(await cubrirSinFirma(p)).toBe(0)
    expect(p.anotarAviso).toHaveBeenCalledWith("marca-1", {
      titulo: "Federico",
      cuerpo: "No firmaste «Hola» a tiempo; la corrí al miércoles 4 de noviembre, 11:00.",
      url: "/piezas/pendiente-1",
    })
  })

  test("one failing piece is logged and the next is still covered", async () => {
    const otra = { ...PENDIENTE, id: "pendiente-2" }
    const cubrir = vi.fn(async (id: string) => {
      if (id === "pendiente-1") throw new Error("23505")
      return null
    })
    const { p } = puertos({ vencidasSinFirma: vi.fn(async () => [PENDIENTE, otra]), cubrirConReserva: cubrir })
    const error = silenciar()
    await cubrirSinFirma(p)
    expect(cubrir).toHaveBeenCalledTimes(2)
    expect(error).toHaveBeenCalled()
  })

  test("publicarPendientes covers first, so the reserve piece goes out in the same run, and a failed cover never blocks publishing", async () => {
    const orden: string[] = []
    const { p } = puertos({
      vencidasSinFirma: vi.fn(async () => {
        orden.push("cubrir")
        throw new Error("sin base")
      }),
      tomarPendientes: vi.fn(async () => {
        orden.push("tomar")
        return []
      }),
    })
    silenciar()
    await publicarPendientes(p)
    expect(orden).toEqual(["cubrir", "tomar"])
  })
})
```

  (`AHORA` in that file is Tuesday 2026-11-03 11:05 Chile, so the next free profile slot after Wednesday is taken is Thursday 11:00.)
- [ ] **Step 2: Fail.**
- [ ] **Step 3: Implement** in `lib/publicacion/publicar.ts`:

```ts
import { fechaLarga } from "@/lib/piezas/fechas"
import { proponerFecha } from "@/lib/piezas/horarios"

export interface PendienteSinFirma {
  id: string
  marcaId: string
  cuentaId: string
  cuentaNombre: string
  tipo: "persona" | "empresa"
  planeadaPara: string
  extracto: string
}

// Added to PuertosDePublicacion:
//   vencidasSinFirma(): Promise<PendienteSinFirma[]>
//   horariosOcupados(cuentaId: string, desde: number): Promise<number[]>
//   cubrirConReserva(pendienteId: string, siguiente: string): Promise<string | null>
//   anotarAviso(marcaId: string, aviso: Aviso): Promise<void>

/**
 * D21 (plano: usarReserva): a planned piece nobody signed in time gives its slot to the reserve and moves to the next
 * free slot. Not urgent: it goes to the digest (D26). Runs before taking due pieces so the reserve piece goes out now.
 */
export async function cubrirSinFirma(p: PuertosDePublicacion): Promise<number> {
  let cubiertas = 0
  for (const pendiente of await p.vencidasSinFirma()) {
    try {
      const ahora = p.ahora()
      const ocupados = await p.horariosOcupados(pendiente.cuentaId, ahora)
      const siguiente = proponerFecha(pendiente.tipo, ocupados, ahora).toISOString()
      const reserva = await p.cubrirConReserva(pendiente.id, siguiente)
      const cuerpo = reserva
        ? `Usé una pieza de la reserva de ${pendiente.cuentaNombre} para el ${fechaLarga(pendiente.planeadaPara)}; «${pendiente.extracto}» pasó al ${fechaLarga(siguiente)}.`
        : `No firmaste «${pendiente.extracto}» a tiempo; la corrí al ${fechaLarga(siguiente)}.`
      if (reserva) cubiertas++
      try {
        await p.anotarAviso(pendiente.marcaId, { titulo: pendiente.cuentaNombre, cuerpo, url: `/piezas/${reserva ?? pendiente.id}` })
      } catch (error) {
        // The move already happened; a lost digest line must not undo or hide it.
        console.error(`No pude anotar el aviso de la pieza ${pendiente.id}: ${describir(error)}`)
      }
    } catch (error) {
      console.error(`No pude correr la pieza sin firma ${pendiente.id}: ${describir(error)}`)
    }
  }
  return cubiertas
}
```

  and at the top of `publicarPendientes`, before the `try` that takes due pieces:

```ts
  try {
    await cubrirSinFirma(p)
  } catch (error) {
    // Covering is a convenience; publishing what is signed must happen anyway.
    console.error(`No pude revisar las piezas sin firma: ${describir(error)}`)
  }
```

  `lib/publicacion/repositorio.ts`: add the four ports to `PuertosDeBase` and implement them: `vencidasSinFirma` = select `id, planeada_para, cuentas!inner(id, nombre, tipo, marca_id), versiones(numero, texto, titulo)` where `estado = 'por_aprobar'` and `planeada_para <= now` (ISO of `Date.now()`), ordered by `planeada_para`, limit 10, the extract cut at 40 characters with an ellipsis; `horariosOcupados` = `horariosOcupados(db, cuentaId, desde)` from `lib/piezas/lectura.ts`; `cubrirConReserva` = `rpc("cubrir_con_reserva", { p_pendiente, p_siguiente })` returning `data` (uuid or null), throwing through `fallo` on error; `anotarAviso` = `anotarAviso(db, marcaId, aviso)` from `lib/avisos/repositorio-de-avisos.ts`. `trigger/publicar.ts` needs no change: it spreads the repository.
- [ ] **Step 4: Integration** (append to `tests/integration/repositorio-publicacion.test.ts`): with a reserve piece and a planned piece moved 2 minutes into the past by the service role, `vencidasSinFirma` lists it with its account `tipo`; `cubrirConReserva` returns the reserve id; then `tomarPendientes` leases the reserve piece with its signature (`firma.huella` equal to the version's), which is what the publisher needs to send it.
- [ ] **Step 5: Pass** — `pnpm test:run && pnpm test:db && pnpm type`.
- [ ] **Step 6: Commit** — `git commit -m "feat: fill an unsigned slot from the reserve before publishing (D21)"`

## Task 13: The digest at 9:00 and 17:00 (D26)

**Files:** Create `lib/avisos/resumen.ts`, `lib/avisos/enviar-resumen.ts`, `trigger/resumen.ts`, `tests/unit/resumen.test.ts`, `tests/integration/resumen.test.ts`. Modify `lib/avisos/a-miembros.ts`.

- [ ] **Step 1: Failing unit test** `tests/unit/resumen.test.ts`

```ts
import { describe, expect, test } from "vitest"
import { armarResumen, type EstadoDelResumen } from "@/lib/avisos/resumen"

const VACIO: EstadoDelResumen = { porFirmar: 0, aMano: 0, revisar: 0, reservas: [], huecos: [], lineas: [] }

describe("armarResumen", () => {
  test("nothing pending, no push", () => {
    expect(armarResumen(VACIO)).toBeNull()
  })

  test("counts first, in words, singular and plural", () => {
    const aviso = armarResumen({ ...VACIO, porFirmar: 3, aMano: 1, revisar: 1 })
    expect(aviso).toEqual({
      titulo: "Pendientes en PostIA",
      cuerpo: "3 piezas esperan tu firma.\n1 para publicar a mano.\n1 envío por revisar.",
      url: "/",
    })
    expect(armarResumen({ ...VACIO, porFirmar: 1 })?.cuerpo).toBe("1 pieza espera tu firma.")
  })

  test("queued lines, the reserve below its target and the gaps of the week follow", () => {
    const aviso = armarResumen({
      ...VACIO,
      lineas: [{ titulo: "Federico", cuerpo: "No firmaste «Hola» a tiempo; la corrí al jueves 5 de noviembre, 11:00.", url: "/piezas/p1" }],
      reservas: [{ cuenta: "Página de WAV", tiene: 1, meta: 3 }],
      huecos: [
        { cuenta: "Federico", faltan: 2, semana: "esta" },
        { cuenta: "Página de WAV", faltan: 1, semana: "proxima" },
      ],
    })
    expect(aviso?.cuerpo.split("\n")).toEqual([
      "No firmaste «Hola» a tiempo; la corrí al jueves 5 de noviembre, 11:00.",
      "Reserva de Página de WAV: 1 de 3.",
      "Faltan 2 en Federico esta semana.",
      "Faltan 1 en Página de WAV la próxima semana.",
    ])
    expect(aviso?.url).toBe("/")
  })

  test("a single queued line opens its own piece", () => {
    const linea = { titulo: "Federico", cuerpo: "No firmaste «Hola» a tiempo.", url: "/piezas/p1" }
    expect(armarResumen({ ...VACIO, lineas: [linea] })).toEqual({ titulo: "Pendientes en PostIA", cuerpo: linea.cuerpo, url: "/piezas/p1" })
  })

  test("long digests keep six lines, say how many more, and fit the push payload", () => {
    const lineas = Array.from({ length: 20 }, (_, i) => ({ titulo: "X", cuerpo: `${"á".repeat(290)} ${i}`, url: "/" }))
    const aviso = armarResumen({ ...VACIO, porFirmar: 2, lineas })
    const filas = aviso?.cuerpo.split("\n") ?? []
    expect(filas).toHaveLength(7)
    expect(filas.at(-1)).toBe("Y 15 avisos más en Inicio.")
    expect(Buffer.byteLength(JSON.stringify(aviso))).toBeLessThan(3000)
  })
})
```

- [ ] **Step 2: Fail**, then **implement** `lib/avisos/resumen.ts`

```ts
import type { MensajePush } from "./tipos"

export interface EstadoDelResumen {
  porFirmar: number
  aMano: number
  revisar: number
  reservas: { cuenta: string; tiene: number; meta: number }[]
  huecos: { cuenta: string; faltan: number; semana: "esta" | "proxima" }[]
  lineas: MensajePush[]
}

const TITULO = "Pendientes en PostIA"
// An iPhone shows about four lines of a notice; six plus «Y N más» keeps the rest one tap away in Inicio.
const MAXIMO_DE_LINEAS = 6
// Six lines of 160 characters stay far below the 3000-byte payload limit of lib/avisos/push.ts, even with accents.
const LARGO_DE_LINEA = 160

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`
}

function recortar(linea: string): string {
  const letras = [...linea]
  return letras.length > LARGO_DE_LINEA ? `${letras.slice(0, LARGO_DE_LINEA - 1).join("")}…` : linea
}

/** D26: everything pending in one push, or null when there is nothing to say. */
export function armarResumen(e: EstadoDelResumen): MensajePush | null {
  const filas = [
    ...(e.porFirmar > 0 ? [`${plural(e.porFirmar, "pieza espera", "piezas esperan")} tu firma.`] : []),
    ...(e.aMano > 0 ? [`${e.aMano} para publicar a mano.`] : []),
    ...(e.revisar > 0 ? [`${plural(e.revisar, "envío", "envíos")} por revisar.`] : []),
    ...e.lineas.map((l) => l.cuerpo),
    ...e.reservas.map((r) => `Reserva de ${r.cuenta}: ${r.tiene} de ${r.meta}.`),
    ...e.huecos.map((h) => `Faltan ${h.faltan} en ${h.cuenta} ${h.semana === "esta" ? "esta semana" : "la próxima semana"}.`),
  ].map(recortar)
  if (filas.length === 0) return null
  const visibles = filas.length > MAXIMO_DE_LINEAS ? filas.slice(0, MAXIMO_DE_LINEAS) : filas
  const resto = filas.length - visibles.length
  const cuerpo = [...visibles, ...(resto > 0 ? [`Y ${resto} avisos más en Inicio.`] : [])].join("\n")
  const unicaLinea = filas.length === 1 && e.lineas.length === 1 ? e.lineas[0] : null
  return { titulo: TITULO, cuerpo, url: unicaLinea?.url ?? "/" }
}
```

- [ ] **Step 3: `avisarPersona`.** Refactor `lib/avisos/a-miembros.ts` so the device loop is one private function `avisarAparatos(db, servicio, userIds, aviso, urgente)`; `avisarMiembros` reads the brand's members and calls it (its tests stay green); export `avisarPersona(db, servicio, userId, aviso, urgente)` that calls it with `[userId]`.
- [ ] **Step 4: Failing integration test** `tests/integration/resumen.test.ts`, with a fake `ServicioPush` that records `{ endpoint, mensaje, urgente }`:
  1. A person who owns two brands, each with one account (`ritmo_semanal` 3) and one `por_aprobar` piece, and one subscription, gets **one** push (not urgent) whose body starts with «2 piezas esperan tu firma.» and includes a queued line of either brand; afterwards those lines have `enviado_en` set.
  2. A second run with nothing new still sends the counts (the pieces still wait), but no queued line twice.
  3. A person whose brands have nothing pending and accounts with `ritmo_semanal` 0 gets nothing.
  (Each test creates its own brands; assert only on pushes to its own subscription endpoint, since the local database holds other data.)
- [ ] **Step 5: Implement** `lib/avisos/enviar-resumen.ts`

```ts
import { huecosDeLaSemana, semanaDe, semanaDelLunes, sumarDias } from "@/lib/piezas/calendario"
import { proponerFecha } from "@/lib/piezas/horarios"
import { calendario } from "@/lib/piezas/lectura"
import type { Db } from "@/lib/supabase/database"
import { avisarPersona } from "./a-miembros"
import type { ServicioPush } from "./push"
import { avisosSinEnviar, type LineaPendiente, marcarEnviados } from "./repositorio-de-avisos"
import { armarResumen, type EstadoDelResumen } from "./resumen"

type PorMarca = Omit<EstadoDelResumen, "lineas">

function vacio(): PorMarca {
  return { porFirmar: 0, aMano: 0, revisar: 0, reservas: [], huecos: [] }
}

async function estadoPorMarca(db: Db, ahora: number): Promise<Map<string, PorMarca>> {
  const porMarca = new Map<string, PorMarca>()
  const de = (marcaId: string) => {
    const actual = porMarca.get(marcaId) ?? vacio()
    porMarca.set(marcaId, actual)
    return actual
  }
  const { data: pendientes, error } = await db
    .from("piezas")
    .select("estado, cuentas!inner(marca_id)")
    .in("estado", ["por_aprobar", "a_mano", "envio_dudoso", "error"])
  if (error) throw new Error(`No pude contar las piezas pendientes: ${error.message}`, { cause: error })
  for (const p of pendientes) {
    const e = de(p.cuentas.marca_id)
    if (p.estado === "por_aprobar") e.porFirmar++
    else if (p.estado === "a_mano") e.aMano++
    else e.revisar++
  }

  const esta = semanaDe(ahora)
  const proxima = semanaDelLunes(sumarDias(esta.lunes, 7))
  const { cuentas, piezas } = await calendario(db, esta.desde, proxima.hasta)
  for (const c of cuentas.filter((c) => c.ritmoSemanal > 0)) {
    const e = de(c.marcaId)
    if (c.enReserva < c.ritmoSemanal) e.reservas.push({ cuenta: c.nombre, tiene: c.enReserva, meta: c.ritmoSemanal })
    // This week only counts while it still has a D19 slot ahead: on Thursday evening its gap cannot be filled.
    const semanas = [
      ...(proponerFecha(c.tipo, [], ahora).getTime() < Date.parse(esta.hasta) ? [["esta", esta] as const] : []),
      ["proxima", proxima] as const,
    ]
    for (const [nombre, semana] of semanas) {
      // Instants are compared as numbers: PostgREST returns «+00:00», not the «.000Z» of toISOString.
      const enLaSemana = piezas.filter((p) => {
        const instante = Date.parse(p.instante)
        return p.cuentaId === c.id && instante >= Date.parse(semana.desde) && instante < Date.parse(semana.hasta)
      })
      const faltan = huecosDeLaSemana([c], enLaSemana)[c.id] ?? 0
      if (faltan > 0) e.huecos.push({ cuenta: c.nombre, faltan, semana: nombre })
    }
  }
  return porMarca
}

/** D26: one push per person with every brand they belong to, then the queued lines are marked sent. */
export async function enviarResumenes(db: Db, servicio: ServicioPush, ahora: number): Promise<{ avisos: number; lineas: number }> {
  const { data: miembros, error } = await db.from("miembros").select("user_id, marca_id")
  if (error) throw new Error(`No pude leer los miembros: ${error.message}`, { cause: error })
  const porMarca = await estadoPorMarca(db, ahora)
  const lineas = await avisosSinEnviar(db)
  const marcasDe = new Map<string, string[]>()
  for (const m of miembros) marcasDe.set(m.user_id, [...(marcasDe.get(m.user_id) ?? []), m.marca_id])

  let avisos = 0
  for (const [userId, marcas] of marcasDe) {
    const estado: EstadoDelResumen = { ...vacio(), lineas: [] }
    for (const marcaId of marcas) {
      const e = porMarca.get(marcaId)
      if (e) {
        estado.porFirmar += e.porFirmar
        estado.aMano += e.aMano
        estado.revisar += e.revisar
        estado.reservas.push(...e.reservas)
        estado.huecos.push(...e.huecos)
      }
      estado.lineas.push(...lineas.filter((l: LineaPendiente) => l.marcaId === marcaId))
    }
    const aviso = armarResumen(estado)
    if (!aviso) continue
    await avisarPersona(db, servicio, userId, aviso, false)
    avisos++
  }
  // Marked sent even for a brand nobody receives on a device: otherwise its lines would pile up forever.
  await marcarEnviados(db, lineas.map((l) => l.id), ahora)
  return { avisos, lineas: lineas.length }
}
```

  `trigger/resumen.ts`:

```ts
import { schedules } from "@trigger.dev/sdk"
import { enviarResumenes } from "@/lib/avisos/enviar-resumen"
import { servicioPushReal } from "@/lib/avisos/push"
import { createAdminClient } from "@/lib/supabase/admin"

// D26, decided by Federico: 9:00 and 17:00 Chile time. One run at a time and no retries: a retry would push twice.
export const resumen = schedules.task({
  id: "resumen-de-firmas",
  cron: { pattern: "0 9,17 * * *", timezone: "America/Santiago" },
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async () => enviarResumenes(createAdminClient(), servicioPushReal(), Date.now()),
})
```

- [ ] **Step 6: Pass** — `pnpm test:run && pnpm test:db && pnpm type && pnpm lint`; `pnpm exec trigger dev` lists `resumen-de-firmas` with its schedule; trigger it once by hand from the dashboard against local Supabase and see the Chrome notice.
- [ ] **Step 7: Commit** — `git commit -m "feat: send one digest per person at 9:00 and 17:00 (D26)"`

## Task 14: Connection watch

**Files:** Create `lib/avisos/conexiones.ts`, `trigger/conexiones.ts`, `tests/unit/conexiones.test.ts`, `tests/integration/vigilar-conexiones.test.ts`

- [ ] **Step 1: Failing unit test**

```ts
import { describe, expect, test } from "vitest"
import { revisarConexion } from "@/lib/avisos/conexiones"

const AHORA = Date.parse("2026-11-03T11:00:00Z") // 8:00 in Chile, when the watch runs
const DIA = 86_400_000
const en = (ms: number) => new Date(AHORA + ms).toISOString()
const base = { cuentas: ["Federico"], ultimaProgramada: null }

describe("revisarConexion", () => {
  test("an expired connection is urgent", () => {
    expect(revisarConexion({ ...base, expiraEn: en(-1000) }, AHORA)).toEqual({
      urgente: {
        titulo: "Conexión de LinkedIn · Federico",
        cuerpo: "La conexión de LinkedIn de Federico venció. Reconéctala en Marcas.",
        url: "/marcas",
      },
      lineas: [],
    })
  })

  test("less than a day left is urgent", () => {
    expect(revisarConexion({ ...base, expiraEn: en(10 * 3_600_000) }, AHORA).urgente?.cuerpo).toBe(
      "La conexión de LinkedIn de Federico vence en menos de un día. Reconéctala en Marcas.",
    )
  })

  test("14 and 3 days left queue a digest line; other days say nothing", () => {
    expect(revisarConexion({ ...base, expiraEn: en(14 * DIA) }, AHORA)).toEqual({
      urgente: null,
      lineas: [
        {
          titulo: "Conexión de LinkedIn · Federico",
          cuerpo: "La conexión de LinkedIn de Federico vence en 14 días. Reconéctala en Marcas.",
          url: "/marcas",
        },
      ],
    })
    expect(revisarConexion({ ...base, expiraEn: en(3 * DIA) }, AHORA).lineas).toHaveLength(1)
    expect(revisarConexion({ ...base, expiraEn: en(10 * DIA) }, AHORA)).toEqual({ urgente: null, lineas: [] })
  })

  test("a signed piece after the expiry is a line within the last 14 days, not before", () => {
    const expiraEn = en(10 * DIA)
    expect(revisarConexion({ ...base, expiraEn, ultimaProgramada: en(12 * DIA) }, AHORA).lineas[0]?.cuerpo).toBe(
      "Hay piezas de Federico programadas después del viernes 13 de noviembre, 08:00, cuando vence su conexión. Reconéctala en Marcas.",
    )
    expect(revisarConexion({ ...base, expiraEn: en(40 * DIA), ultimaProgramada: en(45 * DIA) }, AHORA).lineas).toEqual([])
  })

  test("names every account the connection serves", () => {
    const r = revisarConexion({ cuentas: ["Federico", "Otra"], ultimaProgramada: null, expiraEn: en(-1) }, AHORA)
    expect(r.urgente?.titulo).toBe("Conexión de LinkedIn · Federico y Otra")
  })
})
```

- [ ] **Step 2: Fail**, then **implement** `lib/avisos/conexiones.ts`

```ts
import { estadoDeConexion } from "@/lib/marcas/estado-conexion"
import { fechaLarga } from "@/lib/piezas/fechas"
import { RUTA_DE_MARCAS } from "@/lib/sesion/rutas"
import type { Db } from "@/lib/supabase/database"
import { avisarMiembros } from "./a-miembros"
import type { ServicioPush } from "./push"
import { anotarAviso } from "./repositorio-de-avisos"
import type { MensajePush } from "./tipos"

// Days before expiry that earn a digest line (the token lives 60 days and has no refresh).
const MARCAS_DE_AVISO = new Set([14, 3])
const DIAS_DE_VIGILANCIA = 14

export interface DatosDeConexion {
  expiraEn: string
  cuentas: readonly string[]
  ultimaProgramada: string | null
}

/** Plano «Vigilar conexiones»: what to say today about one connection. Urgent goes now; lines wait for the digest. */
export function revisarConexion(d: DatosDeConexion, ahora: number): { urgente: MensajePush | null; lineas: MensajePush[] } {
  const quien = d.cuentas.join(" y ")
  const aviso = (cuerpo: string): MensajePush => ({ titulo: `Conexión de LinkedIn · ${quien}`, cuerpo, url: RUTA_DE_MARCAS })
  const estado = estadoDeConexion(d.expiraEn, ahora)
  if (estado.estado === "sin_conexion") return { urgente: null, lineas: [] }
  if (estado.estado === "vencida") {
    return { urgente: aviso(`La conexión de LinkedIn de ${quien} venció. Reconéctala en Marcas.`), lineas: [] }
  }
  if (estado.dias <= 1) {
    return { urgente: aviso(`La conexión de LinkedIn de ${quien} vence en menos de un día. Reconéctala en Marcas.`), lineas: [] }
  }
  const lineas: MensajePush[] = []
  if (MARCAS_DE_AVISO.has(estado.dias)) {
    lineas.push(aviso(`La conexión de LinkedIn de ${quien} vence en ${estado.dias} días. Reconéctala en Marcas.`))
  }
  // Only inside the last two weeks: earlier, a piece planned far ahead would repeat this line every day for weeks.
  if (estado.dias <= DIAS_DE_VIGILANCIA && d.ultimaProgramada && Date.parse(d.ultimaProgramada) >= Date.parse(d.expiraEn)) {
    lineas.push(
      aviso(
        `Hay piezas de ${quien} programadas después del ${fechaLarga(d.expiraEn)}, cuando vence su conexión. Reconéctala en Marcas.`,
      ),
    )
  }
  return { urgente: null, lineas }
}

/** One pass over every LinkedIn connection that serves an API account. A failing connection does not stop the others. */
export async function vigilarConexiones(db: Db, servicio: ServicioPush, ahora: number): Promise<{ urgentes: number; lineas: number }> {
  const { data: conexiones, error } = await db.from("conexiones").select("id, expira_en, cuentas(id, nombre, marca_id, ruta)")
  if (error) throw new Error(`No pude leer las conexiones: ${error.message}`, { cause: error })
  const total = { urgentes: 0, lineas: 0 }
  for (const conexion of conexiones) {
    const cuentas = conexion.cuentas.filter((c) => c.ruta === "api")
    if (cuentas.length === 0) continue
    try {
      const { data: ultima, error: errorDeUltima } = await db
        .from("piezas")
        .select("programada_para")
        .in("cuenta_id", cuentas.map((c) => c.id))
        .eq("estado", "programada")
        .order("programada_para", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (errorDeUltima) throw new Error(errorDeUltima.message, { cause: errorDeUltima })
      const revision = revisarConexion(
        { expiraEn: conexion.expira_en, cuentas: cuentas.map((c) => c.nombre), ultimaProgramada: ultima?.programada_para ?? null },
        ahora,
      )
      for (const marcaId of new Set(cuentas.map((c) => c.marca_id))) {
        if (revision.urgente) {
          await avisarMiembros(db, servicio, marcaId, revision.urgente, true)
          total.urgentes++
        }
        for (const linea of revision.lineas) {
          await anotarAviso(db, marcaId, linea)
          total.lineas++
        }
      }
    } catch (errorDeConexion) {
      const causa = errorDeConexion instanceof Error ? errorDeConexion.message : String(errorDeConexion)
      console.error(`No pude revisar la conexión ${conexion.id}: ${causa}`)
    }
  }
  return total
}
```

  `trigger/conexiones.ts`: `schedules.task({ id: "vigilar-conexiones", cron: { pattern: "0 8 * * *", timezone: "America/Santiago" }, queue: { concurrencyLimit: 1 }, retry: { maxAttempts: 1 }, run: async () => vigilarConexiones(createAdminClient(), servicioPushReal(), Date.now()) })`, with the comment «8:00, before the 9:00 digest that carries its lines; no retries: a retry would push twice.»
- [ ] **Step 3: Integration test** `tests/integration/vigilar-conexiones.test.ts` (fake `ServicioPush`; connections inserted with the service role into `conexiones` with `conectada_por` = the test owner, and linked with `update cuentas set conexion_id`): an expired connection of an `api` account pushes urgently to the owner's subscription; one at 14 days queues one `avisos_pendientes` line for the brand and pushes nothing; a connection whose only account is `a_mano` is skipped (the check `conexion_solo_api` forbids linking it, so create the account `api`, link it, then insert a second `a_mano` account without connection and assert it plays no part).
- [ ] **Step 4: Pass** — `pnpm test:run && pnpm test:db && pnpm type`.
- [ ] **Step 5: Commit** — `git commit -m "feat: watch LinkedIn connections every morning"`

## Task 15: Nightly maintenance

**Files:** Create `lib/mantenimiento/limpieza.ts`, `trigger/limpieza.ts`, `tests/unit/limpieza.test.ts`, `tests/integration/limpieza-nocturna.test.ts`

- [ ] **Step 1: Failing unit test**

```ts
import { describe, expect, test } from "vitest"
import { archivosParaBorrar } from "@/lib/mantenimiento/limpieza"

const AHORA = Date.parse("2026-11-03T06:00:00Z")
const HACE_HORAS = (h: number) => new Date(AHORA - h * 3_600_000).toISOString()

describe("archivosParaBorrar", () => {
  test("only files older than a day that no version references", () => {
    const objetos = [
      { ruta: "m/viejo-huerfano.pdf", creadoEn: HACE_HORAS(30) },
      { ruta: "m/viejo-usado.pdf", creadoEn: HACE_HORAS(30) },
      { ruta: "m/nuevo-huerfano.pdf", creadoEn: HACE_HORAS(2) },
      { ruta: "m/sin-fecha.pdf", creadoEn: null },
    ]
    expect(archivosParaBorrar(objetos, new Set(["m/viejo-usado.pdf"]), AHORA)).toEqual(["m/viejo-huerfano.pdf"])
  })
})
```

- [ ] **Step 2: Fail**, then **implement** `lib/mantenimiento/limpieza.ts`

```ts
import type { Db } from "@/lib/supabase/database"

// A browser uploads the PDF before the piece exists (lib/piezas/acciones.ts): a fresh orphan may be a piece being created.
const EDAD_MINIMA_MS = 24 * 3_600_000
const PAGINA_DE_STORAGE = 100
const PAGINA_DE_VERSIONES = 1000

interface Objeto {
  ruta: string
  creadoEn: string | null
}

/** Plano «Mantenimiento»: files nobody references after a day. A file without a date is kept: its age is unknown. */
export function archivosParaBorrar(objetos: readonly Objeto[], referenciadas: ReadonlySet<string>, ahora: number): string[] {
  return objetos
    .filter((o) => o.creadoEn !== null && Date.parse(o.creadoEn) < ahora - EDAD_MINIMA_MS && !referenciadas.has(o.ruta))
    .map((o) => o.ruta)
}

type Bucket = ReturnType<Db["storage"]["from"]>

async function listarTodo(bucket: Bucket, carpeta: string) {
  const todo: { name: string; id: string | null; created_at: string | null }[] = []
  for (let desde = 0; ; desde += PAGINA_DE_STORAGE) {
    const { data, error } = await bucket.list(carpeta, { limit: PAGINA_DE_STORAGE, offset: desde, sortBy: { column: "name", order: "asc" } })
    if (error) throw new Error(`No pude listar ${carpeta || "el bucket"}: ${error.message}`, { cause: error })
    todo.push(...data)
    if (data.length < PAGINA_DE_STORAGE) return todo
  }
}

async function rutasReferenciadas(db: Db, carpeta: string): Promise<Set<string>> {
  const rutas = new Set<string>()
  for (let desde = 0; ; desde += PAGINA_DE_VERSIONES) {
    const { data, error } = await db
      .from("versiones")
      .select("archivo_ruta")
      .like("archivo_ruta", `${carpeta}/%`)
      .order("archivo_ruta")
      .range(desde, desde + PAGINA_DE_VERSIONES - 1)
    if (error) throw new Error(`No pude leer las rutas de ${carpeta}: ${error.message}`, { cause: error })
    for (const v of data) if (v.archivo_ruta) rutas.add(v.archivo_ruta)
    if (data.length < PAGINA_DE_VERSIONES) return rutas
  }
}

/** Removes orphan files of the «piezas» bucket, one brand folder at a time. Returns how many it removed. */
export async function limpiarArchivos(db: Db, opciones: { ahora: number; carpetas?: readonly string[] }): Promise<number> {
  const bucket = db.storage.from("piezas")
  // Storage lists a folder as an entry without id.
  const carpetas = opciones.carpetas ?? (await listarTodo(bucket, "")).filter((o) => o.id === null).map((o) => o.name)
  let borrados = 0
  for (const carpeta of carpetas) {
    // Everything is listed before removing: removing while paging would shift the offsets.
    const objetos = (await listarTodo(bucket, carpeta))
      .filter((o) => o.id !== null)
      .map((o) => ({ ruta: `${carpeta}/${o.name}`, creadoEn: o.created_at }))
    const sobran = archivosParaBorrar(objetos, await rutasReferenciadas(db, carpeta), opciones.ahora)
    for (let i = 0; i < sobran.length; i += PAGINA_DE_STORAGE) {
      const { error } = await bucket.remove(sobran.slice(i, i + PAGINA_DE_STORAGE))
      if (error) throw new Error(`No pude borrar archivos de ${carpeta}: ${error.message}`, { cause: error })
    }
    borrados += sobran.length
  }
  return borrados
}
```

  Check against local Storage in Step 3 that a folder entry really comes back with `id === null` and files with `created_at`; if the client types `id` as `string`, keep the runtime check and type the list entries as above.

  `trigger/limpieza.ts`:

```ts
import { schedules } from "@trigger.dev/sdk"
import { borrarAvisosEnviados } from "@/lib/avisos/repositorio-de-avisos"
import { limpiarArchivos } from "@/lib/mantenimiento/limpieza"
import { createAdminClient } from "@/lib/supabase/admin"

// Plano «Mantenimiento», nightly part: orphan files and digest lines sent over a month ago. 3:00, when nothing is published.
export const limpieza = schedules.task({
  id: "limpieza-nocturna",
  cron: { pattern: "0 3 * * *", timezone: "America/Santiago" },
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async () => {
    const db = createAdminClient()
    const ahora = Date.now()
    const archivos = await limpiarArchivos(db, { ahora })
    await borrarAvisosEnviados(db, ahora)
    return { archivos }
  },
})
```

- [ ] **Step 3: Integration test** `tests/integration/limpieza-nocturna.test.ts`: an owner with a brand uploads two PDFs to `<marca>/<uuid>.pdf` (service role), and one becomes a carousel piece through `crear_pieza` (`p_formato: "carrusel_pdf"`, title, path, its sha-256); `limpiarArchivos(admin(), { ahora: Date.now(), carpetas: [marca] })` removes nothing (both fresh); with `ahora: Date.now() + 25 * 3_600_000` it removes exactly the orphan and the referenced file is still downloadable. Passing `carpetas` keeps the test from touching other folders of the shared local database.
- [ ] **Step 4: Pass** — `pnpm test:run && pnpm test:db && pnpm type`.
- [ ] **Step 5: Commit** — `git commit -m "feat: clear orphan files and old notices every night"`

## Task 16: WR3 import with planned dates

**Files:** Modify `scripts/cargar-wr3.ts`

- [ ] **Step 1:** `buscarCuenta` also reads `tipo`. Before the loop, `const ocupados = await horariosOcupados(db, cuenta.id, Date.now())`. For each **new** piece: `const plan = proponerFecha(cuenta.tipo, ocupados, Date.now())`, `ocupados.push(plan.getTime())`, and insert the piece with `planeada_para: plan.toISOString()`. For a piece that **was already there** (same file hash) and is still `por_aprobar` without `planeada_para`, plan it the same way (update `planeada_para` with the service role; the guard only watches state changes). The output line adds the date: `nueva     martes 3 de noviembre, 15:00  <título>` / `ya estaba …`. The slot logic itself is `proponerFecha`/`repartirFechas`, already unit-tested; the script stays a thin shell.
- [ ] **Step 2: Run locally** — `pnpm db:reset`, invite Federico locally, create «Página de WAV» (`empresa`, `a_mano`), `pnpm cargar:wr3`: 9 pieces, Tuesday to Thursday at 15:00 from the next free day, three per week; a second run prints «ya estaba» for all and changes nothing.
- [ ] **Step 3: Commit** — `git commit -m "feat: plan the imported WR3 carousels on the page's slots"`

# Part 4 — Verify and production

## Task 17: Verify locally end to end

- [ ] **Step 1:** `pnpm test:run && pnpm test:db && pnpm type && pnpm lint && pnpm build && pnpm test:e2e`.
- [ ] **Step 2:** `pnpm preview` + `E2E_BASE_URL=http://localhost:8787 pnpm test:e2e`; `wrangler deploy --dry-run` still under 3 MiB gzip (the calendar imports nothing heavy; the background code lives only in `trigger/` and `lib/avisos`, `lib/mantenimiento`, which no page imports; check that with the build's bundle report).
- [ ] **Step 3: The reserve for real, locally.** With `pnpm exec trigger dev` against local Supabase, on the «Página de WAV» hand account: sign one piece for the reserve; plan another piece and move its slot 2 minutes into the past with SQL; at the next 5-minute run the reserve piece becomes `programada` and right after `a_mano` (urgent push «Publica a mano · Página de WAV»), the unsigned piece moves to the next Tuesday-Thursday 15:00, and `avisos_pendientes` holds the line «Usé una pieza de la reserva…». Trigger `resumen-de-firmas` by hand: one push with the counts and that line.
- [ ] **Step 4:** At 390 px: Inicio, a piece's page (plan, reserve), `/calendario` week and month, the nav; dark mode included.

## Task 18: GATE · production

- [ ] **Step 1: Ask Federico**, then `supabase db push` (one migration: `20261030120000_calendario_y_reserva.sql`) and commit `pnpm db:types` if it changed. Before pushing, run in the SQL editor `select conname from pg_constraint where conrelid = 'public.piezas'::regclass` to confirm the name `piezas_estado_check`.
- [ ] **Step 2:** Merge to `main`: CI deploys the Worker and the Trigger.dev tasks (`publicar-pendientes`, `resumen-de-firmas`, `vigilar-conexiones`, `limpieza-nocturna`). In the Trigger.dev dashboard the three new schedules appear with their crons in America/Santiago and the plan's schedule limit is not exceeded.
- [ ] **Step 3: Ask Federico**, then `pnpm cargar:wr3:prod`: the WR3 pieces without a date get Tuesday-to-Thursday 15:00 slots; Inicio shows «planeada para el …» on each.
- [ ] **Step 4:** The first 9:00 or 17:00 digest arrives on the iPhone as one push. Federico signs at least one piece for the reserve of each account. `select estado, count(*) from piezas group by estado` matches what Inicio and the calendar show.

---

## Self-review

**Coverage of the design.** Planned date and `planear_pieza` → Tasks 2, 7, 8, 9, 10. Plan equals the signed date after signing → Task 2 (trigger, tested through `firmar_pieza`). Reserve state, signatures without date, guard, new version and take-out → Tasks 1, 3, 8, 9. `cubrir_con_reserva` and the reserve end to end through `reservar_envio` → Task 4; in the publisher → Task 12. Grouped notices at 9:00 and 17:00 → Tasks 5, 13. Connection watch → Task 14. Calendar week and month, gaps, reserve per account → Tasks 6, 7, 11. Maintenance → Task 15. WR3 planned dates → Task 16. Out of scope listed in the Design.

**Consistency checks.** The SQL transition table and `TRANSICIONES` are compared by the existing test (red between Tasks 1 and 3 by design). Every new SQL error name has a Spanish message in `lib/piezas/acciones.ts` (`solo_el_dueno_planea`, `pieza_no_esta_por_aprobar`, `fecha_en_el_pasado`, `firma_de_otra_version`, `solo_el_dueno_saca_de_la_reserva`, `pieza_no_esta_en_reserva`, `pieza_no_espera_reserva`; `reservar_sin_firma_vigente` through the guard list; 23505 through the slot message). Every new function is `security definer set search_path = ''` when it needs rights, with explicit revoke from `public, anon` (and `authenticated` for `cubrir_con_reserva` and the trigger function); `avisos_pendientes` has RLS on, no policies, and its grants revoked from `anon, authenticated`. Every RPC has refusal tests: stranger, wrong state, past date, taken slot, a person calling a service RPC. Placeholder scan: none; the UI tasks give exact strings and tests.

**Adversarial pass.**
- *Publishing late through the reserve.* `cubrir_con_reserva` only uses a reserve piece while the slot is inside that piece's window; past it the pending piece just moves. The reserve piece still goes through `revisarAntesDeEnviar` and `reservar_envio`.
- *Two pieces in one slot.* Signed and planned slots share one unique index because a trigger keeps `planeada_para = programada_para` in the signed states; the existing C1 index stays. `cubrir_con_reserva` moves the pending piece before the reserve piece enters the slot.
- *Races.* The pending piece is locked `for update`, the reserve piece `for update skip locked`; a person signing at the same moment waits on the lock and then finds the state changed. A taken next slot rolls the whole swap back (tested).
- *Notices lost or doubled.* The digest and watch tasks have no retries; lines are marked sent after the pushes; a failed line write never undoes a move.
- *Precondition assumed.* The state check's name (`piezas_estado_check`) is verified locally and in production before the `drop constraint`.

**Known risks, checked early:**
- The guard's new date check for `programada` (Task 3) could refuse a C1 path that sets a date different from its signature's; the full `pnpm test:db` run in Task 3 shows it.
- Storage's folder entries without `id` (Task 15), checked against local Storage before trusting the filter.
- Time-zone expectations around the April 2027 change (Task 6), checked against `Intl` before changing code.
- Trigger.dev's schedule limit on the current plan (Task 18).
- The nav with five items at 390 px (Task 11).
