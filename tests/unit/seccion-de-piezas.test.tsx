import { render, screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { SeccionDePiezas } from "@/app/(app)/seccion-de-piezas"
import type { TarjetaDePieza } from "@/lib/piezas/lectura"

const tarjeta = (sobre: Partial<TarjetaDePieza>): TarjetaDePieza => ({
  id: "p1",
  estado: "por_aprobar",
  cuenta: "Federico",
  marca: "Federico",
  programadaPara: null,
  planeadaPara: "2026-11-04T14:00:00.000Z",
  extracto: "Primer post",
  motivo: null,
  ...sobre,
})

describe("SeccionDePiezas", () => {
  test("a piece to sign reads «account · short date» on one line", () => {
    render(<SeccionDePiezas titulo="Por firmar" tarjetas={[tarjeta({})]} />)
    expect(screen.getByText("Federico · mié 4 nov, 11:00")).toBeInTheDocument()
    expect(screen.queryByText(/planeada para/)).toBeNull()
  })

  test("a piece with a schedule shows that date the same way", () => {
    render(
      <SeccionDePiezas
        titulo="Publicar a mano"
        tarjetas={[tarjeta({ estado: "a_mano", planeadaPara: null, programadaPara: "2026-11-05T18:00:00.000Z" })]}
      />,
    )
    expect(screen.getByText("Federico · jue 5 nov, 15:00")).toBeInTheDocument()
  })

  test("a piece without a date says so instead of showing the account alone", () => {
    render(<SeccionDePiezas titulo="Por firmar" tarjetas={[tarjeta({ planeadaPara: null })]} />)
    expect(screen.getByText("Federico · Sin fecha")).toBeInTheDocument()
  })

  test("renders nothing for an empty list", () => {
    const { container } = render(<SeccionDePiezas titulo="Por firmar" tarjetas={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
