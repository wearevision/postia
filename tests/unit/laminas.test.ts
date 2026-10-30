import { describe, expect, test } from "vitest"
import { type Carrusel, revisarCarrusel } from "@/lib/plantillas/laminas"

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
