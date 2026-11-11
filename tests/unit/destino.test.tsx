import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { DestinoDePieza } from "@/app/(app)/piezas/[id]/destino"

const PAGINAS = [
  { url: "https://wr3.wearevision.cl/guias/focus-group/", titulo: "Focus group", tema: "x" },
  { url: "https://wr3.wearevision.cl/", titulo: "WR3", tema: "y" },
]

const GUARDADO = { web: "wr3" as const, url: PAGINAS[0].url }

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

  test("a lost link is called out", () => {
    render(
      <DestinoDePieza
        piezaId="p1"
        destino={{ web: "wr3", url: PAGINAS[0].url }}
        enlacePerdido={true}
        cargar={vi.fn()}
        poner={vi.fn()}
      />,
    )
    expect(screen.getByText(/El texto ya no lleva el enlace/)).toBeTruthy()
  })

  test("«Cambiar página» loads the saved site's pages without touching the site select", async () => {
    const cargar = vi.fn(async () => ({ ok: true as const, paginas: PAGINAS }))
    const poner = vi.fn(async () => ({ ok: true as const }))
    render(<DestinoDePieza piezaId="p1" destino={GUARDADO} enlacePerdido={false} cargar={cargar} poner={poner} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cambiar página" })))
    expect(cargar).toHaveBeenCalledWith({ piezaId: "p1", web: "wr3" })
    await act(async () => fireEvent.change(screen.getByLabelText("Página"), { target: { value: PAGINAS[1].url } }))
    expect(poner).toHaveBeenCalledWith({ piezaId: "p1", web: "wr3", url: PAGINAS[1].url })
  })

  test("choosing no link asks first, and removes it only after «Quitar el enlace»", async () => {
    const poner = vi.fn(async () => ({ ok: true as const }))
    render(<DestinoDePieza piezaId="p1" destino={GUARDADO} enlacePerdido={false} cargar={vi.fn()} poner={poner} />)
    await act(async () => fireEvent.change(screen.getByLabelText("Destino"), { target: { value: "" } }))
    expect(poner).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Quitar el enlace" })))
    expect(poner).toHaveBeenCalledWith({ piezaId: "p1", web: null, url: null })
  })

  test("cancelling the removal puts the saved site back", async () => {
    const poner = vi.fn(async () => ({ ok: true as const }))
    render(<DestinoDePieza piezaId="p1" destino={GUARDADO} enlacePerdido={false} cargar={vi.fn()} poner={poner} />)
    await act(async () => fireEvent.change(screen.getByLabelText("Destino"), { target: { value: "" } }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancelar" })))
    expect(poner).not.toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: "Quitar el enlace" })).toBeNull()
    expect((screen.getByLabelText("Destino") as HTMLSelectElement).value).toBe("wr3")
  })

  test("an error puts the selects back to what is saved", async () => {
    const cargar = vi.fn(async ({ web }: { web: string }) =>
      web === "wav"
        ? { ok: false as const, error: "No pude leer las páginas." }
        : { ok: true as const, paginas: PAGINAS },
    )
    const poner = vi.fn(async () => ({ ok: false as const, error: "No pude guardar." }))
    render(<DestinoDePieza piezaId="p1" destino={GUARDADO} enlacePerdido={false} cargar={cargar} poner={poner} />)
    const destino = screen.getByLabelText("Destino") as HTMLSelectElement
    await act(async () => fireEvent.change(destino, { target: { value: "wav" } }))
    expect(screen.getByRole("alert").textContent).toBe("No pude leer las páginas.")
    expect(destino.value).toBe("wr3")

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cambiar página" })))
    const pagina = screen.getByLabelText("Página") as HTMLSelectElement
    await act(async () => fireEvent.change(pagina, { target: { value: PAGINAS[1].url } }))
    expect(screen.getByRole("alert").textContent).toBe("No pude guardar.")
    expect(destino.value).toBe("wr3")
    expect(screen.queryByLabelText("Página")).toBeNull()
  })

  test("a failed removal puts the saved site back", async () => {
    const poner = vi.fn(async () => ({ ok: false as const, error: "No pude guardar." }))
    render(<DestinoDePieza piezaId="p1" destino={GUARDADO} enlacePerdido={false} cargar={vi.fn()} poner={poner} />)
    await act(async () => fireEvent.change(screen.getByLabelText("Destino"), { target: { value: "" } }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Quitar el enlace" })))
    expect(screen.getByRole("alert").textContent).toBe("No pude guardar.")
    expect((screen.getByLabelText("Destino") as HTMLSelectElement).value).toBe("wr3")
  })
})
