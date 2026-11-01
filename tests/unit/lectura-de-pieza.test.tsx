import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { FirmaDePieza } from "@/app/(app)/piezas/[id]/firma"
import { FinDelTexto, LecturaDePieza } from "@/app/(app)/piezas/[id]/lectura"
import { VistasDelCarrusel } from "@/app/(app)/piezas/[id]/vistas"

type Entrada = { target: Element; isIntersecting: boolean; intersectionRatio: number }
type Aviso = (entradas: Entrada[]) => void

const observadores: FalsoObservador[] = []

class FalsoObservador {
  elementos = new Set<Element>()
  constructor(
    readonly aviso: Aviso,
    readonly opciones?: IntersectionObserverInit,
  ) {
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
      if (observador.elementos.has(elemento)) {
        observador.aviso([{ target: elemento, isIntersecting: proporcion > 0, intersectionRatio: proporcion }])
      }
    }
  })
}

const laminaDe = (n: number, de: number) =>
  screen.getByRole("img", { name: `Lámina ${n} de ${de}` }).closest("li") as Element
const finDelTexto = () => screen.getByTestId("fin-del-texto")
const motivo = () => document.getElementById("motivo-de-lectura")

const VISTAS = ["/a.png", "/b.png", "/c.png"]

function montar(vistas: string[] = VISTAS, clave = "v1", bloqueo: string | null = null) {
  const pieza = (
    <LecturaDePieza key={clave} laminas={vistas.length} bloqueo={bloqueo}>
      {vistas.length > 0 && <VistasDelCarrusel vistas={vistas} />}
      <p>{"Primera línea\nSegunda línea"}</p>
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
    </LecturaDePieza>
  )
  return render(pieza)
}

const botonDeFirma = () => screen.getByRole("button", { name: /^Firmar para el / })
const botonDeReserva = () => screen.getByRole("button", { name: "Guardar en la reserva, sin fecha" })

function verTodas(de: number) {
  for (let n = 1; n <= de; n++) mostrar(laminaDe(n, de), 1)
}

beforeEach(() => {
  observadores.length = 0
  vi.stubGlobal("IntersectionObserver", FalsoObservador)
})
afterEach(() => vi.unstubAllGlobals())

describe("reading gate before signing", () => {
  test("blocks both signing buttons and says how many slides are still unseen", () => {
    montar()
    expect(botonDeFirma()).toBeDisabled()
    expect(botonDeReserva()).toBeDisabled()
    expect(motivo()).toHaveTextContent("Te faltan 3 láminas: desliza o toca «Ver las 3 juntas».")
    expect(botonDeFirma()).toHaveAccessibleDescription(/Te faltan 3 láminas/)
  })

  test("counts a slide only once at least 90% of it is visible", () => {
    montar()
    mostrar(laminaDe(1, 3), 0.6)
    expect(motivo()).toHaveTextContent("Te faltan 3 láminas: desliza o toca «Ver las 3 juntas».")
    mostrar(laminaDe(1, 3), 0.95)
    expect(motivo()).toHaveTextContent("Te faltan 2 láminas: desliza o toca «Ver las 3 juntas».")
  })

  test("says a single missing slide in the singular", () => {
    montar()
    mostrar(laminaDe(1, 3), 1)
    mostrar(laminaDe(2, 3), 1)
    expect(motivo()).toHaveTextContent("Te falta 1 lámina: desliza o toca «Ver las 3 juntas».")
  })

  test("the reason itself opens the sheet with every slide", () => {
    montar()
    fireEvent.click(within(motivo() as HTMLElement).getByRole("button", { name: "Ver las 3 juntas" }))
    expect(screen.getByRole("dialog", { name: "Las 3 láminas" })).toBeInTheDocument()
  })

  test("closing the sheet opened from the reason gives the focus back to the reason's button", () => {
    montar()
    const desdeElMotivo = within(motivo() as HTMLElement).getByRole("button", { name: "Ver las 3 juntas" })
    desdeElMotivo.focus()
    fireEvent.click(desdeElMotivo)
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(desdeElMotivo).toHaveFocus()
  })

  test("a one-slide carousel asks to see the slide, with no sheet to offer", () => {
    montar(["/a.png"])
    expect(motivo()).toHaveTextContent("Te falta ver la lámina entera.")
    expect(screen.queryByRole("button", { name: /juntas/ })).not.toBeInTheDocument()
  })

  test("reports the slides seen as an accessible progress mark", () => {
    montar()
    mostrar(laminaDe(2, 3), 1)
    expect(screen.getByRole("img", { name: "Viste 1 de 3 láminas" })).toBeInTheDocument()
  })

  test("asks to read the text to the end once every slide has been seen", () => {
    montar()
    verTodas(3)
    expect(botonDeFirma()).toBeDisabled()
    expect(screen.getByText("Falta leer el texto hasta el final.")).toBeInTheDocument()
  })

  test("the end of the text counts as reached only above the bottom bar that covers the last 120 px", () => {
    montar()
    const delFin = observadores.find((o) => o.elementos.has(finDelTexto()))
    expect(delFin?.opciones).toEqual({ rootMargin: "0px 0px -120px 0px" })
  })

  test("unlocks signing when every slide has been seen and the end of the text is reached", () => {
    montar()
    verTodas(3)
    mostrar(finDelTexto(), 1)
    expect(botonDeFirma()).toBeEnabled()
    expect(botonDeReserva()).toBeEnabled()
    expect(screen.queryByText(/Te falta|Falta leer/)).not.toBeInTheDocument()
  })

  test("a text-only piece unlocks as soon as the end of the text is visible", () => {
    montar([])
    expect(botonDeFirma()).toBeDisabled()
    expect(screen.getByText("Falta leer el texto hasta el final.")).toBeInTheDocument()
    mostrar(finDelTexto(), 1)
    expect(botonDeFirma()).toBeEnabled()
  })

  test("starts over when the version changes", () => {
    const { rerender } = montar()
    verTodas(3)
    mostrar(finDelTexto(), 1)
    expect(botonDeFirma()).toBeEnabled()
    rerender(
      <LecturaDePieza key="v2" laminas={3}>
        <VistasDelCarrusel vistas={VISTAS} />
        <p>Otro texto</p>
        <FinDelTexto />
        <FirmaDePieza
          piezaId="11111111-1111-4111-8111-111111111111"
          huella={"b".repeat(64)}
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
    expect(botonDeFirma()).toBeDisabled()
    expect(motivo()).toHaveTextContent("Te faltan 3 láminas: desliza o toca «Ver las 3 juntas».")
  })

  test("does not lock the person out when the browser cannot observe visibility", () => {
    vi.unstubAllGlobals()
    vi.stubGlobal("IntersectionObserver", undefined)
    montar()
    expect(botonDeFirma()).toBeEnabled()
    expect(screen.queryByText(/Te falta|Falta leer/)).not.toBeInTheDocument()
  })

  test("a block keeps both buttons disabled with its reason even after everything was read", () => {
    const MOTIVO = "No pude mostrar las láminas. Recarga o revisa el PDF; no se puede firmar sin verlas."
    montar([], "v1", MOTIVO)
    mostrar(finDelTexto(), 1)
    expect(botonDeFirma()).toBeDisabled()
    expect(botonDeReserva()).toBeDisabled()
    expect(botonDeFirma()).toHaveAccessibleDescription(MOTIVO)
  })

  test("a block holds even when the browser cannot observe visibility", () => {
    vi.unstubAllGlobals()
    vi.stubGlobal("IntersectionObserver", undefined)
    montar([], "v1", "No pude mostrar las láminas. Recarga o revisa el PDF; no se puede firmar sin verlas.")
    expect(botonDeFirma()).toBeDisabled()
  })
})
