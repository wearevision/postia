import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, type Mock, test, vi } from "vitest"
import { type AccionesDeAprendizajes, Aprendizajes } from "@/app/(app)/rendimiento/aprendizajes"
import type { AprendizajesDeCuenta } from "@/lib/rendimiento/lectura"

const VACIOS: AprendizajesDeCuenta = { porDecidir: [], pistas: [], aprobados: [], leyendo: false, ultimoFallo: null }

const CON_TODO: AprendizajesDeCuenta = {
  ...VACIOS,
  porDecidir: [
    { id: "a1", texto: "Los casos con cifras rinden más.", porque: "Rindieron el doble de enganche.", respaldo: 9 },
  ],
  pistas: [{ id: "p1", texto: "Los lunes rinden menos.", porque: "Se ve en pocas publicaciones.", respaldo: 3 }],
  aprobados: [{ id: "k1", texto: "Las preguntas al cierre funcionan.", porque: "Más comentarios.", respaldo: 12 }],
}

type Acciones = AccionesDeAprendizajes
const aprobada = async () => ({ ok: true as const })

function montar(
  datos: AprendizajesDeCuenta,
  cambios: { decidir?: Mock<Acciones["decidir"]>; pedirLectura?: Mock<Acciones["pedirLectura"]> } = {},
) {
  const decidir = cambios.decidir ?? vi.fn<Acciones["decidir"]>(aprobada)
  const pedirLectura = cambios.pedirLectura ?? vi.fn<Acciones["pedirLectura"]>(aprobada)
  render(<Aprendizajes cuentaId="cuenta-1" datos={datos} acciones={{ decidir, pedirLectura }} />)
  return { decidir, pedirLectura }
}

const tarjeta = (texto: string) => screen.getByText(texto).closest("li") as HTMLElement

describe("Aprendizajes", () => {
  test("with nothing yet it says so and still offers a reading", () => {
    montar(VACIOS)
    expect(screen.getByRole("heading", { name: "Aprendizajes" })).toBeInTheDocument()
    expect(screen.getByText(/Todavía no hay aprendizajes/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Leer de nuevo" })).toBeEnabled()
  })

  test("while a reading is open it says so and does not let another be asked", () => {
    montar({ ...VACIOS, leyendo: true })
    expect(screen.getByText("Leyendo tus publicaciones…")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Leer de nuevo" })).toBeDisabled()
    expect(screen.queryByText(/Todavía no hay aprendizajes/)).toBeNull()
  })

  test("says why the last reading did not work", () => {
    montar({ ...VACIOS, ultimoFallo: "Se alcanzó el tope de gasto." })
    expect(screen.getByText(/La última lectura no salió: Se alcanzó el tope de gasto\./)).toBeInTheDocument()
  })

  test("shows each undecided learning with its reason and how many posts back it", () => {
    montar(CON_TODO)
    const t = tarjeta("Los casos con cifras rinden más.")
    expect(within(t).getByText("Rindieron el doble de enganche.")).toBeInTheDocument()
    expect(within(t).getByText("Lo respaldan 9 publicaciones")).toBeInTheDocument()
  })

  test("uses the singular for one post", () => {
    montar({ ...VACIOS, pistas: [{ id: "p2", texto: "Una", porque: "Porque.", respaldo: 1 }] })
    expect(screen.getByText("Lo respalda 1 publicación")).toBeInTheDocument()
  })

  test("«Aprobar» approves that learning without touching its text", async () => {
    const { decidir } = montar(CON_TODO)
    fireEvent.click(within(tarjeta("Los casos con cifras rinden más.")).getByRole("button", { name: "Aprobar" }))
    await waitFor(() => expect(decidir).toHaveBeenCalledWith("a1", "aprobado", undefined))
  })

  test("«Descartar» discards that learning", async () => {
    const { decidir } = montar(CON_TODO)
    fireEvent.click(within(tarjeta("Los casos con cifras rinden más.")).getByRole("button", { name: "Descartar" }))
    await waitFor(() => expect(decidir).toHaveBeenCalledWith("a1", "descartado", undefined))
  })

  test("«Editar» opens the text, and «Aprobar con este texto» approves the edited one", async () => {
    const { decidir } = montar(CON_TODO)
    const t = tarjeta("Los casos con cifras rinden más.")
    fireEvent.click(within(t).getByRole("button", { name: "Editar" }))
    const campo = screen.getByLabelText("Texto del aprendizaje")
    expect(campo).toHaveValue("Los casos con cifras rinden más.")
    fireEvent.change(campo, { target: { value: "Los casos con una cifra rinden más." } })
    fireEvent.click(screen.getByRole("button", { name: "Aprobar con este texto" }))
    await waitFor(() => expect(decidir).toHaveBeenCalledWith("a1", "aprobado", "Los casos con una cifra rinden más."))
  })

  test("cancelling an edit closes it and keeps the original text", () => {
    montar(CON_TODO)
    fireEvent.click(within(tarjeta("Los casos con cifras rinden más.")).getByRole("button", { name: "Editar" }))
    fireEvent.change(screen.getByLabelText("Texto del aprendizaje"), { target: { value: "Otro" } })
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(screen.queryByLabelText("Texto del aprendizaje")).toBeNull()
    expect(screen.getByText("Los casos con cifras rinden más.")).toBeInTheDocument()
  })

  test("an emptied text cannot be approved", () => {
    const { decidir } = montar(CON_TODO)
    fireEvent.click(within(tarjeta("Los casos con cifras rinden más.")).getByRole("button", { name: "Editar" }))
    fireEvent.change(screen.getByLabelText("Texto del aprendizaje"), { target: { value: "   " } })
    expect(screen.getByRole("button", { name: "Aprobar con este texto" })).toBeDisabled()
    expect(decidir).not.toHaveBeenCalled()
  })

  test("hints are folded and carry the warning; they can be approved too", async () => {
    const { decidir } = montar(CON_TODO)
    const pistas = screen.getByText("Pistas (1)").closest("details") as HTMLDetailsElement
    expect(pistas.open).toBe(false)
    const t = tarjeta("Los lunes rinden menos.")
    expect(within(t).getByText("Con menos de 8 publicaciones: úsala con cuidado")).toBeInTheDocument()
    fireEvent.click(within(t).getByRole("button", { name: "Aprobar" }))
    await waitFor(() => expect(decidir).toHaveBeenCalledWith("p1", "aprobado", undefined))
  })

  test("approved learnings are listed and «Quitar» discards one", async () => {
    const { decidir } = montar(CON_TODO)
    const lista = screen.getByRole("list", { name: "Aprobados" })
    expect(within(lista).getByText("Las preguntas al cierre funcionan.")).toBeInTheDocument()
    fireEvent.click(within(lista).getByRole("button", { name: "Quitar" }))
    await waitFor(() => expect(decidir).toHaveBeenCalledWith("k1", "descartado", undefined))
  })

  test("«Leer de nuevo» asks for a reading of this account and shows what it costs", async () => {
    const { pedirLectura } = montar(CON_TODO)
    expect(screen.getByText("Cuesta cerca de US$0,30")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Leer de nuevo" }))
    await waitFor(() => expect(pedirLectura).toHaveBeenCalledWith("cuenta-1"))
  })

  test("shows the action's error in an alert and keeps the buttons", async () => {
    const decidir = vi.fn<Acciones["decidir"]>(async () => ({ ok: false, error: "Ese aprendizaje ya no existe." }))
    montar(CON_TODO, { decidir })
    fireEvent.click(within(tarjeta("Los casos con cifras rinden más.")).getByRole("button", { name: "Aprobar" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Ese aprendizaje ya no existe.")
    expect(within(tarjeta("Los casos con cifras rinden más.")).getByRole("button", { name: "Aprobar" })).toBeEnabled()
  })

  test("shows the error of a refused reading", async () => {
    const pedirLectura = vi.fn<Acciones["pedirLectura"]>(async () => ({
      ok: false,
      error: "Ya hay una lectura en curso.",
    }))
    montar(VACIOS, { pedirLectura })
    fireEvent.click(screen.getByRole("button", { name: "Leer de nuevo" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Ya hay una lectura en curso.")
  })
})
