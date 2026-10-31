import Anthropic from "@anthropic-ai/sdk"
import { Falla } from "@/lib/dominio/falla"
import { exigirEnv } from "@/lib/env"
import { type AvisoDeTope, type LibroDeGastos, pagar } from "@/lib/gasto/pagar"
import { costoReal, estimarCosto, type ModeloClaude, type Uso } from "@/lib/gasto/precios"

// Trigger.dev tasks and scripts only: the Worker never imports this module (tests/unit/limites-del-worker.test.ts).

/** The claude-api skill's default model. */
export const MODELO_POR_DEFECTO: ModeloClaude = "claude-opus-5-5"

// Global rule: cache system prompts over 1,024 tokens. About four characters per token is enough to decide.
const CARACTERES_PARA_CACHE = 4096

export interface PedidoAClaude {
  modelo?: ModeloClaude
  sistema: string
  mensajes: Anthropic.MessageParam[]
  maxTokens: number
  /** Always explicit: Claude Opus 5.5 defaults to "medium". */
  esfuerzo: "low" | "medium" | "high"
  /** Structured outputs: the answer is JSON for this schema (callers validate it again with zod). */
  formato?: Anthropic.JSONOutputFormat
  /** Every web search tool must carry `max_uses`: the estimate reserves each allowed search. */
  herramientas?: Anthropic.Messages.ToolUnion[]
}

export interface RespuestaDeClaude {
  texto: string
  /** "refusal" must be handled by the caller before using `texto`. */
  detenido: Anthropic.StopReason | null
  /** The raw content: search results, citations, and the assistant turn to send back after `pause_turn`. */
  bloques: Anthropic.ContentBlock[]
}

/**
 * Claude Opus 5.5 cannot disable thinking: no `thinking` parameter, depth comes from `effort`. Server-side refusal
 * fallbacks are left out until a product prompt needs them (4c): they bill another model the price table lacks.
 * The cache breakpoint never sets `ttl`: only the 5-minute cache is priced (lib/gasto/precios.ts).
 */
export function solicitudDe(pedido: PedidoAClaude): Anthropic.MessageCreateParamsNonStreaming {
  const bloque: Anthropic.TextBlockParam =
    pedido.sistema.length > CARACTERES_PARA_CACHE
      ? { type: "text", text: pedido.sistema, cache_control: { type: "ephemeral" } }
      : { type: "text", text: pedido.sistema }
  return {
    model: pedido.modelo ?? MODELO_POR_DEFECTO,
    max_tokens: pedido.maxTokens,
    system: [bloque],
    messages: pedido.mensajes,
    output_config: pedido.formato ? { effort: pedido.esfuerzo, format: pedido.formato } : { effort: pedido.esfuerzo },
    ...(pedido.herramientas && pedido.herramientas.length > 0 ? { tools: pedido.herramientas } : {}),
  }
}

export function usoDe(uso: {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number | null
  cache_read_input_tokens: number | null
  server_tool_use?: { web_search_requests: number } | null
}): Uso {
  return {
    entrada: uso.input_tokens,
    salida: uso.output_tokens,
    escrituraDeCache: uso.cache_creation_input_tokens ?? 0,
    lecturaDeCache: uso.cache_read_input_tokens ?? 0,
    busquedas: uso.server_tool_use?.web_search_requests ?? 0,
  }
}

/** A 4xx (except 408, which may have reached the model) means Anthropic refused before working: nothing was charged. */
export function esRechazoProbado(error: unknown): boolean {
  if (error instanceof Anthropic.APIConnectionError) return false
  if (!(error instanceof Anthropic.APIError)) return false
  const status = error.status
  return typeof status === "number" && status >= 400 && status < 500 && status !== 408
}

type Crear = (solicitud: Anthropic.MessageCreateParamsNonStreaming) => Promise<{
  content: Anthropic.ContentBlock[]
  stop_reason: Anthropic.StopReason | null
  usage: Parameters<typeof usoDe>[0]
}>

/**
 * Retries are attempts the ledger must see, so the SDK never retries on its own. Always streamed: a non-streaming
 * call over about 21k max_tokens is refused by the SDK, and any fixed timeout could cut a call already billed.
 */
export function crearReal(entorno: Record<string, string | undefined> = process.env): Crear {
  const cliente = new Anthropic({
    apiKey: exigirEnv("ANTHROPIC_API_KEY", entorno.ANTHROPIC_API_KEY),
    maxRetries: 0,
  })
  return (solicitud) => cliente.messages.stream(solicitud).finalMessage()
}

/**
 * Text is sized by its length. Search blocks sent back in a continuation (and text carrying citations) by their JSON
 * length, which is above the tokens they bill. An image or document would be estimated by its base64 size: refused.
 */
function caracteresDe(mensaje: Anthropic.MessageParam): number {
  if (typeof mensaje.content === "string") return mensaje.content.length
  return mensaje.content.reduce((n, bloque) => {
    if (bloque.type === "text" && !bloque.citations) return n + bloque.text.length
    if (bloque.type === "text" || bloque.type === "server_tool_use" || bloque.type === "web_search_tool_result")
      return n + JSON.stringify(bloque).length
    throw new Falla(`Todavía no sé calcular el costo de un bloque «${bloque.type}»; solo texto y búsquedas web.`)
  }, 0)
}

/** No search call is unbounded: the estimate needs the most searches each web search tool may run. */
function busquedasPermitidas(herramientas: readonly Anthropic.Messages.ToolUnion[] = []): number {
  return herramientas.reduce((n, h) => {
    if (!h.type?.startsWith("web_search_")) return n
    if (!("max_uses" in h) || typeof h.max_uses !== "number")
      throw new Falla("Toda búsqueda web lleva un máximo de búsquedas.")
    return n + h.max_uses
  }, 0)
}

export async function pedirPagando(
  puertos: { libro: LibroDeGastos; avisar(avisos: AvisoDeTope[]): Promise<void>; crear: Crear },
  paso: { clave: string; paso: string; marcaId: string | null },
  pedido: PedidoAClaude,
): Promise<RespuestaDeClaude> {
  const solicitud = solicitudDe(pedido)
  const modelo = pedido.modelo ?? MODELO_POR_DEFECTO
  const caracteres = pedido.mensajes.reduce((n, m) => n + caracteresDe(m), pedido.sistema.length)
  const busquedas = busquedasPermitidas(pedido.herramientas)
  return pagar(
    { libro: puertos.libro, avisar: puertos.avisar, esRechazoProbado },
    {
      clave: paso.clave,
      proveedor: "anthropic",
      paso: paso.paso,
      estimadoMicro: estimarCosto(modelo, {
        caracteresDeEntrada: caracteres,
        maxTokens: pedido.maxTokens,
        busquedas,
      }),
      marcaId: paso.marcaId,
    },
    async () => {
      const respuesta = await puertos.crear(solicitud)
      const texto = respuesta.content.flatMap((b) => (b.type === "text" && b.text ? [b.text] : [])).join("")
      return {
        resultado: { texto, detenido: respuesta.stop_reason, bloques: respuesta.content },
        costoMicro: costoReal(modelo, usoDe(respuesta.usage)),
      }
    },
  )
}

/** `pedirPagando` with its ports bound: what product code receives. */
export type Pedir = (
  paso: { clave: string; paso: string; marcaId: string | null },
  pedido: PedidoAClaude,
) => Promise<RespuestaDeClaude>
