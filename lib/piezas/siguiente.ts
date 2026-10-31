/** The next piece to sign after this one, in the inbox's order (soonest planned first). */
export function siguientePorFirmar(porFirmar: readonly { id: string }[], actual: string): string | null {
  return porFirmar.find((t) => t.id !== actual)?.id ?? null
}
