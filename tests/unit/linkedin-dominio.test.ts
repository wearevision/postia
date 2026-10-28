import { describe, expect, test } from "vitest"
import { aLittleText, enlaceDePost, esUrnDePost, tituloDelDocumento } from "@/lib/linkedin/dominio"

describe("aLittleText", () => {
  test("escapes LinkedIn's reserved characters and keeps hashtags as hashtags", () => {
    expect(aLittleText("Hola (mundo) #IA")).toBe("Hola \\(mundo\\) {hashtag|\\#|IA}")
  })
  test("leaves plain Spanish text untouched", () => {
    expect(aLittleText("¿Qué aprendí en 20 años? Mucho.")).toBe("¿Qué aprendí en 20 años? Mucho.")
  })
})

describe("post URNs", () => {
  test("accepts share and ugcPost URNs and builds the feed link", () => {
    expect(esUrnDePost("urn:li:share:7123")).toBe(true)
    expect(esUrnDePost("urn:li:ugcPost:7123")).toBe(true)
    expect(esUrnDePost("urn:li:person:abc")).toBe(false)
    expect(enlaceDePost("urn:li:share:7123")).toBe("https://www.linkedin.com/feed/update/urn:li:share:7123/")
  })
})

describe("tituloDelDocumento", () => {
  test("keeps one line and cuts past 100 characters at a word boundary", () => {
    expect(tituloDelDocumento("Tres  lecciones\nde un evento")).toBe("Tres lecciones de un evento")
    const largo = `${"palabra ".repeat(20)}fin`
    const titulo = tituloDelDocumento(largo)
    expect(titulo.length).toBeLessThanOrEqual(100)
    expect(titulo.endsWith("palabra")).toBe(true)
  })
})
