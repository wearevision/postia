import { render, screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { AnaliticasDeLinkedin } from "@/app/(app)/ajustes/analiticas-de-linkedin"
import { estadoDeAnaliticas } from "@/lib/marcas/estado-analiticas"

const AHORA = Date.parse("2026-11-09T12:00:00Z")
const en = (dias: number) => new Date(AHORA + dias * 86_400_000).toISOString()
const RENOVAR = "Para leer las analíticas de tu perfil, renueva la página de WAV"

describe("estadoDeAnaliticas", () => {
  test("reads through the page's connection while it has time left", () => {
    expect(estadoDeAnaliticas(en(40), AHORA)).toBe("Analíticas por la conexión de la página de WAV · vence en 40 días")
    expect(estadoDeAnaliticas(en(1), AHORA)).toBe("Analíticas por la conexión de la página de WAV · vence en 1 día")
  })

  test("asks to renew the page when its connection lacks the permission or has expired", () => {
    expect(estadoDeAnaliticas(null, AHORA)).toBe(RENOVAR)
    expect(estadoDeAnaliticas(en(-1), AHORA)).toBe(RENOVAR)
  })
})

describe("AnaliticasDeLinkedin", () => {
  test("shows the status from the page's connection, with no button of its own", () => {
    render(<AnaliticasDeLinkedin expiraEn={en(40)} ahora={AHORA} />)
    expect(screen.getByText("Analíticas por la conexión de la página de WAV · vence en 40 días")).toBeInTheDocument()
    expect(screen.queryByRole("link")).toBeNull()
    expect(screen.queryByRole("button")).toBeNull()
  })

  test("points to renewing the page when the profile cannot be read", () => {
    render(<AnaliticasDeLinkedin expiraEn={null} ahora={AHORA} />)
    expect(screen.getByText(RENOVAR)).toBeInTheDocument()
    expect(screen.queryByRole("link")).toBeNull()
  })
})
