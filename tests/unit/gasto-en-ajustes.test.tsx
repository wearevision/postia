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

  test("stays standing and says so when saving throws", async () => {
    const consola = vi.spyOn(console, "error").mockImplementation(() => {})
    const fallo = new Error("sesión vencida")
    const guardar = vi.fn(async () => {
      throw fallo
    })
    render(<GastoDelMes resumen={RESUMEN} guardar={guardar} />)
    fireEvent.click(screen.getByRole("button", { name: "Guardar tope" }))
    expect((await screen.findByRole("alert")).textContent).toBe(
      "No pude guardar el tope. Inténtalo de nuevo en un rato.",
    )
    expect(screen.getByRole("button", { name: "Guardar tope" })).toBeTruthy()
    expect(consola).toHaveBeenCalledWith(expect.anything(), fallo)
    consola.mockRestore()
  })

  test("writes thousands with a dot", () => {
    render(<GastoDelMes resumen={{ ...RESUMEN, topeMicro: 1_000_000_000 }} guardar={vi.fn()} />)
    expect(screen.getByText("US$33,00 de US$1.000,00")).toBeTruthy()
  })
})
