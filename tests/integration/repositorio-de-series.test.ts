import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest"
import type { Pedir } from "@/lib/ia/claude"
import { repositorioDeIdeas } from "@/lib/ideas/repositorio"
import { repositorioDeInvestigaciones } from "@/lib/investigacion/repositorio"
import { atenderInvestigaciones } from "@/lib/investigacion/vigilancia"
import { escribirPiezas } from "@/lib/series/escribir"
import type { IdeaPropuesta } from "@/lib/series/propuestas"
import { repositorioDeEscritura, repositorioDeSeries } from "@/lib/series/repositorio"
import type { Db } from "@/lib/supabase/database"
import { admin, cuentaDe, literal, marcaConDueno, personaConSesion } from "./entorno"

const SECCIONES = {
  deQueHablamos: "",
  tono: "",
  formatos: "",
  temasVetados: "Política",
  temasAVigilar: "",
  ejemplos: "",
}
const ANGULOS = [{ nombre: "Mitos", por_que: "Lo que se cree y no es." }]

let dueno: { db: Db; userId: string }
let marca: string
let cuenta: string
let pausada: string
let pilar: string
const investigaciones: string[] = []

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

async function hallazgoDe(investigacion: string, resumen: string): Promise<string> {
  const enlace = `https://medio.cl/${randomUUID()}`
  const { data, error } = await admin()
    .from("hallazgos")
    .insert({
      resumen,
      enlace,
      enlace_normalizado: enlace.replace(/^https:\/\//, ""),
      medio: "Medio",
      publicado_en: "2026-10-20",
      vector: literal(aleatorio()),
      investigacion_id: investigacion,
      angulo: "Mitos",
    })
    .select("id")
    .single()
  if (error) throw error
  return data.id
}

/** A report Federico approved, with two findings; approving it queued its series job. */
async function informeAprobado(): Promise<{ id: string; hallazgos: string[] }> {
  const { data: id, error } = await dueno.db.rpc("pedir_investigacion", {
    p_tema: "WR3 y focus groups",
    p_cantidad: 5,
    p_formato: "carrusel_pdf",
  })
  if (error) throw error
  investigaciones.push(id)
  const { data: tomados } = await admin().rpc("tomar_trabajo_de_investigacion")
  const trabajo = tomados?.[0]
  if (!trabajo) throw new Error("se esperaba un trabajo")
  const hallazgos = [await hallazgoDe(id, "Primer hallazgo"), await hallazgoDe(id, "Segundo hallazgo")]
  const cierre = await admin().rpc("cerrar_investigacion", { p_investigacion: id, p_angulos: ANGULOS })
  if (cierre.error) throw cierre.error
  await admin().rpc("terminar_trabajo_de_investigacion", { p_trabajo: trabajo.id, p_estado: "hecho" })
  const aprobado = await dueno.db.rpc("aprobar_informe", { p_investigacion: id })
  if (aprobado.error) throw aprobado.error
  // Approving also queues the report's crosses (4g), tested in cruces-y-domingo: here only the series runs.
  const cruces = await admin()
    .from("trabajos_de_investigacion")
    .update({ estado: "fallo", motivo: "Cerrado entre pruebas." })
    .eq("investigacion_id", id)
    .eq("tipo", "cruces")
  if (cruces.error) throw cruces.error
  return { id, hallazgos }
}

const repo = () => ({
  ...repositorioDeInvestigaciones(admin()),
  ...repositorioDeSeries(admin()),
  ...repositorioDeIdeas(admin()),
  embeber: async () => [],
  embeberIdeas: async (_clave: string, textos: string[]) => textos.map(() => aleatorio()),
})

/** Claude proposes `ideas` for this test's account, whatever its number among every account in the database. */
async function pedirSerie(ideas: (n: number) => IdeaPropuesta[]): Promise<Pedir> {
  const n = (await repositorioDeSeries(admin()).cuentasDeSerie()).findIndex((c) => c.id === cuenta) + 1
  return vi.fn<Pedir>(async () => ({ texto: JSON.stringify({ ideas: ideas(n) }), detenido: "end_turn", bloques: [] }))
}

const propuesta = (gancho: string, cuentaN: number): IdeaPropuesta => ({
  gancho,
  resumen: `Resumen de ${gancho}`,
  formato: "texto",
  esqueleto: [{ tipo: null, idea: "El mito" }],
  fuentes: [1, 2],
  cuenta: cuentaN,
  razon: "Habla de investigación.",
  pilar: 1,
})

async function ideasDe(investigacion: string) {
  const { data, error } = await admin().from("ideas").select("*").eq("investigacion_id", investigacion).order("orden")
  if (error) throw error
  return data
}

async function trabajosDe(investigacion: string) {
  const { data, error } = await admin()
    .from("trabajos_de_investigacion")
    .select("tipo, estado, motivo")
    .eq("investigacion_id", investigacion)
    .neq("tipo", "cruces")
    .order("creado_en")
  if (error) throw error
  return data
}

beforeAll(async () => {
  dueno = await personaConSesion("repo-series")
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
  pausada = await cuentaDe(marca, "persona", "a_mano")
  const pausa = await admin().from("cuentas").update({ ritmo_semanal: 0 }).eq("id", pausada)
  if (pausa.error) throw pausa.error
})

beforeEach(cerrarTrabajosAbiertos)

afterAll(async () => {
  await cerrarTrabajosAbiertos()
  await cerrarAsignacionesAbiertas()
  if (investigaciones.length === 0) return
  await admin().from("ideas").delete().in("investigacion_id", investigaciones)
  await admin().from("hallazgos").delete().in("investigacion_id", investigaciones)
})

describe("repositorioDeSeries", () => {
  test("the research queue hands a series job over as a series job", async () => {
    const { id } = await informeAprobado()
    expect(await repo().tomar()).toEqual({ id: expect.any(String), tipo: "serie", investigacionId: id, ideaId: null })
  })

  test("reads the approved report with its findings in a stable order", async () => {
    const { id, hallazgos } = await informeAprobado()
    const informe = await repo().informeDeSerie(id)
    expect(informe).toEqual({
      tema: "WR3 y focus groups",
      cantidad: 5,
      angulos: ANGULOS,
      hallazgos: [
        expect.objectContaining({ id: hallazgos[0], angulo: "Mitos", resumen: "Primer hallazgo", medio: "Medio" }),
        expect.objectContaining({ id: hallazgos[1], resumen: "Segundo hallazgo", publicado_en: "2026-10-20" }),
      ],
    })
  })

  test("lists the accounts that publish, with their brand's voice, active pillars and vetoed topics", async () => {
    const cuentas = await repo().cuentasDeSerie()
    expect(cuentas.find((c) => c.id === cuenta)).toEqual({
      id: cuenta,
      nombre: expect.any(String),
      tipo: "empresa",
      marca: { id: marca, nombre: expect.any(String), voz: "nosotros" },
      pilares: [{ id: pilar, nombre: "Oficio", deQueHabla: "Cómo trabajamos" }],
      temasVetados: "Política",
    })
    expect(cuentas.map((c) => c.id)).not.toContain(pausada)
  })

  test("runs a series job end to end: ideas saved as proposals, the newest first among earlier ones", async () => {
    const { id, hallazgos } = await informeAprobado()
    const pedir = await pedirSerie((n) => [propuesta("Los focus groups mienten poco", n)])
    const resultado = await atenderInvestigaciones({ ...repo(), pedir })
    expect(resultado).toEqual({ guardadas: 1, parecidas: 0, invalidas: 0 })
    const [idea] = await ideasDe(id)
    expect(idea).toMatchObject({
      gancho: "Los focus groups mienten poco",
      estado: "propuesta",
      cuenta_sugerida: cuenta,
      pilar_id: pilar,
      esqueleto: [{ idea: "El mito" }],
    })
    expect([...(idea?.fuentes ?? [])].sort()).toEqual([...hallazgos].sort())
    expect((await trabajosDe(id)).at(-1)).toMatchObject({ tipo: "serie", estado: "hecho" })
    expect((await repo().ideasPrevias())[0]).toBe("Los focus groups mienten poco")
  })

  test("finds an earlier idea by its vector", async () => {
    const { id } = await informeAprobado()
    const vector = aleatorio()
    const pedir = await pedirSerie((n) => [propuesta("Una idea con vector conocido", n)])
    await atenderInvestigaciones({ ...repo(), pedir, embeberIdeas: async () => [vector] })
    const [idea] = await ideasDe(id)
    expect(await repo().ideasParecidas(vector, 0.9)).toContain(idea?.id)
    expect(await repo().ideasParecidas(aleatorio(), 0.9)).not.toContain(idea?.id)
  })

  test("another idea replaces a proposal: the old one is reemplazada, the new one takes its place", async () => {
    const { id } = await informeAprobado()
    const serie = await pedirSerie((n) => [propuesta("La que no gustó", n), propuesta("La hermana", n)])
    await atenderInvestigaciones({ ...repo(), pedir: serie })
    const [vieja] = await ideasDe(id)
    if (!vieja) throw new Error("se esperaba una idea")
    const pedida = await dueno.db.rpc("pedir_otra_idea", { p_idea: vieja.id })
    if (pedida.error) throw pedida.error
    expect(await repo().ideaAReemplazar(vieja.id)).toEqual({
      gancho: "La que no gustó",
      resumen: "Resumen de La que no gustó",
      formato: "texto",
      hermanas: ["La hermana"],
    })
    const otra = await pedirSerie((n) => [propuesta("La de reemplazo", n)])
    await atenderInvestigaciones({ ...repo(), pedir: otra })
    expect(vi.mocked(otra).mock.calls[0]?.[0]).toMatchObject({ paso: "otra_idea", marcaId: null })
    const ideas = await ideasDe(id)
    expect(ideas.map((i) => [i.gancho, i.estado])).toEqual(
      expect.arrayContaining([
        ["La que no gustó", "reemplazada"],
        ["La hermana", "propuesta"],
        ["La de reemplazo", "propuesta"],
      ]),
    )
    expect(ideas.find((i) => i.gancho === "La de reemplazo")).toMatchObject({
      reemplaza_a: vieja.id,
      orden: vieja.orden,
    })
    expect((await trabajosDe(id)).at(-1)).toMatchObject({ tipo: "otra_idea", estado: "hecho" })
  })

  test("a series with nothing usable closes the job as failed with its reason and leaves the report approved", async () => {
    const { id } = await informeAprobado()
    const pedir = await pedirSerie((n) => [{ ...propuesta("Sin fuentes", n), fuentes: [] }])
    await atenderInvestigaciones({ ...repo(), pedir })
    expect((await trabajosDe(id)).at(-1)).toMatchObject({
      tipo: "serie",
      estado: "fallo",
      motivo: "Claude no propuso ideas que pueda usar con este informe. Pide la serie de nuevo.",
    })
    const { data } = await admin().from("investigaciones").select("estado").eq("id", id).single()
    expect(data?.estado).toBe("aprobada")
    expect(await ideasDe(id)).toEqual([])
  })
})

// Writing ---------------------------------------------------------------------------------------------------------

const LAMINAS = [
  { tipo: "portada", titulo: "Los focus groups no mienten", bajada: "Tres mitos y lo que dicen los datos." },
  { tipo: "punto", numero: "01", titulo: "Un grupo chico también sirve", cuerpo: "Lo dice el estudio de Medio." },
  { tipo: "cierre", titulo: "Conversemos", cuerpo: "Te contamos cómo lo hacemos.", enlace: "wearevision.cl" },
]
const ESQUELETO_DE_CARRUSEL = [
  { tipo: "portada", idea: "El mito" },
  { tipo: "punto", idea: "El dato" },
  { tipo: "cierre", idea: "La invitación" },
]
const DIA_MS = 86_400_000

/** Assignments are leased globally: every other open one leaves the queue. Local test database only. */
async function cerrarAsignacionesAbiertas(): Promise<void> {
  const { error } = await admin()
    .from("asignaciones")
    .update({ estado: "descartada" })
    .in("estado", ["por_escribir", "escribiendo"])
  if (error) throw error
}

let minuto = 0

/** A weekday (judged in UTC, a working day in Santiago too at 15:MM UTC) about `dias` ahead, each call its own minute. */
function habil(dias: number): number {
  const d = new Date(Date.now() + dias * DIA_MS)
  d.setUTCHours(15, minuto++, 0, 0)
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1)
  return d.getTime()
}

/** An approved idea of this test's account, with its one assignment on `fecha`. */
async function asignada(formato: "texto" | "carrusel_pdf", fecha: number) {
  await cerrarAsignacionesAbiertas()
  const { id, hallazgos } = await informeAprobado()
  await cerrarTrabajosAbiertos()
  const [ideaId] = await repo().guardarSerie(id, [
    {
      gancho: `Idea de ${formato}`,
      resumen: "Lo que dicen los datos.",
      formato,
      esqueleto: formato === "texto" ? [{ idea: "El mito" }, { idea: "El dato" }] : ESQUELETO_DE_CARRUSEL,
      fuentes: [hallazgos[1] ?? "", hallazgos[0] ?? ""],
      cuenta,
      razon: "Habla de investigación.",
      pilar,
      vector: aleatorio(),
    },
  ])
  const { data, error } = await dueno.db.rpc("aprobar_idea", {
    p_idea: ideaId ?? "",
    p_asignaciones: [{ cuenta, planeada_para: new Date(fecha).toISOString() }],
  })
  if (error) throw error
  return { idea: ideaId ?? "", asignacion: (data as string[])[0] ?? "", hallazgos }
}

async function asignacion(id: string) {
  const { data, error } = await admin().from("asignaciones").select("*").eq("id", id).single()
  if (error) throw error
  return data
}

const json = (datos: unknown) => ({ texto: JSON.stringify(datos), detenido: "end_turn" as const, bloques: [] })

function pedirEscritura(): Pedir {
  return vi.fn<Pedir>(async (paso) => {
    if (paso.paso === "escribir") return json({ texto: "Un post con fuente: Medio.", nota: "" })
    if (paso.paso === "revisar") return json({ voz: { ok: true, comentario: "" }, hallazgos: [] })
    return json({
      texto: "Abre el carrusel. Fuente: Medio.",
      titulo: "Tres mitos",
      tema: "oscura",
      antetitulo: "WR3 Research",
      laminas: LAMINAS,
    })
  })
}

const escritura = () => repositorioDeEscritura(admin())

describe("repositorioDeEscritura", () => {
  test("leases a due assignment with its idea, its skeleton, its pillar and its findings", async () => {
    const fecha = habil(10)
    const { asignacion: id, hallazgos } = await asignada("carrusel_pdf", fecha)
    const [tomada, ...resto] = await escritura().tomarAsignaciones(fecha, 3)
    expect(resto).toEqual([])
    expect(tomada).toEqual({
      id,
      cuentaId: cuenta,
      formato: "carrusel_pdf",
      planeadaPara: fecha,
      idea: {
        gancho: "Idea de carrusel_pdf",
        resumen: "Lo que dicen los datos.",
        esqueleto: ESQUELETO_DE_CARRUSEL,
        pilar: "Oficio",
      },
      hallazgos: expect.arrayContaining([
        expect.objectContaining({ id: hallazgos[1], resumen: "Segundo hallazgo", angulo: "Mitos" }),
        expect.objectContaining({ id: hallazgos[0], resumen: "Primer hallazgo" }),
      ]),
    })
    expect(tomada?.hallazgos).toHaveLength(2)
    expect(await asignacion(id)).toMatchObject({ estado: "escribiendo", intentos: 1 })
  })

  test("builds the account's writing context from its brand's line", async () => {
    const c = await escritura().contextoDeCuenta(cuenta)
    expect(c).toMatchObject({
      marca: { id: marca, voz: "nosotros" },
      cuenta: { tipo: "empresa" },
      linea: { version: 1, pilares: [expect.objectContaining({ nombre: "Oficio" })] },
    })
  })

  test("writes a due text post: the piece on its date, Claude's version and review, the findings used", async () => {
    const fecha = habil(10)
    const { asignacion: id, hallazgos } = await asignada("texto", fecha)
    const pedir = pedirEscritura()
    expect(await escribirPiezas({ ...escritura(), pedir }, fecha - DIA_MS)).toEqual({ escritas: 1, fallidas: 0 })
    const a = await asignacion(id)
    expect(a).toMatchObject({ estado: "escrita", arrendado_hasta: null })
    const { data: pieza } = await admin()
      .from("piezas")
      .select("estado, planeada_para, pilar_id, versiones(id, texto, origen, linea_version)")
      .eq("id", a.pieza_id ?? "")
      .single()
    expect(pieza).toMatchObject({
      estado: "por_aprobar",
      pilar_id: pilar,
      versiones: [{ texto: "Un post con fuente: Medio.", origen: "claude", linea_version: 1 }],
    })
    expect(Date.parse(pieza?.planeada_para ?? "")).toBe(fecha)
    const { data: revision } = await admin()
      .from("revisiones_ia")
      .select("version_id")
      .eq("version_id", pieza?.versiones[0]?.id ?? "")
    expect(revision).toHaveLength(1)
    const { data: usados } = await admin().from("hallazgos").select("estado").in("id", hallazgos)
    expect(usados?.map((h) => h.estado)).toEqual(["usado", "usado"])
    expect(vi.mocked(pedir).mock.calls.map(([paso]) => [paso.clave, paso.marcaId])).toEqual([
      [`escribir:asignacion:${id}`, marca],
      [`revisar:${pieza?.versiones[0]?.id}:auto`, marca],
    ])
  })

  test("queues a due carousel as a design request on the assignment's date, which keeps the slot unleased", async () => {
    const fecha = habil(10)
    const { asignacion: id } = await asignada("carrusel_pdf", fecha)
    await escribirPiezas({ ...escritura(), pedir: pedirEscritura() }, fecha - DIA_MS)
    const a = await asignacion(id)
    expect(a).toMatchObject({ estado: "escribiendo", arrendado_hasta: null })
    const { data: pedido } = await admin()
      .from("pedidos_de_diseno")
      .select("*")
      .eq("id", a.pedido_de_diseno_id ?? "")
      .single()
    expect(pedido).toMatchObject({
      asignacion_id: id,
      cuenta_id: cuenta,
      tema: "oscura",
      titulo: "Tres mitos",
      texto: "Abre el carrusel. Fuente: Medio.",
      origen: "claude",
      linea_version: 1,
      estado: "pendiente",
      diseno: { antetitulo: "WR3 Research", laminas: LAMINAS },
    })
    expect(Date.parse(pedido?.planeada_para ?? "")).toBe(fecha)
    await admin()
      .from("pedidos_de_diseno")
      .update({ estado: "fallo", motivo: "Cerrado en la prueba." })
      .eq("id", pedido?.id ?? "")
  })

  test("a refusal closes the assignment with its reason", async () => {
    const fecha = habil(10)
    const { asignacion: id } = await asignada("texto", fecha)
    const pedir = vi.fn<Pedir>(async () => ({ texto: "", detenido: "refusal", bloques: [] }))
    await escribirPiezas({ ...escritura(), pedir }, fecha - DIA_MS)
    expect(await asignacion(id)).toMatchObject({
      estado: "fallo",
      motivo: "Claude no quiso escribir esto. Cambia el encargo o escríbelo a mano.",
    })
  })

  test("a note leaves the assignment leased, so its lease expires and the next run takes it again", async () => {
    const fecha = habil(10)
    const { asignacion: id } = await asignada("texto", fecha)
    await escritura().tomarAsignaciones(fecha, 3)
    await escritura().anotarAsignacion(id, "No pude escribir esta pieza. Se vuelve a intentar en la próxima hora.")
    expect(await asignacion(id)).toMatchObject({
      estado: "escribiendo",
      motivo: "No pude escribir esta pieza. Se vuelve a intentar en la próxima hora.",
    })
  })
})
