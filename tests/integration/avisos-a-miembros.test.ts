import { afterEach, describe, expect, test, vi } from "vitest"
import { avisarMiembros } from "@/lib/avisos/a-miembros"
import type { ResultadoPush, ServicioPush, SuscripcionPush } from "@/lib/avisos/push"
import { admin, marcaConDueno, personaConSesion } from "./entorno"

const AVISO = { titulo: "No salió · Cuenta", cuerpo: "Revisa la pieza.", url: "/piezas/abc" }

async function aparato(userId: string, sufijo: string) {
  const endpoint = `https://push.prueba.test/${sufijo}-${crypto.randomUUID()}`
  const { error } = await admin()
    .from("suscripciones_push")
    .insert({ user_id: userId, endpoint, p256dh: "k", auth: "a" })
  if (error) throw error
  return endpoint
}

function servicio(resultados: Record<string, ResultadoPush>) {
  const enviados: { suscripcion: SuscripcionPush; urgente: boolean }[] = []
  const falso: ServicioPush = {
    async enviar(suscripcion, _mensaje, { urgente }) {
      enviados.push({ suscripcion, urgente })
      return resultados[suscripcion.endpoint] ?? { estado: "enviado" }
    },
  }
  return { falso, enviados }
}

afterEach(() => vi.restoreAllMocks())

describe("avisarMiembros", () => {
  test("notifies every device of every member of the brand and nobody else", async () => {
    const dueno = await personaConSesion("aviso")
    const marca = await marcaConDueno(dueno.userId)
    const otro = await personaConSesion("ajeno")
    await marcaConDueno(otro.userId)
    const mio = await aparato(dueno.userId, "mio")
    const ajeno = await aparato(otro.userId, "ajeno")
    const { falso, enviados } = servicio({})

    await avisarMiembros(admin(), falso, marca, AVISO)

    expect(enviados.map((e) => e.suscripcion.endpoint)).toEqual([mio])
    expect(enviados[0]?.urgente).toBe(true)
    expect(enviados.map((e) => e.suscripcion.endpoint)).not.toContain(ajeno)
  })

  test("forgets an expired device and keeps the others", async () => {
    const dueno = await personaConSesion("caduca")
    const marca = await marcaConDueno(dueno.userId)
    const viejo = await aparato(dueno.userId, "viejo")
    const vigente = await aparato(dueno.userId, "vigente")
    const { falso } = servicio({ [viejo]: { estado: "caducada" } })

    await avisarMiembros(admin(), falso, marca, AVISO)

    const { data } = await admin().from("suscripciones_push").select("endpoint").eq("user_id", dueno.userId)
    expect(data?.map((d) => d.endpoint)).toEqual([vigente])
  })

  test("logs a failure without throwing and without printing the endpoint", async () => {
    const dueno = await personaConSesion("fallo")
    const marca = await marcaConDueno(dueno.userId)
    const endpoint = await aparato(dueno.userId, "fallo")
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})
    const { falso } = servicio({ [endpoint]: { estado: "fallo", detalle: "El servicio de push respondió HTTP 500." } })

    await expect(avisarMiembros(admin(), falso, marca, AVISO)).resolves.toBeUndefined()

    expect(registro).toHaveBeenCalledWith(expect.stringContaining("HTTP 500"))
    expect(JSON.stringify(registro.mock.calls)).not.toContain(endpoint)
    const { count } = await admin()
      .from("suscripciones_push")
      .select("*", { count: "exact", head: true })
      .eq("endpoint", endpoint)
    expect(count).toBe(1)
  })

  test("a send that throws does not stop the other devices and is logged without the endpoint", async () => {
    const dueno = await personaConSesion("lanza")
    const marca = await marcaConDueno(dueno.userId)
    const roto = await aparato(dueno.userId, "roto")
    const sano = await aparato(dueno.userId, "sano")
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})
    const enviados: string[] = []
    const falso: ServicioPush = {
      async enviar(suscripcion) {
        enviados.push(suscripcion.endpoint)
        if (suscripcion.endpoint === roto) throw new Error("mensaje demasiado grande")
        return { estado: "enviado" }
      },
    }

    await expect(avisarMiembros(admin(), falso, marca, AVISO)).resolves.toBeUndefined()

    expect(enviados.sort()).toEqual([roto, sano].sort())
    expect(registro).toHaveBeenCalledWith(expect.stringContaining("mensaje demasiado grande"))
    expect(JSON.stringify(registro.mock.calls)).not.toContain(roto)
  })

  test("does nothing for a brand with no devices", async () => {
    const dueno = await personaConSesion("vacia")
    const marca = await marcaConDueno(dueno.userId)
    const { falso, enviados } = servicio({})
    await avisarMiembros(admin(), falso, marca, AVISO)
    expect(enviados).toEqual([])
  })
})
