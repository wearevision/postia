import { describe, expect, test } from "vitest"
import { bloqueoDeFirma, DISENO_ILEGIBLE, SIN_LAMINAS } from "@/lib/piezas/bloqueo"

describe("bloqueoDeFirma", () => {
  test("lets a carousel be signed when every slide preview is present", () => {
    expect(bloqueoDeFirma({ formato: "carrusel_pdf", laminasEsperadas: 3, vistas: 3 })).toBeNull()
  })

  test("blocks a carousel when one slide preview is missing", () => {
    expect(bloqueoDeFirma({ formato: "carrusel_pdf", laminasEsperadas: 3, vistas: 2 })).toBe(SIN_LAMINAS)
  })

  test("blocks a carousel when storage failed and no preview came back", () => {
    expect(bloqueoDeFirma({ formato: "carrusel_pdf", laminasEsperadas: 5, vistas: 0 })).toBe(SIN_LAMINAS)
  })

  test("blocks an uploaded PDF without a design, whose slide count is unknown", () => {
    expect(bloqueoDeFirma({ formato: "carrusel_pdf", laminasEsperadas: null, vistas: 0 })).toBe(SIN_LAMINAS)
  })

  test("never blocks a text piece", () => {
    expect(bloqueoDeFirma({ formato: "texto", laminasEsperadas: null, vistas: 0 })).toBeNull()
  })

  test("says why in the words shown next to the button", () => {
    expect(SIN_LAMINAS).toBe("No pude mostrar las láminas. Recarga o revisa el PDF; no se puede firmar sin verlas.")
  })

  test("blocks a carousel when its render requests could not be read: a rebuild may be in progress", () => {
    expect(bloqueoDeFirma({ formato: "carrusel_pdf", laminasEsperadas: 3, vistas: 3, disenoIlegible: true })).toBe(
      DISENO_ILEGIBLE,
    )
    expect(DISENO_ILEGIBLE).toBe("No pude leer si se está armando el carrusel. Recarga en un rato.")
  })
})
