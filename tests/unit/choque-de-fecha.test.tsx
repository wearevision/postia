import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }))

import { FirmaDePieza } from "@/app/(app)/piezas/[id]/firma"
import type { Resultado } from "@/lib/marcas/acciones"

// Tuesday 3 November 2026, 11:00 in Chile.
const OTRA = "2026-11-03T14:00:00.000Z"

function montar(fechaPropuesta = "2026-11-04T14:00:00.000Z") {
  const planear = vi.fn(async (): Promise<Resultado> => ({ ok: true }))
  render(
    <FirmaDePieza
      piezaId="11111111-1111-4111-8111-111111111111"
      huella={"a".repeat(64)}
      fechaPropuesta={fechaPropuesta}
      abiertaEn="2026-11-02T20:00:00.000Z"
      ruta="api"
      cuenta="Federico"
      ocupados={[OTRA]}
      firmar={vi.fn(async (): Promise<Resultado> => ({ ok: true }))}
      firmarParaReserva={vi.fn(async (): Promise<Resultado> => ({ ok: true }))}
      planear={planear}
    />,
  )
  return planear
}

describe("choosing a day that already has a piece of the account", () => {
  test("says when the other one goes out and still saves the chosen date", () => {
    const planear = montar()
    fireEvent.click(screen.getByRole("button", { name: "Cambiar fecha" }))
    const campo = screen.getByLabelText("Fecha y hora de publicación")
    fireEvent.change(campo, { target: { value: "2026-11-03T18:00" } })
    expect(screen.getByText("Ese día ya sale otra publicación de esta cuenta a las 11:00.")).toHaveAttribute(
      "role",
      "status",
    )
    expect(campo).toHaveAccessibleDescription("Ese día ya sale otra publicación de esta cuenta a las 11:00.")
    fireEvent.click(screen.getByRole("button", { name: "Guardar fecha" }))
    expect(planear).toHaveBeenCalledWith({
      piezaId: "11111111-1111-4111-8111-111111111111",
      planeadaPara: "2026-11-03T21:00:00.000Z",
    })
  })

  test("says nothing on a free day", () => {
    montar()
    fireEvent.click(screen.getByRole("button", { name: "Cambiar fecha" }))
    fireEvent.change(screen.getByLabelText("Fecha y hora de publicación"), { target: { value: "2026-11-05T11:00" } })
    expect(screen.queryByText(/Ese día ya sale/)).not.toBeInTheDocument()
  })

  test("keeps saying it next to the saved date, before signing", () => {
    montar("2026-11-03T21:00:00.000Z")
    expect(screen.getByText("Ese día ya sale otra publicación de esta cuenta a las 11:00.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Firmar para el / })).toBeInTheDocument()
  })
})
