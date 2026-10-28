import { render, screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { EstadoDeConexionChip } from "@/app/(app)/marcas/estado-de-conexion"

describe("EstadoDeConexionChip", () => {
  test("says how many days are left, never anything about the token", () => {
    render(<EstadoDeConexionChip estado={{ estado: "conectada", dias: 45 }} />)
    expect(screen.getByText("Conectada · vence en 45 días")).toBeInTheDocument()
  })
  test("asks to renew when about to expire or expired", () => {
    const { rerender } = render(<EstadoDeConexionChip estado={{ estado: "por_vencer", dias: 1 }} />)
    expect(screen.getByText("Vence en 1 día · renuévala")).toBeInTheDocument()
    rerender(<EstadoDeConexionChip estado={{ estado: "vencida" }} />)
    expect(screen.getByText("Vencida · vuelve a conectar")).toBeInTheDocument()
  })
})
