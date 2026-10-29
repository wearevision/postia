import { describe, expect, test, vi } from "vitest"
import { probarClaude } from "@/lib/ia/probar"

describe("probarClaude", () => {
  test("does nothing and spends nothing without the typed confirmation", async () => {
    const pedir = vi.fn()
    expect(await probarClaude({ confirmacion: "gastar" }, "run_1", pedir)).toEqual({ hecho: false })
    expect(pedir).not.toHaveBeenCalled()
  })

  test("makes one cheap call keyed by the run, charged to General", async () => {
    const pedir = vi.fn(async () => ({ texto: "listo", detenido: "end_turn" as const }))
    expect(await probarClaude({ confirmacion: "GASTAR" }, "run_1", pedir)).toEqual({ hecho: true, texto: "listo" })
    expect(pedir).toHaveBeenCalledWith(
      { clave: "probar-claude:run_1", paso: "probar", marcaId: null },
      expect.objectContaining({ maxTokens: 1024, esfuerzo: "low" }),
    )
  })
})
