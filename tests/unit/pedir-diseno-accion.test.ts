import { describe, expect, test } from "vitest"
import { pedirDisenoAccion } from "@/app/(app)/piezas/carrusel/acciones"

describe("pedirDisenoAccion", () => {
  test("refuses a request without a piece, because carousels are only edited from an existing piece", async () => {
    const resultado = await pedirDisenoAccion({ cuentaId: "x", piezaId: null })
    expect(resultado).toEqual({ ok: false, error: "Elige la pieza que quieres editar." })
  })
})
