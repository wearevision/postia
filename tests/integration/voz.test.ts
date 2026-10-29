import { describe, expect, test } from "vitest"
import type { Json } from "@/lib/supabase/database.types"
import { guardarLinea } from "@/lib/voz/acciones"
import { balancePorCuenta, lineaDeMarca, marcasConLinea, pilaresActivos } from "@/lib/voz/lectura"
import { admin, cuentaDe, enDias, marcaConDueno, personaConSesion, piezaDe, versionVigente } from "./entorno"

const SECCIONES = {
  deQueHablamos: "Investigación y experiencia de marcas.",
  tono: "Nosotros, directo.",
  formatos: "Carruseles PDF.",
  temasVetados: "Política partidista.",
  temasAVigilar: "Focus groups.",
  ejemplos: "Un ejemplo aprobado.",
}

function pilar(nombre: string, porSemana = 1, id?: string) {
  return { ...(id ? { id } : {}), nombre, deQueHabla: `Sobre ${nombre}`, material: "Casos", porSemana }
}

async function dueno(prefijo = "voz") {
  const persona = await personaConSesion(prefijo)
  return { ...persona, marca: await marcaConDueno(persona.userId, "nosotros") }
}

async function pilaresDe(marca: string) {
  const { data } = await admin()
    .from("pilares")
    .select("id, nombre, por_semana, activo, orden")
    .eq("marca_id", marca)
    .order("orden")
  return data ?? []
}

describe("guardar_linea_editorial", () => {
  test("the first save is version 1 and creates the pillar rows with a snapshot", async () => {
    const { db, marca } = await dueno()
    const { data, error } = await db.rpc("guardar_linea_editorial", {
      p_marca: marca,
      p_base: 0,
      p_secciones: SECCIONES,
      p_pilares: [pilar("Detrás del trabajo"), pilar("Oficio", 0.5)],
    })
    expect(error).toBeNull()
    expect(data).toBe(1)
    const filas = await pilaresDe(marca)
    expect(filas.map((f) => [f.nombre, Number(f.por_semana), f.activo, f.orden])).toEqual([
      ["Detrás del trabajo", 1, true, 1],
      ["Oficio", 0.5, true, 2],
    ])
    const { data: linea } = await admin().from("lineas_editoriales").select("*").eq("marca_id", marca).single()
    expect(linea?.tono).toBe("Nosotros, directo.")
    expect(linea?.pilares).toEqual(
      filas.map((f) => expect.objectContaining({ id: f.id, nombre: f.nombre, porSemana: Number(f.por_semana) })),
    )
  })

  test("a second save keeps pillar ids, adds new ones and retires the missing ones", async () => {
    const { db, marca } = await dueno()
    await db.rpc("guardar_linea_editorial", {
      p_marca: marca,
      p_base: 0,
      p_secciones: SECCIONES,
      p_pilares: [pilar("Uno"), pilar("Dos")],
    })
    const [uno] = await pilaresDe(marca)
    const { data } = await db.rpc("guardar_linea_editorial", {
      p_marca: marca,
      p_base: 1,
      p_secciones: { ...SECCIONES, tono: "Más directo." },
      p_pilares: [pilar("Uno renombrado", 2, uno?.id), pilar("Tres")],
    })
    expect(data).toBe(2)
    const filas = await pilaresDe(marca)
    expect(filas.find((f) => f.id === uno?.id)).toMatchObject({ nombre: "Uno renombrado", activo: true })
    expect(filas.find((f) => f.nombre === "Dos")?.activo).toBe(false)
    expect(filas.find((f) => f.nombre === "Tres")?.activo).toBe(true)
  })

  test("refuses a stale base so a second tab cannot overwrite silently", async () => {
    const { db, marca } = await dueno()
    const guardar = () =>
      db.rpc("guardar_linea_editorial", {
        p_marca: marca,
        p_base: 0,
        p_secciones: SECCIONES,
        p_pilares: [pilar("Uno")],
      })
    expect((await guardar()).error).toBeNull()
    expect((await guardar()).error?.message).toBe("linea_cambio")
  })

  test("refuses repeated pillar names, no pillars, and a pillar of another brand", async () => {
    const { db, marca } = await dueno()
    const otra = await dueno("voz-otra")
    await otra.db.rpc("guardar_linea_editorial", {
      p_marca: otra.marca,
      p_base: 0,
      p_secciones: SECCIONES,
      p_pilares: [pilar("Ajeno")],
    })
    const [ajeno] = await pilaresDe(otra.marca)
    const intentar = (pilares: ReturnType<typeof pilar>[]) =>
      db.rpc("guardar_linea_editorial", { p_marca: marca, p_base: 0, p_secciones: SECCIONES, p_pilares: pilares })
    expect((await intentar([pilar("Uno"), pilar("uno")])).error?.message).toBe("pilares_repetidos")
    expect((await intentar([])).error?.message).toBe("pilares_invalidos")
    expect((await intentar([pilar("Mío", 1, ajeno?.id)])).error?.message).toBe("pilar_de_otra_marca")
  })

  test("only an owner of the brand saves, members read, and versions never change", async () => {
    const { db, marca } = await dueno()
    const extrano = await personaConSesion("voz-extrano")
    const { error } = await extrano.db.rpc("guardar_linea_editorial", {
      p_marca: marca,
      p_base: 0,
      p_secciones: SECCIONES,
      p_pilares: [pilar("Uno")],
    })
    expect(error?.code).toBe("42501")
    await db.rpc("guardar_linea_editorial", {
      p_marca: marca,
      p_base: 0,
      p_secciones: SECCIONES,
      p_pilares: [pilar("Uno")],
    })
    expect((await extrano.db.from("lineas_editoriales").select("id").eq("marca_id", marca)).data).toEqual([])
    expect((await db.from("lineas_editoriales").select("version").eq("marca_id", marca)).data).toEqual([{ version: 1 }])
    const cambio = await admin().from("lineas_editoriales").update({ tono: "otro" }).eq("marca_id", marca)
    expect(cambio.error?.message).toBe("linea_inmutable")
  })
})

describe("guardar_linea_editorial refuses bad input", () => {
  async function conVersionUno() {
    const persona = await dueno("voz-mal")
    await persona.db.rpc("guardar_linea_editorial", {
      p_marca: persona.marca,
      p_base: 0,
      p_secciones: SECCIONES,
      p_pilares: [pilar("Uno"), pilar("Dos")],
    })
    return persona
  }

  test("handles a missing base as a stale one instead of skipping the check", async () => {
    const { db, marca } = await conVersionUno()
    // NaN is serialized as JSON null: the RPC receives p_base = NULL.
    const { error } = await db.rpc("guardar_linea_editorial", {
      p_marca: marca,
      p_base: Number.NaN,
      p_secciones: SECCIONES,
      p_pilares: [pilar("Uno")],
    })
    expect(error?.message).toBe("linea_cambio")
    expect((await pilaresDe(marca)).every((f) => f.activo)).toBe(true)
  })

  test("refuses missing or non-array pillars without retiring the current ones", async () => {
    const { db, marca } = await conVersionUno()
    for (const pilares of [null, { nombre: "Uno" }, "Uno"]) {
      const { error } = await db.rpc("guardar_linea_editorial", {
        p_marca: marca,
        p_base: 1,
        p_secciones: SECCIONES,
        p_pilares: pilares,
      })
      expect(error?.message).toBe("pilares_invalidos")
    }
    expect((await pilaresDe(marca)).every((f) => f.activo)).toBe(true)
  })

  test("refuses the same pillar id twice", async () => {
    const { db, marca } = await conVersionUno()
    const [uno] = await pilaresDe(marca)
    const { error } = await db.rpc("guardar_linea_editorial", {
      p_marca: marca,
      p_base: 1,
      p_secciones: SECCIONES,
      p_pilares: [pilar("Uno", 1, uno?.id), pilar("Otro nombre", 1, uno?.id)],
    })
    expect(error?.message).toBe("pilares_repetidos")
  })

  test("handles malformed pillars as pilares_invalidos instead of raw database errors", async () => {
    const { db, marca } = await conVersionUno()
    const malos: Json[] = [
      "Uno",
      { nombre: null, porSemana: 1 },
      { nombre: "   ", porSemana: 1 },
      { nombre: 7, porSemana: 1 },
      { nombre: "x".repeat(61), porSemana: 1 },
      { nombre: "Sin ritmo" },
      { nombre: "Ritmo texto", porSemana: "mucho" },
      { nombre: "Ritmo con centésimas", porSemana: 1.25 },
      { nombre: "Ritmo cero", porSemana: 0 },
      { nombre: "Ritmo de más", porSemana: 8 },
      { nombre: "Id roto", porSemana: 1, id: "no-es-uuid" },
      { nombre: "Id número", porSemana: 1, id: 5 },
      { nombre: "Tema largo", porSemana: 1, deQueHabla: "x".repeat(401) },
      { nombre: "Material número", porSemana: 1, material: 3 },
    ]
    for (const malo of malos) {
      const { error } = await db.rpc("guardar_linea_editorial", {
        p_marca: marca,
        p_base: 1,
        p_secciones: SECCIONES,
        p_pilares: [pilar("Bueno"), malo],
      })
      expect({ malo, mensaje: error?.message }).toEqual({ malo, mensaje: "pilares_invalidos" })
    }
  })

  test("an owner of another brand neither reads nor saves this brand's line", async () => {
    const { marca } = await conVersionUno()
    const otro = await dueno("voz-otro-dueno")
    expect((await otro.db.from("pilares").select("id").eq("marca_id", marca)).data).toEqual([])
    expect((await otro.db.from("lineas_editoriales").select("id").eq("marca_id", marca)).data).toEqual([])
    const { error } = await otro.db.rpc("guardar_linea_editorial", {
      p_marca: marca,
      p_base: 1,
      p_secciones: SECCIONES,
      p_pilares: [pilar("Intruso")],
    })
    expect(error?.code).toBe("42501")
  })

  test("refuses deleting a version, but deleting the brand removes its versions", async () => {
    const { marca } = await conVersionUno()
    const borrado = await admin().from("lineas_editoriales").delete().eq("marca_id", marca)
    expect(borrado.error?.message).toBe("linea_inmutable")
    expect((await admin().from("marcas").delete().eq("id", marca)).error).toBeNull()
    expect((await admin().from("lineas_editoriales").select("id").eq("marca_id", marca)).data).toEqual([])
  })
})

const PILARES = [{ nombre: "Uno", deQueHabla: "", material: "", porSemana: 1 }]

describe("lib/voz", () => {
  test("guardarLinea saves version after version and lineaDeMarca reads the current one and the history", async () => {
    const { db, marca } = await dueno("voz-lib")
    expect(await guardarLinea(db, { marcaId: marca, base: 0, secciones: SECCIONES, pilares: PILARES })).toEqual({
      ok: true,
      version: 1,
    })
    const primera = await lineaDeMarca(db, marca)
    const uno = primera?.actual?.pilares[0]
    expect(uno?.id).toBeDefined()
    await guardarLinea(db, {
      marcaId: marca,
      base: 1,
      secciones: { ...SECCIONES, tono: "Nuevo" },
      pilares: [{ ...PILARES[0], id: uno?.id, nombre: "Uno bis" }],
    })
    const linea = await lineaDeMarca(db, marca)
    expect(linea?.vigente).toBe(2)
    expect(linea?.actual?.secciones.tono).toBe("Nuevo")
    expect(linea?.historial.map((h) => h.version)).toEqual([2, 1])
    expect((await lineaDeMarca(db, marca, 1))?.actual?.pilares[0]?.nombre).toBe("Uno")
  })

  test("guardarLinea answers in Spanish when the base is stale or the input is bad", async () => {
    const { db, marca } = await dueno("voz-lib-falla")
    await guardarLinea(db, { marcaId: marca, base: 0, secciones: SECCIONES, pilares: PILARES })
    expect(await guardarLinea(db, { marcaId: marca, base: 0, secciones: SECCIONES, pilares: PILARES })).toEqual({
      ok: false,
      error: "Alguien guardó otra versión mientras editabas. Recarga para ver la última.",
    })
    expect(await guardarLinea(db, { marcaId: marca, base: 1, secciones: SECCIONES, pilares: [] })).toEqual({
      ok: false,
      error: "Revisa los pilares: entre 1 y 8, con nombres distintos.",
    })
  })

  test("marcasConLinea and pilaresActivos only show the person's brands", async () => {
    const { db, marca } = await dueno("voz-marcas")
    await guardarLinea(db, { marcaId: marca, base: 0, secciones: SECCIONES, pilares: PILARES })
    expect((await marcasConLinea(db)).map((m) => [m.id, m.version])).toEqual([[marca, 1]])
    expect((await pilaresActivos(db)).map((p) => [p.marcaId, p.nombre])).toEqual([[marca, "Uno"]])
  })

  test("balancePorCuenta reads each account's pieces by pillar", async () => {
    const { db, marca } = await dueno("voz-balance")
    await guardarLinea(db, { marcaId: marca, base: 0, secciones: SECCIONES, pilares: PILARES })
    const cuenta = await cuentaDe(marca)
    await admin().from("cuentas").update({ ritmo_semanal: 3 }).eq("id", cuenta)
    const [pilar] = await pilaresActivos(db)
    const pieza = await piezaDe(db, cuenta)
    expect((await db.rpc("poner_pilar", { p_pieza: pieza, p_pilar: pilar?.id })).error).toBeNull()
    const { huella } = await versionVigente(pieza)
    const firma = await db.rpc("firmar_pieza", { p_pieza: pieza, p_huella: huella, p_programada_para: enDias(3) })
    expect(firma.error).toBeNull()
    const balance = (await balancePorCuenta(db, Date.now())).find((b) => b.cuentaId === cuenta)
    expect(balance?.balance.filas[0]).toMatchObject({ nombre: "Uno", planeadas: 1, salieron: 0 })
  })
})
