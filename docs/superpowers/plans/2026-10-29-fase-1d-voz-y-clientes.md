# Phase 1 · Plan D: editorial lines, pillars and client exceptions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each brand's voice lives in the app: its editorial line (what it talks about, tone, formats, banned topics, topics to watch, approved examples) and its pillars with a weekly target, edited in «Voz y línea editorial» where every save is a new version and older ones stay readable. Every piece can carry a pillar, and the calendar and the 9:00/17:00 digest warn when an account's pillar has gone two weeks without coming out (D20). The corrected cases are in the database, and Federico marks client exceptions in «Clientes» (D13). At gate 1, a review with no AI shows mentions of clients with an exception, @mentions other than WAV and Federico (D22), prices and budgets, and «+20 años» or «+200 proyectos» attributed to WAV. Right before sending, the publisher checks client exceptions again and returns the piece to gate 2 if a client got an exception after the signature.

**Architecture:** One new migration (`20261031120000_voz_y_clientes.sql`; the C1 and C2 migrations are in production and are not edited). `pilares` holds stable rows per brand. `lineas_editoriales` holds immutable versions with a snapshot of the pillars. The owner RPC `guardar_linea_editorial` writes a version and syncs the pillar rows in one transaction, refusing a stale base. `casos` is shared by both brands, because the cases are Federico's track record, which WAV cites; it is loaded by script and only the service role writes it. `excepciones` is shared too, with soft removal so the history stays. `piezas.pilar_id` is set by the owner RPC `poner_pilar`, and a trigger keeps a pillar inside its account's brand. The rules are pure and unit-tested: `leerLinea` (import), `prepararRevision` (deterministic review, compiled once per request), `balanceDePilares` (D20) and `leerCasos`. The living Claude Docs are never committed: `pnpm cargar:linea` reads a local markdown file passed as an argument.

**Tech Stack:** Next.js 16 on Workers, Supabase (Postgres, RLS), Trigger.dev v4 (existing tasks only), zod 4, Vitest, Playwright.

**Source of truth:** plano «Voz y línea editorial», «líneas editoriales», «Clientes», «excepciones de clientes», «Casos corregidos», «Cada marca con su voz», «Confidencialidad de clientes», «Calendario» (D20); decisions D13, D20, D22. `CLAUDE.md` hard rules «Voz», «Clientes», «+20 años». Decisions taken by Federico on 2026-10-29: the app is the source of truth for editorial lines (one import from the two Claude Docs, then edited in the app with versions); the client review in this block uses no AI (Claude's review, including indirect references, arrives in block 4 together with the spend cap D11).

---

## Design (what D builds, and what it leaves out)

**Editorial line.** One row per version in `lineas_editoriales` (`marca_id`, `version` starting at 1, six text sections, `pilares` jsonb snapshot, `creada_por`, `creada_en`). Versions are never updated: a trigger refuses it. Saving sends the version the editor started from (`p_base`). If another save landed in between, the RPC answers `linea_cambio`, so a second tab cannot overwrite silently. Pillar rows in `pilares` keep their ids across versions so pieces keep pointing at them. A pillar removed from the line becomes `activo = false`: old pieces still show its name, and new pieces cannot pick it.

**Pillars (D20).** Seeded by the import from the docs:

| Brand | Pillar | Per week |
|---|---|---|
| WAV | Detrás del trabajo | 1 |
| WAV | Escuchar antes de decidir | 1 |
| WAV | Oficio | 0.5 |
| WAV | Investigación y experiencia | 0.5 |
| Federico Elgueta | Coherencia | 1 |
| Federico Elgueta | Construir con IA | 1 |
| Federico Elgueta | Detrás del escenario | 1 |

Both brands add up to 3 per week, the D19 rhythm. In phase 1 each brand has one account, so an account's pillars are its brand's pillars.

**Balance (D20).** For each account with `ritmo_semanal > 0`, and for each active pillar of its brand:
- **salieron:** published pieces in the last 4 weeks.
- **meta:** `porSemana × 4`.
- **planeadas:** unsigned or signed pieces ahead in the next 14 days.
- **diasSinSalir:** days since the last published piece of that pillar, read over 8 weeks.

A pillar raises an **alert** when all three hold:
1. It is at least 14 days old, so a fresh import does not flood the digest.
2. It has nothing published in the last 14 days.
3. It has nothing planned in the next 7 days, so a pillar that comes every two weeks and is already on its way stays quiet.

The calendar shows every row and the count of pieces without a pillar. The digest only carries the alerts.

**Cases and exceptions (D13).** `casos` mirrors `data/casos/casos.json` (105 cases, 64 clients, about 40 KB gzipped, so it is never bundled into the Worker, which has 48 KiB of margin). `pnpm cargar:casos` upserts by slug and seeds a `no_nombrar` exception for every case whose `exception` is `"evento privado"`. «Estudios confidenciales de WR3» are not in the file (all 105 cases are track record), so Federico marks them by hand. An exception names a client and optionally one of its cases, a type (`no_nombrar`, `sin_fotos`, `sin_logo`, `confidencial`), aliases and an optional end date (inclusive, Chile calendar). Removing one sets `quitada_en`, and the row stays.

**Deterministic review.** `prepararRevision(excepciones, hoy)` compiles one regular expression for the active `no_nombrar` and `confidencial` exceptions and returns a reviewer with two checks:
- `clientes(texto)`, used by the publisher.
- `revisar(texto, voz)`, used at gate 1. It adds @mentions outside WAV and Federico, prices and budgets, and «+20 años» or «+200 proyectos» in a «nosotros» voice that does not name Federico.

Matching ignores case and accents and respects word edges. The reported fragment is cut from the original text. Gate 1 shows the verdict and blocks nothing; the person decides. The publisher re-runs only `clientes` on title and text before anything else, and a hit returns the piece to the gate with `devolver_pieza` and an immediate notice. If the exceptions cannot be read, the piece is not sent this run and the next run retries.

**Not in D:**
- **Claude's review:** indirect references, the voice verdict and the trajectory check by meaning (block 4, with the spend cap).
- **Text inside a carousel's PDF:** only its title and post text are checked.
- **Image rights:** «sin fotos» and «sin logo» are stored and shown, and are checked when designs exist (block 4).
- **«Cada cambio se guarda como ejemplo»:** learning from edits comes with Claude writing, in block 4.
- **Per-account pillars:** pillars stay per brand while each brand has one account.
- **Removing a case that left the JSON:** the load only upserts.

## Gates: stop and ask Federico

Every gate is in Task 19:
1. **Production migration:** `supabase db push` of `20261031120000_voz_y_clientes.sql`, after a dry run, before the merge.
2. **Merge of the PR:** it deploys the Worker; there are no new Trigger tasks, and the existing ones redeploy with the new code.
3. **Production data:** `pnpm cargar:casos:prod`, then `pnpm cargar:linea:prod` for WAV and for Federico, each after his yes. The markdown for each brand is exported from its Claude Doc into the scratchpad and run first with `--probar`.
4. **Worker size:** if `pnpm preview` reports more than 3,072 KiB gzip, stop. The way out is the paid Workers plan (US$5 a month), which is his decision.

---

## File map

```
supabase/migrations/20261031120000_voz_y_clientes.sql   pilares, lineas_editoriales, casos, excepciones, piezas.pilar_id, RPCs
lib/voz/linea.ts                        sections, limits, zod schemas (shared by import, actions and editor)
lib/voz/importar.ts                     leerLinea (pure): markdown export of a Claude Doc → sections + pillars
lib/voz/balance.ts                      balanceDePilares, lineaDeAlerta (pure, D20)
lib/voz/lectura.ts                      lineaDeMarca, marcasConLinea, pilaresActivos, balancePorCuenta
lib/voz/acciones.ts                     guardarLinea
lib/clientes/revision.ts                prepararRevision, mensajeDe (pure)
lib/clientes/casos.ts                   leerCasos, excepcionesIniciales (pure)
lib/clientes/lectura.ts                 leerExcepciones, clientes
lib/clientes/acciones.ts                marcarExcepcion, quitarExcepcion
lib/piezas/acciones.ts                  + ponerPilar
lib/piezas/lectura.ts                   detalle knows its pillar, the brand's voice and the brand's pillars
lib/publicacion/publicar.ts             + excepcionesVigentes port, checked first in publicarPieza
lib/publicacion/repositorio.ts          + excepcionesVigentes
lib/avisos/resumen.ts                   + pilares lines
lib/avisos/enviar-resumen.ts            + balance alerts per brand
lib/sesion/rutas.ts                     + RUTA_DE_VOZ, rutaDeVoz, RUTA_DE_CLIENTES
scripts/cargar-casos.ts, scripts/cargar-linea.ts, scripts/cargar-wr3.ts (pillar 2 of WAV)
app/(app)/voz/{page,[marcaId]/page,[marcaId]/editor,[marcaId]/acciones}.tsx|ts
app/(app)/clientes/{page,excepciones,acciones}.tsx|ts
app/(app)/ajustes/page.tsx              links to Voz y línea editorial and Clientes
app/(app)/piezas/nueva/{page,formulario,acciones}.tsx|ts   pillar select
app/(app)/piezas/[id]/{page,pilar,veredicto,acciones}.tsx|ts
app/(app)/calendario/{page,pilares}.tsx
tests/integration/{voz,clientes,pilares-de-piezas}.test.ts, tests/integration/limpieza.ts
tests/unit/{importar-linea,revision-de-clientes,balance-de-pilares,casos,editor-de-linea,excepciones,veredicto,pilares-del-calendario}.test.ts(x)
tests/e2e/voz-y-clientes.spec.ts
```

---

# Part 1 — Data and rules

## Task 1: Pillars and editorial line versions

**Files:** Create `supabase/migrations/20261031120000_voz_y_clientes.sql`, `tests/integration/voz.test.ts`.

- [ ] **Step 1: Failing test** `tests/integration/voz.test.ts`

```ts
import { describe, expect, test } from "vitest"
import { admin, marcaConDueno, personaConSesion } from "./entorno"

const SECCIONES = {
  deQueHablamos: "Investigación y experiencia de marcas.",
  tono: "Nosotros, directo.",
  formatos: "Carruseles PDF.",
  temasVetados: "Política partidista.",
  temasAVigilar: "Focus groups.",
  ejemplos: "Un ejemplo aprobado.",
}

function pilar(nombre: string, porSemana = 1, id?: string) {
  return { ...(id ? { id } : {}), nombre, deQueHabla: `Sobre ${nombre}`, material: "Casos", porSemana }
}

async function dueno(prefijo = "voz") {
  const persona = await personaConSesion(prefijo)
  return { ...persona, marca: await marcaConDueno(persona.userId, "nosotros") }
}

async function pilaresDe(marca: string) {
  const { data } = await admin().from("pilares").select("id, nombre, por_semana, activo, orden").eq("marca_id", marca).order("orden")
  return data ?? []
}

describe("guardar_linea_editorial", () => {
  test("the first save is version 1 and creates the pillar rows with a snapshot", async () => {
    const { db, marca } = await dueno()
    const { data, error } = await db.rpc("guardar_linea_editorial", {
      p_marca: marca,
      p_base: 0,
      p_secciones: SECCIONES,
      p_pilares: [pilar("Detrás del trabajo"), pilar("Oficio", 0.5)],
    })
    expect(error).toBeNull()
    expect(data).toBe(1)
    const filas = await pilaresDe(marca)
    expect(filas.map((f) => [f.nombre, Number(f.por_semana), f.activo, f.orden])).toEqual([
      ["Detrás del trabajo", 1, true, 1],
      ["Oficio", 0.5, true, 2],
    ])
    const { data: linea } = await admin().from("lineas_editoriales").select("*").eq("marca_id", marca).single()
    expect(linea?.tono).toBe("Nosotros, directo.")
    expect(linea?.pilares).toEqual(
      filas.map((f) => expect.objectContaining({ id: f.id, nombre: f.nombre, porSemana: Number(f.por_semana) })),
    )
  })

  test("a second save keeps pillar ids, adds new ones and retires the missing ones", async () => {
    const { db, marca } = await dueno()
    await db.rpc("guardar_linea_editorial", {
      p_marca: marca,
      p_base: 0,
      p_secciones: SECCIONES,
      p_pilares: [pilar("Uno"), pilar("Dos")],
    })
    const [uno] = await pilaresDe(marca)
    const { data } = await db.rpc("guardar_linea_editorial", {
      p_marca: marca,
      p_base: 1,
      p_secciones: { ...SECCIONES, tono: "Más directo." },
      p_pilares: [pilar("Uno renombrado", 2, uno?.id), pilar("Tres")],
    })
    expect(data).toBe(2)
    const filas = await pilaresDe(marca)
    expect(filas.find((f) => f.id === uno?.id)).toMatchObject({ nombre: "Uno renombrado", activo: true })
    expect(filas.find((f) => f.nombre === "Dos")?.activo).toBe(false)
    expect(filas.find((f) => f.nombre === "Tres")?.activo).toBe(true)
  })

  test("refuses a stale base so a second tab cannot overwrite silently", async () => {
    const { db, marca } = await dueno()
    const guardar = () =>
      db.rpc("guardar_linea_editorial", { p_marca: marca, p_base: 0, p_secciones: SECCIONES, p_pilares: [pilar("Uno")] })
    expect((await guardar()).error).toBeNull()
    expect((await guardar()).error?.message).toBe("linea_cambio")
  })

  test("refuses repeated pillar names, no pillars, and a pillar of another brand", async () => {
    const { db, marca } = await dueno()
    const otra = await dueno("voz-otra")
    await otra.db.rpc("guardar_linea_editorial", {
      p_marca: otra.marca,
      p_base: 0,
      p_secciones: SECCIONES,
      p_pilares: [pilar("Ajeno")],
    })
    const [ajeno] = await pilaresDe(otra.marca)
    const intentar = (pilares: unknown[]) =>
      db.rpc("guardar_linea_editorial", { p_marca: marca, p_base: 0, p_secciones: SECCIONES, p_pilares: pilares })
    expect((await intentar([pilar("Uno"), pilar("uno")])).error?.message).toBe("pilares_repetidos")
    expect((await intentar([])).error?.message).toBe("pilares_invalidos")
    expect((await intentar([pilar("Mío", 1, ajeno?.id)])).error?.message).toBe("pilar_de_otra_marca")
  })

  test("only an owner of the brand saves, members read, and versions never change", async () => {
    const { db, marca } = await dueno()
    const extrano = await personaConSesion("voz-extrano")
    const { error } = await extrano.db.rpc("guardar_linea_editorial", {
      p_marca: marca,
      p_base: 0,
      p_secciones: SECCIONES,
      p_pilares: [pilar("Uno")],
    })
    expect(error?.code).toBe("42501")
    await db.rpc("guardar_linea_editorial", { p_marca: marca, p_base: 0, p_secciones: SECCIONES, p_pilares: [pilar("Uno")] })
    expect((await extrano.db.from("lineas_editoriales").select("id").eq("marca_id", marca)).data).toEqual([])
    expect((await db.from("lineas_editoriales").select("version").eq("marca_id", marca)).data).toEqual([{ version: 1 }])
    const cambio = await admin().from("lineas_editoriales").update({ tono: "otro" }).eq("marca_id", marca)
    expect(cambio.error?.message).toBe("linea_inmutable")
  })
})
```

- [ ] **Step 2: Fail** — `pnpm db:reset && pnpm test:db tests/integration/voz.test.ts` (no `guardar_linea_editorial`).
- [ ] **Step 3: Migration** `supabase/migrations/20261031120000_voz_y_clientes.sql` (first section)

```sql
-- D: editorial lines with versions, pillars (D20), the corrected cases and client exceptions (D13).
-- Plano: «Voz y línea editorial», «líneas editoriales», «Clientes», «excepciones de clientes», «Confidencialidad de
-- clientes». The C1 and C2 migrations are in production: anything they defined is changed here with alter.

-- Pillars keep their id across versions so pieces keep pointing at them; a pillar dropped from the line is retired.
create table public.pilares (
  id uuid primary key default gen_random_uuid(),
  marca_id uuid not null references public.marcas (id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 1 and 60),
  de_que_habla text not null default '' check (length(de_que_habla) <= 400),
  material text not null default '' check (length(material) <= 400),
  -- Pieces per week the brand's account aims for: 0.5 is one every two weeks (D20).
  por_semana numeric(3, 1) not null check (por_semana > 0 and por_semana <= 7),
  orden smallint not null check (orden between 1 and 8),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
create index pilares_marca on public.pilares (marca_id) where activo;

-- One row per version, never updated: a piece written later can say which version it followed.
create table public.lineas_editoriales (
  id uuid primary key default gen_random_uuid(),
  marca_id uuid not null references public.marcas (id) on delete cascade,
  version integer not null check (version >= 1),
  de_que_hablamos text not null default '' check (length(de_que_hablamos) <= 6000),
  tono text not null default '' check (length(tono) <= 6000),
  formatos text not null default '' check (length(formatos) <= 6000),
  temas_vetados text not null default '' check (length(temas_vetados) <= 6000),
  temas_a_vigilar text not null default '' check (length(temas_a_vigilar) <= 6000),
  ejemplos text not null default '' check (length(ejemplos) <= 20000),
  -- The pillars as they were when this version was saved, with their row ids.
  pilares jsonb not null check (jsonb_typeof(pilares) = 'array'),
  creada_por uuid not null references auth.users (id),
  creada_en timestamptz not null default now(),
  unique (marca_id, version)
);

create function public.lineas_inmutables() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '23514', message = 'linea_inmutable';
end $$;
create trigger lineas_editoriales_inmutables before update on public.lineas_editoriales
  for each row execute function public.lineas_inmutables();

-- Service role only (scripts/cargar-linea.ts passes the author); owners go through guardar_linea_editorial.
create function public.guardar_linea(p_marca uuid, p_base integer, p_secciones jsonb, p_pilares jsonb, p_autor uuid)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_actual integer;
  v_pilar jsonb;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_orden smallint := 0;
  v_foto jsonb := '[]'::jsonb;
begin
  -- Two saves of one brand queue here, so the base check below sees the other one's version.
  perform 1 from public.marcas where id = p_marca for update;
  if not found then
    raise exception using errcode = '22023', message = 'marca_no_existe';
  end if;
  select coalesce(max(version), 0) into v_actual from public.lineas_editoriales where marca_id = p_marca;
  if v_actual <> p_base then
    raise exception using errcode = '40001', message = 'linea_cambio';
  end if;
  if jsonb_typeof(p_pilares) <> 'array' or jsonb_array_length(p_pilares) not between 1 and 8 then
    raise exception using errcode = '22023', message = 'pilares_invalidos';
  end if;
  if (select count(distinct lower(btrim(e->>'nombre'))) from jsonb_array_elements(p_pilares) e)
     <> jsonb_array_length(p_pilares) then
    raise exception using errcode = '22023', message = 'pilares_repetidos';
  end if;

  for v_pilar in select value from jsonb_array_elements(p_pilares) loop
    v_orden := v_orden + 1;
    v_id := nullif(v_pilar->>'id', '')::uuid;
    if v_id is null then
      insert into public.pilares (marca_id, nombre, de_que_habla, material, por_semana, orden)
      values (p_marca, btrim(v_pilar->>'nombre'), coalesce(v_pilar->>'deQueHabla', ''), coalesce(v_pilar->>'material', ''),
              (v_pilar->>'porSemana')::numeric, v_orden)
      returning id into v_id;
    else
      update public.pilares
         set nombre = btrim(v_pilar->>'nombre'), de_que_habla = coalesce(v_pilar->>'deQueHabla', ''),
             material = coalesce(v_pilar->>'material', ''), por_semana = (v_pilar->>'porSemana')::numeric,
             orden = v_orden, activo = true
       where id = v_id and marca_id = p_marca;
      if not found then
        raise exception using errcode = '22023', message = 'pilar_de_otra_marca';
      end if;
    end if;
    v_ids := v_ids || v_id;
    v_foto := v_foto || jsonb_build_object(
      'id', v_id, 'nombre', btrim(v_pilar->>'nombre'), 'deQueHabla', coalesce(v_pilar->>'deQueHabla', ''),
      'material', coalesce(v_pilar->>'material', ''), 'porSemana', (v_pilar->>'porSemana')::numeric
    );
  end loop;
  update public.pilares set activo = false where marca_id = p_marca and activo and not (id = any (v_ids));

  insert into public.lineas_editoriales
    (marca_id, version, de_que_hablamos, tono, formatos, temas_vetados, temas_a_vigilar, ejemplos, pilares, creada_por)
  values (p_marca, v_actual + 1, coalesce(p_secciones->>'deQueHablamos', ''), coalesce(p_secciones->>'tono', ''),
          coalesce(p_secciones->>'formatos', ''), coalesce(p_secciones->>'temasVetados', ''),
          coalesce(p_secciones->>'temasAVigilar', ''), coalesce(p_secciones->>'ejemplos', ''), v_foto, p_autor);
  return v_actual + 1;
end $$;

create function public.guardar_linea_editorial(p_marca uuid, p_base integer, p_secciones jsonb, p_pilares jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_dueno(p_marca) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_edita_la_linea';
  end if;
  return public.guardar_linea(p_marca, p_base, p_secciones, p_pilares, auth.uid());
end $$;

alter table public.pilares enable row level security;
alter table public.lineas_editoriales enable row level security;
create policy "miembros ven los pilares" on public.pilares for select to authenticated using (public.es_miembro(marca_id));
create policy "miembros ven las lineas" on public.lineas_editoriales for select to authenticated
  using (public.es_miembro(marca_id));
revoke all on public.pilares, public.lineas_editoriales from anon, authenticated;
grant select on public.pilares, public.lineas_editoriales to authenticated;

revoke execute on function public.guardar_linea(uuid, integer, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.guardar_linea(uuid, integer, jsonb, jsonb, uuid) to service_role;
revoke execute on function public.guardar_linea_editorial(uuid, integer, jsonb, jsonb) from public, anon;
grant execute on function public.guardar_linea_editorial(uuid, integer, jsonb, jsonb) to authenticated;
revoke execute on function public.lineas_inmutables() from public, anon, authenticated;
```

- [ ] **Step 4: Pass** — `pnpm db:reset && pnpm db:types && pnpm test:db tests/integration/voz.test.ts && pnpm type`.
- [ ] **Step 5: Commit** — `git commit -m "feat: add versioned editorial lines with stable pillars per brand"`

## Task 2: A pillar on each piece

**Files:** Modify the migration, create `tests/integration/pilares-de-piezas.test.ts`.

- [ ] **Step 1: Failing test** `tests/integration/pilares-de-piezas.test.ts`

```ts
import { describe, expect, test } from "vitest"
import { admin, cuentaDe, enDias, marcaConDueno, personaConSesion, piezaDe, versionVigente } from "./entorno"

const SECCIONES = { deQueHablamos: "", tono: "", formatos: "", temasVetados: "", temasAVigilar: "", ejemplos: "" }

async function conPilares(prefijo = "pilar") {
  const persona = await personaConSesion(prefijo)
  const marca = await marcaConDueno(persona.userId)
  await persona.db.rpc("guardar_linea_editorial", {
    p_marca: marca,
    p_base: 0,
    p_secciones: SECCIONES,
    p_pilares: [
      { nombre: "Uno", deQueHabla: "", material: "", porSemana: 1 },
      { nombre: "Dos", deQueHabla: "", material: "", porSemana: 1 },
    ],
  })
  const { data } = await admin().from("pilares").select("id, nombre").eq("marca_id", marca).order("orden")
  return { ...persona, marca, cuenta: await cuentaDe(marca), pilares: data ?? [] }
}

const pilarDe = async (pieza: string) =>
  (await admin().from("piezas").select("pilar_id").eq("id", pieza).single()).data?.pilar_id

describe("poner_pilar", () => {
  test("an owner gives an unsigned piece a pillar of its brand and can change or clear it", async () => {
    const { db, cuenta, pilares } = await conPilares()
    const pieza = await piezaDe(db, cuenta)
    expect((await db.rpc("poner_pilar", { p_pieza: pieza, p_pilar: pilares[0]?.id ?? null })).error).toBeNull()
    expect(await pilarDe(pieza)).toBe(pilares[0]?.id)
    await db.rpc("poner_pilar", { p_pieza: pieza, p_pilar: null })
    expect(await pilarDe(pieza)).toBeNull()
  })

  test("a signed piece keeps its signature when its pillar changes", async () => {
    const { db, cuenta, pilares } = await conPilares()
    const pieza = await piezaDe(db, cuenta)
    const { huella } = await versionVigente(pieza)
    await db.rpc("firmar_pieza", { p_pieza: pieza, p_huella: huella, p_programada_para: enDias(3) })
    expect((await db.rpc("poner_pilar", { p_pieza: pieza, p_pilar: pilares[1]?.id ?? null })).error).toBeNull()
    const { data } = await admin().from("piezas").select("estado").eq("id", pieza).single()
    expect(data?.estado).toBe("programada")
  })

  test("refuses a pillar of another brand, also for the service role", async () => {
    const uno = await conPilares()
    const otra = await conPilares("pilar-otra")
    const pieza = await piezaDe(uno.db, uno.cuenta)
    const ajeno = otra.pilares[0]?.id ?? null
    expect((await uno.db.rpc("poner_pilar", { p_pieza: pieza, p_pilar: ajeno })).error?.message).toBe(
      "pilar_de_otra_marca",
    )
    const directo = await admin().from("piezas").update({ pilar_id: ajeno }).eq("id", pieza)
    expect(directo.error?.message).toBe("pilar_de_otra_marca")
  })

  test("refuses a retired pillar, a closed piece and a stranger", async () => {
    const { db, marca, cuenta, pilares } = await conPilares()
    const pieza = await piezaDe(db, cuenta)
    await db.rpc("guardar_linea_editorial", {
      p_marca: marca,
      p_base: 1,
      p_secciones: SECCIONES,
      p_pilares: [{ id: pilares[0]?.id, nombre: "Uno", deQueHabla: "", material: "", porSemana: 1 }],
    })
    expect((await db.rpc("poner_pilar", { p_pieza: pieza, p_pilar: pilares[1]?.id ?? null })).error?.message).toBe(
      "pilar_inactivo",
    )
    const extrano = await personaConSesion("pilar-extrano")
    expect((await extrano.db.rpc("poner_pilar", { p_pieza: pieza, p_pilar: null })).error?.code).toBe("42501")
    await db.rpc("descartar_pieza", { p_pieza: pieza, p_motivo: "No va" })
    expect((await db.rpc("poner_pilar", { p_pieza: pieza, p_pilar: pilares[0]?.id ?? null })).error?.message).toBe(
      "pieza_ya_cerrada",
    )
  })
})
```

- [ ] **Step 2: Fail** — `pnpm db:reset && pnpm test:db tests/integration/pilares-de-piezas.test.ts`.
- [ ] **Step 3: Migration** (append)

```sql
-- D20: which pillar a piece serves. Changing it does not touch the huella: the pillar is not published.
alter table public.piezas add column pilar_id uuid references public.pilares (id);
create index piezas_pilar on public.piezas (pilar_id) where pilar_id is not null;

-- Also guards the service role (scripts/cargar-wr3.ts): a pillar belongs to the brand of the piece's account.
create function public.pilar_de_su_marca() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.pilar_id is not null and not exists (
    select 1 from public.pilares pi join public.cuentas c on c.marca_id = pi.marca_id
     where pi.id = new.pilar_id and c.id = new.cuenta_id
  ) then
    raise exception using errcode = '23514', message = 'pilar_de_otra_marca';
  end if;
  return new;
end $$;
create trigger piezas_pilar_de_su_marca before insert or update of pilar_id, cuenta_id on public.piezas
  for each row execute function public.pilar_de_su_marca();

create function public.poner_pilar(p_pieza uuid, p_pilar uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_dueno(public.marca_de_pieza(p_pieza)) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_cambia_piezas';
  end if;
  if p_pilar is not null and not exists (select 1 from public.pilares where id = p_pilar and activo) then
    raise exception using errcode = '22023', message = 'pilar_inactivo';
  end if;
  update public.piezas set pilar_id = p_pilar
   where id = p_pieza and estado not in ('publicando', 'publicada', 'descartada');
  if not found then
    raise exception using errcode = '22023', message = 'pieza_ya_cerrada';
  end if;
end $$;

revoke execute on function public.poner_pilar(uuid, uuid) from public, anon;
grant execute on function public.poner_pilar(uuid, uuid) to authenticated;
revoke execute on function public.pilar_de_su_marca() from public, anon, authenticated;
```

  Order matters inside `poner_pilar`: an inactive pillar of another brand answers `pilar_inactivo` before the trigger runs; the test only sends active ones to the trigger.
- [ ] **Step 4: Pass** — `pnpm db:reset && pnpm db:types && pnpm test:db && pnpm type`.
- [ ] **Step 5: Commit** — `git commit -m "feat: let a piece serve one pillar of its brand"`

## Task 3: Cases and client exceptions

**Files:** Modify the migration and `tests/integration/limpieza.ts`. Create `tests/integration/clientes.test.ts`.

- [ ] **Step 1: Cleanup** in `tests/integration/limpieza.ts`, inside `limpiarDatosDePrueba`, before the users are deleted. Test cases use the `prueba-` slug prefix, and their exceptions go with them through the cascade:

```ts
  // Cases are shared by every brand: test rows are told apart by slug, real ones loaded by pnpm cargar:casos stay.
  const { error: errorDeCasos } = await db.from("casos").delete().like("slug", "prueba-%")
  if (errorDeCasos) throw new Error(`No pude borrar casos de prueba: ${errorDeCasos.message}`)
```

- [ ] **Step 2: Failing test** `tests/integration/clientes.test.ts`

```ts
import { randomUUID } from "node:crypto"
import { describe, expect, test } from "vitest"
import { admin, marcaConDueno, personaConSesion } from "./entorno"

async function caso(cliente: string) {
  const slug = `prueba-${randomUUID().slice(0, 8)}`
  const { error } = await admin()
    .from("casos")
    .insert({ slug, cliente, titulo: "Lanzamiento", anio: 2019, era: "trayectoria" })
  if (error) throw error
  return slug
}

async function duenoDeAlguna(prefijo = "cli") {
  const persona = await personaConSesion(prefijo)
  await marcaConDueno(persona.userId)
  return persona
}

const marcar = (
  db: Awaited<ReturnType<typeof personaConSesion>>["db"],
  cliente: string,
  cambios: { p_caso?: string | null; p_tipo?: string; p_alias?: string[]; p_hasta?: string | null } = {},
) =>
  db.rpc("marcar_excepcion", {
    p_cliente: cliente,
    p_caso: null,
    p_tipo: "no_nombrar",
    p_alias: [],
    p_hasta: null,
    ...cambios,
  })

describe("casos and excepciones", () => {
  test("the team reads cases, people without a brand do not, and nobody but the service role writes them", async () => {
    const cliente = `Cliente ${randomUUID().slice(0, 6)}`
    const slug = await caso(cliente)
    const { db } = await duenoDeAlguna()
    expect((await db.from("casos").select("cliente").eq("slug", slug)).data).toEqual([{ cliente }])
    const sinMarca = await personaConSesion("cli-sin-marca")
    expect((await sinMarca.db.from("casos").select("slug").eq("slug", slug)).data).toEqual([])
    expect((await db.from("casos").insert({ slug: "prueba-x", cliente: "X", titulo: "X", era: "wav" })).error).not.toBeNull()
  })

  test("an owner marks an exception for a client or one of its cases, and removing it keeps the row", async () => {
    const cliente = `Cliente ${randomUUID().slice(0, 6)}`
    const slug = await caso(cliente)
    const { db, userId } = await duenoDeAlguna()
    const { data: id, error } = await marcar(db, cliente, { p_caso: slug, p_alias: ["Alias"], p_hasta: "2027-01-31" })
    expect(error).toBeNull()
    const { data: fila } = await db.from("excepciones").select("*").eq("id", id ?? "").single()
    expect(fila).toMatchObject({ cliente, caso_slug: slug, tipo: "no_nombrar", alias: ["Alias"], puesta_por: userId })
    expect((await db.rpc("quitar_excepcion", { p_id: id ?? "" })).error).toBeNull()
    const { data: quitada } = await db.from("excepciones").select("quitada_en, quitada_por").eq("id", id ?? "").single()
    expect(quitada?.quitada_en).not.toBeNull()
    expect(quitada?.quitada_por).toBe(userId)
    expect((await db.rpc("quitar_excepcion", { p_id: id ?? "" })).error?.message).toBe("excepcion_ya_quitada")
  })

  test("refuses a repeated active exception, a case of another client and a person without a brand", async () => {
    const cliente = `Cliente ${randomUUID().slice(0, 6)}`
    const ajeno = await caso(`Otro ${randomUUID().slice(0, 6)}`)
    const { db } = await duenoDeAlguna()
    await marcar(db, cliente)
    expect((await marcar(db, cliente.toUpperCase())).error?.code).toBe("23505")
    expect((await marcar(db, cliente, { p_tipo: "sin_logo" })).error).toBeNull()
    expect((await marcar(db, cliente, { p_caso: ajeno })).error?.message).toBe("caso_de_otro_cliente")
    const sinMarca = await personaConSesion("cli-nadie")
    expect((await marcar(sinMarca.db, cliente, { p_tipo: "sin_fotos" })).error?.code).toBe("42501")
  })
})
```

- [ ] **Step 3: Fail** — `pnpm db:reset && pnpm test:db tests/integration/clientes.test.ts`.
- [ ] **Step 4: Migration** (append)

```sql
-- The corrected cases (data/casos/casos.json), loaded by scripts/cargar-casos.ts. Shared by every brand: they are
-- Federico's track record, which WAV cites (CLAUDE.md «Clientes»). PostIA keeps only the exceptions on top (D13).
create table public.casos (
  slug text primary key check (slug ~ '^[a-z0-9-]{3,140}$'),
  cliente text not null check (length(btrim(cliente)) between 1 and 120),
  titulo text not null check (length(titulo) between 1 and 200),
  anio smallint check (anio between 1990 and 2100),
  pais text check (length(pais) <= 80),
  ciudad text check (length(ciudad) <= 80),
  industria text check (length(industria) <= 120),
  tipos_de_trabajo text[] not null default '{}',
  capacidades text[] not null default '{}',
  resumen text not null default '' check (length(resumen) <= 4000),
  rol text not null default '' check (length(rol) <= 2000),
  frase_citable text check (length(frase_citable) <= 600),
  -- Before August 2025 a case is Federico's track record, never «WAV hizo».
  era text not null check (era in ('trayectoria', 'wav')),
  cargado_en timestamptz not null default now()
);
create index casos_cliente on public.casos (lower(cliente));

create table public.excepciones (
  id uuid primary key default gen_random_uuid(),
  cliente text not null check (length(btrim(cliente)) between 1 and 120),
  caso_slug text references public.casos (slug) on delete cascade,
  tipo text not null check (tipo in ('no_nombrar', 'sin_fotos', 'sin_logo', 'confidencial')),
  alias text[] not null default '{}' check (cardinality(alias) <= 10),
  -- Inclusive, Chile calendar; null means until someone removes it.
  hasta date,
  puesta_por uuid not null references auth.users (id) on delete cascade,
  puesta_en timestamptz not null default now(),
  quitada_por uuid references auth.users (id) on delete set null,
  quitada_en timestamptz
);
create unique index excepciones_una_vigente on public.excepciones (lower(cliente), coalesce(caso_slug, ''), tipo)
  where quitada_en is null;

-- Phase 1 (D4) has only owners; the client list is shared, so owning any brand is enough to mark exceptions.
create function public.es_dueno_de_alguna() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.miembros where user_id = auth.uid() and rol = 'dueno')
$$;

create function public.marcar_excepcion(p_cliente text, p_caso text, p_tipo text, p_alias text[], p_hasta date)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.es_dueno_de_alguna() then
    raise exception using errcode = '42501', message = 'solo_el_dueno_marca_excepciones';
  end if;
  if p_caso is not null and not exists (
    select 1 from public.casos where slug = p_caso and lower(cliente) = lower(btrim(p_cliente))
  ) then
    raise exception using errcode = '22023', message = 'caso_de_otro_cliente';
  end if;
  insert into public.excepciones (cliente, caso_slug, tipo, alias, hasta, puesta_por)
  values (btrim(p_cliente), p_caso, p_tipo, coalesce(p_alias, '{}'), p_hasta, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create function public.quitar_excepcion(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_dueno_de_alguna() then
    raise exception using errcode = '42501', message = 'solo_el_dueno_marca_excepciones';
  end if;
  update public.excepciones set quitada_en = now(), quitada_por = auth.uid() where id = p_id and quitada_en is null;
  if not found then
    raise exception using errcode = '22023', message = 'excepcion_ya_quitada';
  end if;
end $$;

alter table public.casos enable row level security;
alter table public.excepciones enable row level security;
create policy "el equipo ve los casos" on public.casos for select to authenticated using (public.tiene_acceso());
create policy "el equipo ve las excepciones" on public.excepciones for select to authenticated
  using (public.tiene_acceso());
revoke all on public.casos, public.excepciones from anon, authenticated;
grant select on public.casos, public.excepciones to authenticated;

revoke execute on function public.marcar_excepcion(text, text, text, text[], date), public.quitar_excepcion(uuid),
  public.es_dueno_de_alguna() from public, anon;
grant execute on function public.marcar_excepcion(text, text, text, text[], date), public.quitar_excepcion(uuid),
  public.es_dueno_de_alguna() to authenticated;
```

- [ ] **Step 5: Pass** — `pnpm db:reset && pnpm db:types && pnpm test:db && pnpm type`.
- [ ] **Step 6: Commit** — `git commit -m "feat: add the corrected cases and client exceptions"`

## Task 4: Line sections and the import parser

**Files:** Create `lib/voz/linea.ts`, `lib/voz/importar.ts`, `tests/unit/importar-linea.test.ts`.

- [ ] **Step 1: Shared shapes** `lib/voz/linea.ts`

```ts
import { z } from "zod"

export const SECCIONES = ["deQueHablamos", "tono", "formatos", "temasVetados", "temasAVigilar", "ejemplos"] as const
export type Seccion = (typeof SECCIONES)[number]
export type SeccionesDeLinea = Record<Seccion, string>

export const NOMBRE_DE_SECCION: Record<Seccion, string> = {
  deQueHablamos: "De qué hablamos",
  tono: "Tono y voz",
  formatos: "Formatos",
  temasVetados: "Temas vetados",
  temasAVigilar: "Temas a vigilar",
  ejemplos: "Ejemplos aprobados",
}

// Same limits as the checks in 20261031120000_voz_y_clientes.sql.
export const LARGO_DE_SECCION: Record<Seccion, number> = {
  deQueHablamos: 6000,
  tono: 6000,
  formatos: 6000,
  temasVetados: 6000,
  temasAVigilar: 6000,
  ejemplos: 20000,
}

export const MAXIMO_DE_PILARES = 8
export const POR_SEMANA = [0.5, 1, 1.5, 2, 3] as const

export interface PilarDeLinea {
  id?: string
  nombre: string
  deQueHabla: string
  material: string
  porSemana: number
}

const Pilar = z.object({
  id: z.uuid().optional(),
  nombre: z.string().trim().min(1).max(60),
  deQueHabla: z.string().max(400),
  material: z.string().max(400),
  porSemana: z.number().positive().max(7).multipleOf(0.5),
})

export const Secciones = z.object(
  Object.fromEntries(SECCIONES.map((s) => [s, z.string().max(LARGO_DE_SECCION[s])])) as Record<
    Seccion,
    z.ZodString
  >,
)

export const Pilares = z
  .array(Pilar)
  .min(1)
  .max(MAXIMO_DE_PILARES)
  .refine((ps) => new Set(ps.map((p) => p.nombre.trim().toLowerCase())).size === ps.length, {
    message: "pilares_repetidos",
  })

export const LineaParaGuardar = z.object({ marcaId: z.uuid(), base: z.number().int().min(0), secciones: Secciones, pilares: Pilares })
export type LineaParaGuardar = z.infer<typeof LineaParaGuardar>
```

- [ ] **Step 2: Failing test** `tests/unit/importar-linea.test.ts`. The fixture copies the export's shape (a `#` title, a byline, `##` sections and the pillar table); its contents are invented.

```ts
import { describe, expect, test } from "vitest"
import { Falla } from "@/lib/dominio/falla"
import { leerLinea, leerPorSemana } from "@/lib/voz/importar"

const LINEA = `# Línea editorial de Marca

2026-10-28 · Persona

## De qué hablamos

Hablamos de marcas.

- Una idea
- Otra idea

## Pilares y frecuencia

Tres pilares.

| Pilar | De qué habla | De dónde sale el material | Por semana |
| --- | --- | --- | --- |
| 1. Detrás del trabajo | Cómo se pensó | Casos de la [trayectoria](https://x.cl) | 1 |
| 2. Oficio | Montaje | Aprendizajes | 1 cada dos semanas |

## Tono y voz

Nosotros.

## Formatos

Carruseles.

## Temas vetados

Política.

## Ejemplos aprobados

### Pilar 1 · Un caso

Texto del ejemplo.

## Decisiones

No entra.

## Fuentes

Tampoco.
`

describe("leerLinea", () => {
  test("maps each known section and keeps sub-headings inside examples", () => {
    const { secciones } = leerLinea(LINEA)
    expect(secciones.deQueHablamos).toBe("Hablamos de marcas.\n\n- Una idea\n- Otra idea")
    expect(secciones.tono).toBe("Nosotros.")
    expect(secciones.formatos).toBe("Carruseles.")
    expect(secciones.temasVetados).toBe("Política.")
    expect(secciones.ejemplos).toBe("### Pilar 1 · Un caso\n\nTexto del ejemplo.")
    expect(secciones.temasAVigilar).toBe("")
  })

  test("reads the pillar table with names without numbers and weekly frequencies", () => {
    expect(leerLinea(LINEA).pilares).toEqual([
      { nombre: "Detrás del trabajo", deQueHabla: "Cómo se pensó", material: "Casos de la [trayectoria](https://x.cl)", porSemana: 1 },
      { nombre: "Oficio", deQueHabla: "Montaje", material: "Aprendizajes", porSemana: 0.5 },
    ])
  })

  test("lists the sections it left out so the person sees what was not imported", () => {
    expect(leerLinea(LINEA).ignoradas).toEqual(["Decisiones", "Fuentes"])
  })

  test("throws a Falla when there is no pillar table", () => {
    expect(() => leerLinea("## Tono y voz\n\nNosotros.\n")).toThrow(Falla)
  })

  test("throws a Falla naming the section that passes its limit", () => {
    expect(() => leerLinea(`${LINEA}\n## Formatos\n\n${"a".repeat(6001)}\n`)).toThrow(/Formatos/)
  })
})

describe("leerPorSemana", () => {
  test("reads whole numbers, decimals with comma or dot, and «cada dos semanas»", () => {
    expect(leerPorSemana("1")).toBe(1)
    expect(leerPorSemana("2")).toBe(2)
    expect(leerPorSemana("0,5")).toBe(0.5)
    expect(leerPorSemana("1 cada dos semanas")).toBe(0.5)
    expect(leerPorSemana("1 cada 2 semanas")).toBe(0.5)
  })

  test("throws a Falla on anything else", () => {
    expect(() => leerPorSemana("a veces")).toThrow(Falla)
  })
})
```

  A repeated `## Formatos` replaces the earlier one; that is how the last test makes the section too long.
- [ ] **Step 3: Fail** — `pnpm test:run tests/unit/importar-linea.test.ts`.
- [ ] **Step 4: Implement** `lib/voz/importar.ts`

```ts
import { Falla } from "@/lib/dominio/falla"
import { LARGO_DE_SECCION, NOMBRE_DE_SECCION, type PilarDeLinea, type Seccion, type SeccionesDeLinea } from "./linea"

export interface LineaImportada {
  secciones: SeccionesDeLinea
  pilares: PilarDeLinea[]
  ignoradas: string[]
}

// Headings of the Claude Docs export, matched by their start without accents or case.
const SECCION_POR_TITULO: [string, Seccion | "pilares"][] = [
  ["de que habla", "deQueHablamos"],
  ["pilares", "pilares"],
  ["tono", "tono"],
  ["formatos", "formatos"],
  ["temas vetados", "temasVetados"],
  ["temas a vigilar", "temasAVigilar"],
  ["ejemplos", "ejemplos"],
]

function sinAcentos(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim()
}

export function leerPorSemana(celda: string): number {
  const leida = /^(\d+(?:[.,]\d+)?)\s*(?:cada\s+(?:dos|2)\s+semanas)?$/i.exec(celda.trim())
  if (!leida?.[1]) throw new Falla(`No entiendo la frecuencia «${celda}»: usa un número por semana.`)
  const n = Number(leida[1].replace(",", "."))
  return /cada/i.test(celda) ? n / 2 : n
}

function celdas(fila: string): string[] {
  return fila.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim())
}

function leerPilares(cuerpo: string): PilarDeLinea[] {
  const filas = cuerpo.split("\n").filter((l) => l.trim().startsWith("|"))
  // Header and separator first; a table without rows is the same as no table.
  const datos = filas.slice(2)
  if (datos.length === 0) throw new Falla("La línea no tiene tabla de pilares.")
  return datos.map((fila) => {
    const [pilar = "", deQueHabla = "", material = "", porSemana = ""] = celdas(fila)
    return { nombre: pilar.replace(/^\d+\.\s*/, ""), deQueHabla, material, porSemana: leerPorSemana(porSemana) }
  })
}

/** The markdown export of a brand's Claude Doc → the sections and pillars of its first version in the app. */
export function leerLinea(markdown: string): LineaImportada {
  const secciones: SeccionesDeLinea = {
    deQueHablamos: "",
    tono: "",
    formatos: "",
    temasVetados: "",
    temasAVigilar: "",
    ejemplos: "",
  }
  let pilares: PilarDeLinea[] | null = null
  const ignoradas: string[] = []
  // Only level-2 headings split sections; the title, byline and ### sub-headings stay where they are.
  const partes = markdown.replace(/\r\n/g, "\n").split(/^## (.+)$/m)
  for (let i = 1; i < partes.length; i += 2) {
    const titulo = (partes[i] ?? "").trim()
    const cuerpo = (partes[i + 1] ?? "").trim()
    const destino = SECCION_POR_TITULO.find(([inicio]) => sinAcentos(titulo).startsWith(inicio))?.[1]
    if (!destino) ignoradas.push(titulo)
    else if (destino === "pilares") pilares = leerPilares(cuerpo)
    else secciones[destino] = cuerpo
  }
  if (!pilares) throw new Falla("La línea no tiene tabla de pilares.")
  for (const [seccion, texto] of Object.entries(secciones) as [Seccion, string][]) {
    if ([...texto].length > LARGO_DE_SECCION[seccion]) {
      throw new Falla(`«${NOMBRE_DE_SECCION[seccion]}» pasa los ${LARGO_DE_SECCION[seccion]} caracteres.`)
    }
  }
  return { secciones, pilares, ignoradas }
}
```

- [ ] **Step 5: Pass** — `pnpm test:run tests/unit/importar-linea.test.ts && pnpm type`.
- [ ] **Step 6: Commit** — `git commit -m "feat: read a brand's editorial line from its markdown export"`

## Task 5: The deterministic review

**Files:** Create `lib/clientes/revision.ts`, `tests/unit/revision-de-clientes.test.ts`.

- [ ] **Step 1: Failing test** `tests/unit/revision-de-clientes.test.ts`

```ts
import { describe, expect, test } from "vitest"
import { type Excepcion, mensajeDe, prepararRevision } from "@/lib/clientes/revision"

const HOY = "2026-11-02"

function excepcion(cambios: Partial<Excepcion> = {}): Excepcion {
  return { cliente: "Banco Ñuñoa", alias: [], tipo: "no_nombrar", hasta: null, ...cambios }
}

describe("clientes", () => {
  test("finds a client with an exception ignoring case and accents and returns the original words", () => {
    const r = prepararRevision([excepcion()], HOY)
    expect(r.clientes("Trabajamos con banco nunoa en 2019.")).toEqual([
      { tipo: "cliente", cliente: "Banco Ñuñoa", excepcion: "no_nombrar", fragmento: "banco nunoa" },
    ])
  })

  test("respects word edges, so a longer word is not a mention", () => {
    const r = prepararRevision([excepcion({ cliente: "Mistral" })], HOY)
    expect(r.clientes("Mistralidad no es una marca.")).toEqual([])
    expect(r.clientes("El booth de Mistral.")).toHaveLength(1)
  })

  test("finds aliases and reports the client's name", () => {
    const r = prepararRevision([excepcion({ cliente: "Anglo American", alias: ["Anglo"] })], HOY)
    expect(r.clientes("Con Anglo en terreno.")[0]).toMatchObject({ cliente: "Anglo American", fragmento: "Anglo" })
  })

  test("ignores exceptions about images, removed by date, or whose date already passed", () => {
    const r = prepararRevision(
      [
        excepcion({ cliente: "Sin Logo SA", tipo: "sin_logo" }),
        excepcion({ cliente: "Vencida", hasta: "2026-11-01" }),
        excepcion({ cliente: "Vigente", hasta: HOY, tipo: "confidencial" }),
      ],
      HOY,
    )
    expect(r.clientes("Sin Logo SA, Vencida y Vigente.").map((h) => h.tipo === "cliente" && h.cliente)).toEqual([
      "Vigente",
    ])
  })

  test("with no exceptions it finds nothing and compiles nothing", () => {
    expect(prepararRevision([], HOY).clientes("Cualquier texto.")).toEqual([])
  })
})

describe("revisar at gate 1", () => {
  const r = prepararRevision([excepcion()], HOY)

  test("flags @mentions other than WAV and Federico, and not an email", () => {
    const hallazgos = r.revisar("Gracias @copec y @wav y @FedericoElgueta. Escribe a hola@wav.cl", "yo")
    expect(hallazgos).toEqual([{ tipo: "mencion", fragmento: "@copec" }])
  })

  test("flags prices, amounts with currency and budgets", () => {
    const hallazgos = r.revisar("Costó $1.200.000, unos 30 millones de pesos, 500 UF. El presupuesto fue justo.", "yo")
    expect(hallazgos.map((h) => h.fragmento)).toEqual(["$1.200.000", "30 millones de pesos", "500 UF", "presupuesto"])
  })

  test("does not flag counts that are not money", () => {
    expect(r.revisar("3 mil asistentes y 2 millones de visitas.", "yo")).toEqual([])
  })

  test("flags the track record claimed by a «nosotros» voice unless Federico is named", () => {
    expect(r.revisar("Tenemos más de 20 años y +200 proyectos.", "nosotros").map((h) => h.tipo)).toEqual([
      "trayectoria",
      "trayectoria",
    ])
    expect(r.revisar("Federico Elgueta suma más de 20 años.", "nosotros")).toEqual([])
    expect(r.revisar("Llevo más de 20 años.", "yo")).toEqual([])
  })

  test("includes client exceptions too", () => {
    expect(r.revisar("Con Banco Ñuñoa.", "yo")[0]?.tipo).toBe("cliente")
  })
})

describe("mensajeDe", () => {
  test("words each finding for the person who signs", () => {
    expect(mensajeDe({ tipo: "cliente", cliente: "Copec", excepcion: "confidencial", fragmento: "copec" })).toBe(
      "Nombra a Copec, que es confidencial.",
    )
    expect(mensajeDe({ tipo: "cliente", cliente: "Copec", excepcion: "no_nombrar", fragmento: "Copec" })).toBe(
      "Nombra a Copec, que no se nombra.",
    )
    expect(mensajeDe({ tipo: "mencion", fragmento: "@copec" })).toBe("@copec: solo WAV y Federico se mencionan con @.")
    expect(mensajeDe({ tipo: "precio", fragmento: "$100" })).toBe("«$100»: nunca se publican precios ni presupuestos.")
    expect(mensajeDe({ tipo: "trayectoria", fragmento: "más de 20 años" })).toBe(
      "«más de 20 años» es la trayectoria de Federico: atribúyela a él, no a WAV.",
    )
  })
})
```

- [ ] **Step 2: Fail** — `pnpm test:run tests/unit/revision-de-clientes.test.ts`.
- [ ] **Step 3: Implement** `lib/clientes/revision.ts`

```ts
export type TipoDeExcepcion = "no_nombrar" | "sin_fotos" | "sin_logo" | "confidencial"

export interface Excepcion {
  cliente: string
  alias: readonly string[]
  tipo: TipoDeExcepcion
  /** Inclusive, YYYY-MM-DD in Chile; null until someone removes it. */
  hasta: string | null
}

export type Hallazgo =
  | { tipo: "cliente"; cliente: string; excepcion: "no_nombrar" | "confidencial"; fragmento: string }
  | { tipo: "mencion"; fragmento: string }
  | { tipo: "precio"; fragmento: string }
  | { tipo: "trayectoria"; fragmento: string }

export interface Revisor {
  /** Only client exceptions: what the publisher re-checks right before sending. */
  clientes(texto: string): Hallazgo[]
  /** Everything the gate 1 verdict shows. */
  revisar(texto: string, voz: "yo" | "nosotros"): Hallazgo[]
}

// D22: only WAV and Federico mention each other.
const MENCIONES_PERMITIDAS = new Set(["wav", "wearevision", "federico", "federicoelgueta"])
// The handle ends on a letter, digit or underscore, so «@FedericoElgueta.» does not keep the period.
const MENCION = /(?<![\p{L}\p{N}_.])@([\p{L}\p{N}_](?:[\p{L}\p{N}_.-]*[\p{L}\p{N}_])?)/gu
const PRECIOS = [
  // Amounts end on a digit, so «$1.200.000,» does not keep the comma.
  /(?<![\p{L}])(?:us\$|\$|usd|clp|uf)\s?\d(?:[\d.,]*\d)?/gu,
  /\d(?:[\d.,]*\d)?\s?(?:millones de pesos|millones de dolares|dolares|pesos|lucas|usd|clp|uf)(?![\p{L}])/gu,
  /(?<![\p{L}])presupuestos?(?![\p{L}])/gu,
]
const TRAYECTORIA = /(?:\+|mas de)\s?(?:20|veinte) anos|(?:\+|mas de)\s?200 proyectos/gu

/**
 * Lower case without accents, one code point for one code point, so an index in the result is the same index in the
 * original and the fragment shown is the person's own words.
 */
export function normalizar(texto: string): string {
  return [...texto]
    .map((letra) => {
      const base = letra.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
      return base.length === letra.length ? base : letra
    })
    .join("")
}

function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function buscar(texto: string, normal: string, patron: RegExp): { fragmento: string; normal: string }[] {
  return [...normal.matchAll(patron)].map((m) => ({
    fragmento: texto.slice(m.index, m.index + m[0].length),
    normal: m[0],
  }))
}

/** Compiled once per request: the Worker has 10 ms of CPU, and a piece's page reviews one text. */
export function prepararRevision(excepciones: readonly Excepcion[], hoy: string): Revisor {
  const porNombre = new Map<string, Excepcion & { tipo: "no_nombrar" | "confidencial" }>()
  for (const e of excepciones) {
    if (e.tipo !== "no_nombrar" && e.tipo !== "confidencial") continue
    if (e.hasta !== null && e.hasta < hoy) continue
    for (const nombre of [e.cliente, ...e.alias]) {
      const clave = normalizar(nombre.trim())
      if (clave) porNombre.set(clave, { ...e, tipo: e.tipo })
    }
  }
  // Longest first, so «Anglo American» wins over its alias «Anglo».
  const nombres = [...porNombre.keys()].sort((a, b) => b.length - a.length).map(escapar)
  const patron = nombres.length
    ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${nombres.join("|")})(?![\\p{L}\\p{N}])`, "gu")
    : null

  function clientes(texto: string): Hallazgo[] {
    if (!patron) return []
    return buscar(texto, normalizar(texto), patron).flatMap(({ fragmento, normal }) => {
      const e = porNombre.get(normal)
      return e ? [{ tipo: "cliente" as const, cliente: e.cliente, excepcion: e.tipo, fragmento }] : []
    })
  }

  function revisar(texto: string, voz: "yo" | "nosotros"): Hallazgo[] {
    const normal = normalizar(texto)
    const menciones = [...normal.matchAll(MENCION)]
      .filter((m) => !MENCIONES_PERMITIDAS.has(m[1] ?? ""))
      .map((m) => ({ tipo: "mencion" as const, fragmento: texto.slice(m.index, m.index + m[0].length) }))
    const precios = PRECIOS.flatMap((p) => buscar(texto, normal, p))
      .sort((a, b) => texto.indexOf(a.fragmento) - texto.indexOf(b.fragmento))
      .map(({ fragmento }) => ({ tipo: "precio" as const, fragmento }))
    // «+20 años» and «+200 proyectos» are Federico's: WAV may say them only while naming him.
    const trayectoria =
      voz === "nosotros" && !normal.includes("federico")
        ? buscar(texto, normal, TRAYECTORIA).map(({ fragmento }) => ({ tipo: "trayectoria" as const, fragmento }))
        : []
    return [...clientes(texto), ...menciones, ...precios, ...trayectoria]
  }

  return { clientes, revisar }
}

export function mensajeDe(h: Hallazgo): string {
  switch (h.tipo) {
    case "cliente":
      return `Nombra a ${h.cliente}, que ${h.excepcion === "confidencial" ? "es confidencial" : "no se nombra"}.`
    case "mencion":
      return `${h.fragmento}: solo WAV y Federico se mencionan con @.`
    case "precio":
      return `«${h.fragmento}»: nunca se publican precios ni presupuestos.`
    case "trayectoria":
      return `«${h.fragmento}» es la trayectoria de Federico: atribúyela a él, no a WAV.`
  }
}
```

- [ ] **Step 4: Pass** — `pnpm test:run tests/unit/revision-de-clientes.test.ts && pnpm type && pnpm lint`.
- [ ] **Step 5: Commit** — `git commit -m "feat: review a text for client exceptions, mentions, prices and track record"`

## Task 6: Pillar balance (D20)

**Files:** Create `lib/voz/balance.ts`, `tests/unit/balance-de-pilares.test.ts`.

- [ ] **Step 1: Failing test** `tests/unit/balance-de-pilares.test.ts`

```ts
import { describe, expect, test } from "vitest"
import { balanceDePilares, lineaDeAlerta, type PiezaDeBalance } from "@/lib/voz/balance"

const DIA = 86_400_000
const AHORA = Date.parse("2026-11-20T15:00:00Z")
const hace = (dias: number) => new Date(AHORA - dias * DIA).toISOString()
const en = (dias: number) => new Date(AHORA + dias * DIA).toISOString()

const UNO = { id: "p1", nombre: "Detrás del trabajo", porSemana: 1, creadoEn: hace(60) }
const OFICIO = { id: "p2", nombre: "Oficio", porSemana: 0.5, creadoEn: hace(60) }

function pieza(pilarId: string | null, instante: string, estado: PiezaDeBalance["estado"] = "publicada"): PiezaDeBalance {
  return { pilarId, instante, estado }
}

describe("balanceDePilares", () => {
  test("counts what came out in four weeks against the target and what is planned ahead", () => {
    const { filas } = balanceDePilares(
      [UNO],
      [pieza("p1", hace(3)), pieza("p1", hace(10)), pieza("p1", hace(40)), pieza("p1", en(2), "programada"), pieza("p1", en(9), "por_aprobar")],
      AHORA,
    )
    expect(filas[0]).toMatchObject({ salieron: 2, meta: 4, planeadas: 2, diasSinSalir: 3, alerta: false })
  })

  test("raises an alert after two weeks without coming out and nothing planned in the next seven days", () => {
    const { filas } = balanceDePilares([UNO], [pieza("p1", hace(15)), pieza("p1", en(9), "programada")], AHORA)
    expect(filas[0]).toMatchObject({ diasSinSalir: 15, alerta: true })
  })

  test("a piece planned in the next seven days quiets the alert", () => {
    const { filas } = balanceDePilares([OFICIO], [pieza("p2", hace(15)), pieza("p2", en(3), "por_aprobar")], AHORA)
    expect(filas[0]?.alerta).toBe(false)
  })

  test("a pillar that never came out alerts only once it is two weeks old", () => {
    const nuevo = { ...UNO, creadoEn: hace(5) }
    expect(balanceDePilares([nuevo], [], AHORA).filas[0]).toMatchObject({ diasSinSalir: null, alerta: false })
    expect(balanceDePilares([UNO], [], AHORA).filas[0]).toMatchObject({ diasSinSalir: null, alerta: true })
  })

  test("published means published: a signed piece in the past that is not published does not count", () => {
    const { filas } = balanceDePilares([UNO], [pieza("p1", hace(2), "programada")], AHORA)
    expect(filas[0]).toMatchObject({ salieron: 0, diasSinSalir: null })
  })

  test("counts pieces without a pillar in the same window", () => {
    expect(balanceDePilares([UNO], [pieza(null, hace(3)), pieza(null, en(4), "por_aprobar"), pieza(null, hace(40))], AHORA).sinPilar).toBe(2)
  })
})

describe("lineaDeAlerta", () => {
  test("says how long and where", () => {
    expect(lineaDeAlerta("Oficio", 16, "Página de WAV")).toBe("«Oficio» lleva 16 días sin salir en Página de WAV.")
    expect(lineaDeAlerta("Oficio", null, "Página de WAV")).toBe(
      "«Oficio» no ha salido en Página de WAV en más de dos semanas.",
    )
  })
})
```

- [ ] **Step 2: Fail** — `pnpm test:run tests/unit/balance-de-pilares.test.ts`.
- [ ] **Step 3: Implement** `lib/voz/balance.ts`

```ts
import type { EstadoDePieza } from "@/lib/piezas/estados"

export interface PilarDeBalance {
  id: string
  nombre: string
  porSemana: number
  creadoEn: string
}

export interface PiezaDeBalance {
  pilarId: string | null
  /** The planned slot; for signed and published pieces it equals the signed date (alinear_plan). */
  instante: string
  estado: EstadoDePieza
}

export interface FilaDeBalance {
  pilarId: string
  nombre: string
  salieron: number
  meta: number
  planeadas: number
  /** Null when nothing of this pillar came out in the window read (DIAS_DE_LECTURA). */
  diasSinSalir: number | null
  alerta: boolean
}

export interface Balance {
  filas: FilaDeBalance[]
  sinPilar: number
}

const DIA_MS = 86_400_000
export const SEMANAS_DE_PROPORCION = 4
// D20: «avisa cuando un pilar lleva dos semanas sin salir».
export const DIAS_SIN_SALIR = 14
export const DIAS_PLANEADOS = 14
// A piece of the pillar planned this close is the answer already: alerting would be noise.
const DIAS_QUE_CALMAN = 7
/** How far back the reading goes (lib/voz/lectura.ts): enough for four weeks of proportion and the last publication. */
export const DIAS_DE_LECTURA = 56

/** D20 for one account: proportion over four weeks, what is coming, and pillars two weeks without coming out. */
export function balanceDePilares(
  pilares: readonly PilarDeBalance[],
  piezas: readonly PiezaDeBalance[],
  ahora: number,
): Balance {
  const desde = ahora - SEMANAS_DE_PROPORCION * 7 * DIA_MS
  const salio = (p: PiezaDeBalance) => p.estado === "publicada" && Date.parse(p.instante) <= ahora
  const viene = (p: PiezaDeBalance) =>
    (p.estado === "por_aprobar" || p.estado === "programada") &&
    Date.parse(p.instante) > ahora &&
    Date.parse(p.instante) <= ahora + DIAS_PLANEADOS * DIA_MS

  const filas = pilares.map((pilar): FilaDeBalance => {
    const suyas = piezas.filter((p) => p.pilarId === pilar.id)
    const publicadas = suyas.filter(salio).map((p) => Date.parse(p.instante))
    const diasSinSalir = publicadas.length ? Math.floor((ahora - Math.max(...publicadas)) / DIA_MS) : null
    const cerca = suyas.some((p) => viene(p) && Date.parse(p.instante) <= ahora + DIAS_QUE_CALMAN * DIA_MS)
    const maduro = ahora - Date.parse(pilar.creadoEn) >= DIAS_SIN_SALIR * DIA_MS
    return {
      pilarId: pilar.id,
      nombre: pilar.nombre,
      salieron: publicadas.filter((t) => t > desde).length,
      meta: Math.round(pilar.porSemana * SEMANAS_DE_PROPORCION * 10) / 10,
      planeadas: suyas.filter(viene).length,
      diasSinSalir,
      alerta: maduro && !cerca && (diasSinSalir === null || diasSinSalir >= DIAS_SIN_SALIR),
    }
  })
  const sinPilar = piezas.filter(
    (p) => p.pilarId === null && ((salio(p) && Date.parse(p.instante) > desde) || viene(p)),
  ).length
  return { filas, sinPilar }
}

export function lineaDeAlerta(pilar: string, diasSinSalir: number | null, cuenta: string): string {
  return diasSinSalir === null
    ? `«${pilar}» no ha salido en ${cuenta} en más de dos semanas.`
    : `«${pilar}» lleva ${diasSinSalir} días sin salir en ${cuenta}.`
}
```

- [ ] **Step 4: Pass** — `pnpm test:run tests/unit/balance-de-pilares.test.ts && pnpm type`.
- [ ] **Step 5: Commit** — `git commit -m "feat: compute each account's pillar balance and two-week alerts"`

## Task 7: Reading the cases file

**Files:** Create `lib/clientes/casos.ts`, `tests/unit/casos.test.ts`.

- [ ] **Step 1: Failing test** `tests/unit/casos.test.ts`

```ts
import { describe, expect, test } from "vitest"
import { Falla } from "@/lib/dominio/falla"
import { excepcionesIniciales, leerCasos } from "@/lib/clientes/casos"

const CASO = {
  slug: "51-ice-auspicio-2020",
  client: "51 ICE",
  title: "AUSPICIO EVENTO",
  year: 2020,
  country: "Bolivia",
  city: null,
  industry: "Bebidas",
  workTypes: ["Activación de marca"],
  capabilities: ["Escenografía"],
  summary: "Federico Elgueta lideró…",
  role: "Producción integral.",
  citableClaim: "Una frase.",
  era: "trayectoria",
  exception: null,
}

describe("leerCasos", () => {
  test("maps the file's English fields to the table's columns", () => {
    expect(leerCasos({ source: "x", rules: [], cases: [CASO] })).toEqual([
      {
        slug: "51-ice-auspicio-2020",
        cliente: "51 ICE",
        titulo: "AUSPICIO EVENTO",
        anio: 2020,
        pais: "Bolivia",
        ciudad: null,
        industria: "Bebidas",
        tipos_de_trabajo: ["Activación de marca"],
        capacidades: ["Escenografía"],
        resumen: "Federico Elgueta lideró…",
        rol: "Producción integral.",
        frase_citable: "Una frase.",
        era: "trayectoria",
      },
    ])
  })

  test("throws a Falla naming the case when a field is wrong", () => {
    expect(() => leerCasos({ cases: [{ ...CASO, era: "otra" }] })).toThrow(Falla)
    expect(() => leerCasos({ cases: [{ ...CASO, era: "otra" }] })).toThrow(/51-ice-auspicio-2020/)
  })

  test("throws a Falla on a repeated slug", () => {
    expect(() => leerCasos({ cases: [CASO, CASO] })).toThrow(/repetido/)
  })
})

describe("excepcionesIniciales", () => {
  test("a private event becomes a «no nombrar» exception on that case", () => {
    const casos = [CASO, { ...CASO, slug: "boda-2018", client: "Edwards y Matte", exception: "evento privado" }]
    expect(excepcionesIniciales(casos)).toEqual([{ cliente: "Edwards y Matte", caso_slug: "boda-2018", tipo: "no_nombrar" }])
  })
})
```

- [ ] **Step 2: Fail** — `pnpm test:run tests/unit/casos.test.ts`.
- [ ] **Step 3: Implement** `lib/clientes/casos.ts`

```ts
import { z } from "zod"
import { Falla } from "@/lib/dominio/falla"
import type { TablesInsert } from "@/lib/supabase/database.types"

const Caso = z.object({
  slug: z.string().regex(/^[a-z0-9-]{3,140}$/),
  client: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(200),
  year: z.number().int().min(1990).max(2100).nullable(),
  country: z.string().max(80).nullable(),
  city: z.string().max(80).nullable(),
  industry: z.string().max(120).nullable(),
  workTypes: z.array(z.string()),
  capabilities: z.array(z.string()),
  summary: z.string().max(4000),
  role: z.string().max(2000),
  citableClaim: z.string().max(600).nullable(),
  era: z.enum(["trayectoria", "wav"]),
  exception: z.string().nullable(),
})
type CasoDelArchivo = z.infer<typeof Caso>

const Archivo = z.object({ cases: z.array(z.unknown()) })

export type CasoParaCargar = Omit<TablesInsert<"casos">, "cargado_en">

/** data/casos/casos.json → rows of public.casos. The file is PostIA's corrected copy; wav-repository is not touched. */
export function leerCasos(json: unknown): CasoParaCargar[] {
  const archivo = Archivo.safeParse(json)
  if (!archivo.success) throw new Falla("El archivo de casos no tiene la lista «cases».")
  const vistos = new Set<string>()
  return archivo.data.cases.map((crudo, i) => {
    const leido = Caso.safeParse(crudo)
    const nombre = (crudo as { slug?: unknown })?.slug ?? `#${i + 1}`
    if (!leido.success) throw new Falla(`El caso ${String(nombre)} no es válido: ${leido.error.issues[0]?.message}`)
    const c = leido.data
    if (vistos.has(c.slug)) throw new Falla(`El caso ${c.slug} está repetido.`)
    vistos.add(c.slug)
    return {
      slug: c.slug,
      cliente: c.client,
      titulo: c.title,
      anio: c.year,
      pais: c.country,
      ciudad: c.city,
      industria: c.industry,
      tipos_de_trabajo: c.workTypes,
      capacidades: c.capabilities,
      resumen: c.summary,
      rol: c.role,
      frase_citable: c.citableClaim,
      era: c.era,
    }
  })
}

/** D13 defaults: private events are not named. Confidential WR3 studies are not in the file; Federico marks them. */
export function excepcionesIniciales(
  casos: readonly Pick<CasoDelArchivo, "slug" | "client" | "exception">[],
): { cliente: string; caso_slug: string; tipo: "no_nombrar" }[] {
  return casos
    .filter((c) => c.exception === "evento privado")
    .map((c) => ({ cliente: c.client, caso_slug: c.slug, tipo: "no_nombrar" as const }))
}
```

  The test calls `excepcionesIniciales` with the file's own objects, which have `slug`, `client` and `exception`.
- [ ] **Step 4: Pass** — `pnpm test:run tests/unit/casos.test.ts && pnpm type`.
- [ ] **Step 5: Commit** — `git commit -m "feat: read the corrected cases file and its default exceptions"`

# Part 2 — Reading, actions and scripts

## Task 8: Reading and saving the editorial line

**Files:** Create `lib/voz/lectura.ts`, `lib/voz/acciones.ts`. Modify `tests/integration/voz.test.ts`.

- [ ] **Step 1: Failing tests** (append to `tests/integration/voz.test.ts`)

```ts
import { guardarLinea } from "@/lib/voz/acciones"
import { balancePorCuenta, lineaDeMarca, marcasConLinea, pilaresActivos } from "@/lib/voz/lectura"
import { cuentaDe, enDias, piezaDe, versionVigente } from "./entorno"

const PILARES = [{ nombre: "Uno", deQueHabla: "", material: "", porSemana: 1 }]

describe("lib/voz", () => {
  test("guardarLinea saves version after version and lineaDeMarca reads the current one and the history", async () => {
    const { db, marca } = await dueno("voz-lib")
    expect(await guardarLinea(db, { marcaId: marca, base: 0, secciones: SECCIONES, pilares: PILARES })).toEqual({
      ok: true,
      version: 1,
    })
    const primera = await lineaDeMarca(db, marca)
    const uno = primera?.actual?.pilares[0]
    expect(uno?.id).toBeDefined()
    await guardarLinea(db, {
      marcaId: marca,
      base: 1,
      secciones: { ...SECCIONES, tono: "Nuevo" },
      pilares: [{ ...PILARES[0], id: uno?.id, nombre: "Uno bis" }],
    })
    const linea = await lineaDeMarca(db, marca)
    expect(linea?.vigente).toBe(2)
    expect(linea?.actual?.secciones.tono).toBe("Nuevo")
    expect(linea?.historial.map((h) => h.version)).toEqual([2, 1])
    expect((await lineaDeMarca(db, marca, 1))?.actual?.pilares[0]?.nombre).toBe("Uno")
  })

  test("guardarLinea answers in Spanish when the base is stale or the input is bad", async () => {
    const { db, marca } = await dueno("voz-lib-falla")
    await guardarLinea(db, { marcaId: marca, base: 0, secciones: SECCIONES, pilares: PILARES })
    expect(await guardarLinea(db, { marcaId: marca, base: 0, secciones: SECCIONES, pilares: PILARES })).toEqual({
      ok: false,
      error: "Alguien guardó otra versión mientras editabas. Recarga para ver la última.",
    })
    expect(await guardarLinea(db, { marcaId: marca, base: 1, secciones: SECCIONES, pilares: [] })).toEqual({
      ok: false,
      error: "Revisa los pilares: entre 1 y 8, con nombres distintos.",
    })
  })

  test("marcasConLinea and pilaresActivos only show the person's brands", async () => {
    const { db, marca } = await dueno("voz-marcas")
    await guardarLinea(db, { marcaId: marca, base: 0, secciones: SECCIONES, pilares: PILARES })
    expect((await marcasConLinea(db)).map((m) => [m.id, m.version])).toEqual([[marca, 1]])
    expect((await pilaresActivos(db)).map((p) => [p.marcaId, p.nombre])).toEqual([[marca, "Uno"]])
  })

  test("balancePorCuenta reads each account's pieces by pillar", async () => {
    const { db, marca } = await dueno("voz-balance")
    await guardarLinea(db, { marcaId: marca, base: 0, secciones: SECCIONES, pilares: PILARES })
    const cuenta = await cuentaDe(marca)
    await admin().from("cuentas").update({ ritmo_semanal: 3 }).eq("id", cuenta)
    const [pilar] = await pilaresActivos(db)
    const pieza = await piezaDe(db, cuenta)
    await db.rpc("poner_pilar", { p_pieza: pieza, p_pilar: pilar?.id ?? null })
    const { huella } = await versionVigente(pieza)
    await db.rpc("firmar_pieza", { p_pieza: pieza, p_huella: huella, p_programada_para: enDias(3) })
    const balance = (await balancePorCuenta(db, Date.now())).find((b) => b.cuentaId === cuenta)
    expect(balance?.balance.filas[0]).toMatchObject({ nombre: "Uno", planeadas: 1, salieron: 0 })
  })
})
```

  Merge the imports into the file's existing import lines.
- [ ] **Step 2: Fail** — `pnpm test:db tests/integration/voz.test.ts`.
- [ ] **Step 3: Implement** `lib/voz/lectura.ts`

```ts
import { z } from "zod"
import { leerEstado } from "@/lib/piezas/lectura"
import type { Db } from "@/lib/supabase/database"
import { type Balance, balanceDePilares, DIAS_DE_LECTURA, DIAS_PLANEADOS } from "./balance"
import type { PilarDeLinea, SeccionesDeLinea } from "./linea"

const DIA_MS = 86_400_000

export interface VersionDeLinea {
  version: number
  creadaEn: string
  secciones: SeccionesDeLinea
  pilares: PilarDeLinea[]
}

export interface LineaDeMarca {
  marca: { id: string; nombre: string; voz: "yo" | "nosotros" }
  /** The version shown: the current one unless an older one was asked for. Null before the first save. */
  actual: VersionDeLinea | null
  vigente: number
  historial: { version: number; creadaEn: string }[]
}

const FotoDePilares = z.array(
  z.object({
    id: z.uuid(),
    nombre: z.string(),
    deQueHabla: z.string(),
    material: z.string(),
    porSemana: z.number(),
  }),
)

function fallo(accion: string, error: { message: string }): never {
  throw new Error(`${accion}: ${error.message}`, { cause: error })
}

export async function lineaDeMarca(db: Db, marcaId: string, version?: number): Promise<LineaDeMarca | null> {
  if (!z.uuid().safeParse(marcaId).success) return null
  const [marca, versiones] = await Promise.all([
    db.from("marcas").select("id, nombre, voz").eq("id", marcaId).maybeSingle(),
    db.from("lineas_editoriales").select("version, creada_en").eq("marca_id", marcaId).order("version", { ascending: false }),
  ])
  if (marca.error) fallo("No pude leer la marca", marca.error)
  if (versiones.error) fallo("No pude leer las versiones de la línea", versiones.error)
  if (!marca.data) return null
  const vigente = versiones.data[0]?.version ?? 0
  const pedida = version && version >= 1 && version <= vigente ? version : vigente
  let actual: VersionDeLinea | null = null
  if (pedida > 0) {
    const { data, error } = await db
      .from("lineas_editoriales")
      .select("*")
      .eq("marca_id", marcaId)
      .eq("version", pedida)
      .single()
    if (error) fallo("No pude leer la línea editorial", error)
    actual = {
      version: data.version,
      creadaEn: data.creada_en,
      secciones: {
        deQueHablamos: data.de_que_hablamos,
        tono: data.tono,
        formatos: data.formatos,
        temasVetados: data.temas_vetados,
        temasAVigilar: data.temas_a_vigilar,
        ejemplos: data.ejemplos,
      },
      pilares: FotoDePilares.parse(data.pilares),
    }
  }
  return {
    marca: { id: marca.data.id, nombre: marca.data.nombre, voz: marca.data.voz === "nosotros" ? "nosotros" : "yo" },
    actual,
    vigente,
    historial: versiones.data.map((v) => ({ version: v.version, creadaEn: v.creada_en })),
  }
}

export async function marcasConLinea(db: Db): Promise<{ id: string; nombre: string; version: number }[]> {
  const [marcas, lineas] = await Promise.all([
    db.from("marcas").select("id, nombre").order("nombre"),
    db.from("lineas_editoriales").select("marca_id, version"),
  ])
  if (marcas.error) fallo("No pude leer las marcas", marcas.error)
  if (lineas.error) fallo("No pude leer las líneas editoriales", lineas.error)
  return marcas.data.map((m) => ({
    id: m.id,
    nombre: m.nombre,
    version: Math.max(0, ...lineas.data.filter((l) => l.marca_id === m.id).map((l) => l.version)),
  }))
}

export async function pilaresActivos(db: Db): Promise<{ id: string; marcaId: string; nombre: string }[]> {
  const { data, error } = await db.from("pilares").select("id, marca_id, nombre").eq("activo", true).order("orden")
  if (error) fallo("No pude leer los pilares", error)
  return data.map((p) => ({ id: p.id, marcaId: p.marca_id, nombre: p.nombre }))
}

export interface BalanceDeCuenta {
  cuentaId: string
  cuenta: string
  marcaId: string
  balance: Balance
}

/** D20 for every account with a weekly rhythm. Works with a person's client (RLS) and with the service role. */
export async function balancePorCuenta(db: Db, ahora: number): Promise<BalanceDeCuenta[]> {
  const desde = new Date(ahora - DIAS_DE_LECTURA * DIA_MS).toISOString()
  const hasta = new Date(ahora + DIAS_PLANEADOS * DIA_MS).toISOString()
  const [cuentas, pilares, piezas] = await Promise.all([
    db.from("cuentas").select("id, nombre, marca_id").gt("ritmo_semanal", 0).order("nombre"),
    db.from("pilares").select("id, marca_id, nombre, por_semana, creado_en").eq("activo", true).order("orden"),
    db
      .from("piezas")
      .select("cuenta_id, pilar_id, estado, planeada_para")
      .in("estado", ["por_aprobar", "programada", "publicando", "publicada"])
      .gte("planeada_para", desde)
      .lt("planeada_para", hasta),
  ])
  if (cuentas.error) fallo("No pude leer las cuentas", cuentas.error)
  if (pilares.error) fallo("No pude leer los pilares", pilares.error)
  if (piezas.error) fallo("No pude leer las piezas", piezas.error)
  return cuentas.data.map((c) => ({
    cuentaId: c.id,
    cuenta: c.nombre,
    marcaId: c.marca_id,
    balance: balanceDePilares(
      pilares.data
        .filter((p) => p.marca_id === c.marca_id)
        .map((p) => ({ id: p.id, nombre: p.nombre, porSemana: Number(p.por_semana), creadoEn: p.creado_en })),
      piezas.data.flatMap((p) =>
        p.cuenta_id === c.id && p.planeada_para
          ? [{ pilarId: p.pilar_id, instante: p.planeada_para, estado: leerEstado(p.estado) }]
          : [],
      ),
      ahora,
    ),
  }))
}
```

- [ ] **Step 4: Implement** `lib/voz/acciones.ts`

```ts
import type { Resultado } from "@/lib/marcas/acciones"
import type { Db } from "@/lib/supabase/database"
import { LineaParaGuardar } from "./linea"

const MENSAJES: Record<string, string> = {
  linea_cambio: "Alguien guardó otra versión mientras editabas. Recarga para ver la última.",
  solo_el_dueno_edita_la_linea: "Solo el dueño de la marca puede cambiar su línea editorial.",
  pilares_invalidos: "Revisa los pilares: entre 1 y 8, con nombres distintos.",
  pilares_repetidos: "Revisa los pilares: entre 1 y 8, con nombres distintos.",
  pilar_de_otra_marca: "Uno de los pilares es de otra marca. Recarga e inténtalo de nuevo.",
}

export async function guardarLinea(db: Db, entrada: unknown): Promise<Resultado<{ version: number }>> {
  const leida = LineaParaGuardar.safeParse(entrada)
  if (!leida.success) {
    const enPilares = leida.error.issues.some((i) => i.path[0] === "pilares")
    return { ok: false, error: enPilares ? MENSAJES.pilares_invalidos : "Revisa el largo de cada sección." }
  }
  const { marcaId, base, secciones, pilares } = leida.data
  const { data, error } = await db.rpc("guardar_linea_editorial", {
    p_marca: marcaId,
    p_base: base,
    p_secciones: secciones,
    p_pilares: pilares,
  })
  if (error) {
    const mensaje = MENSAJES[error.message]
    if (mensaje) return { ok: false, error: mensaje }
    console.error("Falla inesperada al guardar la línea editorial", error.code, error.message)
    return { ok: false, error: "No pude guardar. Inténtalo de nuevo en un rato." }
  }
  return { ok: true, version: data }
}
```

- [ ] **Step 5: Pass** — `pnpm test:db tests/integration/voz.test.ts && pnpm type && pnpm lint`.
- [ ] **Step 6: Commit** — `git commit -m "feat: read and save editorial lines and each account's pillar balance"`

## Task 9: Reading clients and marking exceptions

**Files:** Create `lib/clientes/lectura.ts`, `lib/clientes/acciones.ts`. Modify `tests/integration/clientes.test.ts`.

- [ ] **Step 1: Failing tests** (append to `tests/integration/clientes.test.ts`)

```ts
import { marcarExcepcion, quitarExcepcion } from "@/lib/clientes/acciones"
import { clientes, leerExcepciones } from "@/lib/clientes/lectura"

describe("lib/clientes", () => {
  test("clientes groups cases by client with their active exceptions, newest case first", async () => {
    const cliente = `Cliente ${randomUUID().slice(0, 6)}`
    const viejo = await caso(cliente)
    const nuevo = await caso(cliente)
    await admin().from("casos").update({ anio: 2023 }).eq("slug", nuevo)
    const { db } = await duenoDeAlguna("cli-lib")
    expect(await marcarExcepcion(db, { cliente, tipo: "sin_logo", alias: "", hasta: "" })).toMatchObject({ ok: true })
    const fila = (await clientes(db)).find((c) => c.cliente === cliente)
    expect(fila?.casos.map((c) => c.slug)).toEqual([nuevo, viejo])
    expect(fila?.excepciones.map((e) => e.tipo)).toEqual(["sin_logo"])
  })

  test("marcarExcepcion reads aliases separated by commas and quitarExcepcion hides it from the active list", async () => {
    const cliente = `Cliente ${randomUUID().slice(0, 6)}`
    const { db } = await duenoDeAlguna("cli-alias")
    const marcada = await marcarExcepcion(db, { cliente, tipo: "no_nombrar", alias: " Uno, Dos ,", hasta: "2030-01-01" })
    if (!marcada.ok) throw new Error(marcada.error)
    expect((await leerExcepciones(db)).find((e) => e.cliente === cliente)).toEqual({
      cliente,
      alias: ["Uno", "Dos"],
      tipo: "no_nombrar",
      hasta: "2030-01-01",
    })
    expect(await quitarExcepcion(db, marcada.id)).toEqual({ ok: true })
    expect((await leerExcepciones(db)).some((e) => e.cliente === cliente)).toBe(false)
  })

  test("marcarExcepcion answers in Spanish when the exception already exists", async () => {
    const cliente = `Cliente ${randomUUID().slice(0, 6)}`
    const { db } = await duenoDeAlguna("cli-doble")
    await marcarExcepcion(db, { cliente, tipo: "no_nombrar", alias: "", hasta: "" })
    expect(await marcarExcepcion(db, { cliente, tipo: "no_nombrar", alias: "", hasta: "" })).toEqual({
      ok: false,
      error: "Ese cliente ya tiene esa excepción.",
    })
  })
})
```

- [ ] **Step 2: Fail** — `pnpm test:db tests/integration/clientes.test.ts`.
- [ ] **Step 3: Implement** `lib/clientes/lectura.ts`

```ts
import type { Db } from "@/lib/supabase/database"
import type { Excepcion, TipoDeExcepcion } from "./revision"

export const TIPOS_DE_EXCEPCION: Record<TipoDeExcepcion, string> = {
  no_nombrar: "No se nombra",
  confidencial: "Confidencial",
  sin_fotos: "Sin fotos",
  sin_logo: "Sin logo",
}

function leerTipoDeExcepcion(valor: string): TipoDeExcepcion {
  if (valor in TIPOS_DE_EXCEPCION) return valor as TipoDeExcepcion
  throw new Error(`Tipo de excepción desconocido: ${valor}`)
}

function fallo(accion: string, error: { message: string }): never {
  throw new Error(`${accion}: ${error.message}`, { cause: error })
}

/** Active exceptions (not removed). The end date is applied by prepararRevision with today's Chile date. */
export async function leerExcepciones(db: Db): Promise<Excepcion[]> {
  const { data, error } = await db.from("excepciones").select("cliente, alias, tipo, hasta").is("quitada_en", null)
  if (error) fallo("No pude leer las excepciones de clientes", error)
  return data.map((e) => ({ cliente: e.cliente, alias: e.alias, tipo: leerTipoDeExcepcion(e.tipo), hasta: e.hasta }))
}

export interface ExcepcionVigente {
  id: string
  tipo: TipoDeExcepcion
  casoSlug: string | null
  alias: string[]
  hasta: string | null
}

export interface ClienteConCasos {
  cliente: string
  casos: { slug: string; titulo: string; anio: number | null; era: "trayectoria" | "wav" }[]
  excepciones: ExcepcionVigente[]
}

export async function clientes(db: Db): Promise<ClienteConCasos[]> {
  const [casos, excepciones] = await Promise.all([
    db.from("casos").select("slug, cliente, titulo, anio, era").order("cliente").order("anio", { ascending: false }),
    db.from("excepciones").select("id, cliente, caso_slug, tipo, alias, hasta").is("quitada_en", null),
  ])
  if (casos.error) fallo("No pude leer los casos", casos.error)
  if (excepciones.error) fallo("No pude leer las excepciones", excepciones.error)
  const porCliente = new Map<string, ClienteConCasos>()
  const de = (nombre: string) => {
    const clave = nombre.trim().toLowerCase()
    const fila = porCliente.get(clave) ?? { cliente: nombre, casos: [], excepciones: [] }
    porCliente.set(clave, fila)
    return fila
  }
  for (const c of casos.data) {
    de(c.cliente).casos.push({ slug: c.slug, titulo: c.titulo, anio: c.anio, era: c.era === "wav" ? "wav" : "trayectoria" })
  }
  // An exception may name a client that has no case in the file (a WR3 study): it still gets its row.
  for (const e of excepciones.data) {
    de(e.cliente).excepciones.push({
      id: e.id,
      tipo: leerTipoDeExcepcion(e.tipo),
      casoSlug: e.caso_slug,
      alias: e.alias,
      hasta: e.hasta,
    })
  }
  return [...porCliente.values()].sort((a, b) => a.cliente.localeCompare(b.cliente, "es"))
}
```

- [ ] **Step 4: Implement** `lib/clientes/acciones.ts`

```ts
import { z } from "zod"
import type { Resultado } from "@/lib/marcas/acciones"
import type { Db } from "@/lib/supabase/database"

const MENSAJES: Record<string, string> = {
  solo_el_dueno_marca_excepciones: "Solo el dueño de una marca puede marcar excepciones.",
  caso_de_otro_cliente: "Ese caso es de otro cliente.",
  excepcion_ya_quitada: "Esa excepción ya no estaba.",
}

const NuevaExcepcion = z.object({
  cliente: z.string().trim().min(1).max(120),
  casoSlug: z.string().regex(/^[a-z0-9-]{3,140}$/).optional(),
  tipo: z.enum(["no_nombrar", "sin_fotos", "sin_logo", "confidencial"]),
  // The form sends text: aliases separated by commas, and an empty date for «until removed».
  alias: z.string().max(600),
  hasta: z.union([z.literal(""), z.iso.date()]),
})

function falla(error: { code?: string; message: string }): { ok: false; error: string } {
  if (error.code === "23505") return { ok: false, error: "Ese cliente ya tiene esa excepción." }
  const mensaje = MENSAJES[error.message]
  if (mensaje) return { ok: false, error: mensaje }
  console.error("Falla inesperada al guardar una excepción", error.code, error.message)
  return { ok: false, error: "No pude guardar. Inténtalo de nuevo en un rato." }
}

export async function marcarExcepcion(db: Db, entrada: unknown): Promise<Resultado<{ id: string }>> {
  const leida = NuevaExcepcion.safeParse(entrada)
  if (!leida.success) return { ok: false, error: "Revisa el cliente, el tipo y la fecha." }
  const e = leida.data
  const alias = e.alias.split(",").map((a) => a.trim()).filter(Boolean)
  if (alias.length > 10) return { ok: false, error: "Hasta 10 alias por excepción." }
  const { data, error } = await db.rpc("marcar_excepcion", {
    p_cliente: e.cliente,
    p_caso: e.casoSlug ?? null,
    p_tipo: e.tipo,
    p_alias: alias,
    p_hasta: e.hasta || null,
  })
  return error ? falla(error) : { ok: true, id: data }
}

export async function quitarExcepcion(db: Db, id: string): Promise<Resultado> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: MENSAJES.excepcion_ya_quitada }
  const { error } = await db.rpc("quitar_excepcion", { p_id: id })
  return error ? falla(error) : { ok: true }
}
```

  If `pnpm type` reports that the generated RPC types need `p_caso` or `p_hasta` as non-null, write the optional parameters with `default null` in `marcar_excepcion` (Task 3 migration). That is the C1 pattern (`crear_pieza` defaults), and it makes the generated types optional.
- [ ] **Step 5: Pass** — `pnpm test:db tests/integration/clientes.test.ts && pnpm type && pnpm lint`.
- [ ] **Step 6: Commit** — `git commit -m "feat: list clients with their cases and mark or remove exceptions"`

## Task 10: Load scripts

**Files:** Create `scripts/cargar-casos.ts`, `scripts/cargar-linea.ts`. Modify `package.json`.

- [ ] **Step 1: Scripts** in `package.json`, next to `cargar:wr3`

```json
    "cargar:casos": "tsx --env-file=.env.local scripts/cargar-casos.ts",
    "cargar:casos:prod": "tsx --env-file=.env.produccion scripts/cargar-casos.ts",
    "cargar:linea": "tsx --env-file=.env.local scripts/cargar-linea.ts",
    "cargar:linea:prod": "tsx --env-file=.env.produccion scripts/cargar-linea.ts",
```

- [ ] **Step 2: Cases** `scripts/cargar-casos.ts`

```ts
import { readFile } from "node:fs/promises"
import { parseArgs } from "node:util"
import { excepcionesIniciales, leerCasos } from "@/lib/clientes/casos"
import { Falla } from "@/lib/dominio/falla"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Db } from "@/lib/supabase/database"

const ARCHIVO_POR_DEFECTO = "data/casos/casos.json"

async function main() {
  const { values } = parseArgs({ options: { correo: { type: "string" }, archivo: { type: "string" } } })
  const correo = (values.correo ?? "federico@wearevision.cl").trim().toLowerCase()
  const ruta = values.archivo ?? ARCHIVO_POR_DEFECTO
  let json: unknown
  try {
    json = JSON.parse(await readFile(ruta, "utf8"))
  } catch (error) {
    throw new Falla(`No pude leer ${ruta}: ${error instanceof Error ? error.message : "sin detalle"}`)
  }
  const casos = leerCasos(json)
  const db = createAdminClient()
  const userId = await buscarUsuario(db, correo)

  // Upsert by slug: running it again after correcting the file updates the rows and creates nothing twice.
  const { error } = await db.from("casos").upsert(casos, { onConflict: "slug" })
  if (error) throw new Error(`No pude guardar los casos: ${error.message}`, { cause: error })
  console.log(`${casos.length} casos de ${new Set(casos.map((c) => c.cliente)).size} clientes`)

  const crudos = (json as { cases: { slug: string; client: string; exception: string | null }[] }).cases
  for (const e of excepcionesIniciales(crudos)) {
    const { data: vigente, error: errorDeLectura } = await db
      .from("excepciones")
      .select("id")
      .eq("caso_slug", e.caso_slug)
      .eq("tipo", e.tipo)
      .is("quitada_en", null)
      .maybeSingle()
    if (errorDeLectura) throw new Error(`No pude leer las excepciones: ${errorDeLectura.message}`)
    if (vigente) continue
    const { error: errorAlMarcar } = await db.from("excepciones").insert({ ...e, puesta_por: userId })
    if (errorAlMarcar) throw new Error(`No pude marcar ${e.cliente}: ${errorAlMarcar.message}`)
    console.log(`excepción  no se nombra  ${e.cliente} (${e.caso_slug})`)
  }
}

async function buscarUsuario(db: Db, correo: string): Promise<string> {
  // The admin API has no lookup by email; the team is a handful of people, so one page holds everyone.
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw new Error(`No pude listar usuarios: ${error.message}`, { cause: error })
  const usuario = data.users.find((u) => u.email?.toLowerCase() === correo)
  if (!usuario) throw new Falla(`No existe un usuario con el correo ${correo}.`)
  return usuario.id
}

main().catch((error: unknown) => {
  console.error(error instanceof Falla ? error.message : error)
  process.exitCode = 1
})
```

  The script only reads `exception` from the raw file; `leerCasos` has already validated each object, so the cast holds.
- [ ] **Step 3: Editorial line** `scripts/cargar-linea.ts`

```ts
import { readFile } from "node:fs/promises"
import { parseArgs } from "node:util"
import { Falla } from "@/lib/dominio/falla"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Db } from "@/lib/supabase/database"
import { leerLinea } from "@/lib/voz/importar"
import { NOMBRE_DE_SECCION, type Seccion } from "@/lib/voz/linea"

// One-time import of a brand's Claude Doc (exported to markdown) as version 1. After it, the line is edited in the
// app (Voz y línea editorial). The exported file is never committed: pass its path.
async function main() {
  const { values } = parseArgs({
    options: {
      marca: { type: "string" },
      archivo: { type: "string" },
      correo: { type: "string" },
      probar: { type: "boolean", default: false },
    },
  })
  if (!values.marca || !values.archivo) throw new Falla("Uso: pnpm cargar:linea --marca <nombre> --archivo <ruta.md> [--probar]")
  const correo = (values.correo ?? "federico@wearevision.cl").trim().toLowerCase()
  let markdown: string
  try {
    markdown = await readFile(values.archivo, "utf8")
  } catch (error) {
    throw new Falla(`No pude leer ${values.archivo}: ${error instanceof Error ? error.message : "sin detalle"}`)
  }
  const linea = leerLinea(markdown)
  for (const [seccion, texto] of Object.entries(linea.secciones) as [Seccion, string][]) {
    console.log(`${NOMBRE_DE_SECCION[seccion].padEnd(20)} ${[...texto].length} caracteres`)
  }
  for (const p of linea.pilares) console.log(`pilar  ${p.porSemana} por semana  ${p.nombre}`)
  if (linea.ignoradas.length) console.log(`no se importan: ${linea.ignoradas.join(", ")}`)
  if (values.probar) return

  const db = createAdminClient()
  const marcaId = await buscarMarca(db, values.marca)
  const { count, error: errorDeConteo } = await db
    .from("lineas_editoriales")
    .select("id", { count: "exact", head: true })
    .eq("marca_id", marcaId)
  if (errorDeConteo) throw new Error(`No pude leer la línea actual: ${errorDeConteo.message}`)
  if ((count ?? 0) > 0) {
    throw new Falla(`«${values.marca}» ya tiene línea editorial: edítala en la app, en Voz y línea editorial.`)
  }
  const { data, error } = await db.rpc("guardar_linea", {
    p_marca: marcaId,
    p_base: 0,
    p_secciones: linea.secciones,
    p_pilares: linea.pilares,
    p_autor: await buscarUsuario(db, correo),
  })
  if (error) throw new Error(`No pude guardar la línea: ${error.message}`, { cause: error })
  console.log(`«${values.marca}»: versión ${data}`)
}

async function buscarMarca(db: Db, nombre: string): Promise<string> {
  const { data, error } = await db.from("marcas").select("id").eq("nombre", nombre).maybeSingle()
  if (error) throw new Error(`No pude buscar la marca: ${error.message}`, { cause: error })
  if (!data) throw new Falla(`No existe la marca «${nombre}».`)
  return data.id
}

async function buscarUsuario(db: Db, correo: string): Promise<string> {
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw new Error(`No pude listar usuarios: ${error.message}`, { cause: error })
  const usuario = data.users.find((u) => u.email?.toLowerCase() === correo)
  if (!usuario) throw new Falla(`No existe un usuario con el correo ${correo}.`)
  return usuario.id
}

main().catch((error: unknown) => {
  console.error(error instanceof Falla ? error.message : error)
  process.exitCode = 1
})
```

  `buscarUsuario` now exists in three scripts. Extract it to `scripts/usuario.ts` (`export async function buscarUsuario(db, correo)`) and import it from `cargar-wr3.ts`, `cargar-casos.ts` and `cargar-linea.ts`. That makes 3 callers, which passes YAGNI.
- [ ] **Step 4: Check locally** — `pnpm db:reset`, then `pnpm invitar --correo federico@wearevision.cl --marca WAV --voz nosotros`, then `pnpm cargar:casos`. Expect «105 casos de 64 clientes» and one exception line for the private event. Run it again and expect the same count with no exception line. Then `pnpm cargar:linea --marca WAV --archivo tests/unit/fixtures/linea.md --probar`; create that fixture from the `LINEA` constant of Task 4. Expect the section lengths and 2 pillars, with nothing written. Run it again without `--probar` and expect «versión 1»; a third run refuses with «ya tiene línea editorial».
- [ ] **Step 5: Pass** — `pnpm type && pnpm lint && pnpm test:run`.
- [ ] **Step 6: Commit** — `git commit -m "feat: add load scripts for the cases and a brand's editorial line"`

# Part 3 — Screens

## Task 11: Routes and links from Ajustes

**Files:** Modify `lib/sesion/rutas.ts`, `tests/unit/rutas.test.ts`, `app/(app)/ajustes/page.tsx`.

- [ ] **Step 1: Failing test** (append to `tests/unit/rutas.test.ts`)

```ts
import { RUTA_DE_CLIENTES, RUTA_DE_VOZ, rutaDeVoz } from "@/lib/sesion/rutas"

describe("voz y clientes", () => {
  test("a brand's line and one of its versions have their own address", () => {
    expect(RUTA_DE_VOZ).toBe("/voz")
    expect(RUTA_DE_CLIENTES).toBe("/clientes")
    expect(rutaDeVoz("m1")).toBe("/voz/m1")
    expect(rutaDeVoz("m1", 3)).toBe("/voz/m1?version=3")
  })
})
```

- [ ] **Step 2: Fail** — `pnpm test:run tests/unit/rutas.test.ts`.
- [ ] **Step 3: Implement** in `lib/sesion/rutas.ts`

```ts
export const RUTA_DE_VOZ = "/voz"
export const RUTA_DE_CLIENTES = "/clientes"

export function rutaDeVoz(marcaId: string, version?: number): string {
  return `${RUTA_DE_VOZ}/${encodeURIComponent(marcaId)}${version ? `?version=${version}` : ""}`
}
```

  Links in `app/(app)/ajustes/page.tsx`, above «Salir». The nav keeps its 5 items:

```tsx
      <nav aria-label="Más" className="space-y-2">
        <Link href={RUTA_DE_VOZ} className="block min-h-11 rounded-lg border border-borde px-4 py-3">
          Voz y línea editorial
        </Link>
        <Link href={RUTA_DE_CLIENTES} className="block min-h-11 rounded-lg border border-borde px-4 py-3">
          Clientes
        </Link>
      </nav>
```

- [ ] **Step 4: Pass** — `pnpm test:run tests/unit/rutas.test.ts && pnpm type`.
- [ ] **Step 5: Commit** — `git commit -m "feat: reach Voz y línea editorial and Clientes from Ajustes"`

## Task 12: Voz y línea editorial

**Files:** Create `app/(app)/voz/page.tsx`, `app/(app)/voz/[marcaId]/page.tsx`, `app/(app)/voz/[marcaId]/editor.tsx`, `app/(app)/voz/[marcaId]/acciones.ts`, `tests/unit/editor-de-linea.test.tsx`.

- [ ] **Step 1: Failing test** `tests/unit/editor-de-linea.test.tsx`

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { EditorDeLinea } from "@/app/(app)/voz/[marcaId]/editor"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const MARCA = "22222222-2222-4222-8222-222222222222"
const PILAR = { id: "33333333-3333-4333-8333-333333333333", nombre: "Oficio", deQueHabla: "", material: "", porSemana: 0.5 }
const SECCIONES = { deQueHablamos: "A", tono: "B", formatos: "C", temasVetados: "D", temasAVigilar: "", ejemplos: "E" }

function montar(guardar = vi.fn(async () => ({ ok: true as const, version: 4 }))) {
  render(<EditorDeLinea marcaId={MARCA} base={3} secciones={SECCIONES} pilares={[PILAR]} guardar={guardar} />)
  return guardar
}

describe("EditorDeLinea", () => {
  test("saves the edited sections and pillars on top of the version it started from", async () => {
    const guardar = montar()
    fireEvent.change(screen.getByLabelText("Tono y voz"), { target: { value: "Más directo" } })
    fireEvent.click(screen.getByRole("button", { name: "Agregar pilar" }))
    fireEvent.change(screen.getAllByLabelText("Nombre del pilar")[1] as HTMLElement, { target: { value: "Nuevo" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar versión nueva" }))
    await waitFor(() => expect(guardar).toHaveBeenCalledTimes(1))
    expect(guardar).toHaveBeenCalledWith({
      marcaId: MARCA,
      base: 3,
      secciones: { ...SECCIONES, tono: "Más directo" },
      pilares: [PILAR, { nombre: "Nuevo", deQueHabla: "", material: "", porSemana: 1 }],
    })
    expect(await screen.findByText("Guardada como versión 4.")).toBeVisible()
  })

  test("shows the server's error and keeps the edits", async () => {
    montar(vi.fn(async () => ({ ok: false as const, error: "Alguien guardó otra versión mientras editabas." })))
    fireEvent.change(screen.getByLabelText("Formatos"), { target: { value: "Otro" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar versión nueva" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Alguien guardó otra versión")
    expect(screen.getByLabelText("Formatos")).toHaveValue("Otro")
  })

  test("a pillar can be removed but never the last one", () => {
    montar()
    expect(screen.queryByRole("button", { name: "Quitar Oficio" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Agregar pilar" }))
    fireEvent.click(screen.getByRole("button", { name: "Quitar Oficio" }))
    expect(screen.getAllByLabelText("Nombre del pilar")).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Fail** — `pnpm test:run tests/unit/editor-de-linea.test.tsx`.
- [ ] **Step 3: Editor** `app/(app)/voz/[marcaId]/editor.tsx`

```tsx
"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import type { Resultado } from "@/lib/marcas/acciones"
import {
  LARGO_DE_SECCION,
  MAXIMO_DE_PILARES,
  NOMBRE_DE_SECCION,
  POR_SEMANA,
  type PilarDeLinea,
  SECCIONES,
  type SeccionesDeLinea,
} from "@/lib/voz/linea"

interface Props {
  marcaId: string
  base: number
  secciones: SeccionesDeLinea
  pilares: PilarDeLinea[]
  guardar: (entrada: unknown) => Promise<Resultado<{ version: number }>>
}

const CAMPO = "w-full rounded-lg border border-borde bg-background px-3 py-3"
const PILAR_NUEVO: PilarDeLinea = { nombre: "", deQueHabla: "", material: "", porSemana: 1 }

export function EditorDeLinea({ marcaId, base, secciones: iniciales, pilares: inicialesP, guardar }: Props) {
  const router = useRouter()
  const [secciones, setSecciones] = useState(iniciales)
  const [pilares, setPilares] = useState(inicialesP.length ? inicialesP : [PILAR_NUEVO])
  const [error, setError] = useState<string | null>(null)
  const [guardada, setGuardada] = useState<number | null>(null)
  const [pendiente, iniciar] = useTransition()

  function cambiarPilar(i: number, cambios: Partial<PilarDeLinea>) {
    setPilares((ps) => ps.map((p, j) => (j === i ? { ...p, ...cambios } : p)))
  }

  function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setError(null)
    iniciar(async () => {
      const resultado = await guardar({ marcaId, base, secciones, pilares })
      if (!resultado.ok) return setError(resultado.error)
      setGuardada(resultado.version)
      router.refresh()
    })
  }

  return (
    <form onSubmit={enviar} className="space-y-5">
      {SECCIONES.map((s) => (
        <label key={s} className="block space-y-1">
          <span className="text-sm font-medium">{NOMBRE_DE_SECCION[s]}</span>
          <textarea
            value={secciones[s]}
            maxLength={LARGO_DE_SECCION[s]}
            rows={s === "ejemplos" ? 12 : 5}
            onChange={(e) => setSecciones((actual) => ({ ...actual, [s]: e.target.value }))}
            className={CAMPO}
          />
        </label>
      ))}

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Pilares</legend>
        {pilares.map((p, i) => (
          <div key={p.id ?? `nuevo-${i}`} className="space-y-2 rounded-lg border border-borde p-3">
            <label className="block space-y-1">
              <span className="text-sm">Nombre del pilar</span>
              <input value={p.nombre} maxLength={60} onChange={(e) => cambiarPilar(i, { nombre: e.target.value })} className={CAMPO} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">De qué habla</span>
              <input value={p.deQueHabla} maxLength={400} onChange={(e) => cambiarPilar(i, { deQueHabla: e.target.value })} className={CAMPO} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">De dónde sale el material</span>
              <input value={p.material} maxLength={400} onChange={(e) => cambiarPilar(i, { material: e.target.value })} className={CAMPO} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm">Por semana</span>
              <select value={p.porSemana} onChange={(e) => cambiarPilar(i, { porSemana: Number(e.target.value) })} className={CAMPO}>
                {POR_SEMANA.map((n) => (
                  <option key={n} value={n}>
                    {n === 0.5 ? "1 cada dos semanas" : n}
                  </option>
                ))}
              </select>
            </label>
            {pilares.length > 1 && (
              <button
                type="button"
                onClick={() => setPilares((ps) => ps.filter((_, j) => j !== i))}
                className="min-h-11 text-sm text-apagado"
              >
                Quitar {p.nombre || "este pilar"}
              </button>
            )}
          </div>
        ))}
        {pilares.length < MAXIMO_DE_PILARES && (
          <button
            type="button"
            onClick={() => setPilares((ps) => [...ps, PILAR_NUEVO])}
            className="min-h-11 w-full rounded-lg border border-borde px-4"
          >
            Agregar pilar
          </button>
        )}
      </fieldset>

      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
      {guardada && <p className="text-sm">Guardada como versión {guardada}.</p>}
      <button
        type="submit"
        disabled={pendiente}
        className="min-h-11 w-full rounded-lg bg-primario px-4 font-medium text-primario-texto disabled:opacity-60"
      >
        Guardar versión nueva
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Action** `app/(app)/voz/[marcaId]/acciones.ts`

```ts
"use server"

import { revalidatePath } from "next/cache"
import type { Resultado } from "@/lib/marcas/acciones"
import { RUTA_DE_VOZ } from "@/lib/sesion/rutas"
import { createActionClient } from "@/lib/supabase/action"
import { guardarLinea } from "@/lib/voz/acciones"

export async function guardarLineaAccion(entrada: unknown): Promise<Resultado<{ version: number }>> {
  const resultado = await guardarLinea(await createActionClient(), entrada)
  if (resultado.ok) revalidatePath(RUTA_DE_VOZ, "layout")
  return resultado
}
```

- [ ] **Step 5: Pages.** `app/(app)/voz/page.tsx` lists the brands:

```tsx
import Link from "next/link"
import { rutaDeVoz } from "@/lib/sesion/rutas"
import { createClient } from "@/lib/supabase/server"
import { marcasConLinea } from "@/lib/voz/lectura"

export default async function Voz() {
  const marcas = await marcasConLinea(await createClient())
  return (
    <section className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold">Voz y línea editorial</h1>
      <p className="text-apagado">Claude lee la versión vigente de cada marca antes de escribir.</p>
      <ul className="space-y-2">
        {marcas.map((m) => (
          <li key={m.id}>
            <Link href={rutaDeVoz(m.id)} className="block min-h-11 rounded-lg border border-borde px-4 py-3">
              {m.nombre} · {m.version ? `versión ${m.version}` : "sin línea todavía"}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
```

  `app/(app)/voz/[marcaId]/page.tsx` shows the editor for the current version, a read-only view for an older one, and the history:

```tsx
import Link from "next/link"
import { notFound } from "next/navigation"
import { fechaLarga } from "@/lib/piezas/fechas"
import { rutaDeVoz } from "@/lib/sesion/rutas"
import { createClient } from "@/lib/supabase/server"
import { lineaDeMarca } from "@/lib/voz/lectura"
import { NOMBRE_DE_SECCION, SECCIONES } from "@/lib/voz/linea"
import { guardarLineaAccion } from "./acciones"
import { EditorDeLinea } from "./editor"

const VACIA = { deQueHablamos: "", tono: "", formatos: "", temasVetados: "", temasAVigilar: "", ejemplos: "" }

export default async function LineaDeMarca({
  params,
  searchParams,
}: {
  params: Promise<{ marcaId: string }>
  searchParams: Promise<{ version?: string }>
}) {
  const { marcaId } = await params
  const { version } = await searchParams
  const linea = await lineaDeMarca(await createClient(), marcaId, version ? Number(version) : undefined)
  if (!linea) notFound()
  const { marca, actual, vigente, historial } = linea
  const antigua = actual !== null && actual.version < vigente

  return (
    <section className="mx-auto max-w-md space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{marca.nombre}</h1>
        <p className="text-apagado">
          Habla como «{marca.voz}». {vigente ? `Versión vigente: ${vigente}.` : "Todavía no tiene línea editorial."}
        </p>
      </header>

      {antigua ? (
        <div className="space-y-4">
          <p>
            Estás viendo la versión {actual.version}, del {fechaLarga(actual.creadaEn)}.{" "}
            <Link href={rutaDeVoz(marca.id)} className="underline">
              Volver a la vigente
            </Link>
          </p>
          {SECCIONES.map((s) => (
            <div key={s} className="space-y-1">
              <h2 className="text-sm font-medium">{NOMBRE_DE_SECCION[s]}</h2>
              <p className="whitespace-pre-wrap rounded-lg border border-borde p-3 text-sm">{actual.secciones[s] || "Vacía."}</p>
            </div>
          ))}
          <h2 className="text-sm font-medium">Pilares</h2>
          <ul className="list-disc pl-5 text-sm">
            {actual.pilares.map((p) => (
              <li key={p.id}>
                {p.nombre} · {p.porSemana === 0.5 ? "1 cada dos semanas" : `${p.porSemana} por semana`}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <EditorDeLinea
          key={vigente}
          marcaId={marca.id}
          base={vigente}
          secciones={actual?.secciones ?? VACIA}
          pilares={actual?.pilares ?? []}
          guardar={guardarLineaAccion}
        />
      )}

      {historial.length > 1 && (
        <nav aria-label="Versiones" className="space-y-2">
          <h2 className="text-sm font-medium">Versiones anteriores</h2>
          <ul className="space-y-1 text-sm">
            {historial.slice(1).map((h) => (
              <li key={h.version}>
                <Link href={rutaDeVoz(marca.id, h.version)} className="block min-h-11 py-3 underline">
                  Versión {h.version} · {fechaLarga(h.creadaEn)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </section>
  )
}
```

  Check that `fechaLarga` (lib/piezas/fechas.ts) reads well for a save date; if it prints the hour, it still answers «when».
- [ ] **Step 6: Pass** — `pnpm test:run tests/unit/editor-de-linea.test.tsx && pnpm type && pnpm lint`. Open `/voz` in `pnpm dev` with the WAV line loaded in Task 10, save a change, and check that the old version opens read-only.
- [ ] **Step 7: Commit** — `git commit -m "feat: edit each brand's editorial line with versions and history"`

## Task 13: Clientes

**Files:** Create `app/(app)/clientes/page.tsx`, `app/(app)/clientes/excepciones.tsx`, `app/(app)/clientes/acciones.ts`, `tests/unit/excepciones.test.tsx`.

- [ ] **Step 1: Failing test** `tests/unit/excepciones.test.tsx`

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { ExcepcionesDeCliente } from "@/app/(app)/clientes/excepciones"

const CLIENTE = {
  cliente: "Copec",
  casos: [{ slug: "copec-85-2019", titulo: "Copec 85 años", anio: 2019, era: "trayectoria" as const }],
  excepciones: [{ id: "e1", tipo: "sin_logo" as const, casoSlug: null, alias: [], hasta: null }],
}

function montar() {
  const marcar = vi.fn(async () => ({ ok: true as const, id: "e2" }))
  const quitar = vi.fn(async () => ({ ok: true as const }))
  render(<ExcepcionesDeCliente cliente={CLIENTE} marcar={marcar} quitar={quitar} />)
  return { marcar, quitar }
}

describe("ExcepcionesDeCliente", () => {
  test("shows the cases as track record and the active exceptions", () => {
    montar()
    expect(screen.getByText("Copec 85 años · 2019 · trayectoria")).toBeVisible()
    expect(screen.getByRole("button", { name: "Quitar Sin logo" })).toBeVisible()
  })

  test("marks a new exception for the whole client or one case", async () => {
    const { marcar } = montar()
    fireEvent.change(screen.getByLabelText("Tipo de excepción"), { target: { value: "no_nombrar" } })
    fireEvent.change(screen.getByLabelText("Solo este caso"), { target: { value: "copec-85-2019" } })
    fireEvent.change(screen.getByLabelText("Otros nombres, separados por coma"), { target: { value: "Copec SA" } })
    fireEvent.click(screen.getByRole("button", { name: "Marcar excepción" }))
    await waitFor(() =>
      expect(marcar).toHaveBeenCalledWith({
        cliente: "Copec",
        casoSlug: "copec-85-2019",
        tipo: "no_nombrar",
        alias: "Copec SA",
        hasta: "",
      }),
    )
  })

  test("removes an exception", async () => {
    const { quitar } = montar()
    fireEvent.click(screen.getByRole("button", { name: "Quitar Sin logo" }))
    await waitFor(() => expect(quitar).toHaveBeenCalledWith("e1"))
  })
})
```

- [ ] **Step 2: Fail** — `pnpm test:run tests/unit/excepciones.test.tsx`.
- [ ] **Step 3: Component** `app/(app)/clientes/excepciones.tsx`

```tsx
"use client"

import { useState, useTransition } from "react"
import { TIPOS_DE_EXCEPCION, type ClienteConCasos } from "@/lib/clientes/lectura"
import type { TipoDeExcepcion } from "@/lib/clientes/revision"
import type { Resultado } from "@/lib/marcas/acciones"

interface Props {
  cliente: ClienteConCasos
  marcar: (entrada: unknown) => Promise<Resultado<{ id: string }>>
  quitar: (id: string) => Promise<Resultado>
}

const CAMPO = "w-full rounded-lg border border-borde bg-background px-3 py-3"

export function ExcepcionesDeCliente({ cliente, marcar, quitar }: Props) {
  const [tipo, setTipo] = useState<TipoDeExcepcion>("no_nombrar")
  const [casoSlug, setCasoSlug] = useState("")
  const [alias, setAlias] = useState("")
  const [hasta, setHasta] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()

  function correr(accion: () => Promise<Resultado>) {
    setError(null)
    iniciar(async () => {
      const resultado = await accion()
      if (!resultado.ok) setError(resultado.error)
    })
  }

  return (
    <details className="rounded-lg border border-borde p-3">
      <summary className="min-h-11 cursor-pointer py-2 font-medium">
        {cliente.cliente}
        {cliente.excepciones.length > 0 && <span className="text-apagado"> · {cliente.excepciones.length} excepción</span>}
      </summary>
      <ul className="mt-2 space-y-1 text-sm">
        {cliente.casos.map((c) => (
          <li key={c.slug}>
            {c.titulo} · {c.anio ?? "sin año"} · {c.era === "wav" ? "WAV" : "trayectoria"}
          </li>
        ))}
      </ul>
      {cliente.excepciones.length > 0 && (
        <ul className="mt-3 space-y-2">
          {cliente.excepciones.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
              <span>
                {TIPOS_DE_EXCEPCION[e.tipo]}
                {e.casoSlug && <span className="text-apagado"> · solo {e.casoSlug}</span>}
                {e.hasta && <span className="text-apagado"> · hasta {e.hasta}</span>}
              </span>
              <button
                type="button"
                disabled={pendiente}
                aria-label={`Quitar ${TIPOS_DE_EXCEPCION[e.tipo]}`}
                onClick={() => correr(() => quitar(e.id))}
                className="min-h-11 px-2 text-apagado"
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-3 space-y-3"
        onSubmit={(evento) => {
          evento.preventDefault()
          correr(() => marcar({ cliente: cliente.cliente, ...(casoSlug ? { casoSlug } : {}), tipo, alias, hasta }))
        }}
      >
        <label className="block space-y-1">
          <span className="text-sm">Tipo de excepción</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDeExcepcion)} className={CAMPO}>
            {Object.entries(TIPOS_DE_EXCEPCION).map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </select>
        </label>
        {cliente.casos.length > 0 && (
          <label className="block space-y-1">
            <span className="text-sm">Solo este caso</span>
            <select value={casoSlug} onChange={(e) => setCasoSlug(e.target.value)} className={CAMPO}>
              <option value="">Todos sus casos</option>
              {cliente.casos.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.titulo}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block space-y-1">
          <span className="text-sm">Otros nombres, separados por coma</span>
          <input value={alias} onChange={(e) => setAlias(e.target.value)} className={CAMPO} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm">Hasta (opcional)</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={CAMPO} />
        </label>
        {error && (
          <p role="alert" className="text-sm">
            {error}
          </p>
        )}
        <button type="submit" disabled={pendiente} className="min-h-11 w-full rounded-lg border border-borde px-4 font-medium">
          Marcar excepción
        </button>
      </form>
    </details>
  )
}
```

  The test opens nothing: jsdom renders the contents of a closed `<details>`. If `toBeVisible` fails on them, render the test component with `open` through an optional `abierto` prop (default `false`).
- [ ] **Step 4: Actions and page.** `app/(app)/clientes/acciones.ts`:

```ts
"use server"

import { revalidatePath } from "next/cache"
import { marcarExcepcion, quitarExcepcion } from "@/lib/clientes/acciones"
import type { Resultado } from "@/lib/marcas/acciones"
import { RUTA_DE_CLIENTES } from "@/lib/sesion/rutas"
import { createActionClient } from "@/lib/supabase/action"

export async function marcarExcepcionAccion(entrada: unknown): Promise<Resultado<{ id: string }>> {
  const resultado = await marcarExcepcion(await createActionClient(), entrada)
  if (resultado.ok) revalidatePath(RUTA_DE_CLIENTES)
  return resultado
}

export async function quitarExcepcionAccion(id: string): Promise<Resultado> {
  const resultado = await quitarExcepcion(await createActionClient(), id)
  if (resultado.ok) revalidatePath(RUTA_DE_CLIENTES)
  return resultado
}
```

  `app/(app)/clientes/page.tsx`:

```tsx
import { clientes } from "@/lib/clientes/lectura"
import { createClient } from "@/lib/supabase/server"
import { marcarExcepcionAccion, quitarExcepcionAccion } from "./acciones"
import { ExcepcionesDeCliente } from "./excepciones"

export default async function Clientes() {
  const lista = await clientes(await createClient())
  return (
    <section className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold">Clientes</h1>
      <p className="text-apagado">
        Todos se pueden nombrar salvo los que marques aquí. Nunca se publican precios ni presupuestos.
      </p>
      {lista.length === 0 ? (
        <p>Todavía no hay casos cargados.</p>
      ) : (
        <ul className="space-y-2">
          {lista.map((c) => (
            <li key={c.cliente}>
              <ExcepcionesDeCliente cliente={c} marcar={marcarExcepcionAccion} quitar={quitarExcepcionAccion} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

  A client that is not in the file (a WR3 study) is marked from a simple form at the top of the page: an `ExcepcionesDeCliente` for `{ cliente: nombreEscrito, casos: [], excepciones: [] }`, behind a «Cliente que no está en la lista» input. Add it once the list works.
- [ ] **Step 5: Pass** — `pnpm test:run tests/unit/excepciones.test.tsx && pnpm type && pnpm lint`. In `pnpm dev`, open `/clientes` after `pnpm cargar:casos` and check that the wedding shows «No se nombra».
- [ ] **Step 6: Commit** — `git commit -m "feat: list clients and mark their exceptions"`

## Task 14: A pillar when creating and reviewing a piece

**Files:** Modify `lib/piezas/acciones.ts`, `lib/piezas/lectura.ts`, `app/(app)/piezas/nueva/{page,formulario,acciones}.tsx|ts`, `app/(app)/piezas/[id]/{page,acciones}.tsx|ts`, `tests/unit/formulario-de-pieza.test.tsx`, `tests/integration/acciones-piezas.test.ts`, `scripts/cargar-wr3.ts`. Create `app/(app)/piezas/[id]/pilar.tsx`.

- [ ] **Step 1: Failing tests.** Append to `tests/unit/formulario-de-pieza.test.tsx`:

```tsx
describe("pillar", () => {
  const OTRA = { ...CUENTA, id: "55555555-5555-4555-8555-555555555555", marcaId: "66666666-6666-4666-8666-666666666666", nombre: "Página" }
  const PILARES = [
    { id: "77777777-7777-4777-8777-777777777777", marcaId: CUENTA.marcaId, nombre: "Coherencia" },
    { id: "88888888-8888-4888-8888-888888888888", marcaId: OTRA.marcaId, nombre: "Oficio" },
  ]

  test("offers only the pillars of the chosen account's brand and sends the chosen one", async () => {
    const crear = vi.fn(async () => ({ ok: true as const, piezaId: "44444444-4444-4444-8444-444444444444" }))
    render(<FormularioDePieza cuentas={[CUENTA, OTRA]} pilares={PILARES} crear={crear} />)
    expect(screen.getByRole("option", { name: "Coherencia" })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: "Oficio" })).toBeNull()
    fireEvent.change(screen.getByLabelText("Cuenta"), { target: { value: OTRA.id } })
    fireEvent.change(screen.getByLabelText("Pilar"), { target: { value: PILARES[1]?.id } })
    escribir("Texto")
    crearPieza()
    await waitFor(() =>
      expect(crear).toHaveBeenCalledWith({ cuentaId: OTRA.id, formato: "texto", texto: "Texto", pilarId: PILARES[1]?.id }),
    )
  })

  test("changing the account clears a pillar of another brand", () => {
    render(<FormularioDePieza cuentas={[CUENTA, OTRA]} pilares={PILARES} crear={vi.fn()} />)
    fireEvent.change(screen.getByLabelText("Pilar"), { target: { value: PILARES[0]?.id } })
    fireEvent.change(screen.getByLabelText("Cuenta"), { target: { value: OTRA.id } })
    expect(screen.getByLabelText("Pilar")).toHaveValue("")
  })
})
```

  Append to `tests/integration/acciones-piezas.test.ts` (reuse its owner and account helpers, and create a line with one pillar through `guardar_linea_editorial` as in Task 2):

```ts
test("ponerPilar sets the pillar and answers in Spanish for a pillar of another brand", async () => {
  // owner, account and pillar of its brand as in pilares-de-piezas.test.ts; ajeno = a pillar of another brand
  expect(await ponerPilar(db, { piezaId: pieza, pilarId: pilar })).toEqual({ ok: true })
  expect(await ponerPilar(db, { piezaId: pieza, pilarId: ajeno })).toEqual({
    ok: false,
    error: "Ese pilar es de otra marca.",
  })
})
```

  Write the arrange lines with the file's existing helpers. The two assertions are the contract.
- [ ] **Step 2: Fail** — `pnpm test:run tests/unit/formulario-de-pieza.test.tsx && pnpm test:db tests/integration/acciones-piezas.test.ts`.
- [ ] **Step 3: Implement.**
  - `lib/piezas/acciones.ts`: add messages to `MENSAJES`. `pilar_de_otra_marca` arrives with code 23514 but is not a guard message, so `falla` finds it in `MENSAJES`.

```ts
  pilar_de_otra_marca: "Ese pilar es de otra marca.",
  pilar_inactivo: "Ese pilar ya no está en la línea editorial.",
```

```ts
const PilarDePieza = z.object({ piezaId: z.uuid(), pilarId: z.uuid().nullable() })

export async function ponerPilar(db: Db, entrada: unknown): Promise<Resultado> {
  const leida = PilarDePieza.safeParse(entrada)
  if (!leida.success) return { ok: false, error: DATOS_DE_PIEZA }
  const { error } = await db.rpc("poner_pilar", { p_pieza: leida.data.piezaId, p_pilar: leida.data.pilarId })
  return error ? falla(error) : { ok: true }
}
```

  - `app/(app)/piezas/nueva/formulario.tsx`: add the `pilares?: { id: string; marcaId: string; nombre: string }[]` prop with default `[]`. Add a `pilarId` state, cleared when the account changes (`setCuentaId(v); setPilarId("")`). Below «Cuenta», render the select only when the brand has pillars:

```tsx
      {pilaresDeLaCuenta.length > 0 && (
        <label className="block space-y-1">
          <span className="text-sm">Pilar</span>
          <select value={pilarId} onChange={(evento) => setPilarId(evento.target.value)} className={CAMPO}>
            <option value="">Sin pilar</option>
            {pilaresDeLaCuenta.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
      )}
```

    `pilaresDeLaCuenta = pilares.filter((p) => p.marcaId === cuentas.find((c) => c.id === cuentaId)?.marcaId)`. Both `crear(...)` calls spread `...(pilarId ? { pilarId } : {})`, so the existing assertions stay exact.
  - `app/(app)/piezas/nueva/page.tsx`: pass `pilares={await pilaresActivos(db)}`.
  - `app/(app)/piezas/nueva/acciones.ts`: after the plan, and without failing the creation:

```ts
  const pilar = z.object({ pilarId: z.uuid() }).safeParse(entrada)
  if (pilar.success) {
    const puesto = await ponerPilar(db, { piezaId: resultado.piezaId, pilarId: pilar.data.pilarId })
    if (!puesto.ok) console.error("No pude poner el pilar de la pieza nueva", resultado.piezaId, puesto.error)
  }
```

  - `lib/piezas/lectura.ts` `detalle`: select `pilar_id` and `cuentas(id, nombre, tipo, ruta, marca_id, marcas(voz))`. Add `pilarId: string | null`, `cuenta.marcaId` and `cuenta.voz: "yo" | "nosotros"` to `DetalleDePieza`.
  - `app/(app)/piezas/[id]/pilar.tsx`: a client select labelled «Pilar», with «Sin pilar» and the brand's active pillars. On change it calls `ponerPilarAccion({ piezaId, pilarId: valor || null })` and shows the error with `role="alert"`. `app/(app)/piezas/[id]/acciones.ts` adds `ponerPilarAccion(entrada) => despues(entrada.piezaId, await ponerPilar(...))`. The page shows it while the piece is `por_aprobar`, `en_reserva` or `programada`, with the brand's pillars taken from `pilaresActivos(db)` filtered by `cuenta.marcaId`.
  - `scripts/cargar-wr3.ts`: look up the active WAV pillar named «Escuchar antes de decidir». Insert new pieces with `pilar_id`, and give it to existing ones that have none. If the pillar does not exist, print «Sin pilar: carga primero la línea de WAV (pnpm cargar:linea).» once and continue with `null`.
- [ ] **Step 4: Pass** — `pnpm test:run && pnpm test:db && pnpm type && pnpm lint`.
- [ ] **Step 5: Commit** — `git commit -m "feat: choose a piece's pillar when creating and reviewing it"`

## Task 15: The verdict at gate 1

**Files:** Create `app/(app)/piezas/[id]/veredicto.tsx`, `tests/unit/veredicto.test.tsx`. Modify `app/(app)/piezas/[id]/page.tsx`.

- [ ] **Step 1: Failing test** `tests/unit/veredicto.test.tsx`

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { Veredicto } from "@/app/(app)/piezas/[id]/veredicto"

describe("Veredicto", () => {
  test("says the review found nothing", () => {
    render(<Veredicto hallazgos={[]} />)
    expect(screen.getByText("Revisión sin IA: no encontré clientes con excepción, menciones con @ ni precios.")).toBeVisible()
  })

  test("lists each finding and does not block the signature", () => {
    render(
      <Veredicto
        hallazgos={[
          { tipo: "cliente", cliente: "Copec", excepcion: "no_nombrar", fragmento: "Copec" },
          { tipo: "precio", fragmento: "$100" },
        ]}
      />,
    )
    expect(screen.getByRole("heading", { name: "Revisa antes de firmar" })).toBeVisible()
    expect(screen.getByText("Nombra a Copec, que no se nombra.")).toBeVisible()
    expect(screen.getByText("«$100»: nunca se publican precios ni presupuestos.")).toBeVisible()
    expect(screen.getByText("Puedes firmar igual: tú decides.")).toBeVisible()
  })
})
```

- [ ] **Step 2: Fail** — `pnpm test:run tests/unit/veredicto.test.tsx`.
- [ ] **Step 3: Implement** `app/(app)/piezas/[id]/veredicto.tsx`

```tsx
import { type Hallazgo, mensajeDe } from "@/lib/clientes/revision"

export function Veredicto({ hallazgos }: { hallazgos: Hallazgo[] }) {
  if (hallazgos.length === 0) {
    return (
      <p className="text-sm text-apagado">
        Revisión sin IA: no encontré clientes con excepción, menciones con @ ni precios.
      </p>
    )
  }
  return (
    <section aria-labelledby="veredicto" className="space-y-2 rounded-lg border border-borde p-3">
      <h2 id="veredicto" className="font-medium">
        Revisa antes de firmar
      </h2>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {/* The same words found twice say the same thing: one line each. */}
        {[...new Set(hallazgos.map(mensajeDe))].map((mensaje) => (
          <li key={mensaje}>{mensaje}</li>
        ))}
      </ul>
      <p className="text-sm text-apagado">Puedes firmar igual: tú decides.</p>
    </section>
  )
}
```

  In `app/(app)/piezas/[id]/page.tsx`, for `estado === "por_aprobar"` only, compute on the server and render `<Veredicto>` right above `<FirmaDePieza>`:

```tsx
  const hallazgos =
    estado === "por_aprobar"
      ? prepararRevision(await leerExcepciones(db), diaEnSantiago(Date.now())).revisar(
          [version.titulo, version.texto].filter(Boolean).join("\n"),
          cuenta.voz,
        )
      : []
```

  `db` is the page's `createClient()`, reused for `detalle` and `leerExcepciones`. The review compiles once per request (10 ms CPU budget).
- [ ] **Step 4: Pass** — `pnpm test:run && pnpm type && pnpm lint`. In `pnpm dev`, mark an exception for a client, create a piece naming it, and check the verdict on its page.
- [ ] **Step 5: Commit** — `git commit -m "feat: show a review without AI at gate 1"`

## Task 16: Pillar balance in the calendar

**Files:** Create `app/(app)/calendario/pilares.tsx`, `tests/unit/pilares-del-calendario.test.tsx`. Modify `app/(app)/calendario/page.tsx`.

- [ ] **Step 1: Failing test** `tests/unit/pilares-del-calendario.test.tsx`

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { PilaresDelCalendario } from "@/app/(app)/calendario/pilares"

const BALANCE = {
  cuentaId: "c1",
  cuenta: "Página de WAV",
  marcaId: "m1",
  balance: {
    sinPilar: 2,
    filas: [
      { pilarId: "p1", nombre: "Detrás del trabajo", salieron: 3, meta: 4, planeadas: 1, diasSinSalir: 2, alerta: false },
      { pilarId: "p2", nombre: "Oficio", salieron: 0, meta: 2, planeadas: 0, diasSinSalir: 16, alerta: true },
    ],
  },
}

describe("PilaresDelCalendario", () => {
  test("shows each pillar against its four-week target, the alerts and the pieces without a pillar", () => {
    render(<PilaresDelCalendario balances={[BALANCE]} />)
    expect(screen.getByRole("heading", { name: "Pilares · últimas 4 semanas" })).toBeVisible()
    expect(screen.getByText("Detrás del trabajo: 3 de 4 · 1 en camino")).toBeVisible()
    expect(screen.getByText("«Oficio» lleva 16 días sin salir en Página de WAV.")).toBeVisible()
    expect(screen.getByText("2 piezas sin pilar.")).toBeVisible()
  })

  test("says nothing when no account has pillars", () => {
    const { container } = render(<PilaresDelCalendario balances={[{ ...BALANCE, balance: { filas: [], sinPilar: 0 } }]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 2: Fail** — `pnpm test:run tests/unit/pilares-del-calendario.test.tsx`.
- [ ] **Step 3: Implement** `app/(app)/calendario/pilares.tsx`

```tsx
import { lineaDeAlerta, SEMANAS_DE_PROPORCION } from "@/lib/voz/balance"
import type { BalanceDeCuenta } from "@/lib/voz/lectura"

export function PilaresDelCalendario({ balances }: { balances: BalanceDeCuenta[] }) {
  const conPilares = balances.filter((b) => b.balance.filas.length > 0)
  if (conPilares.length === 0) return null
  return (
    <section aria-labelledby="pilares" className="space-y-3">
      <h2 id="pilares" className="text-lg font-semibold">
        Pilares · últimas {SEMANAS_DE_PROPORCION} semanas
      </h2>
      {conPilares.map(({ cuentaId, cuenta, balance }) => (
        <div key={cuentaId} className="space-y-1 rounded-lg border border-borde p-3 text-sm">
          <p className="font-medium">{cuenta}</p>
          <ul className="space-y-1">
            {balance.filas.map((f) => (
              <li key={f.pilarId}>
                {f.nombre}: {f.salieron} de {f.meta}
                {f.planeadas > 0 && ` · ${f.planeadas} en camino`}
              </li>
            ))}
          </ul>
          {balance.filas
            .filter((f) => f.alerta)
            .map((f) => (
              <p key={f.pilarId} className="font-medium">
                {lineaDeAlerta(f.nombre, f.diasSinSalir, cuenta)}
              </p>
            ))}
          {balance.sinPilar > 0 && (
            <p className="text-apagado">{balance.sinPilar === 1 ? "1 pieza sin pilar." : `${balance.sinPilar} piezas sin pilar.`}</p>
          )}
        </div>
      ))}
    </section>
  )
}
```

  In `app/(app)/calendario/page.tsx`, read `balancePorCuenta(db, ahora)` in parallel with `calendario`, reusing one `createClient()`, and render `<PilaresDelCalendario balances={...} />` after the week or month view.
- [ ] **Step 4: Pass** — `pnpm test:run && pnpm type && pnpm lint`.
- [ ] **Step 5: Commit** — `git commit -m "feat: show each account's pillar balance in the calendar"`

# Part 4 — Background

## Task 17: The publisher re-checks client exceptions

**Files:** Modify `lib/publicacion/publicar.ts`, `lib/publicacion/repositorio.ts`, `tests/unit/publicar.test.ts`.

- [ ] **Step 1: Failing tests.** In `tests/unit/publicar.test.ts`, add to the `m` ports `excepcionesVigentes: vi.fn(async (): Promise<Excepcion[]> => [])` (import `type Excepcion` from `@/lib/clientes/revision`), and append:

```ts
describe("client exceptions right before sending", () => {
  const COPEC: Excepcion = { cliente: "Copec", alias: [], tipo: "no_nombrar", hasta: null }

  test("a client that got an exception after the signature sends the piece back to the gate and nothing goes out", async () => {
    const { p, m, estadoDe } = puertos()
    m.excepcionesVigentes.mockResolvedValue([COPEC])
    expect(await publicarPieza(p, pieza({ version: { ...pieza().version, texto: "Con Copec en 2019" } }))).toBe("por_aprobar")
    expect(m.linkedin.crearPost).not.toHaveBeenCalled()
    expect(m.reservarEnvio).not.toHaveBeenCalled()
    expect(m.mover).toHaveBeenCalledWith(
      "pieza-1",
      "por_aprobar",
      "Nombra a Copec, que ahora tiene una excepción. Revisa el texto y fírmala de nuevo.",
    )
    expect(m.avisar).toHaveBeenCalledTimes(1)
    expect(estadoDe("pieza-1")).toBe("por_aprobar")
  })

  test("the carousel title is checked too", async () => {
    const { p, m } = puertos()
    m.excepcionesVigentes.mockResolvedValue([COPEC])
    const conTitulo = carrusel()
    expect(await publicarPieza(p, { ...conTitulo, version: { ...conTitulo.version, titulo: "Copec 85 años" } })).toBe(
      "por_aprobar",
    )
    expect(m.linkedin.subirDocumento).not.toHaveBeenCalled()
  })

  test("an exception that ended yesterday does not stop the piece", async () => {
    const { p, m } = puertos()
    m.excepcionesVigentes.mockResolvedValue([{ ...COPEC, hasta: "2026-11-02" }])
    expect(await publicarPieza(p, pieza({ version: { ...pieza().version, texto: "Con Copec" } }))).toBe("publicada")
  })

  test("when the exceptions cannot be read nothing is sent and the run retries", async () => {
    const { p, m } = puertos()
    m.excepcionesVigentes.mockRejectedValue(new Error("base caída"))
    await expect(publicarPieza(p, pieza())).rejects.toThrow("base caída")
    expect(m.linkedin.crearPost).not.toHaveBeenCalled()
  })
})
```

  `AHORA` is 2026-11-03 14:05 UTC, which is 2026-11-03 in Chile, so `hasta: "2026-11-02"` has ended.
- [ ] **Step 2: Fail** — `pnpm test:run tests/unit/publicar.test.ts`.
- [ ] **Step 3: Implement** in `lib/publicacion/publicar.ts`:

```ts
import { type Excepcion, prepararRevision } from "@/lib/clientes/revision"
import { diaEnSantiago } from "@/lib/piezas/calendario"
```

  Add to `PuertosDePublicacion`:

```ts
  /** Active client exceptions (D13). A failure throws: without them the piece is not sent this run. */
  excepcionesVigentes(): Promise<Excepcion[]>
```

  Then, as the first lines of `publicarPieza`:

```ts
  // «Confidencialidad de clientes»: an exception marked after the signature stops the piece before anything happens.
  // If the exceptions cannot be read this throws; publicarPendientes counts it as «reintentar» and nothing was sent.
  const revisor = prepararRevision(await p.excepcionesVigentes(), diaEnSantiago(p.ahora()))
  const [nombrado] = revisor.clientes([pieza.version.titulo, pieza.version.texto].filter(Boolean).join("\n"))
  if (nombrado?.tipo === "cliente") {
    return devolver(
      p,
      pieza,
      "por_aprobar",
      `Nombra a ${nombrado.cliente}, que ahora tiene una excepción. Revisa el texto y fírmala de nuevo.`,
    )
  }
```

  `devolver(..., "por_aprobar")` without `porHorario` goes through `p.mover`, which in the repository calls `devolver_pieza(..., false)`. That drops a reserve signature, so the piece cannot be picked again and fail again, and it pushes «No salió» at once.
  In `lib/publicacion/repositorio.ts`, add `"excepcionesVigentes"` to `PuertosDeBase` and to the returned object: `excepcionesVigentes: () => leerExcepciones(db)` (import from `@/lib/clientes/lectura`).
- [ ] **Step 4: Pass** — `pnpm test:run && pnpm test:db && pnpm type`. The existing `repositorio-publicacion` integration test still type-checks, because `PuertosDeBase` is a `Pick`.
- [ ] **Step 5: Commit** — `git commit -m "feat: stop a piece that names a client with a new exception before sending"`

## Task 18: Pillar alerts in the digest

**Files:** Modify `lib/avisos/resumen.ts`, `lib/avisos/enviar-resumen.ts`, `tests/unit/resumen.test.ts`.

- [ ] **Step 1: Failing test.** In `tests/unit/resumen.test.ts`, change `VACIO` to include `pilares: []`, and append:

```ts
test("adds a line for each pillar two weeks without coming out, after the gaps", () => {
  const aviso = armarResumen({
    ...VACIO,
    huecos: [{ cuenta: "Perfil", faltan: 1, semana: "esta" }],
    pilares: [
      { cuenta: "Página de WAV", pilar: "Oficio", dias: 16 },
      { cuenta: "Perfil", pilar: "Coherencia", dias: null },
    ],
  })
  expect(aviso?.cuerpo).toBe(
    [
      "Faltan 1 en Perfil esta semana.",
      "«Oficio» lleva 16 días sin salir en Página de WAV.",
      "«Coherencia» no ha salido en Perfil en más de dos semanas.",
    ].join("\n"),
  )
})
```

- [ ] **Step 2: Fail** — `pnpm test:run tests/unit/resumen.test.ts`.
- [ ] **Step 3: Implement.** In `lib/avisos/resumen.ts`, add to `EstadoDelResumen`:

```ts
  /** D20: pillars two weeks without coming out (lib/voz/balance.ts decides which). */
  pilares: { cuenta: string; pilar: string; dias: number | null }[]
```

  After the `huecos` lines in `armarResumen`: `...e.pilares.map((p) => lineaDeAlerta(p.pilar, p.dias, p.cuenta)),` (import from `@/lib/voz/balance`).
  In `lib/avisos/enviar-resumen.ts`:
  - `vacio()` returns `pilares: []`.
  - At the end of `estadoPorMarca`:

```ts
  for (const { marcaId, cuenta, balance } of await balancePorCuenta(db, ahora)) {
    for (const f of balance.filas.filter((f) => f.alerta)) {
      de(marcaId).pilares.push({ cuenta, pilar: f.nombre, dias: f.diasSinSalir })
    }
  }
```

  - Where `enviarResumenes` folds each brand into the person's `estado`, concatenate `pilares` the same way it concatenates `reservas` and `huecos`.
- [ ] **Step 4: Pass** — `pnpm test:run && pnpm test:db tests/integration/resumen.test.ts && pnpm type`.
- [ ] **Step 5: Commit** — `git commit -m "feat: tell the digest about pillars two weeks without coming out"`

## Task 19: End to end, verify locally, and the production gate

**Files:** Create `tests/e2e/voz-y-clientes.spec.ts`.

- [ ] **Step 1: E2E** `tests/e2e/voz-y-clientes.spec.ts`. Copy `codigoPara` and the sign-in from `tests/e2e/piezas.spec.ts`; if the copy grows, move both to `tests/e2e/ingreso.ts` and import them from the two specs. One test runs this path:
  1. Invite an owner (`voz: "nosotros"`) and give them an `api` account.
  2. Seed one case with the service role: slug `prueba-e2e-<random>`, client «Cliente E2E <random>».
  3. Sign in, go to `/ajustes`, then «Voz y línea editorial», then the brand.
  4. Fill «Tono y voz», name the pillar «Oficio» and save. Expect «Guardada como versión 1.».
  5. Go to `/clientes`, open the client and mark «No se nombra».
  6. Go to «Nueva», choose the pillar «Oficio», and write «Con Cliente E2E <random> en terreno.».
  7. Create the piece. Expect «Revisa antes de firmar» and «Nombra a Cliente E2E <random>, que no se nombra.», and «Firmar y programar» still enabled.
- [ ] **Step 2: Verify locally.** Run, in order:
  1. `pnpm db:reset && pnpm db:types`.
  2. `pnpm test:run`, `pnpm test:db`, `pnpm type`, `pnpm lint`.
  3. `pnpm test:e2e` against `pnpm dev`, then again against `pnpm preview` (workerd).
  4. Check the size from the preview build: `gzip -c .open-next/worker.js | wc -c` plus the reported total. If it passes 3,072 KiB, that is Gate 4: stop and ask.
  5. `pnpm exec trigger deploy --dry-run` builds the 4 existing tasks with the new code.
- [ ] **Step 3: GATE · push and PR (Federico approves).** `git push -u origin fase-1d-voz-y-clientes`, then `gh pr create`. The body lists what D adds and this checklist. CI runs the tests and deploys nothing.
- [ ] **Step 4: GATE · production migration (Federico approves).** With CI green, run `supabase db push --dry-run`; it should list only `20261031120000_voz_y_clientes.sql`. Then run `supabase db push`, and check that `supabase migration list` shows it on both sides.
- [ ] **Step 5: GATE · merge (Federico approves).** Run `gh pr merge <n> --merge`. Federico says when the deploy is green; do not poll. Then check that `/voz` and `/clientes` answer 307 to `/ingreso` without a session, and that the next `publicar-pendientes` run on the new version completes.
- [ ] **Step 6: GATE · production data (Federico approves each).**
  1. `pnpm cargar:casos:prod`: expect «105 casos de 64 clientes» and the private event's exception.
  2. Export «Línea editorial de WAV» and «Línea editorial de Federico» to markdown with the Claude Docs export into the scratchpad, never into the repo.
  3. For WAV, run `pnpm cargar:linea:prod --marca WAV --archivo <ruta> --probar`. Show Federico the sections and the 4 pillars with their weekly targets, and run it without `--probar` only after his yes.
  4. Do the same for his brand, which shows 3 pillars. Use its exact name from `marcas`.
- [ ] **Step 7: Close.** Update the `estado-fase-1` memory: D is in production, and the next block is 4, design and content engine.

---

## Self-review

- **Spec coverage:**

  | Scope item | Tasks |
  |---|---|
  | 1. Pillars and versions | 1, 4, 8, 10, 12 |
  | 2. `piezas.pilar_id`, form and WR3 | 2, 14 |
  | 3. D20 balance in the calendar and digest | 6, 8, 16, 18 |
  | 4. Cases table and load | 3, 7, 10 |
  | 5. Exceptions, defaults and Clientes screen | 3, 7, 9, 13 |
  | 6. Review at gate 1 and before sending | 5, 15, 17 |
  | 7. Verification and gates | 19 |

  The «link from Ajustes» is Task 11.
- **Placeholders:** every step that changes code shows the code. These steps reference code instead of repeating it:
  - Task 14 Step 1 (integration arrange lines) and the detail-page pillar select describe what to write against existing helpers.
  - Task 19 Step 1 lists the E2E path as steps.
- **Type consistency:**
  - `Excepcion`, `Hallazgo` and `TipoDeExcepcion` live in `lib/clientes/revision.ts`, and `leerExcepciones` returns `Excepcion[]`.
  - `PilarDeLinea`, `SeccionesDeLinea` and `LineaParaGuardar` live in `lib/voz/linea.ts`.
  - `Balance`, `FilaDeBalance` and `lineaDeAlerta` live in `lib/voz/balance.ts`, and `BalanceDeCuenta` in `lib/voz/lectura.ts`.
  - The JSON keys for sections and pillars (`deQueHablamos`, `tono`, `formatos`, `temasVetados`, `temasAVigilar`, `ejemplos`, and `deQueHabla`, `material`, `porSemana`) match between zod, the RPC and the snapshot.
  - RPC errors map to Spanish in `lib/voz/acciones.ts`, `lib/clientes/acciones.ts` and `lib/piezas/acciones.ts`.
