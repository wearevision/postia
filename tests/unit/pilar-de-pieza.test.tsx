import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { PilarDePieza } from "@/app/(app)/piezas/[id]/pilar"
import type { Resultado } from "@/lib/marcas/acciones"

type Poner = (entrada: { piezaId: string; pilarId: string | null }) => Promise<Resultado>

const PIEZA = "11111111-1111-4111-8111-111111111111"
const PILARES = [
  { id: "22222222-2222-4222-8222-222222222222", nombre: "Oficio" },
  { id: "33333333-3333-4333-8333-333333333333", nombre: "Detrás del trabajo" },
]

describe("PilarDePieza", () => {
  test("changes the pillar and clears it", async () => {
    const poner = vi.fn<Poner>(async () => ({ ok: true }))
    render(
      <PilarDePieza
        piezaId={PIEZA}
        pilarId={PILARES[0]?.id ?? null}
        pilarNombre="Oficio"
        pilares={PILARES}
        poner={poner}
      />,
    )
    expect(screen.getByLabelText("Pilar")).toHaveValue(PILARES[0]?.id)
    fireEvent.change(screen.getByLabelText("Pilar"), { target: { value: PILARES[1]?.id } })
    await waitFor(() => expect(poner).toHaveBeenCalledWith({ piezaId: PIEZA, pilarId: PILARES[1]?.id }))
    fireEvent.change(screen.getByLabelText("Pilar"), { target: { value: "" } })
    await waitFor(() => expect(poner).toHaveBeenLastCalledWith({ piezaId: PIEZA, pilarId: null }))
  })

  test("shows the server's error and goes back to the saved pillar", async () => {
    const poner = vi.fn<Poner>(async () => ({ ok: false, error: "Ese pilar es de otra marca." }))
    render(<PilarDePieza piezaId={PIEZA} pilarId={null} pilarNombre={null} pilares={PILARES} poner={poner} />)
    fireEvent.change(screen.getByLabelText("Pilar"), { target: { value: PILARES[0]?.id } })
    expect(await screen.findByRole("alert")).toHaveTextContent("Ese pilar es de otra marca.")
    expect(screen.getByLabelText("Pilar")).toHaveValue("")
  })

  test("keeps showing a pillar that left the editorial line", () => {
    const retirado = "44444444-4444-4444-8444-444444444444"
    render(
      <PilarDePieza piezaId={PIEZA} pilarId={retirado} pilarNombre="Viejo" pilares={PILARES} poner={vi.fn<Poner>()} />,
    )
    expect(screen.getByLabelText("Pilar")).toHaveValue(retirado)
    expect(screen.getByRole("option", { name: "Viejo (ya no está en la línea)" })).toBeInTheDocument()
  })

  test("says the new piece was created without its pillar until one is chosen", async () => {
    const poner = vi.fn<Poner>(async () => ({ ok: true }))
    render(
      <PilarDePieza
        piezaId={PIEZA}
        pilarId={null}
        pilarNombre={null}
        pilares={PILARES}
        poner={poner}
        sinPilarAlCrear
      />,
    )
    expect(screen.getByText("La pieza se creó, pero no pude ponerle el pilar. Elígelo aquí.")).toBeVisible()
    fireEvent.change(screen.getByLabelText("Pilar"), { target: { value: PILARES[0]?.id } })
    await waitFor(() =>
      expect(screen.queryByText("La pieza se creó, pero no pude ponerle el pilar. Elígelo aquí.")).toBeNull(),
    )
  })
})
