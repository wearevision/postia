import { describe, expect, test, vi } from "vitest"
import { type AuthDeIngreso, pedirCodigo, verificarCodigo } from "@/lib/ingreso/ingreso"

function auth(respuestas: Partial<Record<"otp" | "verificar", { message: string; status?: number; code?: string }>>) {
  return {
    signInWithOtp: vi.fn(async () => ({ error: respuestas.otp ?? null })),
    verifyOtp: vi.fn(async () => ({ error: respuestas.verificar ?? null })),
  } satisfies AuthDeIngreso
}

describe("pedirCodigo", () => {
  test("asks Supabase for a code without ever creating a user, with the address normalized", async () => {
    const fake = auth({})
    expect(await pedirCodigo({ auth: fake }, "  Federico@WAV.cl ")).toEqual({ ok: true })
    expect(fake.signInWithOtp).toHaveBeenCalledWith({ email: "federico@wav.cl", options: { shouldCreateUser: false } })
  })

  test("answers as if the code was sent when the address has no user", async () => {
    const fake = auth({ otp: { message: "Signups not allowed for otp", status: 422, code: "otp_disabled" } })
    expect(await pedirCodigo({ auth: fake }, "nadie@prueba.cl")).toEqual({ ok: true })
  })

  test("rejects a malformed address without calling Supabase", async () => {
    const fake = auth({})
    expect(await pedirCodigo({ auth: fake }, "sin-arroba")).toEqual({
      ok: false,
      error: "Revisa tu correo: le falta algo.",
    })
    expect(fake.signInWithOtp).not.toHaveBeenCalled()
  })

  test("tells how long to wait when rate limited", async () => {
    const fake = auth({ otp: { message: "you can only request this after 42 seconds", status: 429 } })
    expect(await pedirCodigo({ auth: fake }, "a@b.cl")).toEqual({
      ok: false,
      error: "Espera 42 segundos para pedir otro código.",
    })
  })
})

describe("verificarCodigo", () => {
  test("accepts exactly six digits and verifies them as an email code", async () => {
    const fake = auth({})
    expect(await verificarCodigo({ auth: fake }, "a@b.cl", " 123456 ")).toEqual({ ok: true })
    expect(fake.verifyOtp).toHaveBeenCalledWith({ email: "a@b.cl", token: "123456", type: "email" })
  })

  test("refuses anything that is not six digits without calling Supabase", async () => {
    const fake = auth({})
    expect(await verificarCodigo({ auth: fake }, "a@b.cl", "12345")).toEqual({
      ok: false,
      error: "El código tiene seis números.",
    })
    expect(fake.verifyOtp).not.toHaveBeenCalled()
  })

  test("says the code expired when Supabase rejects it", async () => {
    const fake = auth({ verificar: { message: "Token has expired or is invalid", status: 403, code: "otp_expired" } })
    expect(await verificarCodigo({ auth: fake }, "a@b.cl", "123456")).toEqual({
      ok: false,
      error: "Ese código no sirve o ya venció. Pide otro.",
    })
  })
})
