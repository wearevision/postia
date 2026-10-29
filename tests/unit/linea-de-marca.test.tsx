import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { LineaDeMarca } from "@/lib/voz/lectura"
import type { PilarDeLinea } from "@/lib/voz/linea"

const { guardar, leer } = vi.hoisted(() => ({
  guardar: vi.fn(),
  leer: vi.fn(),
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), notFound: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }))
vi.mock("@/lib/voz/lectura", () => ({ lineaDeMarca: leer }))
vi.mock("@/app/(app)/voz/[marcaId]/acciones", () => ({ guardarLineaAccion: guardar }))

const { default: Pagina } = await import("@/app/(app)/voz/[marcaId]/page")

const MARCA = "22222222-2222-4222-8222-222222222222"
const SECCIONES = { deQueHablamos: "A", tono: "B", formatos: "C", temasVetados: "D", temasAVigilar: "", ejemplos: "E" }
const OFICIO = {
  id: "33333333-3333-4333-8333-333333333333",
  nombre: "Oficio",
  deQueHabla: "",
  material: "",
  porSemana: 1,
}
const NUEVO = {
  id: "44444444-4444-4444-8444-444444444444",
  nombre: "Nuevo",
  deQueHabla: "",
  material: "",
  porSemana: 1,
}

function linea(vigente: number, pilares: PilarDeLinea[]): LineaDeMarca {
  return {
    marca: { id: MARCA, nombre: "WAV", voz: "nosotros" },
    actual: { version: vigente, creadaEn: "2026-10-29T12:00:00Z", secciones: SECCIONES, pilares },
    vigente,
    historial: [{ version: vigente, creadaEn: "2026-10-29T12:00:00Z" }],
  }
}

const pagina = async () => Pagina({ params: Promise.resolve({ marcaId: MARCA }), searchParams: Promise.resolve({}) })

describe("the editorial line page", () => {
  beforeEach(() => vi.clearAllMocks())

  test("keeps «Guardada como versión 4.» after the save brings version 4, and the next save keeps the new pillar's id", async () => {
    leer.mockResolvedValue(linea(3, [OFICIO]))
    guardar.mockResolvedValue({ ok: true, version: 4 })
    const { rerender } = render(await pagina())
    fireEvent.click(screen.getByRole("button", { name: "Agregar pilar" }))
    fireEvent.change(screen.getAllByLabelText("Nombre del pilar")[1] as HTMLElement, { target: { value: "Nuevo" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar versión nueva" }))
    expect(await screen.findByText("Guardada como versión 4.")).toBeVisible()

    // The revalidation renders the page again with the version just saved.
    leer.mockResolvedValue(linea(4, [OFICIO, NUEVO]))
    rerender(await pagina())
    expect(screen.getByText("Guardada como versión 4.")).toBeVisible()

    guardar.mockResolvedValue({ ok: true, version: 5 })
    fireEvent.click(screen.getByRole("button", { name: "Guardar versión nueva" }))
    await waitFor(() => expect(guardar).toHaveBeenCalledTimes(2))
    expect(guardar).toHaveBeenLastCalledWith({
      marcaId: MARCA,
      base: 4,
      secciones: SECCIONES,
      pilares: [OFICIO, NUEVO],
    })
  })
})
