# Phase 1 · Plan C1: publish hand-made pieces, signed once, on time

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Federico creates (or imports) a finished piece — a text post or a PDF carousel — for one account, signs it once with its date and time from the iPhone (D15, D25), and at that time the app publishes it by API on his profile, or notices him to publish it by hand on WAV's page. Exactly the signed version goes out, never twice, never late without someone knowing. The 9 WR3 carousels are the first load.

**Architecture:** A piece belongs to one account and moves through a pure state machine mirrored by a database guard. Every text or file change creates an immutable version whose fingerprint (huella) is computed **in the database**; a signature binds one huella and one date, and any new version drops it. PDFs live in a private Supabase Storage bucket scoped by brand (decided 2026-10-28, instead of the plano's R2, until template rendering needs R2). A Trigger.dev scheduled task (every 5 min, America/Santiago) leases due pieces, re-checks the signature, the late window, the connection and the file's hash, writes the send before the irreversible `POST /rest/posts`, and parks anything doubtful for a person. Urgent notices go out by web push at once; the two daily windows (D26), the calendar screen, the reserve week (D21) and connection watching are plan C2.

**Tech Stack:** Next.js 16 on Workers (plan B), Supabase (Postgres, RLS, Storage, `pgcrypto`), Trigger.dev v4 (`@trigger.dev/sdk`, `schedules.task`), existing `lib/linkedin/api.ts`, `lib/avisos/push.ts`.

**Source of truth:** plano «Estados de una pieza», «Reglas protegidas» (Puerta 2, Sale lo que se aprobó, Ventana de atraso, Solo publica), flows «Post de texto en LinkedIn», «Carrusel PDF de LinkedIn», «Publicar a mano»; decisions D15, D19, D25. `CLAUDE.md` hard rules.

---

## Design (what this plan builds, and what it leaves for C2)

**States used in C1** (subset of the plano's machine; the AI states `en_espera`, `escribiendo`, `texto_por_aprobar`, `disenando` arrive with the content engine, `entregada_a_metricool` is out of phase 1):

| From | To |
|---|---|
| `por_aprobar` | `programada` (sign), `descartada` |
| `programada` | `por_aprobar` (unschedule, or a failed pre-send check), `publicando`, `a_mano`, `descartada` |
| `publicando` | `publicada`, `envio_dudoso`, `a_mano` (the network said a clear no) , `error` |
| `error` | `programada`, `por_aprobar`, `descartada` |
| `envio_dudoso` | `publicada`, `a_mano`, `descartada` |
| `a_mano` | `publicada`, `por_aprobar`, `descartada` |

**One signature (D15, D25):** pieces made by hand do not spend, so the final piece is shown and text, piece and date are signed once (`por_aprobar` → `programada`).

**Proposed date (D19):** Tuesday, Wednesday, Thursday; the profile at 11:00, the page at 15:00, Chile time; the first free slot of that account at least 30 minutes ahead. Federico can change it before signing. Two pieces of one account never share a slot (database index).

**Huella:** `sha256(formato · título · sha256 del archivo · texto)` computed by a database trigger when a version is inserted, so no client can forge it. The publisher downloads the file again and compares its hash before sending.

**Send once:** a row in `publicaciones` (unique per piece) is written right before `POST /rest/posts`. A second attempt finds it and the piece goes to `envio_dudoso`. Anything that fails after the write and is not a clear 4xx is doubtful too. A piece that stays `publicando` 15 minutes without a post URN becomes doubtful.

**Not in C1 (plan C2):** Calendar screen, reserve week (D21), grouped notices in two windows (D26), daily connection watch (14/3/0 days), editing a version after creation from the UI beyond replacing it, Metricool.

## Gates: stop and ask Federico

1. **Trigger.dev project** (Task 9): create `postia` in his Trigger.dev organization (free plan to start). Federico confirms the organization and the plan.
2. **Secrets for Trigger.dev** (Task 9): `SUPABASE_SERVICE_ROLE_KEY` and the VAPID pair go into the Trigger.dev production environment without passing through the chat.
3. **VAPID rotation** (Task 9): the Worker's VAPID private key was uploaded without being stored anywhere, and Trigger.dev needs the same pair to push to the subscriptions the Worker created. The pair is regenerated once and sent to both places in one pipeline; Federico re-activates notices on the iPhone.
4. **Production migration** (Task 12): `supabase db push` before the merge that needs it.
5. **First real automatic publication** (Task 12): the first piece on Federico's profile is one he signs knowingly, with the date he chooses.

---

## File map

```
supabase/migrations/20261029120000_piezas.sql      piezas, versiones, firmas, publicaciones, eventos, guard, huella, RPCs
supabase/migrations/20261029120100_archivos.sql    bucket «piezas» and its RLS by brand
lib/piezas/estados.ts                              EstadoDePieza, transicionPermitida
lib/piezas/huella.ts                               huellaDe (mirror of the SQL, tested against it)
lib/piezas/horarios.ts                             enSantiago, proponerFecha (D19)
lib/piezas/acciones.ts                             crearPieza, firmarPieza, desprogramar, descartar, cerrarAMano
lib/piezas/lectura.ts                              bandeja (Inicio), detalle de una pieza
lib/linkedin/documento.ts                          esperarDocumento (moved out of the phase 0 script)
lib/publicacion/revision.ts                        revisarAntesDeEnviar (pure)
lib/publicacion/publicar.ts                        publicarPieza, publicarPendientes (ports)
lib/publicacion/repositorio.ts                     service-role implementation of the ports
lib/avisos/a-miembros.ts                           avisarMiembros (push to the owners of a brand)
trigger.config.ts, trigger/publicar.ts             scheduled task every 5 min, America/Santiago
app/(app)/piezas/nueva/{page,formulario,acciones}.tsx
app/(app)/piezas/[id]/{page,firma,a-mano,acciones}.tsx
app/(app)/page.tsx                                 Inicio becomes the tray
app/(app)/navegacion.tsx                           + «Nueva»
scripts/cargar-wr3.ts, lib/piezas/importar.ts      import the WR3 carousels as pieces of «Página de WAV»
```

---

# Part 1 — Data and rules

## Task 1: States as a pure function

**Files:** Create `lib/piezas/estados.ts`, `tests/unit/estados.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, test } from "vitest"
import { transicionPermitida } from "@/lib/piezas/estados"

describe("transicionPermitida", () => {
  test("signing moves a piece from the gate to scheduled, and nothing skips the gate", () => {
    expect(transicionPermitida("por_aprobar", "programada")).toBe(true)
    expect(transicionPermitida("por_aprobar", "publicando")).toBe(false)
    expect(transicionPermitida("por_aprobar", "publicada")).toBe(false)
  })
  test("only a scheduled piece can start sending, and a sent one never goes back to scheduled", () => {
    expect(transicionPermitida("programada", "publicando")).toBe(true)
    expect(transicionPermitida("publicando", "programada")).toBe(false)
    expect(transicionPermitida("envio_dudoso", "programada")).toBe(false)
  })
  test("published and discarded are final", () => {
    expect(transicionPermitida("publicada", "a_mano")).toBe(false)
    expect(transicionPermitida("descartada", "por_aprobar")).toBe(false)
  })
})
```

- [ ] **Step 2: Fail**, then implement `lib/piezas/estados.ts`

```ts
export const ESTADOS = [
  "por_aprobar",
  "programada",
  "publicando",
  "publicada",
  "envio_dudoso",
  "a_mano",
  "error",
  "descartada",
] as const

export type EstadoDePieza = (typeof ESTADOS)[number]

// The plano's machine, restricted to hand-made pieces (C1). The database guard in
// 20261029120000_piezas.sql holds the same table; tests/integration/piezas.test.ts checks they agree.
export const TRANSICIONES: Record<EstadoDePieza, readonly EstadoDePieza[]> = {
  por_aprobar: ["programada", "descartada"],
  programada: ["por_aprobar", "publicando", "a_mano", "descartada"],
  publicando: ["publicada", "envio_dudoso", "a_mano", "error"],
  error: ["programada", "por_aprobar", "descartada"],
  envio_dudoso: ["publicada", "a_mano", "descartada"],
  a_mano: ["publicada", "por_aprobar", "descartada"],
  publicada: [],
  descartada: [],
}

export function transicionPermitida(de: EstadoDePieza, a: EstadoDePieza): boolean {
  return TRANSICIONES[de].includes(a)
}

export function esEstado(valor: string): valor is EstadoDePieza {
  return (ESTADOS as readonly string[]).includes(valor)
}
```

- [ ] **Step 3: Pass**, commit — `git commit -m "feat: add the piece state machine for hand-made pieces"`

## Task 2: Pieces, versions, signatures, sends — with the guard in the database

**Files:** Create `supabase/migrations/20261029120000_piezas.sql`, `tests/integration/piezas.test.ts`. Modify `tests/integration/entorno.ts` (helper `cuentaDe`), `tests/integration/limpieza.ts` (nothing: brands cascade).

- [ ] **Step 1: Helper** in `tests/integration/entorno.ts`

```ts
export async function cuentaDe(
  marcaId: string,
  tipo: "persona" | "empresa" = "persona",
  ruta: "api" | "a_mano" = "api",
): Promise<string> {
  const { data, error } = await admin()
    .from("cuentas")
    .insert({ marca_id: marcaId, red: "linkedin", tipo, ruta, nombre: `Cuenta ${randomUUID().slice(0, 8)}` })
    .select("id")
    .single()
  if (error) throw error
  return data.id
}
```

- [ ] **Step 2: Failing test** `tests/integration/piezas.test.ts`

```ts
import { describe, expect, test } from "vitest"
import { huellaDe } from "@/lib/piezas/huella"
import { ESTADOS, TRANSICIONES } from "@/lib/piezas/estados"
import { admin, cuentaDe, marcaConDueno, personaConSesion } from "./entorno"

const EN_UNA_HORA = () => new Date(Date.now() + 3_600_000).toISOString()

async function piezaPorAprobar(texto = "Hola desde PostIA") {
  const dueno = await personaConSesion("pieza")
  const marca = await marcaConDueno(dueno.userId)
  const cuenta = await cuentaDe(marca)
  const { data: piezaId, error } = await dueno.db.rpc("crear_pieza", {
    p_cuenta: cuenta,
    p_formato: "texto",
    p_texto: texto,
    p_titulo: null,
    p_archivo_ruta: null,
    p_archivo_sha256: null,
  })
  if (error) throw error
  return { ...dueno, marca, cuenta, pieza: piezaId as string }
}

async function huellaVigente(pieza: string) {
  const { data } = await admin()
    .from("versiones")
    .select("huella")
    .eq("pieza_id", pieza)
    .order("numero", { ascending: false })
    .limit(1)
    .single()
  return data?.huella as string
}

describe("pieces", () => {
  test("the database computes the huella exactly as the app does", async () => {
    const { pieza } = await piezaPorAprobar("Texto con\r\nsalto y espacio final   ")
    expect(await huellaVigente(pieza)).toBe(
      huellaDe({ formato: "texto", titulo: null, archivoSha256: null, texto: "Texto con\nsalto y espacio final" }),
    )
  })

  test("only a member sees a piece, and only an owner creates one", async () => {
    const { pieza, cuenta } = await piezaPorAprobar()
    const extrano = await personaConSesion("extrano")
    expect((await extrano.db.from("piezas").select("id").eq("id", pieza)).data).toEqual([])
    const { error } = await extrano.db.rpc("crear_pieza", {
      p_cuenta: cuenta,
      p_formato: "texto",
      p_texto: "x",
      p_titulo: null,
      p_archivo_ruta: null,
      p_archivo_sha256: null,
    })
    expect(error?.code).toBe("42501")
  })

  test("signing needs the current huella and a future date, and binds both", async () => {
    const { db, pieza } = await piezaPorAprobar()
    const vieja = "0".repeat(64)
    expect((await db.rpc("firmar_pieza", { p_pieza: pieza, p_huella: vieja, p_programada_para: EN_UNA_HORA() })).error?.code).toBe("22023")
    const pasado = new Date(Date.now() - 60_000).toISOString()
    expect((await db.rpc("firmar_pieza", { p_pieza: pieza, p_huella: await huellaVigente(pieza), p_programada_para: pasado })).error?.code).toBe("22023")
    const cuando = EN_UNA_HORA()
    expect((await db.rpc("firmar_pieza", { p_pieza: pieza, p_huella: await huellaVigente(pieza), p_programada_para: cuando })).error).toBeNull()
    const { data } = await db.from("piezas").select("estado, programada_para").eq("id", pieza).single()
    expect(data?.estado).toBe("programada")
    expect(Date.parse(data?.programada_para ?? "")).toBe(Date.parse(cuando))
  })

  test("a new version drops the signature and sends the piece back to the gate", async () => {
    const { db, pieza } = await piezaPorAprobar()
    await db.rpc("firmar_pieza", { p_pieza: pieza, p_huella: await huellaVigente(pieza), p_programada_para: EN_UNA_HORA() })
    expect((await db.rpc("nueva_version", { p_pieza: pieza, p_texto: "Otro texto", p_titulo: null, p_archivo_ruta: null, p_archivo_sha256: null })).error).toBeNull()
    const { data } = await admin().from("piezas").select("estado").eq("id", pieza).single()
    expect(data?.estado).toBe("por_aprobar")
    const { count } = await admin().from("firmas").select("*", { count: "exact", head: true }).eq("pieza_id", pieza).eq("vigente", true)
    expect(count).toBe(0)
  })

  test("two pieces of one account cannot share a slot", async () => {
    const primera = await piezaPorAprobar()
    const cuando = EN_UNA_HORA()
    await primera.db.rpc("firmar_pieza", { p_pieza: primera.pieza, p_huella: await huellaVigente(primera.pieza), p_programada_para: cuando })
    const { data: otra } = await primera.db.rpc("crear_pieza", { p_cuenta: primera.cuenta, p_formato: "texto", p_texto: "Otra", p_titulo: null, p_archivo_ruta: null, p_archivo_sha256: null })
    const { error } = await primera.db.rpc("firmar_pieza", { p_pieza: otra as string, p_huella: await huellaVigente(otra as string), p_programada_para: cuando })
    expect(error?.code).toBe("23505")
  })

  test("the guard refuses any transition the machine does not allow, even for the service role", async () => {
    const { pieza } = await piezaPorAprobar()
    const { error } = await admin().from("piezas").update({ estado: "publicada" }).eq("id", pieza)
    expect(error?.code).toBe("23514")
  })

  test("the guard table in SQL matches the app's", async () => {
    const { data } = await admin().rpc("transiciones_de_pieza")
    const enSql = Object.fromEntries((data ?? []).map((f: { de: string; a: string[] }) => [f.de, [...f.a].sort()]))
    const enApp = Object.fromEntries(ESTADOS.map((e) => [e, [...TRANSICIONES[e]].sort()]))
    expect(enSql).toEqual(enApp)
  })

  test("a send is written once: the second reservation for a piece fails", async () => {
    const { pieza } = await piezaPorAprobar()
    const fila = { pieza_id: pieza, enviado_en: new Date().toISOString() }
    expect((await admin().from("publicaciones").insert(fila)).error).toBeNull()
    expect((await admin().from("publicaciones").insert(fila)).error?.code).toBe("23505")
  })

  test("every state change leaves an event with who did it", async () => {
    const { db, pieza, userId } = await piezaPorAprobar()
    await db.rpc("firmar_pieza", { p_pieza: pieza, p_huella: await huellaVigente(pieza), p_programada_para: EN_UNA_HORA() })
    const { data } = await admin().from("eventos").select("de, a, por").eq("pieza_id", pieza).order("id")
    expect(data?.at(-1)).toEqual({ de: "por_aprobar", a: "programada", por: userId })
  })
})
```

- [ ] **Step 3: Fail** — `pnpm test:db tests/integration/piezas.test.ts`.
- [ ] **Step 4: Migration** `supabase/migrations/20261029120000_piezas.sql`

```sql
-- A piece is what goes out on one account. Its text and file live in immutable versions; a signature binds one
-- version's huella and one date. Plano: «Estados de una pieza», «Puerta 2», «Sale lo que se aprobó».
create extension if not exists pgcrypto with schema extensions;

create table public.piezas (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  formato text not null check (formato in ('texto', 'carrusel_pdf')),
  estado text not null default 'por_aprobar' check (estado in (
    'por_aprobar', 'programada', 'publicando', 'publicada', 'envio_dudoso', 'a_mano', 'error', 'descartada'
  )),
  programada_para timestamptz,
  -- «Ventana de atraso»: past this many minutes after its time, a piece does not go out without a person knowing.
  ventana_minutos smallint not null default 30 check (ventana_minutos between 5 and 240),
  arrendada_hasta timestamptz,
  motivo text check (length(motivo) <= 500),
  enlace text check (enlace is null or enlace ~ '^https://(www\.)?linkedin\.com/'),
  creada_por uuid not null references auth.users (id),
  creada_en timestamptz not null default now(),
  constraint con_fecha check (estado not in ('programada', 'publicando') or programada_para is not null)
);

-- One account never has two pieces in the same slot (plano: horarioLibreEnCuenta, only inside the account).
create unique index piezas_un_horario_por_cuenta on public.piezas (cuenta_id, programada_para)
  where estado in ('programada', 'publicando', 'publicada');

create table public.versiones (
  id uuid primary key default gen_random_uuid(),
  pieza_id uuid not null references public.piezas (id) on delete cascade,
  numero integer not null check (numero > 0),
  texto text not null check (length(texto) between 1 and 3000),
  titulo text check (length(titulo) between 1 and 100),
  archivo_ruta text,
  archivo_sha256 text check (archivo_sha256 ~ '^[0-9a-f]{64}$'),
  huella text not null,
  creada_por uuid references auth.users (id),
  creada_en timestamptz not null default now(),
  unique (pieza_id, numero),
  constraint archivo_completo check ((archivo_ruta is null) = (archivo_sha256 is null))
);

create table public.firmas (
  id uuid primary key default gen_random_uuid(),
  pieza_id uuid not null references public.piezas (id) on delete cascade,
  version_id uuid not null references public.versiones (id) on delete cascade,
  huella text not null,
  programada_para timestamptz not null,
  firmada_por uuid not null references auth.users (id),
  firmada_en timestamptz not null default now(),
  vigente boolean not null default true
);
create unique index firmas_una_vigente on public.firmas (pieza_id) where vigente;

-- Written right before the irreversible POST: a second row for the same piece is impossible (send once).
create table public.publicaciones (
  id uuid primary key default gen_random_uuid(),
  pieza_id uuid not null unique references public.piezas (id) on delete cascade,
  version_id uuid references public.versiones (id),
  firma_id uuid references public.firmas (id),
  enviado_en timestamptz not null default now(),
  post_urn text check (post_urn ~ '^urn:li:(share|ugcPost):[0-9]+$'),
  enlace text
);

create table public.eventos (
  id bigint generated always as identity primary key,
  pieza_id uuid not null references public.piezas (id) on delete cascade,
  de text,
  a text not null,
  por uuid references auth.users (id),
  motivo text,
  en timestamptz not null default now()
);

-- The huella: format · title · file hash · text, the text normalized (CRLF to LF, trailing blanks off).
-- lib/piezas/huella.ts computes the same thing; tests/integration/piezas.test.ts checks they agree.
create function public.normalizar_texto(p text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(replace(p, E'\r\n', E'\n'), '\s+$', '')
$$;

create function public.poner_huella() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.texto := public.normalizar_texto(new.texto);
  new.huella := encode(extensions.digest(
    convert_to(new.texto, 'UTF8') || '\x00'::bytea
      || convert_to(coalesce(new.titulo, ''), 'UTF8') || '\x00'::bytea
      || convert_to(coalesce(new.archivo_sha256, ''), 'UTF8') || '\x00'::bytea
      || convert_to((select formato from public.piezas where id = new.pieza_id), 'UTF8'),
    'sha256'), 'hex');
  return new;
end $$;

create trigger versiones_huella before insert on public.versiones
  for each row execute function public.poner_huella();

-- Versions never change: a correction is a new version.
create function public.versiones_inmutables() returns trigger
language plpgsql as $$
begin
  raise exception using errcode = '42501', message = 'las_versiones_no_cambian';
end $$;
create trigger versiones_sin_cambios before update on public.versiones
  for each row execute function public.versiones_inmutables();

-- A new version drops any signature and sends a scheduled or by-hand piece back to the gate (Sale lo que se aprobó).
create function public.version_nueva_cae_firma() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.numero > 1 then
    update public.firmas set vigente = false where pieza_id = new.pieza_id and vigente;
    update public.piezas set estado = 'por_aprobar', motivo = 'Cambió el texto o el archivo: hay que firmar de nuevo.'
     where id = new.pieza_id and estado in ('programada', 'a_mano');
  end if;
  return new;
end $$;
create trigger versiones_firma after insert on public.versiones
  for each row execute function public.version_nueva_cae_firma();

-- The machine (same table as lib/piezas/estados.ts).
create function public.transiciones_de_pieza() returns table (de text, a text[])
language sql immutable set search_path = '' as $$
  values
    ('por_aprobar', array['programada', 'descartada']),
    ('programada', array['por_aprobar', 'publicando', 'a_mano', 'descartada']),
    ('publicando', array['publicada', 'envio_dudoso', 'a_mano', 'error']),
    ('error', array['programada', 'por_aprobar', 'descartada']),
    ('envio_dudoso', array['publicada', 'a_mano', 'descartada']),
    ('a_mano', array['publicada', 'por_aprobar', 'descartada']),
    ('publicada', array[]::text[]),
    ('descartada', array[]::text[])
$$;

create function public.guardia_de_estado() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.estado is distinct from old.estado then
    if not exists (select 1 from public.transiciones_de_pieza() t where t.de = old.estado and new.estado = any (t.a)) then
      raise exception using errcode = '23514', message = format('transicion_no_permitida %s -> %s', old.estado, new.estado);
    end if;
    -- Scheduling needs a valid signature for the current version (Puerta 2).
    if new.estado = 'programada' and not exists (
      select 1 from public.firmas f
       where f.pieza_id = new.id and f.vigente
         and f.huella = (select v.huella from public.versiones v where v.pieza_id = new.id order by v.numero desc limit 1)
    ) then
      raise exception using errcode = '23514', message = 'programar_sin_firma_vigente';
    end if;
    insert into public.eventos (pieza_id, de, a, por, motivo) values (new.id, old.estado, new.estado, auth.uid(), new.motivo);
  end if;
  return new;
end $$;
create trigger piezas_guardia before update on public.piezas
  for each row execute function public.guardia_de_estado();

-- RLS: members see their brands' pieces; every write by people goes through the RPCs below.
alter table public.piezas enable row level security;
alter table public.versiones enable row level security;
alter table public.firmas enable row level security;
alter table public.publicaciones enable row level security;
alter table public.eventos enable row level security;

create function public.marca_de_pieza(p_pieza uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select c.marca_id from public.piezas p join public.cuentas c on c.id = p.cuenta_id where p.id = p_pieza
$$;

create policy "miembros ven piezas" on public.piezas for select to authenticated
  using (public.es_miembro((select marca_id from public.cuentas where id = cuenta_id)));
create policy "miembros ven versiones" on public.versiones for select to authenticated
  using (public.es_miembro(public.marca_de_pieza(pieza_id)));
create policy "miembros ven firmas" on public.firmas for select to authenticated
  using (public.es_miembro(public.marca_de_pieza(pieza_id)));
create policy "miembros ven publicaciones" on public.publicaciones for select to authenticated
  using (public.es_miembro(public.marca_de_pieza(pieza_id)));
create policy "miembros ven eventos" on public.eventos for select to authenticated
  using (public.es_miembro(public.marca_de_pieza(pieza_id)));

revoke all on public.piezas, public.versiones, public.firmas, public.publicaciones, public.eventos from anon, authenticated;
grant select on public.piezas, public.versiones, public.firmas, public.publicaciones, public.eventos to authenticated;

-- People's actions. Each checks ownership of the piece's brand (phase 1: owners only, D4).
create function public.crear_pieza(
  p_cuenta uuid, p_formato text, p_texto text, p_titulo text, p_archivo_ruta text, p_archivo_sha256 text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_marca uuid;
  v_pieza uuid;
begin
  select marca_id into v_marca from public.cuentas where id = p_cuenta;
  if v_marca is null or not public.es_dueno(v_marca) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_crea_piezas';
  end if;
  if p_formato = 'carrusel_pdf' and (p_archivo_ruta is null or p_titulo is null) then
    raise exception using errcode = '22023', message = 'carrusel_sin_archivo_o_titulo';
  end if;
  if p_archivo_ruta is not null and split_part(p_archivo_ruta, '/', 1) <> v_marca::text then
    raise exception using errcode = '42501', message = 'archivo_de_otra_marca';
  end if;
  insert into public.piezas (cuenta_id, formato, creada_por) values (p_cuenta, p_formato, auth.uid()) returning id into v_pieza;
  insert into public.versiones (pieza_id, numero, texto, titulo, archivo_ruta, archivo_sha256, creada_por)
  values (v_pieza, 1, p_texto, p_titulo, p_archivo_ruta, p_archivo_sha256, auth.uid());
  return v_pieza;
end $$;

create function public.nueva_version(
  p_pieza uuid, p_texto text, p_titulo text, p_archivo_ruta text, p_archivo_sha256 text
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
  if v_estado not in ('por_aprobar', 'programada', 'a_mano') then
    raise exception using errcode = '22023', message = 'pieza_no_editable';
  end if;
  select coalesce(max(numero), 0) + 1 into v_numero from public.versiones where pieza_id = p_pieza;
  insert into public.versiones (pieza_id, numero, texto, titulo, archivo_ruta, archivo_sha256, creada_por)
  values (p_pieza, v_numero, p_texto, p_titulo, p_archivo_ruta, p_archivo_sha256, auth.uid()) returning id into v_id;
  return v_id;
end $$;

create function public.firmar_pieza(p_pieza uuid, p_huella text, p_programada_para timestamptz) returns uuid
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
  if p_programada_para is null or p_programada_para < now() + interval '1 minute' then
    raise exception using errcode = '22023', message = 'fecha_en_el_pasado';
  end if;
  update public.firmas set vigente = false where pieza_id = p_pieza and vigente;
  insert into public.firmas (pieza_id, version_id, huella, programada_para, firmada_por)
  values (p_pieza, v_version.id, v_version.huella, p_programada_para, auth.uid()) returning id into v_firma;
  update public.piezas set estado = 'programada', programada_para = p_programada_para, motivo = null where id = p_pieza;
  return v_firma;
end $$;

create function public.desprogramar_pieza(p_pieza uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_dueno(public.marca_de_pieza(p_pieza)) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_desprograma';
  end if;
  update public.firmas set vigente = false where pieza_id = p_pieza and vigente;
  update public.piezas set estado = 'por_aprobar', motivo = 'Desprogramada.' where id = p_pieza and estado = 'programada';
  if not found then
    raise exception using errcode = '22023', message = 'pieza_no_programada';
  end if;
end $$;

create function public.descartar_pieza(p_pieza uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_dueno(public.marca_de_pieza(p_pieza)) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_descarta';
  end if;
  update public.firmas set vigente = false where pieza_id = p_pieza and vigente;
  update public.piezas set estado = 'descartada', motivo = nullif(btrim(p_motivo), '') where id = p_pieza;
end $$;

-- «Ya lo publiqué»: closes a piece by hand with its LinkedIn link (a_mano or a doubtful send that did go out).
create function public.cerrar_a_mano(p_pieza uuid, p_enlace text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_dueno(public.marca_de_pieza(p_pieza)) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_cierra';
  end if;
  update public.piezas set estado = 'publicada', enlace = p_enlace, motivo = null
   where id = p_pieza and estado in ('a_mano', 'envio_dudoso');
  if not found then
    raise exception using errcode = '22023', message = 'pieza_no_espera_enlace';
  end if;
end $$;

-- «No salió»: a doubtful send that the person checked and did not go out goes by hand.
create function public.dudoso_a_mano(p_pieza uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_dueno(public.marca_de_pieza(p_pieza)) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_decide';
  end if;
  update public.piezas set estado = 'a_mano', motivo = 'Revisado: no salió. Publícala a mano.'
   where id = p_pieza and estado = 'envio_dudoso';
end $$;

-- The publisher (service role only): leases due pieces so two runs never take the same one.
create function public.tomar_para_publicar() returns setof public.piezas
language sql security definer set search_path = '' as $$
  update public.piezas p set arrendada_hasta = now() + interval '10 minutes'
   where p.id in (
     select id from public.piezas
      where estado = 'programada' and programada_para <= now()
        and (arrendada_hasta is null or arrendada_hasta < now())
      order by programada_para
      limit 10
      for update skip locked)
  returning p.*
$$;

revoke execute on function public.crear_pieza(uuid, text, text, text, text, text), public.nueva_version(uuid, text, text, text, text),
  public.firmar_pieza(uuid, text, timestamptz), public.desprogramar_pieza(uuid), public.descartar_pieza(uuid, text),
  public.cerrar_a_mano(uuid, text), public.dudoso_a_mano(uuid), public.tomar_para_publicar(), public.marca_de_pieza(uuid),
  public.transiciones_de_pieza(), public.normalizar_texto(text) from public, anon;
grant execute on function public.crear_pieza(uuid, text, text, text, text, text), public.nueva_version(uuid, text, text, text, text),
  public.firmar_pieza(uuid, text, timestamptz), public.desprogramar_pieza(uuid), public.descartar_pieza(uuid, text),
  public.cerrar_a_mano(uuid, text), public.dudoso_a_mano(uuid), public.marca_de_pieza(uuid) to authenticated;
revoke execute on function public.tomar_para_publicar() from authenticated;
grant execute on function public.tomar_para_publicar(), public.transiciones_de_pieza() to service_role;
```

- [ ] **Step 5: Huella in the app** `lib/piezas/huella.ts` (imported by the test; also used by the publisher):

```ts
import { createHash } from "node:crypto"

export interface ContenidoDeVersion {
  formato: "texto" | "carrusel_pdf"
  titulo: string | null
  archivoSha256: string | null
  texto: string
}

/** Same normalization as public.normalizar_texto: CRLF to LF, trailing whitespace off. */
export function normalizarTexto(texto: string): string {
  return texto.replace(/\r\n/g, "\n").replace(/\s+$/u, "")
}

/** Mirror of public.poner_huella. The database is the authority; this exists to compare and to test. */
export function huellaDe(c: ContenidoDeVersion): string {
  const separador = Buffer.from([0])
  return createHash("sha256")
    .update(Buffer.concat([
      Buffer.from(normalizarTexto(c.texto), "utf8"), separador,
      Buffer.from(c.titulo ?? "", "utf8"), separador,
      Buffer.from(c.archivoSha256 ?? "", "utf8"), separador,
      Buffer.from(c.formato, "utf8"),
    ]))
    .digest("hex")
}

export function sha256(datos: Uint8Array): string {
  return createHash("sha256").update(datos).digest("hex")
}
```

- [ ] **Step 6: Pass** — `pnpm db:reset && pnpm db:types && pnpm test:db` (all green); `pnpm type`. If `regexp_replace` with `\s` and the JS `\s` disagree on some Unicode blank, the huella test shows it: align the JS to `[ \t\n\r\f\v]+$` rather than widening the SQL.
- [ ] **Step 7: Commit** — `git commit -m "feat: add pieces, versions, signatures and the send ledger with a state guard"`

## Task 3: Private bucket for piece files

**Files:** Create `supabase/migrations/20261029120100_archivos.sql`, `tests/integration/archivos.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, test } from "vitest"
import { marcaConDueno, personaConSesion } from "./entorno"

const PDF = new TextEncoder().encode("%PDF-1.4\n%prueba\n")

describe("piece files", () => {
  test("an owner uploads under their brand's folder; a stranger can neither read nor write it", async () => {
    const dueno = await personaConSesion("archivo")
    const marca = await marcaConDueno(dueno.userId)
    const ruta = `${marca}/${crypto.randomUUID()}.pdf`
    expect((await dueno.db.storage.from("piezas").upload(ruta, PDF, { contentType: "application/pdf" })).error).toBeNull()
    const extrano = await personaConSesion("archivo-extrano")
    expect((await extrano.db.storage.from("piezas").download(ruta)).error).not.toBeNull()
    expect((await extrano.db.storage.from("piezas").upload(`${marca}/x.pdf`, PDF, { contentType: "application/pdf" })).error).not.toBeNull()
  })

  test("only PDFs are accepted", async () => {
    const dueno = await personaConSesion("archivo-tipo")
    const marca = await marcaConDueno(dueno.userId)
    const { error } = await dueno.db.storage.from("piezas").upload(`${marca}/x.png`, PDF, { contentType: "image/png" })
    expect(error).not.toBeNull()
  })
})
```

- [ ] **Step 2: Fail**, then migration

```sql
-- Files of pieces (carousel PDFs), private, one folder per brand: «<marca_id>/<uuid>.pdf».
-- Supabase Storage instead of the plano's R2 until template rendering needs R2 (decided 2026-10-28).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('piezas', 'piezas', false, 104857600, array['application/pdf']);

create policy "miembros leen archivos de su marca" on storage.objects for select to authenticated
  using (bucket_id = 'piezas' and public.es_miembro(((storage.foldername(name))[1])::uuid));
create policy "duenos suben archivos a su marca" on storage.objects for insert to authenticated
  with check (bucket_id = 'piezas' and public.es_dueno(((storage.foldername(name))[1])::uuid));
```

- [ ] **Step 3: Pass**, commit — `git commit -m "feat: keep piece files in a private bucket per brand"`

## Task 4: Proposed date (D19) in Chile time

**Files:** Create `lib/piezas/horarios.ts`, `tests/unit/horarios.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, test } from "vitest"
import { enSantiago, proponerFecha } from "@/lib/piezas/horarios"

describe("enSantiago", () => {
  test("converts Chile wall time to UTC across daylight saving", () => {
    // 2026-11-03 is summer time (UTC-3); 2027-07-06 is winter time (UTC-4).
    expect(enSantiago(2026, 11, 3, 11, 0).toISOString()).toBe("2026-11-03T14:00:00.000Z")
    expect(enSantiago(2027, 7, 6, 11, 0).toISOString()).toBe("2027-07-06T15:00:00.000Z")
  })
})

describe("proponerFecha", () => {
  // Wednesday 2026-10-28, 10:00 in Chile.
  const AHORA = Date.parse("2026-10-28T13:00:00Z")

  test("the profile goes at 11:00 on the next free Tuesday, Wednesday or Thursday", () => {
    expect(proponerFecha("persona", [], AHORA).toISOString()).toBe("2026-10-28T14:00:00.000Z")
  })

  test("the page goes at 15:00, and a taken slot moves to the next valid day", () => {
    const ocupado = [Date.parse("2026-10-28T18:00:00Z")]
    expect(proponerFecha("empresa", ocupado, AHORA).toISOString()).toBe("2026-10-29T18:00:00.000Z")
  })

  test("never a weekend, and never less than 30 minutes ahead", () => {
    const juevesTarde = Date.parse("2026-10-29T14:45:00Z") // Thursday 11:45 in Chile, past the profile slot
    expect(proponerFecha("persona", [], juevesTarde).toISOString()).toBe("2026-11-03T14:00:00.000Z")
  })
})
```

- [ ] **Step 2: Fail**, then implement

```ts
// D19: Tuesday, Wednesday and Thursday; the profile at 11:00 and the page at 15:00, Chile time; never weekends.
const ZONA = "America/Santiago"
const DIAS_VALIDOS = new Set([2, 3, 4])
const HORA_POR_TIPO = { persona: 11, empresa: 15 } as const
const MARGEN_MS = 30 * 60_000
const DIA_MS = 86_400_000

function desfaseMs(instante: Date): number {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: ZONA,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(instante)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  )
  const comoUtc = Date.UTC(partes.year, partes.month - 1, partes.day, partes.hour, partes.minute, partes.second)
  return comoUtc - instante.getTime()
}

/** Chile wall time to an instant, daylight saving included (two passes settle the offset). */
export function enSantiago(anio: number, mes: number, dia: number, hora: number, minuto: number): Date {
  const local = Date.UTC(anio, mes - 1, dia, hora, minuto)
  let instante = new Date(local - desfaseMs(new Date(local)))
  instante = new Date(local - desfaseMs(instante))
  return instante
}

function fechaEnSantiago(instante: number): { anio: number; mes: number; dia: number; diaSemana: number } {
  const corrido = new Date(instante + desfaseMs(new Date(instante)))
  return {
    anio: corrido.getUTCFullYear(),
    mes: corrido.getUTCMonth() + 1,
    dia: corrido.getUTCDate(),
    diaSemana: corrido.getUTCDay(),
  }
}

/** The first free slot of an account at least 30 minutes ahead. `ocupados` are that account's taken instants. */
export function proponerFecha(tipo: "persona" | "empresa", ocupados: readonly number[], ahora: number): Date {
  const tomados = new Set(ocupados)
  for (let i = 0; i < 60; i++) {
    const { anio, mes, dia, diaSemana } = fechaEnSantiago(ahora + i * DIA_MS)
    if (!DIAS_VALIDOS.has(diaSemana)) continue
    const candidato = enSantiago(anio, mes, dia, HORA_POR_TIPO[tipo], 0)
    if (candidato.getTime() < ahora + MARGEN_MS || tomados.has(candidato.getTime())) continue
    return candidato
  }
  throw new Error("No encontré un horario libre en los próximos 60 días.")
}
```

- [ ] **Step 3: Pass**, commit — `git commit -m "feat: propose publishing slots in Chile time (D19)"`

# Part 2 — Creating and signing from the phone

## Task 5: Piece actions (create, sign, unschedule, discard, close by hand)

**Files:** Create `lib/piezas/acciones.ts`, `tests/integration/acciones-piezas.test.ts`

- [ ] **Step 1: Failing test** (key cases; same helpers as Task 2)

```ts
import { describe, expect, test } from "vitest"
import { cerrarAMano, crearPieza, firmarPieza } from "@/lib/piezas/acciones"
import { admin, cuentaDe, marcaConDueno, personaConSesion } from "./entorno"

describe("piece actions", () => {
  test("creates a text piece and refuses an empty or too long text", async () => {
    const { db, userId } = await personaConSesion("acc")
    const cuenta = await cuentaDe(await marcaConDueno(userId))
    expect((await crearPieza(db, { cuentaId: cuenta, formato: "texto", texto: "Hola" })).ok).toBe(true)
    expect(await crearPieza(db, { cuentaId: cuenta, formato: "texto", texto: "   " })).toEqual({ ok: false, error: "Falta el texto." })
    expect(await crearPieza(db, { cuentaId: cuenta, formato: "texto", texto: "a".repeat(3001) })).toEqual({
      ok: false,
      error: "El texto pasa los 3000 caracteres de LinkedIn.",
    })
  })

  test("a carousel needs a PDF that really is a PDF, and its hash is computed on the server", async () => {
    const { db, userId } = await personaConSesion("acc-pdf")
    const marca = await marcaConDueno(userId)
    const cuenta = await cuentaDe(marca)
    const ruta = `${marca}/${crypto.randomUUID()}.pdf`
    await db.storage.from("piezas").upload(ruta, new TextEncoder().encode("%PDF-1.4\nhola"), { contentType: "application/pdf" })
    const r = await crearPieza(db, { cuentaId: cuenta, formato: "carrusel_pdf", texto: "Texto", titulo: "Título", archivoRuta: ruta })
    expect(r.ok).toBe(true)
    const { data } = await admin().from("versiones").select("archivo_sha256").eq("archivo_ruta", ruta).single()
    expect(data?.archivo_sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  test("signing explains a stale version in words, not codes", async () => {
    const { db, userId } = await personaConSesion("acc-firma")
    const cuenta = await cuentaDe(await marcaConDueno(userId))
    const creada = await crearPieza(db, { cuentaId: cuenta, formato: "texto", texto: "Hola" })
    if (!creada.ok) throw new Error(creada.error)
    expect(await firmarPieza(db, { piezaId: creada.piezaId, huella: "0".repeat(64), programadaPara: new Date(Date.now() + 3_600_000).toISOString() })).toEqual({
      ok: false,
      error: "La pieza cambió desde que la abriste. Revísala de nuevo antes de firmar.",
    })
  })

  test("closing by hand accepts only a LinkedIn link", async () => {
    const { db } = await personaConSesion("acc-mano")
    expect(await cerrarAMano(db, { piezaId: crypto.randomUUID(), enlace: "https://ejemplo.com/x" })).toEqual({
      ok: false,
      error: "Pega el enlace de la publicación en LinkedIn.",
    })
  })
})
```

- [ ] **Step 2: Fail**, then implement `lib/piezas/acciones.ts`

```ts
import { z } from "zod"
import type { MensajePush } from "@/lib/avisos/tipos"
import { sha256 } from "@/lib/piezas/huella"
import type { Db } from "@/lib/supabase/database"

export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const MENSAJES: Record<string, string> = {
  solo_el_dueno_crea_piezas: "Solo el dueño de la marca puede crear piezas.",
  firma_de_otra_version: "La pieza cambió desde que la abriste. Revísala de nuevo antes de firmar.",
  fecha_en_el_pasado: "Elige una fecha y hora futuras.",
  pieza_no_esta_por_aprobar: "Esta pieza ya no espera tu firma.",
  pieza_no_espera_enlace: "Esta pieza no está esperando un enlace.",
  carrusel_sin_archivo_o_titulo: "Un carrusel necesita su PDF y un título.",
}

function falla(error: { code?: string; message: string }): { ok: false; error: string } {
  if (error.code === "23505") return { ok: false, error: "Esa cuenta ya tiene una pieza a esa hora. Elige otra." }
  const mensaje = MENSAJES[error.message]
  if (mensaje) return { ok: false, error: mensaje }
  console.error("Falla inesperada al guardar una pieza", error)
  return { ok: false, error: "No pude guardar. Inténtalo de nuevo en un rato." }
}

const NuevaPieza = z.discriminatedUnion("formato", [
  z.object({ cuentaId: z.uuid(), formato: z.literal("texto"), texto: z.string() }),
  z.object({
    cuentaId: z.uuid(),
    formato: z.literal("carrusel_pdf"),
    texto: z.string(),
    titulo: z.string().trim().min(1).max(100),
    archivoRuta: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/),
  }),
])

function errorDeTexto(texto: string): string | null {
  const limpio = texto.trim()
  if (!limpio) return "Falta el texto."
  if (limpio.length > 3000) return "El texto pasa los 3000 caracteres de LinkedIn."
  return null
}

/** The file was uploaded by the browser with the person's session; the server re-reads it and hashes it. */
async function hashDelArchivo(db: Db, ruta: string): Promise<string | null> {
  const { data, error } = await db.storage.from("piezas").download(ruta)
  if (error || !data) return null
  const bytes = new Uint8Array(await data.arrayBuffer())
  const esPdf = new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-"
  return esPdf ? sha256(bytes) : null
}

export async function crearPieza(db: Db, entrada: unknown): Promise<Resultado<{ piezaId: string }>> {
  const leida = NuevaPieza.safeParse(entrada)
  if (!leida.success) return { ok: false, error: "Revisa los datos de la pieza." }
  const textoMalo = errorDeTexto(leida.data.texto)
  if (textoMalo) return { ok: false, error: textoMalo }
  let archivoSha: string | null = null
  if (leida.data.formato === "carrusel_pdf") {
    archivoSha = await hashDelArchivo(db, leida.data.archivoRuta)
    if (!archivoSha) return { ok: false, error: "Ese archivo no es un PDF o no se pudo leer." }
  }
  const { data, error } = await db.rpc("crear_pieza", {
    p_cuenta: leida.data.cuentaId,
    p_formato: leida.data.formato,
    p_texto: leida.data.texto,
    p_titulo: leida.data.formato === "carrusel_pdf" ? leida.data.titulo : null,
    p_archivo_ruta: leida.data.formato === "carrusel_pdf" ? leida.data.archivoRuta : null,
    p_archivo_sha256: archivoSha,
  })
  if (error) return falla(error)
  return { ok: true, piezaId: data as string }
}

const Firma = z.object({ piezaId: z.uuid(), huella: z.string().regex(/^[0-9a-f]{64}$/), programadaPara: z.iso.datetime({ offset: true }) })

export async function firmarPieza(db: Db, entrada: unknown): Promise<Resultado> {
  const leida = Firma.safeParse(entrada)
  if (!leida.success) return { ok: false, error: "Revisa la fecha y la hora." }
  const { error } = await db.rpc("firmar_pieza", {
    p_pieza: leida.data.piezaId,
    p_huella: leida.data.huella,
    p_programada_para: leida.data.programadaPara,
  })
  return error ? falla(error) : { ok: true }
}

export async function desprogramar(db: Db, piezaId: string): Promise<Resultado> {
  const { error } = await db.rpc("desprogramar_pieza", { p_pieza: piezaId })
  return error ? falla(error) : { ok: true }
}

export async function descartar(db: Db, piezaId: string, motivo: string): Promise<Resultado> {
  const { error } = await db.rpc("descartar_pieza", { p_pieza: piezaId, p_motivo: motivo })
  return error ? falla(error) : { ok: true }
}

const Enlace = z.object({ piezaId: z.uuid(), enlace: z.url().regex(/^https:\/\/(www\.)?linkedin\.com\//) })

export async function cerrarAMano(db: Db, entrada: unknown): Promise<Resultado> {
  const leida = Enlace.safeParse(entrada)
  if (!leida.success) return { ok: false, error: "Pega el enlace de la publicación en LinkedIn." }
  const { error } = await db.rpc("cerrar_a_mano", { p_pieza: leida.data.piezaId, p_enlace: leida.data.enlace })
  return error ? falla(error) : { ok: true }
}

export async function dudosoAMano(db: Db, piezaId: string): Promise<Resultado> {
  const { error } = await db.rpc("dudoso_a_mano", { p_pieza: piezaId })
  return error ? falla(error) : { ok: true }
}
```

- [ ] **Step 3: Pass**, commit — `git commit -m "feat: create, sign and close pieces through owner-only actions"`

## Task 6: Reading for the screens

**Files:** Create `lib/piezas/lectura.ts`, `tests/integration/lectura-piezas.test.ts`

- [ ] **Step 1: Failing test:** `bandeja(db)` groups a member's pieces into `porFirmar` (`por_aprobar`), `aMano` (`a_mano`), `revisar` (`envio_dudoso`, `error`), `proximas` (`programada`, ordered by date, next 14 days); a stranger's tray is empty. `detalle(db, id)` returns the piece, its account (name, tipo, ruta), the latest version (texto, titulo, archivo_ruta, huella), a 10-minute signed URL for the file, the proposed date from `proponerFecha` with the account's taken slots, and `null` for a piece the person cannot see.
- [ ] **Step 2: Implement** `lib/piezas/lectura.ts`

```ts
import type { EstadoDePieza } from "@/lib/piezas/estados"
import { proponerFecha } from "@/lib/piezas/horarios"
import type { Db } from "@/lib/supabase/database"

export interface TarjetaDePieza {
  id: string
  estado: EstadoDePieza
  cuenta: string
  marca: string
  programadaPara: string | null
  extracto: string
  motivo: string | null
}

export interface Bandeja {
  porFirmar: TarjetaDePieza[]
  aMano: TarjetaDePieza[]
  revisar: TarjetaDePieza[]
  proximas: TarjetaDePieza[]
}

const CATORCE_DIAS_MS = 14 * 86_400_000

export async function bandeja(db: Db, ahora = Date.now()): Promise<Bandeja> {
  const { data, error } = await db
    .from("piezas")
    .select("id, estado, programada_para, motivo, cuentas(nombre, marcas(nombre)), versiones(numero, texto, titulo)")
    .in("estado", ["por_aprobar", "a_mano", "envio_dudoso", "error", "programada"])
    .order("programada_para", { ascending: true, nullsFirst: false })
  if (error) throw new Error(`No pude leer la bandeja: ${error.message}`, { cause: error })
  const tarjetas = data.map((p): TarjetaDePieza => {
    const ultima = [...p.versiones].sort((a, b) => b.numero - a.numero)[0]
    const base = ultima?.titulo ?? ultima?.texto ?? ""
    return {
      id: p.id,
      estado: p.estado as EstadoDePieza,
      cuenta: p.cuentas?.nombre ?? "",
      marca: p.cuentas?.marcas?.nombre ?? "",
      programadaPara: p.programada_para,
      extracto: base.length > 90 ? `${base.slice(0, 90)}…` : base,
      motivo: p.motivo,
    }
  })
  return {
    porFirmar: tarjetas.filter((t) => t.estado === "por_aprobar"),
    aMano: tarjetas.filter((t) => t.estado === "a_mano"),
    revisar: tarjetas.filter((t) => t.estado === "envio_dudoso" || t.estado === "error"),
    proximas: tarjetas.filter(
      (t) => t.estado === "programada" && t.programadaPara !== null && Date.parse(t.programadaPara) < ahora + CATORCE_DIAS_MS,
    ),
  }
}

export interface DetalleDePieza {
  id: string
  estado: EstadoDePieza
  formato: "texto" | "carrusel_pdf"
  motivo: string | null
  enlace: string | null
  programadaPara: string | null
  cuenta: { id: string; nombre: string; tipo: "persona" | "empresa"; ruta: string }
  version: { texto: string; titulo: string | null; huella: string; archivoUrl: string | null }
  fechaPropuesta: string
}

export async function detalle(db: Db, id: string, ahora = Date.now()): Promise<DetalleDePieza | null> {
  const { data: p, error } = await db
    .from("piezas")
    .select("id, estado, formato, motivo, enlace, programada_para, cuentas(id, nombre, tipo, ruta), versiones(numero, texto, titulo, huella, archivo_ruta)")
    .eq("id", id)
    .maybeSingle()
  if (error) throw new Error(`No pude leer la pieza: ${error.message}`, { cause: error })
  if (!p?.cuentas) return null
  const v = [...p.versiones].sort((a, b) => b.numero - a.numero)[0]
  if (!v) return null
  let archivoUrl: string | null = null
  if (v.archivo_ruta) {
    const { data: firmada, error: errorDeUrl } = await db.storage.from("piezas").createSignedUrl(v.archivo_ruta, 600)
    if (errorDeUrl) throw new Error(`No pude preparar el PDF: ${errorDeUrl.message}`, { cause: errorDeUrl })
    archivoUrl = firmada.signedUrl
  }
  const { data: ocupadas, error: errorDeOcupadas } = await db
    .from("piezas")
    .select("programada_para")
    .eq("cuenta_id", p.cuentas.id)
    .in("estado", ["programada", "publicando", "publicada"])
    .not("programada_para", "is", null)
  if (errorDeOcupadas) throw new Error(`No pude leer los horarios: ${errorDeOcupadas.message}`, { cause: errorDeOcupadas })
  const tipo = p.cuentas.tipo as "persona" | "empresa"
  return {
    id: p.id,
    estado: p.estado as EstadoDePieza,
    formato: p.formato as "texto" | "carrusel_pdf",
    motivo: p.motivo,
    enlace: p.enlace,
    programadaPara: p.programada_para,
    cuenta: { id: p.cuentas.id, nombre: p.cuentas.nombre, tipo, ruta: p.cuentas.ruta },
    version: { texto: v.texto, titulo: v.titulo, huella: v.huella, archivoUrl },
    fechaPropuesta: proponerFecha(tipo, ocupadas.map((o) => Date.parse(o.programada_para as string)), ahora).toISOString(),
  }
}
```

- [ ] **Step 3: Pass**, commit — `git commit -m "feat: read the tray and a piece's detail for the screens"`

## Task 7: Screens — new piece, sign, close by hand, the tray

**Files:** Create `app/(app)/piezas/nueva/{page.tsx,formulario.tsx,acciones.ts}`, `app/(app)/piezas/[id]/{page.tsx,firma.tsx,a-mano.tsx,acciones.ts}`, `tests/unit/firma.test.tsx`, `tests/e2e/piezas.spec.ts`. Modify `app/(app)/page.tsx`, `app/(app)/navegacion.tsx`, `lib/sesion/rutas.ts` (`RUTA_DE_NUEVA_PIEZA = "/piezas/nueva"`, `rutaDePieza(id)`).

- [ ] **Step 1: Failing component test** `tests/unit/firma.test.tsx`: `FirmaDePieza` shows the exact text, the proposed date in Chile time («martes 3 de noviembre, 11:00»), a `datetime-local` field prefilled with it, and «Firmar y programar»; clicking calls `firmar({ piezaId, huella, programadaPara })` with the ISO instant of the field interpreted in America/Santiago (use `enSantiago`); an error from `firmar` shows as an alert. Also: for a page account (`ruta: "a_mano"`) the button reads «Firmar: te aviso a la hora para publicarla a mano».
- [ ] **Step 2: Implement** the components. Rules for all screens: mobile-first, tokens only (`bg-primario`, `text-apagado`, `border-borde`), buttons `min-h-11`, Chilean Spanish, dates formatted with `Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })`.
  - `nueva/formulario.tsx` (client): account select (only owned accounts, from the session's brands), format radio (Post de texto / Carrusel PDF), textarea with a live `n / 3000` counter, title (carousel only), file input `accept="application/pdf"`. On submit a carousel's PDF is uploaded **from the browser** with `createClient()` to `piezas/<marca_id>/<crypto.randomUUID()>.pdf` (so Worker and Server Action body limits never apply), then `crearPiezaAccion` is called with the path; on success `router.push(rutaDePieza(id))`.
  - `[id]/page.tsx` (server): `detalle()`; 404 via `notFound()` when null. Shows account chip, state in words, `motivo` if any, the exact text (pre-wrap), the PDF link (signed URL), then by state: `por_aprobar` → `FirmaDePieza`; `programada` → date + «Desprogramar»; `a_mano` → `PublicarAMano`; `envio_dudoso` → «Revisa tu LinkedIn» with «Sí salió» (paste link) / «No salió» (`dudosoAMano`); `publicada` → the link.
  - `[id]/a-mano.tsx` (client): «Copiar texto» (`navigator.clipboard.writeText(texto)`), «Descargar PDF» (signed URL), link field + «Ya lo publiqué» → `cerrarAManoAccion`.
  - `acciones.ts` files: `"use server"` wrappers over `lib/piezas/acciones.ts` with `createActionClient()` and `revalidatePath`.
  - `app/(app)/page.tsx`: the tray from `bandeja()`: four sections in this order — «Por firmar», «Publicar a mano», «Revisar», «Próximas» — each card linking to the piece; empty sections hidden; when all are empty: «No hay nada pendiente.» plus a link to «Nueva pieza».
  - `navegacion.tsx`: add «Nueva» between Inicio and Marcas.
- [ ] **Step 3: E2E** `tests/e2e/piezas.spec.ts`: invite a test owner with a brand and an API profile account (admin client in the spec's setup), sign in (Mailpit code), create a text piece, sign it with the proposed date, and see it under «Próximas» in Inicio. Stays inside `@prueba.postia.test` so `limpieza.ts` removes it.
- [ ] **Step 4: Verify** — `pnpm test:run && pnpm test:db && pnpm type && pnpm lint && pnpm build && pnpm test:e2e`; then at 390 px in the browser: create, sign, unschedule, discard. `E2E_BASE_URL=http://localhost:8787 pnpm test:e2e` after `pnpm preview` (Worker size must stay under 3 MiB gzip: the screens import no PDF library).
- [ ] **Step 5: Commit** — `git commit -m "feat: create, sign and close pieces from the phone"`

# Part 3 — Publishing on time

## Task 8: The publisher, as pure orchestration over ports

**Files:** Create `lib/linkedin/documento.ts`, `lib/publicacion/revision.ts`, `lib/publicacion/publicar.ts`, `tests/unit/revision.test.ts`, `tests/unit/publicar.test.ts`. Modify `lib/fase0/prueba-linkedin.ts` (use `esperarDocumento` from the new module; its tests stay green).

- [ ] **Step 1: Move the document wait** to `lib/linkedin/documento.ts` (same loop as phase 0: 20 polls, 3 s apart), exported as `esperarDocumento(deps: { estadoDelDocumento; esperar }, token, documento)`; `lib/fase0/prueba-linkedin.ts` imports it. `pnpm test:run` stays green.
- [ ] **Step 2: Failing test** `tests/unit/revision.test.ts`

```ts
import { describe, expect, test } from "vitest"
import { revisarAntesDeEnviar } from "@/lib/publicacion/revision"

const AHORA = Date.parse("2026-11-03T14:05:00Z")
const BASE = {
  firmaHuella: "a".repeat(64),
  versionHuella: "a".repeat(64),
  programadaPara: "2026-11-03T14:00:00Z",
  ventanaMinutos: 30,
  ruta: "api" as const,
  conexionExpira: "2026-12-27T00:00:00Z",
}

describe("revisarAntesDeEnviar", () => {
  test("a signed, on-time piece of a connected account goes", () => {
    expect(revisarAntesDeEnviar(BASE, AHORA)).toEqual({ ok: true })
  })
  test("a signature of another version sends it back to the gate", () => {
    expect(revisarAntesDeEnviar({ ...BASE, firmaHuella: "b".repeat(64) }, AHORA)).toMatchObject({ ok: false, destino: "por_aprobar" })
  })
  test("past its window it does not go late: back to the gate", () => {
    expect(revisarAntesDeEnviar(BASE, Date.parse("2026-11-03T14:31:00Z"))).toMatchObject({ ok: false, destino: "por_aprobar" })
  })
  test("a hand account, or an expired connection, goes by hand", () => {
    expect(revisarAntesDeEnviar({ ...BASE, ruta: "a_mano" }, AHORA)).toMatchObject({ ok: false, destino: "a_mano" })
    expect(revisarAntesDeEnviar({ ...BASE, conexionExpira: "2026-11-01T00:00:00Z" }, AHORA)).toMatchObject({ ok: false, destino: "a_mano" })
  })
})
```

- [ ] **Step 3: Implement** `lib/publicacion/revision.ts`

```ts
export type Ruta = "api" | "metricool" | "a_mano"

export interface DatosDeRevision {
  firmaHuella: string | null
  versionHuella: string
  programadaPara: string
  ventanaMinutos: number
  ruta: Ruta
  conexionExpira: string | null
}

export type Revision = { ok: true } | { ok: false; destino: "por_aprobar" | "a_mano"; motivo: string }

/** Re-checked right before sending (plano: revisarAntesDeEnviar). Order matters: signature, window, route. */
export function revisarAntesDeEnviar(d: DatosDeRevision, ahora: number): Revision {
  if (!d.firmaHuella || d.firmaHuella !== d.versionHuella) {
    return { ok: false, destino: "por_aprobar", motivo: "La firma ya no corresponde a la versión actual." }
  }
  if (ahora > Date.parse(d.programadaPara) + d.ventanaMinutos * 60_000) {
    return {
      ok: false,
      destino: "por_aprobar",
      motivo: `No alcanzó a salir dentro de sus ${d.ventanaMinutos} minutos. Fírmala de nuevo con otra fecha.`,
    }
  }
  if (d.ruta !== "api") {
    return { ok: false, destino: "a_mano", motivo: "Esta cuenta se publica a mano." }
  }
  if (!d.conexionExpira || Date.parse(d.conexionExpira) <= ahora) {
    return { ok: false, destino: "a_mano", motivo: "La conexión de LinkedIn venció. Reconéctala en Marcas o publícala a mano." }
  }
  return { ok: true }
}
```

- [ ] **Step 4: Failing test** `tests/unit/publicar.test.ts` with an in-memory fake of the ports. Cases:
  1. A due text piece on an API account: reserves, posts with the little-text commentary, closes with the URN and link; no notice.
  2. A carousel: downloads the file, its hash matches, uploads, waits until ready, reserves **after** the upload, posts with `documento` and `titulo`.
  3. The file's hash differs from the version's: back to `por_aprobar` with «El archivo cambió después de la firma.», nothing uploaded or reserved, urgent notice.
  4. The reservation already exists (`ya_enviado`): `envio_dudoso`, no POST, urgent notice.
  5. `crearPost` throws `RespuestaDudosa` or a network error after the reservation: `envio_dudoso`, urgent notice, never a second POST.
  6. `crearPost` throws `RechazoDeLinkedin` (4xx) or `TokenDeLinkedinVencido`: `a_mano` with the reason, urgent notice.
  7. The document upload fails with a temporary error: the piece stays `programada` (the lease expires and the next run retries inside the window); nothing reserved.
  8. A hand account at its time: `a_mano` with «Esta cuenta se publica a mano.» and a notice whose URL is the piece.
  9. `publicarPendientes` also turns a piece `publicando` for over 15 minutes without a URN into `envio_dudoso`.
- [ ] **Step 5: Implement** `lib/publicacion/publicar.ts`

```ts
import { esperarDocumento } from "@/lib/linkedin/documento"
import { RechazoDeLinkedin, RespuestaDudosa, TokenDeLinkedinVencido, type crearPost, type EstadoDeDocumento } from "@/lib/linkedin/api"
import { aLittleText, enlaceDePost } from "@/lib/linkedin/dominio"
import { sha256 } from "@/lib/piezas/huella"
import { revisarAntesDeEnviar, type Ruta } from "./revision"

export interface PiezaParaPublicar {
  id: string
  marcaId: string
  cuentaId: string
  cuentaNombre: string
  ruta: Ruta
  formato: "texto" | "carrusel_pdf"
  programadaPara: string
  ventanaMinutos: number
  version: { id: string; texto: string; titulo: string | null; archivoRuta: string | null; archivoSha256: string | null; huella: string }
  firma: { id: string; huella: string } | null
}

export interface Credencial {
  token: string
  titular: string
  expiraEn: string
}

export type Aviso = MensajePush

export interface PuertosDePublicacion {
  tomarPendientes(): Promise<PiezaParaPublicar[]>
  sinRespuesta(desde: string): Promise<{ id: string; marcaId: string; cuentaNombre: string }[]>
  credencial(cuentaId: string): Promise<Credencial | null>
  descargar(ruta: string): Promise<Uint8Array>
  reservarEnvio(pieza: PiezaParaPublicar): Promise<"reservado" | "ya_enviado">
  cerrarEnvio(piezaId: string, urn: string, enlace: string): Promise<void>
  mover(piezaId: string, a: "por_aprobar" | "a_mano" | "envio_dudoso", motivo: string): Promise<void>
  avisar(marcaId: string, aviso: Aviso): Promise<void>
  linkedin: {
    crearPost: typeof crearPost
    subirDocumento(entrada: { token: string; autor: string; datos: Uint8Array }): Promise<string>
    estadoDelDocumento(entrada: { token: string; documento: string }): Promise<EstadoDeDocumento>
  }
  esperar(ms: number): Promise<void>
  ahora(): number
}

export type ResultadoDePublicacion = "publicada" | "por_aprobar" | "a_mano" | "envio_dudoso" | "reintentar"

const QUINCE_MINUTOS_MS = 15 * 60_000

function aviso(pieza: { id: string; cuentaNombre: string }, titulo: string, cuerpo: string): Aviso {
  return { titulo: `${titulo} · ${pieza.cuentaNombre}`, cuerpo, url: `/piezas/${pieza.id}` }
}

async function devolver(p: PuertosDePublicacion, pieza: PiezaParaPublicar, a: "por_aprobar" | "a_mano" | "envio_dudoso", motivo: string) {
  await p.mover(pieza.id, a, motivo)
  const titulos = { por_aprobar: "No salió", a_mano: "Publica a mano", envio_dudoso: "Revisa LinkedIn" } as const
  await p.avisar(pieza.marcaId, aviso(pieza, titulos[a], motivo))
  return a
}

/** One due piece. The reservation is written right before the only irreversible call (POST /rest/posts). */
export async function publicarPieza(p: PuertosDePublicacion, pieza: PiezaParaPublicar): Promise<ResultadoDePublicacion> {
  const credencial = pieza.ruta === "api" ? await p.credencial(pieza.cuentaId) : null
  const revision = revisarAntesDeEnviar(
    {
      firmaHuella: pieza.firma?.huella ?? null,
      versionHuella: pieza.version.huella,
      programadaPara: pieza.programadaPara,
      ventanaMinutos: pieza.ventanaMinutos,
      ruta: pieza.ruta,
      conexionExpira: credencial?.expiraEn ?? null,
    },
    p.ahora(),
  )
  if (!revision.ok) return devolver(p, pieza, revision.destino, revision.motivo)
  if (!credencial) return devolver(p, pieza, "a_mano", "No encontré la conexión de LinkedIn de esta cuenta.")

  let documento: { id: string; titulo: string } | null = null
  if (pieza.formato === "carrusel_pdf") {
    const { archivoRuta, archivoSha256, titulo } = pieza.version
    if (!archivoRuta || !archivoSha256 || !titulo) return devolver(p, pieza, "por_aprobar", "Al carrusel le falta su PDF o su título.")
    const datos = await p.descargar(archivoRuta)
    if (sha256(datos) !== archivoSha256) return devolver(p, pieza, "por_aprobar", "El archivo cambió después de la firma.")
    try {
      const id = await p.linkedin.subirDocumento({ token: credencial.token, autor: credencial.titular, datos })
      const estado = await esperarDocumento(
        { estadoDelDocumento: p.linkedin.estadoDelDocumento, esperar: p.esperar },
        credencial.token,
        id,
      )
      if (estado === "fallido") return devolver(p, pieza, "a_mano", "LinkedIn no pudo procesar el PDF.")
      if (estado === "procesando") return "reintentar"
      documento = { id, titulo }
    } catch (error) {
      if (error instanceof TokenDeLinkedinVencido) return devolver(p, pieza, "a_mano", "La conexión de LinkedIn venció.")
      if (error instanceof RechazoDeLinkedin) return devolver(p, pieza, "a_mano", `LinkedIn rechazó el PDF (HTTP ${error.http}).`)
      // Nothing was posted: the lease expires and the next run tries again inside the window.
      console.error(`Falla pasajera al subir el PDF de ${pieza.id}`, error)
      return "reintentar"
    }
  }

  if ((await p.reservarEnvio(pieza)) === "ya_enviado") {
    return devolver(p, pieza, "envio_dudoso", "Ya había un envío anotado para esta pieza: revisa si salió.")
  }
  try {
    const urn = await p.linkedin.crearPost({
      token: credencial.token,
      autor: credencial.titular,
      commentary: aLittleText(pieza.version.texto),
      visibilidad: "PUBLIC",
      ...(documento ? { documento: documento.id, titulo: documento.titulo } : {}),
    })
    await p.cerrarEnvio(pieza.id, urn, enlaceDePost(urn))
    return "publicada"
  } catch (error) {
    if (error instanceof TokenDeLinkedinVencido) return devolver(p, pieza, "a_mano", "La conexión de LinkedIn venció.")
    if (error instanceof RechazoDeLinkedin) return devolver(p, pieza, "a_mano", `LinkedIn rechazó la publicación (HTTP ${error.http}).`)
    const detalle = error instanceof RespuestaDudosa ? error.message : "LinkedIn no respondió."
    return devolver(p, pieza, "envio_dudoso", `${detalle} Puede que haya salido: revisa el perfil antes de hacer algo.`)
  }
}

/** One run of the scheduled task: due pieces one by one, then sends left without an answer. */
export async function publicarPendientes(p: PuertosDePublicacion): Promise<Record<ResultadoDePublicacion, number>> {
  const cuenta = { publicada: 0, por_aprobar: 0, a_mano: 0, envio_dudoso: 0, reintentar: 0 }
  for (const pieza of await p.tomarPendientes()) cuenta[await publicarPieza(p, pieza)]++
  const desde = new Date(p.ahora() - QUINCE_MINUTOS_MS).toISOString()
  for (const colgada of await p.sinRespuesta(desde)) {
    await p.mover(colgada.id, "envio_dudoso", "El envío quedó sin respuesta: revisa si salió.")
    await p.avisar(colgada.marcaId, aviso(colgada, "Revisa LinkedIn", "El envío quedó sin respuesta: revisa si salió."))
    cuenta.envio_dudoso++
  }
  return cuenta
}
```

- [ ] **Step 6: Pass**, commit — `git commit -m "feat: publish a due piece once, or park it for a person"`

## Task 9: GATE · Trigger.dev, the service-role ports and VAPID in both places

**Files:** Create `lib/publicacion/repositorio.ts`, `lib/avisos/a-miembros.ts`, `trigger.config.ts`, `trigger/publicar.ts`, `tests/integration/repositorio-publicacion.test.ts`. Modify `package.json`, `.github/workflows/ci.yml`, `docs/despliegue.md`.

- [ ] **Step 1: Ask Federico** (stop): the Trigger.dev organization for project `postia` (his existing one, free plan). Create it with the Trigger MCP (`create_project_in_org`) or in the dashboard; note the project ref.
- [ ] **Step 2: Failing integration test** for `repositorioDePublicacion(admin())`: `tomarPendientes` leases a due `programada` piece once (a second call in the same minute returns nothing) and returns its account, latest version and valid signature; `reservarEnvio` writes the row and moves the piece to `publicando`, and a second call answers `ya_enviado`; `cerrarEnvio` stores URN and link and moves to `publicada`; `mover` respects the guard (an illegal move throws); `sinRespuesta` finds a `publicando` piece whose send is older than the cut and has no URN; `credencial` returns the Vault token through `credencial_de_cuenta`.
- [ ] **Step 3: Implement** `lib/publicacion/repositorio.ts` (service role; the guard trigger still applies) and `lib/avisos/a-miembros.ts`:

```ts
// lib/avisos/a-miembros.ts
import type { Aviso } from "@/lib/publicacion/publicar"
import type { Db } from "@/lib/supabase/database"
import type { ServicioPush } from "./push"

/** Every device of every member of a brand. Expired subscriptions are forgotten; failures are logged, never thrown. */
export async function avisarMiembros(db: Db, servicio: ServicioPush, marcaId: string, aviso: Aviso, urgente = true) {
  const { data: miembros, error } = await db.from("miembros").select("user_id").eq("marca_id", marcaId)
  if (error) throw new Error(`No pude leer los miembros: ${error.message}`, { cause: error })
  const { data: aparatos, error: errorDeAparatos } = await db
    .from("suscripciones_push")
    .select("endpoint, p256dh, auth")
    .in("user_id", miembros.map((m) => m.user_id))
  if (errorDeAparatos) throw new Error(`No pude leer los aparatos: ${errorDeAparatos.message}`, { cause: errorDeAparatos })
  for (const aparato of aparatos) {
    const resultado = await servicio.enviar(aparato, aviso, { urgente })
    if (resultado.estado === "caducada") {
      const { error: errorAlBorrar } = await db.from("suscripciones_push").delete().eq("endpoint", aparato.endpoint)
      if (errorAlBorrar) console.error("No pude olvidar un aparato caducado", errorAlBorrar.message)
    } else if (resultado.estado === "fallo") {
      console.error(resultado.detalle)
    }
  }
}
```

  `repositorio.ts` maps each port to one query: `tomarPendientes` = `rpc("tomar_para_publicar")` then one select with `cuentas(id, nombre, ruta, marca_id)`, `versiones(...)` (latest by `numero`), `firmas(...)` (`vigente`); `reservarEnvio` = insert into `publicaciones` (23505 → `ya_enviado`) then update `estado = 'publicando'`; `cerrarEnvio` = update `publicaciones.post_urn` and `piezas` (`estado = 'publicada'`, `enlace`); `mover` = update `estado`, `motivo`, `arrendada_hasta = null`; `credencial` = `rpc("credencial_de_cuenta")`; `descargar` = `storage.from("piezas").download`.
- [ ] **Step 4: Trigger.dev.** `pnpm add @trigger.dev/sdk && pnpm add -D trigger.dev` (respecting pnpm's minimum release age). `trigger.config.ts`:

```ts
import { defineConfig } from "@trigger.dev/sdk"

export default defineConfig({
  project: "<ref from Step 1>",
  dirs: ["./trigger"],
  runtime: "node",
  maxDuration: 300,
  retries: { enabledInDev: false, default: { maxAttempts: 1 } },
})
```

  `trigger/publicar.ts`:

```ts
import { schedules } from "@trigger.dev/sdk"
import { servicioPushReal } from "@/lib/avisos/push"
import { avisarMiembros } from "@/lib/avisos/a-miembros"
import { crearPost, estadoDelDocumento, subirDocumento } from "@/lib/linkedin/api"
import { publicarPendientes } from "@/lib/publicacion/publicar"
import { repositorioDePublicacion } from "@/lib/publicacion/repositorio"
import { createAdminClient } from "@/lib/supabase/admin"

// Every 5 minutes, Chile time. One run at a time: two runs never race for the same piece (the lease also guards it).
// No automatic retries: a send is never repeated by the platform; the next run decides with fresh state.
export const publicar = schedules.task({
  id: "publicar-pendientes",
  cron: { pattern: "*/5 * * * *", timezone: "America/Santiago" },
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async () => {
    const db = createAdminClient()
    const push = servicioPushReal()
    return publicarPendientes({
      ...repositorioDePublicacion(db),
      avisar: (marcaId, aviso) => avisarMiembros(db, push, marcaId, aviso),
      linkedin: { crearPost, subirDocumento, estadoDelDocumento },
      esperar: (ms) => new Promise((listo) => setTimeout(listo, ms)),
      ahora: Date.now,
    })
  },
})
```

  Check in `trigger dev` that the `@/` alias resolves (tsconfig paths); if not, add the paths through the config's build options before going further.
- [ ] **Step 5: VAPID in both places (gate).** One pipeline generates a new pair and writes it to the Worker (`wrangler secret bulk`) and to Trigger.dev production (dashboard «Environment variables», or the CLI if it supports stdin) without printing it; the same goes for `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL` in Trigger.dev (Federico pastes the service role there himself). Federico re-activates notices on the iPhone (Ajustes) because the old subscription belongs to the old public key.
- [ ] **Step 6: Deploy.** First manually (`pnpm exec trigger.dev deploy`), then a CI job after «Deploy» with `TRIGGER_ACCESS_TOKEN` (Federico creates it and sets `gh secret set TRIGGER_ACCESS_TOKEN`).
- [ ] **Step 7: Commit** — `git commit -m "feat: run the publisher every five minutes on Trigger.dev"`

# Part 4 — First load and the real run

## Task 10: Import the WR3 carousels as pieces of «Página de WAV»

**Files:** Create `lib/piezas/importar.ts`, `scripts/cargar-wr3.ts`, `tests/unit/importar.test.ts`. Modify `package.json` (`"cargar:wr3": "tsx --env-file=.env.local scripts/cargar-wr3.ts"`, `"cargar:wr3:prod"` with `.env.produccion`).

- [ ] **Step 1: Failing test** for `leerCopy(markdown)`: from `copy.md` it returns 9 entries with `titulo` (the heading without its number), `pdf` (file name), `guia` (URL) and `texto` with `[link]` replaced by the guide's URL and without the `PDF:` / `Guía:` lines; it throws a `Falla` if an entry has no PDF line or still contains `[link]` after replacing.
- [ ] **Step 2: Implement** `leerCopy` and the script: for each entry, read the PDF from the WR3 folder, validate it with `leerPdf` (pdf-lib lives only in scripts, never in the Worker), skip it if a version with the same `archivo_sha256` already exists for the account (idempotent), upload it with the service role to `piezas/<marca_id>/<uuid>.pdf`, and insert piece + version 1 as Federico (`creada_por` = his user id, looked up by email), state `por_aprobar`. Prints one line per carousel: title and «nueva» / «ya estaba».
- [ ] **Step 3: Run locally**, then **ask Federico** before `cargar:wr3:prod`. Note: WR3's copy speaks as «nosotros», which is the page's voice; no change needed.
- [ ] **Step 4: Commit** — `git commit -m "feat: import the WR3 carousels as pieces for WAV's page"`

## Task 11: Verify on workerd and locally end to end

- [ ] **Step 1:** `pnpm test:run && pnpm test:db && pnpm type && pnpm lint && pnpm build && pnpm test:e2e`.
- [ ] **Step 2:** `pnpm preview` + `E2E_BASE_URL=http://localhost:8787 pnpm test:e2e`; size check (`wrangler deploy --dry-run`) still under 3 MiB gzip.
- [ ] **Step 3:** With `trigger dev` running against local Supabase: a text piece signed for 2 minutes ahead on a **local test account with a fake LinkedIn** (`LINKEDIN_API_BASE_URL` pointing at a local MSW-like stub is not available in Trigger's dev runtime, so instead sign it on the «Página de WAV» hand account): at its time it moves to `a_mano` and the Chrome notice arrives; «Ya lo publiqué» with a link closes it.

## Task 12: GATE · production

- [ ] **Step 1: Ask Federico**, then `supabase db push` (two migrations) and `pnpm db:types` committed.
- [ ] **Step 2:** Merge to `main`: CI deploys the Worker and the Trigger.dev task.
- [ ] **Step 3:** `pnpm cargar:wr3:prod` (after his yes): 9 pieces appear under «Por firmar» on the iPhone.
- [ ] **Step 4:** Federico signs the WR3 carousels with the proposed dates (Tuesday to Thursday, 15:00). At the first one's time the iPhone shows «Publica a mano · Página de WAV»; he publishes it and pastes the link.
- [ ] **Step 5:** The first automatic publication on his profile: a piece he writes and signs knowingly (Gate 5). At its time it goes out by itself and its link appears in the piece. `select count(*) from publicaciones` equals the published API pieces; no piece has two sends.

---

## Self-review

**Coverage of the plano for C1.** Puerta 2 with one signature (D15, D25) → Tasks 2, 5, 7. «Sale lo que se aprobó» (huella in the database, file hash re-checked before sending) → Tasks 2, 8. «Ventana de atraso» → Task 8 (`revisarAntesDeEnviar`). Send once with reservation and doubtful sends → Tasks 2, 8, 9. «Publicar a mano» → Tasks 7, 8. Horarios D19 → Task 4. «Solo publica, nunca conversa» → no new scope requested. «Llaves fuera» → Vault, Worker and Trigger.dev secrets, none in code. Urgent notices immediate (D26's exception) → Task 8/9; grouped windows → C2.

**Consistency checks done.** The SQL transition table and `TRANSICIONES` are compared by a test; the SQL huella and `huellaDe` are compared by a test; `firmar_pieza` messages map to Spanish in `lib/piezas/acciones.ts`.

**Known risks, checked early:**
- Trigger.dev resolving the `@/` alias (Task 9 Step 4).
- `\s` in Postgres vs JavaScript for the huella normalization (Task 2 Step 6, caught by the test).
- Worker size: the screens import no PDF library; PDFs are uploaded by the browser straight to Storage.
- The VAPID rotation needs Federico to re-activate notices (Task 9 Step 5).

**Out of C1, into C2:** Calendar screen and moving dates, the reserve week (D21), the two daily notice windows (D26), connection watching (14/3/0 days), the error state's automatic retry policy.
