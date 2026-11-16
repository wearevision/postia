import { describe, expect, test } from "vitest"
import { ALFABETO, codigoNuevo, conEnlace, enlaceDe, llevaElEnlace, quitarEnlace } from "@/lib/destino/enlace"

const URL = "https://research.wearevision.cl/guias/focus-group/"

describe("destination link", () => {
  test("is the page with only the reference code, short enough to read in a post", () => {
    expect(enlaceDe({ url: URL, codigo: "k7m" })).toBe(`${URL}?ref=k7m`)
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
    expect(quitarEnlace(`Hola\n\nhttps://research.wearevision.cl/otra/?utm_content=k7m\n\n`, "k7m")).toBe("Hola")
  })

  test("quitarEnlace removes the short ?ref= link as well as the old UTM one", () => {
    expect(quitarEnlace(`Hola\n\n${URL}?ref=k7m`, "k7m")).toBe("Hola")
    expect(quitarEnlace(`Lee ${URL}?ref=k7m y cuéntame.`, "k7m")).toBe("Lee y cuéntame.")
    expect(quitarEnlace(`Hola ${URL}?ref=abc`, "k7m")).toBe(`Hola ${URL}?ref=abc`)
  })

  test("quitarEnlace leaves links with another code alone", () => {
    expect(quitarEnlace(`Hola ${URL}?utm_content=abc`, "k7m")).toBe(`Hola ${URL}?utm_content=abc`)
  })

  test("llevaElEnlace needs the destination URL and the reference code in the same link", () => {
    expect(llevaElEnlace(`Hola\n\n${URL}?utm_content=k7m`, URL, "k7m")).toBe(true)
    expect(llevaElEnlace(`Lee ${URL}?utm_source=linkedin&utm_content=k7m.`, URL, "k7m")).toBe(true)
    expect(llevaElEnlace("Hola", URL, "k7m")).toBe(false)
  })

  test("llevaElEnlace accepts the short ?ref= link and the old UTM one, but not a longer code", () => {
    expect(llevaElEnlace(`Hola\n\n${URL}?ref=k7m`, URL, "k7m")).toBe(true)
    expect(llevaElEnlace(`Hola ${URL}?ref=k7mm`, URL, "k7m")).toBe(false)
    expect(llevaElEnlace(`Hola ${URL}?ref=abc`, URL, "k7m")).toBe(false)
  })

  test("llevaElEnlace refuses the code alone or the code on another page", () => {
    expect(llevaElEnlace("Hola utm_content=k7m", URL, "k7m")).toBe(false)
    expect(llevaElEnlace("Hola https://research.wearevision.cl/?utm_content=k7m", URL, "k7m")).toBe(false)
    expect(llevaElEnlace(`Hola ${URL} y https://x.cl/?utm_content=k7m`, URL, "k7m")).toBe(false)
  })
})
