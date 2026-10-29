import { describe, expect, test } from "vitest"
import { mismaClave } from "@/lib/avisos/navegador"

// 4 bytes: 1,2,3,4 -> base64url "AQIDBA"
const CLAVE = "AQIDBA"

function buffer(bytes: number[]): ArrayBuffer {
  return Uint8Array.from(bytes).buffer
}

describe("mismaClave", () => {
  test("matches when the subscription key has the same bytes as the server key", () => {
    expect(mismaClave(buffer([1, 2, 3, 4]), CLAVE)).toBe(true)
  })

  test("does not match when the subscription was made with another key", () => {
    expect(mismaClave(buffer([9, 2, 3, 4]), CLAVE)).toBe(false)
  })

  test("does not match when the key has a different length", () => {
    expect(mismaClave(buffer([1, 2, 3]), CLAVE)).toBe(false)
  })

  test("does not match when the browser hides the subscription key", () => {
    expect(mismaClave(null, CLAVE)).toBe(false)
  })
})
