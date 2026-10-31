import { describe, expect, test } from "vitest"
import { Cruces, IdeasDelDomingo, validarCruces, validarIdeasDelDomingo } from "@/lib/ideas/propuestas"
import { UMBRALES } from "@/lib/mapa/umbrales"
import type { CuentaDeSerie } from "@/lib/series/propuestas"

const CUENTAS: CuentaDeSerie[] = [
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
  },
  {
    id: "cuenta-wav",
    nombre: "WAV",
    tipo: "empresa",
    marca: { id: "marca-wav", nombre: "WAV", voz: "nosotros" },
    pilares: [{ id: "pilar-casos", nombre: "Casos", deQueHabla: "Lo que hicimos." }],
    temasVetados: "",
  },
]

const PARES = [
  { a: { id: "h1" }, b: { id: "h2" } },
  { a: { id: "h3" }, b: { id: "h4" } },
]

const cruce = {
  par: 1,
  gancho: "Lo que el retail le enseña a los eventos",
  resumen: "Dos hallazgos que juntos dicen algo nuevo.",
  formato: "texto" as const,
  esqueleto: [
    { tipo: null, idea: "El dato del retail" },
    { tipo: null, idea: "Lo que cambia en un evento" },
  ],
  cuenta: 1,
  razon: "Es una opinión de Federico.",
  pilar: 2,
}

describe("UMBRALES.cruce", () => {
  test("sits between unrelated findings and the topic threshold", () => {
    expect(UMBRALES.cruce).toEqual({ minimo: 0.56, maximo: 0.74 })
    expect(UMBRALES.cruce.minimo).toBeLessThan(UMBRALES.cruce.maximo)
    expect(UMBRALES.cruce.maximo).toBeLessThan(UMBRALES.tema)
  })
})

describe("Cruces", () => {
  test("parses ideas that point to a pair by its number instead of listing sources", () => {
    expect(Cruces.parse({ ideas: [cruce] }).ideas[0]?.par).toBe(1)
  })

  test("refuses an idea without its pair", () => {
    const { par: _par, ...sinPar } = cruce
    expect(Cruces.safeParse({ ideas: [sinPar] }).success).toBe(false)
  })
})

describe("validarCruces", () => {
  test("maps each idea to the two findings of its pair, its account and its pillar", () => {
    const r = validarCruces(
      { ideas: [cruce, { ...cruce, par: 2, cuenta: 2, pilar: 1 }] },
      { pares: PARES, cuentas: CUENTAS },
    )
    expect(r.descartadas).toEqual([])
    expect(r.ideas.map((i) => i.fuentes)).toEqual([
      ["h1", "h2"],
      ["h3", "h4"],
    ])
    expect(r.ideas.map((i) => [i.cuenta, i.pilar])).toEqual([
      ["cuenta-fede", "pilar-ideas"],
      ["cuenta-wav", "pilar-casos"],
    ])
  })

  test("drops an idea that points to a pair that was not sent", () => {
    const r = validarCruces(
      {
        ideas: [
          { ...cruce, par: 3 },
          { ...cruce, par: 0 },
        ],
      },
      { pares: PARES, cuentas: CUENTAS },
    )
    expect(r.ideas).toEqual([])
    expect(r.descartadas).toHaveLength(2)
    expect(r.descartadas[0]?.gancho).toBe(cruce.gancho)
  })

  test("applies the series rules: unknown account, bad carousel skeleton, foreign pillar cleared", () => {
    const r = validarCruces(
      {
        ideas: [
          { ...cruce, cuenta: 5 },
          { ...cruce, formato: "carrusel_pdf", esqueleto: [{ tipo: "cifra", idea: "Solo una" }] },
          { ...cruce, cuenta: 2, pilar: 2 },
        ],
      },
      { pares: PARES, cuentas: CUENTAS },
    )
    expect(r.descartadas.map((d) => d.motivo)).toEqual([
      "La cuenta sugerida no existe.",
      expect.stringContaining("carrusel"),
    ])
    expect(r.ideas).toHaveLength(1)
    expect(r.ideas[0]?.pilar).toBeNull()
  })
})

describe("validarIdeasDelDomingo", () => {
  const hallazgos = [{ id: "s1" }, { id: "s2" }]
  const suelta = { ...cruce, fuentes: [2] }
  const { par: _par, ...sinPar } = suelta

  test("takes sources from the week's findings by number, like a series", () => {
    const ideas = IdeasDelDomingo.parse({ ideas: [sinPar] })
    const r = validarIdeasDelDomingo(ideas, { cuentas: CUENTAS, hallazgos })
    expect(r.ideas[0]?.fuentes).toEqual(["s2"])
  })

  test("drops an idea with no finding of the week", () => {
    const r = validarIdeasDelDomingo({ ideas: [{ ...sinPar, fuentes: [9] }] }, { cuentas: CUENTAS, hallazgos })
    expect(r.ideas).toEqual([])
    expect(r.descartadas).toHaveLength(1)
  })
})
