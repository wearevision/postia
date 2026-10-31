import { z } from "zod"
import {
  type CuentaDeSerie,
  deIndice,
  type HallazgoDeSerie,
  Idea,
  Serie,
  type SerieValidada,
  validarIdea,
  validarSerie,
} from "@/lib/series/propuestas"

// Worker-safe: pure validation of the ideas Claude proposes without a report (4g): crosses and Sunday ideas.

/** A cross idea names its pair by number (1-based, the order of the pairs sent) instead of listing sources. */
const IdeaCruzada = Idea.omit({ fuentes: true }).extend({ par: z.number().int() })
export const Cruces = z.object({ ideas: z.array(IdeaCruzada) })
export type Cruces = z.infer<typeof Cruces>

/** Sunday ideas take their sources from the week's findings by number, exactly as a series does. */
export const IdeasDelDomingo = Serie
export type IdeasDelDomingo = Serie

type Cuentas = readonly Pick<CuentaDeSerie, "id" | "pilares">[]

export interface ParDeIds {
  a: Pick<HallazgoDeSerie, "id">
  b: Pick<HallazgoDeSerie, "id">
}

const PAR_DESCONOCIDO = "No nace de ninguno de los pares enviados."

/** Each idea keeps the two findings of its pair; the rest of 4f's rules apply unchanged. */
export function validarCruces(
  cruces: Cruces,
  contexto: { pares: readonly ParDeIds[]; cuentas: Cuentas },
): SerieValidada {
  const resultado: SerieValidada = { ideas: [], descartadas: [] }
  for (const { par, ...idea } of cruces.ideas) {
    const elegido = deIndice(contexto.pares, par)
    if (!elegido) {
      resultado.descartadas.push({ motivo: PAR_DESCONOCIDO, gancho: idea.gancho })
      continue
    }
    const v = validarIdea(
      { ...idea, fuentes: [1, 2] },
      { cuentas: contexto.cuentas, hallazgos: [elegido.a, elegido.b] },
    )
    if (v.ok) resultado.ideas.push(v.idea)
    else resultado.descartadas.push({ motivo: v.motivo, gancho: idea.gancho })
  }
  return resultado
}

export function validarIdeasDelDomingo(
  ideas: IdeasDelDomingo,
  contexto: { cuentas: Cuentas; hallazgos: readonly Pick<HallazgoDeSerie, "id">[] },
): SerieValidada {
  return validarSerie(ideas, contexto)
}
