import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { EditorDeLinea } from "@/app/(app)/voz/[marcaId]/editor"
import type { Resultado } from "@/lib/marcas/acciones"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const MARCA = "22222222-2222-4222-8222-222222222222"
const PILAR = {
  id: "33333333-3333-4333-8333-333333333333",
  nombre: "Oficio",
  deQueHabla: "",
  material: "",
  porSemana: 0.5,
}
const SECCIONES = { deQueHablamos: "A", tono: "B", formatos: "C", temasVetados: "D", temasAVigilar: "", ejemplos: "E" }

type Guardar = (entrada: unknown) => Promise<Resultado<{ version: number }>>

function montar(guardar = vi.fn<Guardar>(async () => ({ ok: true, version: 4 }))) {
  render(<EditorDeLinea marcaId={MARCA} base={3} secciones={SECCIONES} pilares={[PILAR]} guardar={guardar} />)
  return guardar
}

describe("EditorDeLinea", () => {
  test("saves the edited sections and pillars on top of the version it started from", async () => {
    const guardar = montar()
    fireEvent.change(screen.getByLabelText("Tono y voz"), { target: { value: "Más directo" } })
    fireEvent.click(screen.getByRole("button", { name: "Agregar pilar" }))
    fireEvent.change(screen.getAllByLabelText("Nombre del pilar")[1] as HTMLElement, { target: { value: "Nuevo" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar versión nueva" }))
    await waitFor(() => expect(guardar).toHaveBeenCalledTimes(1))
    expect(guardar).toHaveBeenCalledWith({
      marcaId: MARCA,
      base: 3,
      secciones: { ...SECCIONES, tono: "Más directo" },
      pilares: [PILAR, { nombre: "Nuevo", deQueHabla: "", material: "", porSemana: 1 }],
    })
    expect(await screen.findByText("Guardada como versión 4.")).toBeVisible()
  })

  test("shows the server's error and keeps the edits", async () => {
    montar(vi.fn<Guardar>(async () => ({ ok: false, error: "Alguien guardó otra versión mientras editabas." })))
    fireEvent.change(screen.getByLabelText("Formatos"), { target: { value: "Otro" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar versión nueva" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Alguien guardó otra versión")
    expect(screen.getByLabelText("Formatos")).toHaveValue("Otro")
  })

  test("a pillar can be removed but never the last one", () => {
    montar()
    expect(screen.queryByRole("button", { name: "Quitar Oficio" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Agregar pilar" }))
    fireEvent.click(screen.getByRole("button", { name: "Quitar Oficio" }))
    expect(screen.getAllByLabelText("Nombre del pilar")).toHaveLength(1)
  })

  test("keeps a weekly target outside the usual choices", () => {
    render(
      <EditorDeLinea
        marcaId={MARCA}
        base={3}
        secciones={SECCIONES}
        pilares={[{ ...PILAR, porSemana: 1.5 }]}
        guardar={vi.fn()}
      />,
    )
    expect(screen.getByLabelText("Por semana")).toHaveValue("1.5")
  })

  test("removing a new pillar keeps the others' fields on their own pillar", () => {
    montar()
    fireEvent.click(screen.getByRole("button", { name: "Agregar pilar" }))
    fireEvent.click(screen.getByRole("button", { name: "Agregar pilar" }))
    const nombres = () => screen.getAllByLabelText("Nombre del pilar")
    fireEvent.change(nombres()[1] as HTMLElement, { target: { value: "Segundo" } })
    fireEvent.change(nombres()[2] as HTMLElement, { target: { value: "Tercero" } })
    const tercero = nombres()[2]
    fireEvent.click(screen.getByRole("button", { name: "Quitar Segundo" }))
    expect(nombres()[1]).toBe(tercero)
    expect(tercero).toHaveValue("Tercero")
  })
})
