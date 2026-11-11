import { randomUUID } from "node:crypto"
import { describe, expect, test } from "vitest"
import { crearPieza } from "@/lib/piezas/acciones"
import { admin, cuentaDe, marcaConDueno, personaConSesion } from "./entorno"

async function piezaDeTexto(prefijo: string, texto = "Hola") {
  const { db, userId } = await personaConSesion(prefijo)
  const marca = await marcaConDueno(userId)
  const cuenta = await cuentaDe(marca)
  const creada = await crearPieza(db, { cuentaId: cuenta, formato: "texto", texto })
  if (!creada.ok) throw new Error(creada.error)
  return { db, piezaId: creada.piezaId, marca }
}

const URL_WR3 = "https://wr3.wearevision.cl/guias/focus-group/"
const conEnlace = (codigo: string) =>
  `Hola\n\n${URL_WR3}?utm_source=linkedin&utm_medium=social&utm_campaign=federico&utm_content=${codigo}`

async function ultima(piezaId: string) {
  const { data } = await admin()
    .from("versiones")
    .select("numero, texto, origen")
    .eq("pieza_id", piezaId)
    .order("numero", { ascending: false })
    .limit(1)
    .single()
  return data
}

describe("poner_destino", () => {
  test("stores the destination and the link as a new person version", async () => {
    const { db, piezaId } = await piezaDeTexto("dst-ok")
    const { error } = await db.rpc("poner_destino", {
      p_pieza: piezaId,
      p_texto: conEnlace("k7m"),
      p_destino: "wr3",
      p_destino_url: URL_WR3,
      p_codigo: "k7m",
    })
    expect(error).toBeNull()
    const { data: p } = await admin()
      .from("piezas")
      .select("destino, destino_url, codigo_ref")
      .eq("id", piezaId)
      .single()
    expect(p).toEqual({ destino: "wr3", destino_url: URL_WR3, codigo_ref: "k7m" })
    expect(await ultima(piezaId)).toEqual({ numero: 2, texto: conEnlace("k7m"), origen: "persona" })
  })

  test("refuses a URL from the other site, a malformed code and a text without the code", async () => {
    const { db, piezaId } = await piezaDeTexto("dst-mal")
    const otraWeb = await db.rpc("poner_destino", {
      p_pieza: piezaId,
      p_texto: conEnlace("k7m"),
      p_destino: "wav",
      p_destino_url: URL_WR3,
      p_codigo: "k7m",
    })
    expect(otraWeb.error?.code).toBe("23514")
    const malCodigo = await db.rpc("poner_destino", {
      p_pieza: piezaId,
      p_texto: conEnlace("k1m"),
      p_destino: "wr3",
      p_destino_url: URL_WR3,
      p_codigo: "k1m",
    })
    expect(malCodigo.error?.code).toBe("23514")
    const sinCodigo = await db.rpc("poner_destino", {
      p_pieza: piezaId,
      p_texto: "Hola",
      p_destino: "wr3",
      p_destino_url: URL_WR3,
      p_codigo: "k7m",
    })
    expect(sinCodigo.error?.message).toBe("falta_el_enlace")
  })

  test("keeps the code once chosen and two pieces cannot share one", async () => {
    const a = await piezaDeTexto("dst-a")
    const b = await piezaDeTexto("dst-b")
    await a.db.rpc("poner_destino", {
      p_pieza: a.piezaId,
      p_texto: conEnlace("abc"),
      p_destino: "wr3",
      p_destino_url: URL_WR3,
      p_codigo: "abc",
    })
    const otro = await a.db.rpc("poner_destino", {
      p_pieza: a.piezaId,
      p_texto: conEnlace("abd"),
      p_destino: "wr3",
      p_destino_url: URL_WR3,
      p_codigo: "abd",
    })
    expect(otro.error?.message).toBe("codigo_cambiado")
    const repetido = await b.db.rpc("poner_destino", {
      p_pieza: b.piezaId,
      p_texto: conEnlace("abc"),
      p_destino: "wr3",
      p_destino_url: URL_WR3,
      p_codigo: "abc",
    })
    expect(repetido.error?.code).toBe("23505")
  })

  test("going back to no link clears the three columns", async () => {
    const { db, piezaId } = await piezaDeTexto("dst-sin")
    await db.rpc("poner_destino", {
      p_pieza: piezaId,
      p_texto: conEnlace("pqr"),
      p_destino: "wr3",
      p_destino_url: URL_WR3,
      p_codigo: "pqr",
    })
    const { error } = await db.rpc("poner_destino", { p_pieza: piezaId, p_texto: "Hola" })
    expect(error).toBeNull()
    const { data: p } = await admin()
      .from("piezas")
      .select("destino, destino_url, codigo_ref")
      .eq("id", piezaId)
      .single()
    expect(p).toEqual({ destino: null, destino_url: null, codigo_ref: null })
  })

  test("a carousel version keeps its title, PDF, theme and design", async () => {
    const { db, piezaId, marca } = await piezaDeTexto("dst-car")
    const ruta = `${marca}/${randomUUID()}.pdf`
    // Turn the fixture into a carousel version the way guardar_diseno would, through the admin client.
    await admin().from("piezas").update({ formato: "carrusel_pdf" }).eq("id", piezaId)
    const ins = await admin()
      .from("versiones")
      .insert({
        pieza_id: piezaId,
        numero: 2,
        huella: "", // the versions trigger recomputes it
        texto: "Hola",
        titulo: "WR3",
        archivo_ruta: ruta,
        archivo_sha256: "b".repeat(64),
        tema: "oscura",
        diseno: { laminas: [] },
      })
    expect(ins.error).toBeNull()
    await db.rpc("poner_destino", {
      p_pieza: piezaId,
      p_texto: conEnlace("xyz"),
      p_destino: "wr3",
      p_destino_url: URL_WR3,
      p_codigo: "xyz",
    })
    const { data } = await admin()
      .from("versiones")
      .select("numero, titulo, archivo_ruta, archivo_sha256, tema, diseno")
      .eq("pieza_id", piezaId)
      .order("numero", { ascending: false })
      .limit(1)
      .single()
    expect(data).toEqual({
      numero: 3,
      titulo: "WR3",
      archivo_ruta: ruta,
      archivo_sha256: "b".repeat(64),
      tema: "oscura",
      diseno: { laminas: [] },
    })
  })

  test("only the brand owner can call it", async () => {
    const { piezaId } = await piezaDeTexto("dst-dueno")
    const extrano = await personaConSesion("dst-extrano")
    const { error } = await extrano.db.rpc("poner_destino", { p_pieza: piezaId, p_texto: "Hola" })
    expect(error?.message).toBe("solo_el_dueno_cambia_piezas")
  })
})
