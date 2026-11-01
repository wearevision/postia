import { render, screen } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { FormularioMarca } from "@/app/(app)/marcas/formulario-marca"

vi.mock("@/app/(app)/marcas/acciones", () => ({ crearMarcaAccion: vi.fn() }))

describe("FormularioMarca", () => {
  test("each voice option is a tap target of at least 44 px, and «yo» is the default", () => {
    render(<FormularioMarca />)
    for (const nombre of ["«yo»", "«nosotros»"]) {
      const opcion = screen.getByRole("radio", { name: nombre })
      expect(opcion.closest("label")).toHaveClass("min-h-11", "items-center")
    }
    expect(screen.getByRole("radio", { name: "«yo»" })).toBeChecked()
  })
})
