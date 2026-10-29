import { afterEach, describe, expect, test, vi } from "vitest"
import { sacarDeReservaCon } from "@/lib/piezas/acciones"

const PIEZA = "11111111-1111-4111-8111-111111111111"

describe("sacarDeReservaCon", () => {
  afterEach(() => vi.restoreAllMocks())

  test("is still a success when the piece left the reserve but the re-plan failed, and logs only the message", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})
    const resultado = await sacarDeReservaCon(
      {
        sacar: async () => ({ error: null }),
        planear: async () => ({ ok: false, error: "No pude proponer un horario." }),
      },
      PIEZA,
    )
    expect(resultado).toEqual({ ok: true })
    expect(registro).toHaveBeenCalledWith(
      "No pude planear la pieza al sacarla de la reserva",
      PIEZA,
      "No pude proponer un horario.",
    )
  })

  test("fails only when the take-out itself is refused, and does not plan", async () => {
    const planear = vi.fn(async () => ({ ok: true as const }))
    const resultado = await sacarDeReservaCon(
      { sacar: async () => ({ error: { message: "pieza_no_esta_en_reserva" } }), planear },
      PIEZA,
    )
    expect(resultado).toEqual({ ok: false, error: "Esta pieza ya no está en la reserva." })
    expect(planear).not.toHaveBeenCalled()
  })

  test("refuses an id that is not a uuid", async () => {
    const sacar = vi.fn(async () => ({ error: null }))
    const resultado = await sacarDeReservaCon({ sacar, planear: async () => ({ ok: true }) }, "no-es-uuid")
    expect(resultado.ok).toBe(false)
    expect(sacar).not.toHaveBeenCalled()
  })
})
