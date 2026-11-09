import { render, screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { AnaliticasDeLinkedin } from "@/app/(app)/ajustes/analiticas-de-linkedin"
import { estadoDeAnaliticas } from "@/lib/marcas/estado-analiticas"

const AHORA = Date.parse("2026-11-09T12:00:00Z")
const en = (dias: number) => new Date(AHORA + dias * 86_400_000).toISOString()

describe("estadoDeAnaliticas", () => {
  test("says what the owner can do in each situation", () => {
    expect(estadoDeAnaliticas(null, AHORA)).toEqual({
      texto: "Analíticas sin conectar",
      boton: "Conectar analíticas de LinkedIn",
    })
    expect(estadoDeAnaliticas({ expira_en: en(-1) }, AHORA)).toEqual({
      texto: "Las analíticas de LinkedIn vencieron",
      boton: "Renovar analíticas",
    })
    expect(estadoDeAnaliticas({ expira_en: en(5) }, AHORA)).toEqual({
      texto: "Analíticas conectadas · vencen en 5 días",
      boton: "Renovar analíticas",
    })
    expect(estadoDeAnaliticas({ expira_en: en(40) }, AHORA)).toEqual({
      texto: "Analíticas conectadas · vencen en 40 días",
      boton: null,
    })
  })

  test("speaks of a single day in the singular", () => {
    expect(estadoDeAnaliticas({ expira_en: en(1) }, AHORA).texto).toBe("Analíticas conectadas · vencen en 1 día")
  })
})

describe("AnaliticasDeLinkedin", () => {
  test("is a plain link to the page app's connect route, with the analytics purpose", () => {
    render(<AnaliticasDeLinkedin cuentaId="c1" conexion={null} ahora={AHORA} />)
    expect(screen.getByText("Analíticas sin conectar")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Conectar analíticas de LinkedIn" })).toHaveAttribute(
      "href",
      "/api/linkedin/pagina/conectar?cuenta=c1&proposito=analiticas",
    )
  })

  test("offers to renew when the connection has expired", () => {
    render(<AnaliticasDeLinkedin cuentaId="c1" conexion={{ expira_en: en(-2) }} ahora={AHORA} />)
    expect(screen.getByRole("link", { name: "Renovar analíticas" })).toBeInTheDocument()
  })

  test("offers nothing while the connection has time left", () => {
    render(<AnaliticasDeLinkedin cuentaId="c1" conexion={{ expira_en: en(40) }} ahora={AHORA} />)
    expect(screen.queryByRole("link")).toBeNull()
  })
})
