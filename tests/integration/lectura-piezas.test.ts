import { createHash } from "node:crypto"
import { describe, expect, test } from "vitest"
import { crearPieza, firmarPieza } from "@/lib/piezas/acciones"
import { proponerFecha } from "@/lib/piezas/horarios"
import { bandeja, detalle } from "@/lib/piezas/lectura"
import { carruselInicial } from "@/lib/plantillas/iniciales"
import type { Json } from "@/lib/supabase/database.types"
import { admin, cuentaDe, enDias, marcaConDueno, personaConSesion, versionVigente } from "./entorno"

/** The gate 1 page render time the form sends with a signature. */
const ABIERTA = () => new Date().toISOString()

const DIA_MS = 86_400_000

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

async function entorno(prefijo: string) {
  const { db, userId } = await personaConSesion(prefijo)
  const marca = await marcaConDueno(userId)
  const cuenta = await cuentaDe(marca)
  return { db, marca, cuenta }
}

type Entorno = Awaited<ReturnType<typeof entorno>>

async function nueva(e: Entorno, texto: string) {
  const r = await crearPieza(e.db, { cuentaId: e.cuenta, formato: "texto", texto })
  if (!r.ok) throw new Error(r.error)
  return r.piezaId
}

async function firmada(e: Entorno, texto: string, cuando: Date) {
  const piezaId = await nueva(e, texto)
  const r = await firmarPieza(e.db, {
    abiertaEn: ABIERTA(),
    piezaId,
    huella: await huellaVigente(piezaId),
    programadaPara: cuando.toISOString(),
  })
  if (!r.ok) throw new Error(r.error)
  return piezaId
}

async function mover(piezaId: string, ...estados: string[]) {
  for (const estado of estados) {
    const { error } = await admin().from("piezas").update({ estado }).eq("id", piezaId)
    if (error) throw error
  }
}

const SHA_DEL_PDF = createHash("sha256").update("%PDF-1.4\nhola").digest("hex")

describe("tray", () => {
  test("groups a member's pieces by what they need and orders upcoming ones by date", async () => {
    const e = await entorno("lec-bandeja")
    const ahora = Date.now()
    const porFirmar = await nueva(e, "Esperando firma")
    const aMano = await firmada(e, "Va a mano", new Date(ahora + 3 * DIA_MS))
    await mover(aMano, "a_mano")
    const dudosa = await firmada(e, "Envío dudoso", new Date(ahora + 4 * DIA_MS))
    await mover(dudosa, "publicando", "envio_dudoso")
    const conError = await firmada(e, "Con error", new Date(ahora + 5 * DIA_MS))
    await mover(conError, "publicando", "error")
    const lejana = await firmada(e, "Muy lejana", new Date(ahora + 20 * DIA_MS))
    const lejisima = await firmada(e, "Más lejana aún", new Date(ahora + 40 * DIA_MS))
    const tardia = await firmada(e, "Cerca pero después", new Date(ahora + 2 * DIA_MS))
    const temprana = await firmada(e, "Cerca y primero", new Date(ahora + 1 * DIA_MS))
    const descartada = await nueva(e, "Descartada")
    await mover(descartada, "descartada")

    const b = await bandeja(e.db, ahora)

    expect(b.porFirmar.map((t) => t.id)).toEqual([porFirmar])
    expect(b.aMano.map((t) => t.id)).toEqual([aMano])
    expect(b.revisar.map((t) => t.id).sort()).toEqual([dudosa, conError].sort())
    expect(b.proximas.map((t) => t.id)).toEqual([temprana, tardia])
    expect([...b.porFirmar, ...b.aMano, ...b.revisar, ...b.proximas].map((t) => t.id)).not.toContain(lejana)
    expect(b.masAdelante.map((t) => t.id)).toEqual([lejana, lejisima])
    expect(b.porFirmar[0]).toMatchObject({ estado: "por_aprobar", extracto: "Esperando firma", motivo: null })
  })

  test("shortens a long extract and names the account and the brand", async () => {
    const e = await entorno("lec-extracto")
    await nueva(e, "x".repeat(200))
    const { data: cuenta } = await admin().from("cuentas").select("nombre, marcas(nombre)").eq("id", e.cuenta).single()
    const b = await bandeja(e.db)
    expect(b.porFirmar[0]?.extracto).toBe(`${"x".repeat(90)}…`)
    expect(b.porFirmar[0]?.cuenta).toBe(cuenta?.nombre)
    expect(b.porFirmar[0]?.marca).toBe(cuenta?.marcas?.nombre)
  })

  test("a stranger's tray is empty", async () => {
    const e = await entorno("lec-dueno")
    await nueva(e, "Privada")
    const extrano = await personaConSesion("lec-extrano")
    expect(await bandeja(extrano.db)).toEqual({
      porFirmar: [],
      enReserva: [],
      aMano: [],
      revisar: [],
      proximas: [],
      masAdelante: [],
    })
  })
})

describe("detail", () => {
  test("returns the piece, its account, the latest version and a signed URL for the file", async () => {
    const { db, userId } = await personaConSesion("lec-detalle")
    const marca = await marcaConDueno(userId)
    const cuenta = await cuentaDe(marca, "empresa", "a_mano")
    const ruta = `${marca}/${crypto.randomUUID()}.pdf`
    await db.storage
      .from("piezas")
      .upload(ruta, new TextEncoder().encode("%PDF-1.4\nhola"), { contentType: "application/pdf" })
    const creada = await crearPieza(db, {
      cuentaId: cuenta,
      formato: "carrusel_pdf",
      texto: "Texto",
      titulo: "Título",
      archivoRuta: ruta,
      archivoSha256: SHA_DEL_PDF,
    })
    if (!creada.ok) throw new Error(creada.error)

    const d = await detalle(db, creada.piezaId)

    expect(d).toMatchObject({
      id: creada.piezaId,
      estado: "por_aprobar",
      formato: "carrusel_pdf",
      motivo: null,
      enlace: null,
      programadaPara: null,
      cuenta: { id: cuenta, tipo: "empresa", ruta: "a_mano" },
      version: { texto: "Texto", titulo: "Título", huella: await huellaVigente(creada.piezaId) },
    })
    expect(d?.version.archivoUrl).toMatch(/^https?:\/\//)
    const respuesta = await fetch(d?.version.archivoUrl ?? "")
    expect(respuesta.ok).toBe(true)
    expect(await respuesta.text()).toBe("%PDF-1.4\nhola")
    const descarga = await fetch(d?.version.archivoDescarga ?? "")
    expect(descarga.headers.get("content-disposition")).toMatch(/attachment/)
  })

  test("a text piece has no file URL", async () => {
    const e = await entorno("lec-sin-archivo")
    const d = await detalle(e.db, await nueva(e, "Solo texto"))
    expect(d?.version.archivoUrl).toBeNull()
  })

  test("proposes the next slot of the account and skips the ones already taken", async () => {
    const e = await entorno("lec-fecha")
    const ahora = Date.now()
    const primero = proponerFecha("persona", [], ahora)
    const segundo = proponerFecha("persona", [primero.getTime()], ahora)
    const libre = await nueva(e, "Libre")
    expect((await detalle(e.db, libre, ahora))?.fechaPropuesta).toBe(primero.toISOString())

    await firmada(e, "Ocupa el primer horario", primero)

    expect((await detalle(e.db, libre, ahora))?.fechaPropuesta).toBe(segundo.toISOString())
  })

  test("returns the latest version after a new one", async () => {
    const e = await entorno("lec-version")
    const piezaId = await nueva(e, "Primera")
    const { error } = await e.db.rpc("nueva_version", { p_pieza: piezaId, p_texto: "Segunda" })
    expect(error).toBeNull()
    expect((await detalle(e.db, piezaId))?.version.texto).toBe("Segunda")
  })

  test("returns null for a piece the person cannot see or that does not exist", async () => {
    const e = await entorno("lec-ajena")
    const piezaId = await nueva(e, "Privada")
    const extrano = await personaConSesion("lec-ajeno")
    expect(await detalle(extrano.db, piezaId)).toBeNull()
    expect(await detalle(e.db, crypto.randomUUID())).toBeNull()
  })

  test("returns null for an id that is not a uuid without asking the database", async () => {
    const e = await entorno("lec-no-uuid")
    expect(await detalle(e.db, "no-es-uuid")).toBeNull()
  })

  test("cuts the extract by characters, never inside an emoji", async () => {
    const e = await entorno("lec-emoji")
    await nueva(e, "😀".repeat(100))
    const b = await bandeja(e.db)
    expect(b.porFirmar[0]?.extracto).toBe(`${"😀".repeat(90)}…`)
  })

  test("keeps the pieces waiting for a signature in creation order", async () => {
    const e = await entorno("lec-orden")
    const ids = [await nueva(e, "uno"), await nueva(e, "dos"), await nueva(e, "tres")]
    expect((await bandeja(e.db)).porFirmar.map((t) => t.id)).toEqual(ids)
  })
})

describe("plans and the reserve", () => {
  test("the tray keeps a reserve piece apart from the ones to sign and carries the plan of a planned card", async () => {
    const e = await entorno("lec-reserva")
    const reserva = await nueva(e, "Para la reserva")
    const planeada = await nueva(e, "Planeada")
    const plan = enDias(3)
    const pasos = [
      await e.db.rpc("firmar_para_reserva", { p_pieza: reserva, p_huella: (await versionVigente(reserva)).huella }),
      await e.db.rpc("planear_pieza", { p_pieza: planeada, p_fecha: plan }),
    ]
    for (const paso of pasos) if (paso.error) throw paso.error

    const b = await bandeja(e.db)

    expect(b.enReserva.map((t) => t.id)).toEqual([reserva])
    expect(b.porFirmar.map((t) => t.id)).toEqual([planeada])
    expect(Date.parse(b.porFirmar[0]?.planeadaPara ?? "")).toBe(Date.parse(plan))
    expect(b.enReserva[0]?.planeadaPara).toBeNull()
  })

  test("detail of a piece planned in the future proposes that very slot", async () => {
    const e = await entorno("lec-plan-propio")
    const piezaId = await nueva(e, "Con plan")
    const plan = enDias(5)
    const { error } = await e.db.rpc("planear_pieza", { p_pieza: piezaId, p_fecha: plan })
    expect(error).toBeNull()

    const d = await detalle(e.db, piezaId)

    expect(Date.parse(d?.planeadaPara ?? "")).toBe(Date.parse(plan))
    expect(d?.fechaPropuesta).toBe(new Date(plan).toISOString())
  })

  test("detail of an unplanned piece skips the slot another piece plans", async () => {
    const e = await entorno("lec-plan-ajeno")
    const ahora = Date.now()
    const primero = proponerFecha("persona", [], ahora)
    const segundo = proponerFecha("persona", [primero.getTime()], ahora)
    const otra = await nueva(e, "Otra")
    const libre = await nueva(e, "Libre")
    const { error } = await e.db.rpc("planear_pieza", { p_pieza: otra, p_fecha: primero.toISOString() })
    expect(error).toBeNull()

    expect((await detalle(e.db, libre, ahora))?.fechaPropuesta).toBe(segundo.toISOString())
  })

  test("detail replaces a plan that is about to be due with the next free slot, never with the plan itself", async () => {
    const e = await entorno("lec-plan-vencido")
    const ahora = Date.now()
    const primero = proponerFecha("persona", [], ahora)
    const propia = await nueva(e, "Propia")
    const { error } = await e.db.rpc("planear_pieza", { p_pieza: propia, p_fecha: primero.toISOString() })
    expect(error).toBeNull()
    // Seen from 30 seconds before its slot, the plan is no longer a usable proposal.
    const casiVencido = primero.getTime() - 30_000

    const propuesta = (await detalle(e.db, propia, casiVencido))?.fechaPropuesta
    expect(Date.parse(propuesta ?? "")).toBeGreaterThanOrEqual(casiVencido + 30 * 60_000)
    expect(propuesta).not.toBe(primero.toISOString())
  })
})

describe("detalle and pillars", () => {
  test("knows the piece's pillar, its brand and the brand's voice", async () => {
    const e = await entorno("lect-pilar")
    const pieza = await nueva(e, "Con pilar")
    await e.db.rpc("guardar_linea_editorial", {
      p_marca: e.marca,
      p_base: 0,
      p_secciones: { deQueHablamos: "", tono: "", formatos: "", temasVetados: "", temasAVigilar: "", ejemplos: "" },
      p_pilares: [{ nombre: "Uno", deQueHabla: "", material: "", porSemana: 1 }],
    })
    const { data } = await admin().from("pilares").select("id").eq("marca_id", e.marca).single()
    expect((await detalle(e.db, pieza))?.pilarId).toBeNull()
    await e.db.rpc("poner_pilar", { p_pieza: pieza, p_pilar: data?.id })
    const d = await detalle(e.db, pieza)
    expect(d?.pilarId).toBe(data?.id)
    expect(d?.pilarNombre).toBe("Uno")
    expect(d?.cuenta.marcaId).toBe(e.marca)
    expect(d?.cuenta.voz).toBe("yo")
  })
})

/** Seconds a signed storage URL lives: its token is a JWT with iat and exp. */
function vidaDelEnlace(url: string): number {
  const token = new URL(url).searchParams.get("token") ?? ""
  const { iat, exp } = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()) as {
    iat: number
    exp: number
  }
  return exp - iat
}

/** A carousel saved through the worker's RPCs, with the first `vistas` previews uploaded next to its PDF. */
async function carruselGuardado(nombre: string, diseno: unknown, vistas: number) {
  const { db, userId } = await personaConSesion(nombre)
  const marca = await marcaConDueno(userId, "nosotros")
  const cuenta = await cuentaDe(marca, "empresa", "a_mano")
  // pedir_diseno checks only the shape (3 to 10 slides); the server action parses the slides before it.
  const pedido = await db.rpc("pedir_diseno", {
    p_cuenta: cuenta,
    p_tema: "wav-noche",
    p_titulo: "Documento",
    p_texto: "Post",
    p_diseno: diseno as Json,
  })
  if (pedido.error) throw pedido.error
  await admin()
    .from("pedidos_de_diseno")
    .update({ estado: "obsoleto" })
    .in("estado", ["pendiente", "trabajando"])
    .neq("id", pedido.data)
  await admin().rpc("tomar_pedidos_de_diseno")
  const base = `${marca}/${crypto.randomUUID()}`
  const pdf = await admin()
    .storage.from("piezas")
    .upload(`${base}.pdf`, new TextEncoder().encode("%PDF-1.4"), { contentType: "application/pdf" })
  if (pdf.error) throw pdf.error
  for (let n = 1; n <= vistas; n++) {
    const jpg = await admin()
      .storage.from("piezas")
      .upload(`${base}/${String(n).padStart(2, "0")}.jpg`, new Uint8Array([0xff, 0xd8, 0xff, n]), {
        contentType: "image/jpeg",
      })
    if (jpg.error) throw jpg.error
  }
  const guardado = await admin().rpc("guardar_diseno", {
    p_pedido: pedido.data,
    p_archivo_ruta: `${base}.pdf`,
    p_archivo_sha256: "c".repeat(64),
  })
  if (guardado.error) throw guardado.error
  return { db, piezaId: (guardado.data as { pieza: string }).pieza }
}

describe("detalle of a carousel built from the templates", () => {
  test("carries the theme, the slides and a signed preview per slide", async () => {
    const diseno = carruselInicial("wav")
    expect(diseno.laminas).toHaveLength(9)
    const { db, piezaId } = await carruselGuardado("lec-carrusel", diseno, 9)

    const d = await detalle(db, piezaId)

    expect(d?.version.tema).toBe("wav-noche")
    expect(d?.version.diseno).toEqual(diseno)
    const vistas = d?.version.vistas ?? []
    expect(vistas).toHaveLength(9)
    vistas.forEach((url, i) => {
      expect(new URL(url).pathname).toMatch(new RegExp(`/${String(i + 1).padStart(2, "0")}\\.jpg$`))
    })
    // An hour: Federico may leave gate 1 open while he reads the slides.
    for (const url of [...vistas, d?.version.archivoUrl, d?.version.archivoDescarga])
      expect(vidaDelEnlace(url ?? "")).toBe(3600)
    const primera = await fetch(vistas[0] ?? "")
    expect(primera.ok).toBe(true)
    expect(new Uint8Array(await primera.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff, 1]))
  })

  test("a carousel whose previews were never uploaded opens without them and keeps its PDF link", async () => {
    const diseno = carruselInicial("wav")
    const { db, piezaId } = await carruselGuardado("lec-carrusel-sin-vistas", diseno, 0)

    const d = await detalle(db, piezaId)

    expect(d?.version.diseno).toEqual(diseno)
    expect(d?.version.vistas).toEqual([])
    expect(d?.version.archivoUrl).not.toBeNull()
  })

  test("a stored design that no longer parses keeps its raw value for the client review", async () => {
    const viejo = {
      antetitulo: "Serie",
      laminas: [
        { tipo: "retirada", titulo: "Cliente reservado" },
        { tipo: "retirada", titulo: "Dos" },
        { tipo: "retirada", titulo: "Tres" },
      ],
    }
    const { db, piezaId } = await carruselGuardado("lec-carrusel-viejo", viejo, 0)

    const d = await detalle(db, piezaId)

    expect(d?.version.diseno).toBeNull()
    expect(d?.version.disenoCrudo).toEqual(viejo)
    expect(d?.version.vistas).toEqual([])
    expect(d?.version.archivoUrl).not.toBeNull()
  })

  test("a hand-made PDF carousel has no slides and no previews", async () => {
    const { db, userId } = await personaConSesion("lec-carrusel-a-mano")
    const marca = await marcaConDueno(userId)
    const cuenta = await cuentaDe(marca, "empresa", "a_mano")
    const ruta = `${marca}/${crypto.randomUUID()}.pdf`
    await db.storage.from("piezas").upload(ruta, new TextEncoder().encode("%PDF-1.4\nhola"), {
      contentType: "application/pdf",
    })
    const creada = await crearPieza(db, {
      cuentaId: cuenta,
      formato: "carrusel_pdf",
      texto: "Texto",
      titulo: "Título",
      archivoRuta: ruta,
      archivoSha256: SHA_DEL_PDF,
    })
    if (!creada.ok) throw new Error(creada.error)
    const d = await detalle(db, creada.piezaId)
    expect(d?.version).toMatchObject({ tema: null, diseno: null, vistas: [] })
    expect(d?.version.archivoUrl).toMatch(/^https?:\/\//)
  })
})
