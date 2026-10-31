import { UMBRALES } from "@/lib/mapa/umbrales"

// Trigger.dev only (probar-cruces): SQL over the map, no paid call.

export interface ParDeCalibracion {
  similitud: number
  mismoTema: boolean
}

export interface PuertosDeCalibracion {
  /** similitudes_de_pares: the closest pairs between findings since `desde` and the rest of the map. */
  similitudesDePares(desde: number, limite: number): Promise<ParDeCalibracion[]>
}

export interface Cubeta {
  desde: number
  hasta: number
  mismoTema: number
  otroTema: number
}

export interface Calibracion {
  pares: number
  banda: { minimo: number; maximo: number }
  cubetas: Cubeta[]
  enLaBanda: { mismoTema: number; otroTema: number }
}

/** similitudes_de_pares caps the answer here. */
export const PARES_DE_CALIBRACION = 5000
const CUBETAS_POR_UNIDAD = 20
// A similarity of exactly 0.6 must land in 0.60–0.65, not in 0.55–0.60 because of floating point.
const MARGEN = 1e-9

const borde = (n: number) => Math.round((n / CUBETAS_POR_UNIDAD) * 100) / 100

/**
 * The similarity distribution of candidate pairs in 0.05 buckets, split by same topic or not, so Federico approves
 * UMBRALES.cruce with real data before the Sunday engine spends (gate 4).
 */
export async function calibrarCruces(p: PuertosDeCalibracion): Promise<Calibracion> {
  const pares = await p.similitudesDePares(0, PARES_DE_CALIBRACION)
  const banda = UMBRALES.cruce
  const porCubeta = new Map<number, Cubeta>()
  const enLaBanda = { mismoTema: 0, otroTema: 0 }
  for (const par of pares) {
    const n = Math.floor(par.similitud * CUBETAS_POR_UNIDAD + MARGEN)
    const cubeta = porCubeta.get(n) ?? { desde: borde(n), hasta: borde(n + 1), mismoTema: 0, otroTema: 0 }
    porCubeta.set(n, cubeta)
    const lado = par.mismoTema ? "mismoTema" : "otroTema"
    cubeta[lado]++
    if (par.similitud >= banda.minimo && par.similitud <= banda.maximo) enLaBanda[lado]++
  }
  return {
    pares: pares.length,
    banda: { minimo: banda.minimo, maximo: banda.maximo },
    cubetas: [...porCubeta.entries()].sort(([a], [b]) => a - b).map(([, c]) => c),
    enLaBanda,
  }
}
