import { PDFDocument } from "pdf-lib"
import { type Browser, chromium } from "playwright"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { fuentesEmbebidas } from "@/lib/carrusel/fuentes"
import { renderizarCarrusel } from "@/lib/carrusel/render"
import { Falla } from "@/lib/dominio/falla"
import { htmlDelCarrusel } from "@/lib/plantillas/html"
import { carruselInicial } from "@/lib/plantillas/iniciales"
import { familiaDe, IDS_DE_TEMA } from "@/lib/plantillas/temas"

/** Width and height from a JPEG's first SOF marker. */
function medidas(jpeg: Uint8Array): { ancho: number; alto: number } {
  let i = 2
  while (i < jpeg.length) {
    const marcador = jpeg[i + 1] ?? 0
    const largo = ((jpeg[i + 2] ?? 0) << 8) + (jpeg[i + 3] ?? 0)
    if (marcador >= 0xc0 && marcador <= 0xc3)
      return {
        alto: ((jpeg[i + 5] ?? 0) << 8) + (jpeg[i + 6] ?? 0),
        ancho: ((jpeg[i + 7] ?? 0) << 8) + (jpeg[i + 8] ?? 0),
      }
    i += 2 + largo
  }
  throw new Error("JPEG sin SOF")
}

let navegador: Browser
beforeAll(async () => {
  navegador = await chromium.launch()
})
afterAll(async () => {
  await navegador.close()
})

describe("renderizarCarrusel", () => {
  test("every theme renders the default carousel: one 810x1012.5 pt page (as Chromium rounds it) and one 2160x2700 JPEG per slide", async () => {
    const fuente = await fuentesEmbebidas()
    for (const tema of IDS_DE_TEMA) {
      const c = carruselInicial(familiaDe(tema))
      const r = await renderizarCarrusel(navegador, htmlDelCarrusel({ tema, ...c }, fuente))
      const pdf = await PDFDocument.load(r.pdf)
      expect(pdf.getPageCount(), tema).toBe(c.laminas.length)
      // Chromium quantizes PDF page sizes: 1350 px (1012.5 pt) prints as 1013.04 pt, with no CSS or pdf() option
      // that avoids it. wr3-web's reference PDFs measure the same.
      const { width, height } = pdf.getPage(0).getSize()
      expect(width, tema).toBe(810)
      expect(height, tema).toBeGreaterThanOrEqual(1012.5)
      expect(height, tema).toBeLessThan(1013.5)
      expect(r.vistas, tema).toHaveLength(c.laminas.length)
      expect(medidas(r.vistas[0] as Uint8Array), tema).toEqual({ ancho: 2160, alto: 2700 })
      expect(new TextDecoder().decode(r.pdf.slice(0, 5))).toBe("%PDF-")
    }
  })

  test("refuses a slide whose text does not fit, naming it", async () => {
    // The schema's limits make overflow rare, so inject it: the first .note is the 8th slide (frase).
    const html = htmlDelCarrusel({ tema: "wav-noche", ...carruselInicial("wav") }, await fuentesEmbebidas()).replace(
      '<p class="note">',
      `<p class="note">${"desborde ".repeat(400)}`,
    )
    await expect(renderizarCarrusel(navegador, html)).rejects.toThrow(
      new Falla("La lámina 8 no cabe. Acórtala o divídela en dos."),
    )
  })

  test("fails when a font did not load instead of rendering with a fallback", async () => {
    const html = htmlDelCarrusel({ tema: "oscura", ...carruselInicial("wr3") }, () => "data:font/woff2;base64,AAAA")
    await expect(renderizarCarrusel(navegador, html)).rejects.toThrow(/fuente/)
  })
})
