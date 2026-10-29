import { createHash } from "node:crypto"
import { describe, expect, test } from "vitest"
import {
  asegurarPlan,
  cerrarAMano,
  crearPieza,
  descartar,
  desprogramar,
  dudosoAMano,
  firmarParaReserva,
  firmarPieza,
  planearConFechaPropuesta,
  planearPieza,
  ponerPilar,
  sacarDeReserva,
} from "@/lib/piezas/acciones"
import { proponerFecha } from "@/lib/piezas/horarios"
import { sha256 } from "@/lib/piezas/huella"
import { admin, cuentaDe, enDias, marcaConDueno, personaConSesion, versionVigente } from "./entorno"

const EN_UNA_HORA = () => new Date(Date.now() + 3_600_000).toISOString()

async function subirPdf(db: Awaited<ReturnType<typeof personaConSesion>>["db"], marca: string, contenido: string) {
  const ruta = `${marca}/${crypto.randomUUID()}.pdf`
  const { error } = await db.storage
    .from("piezas")
    .upload(ruta, new TextEncoder().encode(contenido), { contentType: "application/pdf" })
  if (error) throw error
  return ruta
}

async function piezaCreada(prefijo: string) {
  const { db, userId } = await personaConSesion(prefijo)
  const marca = await marcaConDueno(userId)
  const cuenta = await cuentaDe(marca)
  const creada = await crearPieza(db, { cuentaId: cuenta, formato: "texto", texto: "Hola" })
  if (!creada.ok) throw new Error(creada.error)
  return { db, marca, cuenta, piezaId: creada.piezaId }
}

async function huellaVigente(piezaId: string) {
  const { data } = await admin()
    .from("versiones")
    .select("huella")
    .eq("pieza_id", piezaId)
    .order("numero", { ascending: false })
    .limit(1)
    .single()
  return data?.huella ?? ""
}

const SHA_DEL_PDF = createHash("sha256").update("%PDF-1.4\nhola").digest("hex")

describe("piece actions", () => {
  test("creates a text piece and refuses an empty or too long text", async () => {
    const { db, userId } = await personaConSesion("acc")
    const cuenta = await cuentaDe(await marcaConDueno(userId))
    expect((await crearPieza(db, { cuentaId: cuenta, formato: "texto", texto: "Hola" })).ok).toBe(true)
    expect(await crearPieza(db, { cuentaId: cuenta, formato: "texto", texto: "   " })).toEqual({
      ok: false,
      error: "Falta el texto.",
    })
    expect(await crearPieza(db, { cuentaId: cuenta, formato: "texto", texto: "a".repeat(3001) })).toEqual({
      ok: false,
      error: "El texto pasa los 3000 caracteres de LinkedIn.",
    })
  })

  test("a carousel needs a PDF that really is a PDF, and its hash is computed on the server", async () => {
    const { db, userId } = await personaConSesion("acc-pdf")
    const marca = await marcaConDueno(userId)
    const cuenta = await cuentaDe(marca)
    const ruta = await subirPdf(db, marca, "%PDF-1.4\nhola")
    const r = await crearPieza(db, {
      cuentaId: cuenta,
      formato: "carrusel_pdf",
      texto: "Texto",
      titulo: "Título",
      archivoRuta: ruta,
      archivoSha256: SHA_DEL_PDF,
    })
    expect(r.ok).toBe(true)
    const { data } = await admin().from("versiones").select("archivo_sha256").eq("archivo_ruta", ruta).single()
    expect(data?.archivo_sha256).toBe(sha256(new TextEncoder().encode("%PDF-1.4\nhola")))
  })

  test("a carousel stores the hash the browser computed; the publisher is the one that compares it", async () => {
    const { db, userId } = await personaConSesion("acc-hash-cliente")
    const marca = await marcaConDueno(userId)
    const cuenta = await cuentaDe(marca)
    const ruta = await subirPdf(db, marca, "%PDF-1.4\nhola")
    const otro = "a".repeat(64)
    const r = await crearPieza(db, {
      cuentaId: cuenta,
      formato: "carrusel_pdf",
      texto: "T",
      titulo: "X",
      archivoRuta: ruta,
      archivoSha256: otro,
    })
    expect(r.ok).toBe(true)
    const { data } = await admin().from("versiones").select("archivo_sha256").eq("archivo_ruta", ruta).single()
    expect(data?.archivo_sha256).toBe(otro)
  })

  test("a carousel without a well-formed sha-256 is refused", async () => {
    const { db, userId } = await personaConSesion("acc-sin-hash")
    const marca = await marcaConDueno(userId)
    const cuenta = await cuentaDe(marca)
    const ruta = await subirPdf(db, marca, "%PDF-1.4\nhola")
    for (const archivoSha256 of [undefined, "xyz", "A".repeat(64)]) {
      expect(
        await crearPieza(db, {
          cuentaId: cuenta,
          formato: "carrusel_pdf",
          texto: "T",
          titulo: "X",
          archivoRuta: ruta,
          archivoSha256,
        }),
      ).toEqual({
        ok: false,
        error: "Revisa los datos de la pieza.",
      })
    }
  })

  test("a carousel refuses a file that is not a PDF", async () => {
    const { db, userId } = await personaConSesion("acc-nopdf")
    const marca = await marcaConDueno(userId)
    const cuenta = await cuentaDe(marca)
    const ruta = await subirPdf(db, marca, "esto no es un pdf")
    expect(
      await crearPieza(db, {
        cuentaId: cuenta,
        formato: "carrusel_pdf",
        texto: "T",
        titulo: "X",
        archivoRuta: ruta,
        archivoSha256: SHA_DEL_PDF,
      }),
    ).toEqual({ ok: false, error: "Ese archivo no es un PDF o no se pudo leer." })
  })

  test("a stranger cannot create a piece and gets a message in words", async () => {
    const { cuenta } = await piezaCreada("acc-dueno")
    const extrano = await personaConSesion("acc-extrano")
    expect(await crearPieza(extrano.db, { cuentaId: cuenta, formato: "texto", texto: "Hola" })).toEqual({
      ok: false,
      error: "Solo el dueño de la marca puede crear piezas.",
    })
  })

  test("signing explains a stale version in words, not codes", async () => {
    const { db, piezaId } = await piezaCreada("acc-firma")
    expect(await firmarPieza(db, { piezaId, huella: "0".repeat(64), programadaPara: EN_UNA_HORA() })).toEqual({
      ok: false,
      error: "La pieza cambió desde que la abriste. Revísala de nuevo antes de firmar.",
    })
  })

  test("signing refuses a past date and a malformed date", async () => {
    const { db, piezaId } = await piezaCreada("acc-fecha")
    const huella = await huellaVigente(piezaId)
    expect(
      await firmarPieza(db, { piezaId, huella, programadaPara: new Date(Date.now() - 60_000).toISOString() }),
    ).toEqual({ ok: false, error: "Elige una fecha y hora futuras." })
    expect(await firmarPieza(db, { piezaId, huella, programadaPara: "mañana" })).toEqual({
      ok: false,
      error: "Revisa la fecha y la hora.",
    })
  })

  test("signing, unscheduling and discarding walk the piece through its states", async () => {
    const { db, piezaId } = await piezaCreada("acc-ciclo")
    const huella = await huellaVigente(piezaId)
    expect(await firmarPieza(db, { piezaId, huella, programadaPara: EN_UNA_HORA() })).toEqual({ ok: true })
    expect((await admin().from("piezas").select("estado").eq("id", piezaId).single()).data?.estado).toBe("programada")
    expect(await desprogramar(db, piezaId)).toEqual({ ok: true })
    expect((await admin().from("piezas").select("estado").eq("id", piezaId).single()).data?.estado).toBe("por_aprobar")
    expect(await descartar(db, piezaId, "Ya no va")).toEqual({ ok: true })
    expect((await admin().from("piezas").select("estado").eq("id", piezaId).single()).data?.estado).toBe("descartada")
    expect(await descartar(db, piezaId, "otra vez")).toEqual({ ok: false, error: "Esta pieza ya está cerrada." })
  })

  test("two pieces of one account cannot take the same slot", async () => {
    const { db, cuenta, piezaId } = await piezaCreada("acc-slot")
    const cuando = EN_UNA_HORA()
    await firmarPieza(db, { piezaId, huella: await huellaVigente(piezaId), programadaPara: cuando })
    const otra = await crearPieza(db, { cuentaId: cuenta, formato: "texto", texto: "Otra" })
    if (!otra.ok) throw new Error(otra.error)
    expect(
      await firmarPieza(db, {
        piezaId: otra.piezaId,
        huella: await huellaVigente(otra.piezaId),
        programadaPara: cuando,
      }),
    ).toEqual({ ok: false, error: "Esa cuenta ya tiene una pieza a esa hora. Elige otra." })
  })

  test("closing by hand accepts only a LinkedIn link", async () => {
    const { db } = await personaConSesion("acc-mano")
    expect(await cerrarAMano(db, { piezaId: crypto.randomUUID(), enlace: "https://ejemplo.com/x" })).toEqual({
      ok: false,
      error: "Pega el enlace de la publicación en LinkedIn.",
    })
  })

  test("closing by hand a piece that is not waiting for a link says so", async () => {
    const { db, piezaId } = await piezaCreada("acc-mano2")
    expect(await cerrarAMano(db, { piezaId, enlace: "https://www.linkedin.com/feed/update/urn:li:share:1" })).toEqual({
      ok: false,
      error: "Esta pieza no está esperando un enlace.",
    })
  })

  test("closing by hand a piece waiting for a link marks it published", async () => {
    const { db, piezaId } = await piezaCreada("acc-mano3")
    await firmarPieza(db, { piezaId, huella: await huellaVigente(piezaId), programadaPara: EN_UNA_HORA() })
    await admin().from("piezas").update({ estado: "a_mano" }).eq("id", piezaId)
    expect(await cerrarAMano(db, { piezaId, enlace: "https://www.linkedin.com/feed/update/urn:li:share:1" })).toEqual({
      ok: true,
    })
    expect((await admin().from("piezas").select("estado").eq("id", piezaId).single()).data?.estado).toBe("publicada")
  })

  test("a doubtful send that is not doubtful says so", async () => {
    const { db, piezaId } = await piezaCreada("acc-dudoso")
    expect(await dudosoAMano(db, piezaId)).toEqual({ ok: false, error: "Esta pieza no está en duda." })
  })

  test("counts text length in code points after normalizing, like the database", async () => {
    const { db, userId } = await personaConSesion("acc-largo")
    const cuenta = await cuentaDe(await marcaConDueno(userId))
    expect((await crearPieza(db, { cuentaId: cuenta, formato: "texto", texto: "😀".repeat(3000) })).ok).toBe(true)
    expect((await crearPieza(db, { cuentaId: cuenta, formato: "texto", texto: `${"a".repeat(3000)}   \r\n` })).ok).toBe(
      true,
    )
    expect(await crearPieza(db, { cuentaId: cuenta, formato: "texto", texto: `   ${"a".repeat(3000)}` })).toEqual({
      ok: false,
      error: "El texto pasa los 3000 caracteres de LinkedIn.",
    })
  })

  test("a carousel file under another brand's folder is refused before it is read", async () => {
    const { db, userId } = await personaConSesion("acc-otra-marca")
    const cuenta = await cuentaDe(await marcaConDueno(userId))
    const ajena = `${crypto.randomUUID()}/${crypto.randomUUID()}.pdf`
    expect(
      await crearPieza(db, {
        cuentaId: cuenta,
        formato: "carrusel_pdf",
        texto: "T",
        titulo: "X",
        archivoRuta: ajena,
        archivoSha256: SHA_DEL_PDF,
      }),
    ).toEqual({ ok: false, error: "Ese archivo pertenece a otra marca." })
  })

  test("a carousel for an account the person cannot see gets the owner message", async () => {
    const { cuenta, marca } = await piezaCreada("acc-cuenta-ajena")
    const extrano = await personaConSesion("acc-cuenta-extrano")
    const ruta = `${marca}/${crypto.randomUUID()}.pdf`
    expect(
      await crearPieza(extrano.db, {
        cuentaId: cuenta,
        formato: "carrusel_pdf",
        texto: "T",
        titulo: "X",
        archivoRuta: ruta,
        archivoSha256: SHA_DEL_PDF,
      }),
    ).toEqual({ ok: false, error: "Solo el dueño de la marca puede crear piezas." })
  })

  test("the pieces bucket refuses files over 30 MB", async () => {
    const { data } = await admin().storage.getBucket("piezas")
    expect(data?.file_size_limit).toBe(30 * 1024 * 1024)
  })

  test("discarding validates the id and the reason", async () => {
    const { db, piezaId } = await piezaCreada("acc-motivo")
    expect(await descartar(db, piezaId, "m".repeat(600))).toEqual({
      ok: false,
      error: "Revisa el motivo: máximo 500 caracteres.",
    })
    expect(await descartar(db, "no-es-uuid", "x")).toEqual({ ok: false, error: "Revisa los datos de la pieza." })
  })

  test("unscheduling and the doubtful-send action validate the id", async () => {
    const { db } = await personaConSesion("acc-uuid")
    expect(await desprogramar(db, "no-es-uuid")).toEqual({ ok: false, error: "Revisa los datos de la pieza." })
    expect(await dudosoAMano(db, "no-es-uuid")).toEqual({ ok: false, error: "Revisa los datos de la pieza." })
  })
})

describe("plans and the reserve", () => {
  test("two new pieces of one account get consecutive proposed slots", async () => {
    const { db, userId } = await personaConSesion("acc-plan")
    const cuenta = await cuentaDe(await marcaConDueno(userId))
    const a = await crearPieza(db, { cuentaId: cuenta, formato: "texto", texto: "Una" })
    const b = await crearPieza(db, { cuentaId: cuenta, formato: "texto", texto: "Otra" })
    if (!a.ok || !b.ok) throw new Error("no se crearon")
    const planA = await planearConFechaPropuesta(db, a.piezaId)
    const planB = await planearConFechaPropuesta(db, b.piezaId)
    if (!planA.ok || !planB.ok) throw new Error("no se planearon")
    expect(Date.parse(planB.planeadaPara)).toBeGreaterThan(Date.parse(planA.planeadaPara))
  })

  test("moving the plan explains a taken slot and the past in words", async () => {
    const { db, userId } = await personaConSesion("acc-mover")
    const cuenta = await cuentaDe(await marcaConDueno(userId))
    const a = await crearPieza(db, { cuentaId: cuenta, formato: "texto", texto: "Una" })
    const b = await crearPieza(db, { cuentaId: cuenta, formato: "texto", texto: "Otra" })
    if (!a.ok || !b.ok) throw new Error("no se crearon")
    const cuando = enDias(4)
    expect(await planearPieza(db, { piezaId: a.piezaId, planeadaPara: cuando })).toEqual({ ok: true })
    expect(await planearPieza(db, { piezaId: b.piezaId, planeadaPara: cuando })).toEqual({
      ok: false,
      error: "Esa cuenta ya tiene una pieza a esa hora. Elige otra.",
    })
    expect(
      await planearPieza(db, { piezaId: b.piezaId, planeadaPara: new Date(Date.now() - 60_000).toISOString() }),
    ).toEqual({
      ok: false,
      error: "Elige una fecha y hora futuras.",
    })
  })

  test("signs for the reserve, refuses a stale version, and takes the piece out again", async () => {
    const { db, userId } = await personaConSesion("acc-reserva")
    const cuenta = await cuentaDe(await marcaConDueno(userId))
    const creada = await crearPieza(db, { cuentaId: cuenta, formato: "texto", texto: "Para la reserva" })
    if (!creada.ok) throw new Error(creada.error)
    expect(await firmarParaReserva(db, { piezaId: creada.piezaId, huella: "0".repeat(64) })).toEqual({
      ok: false,
      error: "La pieza cambió desde que la abriste. Revísala de nuevo antes de firmar.",
    })
    const { huella } = await versionVigente(creada.piezaId)
    expect(await firmarParaReserva(db, { piezaId: creada.piezaId, huella })).toEqual({ ok: true })
    expect(await sacarDeReserva(db, creada.piezaId)).toEqual({ ok: true })
    const { data: tras } = await admin()
      .from("piezas")
      .select("estado, planeada_para")
      .eq("id", creada.piezaId)
      .single()
    expect(tras?.estado).toBe("por_aprobar")
    expect(tras?.planeada_para).not.toBeNull()
    expect(await sacarDeReserva(db, creada.piezaId)).toEqual({
      ok: false,
      error: "Esta pieza ya no está en la reserva.",
    })
  })

  test("asegurarPlan plans an unplanned piece to sign and leaves a planned one alone", async () => {
    const { db, userId } = await personaConSesion("acc-asegurar")
    const cuenta = await cuentaDe(await marcaConDueno(userId))
    const creada = await crearPieza(db, { cuentaId: cuenta, formato: "texto", texto: "Sin plan" })
    if (!creada.ok) throw new Error(creada.error)
    expect(await asegurarPlan(db, creada.piezaId)).toEqual({ ok: true })
    const { data: antes } = await admin().from("piezas").select("planeada_para").eq("id", creada.piezaId).single()
    expect(antes?.planeada_para).not.toBeNull()
    expect(await asegurarPlan(db, creada.piezaId)).toEqual({ ok: true })
    const { data: despues } = await admin().from("piezas").select("planeada_para").eq("id", creada.piezaId).single()
    expect(despues?.planeada_para).toBe(antes?.planeada_para)

    const { huella } = await versionVigente(creada.piezaId)
    await firmarParaReserva(db, { piezaId: creada.piezaId, huella })
    expect(await asegurarPlan(db, creada.piezaId)).toEqual({ ok: true })
    const { data: enReserva } = await admin().from("piezas").select("planeada_para").eq("id", creada.piezaId).single()
    expect(enReserva?.planeada_para).toBeNull()
  })

  test("retries with the next slot when another piece takes the proposed one first", async () => {
    const { db, userId } = await personaConSesion("acc-carrera")
    const cuenta = await cuentaDe(await marcaConDueno(userId))
    const a = await crearPieza(db, { cuentaId: cuenta, formato: "texto", texto: "Una" })
    const b = await crearPieza(db, { cuentaId: cuenta, formato: "texto", texto: "Otra" })
    if (!a.ok || !b.ok) throw new Error("no se crearon")
    const ahora = Date.now()
    const primero = proponerFecha("persona", [], ahora)
    const segundo = proponerFecha("persona", [primero.getTime()], ahora)
    let robado = false
    const conCarrera: typeof db = new Proxy(db, {
      get(objetivo, propiedad) {
        const valor = Reflect.get(objetivo, propiedad, objetivo)
        if (propiedad !== "rpc") return typeof valor === "function" ? valor.bind(objetivo) : valor
        return async (...args: Parameters<typeof db.rpc>) => {
          if (!robado && args[0] === "planear_pieza") {
            robado = true
            await db.rpc("planear_pieza", { p_pieza: a.piezaId, p_fecha: primero.toISOString() })
          }
          return db.rpc(...args)
        }
      },
    })
    const plan = await planearConFechaPropuesta(conCarrera, b.piezaId, ahora)
    expect(plan).toEqual({ ok: true, planeadaPara: segundo.toISOString() })
  })

  test("planning never throws: an impossible clock comes back as a Spanish error", async () => {
    const { db, userId } = await personaConSesion("acc-sin-lanzar")
    const cuenta = await cuentaDe(await marcaConDueno(userId))
    const creada = await crearPieza(db, { cuentaId: cuenta, formato: "texto", texto: "Una" })
    if (!creada.ok) throw new Error(creada.error)
    const r = await planearConFechaPropuesta(db, creada.piezaId, Number.NaN)
    expect(r.ok).toBe(false)
  })
})

describe("pillars", () => {
  async function conPilar(prefijo: string) {
    const creada = await piezaCreada(prefijo)
    const linea = await creada.db.rpc("guardar_linea_editorial", {
      p_marca: creada.marca,
      p_base: 0,
      p_secciones: { deQueHablamos: "", tono: "", formatos: "", temasVetados: "", temasAVigilar: "", ejemplos: "" },
      p_pilares: [{ nombre: "Uno", deQueHabla: "", material: "", porSemana: 1 }],
    })
    if (linea.error) throw linea.error
    const { data } = await admin().from("pilares").select("id").eq("marca_id", creada.marca).single()
    if (!data) throw new Error("sin pilar")
    return { ...creada, pilar: data.id }
  }

  const pilarDe = async (pieza: string) =>
    (await admin().from("piezas").select("pilar_id").eq("id", pieza).single()).data?.pilar_id

  test("ponerPilar sets the pillar and answers in Spanish for a pillar of another brand", async () => {
    const { db, piezaId, pilar } = await conPilar("acc-pilar")
    const { pilar: ajeno } = await conPilar("acc-pilar-ajeno")
    expect(await ponerPilar(db, { piezaId, pilarId: pilar })).toEqual({ ok: true })
    expect(await pilarDe(piezaId)).toBe(pilar)
    expect(await ponerPilar(db, { piezaId, pilarId: ajeno })).toEqual({
      ok: false,
      error: "Ese pilar es de otra marca.",
    })
  })

  test("ponerPilar clears the pillar with null and refuses bad input", async () => {
    const { db, piezaId, pilar } = await conPilar("acc-pilar-quitar")
    await ponerPilar(db, { piezaId, pilarId: pilar })
    expect(await ponerPilar(db, { piezaId, pilarId: null })).toEqual({ ok: true })
    expect(await pilarDe(piezaId)).toBeNull()
    expect(await ponerPilar(db, { piezaId, pilarId: "no" })).toEqual({
      ok: false,
      error: "Revisa los datos de la pieza.",
    })
  })
})
