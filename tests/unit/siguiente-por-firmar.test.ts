import { describe, expect, test } from "vitest"
import { siguientePorFirmar } from "@/lib/piezas/siguiente"

const t = (id: string, cuenta = "Federico", planeadaPara: string | null = "2026-11-04T14:00:00.000Z") => ({
  id,
  cuenta,
  planeadaPara,
})

describe("siguientePorFirmar", () => {
  test("is the first piece waiting for a signature other than this one", () => {
    expect(siguientePorFirmar([t("a"), t("b"), t("c")], "a")?.id).toBe("b")
    expect(siguientePorFirmar([t("a"), t("b")], "b")?.id).toBe("a")
  })

  test("names the next piece's account and planned date", () => {
    expect(siguientePorFirmar([t("a"), t("b", "Página de WAV", "2026-11-05T18:00:00.000Z")], "a")).toEqual({
      id: "b",
      cuenta: "Página de WAV",
      planeadaPara: "2026-11-05T18:00:00.000Z",
      quedan: 1,
    })
  })

  test("counts every piece still waiting except this one", () => {
    expect(siguientePorFirmar([t("a"), t("b"), t("c")], "a")?.quedan).toBe(2)
    // The signed piece may already be gone from the inbox: it is not subtracted twice.
    expect(siguientePorFirmar([t("b"), t("c")], "a")?.quedan).toBe(2)
  })

  test("keeps a missing plan as null", () => {
    expect(siguientePorFirmar([t("a"), t("b", "Federico", null)], "a")?.planeadaPara).toBeNull()
  })

  test("is null when nothing else waits", () => {
    expect(siguientePorFirmar([t("a")], "a")).toBeNull()
    expect(siguientePorFirmar([], "a")).toBeNull()
  })
})
