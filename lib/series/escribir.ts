import { Falla } from "@/lib/dominio/falla"
import { PasoYaPagado, TopeAlcanzado } from "@/lib/gasto/pagar"
import type { Pedir } from "@/lib/ia/claude"
import { proponerFecha } from "@/lib/piezas/horarios"
import type { Carrusel } from "@/lib/plantillas/laminas"
import { type IdDeTema, temasDeLaVoz } from "@/lib/plantillas/temas"
import { revisarSinPerder } from "@/lib/redaccion/atender"
import type { ContextoDeRedaccion } from "@/lib/redaccion/instrucciones"
import { escribir, type VeredictoDeClaude } from "@/lib/redaccion/redactar"
import { escribirCarrusel } from "./carrusel"
import type { FormatoDeIdea, HallazgoDeSerie, PasoDeEsqueleto } from "./propuestas"

// Trigger.dev only: reaches the Claude client through 4c's writer and ./carrusel.

/** Plano «Escribir texto»: 3 days before. The plano says «ajustable en Ajustes»; there is no settings table yet. */
export const DIAS_ANTES_DE_ESCRIBIR = 3
const ASIGNACIONES_POR_CORRIDA = 3
/**
 * No new piece starts after this: a carousel with its repair takes a few minutes, and the task's maxDuration (840 s)
 * and the 15-minute lease must outlast the last one.
 */
const PRESUPUESTO_DE_LA_CORRIDA_MS = 600_000
const DIA_MS = 86_400_000
/** A piece written closer than this to its date moves on: a late write never forces a rushed signature. */
const MARGEN_PARA_FIRMAR_MS = 2 * 60 * 60_000
/** proponerFecha's own margin: subtracted so its first candidate is at least MARGEN_PARA_FIRMAR_MS away. */
const MARGEN_DE_PROPONER_MS = 30 * 60_000

export interface AsignacionAEscribir {
  id: string
  cuentaId: string
  formato: FormatoDeIdea
  planeadaPara: number
  idea: {
    gancho: string
    resumen: string
    esqueleto: PasoDeEsqueleto[]
    /** The pillar's name, only when it belongs to this account's brand. */
    pilar: string | null
  }
  /** The idea's findings: the material, with their sources. */
  hallazgos: HallazgoDeSerie[]
}

export interface DisenoDeAsignacion {
  tema: IdDeTema
  titulo: string
  texto: string
  diseno: Carrusel
  lineaVersion: number
  planeadaPara: Date
}

export interface PuertosDeEscritura {
  pedir: Pedir
  /** Leases due assignments (planeada_para <= hasta), soonest first. */
  tomarAsignaciones(hasta: number, limite: number): Promise<AsignacionAEscribir[]>
  contextoDeCuenta(cuentaId: string): Promise<ContextoDeRedaccion>
  /** The slots the account holds from `desde` on, pieces and open assignments alike. */
  horariosDeCuenta(cuentaId: string, desde: number): Promise<number[]>
  /** On a slot clash the repository moves the piece to the next free slot. */
  crearPiezaDeAsignacion(
    a: AsignacionAEscribir,
    texto: string,
    lineaVersion: number,
    planeadaPara: Date,
    tipo: "persona" | "empresa",
  ): Promise<{ piezaId: string; versionId: string }>
  guardarRevision(versionId: string, veredicto: VeredictoDeClaude, pedidoId: string | null): Promise<void>
  pedirDisenoDeAsignacion(asignacionId: string, d: DisenoDeAsignacion): Promise<string>
  /** Closes it as «fallo» with a reason Federico can read. */
  fallarAsignacion(asignacionId: string, motivo: string): Promise<void>
  /** Leaves it leased: the lease expires and the next run takes it again (two attempts at most). */
  anotarAsignacion(asignacionId: string, motivo: string): Promise<void>
}

const REINTENTO = "No pude escribir esta pieza. Se vuelve a intentar en la próxima hora."

function motivoDe(error: unknown): string {
  if (error instanceof TopeAlcanzado)
    return "Se alcanzó el tope de gasto del mes. Súbelo en Ajustes o escribe la pieza a mano."
  if (error instanceof PasoYaPagado)
    return "Esta pieza ya se había empezado a pagar y no sé si terminó, así que no la vuelvo a pagar. Escríbela en el editor."
  if (error instanceof Falla) return error.message
  return REINTENTO
}

const esperado = (error: unknown) =>
  error instanceof TopeAlcanzado || error instanceof PasoYaPagado || error instanceof Falla

/** The assignment's date, or the account's next free slot when that date is under two hours away (or gone). */
async function fechaDeLaPieza(
  p: PuertosDeEscritura,
  a: AsignacionAEscribir,
  tipo: "persona" | "empresa",
  ahora: number,
): Promise<Date> {
  if (a.planeadaPara - ahora >= MARGEN_PARA_FIRMAR_MS) return new Date(a.planeadaPara)
  const ocupados = await p.horariosDeCuenta(a.cuentaId, ahora)
  try {
    return proponerFecha(tipo, [...ocupados, a.planeadaPara], ahora + MARGEN_PARA_FIRMAR_MS - MARGEN_DE_PROPONER_MS)
  } catch (error) {
    // No free slot in 60 days: the approved date stands, and the signature asks for a new one.
    console.error(
      `No encontré horario para la asignación ${a.id}`,
      error instanceof Error ? error.message : String(error),
    )
    return new Date(a.planeadaPara)
  }
}

function material(hallazgos: readonly HallazgoDeSerie[]): string | null {
  if (hallazgos.length === 0) return null
  return hallazgos.map((h) => `- ${h.resumen} (${h.medio}, ${h.publicado_en ?? "sin fecha"}) ${h.enlace}`).join("\n")
}

function encargo(idea: AsignacionAEscribir["idea"]): string {
  return [
    "Escribe un post a partir de esta idea aprobada de una serie.",
    `Gancho: ${idea.gancho}`,
    `Resumen: ${idea.resumen}`,
    "Los pasos del post, en orden:",
    ...idea.esqueleto.map((p, i) => `${i + 1}. ${p.idea}`),
    "Cita la fuente cuando uses un dato.",
  ].join("\n")
}

async function escribirUna(p: PuertosDeEscritura, a: AsignacionAEscribir, ahora: number): Promise<void> {
  const c = await p.contextoDeCuenta(a.cuentaId)
  if (a.formato === "texto") {
    const fuentes = material(a.hallazgos)
    const escrito = await escribir(p.pedir, c, {
      clave: `escribir:asignacion:${a.id}`,
      encargo: encargo(a.idea),
      material: fuentes,
      pilar: a.idea.pilar,
    })
    const fecha = await fechaDeLaPieza(p, a, c.cuenta.tipo, ahora)
    const { versionId } = await p.crearPiezaDeAsignacion(a, escrito.texto, c.linea.version, fecha, c.cuenta.tipo)
    await revisarSinPerder(p, c, versionId, escrito.texto, fuentes)
    return
  }
  const carrusel = await escribirCarrusel(p.pedir, c, {
    clave: `carrusel:asignacion:${a.id}`,
    idea: a.idea,
    hallazgos: a.hallazgos,
    temas: temasDeLaVoz(c.marca.voz),
  })
  await p.pedirDisenoDeAsignacion(a.id, {
    ...carrusel,
    lineaVersion: c.linea.version,
    planeadaPara: await fechaDeLaPieza(p, a, c.cuenta.tipo, ahora),
  })
}

/**
 * Writes what is due in the next 3 days, each piece in its account's voice and charged to its brand. It leases one
 * assignment at a time, so the ones it will not reach stay free for the next run instead of waiting out a lease. A
 * failure closes that assignment with a reason; the others still run. Errors nobody expected leave the lease to expire
 * (the two-attempt guard decides when to stop) and are rethrown together at the end so the run shows as failed.
 */
export async function escribirPiezas(
  p: PuertosDeEscritura,
  ahora: number,
  reloj: () => number = Date.now,
): Promise<{ escritas: number; fallidas: number }> {
  const inicio = reloj()
  const inesperados: unknown[] = []
  let escritas = 0
  let fallidas = 0
  for (let n = 0; n < ASIGNACIONES_POR_CORRIDA && reloj() - inicio < PRESUPUESTO_DE_LA_CORRIDA_MS; n++) {
    const [a] = await p.tomarAsignaciones(ahora + DIAS_ANTES_DE_ESCRIBIR * DIA_MS, 1)
    if (!a) break
    try {
      await escribirUna(p, a, ahora)
      escritas++
    } catch (error) {
      fallidas++
      if (!esperado(error)) {
        console.error(`La asignación ${a.id} falló`, error instanceof Error ? error.message : String(error))
        inesperados.push(error)
      }
      try {
        if (esperado(error)) await p.fallarAsignacion(a.id, motivoDe(error))
        else await p.anotarAsignacion(a.id, REINTENTO)
      } catch (errorAlCerrar) {
        inesperados.push(errorAlCerrar)
      }
    }
  }
  if (inesperados.length === 1) throw inesperados[0]
  if (inesperados.length > 1) throw new AggregateError(inesperados, "Hubo piezas con errores inesperados")
  return { escritas, fallidas }
}
