import { describe, expect, test } from "vitest"
import { admin, marcaConDueno, personaConSesion } from "./entorno"

describe("brands and memberships", () => {
  test("a member sees only the brands they belong to", async () => {
    const ana = await personaConSesion("ana")
    const otra = await personaConSesion("otra")
    const suya = await marcaConDueno(ana.userId)
    await marcaConDueno(otra.userId)

    const { data, error } = await ana.db.from("marcas").select("id")
    expect(error).toBeNull()
    expect(data?.map((m) => m.id)).toEqual([suya])
  })

  test("a signed-in person without membership sees no brand and has no access", async () => {
    const nadie = await personaConSesion("nadie")
    const { data } = await nadie.db.from("marcas").select("id")
    expect(data).toEqual([])
    const { data: acceso } = await nadie.db.rpc("tiene_acceso")
    expect(acceso).toBe(false)
  })

  test("an owner creates a brand and becomes its owner; someone who owns nothing cannot", async () => {
    const dueno = await personaConSesion("dueno")
    await marcaConDueno(dueno.userId)
    const { data: id, error } = await dueno.db.rpc("crear_marca", {
      p_nombre: `Nueva ${Date.now()}`,
      p_voz: "nosotros",
    })
    expect(error).toBeNull()
    const { data: miembro } = await admin()
      .from("miembros")
      .select("rol")
      .eq("marca_id", id as string)
      .single()
    expect(miembro?.rol).toBe("dueno")

    const extrano = await personaConSesion("extrano")
    const { error: rechazo } = await extrano.db.rpc("crear_marca", { p_nombre: "No", p_voz: "yo" })
    expect(rechazo?.code).toBe("42501")
  })

  test("nobody signed in reads anything", async () => {
    const { createClient } = await import("@supabase/supabase-js")
    const { entornoLocal } = await import("./entorno")
    const anonimo = createClient(entornoLocal().url, entornoLocal().anon)
    const { data, error } = await anonimo.from("marcas").select("id")
    expect(data ?? []).toEqual([])
    expect(error === null || error.code === "42501").toBe(true)
  })
})
