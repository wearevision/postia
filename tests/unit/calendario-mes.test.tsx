import { render, screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { VistaDelMes } from "@/app/(app)/calendario/mes"

describe("VistaDelMes", () => {
  test("a grid of the month's days with one labelled dot per piece, each day opening its week", () => {
    render(
      <VistaDelMes
        mes="2026-11"
        piezas={[
          {
            id: "p1",
            cuentaId: "perfil",
            estado: "programada",
            instante: "2026-11-03T14:00:00.000Z",
            firmada: true,
            extracto: "A",
          },
          {
            id: "p2",
            cuentaId: "pagina",
            estado: "por_aprobar",
            instante: "2026-11-03T18:00:00.000Z",
            firmada: false,
            extracto: "B",
          },
        ]}
      />,
    )
    expect(screen.getByRole("heading", { name: "noviembre de 2026" })).toBeInTheDocument()
    const martes = screen.getByRole("link", { name: /^3 de noviembre/ })
    expect(martes).toHaveAttribute("href", "/calendario?semana=2026-11-03")
    expect(martes).toHaveAccessibleName("3 de noviembre: 1 programada, 1 sin firma")
    expect(screen.getAllByRole("link", { name: /de noviembre/ })).toHaveLength(30)
  })

  test("links to the neighbouring months", () => {
    render(<VistaDelMes mes="2026-11" piezas={[]} />)
    expect(screen.getByRole("link", { name: "Mes anterior" })).toHaveAttribute(
      "href",
      "/calendario?vista=mes&mes=2026-10",
    )
    expect(screen.getByRole("link", { name: "Mes siguiente" })).toHaveAttribute(
      "href",
      "/calendario?vista=mes&mes=2026-12",
    )
  })
})
