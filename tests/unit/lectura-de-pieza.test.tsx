import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { FirmaDePieza } from "@/app/(app)/piezas/[id]/firma"
import { LecturaDePieza } from "@/app/(app)/piezas/[id]/lectura"
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

const VISTAS = ["/a.png", "/b.png", "/c.png"]

function montar(vistas: string[] = VISTAS, clave = "v1") {
  const pieza = (
    <LecturaDePieza key={clave} laminas={vistas.length}>
      {vistas.length > 0 && <VistasDelCarrusel vistas={vistas} />}
      <FirmaDePieza
        piezaId="11111111-1111-4111-8111-111111111111"
        huella={"a".repeat(64)}
        texto={"Primera línea\nSegunda línea"}
        fechaPropuesta="2026-11-03T14:00:00.000Z"
        abiertaEn="2026-11-02T20:00:00.000Z"
        ruta="api"
        cuenta="Federico"
        firmar={vi.fn(async () => ({ ok: true as const }))}
        firmarParaReserva={vi.fn(async () => ({ ok: true as const }))}
      />
    </LecturaDePieza>
  )
  return render(pieza)
}

const botonDeFirma = () => screen.getByRole("button", { name: /^Firmar \S+ · / })
const botonDeReserva = () => screen.getByRole("button", { name: "Firmar para la reserva" })

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
    expect(screen.getByText("Viste 0 de 3 láminas. Faltan 3 por ver.")).toBeInTheDocument()
    expect(botonDeFirma()).toHaveAccessibleDescription(/Faltan 3 por ver/)
  })

  test("counts a slide only once at least 90% of it is visible", () => {
    montar()
    mostrar(laminaDe(1, 3), 0.6)
    expect(screen.getByText("Viste 0 de 3 láminas. Faltan 3 por ver.")).toBeInTheDocument()
    mostrar(laminaDe(1, 3), 0.95)
    expect(screen.getByText("Viste 1 de 3 láminas. Faltan 2 por ver.")).toBeInTheDocument()
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
    expect(screen.queryByText(/Faltan|Falta leer/)).not.toBeInTheDocument()
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
        <FirmaDePieza
          piezaId="11111111-1111-4111-8111-111111111111"
          huella={"b".repeat(64)}
          texto="Otro texto"
          fechaPropuesta="2026-11-03T14:00:00.000Z"
          abiertaEn="2026-11-02T20:00:00.000Z"
          ruta="api"
          cuenta="Federico"
          firmar={vi.fn(async () => ({ ok: true as const }))}
          firmarParaReserva={vi.fn(async () => ({ ok: true as const }))}
        />
      </LecturaDePieza>,
    )
    expect(botonDeFirma()).toBeDisabled()
    expect(screen.getByText("Viste 0 de 3 láminas. Faltan 3 por ver.")).toBeInTheDocument()
  })

  test("does not lock the person out when the browser cannot observe visibility", () => {
    vi.unstubAllGlobals()
    vi.stubGlobal("IntersectionObserver", undefined)
    montar()
    expect(botonDeFirma()).toBeEnabled()
    expect(screen.queryByText(/Faltan|Falta leer/)).not.toBeInTheDocument()
  })
})
