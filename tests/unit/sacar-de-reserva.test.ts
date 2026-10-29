import { afterEach, describe, expect, test, vi } from "vitest"
import { sacarDeReserva } from "@/lib/piezas/acciones"
import type { Db } from "@/lib/supabase/database"

const PIEZA = "11111111-1111-4111-8111-111111111111"

// A database whose take-out succeeds but whose re-plan read fails.
function dbCuyoPlanFalla(rpc: { error: { code?: string; message: string } | null }): Db {
  const lectura = { eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "boom" } }) }) }
  return { rpc: async () => rpc, from: () => ({ select: () => lectura }) } as unknown as Db
}

describe("sacarDeReserva", () => {
  afterEach(() => vi.restoreAllMocks())

  test("is still a success when the piece left the reserve but the re-plan failed, and logs the failure", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await sacarDeReserva(dbCuyoPlanFalla({ error: null }), PIEZA)).toEqual({ ok: true })
    expect(registro).toHaveBeenCalledWith(
      "No pude planear la pieza al sacarla de la reserva",
      PIEZA,
      expect.any(String),
    )
  })

  test("fails only when the take-out itself is refused", async () => {
    const resultado = await sacarDeReserva(dbCuyoPlanFalla({ error: { message: "pieza_no_esta_en_reserva" } }), PIEZA)
    expect(resultado).toEqual({ ok: false, error: "Esta pieza ya no está en la reserva." })
  })
})
