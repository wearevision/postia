import { describe, expect, test } from "vitest"
import { marcaConDueno, personaConSesion } from "./entorno"

const fila = (sufijo: string) => ({ endpoint: `https://push.prueba.test/${sufijo}`, p256dh: "clave", auth: "auth" })

describe("push subscriptions", () => {
  test("a member stores and sees only their own devices", async () => {
    const ana = await personaConSesion("push-ana")
    await marcaConDueno(ana.userId)
    const otra = await personaConSesion("push-otra")
    await marcaConDueno(otra.userId)
    expect((await ana.db.from("suscripciones_push").insert(fila(`a${Date.now()}`))).error).toBeNull()
    const { data } = await otra.db.from("suscripciones_push").select("id")
    expect(data).toEqual([])
  })

  test("someone without a brand cannot subscribe, and an endpoint must be https", async () => {
    const nadie = await personaConSesion("push-nadie")
    expect((await nadie.db.from("suscripciones_push").insert(fila(`n${Date.now()}`))).error).not.toBeNull()
    const ana = await personaConSesion("push-http")
    await marcaConDueno(ana.userId)
    const { error } = await ana.db
      .from("suscripciones_push")
      .insert({ ...fila("x"), endpoint: "http://inseguro.test/x" })
    expect(error?.code).toBe("23514")
  })
})
