import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { CorregirTexto, PedirOtraVersion } from "@/app/(app)/piezas/[id]/redaccion"

describe("CorregirTexto", () => {
  test("saves the edited text as a new version", async () => {
    const corregir = vi.fn(async () => ({ ok: true as const }))
    render(<CorregirTexto piezaId="p" texto="Uno" corregir={corregir} />)
    fireEvent.click(screen.getByRole("button", { name: "Corregir a mano" }))
    fireEvent.change(screen.getByLabelText("Texto"), { target: { value: "Dos" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar versión" }))
    await waitFor(() => expect(corregir).toHaveBeenCalledWith({ piezaId: "p", texto: "Dos" }))
  })
})

describe("PedirOtraVersion", () => {
  test("a quick button asks for that rewrite and the count of rewrites left shows", async () => {
    const pedir = vi.fn(async () => ({ ok: true as const }))
    render(<PedirOtraVersion piezaId="p" quedan={2} pedir={pedir} />)
    expect(screen.getByText("Te quedan 2 versiones de Claude para esta pieza.")).toBeVisible()
    fireEvent.click(screen.getByRole("button", { name: "Más corto" }))
    await waitFor(() => expect(pedir).toHaveBeenCalledWith({ piezaId: "p", instruccion: "Más corto" }))
  })

  test("a free instruction is sent as typed; none are offered when the rewrites ran out", async () => {
    const pedir = vi.fn(async () => ({ ok: true as const }))
    const { rerender } = render(<PedirOtraVersion piezaId="p" quedan={1} pedir={pedir} />)
    fireEvent.change(screen.getByLabelText("Otra instrucción"), { target: { value: "Menciona el plazo" } })
    fireEvent.click(screen.getByRole("button", { name: "Pedir" }))
    await waitFor(() => expect(pedir).toHaveBeenCalledWith({ piezaId: "p", instruccion: "Menciona el plazo" }))
    rerender(<PedirOtraVersion piezaId="p" quedan={0} pedir={pedir} />)
    expect(screen.queryByRole("button", { name: "Más corto" })).toBeNull()
    expect(screen.getByText("Ya pediste 3 versiones. Corrígela a mano.")).toBeVisible()
  })
})
