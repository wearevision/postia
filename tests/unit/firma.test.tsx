import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { FirmaDePieza } from "@/app/(app)/piezas/[id]/firma"

const HUELLA = "a".repeat(64)
const PIEZA = "11111111-1111-4111-8111-111111111111"

function montar(sobre: Partial<Parameters<typeof FirmaDePieza>[0]> = {}) {
  const firmar = vi.fn(async () => ({ ok: true as const }))
  render(
    <FirmaDePieza
      piezaId={PIEZA}
      huella={HUELLA}
      texto={"Primera línea\nSegunda línea"}
      fechaPropuesta="2026-11-03T14:00:00.000Z"
      ruta="api"
      firmar={firmar}
      {...sobre}
    />,
  )
  return firmar
}

describe("FirmaDePieza", () => {
  test("shows the exact text and the proposed date in Chile time, prefilled in the field", () => {
    montar()
    expect(screen.getByText(/Primera línea\s+Segunda línea/)).toBeInTheDocument()
    expect(screen.getByText("martes 3 de noviembre, 11:00")).toBeInTheDocument()
    expect(screen.getByLabelText("Fecha y hora de publicación")).toHaveValue("2026-11-03T11:00")
    expect(screen.getByRole("button", { name: "Firmar y programar" })).toBeInTheDocument()
  })

  test("keeps one date line that follows the field", () => {
    montar()
    fireEvent.change(screen.getByLabelText("Fecha y hora de publicación"), { target: { value: "2026-11-04T15:30" } })
    expect(screen.getByText("miércoles 4 de noviembre, 15:30")).toBeInTheDocument()
    expect(screen.queryByText("martes 3 de noviembre, 11:00")).not.toBeInTheDocument()
    expect(screen.getAllByText(/^Sale el/)).toHaveLength(1)
  })

  test("signs with the ISO instant of the field read as Chile time", async () => {
    const firmar = montar()
    fireEvent.change(screen.getByLabelText("Fecha y hora de publicación"), { target: { value: "2026-11-04T15:30" } })
    fireEvent.click(screen.getByRole("button", { name: "Firmar y programar" }))
    await waitFor(() =>
      expect(firmar).toHaveBeenCalledWith({
        piezaId: PIEZA,
        huella: HUELLA,
        programadaPara: "2026-11-04T18:30:00.000Z",
      }),
    )
  })

  test("shows the error from signing as an alert", async () => {
    const firmar = vi.fn(async () => ({ ok: false as const, error: "Elige una fecha y hora futuras." }))
    montar({ firmar })
    fireEvent.click(screen.getByRole("button", { name: "Firmar y programar" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Elige una fecha y hora futuras.")
  })

  test("does not call firmar while the date field is incomplete", () => {
    const firmar = montar()
    fireEvent.change(screen.getByLabelText("Fecha y hora de publicación"), { target: { value: "" } })
    fireEvent.click(screen.getByRole("button", { name: "Firmar y programar" }))
    expect(firmar).not.toHaveBeenCalled()
    expect(screen.getByRole("alert")).toHaveTextContent("Elige la fecha y la hora.")
  })

  test("tells the person a page account is published by hand", () => {
    montar({ ruta: "a_mano" })
    expect(
      screen.getByRole("button", { name: "Firmar: te aviso a la hora para publicarla a mano" }),
    ).toBeInTheDocument()
  })
})
