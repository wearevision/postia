import { render, screen } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { Navegacion } from "@/app/(app)/navegacion"

const ruta = vi.hoisted(() => ({ actual: "/" }))
vi.mock("next/navigation", () => ({ usePathname: () => ruta.actual }))

function marcado(): string[] {
  return screen.queryAllByRole("link", { current: "page" }).map((enlace) => enlace.textContent ?? "")
}

describe("Navegacion", () => {
  test("marks only the link of the current screen", () => {
    ruta.actual = "/calendario"
    render(<Navegacion />)
    expect(screen.getByRole("link", { name: "Calendario" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current")
  })

  test("marks Inicio only on the root", () => {
    ruta.actual = "/"
    render(<Navegacion />)
    expect(marcado()).toEqual(["Inicio"])
  })

  test.each(["/piezas/nueva", "/piezas/pedir", "/piezas/carrusel", "/investigar", "/investigar/abc"])(
    "marks Nueva on the creation flow %s",
    (destino) => {
      ruta.actual = destino
      render(<Navegacion />)
      expect(marcado()).toEqual(["Nueva"])
    },
  )

  test.each(["/marcas", "/voz", "/voz/abc"])("marks Marcas on %s", (destino) => {
    ruta.actual = destino
    render(<Navegacion />)
    expect(marcado()).toEqual(["Marcas"])
  })

  test("marks Ajustes on its own screen", () => {
    ruta.actual = "/ajustes"
    render(<Navegacion />)
    expect(marcado()).toEqual(["Ajustes"])
  })

  test("is hidden inside a piece page, where the signing flow keeps only a way back", () => {
    ruta.actual = "/piezas/abc"
    render(<Navegacion />)
    expect(screen.queryByRole("navigation", { name: "Principal" })).not.toBeInTheDocument()
  })

  test("pairs every destination with a decorative icon and a visible label", () => {
    ruta.actual = "/"
    render(<Navegacion />)
    const enlaces = screen.getAllByRole("link")
    expect(enlaces.map((enlace) => enlace.textContent)).toEqual(["Inicio", "Nueva", "Calendario", "Marcas", "Ajustes"])
    for (const enlace of enlaces) {
      const icono = enlace.querySelector("svg")
      expect(icono, enlace.textContent ?? "").not.toBeNull()
      expect(icono).toHaveAttribute("aria-hidden", "true")
    }
  })

  test("ties the sunken look to the current page and keeps every target at least 44px tall", () => {
    ruta.actual = "/marcas"
    render(<Navegacion />)
    for (const enlace of screen.getAllByRole("link")) {
      expect(enlace.className).toContain("aria-[current=page]:shadow-hundido")
      expect(enlace.className).toContain("aria-[current=page]:text-primario")
      expect(enlace.className).toContain("min-h-14")
    }
  })
})
