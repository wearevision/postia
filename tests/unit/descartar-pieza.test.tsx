import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { Descartar } from "@/app/(app)/piezas/[id]/controles"
import type { Resultado } from "@/lib/marcas/acciones"

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function montar(resultado: Resultado = { ok: true }) {
  const descartar = vi.fn(async (): Promise<Resultado> => resultado)
  render(<Descartar piezaId="p1" descartar={descartar} esperaParaDeshacer={5000} />)
  return descartar
}

const abrir = () => fireEvent.click(screen.getByRole("button", { name: "Descartar" }))
const confirmar = () => fireEvent.click(screen.getByRole("button", { name: "Descartar pieza" }))

describe("discarding a piece", () => {
  test("asks in the same screen and makes keeping the piece the main action", () => {
    montar()
    abrir()
    const conservar = screen.getByRole("button", { name: "Conservar pieza" })
    expect(conservar).toHaveFocus()
    expect(conservar.className).toContain("bg-primario")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  test("keeping the piece closes the question and discards nothing", () => {
    const descartar = montar()
    abrir()
    fireEvent.click(screen.getByRole("button", { name: "Conservar pieza" }))
    expect(screen.getByRole("button", { name: "Descartar" })).toBeInTheDocument()
    expect(descartar).not.toHaveBeenCalled()
  })

  test("waits before discarding for good, offering to undo meanwhile", async () => {
    const descartar = montar()
    abrir()
    fireEvent.change(screen.getByLabelText("Motivo (opcional)"), { target: { value: "Ya no aplica" } })
    confirmar()
    expect(screen.getByRole("status")).toHaveTextContent("Pieza descartada.")
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeInTheDocument()
    expect(descartar).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(5000))
    expect(descartar).toHaveBeenCalledExactlyOnceWith("p1", "Ya no aplica")
  })

  test("undoing within the wait means the piece is never discarded", async () => {
    const descartar = montar()
    abrir()
    confirmar()
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))
    await act(() => vi.advanceTimersByTimeAsync(10000))
    expect(descartar).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Descartar" })).toBeInTheDocument()
  })

  test("shows the reason the server gives and goes back to the question", async () => {
    montar({ ok: false, error: "Esta pieza se está enviando ahora. Espera a que termine." })
    abrir()
    confirmar()
    await act(() => vi.advanceTimersByTimeAsync(5000))
    expect(screen.getByRole("alert")).toHaveTextContent("Esta pieza se está enviando ahora.")
    expect(screen.getByRole("button", { name: "Conservar pieza" })).toBeInTheDocument()
  })
})
