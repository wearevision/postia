import { describe, expect, test } from "vitest"
import { type Hojas, leerExportacion } from "@/lib/rendimiento/exportacion"

const URL_SHARE = "https://www.linkedin.com/posts/federico_a-veces-share-7395845008874020865-luFZ"
const URL_UGC = "https://www.linkedin.com/posts/federico_hackathon-ugcPost-7396634456431751170-EffQ"

function hojas(cambios: Partial<Hojas> = {}): Hojas {
  return {
    DESCUBRIMIENTO: [
      ["Rendimiento general", "10/11/2025 - 9/11/2026"],
      ["Impresiones", "3663"],
    ],
    INTERACCIÓN: [
      ["Fecha", "Impresiones", "Interacciones"],
      ["10/11/2025", "0", "0"],
      ["16/11/2025", 962, 18],
    ],
    SEGUIDORES: [
      ["Total de seguidores el 9/11/2026", 3448],
      ["", ""],
      ["Fecha", "Nuevos seguidores"],
      ["16/11/2025", "4"],
    ],
    "PUBLICACIONES PRINCIPALES": [
      ["Esta lista puede incluir 50 publicaciones"],
      [],
      [
        "URL de la publicación",
        "Fecha de publicación",
        "Interacciones",
        "",
        "URL de la publicación",
        "Fecha de publicación",
        "Impresiones",
      ],
      [URL_SHARE, "16/11/2025", "18", "", URL_SHARE, "16/11/2025", "962"],
      ["", "", "", "", URL_UGC, "18/11/2025", "337"],
    ],
    "INFORMACIÓN DETALLADA DEL PÚBLI": [
      ["Información detallada principal", "Valor", "Porcentaje"],
      ["Empresa", "CCU", "< 1 %"],
      ["Cargo", "Gerente de marketing", "3 %"],
    ],
    "INFORMACIÓN DETALLADA DEL CONTE": [
      ["Información detallada principal", "Valor", "Porcentaje"],
      ["Empresa", "MGC Global Group", "4 %"],
    ],
    ...cambios,
  }
}

describe("leerExportacion", () => {
  test("reads the period, the followers total and each post's URN with its figures", () => {
    const r = leerExportacion(hojas())
    if (!r.ok) throw new Error(r.error)
    expect(r.desde).toBe("2025-11-10")
    expect(r.hasta).toBe("2026-11-09")
    expect(r.seguidoresTotal).toBe(3448)
    expect(r.publicaciones).toEqual([
      { postUrn: "urn:li:share:7395845008874020865", publicadaEl: "2025-11-16", interacciones: 18, impresiones: 962 },
      {
        postUrn: "urn:li:ugcPost:7396634456431751170",
        publicadaEl: "2025-11-18",
        interacciones: null,
        impresiones: 337,
      },
    ])
  })

  test("joins the daily figures with the new followers of the same day", () => {
    const r = leerExportacion(hojas())
    if (!r.ok) throw new Error(r.error)
    expect(r.dias).toEqual([
      { dia: "2025-11-10", impresiones: 0, interacciones: 0, seguidoresNuevos: null },
      { dia: "2025-11-16", impresiones: 962, interacciones: 18, seguidoresNuevos: 4 },
    ])
  })

  test("keeps the audience of followers and of viewers, with «< 1 %» as below one, not zero", () => {
    const r = leerExportacion(hojas())
    if (!r.ok) throw new Error(r.error)
    expect(r.publico).toEqual([
      { tipo: "publico", categoria: "Empresa", valor: "CCU", porcentaje: null, menorAUno: true },
      { tipo: "publico", categoria: "Cargo", valor: "Gerente de marketing", porcentaje: 3, menorAUno: false },
      { tipo: "contenido", categoria: "Empresa", valor: "MGC Global Group", porcentaje: 4, menorAUno: false },
    ])
  })

  test("a post URL with no share or ugcPost id is counted, not guessed", () => {
    const r = leerExportacion(
      hojas({
        "PUBLICACIONES PRINCIPALES": [
          [],
          [],
          ["URL de la publicación"],
          ["https://www.linkedin.com/posts/federico_algo-activity-1-x", "16/11/2025", "3", "", "", "", ""],
        ],
      }),
    )
    if (!r.ok) throw new Error(r.error)
    expect(r.publicaciones).toEqual([])
    expect(r.sinIdentificar).toBe(1)
  })

  test("a file that is not LinkedIn's export says so in Spanish", () => {
    expect(leerExportacion({ Hoja1: [["a", "b"]] })).toEqual({
      ok: false,
      error: "Ese archivo no es la exportación de estadísticas de LinkedIn. Descárgalo desde Analytics de tu perfil.",
    })
  })

  test("a missing sheet is named", () => {
    const { SEGUIDORES: _, ...sinSeguidores } = hojas()
    expect(leerExportacion(sinSeguidores)).toEqual({ ok: false, error: "Al archivo le falta la hoja «SEGUIDORES»." })
  })
})
