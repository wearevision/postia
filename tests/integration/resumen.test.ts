import { describe, expect, test } from "vitest"
import { enviarResumenes } from "@/lib/avisos/enviar-resumen"
import type { ServicioPush, SuscripcionPush } from "@/lib/avisos/push"
import { anotarAviso } from "@/lib/avisos/repositorio-de-avisos"
import type { MensajePush } from "@/lib/avisos/tipos"
import { admin, cuentaDe, marcaConDueno, personaConSesion, piezaDe } from "./entorno"

function servicio() {
  const enviados: { suscripcion: SuscripcionPush; mensaje: MensajePush; urgente: boolean }[] = []
  const falso: ServicioPush = {
    async enviar(suscripcion, mensaje, { urgente }) {
      enviados.push({ suscripcion, mensaje, urgente })
      return { estado: "enviado" }
    },
  }
  return { falso, enviados, de: (endpoint: string) => enviados.filter((e) => e.suscripcion.endpoint === endpoint) }
}

async function aparato(userId: string) {
  const endpoint = `https://push.prueba.test/resumen-${crypto.randomUUID()}`
  const { error } = await admin()
    .from("suscripciones_push")
    .insert({ user_id: userId, endpoint, p256dh: "k", auth: "a" })
  if (error) throw error
  return endpoint
}

async function cuentaConRitmo(marca: string, ritmo: number) {
  const cuenta = await cuentaDe(marca)
  const { error } = await admin().from("cuentas").update({ ritmo_semanal: ritmo }).eq("id", cuenta)
  if (error) throw error
  return cuenta
}

const lineaSinEnviar = async (marca: string) =>
  (await admin().from("avisos_pendientes").select("enviado_en").eq("marca_id", marca)).data?.map((l) => l.enviado_en)

describe("enviarResumenes", () => {
  test("a person with two brands gets one push with both, and the queued lines are marked sent", async () => {
    const { db, userId } = await personaConSesion("resumen")
    const marcaA = await marcaConDueno(userId)
    const marcaB = await marcaConDueno(userId)
    for (const marca of [marcaA, marcaB]) {
      await piezaDe(db, await cuentaConRitmo(marca, 3))
      await anotarAviso(admin(), marca, { titulo: "Cuenta", cuerpo: `Línea de ${marca}`, url: "/piezas/x" })
    }
    const endpoint = await aparato(userId)
    const { falso, de } = servicio()

    await enviarResumenes(admin(), falso, Date.now())

    expect(de(endpoint)).toHaveLength(1)
    const [push] = de(endpoint)
    expect(push?.urgente).toBe(false)
    expect(push?.mensaje.cuerpo.startsWith("2 piezas esperan tu firma.")).toBe(true)
    expect(push?.mensaje.cuerpo).toContain(`Línea de ${marcaA}`)
    expect(push?.mensaje.cuerpo).toContain(`Línea de ${marcaB}`)
    expect((await lineaSinEnviar(marcaA))?.every((e) => e !== null)).toBe(true)
    expect((await lineaSinEnviar(marcaB))?.every((e) => e !== null)).toBe(true)
  })

  test("a second run still counts what waits but never repeats a queued line", async () => {
    const { db, userId } = await personaConSesion("resumen-dos")
    const marca = await marcaConDueno(userId)
    await piezaDe(db, await cuentaConRitmo(marca, 3))
    await anotarAviso(admin(), marca, { titulo: "Cuenta", cuerpo: "Línea única de la cola", url: "/piezas/x" })
    const endpoint = await aparato(userId)
    const { falso, de } = servicio()

    await enviarResumenes(admin(), falso, Date.now())
    await enviarResumenes(admin(), falso, Date.now())

    const [primero, segundo] = de(endpoint)
    expect(primero?.mensaje.cuerpo).toContain("Línea única de la cola")
    expect(segundo?.mensaje.cuerpo.startsWith("1 pieza espera tu firma.")).toBe(true)
    expect(segundo?.mensaje.cuerpo).not.toContain("Línea única de la cola")
  })

  test("a person with nothing pending and no weekly rhythm gets nothing", async () => {
    const { userId } = await personaConSesion("resumen-vacio")
    const marca = await marcaConDueno(userId)
    await cuentaConRitmo(marca, 0)
    const endpoint = await aparato(userId)
    const { falso, de } = servicio()

    await enviarResumenes(admin(), falso, Date.now())

    expect(de(endpoint)).toEqual([])
  })
})
