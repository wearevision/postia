import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { ClienteFueraDeLaLista, ExcepcionesDeCliente } from "@/app/(app)/clientes/excepciones"
import type { ClienteConCasos } from "@/lib/clientes/lectura"
import type { Resultado } from "@/lib/marcas/acciones"

type Marcar = (entrada: unknown) => Promise<Resultado<{ id: string }>>
type Quitar = (id: string) => Promise<Resultado>

const CLIENTE: ClienteConCasos = {
  cliente: "Copec",
  casos: [{ slug: "copec-85-2019", titulo: "Copec 85 años", anio: 2019, era: "trayectoria" }],
  excepciones: [{ id: "e1", tipo: "sin_logo", casoSlug: null, alias: [], hasta: null }],
}

const HOY = "2026-11-02"

function montar(cliente: ClienteConCasos = CLIENTE) {
  const marcar = vi.fn<Marcar>(async () => ({ ok: true, id: "e2" }))
  const quitar = vi.fn<Quitar>(async () => ({ ok: true }))
  render(<ExcepcionesDeCliente abierto cliente={cliente} hoy={HOY} marcar={marcar} quitar={quitar} />)
  return { marcar, quitar }
}

describe("ExcepcionesDeCliente", () => {
  test("shows the cases as track record and the active exceptions", () => {
    montar()
    expect(screen.getByText("Copec 85 años · 2019 · trayectoria")).toBeVisible()
    expect(screen.getByRole("button", { name: "Quitar Sin logo" })).toBeVisible()
  })

  test("marks a new exception for the whole client or one case", async () => {
    const { marcar } = montar()
    fireEvent.change(screen.getByLabelText("Tipo de excepción"), { target: { value: "no_nombrar" } })
    fireEvent.change(screen.getByLabelText("Solo este caso"), { target: { value: "copec-85-2019" } })
    fireEvent.change(screen.getByLabelText("Otros nombres, separados por coma"), { target: { value: "Copec SA" } })
    fireEvent.click(screen.getByRole("button", { name: "Marcar excepción" }))
    await waitFor(() =>
      expect(marcar).toHaveBeenCalledWith({
        cliente: "Copec",
        casoSlug: "copec-85-2019",
        tipo: "no_nombrar",
        alias: "Copec SA",
        hasta: "",
      }),
    )
  })

  test("removes an exception only after a second «Sí, quitar»", async () => {
    const { quitar } = montar()
    fireEvent.click(screen.getByRole("button", { name: "Quitar Sin logo" }))
    expect(screen.getByText("¿Quitar?")).toBeVisible()
    expect(quitar).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Sí, quitar Sin logo" }))
    await waitFor(() => expect(quitar).toHaveBeenCalledWith("e1"))
  })

  test("«No» keeps the exception", () => {
    const { quitar } = montar()
    fireEvent.click(screen.getByRole("button", { name: "Quitar Sin logo" }))
    fireEvent.click(screen.getByRole("button", { name: "No" }))
    expect(screen.queryByText("¿Quitar?")).toBeNull()
    expect(screen.getByRole("button", { name: "Quitar Sin logo" })).toBeVisible()
    expect(quitar).not.toHaveBeenCalled()
  })

  test("names the case in the remove button of an exception for one case", () => {
    montar({
      ...CLIENTE,
      excepciones: [
        { id: "e1", tipo: "sin_logo", casoSlug: null, alias: [], hasta: null },
        { id: "e2", tipo: "sin_logo", casoSlug: "copec-85-2019", alias: [], hasta: null },
      ],
    })
    expect(screen.getByRole("button", { name: "Quitar Sin logo" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Quitar Sin logo de Copec 85 años" })).toBeVisible()
  })

  test("the end date starts at the day the server gives, so server and browser render the same", () => {
    montar()
    expect(screen.getByLabelText("Hasta (opcional)")).toHaveAttribute("min", HOY)
  })

  test("shows the server's error", async () => {
    const marcar = vi.fn<Marcar>(async () => ({ ok: false, error: "Ese cliente ya tiene esa excepción." }))
    render(<ExcepcionesDeCliente abierto cliente={CLIENTE} hoy={HOY} marcar={marcar} quitar={vi.fn<Quitar>()} />)
    fireEvent.click(screen.getByRole("button", { name: "Marcar excepción" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Ese cliente ya tiene esa excepción.")
  })

  test("offers other spellings of the name as aliases", () => {
    montar({ ...CLIENTE, cliente: "JOHNSON & JOHNSON" })
    fireEvent.click(screen.getByRole("button", { name: "Agregar «JOHNSON Y JOHNSON»" }))
    expect(screen.getByLabelText("Otros nombres, separados por coma")).toHaveValue("JOHNSON Y JOHNSON")
    expect(screen.queryByRole("button", { name: "Agregar «JOHNSON Y JOHNSON»" })).toBeNull()
  })

  test("asks for split spellings of a one-word name", () => {
    montar({ ...CLIENTE, cliente: "ANGLOAMERICAN" })
    expect(screen.getByText(/por ejemplo, «Anglo American» para ANGLOAMERICAN/)).toBeVisible()
  })

  test("warns when a one-word name is also a common word", () => {
    montar({ ...CLIENTE, cliente: "CONTROL" })
    expect(screen.getByText(/«CONTROL» también es una palabra común/)).toBeVisible()
  })
})

describe("ClienteFueraDeLaLista", () => {
  test("marks an exception for a client that has no case", async () => {
    const marcar = vi.fn<Marcar>(async () => ({ ok: true, id: "e3" }))
    render(<ClienteFueraDeLaLista hoy={HOY} marcar={marcar} />)
    fireEvent.change(screen.getByLabelText("Nombre del cliente"), { target: { value: "Estudio WR3" } })
    fireEvent.change(screen.getByLabelText("Tipo de excepción"), { target: { value: "confidencial" } })
    fireEvent.click(screen.getByRole("button", { name: "Marcar excepción" }))
    await waitFor(() =>
      expect(marcar).toHaveBeenCalledWith({ cliente: "Estudio WR3", tipo: "confidencial", alias: "", hasta: "" }),
    )
  })
})
