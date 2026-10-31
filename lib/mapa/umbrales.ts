/**
 * Cosine similarities for voyage-4. Provisional until the production smoke (probar-voyage) gives real numbers and
 * Federico approves them (plano: the band is calibrated with real data and with approval).
 */
export const UMBRALES = {
  /** A new finding this close to any saved one is a repeat. */
  repetido: 0.95,
  /** A finding joins its nearest topic from here up. */
  tema: 0.8,
  /** Two topics this close merge on their own. */
  fusion: 0.92,
  /** Two ideas this close are the same idea: the later one is dropped (4f, «Armar la serie»). */
  idea: 0.9,
  /**
   * Two findings in this band can cross into an idea (4g): above unrelated pairs (0.35 to 0.54 in the 2026-10-30
   * calibration) and below where topics form.
   */
  cruce: { minimo: 0.56, maximo: 0.74 },
  /** Loose findings form a topic only in groups this big. */
  minimoParaTema: 3,
} as const

/** Each new topic costs one Claude call to name it. */
export const NUEVOS_TEMAS_POR_NOCHE = 5
