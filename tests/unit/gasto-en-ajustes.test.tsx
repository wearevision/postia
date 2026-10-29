import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { GastoDelMes } from "@/app/(app)/ajustes/gasto"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const RESUMEN = {
  mes: "2026-11-01",
  topeMicro: 40_000_000,
  gastadoMicro: 33_000_000,
  filas: [
    { marcaId: null, nombre: "General", topeMicro: null, gastadoMicro: 3_000_000 },
    { marcaId: "m1", nombre: "WAV We Are Vision", topeMicro: 20_000_000, gastadoMicro: 30_000_000 },
  ],
}

describe("GastoDelMes", () => {
  test("shows the month's total against the cap and each row", () => {
    render(<GastoDelMes resumen={RESUMEN} guardar={vi.fn()} />)
    expect(screen.getByText("US$33,00 de US$40,00")).toBeTruthy()
    expect(screen.getByText("General")).toBeTruthy()
    expect(screen.getByText(/WAV We Are Vision/)).toBeTruthy()
    expect(screen.getByText(/82 %/)).toBeTruthy()
  })

  test("saves a new global cap in dollars", async () => {
    const guardar = vi.fn(async () => ({ ok: true as const }))
    render(<GastoDelMes resumen={RESUMEN} guardar={guardar} />)
    fireEvent.change(screen.getByLabelText("Tope mensual (US$)"), { target: { value: "50" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar tope" }))
    await waitFor(() => expect(guardar).toHaveBeenCalledWith({ marcaId: null, dolares: 50 }))
    expect(await screen.findByText("Tope guardado.")).toBeTruthy()
  })

  test("shows the action's error", async () => {
    const guardar = vi.fn(async () => ({ ok: false as const, error: "El tope va entre US$1 y US$1.000." }))
    render(<GastoDelMes resumen={RESUMEN} guardar={guardar} />)
    fireEvent.change(screen.getByLabelText("Tope mensual (US$)"), { target: { value: "0" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar tope" }))
    expect((await screen.findByRole("alert")).textContent).toBe("El tope va entre US$1 y US$1.000.")
  })
})
