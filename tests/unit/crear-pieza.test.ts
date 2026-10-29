import { describe, expect, test, vi } from "vitest"
import type { Resultado } from "@/lib/marcas/acciones"
import { crearPiezaCon } from "@/lib/piezas/acciones"

const PIEZA = "11111111-1111-4111-8111-111111111111"
const PILAR = "22222222-2222-4222-8222-222222222222"

function puertos(cambios: { planear?: Resultado; ponerPilar?: Resultado } = {}) {
  return {
    crear: vi.fn(async (): Promise<Resultado<{ piezaId: string }>> => ({ ok: true, piezaId: PIEZA })),
    planear: vi.fn(async (): Promise<Resultado> => cambios.planear ?? { ok: true }),
    ponerPilar: vi.fn(async (): Promise<Resultado> => cambios.ponerPilar ?? { ok: true }),
  }
}

describe("crearPiezaCon", () => {
  test("creates, plans and sets the pillar with nothing to warn about", async () => {
    const p = puertos()
    expect(await crearPiezaCon(p, { pilarId: PILAR })).toEqual({ ok: true, piezaId: PIEZA, aviso: [] })
    expect(p.planear).toHaveBeenCalledWith(PIEZA)
    expect(p.ponerPilar).toHaveBeenCalledWith({ piezaId: PIEZA, pilarId: PILAR })
  })

  test("keeps the piece and warns when the pillar could not be set", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const p = puertos({ ponerPilar: { ok: false, error: "Ese pilar ya no está en la línea editorial." } })
    expect(await crearPiezaCon(p, { pilarId: PILAR })).toEqual({ ok: true, piezaId: PIEZA, aviso: ["pilar"] })
    error.mockRestore()
  })

  test("keeps the piece and warns when the plan could not be set, and still sets the pillar", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const p = puertos({ planear: { ok: false, error: "No encontré un horario libre." } })
    expect(await crearPiezaCon(p, { pilarId: PILAR })).toEqual({ ok: true, piezaId: PIEZA, aviso: ["plan"] })
    expect(p.ponerPilar).toHaveBeenCalled()
    error.mockRestore()
  })

  test("does not touch the pillar when none was chosen", async () => {
    const p = puertos()
    expect(await crearPiezaCon(p, { pilarId: null })).toEqual({ ok: true, piezaId: PIEZA, aviso: [] })
    expect(p.ponerPilar).not.toHaveBeenCalled()
  })

  test("returns the creation error as it is", async () => {
    const p = puertos()
    p.crear.mockResolvedValueOnce({ ok: false, error: "Falta el texto." })
    expect(await crearPiezaCon(p, {})).toEqual({ ok: false, error: "Falta el texto." })
    expect(p.planear).not.toHaveBeenCalled()
  })
})
