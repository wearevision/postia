import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { PlanDePieza } from "@/app/(app)/piezas/[id]/plan"
import type { Resultado } from "@/lib/marcas/acciones"

const PIEZA = "11111111-1111-4111-8111-111111111111"

function montar(planeadaPara: string | null, planear = vi.fn(async (): Promise<Resultado> => ({ ok: true }))) {
  render(<PlanDePieza piezaId={PIEZA} planeadaPara={planeadaPara} planear={planear} />)
  return planear
}

describe("PlanDePieza", () => {
  test("shows the planned date in Chile time and says it is not a signature", () => {
    montar("2026-11-03T14:00:00.000Z")
    expect(screen.getByRole("heading", { name: "Fecha planeada" })).toBeInTheDocument()
    expect(screen.getByText("martes 3 de noviembre, 11:00")).toBeInTheDocument()
    expect(screen.getByText("Es una propuesta: sale solo si la firmas.")).toBeInTheDocument()
  })

  test("says so when there is no plan", () => {
    montar(null)
    expect(screen.getByText("Sin fecha planeada")).toBeInTheDocument()
  })

  test("moves the plan with the field read as Chile time", async () => {
    const planear = montar("2026-11-03T14:00:00.000Z")
    fireEvent.click(screen.getByRole("button", { name: "Mover fecha" }))
    fireEvent.change(screen.getByLabelText("Nueva fecha planeada"), { target: { value: "2026-11-05T11:00" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar fecha" }))
    await waitFor(() =>
      expect(planear).toHaveBeenCalledWith({ piezaId: PIEZA, planeadaPara: "2026-11-05T14:00:00.000Z" }),
    )
  })

  test("asks for a date when the field is empty", () => {
    const planear = montar(null)
    fireEvent.click(screen.getByRole("button", { name: "Mover fecha" }))
    fireEvent.click(screen.getByRole("button", { name: "Guardar fecha" }))
    expect(planear).not.toHaveBeenCalled()
    expect(screen.getByRole("alert")).toHaveTextContent("Elige la fecha y la hora.")
  })

  test("shows a refusal as an alert", async () => {
    montar(
      "2026-11-03T14:00:00.000Z",
      vi.fn(async () => ({ ok: false as const, error: "Esa cuenta ya tiene una pieza a esa hora. Elige otra." })),
    )
    fireEvent.click(screen.getByRole("button", { name: "Mover fecha" }))
    fireEvent.click(screen.getByRole("button", { name: "Guardar fecha" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Esa cuenta ya tiene una pieza a esa hora. Elige otra.")
  })

  test("says the new piece was created without a planned date", () => {
    render(<PlanDePieza piezaId={PIEZA} planeadaPara={null} planear={vi.fn()} sinPlanAlCrear />)
    expect(screen.getByText("La pieza se creó, pero no pude ponerle fecha planeada. Elígela aquí.")).toBeVisible()
  })
})
