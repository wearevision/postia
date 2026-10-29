import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { describe, expect, test } from "vitest"
import { marcarExcepcion, quitarExcepcion } from "@/lib/clientes/acciones"
import { clientes, leerExcepciones } from "@/lib/clientes/lectura"
import type { Database } from "@/lib/supabase/database.types"
import { admin, entornoLocal, marcaConDueno, personaConSesion } from "./entorno"

async function caso(cliente: string) {
  const slug = `prueba-${randomUUID().slice(0, 8)}`
  const { error } = await admin()
    .from("casos")
    .insert({ slug, cliente, titulo: "Lanzamiento", anio: 2019, era: "trayectoria" })
  if (error) throw error
  return slug
}

async function duenoDeAlguna(prefijo = "cli") {
  const persona = await personaConSesion(prefijo)
  await marcaConDueno(persona.userId)
  return persona
}

const marcar = (
  db: Awaited<ReturnType<typeof personaConSesion>>["db"],
  cliente: string,
  cambios: { p_caso?: string; p_tipo?: string; p_alias?: string[]; p_hasta?: string } = {},
) =>
  db.rpc("marcar_excepcion", {
    p_cliente: cliente,
    p_tipo: "no_nombrar",
    p_alias: [],
    ...cambios,
  })

describe("casos and excepciones", () => {
  test("the team reads cases, people without a brand do not, and nobody but the service role writes them", async () => {
    const cliente = `Cliente ${randomUUID().slice(0, 6)}`
    const slug = await caso(cliente)
    const { db } = await duenoDeAlguna()
    expect((await db.from("casos").select("cliente").eq("slug", slug)).data).toEqual([{ cliente }])
    const sinMarca = await personaConSesion("cli-sin-marca")
    expect((await sinMarca.db.from("casos").select("slug").eq("slug", slug)).data).toEqual([])
    expect(
      (
        await db
          .from("casos")
          .insert({ slug: `prueba-${randomUUID().slice(0, 8)}`, cliente: "X", titulo: "X", era: "wav" })
      ).error,
    ).not.toBeNull()
  })

  test("an owner marks an exception for a client or one of its cases, and removing it keeps the row", async () => {
    const cliente = `Cliente ${randomUUID().slice(0, 6)}`
    const slug = await caso(cliente)
    const { db, userId } = await duenoDeAlguna()
    const { data: id, error } = await marcar(db, cliente, { p_caso: slug, p_alias: ["Alias"], p_hasta: "2027-01-31" })
    expect(error).toBeNull()
    const { data: fila } = await db
      .from("excepciones")
      .select("*")
      .eq("id", id ?? "")
      .single()
    expect(fila).toMatchObject({ cliente, caso_slug: slug, tipo: "no_nombrar", alias: ["Alias"], puesta_por: userId })
    expect((await db.rpc("quitar_excepcion", { p_id: id ?? "" })).error).toBeNull()
    const { data: quitada } = await db
      .from("excepciones")
      .select("quitada_en, quitada_por")
      .eq("id", id ?? "")
      .single()
    expect(quitada?.quitada_en).not.toBeNull()
    expect(quitada?.quitada_por).toBe(userId)
    expect((await db.rpc("quitar_excepcion", { p_id: id ?? "" })).error?.message).toBe("excepcion_ya_quitada")
  })

  test("refuses a repeated active exception, a case of another client and a person without a brand", async () => {
    const cliente = `Cliente ${randomUUID().slice(0, 6)}`
    const ajeno = await caso(`Otro ${randomUUID().slice(0, 6)}`)
    const { db } = await duenoDeAlguna()
    await marcar(db, cliente)
    expect((await marcar(db, cliente.toUpperCase())).error?.code).toBe("23505")
    expect((await marcar(db, cliente, { p_tipo: "sin_logo" })).error).toBeNull()
    expect((await marcar(db, cliente, { p_caso: ajeno })).error?.message).toBe("caso_de_otro_cliente")
    const sinMarca = await personaConSesion("cli-nadie")
    expect((await marcar(sinMarca.db, cliente, { p_tipo: "sin_fotos" })).error?.code).toBe("42501")
  })

  test("refuses an invalid type and invalid aliases with excepcion_invalida", async () => {
    const cliente = `Cliente ${randomUUID().slice(0, 6)}`
    const { db } = await duenoDeAlguna()
    expect((await marcar(db, cliente, { p_tipo: "secreto" })).error?.message).toBe("excepcion_invalida")
    expect((await marcar(db, "   ")).error?.message).toBe("excepcion_invalida")
    const malos = [["   "], ["x".repeat(121)], Array.from({ length: 21 }, (_, i) => `Alias ${i}`), ["Alias", " alias "]]
    for (const alias of malos) {
      expect((await marcar(db, cliente, { p_alias: alias })).error?.message).toBe("excepcion_invalida")
    }
    const veinte = Array.from({ length: 20 }, (_, i) => ` Alias ${i} `)
    const { data: id, error } = await marcar(db, cliente, { p_alias: veinte })
    expect(error).toBeNull()
    const { data: fila } = await db
      .from("excepciones")
      .select("alias")
      .eq("id", id ?? "")
      .single()
    expect(fila?.alias).toEqual(veinte.map((a) => a.trim()))
  })

  test("a stranger cannot remove an exception", async () => {
    const { db } = await duenoDeAlguna()
    const { data: id } = await marcar(db, `Cliente ${randomUUID().slice(0, 6)}`)
    const extrano = await personaConSesion("cli-extrano")
    expect((await extrano.db.rpc("quitar_excepcion", { p_id: id ?? "" })).error?.code).toBe("42501")
  })

  test("deleting the person who marked an exception keeps the exception", async () => {
    const cliente = `Cliente ${randomUUID().slice(0, 6)}`
    const slug = await caso(cliente)
    const { db, userId } = await duenoDeAlguna()
    const { data: id } = await marcar(db, cliente, { p_caso: slug })
    expect((await admin().auth.admin.deleteUser(userId)).error).toBeNull()
    const { data: fila } = await admin()
      .from("excepciones")
      .select("puesta_por")
      .eq("id", id ?? "")
      .single()
    expect(fila).toEqual({ puesta_por: null })
  })

  test("refuses deleting a case that has exceptions", async () => {
    const cliente = `Cliente ${randomUUID().slice(0, 6)}`
    const slug = await caso(cliente)
    const { db } = await duenoDeAlguna()
    await marcar(db, cliente, { p_caso: slug, p_tipo: "sin_logo" })
    expect((await admin().from("casos").delete().eq("slug", slug)).error?.code).toBe("23503")
    expect((await admin().from("casos").select("slug").eq("slug", slug)).data).toEqual([{ slug }])
  })

  test("anon reads nothing from pillars, lines, cases or exceptions", async () => {
    await caso(`Cliente ${randomUUID().slice(0, 6)}`)
    const anonimo = createClient<Database>(entornoLocal().url, entornoLocal().anon, {
      auth: { persistSession: false },
    })
    for (const tabla of ["pilares", "lineas_editoriales", "casos", "excepciones"] as const) {
      const { data } = await anonimo.from(tabla).select("*").limit(1)
      expect({ tabla, filas: data ?? [] }).toEqual({ tabla, filas: [] })
    }
  })
})

describe("lib/clientes", () => {
  test("clientes groups cases by client with their active exceptions, newest case first", async () => {
    const cliente = `Cliente ${randomUUID().slice(0, 6)}`
    const viejo = await caso(cliente)
    const nuevo = await caso(cliente)
    await admin().from("casos").update({ anio: 2023 }).eq("slug", nuevo)
    const { db } = await duenoDeAlguna("cli-lib")
    expect(await marcarExcepcion(db, { cliente, tipo: "sin_logo", alias: "", hasta: "" })).toMatchObject({ ok: true })
    const fila = (await clientes(db)).find((c) => c.cliente === cliente)
    expect(fila?.casos.map((c) => c.slug)).toEqual([nuevo, viejo])
    expect(fila?.excepciones.map((e) => e.tipo)).toEqual(["sin_logo"])
  })

  test("marcarExcepcion reads aliases separated by commas and quitarExcepcion hides it from the active list", async () => {
    const cliente = `Cliente ${randomUUID().slice(0, 6)}`
    const { db } = await duenoDeAlguna("cli-alias")
    const marcada = await marcarExcepcion(db, {
      cliente,
      tipo: "no_nombrar",
      alias: " Uno, Dos ,",
      hasta: "2030-01-01",
    })
    if (!marcada.ok) throw new Error(marcada.error)
    expect((await leerExcepciones(db)).find((e) => e.cliente === cliente)).toEqual({
      cliente,
      alias: ["Uno", "Dos"],
      tipo: "no_nombrar",
      hasta: "2030-01-01",
    })
    expect(await quitarExcepcion(db, marcada.id)).toEqual({ ok: true })
    expect((await leerExcepciones(db)).some((e) => e.cliente === cliente)).toBe(false)
  })

  test("marcarExcepcion answers in Spanish when the exception already exists", async () => {
    const cliente = `Cliente ${randomUUID().slice(0, 6)}`
    const { db } = await duenoDeAlguna("cli-doble")
    await marcarExcepcion(db, { cliente, tipo: "no_nombrar", alias: "", hasta: "" })
    expect(await marcarExcepcion(db, { cliente, tipo: "no_nombrar", alias: "", hasta: "" })).toEqual({
      ok: false,
      error: "Ese cliente ya tiene esa excepción.",
    })
  })

  test("marcarExcepcion answers in Spanish when the aliases repeat", async () => {
    const { db } = await duenoDeAlguna("cli-alias-doble")
    expect(
      await marcarExcepcion(db, {
        cliente: `Cliente ${randomUUID().slice(0, 6)}`,
        tipo: "no_nombrar",
        alias: "Uno, uno",
        hasta: "",
      }),
    ).toEqual({ ok: false, error: "Revisa el cliente, el tipo y los alias: sin alias repetidos." })
  })
})
