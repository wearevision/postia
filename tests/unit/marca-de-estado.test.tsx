import { render, screen } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { MarcaDeEstado } from "@/app/(app)/marca-de-estado"
import { FirmaConfirmada } from "@/app/(app)/piezas/[id]/firmada"
import { ESTADOS, type EstadoDePieza, NOMBRE_DEL_ESTADO } from "@/lib/piezas/estados"

const FORMA: Record<EstadoDePieza, string> = {
  por_aprobar: "punto",
  en_reserva: "reloj",
  programada: "check",
  publicando: "reloj",
  publicada: "check",
  envio_dudoso: "triangulo",
  a_mano: "punto",
  error: "triangulo-lleno",
  descartada: "menos",
}

function forma(estado: EstadoDePieza) {
  const { container } = render(<MarcaDeEstado estado={estado} />)
  return container.querySelector("svg")
}

describe("a piece state mark", () => {
  test.each(ESTADOS)("%s says its name and has a shape, never color alone", (estado) => {
    const icono = forma(estado)
    expect(screen.getByText(NOMBRE_DEL_ESTADO[estado])).toBeInTheDocument()
    expect(icono).toHaveAttribute("data-forma", FORMA[estado])
    expect(icono).toHaveAttribute("aria-hidden", "true")
  })

  test("uses magenta only where the person has to act", () => {
    const colores = Object.fromEntries(
      ESTADOS.map((estado) => [estado, forma(estado)?.getAttribute("class")?.includes("text-primario") ?? false]),
    )
    expect(colores).toMatchObject({
      por_aprobar: true,
      a_mano: true,
      programada: false,
      error: false,
      publicada: false,
    })
  })

  test("uses the resolved blue for signed and published pieces", () => {
    expect(forma("programada")?.getAttribute("class")).toContain("text-exito")
    expect(forma("publicada")?.getAttribute("class")).toContain("text-exito")
  })
})

describe("the signed confirmation", () => {
  test("carries the resolved check next to the word", () => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => {})
    const { container } = render(<FirmaConfirmada huella={"a".repeat(64)} programadaPara={null} />)
    const icono = container.querySelector("svg")
    expect(icono).toHaveAttribute("data-forma", "check")
    expect(icono?.getAttribute("class")).toContain("text-exito")
    expect(icono).toHaveAttribute("aria-hidden", "true")
  })
})
