import { render, screen } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"

const ruta = vi.hoisted(() => ({ actual: "/" }))
vi.mock("next/navigation", () => ({ usePathname: () => ruta.actual }))

import { Encabezado } from "@/app/(app)/encabezado"

describe("Encabezado", () => {
  test("hides the chip on a working screen under 80 %", () => {
    ruta.actual = "/calendario"
    const { container } = render(<Encabezado gastadoMicro={1_000_000} topeMicro={40_000_000} />)
    expect(container).toBeEmptyDOMElement()
  })

  test("shows it on Inicio", () => {
    ruta.actual = "/"
    render(<Encabezado gastadoMicro={1_000_000} topeMicro={40_000_000} />)
    expect(screen.getByRole("link", { name: /Gasto del mes/ })).toBeInTheDocument()
  })
})
