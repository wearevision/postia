import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest"
import { Falla } from "@/lib/dominio/falla"
import type { Pedir } from "@/lib/ia/claude"
import { repositorioDeIdeas } from "@/lib/ideas/repositorio"
import { repositorioDeInvestigaciones } from "@/lib/investigacion/repositorio"
import { atenderInvestigaciones } from "@/lib/investigacion/vigilancia"
import { repositorioDeSeries } from "@/lib/series/repositorio"
import type { Db } from "@/lib/supabase/database"
import { admin, cuentaDe, limpiarMapa, literal, marcaConDueno, personaConSesion, vectorDe } from "./entorno"

const SECCIONES = {
  deQueHablamos: "",
  tono: "",
  formatos: "",
  temasVetados: "",
  temasAVigilar: "",
  ejemplos: "",
}
const ANGULOS = [{ nombre: "Mitos", por_que: "Lo que se cree y no es." }]

let dueno: { db: Db; userId: string }
let marca: string
let cuenta: string
let pilar: string
/** Loose ideas this file saved: leftover proposals are set aside so other files' counts stay theirs. */
const ideasCreadas = new Set<string>()

const haceHoras = (horas: number) => new Date(Date.now() - horas * 3_600_000).toISOString()

/** A random unit vector: nearly orthogonal to every other idea in the local database, whatever earlier runs left. */
function aleatorio(): number[] {
  const v = Array.from({ length: 1024 }, () => Math.random() - 0.5)
  const norma = Math.hypot(...v)
  return v.map((x) => x / norma)
}

/** Research jobs are taken globally, oldest first: each test starts with none open. Local test database only. */
async function cerrarTrabajosAbiertos(): Promise<void> {
  const { error } = await admin()
    .from("trabajos_de_investigacion")
    .update({ estado: "fallo", motivo: "Cerrado entre pruebas.", arrendado_hasta: null })
    .in("estado", ["pendiente", "trabajando"])
  if (error) throw error
  const abiertas = await admin()
    .from("investigaciones")
    .update({ estado: "fallo", motivo: "Cerrada entre pruebas." })
    .in("estado", ["en_cola", "investigando"])
  if (abiertas.error) throw abiertas.error
}

async function tema(nombre: string): Promise<string> {
  const { data, error } = await admin().from("temas").insert({ nombre }).select("id").single()
  if (error) throw error
  return data.id
}

async function hallazgo(h: {
  vector: number[]
  resumen?: string
  tema?: string | null
  investigacion?: string | null
  creado?: string
}): Promise<string> {
  const enlace = `https://medio.cl/${randomUUID()}`
  const { data, error } = await admin()
    .from("hallazgos")
    .insert({
      resumen: h.resumen ?? "Un hallazgo de prueba",
      enlace,
      enlace_normalizado: enlace.replace(/^https:\/\//, ""),
      medio: "Medio",
      publicado_en: "2026-10-20",
      vector: literal(h.vector),
      tema_id: h.tema ?? null,
      investigacion_id: h.investigacion ?? null,
      ...(h.creado ? { creado_en: h.creado } : {}),
    })
    .select("id")
    .single()
  if (error) throw error
  return data.id
}

/** A report Federico approved with one finding; approving it queued its series and crosses jobs. */
async function informeAprobado(vector: number[]): Promise<{ id: string; hallazgo: string }> {
  const { data: id, error } = await dueno.db.rpc("pedir_investigacion", {
    p_tema: "WR3 y focus groups",
    p_cantidad: 5,
    p_formato: "texto",
  })
  if (error) throw error
  const { data: tomados } = await admin().rpc("tomar_trabajo_de_investigacion")
  const trabajo = tomados?.[0]
  if (!trabajo) throw new Error("se esperaba un trabajo")
  const fuente = await hallazgo({ vector, resumen: "Hallazgo del informe", investigacion: id })
  const cierre = await admin().rpc("cerrar_investigacion", { p_investigacion: id, p_angulos: ANGULOS })
  if (cierre.error) throw cierre.error
  await admin().rpc("terminar_trabajo_de_investigacion", { p_trabajo: trabajo.id, p_estado: "hecho" })
  const aprobado = await dueno.db.rpc("aprobar_informe", { p_investigacion: id })
  if (aprobado.error) throw aprobado.error
  // Only the crosses job runs here: the series job is 4f's, tested in repositorio-de-series.
  const serie = await admin()
    .from("trabajos_de_investigacion")
    .update({ estado: "fallo", motivo: "Cerrado entre pruebas." })
    .eq("investigacion_id", id)
    .eq("tipo", "serie")
  if (serie.error) throw serie.error
  return { id, hallazgo: fuente }
}

const repo = () => ({
  ...repositorioDeInvestigaciones(admin()),
  ...repositorioDeSeries(admin()),
  ...repositorioDeIdeas(admin()),
  embeber: async () => [],
  embeberIdeas: async (_clave: string, textos: string[]) => textos.map(() => aleatorio()),
})

/** This test's account number among every account that publishes in the database. */
async function numeroDeCuenta(): Promise<number> {
  return (await repositorioDeSeries(admin()).cuentasDeSerie()).findIndex((c) => c.id === cuenta) + 1
}

async function pedirCruce(gancho: string): Promise<Pedir> {
  const n = await numeroDeCuenta()
  const ideas = [
    {
      par: 1,
      gancho,
      resumen: `Resumen de ${gancho}`,
      formato: "texto",
      esqueleto: [
        { tipo: null, idea: "Lo que dice uno" },
        { tipo: null, idea: "Lo que dice el otro" },
      ],
      cuenta: n,
      razon: "Cruza dos mundos.",
      pilar: 1,
    },
  ]
  return vi.fn<Pedir>(async () => ({ texto: JSON.stringify({ ideas }), detenido: "end_turn", bloques: [] }))
}

async function idea(id: string) {
  const { data, error } = await admin().from("ideas").select("*").eq("id", id).single()
  if (error) throw error
  return data
}

async function ideasConFuentes(fuentes: string[]) {
  const { data, error } = await admin()
    .from("ideas")
    .select("*")
    .contains("fuentes", fuentes)
    .order("creada_en", { ascending: false })
  if (error) throw error
  for (const i of data) ideasCreadas.add(i.id)
  return data
}

async function trabajo(id: string) {
  const { data, error } = await admin()
    .from("trabajos_de_investigacion")
    .select("tipo, estado, motivo")
    .eq("id", id)
    .single()
  if (error) throw error
  return data
}

beforeAll(async () => {
  dueno = await personaConSesion("repo-ideas")
  marca = await marcaConDueno(dueno.userId, "nosotros")
  const { error } = await dueno.db.rpc("guardar_linea_editorial", {
    p_marca: marca,
    p_base: 0,
    p_secciones: SECCIONES,
    p_pilares: [{ nombre: "Oficio", deQueHabla: "Cómo trabajamos", material: "", porSemana: 1 }],
  })
  if (error) throw error
  const { data, error: errorDePilar } = await admin().from("pilares").select("id").eq("marca_id", marca).single()
  if (errorDePilar) throw errorDePilar
  pilar = data.id
  cuenta = await cuentaDe(marca, "empresa", "a_mano")
})

beforeEach(async () => {
  await limpiarMapa()
  await cerrarTrabajosAbiertos()
})

afterAll(async () => {
  await cerrarTrabajosAbiertos()
  if (ideasCreadas.size > 0) {
    const { error } = await admin()
      .from("ideas")
      .update({ estado: "descartada" })
      .eq("estado", "propuesta")
      .in("id", [...ideasCreadas])
    if (error) throw error
  }
  await limpiarMapa()
})

describe("repositorioDeIdeas: crosses", () => {
  test("reads candidate pairs with both findings' summary, outlet, date, link and topic name", async () => {
    const retail = await tema("Retail")
    const a = await hallazgo({ vector: vectorDe(0), resumen: "El retail mide la fila", tema: retail })
    const b = await hallazgo({
      vector: vectorDe(0, { hacia: 1, similitud: 0.65 }),
      resumen: "Los eventos miden la espera",
      creado: haceHoras(24 * 7),
    })
    const pares = await repo().paresParaCruzar({ desde: Date.now() - 3_600_000, limite: 3 })
    expect(pares).toEqual([
      {
        a: {
          id: a,
          resumen: "El retail mide la fila",
          medio: "Medio",
          publicado_en: "2026-10-20",
          enlace: expect.stringMatching(/^https:\/\/medio\.cl\//),
          tema: "Retail",
        },
        b: expect.objectContaining({ id: b, resumen: "Los eventos miden la espera", tema: null }),
      },
    ])
  })

  test("saves cross ideas with no research and turns a refusal into a readable Falla", async () => {
    const a = await hallazgo({ vector: vectorDe(0) })
    const b = await hallazgo({ vector: vectorDe(1) })
    const base = {
      gancho: "Lo que uno dice del otro",
      resumen: "Dos hallazgos juntos.",
      formato: "texto" as const,
      esqueleto: [{ idea: "Uno" }, { idea: "Otro" }],
      cuenta,
      razon: "Cruza dos mundos.",
      pilar,
      vector: aleatorio(),
    }
    const [id] = await repo().guardarIdeasSueltas("cruce", [{ ...base, fuentes: [a, b] }])
    if (!id) throw new Error("se esperaba una idea")
    ideasCreadas.add(id)
    expect(await idea(id)).toMatchObject({
      origen: "cruce",
      investigacion_id: null,
      estado: "propuesta",
      cuenta_sugerida: cuenta,
      pilar_id: pilar,
    })
    await expect(repo().guardarIdeasSueltas("cruce", [{ ...base, fuentes: [a, randomUUID()] }])).rejects.toBeInstanceOf(
      Falla,
    )
  })

  test("the research queue hands a report's crosses job over as a crosses job", async () => {
    const { id } = await informeAprobado(vectorDe(0))
    expect(await repo().tomar()).toEqual({ id: expect.any(String), tipo: "cruces", investigacionId: id })
  })

  test("runs a report's crosses job end to end: the idea keeps both findings and the job is done", async () => {
    const mapa = await hallazgo({ vector: vectorDe(0, { hacia: 1, similitud: 0.65 }), creado: haceHoras(24 * 30) })
    const { hallazgo: delInforme } = await informeAprobado(vectorDe(0))
    const pedir = await pedirCruce("El informe y el mapa se cruzan")
    const resultado = await atenderInvestigaciones({ ...repo(), pedir })
    expect(resultado).toEqual({ guardadas: 1, parecidas: 0, invalidas: 0 })
    expect(vi.mocked(pedir).mock.calls[0]?.[0]).toMatchObject({ paso: "cruces", marcaId: null })
    const [nueva] = await ideasConFuentes([delInforme, mapa])
    expect(nueva).toMatchObject({
      gancho: "El informe y el mapa se cruzan",
      origen: "cruce",
      investigacion_id: null,
      estado: "propuesta",
    })
    expect([...(nueva?.fuentes ?? [])].sort()).toEqual([delInforme, mapa].sort())
    const { data } = await admin()
      .from("trabajos_de_investigacion")
      .select("estado")
      .eq("tipo", "cruces")
      .order("creado_en", { ascending: false })
      .limit(1)
      .single()
    expect(data?.estado).toBe("hecho")
  })

  test("a report with nothing to cross closes its crosses job as done without paying", async () => {
    await informeAprobado(vectorDe(0))
    const pedir = await pedirCruce("Nunca")
    expect(await atenderInvestigaciones({ ...repo(), pedir })).toEqual({ guardadas: 0, parecidas: 0, invalidas: 0 })
    expect(pedir).not.toHaveBeenCalled()
  })

  test("another idea for a cross: the job has no research, the replacement reuses the pair", async () => {
    const a = await hallazgo({ vector: vectorDe(0), resumen: "Primero" })
    const b = await hallazgo({ vector: vectorDe(1), resumen: "Segundo" })
    const [vieja] = await repo().guardarIdeasSueltas("cruce", [
      {
        gancho: "La que no gustó",
        resumen: "Lo que decía",
        formato: "texto",
        esqueleto: [{ idea: "Uno" }],
        fuentes: [a, b],
        cuenta,
        razon: "Cruza dos mundos.",
        pilar: null,
        vector: aleatorio(),
      },
    ])
    if (!vieja) throw new Error("se esperaba una idea")
    ideasCreadas.add(vieja)
    const { data: trabajoId, error } = await dueno.db.rpc("pedir_otra_idea", { p_idea: vieja })
    if (error) throw error
    expect(await repo().ideaSueltaAReemplazar(vieja)).toEqual({
      origen: "cruce",
      gancho: "La que no gustó",
      resumen: "Lo que decía",
      formato: "texto",
      fuentes: expect.arrayContaining([
        expect.objectContaining({ id: a, resumen: "Primero", tema: null }),
        expect.objectContaining({ id: b, resumen: "Segundo" }),
      ]),
    })
    expect((await repo().ideaSueltaAReemplazar(vieja)).fuentes).toHaveLength(2)
    const pedir = await pedirCruce("La de reemplazo")
    await atenderInvestigaciones({ ...repo(), pedir })
    expect(vi.mocked(pedir).mock.calls[0]?.[0]).toMatchObject({ clave: `otra:${trabajoId}`, paso: "otra_idea" })
    const ideas = await ideasConFuentes([a, b])
    expect(ideas.map((i) => [i.gancho, i.estado, i.origen])).toEqual(
      expect.arrayContaining([
        ["La que no gustó", "reemplazada", "cruce"],
        ["La de reemplazo", "propuesta", "cruce"],
      ]),
    )
    expect(ideas.find((i) => i.gancho === "La de reemplazo")?.reemplaza_a).toBe(vieja)
    expect(await trabajo(trabajoId)).toMatchObject({ tipo: "otra_idea", estado: "hecho" })
  })
})
