import { createClient } from "@supabase/supabase-js"
import { describe, expect, test, vi } from "vitest"
import { enviarResumenes } from "@/lib/avisos/enviar-resumen"
import type { ServicioPush, SuscripcionPush } from "@/lib/avisos/push"
import { anotarAviso } from "@/lib/avisos/repositorio-de-avisos"
import type { MensajePush } from "@/lib/avisos/tipos"
import type { Database } from "@/lib/supabase/database.types"
import { admin, cuentaDe, entornoLocal, marcaConDueno, personaConSesion, piezaDe } from "./entorno"

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

/**
 * Reports waiting are counted across every brand, so a test that expects silence sets aside the ones earlier files
 * left. Local test database only.
 */
async function sinInformesPorAprobar() {
  const { error } = await admin()
    .from("investigaciones")
    .update({ estado: "descartada" })
    .eq("estado", "informe_por_aprobar")
  if (error) throw error
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

  test("the digest still goes, without pillar lines, when the pillar balance cannot be read", async () => {
    const { db, userId } = await personaConSesion("resumen-pilares")
    const marca = await marcaConDueno(userId)
    await piezaDe(db, await cuentaConRitmo(marca, 3))
    const endpoint = await aparato(userId)
    const { falso, de } = servicio()
    const { url, servicio: llave } = entornoLocal()
    // The network is the boundary: only the pillars table fails to answer.
    const sinPilares = createClient<Database>(url, llave, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (entrada, init) =>
          String(entrada).includes("/rest/v1/pilares")
            ? Promise.resolve(new Response(JSON.stringify({ message: "caída" }), { status: 500 }))
            : fetch(entrada, init),
      },
    })
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})

    await enviarResumenes(sinPilares, falso, Date.now())

    expect(registro).toHaveBeenCalled()
    registro.mockRestore()
    expect(de(endpoint)).toHaveLength(1)
    expect(de(endpoint)[0]?.mensaje.cuerpo.startsWith("1 pieza espera tu firma.")).toBe(true)
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
    await sinInformesPorAprobar()
    const { userId } = await personaConSesion("resumen-vacio")
    const marca = await marcaConDueno(userId)
    await cuentaConRitmo(marca, 0)
    const endpoint = await aparato(userId)
    const { falso, de } = servicio()

    await enviarResumenes(admin(), falso, Date.now())

    expect(de(endpoint)).toEqual([])
  })

  test("a queued line is not marked sent when no device received the digest", async () => {
    const { userId } = await personaConSesion("resumen-fallo")
    const marca = await marcaConDueno(userId)
    await anotarAviso(admin(), marca, { titulo: "Cuenta", cuerpo: "Línea que no debe perderse", url: "/piezas/x" })
    await aparato(userId)
    const fallido: ServicioPush = { enviar: async () => ({ estado: "fallo", detalle: "HTTP 500" }) }
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})
    await enviarResumenes(admin(), fallido, Date.now())
    registro.mockRestore()
    expect(await lineaSinEnviar(marca)).toEqual([null])

    const { falso } = servicio()
    await enviarResumenes(admin(), falso, Date.now())
    expect((await lineaSinEnviar(marca))?.every((e) => e !== null)).toBe(true)
  })

  test("a person without any device keeps the lines queued for when one appears", async () => {
    const { userId } = await personaConSesion("resumen-sin-aparato")
    const marca = await marcaConDueno(userId)
    await anotarAviso(admin(), marca, { titulo: "Cuenta", cuerpo: "Para cuando haya aparato", url: "/piezas/x" })
    const { falso } = servicio()
    await enviarResumenes(admin(), falso, Date.now())
    expect(await lineaSinEnviar(marca)).toEqual([null])
    const endpoint = await aparato(userId)
    const { falso: otro, de } = servicio()
    await enviarResumenes(admin(), otro, Date.now())
    expect(de(endpoint)[0]?.mensaje.cuerpo).toContain("Para cuando haya aparato")
    expect((await lineaSinEnviar(marca))?.every((e) => e !== null)).toBe(true)
  })

  test("a line older than three days is neither sent nor marked", async () => {
    const { userId } = await personaConSesion("resumen-vieja")
    const marca = await marcaConDueno(userId)
    await anotarAviso(admin(), marca, { titulo: "Cuenta", cuerpo: "Línea vieja", url: "/piezas/x" })
    await admin()
      .from("avisos_pendientes")
      .update({ creado_en: new Date(Date.now() - 4 * 86_400_000).toISOString() })
      .eq("marca_id", marca)
    const endpoint = await aparato(userId)
    const { falso, de } = servicio()
    await enviarResumenes(admin(), falso, Date.now())
    expect(de(endpoint)).toEqual([])
    expect(await lineaSinEnviar(marca)).toEqual([null])
  })

  test("tells each person only the pillar alerts of their own brands", async () => {
    const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString()
    const dentroDe = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString()
    const { db, userId } = await personaConSesion("resumen-pilares")
    const marca = await marcaConDueno(userId)
    const cuenta = await cuentaConRitmo(marca, 3)
    const { data: pilares, error } = await admin()
      .from("pilares")
      .insert([
        { marca_id: marca, nombre: "Olvidado", por_semana: 1, orden: 1, creado_en: hace(30) },
        { marca_id: marca, nombre: "En camino", por_semana: 1, orden: 2, creado_en: hace(30) },
      ])
      .select("id, nombre")
    if (error) throw error
    const enCamino = pilares.find((p) => p.nombre === "En camino")?.id
    const pieza = await piezaDe(db, cuenta)
    await admin()
      .from("piezas")
      .update({ planeada_para: dentroDe(3), pilar_id: enCamino })
      .eq("id", pieza)
    const { data: cuentaLeida } = await admin().from("cuentas").select("nombre").eq("id", cuenta).single()
    const endpoint = await aparato(userId)

    const ajeno = await personaConSesion("resumen-pilares-ajeno")
    const marcaAjena = await marcaConDueno(ajeno.userId)
    await anotarAviso(admin(), marcaAjena, { titulo: "Cuenta", cuerpo: "Algo de la otra marca", url: "/piezas/x" })
    const endpointAjeno = await aparato(ajeno.userId)
    const { falso, de } = servicio()

    await enviarResumenes(admin(), falso, Date.now())

    const cuerpo = de(endpoint)[0]?.mensaje.cuerpo ?? ""
    expect(cuerpo).toContain(`«Olvidado» no ha salido en ${cuentaLeida?.nombre} en más de dos semanas.`)
    expect(cuerpo).not.toContain("En camino")
    expect(de(endpointAjeno)[0]?.mensaje.cuerpo).not.toContain("Olvidado")
  })

  test("every owner hears how many research reports wait, whatever the brand", async () => {
    await sinInformesPorAprobar()
    const pide = await personaConSesion("resumen-informes-pide")
    await marcaConDueno(pide.userId)
    const otro = await personaConSesion("resumen-informes-otro")
    const marcaDelOtro = await marcaConDueno(otro.userId)
    await cuentaConRitmo(marcaDelOtro, 0)
    const { error } = await admin()
      .from("investigaciones")
      .insert(
        ["Uno", "Dos"].map((tema) => ({
          origen: "encargo",
          tema,
          cantidad: 3,
          formato: "texto",
          pedida_por: pide.userId,
          estado: "informe_por_aprobar",
        })),
      )
    if (error) throw error
    const endpoint = await aparato(otro.userId)
    const { falso, de } = servicio()

    await enviarResumenes(admin(), falso, Date.now())

    expect(de(endpoint)).toHaveLength(1)
    expect(de(endpoint)[0]?.mensaje.cuerpo).toBe("2 informes esperan tu revisión.")
    await sinInformesPorAprobar()
  })
})
