import { render, screen, within } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { VistaDeSemana } from "@/app/(app)/calendario/semana"

const CUENTAS = [
  { id: "perfil", nombre: "Federico", marcaId: "m1", tipo: "persona" as const, ritmoSemanal: 3, enReserva: 1 },
  { id: "pagina", nombre: "Página de WAV", marcaId: "m2", tipo: "empresa" as const, ritmoSemanal: 1, enReserva: 0 },
]
const PIEZAS = [
  {
    id: "p1",
    cuentaId: "perfil",
    estado: "programada" as const,
    instante: "2026-10-27T14:00:00.000Z",
    firmada: true,
    extracto: "Firmada",
  },
  {
    id: "p2",
    cuentaId: "perfil",
    estado: "por_aprobar" as const,
    instante: "2026-10-28T14:00:00.000Z",
    firmada: false,
    extracto: "Sin firma",
  },
  {
    id: "p3",
    cuentaId: "pagina",
    estado: "a_mano" as const,
    instante: "2026-10-27T18:00:00.000Z",
    firmada: true,
    extracto: "A mano",
  },
]

const ASIGNACIONES = [
  {
    tipo: "asignacion" as const,
    id: "a1",
    ideaId: "i1",
    investigacionId: "inv1",
    cuentaId: "perfil",
    estado: "por_escribir" as const,
    instante: "2026-10-29T14:00:00.000Z",
    gancho: "Los focus groups no mueren",
  },
]

describe("VistaDeSemana", () => {
  test("one section per account with its reserve and what is missing against the rhythm", () => {
    render(<VistaDeSemana lunes="2026-10-26" cuentas={CUENTAS} piezas={PIEZAS} />)
    const perfil = screen.getByRole("region", { name: "Federico" })
    expect(within(perfil).getByText("Reserva: 1 de 3")).toBeInTheDocument()
    expect(within(perfil).getByText("Faltan 1")).toBeInTheDocument()
    const pagina = screen.getByRole("region", { name: "Página de WAV" })
    expect(within(pagina).queryByText(/^Faltan/)).not.toBeInTheDocument()
  })

  test("planned pieces read as unsigned, signed ones show their state; each links to its piece", () => {
    render(<VistaDeSemana lunes="2026-10-26" cuentas={CUENTAS} piezas={PIEZAS} />)
    const sinFirma = screen.getByRole("link", { name: /Sin firma/ })
    expect(sinFirma).toHaveAttribute("href", "/piezas/p2")
    expect(within(sinFirma).getByText("Planeada, sin firma")).toBeInTheDocument()
    expect(within(sinFirma).getByText("miércoles 28 de octubre, 11:00")).toBeInTheDocument()
    expect(within(screen.getByRole("link", { name: /Firmada/ })).getByText("Programada")).toBeInTheDocument()
  })

  test("the header names the week and links to the neighbouring weeks", () => {
    render(<VistaDeSemana lunes="2026-10-26" cuentas={CUENTAS} piezas={PIEZAS} />)
    expect(screen.getByRole("heading", { name: "Semana del 26 de octubre" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Semana anterior" })).toHaveAttribute(
      "href",
      "/calendario?semana=2026-10-19",
    )
    expect(screen.getByRole("link", { name: "Semana siguiente" })).toHaveAttribute(
      "href",
      "/calendario?semana=2026-11-02",
    )
  })

  test("an account without pieces says nothing is planned and hides a zero rhythm", () => {
    render(
      <VistaDeSemana lunes="2026-10-26" cuentas={[{ ...CUENTAS[0], ritmoSemanal: 0, enReserva: 0 }]} piezas={[]} />,
    )
    const perfil = screen.getByRole("region", { name: "Federico" })
    expect(within(perfil).getByText("Nada esta semana.")).toBeInTheDocument()
    expect(within(perfil).queryByText(/^Reserva/)).not.toBeInTheDocument()
  })

  test("does not count what is missing in a week that is already over", () => {
    render(<VistaDeSemana lunes="2026-10-26" cuentas={CUENTAS} piezas={PIEZAS} terminada />)
    expect(screen.queryByText(/^Faltan/)).not.toBeInTheDocument()
  })

  test("an idea planned but not written shows dashed as «Por escribir», links to its idea and fills the rhythm", () => {
    render(<VistaDeSemana lunes="2026-10-26" cuentas={CUENTAS} piezas={PIEZAS} asignaciones={ASIGNACIONES} />)
    const perfil = screen.getByRole("region", { name: "Federico" })
    expect(within(perfil).queryByText(/^Faltan/)).not.toBeInTheDocument()
    const enlace = within(perfil).getByRole("link", { name: /Los focus groups no mueren/ })
    expect(enlace).toHaveAttribute("href", "/ideas?serie=inv1&estado=todas#idea-i1")
    expect(enlace).toHaveClass("border-dashed")
    expect(within(enlace).getByText("Por escribir · Los focus groups no mueren")).toBeInTheDocument()
    expect(within(enlace).getByText("jueves 29 de octubre, 11:00")).toBeInTheDocument()
    // Ordered by time with the account's pieces: after Tuesday's and Wednesday's.
    expect(within(perfil).getAllByRole("link").at(-1)).toBe(enlace)
  })
})
