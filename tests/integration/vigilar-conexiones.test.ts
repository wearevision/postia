import { describe, expect, test } from "vitest"
import { vigilarConexiones } from "@/lib/avisos/conexiones"
import type { ServicioPush, SuscripcionPush } from "@/lib/avisos/push"
import type { MensajePush } from "@/lib/avisos/tipos"
import { diaEnSantiago, sumarDias } from "@/lib/piezas/calendario"
import { instanteDesdeValorLocal } from "@/lib/piezas/fechas"
import { admin, cuentaDe, marcaConDueno, personaConSesion } from "./entorno"

const DIA = 86_400_000

function servicio() {
  const enviados: { suscripcion: SuscripcionPush; mensaje: MensajePush; urgente: boolean }[] = []
  const falso: ServicioPush = {
    async enviar(suscripcion, mensaje, { urgente }) {
      enviados.push({ suscripcion, mensaje, urgente })
      return { estado: "enviado" }
    },
  }
  return { falso, de: (endpoint: string) => enviados.filter((e) => e.suscripcion.endpoint === endpoint) }
}

/** An api account of a fresh owner, linked to a connection that expires `diasRestantes` from now. */
async function conConexion(diasRestantes: number, expiraEn?: string, renovacionExpiraEn?: string) {
  const { userId } = await personaConSesion("vigilar")
  const marca = await marcaConDueno(userId)
  const cuenta = await cuentaDe(marca, renovacionExpiraEn ? "empresa" : "persona", "api")
  const endpoint = `https://push.prueba.test/vigilar-${crypto.randomUUID()}`
  const aparato = await admin().from("suscripciones_push").insert({ user_id: userId, endpoint, p256dh: "k", auth: "a" })
  if (aparato.error) throw aparato.error
  const { data: conexion, error } = await admin()
    .from("conexiones")
    .insert({
      red: "linkedin",
      titular: `urn:li:person:${crypto.randomUUID().replaceAll("-", "")}`,
      expira_en: expiraEn ?? new Date(Date.now() + diasRestantes * DIA).toISOString(),
      conectada_por: userId,
      ...(renovacionExpiraEn
        ? {
            app: "estudio_wav",
            organizacion: `urn:li:organization:${Math.floor(Math.random() * 1e9)}`,
            scopes: ["w_organization_social"],
            renovacion_expira_en: renovacionExpiraEn,
          }
        : { app: "estudio_wav_perfil", scopes: ["w_member_social"] }),
    })
    .select("id")
    .single()
  if (error) throw error
  const enlazada = await admin().from("cuentas").update({ conexion_id: conexion.id }).eq("id", cuenta)
  if (enlazada.error) throw enlazada.error
  return { userId, marca, cuenta, endpoint }
}

const lineasDe = async (marca: string) =>
  (await admin().from("avisos_pendientes").select("titulo, cuerpo, url").eq("marca_id", marca)).data ?? []

describe("vigilarConexiones", () => {
  test("an expired connection pushes urgently to the owner and queues nothing", async () => {
    const c = await conConexion(-1)
    const { falso, de } = servicio()
    await vigilarConexiones(admin(), falso, Date.now())
    expect(de(c.endpoint)).toHaveLength(1)
    expect(de(c.endpoint)[0]?.urgente).toBe(true)
    expect(de(c.endpoint)[0]?.mensaje.cuerpo).toContain("venció")
    expect(await lineasDe(c.marca)).toEqual([])
  })

  test("a connection with 14 days left queues one digest line and pushes nothing", async () => {
    // Noon in Chile, 14 calendar days from today, whatever time of day the test runs.
    const c = await conConexion(
      14,
      instanteDesdeValorLocal(`${sumarDias(diaEnSantiago(Date.now()), 14)}T12:00`) ?? undefined,
    )
    const { falso, de } = servicio()
    await vigilarConexiones(admin(), falso, Date.now())
    expect(de(c.endpoint)).toEqual([])
    const lineas = await lineasDe(c.marca)
    expect(lineas).toHaveLength(1)
    expect(lineas[0]).toMatchObject({ url: "/ajustes" })
    expect(lineas[0]?.cuerpo).toContain("vence en 14 días")
  })

  test("a page connection that renews itself says nothing at 14 days of its access token", async () => {
    const c = await conConexion(
      14,
      instanteDesdeValorLocal(`${sumarDias(diaEnSantiago(Date.now()), 14)}T12:00`) ?? undefined,
      new Date(Date.now() + 300 * DIA).toISOString(),
    )
    const { falso, de } = servicio()
    await vigilarConexiones(admin(), falso, Date.now())
    expect(de(c.endpoint)).toEqual([])
    expect(await lineasDe(c.marca)).toEqual([])
  })

  test("a page connection whose refresh token runs out in 14 days queues a line", async () => {
    const c = await conConexion(
      12,
      undefined,
      instanteDesdeValorLocal(`${sumarDias(diaEnSantiago(Date.now()), 14)}T12:00`) ?? undefined,
    )
    const { falso, de } = servicio()
    await vigilarConexiones(admin(), falso, Date.now())
    expect(de(c.endpoint)).toEqual([])
    const lineas = await lineasDe(c.marca)
    expect(lineas.map((l) => l.cuerpo)).toEqual([expect.stringContaining("deja de renovarse sola en 14 días")])
  })

  test("a connection with a quiet number of days left says nothing", async () => {
    const c = await conConexion(30)
    const { falso, de } = servicio()
    await vigilarConexiones(admin(), falso, Date.now())
    expect(de(c.endpoint)).toEqual([])
    expect(await lineasDe(c.marca)).toEqual([])
  })

  test("an account published by hand plays no part in the watch", async () => {
    const c = await conConexion(-1)
    const aMano = await cuentaDe(c.marca, "empresa", "a_mano")
    const { data } = await admin().from("cuentas").select("conexion_id").eq("id", aMano).single()
    expect(data?.conexion_id).toBeNull()
    const { falso, de } = servicio()
    await vigilarConexiones(admin(), falso, Date.now())
    // The title names only the api account, never the by-hand one.
    const { data: nombres } = await admin().from("cuentas").select("id, nombre").in("id", [c.cuenta, aMano])
    const nombreApi = nombres?.find((n) => n.id === c.cuenta)?.nombre ?? ""
    const nombreMano = nombres?.find((n) => n.id === aMano)?.nombre ?? ""
    expect(de(c.endpoint)[0]?.mensaje.titulo).toContain(nombreApi)
    expect(de(c.endpoint)[0]?.mensaje.titulo).not.toContain(nombreMano)
  })

  test("a paused account keeps its connection but the watch says nothing about it", async () => {
    const c = await conConexion(-1)
    const pausa = await admin().from("cuentas").update({ ruta: "a_mano" }).eq("id", c.cuenta)
    expect(pausa.error).toBeNull()
    const { falso, de } = servicio()
    await vigilarConexiones(admin(), falso, Date.now())
    expect(de(c.endpoint)).toEqual([])
    expect(await lineasDe(c.marca)).toEqual([])
  })
})
