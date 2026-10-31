// tests/integration/arriendos.test.ts
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { admin, cuentaDe, literal, marcaConDueno, personaConSesion, vectorDe } from "./entorno"

/**
 * Every queue leases with `for update skip locked`. These tests check the contract each worker relies on: one call
 * leases exactly its documented number, and two calls at once never get the same row. The rows are dated in 2001 so
 * they sit at the head of each global queue, ahead of whatever other files left open.
 */

let userId: string
let cuenta: string
let instante = 0

/** A distinct moment in 2001, so slot indexes never clash and these rows are always the oldest of their queue. */
const antiguo = () => new Date(Date.UTC(2001, 0, 1) + ++instante * 60_000).toISOString()

const ids = (filas: { id: string }[] | null) => (filas ?? []).map((f) => f.id)

beforeAll(async () => {
  const persona = await personaConSesion("arriendos")
  userId = persona.userId
  const marca = await marcaConDueno(userId, "nosotros")
  cuenta = await cuentaDe(marca, "empresa")
})

afterAll(async () => {
  // The account's pieces, requests and assignments go with it; its ideas suggest it, so they go first.
  const ideas = await admin().from("ideas").delete().eq("cuenta_sugerida", cuenta)
  if (ideas.error) throw ideas.error
  const cuentas = await admin().from("cuentas").delete().eq("id", cuenta)
  if (cuentas.error) throw cuentas.error
  const investigaciones = await admin().from("investigaciones").delete().eq("pedida_por", userId)
  if (investigaciones.error) throw investigaciones.error
})

async function piezasProgramadas(n: number): Promise<string[]> {
  const filas = Array.from({ length: n }, () => ({
    cuenta_id: cuenta,
    formato: "texto",
    estado: "programada",
    programada_para: antiguo(),
    creada_por: userId,
  }))
  const { data, error } = await admin().from("piezas").insert(filas).select("id")
  if (error) throw error
  return ids(data)
}

async function pedidosDeTexto(n: number): Promise<string[]> {
  const filas = Array.from({ length: n }, () => ({
    tipo: "escribir",
    cuenta_id: cuenta,
    encargo: "Un post de prueba",
    pedido_por: userId,
    creado_en: antiguo(),
  }))
  const { data, error } = await admin().from("pedidos_de_texto").insert(filas).select("id")
  if (error) throw error
  return ids(data)
}

async function pedidosDeDiseno(n: number): Promise<string[]> {
  const laminas = [{ titulo: "Uno" }, { titulo: "Dos" }, { titulo: "Tres" }]
  const filas = Array.from({ length: n }, () => ({
    cuenta_id: cuenta,
    tema: "wav",
    titulo: "Documento",
    texto: "Post",
    diseno: { laminas },
    pedido_por: userId,
    creado_en: antiguo(),
  }))
  const { data, error } = await admin().from("pedidos_de_diseno").insert(filas).select("id")
  if (error) throw error
  return ids(data)
}

async function trabajosDeInvestigacion(n: number): Promise<string[]> {
  const { data: investigacion, error } = await admin()
    .from("investigaciones")
    .insert({
      origen: "encargo",
      tema: "Arriendos",
      cantidad: 3,
      formato: "texto",
      pedida_por: userId,
      estado: "aprobada",
    })
    .select("id")
    .single()
  if (error) throw error
  // Series jobs never move their report, so leasing them touches nothing else.
  const filas = Array.from({ length: n }, () => ({
    investigacion_id: investigacion.id,
    tipo: "serie",
    creado_en: antiguo(),
  }))
  const { data, error: errorDeTrabajos } = await admin().from("trabajos_de_investigacion").insert(filas).select("id")
  if (errorDeTrabajos) throw errorDeTrabajos
  return ids(data)
}

async function asignaciones(n: number): Promise<string[]> {
  const enlace = `https://medio.cl/${randomUUID()}`
  const { data: hallazgo, error: errorDeHallazgo } = await admin()
    .from("hallazgos")
    .insert({
      resumen: "Un hallazgo de prueba",
      enlace,
      enlace_normalizado: enlace.replace(/^https:\/\//, ""),
      medio: "Medio",
      vector: literal(vectorDe(0)),
    })
    .select("id")
    .single()
  if (errorDeHallazgo) throw errorDeHallazgo
  const { data: idea, error: errorDeIdea } = await admin()
    .from("ideas")
    .insert({
      origen: "domingo",
      gancho: "Un gancho",
      resumen: "Un resumen",
      formato: "texto",
      esqueleto: [{ idea: "Uno" }],
      fuentes: [hallazgo.id],
      cuenta_sugerida: cuenta,
      razon: "Una razón",
      vector: literal(vectorDe(1)),
      estado: "aprobada",
    })
    .select("id")
    .single()
  if (errorDeIdea) throw errorDeIdea
  const filas = Array.from({ length: n }, () => ({
    idea_id: idea.id,
    cuenta_id: cuenta,
    formato: "texto",
    planeada_para: antiguo(),
  }))
  const { data, error } = await admin().from("asignaciones").insert(filas).select("id")
  if (error) throw error
  return ids(data)
}

type Tabla = "piezas" | "pedidos_de_texto" | "pedidos_de_diseno" | "trabajos_de_investigacion" | "asignaciones"

interface Cola {
  nombre: string
  tabla: Tabla
  crear: (n: number) => Promise<string[]>
  tomar: () => PromiseLike<{ data: { id: string }[] | null; error: unknown }>
  porLlamada: number
}

const colas: Cola[] = [
  {
    nombre: "tomar_para_publicar",
    tabla: "piezas",
    crear: piezasProgramadas,
    tomar: () => admin().rpc("tomar_para_publicar"),
    porLlamada: 3,
  },
  {
    nombre: "tomar_pedidos",
    tabla: "pedidos_de_texto",
    crear: pedidosDeTexto,
    tomar: () => admin().rpc("tomar_pedidos"),
    porLlamada: 1,
  },
  {
    nombre: "tomar_pedidos_de_diseno",
    tabla: "pedidos_de_diseno",
    crear: pedidosDeDiseno,
    tomar: () => admin().rpc("tomar_pedidos_de_diseno"),
    porLlamada: 1,
  },
  {
    nombre: "tomar_trabajo_de_investigacion",
    tabla: "trabajos_de_investigacion",
    crear: trabajosDeInvestigacion,
    tomar: () => admin().rpc("tomar_trabajo_de_investigacion"),
    porLlamada: 1,
  },
  {
    nombre: "tomar_asignaciones",
    tabla: "asignaciones",
    crear: asignaciones,
    tomar: () => admin().rpc("tomar_asignaciones", { p_hasta: new Date().toISOString(), p_limite: 2 }),
    porLlamada: 2,
  },
]

/** These rows leave their queue whatever the test did, so no other file leases them. */
async function borrar(tabla: Tabla, filas: string[]): Promise<void> {
  const { error } = await admin().from(tabla).delete().in("id", filas)
  if (error) throw error
}

describe.each(colas)("$nombre", ({ tabla, crear, tomar, porLlamada }) => {
  test("one call leases exactly its documented number of the three eligible rows", async () => {
    const creadas = await crear(3)
    const { data, error } = await tomar()
    expect(error).toBeNull()
    const tomadas = ids(data)
    expect(tomadas).toHaveLength(porLlamada)
    for (const id of tomadas) expect(creadas).toContain(id)
    await borrar(tabla, creadas)
  })

  test("two calls at once never lease the same row", async () => {
    const creadas = await crear(3)
    const [primera, segunda] = await Promise.all([tomar(), tomar()])
    expect(primera.error).toBeNull()
    expect(segunda.error).toBeNull()
    const unas = ids(primera.data)
    const otras = ids(segunda.data)
    // Which call wins the race is the database's choice: one may take every eligible row and leave the other empty.
    expect(unas.length + otras.length).toBeGreaterThan(0)
    expect(unas.length + otras.length).toBeLessThanOrEqual(2 * porLlamada)
    expect(unas.filter((id) => otras.includes(id))).toEqual([])
    await borrar(tabla, creadas)
  })
})
