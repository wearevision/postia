import { describe, expect, test } from "vitest"
import { transicionPermitida } from "@/lib/piezas/estados"

describe("transicionPermitida", () => {
  test("signing moves a piece from the gate to scheduled, and nothing skips the gate", () => {
    expect(transicionPermitida("por_aprobar", "programada")).toBe(true)
    expect(transicionPermitida("por_aprobar", "publicando")).toBe(false)
    expect(transicionPermitida("por_aprobar", "publicada")).toBe(false)
  })
  test("only a scheduled piece can start sending, and a sent one never goes back to scheduled", () => {
    expect(transicionPermitida("programada", "publicando")).toBe(true)
    expect(transicionPermitida("publicando", "programada")).toBe(false)
    expect(transicionPermitida("envio_dudoso", "programada")).toBe(false)
  })
  test("published and discarded are final", () => {
    expect(transicionPermitida("publicada", "a_mano")).toBe(false)
    expect(transicionPermitida("descartada", "por_aprobar")).toBe(false)
  })
})
