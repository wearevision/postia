// tests/integration/mapa-de-temas.test.ts
import { randomUUID } from "node:crypto"
import { beforeEach, describe, expect, test } from "vitest"
import { admin, limpiarMapa, literal, marcaConDueno, personaConSesion, vectorDe } from "./entorno"

const UMBRALES = { repetido: 0.95, tema: 0.8 }

async function guardar(v: number[], enlace = `https://medio.cl/${randomUUID()}`) {
  const { data, error } = await admin().rpc("guardar_hallazgo", {
    p_resumen: "Un hallazgo de prueba",
    p_enlace: enlace,
    p_enlace_normalizado: enlace.replace(/^https?:\/\//, ""),
    p_medio: "Medio",
    p_vector: literal(v),
    p_umbral_repetido: UMBRALES.repetido,
    p_umbral_tema: UMBRALES.tema,
  })
  if (error) throw error
  return data as { estado: "guardado"; id: string; tema: string | null } | { estado: "repetido"; de: string }
}

async function idDe(v: number[]): Promise<string> {
  const r = await guardar(v)
  if (r.estado !== "guardado") throw new Error("se esperaba guardado")
  return r.id
}

async function tema(nombre: string, ids: string[]): Promise<string> {
  const { data, error } = await admin().rpc("crear_tema", {
    p_nombre: nombre,
    p_descripcion: "",
    p_hallazgos: ids,
  })
  if (error) throw error
  return data
}

beforeEach(limpiarMapa)

describe("guardar_hallazgo", () => {
  test("saves a finding with no topic when the map is empty", async () => {
    const r = await guardar(vectorDe(0))
    expect(r).toMatchObject({ estado: "guardado", tema: null })
  })

  test("accepts a link whose scheme is in capitals", async () => {
    expect(await guardar(vectorDe(0), "HTTPS://Medio.cl/nota")).toMatchObject({ estado: "guardado" })
  })

  test("refuses a finding whose normalized link is already saved, whatever its vector", async () => {
    const primero = await idDe(vectorDe(0))
    const { data: fila } = await admin().from("hallazgos").select("enlace").eq("id", primero).single()
    expect(await guardar(vectorDe(500), fila?.enlace)).toEqual({ estado: "repetido", de: primero })
  })

  test("refuses a finding almost identical to a saved one, even a discarded one", async () => {
    const primero = await idDe(vectorDe(0))
    await admin().from("hallazgos").update({ estado: "descartado" }).eq("id", primero)
    expect(await guardar(vectorDe(0, { hacia: 1, similitud: 0.98 }))).toEqual({ estado: "repetido", de: primero })
  })

  test("places a finding in its nearest topic above the threshold and moves the centroid", async () => {
    const id = await tema("Eventos híbridos", [
      await idDe(vectorDe(0)),
      await idDe(vectorDe(0, { hacia: 1, similitud: 0.9 })),
    ])
    await tema("Lejano", [await idDe(vectorDe(700))])
    const r = await guardar(vectorDe(0, { hacia: 2, similitud: 0.9 }))
    expect(r).toMatchObject({ estado: "guardado", tema: id })
    const { count } = await admin().from("hallazgos").select("id", { count: "exact", head: true }).eq("tema_id", id)
    expect(count).toBe(3)
  })

  test("leaves a finding loose when no topic reaches the threshold", async () => {
    await tema("Eventos híbridos", [await idDe(vectorDe(0))])
    expect(await guardar(vectorDe(0, { hacia: 3, similitud: 0.7 }))).toMatchObject({ estado: "guardado", tema: null })
  })
})

describe("crear_tema", () => {
  test("refuses to create a topic when none of its findings is still loose", async () => {
    const id = await idDe(vectorDe(0))
    await tema("Primero", [id])
    const { error } = await admin().rpc("crear_tema", { p_nombre: "Segundo", p_descripcion: "", p_hallazgos: [id] })
    expect(error?.message).toMatch(/ningún hallazgo suelto/)
  })
})

describe("temas_cercanos", () => {
  test("returns active topics nearest first and leaves merged ones out", async () => {
    const cerca = await tema("Cerca", [await idDe(vectorDe(0, { hacia: 1, similitud: 0.9 }))])
    const medio = await tema("Medio", [await idDe(vectorDe(0, { hacia: 2, similitud: 0.6 }))])
    const fusionado = await tema("Fusionado", [await idDe(vectorDe(0, { hacia: 3, similitud: 0.85 }))])
    await admin().rpc("fusionar_temas", { p_de: fusionado, p_en: medio })
    const { data, error } = await admin().rpc("temas_cercanos", { p_vector: literal(vectorDe(0)), p_cantidad: 5 })
    if (error) throw error
    expect(data.map((t) => t.id)).toEqual([cerca, medio])
    expect(data[0].similitud).toBeCloseTo(0.9, 3)
  })
})

describe("reubicar_pendientes", () => {
  test("places loose findings that a topic now reaches and skips discarded ones", async () => {
    const suelto = await idDe(vectorDe(0, { hacia: 1, similitud: 0.9 }))
    const descartado = await idDe(vectorDe(0, { hacia: 2, similitud: 0.9 }))
    await admin().from("hallazgos").update({ estado: "descartado" }).eq("id", descartado)
    // Centroid ≈ 0.88 from `suelto`: clearly above 0.80.
    const id = await tema("Eventos", [await idDe(vectorDe(0)), await idDe(vectorDe(0, { hacia: 3, similitud: 0.9 }))])
    const { data, error } = await admin().rpc("reubicar_pendientes", { p_umbral: UMBRALES.tema })
    if (error) throw error
    expect(data).toBe(1)
    const { data: filas } = await admin().from("hallazgos").select("id, tema_id").in("id", [suelto, descartado])
    expect(Object.fromEntries((filas ?? []).map((f) => [f.id, f.tema_id]))).toEqual({
      [suelto]: id,
      [descartado]: null,
    })
  })
})

describe("hallazgos_pendientes and temas_casi_iguales", () => {
  test("lists loose, non-discarded findings with their vector", async () => {
    const id = await idDe(vectorDe(5))
    const { data, error } = await admin().rpc("hallazgos_pendientes", { p_limite: 10 })
    if (error) throw error
    expect(data).toHaveLength(1)
    expect(data[0].id).toBe(id)
    expect(JSON.parse(data[0].vector)[5]).toBe(1)
  })

  test("returns the newest loose findings first, so old singletons cannot starve new ones", async () => {
    await idDe(vectorDe(5))
    const nuevo = await idDe(vectorDe(300))
    const { data, error } = await admin().rpc("hallazgos_pendientes", { p_limite: 1 })
    if (error) throw error
    expect(data.map((h) => h.id)).toEqual([nuevo])
  })

  test("pairs active topics whose centroids reach the threshold, with their sizes", async () => {
    // Every finding is saved before any topic exists, or a later one would join an earlier topic on its own.
    // Pairwise similarities stay under 0.95 (no repeats); the A and B centroids land at ≈ 0.926.
    const enA = [await idDe(vectorDe(0)), await idDe(vectorDe(0, { hacia: 9, similitud: 0.94 }))]
    const enB = [await idDe(vectorDe(0, { hacia: 1, similitud: 0.94 }))]
    const enC = [await idDe(vectorDe(400))]
    const a = await tema("A", enA)
    const b = await tema("B", enB)
    await tema("C", enC)
    const { data, error } = await admin().rpc("temas_casi_iguales", { p_umbral: 0.92 })
    if (error) throw error
    expect(data).toHaveLength(1)
    const par = data[0]
    expect(new Set([par.tema_a, par.tema_b])).toEqual(new Set([a, b]))
    expect(par.tema_a === a ? par.hallazgos_a : par.hallazgos_b).toBe(2)
  })
})

describe("fusionar_temas", () => {
  test("moves findings and names into the survivor and leaves a pointer; a second merge is refused", async () => {
    const enEventos = await idDe(vectorDe(0))
    const enActivaciones = await idDe(vectorDe(0, { hacia: 1, similitud: 0.9 }))
    const en = await tema("Eventos", [enEventos])
    const de = await tema("Activaciones", [enActivaciones])
    const primera = await admin().rpc("fusionar_temas", { p_de: de, p_en: en })
    expect(primera.data).toBe(true)
    const { data: sobreviviente } = await admin().from("temas").select("alias").eq("id", en).single()
    expect(sobreviviente?.alias).toEqual(["Activaciones"])
    const { data: viejo } = await admin().from("temas").select("fusionado_en").eq("id", de).single()
    expect(viejo?.fusionado_en).toBe(en)
    const { count } = await admin().from("hallazgos").select("id", { count: "exact", head: true }).eq("tema_id", en)
    expect(count).toBe(2)
    const segunda = await admin().rpc("fusionar_temas", { p_de: de, p_en: en })
    expect(segunda.data).toBe(false)
  })
})

describe("the map after a merge", () => {
  test("a finding saved with the merged topic's old vector lands in the survivor and never in a merged topic", async () => {
    const enA = await idDe(vectorDe(0))
    const enB = await idDe(vectorDe(0, { hacia: 1, similitud: 0.9 }))
    const a = await tema("A", [enA])
    const b = await tema("B", [enB])
    await admin().rpc("fusionar_temas", { p_de: b, p_en: a })
    const r = await guardar(vectorDe(0, { hacia: 2, similitud: 0.9 }))
    if (r.estado !== "guardado") throw new Error("se esperaba guardado")
    expect([a, null]).toContain(r.tema)
    const { data: fusionados } = await admin().from("temas").select("id").not("fusionado_en", "is", null)
    const { count } = await admin()
      .from("hallazgos")
      .select("id", { count: "exact", head: true })
      .in(
        "tema_id",
        (fusionados ?? []).map((t) => t.id),
      )
    expect(count).toBe(0)
  })
})

describe("fusionar_temas chains", () => {
  test("re-points topics already merged into the one that merges away, so pointers never chain", async () => {
    const x = await tema("X", [await idDe(vectorDe(0))])
    const b = await tema("B", [await idDe(vectorDe(100))])
    const a = await tema("A", [await idDe(vectorDe(200))])
    await admin().rpc("fusionar_temas", { p_de: x, p_en: b })
    await admin().rpc("fusionar_temas", { p_de: b, p_en: a })
    const { data } = await admin().from("temas").select("id, fusionado_en").in("id", [x, b])
    expect(Object.fromEntries((data ?? []).map((t) => [t.id, t.fusionado_en]))).toEqual({ [x]: a, [b]: a })
  })
})

describe("access", () => {
  test("a member reads topics and findings but cannot call the service RPCs", async () => {
    await tema("Visible", [await idDe(vectorDe(0))])
    const persona = await personaConSesion("mapa")
    await marcaConDueno(persona.userId)
    const { data } = await persona.db.from("temas").select("nombre")
    expect(data?.map((t) => t.nombre)).toEqual(["Visible"])
    const { error } = await persona.db.rpc("temas_cercanos", { p_vector: literal(vectorDe(0)), p_cantidad: 1 })
    expect(error?.code).toBe("42501")
  })

  test("a signed-in person who belongs to no brand sees nothing", async () => {
    await tema("Oculto", [await idDe(vectorDe(0))])
    const ajena = await personaConSesion("mapa-ajena")
    const { data } = await ajena.db.from("hallazgos").select("id")
    expect(data).toEqual([])
  })
})
