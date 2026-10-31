import { randomUUID } from "node:crypto"
import type Anthropic from "@anthropic-ai/sdk"
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest"
import type { Pedir } from "@/lib/ia/claude"
import { repositorioDeInvestigaciones } from "@/lib/investigacion/repositorio"
import { atenderInvestigaciones } from "@/lib/investigacion/vigilancia"
import { repositorioDeSeries } from "@/lib/series/repositorio"
import type { Db } from "@/lib/supabase/database"
import { admin, limpiarMapa, marcaConDueno, personaConSesion, vectorDe } from "./entorno"

const SECCIONES = { deQueHablamos: "", tono: "", formatos: "", temasVetados: "", temasAVigilar: "", ejemplos: "" }
const vigilancias: string[] = []

/** Research is global: the open limit and the job queue. Each test starts with nothing open. Local database only. */
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

async function dueno(): Promise<{ db: Db; marca: string }> {
  const persona = await personaConSesion("repo-investigaciones")
  return { db: persona.db, marca: await marcaConDueno(persona.userId) }
}

async function pedir(db: Db, tema = "WR3 y focus groups"): Promise<string> {
  const { data, error } = await db.rpc("pedir_investigacion", {
    p_tema: tema,
    p_cantidad: 6,
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

/** The research queue also runs series jobs (4f): the dispatcher needs their ports, unused here. */
const repo = () => ({
  ...repositorioDeInvestigaciones(admin()),
  ...repositorioDeSeries(admin()),
  embeberIdeas: async () => [],
})

/** Claude finds https://medio.cl/<uuid> and sorts it into «Presupuesto». No paid call. */
function pedirFalso(enlace: string): Pedir {
  return vi.fn<Pedir>(async (paso) =>
    paso.paso === "buscar"
      ? {
          texto: "notas",
          detenido: "end_turn",
          bloques: [
            {
              type: "web_search_tool_result",
              tool_use_id: "t",
              caller: { type: "direct" },
              content: [{ type: "web_search_result", url: enlace, title: "t", page_age: null, encrypted_content: "x" }],
            } as Anthropic.ContentBlock,
          ],
        }
      : {
          texto: JSON.stringify({
            angulos: [
              {
                nombre: "Presupuesto",
                por_que: "Lo que cuesta.",
                hallazgos: [{ resumen: "Un hallazgo", cita: null, enlace, medio: "Medio", publicado_en: "2026-10-20" }],
              },
            ],
          }),
          detenido: "end_turn",
          bloques: [],
        },
  )
}

beforeEach(cerrarAbiertas)

afterAll(async () => {
  await cerrarAbiertas()
  if (vigilancias.length > 0) await admin().from("investigaciones").delete().in("id", vigilancias)
})

describe("repositorioDeInvestigaciones", () => {
  test("takes nothing when no job is open", async () => {
    expect(await repo().tomar()).toBeNull()
  })

  test("takes a request's job with its research fields", async () => {
    const { db } = await dueno()
    const id = await pedir(db)
    const trabajo = await repo().tomar()
    expect(trabajo).toEqual({
      id: expect.any(String),
      tipo: "investigar",
      investigacionId: id,
      angulo: null,
      tema: "WR3 y focus groups",
      cantidad: 6,
      formato: "carrusel_pdf",
      enfoque: "mitos",
      origen: "encargo",
      ya: [],
    })
  })

  test("runs a job end to end with fake Claude and Voyage: the report waits with its angle and linked finding", async () => {
    await limpiarMapa()
    const { db } = await dueno()
    const id = await pedir(db)
    const enlace = `https://medio.cl/${randomUUID()}`
    const resultado = await atenderInvestigaciones({
      ...repo(),
      pedir: pedirFalso(enlace),
      embeber: async (_clave, textos) => textos.map(() => vectorDe(7)),
    })
    expect(resultado).toMatchObject({ guardados: 1, repetidos: 0 })
    expect(await investigacion(id)).toMatchObject({
      estado: "informe_por_aprobar",
      angulos: [{ nombre: "Presupuesto", por_que: "Lo que cuesta." }],
    })
    const { data: hallazgos } = await admin().from("hallazgos").select("*").eq("investigacion_id", id)
    expect(hallazgos).toEqual([
      expect.objectContaining({ enlace, angulo: "Presupuesto", publicado_en: "2026-10-20", medio: "Medio" }),
    ])
    const { data: trabajos } = await admin()
      .from("trabajos_de_investigacion")
      .select("estado")
      .eq("investigacion_id", id)
    expect(trabajos).toEqual([{ estado: "hecho" }])
  })

  test("an extension's job carries its angle and the links the report already has", async () => {
    await limpiarMapa()
    const { db } = await dueno()
    const id = await pedir(db)
    const enlace = `https://medio.cl/${randomUUID()}`
    await atenderInvestigaciones({
      ...repo(),
      pedir: pedirFalso(enlace),
      embeber: async (_clave, textos) => textos.map(() => vectorDe(8)),
    })
    const { error } = await db.rpc("pedir_ampliacion", { p_investigacion: id, p_angulo: "Presupuesto" })
    if (error) throw error
    expect(await repo().tomar()).toMatchObject({
      tipo: "ampliar",
      angulo: "Presupuesto",
      investigacionId: id,
      ya: [enlace],
    })
  })

  test("a failed job fails its research with the reason", async () => {
    const { db } = await dueno()
    const id = await pedir(db)
    const trabajo = await repo().tomar()
    await repo().terminar(trabajo?.id ?? "", "fallo", "La búsqueda no encontró fuentes.")
    expect(await investigacion(id)).toMatchObject({ estado: "fallo", motivo: "La búsqueda no encontró fuentes." })
  })

  test("reads the «temas a vigilar» of each brand's latest line only", async () => {
    const { db, marca } = await dueno()
    const viejo = `Viejo ${randomUUID()}`
    const nuevo = `Nuevo ${randomUUID()}`
    for (const [base, temas] of [
      [0, viejo],
      [1, nuevo],
    ] as const) {
      const { error } = await db.rpc("guardar_linea_editorial", {
        p_marca: marca,
        p_base: base,
        p_secciones: { ...SECCIONES, temasAVigilar: temas },
        p_pilares: [{ nombre: "Oficio", deQueHabla: "Montaje", material: "", porSemana: 1 }],
      })
      if (error) throw error
    }
    const lineas = await repo().temasDeLasLineas()
    expect(lineas).toContain(nuevo)
    expect(lineas).not.toContain(viejo)
  })

  test("creates a watch with its topics", async () => {
    const id = await repo().crearVigilancia("2030-02-01", ["Eventos", "Retail"])
    vigilancias.push(id)
    expect(await investigacion(id)).toMatchObject({
      origen: "vigilancia",
      estado: "investigando",
      tema: "Eventos · Retail",
      dia: "2030-02-01",
    })
  })

  test("counts the map's active topics and returns their names and descriptions", async () => {
    await limpiarMapa()
    const { data, error } = await admin()
      .from("temas")
      .insert([
        { nombre: "Ferias", descripcion: "Ferias y exposiciones." },
        { nombre: "Retail", descripcion: "" },
      ])
      .select("id")
    if (error) throw error
    const fusionado = await admin().from("temas").insert({ nombre: "Fusionado", fusionado_en: data[0].id })
    if (fusionado.error) throw fusionado.error
    const mapa = await repo().temasDelMapa()
    expect(mapa.activos).toBe(2)
    expect(mapa.temas).toEqual(
      expect.arrayContaining([
        { nombre: "Ferias", descripcion: "Ferias y exposiciones." },
        { nombre: "Retail", descripcion: "" },
      ]),
    )
    expect(mapa.temas).toHaveLength(2)
    await limpiarMapa()
  })

  test("saving suggestions replaces the previous set", async () => {
    await repo().guardarSugerencias([
      { tema: "Uno", enriquece: "a" },
      { tema: "Dos", enriquece: "b" },
    ])
    await repo().guardarSugerencias([{ tema: "Tres", enriquece: "c" }])
    const { data } = await admin().from("sugerencias_de_investigacion").select("tema, enriquece")
    expect(data).toEqual([{ tema: "Tres", enriquece: "c" }])
  })
})
