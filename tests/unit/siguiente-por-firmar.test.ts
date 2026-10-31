import { describe, expect, test } from "vitest"
import { siguientePorFirmar } from "@/lib/piezas/siguiente"

const t = (id: string) => ({ id })

describe("siguientePorFirmar", () => {
  test("is the first piece waiting for a signature other than this one", () => {
    expect(siguientePorFirmar([t("a"), t("b"), t("c")], "a")).toBe("b")
    expect(siguientePorFirmar([t("a"), t("b")], "b")).toBe("a")
  })

  test("is null when nothing else waits", () => {
    expect(siguientePorFirmar([t("a")], "a")).toBeNull()
    expect(siguientePorFirmar([], "a")).toBeNull()
  })
})
