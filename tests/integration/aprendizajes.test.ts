import { beforeAll, beforeEach, describe, expect, test } from "vitest"
import type { Db } from "@/lib/supabase/database"
import { admin, cuentaDe, marcaConDueno, personaConSesion } from "./entorno"

type Persona = { db: Db; userId: string }
let dueno: Persona
let ajeno: Persona
let cuenta: string
let publicaciones: string[]

/** tomar_lecturas leases the oldest open reading of every account, so a test that leases starts with none open. */
async function cerrarLecturasAbiertas(): Promise<void> {
  const { error } = await admin()
    .from("lecturas_de_rendimiento")
    .update({ estado: "fallo", motivo: "Cerrado entre pruebas." })
    .in("estado", ["pendiente", "trabajando"])
  if (error) throw error
}

async function lecturaTomada(): Promise<string> {
  const { data: id, error } = await dueno.db.rpc("pedir_lectura", { p_cuenta: cuenta })
  expect(error).toBeNull()
  const { data: tomadas } = await admin().rpc("tomar_lecturas")
  expect(tomadas?.map((t) => t.id)).toEqual([id])
  return id as string
}

function item(texto: string, respaldo: number, ids: string[] = []) {
  return { texto, porque: "Porque rindió más.", respaldo, publicaciones: ids }
}

beforeAll(async () => {
  dueno = await personaConSesion("aprendizajes")
  ajeno = await personaConSesion("aprendizajes-ajeno")
  cuenta = await cuentaDe(await marcaConDueno(dueno.userId))
  const { data, error } = await admin()
    .from("metricas_de_publicacion")
    .insert(
      [1, 2].map((n) => ({
        cuenta_id: cuenta,
        post_urn: `urn:li:share:${Date.now()}${n}`,
        publicada_el: "2026-10-01",
        impresiones: 100 * n,
        origen: "importacion" as const,
      })),
    )
    .select("id")
  if (error) throw error
  publicaciones = data.map((f) => f.id)
})

beforeEach(async () => {
  await cerrarLecturasAbiertas()
  await admin().from("aprendizajes").delete().eq("cuenta_id", cuenta)
})

describe("pedir_lectura", () => {
  test("the owner queues a reading linked to the latest import", async () => {
    const { data: importacion } = await admin()
      .from("importaciones_de_metricas")
      .insert({ cuenta_id: cuenta, desde: "2025-11-10", hasta: "2026-11-09" })
      .select("id")
      .single()
    const { data: id, error } = await dueno.db.rpc("pedir_lectura", { p_cuenta: cuenta })
    expect(error).toBeNull()
    const { data: fila } = await dueno.db
      .from("lecturas_de_rendimiento")
      .select("estado, importacion_id, pedida_por")
      .eq("id", id as string)
      .single()
    expect(fila).toEqual({ estado: "pendiente", importacion_id: importacion?.id, pedida_por: dueno.userId })
    await admin().from("importaciones_de_metricas").delete().eq("cuenta_id", cuenta)
  })

  test("a second open reading for the same account is refused", async () => {
    await dueno.db.rpc("pedir_lectura", { p_cuenta: cuenta })
    const { error } = await dueno.db.rpc("pedir_lectura", { p_cuenta: cuenta })
    expect(error?.message).toBe("lectura_en_curso")
  })

  test("someone who does not own the brand is refused", async () => {
    const { error } = await ajeno.db.rpc("pedir_lectura", { p_cuenta: cuenta })
    expect(error?.code).toBe("42501")
    expect(error?.message).toBe("solo_el_dueno_pide_lecturas")
  })

  test("a signed-in user cannot call the worker RPCs", async () => {
    expect((await dueno.db.rpc("tomar_lecturas")).error).not.toBeNull()
    expect(
      (await dueno.db.rpc("terminar_lectura", { p_id: crypto.randomUUID(), p_estado: "lista" })).error,
    ).not.toBeNull()
    expect(
      (await dueno.db.rpc("guardar_aprendizajes", { p_lectura: crypto.randomUUID(), p_items: [] })).error,
    ).not.toBeNull()
  })
})

describe("tomar_lecturas and terminar_lectura", () => {
  test("leases the oldest reading once, for ten minutes, and finishing releases the lease", async () => {
    const id = await lecturaTomada()
    const { data: fila } = await admin()
      .from("lecturas_de_rendimiento")
      .select("estado, arrendado_hasta")
      .eq("id", id)
      .single()
    expect(fila?.estado).toBe("trabajando")
    const minutos = (Date.parse(fila?.arrendado_hasta ?? "") - Date.now()) / 60_000
    expect(minutos).toBeGreaterThan(9)
    expect(minutos).toBeLessThanOrEqual(10)
    expect((await admin().rpc("tomar_lecturas")).data).toEqual([])

    expect(
      (await admin().rpc("terminar_lectura", { p_id: id, p_estado: "fallo", p_motivo: "x".repeat(600) })).error,
    ).toBeNull()
    const { data: cerrada } = await admin()
      .from("lecturas_de_rendimiento")
      .select("estado, motivo, arrendado_hasta, terminada_en")
      .eq("id", id)
      .single()
    expect(cerrada?.estado).toBe("fallo")
    expect(cerrada?.motivo).toHaveLength(500)
    expect(cerrada?.arrendado_hasta).toBeNull()
    expect(cerrada?.terminada_en).not.toBeNull()
  })

  test("an expired lease is taken again", async () => {
    const id = await lecturaTomada()
    await admin()
      .from("lecturas_de_rendimiento")
      .update({ arrendado_hasta: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", id)
    const { data } = await admin().rpc("tomar_lecturas")
    expect(data?.map((t) => t.id)).toEqual([id])
  })

  test("refuses a state that is not lista or fallo", async () => {
    const id = await lecturaTomada()
    const { error } = await admin().rpc("terminar_lectura", { p_id: id, p_estado: "pendiente" })
    expect(error?.message).toBe("estado_de_lectura_invalido")
  })
})

describe("guardar_aprendizajes", () => {
  test("backing of 8 or more is proposed, less is a hint, and earlier undecided ones are replaced but approved stay", async () => {
    const primera = await lecturaTomada()
    await admin().rpc("guardar_aprendizajes", {
      p_lectura: primera,
      p_items: [item("Viejo propuesto", 9), item("Viejo pista", 3), item("Viejo aprobado", 10)],
    })
    const { data: viejos } = await admin().from("aprendizajes").select("id, texto").eq("cuenta_id", cuenta)
    const aprobado = viejos?.find((a) => a.texto === "Viejo aprobado")?.id as string
    expect((await dueno.db.rpc("decidir_aprendizaje", { p_id: aprobado, p_estado: "aprobado" })).error).toBeNull()
    await admin().rpc("terminar_lectura", { p_id: primera, p_estado: "lista" })

    const segunda = await lecturaTomada()
    const { data: guardados, error } = await admin().rpc("guardar_aprendizajes", {
      p_lectura: segunda,
      p_items: [item("Nuevo fuerte", 8, publicaciones), item("Nuevo débil", 7)],
    })
    expect(error).toBeNull()
    expect(guardados).toBe(2)
    const { data: filas } = await admin()
      .from("aprendizajes")
      .select("texto, estado, respaldo, publicaciones, lectura_id")
      .eq("cuenta_id", cuenta)
      .order("texto")
    expect(filas).toEqual([
      { texto: "Nuevo débil", estado: "pista", respaldo: 7, publicaciones: [], lectura_id: segunda },
      {
        texto: "Nuevo fuerte",
        estado: "propuesto",
        respaldo: 8,
        publicaciones: expect.arrayContaining(publicaciones),
        lectura_id: segunda,
      },
      { texto: "Viejo aprobado", estado: "aprobado", respaldo: 10, publicaciones: [], lectura_id: primera },
      { texto: "Viejo pista", estado: "descartado", respaldo: 3, publicaciones: [], lectura_id: primera },
      { texto: "Viejo propuesto", estado: "descartado", respaldo: 9, publicaciones: [], lectura_id: primera },
    ])
  })

  test("refuses a malformed item, a post of another account, or a reading that is not being worked", async () => {
    const id = await lecturaTomada()
    for (const malo of [
      [{ texto: "", porque: "x", respaldo: 1, publicaciones: [] }],
      [{ texto: "a".repeat(401), porque: "x", respaldo: 1, publicaciones: [] }],
      [{ texto: "ok", porque: "x".repeat(601), respaldo: 1, publicaciones: [] }],
      [{ texto: "ok", porque: "x", respaldo: -1, publicaciones: [] }],
      [{ texto: "ok", porque: "x", respaldo: 1, publicaciones: [crypto.randomUUID()] }],
      "no-es-lista",
    ]) {
      const { error } = await admin().rpc("guardar_aprendizajes", { p_lectura: id, p_items: malo })
      expect(error?.message).toBe("datos_invalidos")
    }
    expect((await admin().from("aprendizajes").select("id").eq("cuenta_id", cuenta)).data).toEqual([])
    await admin().rpc("terminar_lectura", { p_id: id, p_estado: "lista" })
    const { error } = await admin().rpc("guardar_aprendizajes", { p_lectura: id, p_items: [item("Tarde", 9)] })
    expect(error?.message).toBe("lectura_no_encontrada")
  })
})

describe("decidir_aprendizaje", () => {
  async function propuesto(respaldo: number): Promise<string> {
    const id = await lecturaTomada()
    await admin().rpc("guardar_aprendizajes", { p_lectura: id, p_items: [item("Original", respaldo)] })
    const { data } = await admin().from("aprendizajes").select("id").eq("lectura_id", id).single()
    return data?.id as string
  }

  test("approves with edited text, recording who and when", async () => {
    const id = await propuesto(9)
    const { error } = await dueno.db.rpc("decidir_aprendizaje", {
      p_id: id,
      p_estado: "aprobado",
      p_texto: "  Editado  ",
    })
    expect(error).toBeNull()
    const { data } = await dueno.db
      .from("aprendizajes")
      .select("texto, estado, decidido_por, decidido_en")
      .eq("id", id)
      .single()
    expect(data?.texto).toBe("Editado")
    expect(data?.estado).toBe("aprobado")
    expect(data?.decidido_por).toBe(dueno.userId)
    expect(data?.decidido_en).not.toBeNull()
  })

  test("a hint can be approved too, and any learning can be discarded keeping its text", async () => {
    const pista = await propuesto(2)
    expect((await dueno.db.rpc("decidir_aprendizaje", { p_id: pista, p_estado: "aprobado" })).error).toBeNull()
    expect((await dueno.db.rpc("decidir_aprendizaje", { p_id: pista, p_estado: "descartado" })).error).toBeNull()
    const { data } = await dueno.db.from("aprendizajes").select("texto, estado").eq("id", pista).single()
    expect(data).toEqual({ texto: "Original", estado: "descartado" })
  })

  test("refuses another state, empty or long text, an unknown id and a non-owner", async () => {
    const id = await propuesto(9)
    const decidir = (args: { p_id: string; p_estado: string; p_texto?: string }, db = dueno.db) =>
      db.rpc("decidir_aprendizaje", args)
    expect((await decidir({ p_id: id, p_estado: "propuesto" })).error?.message).toBe("estado_de_aprendizaje_invalido")
    expect((await decidir({ p_id: id, p_estado: "aprobado", p_texto: "   " })).error?.message).toBe("texto_invalido")
    expect((await decidir({ p_id: id, p_estado: "aprobado", p_texto: "a".repeat(401) })).error?.message).toBe(
      "texto_invalido",
    )
    expect((await decidir({ p_id: crypto.randomUUID(), p_estado: "aprobado" })).error?.message).toBe(
      "aprendizaje_no_encontrado",
    )
    const ajena = await decidir({ p_id: id, p_estado: "aprobado" }, ajeno.db)
    expect(ajena.error?.code).toBe("42501")
    expect(ajena.error?.message).toBe("solo_el_dueno_decide")
  })
})

describe("RLS", () => {
  test("owners read both tables, others see nothing, and nobody writes directly", async () => {
    const id = await lecturaTomada()
    await admin().rpc("guardar_aprendizajes", { p_lectura: id, p_items: [item("Visible", 9)] })
    expect((await dueno.db.from("lecturas_de_rendimiento").select("id").eq("id", id)).data).toHaveLength(1)
    expect((await dueno.db.from("aprendizajes").select("id").eq("cuenta_id", cuenta)).data).toHaveLength(1)
    expect((await ajeno.db.from("lecturas_de_rendimiento").select("id").eq("id", id)).data).toEqual([])
    expect((await ajeno.db.from("aprendizajes").select("id").eq("cuenta_id", cuenta)).data).toEqual([])
    const directo = await dueno.db
      .from("aprendizajes")
      .insert({ cuenta_id: cuenta, texto: "Colado", porque: "x", respaldo: 9, estado: "aprobado" })
    expect(directo.error).not.toBeNull()
    const editado = await dueno.db.from("aprendizajes").update({ estado: "aprobado" }).eq("cuenta_id", cuenta)
    expect(editado.error).not.toBeNull()
  })
})
