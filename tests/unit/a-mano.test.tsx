import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { PublicarAMano } from "@/app/(app)/piezas/[id]/a-mano"

const PIEZA = "11111111-1111-4111-8111-111111111111"

describe("PublicarAMano", () => {
  test("copies the exact text to the clipboard", async () => {
    const escribir = vi.fn(async () => undefined)
    Object.defineProperty(navigator, "clipboard", { value: { writeText: escribir }, configurable: true })
    render(<PublicarAMano piezaId={PIEZA} texto="Hola LinkedIn" archivoUrl={null} cerrar={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Copiar texto" }))
    await waitFor(() => expect(escribir).toHaveBeenCalledWith("Hola LinkedIn"))
    expect(await screen.findByText("Texto copiado.")).toBeInTheDocument()
  })

  test("offers the PDF only when the piece has one", () => {
    const { rerender } = render(<PublicarAMano piezaId={PIEZA} texto="x" archivoUrl={null} cerrar={vi.fn()} />)
    expect(screen.queryByRole("link", { name: "Descargar PDF" })).not.toBeInTheDocument()
    rerender(<PublicarAMano piezaId={PIEZA} texto="x" archivoUrl="https://ejemplo.test/a.pdf" cerrar={vi.fn()} />)
    expect(screen.getByRole("link", { name: "Descargar PDF" })).toHaveAttribute("href", "https://ejemplo.test/a.pdf")
  })

  test("closes the piece with the link that was pasted", async () => {
    const cerrar = vi.fn(async () => ({ ok: true as const }))
    render(<PublicarAMano piezaId={PIEZA} texto="x" archivoUrl={null} cerrar={cerrar} />)
    fireEvent.change(screen.getByLabelText("Enlace de la publicación"), {
      target: { value: "https://www.linkedin.com/feed/update/urn:li:share:1" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Ya lo publiqué" }))
    await waitFor(() =>
      expect(cerrar).toHaveBeenCalledWith({
        piezaId: PIEZA,
        enlace: "https://www.linkedin.com/feed/update/urn:li:share:1",
      }),
    )
  })

  test("shows the error when closing fails", async () => {
    const cerrar = vi.fn(async () => ({ ok: false as const, error: "Pega el enlace de la publicación en LinkedIn." }))
    render(<PublicarAMano piezaId={PIEZA} texto="x" archivoUrl={null} cerrar={cerrar} />)
    fireEvent.click(screen.getByRole("button", { name: "Ya lo publiqué" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Pega el enlace")
  })
})
