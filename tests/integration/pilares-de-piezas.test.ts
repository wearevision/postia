import { describe, expect, test } from "vitest"
import { admin, cuentaDe, enDias, marcaConDueno, personaConSesion, piezaDe, versionVigente } from "./entorno"

const SECCIONES = { deQueHablamos: "", tono: "", formatos: "", temasVetados: "", temasAVigilar: "", ejemplos: "" }

async function conPilares(prefijo = "pilar") {
  const persona = await personaConSesion(prefijo)
  const marca = await marcaConDueno(persona.userId)
  await persona.db.rpc("guardar_linea_editorial", {
    p_marca: marca,
    p_base: 0,
    p_secciones: SECCIONES,
    p_pilares: [
      { nombre: "Uno", deQueHabla: "", material: "", porSemana: 1 },
      { nombre: "Dos", deQueHabla: "", material: "", porSemana: 1 },
    ],
  })
  const { data } = await admin().from("pilares").select("id, nombre").eq("marca_id", marca).order("orden")
  return { ...persona, marca, cuenta: await cuentaDe(marca), pilares: data ?? [] }
}

const pilarDe = async (pieza: string) =>
  (await admin().from("piezas").select("pilar_id").eq("id", pieza).single()).data?.pilar_id

describe("poner_pilar", () => {
  test("an owner gives an unsigned piece a pillar of its brand and can change or clear it", async () => {
    const { db, cuenta, pilares } = await conPilares()
    const pieza = await piezaDe(db, cuenta)
    expect((await db.rpc("poner_pilar", { p_pieza: pieza, p_pilar: pilares[0]?.id ?? null })).error).toBeNull()
    expect(await pilarDe(pieza)).toBe(pilares[0]?.id)
    await db.rpc("poner_pilar", { p_pieza: pieza })
    expect(await pilarDe(pieza)).toBeNull()
  })

  test("a signed piece keeps its signature when its pillar changes", async () => {
    const { db, cuenta, pilares } = await conPilares()
    const pieza = await piezaDe(db, cuenta)
    const { huella } = await versionVigente(pieza)
    await db.rpc("firmar_pieza", { p_pieza: pieza, p_huella: huella, p_programada_para: enDias(3) })
    expect((await db.rpc("poner_pilar", { p_pieza: pieza, p_pilar: pilares[1]?.id ?? null })).error).toBeNull()
    const { data } = await admin().from("piezas").select("estado").eq("id", pieza).single()
    expect(data?.estado).toBe("programada")
  })

  test("refuses a pillar of another brand, also for the service role", async () => {
    const uno = await conPilares()
    const otra = await conPilares("pilar-otra")
    const pieza = await piezaDe(uno.db, uno.cuenta)
    const ajeno = otra.pilares[0]?.id ?? null
    expect((await uno.db.rpc("poner_pilar", { p_pieza: pieza, p_pilar: ajeno })).error?.message).toBe(
      "pilar_de_otra_marca",
    )
    const directo = await admin().from("piezas").update({ pilar_id: ajeno }).eq("id", pieza)
    expect(directo.error?.message).toBe("pilar_de_otra_marca")
  })

  test("refuses a retired pillar, a closed piece and a stranger", async () => {
    const { db, marca, cuenta, pilares } = await conPilares()
    const pieza = await piezaDe(db, cuenta)
    await db.rpc("guardar_linea_editorial", {
      p_marca: marca,
      p_base: 1,
      p_secciones: SECCIONES,
      p_pilares: [{ id: pilares[0]?.id, nombre: "Uno", deQueHabla: "", material: "", porSemana: 1 }],
    })
    expect((await db.rpc("poner_pilar", { p_pieza: pieza, p_pilar: pilares[1]?.id ?? null })).error?.message).toBe(
      "pilar_inactivo",
    )
    const extrano = await personaConSesion("pilar-extrano")
    expect((await extrano.db.rpc("poner_pilar", { p_pieza: pieza })).error?.code).toBe("42501")
    await db.rpc("descartar_pieza", { p_pieza: pieza, p_motivo: "No va" })
    expect((await db.rpc("poner_pilar", { p_pieza: pieza, p_pilar: pilares[0]?.id ?? null })).error?.message).toBe(
      "pieza_ya_cerrada",
    )
  })
})
