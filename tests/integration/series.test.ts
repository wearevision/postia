// tests/integration/series.test.ts
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest"
import { carruselInicial } from "@/lib/plantillas/iniciales"
import type { Db } from "@/lib/supabase/database"
import type { Json } from "@/lib/supabase/database.types"
import {
  admin,
  carruselDe,
  cuentaDe,
  literal,
  marcaConDueno,
  personaConSesion,
  piezaDe,
  vectorDe,
  versionVigente,
} from "./entorno"

const ANGULOS = [{ nombre: "Mitos", por_que: "Lo que se cree y no es." }]
const SECCIONES = { deQueHablamos: "", tono: "", formatos: "", temasVetados: "", temasAVigilar: "", ejemplos: "" }
const MOTIVO_DOS_INTENTOS = "No pude escribir esta pieza después de dos intentos."
const SHA = "a".repeat(64)

type Persona = { db: Db; userId: string }
let dueno: Persona
let ajeno: Persona
let otro: Persona
let marcaWav: string
let marcaYo: string
let marcaAjena: string
let pilarWav: string
let pilarYo: string
const hallazgosCreados: string[] = []
/** Reports this file saved ideas for: its leftover proposals are set aside so other files' counts stay theirs. */
const seriesCreadas = new Set<string>()

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

/** Assignments are leased globally too: every other open one leaves the queue. Local test database only. */
async function cerrarAsignacionesAbiertas(): Promise<void> {
  const { error } = await admin()
    .from("asignaciones")
    .update({ estado: "descartada" })
    .in("estado", ["por_escribir", "escribiendo"])
  if (error) throw error
}

let minutoSiguiente = 0

/**
 * The next weekday (judged in Santiago) at least `dias` ahead, at 15:MM UTC (11:MM or 12:MM in Santiago). Without a
 * minute, each call gets its own, so two days that roll to the same Monday are still two slots.
 */
function habil(dias: number, minuto = 60 + minutoSiguiente++): string {
  const d = new Date(Date.now() + dias * 86_400_000)
  d.setUTCHours(15, minuto, 0, 0)
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString()
}

function sabado(): string {
  const d = new Date(Date.now() + 2 * 86_400_000)
  d.setUTCHours(15, 0, 0, 0)
  while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString()
}

const igual = (a: string | null | undefined, b: string) => new Date(a ?? 0).getTime() === new Date(b).getTime()

async function hallazgoDe(investigacion: string | null, eje: number): Promise<string> {
  const enlace = `https://medio.cl/${randomUUID()}`
  const { data, error } = await admin()
    .from("hallazgos")
    .insert({
      resumen: "Un hallazgo de prueba",
      enlace,
      enlace_normalizado: enlace.replace(/^https:\/\//, ""),
      medio: "Medio",
      vector: literal(vectorDe(eje)),
      investigacion_id: investigacion,
      angulo: investigacion ? "Mitos" : null,
    })
    .select("id")
    .single()
  if (error) throw error
  hallazgosCreados.push(data.id)
  return data.id
}

/** A report Federico approved, with two findings of its own. */
async function informeAprobado(): Promise<{ id: string; hallazgos: string[] }> {
  await cerrarTrabajosAbiertos()
  const { data: id, error } = await dueno.db.rpc("pedir_investigacion", {
    p_tema: "WR3 y focus groups",
    p_cantidad: 5,
    p_formato: "carrusel_pdf",
  })
  if (error) throw error
  const { data: tomados } = await admin().rpc("tomar_trabajo_de_investigacion")
  const trabajo = tomados?.[0]
  if (!trabajo) throw new Error("se esperaba un trabajo")
  const hallazgos = [await hallazgoDe(id, 0), await hallazgoDe(id, 1)]
  const cierre = await admin().rpc("cerrar_investigacion", { p_investigacion: id, p_angulos: ANGULOS })
  if (cierre.error) throw cierre.error
  await admin().rpc("terminar_trabajo_de_investigacion", { p_trabajo: trabajo.id, p_estado: "hecho" })
  const aprobado = await dueno.db.rpc("aprobar_informe", { p_investigacion: id })
  if (aprobado.error) throw aprobado.error
  return { id, hallazgos }
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

interface IdeaDePrueba {
  gancho?: string
  formato?: "texto" | "carrusel_pdf"
  esqueleto?: Json
  fuentes: string[]
  cuenta: string
  pilar?: string | null
  eje?: number
  reemplaza_a?: string
}

function idea(i: IdeaDePrueba) {
  return {
    gancho: i.gancho ?? "Los focus groups no son lo que crees",
    resumen: "Tres mitos sobre los focus groups y lo que dicen los datos.",
    formato: i.formato ?? "texto",
    esqueleto: i.esqueleto ?? [{ idea: "El mito" }, { idea: "Lo que dicen los datos" }],
    fuentes: i.fuentes,
    cuenta: i.cuenta,
    razon: "Habla de investigación, que es lo de WAV.",
    pilar: i.pilar ?? null,
    vector: literal(vectorDe(i.eje ?? 100)),
    ...(i.reemplaza_a ? { reemplaza_a: i.reemplaza_a } : {}),
  }
}

async function guardarSerie(investigacion: string, ideas: ReturnType<typeof idea>[]): Promise<string[]> {
  seriesCreadas.add(investigacion)
  const { data, error } = await admin().rpc("guardar_serie", { p_investigacion: investigacion, p_ideas: ideas })
  if (error) throw error
  return data as string[]
}

async function leerIdea(id: string) {
  const { data, error } = await admin().from("ideas").select("*").eq("id", id).single()
  if (error) throw error
  return data
}

async function asignacionesDe(ideaId: string) {
  const { data, error } = await admin().from("asignaciones").select("*").eq("idea_id", ideaId).order("planeada_para")
  if (error) throw error
  return data
}

/** An approved idea with one assignment on `cuenta` at `fecha`. */
async function ideaAprobada(
  cuenta: string,
  fecha: string,
  extra: Partial<IdeaDePrueba> = {},
): Promise<{ idea: string; asignacion: string; investigacion: string; hallazgos: string[] }> {
  const informe = await informeAprobado()
  const [id] = await guardarSerie(informe.id, [idea({ fuentes: informe.hallazgos, cuenta, eje: 200, ...extra })])
  const { data, error } = await dueno.db.rpc("aprobar_idea", {
    p_idea: id,
    p_asignaciones: [{ cuenta, planeada_para: fecha }],
  })
  if (error) throw error
  return { idea: id, asignacion: (data as string[])[0], investigacion: informe.id, hallazgos: informe.hallazgos }
}

async function tomarAsignaciones(hasta: string, limite = 10) {
  const { data, error } = await admin().rpc("tomar_asignaciones", { p_hasta: hasta, p_limite: limite })
  if (error) throw error
  return data ?? []
}

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

beforeAll(async () => {
  dueno = await personaConSesion("series-dueno")
  ajeno = await personaConSesion("series-ajeno")
  otro = await personaConSesion("series-otro")
  marcaWav = await marcaConDueno(dueno.userId, "nosotros")
  marcaYo = await marcaConDueno(dueno.userId, "yo")
  marcaAjena = await marcaConDueno(otro.userId, "nosotros")
  pilarWav = await pilarDe(dueno, marcaWav)
  pilarYo = await pilarDe(dueno, marcaYo)
})

beforeEach(cerrarTrabajosAbiertos)

afterAll(async () => {
  await cerrarTrabajosAbiertos()
  await cerrarAsignacionesAbiertas()
  if (seriesCreadas.size > 0) {
    const { error } = await admin()
      .from("ideas")
      .update({ estado: "descartada" })
      .eq("estado", "propuesta")
      .in("investigacion_id", [...seriesCreadas])
    if (error) throw error
  }
  if (hallazgosCreados.length > 0) await admin().from("hallazgos").delete().in("id", hallazgosCreados)
})

describe("the series job", () => {
  test("aprobar_informe queues a series job, and taking it leaves the report approved", async () => {
    const { id } = await informeAprobado()
    expect((await trabajosDe(id)).map((t) => [t.tipo, t.estado])).toEqual([
      ["investigar", "hecho"],
      ["serie", "pendiente"],
    ])
    const { data: tomados } = await admin().rpc("tomar_trabajo_de_investigacion")
    expect(tomados?.map((t) => t.tipo)).toEqual(["serie"])
    const { data: inv } = await admin().from("investigaciones").select("estado").eq("id", id).single()
    expect(inv?.estado).toBe("aprobada")
    const tomado = tomados?.[0]
    if (!tomado) throw new Error("se esperaba un trabajo")
    await admin().rpc("terminar_trabajo_de_investigacion", { p_trabajo: tomado.id, p_estado: "fallo", p_motivo: "x" })
    const { data: despues } = await admin().from("investigaciones").select("estado").eq("id", id).single()
    expect(despues?.estado).toBe("aprobada")
  })

  test("pedir_serie queues one for an approved report without ideas or an open job, owners only", async () => {
    const { id, hallazgos } = await informeAprobado()
    const abierto = await dueno.db.rpc("pedir_serie", { p_investigacion: id })
    expect(abierto.error?.message).toBe("serie_no_disponible")
    await cerrarTrabajosAbiertos()
    expect((await ajeno.db.rpc("pedir_serie", { p_investigacion: id })).error?.code).toBe("42501")
    const { data, error } = await dueno.db.rpc("pedir_serie", { p_investigacion: id })
    expect(error).toBeNull()
    expect((await trabajosDe(id)).at(-1)).toMatchObject({ id: data, tipo: "serie", estado: "pendiente" })
    await cerrarTrabajosAbiertos()
    await guardarSerie(id, [idea({ fuentes: hallazgos, cuenta: await cuentaDe(marcaWav, "empresa", "a_mano") })])
    expect((await dueno.db.rpc("pedir_serie", { p_investigacion: id })).error?.message).toBe("serie_no_disponible")
  })

  test("pedir_serie refuses a report that is not approved", async () => {
    const { data: id } = await dueno.db.rpc("pedir_investigacion", {
      p_tema: "Otro tema",
      p_cantidad: 3,
      p_formato: "texto",
    })
    const { error } = await dueno.db.rpc("pedir_serie", { p_investigacion: id as string })
    expect(error?.message).toBe("serie_no_disponible")
  })
})

describe("guardar_serie", () => {
  let cuenta: string
  beforeAll(async () => {
    cuenta = await cuentaDe(marcaWav, "empresa", "a_mano")
  })

  test("saves the ideas in order as proposals with their vectors", async () => {
    const { id, hallazgos } = await informeAprobado()
    const ids = await guardarSerie(id, [
      idea({ gancho: "Primera", fuentes: [hallazgos[0]], cuenta, pilar: pilarWav, eje: 300 }),
      idea({
        gancho: "Segunda",
        formato: "carrusel_pdf",
        esqueleto: [
          { tipo: "portada", idea: "Portada" },
          { tipo: "punto", idea: "Un punto" },
          { tipo: "cierre", idea: "Cierre" },
        ],
        fuentes: hallazgos,
        cuenta,
        eje: 301,
      }),
    ])
    expect(ids).toHaveLength(2)
    const primera = await leerIdea(ids[0])
    const segunda = await leerIdea(ids[1])
    expect(primera).toMatchObject({
      investigacion_id: id,
      gancho: "Primera",
      formato: "texto",
      estado: "propuesta",
      cuenta_sugerida: cuenta,
      pilar_id: pilarWav,
      fuentes: [hallazgos[0]],
    })
    expect(primera.vector).toBeTruthy()
    expect(segunda).toMatchObject({ gancho: "Segunda", formato: "carrusel_pdf", estado: "propuesta" })
    expect(segunda.orden).toBeGreaterThan(primera.orden)
  })

  test("refuses a source from another research, an unknown account and a pillar of another brand", async () => {
    const { id, hallazgos } = await informeAprobado()
    const suelto = await hallazgoDe(null, 7)
    const ajena = await admin().rpc("guardar_serie", {
      p_investigacion: id,
      p_ideas: [idea({ fuentes: [hallazgos[0], suelto], cuenta })],
    })
    expect(ajena.error?.message).toBe("fuente_ajena")
    const desconocida = await admin().rpc("guardar_serie", {
      p_investigacion: id,
      p_ideas: [idea({ fuentes: hallazgos, cuenta: randomUUID() })],
    })
    expect(desconocida.error?.message).toBe("cuenta_desconocida")
    const pilar = await admin().rpc("guardar_serie", {
      p_investigacion: id,
      p_ideas: [idea({ fuentes: hallazgos, cuenta, pilar: pilarYo })],
    })
    expect(pilar.error?.message).toBe("pilar_no_valido")
    const { data } = await admin().from("ideas").select("id").eq("investigacion_id", id)
    expect(data).toEqual([])
  })

  test("refuses a skeleton that is not a list of 1 to 10 beats", async () => {
    const { id, hallazgos } = await informeAprobado()
    for (const esqueleto of [[], [{ tipo: "punto" }], ["texto"], Array.from({ length: 11 }, () => ({ idea: "x" }))]) {
      const { error } = await admin().rpc("guardar_serie", {
        p_investigacion: id,
        p_ideas: [idea({ fuentes: hallazgos, cuenta, esqueleto })],
      })
      expect(error?.message, JSON.stringify(esqueleto)).toBe("esqueleto_no_valido")
    }
  })

  test("is for the service only", async () => {
    const { id, hallazgos } = await informeAprobado()
    const { error } = await dueno.db.rpc("guardar_serie", {
      p_investigacion: id,
      p_ideas: [idea({ fuentes: hallazgos, cuenta })],
    })
    expect(error?.code).toBe("42501")
  })
})

describe("ideas_parecidas", () => {
  test("returns earlier ideas at or above the threshold, ignoring replaced ones and the excepted", async () => {
    const cuenta = await cuentaDe(marcaWav, "empresa", "a_mano")
    const { id, hallazgos } = await informeAprobado()
    const [cerca, lejos, excepta] = await guardarSerie(id, [
      idea({ fuentes: hallazgos, cuenta, eje: 400 }),
      idea({ fuentes: hallazgos, cuenta, eje: 401 }),
      idea({ fuentes: hallazgos, cuenta, eje: 402 }),
    ])
    const [reemplazante] = await guardarSerie(id, [
      idea({ fuentes: hallazgos, cuenta, eje: 403, reemplaza_a: excepta }),
    ])
    const parecidas = async (eje: number, inclinado?: { hacia: number; similitud: number }, excepto: string[] = []) => {
      const { data, error } = await admin().rpc("ideas_parecidas", {
        p_vector: literal(vectorDe(eje, inclinado)),
        p_umbral: 0.9,
        p_excepto: excepto,
      })
      expect(error).toBeNull()
      return (data ?? []).map((d: { id: string }) => d.id)
    }
    const cercanas = await parecidas(400, { hacia: 401, similitud: 0.95 })
    expect(cercanas).toContain(cerca)
    expect(cercanas).not.toContain(lejos)
    expect(await parecidas(402)).not.toContain(excepta)
    expect(await parecidas(403)).toContain(reemplazante)
    expect(await parecidas(403, undefined, [reemplazante])).not.toContain(reemplazante)
    const consulta = literal(vectorDe(400))
    const deUnaPersona = await dueno.db.rpc("ideas_parecidas", { p_vector: consulta, p_umbral: 0.9, p_excepto: [] })
    expect(deUnaPersona.error?.code).toBe("42501")
  })
})

describe("aprobar_idea", () => {
  test("creates the assignments and approves the idea", async () => {
    const wav = await cuentaDe(marcaWav, "empresa", "a_mano")
    const yo = await cuentaDe(marcaYo)
    const { id, hallazgos } = await informeAprobado()
    const [ideaId] = await guardarSerie(id, [idea({ fuentes: hallazgos, cuenta: wav, formato: "texto", eje: 500 })])
    const { data, error } = await dueno.db.rpc("aprobar_idea", {
      p_idea: ideaId,
      p_asignaciones: [
        { cuenta: wav, planeada_para: habil(10) },
        { cuenta: yo, planeada_para: habil(11) },
      ],
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(2)
    expect(await leerIdea(ideaId)).toMatchObject({ estado: "aprobada", aprobada_por: dueno.userId })
    const asignaciones = await asignacionesDe(ideaId)
    expect(asignaciones.map((a) => [a.cuenta_id, a.formato, a.estado])).toEqual([
      [wav, "texto", "por_escribir"],
      [yo, "texto", "por_escribir"],
    ])
    const otra = await dueno.db.rpc("aprobar_idea", {
      p_idea: ideaId,
      p_asignaciones: [{ cuenta: wav, planeada_para: habil(12) }],
    })
    expect(otra.error?.message).toBe("idea_no_esta_propuesta")
  })

  test("refuses while another version of the idea is being written, and approves once that job closes", async () => {
    const wav = await cuentaDe(marcaWav, "empresa", "a_mano")
    const { id, hallazgos } = await informeAprobado()
    const [ideaId] = await guardarSerie(id, [idea({ fuentes: hallazgos, cuenta: wav, eje: 503 })])
    await cerrarTrabajosAbiertos()
    const pedido = await dueno.db.rpc("pedir_otra_idea", { p_idea: ideaId })
    if (pedido.error) throw pedido.error
    const intento = { p_idea: ideaId, p_asignaciones: [{ cuenta: wav, planeada_para: habil(10) }] }
    expect((await dueno.db.rpc("aprobar_idea", intento)).error?.message).toBe("trabajo_en_curso")
    const { data: tomados } = await admin().rpc("tomar_trabajo_de_investigacion")
    expect(tomados?.map((t) => t.id)).toEqual([pedido.data])
    expect((await dueno.db.rpc("aprobar_idea", intento)).error?.message).toBe("trabajo_en_curso")
    expect((await leerIdea(ideaId)).estado).toBe("propuesta")
    expect(await asignacionesDe(ideaId)).toEqual([])
    await admin().rpc("terminar_trabajo_de_investigacion", { p_trabajo: pedido.data, p_estado: "fallo", p_motivo: "x" })
    expect((await dueno.db.rpc("aprobar_idea", intento)).error).toBeNull()
  })

  test("refuses an account of a brand the person does not own, and a person with no brand", async () => {
    const ajena = await cuentaDe(marcaAjena, "empresa", "a_mano")
    const { id, hallazgos } = await informeAprobado()
    const [ideaId] = await guardarSerie(id, [idea({ fuentes: hallazgos, cuenta: ajena, eje: 501 })])
    const intento = { p_idea: ideaId, p_asignaciones: [{ cuenta: ajena, planeada_para: habil(10) }] }
    expect((await dueno.db.rpc("aprobar_idea", intento)).error?.code).toBe("42501")
    expect((await ajeno.db.rpc("aprobar_idea", intento)).error?.code).toBe("42501")
    expect((await leerIdea(ideaId)).estado).toBe("propuesta")
  })

  test("refuses a weekend or a past date", async () => {
    const wav = await cuentaDe(marcaWav, "empresa", "a_mano")
    const { id, hallazgos } = await informeAprobado()
    const [ideaId] = await guardarSerie(id, [idea({ fuentes: hallazgos, cuenta: wav, eje: 502 })])
    for (const fecha of [sabado(), new Date(Date.now() - 3_600_000).toISOString()]) {
      const { error } = await dueno.db.rpc("aprobar_idea", {
        p_idea: ideaId,
        p_asignaciones: [{ cuenta: wav, planeada_para: fecha }],
      })
      expect(error?.message, fecha).toBe("fecha_no_valida")
    }
  })

  test("a slot held by a piece or by an open assignment is busy", async () => {
    const wav = await cuentaDe(marcaWav, "empresa", "a_mano")
    const pieza = await piezaDe(dueno.db, wav)
    const deLaPieza = habil(14)
    expect((await dueno.db.rpc("planear_pieza", { p_pieza: pieza, p_fecha: deLaPieza })).error).toBeNull()
    const { id, hallazgos } = await informeAprobado()
    const [a, b] = await guardarSerie(id, [
      idea({ fuentes: hallazgos, cuenta: wav, eje: 503 }),
      idea({ fuentes: hallazgos, cuenta: wav, eje: 504 }),
    ])
    const contraPieza = await dueno.db.rpc("aprobar_idea", {
      p_idea: a,
      p_asignaciones: [{ cuenta: wav, planeada_para: deLaPieza }],
    })
    expect(contraPieza.error).toMatchObject({ code: "23505", message: "horario_ocupado" })
    const libre = habil(15)
    expect(
      (await dueno.db.rpc("aprobar_idea", { p_idea: a, p_asignaciones: [{ cuenta: wav, planeada_para: libre }] }))
        .error,
    ).toBeNull()
    const contraAsignacion = await dueno.db.rpc("aprobar_idea", {
      p_idea: b,
      p_asignaciones: [{ cuenta: wav, planeada_para: libre }],
    })
    expect(contraAsignacion.error).toMatchObject({ code: "23505", message: "horario_ocupado" })
    expect((await leerIdea(b)).estado).toBe("propuesta")
  })
})

describe("the slot is shared by pieces and assignments", () => {
  test("a piece cannot be planned or signed onto an open assignment's slot", async () => {
    const wav = await cuentaDe(marcaWav, "empresa", "a_mano")
    const fecha = habil(16)
    await ideaAprobada(wav, fecha)
    const pieza = await piezaDe(dueno.db, wav)
    const plan = await dueno.db.rpc("planear_pieza", { p_pieza: pieza, p_fecha: fecha })
    expect(plan.error).toMatchObject({ code: "23505", message: "horario_ocupado" })
    const v = await versionVigente(pieza)
    const firma = await dueno.db.rpc("firmar_pieza", { p_pieza: pieza, p_huella: v.huella, p_programada_para: fecha })
    expect(firma.error).toMatchObject({ code: "23505", message: "horario_ocupado" })
    expect((await dueno.db.rpc("planear_pieza", { p_pieza: pieza, p_fecha: habil(17) })).error).toBeNull()
  })

  test("a slot freed by a discarded assignment can be planned", async () => {
    const wav = await cuentaDe(marcaWav, "empresa", "a_mano")
    const fecha = habil(18)
    const { idea: ideaId } = await ideaAprobada(wav, fecha)
    expect((await dueno.db.rpc("descartar_idea", { p_idea: ideaId })).error).toBeNull()
    const pieza = await piezaDe(dueno.db, wav)
    expect((await dueno.db.rpc("planear_pieza", { p_pieza: pieza, p_fecha: fecha })).error).toBeNull()
  })

  test("an assignment cannot be moved onto a signed piece's slot", async () => {
    const wav = await cuentaDe(marcaWav, "empresa", "a_mano")
    const pieza = await piezaDe(dueno.db, wav)
    const firmada = habil(19)
    const v = await versionVigente(pieza)
    expect(
      (await dueno.db.rpc("firmar_pieza", { p_pieza: pieza, p_huella: v.huella, p_programada_para: firmada })).error,
    ).toBeNull()
    const { asignacion } = await ideaAprobada(wav, habil(20))
    const { error } = await dueno.db.rpc("mover_asignacion", { p_asignacion: asignacion, p_fecha: firmada })
    expect(error).toMatchObject({ code: "23505", message: "horario_ocupado" })
  })
})

describe("descartar_idea, editar_idea, pedir_otra_idea", () => {
  test("a proposal is discarded", async () => {
    const wav = await cuentaDe(marcaWav, "empresa", "a_mano")
    const { id, hallazgos } = await informeAprobado()
    const [ideaId] = await guardarSerie(id, [idea({ fuentes: hallazgos, cuenta: wav, eje: 600 })])
    expect((await ajeno.db.rpc("descartar_idea", { p_idea: ideaId })).error?.code).toBe("42501")
    expect((await dueno.db.rpc("descartar_idea", { p_idea: ideaId })).error).toBeNull()
    expect((await leerIdea(ideaId)).estado).toBe("descartada")
  })

  test("an approved idea is discarded with its open assignments; written pieces stay", async () => {
    const wav = await cuentaDe(marcaWav, "empresa", "a_mano")
    const yo = await cuentaDe(marcaYo)
    const { id, hallazgos } = await informeAprobado()
    const [ideaId] = await guardarSerie(id, [idea({ fuentes: hallazgos, cuenta: wav, eje: 601 })])
    await dueno.db.rpc("aprobar_idea", {
      p_idea: ideaId,
      p_asignaciones: [
        { cuenta: wav, planeada_para: habil(2, 5) },
        { cuenta: yo, planeada_para: habil(21) },
      ],
    })
    const [escrita] = await asignacionesDe(ideaId)
    await cerrarAsignacionesSalvo([escrita.id])
    const [tomada] = await tomarAsignaciones(habil(3, 5))
    expect(tomada?.id).toBe(escrita.id)
    const { data: creada } = await admin().rpc("crear_pieza_de_asignacion", {
      p_asignacion: escrita.id,
      p_texto: "Escrito por Claude",
      p_linea_version: 1,
      p_planeada_para: habil(2, 5),
    })
    const { pieza } = creada as { pieza: string }
    expect((await dueno.db.rpc("descartar_idea", { p_idea: ideaId })).error).toBeNull()
    expect((await leerIdea(ideaId)).estado).toBe("descartada")
    expect((await asignacionesDe(ideaId)).map((a) => a.estado)).toEqual(["escrita", "descartada"])
    const { data: p } = await admin().from("piezas").select("estado").eq("id", pieza).single()
    expect(p?.estado).toBe("por_aprobar")
  })

  test("editar_idea changes the hook and skeleton of a proposal only", async () => {
    const wav = await cuentaDe(marcaWav, "empresa", "a_mano")
    const { id, hallazgos } = await informeAprobado()
    const [ideaId] = await guardarSerie(id, [idea({ fuentes: hallazgos, cuenta: wav, eje: 602 })])
    const esqueleto = [{ idea: "Uno" }, { idea: "Dos" }, { idea: "Tres" }]
    expect(
      (await dueno.db.rpc("editar_idea", { p_idea: ideaId, p_gancho: "Nuevo gancho", p_esqueleto: esqueleto })).error,
    ).toBeNull()
    expect(await leerIdea(ideaId)).toMatchObject({ gancho: "Nuevo gancho", esqueleto })
    const malo = await dueno.db.rpc("editar_idea", { p_idea: ideaId, p_gancho: "Otro", p_esqueleto: [] })
    expect(malo.error?.message).toBe("esqueleto_no_valido")
    expect(
      (await ajeno.db.rpc("editar_idea", { p_idea: ideaId, p_gancho: "x", p_esqueleto: esqueleto })).error?.code,
    ).toBe("42501")
    await dueno.db.rpc("descartar_idea", { p_idea: ideaId })
    const tarde = await dueno.db.rpc("editar_idea", { p_idea: ideaId, p_gancho: "Tarde", p_esqueleto: esqueleto })
    expect(tarde.error?.message).toBe("idea_no_editable")
  })

  test("pedir_otra_idea queues one job per idea, and its result replaces the idea", async () => {
    const wav = await cuentaDe(marcaWav, "empresa", "a_mano")
    const { id, hallazgos } = await informeAprobado()
    await cerrarTrabajosAbiertos()
    const [vieja] = await guardarSerie(id, [idea({ fuentes: hallazgos, cuenta: wav, eje: 603 })])
    const { data: trabajo, error } = await dueno.db.rpc("pedir_otra_idea", { p_idea: vieja })
    expect(error).toBeNull()
    expect((await trabajosDe(id)).at(-1)).toMatchObject({
      id: trabajo,
      tipo: "otra_idea",
      idea_id: vieja,
      estado: "pendiente",
    })
    expect((await dueno.db.rpc("pedir_otra_idea", { p_idea: vieja })).error?.message).toBe("trabajo_en_curso")
    expect((await ajeno.db.rpc("pedir_otra_idea", { p_idea: vieja })).error?.code).toBe("42501")
    const [nueva] = await guardarSerie(id, [idea({ fuentes: hallazgos, cuenta: wav, eje: 604, reemplaza_a: vieja })])
    expect((await leerIdea(vieja)).estado).toBe("reemplazada")
    expect(await leerIdea(nueva)).toMatchObject({
      estado: "propuesta",
      reemplaza_a: vieja,
      orden: (await leerIdea(vieja)).orden,
    })
  })
})

describe("mover_asignacion", () => {
  test("moves a por_escribir assignment to a valid free slot, owners only", async () => {
    const wav = await cuentaDe(marcaWav, "empresa", "a_mano")
    const { asignacion } = await ideaAprobada(wav, habil(22))
    const nueva = habil(23)
    expect((await ajeno.db.rpc("mover_asignacion", { p_asignacion: asignacion, p_fecha: nueva })).error?.code).toBe(
      "42501",
    )
    expect((await otro.db.rpc("mover_asignacion", { p_asignacion: asignacion, p_fecha: nueva })).error?.code).toBe(
      "42501",
    )
    expect(
      (await dueno.db.rpc("mover_asignacion", { p_asignacion: asignacion, p_fecha: sabado() })).error?.message,
    ).toBe("fecha_no_valida")
    expect((await dueno.db.rpc("mover_asignacion", { p_asignacion: asignacion, p_fecha: nueva })).error).toBeNull()
    const { data } = await admin().from("asignaciones").select("planeada_para").eq("id", asignacion).single()
    expect(igual(data?.planeada_para, nueva)).toBe(true)
  })

  test("refuses an assignment that is no longer por_escribir", async () => {
    const wav = await cuentaDe(marcaWav, "empresa", "a_mano")
    const { asignacion } = await ideaAprobada(wav, habil(1, 10))
    await cerrarAsignacionesSalvo([asignacion])
    await tomarAsignaciones(habil(2, 10))
    const { error } = await dueno.db.rpc("mover_asignacion", { p_asignacion: asignacion, p_fecha: habil(24) })
    expect(error?.message).toBe("asignacion_no_movible")
  })
})

/** Every open assignment except these leaves the global queue. Local test database only. */
async function cerrarAsignacionesSalvo(ids: string[]): Promise<void> {
  const { error } = await admin()
    .from("asignaciones")
    .update({ estado: "descartada" })
    .in("estado", ["por_escribir", "escribiendo"])
    .not("id", "in", `(${ids.join(",")})`)
  if (error) throw error
}

describe("writing", () => {
  test("tomar_asignaciones leases due assignments only, and is for the service", async () => {
    const wav = await cuentaDe(marcaWav, "empresa", "a_mano")
    const pronto = await ideaAprobada(wav, habil(1, 20))
    const tarde = await ideaAprobada(wav, habil(9, 20))
    await cerrarAsignacionesSalvo([pronto.asignacion, tarde.asignacion])
    expect((await dueno.db.rpc("tomar_asignaciones", { p_hasta: habil(4), p_limite: 3 })).error?.code).toBe("42501")
    const tomadas = await tomarAsignaciones(habil(4, 20))
    expect(tomadas.map((a) => a.id)).toEqual([pronto.asignacion])
    expect(tomadas[0]).toMatchObject({ estado: "escribiendo", intentos: 1 })
    expect(await tomarAsignaciones(habil(4, 20))).toEqual([])
  })

  test("an assignment leased twice is closed as fallo", async () => {
    const wav = await cuentaDe(marcaWav, "empresa", "a_mano")
    const { asignacion } = await ideaAprobada(wav, habil(1, 25))
    await cerrarAsignacionesSalvo([asignacion])
    await admin()
      .from("asignaciones")
      .update({ estado: "escribiendo", intentos: 2, arrendado_hasta: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", asignacion)
    expect(await tomarAsignaciones(habil(4, 25))).toEqual([])
    const { data } = await admin().from("asignaciones").select("estado, motivo").eq("id", asignacion).single()
    expect(data).toEqual({ estado: "fallo", motivo: MOTIVO_DOS_INTENTOS })
  })

  test("crear_pieza_de_asignacion writes the text piece on the slot and marks the findings used", async () => {
    const wav = await cuentaDe(marcaWav, "empresa", "a_mano")
    const fecha = habil(1, 30)
    const aprobada = await ideaAprobada(wav, fecha, { pilar: pilarWav })
    await cerrarAsignacionesSalvo([aprobada.asignacion])
    await tomarAsignaciones(habil(4, 30))
    const persona = await dueno.db.rpc("crear_pieza_de_asignacion", {
      p_asignacion: aprobada.asignacion,
      p_texto: "x",
      p_linea_version: 1,
      p_planeada_para: fecha,
    })
    expect(persona.error?.code).toBe("42501")
    const { data, error } = await admin().rpc("crear_pieza_de_asignacion", {
      p_asignacion: aprobada.asignacion,
      p_texto: "Escrito por Claude",
      p_linea_version: 1,
      p_planeada_para: fecha,
    })
    expect(error).toBeNull()
    const { pieza } = data as { pieza: string; version: string }
    const { data: p } = await admin()
      .from("piezas")
      .select("cuenta_id, formato, estado, pilar_id, planeada_para, creada_por")
      .eq("id", pieza)
      .single()
    expect(p).toMatchObject({
      cuenta_id: wav,
      formato: "texto",
      estado: "por_aprobar",
      pilar_id: pilarWav,
      creada_por: dueno.userId,
    })
    expect(igual(p?.planeada_para, fecha)).toBe(true)
    const { data: v } = await admin().from("versiones").select("origen, linea_version, texto").eq("pieza_id", pieza)
    expect(v).toEqual([{ origen: "claude", linea_version: 1, texto: "Escrito por Claude" }])
    const { data: a } = await admin()
      .from("asignaciones")
      .select("estado, pieza_id")
      .eq("id", aprobada.asignacion)
      .single()
    expect(a).toEqual({ estado: "escrita", pieza_id: pieza })
    const { data: h } = await admin().from("hallazgos").select("estado").in("id", aprobada.hallazgos)
    expect(h?.map((x) => x.estado)).toEqual(["usado", "usado"])
  })

  test("a pillar of the suggested account's brand is left out on another brand's account", async () => {
    const yo = await cuentaDe(marcaYo)
    const wav = await cuentaDe(marcaWav, "empresa", "a_mano")
    const { id, hallazgos } = await informeAprobado()
    const [ideaId] = await guardarSerie(id, [idea({ fuentes: hallazgos, cuenta: wav, pilar: pilarWav, eje: 700 })])
    const fecha = habil(1, 35)
    const { data } = await dueno.db.rpc("aprobar_idea", {
      p_idea: ideaId,
      p_asignaciones: [{ cuenta: yo, planeada_para: fecha }],
    })
    const asignacion = (data as string[])[0]
    await cerrarAsignacionesSalvo([asignacion])
    await tomarAsignaciones(habil(4, 35))
    const { data: creada, error } = await admin().rpc("crear_pieza_de_asignacion", {
      p_asignacion: asignacion,
      p_texto: "Escrito",
      p_linea_version: 1,
      p_planeada_para: fecha,
    })
    expect(error).toBeNull()
    const { data: p } = await admin()
      .from("piezas")
      .select("pilar_id")
      .eq("id", (creada as { pieza: string }).pieza)
      .single()
    expect(p?.pilar_id).toBeNull()
  })

  test("fallar_asignacion closes it with the reason; a person cannot", async () => {
    const wav = await cuentaDe(marcaWav, "empresa", "a_mano")
    const { asignacion } = await ideaAprobada(wav, habil(1, 40))
    await cerrarAsignacionesSalvo([asignacion])
    await tomarAsignaciones(habil(4, 40))
    expect((await dueno.db.rpc("fallar_asignacion", { p_asignacion: asignacion, p_motivo: "x" })).error?.code).toBe(
      "42501",
    )
    expect(
      (await admin().rpc("fallar_asignacion", { p_asignacion: asignacion, p_motivo: "Claude se negó." })).error,
    ).toBeNull()
    const { data } = await admin().from("asignaciones").select("estado, motivo").eq("id", asignacion).single()
    expect(data).toEqual({ estado: "fallo", motivo: "Claude se negó." })
  })
})

describe("carousels", () => {
  const diseno = carruselInicial("wav")

  /** tomar_pedidos_de_diseno is global and takes the oldest: close every other open request first. */
  async function tomarDisenoSolo(id: string): Promise<void> {
    const { error } = await admin()
      .from("pedidos_de_diseno")
      .update({ estado: "obsoleto" })
      .in("estado", ["pendiente", "trabajando"])
      .neq("id", id)
    if (error) throw error
    const { data } = await admin().rpc("tomar_pedidos_de_diseno")
    expect(data?.map((p) => p.id)).toEqual([id])
  }

  async function carruselPedido(fecha: string) {
    const wav = await cuentaDe(marcaWav, "empresa", "a_mano")
    const aprobada = await ideaAprobada(wav, fecha, { formato: "carrusel_pdf", pilar: pilarWav })
    await cerrarAsignacionesSalvo([aprobada.asignacion])
    await tomarAsignaciones(habil(4, 50))
    const { data: pedido, error } = await admin().rpc("pedir_diseno_de_asignacion", {
      p_asignacion: aprobada.asignacion,
      p_tema: "wav-noche",
      p_titulo: "Documento",
      p_texto: "Texto del post",
      p_diseno: diseno,
      p_linea_version: 1,
      p_planeada_para: fecha,
    })
    expect(error).toBeNull()
    return { ...aprobada, cuenta: wav, pedido: pedido as string }
  }

  test("pedir_diseno_de_asignacion queues the request; guardar_diseno writes the piece on the slot", async () => {
    const fecha = habil(1, 50)
    const c = await carruselPedido(fecha)
    const { data: pedido } = await admin().from("pedidos_de_diseno").select("*").eq("id", c.pedido).single()
    expect(pedido).toMatchObject({
      cuenta_id: c.cuenta,
      estado: "pendiente",
      origen: "claude",
      linea_version: 1,
      asignacion_id: c.asignacion,
      pedido_por: dueno.userId,
    })
    expect(igual(pedido?.planeada_para, fecha)).toBe(true)
    // While it renders, the assignment keeps its slot and is not leased again.
    expect(await tomarAsignaciones(habil(4, 50))).toEqual([])
    await tomarDisenoSolo(c.pedido)
    const { data: guardado, error } = await admin().rpc("guardar_diseno", {
      p_pedido: c.pedido,
      p_archivo_ruta: `${marcaWav}/${randomUUID()}.pdf`,
      p_archivo_sha256: SHA,
      p_planeada_para: habil(30),
    })
    expect(error).toBeNull()
    const { pieza } = guardado as { pieza: string }
    const { data: p } = await admin().from("piezas").select("planeada_para, pilar_id").eq("id", pieza).single()
    expect(igual(p?.planeada_para, fecha)).toBe(true)
    expect(p?.pilar_id).toBe(pilarWav)
    const { data: v } = await admin().from("versiones").select("origen, linea_version").eq("pieza_id", pieza).single()
    expect(v).toEqual({ origen: "claude", linea_version: 1 })
    const { data: a } = await admin().from("asignaciones").select("estado, pieza_id").eq("id", c.asignacion).single()
    expect(a).toEqual({ estado: "escrita", pieza_id: pieza })
    const { data: h } = await admin().from("hallazgos").select("estado").in("id", c.hallazgos)
    expect(h?.map((x) => x.estado)).toEqual(["usado", "usado"])
  })

  test("a design request that fails closes its assignment with the same reason", async () => {
    const c = await carruselPedido(habil(1, 55))
    await tomarDisenoSolo(c.pedido)
    const motivo = "La lámina 3 no cabe."
    expect(
      (await admin().rpc("terminar_pedido_de_diseno", { p_pedido: c.pedido, p_estado: "fallo", p_motivo: motivo }))
        .error,
    ).toBeNull()
    const { data } = await admin().from("asignaciones").select("estado, motivo").eq("id", c.asignacion).single()
    expect(data).toEqual({ estado: "fallo", motivo })
  })

  test("pedir_diseno_de_asignacion is for the service only and keeps the brand's themes", async () => {
    const wav = await cuentaDe(marcaWav, "empresa", "a_mano")
    const { asignacion } = await ideaAprobada(wav, habil(1, 58), { formato: "carrusel_pdf" })
    await cerrarAsignacionesSalvo([asignacion])
    await tomarAsignaciones(habil(4, 58))
    const base = {
      p_asignacion: asignacion,
      p_tema: "wav-noche",
      p_titulo: "Documento",
      p_texto: "Texto",
      p_diseno: diseno,
      p_linea_version: 1,
      p_planeada_para: habil(1, 58),
    }
    expect((await dueno.db.rpc("pedir_diseno_de_asignacion", base)).error?.code).toBe("42501")
    const otroTema = await admin().rpc("pedir_diseno_de_asignacion", { ...base, p_tema: "personal-claro" })
    expect(otroTema.error?.message).toBe("tema_de_otra_marca")
  })

  test("a hand-made carousel still saves as before", async () => {
    const wav = await cuentaDe(marcaWav, "empresa", "a_mano")
    const pieza = await carruselDe(dueno.db, wav, marcaWav)
    expect(pieza).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe("RLS", () => {
  test("anyone with access reads ideas and assignments; a stranger reads none", async () => {
    const wav = await cuentaDe(marcaWav, "empresa", "a_mano")
    const { idea: ideaId, asignacion } = await ideaAprobada(wav, habil(25))
    const { data: ideas } = await dueno.db.from("ideas").select("id").eq("id", ideaId)
    expect(ideas).toEqual([{ id: ideaId }])
    const { data: asignaciones } = await dueno.db.from("asignaciones").select("id").eq("id", asignacion)
    expect(asignaciones).toEqual([{ id: asignacion }])
    const extrano = await personaConSesion("series-extrano")
    expect((await extrano.db.from("ideas").select("id").eq("id", ideaId)).data).toEqual([])
    expect((await extrano.db.from("asignaciones").select("id").eq("id", asignacion)).data).toEqual([])
    const escritura = await dueno.db.from("ideas").update({ gancho: "Hackeado" }).eq("id", ideaId).select("id")
    expect(escritura.data ?? []).toEqual([])
  })
})
