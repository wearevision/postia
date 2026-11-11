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

  test("quitarEnlace removes the link line by its code and the blank lines it leaves at the end", () => {
    const enlace = `${URL}?utm_content=k7m`
    expect(quitarEnlace(`Hola\n\n${enlace}`, "k7m")).toBe("Hola")
    expect(quitarEnlace(`Hola\n${enlace}\nchao`, "k7m")).toBe("Hola\nchao")
    expect(quitarEnlace("Hola", "k7m")).toBe("Hola")
  })

  test("quitarEnlace removes the link when it was moved into a sentence or edited", () => {
    expect(quitarEnlace(`Lee la guía ${URL}?utm_content=k7m y cuéntame.`, "k7m")).toBe("Lee la guía y cuéntame.")
    expect(quitarEnlace(`Lee: ${URL}?utm_source=x&utm_content=k7m&ref=1\n\n`, "k7m")).toBe("Lee:")
    expect(quitarEnlace(`Hola\n\nhttps://wr3.wearevision.cl/otra/?utm_content=k7m\n\n`, "k7m")).toBe("Hola")
  })

  test("quitarEnlace leaves links with another code alone", () => {
    expect(quitarEnlace(`Hola ${URL}?utm_content=abc`, "k7m")).toBe(`Hola ${URL}?utm_content=abc`)
  })

  test("llevaElEnlace needs the destination URL and the reference code in the same link", () => {
    expect(llevaElEnlace(`Hola\n\n${URL}?utm_content=k7m`, URL, "k7m")).toBe(true)
    expect(llevaElEnlace(`Lee ${URL}?utm_source=linkedin&utm_content=k7m.`, URL, "k7m")).toBe(true)
    expect(llevaElEnlace("Hola", URL, "k7m")).toBe(false)
  })

  test("llevaElEnlace refuses the code alone or the code on another page", () => {
    expect(llevaElEnlace("Hola utm_content=k7m", URL, "k7m")).toBe(false)
    expect(llevaElEnlace("Hola https://wr3.wearevision.cl/?utm_content=k7m", URL, "k7m")).toBe(false)
    expect(llevaElEnlace(`Hola ${URL} y https://x.cl/?utm_content=k7m`, URL, "k7m")).toBe(false)
  })
})
