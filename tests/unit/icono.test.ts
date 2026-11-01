import { readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"
import { SVG_DEL_ICONO, srcDelIcono } from "@/lib/diseno/icono"

describe("the home-screen icon", () => {
  test("is Federico's design in docs/logo/postia-icono.svg, line for line", () => {
    const archivo = readFileSync("docs/logo/postia-icono.svg", "utf8").trim().split("\n")
    expect(SVG_DEL_ICONO).toBe(archivo.join(""))
  })

  test("is square and fills its whole canvas with an opaque background, as iOS asks", () => {
    expect(SVG_DEL_ICONO).toMatch(/viewBox="0 0 1024 1024"/)
    expect(SVG_DEL_ICONO).toMatch(/<rect id="fondo" width="1024" height="1024" fill="#ffffff"\/>/)
  })

  test("draws the magenta bubble and the whole «PostIA» wordmark, with no CSS classes left from Illustrator", () => {
    expect(SVG_DEL_ICONO).toMatch(/<path id="burbuja"[^>]*stroke="#ff00aa"/)
    expect(SVG_DEL_ICONO).toContain('<g id="Post">')
    expect(SVG_DEL_ICONO).toContain('<g id="IA">')
    expect(SVG_DEL_ICONO).not.toContain("class=")
  })

  test("is ASCII only, so btoa can encode it in the Worker", () => {
    expect(SVG_DEL_ICONO).toMatch(/^[\x20-\x7e]*$/)
  })

  test("travels as a data URI that next/og can draw", () => {
    expect(srcDelIcono()).toBe(`data:image/svg+xml;base64,${Buffer.from(SVG_DEL_ICONO).toString("base64")}`)
  })
})
