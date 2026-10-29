export type Proveedor = "anthropic" | "voyage" | "gemini"

export interface PedidoDeGasto {
  /** Unique per paid step: with the attempt when the step may retry, without it when it must never repeat. */
  clave: string
  proveedor: Proveedor
  paso: string
  estimadoMicro: number
  /** null is «General»: research, the Sunday engine and crosses have no brand. */
  marcaId: string | null
}

export interface AvisoDeTope {
  /** "global" or a brand id. */
  alcance: string
  umbral: 80 | 100
  gastadoMicro: number
  topeMicro: number
}

export type Reserva =
  | { estado: "reservado"; avisos: AvisoDeTope[] }
  | { estado: "ya_existe"; avisos: AvisoDeTope[] }
  | { estado: "tope_alcanzado"; alcance: string; avisos: AvisoDeTope[] }

export interface LibroDeGastos {
  reservar(pedido: PedidoDeGasto): Promise<Reserva>
  confirmar(clave: string, realMicro: number): Promise<AvisoDeTope[]>
  liberar(clave: string): Promise<void>
}

export interface PuertosDePago {
  libro: LibroDeGastos
  avisar(avisos: AvisoDeTope[]): Promise<void>
  /** True only when the provider provably refused before working (a 4xx), so nothing was charged. */
  esRechazoProbado(error: unknown): boolean
}

export class TopeAlcanzado extends Error {
  constructor(readonly alcance: string) {
    super(`El tope de gasto (${alcance}) no deja hacer este paso.`)
    this.name = "TopeAlcanzado"
  }
}

export class PasoYaPagado extends Error {
  constructor(readonly clave: string) {
    super(`El paso ${clave} ya se reservó o se pagó: no se vuelve a llamar.`)
    this.name = "PasoYaPagado"
  }
}

async function avisarSinPerder(puertos: PuertosDePago, avisos: AvisoDeTope[]) {
  if (avisos.length === 0) return
  try {
    await puertos.avisar(avisos)
  } catch (error) {
    console.error(`No pude avisar del tope de gasto: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** D11: reserve under the cap, call, confirm the real cost. Release only on a proven refusal; doubt stays reserved. */
export async function pagar<T>(
  puertos: PuertosDePago,
  pedido: PedidoDeGasto,
  llamada: () => Promise<{ resultado: T; costoMicro: number }>,
): Promise<T> {
  const reserva = await puertos.libro.reservar(pedido)
  await avisarSinPerder(puertos, reserva.avisos)
  if (reserva.estado === "tope_alcanzado") throw new TopeAlcanzado(reserva.alcance)
  if (reserva.estado === "ya_existe") throw new PasoYaPagado(pedido.clave)

  let hecho: { resultado: T; costoMicro: number }
  try {
    hecho = await llamada()
  } catch (error) {
    if (puertos.esRechazoProbado(error)) {
      try {
        await puertos.libro.liberar(pedido.clave)
      } catch (errorAlLiberar) {
        console.error(
          `No pude liberar el gasto ${pedido.clave}: ${errorAlLiberar instanceof Error ? errorAlLiberar.message : String(errorAlLiberar)}`,
        )
      }
    }
    throw error
  }

  try {
    await avisarSinPerder(puertos, await puertos.libro.confirmar(pedido.clave, hecho.costoMicro))
  } catch (error) {
    // The call is paid: its result is kept. The reservation keeps counting at the estimate, never below the real cost.
    console.error(
      `No pude confirmar el gasto ${pedido.clave}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  return hecho.resultado
}
