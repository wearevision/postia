import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { FirmaDePieza } from "@/app/(app)/piezas/[id]/firma"
import type { Resultado } from "@/lib/marcas/acciones"

const HUELLA = "a".repeat(64)
const SIN_RED = () => Promise.reject(new TypeError("Failed to fetch"))

function montar(firmar: () => Promise<Resultado>, firmarParaReserva: () => Promise<Resultado> = firmar) {
  const alFirmar = vi.fn(firmar)
  const alFirmarReserva = vi.fn(firmarParaReserva)
  render(
    <FirmaDePieza
      piezaId="11111111-1111-4111-8111-111111111111"
      huella={HUELLA}
      texto="Texto de la pieza"
      fechaPropuesta="2026-11-03T18:00:00.000Z"
      abiertaEn="2026-11-02T20:00:00.000Z"
      ruta="api"
      cuenta="WAV"
      esperaEntreIntentos={0}
      firmar={alFirmar}
      firmarParaReserva={alFirmarReserva}
    />,
  )
  return { alFirmar, alFirmarReserva }
}

const firmar = () => fireEvent.click(screen.getByRole("button", { name: /^Firmar \S+ · / }))
const alerta = () => screen.findByRole("alert")

describe("when the connection drops while signing", () => {
  test("retries by itself up to three times before giving up", async () => {
    const { alFirmar } = montar(SIN_RED)
    firmar()
    await alerta()
    expect(alFirmar).toHaveBeenCalledTimes(3)
  })

  test("says what happened, that nothing was published and that the text is intact", async () => {
    montar(SIN_RED)
    firmar()
    const aviso = await alerta()
    expect(aviso).toHaveTextContent("No se pudo guardar tu firma.")
    expect(aviso).toHaveTextContent("Todavía no se publicó nada y tu texto está intacto.")
  })

  test("names the full date after which the piece no longer goes out", async () => {
    montar(SIN_RED)
    firmar()
    const aviso = await alerta()
    expect(aviso).toHaveTextContent(
      /Si la conexión no vuelve antes del .*3 .*nov.*15:00, la pieza no sale y vuelve a pedirte la firma\./,
    )
  })

  test("moves focus to the alert so it is read right away", async () => {
    montar(SIN_RED)
    firmar()
    const aviso = await alerta()
    await waitFor(() => expect(aviso).toHaveFocus())
  })

  test("announces each automatic attempt in the polite status region", async () => {
    let terminar: (resultado: Resultado) => void = () => {}
    let llamadas = 0
    montar(() => {
      llamadas++
      if (llamadas === 1) return SIN_RED()
      return new Promise<Resultado>((resolver) => {
        terminar = resolver
      })
    })
    firmar()
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Reintentando solo · 2 de 3"))
    act(() => terminar({ ok: true }))
  })

  test("shows no alert when a retry gets through", async () => {
    let llamadas = 0
    const { alFirmar } = montar(async () => {
      llamadas++
      if (llamadas === 1) throw new TypeError("Failed to fetch")
      return { ok: true }
    })
    firmar()
    await waitFor(() => expect(alFirmar).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByRole("button", { name: /^Firmar \S+ · / })).toBeEnabled())
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  test("offers to retry now and calls the same signing again", async () => {
    const { alFirmar } = montar(SIN_RED)
    firmar()
    await alerta()
    fireEvent.click(screen.getByRole("button", { name: "Reintentar ahora" }))
    await waitFor(() => expect(alFirmar).toHaveBeenCalledTimes(6))
  })

  test("retries the reserve signature, not the dated one, when that was the one pressed", async () => {
    const { alFirmar, alFirmarReserva } = montar(
      async () => ({ ok: true }),
      () => SIN_RED(),
    )
    fireEvent.click(screen.getByRole("button", { name: "Firmar para la reserva" }))
    await alerta()
    fireEvent.click(screen.getByRole("button", { name: "Reintentar ahora" }))
    await waitFor(() => expect(alFirmarReserva).toHaveBeenCalledTimes(6))
    expect(alFirmar).not.toHaveBeenCalled()
  })

  test("goes back to the piece with the date still chosen and the buttons enabled", async () => {
    montar(SIN_RED)
    const campo = screen.getByLabelText("Fecha y hora de publicación") as HTMLInputElement
    const valor = campo.value
    firmar()
    await alerta()
    fireEvent.click(screen.getByRole("button", { name: "Volver a la pieza" }))
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(campo.value).toBe(valor)
    expect(campo).toHaveFocus()
    expect(screen.getByRole("button", { name: /^Firmar \S+ · / })).toBeEnabled()
  })

  test("does not retry when the server answers with a reason", async () => {
    const { alFirmar } = montar(async () => ({ ok: false, error: "Esta pieza ya no espera tu firma." }))
    firmar()
    const aviso = await alerta()
    expect(aviso).toHaveTextContent("Esta pieza ya no espera tu firma.")
    expect(alFirmar).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("button", { name: "Reintentar ahora" })).not.toBeInTheDocument()
  })
})
