import { createHash } from "node:crypto"
import { describe, expect, test } from "vitest"
import { sha256Hex } from "@/lib/piezas/hash-cliente"

describe("sha256Hex", () => {
  test("matches the hash Node computes for the same bytes", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.4\nhola")
    const archivo = {
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    }
    expect(await sha256Hex(archivo)).toBe(createHash("sha256").update(bytes).digest("hex"))
  })

  test("gives 64 lowercase hex characters, zero-padded", async () => {
    expect(await sha256Hex({ arrayBuffer: async () => new ArrayBuffer(0) })).toMatch(/^[0-9a-f]{64}$/)
  })
})
