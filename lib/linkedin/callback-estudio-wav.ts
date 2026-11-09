import type { Llegada } from "./conexion"
import type { PropositoDeEstudioWav } from "./estado-oauth"
import { type DepsDePagina, destinoDeLaPagina, terminarConexionDePagina } from "./pagina"
import { type DepsDeAnaliticas, destinoDeAnaliticas, terminarConexionDeAnaliticas } from "./permiso-analiticas"

export type LlegadaDeEstudioWav = Omit<Llegada, "guardado"> & {
  guardado: { estado: string; cuenta: string; proposito: PropositoDeEstudioWav } | null
}

/**
 * «Estudio WAV» has a single registered redirect URL, so its callback serves two flows. The purpose comes from the
 * cookie this browser was given when it started; without a cookie the page flow answers, and it reports the state.
 */
export async function resolverCallbackDeEstudioWav(
  deps: { pagina: DepsDePagina; analiticas: DepsDeAnaliticas },
  llegada: LlegadaDeEstudioWav,
): Promise<string> {
  if (llegada.guardado?.proposito === "analiticas") {
    return destinoDeAnaliticas(await terminarConexionDeAnaliticas(deps.analiticas, llegada))
  }
  return destinoDeLaPagina(await terminarConexionDePagina(deps.pagina, llegada))
}
