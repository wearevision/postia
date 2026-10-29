import { Falla } from "@/lib/dominio/falla"

/** Claude models PostIA may call. Prices from the claude-api skill (Anthropic first-party rates, cached 2026-10-06). */
export type ModeloClaude = "claude-opus-5-5" | "claude-sonnet-5-5"

/**
 * Micro-dollars per million tokens. Only the 5-minute cache TTL is priced (writes at 1.25× input): the 1-hour TTL
 * bills writes at 2× input and is not supported, so the Claude client never asks for it.
 */
interface Precio {
  entrada: number
  salida: number
  escrituraDeCache: number
  lecturaDeCache: number
}

const PRECIOS: Record<ModeloClaude, Precio> = {
  "claude-opus-5-5": { entrada: 4_000_000, salida: 20_000_000, escrituraDeCache: 5_000_000, lecturaDeCache: 200_000 },
  "claude-sonnet-5-5": { entrada: 2_000_000, salida: 10_000_000, escrituraDeCache: 2_500_000, lecturaDeCache: 200_000 },
}

/**
 * US$10 per 1,000 web searches. Only `costoReal` uses it today; estimating a call that searches waits for the research
 * sub-plan (see `estimarCosto`).
 */
const BUSQUEDA_WEB_MICRO = 10_000

// Spanish runs about 3.5 characters per token; two per token keeps the estimate above the real count.
const CARACTERES_POR_TOKEN = 2

export interface Uso {
  entrada: number
  salida: number
  escrituraDeCache: number
  lecturaDeCache: number
  busquedas: number
}

export function costoReal(modelo: ModeloClaude, uso: Uso): number {
  const p = PRECIOS[modelo]
  const porTokens =
    uso.entrada * p.entrada +
    uso.salida * p.salida +
    uso.escrituraDeCache * p.escrituraDeCache +
    uso.lecturaDeCache * p.lecturaDeCache
  return Math.ceil(porTokens / 1_000_000) + uso.busquedas * BUSQUEDA_WEB_MICRO
}

/**
 * The worst case before calling: every input token written to cache and the whole max_tokens produced. Calls with web
 * searches are refused: their results come back as billed input tokens of unknown size, so no bound exists yet. The
 * research sub-plan defines one.
 */
export function estimarCosto(
  modelo: ModeloClaude,
  pedido: { caracteresDeEntrada: number; maxTokens: number; busquedas: number },
): number {
  if (pedido.busquedas > 0) {
    throw new Falla(
      "Todavía no puedo estimar el costo de una llamada con búsquedas web: llega con las investigaciones.",
    )
  }
  return costoReal(modelo, {
    entrada: 0,
    salida: pedido.maxTokens,
    escrituraDeCache: Math.ceil(pedido.caracteresDeEntrada / CARACTERES_POR_TOKEN),
    lecturaDeCache: 0,
    busquedas: 0,
  })
}

const DOLARES = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function enDolares(micro: number): string {
  return `US$${DOLARES.format(micro / 1_000_000)}`
}
