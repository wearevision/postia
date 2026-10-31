import { randomUUID } from "node:crypto"
import { beforeEach, describe, expect, test } from "vitest"
import { repositorioDelMapa } from "@/lib/mapa/repositorio"
import { admin, limpiarMapa, vectorDe } from "./entorno"

const UMBRALES = { repetido: 0.95, tema: 0.8 }

function nuevo(vector: number[], enlace = `https://www.medio.cl/${randomUUID()}?utm_source=x`) {
  return { resumen: "Algo que pasó", enlace, medio: "Medio", vector, cita: null, publicadoEn: "2026-10-20" }
}

beforeEach(limpiarMapa)

describe("repositorioDelMapa", () => {
  test("saves a finding with its normalized link and reports a repeat of the same link", async () => {
    const mapa = repositorioDelMapa(admin())
    const enlace = `https://www.medio.cl/${randomUUID()}`
    const primero = await mapa.guardarHallazgo(nuevo(vectorDe(0), `${enlace}?utm_source=a`), UMBRALES)
    expect(primero).toMatchObject({ estado: "guardado", tema: null })
    const { data } = await admin().from("hallazgos").select("enlace_normalizado, publicado_en").single()
    expect(data).toEqual({ enlace_normalizado: enlace.replace("https://www.", ""), publicado_en: "2026-10-20" })
    const segundo = await mapa.guardarHallazgo(nuevo(vectorDe(300), `${enlace}?utm_source=b`), UMBRALES)
    expect(segundo).toEqual({ estado: "repetido", de: primero.estado === "guardado" ? primero.id : "" })
  })

  test("saves the research and the angle a finding came from", async () => {
    const { data: investigacion, error } = await admin().rpc("crear_vigilancia", {
      p_dia: "2030-03-01",
      p_temas: ["Eventos"],
    })
    if (error) throw error
    try {
      const r = await repositorioDelMapa(admin()).guardarHallazgo(
        { ...nuevo(vectorDe(0)), investigacionId: investigacion, angulo: "Mitos" },
        UMBRALES,
      )
      expect(r).toMatchObject({ estado: "guardado" })
      const { data } = await admin().from("hallazgos").select("investigacion_id, angulo").single()
      expect(data).toEqual({ investigacion_id: investigacion, angulo: "Mitos" })
    } finally {
      await admin().from("investigaciones").delete().eq("id", investigacion)
    }
  })

  test("lists loose findings with parsed vectors, creates a topic and finds it as a neighbour", async () => {
    const mapa = repositorioDelMapa(admin())
    // Pairwise 0.93 / 0.93 / 0.86: under the 0.95 repeat threshold.
    for (const v of [
      vectorDe(0),
      vectorDe(0, { hacia: 1, similitud: 0.93 }),
      vectorDe(0, { hacia: 2, similitud: 0.93 }),
    ]) {
      await mapa.guardarHallazgo(nuevo(v), UMBRALES)
    }
    const sueltos = await mapa.pendientes()
    expect(sueltos).toHaveLength(3)
    expect(sueltos[0].vector).toHaveLength(1024)
    const id = await mapa.crearTema(
      { nombre: "Eventos", descripcion: "d" },
      sueltos.map((s) => s.id),
      3,
    )
    const cercanos = await mapa.cercanos(vectorDe(0), 5)
    expect(cercanos).toEqual([{ id, nombre: "Eventos", descripcion: "d", similitud: expect.any(Number) }])
    expect(cercanos[0].similitud).toBeGreaterThan(0.95)
    expect(await mapa.pendientes()).toEqual([])
  })

  test("re-places, pairs and merges through the RPCs", async () => {
    const mapa = repositorioDelMapa(admin())
    const guardado = async (v: number[]) => {
      const r = await mapa.guardarHallazgo(nuevo(v), { repetido: 0.999, tema: 0.8 })
      if (r.estado !== "guardado") throw new Error("repetido")
      return r.id
    }
    // Saved before any topic exists, so B's finding does not join A on its own.
    const enA = [await guardado(vectorDe(0)), await guardado(vectorDe(0, { hacia: 9, similitud: 0.99 }))]
    const enB = [await guardado(vectorDe(0, { hacia: 1, similitud: 0.97 }))]
    const a = await mapa.crearTema({ nombre: "A", descripcion: "" }, enA, 1)
    const b = await mapa.crearTema({ nombre: "B", descripcion: "" }, enB, 1)
    expect(await mapa.reubicar(0.8)).toBe(0)
    const pares = await mapa.casiIguales(0.92)
    expect(pares).toHaveLength(1)
    const [par] = pares
    expect(new Set([par.a, par.b])).toEqual(new Set([a, b]))
    expect(par.a === a ? par.hallazgos : { a: par.hallazgos.b, b: par.hallazgos.a }).toEqual({ a: 2, b: 1 })
    expect(await mapa.fusionar(b, a)).toBe(true)
    expect(await mapa.fusionar(b, a)).toBe(false)
  })
})
