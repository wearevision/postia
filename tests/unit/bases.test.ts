import { describe, expect, test } from "vitest"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { baseDe } from "@/lib/proveedores/bases"

describe("baseDe", () => {
  test("uses the default when there is no override", () => {
    expect(baseDe({}, "LINKEDIN_API_BASE_URL", "https://api.linkedin.com")).toBe("https://api.linkedin.com")
  })
  test("uses a local override without its trailing slash", () => {
    expect(baseDe({ LINKEDIN_API_BASE_URL: "http://127.0.0.1:9999/" }, "LINKEDIN_API_BASE_URL", "x")).toBe(
      "http://127.0.0.1:9999",
    )
  })
  test("refuses an override on Vercel or in a production build, where the token would travel there", () => {
    expect(() => baseDe({ LINKEDIN_API_BASE_URL: "http://a", VERCEL: "1" }, "LINKEDIN_API_BASE_URL", "x")).toThrow(
      FallaDeConfiguracion,
    )
    expect(() =>
      baseDe({ LINKEDIN_API_BASE_URL: "http://a", NODE_ENV: "production" }, "LINKEDIN_API_BASE_URL", "x"),
    ).toThrow(FallaDeConfiguracion)
  })
})
