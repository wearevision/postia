import { describe, expect, test } from "vitest"
import { admin, marcaConDueno, personaConSesion } from "./entorno"

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
