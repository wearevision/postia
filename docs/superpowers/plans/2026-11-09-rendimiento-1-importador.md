# Rendimiento, bloque 1: importador del perfil — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Federico uploads the XLSX that LinkedIn exports from his profile analytics and PostIA stores, per account, the figures of each post (matched to PostIA's pieces by URN), the daily totals and the detailed audience.

**Architecture:** The browser reads the XLSX (`read-excel-file`) into plain rows per sheet, so the Worker never unzips a file. A pure function (`leerExportacion`) turns those rows into a typed export or a Spanish error. A server action validates it with zod and calls one `security definer` RPC (`importar_metricas`) that writes everything in one transaction, idempotently, owners only. Spec: `docs/superpowers/specs/2026-11-09-rendimiento-design.md` (block 1).

**Tech Stack:** Next.js 16 App Router (server actions), Supabase Postgres + RLS, zod 4, Vitest (unit + `test:db` integration), `read-excel-file`.

**Rules for every task:** strict TDD (failing test first, run it, then code); English code and commits, Spanish UI; `pnpm format` (never `biome --unsafe`); after editing a client file, line 1 must still be `"use client"`; never `pnpm db:reset`; apply migrations locally with `supabase migration up --local`; `test:db` runs one at a time (the config takes `$TMPDIR/postia-test-db.lock`); commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## File structure

| File | Responsibility |
|---|---|
| `lib/rendimiento/exportacion.ts` (new) | Pure parser: rows per sheet → `Exportacion` or Spanish error. No I/O. |
| `lib/rendimiento/acciones.ts` (new) | `importarEstadisticas(db, entrada)`: zod validation, RPC call, error messages. Worker-safe. |
| `lib/rendimiento/lector.ts` (new) | Browser adapter: `File` → rows per sheet with `read-excel-file`. |
| `supabase/migrations/20261109170000_metricas.sql` (new) | Tables, RLS, `importar_metricas` RPC. |
| `app/(app)/ajustes/importar-estadisticas.tsx` (new) | Client form: account, file, summary. |
| `app/(app)/ajustes/acciones.ts` (modify) | `importarEstadisticasAccion`. |
| `app/(app)/ajustes/page.tsx` (modify) | Renders the form with the profile accounts. |
| `tests/unit/exportacion-de-linkedin.test.ts` (new) | Parser tests. |
| `tests/unit/importar-estadisticas.test.tsx` (new) | Form tests. |
| `tests/integration/metricas.test.ts` (new) | RPC, RLS, idempotency, URN match. |
| `tests/integration/acciones-rendimiento.test.ts` (new) | Server-side action over local Supabase. |
| `tests/integration/entorno.ts` (modify) | `publicadaConUrn` helper. |

---

### Task 1: Parser of the LinkedIn export

**Files:**
- Create: `lib/rendimiento/exportacion.ts`
- Test: `tests/unit/exportacion-de-linkedin.test.ts`

The export (Spanish UI) has these sheets; names are cut at 31 characters, so match by prefix:
`DESCUBRIMIENTO` (row 0: `["Rendimiento general", "10/11/2025 - 9/11/2026"]`), `INTERACCIÓN` (header `Fecha, Impresiones, Interacciones`, one row per day), `SEGUIDORES` (row 0: `["Total de seguidores el 9/11/2026", 3448]`, header at row 2, then `Fecha, Nuevos seguidores`), `PUBLICACIONES PRINCIPALES` (header at row 2; columns 0-2 = URL, date, interactions; columns 4-6 = URL, date, impressions; two lists that may differ), `INFORMACIÓN DETALLADA DEL PÚBLI` and `INFORMACIÓN DETALLADA DEL CONTE` (header `Información detallada principal, Valor, Porcentaje`; percentages like `"4 %"` or `"< 1 %"`). Cells may come as strings or numbers.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/exportacion-de-linkedin.test.ts
import { describe, expect, test } from "vitest"
import { type Hojas, leerExportacion } from "@/lib/rendimiento/exportacion"

const URL_SHARE = "https://www.linkedin.com/posts/federico_a-veces-share-7395845008874020865-luFZ"
const URL_UGC = "https://www.linkedin.com/posts/federico_hackathon-ugcPost-7396634456431751170-EffQ"

function hojas(cambios: Partial<Hojas> = {}): Hojas {
  return {
    DESCUBRIMIENTO: [["Rendimiento general", "10/11/2025 - 9/11/2026"], ["Impresiones", "3663"]],
    "INTERACCIÓN": [
      ["Fecha", "Impresiones", "Interacciones"],
      ["10/11/2025", "0", "0"],
      ["16/11/2025", 962, 18],
    ],
    SEGUIDORES: [
      ["Total de seguidores el 9/11/2026", 3448],
      ["", ""],
      ["Fecha", "Nuevos seguidores"],
      ["16/11/2025", "4"],
    ],
    "PUBLICACIONES PRINCIPALES": [
      ["Esta lista puede incluir 50 publicaciones"],
      [],
      ["URL de la publicación", "Fecha de publicación", "Interacciones", "", "URL de la publicación", "Fecha de publicación", "Impresiones"],
      [URL_SHARE, "16/11/2025", "18", "", URL_SHARE, "16/11/2025", "962"],
      ["", "", "", "", URL_UGC, "18/11/2025", "337"],
    ],
    "INFORMACIÓN DETALLADA DEL PÚBLI": [
      ["Información detallada principal", "Valor", "Porcentaje"],
      ["Empresa", "CCU", "< 1 %"],
      ["Cargo", "Gerente de marketing", "3 %"],
    ],
    "INFORMACIÓN DETALLADA DEL CONTE": [
      ["Información detallada principal", "Valor", "Porcentaje"],
      ["Empresa", "MGC Global Group", "4 %"],
    ],
    ...cambios,
  }
}

describe("leerExportacion", () => {
  test("reads the period, the followers total and each post's URN with its figures", () => {
    const r = leerExportacion(hojas())
    if (!r.ok) throw new Error(r.error)
    expect(r.desde).toBe("2025-11-10")
    expect(r.hasta).toBe("2026-11-09")
    expect(r.seguidoresTotal).toBe(3448)
    expect(r.publicaciones).toEqual([
      { postUrn: "urn:li:share:7395845008874020865", publicadaEl: "2025-11-16", interacciones: 18, impresiones: 962 },
      { postUrn: "urn:li:ugcPost:7396634456431751170", publicadaEl: "2025-11-18", interacciones: null, impresiones: 337 },
    ])
  })

  test("joins the daily figures with the new followers of the same day", () => {
    const r = leerExportacion(hojas())
    if (!r.ok) throw new Error(r.error)
    expect(r.dias).toEqual([
      { dia: "2025-11-10", impresiones: 0, interacciones: 0, seguidoresNuevos: null },
      { dia: "2025-11-16", impresiones: 962, interacciones: 18, seguidoresNuevos: 4 },
    ])
  })

  test("keeps the audience of followers and of viewers, with «< 1 %» as below one, not zero", () => {
    const r = leerExportacion(hojas())
    if (!r.ok) throw new Error(r.error)
    expect(r.publico).toEqual([
      { tipo: "publico", categoria: "Empresa", valor: "CCU", porcentaje: null, menorAUno: true },
      { tipo: "publico", categoria: "Cargo", valor: "Gerente de marketing", porcentaje: 3, menorAUno: false },
      { tipo: "contenido", categoria: "Empresa", valor: "MGC Global Group", porcentaje: 4, menorAUno: false },
    ])
  })

  test("a post URL with no share or ugcPost id is counted, not guessed", () => {
    const r = leerExportacion(
      hojas({
        "PUBLICACIONES PRINCIPALES": [
          [], [], ["URL de la publicación"],
          ["https://www.linkedin.com/posts/federico_algo-activity-1-x", "16/11/2025", "3", "", "", "", ""],
        ],
      }),
    )
    if (!r.ok) throw new Error(r.error)
    expect(r.publicaciones).toEqual([])
    expect(r.sinIdentificar).toBe(1)
  })

  test("a file that is not LinkedIn's export says so in Spanish", () => {
    expect(leerExportacion({ Hoja1: [["a", "b"]] })).toEqual({
      ok: false,
      error: "Ese archivo no es la exportación de estadísticas de LinkedIn. Descárgalo desde Analytics de tu perfil.",
    })
  })

  test("a missing sheet is named", () => {
    const { SEGUIDORES: _, ...sinSeguidores } = hojas()
    expect(leerExportacion(sinSeguidores)).toEqual({ ok: false, error: "Al archivo le falta la hoja «SEGUIDORES»." })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/exportacion-de-linkedin.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/rendimiento/exportacion"`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/rendimiento/exportacion.ts
import type { Resultado } from "@/lib/marcas/acciones"

// Pure: the browser reads the XLSX into rows (lib/rendimiento/lector.ts) and this turns them into figures.

export type Celda = string | number | null | undefined
export type Hojas = Record<string, Celda[][]>

export interface PublicacionExportada {
  postUrn: string
  publicadaEl: string
  interacciones: number | null
  impresiones: number | null
}

export interface DiaExportado {
  dia: string
  impresiones: number
  interacciones: number
  seguidoresNuevos: number | null
}

export interface FilaDePublico {
  tipo: "publico" | "contenido"
  categoria: string
  valor: string
  porcentaje: number | null
  menorAUno: boolean
}

export interface Exportacion {
  desde: string
  hasta: string
  seguidoresTotal: number | null
  publicaciones: PublicacionExportada[]
  /** Posts whose URL carries no share or ugcPost id: they cannot be matched, so they are only counted. */
  sinIdentificar: number
  dias: DiaExportado[]
  publico: FilaDePublico[]
}

// LinkedIn cuts sheet names at 31 characters, so they are matched by prefix.
const HOJAS = {
  descubrimiento: "DESCUBRIMIENTO",
  interaccion: "INTERACCIÓN",
  seguidores: "SEGUIDORES",
  publicaciones: "PUBLICACIONES PRINCIPALES",
  publico: "INFORMACIÓN DETALLADA DEL PÚBLI",
  contenido: "INFORMACIÓN DETALLADA DEL CONTE",
} as const

const NO_ES_LINKEDIN =
  "Ese archivo no es la exportación de estadísticas de LinkedIn. Descárgalo desde Analytics de tu perfil."

function hoja(hojas: Hojas, prefijo: string): Celda[][] | undefined {
  const nombre = Object.keys(hojas).find((n) => n.trim().toUpperCase().startsWith(prefijo))
  return nombre === undefined ? undefined : hojas[nombre]
}

const texto = (c: Celda) => (c === null || c === undefined ? "" : String(c).trim())

function entero(c: Celda): number | null {
  const t = texto(c).replace(/[.\s ]/g, "")
  return /^\d+$/.test(t) ? Number(t) : null
}

/** «16/11/2025» → «2025-11-16». */
function fecha(c: Celda): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto(c))
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null
}

const ID_DE_PUBLICACION = /-(share|ugcPost)-(\d+)(?:-|$)/

function urnDe(url: Celda): string | null {
  const m = ID_DE_PUBLICACION.exec(texto(url))
  return m ? `urn:li:${m[1]}:${m[2]}` : null
}

function porcentaje(c: Celda): { porcentaje: number | null; menorAUno: boolean } {
  const t = texto(c).replace(/ /g, " ")
  if (t.startsWith("<")) return { porcentaje: null, menorAUno: true }
  const n = Number.parseFloat(t.replace("%", "").replace(",", "."))
  return { porcentaje: Number.isFinite(n) ? n : null, menorAUno: false }
}

function publicaciones(filas: Celda[][]): { lista: PublicacionExportada[]; sinIdentificar: number } {
  const porUrn = new Map<string, PublicacionExportada>()
  let sinIdentificar = 0
  const anotar = (url: Celda, dia: Celda, valor: Celda, campo: "interacciones" | "impresiones") => {
    if (!texto(url)) return
    const urn = urnDe(url)
    if (!urn) {
      sinIdentificar++
      return
    }
    const actual = porUrn.get(urn) ?? { postUrn: urn, publicadaEl: fecha(dia) ?? "", interacciones: null, impresiones: null }
    actual[campo] = entero(valor)
    porUrn.set(urn, actual)
  }
  for (const fila of filas.slice(3)) {
    anotar(fila[0], fila[1], fila[2], "interacciones")
    anotar(fila[4], fila[5], fila[6], "impresiones")
  }
  return { lista: [...porUrn.values()].filter((p) => p.publicadaEl !== ""), sinIdentificar }
}

function publico(filas: Celda[][], tipo: FilaDePublico["tipo"]): FilaDePublico[] {
  return filas
    .slice(1)
    .filter((f) => texto(f[0]) && texto(f[1]))
    .map((f) => ({ tipo, categoria: texto(f[0]), valor: texto(f[1]), ...porcentaje(f[2]) }))
}

export function leerExportacion(hojas: Hojas): Resultado<Exportacion> {
  const encontradas = Object.fromEntries(
    Object.entries(HOJAS).map(([clave, prefijo]) => [clave, hoja(hojas, prefijo)]),
  ) as Record<keyof typeof HOJAS, Celda[][] | undefined>
  if (!encontradas.descubrimiento && !encontradas.publicaciones) return { ok: false, error: NO_ES_LINKEDIN }
  for (const [clave, prefijo] of Object.entries(HOJAS)) {
    if (!encontradas[clave as keyof typeof HOJAS]) return { ok: false, error: `Al archivo le falta la hoja «${prefijo}».` }
  }
  const { descubrimiento, interaccion, seguidores, publicaciones: principales } = encontradas as Record<
    keyof typeof HOJAS,
    Celda[][]
  >

  const [inicio, fin] = texto(descubrimiento[0]?.[1]).split(/\s*-\s*/)
  const desde = fecha(inicio)
  const hasta = fecha(fin)
  if (!desde || !hasta) return { ok: false, error: NO_ES_LINKEDIN }

  const nuevos = new Map<string, number>()
  for (const fila of seguidores.slice(3)) {
    const dia = fecha(fila[0])
    const n = entero(fila[1])
    if (dia && n !== null) nuevos.set(dia, n)
  }
  const dias: DiaExportado[] = interaccion.slice(1).flatMap((fila) => {
    const dia = fecha(fila[0])
    const impresiones = entero(fila[1])
    const interacciones = entero(fila[2])
    if (!dia || impresiones === null || interacciones === null) return []
    return [{ dia, impresiones, interacciones, seguidoresNuevos: nuevos.get(dia) ?? null }]
  })

  const { lista, sinIdentificar } = publicaciones(principales)
  return {
    ok: true,
    desde,
    hasta,
    seguidoresTotal: entero(seguidores[0]?.[1]),
    publicaciones: lista,
    sinIdentificar,
    dias,
    publico: [
      ...publico(encontradas.publico ?? [], "publico"),
      ...publico(encontradas.contenido ?? [], "contenido"),
    ],
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/exportacion-de-linkedin.test.ts`
Expected: PASS (6 tests). Then `pnpm format && pnpm type && pnpm lint`.

- [ ] **Step 5: Commit**

```bash
git add lib/rendimiento/exportacion.ts tests/unit/exportacion-de-linkedin.test.ts
git commit -m "feat: parse the LinkedIn analytics export into per-post, daily and audience figures"
```

---

### Task 2: Tables, RLS and the import RPC

**Files:**
- Create: `supabase/migrations/20261109170000_metricas.sql`
- Modify: `tests/integration/entorno.ts` (add `publicadaConUrn`)
- Test: `tests/integration/metricas.test.ts`
- Regenerate: `lib/supabase/database.types.ts` (`pnpm db:types`)

- [ ] **Step 1: Add the test helper**

Append to `tests/integration/entorno.ts`:

```ts
/** A piece of `cuentaId` that PostIA published as `urn`: signed by its owner, then sent (the row a publish leaves). */
export async function publicadaConUrn(db: Db, cuentaId: string, urn: string): Promise<string> {
  const pieza = await piezaDe(db, cuentaId)
  const { id: version, huella } = await versionVigente(pieza)
  const { data: firma, error } = await db.rpc("firmar_pieza", {
    p_pieza: pieza,
    p_huella: huella,
    p_programada_para: new Date(Date.now() + 3_600_000).toISOString(),
  })
  if (error) throw error
  const { error: errorDeEnvio } = await admin()
    .from("publicaciones")
    .insert({ pieza_id: pieza, version_id: version, firma_id: firma as string, post_urn: urn })
  if (errorDeEnvio) throw errorDeEnvio
  return pieza
}
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/integration/metricas.test.ts
import { beforeAll, describe, expect, test } from "vitest"
import type { Db } from "@/lib/supabase/database"
import { admin, cuentaDe, marcaConDueno, personaConSesion, publicadaConUrn } from "./entorno"

type Persona = { db: Db; userId: string }
let dueno: Persona
let ajeno: Persona
let cuenta: string
let pieza: string
const URN_DE_POSTIA = `urn:li:share:${Date.now()}1`
const URN_ANTERIOR = `urn:li:ugcPost:${Date.now()}2`

function datos(interacciones = 18) {
  return {
    desde: "2025-11-10",
    hasta: "2026-11-09",
    seguidores_total: 3448,
    publicaciones: [
      { post_urn: URN_DE_POSTIA, publicada_el: "2025-11-16", interacciones, impresiones: 962 },
      { post_urn: URN_ANTERIOR, publicada_el: "2025-11-18", interacciones: null, impresiones: 337 },
    ],
    dias: [{ dia: "2025-11-16", impresiones: 962, interacciones: 18, seguidores_nuevos: 4 }],
    publico: [
      { tipo: "publico", categoria: "Empresa", valor: "CCU", porcentaje: null, menor_a_uno: true },
      { tipo: "contenido", categoria: "Cargo", valor: "Gerente", porcentaje: 3, menor_a_uno: false },
    ],
  }
}

beforeAll(async () => {
  dueno = await personaConSesion("metricas")
  ajeno = await personaConSesion("metricas-ajeno")
  cuenta = await cuentaDe(await marcaConDueno(dueno.userId))
  pieza = await publicadaConUrn(dueno.db, cuenta, URN_DE_POSTIA)
})

describe("importar_metricas", () => {
  test("stores each post's figures, matched to the PostIA piece by URN, and counts the rest as earlier posts", async () => {
    const { data, error } = await dueno.db.rpc("importar_metricas", { p_cuenta: cuenta, p_datos: datos() })
    expect(error).toBeNull()
    expect(data).toEqual({ publicaciones: 2, de_postia: 1, anteriores: 1, dias: 1, publico: 2 })
    const { data: filas } = await dueno.db
      .from("metricas_de_publicacion")
      .select("post_urn, pieza_id, interacciones, impresiones, origen")
      .eq("cuenta_id", cuenta)
      .order("post_urn")
    expect(filas).toEqual(
      expect.arrayContaining([
        { post_urn: URN_DE_POSTIA, pieza_id: pieza, interacciones: 18, impresiones: 962, origen: "importacion" },
        { post_urn: URN_ANTERIOR, pieza_id: null, interacciones: null, impresiones: 337, origen: "importacion" },
      ]),
    )
  })

  test("importing the same period again updates the figures instead of duplicating them", async () => {
    await dueno.db.rpc("importar_metricas", { p_cuenta: cuenta, p_datos: datos(18) })
    await dueno.db.rpc("importar_metricas", { p_cuenta: cuenta, p_datos: datos(25) })
    const { data: filas } = await dueno.db.from("metricas_de_publicacion").select("interacciones").eq("post_urn", URN_DE_POSTIA)
    expect(filas).toEqual([{ interacciones: 25 }])
    const { count: importaciones } = await dueno.db
      .from("importaciones_de_metricas")
      .select("id", { count: "exact", head: true })
      .eq("cuenta_id", cuenta)
    expect(importaciones).toBe(1)
    const { count: publico } = await dueno.db
      .from("publico_de_la_cuenta")
      .select("id", { count: "exact", head: true })
    expect(publico).toBe(2)
  })

  test("only the brand's owner imports and reads", async () => {
    const { error } = await ajeno.db.rpc("importar_metricas", { p_cuenta: cuenta, p_datos: datos() })
    expect(error?.code).toBe("42501")
    const { data } = await ajeno.db.from("metricas_de_publicacion").select("id").eq("cuenta_id", cuenta)
    expect(data).toEqual([])
    const directo = await dueno.db
      .from("metricas_de_publicacion")
      .insert({ cuenta_id: cuenta, post_urn: "urn:li:share:1", publicada_el: "2025-11-16", origen: "importacion" })
    expect(directo.error).not.toBeNull()
  })

  test("refuses a malformed payload", async () => {
    const { error } = await dueno.db.rpc("importar_metricas", {
      p_cuenta: cuenta,
      p_datos: { ...datos(), publicaciones: [{ post_urn: "no-es-urn", publicada_el: "2025-11-16" }] },
    })
    expect(error?.message).toBe("datos_invalidos")
  })

  test("deleting the account deletes its figures", async () => {
    const otra = await cuentaDe(await marcaConDueno(dueno.userId))
    await dueno.db.rpc("importar_metricas", { p_cuenta: otra, p_datos: { ...datos(), publicaciones: [] } })
    await admin().from("cuentas").delete().eq("id", otra)
    const { count } = await admin()
      .from("importaciones_de_metricas")
      .select("id", { count: "exact", head: true })
      .eq("cuenta_id", otra)
    expect(count).toBe(0)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run --config vitest.integration.config.ts --hookTimeout 60000 tests/integration/metricas.test.ts`
Expected: FAIL, `Could not find the function public.importar_metricas`.

- [ ] **Step 4: Write the migration**

```sql
-- supabase/migrations/20261109170000_metricas.sql
-- Rendimiento, block 1 (docs/superpowers/specs/2026-11-09-rendimiento-design.md). D12, changed on 2026-11-09:
-- figures come from the LinkedIn API (later) or from the XLSX Federico exports from his own account. Each figure keeps
-- its origin; when both exist the API wins. Imported figures do not expire; owners can delete them.

create table public.importaciones_de_metricas (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  desde date not null,
  hasta date not null check (hasta >= desde),
  seguidores_total integer check (seguidores_total >= 0),
  creada_por uuid references auth.users (id) on delete set null,
  creada_en timestamptz not null default now(),
  unique (cuenta_id, desde, hasta)
);

create table public.metricas_de_publicacion (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  post_urn text not null check (post_urn ~ '^urn:li:(share|ugcPost):[0-9]+$'),
  pieza_id uuid references public.piezas (id) on delete set null,
  publicada_el date not null,
  interacciones integer check (interacciones >= 0),
  impresiones integer check (impresiones >= 0),
  origen text not null check (origen in ('api', 'importacion')),
  leida_en timestamptz not null default now(),
  unique (cuenta_id, post_urn, origen)
);
create index metricas_de_publicacion_por_pieza on public.metricas_de_publicacion (pieza_id) where pieza_id is not null;

create table public.metricas_diarias (
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  dia date not null,
  impresiones integer not null check (impresiones >= 0),
  interacciones integer not null check (interacciones >= 0),
  seguidores_nuevos integer check (seguidores_nuevos >= 0),
  origen text not null check (origen in ('api', 'importacion')),
  primary key (cuenta_id, dia, origen)
);

-- Aggregated audience as LinkedIn exports it: top values per category, never a person.
create table public.publico_de_la_cuenta (
  id uuid primary key default gen_random_uuid(),
  importacion_id uuid not null references public.importaciones_de_metricas (id) on delete cascade,
  tipo text not null check (tipo in ('publico', 'contenido')),
  categoria text not null check (length(btrim(categoria)) between 1 and 80),
  valor text not null check (length(btrim(valor)) between 1 and 200),
  porcentaje numeric(5, 2) check (porcentaje between 0 and 100),
  menor_a_uno boolean not null default false
);
create index publico_de_la_cuenta_por_importacion on public.publico_de_la_cuenta (importacion_id);

alter table public.importaciones_de_metricas enable row level security;
alter table public.metricas_de_publicacion enable row level security;
alter table public.metricas_diarias enable row level security;
alter table public.publico_de_la_cuenta enable row level security;

-- Read for the brand's owners; writes only through importar_metricas.
create policy "duenos leen importaciones" on public.importaciones_de_metricas for select to authenticated
  using (exists (select 1 from public.cuentas c where c.id = cuenta_id and public.es_dueno(c.marca_id)));
create policy "duenos leen metricas" on public.metricas_de_publicacion for select to authenticated
  using (exists (select 1 from public.cuentas c where c.id = cuenta_id and public.es_dueno(c.marca_id)));
create policy "duenos leen metricas diarias" on public.metricas_diarias for select to authenticated
  using (exists (select 1 from public.cuentas c where c.id = cuenta_id and public.es_dueno(c.marca_id)));
create policy "duenos leen publico" on public.publico_de_la_cuenta for select to authenticated
  using (exists (
    select 1 from public.importaciones_de_metricas i join public.cuentas c on c.id = i.cuenta_id
     where i.id = importacion_id and public.es_dueno(c.marca_id)));

create function public.importar_metricas(p_cuenta uuid, p_datos jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_marca uuid;
  v_importacion uuid;
  v_publicaciones integer;
  v_de_postia integer;
  v_dias integer;
  v_publico integer;
begin
  select marca_id into v_marca from public.cuentas where id = p_cuenta;
  if v_marca is null or not public.es_dueno(v_marca) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_importa';
  end if;
  if jsonb_typeof(p_datos -> 'publicaciones') <> 'array' or jsonb_typeof(p_datos -> 'dias') <> 'array'
     or jsonb_typeof(p_datos -> 'publico') <> 'array'
     or exists (select 1 from jsonb_array_elements(p_datos -> 'publicaciones') e
                 where coalesce(e ->> 'post_urn', '') !~ '^urn:li:(share|ugcPost):[0-9]+$') then
    raise exception using errcode = '22023', message = 'datos_invalidos';
  end if;

  -- The same period imported again replaces the earlier import (its audience goes with it).
  delete from public.importaciones_de_metricas
   where cuenta_id = p_cuenta and desde = (p_datos ->> 'desde')::date and hasta = (p_datos ->> 'hasta')::date;
  insert into public.importaciones_de_metricas (cuenta_id, desde, hasta, seguidores_total, creada_por)
  values (p_cuenta, (p_datos ->> 'desde')::date, (p_datos ->> 'hasta')::date,
          (p_datos ->> 'seguidores_total')::integer, auth.uid())
  returning id into v_importacion;

  insert into public.metricas_de_publicacion (cuenta_id, post_urn, pieza_id, publicada_el, interacciones, impresiones,
                                              origen, leida_en)
  select p_cuenta, e ->> 'post_urn',
         (select pu.pieza_id from public.publicaciones pu join public.piezas pz on pz.id = pu.pieza_id
           where pu.post_urn = e ->> 'post_urn' and pz.cuenta_id = p_cuenta limit 1),
         (e ->> 'publicada_el')::date, (e ->> 'interacciones')::integer, (e ->> 'impresiones')::integer,
         'importacion', now()
    from jsonb_array_elements(p_datos -> 'publicaciones') e
  on conflict (cuenta_id, post_urn, origen) do update
     set pieza_id = excluded.pieza_id, publicada_el = excluded.publicada_el,
         interacciones = coalesce(excluded.interacciones, public.metricas_de_publicacion.interacciones),
         impresiones = coalesce(excluded.impresiones, public.metricas_de_publicacion.impresiones),
         leida_en = excluded.leida_en;

  insert into public.metricas_diarias (cuenta_id, dia, impresiones, interacciones, seguidores_nuevos, origen)
  select p_cuenta, (e ->> 'dia')::date, (e ->> 'impresiones')::integer, (e ->> 'interacciones')::integer,
         (e ->> 'seguidores_nuevos')::integer, 'importacion'
    from jsonb_array_elements(p_datos -> 'dias') e
  on conflict (cuenta_id, dia, origen) do update
     set impresiones = excluded.impresiones, interacciones = excluded.interacciones,
         seguidores_nuevos = excluded.seguidores_nuevos;

  insert into public.publico_de_la_cuenta (importacion_id, tipo, categoria, valor, porcentaje, menor_a_uno)
  select v_importacion, e ->> 'tipo', e ->> 'categoria', e ->> 'valor', (e ->> 'porcentaje')::numeric,
         coalesce((e ->> 'menor_a_uno')::boolean, false)
    from jsonb_array_elements(p_datos -> 'publico') e;

  select count(*), count(pieza_id) into v_publicaciones, v_de_postia
    from public.metricas_de_publicacion
   where cuenta_id = p_cuenta and origen = 'importacion'
     and post_urn in (select e ->> 'post_urn' from jsonb_array_elements(p_datos -> 'publicaciones') e);
  v_dias := jsonb_array_length(p_datos -> 'dias');
  v_publico := jsonb_array_length(p_datos -> 'publico');
  return jsonb_build_object('publicaciones', v_publicaciones, 'de_postia', v_de_postia,
                            'anteriores', v_publicaciones - v_de_postia, 'dias', v_dias, 'publico', v_publico);
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or check_violation
       or not_null_violation then
    raise exception using errcode = '22023', message = 'datos_invalidos';
end $$;

revoke execute on function public.importar_metricas(uuid, jsonb) from public, anon;
grant execute on function public.importar_metricas(uuid, jsonb) to authenticated;
```

- [ ] **Step 5: Apply, regenerate types and run the test**

```bash
supabase migration up --local
pnpm db:types
pnpm vitest run --config vitest.integration.config.ts --hookTimeout 60000 tests/integration/metricas.test.ts
```
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261109170000_metricas.sql lib/supabase/database.types.ts tests/integration/entorno.ts tests/integration/metricas.test.ts
git commit -m "feat: store imported LinkedIn figures per post, per day and audience, owners only"
```

---

### Task 3: Server-side import action

**Files:**
- Create: `lib/rendimiento/acciones.ts`
- Test: `tests/integration/acciones-rendimiento.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/acciones-rendimiento.test.ts
import { beforeAll, describe, expect, test } from "vitest"
import { importarEstadisticas } from "@/lib/rendimiento/acciones"
import type { Exportacion } from "@/lib/rendimiento/exportacion"
import type { Db } from "@/lib/supabase/database"
import { cuentaDe, marcaConDueno, personaConSesion, publicadaConUrn } from "./entorno"

let dueno: { db: Db; userId: string }
let cuenta: string
const URN = `urn:li:share:${Date.now()}3`

function exportacion(cambios: Partial<Exportacion> = {}): Exportacion {
  return {
    desde: "2025-11-10",
    hasta: "2026-11-09",
    seguidoresTotal: 3448,
    publicaciones: [{ postUrn: URN, publicadaEl: "2025-11-16", interacciones: 18, impresiones: 962 }],
    sinIdentificar: 0,
    dias: [{ dia: "2025-11-16", impresiones: 962, interacciones: 18, seguidoresNuevos: 4 }],
    publico: [{ tipo: "contenido", categoria: "Empresa", valor: "CCU", porcentaje: 4, menorAUno: false }],
    ...cambios,
  }
}

beforeAll(async () => {
  dueno = await personaConSesion("acciones-rendimiento")
  cuenta = await cuentaDe(await marcaConDueno(dueno.userId))
  await publicadaConUrn(dueno.db, cuenta, URN)
})

describe("importarEstadisticas", () => {
  test("imports and sums up what it found", async () => {
    expect(await importarEstadisticas(dueno.db, { cuentaId: cuenta, exportacion: exportacion() })).toEqual({
      ok: true,
      publicaciones: 1,
      dePostia: 1,
      anteriores: 0,
      sinIdentificar: 0,
    })
  })

  test("a file with no post of PostIA in it asks to confirm before saving, since it may be another account's", async () => {
    const ajena = exportacion({
      publicaciones: [{ postUrn: "urn:li:share:42", publicadaEl: "2025-11-16", interacciones: 1, impresiones: 9 }],
    })
    expect(await importarEstadisticas(dueno.db, { cuentaId: cuenta, exportacion: ajena })).toEqual({
      ok: false,
      error: "Ninguna publicación del archivo es de esta cuenta en PostIA. ¿Elegiste la cuenta correcta?",
      confirmar: true,
    })
    expect(
      await importarEstadisticas(dueno.db, { cuentaId: cuenta, exportacion: ajena, confirmado: true }),
    ).toMatchObject({ ok: true, anteriores: 1 })
  })

  test("refuses another owner's account in Spanish", async () => {
    const ajeno = await personaConSesion("acciones-rendimiento-ajeno")
    // Under RLS another owner sees none of these posts, so it confirms; the RPC's ownership check is what refuses.
    expect(await importarEstadisticas(ajeno.db, { cuentaId: cuenta, exportacion: exportacion(), confirmado: true })).toEqual({
      ok: false,
      error: "Solo el dueño de la marca de esa cuenta puede importar sus estadísticas.",
    })
  })

  test("refuses a malformed export before calling the database", async () => {
    expect(
      await importarEstadisticas(dueno.db, { cuentaId: cuenta, exportacion: { ...exportacion(), desde: "ayer" } }),
    ).toEqual({ ok: false, error: "No pude leer el archivo. Descárgalo de nuevo desde LinkedIn." })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run --config vitest.integration.config.ts --hookTimeout 60000 tests/integration/acciones-rendimiento.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/rendimiento/acciones"`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/rendimiento/acciones.ts
import { z } from "zod"
import type { Db } from "@/lib/supabase/database"

// Worker-safe: the XLSX is read in the browser (lector.ts); this validates what arrives and writes it in one RPC.

const Dia = z.iso.date()
const Entero = z.number().int().min(0)

const Exportacion = z.object({
  desde: Dia,
  hasta: Dia,
  seguidoresTotal: Entero.nullable(),
  publicaciones: z
    .array(
      z.object({
        postUrn: z.string().regex(/^urn:li:(share|ugcPost):[0-9]+$/),
        publicadaEl: Dia,
        interacciones: Entero.nullable(),
        impresiones: Entero.nullable(),
      }),
    )
    .max(200),
  sinIdentificar: Entero,
  dias: z
    .array(z.object({ dia: Dia, impresiones: Entero, interacciones: Entero, seguidoresNuevos: Entero.nullable() }))
    .max(800),
  publico: z
    .array(
      z.object({
        tipo: z.enum(["publico", "contenido"]),
        categoria: z.string().trim().min(1).max(80),
        valor: z.string().trim().min(1).max(200),
        porcentaje: z.number().min(0).max(100).nullable(),
        menorAUno: z.boolean(),
      }),
    )
    .max(300),
})

const Entrada = z.object({ cuentaId: z.uuid(), exportacion: Exportacion, confirmado: z.boolean().optional() })

const Resumen = z.object({ publicaciones: Entero, de_postia: Entero, anteriores: Entero })

export type ResultadoDeImportacion =
  | { ok: true; publicaciones: number; dePostia: number; anteriores: number; sinIdentificar: number }
  | { ok: false; error: string; confirmar?: true }

const ARCHIVO_ILEGIBLE = "No pude leer el archivo. Descárgalo de nuevo desde LinkedIn."
const CUENTA_DUDOSA = "Ninguna publicación del archivo es de esta cuenta en PostIA. ¿Elegiste la cuenta correcta?"

async function algunaEsDePostia(db: Db, cuentaId: string, urns: string[]): Promise<boolean> {
  if (urns.length === 0) return true
  const { data, error } = await db
    .from("publicaciones")
    .select("post_urn, piezas!inner(cuenta_id)")
    .in("post_urn", urns)
    .eq("piezas.cuenta_id", cuentaId)
    .limit(1)
  if (error) throw new Error(`No pude revisar las publicaciones de la cuenta: ${error.message}`, { cause: error })
  return data.length > 0
}

export async function importarEstadisticas(db: Db, entrada: unknown): Promise<ResultadoDeImportacion> {
  const leida = Entrada.safeParse(entrada)
  if (!leida.success) return { ok: false, error: ARCHIVO_ILEGIBLE }
  const { cuentaId, exportacion: e, confirmado } = leida.data
  if (!confirmado && !(await algunaEsDePostia(db, cuentaId, e.publicaciones.map((p) => p.postUrn))))
    return { ok: false, error: CUENTA_DUDOSA, confirmar: true }
  const { data, error } = await db.rpc("importar_metricas", {
    p_cuenta: cuentaId,
    p_datos: {
      desde: e.desde,
      hasta: e.hasta,
      seguidores_total: e.seguidoresTotal,
      publicaciones: e.publicaciones.map((p) => ({
        post_urn: p.postUrn,
        publicada_el: p.publicadaEl,
        interacciones: p.interacciones,
        impresiones: p.impresiones,
      })),
      dias: e.dias.map((d) => ({
        dia: d.dia,
        impresiones: d.impresiones,
        interacciones: d.interacciones,
        seguidores_nuevos: d.seguidoresNuevos,
      })),
      publico: e.publico.map((p) => ({
        tipo: p.tipo,
        categoria: p.categoria,
        valor: p.valor,
        porcentaje: p.porcentaje,
        menor_a_uno: p.menorAUno,
      })),
    },
  })
  if (error) {
    if (error.message === "solo_el_dueno_importa")
      return { ok: false, error: "Solo el dueño de la marca de esa cuenta puede importar sus estadísticas." }
    if (error.message === "datos_invalidos") return { ok: false, error: ARCHIVO_ILEGIBLE }
    console.error("No pude importar estadísticas", error.code, error.message)
    return { ok: false, error: "No pude guardar las estadísticas. Inténtalo de nuevo en un rato." }
  }
  const r = Resumen.parse(data)
  return { ok: true, publicaciones: r.publicaciones, dePostia: r.de_postia, anteriores: r.anteriores, sinIdentificar: e.sinIdentificar }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run --config vitest.integration.config.ts --hookTimeout 60000 tests/integration/acciones-rendimiento.test.ts`
Expected: PASS (4 tests). Then `pnpm format && pnpm type && pnpm lint`.

- [ ] **Step 5: Commit**

```bash
git add lib/rendimiento/acciones.ts tests/integration/acciones-rendimiento.test.ts
git commit -m "feat: import action validates the export and asks to confirm a file with no PostIA post"
```

---

### Task 4: Browser reader and the form in Ajustes

**Files:**
- Modify: `package.json` (add `read-excel-file`, exact version published at least 14 days ago: check with `npm view read-excel-file time --json`)
- Create: `lib/rendimiento/lector.ts`, `app/(app)/ajustes/importar-estadisticas.tsx`
- Modify: `app/(app)/ajustes/acciones.ts`, `app/(app)/ajustes/page.tsx`
- Test: `tests/unit/importar-estadisticas.test.tsx`

- [ ] **Step 1: Add the dependency**

```bash
npm view read-excel-file time --json   # pick the newest version at least 14 days old
pnpm add --save-exact read-excel-file@<that version>
```

- [ ] **Step 2: Write the failing test**

```tsx
// tests/unit/importar-estadisticas.test.tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { ImportarEstadisticas } from "@/app/(app)/ajustes/importar-estadisticas"
import type { Exportacion } from "@/lib/rendimiento/exportacion"

const CUENTAS = [{ id: "c-perfil", nombre: "Federico" }]
const EXPORTACION: Exportacion = {
  desde: "2025-11-10",
  hasta: "2026-11-09",
  seguidoresTotal: 3448,
  publicaciones: [],
  sinIdentificar: 0,
  dias: [],
  publico: [],
}

function elegirArchivo() {
  const archivo = new File(["x"], "estadisticas.xlsx")
  fireEvent.change(screen.getByLabelText("Archivo de LinkedIn"), { target: { files: [archivo] } })
  return archivo
}

describe("ImportarEstadisticas", () => {
  test("reads the file, imports it for the chosen account and says what it found", async () => {
    const leer = vi.fn(async () => ({ ok: true as const, ...EXPORTACION }))
    const importar = vi.fn(async () => ({ ok: true as const, publicaciones: 12, dePostia: 3, anteriores: 9, sinIdentificar: 0 }))
    render(<ImportarEstadisticas cuentas={CUENTAS} leer={leer} importar={importar} />)
    const archivo = elegirArchivo()
    fireEvent.click(screen.getByRole("button", { name: "Importar" }))
    await waitFor(() => expect(importar).toHaveBeenCalledWith({ cuentaId: "c-perfil", exportacion: EXPORTACION }))
    expect(leer).toHaveBeenCalledWith(archivo)
    expect(screen.getByRole("status")).toHaveTextContent("Listo: 12 publicaciones, 3 de PostIA y 9 anteriores.")
  })

  test("a file that is not LinkedIn's shows the reader's error and imports nothing", async () => {
    const importar = vi.fn()
    render(
      <ImportarEstadisticas
        cuentas={CUENTAS}
        leer={async () => ({ ok: false, error: "Ese archivo no es la exportación de estadísticas de LinkedIn." })}
        importar={importar}
      />,
    )
    elegirArchivo()
    fireEvent.click(screen.getByRole("button", { name: "Importar" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Ese archivo no es la exportación")
    expect(importar).not.toHaveBeenCalled()
  })

  test("when the file has no PostIA post it asks, and «Importar igual» confirms", async () => {
    const importar = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "Ninguna publicación del archivo es de esta cuenta en PostIA.", confirmar: true })
      .mockResolvedValueOnce({ ok: true, publicaciones: 1, dePostia: 0, anteriores: 1, sinIdentificar: 0 })
    render(<ImportarEstadisticas cuentas={CUENTAS} leer={async () => ({ ok: true, ...EXPORTACION })} importar={importar} />)
    elegirArchivo()
    fireEvent.click(screen.getByRole("button", { name: "Importar" }))
    fireEvent.click(await screen.findByRole("button", { name: "Importar igual" }))
    await waitFor(() =>
      expect(importar).toHaveBeenLastCalledWith({ cuentaId: "c-perfil", exportacion: EXPORTACION, confirmado: true }),
    )
  })

  test("without a file it asks for one", () => {
    render(<ImportarEstadisticas cuentas={CUENTAS} leer={vi.fn()} importar={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Importar" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Elige el archivo que descargaste de LinkedIn.")
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/importar-estadisticas.test.tsx`
Expected: FAIL, `Failed to resolve import "@/app/(app)/ajustes/importar-estadisticas"`.

- [ ] **Step 4: Write the reader, the form, the action and wire them**

```ts
// lib/rendimiento/lector.ts
import { readSheet, readSheetNames } from "read-excel-file/browser"
import type { Resultado } from "@/lib/marcas/acciones"
import { type Celda, type Exportacion, type Hojas, leerExportacion } from "./exportacion"

// Browser only: the Worker never unzips an upload. Check the import names against the installed version's README
// (read-excel-file 9 exports readSheet/readSheetNames from "read-excel-file/browser"); adjust if they differ.
export async function leerArchivoDeLinkedin(archivo: File): Promise<Resultado<Exportacion>> {
  try {
    const nombres = await readSheetNames(archivo)
    const hojas: Hojas = {}
    for (const nombre of nombres) hojas[nombre] = (await readSheet(archivo, nombre)) as Celda[][]
    return leerExportacion(hojas)
  } catch (causa) {
    console.error("No pude abrir el XLSX de LinkedIn", causa instanceof Error ? causa.message : String(causa))
    return { ok: false, error: "No pude abrir el archivo. Debe ser el .xlsx que descargas desde LinkedIn." }
  }
}
```

```tsx
// app/(app)/ajustes/importar-estadisticas.tsx
"use client"

import { useState, useTransition } from "react"
import type { Resultado } from "@/lib/marcas/acciones"
import type { ResultadoDeImportacion } from "@/lib/rendimiento/acciones"
import type { Exportacion } from "@/lib/rendimiento/exportacion"
import { leerArchivoDeLinkedin } from "@/lib/rendimiento/lector"

type Entrada = { cuentaId: string; exportacion: Exportacion; confirmado?: true }

export function ImportarEstadisticas({
  cuentas,
  leer = leerArchivoDeLinkedin,
  importar,
}: {
  cuentas: readonly { id: string; nombre: string }[]
  /** The browser reader; a server page cannot pass it, so it is the default and tests replace it. */
  leer?: (archivo: File) => Promise<Resultado<Exportacion>>
  importar: (entrada: Entrada) => Promise<ResultadoDeImportacion>
}) {
  const [cuentaId, setCuentaId] = useState(cuentas[0]?.id ?? "")
  const [archivo, setArchivo] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState<string | null>(null)
  const [pendienteDeConfirmar, setPendienteDeConfirmar] = useState<Entrada | null>(null)
  const [pendiente, iniciar] = useTransition()

  function enviar(entrada: Entrada) {
    iniciar(async () => {
      const r = await importar(entrada)
      if (r.ok) {
        setPendienteDeConfirmar(null)
        setListo(`Listo: ${r.publicaciones} publicaciones, ${r.dePostia} de PostIA y ${r.anteriores} anteriores.`)
        return
      }
      setError(r.error)
      setPendienteDeConfirmar(r.confirmar ? { ...entrada, confirmado: true } : null)
    })
  }

  function importarArchivo(evento: React.FormEvent) {
    evento.preventDefault()
    setError(null)
    setListo(null)
    if (!archivo) return setError("Elige el archivo que descargaste de LinkedIn.")
    iniciar(async () => {
      const leido = await leer(archivo)
      if (!leido.ok) return setError(leido.error)
      const { ok: _, ...exportacion } = leido
      enviar({ cuentaId, exportacion })
    })
  }

  if (cuentas.length === 0) return null
  return (
    <form onSubmit={importarArchivo} className="space-y-3 tarjeta p-4">
      <h2 className="font-medium">Importar estadísticas</h2>
      <p className="text-sm text-apagado">
        En LinkedIn, abre Analytics de tu perfil y exporta el último año. Sube aquí ese archivo.
      </p>
      {cuentas.length > 1 && (
        <label className="block space-y-1 text-sm">
          <span>Cuenta</span>
          <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} className="campo w-full">
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block space-y-1 text-sm">
        <span>Archivo de LinkedIn</span>
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          className="block w-full"
        />
      </label>
      <button type="submit" disabled={pendiente} className="boton w-full py-3">
        Importar
      </button>
      {error && (
        <p role="alert" className="text-sm text-peligro">
          {error}
        </p>
      )}
      {pendienteDeConfirmar && (
        <button type="button" disabled={pendiente} onClick={() => enviar(pendienteDeConfirmar)} className="boton w-full py-3">
          Importar igual
        </button>
      )}
      {listo && <output className="block text-sm">{listo}</output>}
    </form>
  )
}
```

Append to `app/(app)/ajustes/acciones.ts`:

```ts
import { importarEstadisticas, type ResultadoDeImportacion } from "@/lib/rendimiento/acciones"

export async function importarEstadisticasAccion(entrada: unknown): Promise<ResultadoDeImportacion> {
  const resultado = await importarEstadisticas(await createActionClient(), entrada)
  if (resultado.ok) revalidatePath("/ajustes")
  return resultado
}
```

(Move the new import up with the others; keep `"use server"` on line 1.)

In `app/(app)/ajustes/page.tsx`, read the profile accounts and render the form after `<GastoDelMes … />`:

```tsx
// with the other imports
import { ImportarEstadisticas } from "./importar-estadisticas"
import { importarEstadisticasAccion } from "./acciones" // add to the existing import from "./acciones"

// inside Ajustes(), after `resumen`:
const supabase = await createClient()
const { data: perfiles, error } = await supabase
  .from("cuentas")
  .select("id, nombre")
  .eq("tipo", "persona")
  .order("nombre")
if (error) throw new Error(`No pude leer las cuentas: ${error.message}`, { cause: error })

// in the JSX, after <GastoDelMes … />:
<ImportarEstadisticas cuentas={perfiles} importar={importarEstadisticasAccion} />
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run tests/unit/importar-estadisticas.test.tsx`
Expected: PASS (4 tests). Then `pnpm format && pnpm type && pnpm lint`, and check line 1 of `importar-estadisticas.tsx` is `"use client"` and of `acciones.ts` is `"use server"`.

- [ ] **Step 6: Try it with the real file**

Start the app (`preview_start` with `postia`, or the session's preview tooling; never kill Federico's own `next dev`), sign in locally, open Ajustes, upload `AnalisisConjunto_Federico_Elgueta_Edwards_2025-11-10_2026-11-09.xlsx` (ask Federico for its path; it is not in the repo). Expected: «Listo: 12 publicaciones, …» or the confirm question if no URN matches local pieces. Check with SQL that `publico_de_la_cuenta` has the audience rows.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml lib/rendimiento/lector.ts "app/(app)/ajustes/importar-estadisticas.tsx" "app/(app)/ajustes/acciones.ts" "app/(app)/ajustes/page.tsx" tests/unit/importar-estadisticas.test.tsx
git commit -m "feat: import LinkedIn statistics from Ajustes"
```

---

### Task 5: Full verification

- [ ] Run `pnpm type`, `pnpm lint`, `pnpm test:run`, then `pnpm vitest run --config vitest.integration.config.ts --hookTimeout 60000` (whole `test:db`, alone).
- [ ] `pnpm build` (the Worker bundle must not include `read-excel-file`: `grep -r "read-excel-file" .open-next/worker.js` finds nothing, or check `tests/unit/limites-del-worker.test.ts` still passes).
- [ ] The migration goes to production by Federico (`supabase db push`) before the merge.
