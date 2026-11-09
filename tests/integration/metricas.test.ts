import { beforeAll, describe, expect, test } from "vitest"
import type { Db } from "@/lib/supabase/database"
import { admin, cuentaDe, marcaConDueno, personaConSesion, publicadaConUrn, publicadaEl } from "./entorno"

type Persona = { db: Db; userId: string }
let dueno: Persona
let ajeno: Persona
let cuenta: string
let pieza: string
const URN_DE_POSTIA = `urn:li:share:${Date.now()}1`
const URN_ANTERIOR = `urn:li:ugcPost:${Date.now()}2`

function datos(interacciones = 18) {
  return {
    desde: "2025-11-10",
    hasta: "2026-11-09",
    seguidores_total: 3448,
    publicaciones: [
      { post_urn: URN_DE_POSTIA, publicada_el: "2025-11-16", interacciones, impresiones: 962 },
      { post_urn: URN_ANTERIOR, publicada_el: "2025-11-18", interacciones: null, impresiones: 337 },
    ],
    dias: [{ dia: "2025-11-16", impresiones: 962, interacciones: 18, seguidores_nuevos: 4 }],
    publico: [
      { tipo: "publico", categoria: "Empresa", valor: "CCU", porcentaje: null, menor_a_uno: true },
      { tipo: "contenido", categoria: "Cargo", valor: "Gerente", porcentaje: 3, menor_a_uno: false },
    ],
  }
}

beforeAll(async () => {
  dueno = await personaConSesion("metricas")
  ajeno = await personaConSesion("metricas-ajeno")
  cuenta = await cuentaDe(await marcaConDueno(dueno.userId))
  pieza = await publicadaConUrn(dueno.db, cuenta, URN_DE_POSTIA)
})

describe("importar_metricas", () => {
  test("stores each post's figures, matched to the PostIA piece by URN, and counts the rest as earlier posts", async () => {
    const { data, error } = await dueno.db.rpc("importar_metricas", { p_cuenta: cuenta, p_datos: datos() })
    expect(error).toBeNull()
    expect(data).toEqual({ publicaciones: 2, de_postia: 1, anteriores: 1, dias: 1, publico: 2 })
    const { data: filas } = await dueno.db
      .from("metricas_de_publicacion")
      .select("post_urn, pieza_id, interacciones, impresiones, origen")
      .eq("cuenta_id", cuenta)
      .order("post_urn")
    expect(filas).toEqual(
      expect.arrayContaining([
        { post_urn: URN_DE_POSTIA, pieza_id: pieza, interacciones: 18, impresiones: 962, origen: "importacion" },
        { post_urn: URN_ANTERIOR, pieza_id: null, interacciones: null, impresiones: 337, origen: "importacion" },
      ]),
    )
  })

  test("importing the same period again updates the figures instead of duplicating them", async () => {
    await dueno.db.rpc("importar_metricas", { p_cuenta: cuenta, p_datos: datos(18) })
    await dueno.db.rpc("importar_metricas", { p_cuenta: cuenta, p_datos: datos(25) })
    const { data: filas } = await dueno.db
      .from("metricas_de_publicacion")
      .select("interacciones")
      .eq("post_urn", URN_DE_POSTIA)
    expect(filas).toEqual([{ interacciones: 25 }])
    const { count: importaciones } = await dueno.db
      .from("importaciones_de_metricas")
      .select("id", { count: "exact", head: true })
      .eq("cuenta_id", cuenta)
    expect(importaciones).toBe(1)
    const { count: publico } = await dueno.db.from("publico_de_la_cuenta").select("id", { count: "exact", head: true })
    expect(publico).toBe(2)
  })

  test("only the brand's owner imports and reads", async () => {
    const { error } = await ajeno.db.rpc("importar_metricas", { p_cuenta: cuenta, p_datos: datos() })
    expect(error?.code).toBe("42501")
    const { data } = await ajeno.db.from("metricas_de_publicacion").select("id").eq("cuenta_id", cuenta)
    expect(data).toEqual([])
    const directo = await dueno.db
      .from("metricas_de_publicacion")
      .insert({ cuenta_id: cuenta, post_urn: "urn:li:share:1", publicada_el: "2025-11-16", origen: "importacion" })
    expect(directo.error).not.toBeNull()
  })

  test("refuses a malformed payload", async () => {
    const { error } = await dueno.db.rpc("importar_metricas", {
      p_cuenta: cuenta,
      p_datos: { ...datos(), publicaciones: [{ post_urn: "no-es-urn", publicada_el: "2025-11-16" }] },
    })
    expect(error?.message).toBe("datos_invalidos")
  })

  test("deleting the account deletes its figures", async () => {
    const otra = await cuentaDe(await marcaConDueno(dueno.userId))
    await dueno.db.rpc("importar_metricas", { p_cuenta: otra, p_datos: { ...datos(), publicaciones: [] } })
    await admin().from("cuentas").delete().eq("id", otra)
    const { count } = await admin()
      .from("importaciones_de_metricas")
      .select("id", { count: "exact", head: true })
      .eq("cuenta_id", otra)
    expect(count).toBe(0)
  })
})

type DiaDePagina = {
  dia: string
  impresiones: number | null
  interacciones: number | null
  seguidores_nuevos: number | null
  visitas: number | null
  visitantes_unicos: number | null
}
const DIA_SIN_CONTENIDO: DiaDePagina = {
  dia: "2026-03-10",
  impresiones: null,
  interacciones: null,
  seguidores_nuevos: 3,
  visitas: 10,
  visitantes_unicos: 4,
}

function datosDePagina(
  extracto: string | null,
  publicadaElDia = "2026-03-10",
  dias: DiaDePagina[] = [DIA_SIN_CONTENIDO],
) {
  return {
    desde: "2026-03-01",
    hasta: "2026-03-31",
    seguidores_total: null,
    publicaciones: [
      {
        post_urn: `urn:li:activity:${Date.now()}`,
        publicada_el: publicadaElDia,
        interacciones: 7,
        impresiones: 100,
        extracto,
        clics: 5,
        seguidores_nuevos: 2,
      },
    ],
    dias,
    publico: [
      { tipo: "seguidores", categoria: "Área", valor: "Ventas", porcentaje: null, menor_a_uno: false, cantidad: 12 },
      { tipo: "visitantes", categoria: "Sector", valor: "Eventos", porcentaje: null, menor_a_uno: false, cantidad: 3 },
    ],
  }
}

async function cuentaNueva(): Promise<string> {
  return cuentaDe(await marcaConDueno(dueno.userId))
}

async function piezaDeLaFila(c: string): Promise<string | null | undefined> {
  const { data } = await dueno.db.from("metricas_de_publicacion").select("pieza_id").eq("cuenta_id", c).single()
  return data?.pieza_id
}

describe("importar_metricas: the WAV page", () => {
  test("stores activity URNs with clicks, new followers, extract, visits and audience counts", async () => {
    const c = await cuentaNueva()
    const { data, error } = await dueno.db.rpc("importar_metricas", { p_cuenta: c, p_datos: datosDePagina("Hola") })
    expect(error).toBeNull()
    expect(data).toEqual({ publicaciones: 1, de_postia: 0, anteriores: 1, dias: 1, publico: 2 })
    const { data: fila } = await dueno.db
      .from("metricas_de_publicacion")
      .select("post_urn, extracto, clics, seguidores_nuevos")
      .eq("cuenta_id", c)
      .single()
    expect(fila).toMatchObject({ extracto: "Hola", clics: 5, seguidores_nuevos: 2 })
    expect(fila?.post_urn).toMatch(/^urn:li:activity:\d+$/)
    const { data: dia } = await dueno.db
      .from("metricas_diarias")
      .select("visitas, visitantes_unicos, seguidores_nuevos, impresiones")
      .eq("cuenta_id", c)
      .single()
    expect(dia).toEqual({ visitas: 10, visitantes_unicos: 4, seguidores_nuevos: 3, impresiones: null })
    const { data: publico } = await dueno.db
      .from("publico_de_la_cuenta")
      .select("tipo, valor, cantidad, porcentaje")
      .order("tipo")
    expect(publico).toEqual(
      expect.arrayContaining([
        { tipo: "seguidores", valor: "Ventas", cantidad: 12, porcentaje: null },
        { tipo: "visitantes", valor: "Eventos", cantidad: 3, porcentaje: null },
      ]),
    )
  })

  test("matches a page post to the piece published that day in Chile whose text starts with the extract", async () => {
    const c = await cuentaNueva()
    // 02:00 UTC on the 11th is still the 10th in Chile (UTC-3 in March).
    const pieza = await publicadaEl(dueno.db, c, "Lanzamos   WR3 hoy\ncon todo el equipo", "2026-03-11T02:00:00Z")
    const { data } = await dueno.db.rpc("importar_metricas", {
      p_cuenta: c,
      p_datos: datosDePagina("lanzamos wr3 hoy con…"),
    })
    expect(data).toMatchObject({ de_postia: 1, anteriores: 0 })
    expect(await piezaDeLaFila(c)).toBe(pieza)
  })

  test("a three-dot ellipsis closes the extract too, and another day does not match", async () => {
    const c = await cuentaNueva()
    await publicadaEl(dueno.db, c, "Lanzamos WR3 hoy", "2026-03-10T15:00:00Z")
    const otroDia = await dueno.db.rpc("importar_metricas", {
      p_cuenta: c,
      p_datos: datosDePagina("Lanzamos WR3...", "2026-03-12"),
    })
    expect(otroDia.data).toMatchObject({ de_postia: 0 })
    const mismoDia = await dueno.db.rpc("importar_metricas", { p_cuenta: c, p_datos: datosDePagina("Lanzamos WR3...") })
    expect(mismoDia.data).toMatchObject({ de_postia: 1 })
  })

  test("two pieces that fit the same day and extract are ambiguous, so none is chosen", async () => {
    const c = await cuentaNueva()
    await publicadaEl(dueno.db, c, "Lanzamos WR3 hoy", "2026-03-10T15:00:00Z")
    await publicadaEl(dueno.db, c, "Lanzamos WR3 mañana", "2026-03-10T18:00:00Z")
    const { data } = await dueno.db.rpc("importar_metricas", { p_cuenta: c, p_datos: datosDePagina("Lanzamos WR3") })
    expect(data).toMatchObject({ de_postia: 0, anteriores: 1 })
    expect(await piezaDeLaFila(c)).toBeNull()
  })

  test("never matches a piece of another account", async () => {
    const c = await cuentaNueva()
    const otra = await cuentaNueva()
    await publicadaEl(dueno.db, otra, "Lanzamos WR3 hoy", "2026-03-10T15:00:00Z")
    const { data } = await dueno.db.rpc("importar_metricas", { p_cuenta: c, p_datos: datosDePagina("Lanzamos WR3") })
    expect(data).toMatchObject({ de_postia: 0 })
  })

  test("a piece closed by hand matches the day it was marked as published", async () => {
    const c = await cuentaNueva()
    const pieza = await publicadaEl(dueno.db, c, "Texto a mano", "2026-03-10T15:00:00Z")
    await admin().from("publicaciones").delete().eq("pieza_id", pieza)
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" })
    const { data } = await dueno.db.rpc("importar_metricas", {
      p_cuenta: c,
      p_datos: datosDePagina("Texto a mano", hoy),
    })
    expect(data).toMatchObject({ de_postia: 1 })
  })

  test("a day without content figures keeps the impressions and interactions already stored", async () => {
    const c = await cuentaNueva()
    const conContenido = datosDePagina("x", "2026-03-10", [
      { ...DIA_SIN_CONTENIDO, impresiones: 50, interacciones: 5, seguidores_nuevos: null, visitas: null },
    ])
    await dueno.db.rpc("importar_metricas", { p_cuenta: c, p_datos: conContenido })
    await dueno.db.rpc("importar_metricas", { p_cuenta: c, p_datos: { ...datosDePagina("x"), hasta: "2026-04-30" } })
    const { data } = await dueno.db
      .from("metricas_diarias")
      .select("impresiones, interacciones, seguidores_nuevos, visitas")
      .eq("cuenta_id", c)
      .single()
    expect(data).toEqual({ impresiones: 50, interacciones: 5, seguidores_nuevos: 3, visitas: 10 })
  })
})
