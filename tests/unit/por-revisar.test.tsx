import { render, screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { PorRevisar } from "@/app/(app)/por-revisar"
import type { TarjetaDePieza } from "@/lib/piezas/lectura"

const pieza = { id: "p1", cuenta: "WAV", extracto: "Un texto dudoso", motivo: "No sé si salió" } as TarjetaDePieza

describe("PorRevisar", () => {
  test("links each pending decision with its count", () => {
    render(<PorRevisar informes={2} ideas={6} piezas={[]} />)
    expect(screen.getByRole("link", { name: "2 informes por aprobar" })).toHaveAttribute("href", "/investigar")
    expect(screen.getByRole("link", { name: "6 ideas por revisar" })).toHaveAttribute("href", "/ideas?estado=propuesta")
  })

  test("uses the singular", () => {
    render(<PorRevisar informes={1} ideas={1} piezas={[]} />)
    expect(screen.getByRole("link", { name: "1 informe por aprobar" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "1 idea por revisar" })).toBeInTheDocument()
  })

  test("lists the pieces that need a look, each linking to its screen", () => {
    render(<PorRevisar informes={0} ideas={0} piezas={[pieza]} />)
    expect(screen.getByRole("heading", { name: "Por revisar" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /Un texto dudoso/ })).toHaveAttribute("href", "/piezas/p1")
  })

  test("renders nothing when nothing waits", () => {
    const { container } = render(<PorRevisar informes={0} ideas={0} piezas={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
