// tests/integration/cruces-y-domingo.test.ts
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest"
import type { Db } from "@/lib/supabase/database"
import type { Json } from "@/lib/supabase/database.types"
import { admin, cuentaDe, limpiarMapa, literal, marcaConDueno, personaConSesion, vectorDe } from "./entorno"

const SECCIONES = { deQueHablamos: "", tono: "", formatos: "", temasVetados: "", temasAVigilar: "", ejemplos: "" }
const BANDA = { p_minimo: 0.56, p_maximo: 0.74 }

type Persona = { db: Db; userId: string }
let dueno: Persona
let marcaWav: string
let marcaAjena: string
let pilarWav: string
let pilarAjeno: string
let cuenta: string
/** Loose ideas this file saved: leftover proposals are set aside so other files' counts stay theirs. */
const ideasCreadas = new Set<string>()

const haceHoras = (horas: number) => new Date(Date.now() - horas * 3_600_000).toISOString()

/** Research jobs are taken globally, oldest first: each test starts with none open. Local test database only. */
async function cerrarTrabajosAbiertos(): Promise<void> {
  const { error } = await admin()
    .from("trabajos_de_investigacion")
    .update({ estado: "fallo", motivo: "Cerrado entre pruebas.", arrendado_hasta: null })
    .in("estado", ["pendiente", "trabajando"])
  if (error) throw error
  const investigaciones = await admin()
    .from("investigaciones")
    .update({ estado: "fallo", motivo: "Cerrada entre pruebas." })
    .in("estado", ["en_cola", "investigando"])
  if (investigaciones.error) throw investigaciones.error
}

async function tema(nombre: string): Promise<string> {
  const { data, error } = await admin().from("temas").insert({ nombre }).select("id").single()
  if (error) throw error
  return data.id
}

interface HallazgoDePrueba {
  vector: number[]
  tema?: string | null
  investigacion?: string | null
  creado?: string
  estado?: "nuevo" | "usado" | "descartado"
}

async function hallazgo(h: HallazgoDePrueba): Promise<string> {
  const enlace = `https://medio.cl/${randomUUID()}`
  const { data, error } = await admin()
    .from("hallazgos")
    .insert({
      resumen: "Un hallazgo de prueba",
      enlace,
      enlace_normalizado: enlace.replace(/^https:\/\//, ""),
      medio: "Medio",
      vector: literal(h.vector),
      tema_id: h.tema ?? null,
      investigacion_id: h.investigacion ?? null,
      estado: h.estado ?? "nuevo",
      ...(h.creado ? { creado_en: h.creado } : {}),
    })
    .select("id")
    .single()
  if (error) throw error
  return data.id
}

/** Created a week ago: never on side A of a pair asked for «since an hour ago». */
const viejo = (vector: number[], extra: Partial<HallazgoDePrueba> = {}) =>
  hallazgo({ vector, creado: haceHoras(24 * 7), ...extra })

interface IdeaDePrueba {
  fuentes: string[]
  cuenta?: string
  pilar?: string | null
  esqueleto?: Json
  eje?: number
  reemplaza_a?: string
}

function idea(i: IdeaDePrueba) {
  return {
    gancho: "Lo que un hallazgo dice del otro",
    resumen: "Dos hallazgos que juntos cuentan algo nuevo.",
    formato: "texto",
    esqueleto: i.esqueleto ?? [{ idea: "El primero" }, { idea: "El segundo" }],
    fuentes: i.fuentes,
    cuenta: i.cuenta ?? cuenta,
    razon: "Habla de investigación, que es lo de WAV.",
    pilar: i.pilar ?? null,
    vector: literal(vectorDe(i.eje ?? 900)),
    ...(i.reemplaza_a ? { reemplaza_a: i.reemplaza_a } : {}),
  }
}

async function guardarSueltas(origen: string, ideas: ReturnType<typeof idea>[]): Promise<string[]> {
  const { data, error } = await admin().rpc("guardar_ideas_sueltas", { p_ideas: ideas, p_origen: origen })
  if (error) throw error
  const ids = data as string[]
  for (const id of ids) ideasCreadas.add(id)
  return ids
}

async function leerIdea(id: string) {
  const { data, error } = await admin().from("ideas").select("*").eq("id", id).single()
  if (error) throw error
  return data
}

async function pares(desde: string, limite = 10, investigacion?: string) {
  const { data, error } = await admin().rpc("pares_para_cruzar", {
    p_desde: desde,
    ...BANDA,
    p_limite: limite,
    ...(investigacion ? { p_investigacion: investigacion } : {}),
  })
  if (error) throw error
  return data ?? []
}

const comoPares = (filas: { a: string; b: string }[]) => filas.map((f) => [f.a, f.b])

async function pilarDe(persona: Persona, marca: string): Promise<string> {
  const { error } = await persona.db.rpc("guardar_linea_editorial", {
    p_marca: marca,
    p_base: 0,
    p_secciones: SECCIONES,
    p_pilares: [{ nombre: "Oficio", deQueHabla: "", material: "", porSemana: 1 }],
  })
  if (error) throw error
  const { data, error: errorDePilar } = await admin().from("pilares").select("id").eq("marca_id", marca).single()
  if (errorDePilar) throw errorDePilar
  return data.id
}

async function investigacionAprobada(): Promise<string> {
  const { data, error } = await admin()
    .from("investigaciones")
    .insert({
      origen: "encargo",
      tema: "WR3 y focus groups",
      cantidad: 3,
      formato: "texto",
      pedida_por: dueno.userId,
      estado: "aprobada",
    })
    .select("id")
    .single()
  if (error) throw error
  return data.id
}

beforeAll(async () => {
  dueno = await personaConSesion("cruces-dueno")
  const otro = await personaConSesion("cruces-otro")
  marcaWav = await marcaConDueno(dueno.userId, "nosotros")
  marcaAjena = await marcaConDueno(otro.userId, "nosotros")
  pilarWav = await pilarDe(dueno, marcaWav)
  pilarAjeno = await pilarDe(otro, marcaAjena)
  cuenta = await cuentaDe(marcaWav, "empresa")
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

describe("idea origin", () => {
  test("defaults to serie, which needs a research; a cross or a Sunday idea has none", async () => {
    const investigacion = await investigacionAprobada()
    const fuente = await hallazgo({ vector: vectorDe(0), investigacion })
    const fila = {
      gancho: "Un gancho",
      resumen: "Un resumen",
      formato: "texto",
      esqueleto: [{ idea: "Uno" }],
      fuentes: [fuente],
      cuenta_sugerida: cuenta,
      razon: "Una razón",
      vector: literal(vectorDe(901)),
    }
    const serie = await admin()
      .from("ideas")
      .insert({ ...fila, investigacion_id: investigacion })
      .select("origen")
      .single()
    expect(serie.error).toBeNull()
    expect(serie.data?.origen).toBe("serie")
    const serieSinInvestigacion = await admin()
      .from("ideas")
      .insert({ ...fila, origen: "serie" })
    expect(serieSinInvestigacion.error?.code).toBe("23514")
    const cruceConInvestigacion = await admin()
      .from("ideas")
      .insert({ ...fila, origen: "cruce", investigacion_id: investigacion })
    expect(cruceConInvestigacion.error?.code).toBe("23514")
    const otro = await admin()
      .from("ideas")
      .insert({ ...fila, origen: "otro" })
    expect(otro.error?.code).toBe("23514")
  })
})

describe("pares_para_cruzar", () => {
  test("returns pairs within the band only, with their similarity", async () => {
    const a = await hallazgo({ vector: vectorDe(0) })
    const dentro = await viejo(vectorDe(0, { hacia: 1, similitud: 0.65 }))
    await viejo(vectorDe(0, { hacia: 2, similitud: 0.9 }))
    await viejo(vectorDe(0, { hacia: 3, similitud: 0.4 }))
    const filas = await pares(haceHoras(1))
    expect(comoPares(filas)).toEqual([[a, dentro]])
    expect(filas[0].similitud).toBeCloseTo(0.65, 4)
  })

  test("side A only takes findings created since p_desde", async () => {
    const a = await viejo(vectorDe(0))
    const b = await viejo(vectorDe(0, { hacia: 1, similitud: 0.65 }))
    expect(await pares(haceHoras(1))).toEqual([])
    expect(comoPares(await pares(haceHoras(24 * 8)))).toHaveLength(1)
    expect(new Set(comoPares(await pares(haceHoras(24 * 8))).flat())).toEqual(new Set([a, b]))
  })

  test("with a research, side A is that research's findings and side B the rest of the map", async () => {
    const investigacion = await investigacionAprobada()
    const propio = await viejo(vectorDe(0), { investigacion })
    // Another finding of the same report, in the band: not «the rest of the map».
    await viejo(vectorDe(0, { hacia: 2, similitud: 0.65 }), { investigacion })
    const delMapa = await viejo(vectorDe(0, { hacia: 1, similitud: 0.65 }))
    // A pair of this week's findings outside the report.
    await hallazgo({ vector: vectorDe(5) })
    await hallazgo({ vector: vectorDe(5, { hacia: 6, similitud: 0.65 }) })
    expect(comoPares(await pares(haceHoras(-1), 10, investigacion))).toEqual([[propio, delMapa]])
  })

  test("discarded findings are left out on both sides", async () => {
    const a = await hallazgo({ vector: vectorDe(0) })
    await viejo(vectorDe(0, { hacia: 1, similitud: 0.65 }), { estado: "descartado" })
    const b = await viejo(vectorDe(0, { hacia: 2, similitud: 0.65 }))
    await hallazgo({ vector: vectorDe(10), estado: "descartado" })
    await viejo(vectorDe(10, { hacia: 11, similitud: 0.65 }))
    expect(comoPares(await pares(haceHoras(1)))).toEqual([[a, b]])
  })

  test("a pair whose topics differ ranks above one within a topic, even further from the band's middle", async () => {
    const t1 = await tema("Focus groups")
    const t2 = await tema("Retail")
    const a = await hallazgo({ vector: vectorDe(0), tema: t1 })
    await viejo(vectorDe(0, { hacia: 1, similitud: 0.65 }), { tema: t1 })
    const otroTema = await viejo(vectorDe(0, { hacia: 2, similitud: 0.7 }), { tema: t2 })
    expect(comoPares(await pares(haceHoras(1)))).toEqual([[a, otroTema]])
  })

  test("a topic pair already crossed by an earlier cross ranks below a new one", async () => {
    const t1 = await tema("Focus groups")
    const t2 = await tema("Retail")
    const t3 = await tema("Experiencias")
    const cruzado1 = await viejo(vectorDe(50), { tema: t1 })
    const cruzado2 = await viejo(vectorDe(51), { tema: t2 })
    await guardarSueltas("cruce", [idea({ fuentes: [cruzado1, cruzado2] })])
    const a = await hallazgo({ vector: vectorDe(0), tema: t1 })
    await viejo(vectorDe(0, { hacia: 2, similitud: 0.65 }), { tema: t2 })
    const nuevo = await viejo(vectorDe(0, { hacia: 3, similitud: 0.7 }), { tema: t3 })
    expect(comoPares(await pares(haceHoras(1)))).toEqual([[a, nuevo]])
  })

  test("newer findings on side A come first", async () => {
    await hallazgo({ vector: vectorDe(0), creado: haceHoras(0.5) })
    await viejo(vectorDe(0, { hacia: 1, similitud: 0.65 }))
    const nuevo = await hallazgo({ vector: vectorDe(20) })
    const pareja = await viejo(vectorDe(20, { hacia: 21, similitud: 0.65 }))
    expect(comoPares(await pares(haceHoras(1), 1))).toEqual([[nuevo, pareja]])
  })

  test("a pair already used together by any idea is left out", async () => {
    const a = await hallazgo({ vector: vectorDe(0) })
    const usada = await viejo(vectorDe(0, { hacia: 1, similitud: 0.65 }))
    const [id] = await guardarSueltas("domingo", [idea({ fuentes: [a, usada] })])
    await dueno.db.rpc("descartar_idea", { p_idea: id })
    expect(await pares(haceHoras(1))).toEqual([])
    const libre = await viejo(vectorDe(0, { hacia: 2, similitud: 0.7 }))
    expect(comoPares(await pares(haceHoras(1)))).toEqual([[a, libre]])
  })

  test("each finding appears at most once in the result", async () => {
    const comun = await viejo(vectorDe(0))
    await hallazgo({ vector: vectorDe(0, { hacia: 1, similitud: 0.65 }) })
    await hallazgo({ vector: vectorDe(0, { hacia: 2, similitud: 0.7 }) })
    const filas = comoPares(await pares(haceHoras(1)))
    expect(filas).toHaveLength(1)
    expect(filas[0]).toContain(comun)
  })

  test("p_limite is respected", async () => {
    for (const eje of [0, 10, 20]) {
      await hallazgo({ vector: vectorDe(eje) })
      await viejo(vectorDe(eje, { hacia: eje + 1, similitud: 0.65 }))
    }
    expect(await pares(haceHoras(1), 2)).toHaveLength(2)
    expect(await pares(haceHoras(1), 10)).toHaveLength(3)
  })
})

describe("guardar_ideas_sueltas", () => {
  test("saves cross and Sunday ideas as proposals with no research and their vectors", async () => {
    const h1 = await viejo(vectorDe(0))
    const h2 = await viejo(vectorDe(1))
    const [cruce] = await guardarSueltas("cruce", [idea({ fuentes: [h1, h2], pilar: pilarWav, eje: 910 })])
    expect(await leerIdea(cruce)).toMatchObject({
      origen: "cruce",
      investigacion_id: null,
      estado: "propuesta",
      cuenta_sugerida: cuenta,
      pilar_id: pilarWav,
    })
    expect(new Set((await leerIdea(cruce)).fuentes)).toEqual(new Set([h1, h2]))
    const { data: parecidas } = await admin().rpc("ideas_parecidas", {
      p_vector: literal(vectorDe(910)),
      p_umbral: 0.99,
    })
    expect(parecidas?.map((p) => p.id)).toContain(cruce)
    const [domingo] = await guardarSueltas("domingo", [idea({ fuentes: [h1], eje: 911 })])
    expect(await leerIdea(domingo)).toMatchObject({ origen: "domingo", investigacion_id: null })
  })

  test("a cross idea needs exactly two sources", async () => {
    const h = [await viejo(vectorDe(0)), await viejo(vectorDe(1)), await viejo(vectorDe(2))]
    for (const fuentes of [[h[0]], h]) {
      const { error } = await admin().rpc("guardar_ideas_sueltas", {
        p_ideas: [idea({ fuentes })],
        p_origen: "cruce",
      })
      expect(error?.message).toBe("cruce_sin_dos_fuentes")
    }
  })

  test("a discarded or missing source is fuente_no_valida", async () => {
    const bueno = await viejo(vectorDe(0))
    const descartado = await viejo(vectorDe(1), { estado: "descartado" })
    for (const fuentes of [
      [bueno, descartado],
      [bueno, randomUUID()],
    ]) {
      const { error } = await admin().rpc("guardar_ideas_sueltas", {
        p_ideas: [idea({ fuentes })],
        p_origen: "cruce",
      })
      expect(error?.message).toBe("fuente_no_valida")
    }
  })

  test("refuses the serie origin, and checks account, pillar and skeleton as guardar_serie does", async () => {
    const h1 = await viejo(vectorDe(0))
    const h2 = await viejo(vectorDe(1))
    const guardar = (ideaDePrueba: ReturnType<typeof idea>, origen = "cruce") =>
      admin().rpc("guardar_ideas_sueltas", { p_ideas: [ideaDePrueba], p_origen: origen })
    expect((await guardar(idea({ fuentes: [h1, h2] }), "serie")).error?.message).toBe("origen_no_valido")
    expect((await guardar(idea({ fuentes: [h1, h2], cuenta: randomUUID() }))).error?.message).toBe("cuenta_desconocida")
    expect((await guardar(idea({ fuentes: [h1, h2], pilar: pilarAjeno }))).error?.message).toBe("pilar_no_valido")
    expect((await guardar(idea({ fuentes: [h1, h2], esqueleto: [] }))).error?.message).toBe("esqueleto_no_valido")
    const { data } = await admin().from("ideas").select("id").contains("fuentes", [h1])
    expect(data).toEqual([])
  })
})

describe("report approval queues the crosses", () => {
  test("aprobar_informe on a request queues a series job and a crosses job; neither moves the report", async () => {
    const { data: id, error } = await dueno.db.rpc("pedir_investigacion", {
      p_tema: "WR3 y focus groups",
      p_cantidad: 3,
      p_formato: "texto",
    })
    if (error) throw error
    const { data: investigando } = await admin().rpc("tomar_trabajo_de_investigacion")
    const investigar = investigando?.[0]
    if (!investigar) throw new Error("se esperaba un trabajo")
    const cierre = await admin().rpc("cerrar_investigacion", {
      p_investigacion: id,
      p_angulos: [{ nombre: "Mitos", por_que: "Lo que se cree y no es." }],
    })
    if (cierre.error) throw cierre.error
    await admin().rpc("terminar_trabajo_de_investigacion", { p_trabajo: investigar.id, p_estado: "hecho" })
    expect((await dueno.db.rpc("aprobar_informe", { p_investigacion: id })).error).toBeNull()

    const { data: trabajos } = await admin()
      .from("trabajos_de_investigacion")
      .select("tipo, estado")
      .eq("investigacion_id", id)
      .order("creado_en")
    expect(trabajos?.map((t) => [t.tipo, t.estado])).toEqual([
      ["investigar", "hecho"],
      ["serie", "pendiente"],
      ["cruces", "pendiente"],
    ])
    const estado = async () =>
      (await admin().from("investigaciones").select("estado").eq("id", id).single()).data?.estado
    const { data: serie } = await admin().rpc("tomar_trabajo_de_investigacion")
    expect(serie?.map((t) => t.tipo)).toEqual(["serie"])
    const { data: cruces } = await admin().rpc("tomar_trabajo_de_investigacion")
    expect(cruces?.map((t) => [t.tipo, t.investigacion_id])).toEqual([["cruces", id]])
    expect(await estado()).toBe("aprobada")
    const trabajo = cruces?.[0]
    if (!trabajo) throw new Error("se esperaba un trabajo")
    await admin().rpc("terminar_trabajo_de_investigacion", { p_trabajo: trabajo.id, p_estado: "fallo", p_motivo: "x" })
    expect(await estado()).toBe("aprobada")
  })
})

describe("another idea for an idea with no research", () => {
  test("pedir_otra_idea accepts it, and the replacement keeps the origin", async () => {
    const h1 = await viejo(vectorDe(0))
    const h2 = await viejo(vectorDe(1))
    const [vieja] = await guardarSueltas("cruce", [idea({ fuentes: [h1, h2], eje: 920 })])
    const { data: trabajo, error } = await dueno.db.rpc("pedir_otra_idea", { p_idea: vieja })
    if (error) throw error
    const { data: fila } = await admin().from("trabajos_de_investigacion").select("*").eq("id", trabajo).single()
    expect(fila).toMatchObject({ tipo: "otra_idea", idea_id: vieja, investigacion_id: null, estado: "pendiente" })

    const otroOrigen = await admin().rpc("guardar_ideas_sueltas", {
      p_ideas: [idea({ fuentes: [h1], reemplaza_a: vieja })],
      p_origen: "domingo",
    })
    expect(otroOrigen.error?.message).toBe("idea_no_reemplazable")
    const [nueva] = await guardarSueltas("cruce", [idea({ fuentes: [h1, h2], eje: 921, reemplaza_a: vieja })])
    expect((await leerIdea(vieja)).estado).toBe("reemplazada")
    expect(await leerIdea(nueva)).toMatchObject({ estado: "propuesta", origen: "cruce", reemplaza_a: vieja })
  })
})

describe("similitudes_de_pares", () => {
  test("returns the closest pairs between recent findings and the rest, with whether they share a topic", async () => {
    const t1 = await tema("Focus groups")
    const t2 = await tema("Retail")
    const a = await hallazgo({ vector: vectorDe(0), tema: t1 })
    const mismo = await viejo(vectorDe(0, { hacia: 1, similitud: 0.65 }), { tema: t1 })
    const otro = await viejo(vectorDe(0, { hacia: 2, similitud: 0.4 }), { tema: t2 })
    await viejo(vectorDe(0, { hacia: 3, similitud: 0.9 }), { estado: "descartado" })
    const { data, error } = await admin().rpc("similitudes_de_pares", { p_desde: haceHoras(1), p_limite: 10 })
    expect(error).toBeNull()
    expect(data?.map((f) => [f.a, f.b, f.mismo_tema])).toEqual([
      [a, mismo, true],
      [a, otro, false],
    ])
    expect(data?.[0].similitud).toBeCloseTo(0.65, 4)
    const { data: uno } = await admin().rpc("similitudes_de_pares", { p_desde: haceHoras(1), p_limite: 1 })
    expect(uno).toHaveLength(1)
  })
})

describe("grants", () => {
  test("people cannot call the service functions", async () => {
    const h = await viejo(vectorDe(0))
    const llamadas = [
      dueno.db.rpc("pares_para_cruzar", { p_desde: haceHoras(1), ...BANDA, p_limite: 3 }),
      dueno.db.rpc("guardar_ideas_sueltas", { p_ideas: [idea({ fuentes: [h] })], p_origen: "domingo" }),
      dueno.db.rpc("similitudes_de_pares", { p_desde: haceHoras(1), p_limite: 3 }),
    ]
    for (const { error } of await Promise.all(llamadas)) expect(error?.code).toBe("42501")
  })
})
