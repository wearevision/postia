// tests/integration/investigaciones.test.ts
import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest"
import type { Db } from "@/lib/supabase/database"
import type { Database } from "@/lib/supabase/database.types"
import { admin, entornoLocal, limpiarMapa, literal, marcaConDueno, personaConSesion, vectorDe } from "./entorno"

const MOTIVO_DOS_INTENTOS = "No pude terminar la investigación después de dos intentos. Pídela de nuevo."
const ANGULOS = [
  { nombre: "Presupuesto", por_que: "Lo que cuesta un focus group." },
  { nombre: "Mitos", por_que: "Lo que se cree y no es." },
]

let dueno: { db: Db; userId: string }
let ajeno: { db: Db; userId: string }
const vigilancias: string[] = []

/**
 * Research is not per brand: the open limit and the job queue are global. Each test starts with nothing open.
 * Local test database only.
 */
async function cerrarAbiertas(): Promise<void> {
  const trabajos = await admin()
    .from("trabajos_de_investigacion")
    .update({ estado: "fallo", motivo: "Cerrado entre pruebas.", arrendado_hasta: null })
    .in("estado", ["pendiente", "trabajando"])
  if (trabajos.error) throw trabajos.error
  const investigaciones = await admin()
    .from("investigaciones")
    .update({ estado: "fallo", motivo: "Cerrada entre pruebas." })
    .in("estado", ["en_cola", "investigando"])
  if (investigaciones.error) throw investigaciones.error
}

async function pedir(db: Db = dueno.db, tema = "WR3 y focus groups"): Promise<string> {
  const { data, error } = await db.rpc("pedir_investigacion", {
    p_tema: tema,
    p_cantidad: 10,
    p_formato: "carrusel_pdf",
    p_enfoque: "mitos",
  })
  if (error) throw error
  return data
}

async function investigacion(id: string) {
  const { data, error } = await admin().from("investigaciones").select("*").eq("id", id).single()
  if (error) throw error
  return data
}

async function trabajosDe(id: string) {
  const { data, error } = await admin()
    .from("trabajos_de_investigacion")
    .select("*")
    .eq("investigacion_id", id)
    .order("creado_en")
  if (error) throw error
  return data
}

async function tomar() {
  const { data, error } = await admin().rpc("tomar_trabajo_de_investigacion")
  if (error) throw error
  return data
}

/** Requests, takes its job, saves no finding and closes it with the given angles: a report waiting for approval. */
async function informePorAprobar(): Promise<string> {
  const id = await pedir()
  const [trabajo] = await tomar()
  const cierre = await admin().rpc("cerrar_investigacion", { p_investigacion: id, p_angulos: ANGULOS })
  if (cierre.error) throw cierre.error
  const fin = await admin().rpc("terminar_trabajo_de_investigacion", { p_trabajo: trabajo.id, p_estado: "hecho" })
  if (fin.error) throw fin.error
  return id
}

async function guardarDe(
  id: string | null,
  angulo: string | null,
  v: number[],
  enlace = `https://medio.cl/${randomUUID()}`,
) {
  const { data, error } = await admin().rpc("guardar_hallazgo", {
    p_resumen: "Un hallazgo de prueba",
    p_enlace: enlace,
    p_enlace_normalizado: enlace.replace(/^https?:\/\//, ""),
    p_medio: "Medio",
    p_vector: literal(v),
    p_umbral_repetido: 0.95,
    p_umbral_tema: 0.8,
    p_investigacion: id ?? undefined,
    p_angulo: angulo ?? undefined,
  })
  if (error) throw error
  return data as { estado: "guardado"; id: string; tema: string | null } | { estado: "repetido"; de: string }
}

beforeAll(async () => {
  dueno = await personaConSesion("investigaciones-dueno")
  await marcaConDueno(dueno.userId)
  ajeno = await personaConSesion("investigaciones-ajeno")
})

beforeEach(cerrarAbiertas)

afterAll(async () => {
  await cerrarAbiertas()
  // Watch rows have no author, so the global cleanup does not reach them.
  if (vigilancias.length > 0) await admin().from("investigaciones").delete().in("id", vigilancias)
})

describe("pedir_investigacion", () => {
  test("an owner's request queues the research and its job", async () => {
    const id = await pedir()
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect(await investigacion(id)).toMatchObject({
      origen: "encargo",
      estado: "en_cola",
      tema: "WR3 y focus groups",
      cantidad: 10,
      formato: "carrusel_pdf",
      enfoque: "mitos",
      angulos: [],
      pedida_por: dueno.userId,
    })
    expect(await trabajosDe(id)).toEqual([
      expect.objectContaining({ tipo: "investigar", estado: "pendiente", intentos: 0, angulo: null }),
    ])
  })

  test("a person who owns no brand cannot ask", async () => {
    const { error } = await ajeno.db.rpc("pedir_investigacion", {
      p_tema: "Algo",
      p_cantidad: 3,
      p_formato: "texto",
    })
    expect(error?.code).toBe("42501")
    expect(error?.message).toBe("solo_duenos_investigan")
  })

  test("at most 3 open requests across all brands", async () => {
    const otro = await personaConSesion("investigaciones-otro")
    await marcaConDueno(otro.userId, "nosotros")
    await pedir()
    await pedir(otro.db)
    await pedir()
    const { error } = await otro.db.rpc("pedir_investigacion", {
      p_tema: "Cuarta",
      p_cantidad: 3,
      p_formato: "texto",
    })
    expect(error?.message).toBe("demasiadas_investigaciones")
  })

  test("a running watch does not count against the request limit", async () => {
    const { data: vigilancia, error } = await admin().rpc("crear_vigilancia", { p_temas: ["Eventos"] })
    if (error) throw error
    vigilancias.push(vigilancia)
    await pedir()
    await pedir()
    await pedir()
  })

  test("refuses formats phase 1 does not offer and quantities out of range", async () => {
    const foto = await dueno.db.rpc("pedir_investigacion", {
      p_tema: "Algo",
      p_cantidad: 3,
      p_formato: "foto_instagram",
    })
    expect(foto.error?.message).toBe("formato_no_disponible")
    for (const cantidad of [0, 31]) {
      const { error } = await dueno.db.rpc("pedir_investigacion", {
        p_tema: "Algo",
        p_cantidad: cantidad,
        p_formato: "texto",
      })
      expect(error?.code).toBe("23514")
    }
  })
})

describe("tomar_trabajo_de_investigacion", () => {
  test("leases the oldest job, counts the attempt and marks the research as investigating", async () => {
    const primera = await pedir()
    const segunda = await pedir()
    const tomados = await tomar()
    expect(tomados).toHaveLength(1)
    expect(tomados[0]).toMatchObject({ investigacion_id: primera, estado: "trabajando", intentos: 1 })
    expect(new Date(tomados[0].arrendado_hasta as string).getTime()).toBeGreaterThan(Date.now() + 14 * 60_000)
    expect((await investigacion(primera)).estado).toBe("investigando")
    expect((await investigacion(segunda)).estado).toBe("en_cola")
  })

  test("a job whose lease expired after two attempts is closed as failed, and so is its research", async () => {
    const id = await pedir()
    const [trabajo] = await tomar()
    const vencer = await admin()
      .from("trabajos_de_investigacion")
      .update({ arrendado_hasta: new Date(Date.now() - 60_000).toISOString(), intentos: 2 })
      .eq("id", trabajo.id)
    if (vencer.error) throw vencer.error
    expect(await tomar()).toEqual([])
    expect((await trabajosDe(id))[0]).toMatchObject({
      estado: "fallo",
      motivo: MOTIVO_DOS_INTENTOS,
      arrendado_hasta: null,
    })
    expect(await investigacion(id)).toMatchObject({ estado: "fallo", motivo: MOTIVO_DOS_INTENTOS })
  })

  test("an expired lease with one attempt is leased again", async () => {
    await pedir()
    const [trabajo] = await tomar()
    await admin()
      .from("trabajos_de_investigacion")
      .update({ arrendado_hasta: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", trabajo.id)
    const [otra] = await tomar()
    expect(otra).toMatchObject({ id: trabajo.id, intentos: 2 })
  })
})

describe("guardar_hallazgo with a research", () => {
  beforeEach(limpiarMapa)

  test("stores the research and the angle, and a repeat is still a repeat", async () => {
    const id = await pedir()
    await tomar()
    const enlace = `https://medio.cl/${randomUUID()}`
    const r = await guardarDe(id, "Mitos", vectorDe(0), enlace)
    expect(r).toMatchObject({ estado: "guardado" })
    if (r.estado !== "guardado") return
    const { data: fila } = await admin().from("hallazgos").select("investigacion_id, angulo").eq("id", r.id).single()
    expect(fila).toEqual({ investigacion_id: id, angulo: "Mitos" })
    expect(await guardarDe(id, "Mitos", vectorDe(9), enlace)).toEqual({ estado: "repetido", de: r.id })
  })

  test("a finding without research still saves as in 4d", async () => {
    const r = await guardarDe(null, null, vectorDe(1))
    expect(r).toMatchObject({ estado: "guardado", tema: null })
  })
})

describe("closing a research", () => {
  test("cerrar_investigacion leaves the report waiting with its angles and the job is done", async () => {
    const id = await pedir()
    const [trabajo] = await tomar()
    expect((await admin().rpc("cerrar_investigacion", { p_investigacion: id, p_angulos: ANGULOS })).error).toBeNull()
    const fin = await admin().rpc("terminar_trabajo_de_investigacion", { p_trabajo: trabajo.id, p_estado: "hecho" })
    expect(fin.error).toBeNull()
    const fila = await investigacion(id)
    expect(fila).toMatchObject({ estado: "informe_por_aprobar", angulos: ANGULOS })
    expect(fila.cerrada_en).not.toBeNull()
    expect((await trabajosDe(id))[0]).toMatchObject({ estado: "hecho", arrendado_hasta: null })
  })

  test("an extension appends only the angles not already present", async () => {
    const id = await informePorAprobar()
    expect((await dueno.db.rpc("pedir_ampliacion", { p_investigacion: id, p_angulo: "Presupuesto" })).error).toBeNull()
    await tomar()
    const nuevos = [ANGULOS[0], { nombre: "Salas espejo", por_que: "Dónde se hacen." }]
    expect((await admin().rpc("cerrar_investigacion", { p_investigacion: id, p_angulos: nuevos })).error).toBeNull()
    expect((await investigacion(id)).angulos).toEqual([...ANGULOS, nuevos[1]])
  })

  test("a watch closes approved, without a report", async () => {
    const { data: id, error } = await admin().rpc("crear_vigilancia", { p_temas: ["Eventos híbridos", "Focus groups"] })
    if (error) throw error
    vigilancias.push(id)
    expect(await investigacion(id)).toMatchObject({
      origen: "vigilancia",
      estado: "investigando",
      tema: "Eventos híbridos · Focus groups",
      pedida_por: null,
    })
    expect((await admin().rpc("cerrar_investigacion", { p_investigacion: id, p_angulos: [] })).error).toBeNull()
    expect((await investigacion(id)).estado).toBe("aprobada")
  })

  test("a watch with many topics is truncated to 300 characters", async () => {
    const temas = Array.from({ length: 40 }, (_, i) => `Tema número ${i}`)
    const { data: id, error } = await admin().rpc("crear_vigilancia", { p_temas: temas })
    if (error) throw error
    vigilancias.push(id)
    expect((await investigacion(id)).tema).toHaveLength(300)
  })

  test("a failed request job fails the research with its motivo", async () => {
    const id = await pedir()
    const [trabajo] = await tomar()
    const fin = await admin().rpc("terminar_trabajo_de_investigacion", {
      p_trabajo: trabajo.id,
      p_estado: "fallo",
      p_motivo: "La búsqueda no respondió.",
    })
    expect(fin.error).toBeNull()
    expect(await investigacion(id)).toMatchObject({ estado: "fallo", motivo: "La búsqueda no respondió." })
    expect((await trabajosDe(id))[0]).toMatchObject({ estado: "fallo", motivo: "La búsqueda no respondió." })
  })

  test("a failed extension leaves the report standing", async () => {
    const id = await informePorAprobar()
    await dueno.db.rpc("pedir_ampliacion", { p_investigacion: id, p_angulo: "Mitos" })
    const [trabajo] = await tomar()
    await admin().rpc("terminar_trabajo_de_investigacion", { p_trabajo: trabajo.id, p_estado: "fallo", p_motivo: "x" })
    expect((await investigacion(id)).estado).toBe("informe_por_aprobar")
  })

  test("terminar refuses a state other than hecho or fallo", async () => {
    await pedir()
    const [trabajo] = await tomar()
    const { error } = await admin().rpc("terminar_trabajo_de_investigacion", {
      p_trabajo: trabajo.id,
      p_estado: "pendiente",
    })
    expect(error?.code).toBe("22023")
  })
})

describe("the report", () => {
  test("aprobar_informe approves a waiting report", async () => {
    const id = await informePorAprobar()
    expect((await dueno.db.rpc("aprobar_informe", { p_investigacion: id })).error).toBeNull()
    expect((await investigacion(id)).estado).toBe("aprobada")
  })

  test("descartar_informe discards the report and every finding of it", async () => {
    await limpiarMapa()
    const id = await pedir()
    const [trabajo] = await tomar()
    const a = await guardarDe(id, "Mitos", vectorDe(0))
    const b = await guardarDe(id, "Presupuesto", vectorDe(5))
    const suelto = await guardarDe(null, null, vectorDe(10))
    await admin().rpc("cerrar_investigacion", { p_investigacion: id, p_angulos: ANGULOS })
    await admin().rpc("terminar_trabajo_de_investigacion", { p_trabajo: trabajo.id, p_estado: "hecho" })
    expect((await dueno.db.rpc("descartar_informe", { p_investigacion: id })).error).toBeNull()
    expect((await investigacion(id)).estado).toBe("descartada")
    const ids = [a, b, suelto].map((r) => (r.estado === "guardado" ? r.id : ""))
    const { data } = await admin().from("hallazgos").select("id, estado").in("id", ids)
    const estados = new Map(data?.map((h) => [h.id, h.estado]))
    expect([estados.get(ids[0]), estados.get(ids[1]), estados.get(ids[2])]).toEqual([
      "descartado",
      "descartado",
      "nuevo",
    ])
  })

  test("descartar_hallazgo discards one finding of a waiting report", async () => {
    await limpiarMapa()
    const id = await pedir()
    const [trabajo] = await tomar()
    const a = await guardarDe(id, "Mitos", vectorDe(0))
    const b = await guardarDe(id, "Mitos", vectorDe(5))
    await admin().rpc("cerrar_investigacion", { p_investigacion: id, p_angulos: ANGULOS })
    await admin().rpc("terminar_trabajo_de_investigacion", { p_trabajo: trabajo.id, p_estado: "hecho" })
    if (a.estado !== "guardado" || b.estado !== "guardado") throw new Error("se esperaban guardados")
    expect((await dueno.db.rpc("descartar_hallazgo", { p_hallazgo: a.id })).error).toBeNull()
    const { data } = await admin().from("hallazgos").select("id, estado").in("id", [a.id, b.id]).order("estado")
    expect(data).toEqual([
      { id: a.id, estado: "descartado" },
      { id: b.id, estado: "nuevo" },
    ])
  })

  test("each report action refuses a person who owns no brand", async () => {
    await limpiarMapa()
    const id = await pedir()
    const [trabajo] = await tomar()
    const h = await guardarDe(id, "Mitos", vectorDe(0))
    await admin().rpc("cerrar_investigacion", { p_investigacion: id, p_angulos: ANGULOS })
    await admin().rpc("terminar_trabajo_de_investigacion", { p_trabajo: trabajo.id, p_estado: "hecho" })
    if (h.estado !== "guardado") throw new Error("se esperaba guardado")
    const intentos = [
      await ajeno.db.rpc("aprobar_informe", { p_investigacion: id }),
      await ajeno.db.rpc("descartar_informe", { p_investigacion: id }),
      await ajeno.db.rpc("descartar_hallazgo", { p_hallazgo: h.id }),
      await ajeno.db.rpc("pedir_ampliacion", { p_investigacion: id, p_angulo: "Mitos" }),
    ]
    for (const { error } of intentos) {
      expect(error?.code).toBe("42501")
      expect(error?.message).toBe("solo_duenos_investigan")
    }
    expect((await investigacion(id)).estado).toBe("informe_por_aprobar")
  })

  test("each report action refuses a research that is not waiting for approval", async () => {
    await limpiarMapa()
    const id = await pedir()
    await tomar()
    const h = await guardarDe(id, "Mitos", vectorDe(0))
    if (h.estado !== "guardado") throw new Error("se esperaba guardado")
    const intentos = [
      await dueno.db.rpc("aprobar_informe", { p_investigacion: id }),
      await dueno.db.rpc("descartar_informe", { p_investigacion: id }),
      await dueno.db.rpc("descartar_hallazgo", { p_hallazgo: h.id }),
    ]
    for (const { error } of intentos) expect(error?.message).toBe("informe_no_esta_por_aprobar")
    expect((await investigacion(id)).estado).toBe("investigando")
  })

  test("an approved report cannot be extended", async () => {
    const id = await informePorAprobar()
    await dueno.db.rpc("aprobar_informe", { p_investigacion: id })
    const { error } = await dueno.db.rpc("pedir_ampliacion", { p_investigacion: id, p_angulo: "Mitos" })
    expect(error?.message).toBe("informe_no_esta_por_aprobar")
  })
})

describe("pedir_ampliacion", () => {
  test("queues an extension job with the angle and sends the research back to investigating", async () => {
    const id = await informePorAprobar()
    const { data, error } = await dueno.db.rpc("pedir_ampliacion", { p_investigacion: id, p_angulo: "Presupuesto" })
    expect(error).toBeNull()
    const trabajos = await trabajosDe(id)
    expect(trabajos[1]).toMatchObject({ id: data, tipo: "ampliar", angulo: "Presupuesto", estado: "pendiente" })
    expect((await investigacion(id)).estado).toBe("investigando")
  })

  test("a second extension while one is open is refused", async () => {
    const id = await informePorAprobar()
    await dueno.db.rpc("pedir_ampliacion", { p_investigacion: id, p_angulo: "Presupuesto" })
    const { error } = await dueno.db.rpc("pedir_ampliacion", { p_investigacion: id, p_angulo: "Mitos" })
    expect(error?.message).toBe("trabajo_en_curso")
  })

  test("an angle the report does not have is refused", async () => {
    const id = await informePorAprobar()
    const { error } = await dueno.db.rpc("pedir_ampliacion", { p_investigacion: id, p_angulo: "Otro" })
    expect(error?.message).toBe("angulo_desconocido")
  })
})

describe("sugerencias_de_investigacion", () => {
  test("guardar_sugerencias replaces the set; members read it and anon reads nothing", async () => {
    const primeras = [{ tema: "Viejo", enriquece: "Nada" }]
    expect((await admin().rpc("guardar_sugerencias", { p_sugerencias: primeras })).error).toBeNull()
    const nuevas = Array.from({ length: 5 }, (_, i) => ({ tema: `Tema ${i}`, enriquece: `Aporta ${i}` }))
    expect((await admin().rpc("guardar_sugerencias", { p_sugerencias: nuevas })).error).toBeNull()
    const { data } = await dueno.db.from("sugerencias_de_investigacion").select("tema, enriquece").order("tema")
    expect(data).toEqual(nuevas)
    const { url, anon } = entornoLocal()
    const anonimo = createClient<Database>(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: vistas } = await anonimo.from("sugerencias_de_investigacion").select("tema")
    expect(vistas ?? []).toEqual([])
    const { data: deAjeno } = await ajeno.db.from("sugerencias_de_investigacion").select("tema")
    expect(deAjeno).toEqual([])
  })

  test("more than 5 suggestions are refused and the previous set stays", async () => {
    const cinco = Array.from({ length: 5 }, (_, i) => ({ tema: `Tema ${i}`, enriquece: `Aporta ${i}` }))
    await admin().rpc("guardar_sugerencias", { p_sugerencias: cinco })
    const seis = [...cinco, { tema: "Sexto", enriquece: "Sobra" }]
    expect((await admin().rpc("guardar_sugerencias", { p_sugerencias: seis })).error?.code).toBe("22023")
    const { count } = await admin().from("sugerencias_de_investigacion").select("id", { count: "exact", head: true })
    expect(count).toBe(5)
  })
})

describe("service RPCs", () => {
  test("people cannot call them", async () => {
    const id = await pedir()
    const llamadas = [
      await dueno.db.rpc("tomar_trabajo_de_investigacion"),
      await dueno.db.rpc("terminar_trabajo_de_investigacion", { p_trabajo: randomUUID(), p_estado: "hecho" }),
      await dueno.db.rpc("cerrar_investigacion", { p_investigacion: id, p_angulos: [] }),
      await dueno.db.rpc("crear_vigilancia", { p_temas: ["Algo"] }),
      await dueno.db.rpc("guardar_sugerencias", { p_sugerencias: [] }),
      await dueno.db.rpc("guardar_hallazgo", {
        p_resumen: "x",
        p_enlace: "https://medio.cl/x",
        p_enlace_normalizado: "medio.cl/x",
        p_medio: "Medio",
        p_vector: literal(vectorDe(0)),
        p_umbral_repetido: 0.95,
        p_umbral_tema: 0.8,
        p_investigacion: id,
        p_angulo: "Mitos",
      }),
    ]
    for (const { error } of llamadas) expect(error?.code).toBe("42501")
    expect((await investigacion(id)).estado).toBe("en_cola")
  })

  test("people cannot write the tables directly", async () => {
    const { error } = await dueno.db.from("investigaciones").insert({ origen: "vigilancia", tema: "x" })
    expect(error?.code).toBe("42501")
  })
})
