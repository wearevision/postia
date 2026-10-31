import { UMBRALES } from "@/lib/mapa/umbrales"

// Trigger.dev only (probar-cruces): SQL over the map, no paid call.

/** One row of histograma_de_similitudes: bucket n holds similarities in [(n-1)/20, n/20). */
export interface CubetaDeSimilitud {
  cubeta: number
  pares: number
  mismoTema: number
  enLaBanda: number
  enLaBandaMismoTema: number
}

export interface PuertosDeCalibracion {
  /** Every pair of a finding created since `desde` with the rest of the map, bucketed in SQL. */
  histogramaDeSimilitudes(desde: number, banda: { minimo: number; maximo: number }): Promise<CubetaDeSimilitud[]>
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

const CUBETAS_POR_UNIDAD = 20

const borde = (n: number) => Math.round((n / CUBETAS_POR_UNIDAD) * 100) / 100

/**
 * The similarity distribution of every candidate pair in 0.05 buckets, split by same topic or not, so Federico
 * approves UMBRALES.cruce with real data before the Sunday engine spends (gate 4).
 */
export async function calibrarCruces(p: PuertosDeCalibracion): Promise<Calibracion> {
  const banda = { minimo: UMBRALES.cruce.minimo, maximo: UMBRALES.cruce.maximo }
  const filas = await p.histogramaDeSimilitudes(0, banda)
  const enLaBanda = { mismoTema: 0, otroTema: 0 }
  let pares = 0
  for (const f of filas) {
    pares += f.pares
    enLaBanda.mismoTema += f.enLaBandaMismoTema
    enLaBanda.otroTema += f.enLaBanda - f.enLaBandaMismoTema
  }
  return {
    pares,
    banda,
    cubetas: filas.map((f) => ({
      desde: borde(f.cubeta - 1),
      hasta: borde(f.cubeta),
      mismoTema: f.mismoTema,
      otroTema: f.pares - f.mismoTema,
    })),
    enLaBanda,
  }
}
