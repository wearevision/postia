import { describe, expect, test } from "vitest"
import { type Hojas, leerExportacion } from "@/lib/rendimiento/exportacion"
import { leerArchivosDeLinkedin, leerExportacionDePagina } from "@/lib/rendimiento/exportacion-pagina"

const ENLACE = "https://www.linkedin.com/feed/update/urn:li:activity:7396634456431751170"

const CABECERA_METRICAS = [
  "Date",
  "Impressions (organic)",
  "Impressions (sponsored)",
  "Impressions (total)",
  "Clicks (total)",
  "Reactions (total)",
  "Comments (total)",
  "Reposts (total)",
]

const CABECERA_POSTS = [
  "Post title",
  "Post link",
  "Post type",
  "Created date",
  "Impressions",
  "Clicks",
  "Likes",
  "Comments",
  "Reposts",
  "Follows",
]

function contenido(): Hojas {
  return {
    Metrics: [
      ["Aggregated engagement metrics for your organic and sponsored posts over time."],
      CABECERA_METRICAS,
      ["08/10/2026", "3.0", "0", "3.0", "0", "1.0", "0", "0"],
      ["08/11/2026", "84.0", "0", "84.0", "2", "5", "1", "2"],
    ],
    "All posts": [
      ["Engagement metrics for individual posts."],
      CABECERA_POSTS,
      ["Cómo medir un focus group", ENLACE, "Organic", "08/11/2026", "84.0", "2", "5", "1", "2", ""],
      ["Sin enlace", "", "Organic", "08/11/2026", "9", "0", "0", "0", "0", "0"],
    ],
  }
}

function seguidores(): Hojas {
  return {
    "New followers": [
      ["Date", "Sponsored followers", "Organic followers", "Auto-invited followers", "Total followers"],
      ["08/11/2026", "0", "2.0", "0", "2.0"],
      ["08/12/2026", "0", "1", "0", "1"],
    ],
    Location: [
      ["Location", "Total followers"],
      ["Santiago Metropolitan Area, Chile", "84.0"],
    ],
    "Job function": [
      ["Job function", "Total followers"],
      ["Sales", "18"],
    ],
    Seniority: [
      ["Seniority", "Total followers"],
      ["Entry", "50"],
    ],
    Industry: [
      ["Industry", "Total followers"],
      ["Advertising Services", "36"],
    ],
    "Company size": [
      ["Company size", "Total followers"],
      ["11-50", "35"],
    ],
  }
}

function visitantes(): Hojas {
  return {
    "Visitor metrics": [
      ["Date", "Total page views (total)", "Total unique visitors (total)"],
      ["08/11/2026", "7.0", "4.0"],
      ["08/13/2026", "1", "1"],
    ],
    "Job function": [
      ["Job function", "Total views"],
      ["Accounting", "2"],
    ],
    "Company size": [
      ["Company size", "Total views"],
      ["2-10", "4"],
    ],
  }
}

function leida(entrada: Parameters<typeof leerExportacionDePagina>[0]) {
  const r = leerExportacionDePagina(entrada)
  if (!r.ok) throw new Error(r.error)
  return r
}

describe("leerExportacionDePagina: content", () => {
  test("reads a post from its activity URN with reactions, comments and reposts as interactions", () => {
    expect(leida({ contenido: contenido() }).publicaciones).toEqual([
      {
        postUrn: "urn:li:activity:7396634456431751170",
        publicadaEl: "2026-08-11",
        interacciones: 8,
        impresiones: 84,
        clics: 2,
        seguidoresNuevos: null,
        extracto: "Cómo medir un focus group",
      },
    ])
  })

  test("counts a post with no link instead of guessing it", () => {
    expect(leida({ contenido: contenido() }).sinIdentificar).toBe(1)
  })

  test("reads the daily totals from the Metrics sheet and turns MM/DD/YYYY into ISO dates", () => {
    const r = leida({ contenido: contenido() })
    expect(r.dias).toEqual([
      {
        dia: "2026-08-10",
        impresiones: 3,
        interacciones: 1,
        seguidoresNuevos: null,
        visitas: null,
        visitantesUnicos: null,
      },
      {
        dia: "2026-08-11",
        impresiones: 84,
        interacciones: 8,
        seguidoresNuevos: null,
        visitas: null,
        visitantesUnicos: null,
      },
    ])
  })

  test("the period is the earliest and latest date seen, and the followers total is unknown", () => {
    const r = leida({ contenido: contenido() })
    expect(r.desde).toBe("2026-08-10")
    expect(r.hasta).toBe("2026-08-11")
    expect(r.seguidoresTotal).toBeNull()
  })

  test("cuts the extract to the 300 characters the database accepts", () => {
    const hojas = contenido()
    hojas["All posts"][2][0] = "a".repeat(400)
    expect(leida({ contenido: hojas }).publicaciones[0].extracto).toHaveLength(300)
  })
})

describe("leerExportacionDePagina: followers and visitors", () => {
  test("merges new followers into the days, adding the days the content file did not have", () => {
    const r = leida({ contenido: contenido(), seguidores: seguidores() })
    expect(r.dias.map((d) => [d.dia, d.impresiones, d.seguidoresNuevos])).toEqual([
      ["2026-08-10", 3, null],
      ["2026-08-11", 84, 2],
      ["2026-08-12", null, 1],
    ])
    expect(r.hasta).toBe("2026-08-12")
  })

  test("a day that only the followers file knows carries no impressions or interactions, so it cannot overwrite real ones", () => {
    const r = leida({ seguidores: seguidores() })
    expect(r.dias.every((d) => d.impresiones === null && d.interacciones === null)).toBe(true)
  })

  test("stores follower counts as «seguidores» rows with Spanish categories", () => {
    const r = leida({ seguidores: seguidores() })
    expect(r.publico).toEqual([
      {
        tipo: "seguidores",
        categoria: "Ubicación",
        valor: "Santiago Metropolitan Area, Chile",
        cantidad: 84,
        porcentaje: null,
        menorAUno: false,
      },
      { tipo: "seguidores", categoria: "Área", valor: "Sales", cantidad: 18, porcentaje: null, menorAUno: false },
      {
        tipo: "seguidores",
        categoria: "Nivel de responsabilidad",
        valor: "Entry",
        cantidad: 50,
        porcentaje: null,
        menorAUno: false,
      },
      {
        tipo: "seguidores",
        categoria: "Sector",
        valor: "Advertising Services",
        cantidad: 36,
        porcentaje: null,
        menorAUno: false,
      },
      {
        tipo: "seguidores",
        categoria: "Tamaño de la empresa",
        valor: "11-50",
        cantidad: 35,
        porcentaje: null,
        menorAUno: false,
      },
    ])
  })

  test("merges visits and unique visitors into the days and stores viewer counts", () => {
    const r = leida({ contenido: contenido(), visitantes: visitantes() })
    expect(r.dias.map((d) => [d.dia, d.visitas, d.visitantesUnicos])).toEqual([
      ["2026-08-10", null, null],
      ["2026-08-11", 7, 4],
      ["2026-08-13", 1, 1],
    ])
    expect(r.publico).toEqual([
      { tipo: "visitantes", categoria: "Área", valor: "Accounting", cantidad: 2, porcentaje: null, menorAUno: false },
      {
        tipo: "visitantes",
        categoria: "Tamaño de la empresa",
        valor: "2-10",
        cantidad: 4,
        porcentaje: null,
        menorAUno: false,
      },
    ])
  })

  test("a followers file on its own is enough", () => {
    const r = leida({ seguidores: seguidores() })
    expect(r.publicaciones).toEqual([])
    expect(r.desde).toBe("2026-08-11")
  })
})

describe("leerExportacionDePagina: errors", () => {
  test("asks for at least one file when none is given", () => {
    expect(leerExportacionDePagina({})).toEqual({
      ok: false,
      error: "Sube al menos un archivo de la página: contenido, seguidores o visitantes.",
    })
  })

  test("a file with the right sheets but no dated rows says so", () => {
    expect(leerExportacionDePagina({ seguidores: { "New followers": [["Date", "Total followers"]] } })).toEqual({
      ok: false,
      error: "Los archivos no traen datos con fecha.",
    })
  })
})

describe("leerArchivosDeLinkedin", () => {
  test("classifies three files by their sheets and merges them", () => {
    const r = leerArchivosDeLinkedin([
      { nombre: "v.xls", hojas: visitantes() },
      { nombre: "c.xls", hojas: contenido() },
      { nombre: "s.xls", hojas: seguidores() },
    ])
    if (!r.ok) throw new Error(r.error)
    expect(r.publicaciones).toHaveLength(1)
    expect(r.publico.map((p) => p.tipo)).toContain("visitantes")
    expect(r.publico.map((p) => p.tipo)).toContain("seguidores")
  })

  test("a single profile export goes to the profile parser", () => {
    const perfil: Hojas = {
      DESCUBRIMIENTO: [["Rendimiento general", "10/11/2025 - 9/11/2026"]],
      INTERACCIÓN: [["Fecha", "Impresiones", "Interacciones"]],
      SEGUIDORES: [["Total de seguidores el 9/11/2026", 3448], [], ["Fecha", "Nuevos seguidores"]],
      "PUBLICACIONES PRINCIPALES": [[], [], []],
      "INFORMACIÓN DETALLADA DEL PÚBLI": [["x", "y", "z"]],
      "INFORMACIÓN DETALLADA DEL CONTE": [["x", "y", "z"]],
    }
    const r = leerArchivosDeLinkedin([{ nombre: "perfil.xlsx", hojas: perfil }])
    expect(r).toEqual(leerExportacion(perfil))
    if (!r.ok) throw new Error(r.error)
    expect(r.seguidoresTotal).toBe(3448)
  })

  test("names a file it does not recognise", () => {
    expect(leerArchivosDeLinkedin([{ nombre: "notas.xlsx", hojas: { Hoja1: [["a"]] } }])).toEqual({
      ok: false,
      error: "No reconozco el archivo «notas.xlsx». Sube las exportaciones de LinkedIn.",
    })
  })

  test("refuses two files of the same kind", () => {
    const r = leerArchivosDeLinkedin([
      { nombre: "a.xls", hojas: seguidores() },
      { nombre: "b.xls", hojas: seguidores() },
    ])
    expect(r).toEqual({ ok: false, error: "Subiste dos archivos de seguidores. Sube uno de cada tipo." })
  })

  test("asks for files when none is given", () => {
    expect(leerArchivosDeLinkedin([])).toEqual({
      ok: false,
      error: "Elige el archivo que descargaste de LinkedIn.",
    })
  })
})
