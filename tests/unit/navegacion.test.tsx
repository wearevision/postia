import { render, screen } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { Navegacion } from "@/app/(app)/navegacion"

const ruta = vi.hoisted(() => ({ actual: "/" }))
vi.mock("next/navigation", () => ({ usePathname: () => ruta.actual }))

describe("Navegacion", () => {
  test("marks only the link of the current screen", () => {
    ruta.actual = "/calendario"
    render(<Navegacion />)
    expect(screen.getByRole("link", { name: "Calendario" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current")
  })

  test("a piece page marks nothing, and Inicio is only the root", () => {
    ruta.actual = "/piezas/abc"
    render(<Navegacion />)
    expect(screen.queryByRole("link", { current: "page" })).not.toBeInTheDocument()
  })
})
