import { describe, expect, test } from "vitest"
import { ALFABETO, codigoNuevo, conEnlace, enlaceDe, llevaElEnlace, quitarEnlace } from "@/lib/destino/enlace"

const URL = "https://wr3.wearevision.cl/guias/focus-group/"

describe("destination link", () => {
  test("handles the campaign by account type and puts the code last", () => {
    expect(enlaceDe({ url: URL, cuentaTipo: "persona", codigo: "k7m" })).toBe(
      `${URL}?utm_source=linkedin&utm_medium=social&utm_campaign=federico&utm_content=k7m`,
    )
    expect(enlaceDe({ url: URL, cuentaTipo: "empresa", codigo: "k7m" })).toContain("utm_campaign=wav&")
  })

  test("a new code has 3 characters of the alphabet, without 0/o or 1/l/i", () => {
    const codigos = Array.from({ length: 500 }, () => codigoNuevo())
    for (const c of codigos) expect(c).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]{3}$/)
    expect(ALFABETO).not.toMatch(/[01ilo]/)
  })

  test("conEnlace appends the link on its own line after a blank line", () => {
    expect(conEnlace("Hola\n", "https://x.cl/")).toBe("Hola\n\nhttps://x.cl/")
  })

  test("quitarEnlace removes the old link wherever it is and the blank lines it leaves at the end", () => {
    expect(quitarEnlace("Hola\n\nhttps://x.cl/", "https://x.cl/")).toBe("Hola")
    expect(quitarEnlace("Hola\nhttps://x.cl/\nchao", "https://x.cl/")).toBe("Hola\nchao")
    expect(quitarEnlace("Hola", "https://x.cl/")).toBe("Hola")
  })

  test("llevaElEnlace looks for the reference code in the text", () => {
    expect(llevaElEnlace(`Hola\n\n${URL}?utm_content=k7m`, "k7m")).toBe(true)
    expect(llevaElEnlace("Hola", "k7m")).toBe(false)
  })
})
