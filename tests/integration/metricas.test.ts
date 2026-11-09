import { beforeAll, describe, expect, test } from "vitest"
import type { Db } from "@/lib/supabase/database"
import { admin, cuentaDe, marcaConDueno, personaConSesion, publicadaConUrn } from "./entorno"

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
