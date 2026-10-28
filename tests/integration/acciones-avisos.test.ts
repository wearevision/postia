import { describe, expect, test, vi } from "vitest"
import { enviarAvisoDePrueba, guardarSuscripcion } from "@/lib/avisos/acciones"
import type { ServicioPush } from "@/lib/avisos/push"
import { marcaConDueno, personaConSesion } from "./entorno"

const aparato = (n: string) => ({
  endpoint: `https://push.prueba.test/${n}`,
  p256dh: "k",
  auth: "a",
  userAgent: "iPhone",
})

describe("notice actions", () => {
  test("rejects a non-https endpoint before touching the database", async () => {
    const { db, userId } = await personaConSesion("av-http")
    await marcaConDueno(userId)
    expect(await guardarSuscripcion(db, { ...aparato("x"), endpoint: "http://x.test" })).toEqual({
      ok: false,
      error: "Ese aparato no se puede suscribir.",
    })
  })

  test("sends the test notice to every own device and forgets the expired ones", async () => {
    const { db, userId } = await personaConSesion("av-envio")
    await marcaConDueno(userId)
    const vivo = `vivo${Date.now()}`
    const muerto = `muerto${Date.now()}`
    await guardarSuscripcion(db, aparato(vivo))
    await guardarSuscripcion(db, aparato(muerto))
    const servicio: ServicioPush = {
      enviar: vi.fn(async (s) =>
        s.endpoint.endsWith(muerto) ? { estado: "caducada" as const } : { estado: "enviado" as const },
      ),
    }
    expect(await enviarAvisoDePrueba(db, servicio)).toEqual({ enviados: 1, caducadas: 1, fallos: 0 })
    const { data } = await db.from("suscripciones_push").select("endpoint")
    expect(data?.map((f) => f.endpoint)).toEqual([`https://push.prueba.test/${vivo}`])
  })
})
