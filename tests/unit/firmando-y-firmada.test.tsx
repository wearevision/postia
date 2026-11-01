import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { Desprogramar } from "@/app/(app)/piezas/[id]/controles"
import { FirmaDePieza } from "@/app/(app)/piezas/[id]/firma"
import { DespuesDeFirmar, FirmaConfirmada } from "@/app/(app)/piezas/[id]/firmada"
import type { Resultado } from "@/lib/marcas/acciones"
import { huellaCorta } from "@/lib/piezas/textos"

const HUELLA = `7f3ac91e04b2${"0".repeat(52)}`

const abiertas: Array<() => void> = []

// React chains async actions: one left pending would keep the next test's button busy, so each test closes its own.
afterEach(() => {
  act(() => {
    for (const cerrar of abiertas.splice(0)) cerrar()
  })
})

function montar() {
  const salida: { terminar: (resultado: Resultado) => void } = { terminar: () => {} }
  const enCurso = () =>
    new Promise<Resultado>((resolver) => {
      Object.assign(salida, { terminar: resolver })
      abiertas.push(() => resolver({ ok: true }))
    })
  const firmar = vi.fn(enCurso)
  const firmarParaReserva = vi.fn(enCurso)
  render(
    <FirmaDePieza
      piezaId="11111111-1111-4111-8111-111111111111"
      huella={HUELLA}
      fechaPropuesta="2026-11-03T14:00:00.000Z"
      abiertaEn="2026-11-02T20:00:00.000Z"
      ruta="api"
      cuenta="WAV"
      firmar={firmar}
      firmarParaReserva={firmarParaReserva}
      planear={vi.fn(async () => ({ ok: true as const }))}
    />,
  )
  return salida
}

describe("while signing", () => {
  test("shows the pressed button as busy and blocks the other one", () => {
    montar()
    fireEvent.click(screen.getByRole("button", { name: /^Firmar para el / }))
    const ocupado = screen.getByRole("button", { name: "Firmando…" })
    expect(ocupado).toHaveAttribute("aria-busy", "true")
    expect(ocupado).toBeDisabled()
    expect(screen.getByRole("button", { name: "Guardar en la reserva, sin fecha" })).toBeDisabled()
  })

  test("shows the reserve button as busy when that is the one pressed", () => {
    montar()
    fireEvent.click(screen.getByRole("button", { name: "Guardar en la reserva, sin fecha" }))
    expect(screen.getByRole("button", { name: "Firmando…" })).toHaveAttribute("aria-busy", "true")
    expect(screen.getByRole("button", { name: /^Firmar para el / })).toBeDisabled()
  })

  test("announces it politely in a region that is never replaced", () => {
    montar()
    const region = screen.getByRole("status")
    expect(region).toHaveAttribute("aria-live", "polite")
    expect(region).toBeEmptyDOMElement()
    fireEvent.click(screen.getByRole("button", { name: /^Firmar para el / }))
    expect(screen.getByRole("status")).toBe(region)
    expect(region).toHaveTextContent("Firmando…")
  })

  test("goes back to the normal buttons when signing fails, and says so in the alert", async () => {
    const salida = montar()
    fireEvent.click(screen.getByRole("button", { name: /^Firmar para el / }))
    act(() => salida.terminar({ ok: false, error: "Elige una fecha y hora futuras." }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Elige una fecha y hora futuras.")
    await waitFor(() => expect(screen.getByRole("button", { name: /^Firmar para el / })).toBeEnabled())
    expect(screen.queryByRole("button", { name: "Firmando…" })).not.toBeInTheDocument()
    expect(screen.getByRole("status")).toBeEmptyDOMElement()
  })
})

describe("a signed piece", () => {
  test("confirms when it goes out and names the exact version by a short fingerprint", () => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => {})
    render(<FirmaConfirmada huella={HUELLA} programadaPara="2026-11-03T14:00:00.000Z" />)
    const aviso = screen.getByRole("status")
    expect(aviso).toHaveTextContent("Firmada · sale el martes 3 de noviembre, 11:00")
    expect(aviso).toHaveTextContent("Se publica exactamente esta versión (huella 7f3a·c91e·04b2).")
    expect(screen.getByText("7f3a·c91e·04b2").tagName).toBe("CODE")
  })

  test("a piece signed for the reserve says it is in the reserve", () => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => {})
    render(<FirmaConfirmada huella={HUELLA} programadaPara={null} />)
    expect(screen.getByRole("status")).toHaveTextContent("Firmada · en la reserva")
  })

  test("brings the person back to the top, where the confirmation is", () => {
    const subir = vi.spyOn(window, "scrollTo").mockImplementation(() => {})
    render(<FirmaConfirmada huella={HUELLA} programadaPara={null} />)
    expect(subir).toHaveBeenCalledWith({ top: 0 })
  })

  test("offers the next piece by account, date and how many are left", () => {
    render(
      <DespuesDeFirmar
        siguiente={{ id: "p2", cuenta: "Página de WAV", planeadaPara: "2026-11-04T18:00:00.000Z", quedan: 3 }}
      />,
    )
    const enlace = screen.getByRole("link", { name: "Siguiente: Página de WAV · mié 4 nov, 15:00 (quedan 3)" })
    expect(enlace).toHaveAttribute("href", "/piezas/p2")
  })

  test("leaves the date out when the next piece has no plan", () => {
    render(<DespuesDeFirmar siguiente={{ id: "p2", cuenta: "Federico", planeadaPara: null, quedan: 1 }} />)
    expect(screen.getByRole("link", { name: "Siguiente: Federico (quedan 1)" })).toBeInTheDocument()
  })

  test("says the day is done with a way back to Inicio when nothing is left to sign", () => {
    render(<DespuesDeFirmar siguiente={null} />)
    expect(screen.getByText("Listo por hoy")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Ir a Inicio" })).toHaveAttribute("href", "/")
  })

  test("keeps the pressed button busy after the signature is saved, until the page changes", async () => {
    const salida = montar()
    fireEvent.click(screen.getByRole("button", { name: /^Firmar para el / }))
    act(() => salida.terminar({ ok: true }))
    await waitFor(() => expect(screen.getByRole("status")).toBeEmptyDOMElement())
    const ocupado = screen.getByRole("button", { name: "Firmando…" })
    expect(ocupado).toBeDisabled()
    expect(screen.getByRole("button", { name: "Guardar en la reserva, sin fecha" })).toBeDisabled()
  })

  test("shortens a fingerprint to three groups of four", () => {
    expect(huellaCorta(HUELLA)).toBe("7f3a·c91e·04b2")
  })

  test("offers to undo the signature until it goes out, and does it on press", () => {
    const desprogramar = vi.fn(async (): Promise<Resultado> => ({ ok: true }))
    render(<Desprogramar piezaId="p1" desprogramar={desprogramar} />)
    expect(screen.getByText("Puedes deshacer la firma hasta que salga.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Deshacer firma" }))
    expect(desprogramar).toHaveBeenCalledWith("p1")
  })
})
