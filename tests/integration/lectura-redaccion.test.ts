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
    })
    await e.db.rpc("pedir_reescritura", { p_pieza: pieza, p_instruccion: "Corto" })
    const estado = await estadoDeRedaccion(e.db, pieza, (await versionVigente(pieza)).id)
    expect(estado).toMatchObject({ pedidoAbierto: true, reescriturasQuedan: 2 })
    await admin()
      .from("pedidos_de_texto")
      .update({ estado: "fallo", motivo: "Se alcanzó el tope." })
      .eq("pieza_id", pieza)
    expect((await estadoDeRedaccion(e.db, pieza, (await versionVigente(pieza)).id)).ultimoFallo).toBe(
      "Se alcanzó el tope.",
    )
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
