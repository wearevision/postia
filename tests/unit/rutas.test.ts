import { describe, expect, test } from "vitest"
import { destinoDe } from "@/lib/sesion/rutas"

describe("destinoDe", () => {
  test("sends someone without a session to sign-in from any app route", () => {
    expect(destinoDe("/", false)).toBe("/ingreso")
    expect(destinoDe("/marcas", false)).toBe("/ingreso")
    expect(destinoDe("/api/linkedin/callback", false)).toBe("/ingreso")
  })

  test("lets someone without a session see sign-in", () => {
    expect(destinoDe("/ingreso", false)).toBeNull()
  })

  test("sends someone already signed in away from sign-in", () => {
    expect(destinoDe("/ingreso", true)).toBe("/")
    expect(destinoDe("/marcas", true)).toBeNull()
  })
})
