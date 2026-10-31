import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { FirmaDePieza } from "@/app/(app)/piezas/[id]/firma"
import { fechaCorta } from "@/lib/piezas/fechas"

function montar(ruta: "api" | "a_mano" = "api") {
  render(
    <FirmaDePieza
      piezaId="11111111-1111-4111-8111-111111111111"
      huella={"a".repeat(64)}
      texto="Texto"
      fechaPropuesta="2026-11-03T18:00:00.000Z"
      abiertaEn="2026-11-02T20:00:00.000Z"
      ruta={ruta}
      cuenta="WAV"
      firmar={vi.fn(async () => ({ ok: true as const }))}
      firmarParaReserva={vi.fn(async () => ({ ok: true as const }))}
    />,
  )
}

describe("short date for buttons", () => {
  test("is weekday, day, month and hour in Chile time", () => {
    expect(fechaCorta("2026-11-03T18:00:00.000Z")).toBe("mar 3 nov, 15:00")
    expect(fechaCorta("2026-07-01T14:00:00.000Z")).toBe("mié 1 jul, 10:00")
  })
})

describe("the signing button", () => {
  test("names the account and the date it would sign", () => {
    montar()
    expect(screen.getByRole("button", { name: "Firmar WAV · mar 3 nov, 15:00" })).toBeInTheDocument()
  })

  test("follows the date the person picks", () => {
    montar()
    fireEvent.change(screen.getByLabelText("Fecha y hora de publicación"), { target: { value: "2026-11-04T09:30" } })
    expect(screen.getByRole("button", { name: "Firmar WAV · mié 4 nov, 09:30" })).toBeInTheDocument()
  })

  test("names only the account while there is no valid date", () => {
    montar()
    fireEvent.change(screen.getByLabelText("Fecha y hora de publicación"), { target: { value: "" } })
    expect(screen.getByRole("button", { name: "Firmar WAV" })).toBeInTheDocument()
  })

  test("keeps saying that a hand-published piece is published by hand", () => {
    montar("a_mano")
    expect(screen.getByRole("button", { name: "Firmar WAV · mar 3 nov, 15:00" })).toBeInTheDocument()
    expect(screen.getByText("Te aviso a la hora para publicarla a mano.")).toBeInTheDocument()
  })
})
