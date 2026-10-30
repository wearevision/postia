import { describe, expect, test } from "vitest"
import { detalle } from "@/lib/piezas/lectura"
import { estadoDeRedaccion, pedidosRecientes } from "@/lib/redaccion/lectura"
import { admin, cuentaDe, marcaConDueno, personaConSesion, piezaDe, versionVigente } from "./entorno"

const SECCIONES = { deQueHablamos: "", tono: "", formatos: "", temasVetados: "", temasAVigilar: "", ejemplos: "" }

async function conLinea() {
  const persona = await personaConSesion("lectura-redaccion")
  const marca = await marcaConDueno(persona.userId)
  await persona.db.rpc("guardar_linea_editorial", {
    p_marca: marca,
    p_base: 0,
    p_secciones: SECCIONES,
    p_pilares: [{ nombre: "Uno", deQueHabla: "", material: "", porSemana: 1 }],
  })
  return { ...persona, marca, cuenta: await cuentaDe(marca) }
}

describe("pedidosRecientes", () => {
  test("lists a member's write requests, newest first, with account and state", async () => {
    const e = await conLinea()
    await e.db.rpc("pedir_texto", { p_cuenta: e.cuenta, p_encargo: "Primero" })
    await e.db.rpc("pedir_texto", { p_cuenta: e.cuenta, p_encargo: "Segundo" })
    const pedidos = await pedidosRecientes(e.db)
    expect(pedidos.map((p) => p.encargo).slice(0, 2)).toEqual(["Segundo", "Primero"])
    expect(pedidos[0]).toMatchObject({ estado: "pendiente", piezaId: null })
  })
})

describe("estadoDeRedaccion", () => {
  test("says a request is open, how many rewrites are left and the current version's review", async () => {
    const e = await conLinea()
    const pieza = await piezaDe(e.db, e.cuenta, "Uno")
    expect(await estadoDeRedaccion(e.db, pieza, (await versionVigente(pieza)).id)).toEqual({
      pedidoAbierto: false,
      reescriturasQuedan: 3,
      revision: null,
      ultimoFallo: null,
      revisandoAuto: false,
      reescribiendo: false,
    })
    await e.db.rpc("pedir_reescritura", { p_pieza: pieza, p_instruccion: "Corto" })
    const estado = await estadoDeRedaccion(e.db, pieza, (await versionVigente(pieza)).id)
    expect(estado).toMatchObject({ pedidoAbierto: true, reescriturasQuedan: 2, reescribiendo: true })
    await admin()
      .from("pedidos_de_texto")
      .update({ estado: "fallo", motivo: "Se alcanzó el tope." })
      .eq("pieza_id", pieza)
    expect((await estadoDeRedaccion(e.db, pieza, (await versionVigente(pieza)).id)).ultimoFallo).toBe(
      "Se alcanzó el tope.",
    )
  })
  test("a Claude version without a review is still being reviewed for 5 minutes after it was created", async () => {
    const e = await conLinea()
    const pieza = await piezaDe(e.db, e.cuenta, "Uno")
    const { data: version, error } = await admin()
      .from("versiones")
      .insert({ pieza_id: pieza, numero: 2, texto: "Dos", huella: "", origen: "claude", linea_version: 1 })
      .select("id, creada_en")
      .single()
    if (error) throw error
    const creada = Date.parse(version.creada_en)
    expect((await estadoDeRedaccion(e.db, pieza, version.id, creada + 60_000)).revisandoAuto).toBe(true)
    expect((await estadoDeRedaccion(e.db, pieza, version.id, creada + 5 * 60_000 + 1)).revisandoAuto).toBe(false)
    await admin()
      .from("revisiones_ia")
      .insert({ version_id: version.id, veredicto: { voz: { ok: true, comentario: "" }, hallazgos: [] } })
    expect((await estadoDeRedaccion(e.db, pieza, version.id, creada + 60_000)).revisandoAuto).toBe(false)
  })

  test("an open review request is not a rewrite", async () => {
    const e = await conLinea()
    const pieza = await piezaDe(e.db, e.cuenta, "Uno")
    await e.db.rpc("pedir_revision", { p_pieza: pieza })
    expect(await estadoDeRedaccion(e.db, pieza, (await versionVigente(pieza)).id)).toMatchObject({
      pedidoAbierto: true,
      reescribiendo: false,
    })
  })

  test("a version written by hand is never waiting for an automatic review", async () => {
    const e = await conLinea()
    const pieza = await piezaDe(e.db, e.cuenta, "Uno")
    expect((await estadoDeRedaccion(e.db, pieza, (await versionVigente(pieza)).id)).revisandoAuto).toBe(false)
  })
})

describe("detalle", () => {
  test("carries the version id and who wrote it", async () => {
    const e = await conLinea()
    const pieza = await piezaDe(e.db, e.cuenta, "Uno")
    const d = await detalle(e.db, pieza)
    expect(d?.version).toMatchObject({ id: (await versionVigente(pieza)).id, origen: "persona" })
  })
})
