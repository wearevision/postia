import { createClient } from "@supabase/supabase-js"
import { describe, expect, test } from "vitest"
import { leerSesion } from "@/lib/sesion/sesion"
import type { Database } from "@/lib/supabase/database.types"
import { entornoLocal, marcaConDueno, personaConSesion } from "./entorno"

describe("leerSesion", () => {
  test("is anonymous without a session", async () => {
    const db = createClient<Database>(entornoLocal().url, entornoLocal().anon, { auth: { persistSession: false } })
    expect(await leerSesion(db)).toEqual({ estado: "anonima" })
  })

  test("has no access when the person belongs to no brand", async () => {
    const { db, userId } = await personaConSesion("sin-marca")
    expect(await leerSesion(db)).toEqual({ estado: "sin_acceso", userId })
  })

  test("lists the brands of a member", async () => {
    const { db, userId } = await personaConSesion("miembro")
    const marca = await marcaConDueno(userId)
    const sesion = await leerSesion(db)
    expect(sesion.estado).toBe("miembro")
    if (sesion.estado === "miembro") expect(sesion.marcas.map((m) => m.id)).toEqual([marca])
  })
})
