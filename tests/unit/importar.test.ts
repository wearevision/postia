import { describe, expect, test } from "vitest"
import { Falla } from "@/lib/dominio/falla"
import { leerCopy } from "@/lib/piezas/importar"

const ENCABEZADO = "# Copy de LinkedIn por guía\n\nReemplaza [link] por la URL de la guía.\n\n"

const UNA = `## 1. ¿Qué es un focus group?

PDF: 01-que-es.pdf
Guía: https://wr3.wearevision.cl/guias/que-es/

Primer párrafo.

Segundo párrafo con guía:
[link]

#FocusGroup #Marketing

---
`

const OTRA = `## 2. Cómo hacer uno en 7 pasos

PDF: 02-como.pdf
Guía: https://wr3.wearevision.cl/guias/como/

1. Uno.
2. Dos.

Mira [link] y también [link].
`

describe("leerCopy", () => {
  test("reads each entry with title, pdf, guide and text when the file follows the real format", () => {
    const entradas = leerCopy(ENCABEZADO + UNA + "\n" + OTRA)
    expect(entradas).toHaveLength(2)
    expect(entradas[0]).toEqual({
      titulo: "¿Qué es un focus group?",
      pdf: "01-que-es.pdf",
      guia: "https://wr3.wearevision.cl/guias/que-es/",
      texto:
        "Primer párrafo.\n\nSegundo párrafo con guía:\nhttps://wr3.wearevision.cl/guias/que-es/\n\n#FocusGroup #Marketing",
    })
    expect(entradas[1]?.titulo).toBe("Cómo hacer uno en 7 pasos")
  })

  test("replaces every [link] and keeps the last entry that has no closing separator", () => {
    const [entrada] = leerCopy(ENCABEZADO + OTRA)
    expect(entrada?.texto).toBe(
      "1. Uno.\n2. Dos.\n\nMira https://wr3.wearevision.cl/guias/como/ y también https://wr3.wearevision.cl/guias/como/.",
    )
  })

  test("leaves out the PDF and guide lines from the text", () => {
    const [entrada] = leerCopy(ENCABEZADO + UNA)
    expect(entrada?.texto).not.toContain("PDF:")
    expect(entrada?.texto).not.toContain("Guía:")
  })

  test("throws a Falla naming the entry when it has no PDF line", () => {
    const sinPdf = "## 1. Sin archivo\n\nGuía: https://x.cl/g/\n\nTexto [link]\n"
    expect(() => leerCopy(sinPdf)).toThrow(Falla)
    expect(() => leerCopy(sinPdf)).toThrow(/Sin archivo/)
  })

  test("throws a Falla when the entry has no guide line to fill [link]", () => {
    const sinGuia = "## 1. Sin guía\n\nPDF: a.pdf\n\nTexto [link]\n"
    expect(() => leerCopy(sinGuia)).toThrow(Falla)
  })

  test("throws a Falla when the title passes LinkedIn's 100 characters", () => {
    const largo = `## 1. ${"a".repeat(101)}\n\nPDF: a.pdf\nGuía: https://x.cl/g/\n\nTexto\n`
    expect(() => leerCopy(largo)).toThrow(Falla)
  })

  test("throws a Falla when the text is empty after removing the metadata", () => {
    expect(() => leerCopy("## 1. Vacío\n\nPDF: a.pdf\nGuía: https://x.cl/g/\n")).toThrow(Falla)
  })

  test("throws a Falla when the text passes LinkedIn's 3000 characters", () => {
    const largo = `## 1. Largo\n\nPDF: a.pdf\nGuía: https://x.cl/g/\n\n${"a".repeat(3001)}\n`
    expect(() => leerCopy(largo)).toThrow(Falla)
  })

  test("throws a Falla when the file has no entries", () => {
    expect(() => leerCopy(ENCABEZADO)).toThrow(Falla)
  })
})
