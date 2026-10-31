import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { Falla } from "@/lib/dominio/falla"
import { PasoYaPagado, TopeAlcanzado } from "@/lib/gasto/pagar"
import { diaEnSantiago, sumarDias } from "@/lib/piezas/calendario"
import { enSantiago, fechaEnSantiago } from "@/lib/piezas/horarios"
import type { HallazgoDeSerie } from "@/lib/series/propuestas"
import {
  cruzar,
  cuentasYVetados,
  guardarDistintas,
  leerRespuesta,
  MODELO,
  type PuertosDeCruce,
  type ResultadoDeIdeas,
} from "./cruzar"
import { mensajeDelDomingo, type PilarPendiente, PREVIAS_DEL_DOMINGO, sistemaDelDomingo } from "./instrucciones"
import { IdeasDelDomingo, validarIdeasDelDomingo } from "./propuestas"

// Trigger.dev only: imports the SDK helper through ./cruzar.

/** Plano «Motor semanal de ideas»: at most this many ideas a Sunday, crosses included. */
export const IDEAS_DEL_DOMINGO = 6
/** The week's findings shown to Claude, newest first. */
export const HALLAZGOS_DEL_DOMINGO = 30

const DIA_MS = 86_400_000
const SEMANA_MS = 7 * DIA_MS
const TOPE = "Se alcanzó el tope de gasto; el motor del domingo no propuso más ideas."
const NADA: ResultadoDeIdeas = { guardadas: 0, parecidas: 0, invalidas: 0 }

/** An account that publishes, and what it already holds for the coming Tuesday to Thursday. */
export interface OcupacionDeCuenta {
  cuentaId: string
  ritmo: number
  /** Open assignments plus planned or signed pieces in that span. */
  ocupadas: number
}

export interface PuertosDelDomingo extends PuertosDeCruce {
  /** Non-discarded findings created since `desde`, newest first, at most HALLAZGOS_DEL_DOMINGO. */
  hallazgosDeLaSemana(desde: number): Promise<HallazgoDeSerie[]>
  /** D20: pillars two weeks without a post (lib/voz/balance.ts). */
  pilaresPendientes(ahora: number): Promise<PilarPendiente[]>
  /** Hooks of the latest ideas in any state, newest first. */
  ganchosRecientes(limite: number): Promise<string[]>
  /** Cross ideas saved since `desde` (an ISO instant), whatever run saved them. */
  crucesGuardadosDesde(desde: string): Promise<number>
  /** Accounts with a weekly rhythm above zero, and their slots taken in [desde, hasta). */
  ocupacionDeLaSemana(desde: string, hasta: string): Promise<OcupacionDeCuenta[]>
}

export interface ResultadoDelDomingo {
  cruces: ResultadoDeIdeas
  sueltas: ResultadoDeIdeas
}

function inicioDelDia(dia: string): string {
  const [anio, mes, d] = dia.split("-").map(Number)
  return enSantiago(anio ?? 0, mes ?? 0, d ?? 0, 0, 0).toISOString()
}

/** D19 publishes Tuesday to Thursday: the next week's Tuesday 00:00 to Friday 00:00, in Chile. */
export function martesAJueves(ahora: number): { desde: string; hasta: string } {
  const { diaSemana } = fechaEnSantiago(ahora)
  const lunes = sumarDias(diaEnSantiago(ahora), (8 - diaSemana) % 7 || 7)
  return { desde: inicioDelDia(sumarDias(lunes, 1)), hasta: inicioDelDia(sumarDias(lunes, 4)) }
}

/** Plano: the engine never piles ideas on a full week. Every account must already hold its weekly rhythm. */
export function semanaCubierta(ocupacion: readonly OcupacionDeCuenta[]): boolean {
  return ocupacion.every((c) => c.ocupadas >= c.ritmo)
}

async function ideasSueltas(
  p: PuertosDelDomingo,
  o: { clave: string; desde: number; ahora: number; cantidad: number },
): Promise<ResultadoDeIdeas> {
  const hallazgos = await p.hallazgosDeLaSemana(o.desde)
  if (hallazgos.length === 0) return NADA
  const [{ cuentas, noNombrar }, pilaresPendientes, previas] = await Promise.all([
    cuentasYVetados(p),
    p.pilaresPendientes(o.ahora),
    p.ganchosRecientes(PREVIAS_DEL_DOMINGO),
  ])
  const respuesta = await p.pedir(
    { clave: o.clave, paso: "domingo", marcaId: null },
    {
      modelo: MODELO,
      sistema: sistemaDelDomingo(cuentas, noNombrar),
      mensajes: [
        {
          role: "user",
          // D12: no metrics yet, so nothing has «worked» to rank; the list stays empty until they arrive.
          content: mensajeDelDomingo({ hallazgos, pilaresPendientes, previas, cantidad: o.cantidad, funcionaron: [] }),
        },
      ],
      maxTokens: 8_000,
      esfuerzo: "medium",
      formato: zodOutputFormat(IdeasDelDomingo),
    },
  )
  const validada = validarIdeasDelDomingo(leerRespuesta(respuesta, IdeasDelDomingo), { cuentas, hallazgos })
  return guardarDistintas(p, {
    clave: o.clave,
    origen: "domingo",
    ideas: validada.ideas.slice(0, o.cantidad),
    invalidas: validada.descartadas.length,
  })
}

const mensajeDe = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * Plano «Motor semanal de ideas», one run for every account (D17): the week's crosses first, then loose ideas up to
 * IDEAS_DEL_DOMINGO if the coming week still needs them. Keys carry the Santiago day, so a re-run the same day finds
 * each step paid and skips it. The spend cap stops the run; any other failure of a step is logged and the next step
 * still runs, and an error nobody expected fails the run at the end.
 */
export async function motorDelDomingo(p: PuertosDelDomingo, ahora: number): Promise<ResultadoDelDomingo> {
  const dia = diaEnSantiago(ahora)
  const desde = ahora - SEMANA_MS
  const inesperados: unknown[] = []
  let tope = false

  async function paso(nombre: string, correr: () => Promise<ResultadoDeIdeas>): Promise<ResultadoDeIdeas> {
    try {
      return await correr()
    } catch (error) {
      if (error instanceof TopeAlcanzado) {
        tope = true
        console.warn(TOPE)
      } else if (error instanceof PasoYaPagado) {
        console.warn(`El paso «${nombre}» de hoy ya se había pagado; lo salto.`)
      } else if (error instanceof Falla) {
        console.warn(`El paso «${nombre}» del motor del domingo no terminó: ${error.message}`)
      } else {
        console.error(`El paso «${nombre}» del motor del domingo falló`, mensajeDe(error))
        inesperados.push(error)
      }
      return NADA
    }
  }

  const terminar = (resultado: ResultadoDelDomingo) => {
    if (inesperados.length === 1) throw inesperados[0]
    if (inesperados.length > 1) throw new AggregateError(inesperados, "El motor del domingo tuvo errores inesperados")
    return resultado
  }

  const cruces = await paso("cruces", () => cruzar(p, { clave: `cruces:${dia}`, desde }))
  if (tope) return terminar({ cruces, sueltas: NADA })
  const sueltas = await paso("ideas sueltas", async () => {
    // From the database, not this run's result: a re-run the same day finds the crosses step paid and saves none, yet
    // the crosses of the first run still count against the Sunday's total.
    const cantidad = IDEAS_DEL_DOMINGO - (await p.crucesGuardadosDesde(inicioDelDia(dia)))
    if (cantidad <= 0) return NADA
    const { desde: martes, hasta: viernes } = martesAJueves(ahora)
    if (semanaCubierta(await p.ocupacionDeLaSemana(martes, viernes))) return NADA
    return ideasSueltas(p, { clave: `domingo:${dia}`, desde, ahora, cantidad })
  })
  return terminar({ cruces, sueltas })
}
