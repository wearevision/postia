import { describe, expect, test } from "vitest"
import { type Carrusel, LIMITES, revisarCarrusel } from "@/lib/plantillas/laminas"

const portada = {
  tipo: "portada",
  titulo: "Qué aprendimos en cien focus groups",
  bajada: "Lo que se lleva quien llega al final.",
}
const cierre = {
  tipo: "cierre",
  titulo: "Conversemos",
  cuerpo: "Treinta minutos para tu próximo estudio.",
  enlace: "wearevision.cl",
}
const punto = { tipo: "punto", numero: "01", titulo: "Escuchar antes de decidir", cuerpo: "Una sola idea por lámina." }
const base = (laminas: unknown[]) => ({ antetitulo: "Carrusel WAV", laminas })

describe("revisarCarrusel", () => {
  test("accepts a carousel that opens with a cover and ends with a closing slide", () => {
    const r = revisarCarrusel(base([portada, punto, cierre]))
    expect(r.ok).toBe(true)
  })

  test("refuses fewer than 3 or more than 10 slides", () => {
    expect(revisarCarrusel(base([portada, cierre]))).toEqual({
      ok: false,
      error: "Un carrusel lleva de 3 a 10 láminas.",
    })
    const once = [portada, ...Array.from({ length: 9 }, () => punto), cierre]
    expect(revisarCarrusel(base(once))).toEqual({ ok: false, error: "Un carrusel lleva de 3 a 10 láminas." })
  })

  test("refuses a carousel that does not open with a cover or close with a closing slide", () => {
    expect(revisarCarrusel(base([punto, punto, cierre]))).toEqual({
      ok: false,
      error: "La primera lámina es la portada.",
    })
    expect(revisarCarrusel(base([portada, punto, punto]))).toEqual({
      ok: false,
      error: "La última lámina es el cierre.",
    })
  })

  test("names the slide and the field when a field is too long", () => {
    const largo = { ...punto, titulo: "una dos tres cuatro cinco seis siete ocho nueve diez once doce trece" }
    expect(revisarCarrusel(base([portada, largo, cierre]))).toEqual({
      ok: false,
      error: "Lámina 2: El título pasa las 12 palabras.",
    })
  })

  test("refuses a glyph the Latin fonts do not have", () => {
    const emoji = { ...punto, cuerpo: "Escuchar 🎧" }
    expect(revisarCarrusel(base([portada, emoji, cierre]))).toEqual({
      ok: false,
      error: "Lámina 2: El cuerpo tiene un carácter que las fuentes no tienen.",
    })
  })

  test("accepts Spanish punctuation and accents", () => {
    const tildes = { ...punto, cuerpo: "¿Por qué? «Así» — sí: niño, acción…" }
    expect(revisarCarrusel(base([portada, tildes, cierre])).ok).toBe(true)
  })

  test("checks every slide type's structure", () => {
    const lista = { tipo: "lista", titulo: "Tres puntos", items: ["uno"] }
    expect(revisarCarrusel(base([portada, lista, cierre]))).toEqual({
      ok: false,
      error: "Lámina 2: Una lista lleva de 2 a 4 puntos.",
    })
    const tabla = { tipo: "comparacion", titulo: "A o B", columnas: ["A", "B"], filas: [["criterio", "sí"]] }
    expect(revisarCarrusel(base([portada, tabla, cierre]))).toEqual({
      ok: false,
      error: "Lámina 2: Cada fila lleva 3 celdas separadas por «|».",
    })
    const barras = {
      tipo: "barras",
      titulo: "Escala",
      barras: [
        { etiqueta: "A", valor: "40 %" },
        { etiqueta: "B", valor: "140 %" },
      ],
    }
    expect(revisarCarrusel(base([portada, barras, cierre]))).toEqual({
      ok: false,
      error: "Lámina 2: Cada barra lleva un porcentaje entre 0 y 100, como «40,0 %».",
    })
  })

  test("trims every text and keeps an empty step number as empty", () => {
    const r = revisarCarrusel(base([{ ...portada, titulo: "  Título  " }, { ...punto, numero: "" }, cierre]))
    expect(r.ok && (r.carrusel as Carrusel).laminas[0]).toMatchObject({ titulo: "Título" })
    expect(r.ok && (r.carrusel as Carrusel).laminas[1]).toMatchObject({ numero: "" })
  })

  test("refuses a link with spaces in the closing slide", () => {
    const malo = { ...cierre, enlace: "wear evision.cl" }
    expect(revisarCarrusel(base([portada, punto, malo]))).toEqual({
      ok: false,
      error: "Lámina 3: El enlace va sin espacios, como «wearevision.cl».",
    })
  })
})

describe("fuente", () => {
  const cifra = { tipo: "cifra", cifra: "40 %", etiqueta: "Qué mide", cuerpo: "De dónde sale." }

  test("is optional on data slides: absent or empty means no source line", () => {
    expect(revisarCarrusel(base([portada, cifra, cierre])).ok).toBe(true)
    const r = revisarCarrusel(base([portada, { ...cifra, fuente: "" }, cierre]))
    expect(r.ok && (r.carrusel as Carrusel).laminas[1]).toMatchObject({ fuente: "" })
  })

  test("keeps a trimmed outlet and year on every data slide type", () => {
    const lista = { tipo: "lista", titulo: "T", items: ["a", "b"] }
    const comparacion = { tipo: "comparacion", titulo: "T", columnas: ["A", "B"], filas: [["x", "y", "z"]] }
    const barras = {
      tipo: "barras",
      titulo: "T",
      barras: [
        { etiqueta: "a", valor: "1 %" },
        { etiqueta: "b", valor: "2 %" },
      ],
    }
    const frase = { tipo: "frase", titulo: "F", nota: "N" }
    for (const l of [punto, lista, comparacion, cifra, barras, frase]) {
      const r = revisarCarrusel(base([portada, { ...l, fuente: "  Social Science & Medicine, 2022 " }, cierre]))
      expect(r.ok && (r.carrusel as Carrusel).laminas[1]).toMatchObject({ fuente: "Social Science & Medicine, 2022" })
    }
  })

  test("is not a field of the cover or the closing slide", () => {
    const r = revisarCarrusel(base([{ ...portada, fuente: "Field Methods, 2006" }, punto, cierre]))
    expect(r.ok && "fuente" in (r.carrusel as Carrusel).laminas[0]).toBe(false)
  })

  test("refuses spaces only, a link, too many words or characters and foreign glyphs", () => {
    const con = (fuente: string) => revisarCarrusel(base([portada, { ...cifra, fuente }, cierre]))
    expect(con("   ")).toEqual({ ok: false, error: "Lámina 2: La fuente está en blanco." })
    for (const enlace of ["https://doi.org/10.1", "www.nature.com", "Ver http://x.cl"])
      expect(con(enlace)).toEqual({ ok: false, error: "Lámina 2: La fuente va sin enlaces: medio y año." })
    expect(con("uno dos tres cuatro cinco seis siete ocho nueve")).toEqual({
      ok: false,
      error: `Lámina 2: La fuente pasa las ${LIMITES.fuente.palabras} palabras.`,
    })
    expect(con("x".repeat(LIMITES.fuente.caracteres + 1))).toEqual({
      ok: false,
      error: `Lámina 2: La fuente pasa los ${LIMITES.fuente.caracteres} caracteres.`,
    })
    expect(con("Revista 日本, 2020")).toEqual({
      ok: false,
      error: "Lámina 2: La fuente tiene un carácter que las fuentes no tienen.",
    })
  })
})

describe("LIMITES", () => {
  test("holds every slide field's limits as data", () => {
    expect(LIMITES.punto.titulo).toEqual({ palabras: 12, caracteres: 90 })
    expect(LIMITES.lista.items).toEqual({ minimo: 2, maximo: 4, palabras: 10, caracteres: 80 })
    expect(LIMITES.carrusel).toEqual({ minimo: 3, maximo: 10 })
    expect(LIMITES.fuente).toEqual({ palabras: 8, caracteres: 60 })
  })

  test("drives the schema: a title one word over the table's limit is refused", () => {
    const palabras = Array.from({ length: LIMITES.punto.titulo.palabras + 1 }, () => "uno").join(" ")
    expect(revisarCarrusel(base([portada, { ...punto, titulo: palabras }, cierre]))).toEqual({
      ok: false,
      error: `Lámina 2: El título pasa las ${LIMITES.punto.titulo.palabras} palabras.`,
    })
    const justo = Array.from({ length: LIMITES.punto.titulo.palabras }, () => "uno").join(" ")
    expect(revisarCarrusel(base([portada, { ...punto, titulo: justo }, cierre])).ok).toBe(true)
  })
})
