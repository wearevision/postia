import { describe, expect, test } from "vitest"
import { crearPieza, firmarPieza } from "@/lib/piezas/acciones"
import { proponerFecha } from "@/lib/piezas/horarios"
import { bandeja, detalle } from "@/lib/piezas/lectura"
import { admin, cuentaDe, marcaConDueno, personaConSesion } from "./entorno"

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
    expect(await bandeja(extrano.db)).toEqual({ porFirmar: [], aMano: [], revisar: [], proximas: [] })
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
