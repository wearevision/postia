# Destino de piezas (enlace a las webs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At gate 1, Federico picks a destination for a piece (no link, WR3 or wearevision.cl) and a page from that site's `paginas.json`; PostIA appends the link with UTMs and a 3-character code to the text as a new version (so the signature covers it), and at publish time a piece whose page no longer exists goes back instead of going out.

**Architecture:** Three new columns on `piezas` plus one `security definer` RPC, `poner_destino`, that writes the new version (copying the carousel fields `nueva_version` would drop) and the columns in one transaction. Pure TS in `lib/destino/` builds the link and the text and ranks pages; `lib/destino/acciones.ts` reads `paginas.json`, never accepts a URL that is not in it, and retries on a code collision. A client component at gate 1 drives it. `publicarPieza` gets one more check through a new port, `paginasDe`.

**Tech Stack:** Next.js 16 server actions, Supabase (Postgres, RLS through RPCs), zod, Vitest + MSW (unit), Vitest against Supabase local (`pnpm test:db`).

**Spec:** `docs/superpowers/specs/2026-11-10-postia-y-webs-design.md`, «Parte 2 · Enlaces desde PostIA». The websites already serve `https://wr3.wearevision.cl/paginas.json` and `https://wearevision.cl/paginas.json` as `[{ url, titulo, tema }]` (step 1, deployed).

**Decisions this plan takes (all from the spec unless marked):**
- Code alphabet `23456789abcdefghjkmnpqrstuvwxyz`, 3 characters, unique among pieces that have a destination. Kept when the page or the site changes; released when the piece goes back to «sin enlace» (spec: «solo con destino»).
- `utm_campaign` = `federico` for the `persona` account, `wav` for the `empresa` account (WR3 posts come out of the WAV page).
- The link goes on its own last line, after a blank line (D22: links inside the text).
- *Plan decision:* if the text loses the link (a hand correction or a Claude rewrite after choosing), gate 1 warns and publishing sends the piece back with «El texto ya no lleva el enlace de destino…». The columns are not cleared silently.
- *Plan decision:* LinkedIn's `little` format escapes `_` as `\_`, which renders as a plain `_` (Microsoft Learn, «little Text Format», Text grammar). `aLittleText` already does this, so the URL needs no special handling. Task 8 confirms it on one real post, gated.

---

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261110130000_destino_de_piezas.sql` (create) | columns, check, unique index, RPC `poner_destino`, grants |
| `lib/destino/enlace.ts` (create) | alphabet, `codigoNuevo`, `enlaceDe`, `conEnlace`, `quitarEnlace`, `llevaElEnlace` |
| `lib/destino/paginas.ts` (create) | `WEBS`, `leerPaginas` (fetch + validate), `ordenarPorTexto` |
| `lib/destino/acciones.ts` (create) | `paginasParaPieza`, `ponerDestino` (domain functions taking `db`) |
| `lib/piezas/lectura.ts` (modify) | `DetalleDePieza.destino` |
| `app/(app)/piezas/[id]/destino.tsx` (create) | client control «Destino» |
| `app/(app)/piezas/[id]/acciones.ts` (modify) | `paginasAccion`, `ponerDestinoAccion` |
| `app/(app)/piezas/[id]/page.tsx` (modify) | renders the control and the lost-link warning |
| `lib/publicacion/publicar.ts` (modify) | `PiezaParaPublicar.destino`, port `paginasDe`, the check |
| `lib/publicacion/repositorio.ts` (modify) | loads the columns; production `paginasDe` |
| `tests/integration/destino.test.ts` (create) | RPC + `ponerDestino` against Supabase local |
| `tests/unit/destino-enlace.test.ts`, `tests/unit/destino-paginas.test.ts`, `tests/unit/destino.test.tsx` (create) | pure code, fetch, component |
| `tests/unit/publicar.test.ts` (modify) | the publish check |

---

### Task 1: Columns and the `poner_destino` RPC

**Files:**
- Create: `supabase/migrations/20261110130000_destino_de_piezas.sql`
- Create: `tests/integration/destino.test.ts`

- [ ] **Step 1: Write the failing DB tests**

```ts
// tests/integration/destino.test.ts
import { describe, expect, test } from "vitest"
import { crearPieza } from "@/lib/piezas/acciones"
import { admin, cuentaDe, marcaConDueno, personaConSesion } from "./entorno"

async function piezaDeTexto(prefijo: string, texto = "Hola") {
  const { db, userId } = await personaConSesion(prefijo)
  const marca = await marcaConDueno(userId)
  const cuenta = await cuentaDe(marca)
  const creada = await crearPieza(db, { cuentaId: cuenta, formato: "texto", texto })
  if (!creada.ok) throw new Error(creada.error)
  return { db, piezaId: creada.piezaId }
}

const URL_WR3 = "https://wr3.wearevision.cl/guias/focus-group/"
const conEnlace = (codigo: string) =>
  `Hola\n\n${URL_WR3}?utm_source=linkedin&utm_medium=social&utm_campaign=federico&utm_content=${codigo}`

async function ultima(piezaId: string) {
  const { data } = await admin()
    .from("versiones")
    .select("numero, texto, origen")
    .eq("pieza_id", piezaId)
    .order("numero", { ascending: false })
    .limit(1)
    .single()
  return data
}

describe("poner_destino", () => {
  test("stores the destination and the link as a new person version", async () => {
    const { db, piezaId } = await piezaDeTexto("dst-ok")
    const { error } = await db.rpc("poner_destino", {
      p_pieza: piezaId,
      p_texto: conEnlace("k7m"),
      p_destino: "wr3",
      p_destino_url: URL_WR3,
      p_codigo: "k7m",
    })
    expect(error).toBeNull()
    const { data: p } = await admin().from("piezas").select("destino, destino_url, codigo_ref").eq("id", piezaId).single()
    expect(p).toEqual({ destino: "wr3", destino_url: URL_WR3, codigo_ref: "k7m" })
    expect(await ultima(piezaId)).toEqual({ numero: 2, texto: conEnlace("k7m"), origen: "persona" })
  })

  test("refuses a URL from the other site, a malformed code and a text without the code", async () => {
    const { db, piezaId } = await piezaDeTexto("dst-mal")
    const otraWeb = await db.rpc("poner_destino", {
      p_pieza: piezaId, p_texto: conEnlace("k7m"), p_destino: "wav", p_destino_url: URL_WR3, p_codigo: "k7m",
    })
    expect(otraWeb.error?.code).toBe("23514")
    const malCodigo = await db.rpc("poner_destino", {
      p_pieza: piezaId, p_texto: conEnlace("k1m"), p_destino: "wr3", p_destino_url: URL_WR3, p_codigo: "k1m",
    })
    expect(malCodigo.error?.code).toBe("23514")
    const sinCodigo = await db.rpc("poner_destino", {
      p_pieza: piezaId, p_texto: "Hola", p_destino: "wr3", p_destino_url: URL_WR3, p_codigo: "k7m",
    })
    expect(sinCodigo.error?.message).toBe("falta_el_enlace")
  })

  test("keeps the code once chosen and two pieces cannot share one", async () => {
    const a = await piezaDeTexto("dst-a")
    const b = await piezaDeTexto("dst-b")
    await a.db.rpc("poner_destino", {
      p_pieza: a.piezaId, p_texto: conEnlace("abc"), p_destino: "wr3", p_destino_url: URL_WR3, p_codigo: "abc",
    })
    const otro = await a.db.rpc("poner_destino", {
      p_pieza: a.piezaId, p_texto: conEnlace("abd"), p_destino: "wr3", p_destino_url: URL_WR3, p_codigo: "abd",
    })
    expect(otro.error?.message).toBe("codigo_cambiado")
    const repetido = await b.db.rpc("poner_destino", {
      p_pieza: b.piezaId, p_texto: conEnlace("abc"), p_destino: "wr3", p_destino_url: URL_WR3, p_codigo: "abc",
    })
    expect(repetido.error?.code).toBe("23505")
  })

  test("going back to no link clears the three columns", async () => {
    const { db, piezaId } = await piezaDeTexto("dst-sin")
    await db.rpc("poner_destino", {
      p_pieza: piezaId, p_texto: conEnlace("pqr"), p_destino: "wr3", p_destino_url: URL_WR3, p_codigo: "pqr",
    })
    const { error } = await db.rpc("poner_destino", { p_pieza: piezaId, p_texto: "Hola" })
    expect(error).toBeNull()
    const { data: p } = await admin().from("piezas").select("destino, destino_url, codigo_ref").eq("id", piezaId).single()
    expect(p).toEqual({ destino: null, destino_url: null, codigo_ref: null })
  })

  test("a carousel version keeps its title, PDF, theme and design", async () => {
    const { db, piezaId } = await piezaDeTexto("dst-car")
    // Turn the fixture into a carousel version the way guardar_diseno would, through the admin client.
    await admin().from("piezas").update({ formato: "carrusel_pdf" }).eq("id", piezaId)
    await admin().from("versiones").insert({
      pieza_id: piezaId, numero: 2, texto: "Hola", titulo: "WR3", archivo_ruta: "m/a.pdf",
      archivo_sha256: "b".repeat(64), tema: "wr3", diseno: { laminas: [] },
    })
    await db.rpc("poner_destino", {
      p_pieza: piezaId, p_texto: conEnlace("xyz"), p_destino: "wr3", p_destino_url: URL_WR3, p_codigo: "xyz",
    })
    const { data } = await admin()
      .from("versiones")
      .select("numero, titulo, archivo_ruta, archivo_sha256, tema, diseno")
      .eq("pieza_id", piezaId)
      .order("numero", { ascending: false })
      .limit(1)
      .single()
    expect(data).toEqual({
      numero: 3, titulo: "WR3", archivo_ruta: "m/a.pdf", archivo_sha256: "b".repeat(64), tema: "wr3", diseno: { laminas: [] },
    })
  })

  test("only the brand owner can call it", async () => {
    const { piezaId } = await piezaDeTexto("dst-dueno")
    const extrano = await personaConSesion("dst-extrano")
    const { error } = await extrano.db.rpc("poner_destino", { p_pieza: piezaId, p_texto: "Hola" })
    expect(error?.message).toBe("solo_el_dueno_cambia_piezas")
  })
})
```

Before running: if the carousel test's direct `versiones` insert is refused by a trigger (for example `tema` must match a known theme or `diseno` must parse), use the values an existing carousel test in `tests/integration/` uses and keep the assertion the same.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm db:start && pnpm test:db tests/integration/destino.test.ts`
Expected: FAIL, «Could not find the function public.poner_destino».

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20261110130000_destino_de_piezas.sql
-- Step 3 of «PostIA y las webs»: a piece can link to a page of WR3 or wearevision.cl, with a reference code.
-- The link lives in the text (D22); these columns only say which page and which code, for the publish check.

alter table public.piezas
  add column destino text,
  add column destino_url text,
  add column codigo_ref text;

alter table public.piezas add constraint destino_valido check (
  (destino is null and destino_url is null and codigo_ref is null)
  or (
    codigo_ref ~ '^[23456789abcdefghjkmnpqrstuvwxyz]{3}$'
    and (
      (destino = 'wr3' and destino_url like 'https://wr3.wearevision.cl/%')
      or (destino = 'wav' and destino_url like 'https://wearevision.cl/%')
    )
  )
);

create unique index piezas_codigo_ref_unico on public.piezas (codigo_ref) where codigo_ref is not null;

-- nueva_version copies only text, title and file: a template carousel would lose its theme and design. This writes the
-- version from the latest one, so the versions trigger drops a signature exactly as for any other change.
create or replace function public.poner_destino(
  p_pieza uuid, p_texto text,
  p_destino text default null, p_destino_url text default null, p_codigo text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_pieza public.piezas;
  v_ultima public.versiones;
  v_id uuid;
begin
  if not public.es_dueno(public.marca_de_pieza(p_pieza)) then
    raise exception using errcode = '42501', message = 'solo_el_dueno_cambia_piezas';
  end if;
  select * into v_pieza from public.piezas where id = p_pieza for update;
  if v_pieza.estado not in ('por_aprobar', 'en_reserva', 'programada', 'a_mano') then
    raise exception using errcode = '22023', message = 'pieza_no_editable';
  end if;
  if p_destino is not null then
    if v_pieza.codigo_ref is not null and v_pieza.codigo_ref <> p_codigo then
      raise exception using errcode = '22023', message = 'codigo_cambiado';
    end if;
    if position(('utm_content=' || p_codigo) in p_texto) = 0 then
      raise exception using errcode = '22023', message = 'falta_el_enlace';
    end if;
  end if;
  select * into v_ultima from public.versiones where pieza_id = p_pieza order by numero desc limit 1;
  update public.piezas set destino = p_destino, destino_url = p_destino_url, codigo_ref = p_codigo where id = p_pieza;
  insert into public.versiones (pieza_id, numero, texto, titulo, archivo_ruta, archivo_sha256, tema, diseno, creada_por)
  values (p_pieza, v_ultima.numero + 1, p_texto, v_ultima.titulo, v_ultima.archivo_ruta, v_ultima.archivo_sha256,
          v_ultima.tema, v_ultima.diseno, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.poner_destino(uuid, text, text, text, text) from public, anon;
grant execute on function public.poner_destino(uuid, text, text, text, text) to authenticated;
```

- [ ] **Step 4: Apply locally, regenerate types, run the tests**

Run: `supabase migration up --local && pnpm db:types && pnpm test:db tests/integration/destino.test.ts`
(Never `pnpm db:reset`: it wipes the local invitations and accounts.)
Expected: 6 PASS. Then `pnpm test:db` (all integration) PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261110130000_destino_de_piezas.sql lib/supabase/database.types.ts tests/integration/destino.test.ts
git commit -m "feat(destino): store a piece's destination page and reference code"
```

---

### Task 2: Link and text helpers

**Files:**
- Create: `lib/destino/enlace.ts`
- Test: `tests/unit/destino-enlace.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/destino-enlace.test.ts
import { describe, expect, test } from "vitest"
import { ALFABETO, codigoNuevo, conEnlace, enlaceDe, llevaElEnlace, quitarEnlace } from "@/lib/destino/enlace"

const URL = "https://wr3.wearevision.cl/guias/focus-group/"

describe("destination link", () => {
  test("handles the campaign by account type and puts the code last", () => {
    expect(enlaceDe({ url: URL, cuentaTipo: "persona", codigo: "k7m" })).toBe(
      `${URL}?utm_source=linkedin&utm_medium=social&utm_campaign=federico&utm_content=k7m`,
    )
    expect(enlaceDe({ url: URL, cuentaTipo: "empresa", codigo: "k7m" })).toContain("utm_campaign=wav&")
  })

  test("a new code has 3 characters of the alphabet, without 0/o or 1/l/i", () => {
    const codigos = Array.from({ length: 500 }, () => codigoNuevo())
    for (const c of codigos) expect(c).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]{3}$/)
    expect(ALFABETO).not.toMatch(/[01ilo]/)
  })

  test("conEnlace appends the link on its own line after a blank line", () => {
    expect(conEnlace("Hola\n", "https://x.cl/")).toBe("Hola\n\nhttps://x.cl/")
  })

  test("quitarEnlace removes the old link wherever it is and the blank lines it leaves at the end", () => {
    expect(quitarEnlace("Hola\n\nhttps://x.cl/", "https://x.cl/")).toBe("Hola")
    expect(quitarEnlace("Hola\nhttps://x.cl/\nchao", "https://x.cl/")).toBe("Hola\nchao")
    expect(quitarEnlace("Hola", "https://x.cl/")).toBe("Hola")
  })

  test("llevaElEnlace looks for the reference code in the text", () => {
    expect(llevaElEnlace(`Hola\n\n${URL}?utm_content=k7m`, "k7m")).toBe(true)
    expect(llevaElEnlace("Hola", "k7m")).toBe(false)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test:run tests/unit/destino-enlace.test.ts`
Expected: FAIL, cannot resolve `@/lib/destino/enlace`.

- [ ] **Step 3: Write the helpers**

```ts
// lib/destino/enlace.ts
/** No 0/o or 1/l/i: Federico reads the code aloud from a WhatsApp message. */
export const ALFABETO = "23456789abcdefghjkmnpqrstuvwxyz"

export function codigoNuevo(): string {
  const azar = crypto.getRandomValues(new Uint32Array(3))
  return Array.from(azar, (n) => ALFABETO[n % ALFABETO.length]).join("")
}

export function enlaceDe(d: { url: string; cuentaTipo: "persona" | "empresa"; codigo: string }): string {
  const campana = d.cuentaTipo === "persona" ? "federico" : "wav"
  return `${d.url}?utm_source=linkedin&utm_medium=social&utm_campaign=${campana}&utm_content=${d.codigo}`
}

export function conEnlace(texto: string, enlace: string): string {
  return `${texto.trimEnd()}\n\n${enlace}`
}

export function quitarEnlace(texto: string, enlace: string): string {
  return texto
    .split("\n")
    .filter((linea) => linea.trim() !== enlace)
    .join("\n")
    .trimEnd()
}

export function llevaElEnlace(texto: string, codigo: string): boolean {
  return texto.includes(`utm_content=${codigo}`)
}
```

(`n % 31` on a 32-bit value has a bias under 1e-8: irrelevant for a reference code.)

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm test:run tests/unit/destino-enlace.test.ts`
Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/destino/enlace.ts tests/unit/destino-enlace.test.ts
git commit -m "feat(destino): build the UTM link and place it in the text"
```

---

### Task 3: Reading and ranking the sites' pages

**Files:**
- Create: `lib/destino/paginas.ts`
- Test: `tests/unit/destino-paginas.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/destino-paginas.test.ts
import { HttpResponse, http } from "msw"
import { describe, expect, test } from "vitest"
import { leerPaginas, ordenarPorTexto, WEBS } from "@/lib/destino/paginas"
import { servidor } from "../msw"

const PAGINAS = [
  { url: "https://wr3.wearevision.cl/", titulo: "WR3", tema: "Investigación de mercado" },
  { url: "https://wr3.wearevision.cl/guias/focus-group/", titulo: "Focus group presencial u online", tema: "Cómo elegir" },
]

describe("site pages", () => {
  test("reads paginas.json of the chosen site", async () => {
    servidor.use(http.get("https://wr3.wearevision.cl/paginas.json", () => HttpResponse.json(PAGINAS)))
    expect(await leerPaginas("wr3")).toEqual(PAGINAS)
    expect(WEBS.wav.base).toBe("https://wearevision.cl/")
  })

  test("refuses a list with a page from another site or a malformed entry", async () => {
    servidor.use(
      http.get("https://wearevision.cl/paginas.json", () =>
        HttpResponse.json([{ url: "https://evil.example/", titulo: "x", tema: "y" }]),
      ),
    )
    await expect(leerPaginas("wav")).rejects.toThrow("paginas.json de wearevision.cl no es válido")
  })

  test("a failed answer throws", async () => {
    servidor.use(http.get("https://wr3.wearevision.cl/paginas.json", () => new HttpResponse(null, { status: 503 })))
    await expect(leerPaginas("wr3")).rejects.toThrow("503")
  })

  test("ranks first the pages sharing more words with the text, ignoring case, accents and short words", () => {
    const orden = ordenarPorTexto(PAGINAS, "¿Focus group ONLINE o presencial? Lo que aprendimos")
    expect(orden.map((p) => p.url)).toEqual([PAGINAS[1].url, PAGINAS[0].url])
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test:run tests/unit/destino-paginas.test.ts`
Expected: FAIL, cannot resolve `@/lib/destino/paginas`.

- [ ] **Step 3: Write the module**

```ts
// lib/destino/paginas.ts
import { z } from "zod"

export type Web = "wr3" | "wav"
export const WEBS: Record<Web, { nombre: string; base: string }> = {
  wr3: { nombre: "WR3", base: "https://wr3.wearevision.cl/" },
  wav: { nombre: "wearevision.cl", base: "https://wearevision.cl/" },
}

export interface Pagina {
  url: string
  titulo: string
  tema: string
}

const ESPERA_MS = 8_000

export async function leerPaginas(web: Web): Promise<Pagina[]> {
  const { nombre, base } = WEBS[web]
  const respuesta = await fetch(`${base}paginas.json`, { signal: AbortSignal.timeout(ESPERA_MS), cache: "no-store" })
  if (!respuesta.ok) throw new Error(`paginas.json de ${nombre} respondió ${respuesta.status}`)
  const lista = z
    .array(z.object({ url: z.string().startsWith(base), titulo: z.string(), tema: z.string() }))
    .safeParse(await respuesta.json())
  if (!lista.success) throw new Error(`paginas.json de ${nombre} no es válido`)
  return lista.data
}

/** Words of 4 or more letters, lowercase and without accents: cheap enough to rank without AI or cost (spec). */
function palabras(texto: string): Set<string> {
  const limpio = texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
  return new Set(limpio.match(/\p{L}{4,}/gu) ?? [])
}

export function ordenarPorTexto(paginas: Pagina[], texto: string): Pagina[] {
  const delTexto = palabras(texto)
  const puntaje = (p: Pagina) => [...palabras(`${p.titulo} ${p.tema}`)].filter((w) => delTexto.has(w)).length
  return paginas
    .map((p, i) => ({ p, i, n: puntaje(p) }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map(({ p }) => p)
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm test:run tests/unit/destino-paginas.test.ts`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/destino/paginas.ts tests/unit/destino-paginas.test.ts
git commit -m "feat(destino): read each site's paginas.json and rank pages by the piece's words"
```

---

### Task 4: `paginasParaPieza` and `ponerDestino`

**Files:**
- Create: `lib/destino/acciones.ts`
- Modify: `tests/integration/destino.test.ts` (append)

- [ ] **Step 1: Write the failing tests** (append to `tests/integration/destino.test.ts`, merging the imports at the top. The integration suite has no MSW, so these tests pass a page reader in: that is why `paginasParaPieza` and `ponerDestino` take it as a parameter, defaulting to `leerPaginas`.)

```ts
import { paginasParaPieza, ponerDestino } from "@/lib/destino/acciones"
import type { Pagina, Web } from "@/lib/destino/paginas"

const PAGINAS_WR3: Pagina[] = [
  { url: "https://wr3.wearevision.cl/", titulo: "WR3", tema: "Investigación" },
  { url: URL_WR3, titulo: "Focus group", tema: "Hola focus" },
]
const lector = (paginas: Pagina[] | Error) => async (_: Web) => {
  if (paginas instanceof Error) throw paginas
  return paginas
}

describe("ponerDestino", () => {
  test("appends the link with a new code and lists pages ranked by the text", async () => {
    const { db, piezaId } = await piezaDeTexto("pd-ok", "Hola, hablemos de focus group")
    const lista = await paginasParaPieza(db, { piezaId, web: "wr3" }, lector(PAGINAS_WR3))
    expect(lista.ok && lista.paginas[0].url).toBe(URL_WR3)
    const r = await ponerDestino(db, { piezaId, web: "wr3", url: URL_WR3 }, lector(PAGINAS_WR3))
    expect(r.ok).toBe(true)
    const v = await ultima(piezaId)
    expect(v?.texto).toMatch(
      /^Hola, hablemos de focus group\n\nhttps:\/\/wr3\.wearevision\.cl\/guias\/focus-group\/\?utm_source=linkedin&utm_medium=social&utm_campaign=federico&utm_content=[23456789abcdefghjkmnpqrstuvwxyz]{3}$/,
    )
  })

  test("changing the page replaces the link and keeps the code", async () => {
    const { db, piezaId } = await piezaDeTexto("pd-cambio")
    await ponerDestino(db, { piezaId, web: "wr3", url: URL_WR3 }, lector(PAGINAS_WR3))
    const antes = (await admin().from("piezas").select("codigo_ref").eq("id", piezaId).single()).data?.codigo_ref
    await ponerDestino(db, { piezaId, web: "wr3", url: "https://wr3.wearevision.cl/" }, lector(PAGINAS_WR3))
    const v = await ultima(piezaId)
    expect(v?.texto.match(/https:\/\//g)).toHaveLength(1)
    expect(v?.texto).toContain(`https://wr3.wearevision.cl/?utm_source=linkedin&utm_medium=social&utm_campaign=federico&utm_content=${antes}`)
  })

  test("no link removes it from the text", async () => {
    const { db, piezaId } = await piezaDeTexto("pd-sin")
    await ponerDestino(db, { piezaId, web: "wr3", url: URL_WR3 }, lector(PAGINAS_WR3))
    expect(await ponerDestino(db, { piezaId, web: null, url: null }, lector(PAGINAS_WR3))).toEqual({ ok: true })
    expect((await ultima(piezaId))?.texto).toBe("Hola")
  })

  test("refuses a URL that is not in paginas.json and says when the list cannot be read", async () => {
    const { db, piezaId } = await piezaDeTexto("pd-mal")
    expect(await ponerDestino(db, { piezaId, web: "wr3", url: "https://wr3.wearevision.cl/otra/" }, lector(PAGINAS_WR3))).toEqual({
      ok: false,
      error: "Esa página no está en la lista de WR3.",
    })
    expect(await ponerDestino(db, { piezaId, web: "wr3", url: URL_WR3 }, lector(new Error("503")))).toEqual({
      ok: false,
      error: "No pude leer las páginas de WR3.",
    })
  })

  test("refuses a text that would pass 3000 characters with the link", async () => {
    const { db, piezaId } = await piezaDeTexto("pd-largo", "a".repeat(2950))
    expect(await ponerDestino(db, { piezaId, web: "wr3", url: URL_WR3 }, lector(PAGINAS_WR3))).toEqual({
      ok: false,
      error: "Con el enlace, el texto pasa los 3000 caracteres de LinkedIn. Acórtalo primero.",
    })
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test:db tests/integration/destino.test.ts`
Expected: the 5 new tests FAIL, cannot resolve `@/lib/destino/acciones`.

- [ ] **Step 3: Write the actions**

```ts
// lib/destino/acciones.ts
import { z } from "zod"
import type { Resultado } from "@/lib/marcas/acciones"
import { codigoNuevo, conEnlace, enlaceDe, quitarEnlace } from "@/lib/destino/enlace"
import { leerPaginas, ordenarPorTexto, type Pagina, type Web, WEBS } from "@/lib/destino/paginas"
import type { Db } from "@/lib/supabase/database"

type LectorDePaginas = (web: Web) => Promise<Pagina[]>

const MENSAJES: Record<string, string> = {
  solo_el_dueno_cambia_piezas: "Solo quien maneja la marca puede cambiar la pieza.",
  pieza_no_editable: "Esta pieza ya no se puede cambiar.",
  codigo_cambiado: "La pieza cambió mientras elegías. Recarga y vuelve a elegir.",
  falta_el_enlace: "No pude poner el enlace en el texto. Inténtalo de nuevo.",
}

function falla(error: { code?: string; message: string }): { ok: false; error: string } {
  if (Object.hasOwn(MENSAJES, error.message)) return { ok: false, error: MENSAJES[error.message] }
  console.error("Falla inesperada al poner el destino", error.code, error.message)
  return { ok: false, error: "No pude guardar. Inténtalo de nuevo en un rato." }
}

const WebSchema = z.enum(["wr3", "wav"])

async function leerPieza(db: Db, piezaId: string) {
  const { data, error } = await db
    .from("piezas")
    .select("destino, destino_url, codigo_ref, cuentas(tipo), versiones(numero, texto)")
    .eq("id", piezaId)
    .maybeSingle()
  if (error) throw new Error(`No pude leer la pieza: ${error.message}`, { cause: error })
  if (!data?.cuentas) return null
  const texto = [...data.versiones].sort((a, b) => b.numero - a.numero)[0]?.texto ?? ""
  const cuentaTipo = data.cuentas.tipo === "persona" ? ("persona" as const) : ("empresa" as const)
  const anterior =
    data.destino && data.destino_url && data.codigo_ref
      ? enlaceDe({ url: data.destino_url, cuentaTipo, codigo: data.codigo_ref })
      : null
  return { ...data, texto, cuentaTipo, anterior }
}

export async function paginasParaPieza(
  db: Db,
  entrada: unknown,
  leer: LectorDePaginas = leerPaginas,
): Promise<Resultado<{ paginas: Pagina[] }>> {
  const e = z.object({ piezaId: z.uuid(), web: WebSchema }).safeParse(entrada)
  if (!e.success) return { ok: false, error: "Revisa el destino." }
  const pieza = await leerPieza(db, e.data.piezaId)
  if (!pieza) return { ok: false, error: "No encontré la pieza." }
  try {
    return { ok: true, paginas: ordenarPorTexto(await leer(e.data.web), pieza.texto) }
  } catch (error) {
    console.error("paginas.json no respondió", error instanceof Error ? error.message : error)
    return { ok: false, error: `No pude leer las páginas de ${WEBS[e.data.web].nombre}.` }
  }
}

const Destino = z.union([
  z.object({ piezaId: z.uuid(), web: z.null(), url: z.null() }),
  z.object({ piezaId: z.uuid(), web: WebSchema, url: z.url() }),
])

/** The link is part of the signed text: choosing, changing or removing it writes a new version (spec D8). */
export async function ponerDestino(db: Db, entrada: unknown, leer: LectorDePaginas = leerPaginas): Promise<Resultado> {
  const e = Destino.safeParse(entrada)
  if (!e.success) return { ok: false, error: "Revisa el destino." }
  const { piezaId, web, url } = e.data
  const pieza = await leerPieza(db, piezaId)
  if (!pieza) return { ok: false, error: "No encontré la pieza." }
  const base = pieza.anterior ? quitarEnlace(pieza.texto, pieza.anterior) : pieza.texto

  if (web === null) {
    if (!pieza.destino) return { ok: false, error: "La pieza no tiene enlace." }
    const { error } = await db.rpc("poner_destino", { p_pieza: piezaId, p_texto: base })
    return error ? falla(error) : { ok: true }
  }

  if (pieza.destino === web && pieza.destino_url === url) return { ok: false, error: "Ya tiene ese destino." }
  let paginas: Pagina[]
  try {
    paginas = await leer(web)
  } catch (error) {
    console.error("paginas.json no respondió", error instanceof Error ? error.message : error)
    return { ok: false, error: `No pude leer las páginas de ${WEBS[web].nombre}.` }
  }
  if (!paginas.some((p) => p.url === url)) {
    return { ok: false, error: `Esa página no está en la lista de ${WEBS[web].nombre}.` }
  }
  // A new code can collide with another piece's (31³ ≈ 30 000 codes): retry a few times with a fresh one.
  for (let intento = 0; intento < 5; intento++) {
    const codigo = pieza.codigo_ref ?? codigoNuevo()
    const texto = conEnlace(base, enlaceDe({ url, cuentaTipo: pieza.cuentaTipo, codigo }))
    if ([...texto].length > 3000) {
      return { ok: false, error: "Con el enlace, el texto pasa los 3000 caracteres de LinkedIn. Acórtalo primero." }
    }
    const { error } = await db.rpc("poner_destino", {
      p_pieza: piezaId,
      p_texto: texto,
      p_destino: web,
      p_destino_url: url,
      p_codigo: codigo,
    })
    if (!error) return { ok: true }
    if (error.code !== "23505" || pieza.codigo_ref) return falla(error)
  }
  return { ok: false, error: "No pude reservar un código para el enlace. Inténtalo de nuevo." }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm test:db tests/integration/destino.test.ts && pnpm type`
Expected: 11 PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/destino/acciones.ts tests/integration/destino.test.ts
git commit -m "feat(destino): choose, change or remove a piece's link from the site's page list"
```

---

### Task 5: The «Destino» control at gate 1

**Files:**
- Modify: `lib/piezas/lectura.ts` (`DetalleDePieza` and the `detalle` select)
- Create: `app/(app)/piezas/[id]/destino.tsx`
- Modify: `app/(app)/piezas/[id]/acciones.ts`, `app/(app)/piezas/[id]/page.tsx`
- Test: `tests/unit/destino.test.tsx`

- [ ] **Step 1: Write the failing component test**

```tsx
// tests/unit/destino.test.tsx
import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { DestinoDePieza } from "@/app/(app)/piezas/[id]/destino"

const PAGINAS = [
  { url: "https://wr3.wearevision.cl/guias/focus-group/", titulo: "Focus group", tema: "x" },
  { url: "https://wr3.wearevision.cl/", titulo: "WR3", tema: "y" },
]

describe("DestinoDePieza", () => {
  test("loads the chosen site's pages and saves the picked one", async () => {
    const cargar = vi.fn(async () => ({ ok: true as const, paginas: PAGINAS }))
    const poner = vi.fn(async () => ({ ok: true as const }))
    render(<DestinoDePieza piezaId="p1" destino={null} enlacePerdido={false} cargar={cargar} poner={poner} />)
    await act(async () => fireEvent.change(screen.getByLabelText("Destino"), { target: { value: "wr3" } }))
    expect(cargar).toHaveBeenCalledWith({ piezaId: "p1", web: "wr3" })
    await act(async () => fireEvent.change(screen.getByLabelText("Página"), { target: { value: PAGINAS[0].url } }))
    expect(poner).toHaveBeenCalledWith({ piezaId: "p1", web: "wr3", url: PAGINAS[0].url })
  })

  test("shows the error and offers no page when the list cannot be read", async () => {
    const cargar = vi.fn(async () => ({ ok: false as const, error: "No pude leer las páginas de WR3." }))
    render(<DestinoDePieza piezaId="p1" destino={null} enlacePerdido={false} cargar={cargar} poner={vi.fn()} />)
    await act(async () => fireEvent.change(screen.getByLabelText("Destino"), { target: { value: "wr3" } }))
    expect(screen.getByRole("alert").textContent).toBe("No pude leer las páginas de WR3.")
    expect(screen.queryByLabelText("Página")).toBeNull()
  })

  test("choosing no link removes it, and a lost link is called out", async () => {
    const poner = vi.fn(async () => ({ ok: true as const }))
    render(
      <DestinoDePieza
        piezaId="p1"
        destino={{ web: "wr3", url: PAGINAS[0].url }}
        enlacePerdido={true}
        cargar={vi.fn(async () => ({ ok: true as const, paginas: PAGINAS }))}
        poner={poner}
      />,
    )
    expect(screen.getByText(/El texto ya no lleva el enlace/)).toBeTruthy()
    await act(async () => fireEvent.change(screen.getByLabelText("Destino"), { target: { value: "" } }))
    expect(poner).toHaveBeenCalledWith({ piezaId: "p1", web: null, url: null })
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm test:run tests/unit/destino.test.tsx`
Expected: FAIL, cannot resolve `@/app/(app)/piezas/[id]/destino`.

- [ ] **Step 3: Write the component**

```tsx
// app/(app)/piezas/[id]/destino.tsx
"use client"

import { useState, useTransition } from "react"
import type { Pagina, Web } from "@/lib/destino/paginas"
import type { Resultado } from "@/lib/marcas/acciones"

interface Props {
  piezaId: string
  destino: { web: Web; url: string } | null
  /** The piece has a destination but its latest text no longer carries the link (a correction removed it). */
  enlacePerdido: boolean
  cargar: (entrada: { piezaId: string; web: Web }) => Promise<Resultado<{ paginas: Pagina[] }>>
  poner: (entrada: { piezaId: string; web: Web | null; url: string | null }) => Promise<Resultado>
}

const CAMPO = "campo w-full"

export function DestinoDePieza({ piezaId, destino, enlacePerdido, cargar, poner }: Props) {
  const [web, setWeb] = useState<Web | "">(destino?.web ?? "")
  const [paginas, setPaginas] = useState<Pagina[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()

  function elegirWeb(nueva: Web | "") {
    setWeb(nueva)
    setError(null)
    setPaginas(null)
    iniciar(async () => {
      if (nueva === "") {
        if (!destino) return
        const r = await poner({ piezaId, web: null, url: null })
        if (!r.ok) setError(r.error)
        return
      }
      const r = await cargar({ piezaId, web: nueva })
      if (!r.ok) return setError(r.error)
      setPaginas(r.paginas)
    })
  }

  function elegirPagina(url: string) {
    if (!url || web === "") return
    setError(null)
    iniciar(async () => {
      const r = await poner({ piezaId, web, url })
      if (!r.ok) setError(r.error)
    })
  }

  return (
    <div className="space-y-2">
      <label className="block space-y-1">
        <span className="text-sm">Destino</span>
        <select
          className={CAMPO}
          value={web}
          disabled={pendiente}
          onChange={(e) => elegirWeb(e.target.value as Web | "")}
        >
          <option value="">Sin enlace</option>
          <option value="wr3">WR3</option>
          <option value="wav">wearevision.cl</option>
        </select>
      </label>
      {destino && !paginas && <p className="text-sm text-apagado break-all">Enlaza a {destino.url}</p>}
      {enlacePerdido && (
        <p className="text-sm text-peligro">El texto ya no lleva el enlace de destino. Elige la página de nuevo.</p>
      )}
      {paginas && (
        <label className="block space-y-1">
          <span className="text-sm">Página</span>
          <select
            className={CAMPO}
            defaultValue=""
            disabled={pendiente}
            onChange={(e) => elegirPagina(e.target.value)}
          >
            <option value="" disabled>
              Elige una página
            </option>
            {paginas.map((p) => (
              <option key={p.url} value={p.url}>
                {p.titulo}
              </option>
            ))}
          </select>
        </label>
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

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm test:run tests/unit/destino.test.tsx`
Expected: 3 PASS.

- [ ] **Step 5: Load the destination in `detalle`**

In `lib/piezas/lectura.ts`, add to `DetalleDePieza` (after `pilarNombre`):

```ts
  /** The page the text links to (step 3 of «PostIA y las webs»); null without a link. */
  destino: { web: "wr3" | "wav"; url: string; codigo: string } | null
```

Add `destino, destino_url, codigo_ref` to the `detalle` select string (after `pilar_id`), and in the returned object:

```ts
    destino:
      (p.destino === "wr3" || p.destino === "wav") && p.destino_url && p.codigo_ref
        ? { web: p.destino, url: p.destino_url, codigo: p.codigo_ref }
        : null,
```

Run: `pnpm type` → fix any test fixture that builds a `DetalleDePieza` by hand by adding `destino: null` (grep `pilarNombre:` in `tests/` to find them).

- [ ] **Step 6: Server actions**

Append to `app/(app)/piezas/[id]/acciones.ts`:

```ts
import { paginasParaPieza, ponerDestino } from "@/lib/destino/acciones"
import type { Pagina, Web } from "@/lib/destino/paginas"

export async function paginasAccion(entrada: { piezaId: string; web: Web }): Promise<Resultado<{ paginas: Pagina[] }>> {
  return paginasParaPieza(await createActionClient(), entrada)
}

export async function ponerDestinoAccion(entrada: {
  piezaId: string
  web: Web | null
  url: string | null
}): Promise<Resultado> {
  return despues(entrada.piezaId, await ponerDestino(await createActionClient(), entrada))
}
```

(Put the two imports with the file's other imports.)

- [ ] **Step 7: Render it in the page**

In `app/(app)/piezas/[id]/page.tsx`, import `DestinoDePieza` and `llevaElEnlace` (from `@/lib/destino/enlace`), and the two new actions. Right after `{porFirmar && !armando && <FinDelTexto />}`, add:

```tsx
      {editable && (
        <DestinoDePieza
          piezaId={pieza.id}
          destino={pieza.destino && { web: pieza.destino.web, url: pieza.destino.url }}
          enlacePerdido={pieza.destino !== null && !llevaElEnlace(version.texto, pieza.destino.codigo)}
          cargar={paginasAccion}
          poner={ponerDestinoAccion}
        />
      )}
```

`editable` is the page's existing flag for states where the text can change; if it is named differently, use the same condition the page uses to show `CorregirTexto`. Choosing a page writes a new version: the page re-mounts on `key={version.huella}` and the signature, if any, drops, as with any text correction.

- [ ] **Step 8: Run unit tests, types and lint**

Run: `pnpm test:run && pnpm type && pnpm lint`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/piezas/lectura.ts "app/(app)/piezas/[id]/destino.tsx" "app/(app)/piezas/[id]/acciones.ts" "app/(app)/piezas/[id]/page.tsx" tests/unit/destino.test.tsx tests/
git commit -m "feat(destino): pick a piece's destination and page at gate 1"
```

---

### Task 6: The publish-time check

**Files:**
- Modify: `lib/publicacion/publicar.ts`, `lib/publicacion/repositorio.ts`
- Test: `tests/unit/publicar.test.ts`

- [ ] **Step 1: Write the failing tests** (append to `tests/unit/publicar.test.ts`; also add `destino: null,` to the `pieza()` fixture's returned object and `paginasDe: async () => null,` to the `puertos()` defaults)

```ts
describe("destination page check", () => {
  const URL = "https://wr3.wearevision.cl/guias/focus-group/"
  const conDestino = () =>
    pieza({
      destino: { web: "wr3", url: URL, codigo: "k7m" },
      version: { ...pieza().version, texto: `Hola\n\n${URL}?utm_content=k7m` },
    })

  test("sends back a piece whose page left paginas.json", async () => {
    const p = puertos({ paginasDe: async () => ["https://wr3.wearevision.cl/"] })
    expect(await publicarPieza(p, conDestino())).toBe("por_aprobar")
    expect(p.movimientos).toContainEqual(["pieza-1", "por_aprobar", "La página de destino ya no existe."])
  })

  test("publishes when paginas.json does not answer: the page was checked at signing", async () => {
    const p = puertos({ paginasDe: async () => null })
    expect(await publicarPieza(p, conDestino())).toBe("publicada")
  })

  test("publishes when the page is still listed", async () => {
    const p = puertos({ paginasDe: async () => [URL] })
    expect(await publicarPieza(p, conDestino())).toBe("publicada")
  })

  test("sends back a piece whose text lost the link", async () => {
    const p = puertos({ paginasDe: async () => [URL] })
    const sinEnlace = pieza({ destino: { web: "wr3", url: URL, codigo: "k7m" } })
    expect(await publicarPieza(p, sinEnlace)).toBe("por_aprobar")
    expect(p.movimientos).toContainEqual([
      "pieza-1",
      "por_aprobar",
      "El texto ya no lleva el enlace de destino. Elige la página de nuevo y fírmala.",
    ])
  })
})
```

Before running, check how the existing `puertos()` helper records moves (the property may not be called `movimientos`); use the name it already exposes and the same tuple shape the neighbouring «exception» tests assert on.

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm test:run tests/unit/publicar.test.ts`
Expected: FAIL (type error on `destino` / `paginasDe`, then the new assertions).

- [ ] **Step 3: Implement the check**

In `lib/publicacion/publicar.ts`:

1. Add to `PiezaParaPublicar`:
```ts
  /** The website page the text links to; checked again right before sending. */
  destino: { web: "wr3" | "wav"; url: string; codigo: string } | null
```
2. Add to `PuertosDePublicacion`:
```ts
  /** The URLs in a site's paginas.json, or null when it cannot be read: then the piece goes out (spec). */
  paginasDe(web: "wr3" | "wav"): Promise<string[] | null>
```
3. Add the helper and call it in `publicarPieza` right after the `clienteConExcepcionNueva` block:
```ts
/** Spec «Errores»: a page that left the site sends the piece back; a site that does not answer does not stop it. */
async function motivoDeDestino(p: PuertosDePublicacion, pieza: PiezaParaPublicar): Promise<string | null> {
  if (!pieza.destino) return null
  if (!llevaElEnlace(pieza.version.texto, pieza.destino.codigo)) {
    return "El texto ya no lleva el enlace de destino. Elige la página de nuevo y fírmala."
  }
  const urls = await p.paginasDe(pieza.destino.web)
  return urls && !urls.includes(pieza.destino.url) ? "La página de destino ya no existe." : null
}
```
```ts
  const destino = await motivoDeDestino(p, pieza)
  if (destino) return devolver(p, pieza, "por_aprobar", destino)
```
(import `llevaElEnlace` from `@/lib/destino/enlace`.)

In `lib/publicacion/repositorio.ts`:

1. Add `destino, destino_url, codigo_ref` to the `tomarPendientes` select string (after `ventana_minutos`), and to the pushed object:
```ts
            destino:
              (p.destino === "wr3" || p.destino === "wav") && p.destino_url && p.codigo_ref
                ? { web: p.destino, url: p.destino_url, codigo: p.codigo_ref }
                : null,
```
2. Add the production port next to `excepcionesPuestasDespues` (and to the `Pick`/list of port names at the top of the file if it enumerates them):
```ts
    paginasDe: async (web) => {
      try {
        return (await leerPaginas(web)).map((pagina) => pagina.url)
      } catch (error) {
        console.error(`paginas.json de ${web} no respondió al publicar`, error instanceof Error ? error.message : error)
        return null
      }
    },
```
(import `leerPaginas` from `@/lib/destino/paginas`.)

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm test:run && pnpm type && pnpm test:db`
Expected: all PASS (the integration `repositorio-publicacion` test exercises the new select).

- [ ] **Step 5: Commit**

```bash
git add lib/publicacion/publicar.ts lib/publicacion/repositorio.ts tests/unit/publicar.test.ts
git commit -m "feat(destino): send a piece back when its destination page left the site"
```

---

### Task 7: Check it in the browser

- [ ] **Step 1:** Run the full gate: `pnpm lint && pnpm type && pnpm test:run && pnpm test:db`. Expected: all PASS.
- [ ] **Step 2:** With Federico's `next dev` running (never kill it; start the `postia` preview only if it is not), open a piece in `por_aprobar` on desktop and at 375 px:
  - Choose WR3: the page list loads, ranked by the text; pick a page; the text shows the link on its last line with `utm_campaign` matching the account and a 3-character `utm_content`.
  - Change the page: one link only, same code. Choose «Sin enlace»: the link disappears.
  - Correct the text by hand and delete the link line: the red «El texto ya no lleva el enlace…» shows.
  - No console errors, no horizontal scroll.
- [ ] **Step 3:** Screenshot the control with a page chosen and send it to Federico.

---

### Task 8: Production — gated, ask Federico for each

- [ ] **Step 1 (ask):** apply `20261110130000_destino_de_piezas.sql` to the hosted Supabase project (`supabase db push`), after showing Federico the migration.
- [ ] **Step 2 (ask):** PR, merge and `pnpm desplegar` (see `docs/despliegue.md`).
- [ ] **Step 3 (ask):** one real post with a link, on the profile, to confirm on LinkedIn that the URL shows with plain `_` and is clickable, and that WhatsApp from that page says «ref. XXX». Only with Federico's explicit OK: it publishes for real.
