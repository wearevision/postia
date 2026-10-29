import { beforeEach, describe, expect, test, vi } from "vitest"
import { avisosSinEnviar } from "@/lib/avisos/repositorio-de-avisos"
import { publicarPendientes } from "@/lib/publicacion/publicar"
import { repositorioDePublicacion } from "@/lib/publicacion/repositorio"
import { admin, cuentaDe, haceMinutos, marcaConDueno, personaConSesion, piezaDe, versionVigente } from "./entorno"

const EN_UNA_HORA = () => new Date(Date.now() + 3_600_000).toISOString()
const HACE = (minutos: number) => new Date(Date.now() - minutos * 60_000).toISOString()

/** Signs the latest version and makes the moment arrive. Signing refuses the past, so piece and signature move together. */
async function firmarVencida(
  c: { db: Awaited<ReturnType<typeof personaConSesion>>["db"]; pieza: string },
  minutosVencida = 1,
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
  const cuando = HACE(minutosVencida)
  await admin().from("piezas").update({ programada_para: cuando }).eq("id", c.pieza)
  await admin()
    .from("firmas")
    .update({ programada_para: cuando })
    .eq("id", firma as string)
  return { version: version?.id as string, firma: firma as string }
}

async function vencida(opciones: { minutosVencida?: number; cuenta?: "api" | "a_mano" } = {}) {
  const dueno = await personaConSesion("repo")
  const marca = await marcaConDueno(dueno.userId)
  const cuenta = await cuentaDe(marca, "persona", opciones.cuenta ?? "api")
  const { data: pieza, error } = await dueno.db.rpc("crear_pieza", {
    p_cuenta: cuenta,
    p_formato: "texto",
    p_texto: "Hola desde el publicador",
  })
  if (error) throw error
  const c = { ...dueno, marca, cuenta, pieza: pieza as string }
  return { ...c, ...(await firmarVencida(c, opciones.minutosVencida)) }
}

const repo = () => repositorioDePublicacion(admin())

// Leftover due pieces from other files would fill the lease batch: take them first so each test sees only its own.
beforeEach(async () => {
  while ((await repo().tomarPendientes()).length > 0);
})

async function estadoDe(pieza: string) {
  const { data } = await admin()
    .from("piezas")
    .select("estado, motivo, arrendada_hasta, enlace")
    .eq("id", pieza)
    .single()
  return data
}

describe("repositorioDePublicacion", () => {
  test("tomarPendientes leases a due piece once and returns its account, latest version and valid signature", async () => {
    const c = await vencida()
    const primera = (await repo().tomarPendientes()).find((p) => p.id === c.pieza)
    expect(primera).toMatchObject({
      id: c.pieza,
      marcaId: c.marca,
      cuentaId: c.cuenta,
      ruta: "api",
      formato: "texto",
      ventanaMinutos: 30,
      version: {
        id: c.version,
        texto: "Hola desde el publicador",
        titulo: null,
        archivoRuta: null,
        archivoSha256: null,
      },
      firma: { id: c.firma },
    })
    expect(primera?.cuentaNombre).toMatch(/^Cuenta /)
    expect(primera?.firma?.huella).toBe(primera?.version.huella)
    const { data: firma } = await admin().from("firmas").select("firmada_en").eq("id", c.firma).single()
    expect(primera?.firma?.firmadaEn).toBe(firma?.firmada_en)
    expect(new Date(primera?.programadaPara ?? "").getTime()).toBeLessThan(Date.now())

    const segunda = (await repo().tomarPendientes()).find((p) => p.id === c.pieza)
    expect(segunda).toBeUndefined()
  })

  test("reservarEnvio writes the row and starts sending; a second call answers ya_enviado", async () => {
    const c = await vencida()
    const pieza = (await repo().tomarPendientes()).find((p) => p.id === c.pieza)
    if (!pieza) throw new Error("la pieza vencida no apareció")
    expect(await repo().reservarEnvio(pieza)).toBe("reservado")
    expect((await estadoDe(c.pieza))?.estado).toBe("publicando")
    const { data: filas } = await admin().from("publicaciones").select("firma_id, version_id").eq("pieza_id", c.pieza)
    expect(filas).toEqual([{ firma_id: c.firma, version_id: c.version }])
    expect(await repo().reservarEnvio(pieza)).toBe("ya_enviado")
  })

  test("reservarEnvio lets the database refusal propagate and refuses a piece with no signature", async () => {
    const c = await vencida({ minutosVencida: 31 })
    const base = {
      id: c.pieza,
      marcaId: c.marca,
      cuentaId: c.cuenta,
      cuentaNombre: "x",
      ruta: "api" as const,
      formato: "texto" as const,
      programadaPara: HACE(31),
      ventanaMinutos: 30,
      version: { id: c.version, texto: "t", titulo: null, archivoRuta: null, archivoSha256: null, huella: "h" },
    }
    await expect(
      repo().reservarEnvio({ ...base, firma: { id: c.firma, huella: "h", firmadaEn: HACE(31) } }),
    ).rejects.toThrow(/reserva_fuera_de_ventana/)
    await expect(repo().reservarEnvio({ ...base, firma: null })).rejects.toThrow(/firma/)
  })

  test("tomarPendientes returns the new version and signature after an edit and a new signature", async () => {
    const c = await vencida()
    await c.db.rpc("nueva_version", { p_pieza: c.pieza, p_texto: "Texto corregido" })
    const nueva = await firmarVencida(c)
    const pieza = (await repo().tomarPendientes()).find((p) => p.id === c.pieza)
    expect(nueva.version).not.toBe(c.version)
    expect(pieza?.version).toMatchObject({ id: nueva.version, texto: "Texto corregido" })
    expect(pieza?.firma?.id).toBe(nueva.firma)
  })

  test("tomarPendientes returns due pieces oldest first", async () => {
    const vieja = await vencida({ minutosVencida: 20 })
    const nueva = await vencida({ minutosVencida: 2 })
    const ids = (await repo().tomarPendientes()).map((p) => p.id)
    expect(ids.indexOf(vieja.pieza)).toBeGreaterThanOrEqual(0)
    expect(ids.indexOf(vieja.pieza)).toBeLessThan(ids.indexOf(nueva.pieza))
  })

  test("tomarPendientes parks an unreadable piece for a person and still returns the others", async () => {
    const rota = await vencida()
    const sana = await vencida()
    await admin().from("versiones").delete().eq("pieza_id", rota.pieza)
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})

    const ids = (await repo().tomarPendientes()).map((p) => p.id)

    expect(ids).toContain(sana.pieza)
    expect(ids).not.toContain(rota.pieza)
    expect(await estadoDe(rota.pieza)).toMatchObject({
      estado: "por_aprobar",
      motivo: "No pude leer la pieza para publicarla. Revísala y fírmala de nuevo.",
      arrendada_hasta: null,
    })
    expect(registro).toHaveBeenCalled()
    registro.mockRestore()
  })

  test("cerrarEnvio stores the URN and link and publishes the piece", async () => {
    const c = await vencida()
    const pieza = (await repo().tomarPendientes()).find((p) => p.id === c.pieza)
    if (!pieza) throw new Error("la pieza vencida no apareció")
    await repo().reservarEnvio(pieza)
    const enlace = "https://www.linkedin.com/feed/update/urn:li:share:777"
    await repo().cerrarEnvio(c.pieza, "urn:li:share:777", enlace)
    expect(await estadoDe(c.pieza)).toMatchObject({ estado: "publicada", enlace })
    const { data: fila } = await admin().from("publicaciones").select("post_urn").eq("pieza_id", c.pieza).single()
    expect(fila?.post_urn).toBe("urn:li:share:777")
  })

  test("mover parks the piece with its reason and drops the lease; an illegal move throws", async () => {
    const c = await vencida()
    await repo().tomarPendientes()
    expect((await estadoDe(c.pieza))?.arrendada_hasta).not.toBeNull()
    await repo().mover(c.pieza, "a_mano", "La conexión venció.")
    expect(await estadoDe(c.pieza)).toMatchObject({
      estado: "a_mano",
      motivo: "La conexión venció.",
      arrendada_hasta: null,
    })

    await admin().from("piezas").update({ estado: "descartada" }).eq("id", c.pieza)
    await expect(repo().mover(c.pieza, "a_mano", "no debería")).rejects.toThrow(/transicion_no_permitida/)
  })

  test("sinRespuesta finds a piece being sent with no URN whose send is older than the cut", async () => {
    const c = await vencida()
    const pieza = (await repo().tomarPendientes()).find((p) => p.id === c.pieza)
    if (!pieza) throw new Error("la pieza vencida no apareció")
    await repo().reservarEnvio(pieza)

    expect((await repo().sinRespuesta(HACE(15))).find((x) => x.id === c.pieza)).toBeUndefined()

    await admin()
      .from("publicaciones")
      .update({ enviado_en: HACE(20) })
      .eq("pieza_id", c.pieza)
    const colgadas = await repo().sinRespuesta(HACE(15))
    expect(colgadas.find((x) => x.id === c.pieza)).toEqual({
      id: c.pieza,
      marcaId: c.marca,
      cuentaNombre: pieza.cuentaNombre,
    })

    await repo().cerrarEnvio(c.pieza, "urn:li:share:888", "https://www.linkedin.com/feed/update/urn:li:share:888")
    expect((await repo().sinRespuesta(HACE(15))).find((x) => x.id === c.pieza)).toBeUndefined()
  })

  test("sinRespuesta ignores an older orphan send once the piece was signed again and sent afresh", async () => {
    const c = await vencida()
    const primera = (await repo().tomarPendientes()).find((p) => p.id === c.pieza)
    if (!primera) throw new Error("la pieza vencida no apareció")
    await repo().reservarEnvio(primera)
    await admin()
      .from("publicaciones")
      .update({ enviado_en: HACE(40) })
      .eq("pieza_id", c.pieza)
    await repo().mover(c.pieza, "a_mano", "Salió dudoso.")
    await admin().from("piezas").update({ estado: "por_aprobar" }).eq("id", c.pieza)
    await firmarVencida(c)
    const segunda = (await repo().tomarPendientes()).find((p) => p.id === c.pieza)
    if (!segunda) throw new Error("la pieza vencida no volvió")
    await repo().reservarEnvio(segunda)

    expect((await repo().sinRespuesta(HACE(15))).find((x) => x.id === c.pieza)).toBeUndefined()

    await admin()
      .from("publicaciones")
      .update({ enviado_en: HACE(20) })
      .eq("firma_id", segunda.firma?.id as string)
    expect((await repo().sinRespuesta(HACE(15))).find((x) => x.id === c.pieza)?.id).toBe(c.pieza)
  })

  test("credencial returns the Vault token of the connected account, and null when there is none", async () => {
    const c = await vencida()
    expect(await repo().credencial(c.cuenta)).toBeNull()
    const expira = new Date(Date.now() + 60 * 86_400_000).toISOString()
    const { error } = await c.db.rpc("conectar_linkedin", {
      p_cuenta: c.cuenta,
      p_token: "token-de-prueba",
      p_titular: "urn:li:person:abc123",
      p_nombre: "Federico Elgueta",
      p_scopes: ["openid", "profile", "w_member_social"],
      p_expira_en: expira,
    })
    expect(error).toBeNull()
    const credencial = await repo().credencial(c.cuenta)
    expect(credencial).toMatchObject({ token: "token-de-prueba", titular: "urn:li:person:abc123" })
    expect(new Date(credencial?.expiraEn ?? "").toISOString()).toBe(expira)
  })

  test("descargar returns the bytes of a stored file and fails for a missing one", async () => {
    const c = await vencida()
    const ruta = `${c.marca}/${c.pieza}-prueba.bin`
    const bytes = new Uint8Array([1, 2, 3, 4])
    const { error } = await admin().storage.from("piezas").upload(ruta, bytes, { contentType: "application/pdf" })
    expect(error).toBeNull()
    expect(await repo().descargar(ruta)).toEqual(bytes)
    await expect(repo().descargar(`${c.marca}/no-existe.pdf`)).rejects.toThrow()
  })
})

/** A reserve piece and a planned unsigned piece whose slot passed 2 minutes ago, in one account. */
async function reservaYPendiente(ruta: "api" | "a_mano" = "api") {
  const dueno = await personaConSesion("cubrir")
  const marca = await marcaConDueno(dueno.userId)
  const cuenta = await cuentaDe(marca, "persona", ruta)
  const reserva = await piezaDe(dueno.db, cuenta, "De la reserva")
  const firmada = await dueno.db.rpc("firmar_para_reserva", {
    p_pieza: reserva,
    p_huella: (await versionVigente(reserva)).huella,
  })
  if (firmada.error) throw firmada.error
  const pendiente = await piezaDe(dueno.db, cuenta, "Sin firma")
  const hueco = haceMinutos(2)
  await admin().from("piezas").update({ planeada_para: hueco }).eq("id", pendiente)
  return { marca, cuenta, reserva, pendiente, hueco }
}

const enTresDias = () => new Date(Date.now() + 3 * 86_400_000).toISOString()

describe("covering unsigned slots from the reserve", () => {
  test("vencidasSinFirma lists a past planned piece with its account kind; cubrirConReserva returns the reserve piece, which the publisher then leases signed", async () => {
    const c = await reservaYPendiente()
    const vencida = (await repo().vencidasSinFirma()).find((x) => x.id === c.pendiente)
    expect(vencida).toMatchObject({
      id: c.pendiente,
      marcaId: c.marca,
      cuentaId: c.cuenta,
      tipo: "persona",
      extracto: "Sin firma",
    })
    expect(Date.parse(vencida?.planeadaPara ?? "")).toBe(Date.parse(c.hueco))

    expect(await repo().cubrirConReserva(c.pendiente, enTresDias())).toBe(c.reserva)

    const tomada = (await repo().tomarPendientes()).find((p) => p.id === c.reserva)
    expect(tomada?.firma?.huella).toBe(tomada?.version.huella)
    expect(Date.parse(tomada?.programadaPara ?? "")).toBe(Date.parse(c.hueco))
    expect((await repo().vencidasSinFirma()).find((x) => x.id === c.pendiente)).toBeUndefined()
  })

  test("vencidasSinFirma cuts a long text to 40 characters with an ellipsis", async () => {
    const dueno = await personaConSesion("extracto")
    const marca = await marcaConDueno(dueno.userId)
    const cuenta = await cuentaDe(marca)
    const pieza = await piezaDe(dueno.db, cuenta, "x".repeat(60))
    await admin()
      .from("piezas")
      .update({ planeada_para: haceMinutos(2) })
      .eq("id", pieza)
    const vencida = (await repo().vencidasSinFirma()).find((x) => x.id === pieza)
    expect(vencida?.extracto).toBe(`${"x".repeat(39)}…`)
  })

  test("horariosOcupados and anotarAviso go through to the account's slots and the digest queue", async () => {
    const c = await reservaYPendiente()
    expect(await repo().horariosOcupados(c.cuenta, Date.now() - 3_600_000)).toContain(Date.parse(c.hueco))
    await repo().anotarAviso(c.marca, { titulo: "Cuenta", cuerpo: "Una línea", url: `/piezas/${c.pendiente}` })
    expect((await avisosSinEnviar(admin())).filter((l) => l.marcaId === c.marca)).toHaveLength(1)
  })

  test("a reserve piece that cannot go out returns to the reserve with its signature, not to the gate", async () => {
    const c = await reservaYPendiente()
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})
    const puertos = repo()
    const resultado = await publicarPendientes({
      ...puertos,
      // Scoped to this test's account: the shared local database holds other overdue pieces.
      vencidasSinFirma: async () => (await puertos.vencidasSinFirma()).filter((x) => x.cuentaId === c.cuenta),
      avisar: vi.fn(async () => {}),
      linkedin: { crearPost: vi.fn(), subirDocumento: vi.fn(), estadoDelDocumento: vi.fn() },
      esperar: async () => {},
      // 40 minutes later the slot is outside its 30-minute window, as when the run itself was late.
      ahora: () => Date.now() + 40 * 60_000,
    })
    registro.mockRestore()

    expect(resultado.por_aprobar).toBeGreaterThanOrEqual(1)
    expect(await estadoDe(c.reserva)).toMatchObject({ estado: "en_reserva", arrendada_hasta: null })
    const { data: pieza } = await admin()
      .from("piezas")
      .select("planeada_para, programada_para")
      .eq("id", c.reserva)
      .single()
    expect(pieza).toEqual({ planeada_para: null, programada_para: null })
    const { data: firmas } = await admin()
      .from("firmas")
      .select("vigente, para_reserva, programada_para, huella")
      .eq("pieza_id", c.reserva)
    expect(firmas).toEqual([
      { vigente: true, para_reserva: true, programada_para: null, huella: (await versionVigente(c.reserva)).huella },
    ])
    expect((await estadoDe(c.pendiente))?.estado).toBe("por_aprobar")
  })

  test("a piece that failed to move is recorded once, skipped for an hour and cleared once it moves", async () => {
    const c = await reservaYPendiente()
    expect(await repo().registrarFallaDeEspacio(c.pendiente, "No encontré espacio.")).toBe(true)
    expect(await repo().registrarFallaDeEspacio(c.pendiente, "No encontré espacio.")).toBe(false)
    expect((await estadoDe(c.pendiente))?.motivo).toBe("No encontré espacio.")
    expect((await repo().vencidasSinFirma()).find((x) => x.id === c.pendiente)).toBeUndefined()

    await admin()
      .from("piezas")
      .update({ plan_fallo_en: new Date(Date.now() - 2 * 3_600_000).toISOString() })
      .eq("id", c.pendiente)
    expect((await repo().vencidasSinFirma()).find((x) => x.id === c.pendiente)).toBeDefined()

    await repo().cubrirConReserva(c.pendiente, enTresDias())
    const { data } = await admin().from("piezas").select("plan_fallo_en").eq("id", c.pendiente).single()
    expect(data?.plan_fallo_en).toBeNull()
  })

  test("a reserve piece sent back for a cause in the piece itself goes to the gate with its reserve signature dropped", async () => {
    const c = await reservaYPendiente()
    await repo().cubrirConReserva(c.pendiente, enTresDias())
    await repo().tomarPendientes()
    await repo().mover(c.reserva, "por_aprobar", "El archivo cambió después de la firma.")
    expect(await estadoDe(c.reserva)).toMatchObject({
      estado: "por_aprobar",
      motivo: "El archivo cambió después de la firma.",
    })
    const { data: firmas } = await admin().from("firmas").select("vigente").eq("pieza_id", c.reserva)
    expect(firmas).toEqual([{ vigente: false }])
  })

  test("devolverALaReserva returns a reserve piece to the reserve, and a plain signed piece to the gate", async () => {
    const c = await reservaYPendiente()
    await repo().cubrirConReserva(c.pendiente, enTresDias())
    await repo().tomarPendientes()
    expect(await repo().devolverALaReserva(c.reserva, "Tarde.")).toBe("en_reserva")
    expect((await estadoDe(c.reserva))?.estado).toBe("en_reserva")

    const normal = await vencida()
    await repo().tomarPendientes()
    expect(await repo().devolverALaReserva(normal.pieza, "Tarde.")).toBe("por_aprobar")
    expect((await estadoDe(normal.pieza))?.estado).toBe("por_aprobar")
  })

  test("a late move to the gate leaves a piece that is no longer scheduled exactly as it is", async () => {
    const c = await reservaYPendiente()
    await repo().cubrirConReserva(c.pendiente, enTresDias())
    await repo().tomarPendientes()
    expect(await repo().devolverALaReserva(c.reserva, "Tarde.")).toBe("en_reserva")

    // The owner or an earlier step already moved it: the publisher's stale decision must not undo that.
    expect(await repo().devolverALaReserva(c.reserva, "Otra falla.")).toBe("sin_cambio")
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})
    await repo().mover(c.reserva, "por_aprobar", "Otra falla.")
    registro.mockRestore()
    expect(await estadoDe(c.reserva)).toMatchObject({ estado: "en_reserva" })
    const { data: firmas } = await admin().from("firmas").select("vigente, para_reserva").eq("pieza_id", c.reserva)
    expect(firmas).toEqual([{ vigente: true, para_reserva: true }])
    const { data: crudo } = await admin().rpc("devolver_pieza", {
      p_pieza: c.reserva,
      p_motivo: "x",
      p_a_la_reserva: false,
    })
    expect(crudo).toBe("sin_cambio:en_reserva")
  })

  test("a reserve piece of an account published by hand is covered and then handed to a person", async () => {
    const c = await reservaYPendiente("a_mano")
    const puertos = repo()
    const avisar = vi.fn(async () => {})
    await publicarPendientes({
      ...puertos,
      vencidasSinFirma: async () => (await puertos.vencidasSinFirma()).filter((x) => x.cuentaId === c.cuenta),
      avisar,
      linkedin: { crearPost: vi.fn(), subirDocumento: vi.fn(), estadoDelDocumento: vi.fn() },
      esperar: async () => {},
      ahora: Date.now,
    })
    expect((await estadoDe(c.reserva))?.estado).toBe("a_mano")
    expect(avisar).toHaveBeenCalledWith(
      c.marca,
      expect.objectContaining({ titulo: expect.stringContaining("Publica a mano") }),
    )
    const lineas = (await avisosSinEnviar(admin())).filter((l) => l.marcaId === c.marca)
    expect(lineas[0]?.cuerpo).toContain("salió de la reserva")
  })

  test("mover to the gate still sends a piece without a reserve signature to por_aprobar", async () => {
    const c = await vencida()
    await repo().tomarPendientes()
    await repo().mover(c.pieza, "por_aprobar", "Algo falló.")
    expect(await estadoDe(c.pieza)).toMatchObject({ estado: "por_aprobar", motivo: "Algo falló." })
  })
})
