import { describe, expect, test } from "vitest"
import { Falla } from "@/lib/dominio/falla"
import { leerLinea, leerPorSemana } from "@/lib/voz/importar"

const LINEA = `# Línea editorial de Marca

2026-10-28 · Persona

## De qué hablamos

Hablamos de marcas.

- Una idea
- Otra idea

## Pilares y frecuencia

Tres pilares.

| Pilar | De qué habla | De dónde sale el material | Por semana |
| --- | --- | --- | --- |
| 1. Detrás del trabajo | Cómo se pensó | Casos de la [trayectoria](https://x.cl) | 1 |
| 2. Oficio | Montaje | Aprendizajes | 1 cada dos semanas |

## Tono y voz

Nosotros.

## Formatos

Carruseles.

## Temas vetados

Política.

## Ejemplos aprobados

### Pilar 1 · Un caso

Texto del ejemplo.

## Decisiones

No entra.

## Fuentes

Tampoco.
`

describe("leerLinea", () => {
  test("maps each known section and keeps sub-headings inside examples", () => {
    const { secciones } = leerLinea(LINEA)
    expect(secciones.deQueHablamos).toBe("Hablamos de marcas.\n\n- Una idea\n- Otra idea")
    expect(secciones.tono).toBe("Nosotros.")
    expect(secciones.formatos).toBe("Carruseles.")
    expect(secciones.temasVetados).toBe("Política.")
    expect(secciones.ejemplos).toBe("### Pilar 1 · Un caso\n\nTexto del ejemplo.")
    expect(secciones.temasAVigilar).toBe("")
  })

  test("reads the pillar table with names without numbers and weekly frequencies", () => {
    expect(leerLinea(LINEA).pilares).toEqual([
      {
        nombre: "Detrás del trabajo",
        deQueHabla: "Cómo se pensó",
        material: "Casos de la [trayectoria](https://x.cl)",
        porSemana: 1,
      },
      { nombre: "Oficio", deQueHabla: "Montaje", material: "Aprendizajes", porSemana: 0.5 },
    ])
  })

  test("lists the sections it left out so the person sees what was not imported", () => {
    expect(leerLinea(LINEA).ignoradas).toEqual(["Decisiones", "Fuentes"])
  })

  test("throws a Falla when there is no pillar table", () => {
    expect(() => leerLinea("## Tono y voz\n\nNosotros.\n")).toThrow(Falla)
  })

  test("throws a Falla naming the section that passes its limit", () => {
    expect(() => leerLinea(`${LINEA}\n## Formatos\n\n${"a".repeat(6001)}\n`)).toThrow(/Formatos/)
  })
})

describe("leerPorSemana", () => {
  test("reads whole numbers, decimals with comma or dot, and «cada dos semanas»", () => {
    expect(leerPorSemana("1")).toBe(1)
    expect(leerPorSemana("2")).toBe(2)
    expect(leerPorSemana("0,5")).toBe(0.5)
    expect(leerPorSemana("1 cada dos semanas")).toBe(0.5)
    expect(leerPorSemana("1 cada 2 semanas")).toBe(0.5)
  })

  test("throws a Falla on anything else", () => {
    expect(() => leerPorSemana("a veces")).toThrow(Falla)
  })
})
