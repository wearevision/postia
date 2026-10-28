import type { EstadoDeDocumento } from "@/lib/linkedin/api"

const SONDEOS_MAXIMOS = 20
const ESPERA_ENTRE_SONDEOS_MS = 3_000

export interface DepsDeEspera {
  estadoDelDocumento: (entrada: { token: string; documento: string }) => Promise<EstadoDeDocumento>
  esperar: (ms: number) => Promise<void>
}

/** Polls until LinkedIn finishes (or fails) processing an uploaded document; "procesando" means it ran out of polls. */
export async function esperarDocumento(
  deps: DepsDeEspera,
  token: string,
  documento: string,
): Promise<EstadoDeDocumento> {
  for (let sondeo = 0; sondeo < SONDEOS_MAXIMOS; sondeo++) {
    const estado = await deps.estadoDelDocumento({ token, documento })
    if (estado !== "procesando") return estado
    await deps.esperar(ESPERA_ENTRE_SONDEOS_MS)
  }
  return "procesando"
}
