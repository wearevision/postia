import { describe, expect, test, vi } from "vitest"
import { claveDelTurno, vigilarCarruseles } from "@/lib/carrusel/vigilar"

const AHORA = new Date("2026-11-04T15:03:10.000Z")

describe("vigilarCarruseles", () => {
  test("triggers the renderer once when a request could be leased", async () => {
    const disparar = vi.fn(async () => {})
    const r = await vigilarCarruseles({ abiertos: async () => 2, disparar }, AHORA)
    expect(r).toEqual({ abiertos: 2, disparado: true })
    expect(disparar).toHaveBeenCalledTimes(1)
    expect(disparar).toHaveBeenCalledWith(claveDelTurno(AHORA))
  })

  test("does not trigger the renderer when nothing is open", async () => {
    const disparar = vi.fn(async () => {})
    const r = await vigilarCarruseles({ abiertos: async () => 0, disparar }, AHORA)
    expect(r).toEqual({ abiertos: 0, disparado: false })
    expect(disparar).not.toHaveBeenCalled()
  })

  test("two polls inside the same 2-minute slot share a key; the next slot gets a new one", () => {
    expect(claveDelTurno(new Date("2026-11-04T15:02:00.000Z"))).toBe(
      claveDelTurno(new Date("2026-11-04T15:03:59.999Z")),
    )
    expect(claveDelTurno(new Date("2026-11-04T15:04:00.000Z"))).not.toBe(
      claveDelTurno(new Date("2026-11-04T15:03:59.999Z")),
    )
  })
})
