import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { FormularioDePieza } from "@/app/(app)/piezas/nueva/formulario"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

const CUENTA = {
  id: "11111111-1111-4111-8111-111111111111",
  marcaId: "22222222-2222-4222-8222-222222222222",
  nombre: "Perfil",
  marca: "WAV",
}
const RUTA = `${CUENTA.marcaId}/33333333-3333-4333-8333-333333333333.pdf`

function pdf(): File {
  return new File(["%PDF-1.4"], "carrusel.pdf", { type: "application/pdf" })
}

function montar() {
  const subir = vi.fn(async () => RUTA)
  const crear = vi.fn(async () => ({ ok: true as const, piezaId: "44444444-4444-4444-8444-444444444444" }))
  render(<FormularioDePieza cuentas={[CUENTA]} crear={crear} subir={subir} />)
  return { subir, crear }
}

function elegirCarrusel(titulo: string, archivo: File | null) {
  fireEvent.click(screen.getByLabelText("Carrusel PDF"))
  fireEvent.change(screen.getByLabelText("Título del carrusel"), { target: { value: titulo } })
  if (archivo) fireEvent.change(screen.getByLabelText(/^PDF/), { target: { files: [archivo] } })
}

function escribir(texto: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Texto" }), { target: { value: texto } })
}

function crearPieza() {
  fireEvent.click(screen.getByRole("button", { name: "Crear pieza" }))
}

describe("FormularioDePieza", () => {
  beforeEach(() => vi.clearAllMocks())

  test("refuses an empty text without uploading or calling the server", async () => {
    const { subir, crear } = montar()
    crearPieza()
    expect(await screen.findByRole("alert")).toHaveTextContent("Falta el texto.")
    expect(subir).not.toHaveBeenCalled()
    expect(crear).not.toHaveBeenCalled()
  })

  test("refuses a text over 3000 characters before uploading", async () => {
    const { subir, crear } = montar()
    elegirCarrusel("Título", pdf())
    escribir("a".repeat(3001))
    crearPieza()
    expect(await screen.findByRole("alert")).toHaveTextContent("3000")
    expect(subir).not.toHaveBeenCalled()
    expect(crear).not.toHaveBeenCalled()
  })

  test("refuses a carousel without a title before uploading", async () => {
    const { subir } = montar()
    elegirCarrusel("  ", pdf())
    escribir("Texto")
    crearPieza()
    expect(await screen.findByRole("alert")).toHaveTextContent("Falta el título del carrusel.")
    expect(subir).not.toHaveBeenCalled()
  })

  test("refuses a carousel without a PDF", async () => {
    const { subir } = montar()
    elegirCarrusel("Título", null)
    escribir("Texto")
    crearPieza()
    expect(await screen.findByRole("alert")).toHaveTextContent("Falta el PDF del carrusel.")
    expect(subir).not.toHaveBeenCalled()
  })

  test("reuses the uploaded path when the server refuses and the person retries with the same file", async () => {
    const { subir, crear } = montar()
    crear.mockResolvedValueOnce({ ok: false, error: "No pude guardar." } as never)
    elegirCarrusel("Título", pdf())
    escribir("Texto")
    crearPieza()
    expect(await screen.findByRole("alert")).toHaveTextContent("No pude guardar.")
    // The error commits inside the transition; the button is disabled until the transition ends, and a click on it is ignored.
    await waitFor(() => expect(screen.getByRole("button", { name: "Crear pieza" })).toBeEnabled())
    crearPieza()
    await waitFor(() => expect(crear).toHaveBeenCalledTimes(2))
    expect(subir).toHaveBeenCalledTimes(1)
    expect(crear).toHaveBeenLastCalledWith(expect.objectContaining({ archivoRuta: RUTA }))
  })
})
