import { render, screen } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { AprobarInforme } from "@/app/(app)/investigar/[id]/controles"

describe("AprobarInforme", () => {
  test("says what follows and roughly what it costs", () => {
    render(<AprobarInforme investigacionId="i1" aprobar={vi.fn()} propuestas={5} costo="US$0,40" />)
    expect(screen.getByRole("button", { name: "Aprobar informe" })).toBeInTheDocument()
    expect(screen.getByText("PostIA arma 5 propuestas (cerca de US$0,40).")).toBeInTheDocument()
  })

  test("uses the singular for one proposal", () => {
    render(<AprobarInforme investigacionId="i1" aprobar={vi.fn()} propuestas={1} costo="US$0,40" />)
    expect(screen.getByText("PostIA arma 1 propuesta (cerca de US$0,40).")).toBeInTheDocument()
  })
})
