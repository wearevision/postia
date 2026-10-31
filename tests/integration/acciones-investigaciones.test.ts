import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest"
import {
  aprobarInforme,
  descartarHallazgo,
  descartarInforme,
  pedirAmpliacion,
  pedirInvestigacion,
} from "@/lib/investigacion/acciones"
import { informe, investigacionesRecientes, sugerencias } from "@/lib/investigacion/lectura"
import type { Db } from "@/lib/supabase/database"
import { admin, literal, marcaConDueno, personaConSesion, vectorDe } from "./entorno"

const ANGULOS = [
  { nombre: "Presupuesto", por_que: "Lo que cuesta un focus group." },
  { nombre: "Mitos", por_que: "Lo que se cree y no es." },
]

let dueno: { db: Db; userId: string }
let ajeno: { db: Db; userId: string }
let eje = 900

/** Research is global: the open limit counts every brand's requests. Local test database only. */
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

const entrada = (extra: Record<string, unknown> = {}) => ({
  tema: "  WR3 y focus groups  ",
  cantidad: 10,
  formato: "carrusel_pdf",
  enfoque: "mitos",
  ...extra,
})

async function pedida(): Promise<string> {
  const r = await pedirInvestigacion(dueno.db, entrada())
  if (!r.ok) throw new Error(r.error)
  return r.investigacionId
}

async function guardar(id: string, angulo: string, resumen: string): Promise<string> {
  const enlace = `https://medio.cl/${randomUUID()}`
  eje += 1
  const { data, error } = await admin().rpc("guardar_hallazgo", {
    p_resumen: resumen,
    p_enlace: enlace,
    p_enlace_normalizado: enlace.replace(/^https?:\/\//, ""),
    p_medio: "Medio",
    p_vector: literal(vectorDe(eje)),
    p_umbral_repetido: 0.95,
    p_umbral_tema: 0.8,
    p_cita: "Una cita",
    p_publicado_en: "2026-10-20",
    p_investigacion: id,
    p_angulo: angulo,
  })
  if (error) throw error
  return (data as { id: string }).id
}

/** Stands in for the worker: takes the job, saves findings, closes the research with its angles. */
async function informePorAprobar(hallazgos: [string, string][] = []): Promise<{ id: string; ids: string[] }> {
  const id = await pedida()
  const tomado = await admin().rpc("tomar_trabajo_de_investigacion")
  if (tomado.error) throw tomado.error
  const ids: string[] = []
  for (const [angulo, resumen] of hallazgos) ids.push(await guardar(id, angulo, resumen))
  const cierre = await admin().rpc("cerrar_investigacion", { p_investigacion: id, p_angulos: ANGULOS })
  if (cierre.error) throw cierre.error
  const fin = await admin().rpc("terminar_trabajo_de_investigacion", {
    p_trabajo: tomado.data[0].id,
    p_estado: "hecho",
  })
  if (fin.error) throw fin.error
  return { id, ids }
}

beforeAll(async () => {
  dueno = await personaConSesion("acciones-investigaciones-dueno")
  await marcaConDueno(dueno.userId)
  ajeno = await personaConSesion("acciones-investigaciones-ajeno")
})

beforeEach(cerrarAbiertas)
afterAll(cerrarAbiertas)

describe("pedirInvestigacion", () => {
  test("queues a trimmed request and lists it as recent with no findings", async () => {
    const id = await pedida()
    const recientes = await investigacionesRecientes(dueno.db, 20)
    expect(recientes[0]).toMatchObject({
      id,
      tema: "WR3 y focus groups",
      origen: "encargo",
      estado: "en_cola",
      motivo: null,
      hallazgos: 0,
    })
    expect(recientes[0].creadaEn).toEqual(expect.any(String))
  })

  test("refuses an empty or long theme before reaching the database", async () => {
    expect(await pedirInvestigacion(dueno.db, entrada({ tema: "   " }))).toEqual({
      ok: false,
      error: "Escribe qué quieres investigar.",
    })
    expect(await pedirInvestigacion(dueno.db, entrada({ tema: "a".repeat(301) }))).toEqual({
      ok: false,
      error: "El tema pasa los 300 caracteres.",
    })
  })

  test("refuses a quantity out of range and a format that is not offered", async () => {
    expect((await pedirInvestigacion(dueno.db, entrada({ cantidad: 0 }))).ok).toBe(false)
    expect((await pedirInvestigacion(dueno.db, entrada({ cantidad: 31 }))).ok).toBe(false)
    expect((await pedirInvestigacion(dueno.db, entrada({ cantidad: 2.5 }))).ok).toBe(false)
    expect((await pedirInvestigacion(dueno.db, entrada({ formato: "reel" }))).ok).toBe(false)
  })

  test("the focus is optional", async () => {
    const r = await pedirInvestigacion(dueno.db, entrada({ enfoque: null }))
    expect(r.ok).toBe(true)
    const sinEnfoque = await pedirInvestigacion(dueno.db, { tema: "Otro", cantidad: 3, formato: "texto" })
    expect(sinEnfoque.ok).toBe(true)
  })

  test("translates the limit of three open requests", async () => {
    for (let i = 0; i < 3; i++) await pedida()
    expect(await pedirInvestigacion(dueno.db, entrada())).toEqual({
      ok: false,
      error: "Ya hay 3 investigaciones en curso. Espera a que terminen.",
    })
  })

  test("translates a person who owns no brand", async () => {
    expect(await pedirInvestigacion(ajeno.db, entrada())).toEqual({
      ok: false,
      error: "Solo el dueño de una marca puede pedir investigaciones.",
    })
  })
})

describe("the report", () => {
  test("groups findings by angle, newest first, discarded last", async () => {
    const { id, ids } = await informePorAprobar([
      ["Presupuesto", "Primero"],
      ["Presupuesto", "Segundo"],
      ["Mitos", "Tercero"],
    ])
    expect(await descartarHallazgo(dueno.db, ids[1])).toEqual({ ok: true })
    const leido = await informe(dueno.db, id)
    expect(leido).toMatchObject({
      id,
      tema: "WR3 y focus groups",
      origen: "encargo",
      estado: "informe_por_aprobar",
      motivo: null,
    })
    expect(leido?.angulos.map((a) => [a.nombre, a.porQue, a.hallazgos.map((h) => h.resumen)])).toEqual([
      ["Presupuesto", "Lo que cuesta un focus group.", ["Primero", "Segundo"]],
      ["Mitos", "Lo que se cree y no es.", ["Tercero"]],
    ])
    expect(leido?.angulos[0].hallazgos[0]).toEqual({
      id: ids[0],
      resumen: "Primero",
      cita: "Una cita",
      enlace: expect.stringMatching(/^https:\/\/medio\.cl\//),
      medio: "Medio",
      publicadoEn: "2026-10-20",
      estado: "nuevo",
    })
    expect(leido?.angulos[0].hallazgos[1].estado).toBe("descartado")
    const recientes = await investigacionesRecientes(dueno.db, 20)
    expect(recientes.find((r) => r.id === id)?.hallazgos).toBe(3)
  })

  test("carries how many findings were repeats and how many sources were discarded", async () => {
    const { id } = await informePorAprobar([["Presupuesto", "Uno"]])
    expect(await informe(dueno.db, id)).toMatchObject({ repetidos: 0, descartados: 0 })
    await admin().from("investigaciones").update({ repetidos: 3, descartados: 2 }).eq("id", id)
    expect(await informe(dueno.db, id)).toMatchObject({ repetidos: 3, descartados: 2 })
  })

  test("newest first within an angle", async () => {
    const { id } = await informePorAprobar([
      ["Mitos", "Viejo"],
      ["Mitos", "Nuevo"],
    ])
    const leido = await informe(dueno.db, id)
    expect(leido?.angulos[1].hallazgos.map((h) => h.resumen)).toEqual(["Nuevo", "Viejo"])
  })

  test("null for an id that is not a uuid or not found", async () => {
    expect(await informe(dueno.db, "no-es-un-id")).toBeNull()
    expect(await informe(dueno.db, randomUUID())).toBeNull()
  })

  test("approving moves it to aprobada, and a second approval is translated", async () => {
    const { id } = await informePorAprobar()
    expect(await aprobarInforme(dueno.db, id)).toEqual({ ok: true })
    expect((await informe(dueno.db, id))?.estado).toBe("aprobada")
    expect(await aprobarInforme(dueno.db, id)).toEqual({
      ok: false,
      error: "Este informe ya no espera tu revisión.",
    })
  })

  test("discarding the report discards its findings", async () => {
    const { id } = await informePorAprobar([["Mitos", "Uno"]])
    expect(await descartarInforme(dueno.db, id)).toEqual({ ok: true })
    const leido = await informe(dueno.db, id)
    expect(leido?.estado).toBe("descartada")
    expect(leido?.angulos[1].hallazgos[0].estado).toBe("descartado")
  })

  test("extending an angle queues a job; a second one and an unknown angle are translated", async () => {
    const { id } = await informePorAprobar()
    expect(await pedirAmpliacion(dueno.db, { investigacionId: id, angulo: "Inventado" })).toEqual({
      ok: false,
      error: "Ese ángulo no está en el informe.",
    })
    expect(await pedirAmpliacion(dueno.db, { investigacionId: id, angulo: "Mitos" })).toEqual({ ok: true })
    expect((await informe(dueno.db, id))?.estado).toBe("investigando")
    expect(await pedirAmpliacion(dueno.db, { investigacionId: id, angulo: "Mitos" })).toEqual({
      ok: false,
      error: "Ya se está ampliando este informe.",
    })
  })

  test("refuses ids that are not uuids", async () => {
    expect((await aprobarInforme(dueno.db, "x")).ok).toBe(false)
    expect((await descartarInforme(dueno.db, "x")).ok).toBe(false)
    expect((await descartarHallazgo(dueno.db, "x")).ok).toBe(false)
    expect((await pedirAmpliacion(dueno.db, { investigacionId: "x", angulo: "Mitos" })).ok).toBe(false)
  })
})

describe("sugerencias", () => {
  test("reads the stored suggestions", async () => {
    const { error } = await admin().rpc("guardar_sugerencias", {
      p_sugerencias: [{ tema: "Neuromarketing", enriquece: "Cruza con focus groups." }],
    })
    expect(error).toBeNull()
    expect(await sugerencias(dueno.db)).toEqual([
      { id: expect.any(String), tema: "Neuromarketing", enriquece: "Cruza con focus groups." },
    ])
  })
})
