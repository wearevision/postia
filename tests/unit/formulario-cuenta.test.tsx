import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { FormularioCuenta } from "@/app/(app)/marcas/formulario-cuenta"
import type { Resultado } from "@/lib/marcas/acciones"

type Agregar = (previo: Resultado | null, datos: FormData) => Promise<Resultado>

function montar(resultado: Resultado) {
  const agregar = vi.fn<Agregar>(async () => resultado)
  render(<FormularioCuenta marcaId="marca-1" agregar={agregar} />)
  fireEvent.change(screen.getByLabelText("Nombre de la cuenta"), { target: { value: "Página de WAV" } })
  fireEvent.click(screen.getByRole("button", { name: "Agregar cuenta" }))
  return agregar
}

describe("FormularioCuenta", () => {
  test("shows where to connect the account once it was added", async () => {
    montar({ ok: true })
    const aviso = await screen.findByRole("status")
    expect(aviso).toHaveTextContent("Cuenta agregada. Conéctala en Ajustes.")
    expect(within(aviso).getByRole("link", { name: "Ajustes" })).toHaveAttribute("href", "/ajustes")
  })

  test("shows the error and no confirmation when adding fails", async () => {
    montar({ ok: false, error: "Ya existe esa cuenta." })
    expect(await screen.findByRole("alert")).toHaveTextContent("Ya existe esa cuenta.")
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull())
  })
})
