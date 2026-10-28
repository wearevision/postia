import { PDFDocument } from "pdf-lib"
import { describe, expect, test } from "vitest"
import { Falla } from "@/lib/dominio/falla"
import { leerPdf, pdfDePrueba, repartir } from "@/lib/fase0/pdf-de-prueba"

describe("pdfDePrueba", () => {
  test("makes one 1080×1350 page per slide, with Spanish accents", async () => {
    const pdf = await PDFDocument.load(await pdfDePrueba(["Primera lámina", "Señal: ¿qué aprendí?"]))
    expect(pdf.getPageCount()).toBe(2)
    expect(pdf.getPage(0).getSize()).toEqual({ width: 1080, height: 1350 })
  })
  test("refuses an empty carousel", async () => {
    await expect(pdfDePrueba([])).rejects.toBeInstanceOf(Falla)
  })
})

describe("leerPdf", () => {
  test("accepts a finished carousel PDF and counts its pages", async () => {
    const datos = await pdfDePrueba(["Uno", "Dos", "Tres"])
    expect(await leerPdf(datos)).toEqual({ datos, paginas: 3 })
  })
  test("refuses a file that is not a PDF", async () => {
    await expect(leerPdf(new TextEncoder().encode("no soy un pdf"))).rejects.toBeInstanceOf(Falla)
  })
})

describe("repartir", () => {
  test("wraps by words without cutting any and keeps explicit line breaks", () => {
    const cabe = (linea: string) => linea.length <= 10
    expect(repartir("uno dos tres cuatro\ncinco", cabe)).toEqual(["uno dos", "tres", "cuatro", "cinco"])
  })
})
