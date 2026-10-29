import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { SacarDeReserva } from "@/app/(app)/piezas/[id]/controles"

describe("SacarDeReserva", () => {
  test("takes the piece out of the reserve and shows a refusal as an alert", async () => {
    const sacar = vi.fn(async () => ({ ok: false as const, error: "Esta pieza ya no está en la reserva." }))
    render(<SacarDeReserva piezaId="p1" sacar={sacar} />)
    fireEvent.click(screen.getByRole("button", { name: "Sacar de la reserva" }))
    await waitFor(() => expect(sacar).toHaveBeenCalledWith("p1"))
    expect(await screen.findByRole("alert")).toHaveTextContent("Esta pieza ya no está en la reserva.")
  })
})
