import { describe, expect, test } from "vitest"
import { enSantiago, proponerFecha, repartirFechas } from "@/lib/piezas/horarios"

describe("enSantiago", () => {
  test("converts Chile wall time to UTC across daylight saving", () => {
    // 2026-11-03 is summer time (UTC-3); 2027-07-06 is winter time (UTC-4).
    expect(enSantiago(2026, 11, 3, 11, 0).toISOString()).toBe("2026-11-03T14:00:00.000Z")
    expect(enSantiago(2027, 7, 6, 11, 0).toISOString()).toBe("2027-07-06T15:00:00.000Z")
  })
})

describe("proponerFecha", () => {
  // Wednesday 2026-10-28, 10:00 in Chile.
  const AHORA = Date.parse("2026-10-28T13:00:00Z")

  test("the profile goes at 11:00 on the next free day", () => {
    expect(proponerFecha("persona", [], AHORA).toISOString()).toBe("2026-10-28T14:00:00.000Z")
  })

  test("the page goes at 15:00, and a taken slot moves to the next day", () => {
    const ocupado = [Date.parse("2026-10-28T18:00:00Z")]
    expect(proponerFecha("empresa", ocupado, AHORA).toISOString()).toBe("2026-10-29T18:00:00.000Z")
  })

  test("every day of the week counts, weekends too, and never less than 30 minutes ahead", () => {
    const juevesTarde = Date.parse("2026-10-29T14:45:00Z") // Thursday 11:45 in Chile, past the profile slot
    expect(proponerFecha("persona", [], juevesTarde).toISOString()).toBe("2026-10-30T14:00:00.000Z")
    const viernesTomado = [Date.parse("2026-10-30T14:00:00Z")]
    expect(proponerFecha("persona", viernesTomado, juevesTarde).toISOString()).toBe("2026-10-31T14:00:00.000Z")
  })
})

describe("repartirFechas", () => {
  test("gives consecutive free slots of one account, never reusing one (plano: repartir)", () => {
    const AHORA = Date.parse("2026-10-28T13:00:00Z") // Wednesday 10:00 in Chile
    const ocupado = [Date.parse("2026-10-29T18:00:00Z")]
    expect(repartirFechas("empresa", ocupado, 3, AHORA).map((f) => f.toISOString())).toEqual([
      "2026-10-28T18:00:00.000Z",
      "2026-10-30T18:00:00.000Z",
      "2026-10-31T18:00:00.000Z",
    ])
  })
})
