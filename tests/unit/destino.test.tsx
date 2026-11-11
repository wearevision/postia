import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { DestinoDePieza } from "@/app/(app)/piezas/[id]/destino"

const PAGINAS = [
  { url: "https://wr3.wearevision.cl/guias/focus-group/", titulo: "Focus group", tema: "x" },
  { url: "https://wr3.wearevision.cl/", titulo: "WR3", tema: "y" },
]

describe("DestinoDePieza", () => {
  afterEach(cleanup)

  test("loads the chosen site's pages and saves the picked one", async () => {
    const cargar = vi.fn(async () => ({ ok: true as const, paginas: PAGINAS }))
    const poner = vi.fn(async () => ({ ok: true as const }))
    render(<DestinoDePieza piezaId="p1" destino={null} enlacePerdido={false} cargar={cargar} poner={poner} />)
    await act(async () => fireEvent.change(screen.getByLabelText("Destino"), { target: { value: "wr3" } }))
    expect(cargar).toHaveBeenCalledWith({ piezaId: "p1", web: "wr3" })
    await act(async () => fireEvent.change(screen.getByLabelText("Página"), { target: { value: PAGINAS[0].url } }))
    expect(poner).toHaveBeenCalledWith({ piezaId: "p1", web: "wr3", url: PAGINAS[0].url })
  })

  test("shows the error and offers no page when the list cannot be read", async () => {
    const cargar = vi.fn(async () => ({ ok: false as const, error: "No pude leer las páginas de WR3." }))
    render(<DestinoDePieza piezaId="p1" destino={null} enlacePerdido={false} cargar={cargar} poner={vi.fn()} />)
    await act(async () => fireEvent.change(screen.getByLabelText("Destino"), { target: { value: "wr3" } }))
    expect(screen.getByRole("alert").textContent).toBe("No pude leer las páginas de WR3.")
    expect(screen.queryByLabelText("Página")).toBeNull()
  })

  test("choosing no link removes it, and a lost link is called out", async () => {
    const poner = vi.fn(async () => ({ ok: true as const }))
    render(
      <DestinoDePieza
        piezaId="p1"
        destino={{ web: "wr3", url: PAGINAS[0].url }}
        enlacePerdido={true}
        cargar={vi.fn(async () => ({ ok: true as const, paginas: PAGINAS }))}
        poner={poner}
      />,
    )
    expect(screen.getByText(/El texto ya no lleva el enlace/)).toBeTruthy()
    await act(async () => fireEvent.change(screen.getByLabelText("Destino"), { target: { value: "" } }))
    expect(poner).toHaveBeenCalledWith({ piezaId: "p1", web: null, url: null })
  })
})
