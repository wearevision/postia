import { randomUUID } from "node:crypto"
import { describe, expect, test } from "vitest"
import { paginasParaPieza, ponerDestino } from "@/lib/destino/acciones"
import type { Pagina, Web } from "@/lib/destino/paginas"
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

/** A correction written behind the app's back, the way a person could edit the text by hand. */
async function nuevaVersion(piezaId: string, numero: number, texto: string) {
  const { error } = await admin().from("versiones").insert({ pieza_id: piezaId, numero, huella: "", texto })
  if (error) throw error
}

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
      p_numero_esperado: 1,
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
      p_numero_esperado: 1,
      p_texto: conEnlace("k7m"),
      p_destino: "wav",
      p_destino_url: URL_WR3,
      p_codigo: "k7m",
    })
    expect(otraWeb.error?.code).toBe("23514")
    const malCodigo = await db.rpc("poner_destino", {
      p_pieza: piezaId,
      p_numero_esperado: 1,
      p_texto: conEnlace("k1m"),
      p_destino: "wr3",
      p_destino_url: URL_WR3,
      p_codigo: "k1m",
    })
    expect(malCodigo.error?.code).toBe("23514")
    const sinCodigo = await db.rpc("poner_destino", {
      p_pieza: piezaId,
      p_numero_esperado: 1,
      p_texto: "Hola",
      p_destino: "wr3",
      p_destino_url: URL_WR3,
      p_codigo: "k7m",
    })
    expect(sinCodigo.error?.message).toBe("falta_el_enlace")
  })

  test("refuses a destination without its page or code, and a code that sits on another page", async () => {
    const { db, piezaId } = await piezaDeTexto("dst-incompleto")
    const sinUrl = await db.rpc("poner_destino", {
      p_pieza: piezaId,
      p_texto: conEnlace("k7m"),
      p_numero_esperado: 1,
      p_destino: "wr3",
      p_codigo: "k7m",
    })
    expect(sinUrl.error?.message).toBe("destino_incompleto")
    const sinCodigo = await db.rpc("poner_destino", {
      p_pieza: piezaId,
      p_texto: conEnlace("k7m"),
      p_numero_esperado: 1,
      p_destino: "wr3",
      p_destino_url: URL_WR3,
    })
    expect(sinCodigo.error?.message).toBe("destino_incompleto")
    const otraPagina = await db.rpc("poner_destino", {
      p_pieza: piezaId,
      p_texto: "Hola https://wr3.wearevision.cl/?utm_content=k7m",
      p_numero_esperado: 1,
      p_destino: "wr3",
      p_destino_url: URL_WR3,
      p_codigo: "k7m",
    })
    expect(otraPagina.error?.message).toBe("falta_el_enlace")
  })

  test("the table refuses a destination with a missing column", async () => {
    const { piezaId } = await piezaDeTexto("dst-check")
    for (const fila of [
      { destino: "wr3", destino_url: URL_WR3, codigo_ref: null },
      { destino: "wr3", destino_url: null, codigo_ref: "k7m" },
      { destino: null, destino_url: URL_WR3, codigo_ref: "k7m" },
    ]) {
      const { error } = await admin().from("piezas").update(fila).eq("id", piezaId)
      expect(error?.code).toBe("23514")
    }
  })

  test("refuses a text written over a version that is no longer the latest", async () => {
    const { db, piezaId } = await piezaDeTexto("dst-carrera")
    await nuevaVersion(piezaId, 2, "Hola, corregido")
    const { error } = await db.rpc("poner_destino", {
      p_pieza: piezaId,
      p_texto: conEnlace("k7m"),
      p_numero_esperado: 1,
      p_destino: "wr3",
      p_destino_url: URL_WR3,
      p_codigo: "k7m",
    })
    expect(error?.message).toBe("version_cambiada")
    expect((await ultima(piezaId))?.texto).toBe("Hola, corregido")
  })

  test("keeps the code once chosen and two pieces cannot share one", async () => {
    const a = await piezaDeTexto("dst-a")
    const b = await piezaDeTexto("dst-b")
    await a.db.rpc("poner_destino", {
      p_pieza: a.piezaId,
      p_numero_esperado: 1,
      p_texto: conEnlace("abc"),
      p_destino: "wr3",
      p_destino_url: URL_WR3,
      p_codigo: "abc",
    })
    const otro = await a.db.rpc("poner_destino", {
      p_pieza: a.piezaId,
      p_numero_esperado: 2,
      p_texto: conEnlace("abd"),
      p_destino: "wr3",
      p_destino_url: URL_WR3,
      p_codigo: "abd",
    })
    expect(otro.error?.message).toBe("codigo_cambiado")
    const repetido = await b.db.rpc("poner_destino", {
      p_pieza: b.piezaId,
      p_numero_esperado: 1,
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
      p_numero_esperado: 1,
      p_texto: conEnlace("pqr"),
      p_destino: "wr3",
      p_destino_url: URL_WR3,
      p_codigo: "pqr",
    })
    const { error } = await db.rpc("poner_destino", { p_pieza: piezaId, p_texto: "Hola", p_numero_esperado: 2 })
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
      p_numero_esperado: 2,
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
    const { error } = await extrano.db.rpc("poner_destino", {
      p_pieza: piezaId,
      p_texto: "Hola",
      p_numero_esperado: 1,
    })
    expect(error?.message).toBe("solo_el_dueno_cambia_piezas")
  })
})

const PAGINAS_WR3: Pagina[] = [
  { url: "https://wr3.wearevision.cl/", titulo: "WR3", tema: "Investigación" },
  { url: URL_WR3, titulo: "Focus group", tema: "Hola focus" },
]
const lector = (paginas: Pagina[] | Error) => async (_: Web) => {
  if (paginas instanceof Error) throw paginas
  return paginas
}

describe("ponerDestino", () => {
  test("appends the link with a new code and lists pages ranked by the text", async () => {
    const { db, piezaId } = await piezaDeTexto("pd-ok", "Hola, hablemos de focus group")
    const lista = await paginasParaPieza(db, { piezaId, web: "wr3" }, lector(PAGINAS_WR3))
    expect(lista.ok && lista.paginas[0].url).toBe(URL_WR3)
    const r = await ponerDestino(db, { piezaId, web: "wr3", url: URL_WR3 }, lector(PAGINAS_WR3))
    expect(r.ok).toBe(true)
    const v = await ultima(piezaId)
    expect(v?.texto).toMatch(
      /^Hola, hablemos de focus group\n\nhttps:\/\/wr3\.wearevision\.cl\/guias\/focus-group\/\?utm_source=linkedin&utm_medium=social&utm_campaign=federico&utm_content=[23456789abcdefghjkmnpqrstuvwxyz]{3}$/,
    )
  })

  test("changing the page replaces the link and keeps the code", async () => {
    const { db, piezaId } = await piezaDeTexto("pd-cambio")
    await ponerDestino(db, { piezaId, web: "wr3", url: URL_WR3 }, lector(PAGINAS_WR3))
    const antes = (await admin().from("piezas").select("codigo_ref").eq("id", piezaId).single()).data?.codigo_ref
    await ponerDestino(db, { piezaId, web: "wr3", url: "https://wr3.wearevision.cl/" }, lector(PAGINAS_WR3))
    const v = await ultima(piezaId)
    expect(v?.texto.match(/https:\/\//g)).toHaveLength(1)
    expect(v?.texto).toContain(
      `https://wr3.wearevision.cl/?utm_source=linkedin&utm_medium=social&utm_campaign=federico&utm_content=${antes}`,
    )
  })

  test("changing the page after a correction moved the link into a sentence leaves only one link", async () => {
    const { db, piezaId } = await piezaDeTexto("pd-movido")
    await ponerDestino(db, { piezaId, web: "wr3", url: URL_WR3 }, lector(PAGINAS_WR3))
    const v = await ultima(piezaId)
    const enlace = v?.texto.split("\n\n")[1] ?? ""
    await nuevaVersion(piezaId, (v?.numero ?? 0) + 1, `Hola, lee ${enlace} y cuéntame.`)
    expect(
      await ponerDestino(db, { piezaId, web: "wr3", url: "https://wr3.wearevision.cl/" }, lector(PAGINAS_WR3)),
    ).toEqual({ ok: true })
    const texto = (await ultima(piezaId))?.texto ?? ""
    expect(texto.match(/https:\/\//g)).toHaveLength(1)
    expect(texto.startsWith("Hola, lee y cuéntame.\n\nhttps://wr3.wearevision.cl/?")).toBe(true)
  })

  test("choosing the same page again puts back a link the text lost, and refuses it while the link is there", async () => {
    const { db, piezaId } = await piezaDeTexto("pd-otra-vez")
    await ponerDestino(db, { piezaId, web: "wr3", url: URL_WR3 }, lector(PAGINAS_WR3))
    expect(await ponerDestino(db, { piezaId, web: "wr3", url: URL_WR3 }, lector(PAGINAS_WR3))).toEqual({
      ok: false,
      error: "Ya tiene ese destino.",
    })
    const v = await ultima(piezaId)
    await nuevaVersion(piezaId, (v?.numero ?? 0) + 1, "Hola sin enlace")
    expect(await ponerDestino(db, { piezaId, web: "wr3", url: URL_WR3 }, lector(PAGINAS_WR3))).toEqual({ ok: true })
    expect((await ultima(piezaId))?.texto).toMatch(
      /^Hola sin enlace\n\nhttps:\/\/wr3\.wearevision\.cl\/guias\/focus-group\/\?/,
    )
  })

  test("no link removes it from the text", async () => {
    const { db, piezaId } = await piezaDeTexto("pd-sin")
    await ponerDestino(db, { piezaId, web: "wr3", url: URL_WR3 }, lector(PAGINAS_WR3))
    expect(await ponerDestino(db, { piezaId, web: null, url: null }, lector(PAGINAS_WR3))).toEqual({ ok: true })
    expect((await ultima(piezaId))?.texto).toBe("Hola")
  })

  test("refuses a URL that is not in paginas.json and says when the list cannot be read", async () => {
    const { db, piezaId } = await piezaDeTexto("pd-mal")
    expect(
      await ponerDestino(db, { piezaId, web: "wr3", url: "https://wr3.wearevision.cl/otra/" }, lector(PAGINAS_WR3)),
    ).toEqual({
      ok: false,
      error: "Esa página no está en la lista de WR3.",
    })
    expect(await ponerDestino(db, { piezaId, web: "wr3", url: URL_WR3 }, lector(new Error("503")))).toEqual({
      ok: false,
      error: "No pude leer las páginas de WR3.",
    })
  })

  test("says the text changed when a correction lands while the page is being chosen", async () => {
    const { db, piezaId } = await piezaDeTexto("pd-carrera")
    const corregirMientras = async (_: Web) => {
      await nuevaVersion(piezaId, 2, "Hola, corregido")
      return PAGINAS_WR3
    }
    expect(await ponerDestino(db, { piezaId, web: "wr3", url: URL_WR3 }, corregirMientras)).toEqual({
      ok: false,
      error: "El texto cambió mientras elegías. Recarga y vuelve a elegir.",
    })
    expect((await ultima(piezaId))?.texto).toBe("Hola, corregido")
  })

  test("refuses a text that would pass 3000 characters with the link", async () => {
    const { db, piezaId } = await piezaDeTexto("pd-largo", "a".repeat(2950))
    expect(await ponerDestino(db, { piezaId, web: "wr3", url: URL_WR3 }, lector(PAGINAS_WR3))).toEqual({
      ok: false,
      error: "Con el enlace, el texto pasa los 3000 caracteres de LinkedIn. Acórtalo primero.",
    })
  })
})
