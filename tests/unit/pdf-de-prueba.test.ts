import { PDFDocument } from "pdf-lib"
import { describe, expect, test } from "vitest"
import { Falla } from "@/lib/dominio/falla"
import { pdfDePrueba, repartir } from "@/lib/fase0/pdf-de-prueba"

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

describe("repartir", () => {
  test("wraps by words without cutting any and keeps explicit line breaks", () => {
    const cabe = (linea: string) => linea.length <= 10
    expect(repartir("uno dos tres cuatro\ncinco", cabe)).toEqual(["uno dos", "tres", "cuatro", "cinco"])
  })
})
