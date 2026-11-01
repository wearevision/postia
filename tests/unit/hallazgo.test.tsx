import { render, screen } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { Hallazgo } from "@/app/(app)/investigar/[id]/hallazgo"

const base = {
  id: "h1",
  resumen: "Un focus group cuesta menos de lo que se cree.",
  cita: null as string | null,
  enlace: "https://medio1.cl/x",
  medio: "Medio 1",
  publicadoEn: "2026-10-20",
  estado: "nuevo",
}

const mostrar = (sobre: Partial<typeof base> = {}) =>
  render(
    <ul>
      <Hallazgo hallazgo={{ ...base, ...sobre }} investigacionId="i1" descartable descartar={vi.fn()} />
    </ul>,
  )

describe("Hallazgo", () => {
  test("the source link is a tap target of at least 44 px", () => {
    mostrar()
    const enlace = screen.getByRole("link", { name: "Medio 1 · 20 de octubre de 2026" })
    expect(enlace).toHaveClass("min-h-11")
    expect(enlace).toHaveClass("flex", "items-center")
  })

  test("wraps a bare citation in «», and does not double the quotes of one that already has them", () => {
    mostrar({ cita: "Menos de lo que se cree" })
    expect(screen.getByText("«Menos de lo que se cree»")).toBeInTheDocument()
  })

  test("a citation that already carries quotes is wrapped once", () => {
    mostrar({ cita: "“Menos de lo que se cree”" })
    expect(screen.getByText("«Menos de lo que se cree»")).toBeInTheDocument()
  })
})
