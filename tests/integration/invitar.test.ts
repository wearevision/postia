import { describe, expect, test } from "vitest"
import { invitar } from "@/lib/equipo/invitar"
import { admin, correoUnico } from "./entorno"

describe("invitar", () => {
  test("creates the user and makes them owner of the brand, creating the brand if needed", async () => {
    const correo = correoUnico("invitada")
    const marca = `Marca ${Date.now()}`
    const { userId, marcaId } = await invitar(admin(), { correo, marca, voz: "yo" })
    const { data } = await admin().from("miembros").select("rol").eq("user_id", userId).eq("marca_id", marcaId).single()
    expect(data?.rol).toBe("dueno")
  })

  test("is idempotent: inviting twice keeps one user and one membership", async () => {
    const correo = correoUnico("dos-veces")
    const marca = `Marca ${Date.now()}`
    const primera = await invitar(admin(), { correo, marca, voz: "nosotros" })
    const segunda = await invitar(admin(), { correo: correo.toUpperCase(), marca, voz: "nosotros" })
    expect(segunda).toEqual(primera)
    const { count } = await admin()
      .from("miembros")
      .select("*", { count: "exact", head: true })
      .eq("user_id", primera.userId)
    expect(count).toBe(1)
  })
})
