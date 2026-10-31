import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { FirmaDePieza } from "@/app/(app)/piezas/[id]/firma"
import type { Resultado } from "@/lib/marcas/acciones"

const HUELLA = "a".repeat(64)
const PIEZA = "11111111-1111-4111-8111-111111111111"
const ABIERTA_EN = "2026-11-02T20:00:00.000Z"

function montar(sobre: Partial<Parameters<typeof FirmaDePieza>[0]> = {}) {
  const firmar = vi.fn(async () => ({ ok: true as const }))
  const firmarParaReserva = vi.fn(async (): Promise<Resultado> => ({ ok: true }))
  const planear = vi.fn(async (): Promise<Resultado> => ({ ok: true }))
  render(
    <FirmaDePieza
      piezaId={PIEZA}
      huella={HUELLA}
      fechaPropuesta="2026-11-03T14:00:00.000Z"
      abiertaEn={ABIERTA_EN}
      ruta="api"
      cuenta="Federico"
      firmar={firmar}
      firmarParaReserva={firmarParaReserva}
      planear={planear}
      {...sobre}
    />,
  )
  return firmar
}

describe("FirmaDePieza", () => {
  test("shows the date it will sign for, without a field until asked", () => {
    montar()
    expect(screen.getByText("martes 3 de noviembre, 11:00", { exact: false })).toBeInTheDocument()
    expect(screen.queryByLabelText("Fecha y hora de publicación")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Firmar Federico · mar 3 nov, 11:00" })).toBeInTheDocument()
  })

  test("no longer renders the post text, which the page shows above", () => {
    montar()
    expect(screen.queryByText("Primera línea", { exact: false })).not.toBeInTheDocument()
  })

  test("warns that signing now drops the rewrite Claude is working on, only while it is", () => {
    const AVISO = "Claude está reescribiendo. Si firmas ahora, esa versión no se aplica."
    montar({ reescribiendo: true })
    expect(screen.getByText(AVISO)).toBeVisible()
    cleanup()
    montar()
    expect(screen.queryByText(AVISO)).toBeNull()
  })

  test("signs for the shown date", async () => {
    const firmar = montar()
    fireEvent.click(screen.getByRole("button", { name: /^Firmar Federico/ }))
    await waitFor(() =>
      expect(firmar).toHaveBeenCalledWith({
        piezaId: PIEZA,
        huella: HUELLA,
        programadaPara: "2026-11-03T14:00:00.000Z",
        abiertaEn: ABIERTA_EN,
      }),
    )
  })

  test("shows the error from signing as an alert", async () => {
    const firmar = vi.fn(async () => ({ ok: false as const, error: "Elige una fecha y hora futuras." }))
    montar({ firmar })
    fireEvent.click(screen.getByRole("button", { name: /^Firmar \S+ · / }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Elige una fecha y hora futuras.")
  })

  test("tells the person a page account is published by hand", () => {
    montar({ ruta: "a_mano" })
    expect(screen.getByText("Te aviso a la hora para publicarla a mano.")).toBeInTheDocument()
  })
})

describe("signing for the reserve", () => {
  test("offers it as a secondary action with one line that explains it", () => {
    montar()
    expect(screen.getByRole("button", { name: "Firmar para la reserva" })).toBeInTheDocument()
    const boton = screen.getByRole("button", { name: "Firmar para la reserva" })
    const explicacion = screen.getByText(
      "Sin fecha. Cuando a Federico le falte una pieza firmada, la app le pone fecha y la publica sin volver a preguntarte.",
    )
    expect(boton).toHaveAccessibleDescription(explicacion.textContent ?? "")
  })

  test("for a by-hand account the explanation promises a notice, not a publication", () => {
    montar({ ruta: "a_mano", cuenta: "Página de WAV" })
    expect(
      screen.getByText(
        "Sin fecha. Cuando a Página de WAV le falte una pieza firmada, la app le pone fecha y te avisa para publicarla a mano, sin volver a preguntarte.",
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/la publica/)).toBeNull()
  })

  test("signs the exact version without a date", async () => {
    const firmarParaReserva = vi.fn(async () => ({ ok: true as const }))
    const firmar = montar({ firmarParaReserva })
    fireEvent.click(screen.getByRole("button", { name: "Firmar para la reserva" }))
    await waitFor(() =>
      expect(firmarParaReserva).toHaveBeenCalledWith({ piezaId: PIEZA, huella: HUELLA, abiertaEn: ABIERTA_EN }),
    )
    expect(firmar).not.toHaveBeenCalled()
  })

  test("shows its error as an alert", async () => {
    montar({
      firmarParaReserva: vi.fn(async () => ({ ok: false as const, error: "Esta pieza ya no espera tu firma." })),
    })
    fireEvent.click(screen.getByRole("button", { name: "Firmar para la reserva" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Esta pieza ya no espera tu firma.")
  })
})

describe("changing the date", () => {
  test("Cambiar fecha opens the field prefilled with the shown date in Chile time", () => {
    montar()
    fireEvent.click(screen.getByRole("button", { name: "Cambiar fecha" }))
    expect(screen.getByLabelText("Fecha y hora de publicación")).toHaveValue("2026-11-03T11:00")
  })

  test("Cambiar fecha saves the new plan through planear", async () => {
    const planear = vi.fn(async () => ({ ok: true as const }))
    const firmar = montar({ planear })
    fireEvent.click(screen.getByRole("button", { name: "Cambiar fecha" }))
    fireEvent.change(screen.getByLabelText("Fecha y hora de publicación"), { target: { value: "2026-11-04T15:00" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar fecha" }))
    await waitFor(() =>
      expect(planear).toHaveBeenCalledWith({ piezaId: PIEZA, planeadaPara: "2026-11-04T18:00:00.000Z" }),
    )
    expect(firmar).not.toHaveBeenCalled()
  })

  test("Enter in the date field saves the date and never signs", async () => {
    const planear = vi.fn(async () => ({ ok: true as const }))
    const firmar = montar({ planear })
    fireEvent.click(screen.getByRole("button", { name: "Cambiar fecha" }))
    const campo = screen.getByLabelText("Fecha y hora de publicación")
    fireEvent.change(campo, { target: { value: "2026-11-04T15:00" } })
    expect(fireEvent.keyDown(campo, { key: "Enter" })).toBe(false)
    await waitFor(() =>
      expect(planear).toHaveBeenCalledWith({ piezaId: PIEZA, planeadaPara: "2026-11-04T18:00:00.000Z" }),
    )
    expect(firmar).not.toHaveBeenCalled()
  })

  test("asks for a date when the field is empty", () => {
    const planear = vi.fn(async () => ({ ok: true as const }))
    montar({ planear })
    fireEvent.click(screen.getByRole("button", { name: "Cambiar fecha" }))
    fireEvent.change(screen.getByLabelText("Fecha y hora de publicación"), { target: { value: "" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar fecha" }))
    expect(planear).not.toHaveBeenCalled()
    expect(screen.getByRole("alert")).toHaveTextContent("Elige la fecha y la hora.")
  })

  test("shows a refusal to move the date as an alert", async () => {
    montar({
      planear: vi.fn(async () => ({
        ok: false as const,
        error: "Esa cuenta ya tiene una pieza a esa hora. Elige otra.",
      })),
    })
    fireEvent.click(screen.getByRole("button", { name: "Cambiar fecha" }))
    fireEvent.click(screen.getByRole("button", { name: "Guardar fecha" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Esa cuenta ya tiene una pieza a esa hora. Elige otra.")
  })

  test("shows the new date when the parent remounts the form with it", () => {
    const props = {
      piezaId: PIEZA,
      huella: HUELLA,
      abiertaEn: ABIERTA_EN,
      ruta: "api" as const,
      cuenta: "Federico",
      firmar: vi.fn(async () => ({ ok: true as const })),
      firmarParaReserva: vi.fn(async () => ({ ok: true as const })),
      planear: vi.fn(async () => ({ ok: true as const })),
    }
    const { rerender } = render(<FirmaDePieza key="a" fechaPropuesta="2026-11-03T14:00:00.000Z" {...props} />)
    expect(screen.getByText("martes 3 de noviembre, 11:00")).toBeInTheDocument()
    rerender(<FirmaDePieza key="b" fechaPropuesta="2026-11-05T14:00:00.000Z" {...props} />)
    expect(screen.getByText("jueves 5 de noviembre, 11:00")).toBeInTheDocument()
    expect(screen.queryByLabelText("Fecha y hora de publicación")).not.toBeInTheDocument()
  })

  test("an edited date that was not saved blocks signing for a date, with its reason", () => {
    montar()
    fireEvent.click(screen.getByRole("button", { name: "Cambiar fecha" }))
    fireEvent.change(screen.getByLabelText("Fecha y hora de publicación"), { target: { value: "2026-11-04T15:00" } })
    const firmar = screen.getByRole("button", { name: /^Firmar Federico/ })
    expect(firmar).toBeDisabled()
    expect(screen.getByText("Guarda la fecha antes de firmar.")).toBeInTheDocument()
    expect(firmar).toHaveAccessibleDescription(/Guarda la fecha antes de firmar\./)
    expect(screen.getByRole("button", { name: "Firmar para la reserva" })).toBeEnabled()
  })

  test("an open editor with the shown date unchanged does not block signing", () => {
    montar()
    fireEvent.click(screen.getByRole("button", { name: "Cambiar fecha" }))
    expect(screen.getByRole("button", { name: /^Firmar Federico/ })).toBeEnabled()
    expect(screen.queryByText("Guarda la fecha antes de firmar.")).not.toBeInTheDocument()
  })

  test("blocks signing while the new date is being saved", () => {
    montar({ planear: vi.fn(() => new Promise<Resultado>(() => {})) })
    fireEvent.click(screen.getByRole("button", { name: "Cambiar fecha" }))
    fireEvent.click(screen.getByRole("button", { name: "Guardar fecha" }))
    expect(screen.getByRole("button", { name: /^Firmar Federico/ })).toBeDisabled()
  })

  test("a failed save keeps the editor open and signing blocked", async () => {
    montar({ planear: vi.fn(async () => ({ ok: false as const, error: "Esa cuenta ya tiene una pieza a esa hora." })) })
    fireEvent.click(screen.getByRole("button", { name: "Cambiar fecha" }))
    fireEvent.change(screen.getByLabelText("Fecha y hora de publicación"), { target: { value: "2026-11-04T15:00" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar fecha" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Esa cuenta ya tiene una pieza a esa hora.")
    expect(screen.getByLabelText("Fecha y hora de publicación")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Firmar Federico/ })).toBeDisabled()
  })

  test("Cancelar closes the editor and resets the field", () => {
    montar()
    fireEvent.click(screen.getByRole("button", { name: "Cambiar fecha" }))
    fireEvent.change(screen.getByLabelText("Fecha y hora de publicación"), { target: { value: "2026-11-04T15:00" } })
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(screen.queryByLabelText("Fecha y hora de publicación")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Firmar Federico/ })).toBeEnabled()
    fireEvent.click(screen.getByRole("button", { name: "Cambiar fecha" }))
    expect(screen.getByLabelText("Fecha y hora de publicación")).toHaveValue("2026-11-03T11:00")
  })

  test("a refusal because the date is past opens the date editor", async () => {
    montar({ firmar: vi.fn(async () => ({ ok: false as const, error: "Elige una fecha y hora futuras." })) })
    fireEvent.click(screen.getByRole("button", { name: /^Firmar Federico/ }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Elige una fecha y hora futuras.")
    expect(screen.getByLabelText("Fecha y hora de publicación")).toBeInTheDocument()
  })
})
