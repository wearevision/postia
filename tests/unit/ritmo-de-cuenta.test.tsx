import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { RitmoDeCuenta } from "@/app/(app)/marcas/ritmo-de-cuenta"
import type { Resultado } from "@/lib/marcas/acciones"

function montar(cambiar = vi.fn(async (): Promise<Resultado> => ({ ok: true }))) {
  render(<RitmoDeCuenta cuentaId="c1" nombre="Federico" ritmo={3} cambiar={cambiar} />)
  return cambiar
}

const campo = () => screen.getByLabelText("Publicaciones por semana de Federico")

describe("the weekly rhythm of an account", () => {
  test("shows the current rhythm and offers saving only once it changes", () => {
    montar()
    expect(campo()).toHaveValue(3)
    expect(screen.queryByRole("button", { name: "Guardar ritmo" })).not.toBeInTheDocument()
    fireEvent.change(campo(), { target: { value: "7" } })
    expect(screen.getByRole("button", { name: "Guardar ritmo" })).toBeEnabled()
  })

  test("saves the new rhythm of that account", async () => {
    const cambiar = montar()
    fireEvent.change(campo(), { target: { value: "7" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar ritmo" }))
    await waitFor(() => expect(cambiar).toHaveBeenCalledWith("c1", 7))
  })

  test("keeps the field and shows the refusal when it cannot be saved", async () => {
    montar(
      vi.fn(async (): Promise<Resultado> => ({ ok: false, error: "Elige entre 0 y 21 publicaciones por semana." })),
    )
    fireEvent.change(campo(), { target: { value: "7" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar ritmo" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Elige entre 0 y 21 publicaciones por semana.")
    expect(campo()).toHaveValue(7)
  })

  test("refuses a value outside 0 to 21 without calling the server", () => {
    const cambiar = montar()
    fireEvent.change(campo(), { target: { value: "30" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar ritmo" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Elige entre 0 y 21 publicaciones por semana.")
    expect(cambiar).not.toHaveBeenCalled()
  })
})
