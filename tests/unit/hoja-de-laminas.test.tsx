import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { FirmaDePieza } from "@/app/(app)/piezas/[id]/firma"
import { FinDelTexto, LecturaDePieza } from "@/app/(app)/piezas/[id]/lectura"
import { VistasDelCarrusel } from "@/app/(app)/piezas/[id]/vistas"

type Entrada = { target: Element; isIntersecting: boolean; intersectionRatio: number }

const observadores: FalsoObservador[] = []

class FalsoObservador {
  elementos = new Set<Element>()
  constructor(readonly aviso: (entradas: Entrada[]) => void) {
    observadores.push(this)
  }
  observe(elemento: Element) {
    this.elementos.add(elemento)
  }
  unobserve(elemento: Element) {
    this.elementos.delete(elemento)
  }
  disconnect() {
    this.elementos.clear()
  }
  takeRecords() {
    return []
  }
}

function mostrar(elemento: Element, proporcion: number) {
  act(() => {
    for (const observador of observadores) {
      if (observador.elementos.has(elemento))
        observador.aviso([{ target: elemento, isIntersecting: proporcion > 0, intersectionRatio: proporcion }])
    }
  })
}

const VISTAS = ["/a.png", "/b.png", "/c.png"]

function montar(vistas = VISTAS) {
  render(
    <LecturaDePieza laminas={vistas.length}>
      <VistasDelCarrusel vistas={vistas} />
    </LecturaDePieza>,
  )
}

const abrir = () => fireEvent.click(screen.getByRole("button", { name: "Ver las 3 juntas" }))
const hoja = () => screen.getByRole("dialog")
const laminaEnLaHoja = (n: number) =>
  within(hoja())
    .getByRole("img", { name: `Lámina ${n} de 3` })
    .closest("li") as Element

beforeEach(() => {
  observadores.length = 0
  vi.stubGlobal("IntersectionObserver", FalsoObservador)
})
afterEach(() => vi.unstubAllGlobals())

describe("the sheet with every slide together", () => {
  test("is offered only when there is more than one slide", () => {
    montar(["/a.png"])
    expect(screen.queryByRole("button", { name: /juntas/ })).not.toBeInTheDocument()
  })

  test("opens as a modal dialog and puts the focus on its title", () => {
    montar()
    abrir()
    expect(hoja()).toHaveAttribute("aria-modal", "true")
    const titulo = within(hoja()).getByRole("heading", { name: "Las 3 láminas" })
    expect(hoja()).toHaveAccessibleName("Las 3 láminas")
    expect(titulo).toHaveFocus()
  })

  test("makes everything behind it unreachable while it is open", () => {
    montar()
    const fondo = screen.getByRole("button", { name: "Ver las 3 juntas" }).closest("section")?.parentElement
    abrir()
    expect(fondo).toHaveAttribute("inert")
    expect(hoja()).not.toHaveAttribute("inert")
  })

  test("closes with Escape, frees the background and gives the focus back to its button", () => {
    montar()
    const boton = screen.getByRole("button", { name: "Ver las 3 juntas" })
    const fondo = boton.closest("section")?.parentElement
    abrir()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(fondo).not.toHaveAttribute("inert")
    expect(boton).toHaveFocus()
  })

  test("closes with a visible button", () => {
    montar()
    abrir()
    fireEvent.click(within(hoja()).getByRole("button", { name: "Cerrar" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  test("counts a slide as seen only when it is really shown in the sheet", () => {
    montar()
    abrir()
    expect(screen.getByRole("img", { name: "Viste 0 de 3 láminas" })).toBeInTheDocument()
    mostrar(laminaEnLaHoja(2), 1)
    expect(screen.getByRole("img", { name: "Viste 1 de 3 láminas" })).toBeInTheDocument()
  })

  test("enables confirming only once the end of the sheet is reached", () => {
    montar()
    abrir()
    const confirmar = within(hoja()).getByRole("button", { name: "Baja hasta ver las 3" })
    expect(confirmar).toBeDisabled()
    mostrar(within(hoja()).getByTestId("fin-de-la-hoja"), 1)
    const listo = within(hoja()).getByRole("button", { name: "Listo" })
    expect(listo).toBeEnabled()
    fireEvent.click(listo)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})

describe("while the sheet is open", () => {
  test("keeps the focus where the person put it when a slide is marked as seen", () => {
    montar()
    abrir()
    const cerrar = within(hoja()).getByRole("button", { name: "Cerrar" })
    cerrar.focus()
    mostrar(laminaEnLaHoja(1), 1)
    expect(cerrar).toHaveFocus()
  })
})

describe("slides seen in the sheet unlock signing like swiping does", () => {
  function montarConFirma() {
    render(
      <LecturaDePieza laminas={3}>
        <VistasDelCarrusel vistas={VISTAS} />
        <FinDelTexto />
        <FirmaDePieza
          piezaId="11111111-1111-4111-8111-111111111111"
          huella={"a".repeat(64)}
          fechaPropuesta="2026-11-03T14:00:00.000Z"
          abiertaEn="2026-11-02T20:00:00.000Z"
          ruta="api"
          cuenta="Federico"
          firmar={vi.fn(async () => ({ ok: true as const }))}
          firmarParaReserva={vi.fn(async () => ({ ok: true as const }))}
          planear={vi.fn(async () => ({ ok: true as const }))}
        />
      </LecturaDePieza>,
    )
  }
  const motivo = () => document.getElementById("motivo-de-lectura")

  test("keeps the missing-slides reason while the sheet showed only some, even after closing it", () => {
    montarConFirma()
    abrir()
    mostrar(laminaEnLaHoja(1), 1)
    mostrar(within(hoja()).getByTestId("fin-de-la-hoja"), 1)
    fireEvent.click(within(hoja()).getByRole("button", { name: "Listo" }))
    expect(motivo()).toHaveTextContent(/2/)
    expect(motivo()).not.toHaveTextContent("Falta leer el texto hasta el final.")
  })

  test("every slide shown in the sheet counts as seen, leaving only the text to read", () => {
    montarConFirma()
    abrir()
    for (const n of [1, 2, 3]) mostrar(laminaEnLaHoja(n), 0.95)
    fireEvent.click(within(hoja()).getByRole("button", { name: "Cerrar" }))
    expect(motivo()).toHaveTextContent("Falta leer el texto hasta el final.")
  })

  test("a slide only partly shown in the sheet does not count", () => {
    montarConFirma()
    abrir()
    mostrar(laminaEnLaHoja(3), 0.5)
    fireEvent.click(within(hoja()).getByRole("button", { name: "Cerrar" }))
    expect(screen.getByRole("img", { name: "Viste 0 de 3 láminas" })).toBeInTheDocument()
  })
})
