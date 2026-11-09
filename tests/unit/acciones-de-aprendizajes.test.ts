import { afterEach, describe, expect, test, vi } from "vitest"
import { decidirAprendizaje, encolarLectura, pedirLectura } from "@/lib/rendimiento/acciones-de-aprendizajes"
import type { Db } from "@/lib/supabase/database"

const ID = "6f1c0c1e-8a53-4f43-9a55-0b8f4a1d2c11"

function dbQueResponde(error: { code?: string; message: string } | null, data: unknown = null) {
  const rpc = vi.fn(async () => ({ data, error }))
  return { db: { rpc } as unknown as Db, rpc }
}

afterEach(() => vi.restoreAllMocks())

describe("pedirLectura", () => {
  test("asks for a reading of the account", async () => {
    const { db, rpc } = dbQueResponde(null, "lectura-1")
    expect(await pedirLectura(db, ID)).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith("pedir_lectura", { p_cuenta: ID })
  })

  test("refuses something that is not an account id without calling the database", async () => {
    const { db, rpc } = dbQueResponde(null)
    expect(await pedirLectura(db, "no-es-un-id")).toEqual({ ok: false, error: "Revisa la cuenta." })
    expect(rpc).not.toHaveBeenCalled()
  })

  test("says in Spanish that a reading is already open", async () => {
    const { db } = dbQueResponde({ code: "55000", message: "lectura_en_curso" })
    expect(await pedirLectura(db, ID)).toEqual({ ok: false, error: "Ya hay una lectura en curso." })
  })

  test("says in Spanish that only the owner asks for readings", async () => {
    const { db } = dbQueResponde({ code: "42501", message: "solo_el_dueno_pide_lecturas" })
    expect(await pedirLectura(db, ID)).toEqual({
      ok: false,
      error: "Solo el dueño de la marca de esa cuenta puede pedir una lectura.",
    })
  })

  test("logs an unexpected error and answers with a generic message that leaks nothing", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})
    const { db } = dbQueResponde({ code: "XX000", message: "relation secreta" })
    const r = await pedirLectura(db, ID)
    expect(r).toEqual({ ok: false, error: "No pude pedir la lectura. Inténtalo de nuevo en un rato." })
    expect(registro).toHaveBeenCalled()
  })
})

describe("encolarLectura", () => {
  test("reports that PostIA is reading when it queued one", async () => {
    expect(await encolarLectura(dbQueResponde(null, "l1").db, ID)).toBe(true)
  })

  test("an open reading counts as reading and logs nothing", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await encolarLectura(dbQueResponde({ code: "55000", message: "lectura_en_curso" }).db, ID)).toBe(true)
    expect(registro).not.toHaveBeenCalled()
  })

  test("any other error is logged and does not throw: the import it follows already succeeded", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await encolarLectura(dbQueResponde({ code: "XX000", message: "se cayó" }).db, ID)).toBe(false)
    expect(registro).toHaveBeenCalled()
  })
})

describe("decidirAprendizaje", () => {
  test("approves with the id and no text when the text is not edited", async () => {
    const { db, rpc } = dbQueResponde(null)
    expect(await decidirAprendizaje(db, { id: ID, estado: "aprobado" })).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith("decidir_aprendizaje", { p_id: ID, p_estado: "aprobado", p_texto: undefined })
  })

  test("approves with the edited text, trimmed", async () => {
    const { db, rpc } = dbQueResponde(null)
    await decidirAprendizaje(db, { id: ID, estado: "aprobado", texto: "  Mejor así.  " })
    expect(rpc).toHaveBeenCalledWith("decidir_aprendizaje", { p_id: ID, p_estado: "aprobado", p_texto: "Mejor así." })
  })

  test("discards", async () => {
    const { db, rpc } = dbQueResponde(null)
    await decidirAprendizaje(db, { id: ID, estado: "descartado" })
    expect(rpc).toHaveBeenCalledWith("decidir_aprendizaje", { p_id: ID, p_estado: "descartado", p_texto: undefined })
  })

  test.each([
    ["an empty text", { id: ID, estado: "aprobado", texto: "   " }, "Escribe el aprendizaje."],
    [
      "a text over 400 characters",
      { id: ID, estado: "aprobado", texto: "x".repeat(401) },
      "El aprendizaje pasa los 400 caracteres.",
    ],
    ["an id that is not one", { id: "x", estado: "aprobado" }, "Revisa el aprendizaje."],
    ["a state that is not a decision", { id: ID, estado: "pista" }, "Revisa el aprendizaje."],
  ])("refuses %s before calling the database", async (_nombre, entrada, error) => {
    const { db, rpc } = dbQueResponde(null)
    expect(await decidirAprendizaje(db, entrada)).toEqual({ ok: false, error })
    expect(rpc).not.toHaveBeenCalled()
  })

  test.each([
    ["aprendizaje_no_encontrado", "Ese aprendizaje ya no existe."],
    ["solo_el_dueno_decide", "Solo el dueño de la marca de esa cuenta puede decidir los aprendizajes."],
    ["texto_invalido", "El aprendizaje debe tener entre 1 y 400 caracteres."],
  ])("maps %s to Spanish", async (mensaje, esperado) => {
    const { db } = dbQueResponde({ code: "P0001", message: mensaje })
    expect(await decidirAprendizaje(db, { id: ID, estado: "descartado" })).toEqual({ ok: false, error: esperado })
  })

  test("logs an unexpected error and answers with a generic message", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})
    const { db } = dbQueResponde({ code: "XX000", message: "estado_de_aprendizaje_invalido" })
    expect(await decidirAprendizaje(db, { id: ID, estado: "aprobado" })).toEqual({
      ok: false,
      error: "No pude guardar tu decisión. Inténtalo de nuevo en un rato.",
    })
    expect(registro).toHaveBeenCalled()
  })
})
