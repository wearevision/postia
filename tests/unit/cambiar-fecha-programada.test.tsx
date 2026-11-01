import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"

const router = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => router }))

import { CambiarFechaProgramada } from "@/app/(app)/piezas/[id]/controles"
import { FirmaDePieza } from "@/app/(app)/piezas/[id]/firma"
import type { Resultado } from "@/lib/marcas/acciones"

afterEach(() => {
  router.replace.mockClear()
  window.history.replaceState(null, "", "/")
})

describe("changing the date of a scheduled piece", () => {
  test("is one button that says, in one line, that a new date needs a new signature", () => {
    render(<CambiarFechaProgramada piezaId="p1" desprogramar={vi.fn(async (): Promise<Resultado> => ({ ok: true }))} />)
    expect(screen.getByRole("button", { name: "Cambiar fecha" })).toHaveAccessibleDescription(
      "Cambiar la fecha pide firmarla de nuevo.",
    )
  })

  test("unschedules the piece and opens its signing view with the date editor", async () => {
    const desprogramar = vi.fn(async (): Promise<Resultado> => ({ ok: true }))
    render(<CambiarFechaProgramada piezaId="p1" desprogramar={desprogramar} />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar fecha" }))
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/piezas/p1?cambiar=fecha"))
    expect(desprogramar).toHaveBeenCalledWith("p1")
  })

  test("stays put and shows the refusal when the piece cannot be unscheduled", async () => {
    const desprogramar = vi.fn(async (): Promise<Resultado> => ({ ok: false, error: "Esta pieza ya salió." }))
    render(<CambiarFechaProgramada piezaId="p1" desprogramar={desprogramar} />)
    fireEvent.click(screen.getByRole("button", { name: "Cambiar fecha" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Esta pieza ya salió.")
    expect(router.replace).not.toHaveBeenCalled()
  })
})

describe("the signing view reached to change the date", () => {
  function montar() {
    const firmar = vi.fn(async (): Promise<Resultado> => ({ ok: true }))
    render(
      <FirmaDePieza
        piezaId="11111111-1111-4111-8111-111111111111"
        huella={"a".repeat(64)}
        fechaPropuesta="2026-11-03T14:00:00.000Z"
        abiertaEn="2026-11-02T20:00:00.000Z"
        ruta="api"
        cuenta="Federico"
        abrirFecha
        firmar={firmar}
        firmarParaReserva={vi.fn(async (): Promise<Resultado> => ({ ok: true }))}
        planear={vi.fn(async (): Promise<Resultado> => ({ ok: true }))}
      />,
    )
    return firmar
  }

  test("opens with the date editor focused", () => {
    montar()
    expect(screen.getByLabelText("Fecha y hora de publicación")).toHaveFocus()
  })

  test("drops the request from the address so saving the date does not reopen the editor", () => {
    window.history.replaceState(null, "", "/piezas/p1?cambiar=fecha")
    montar()
    expect(window.location.pathname).toBe("/piezas/p1")
    expect(window.location.search).toBe("")
  })

  test("still needs the new date saved before signing, and never signs by itself", () => {
    const firmar = montar()
    fireEvent.change(screen.getByLabelText("Fecha y hora de publicación"), { target: { value: "2026-11-04T15:00" } })
    expect(screen.getByRole("button", { name: /^Firmar para el / })).toBeDisabled()
    expect(screen.getByText("Guarda la fecha antes de firmar.")).toBeInTheDocument()
    expect(firmar).not.toHaveBeenCalled()
  })
})
