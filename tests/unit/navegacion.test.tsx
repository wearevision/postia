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

  test.each([
    ["/ideas", "Ideas"],
    ["/investigar", "Investigar"],
    ["/investigar/abc", "Investigar"],
    ["/calendario", "Calendario"],
    ["/ajustes", "Ajustes"],
    ["/marcas", "Ajustes"],
    ["/marcas/pagina", "Ajustes"],
    ["/voz/abc", "Ajustes"],
    ["/clientes", "Ajustes"],
  ])("on %s marks %s", (destino, marcadoEsperado) => {
    ruta.actual = destino
    render(<Navegacion />)
    expect(marcado()).toEqual([marcadoEsperado])
  })

  test("marks nothing on a piece, which belongs to no tab", () => {
    ruta.actual = "/piezas/abc"
    render(<Navegacion />)
    expect(screen.getByRole("navigation", { name: "Principal" })).toBeInTheDocument()
    expect(marcado()).toEqual([])
  })

  test("pairs every destination with a decorative icon and a visible label", () => {
    ruta.actual = "/"
    render(<Navegacion />)
    const enlaces = screen.getAllByRole("link")
    expect(enlaces.map((enlace) => enlace.textContent)).toEqual([
      "Inicio",
      "Ideas",
      "Investigar",
      "Calendario",
      "Ajustes",
    ])
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
