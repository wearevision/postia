import type { Embeber } from "@/lib/ia/voyage"
import { similitud } from "./vectores"

type Etiqueta = "repetido" | "mismo_tema" | "vecino" | "ajeno"

/**
 * Spanish pairs with the relation a person would give them. Their voyage-4 similarities are the first data to set
 * UMBRALES: «repetido» must land above `repetido`, «mismo_tema» above `tema`, «ajeno» well below both.
 */
export const PARES: { a: string; b: string; etiqueta: Etiqueta }[] = [
  {
    a: "Las marcas chilenas destinan más presupuesto a eventos presenciales que el año pasado.",
    b: "Este año las marcas en Chile invierten más en eventos presenciales que en el anterior.",
    etiqueta: "repetido",
  },
  {
    a: "Las marcas chilenas destinan más presupuesto a eventos presenciales que el año pasado.",
    b: "Las activaciones de marca en ferias y festivales crecen en Santiago.",
    etiqueta: "mismo_tema",
  },
  {
    a: "Los focus groups siguen siendo la forma más usada de probar un concepto antes de lanzarlo.",
    b: "Las entrevistas en profundidad revelan motivaciones que una encuesta no captura.",
    etiqueta: "mismo_tema",
  },
  {
    a: "Las marcas chilenas destinan más presupuesto a eventos presenciales que el año pasado.",
    b: "La inteligencia artificial ya genera escenografías para lanzamientos de producto.",
    etiqueta: "vecino",
  },
  {
    a: "Los focus groups siguen siendo la forma más usada de probar un concepto antes de lanzarlo.",
    b: "Medir la experiencia del asistente después de un evento mejora el siguiente.",
    etiqueta: "vecino",
  },
  {
    a: "Las marcas chilenas destinan más presupuesto a eventos presenciales que el año pasado.",
    b: "El precio del cobre subió por tercera semana consecutiva.",
    etiqueta: "ajeno",
  },
  {
    a: "Los focus groups siguen siendo la forma más usada de probar un concepto antes de lanzarlo.",
    b: "La selección chilena de fútbol anunció a su nuevo entrenador.",
    etiqueta: "ajeno",
  },
]

/** Production smoke and first calibration: well under US$0.01, only when Federico types GASTAR in the payload. */
export async function calibrar(
  carga: { confirmacion?: string },
  runId: string,
  embeber: Embeber,
): Promise<
  { hecho: false } | { hecho: true; pares: { etiqueta: Etiqueta; similitud: number; a: string; b: string }[] }
> {
  if (carga.confirmacion !== "GASTAR") return { hecho: false }
  const frases = [...new Set(PARES.flatMap((p) => [p.a, p.b]))]
  const vectores = await embeber({ clave: `probar-voyage:${runId}`, paso: "probar" }, frases)
  const vectorDe = new Map(frases.map((f, i) => [f, vectores[i]]))
  const vectorExigido = (frase: string): number[] => {
    const vector = vectorDe.get(frase)
    if (!vector) throw new Error(`Falta el vector de «${frase}».`)
    return vector
  }
  return {
    hecho: true,
    pares: PARES.map((p) => ({
      etiqueta: p.etiqueta,
      similitud: Math.round(similitud(vectorExigido(p.a), vectorExigido(p.b)) * 1000) / 1000,
      a: p.a,
      b: p.b,
    })),
  }
}
