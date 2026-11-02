import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"
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

/** iOS shrinks the visual viewport, not the window, when the keyboard opens. */
function viewportDe(alto: number) {
  const viewport = Object.assign(new EventTarget(), { height: alto })
  vi.stubGlobal("visualViewport", viewport)
  return {
    cambiar(nuevo: number) {
      viewport.height = nuevo
      act(() => {
        viewport.dispatchEvent(new Event("resize"))
      })
    },
  }
}

describe("Navegacion with the iPhone keyboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  test("hides while the keyboard is open, so iOS cannot leave it floating mid-screen", () => {
    vi.stubGlobal("innerHeight", 844)
    const viewport = viewportDe(844)
    render(<Navegacion />)
    expect(screen.getByRole("navigation", { name: "Principal" })).toBeVisible()
    viewport.cambiar(500)
    expect(screen.queryByRole("navigation", { name: "Principal" })).not.toBeInTheDocument()
    viewport.cambiar(844)
    expect(screen.getByRole("navigation", { name: "Principal" })).toBeVisible()
  })

  test("when the keyboard closes it re-lays the page where it is, which puts iOS's fixed elements back", () => {
    vi.stubGlobal("innerHeight", 844)
    vi.stubGlobal("scrollX", 0)
    vi.stubGlobal("scrollY", 1200)
    const scrollTo = vi.fn()
    vi.stubGlobal("scrollTo", scrollTo)
    const viewport = viewportDe(844)
    render(<Navegacion />)
    viewport.cambiar(500)
    expect(scrollTo).not.toHaveBeenCalled()
    viewport.cambiar(844)
    expect(scrollTo).toHaveBeenCalledWith(0, 1200)
  })

  test("a small resize, like the address bar, is not the keyboard", () => {
    vi.stubGlobal("innerHeight", 844)
    const viewport = viewportDe(844)
    render(<Navegacion />)
    viewport.cambiar(780)
    expect(screen.getByRole("navigation", { name: "Principal" })).toBeVisible()
  })
})
