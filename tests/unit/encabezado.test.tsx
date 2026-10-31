import { render, screen } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"

const ruta = vi.hoisted(() => ({ actual: "/" }))
vi.mock("next/navigation", () => ({ usePathname: () => ruta.actual }))

import { Encabezado } from "@/app/(app)/encabezado"

describe("Encabezado", () => {
  test("hides the chip on a working screen under 80 %", () => {
    ruta.actual = "/calendario"
    render(<Encabezado gastadoMicro={1_000_000} topeMicro={40_000_000} />)
    expect(screen.queryByRole("link", { name: /Gasto del mes/ })).not.toBeInTheDocument()
  })

  test("always keeps the safe-area band, so the content below pads it only once", () => {
    for (const destino of ["/", "/calendario"]) {
      ruta.actual = destino
      const { container, unmount } = render(<Encabezado gastadoMicro={1_000_000} topeMicro={40_000_000} />)
      expect(container.querySelector("header")?.className).toContain("pt-[env(safe-area-inset-top)]")
      unmount()
    }
  })

  test("shows it on Inicio", () => {
    ruta.actual = "/"
    render(<Encabezado gastadoMicro={1_000_000} topeMicro={40_000_000} />)
    expect(screen.getByRole("link", { name: /Gasto del mes/ })).toBeInTheDocument()
  })
})
