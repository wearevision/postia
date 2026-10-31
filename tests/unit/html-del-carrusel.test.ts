import { describe, expect, test } from "vitest"
import { htmlDelCarrusel } from "@/lib/plantillas/html"
import { carruselInicial } from "@/lib/plantillas/iniciales"
import type { Carrusel } from "@/lib/plantillas/laminas"
import { textoDeLasLaminas } from "@/lib/plantillas/texto"

const url = (archivo: string) => `data:font/woff2;base64,${archivo}`
const carrusel = carruselInicial("wav")

describe("htmlDelCarrusel", () => {
  test("one section per slide, the theme class on the body and a 1080x1350 page", () => {
    const html = htmlDelCarrusel({ tema: "wav-noche", ...carrusel }, url)
    expect(html.match(/<section class="slide /g)).toHaveLength(carrusel.laminas.length)
    expect(html).toContain('<body class="theme-wav-noche">')
    expect(html).toContain("@page { size: 1080px 1350px; margin: 0; }")
    expect(html).toContain("09 / 09")
  })

  test("keeps wr3's slide modifiers, which the themes' CSS targets", () => {
    const html = htmlDelCarrusel({ tema: "magenta", ...carrusel }, url)
    for (const tipo of ["cover", "point", "list", "compare", "stat", "bars", "statement", "cta"])
      expect(html).toContain(`<section class="slide slide--${tipo}">`)
  })

  test("escapes every text so a slide cannot inject markup", () => {
    const malo: Carrusel = {
      antetitulo: "<b>x</b>",
      laminas: [
        { tipo: "portada", titulo: '<img src=x onerror="alert(1)">', bajada: "a & b" },
        { tipo: "frase", titulo: "«cita»", nota: '"nota"' },
        { tipo: "cierre", titulo: "Fin", cuerpo: "c", enlace: "a.cl/<x>" },
      ],
    }
    const html = htmlDelCarrusel({ tema: "oscura", ...malo }, url)
    expect(html).not.toContain("<img src=x")
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;")
    expect(html).toContain("a &amp; b")
    expect(html).toContain("a.cl/<wbr>&lt;x&gt;")
  })

  test("loads the fonts through the given URLs and the personal serif only for the personal family", () => {
    expect(htmlDelCarrusel({ tema: "oscura", ...carrusel }, url)).not.toContain("instrument-serif")
    expect(htmlDelCarrusel({ tema: "personal-claro", ...carruselInicial("personal") }, url)).toContain(
      "data:font/woff2;base64,instrument-serif-latin-400-italic.woff2",
    )
  })

  test("the closing slide signs with the family's line and the WAV families carry the logo", () => {
    expect(htmlDelCarrusel({ tema: "papel", ...carrusel }, url)).toContain(
      "WAV Research · focus groups en Santiago de Chile",
    )
    expect(htmlDelCarrusel({ tema: "wav-papel", ...carrusel }, url)).toContain('id="wav-grad"')
  })

  test("a bar's width is its percentage and an empty step number is left out", () => {
    const html = htmlDelCarrusel({ tema: "oscura", ...carrusel }, url)
    expect(html).toContain('style="width:40%"')
    expect(html.match(/class="step"/g)).toHaveLength(1)
  })
})

describe("textoDeLasLaminas", () => {
  test("joins every text of every slide, for the client review", () => {
    const t = textoDeLasLaminas(carrusel)
    expect(t).toContain("Plantilla · Carrusel WAV")
    expect(t).toContain("Criterio cuatro")
    expect(t).toContain("Tercera etapa")
    expect(t).toContain("wearevision.cl")
  })
})
