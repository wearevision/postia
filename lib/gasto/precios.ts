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

/** US$10 per 1,000 web searches, in both the real cost and the estimate (through `costoReal`). */
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
 * voyage-4 list price, US$0.06 per million tokens (docs.voyageai.com/docs/pricing, 2026-10-30), in micro-dollars per
 * token times 100. The 200 million free tokens are not discounted: the ledger never under-reports.
 */
const VOYAGE_CENTIMICRO_POR_TOKEN = 6

export function costoDeVoyage(tokens: number): number {
  return Math.ceil((tokens * VOYAGE_CENTIMICRO_POR_TOKEN) / 100)
}

/** A token is at least one character and rarely more than two; two per character keeps the estimate above. */
export function estimarVoyage(caracteres: number): number {
  return costoDeVoyage(caracteres * 2)
}

/**
 * Search results come back as input tokens of unknown size. 30,000 tokens per allowed search is far above a filtered
 * result set (dynamic filtering, web_search_20260209), so the estimate stays above the real cost.
 */
const TOKENS_POR_BUSQUEDA = 30_000

/**
 * Inside the server loop each iteration re-reads the context gathered so far, so billed input grows with the square
 * of the searches: n searches re-read on average ceil((n + 1) / 2) result sets each.
 */
function tokensDeBusquedas(busquedas: number): number {
  return busquedas * TOKENS_POR_BUSQUEDA * Math.ceil((busquedas + 1) / 2)
}

/**
 * The worst case before calling: every input token written to cache, the whole max_tokens produced, and every allowed
 * search used with its bound of result tokens re-read across the loop.
 */
export function estimarCosto(
  modelo: ModeloClaude,
  pedido: { caracteresDeEntrada: number; maxTokens: number; busquedas: number },
): number {
  return costoReal(modelo, {
    entrada: 0,
    salida: pedido.maxTokens,
    escrituraDeCache:
      Math.ceil(pedido.caracteresDeEntrada / CARACTERES_POR_TOKEN) + tokensDeBusquedas(pedido.busquedas),
    lecturaDeCache: 0,
    busquedas: pedido.busquedas,
  })
}

const DOLARES = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function enDolares(micro: number): string {
  return `US$${DOLARES.format(micro / 1_000_000)}`
}
