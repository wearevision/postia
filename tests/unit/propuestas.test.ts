import { describe, expect, test } from "vitest"
import { type ContextoDeSerie, quitarParecidas, Serie, validarSerie } from "@/lib/series/propuestas"

const contexto: ContextoDeSerie = {
  cuentas: [
    {
      id: "cuenta-fede",
      nombre: "Federico Elgueta",
      tipo: "persona",
      marca: { id: "marca-fede", nombre: "Federico", voz: "yo" },
      pilares: [
        { id: "pilar-oficio", nombre: "Oficio", deQueHabla: "Cómo se hace una experiencia." },
        { id: "pilar-ideas", nombre: "Ideas", deQueHabla: "Lo que pienso del rubro." },
      ],
      temasVetados: "",
      noNombrar: [],
    },
    {
      id: "cuenta-wav",
      nombre: "WAV",
      tipo: "empresa",
      marca: { id: "marca-wav", nombre: "WAV", voz: "nosotros" },
      pilares: [{ id: "pilar-casos", nombre: "Casos", deQueHabla: "Lo que hicimos." }],
      temasVetados: "Política.",
      noNombrar: ["Cliente Secreto"],
    },
  ],
  hallazgos: [
    {
      id: "h1",
      angulo: "Datos",
      resumen: "Uno",
      medio: "Medio A",
      publicado_en: "2026-10-01",
      enlace: "https://a.cl/1",
    },
    { id: "h2", angulo: "Datos", resumen: "Dos", medio: "Medio B", publicado_en: null, enlace: "https://b.cl/2" },
    { id: "h3", angulo: "Casos", resumen: "Tres", medio: "Medio C", publicado_en: null, enlace: "https://c.cl/3" },
  ],
}

const texto = {
  gancho: "Lo que nadie dice de los focus groups",
  resumen: "Tres errores comunes y cómo evitarlos.",
  formato: "texto" as const,
  esqueleto: [
    { tipo: null, idea: "El error" },
    { tipo: null, idea: "La salida" },
  ],
  fuentes: [1, 2],
  cuenta: 1,
  razon: "Es oficio de Federico.",
  pilar: 1,
}
const carrusel = {
  ...texto,
  gancho: "Cinco datos del BTL en Chile",
  formato: "carrusel_pdf" as const,
  esqueleto: [
    { tipo: "portada" as const, idea: "Cinco datos" },
    { tipo: "cifra" as const, idea: "El 40 %" },
    { tipo: "cierre" as const, idea: "Conversemos" },
  ],
  cuenta: 2,
  pilar: 1,
}

describe("Serie", () => {
  test("parses what Claude returns, with account, sources and pillar as indices", () => {
    expect(Serie.parse({ ideas: [texto, carrusel] }).ideas).toHaveLength(2)
  })

  test("refuses an unknown slide type in a skeleton", () => {
    const malo = { ...carrusel, esqueleto: [{ tipo: "video", idea: "x" }] }
    expect(Serie.safeParse({ ideas: [malo] }).success).toBe(false)
  })
})

describe("validarSerie", () => {
  test("maps indices to ids and keeps the series order", () => {
    const r = validarSerie({ ideas: [texto, carrusel] }, contexto)
    expect(r.descartadas).toEqual([])
    expect(r.ideas).toEqual([
      {
        gancho: texto.gancho,
        resumen: texto.resumen,
        formato: "texto",
        esqueleto: [{ idea: "El error" }, { idea: "La salida" }],
        fuentes: ["h1", "h2"],
        cuenta: "cuenta-fede",
        razon: texto.razon,
        pilar: "pilar-oficio",
      },
      {
        gancho: carrusel.gancho,
        resumen: carrusel.resumen,
        formato: "carrusel_pdf",
        esqueleto: [
          { tipo: "portada", idea: "Cinco datos" },
          { tipo: "cifra", idea: "El 40 %" },
          { tipo: "cierre", idea: "Conversemos" },
        ],
        fuentes: ["h1", "h2"],
        cuenta: "cuenta-wav",
        razon: carrusel.razon,
        pilar: "pilar-casos",
      },
    ])
  })

  test("drops an idea whose account index is out of range", () => {
    for (const cuenta of [0, 3]) {
      const r = validarSerie({ ideas: [{ ...texto, cuenta }] }, contexto)
      expect(r.ideas).toEqual([])
      expect(r.descartadas).toEqual([{ gancho: texto.gancho, motivo: "La cuenta sugerida no existe." }])
    }
  })

  test("drops invalid and repeated sources and the idea when none is left", () => {
    const algunas = validarSerie({ ideas: [{ ...texto, fuentes: [9, 3, 3, 0] }] }, contexto)
    expect(algunas.ideas[0]?.fuentes).toEqual(["h3"])
    const ninguna = validarSerie({ ideas: [{ ...texto, fuentes: [0, 4] }] }, contexto)
    expect(ninguna.ideas).toEqual([])
    expect(ninguna.descartadas).toEqual([{ gancho: texto.gancho, motivo: "No usa ningún hallazgo del informe." }])
  })

  test("keeps at most 6 sources", () => {
    const muchos = {
      ...contexto,
      hallazgos: Array.from({ length: 8 }, (_, i) => ({ ...contexto.hallazgos[0], id: `h${i}` })),
    }
    const r = validarSerie({ ideas: [{ ...texto, fuentes: [1, 2, 3, 4, 5, 6, 7, 8] }] }, muchos)
    expect(r.ideas[0]?.fuentes).toHaveLength(6)
  })

  test("drops a carousel whose skeleton does not follow the slide rules", () => {
    const casos = [
      carrusel.esqueleto.slice(0, 2),
      [carrusel.esqueleto[1], ...carrusel.esqueleto.slice(1)],
      [...carrusel.esqueleto.slice(0, 2), carrusel.esqueleto[1]],
      [carrusel.esqueleto[0], { tipo: null, idea: "Sin tipo" }, carrusel.esqueleto[2]],
      [carrusel.esqueleto[0], ...Array.from({ length: 9 }, () => carrusel.esqueleto[1]), carrusel.esqueleto[2]],
    ]
    for (const esqueleto of casos) {
      const r = validarSerie({ ideas: [{ ...carrusel, esqueleto }] }, contexto)
      expect(r.ideas).toEqual([])
      expect(r.descartadas).toEqual([
        {
          gancho: carrusel.gancho,
          motivo: "El esqueleto del carrusel no lleva de 3 a 10 láminas con portada al inicio y cierre al final.",
        },
      ])
    }
  })

  test("drops a text post whose skeleton has more than 6 beats", () => {
    const esqueleto = Array.from({ length: 7 }, (_, i) => ({ tipo: null, idea: `Paso ${i}` }))
    const r = validarSerie({ ideas: [{ ...texto, esqueleto }] }, contexto)
    expect(r.descartadas).toEqual([{ gancho: texto.gancho, motivo: "El esqueleto del post lleva de 1 a 6 pasos." }])
  })

  test("keeps the idea with a null pillar when the pillar is not one of that account's", () => {
    for (const pilar of [3, 0, null]) {
      const r = validarSerie({ ideas: [{ ...texto, pilar }] }, contexto)
      expect(r.ideas[0]?.pilar).toBeNull()
    }
    // pillar 2 exists for Federico's account but not for WAV's
    expect(validarSerie({ ideas: [{ ...carrusel, pilar: 2 }] }, contexto).ideas[0]?.pilar).toBeNull()
  })

  test("drops an idea whose texts do not fit the database limits", () => {
    const largo = validarSerie({ ideas: [{ ...texto, gancho: "a".repeat(141) }] }, contexto)
    expect(largo.descartadas).toEqual([{ gancho: "a".repeat(141), motivo: "El gancho pasa los 140 caracteres." }])
    expect(validarSerie({ ideas: [{ ...texto, resumen: "a".repeat(601) }] }, contexto).descartadas[0]?.motivo).toBe(
      "El resumen pasa los 600 caracteres.",
    )
    expect(validarSerie({ ideas: [{ ...texto, razon: "a".repeat(301) }] }, contexto).descartadas[0]?.motivo).toBe(
      "La razón pasa los 300 caracteres.",
    )
  })
})

describe("quitarParecidas", () => {
  test("drops a later idea too close to an earlier kept one and keeps the rest in order", () => {
    const ideas = [
      { gancho: "a", vector: [1, 0, 0] },
      { gancho: "b", vector: [0.99, 0.05, 0] },
      { gancho: "c", vector: [0, 1, 0] },
      { gancho: "d", vector: [0, 0.999, 0.02] },
    ]
    expect(quitarParecidas(ideas, 0.9).map((i) => i.gancho)).toEqual(["a", "c"])
  })

  test("compares only against kept ideas, at or above the threshold", () => {
    const ideas = [
      { gancho: "a", vector: [1, 0] },
      { gancho: "b", vector: [1, 1] },
      { gancho: "c", vector: [0, 1] },
    ]
    // b is exactly cos 45° from both; at 0.7071 it is dropped, so c (90° from a) stays
    expect(quitarParecidas(ideas, Math.SQRT1_2 - 1e-9).map((i) => i.gancho)).toEqual(["a", "c"])
    expect(quitarParecidas(ideas, 0.8).map((i) => i.gancho)).toEqual(["a", "b", "c"])
  })
})
