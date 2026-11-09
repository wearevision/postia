import { afterEach, describe, expect, test, vi } from "vitest"
import { pedirActualizacionDeAnaliticas } from "@/lib/rendimiento/acciones-de-analiticas"
import type { Db } from "@/lib/supabase/database"

const ID = "6f1c0c1e-8a53-4f43-9a55-0b8f4a1d2c11"

function dbQueResponde(error: { code?: string; message: string } | null, data: unknown = null) {
  const rpc = vi.fn(async () => ({ data, error }))
  return { db: { rpc } as unknown as Db, rpc }
}

afterEach(() => vi.restoreAllMocks())

describe("pedirActualizacionDeAnaliticas", () => {
  test("queues a reading of the account", async () => {
    const { db, rpc } = dbQueResponde(null, "lectura-1")
    expect(await pedirActualizacionDeAnaliticas(db, ID)).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith("pedir_lectura_de_analiticas", { p_cuenta: ID })
  })

  test("refuses something that is not an account id without calling the database", async () => {
    const { db, rpc } = dbQueResponde(null)
    expect(await pedirActualizacionDeAnaliticas(db, "no-es-un-id")).toEqual({ ok: false, error: "Revisa la cuenta." })
    expect(rpc).not.toHaveBeenCalled()
  })

  test("says in Spanish that a reading is already open", async () => {
    const { db } = dbQueResponde({ code: "55000", message: "lectura_en_curso" })
    expect(await pedirActualizacionDeAnaliticas(db, ID)).toEqual({
      ok: false,
      error: "LinkedIn ya se está leyendo. Espera a que termine.",
    })
  })

  test("asks to reconnect LinkedIn when the account has no usable connection", async () => {
    const { db } = dbQueResponde({ code: "55000", message: "analiticas_sin_conexion" })
    expect(await pedirActualizacionDeAnaliticas(db, ID)).toEqual({
      ok: false,
      error: "Reconecta LinkedIn desde Ajustes para actualizar las cifras.",
    })
  })

  test("says in Spanish that a profile was already read twice today", async () => {
    const { db } = dbQueResponde({ code: "55000", message: "lecturas_del_dia_agotadas" })
    expect(await pedirActualizacionDeAnaliticas(db, ID)).toEqual({
      ok: false,
      error: "Ya se leyó LinkedIn dos veces hoy. Vuelve mañana.",
    })
  })

  test("says in Spanish that only the owner can update", async () => {
    const { db } = dbQueResponde({ code: "42501", message: "solo_el_dueno_pide_lecturas" })
    expect(await pedirActualizacionDeAnaliticas(db, ID)).toEqual({
      ok: false,
      error: "Solo el dueño de la marca de esa cuenta puede actualizar las cifras.",
    })
  })

  test("logs an unexpected error and answers with a generic message that leaks nothing", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})
    const { db } = dbQueResponde({ code: "XX000", message: "relation secreta" })
    expect(await pedirActualizacionDeAnaliticas(db, ID)).toEqual({
      ok: false,
      error: "No pude pedir la actualización. Inténtalo de nuevo en un rato.",
    })
    expect(registro).toHaveBeenCalled()
  })
})
