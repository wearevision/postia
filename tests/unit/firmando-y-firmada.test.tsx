import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { Desprogramar } from "@/app/(app)/piezas/[id]/controles"
import { FirmaDePieza } from "@/app/(app)/piezas/[id]/firma"
import { FirmaConfirmada } from "@/app/(app)/piezas/[id]/firmada"
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
      texto="Texto"
      fechaPropuesta="2026-11-03T14:00:00.000Z"
      abiertaEn="2026-11-02T20:00:00.000Z"
      ruta="api"
      cuenta="WAV"
      firmar={firmar}
      firmarParaReserva={firmarParaReserva}
    />,
  )
  return salida
}

describe("while signing", () => {
  test("shows the pressed button as busy and blocks the other one", () => {
    montar()
    fireEvent.click(screen.getByRole("button", { name: "Firmar y programar" }))
    const ocupado = screen.getByRole("button", { name: "Firmando…" })
    expect(ocupado).toHaveAttribute("aria-busy", "true")
    expect(ocupado).toBeDisabled()
    expect(screen.getByRole("button", { name: "Firmar para la reserva" })).toBeDisabled()
  })

  test("shows the reserve button as busy when that is the one pressed", () => {
    montar()
    fireEvent.click(screen.getByRole("button", { name: "Firmar para la reserva" }))
    expect(screen.getByRole("button", { name: "Firmando…" })).toHaveAttribute("aria-busy", "true")
    expect(screen.getByRole("button", { name: "Firmar y programar" })).toBeDisabled()
  })

  test("announces it politely in a region that is never replaced", () => {
    montar()
    const region = screen.getByRole("status")
    expect(region).toHaveAttribute("aria-live", "polite")
    expect(region).toBeEmptyDOMElement()
    fireEvent.click(screen.getByRole("button", { name: "Firmar y programar" }))
    expect(screen.getByRole("status")).toBe(region)
    expect(region).toHaveTextContent("Firmando…")
  })

  test("goes back to the normal buttons when signing fails, and says so in the alert", async () => {
    const salida = montar()
    fireEvent.click(screen.getByRole("button", { name: "Firmar y programar" }))
    act(() => salida.terminar({ ok: false, error: "Elige una fecha y hora futuras." }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Elige una fecha y hora futuras.")
    await waitFor(() => expect(screen.getByRole("button", { name: "Firmar y programar" })).toBeEnabled())
    expect(screen.queryByRole("button", { name: "Firmando…" })).not.toBeInTheDocument()
    expect(screen.getByRole("status")).toBeEmptyDOMElement()
  })
})

describe("a signed piece", () => {
  test("confirms it and names the exact version by a short fingerprint", () => {
    render(<FirmaConfirmada huella={HUELLA} />)
    const aviso = screen.getByRole("status")
    expect(aviso).toHaveTextContent("Firmada. Se publica exactamente esta versión (huella 7f3a·c91e·04b2).")
    expect(screen.getByText("7f3a·c91e·04b2").tagName).toBe("CODE")
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
