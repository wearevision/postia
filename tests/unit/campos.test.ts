import { describe, expect, test } from "vitest"
import { aBorrador, CAMPOS, deBorrador } from "@/lib/plantillas/campos"
import { type Lamina, TIPOS_DE_LAMINA } from "@/lib/plantillas/laminas"

describe("editor fields", () => {
  test("every slide type has fields, and each field is a key of that type", () => {
    for (const tipo of TIPOS_DE_LAMINA) expect(CAMPOS[tipo].length).toBeGreaterThan(0)
  })

  test("a list draft is one item per line, empty lines dropped", () => {
    expect(deBorrador("lista", { titulo: "T", items: "uno\n\n dos \n" })).toEqual({
      tipo: "lista",
      titulo: "T",
      items: ["uno", "dos"],
    })
  })

  test("a table draft splits cells on |", () => {
    expect(deBorrador("comparacion", { titulo: "T", columnas: "A | B", filas: "c1 | sí | no\nc2|a|b" })).toEqual({
      tipo: "comparacion",
      titulo: "T",
      columnas: ["A", "B"],
      filas: [
        ["c1", "sí", "no"],
        ["c2", "a", "b"],
      ],
    })
  })

  test("a bars draft reads «etiqueta | valor» per line", () => {
    expect(deBorrador("barras", { titulo: "T", barras: "Uno | 40,0 %\nDos|65 %" })).toEqual({
      tipo: "barras",
      titulo: "T",
      barras: [
        { etiqueta: "Uno", valor: "40,0 %" },
        { etiqueta: "Dos", valor: "65 %" },
      ],
    })
  })

  test("a slide survives a round trip through its draft", () => {
    const ejemplos: Lamina[] = [
      { tipo: "portada", titulo: "T", bajada: "B" },
      { tipo: "punto", numero: "01", titulo: "T", cuerpo: "C" },
      { tipo: "lista", titulo: "T", items: ["a", "b"] },
      { tipo: "comparacion", titulo: "T", columnas: ["A", "B"], filas: [["x", "y", "z"]] },
      { tipo: "cifra", cifra: "40 %", etiqueta: "E", cuerpo: "C" },
      {
        tipo: "barras",
        titulo: "T",
        barras: [
          { etiqueta: "a", valor: "1 %" },
          { etiqueta: "b", valor: "2 %" },
        ],
      },
      { tipo: "frase", titulo: "F", nota: "N" },
      { tipo: "cierre", titulo: "T", cuerpo: "C", enlace: "wearevision.cl" },
    ]
    for (const l of ejemplos) expect(deBorrador(l.tipo, aBorrador(l))).toEqual(l)
  })
})
