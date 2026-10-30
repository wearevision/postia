import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { FormularioDePedido } from "@/app/(app)/piezas/pedir/formulario"

const CUENTAS = [
  { id: "11111111-1111-4111-8111-111111111111", nombre: "Perfil de Federico", marcaId: "m1" },
  { id: "22222222-2222-4222-8222-222222222222", nombre: "Página de WAV", marcaId: "m2" },
]
const PILARES = [
  { id: "33333333-3333-4333-8333-333333333333", marcaId: "m2", nombre: "Oficio" },
  { id: "44444444-4444-4444-8444-444444444444", marcaId: "m1", nombre: "Opinión" },
]

describe("FormularioDePedido", () => {
  test("sends the account, the encargo, the material and a pillar of that account's brand", async () => {
    const pedir = vi.fn(async () => ({ ok: true as const, pedidoId: "p1" }))
    render(<FormularioDePedido cuentas={CUENTAS} pilares={PILARES} pedir={pedir} />)
    fireEvent.change(screen.getByLabelText("Cuenta"), { target: { value: CUENTAS[1]?.id } })
    expect(screen.queryByRole("option", { name: "Opinión" })).toBeNull()
    fireEvent.change(screen.getByLabelText("Pilar (opcional)"), { target: { value: PILARES[0]?.id } })
    fireEvent.change(screen.getByLabelText("¿De qué trata el post?"), { target: { value: "Montaje en 48 horas" } })
    fireEvent.change(screen.getByLabelText("Material (opcional)"), { target: { value: "Nota del cliente" } })
    fireEvent.click(screen.getByRole("button", { name: "Pedir a Claude" }))
    await waitFor(() =>
      expect(pedir).toHaveBeenCalledWith({
        cuentaId: CUENTAS[1]?.id,
        encargo: "Montaje en 48 horas",
        material: "Nota del cliente",
        pilarId: PILARES[0]?.id,
      }),
    )
    expect(await screen.findByText(/Claude lo escribe en unos minutos/)).toBeVisible()
  })

  test("shows the reason when the request is refused", async () => {
    const pedir = vi.fn(async () => ({
      ok: false as const,
      error: "Ya hay 5 pedidos en curso para esta marca. Espera a que terminen.",
    }))
    render(<FormularioDePedido cuentas={CUENTAS} pilares={PILARES} pedir={pedir} />)
    fireEvent.change(screen.getByLabelText("¿De qué trata el post?"), { target: { value: "Algo" } })
    fireEvent.click(screen.getByRole("button", { name: "Pedir a Claude" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Ya hay 5 pedidos en curso")
  })
})
