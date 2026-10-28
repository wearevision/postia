import { describe, expect, test } from "vitest"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { exigirEnv } from "@/lib/env"

describe("exigirEnv", () => {
  test("returns the trimmed value when the variable is set", () => {
    expect(exigirEnv("NEXT_PUBLIC_SUPABASE_URL", " http://127.0.0.1:54421 ")).toBe("http://127.0.0.1:54421")
  })

  test("throws a configuration error naming the variable when it is missing or blank", () => {
    expect(() => exigirEnv("SUPABASE_SERVICE_ROLE_KEY", undefined)).toThrow(FallaDeConfiguracion)
    expect(() => exigirEnv("SUPABASE_SERVICE_ROLE_KEY", "   ")).toThrow("SUPABASE_SERVICE_ROLE_KEY")
  })
})
