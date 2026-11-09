import { estadoDeAnaliticas } from "@/lib/marcas/estado-analiticas"

interface Props {
  /** When the page connection that reads this profile runs out, or null when it cannot read it. */
  expiraEn: string | null
  ahora: number
}

// Reading the figures of the profile's own posts goes through the page's «Estudio WAV» connection: only a status here.
export function AnaliticasDeLinkedin({ expiraEn, ahora }: Props) {
  return <p className="text-sm text-apagado">{estadoDeAnaliticas(expiraEn, ahora)}</p>
}
