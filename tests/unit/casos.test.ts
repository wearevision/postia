import { describe, expect, test } from "vitest"
import { excepcionesIniciales, leerCasos } from "@/lib/clientes/casos"
import { Falla } from "@/lib/dominio/falla"

const CASO = {
  slug: "51-ice-auspicio-2020",
  client: "51 ICE",
  title: "AUSPICIO EVENTO",
  year: 2020,
  country: "Bolivia",
  city: null,
  industry: "Bebidas",
  workTypes: ["Activación de marca"],
  capabilities: ["Escenografía"],
  summary: "Federico Elgueta lideró…",
  role: "Producción integral.",
  citableClaim: "Una frase.",
  era: "trayectoria",
  exception: null,
}

describe("leerCasos", () => {
  test("maps the file's English fields to the table's columns", () => {
    expect(leerCasos({ source: "x", rules: [], cases: [CASO] })).toEqual([
      {
        slug: "51-ice-auspicio-2020",
        cliente: "51 ICE",
        titulo: "AUSPICIO EVENTO",
        anio: 2020,
        pais: "Bolivia",
        ciudad: null,
        industria: "Bebidas",
        tipos_de_trabajo: ["Activación de marca"],
        capacidades: ["Escenografía"],
        resumen: "Federico Elgueta lideró…",
        rol: "Producción integral.",
        frase_citable: "Una frase.",
        era: "trayectoria",
      },
    ])
  })

  test("throws a Falla naming the case when a field is wrong", () => {
    expect(() => leerCasos({ cases: [{ ...CASO, era: "otra" }] })).toThrow(Falla)
    expect(() => leerCasos({ cases: [{ ...CASO, era: "otra" }] })).toThrow(/51-ice-auspicio-2020/)
  })

  test("throws a Falla on a repeated slug", () => {
    expect(() => leerCasos({ cases: [CASO, CASO] })).toThrow(/repetido/)
  })
})

describe("excepcionesIniciales", () => {
  test("a private event becomes a «no nombrar» exception on that case", () => {
    const casos = [CASO, { ...CASO, slug: "boda-2018", client: "Edwards y Matte", exception: "evento privado" }]
    expect(excepcionesIniciales(casos)).toEqual([
      { cliente: "Edwards y Matte", caso_slug: "boda-2018", tipo: "no_nombrar" },
    ])
  })
})
