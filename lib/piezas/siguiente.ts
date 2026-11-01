export interface SiguientePorFirmar {
  id: string
  cuenta: string
  planeadaPara: string | null
  /** Pieces still waiting for a signature, this one excluded. */
  quedan: number
}

/** The next piece to sign after this one, in the inbox's order (soonest planned first), and how many are left. */
export function siguientePorFirmar(
  porFirmar: readonly { id: string; cuenta: string; planeadaPara: string | null }[],
  actual: string,
): SiguientePorFirmar | null {
  const resto = porFirmar.filter((t) => t.id !== actual)
  const [siguiente] = resto
  if (!siguiente) return null
  return { id: siguiente.id, cuenta: siguiente.cuenta, planeadaPara: siguiente.planeadaPara, quedan: resto.length }
}
