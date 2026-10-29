import { render, screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { Veredicto } from "@/app/(app)/piezas/[id]/veredicto"

describe("Veredicto", () => {
  test("says the review found nothing", () => {
    render(<Veredicto hallazgos={[]} />)
    expect(
      screen.getByText("Revisión sin IA: no encontré clientes con excepción, menciones con @ ni precios."),
    ).toBeVisible()
  })

  test("lists each finding once and does not block the signature", () => {
    render(
      <Veredicto
        hallazgos={[
          { tipo: "cliente", cliente: "Copec", excepcion: "no_nombrar", fragmento: "Copec" },
          { tipo: "precio", fragmento: "$100" },
          { tipo: "cliente", cliente: "Copec", excepcion: "no_nombrar", fragmento: "COPEC" },
        ]}
      />,
    )
    expect(screen.getByRole("heading", { name: "Revisa antes de firmar" })).toBeVisible()
    expect(screen.getAllByText("Nombra a Copec, que no se nombra.")).toHaveLength(1)
    expect(screen.getByText("«$100»: nunca se publican precios ni presupuestos.")).toBeVisible()
    expect(screen.getByText("Puedes firmar igual: tú decides.")).toBeVisible()
  })
})
