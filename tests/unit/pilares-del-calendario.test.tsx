import { render, screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { PilaresDelCalendario } from "@/app/(app)/calendario/pilares"
import type { BalanceDeCuenta } from "@/lib/voz/lectura"

const BALANCE: BalanceDeCuenta = {
  cuentaId: "c1",
  cuenta: "Página de WAV",
  marcaId: "m1",
  balance: {
    sinPilar: 2,
    filas: [
      {
        pilarId: "p1",
        nombre: "Detrás del trabajo",
        salieron: 3,
        meta: 4,
        planeadas: 1,
        diasSinSalir: 2,
        alerta: false,
      },
      { pilarId: "p2", nombre: "Oficio", salieron: 0, meta: 2, planeadas: 0, diasSinSalir: 16, alerta: true },
    ],
  },
}

describe("PilaresDelCalendario", () => {
  test("shows each pillar against its four-week target, the alerts and the pieces without a pillar", () => {
    render(<PilaresDelCalendario balances={[BALANCE]} />)
    expect(screen.getByRole("heading", { name: "Pilares · últimas 4 semanas" })).toBeVisible()
    expect(screen.getByText("Detrás del trabajo: 3 de 4 · 1 en camino")).toBeVisible()
    expect(screen.getByText("Oficio: 0 de 2")).toBeVisible()
    expect(screen.getByText("«Oficio» lleva 16 días sin salir en Página de WAV.")).toBeVisible()
    expect(screen.getByText("2 piezas sin pilar.")).toBeVisible()
  })

  test("one piece without a pillar is said in singular", () => {
    render(<PilaresDelCalendario balances={[{ ...BALANCE, balance: { ...BALANCE.balance, sinPilar: 1 } }]} />)
    expect(screen.getByText("1 pieza sin pilar.")).toBeVisible()
  })

  test("says nothing when no account has pillars", () => {
    const { container } = render(
      <PilaresDelCalendario balances={[{ ...BALANCE, balance: { filas: [], sinPilar: 0 } }]} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
