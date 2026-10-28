import { randomUUID } from "node:crypto"
import { describe, expect, test } from "vitest"
import { admin, cuentaDe, marcaConDueno, personaConSesion } from "./entorno"

const EN_UNA_HORA = () => new Date(Date.now() + 3_600_000).toISOString()
const HACE = (minutos: number) => new Date(Date.now() - minutos * 60_000).toISOString()

async function programada(minutosVencida = 1) {
  const dueno = await personaConSesion("reserva")
  const marca = await marcaConDueno(dueno.userId)
  const cuenta = await cuentaDe(marca)
  const { data: pieza, error } = await dueno.db.rpc("crear_pieza", {
    p_cuenta: cuenta,
    p_formato: "texto",
    p_texto: "Hola desde PostIA",
  })
  if (error) throw error
  const contexto = { ...dueno, pieza: pieza as string }
  await firmar(contexto, minutosVencida)
  return contexto
}

async function firmar(
  c: { db: Awaited<ReturnType<typeof personaConSesion>>["db"]; pieza: string },
  minutosVencida: number,
) {
  const { data: version } = await admin()
    .from("versiones")
    .select("id, huella")
    .eq("pieza_id", c.pieza)
    .order("numero", { ascending: false })
    .limit(1)
    .single()
  const { data: firma, error } = await c.db.rpc("firmar_pieza", {
    p_pieza: c.pieza,
    p_huella: version?.huella as string,
    p_programada_para: EN_UNA_HORA(),
  })
  if (error) throw error
  // Signing refuses the past, so the due moment is simulated by moving piece and signature together.
  const cuando = HACE(minutosVencida)
  await admin().from("piezas").update({ programada_para: cuando }).eq("id", c.pieza)
  await admin()
    .from("firmas")
    .update({ programada_para: cuando })
    .eq("id", firma as string)
  return { version: version?.id as string, firma: firma as string }
}

const reservar = (pieza: string, version: string, firma: string) =>
  admin().rpc("reservar_envio", { p_pieza: pieza, p_version: version, p_firma: firma })

describe("reservar_envio / cerrar_envio", () => {
  test("reserves a due, signed piece and starts sending it", async () => {
    const c = await programada()
    const { version, firma } = await firmarVigente(c.pieza)
    const { data, error } = await reservar(c.pieza, version, firma)
    expect(error).toBeNull()
    expect(data).toBe("reservado")
    const { data: pieza } = await admin().from("piezas").select("estado").eq("id", c.pieza).single()
    expect(pieza?.estado).toBe("publicando")
    const { data: filas } = await admin().from("publicaciones").select("firma_id, version_id").eq("pieza_id", c.pieza)
    expect(filas).toEqual([{ firma_id: firma, version_id: version }])
  })

  test("a second reservation for the same signature answers ya_enviado and writes nothing", async () => {
    const c = await programada()
    const { version, firma } = await firmarVigente(c.pieza)
    await reservar(c.pieza, version, firma)
    const segunda = await reservar(c.pieza, version, firma)
    expect(segunda.error).toBeNull()
    expect(segunda.data).toBe("ya_enviado")
    const { count } = await admin()
      .from("publicaciones")
      .select("*", { count: "exact", head: true })
      .eq("pieza_id", c.pieza)
    expect(count).toBe(1)
  })

  test("refuses a version that is not the latest", async () => {
    const c = await programada()
    const { firma } = await firmarVigente(c.pieza)
    const { error } = await reservar(c.pieza, randomUUID(), firma)
    expect(error?.code).toBe("22023")
    expect(error?.message).toBe("reserva_de_otra_version")
  })

  test("refuses a signature that is not the valid one for this date", async () => {
    const c = await programada()
    const { version } = await firmarVigente(c.pieza)
    const { error } = await reservar(c.pieza, version, randomUUID())
    expect(error?.code).toBe("22023")
    expect(error?.message).toBe("reserva_sin_firma")
  })

  test("refuses outside the late window", async () => {
    const c = await programada(31)
    const { version, firma } = await firmarVigente(c.pieza)
    const { error } = await reservar(c.pieza, version, firma)
    expect(error?.code).toBe("22023")
    expect(error?.message).toBe("reserva_fuera_de_ventana")
  })

  test("refuses a piece that is not scheduled", async () => {
    const c = await programada()
    const { version, firma } = await firmarVigente(c.pieza)
    await c.db.rpc("desprogramar_pieza", { p_pieza: c.pieza })
    const { error } = await reservar(c.pieza, version, firma)
    expect(error?.message).toBe("reserva_no_programada")
  })

  test("a person who sent it back and signed again can have a new send, but never a second one per signature", async () => {
    const c = await programada()
    const primera = await firmarVigente(c.pieza)
    expect((await reservar(c.pieza, primera.version, primera.firma)).data).toBe("reservado")
    await admin().from("piezas").update({ estado: "a_mano" }).eq("id", c.pieza)
    await admin().from("piezas").update({ estado: "por_aprobar" }).eq("id", c.pieza)
    const segunda = await firmar(c, 1)
    expect(segunda.firma).not.toBe(primera.firma)
    expect((await reservar(c.pieza, segunda.version, segunda.firma)).data).toBe("reservado")
    const { count } = await admin()
      .from("publicaciones")
      .select("*", { count: "exact", head: true })
      .eq("pieza_id", c.pieza)
    expect(count).toBe(2)
    expect((await reservar(c.pieza, segunda.version, segunda.firma)).data).toBe("ya_enviado")
  })

  test("cerrar_envio stores the post and closes the piece in one step", async () => {
    const c = await programada()
    const { version, firma } = await firmarVigente(c.pieza)
    await reservar(c.pieza, version, firma)
    const enlace = "https://www.linkedin.com/feed/update/urn:li:share:123"
    const { error } = await admin().rpc("cerrar_envio", {
      p_pieza: c.pieza,
      p_urn: "urn:li:share:123",
      p_enlace: enlace,
    })
    expect(error).toBeNull()
    const { data: pieza } = await admin().from("piezas").select("estado, enlace").eq("id", c.pieza).single()
    expect(pieza).toEqual({ estado: "publicada", enlace })
    const { data: fila } = await admin().from("publicaciones").select("post_urn").eq("pieza_id", c.pieza).single()
    expect(fila?.post_urn).toBe("urn:li:share:123")
  })

  test("cerrar_envio refuses a piece that is not being sent", async () => {
    const c = await programada()
    const { error } = await admin().rpc("cerrar_envio", {
      p_pieza: c.pieza,
      p_urn: "urn:li:share:1",
      p_enlace: "https://www.linkedin.com/feed/update/urn:li:share:1",
    })
    expect(error?.code).toBe("22023")
    expect(error?.message).toBe("cierre_sin_envio")
  })

  test("people cannot call either function", async () => {
    const c = await programada()
    const { version, firma } = await firmarVigente(c.pieza)
    expect(
      (await c.db.rpc("reservar_envio", { p_pieza: c.pieza, p_version: version, p_firma: firma })).error,
    ).not.toBeNull()
    expect(
      (await c.db.rpc("cerrar_envio", { p_pieza: c.pieza, p_urn: "urn:li:share:1", p_enlace: "https://x.test" })).error,
    ).not.toBeNull()
  })
})

async function firmarVigente(pieza: string) {
  const { data: firma } = await admin()
    .from("firmas")
    .select("id, version_id")
    .eq("pieza_id", pieza)
    .eq("vigente", true)
    .single()
  return { version: firma?.version_id as string, firma: firma?.id as string }
}
