import { describe, expect, test } from "vitest"
import { corregirTexto, pedirReescritura, pedirRevision, pedirTexto } from "@/lib/redaccion/acciones"
import { admin, cuentaDe, marcaConDueno, personaConSesion, piezaDe, versionVigente } from "./entorno"

const SECCIONES = { deQueHablamos: "", tono: "", formatos: "", temasVetados: "", temasAVigilar: "", ejemplos: "" }

async function conLinea() {
  const persona = await personaConSesion("acciones-redaccion")
  const marca = await marcaConDueno(persona.userId)
  await persona.db.rpc("guardar_linea_editorial", {
    p_marca: marca,
    p_base: 0,
    p_secciones: SECCIONES,
    p_pilares: [{ nombre: "Uno", deQueHabla: "", material: "", porSemana: 1 }],
  })
  return { ...persona, marca, cuenta: await cuentaDe(marca) }
}

describe("pedirTexto", () => {
  test("queues a request and validates the encargo", async () => {
    const e = await conLinea()
    expect(
      await pedirTexto(e.db, { cuentaId: e.cuenta, encargo: "Un post", material: "", pilarId: null }),
    ).toMatchObject({ ok: true })
    expect(await pedirTexto(e.db, { cuentaId: e.cuenta, encargo: "  ", material: "", pilarId: null })).toEqual({
      ok: false,
      error: "Cuenta de qué trata el post.",
    })
  })

  test("explains a brand without an editorial line", async () => {
    const persona = await personaConSesion("sin-linea-acc")
    const cuenta = await cuentaDe(await marcaConDueno(persona.userId))
    expect(await pedirTexto(persona.db, { cuentaId: cuenta, encargo: "Post", material: "", pilarId: null })).toEqual({
      ok: false,
      error: "Esa marca todavía no tiene línea editorial. Escríbela en Voz antes de pedir textos.",
    })
  })
})

describe("on a piece", () => {
  test("a hand correction becomes a new version by a person; the same text is refused", async () => {
    const e = await conLinea()
    const pieza = await piezaDe(e.db, e.cuenta, "Uno")
    expect(await corregirTexto(e.db, { piezaId: pieza, texto: "Uno" })).toEqual({
      ok: false,
      error: "El texto no cambió.",
    })
    expect(await corregirTexto(e.db, { piezaId: pieza, texto: "Dos" })).toEqual({ ok: true })
    const { data } = await admin()
      .from("versiones")
      .select("texto, origen")
      .eq("id", (await versionVigente(pieza)).id)
      .single()
    expect(data).toEqual({ texto: "Dos", origen: "persona" })
  })

  test("asks for a rewrite and a review, and explains a request already in progress", async () => {
    const e = await conLinea()
    const pieza = await piezaDe(e.db, e.cuenta, "Uno")
    expect(await pedirReescritura(e.db, { piezaId: pieza, instruccion: "Más corto" })).toEqual({ ok: true })
    expect(await pedirRevision(e.db, pieza)).toEqual({ ok: false, error: "Claude ya está trabajando en esta pieza." })
  })
})
