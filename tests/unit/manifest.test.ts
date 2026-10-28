import { describe, expect, test } from "vitest"
import manifest from "@/app/manifest"

describe("manifest", () => {
  test("opens standalone from the home screen at Inicio, with a 512 px icon", () => {
    const m = manifest()
    expect(m.display).toBe("standalone")
    expect(m.start_url).toBe("/")
    expect(m.name).toBe("PostIA")
    expect(m.icons?.some((icono) => icono.sizes === "512x512")).toBe(true)
  })
})
