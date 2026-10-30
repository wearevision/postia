import { z } from "zod"
import { Falla } from "@/lib/dominio/falla"
import { exigirEnv } from "@/lib/env"
import { type AvisoDeTope, type LibroDeGastos, pagar } from "@/lib/gasto/pagar"
import { costoDeVoyage, estimarVoyage } from "@/lib/gasto/precios"

// Trigger.dev tasks and scripts only: tests/unit/limites-del-worker.test.ts keeps lib/ia/ out of the Worker.

export const MODELO_DE_VECTORES = "voyage-4"
export const DIMENSIONES = 1024
const URL_DE_VOYAGE = "https://api.voyageai.com/v1/embeddings"

// Voyage takes up to 1,000 texts and 320K tokens per request. At the estimate's two tokens per character, 150,000
// characters stays under the token limit.
const TEXTOS_POR_LOTE = 128
const CARACTERES_POR_LOTE = 150_000

export class ErrorDeVoyage extends Error {
  constructor(
    readonly status: number,
    detalle: string,
  ) {
    super(`Voyage respondió ${status}: ${detalle}`)
    this.name = "ErrorDeVoyage"
  }
}

/** A 4xx (except 408, which may have reached the model) means Voyage refused before working: nothing was charged. */
export function esRechazoProbadoDeVoyage(error: unknown): boolean {
  return error instanceof ErrorDeVoyage && error.status >= 400 && error.status < 500 && error.status !== 408
}

const Respuesta = z.object({
  data: z.array(z.object({ embedding: z.array(z.number()).length(DIMENSIONES), index: z.number().int() })),
  usage: z.object({ total_tokens: z.number().int().nonnegative() }),
})

export type LlamarVoyage = (textos: string[]) => Promise<{ vectores: number[][]; tokens: number }>

/**
 * Every comparison in PostIA is document to document (duplicates, topics, crosses), so every text is a `document`:
 * one vector space for all of them.
 */
export function llamarVoyageReal(
  entorno: Record<string, string | undefined> = process.env,
  hacerFetch: typeof fetch = fetch,
): LlamarVoyage {
  const llave = exigirEnv("VOYAGE_API_KEY", entorno.VOYAGE_API_KEY)
  return async (textos) => {
    const respuesta = await hacerFetch(URL_DE_VOYAGE, {
      method: "POST",
      headers: { Authorization: `Bearer ${llave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        input: textos,
        model: MODELO_DE_VECTORES,
        input_type: "document",
        output_dimension: DIMENSIONES,
        truncation: true,
      }),
    })
    if (!respuesta.ok) throw new ErrorDeVoyage(respuesta.status, (await respuesta.text()).slice(0, 300))
    const datos = Respuesta.parse(await respuesta.json())
    if (datos.data.length !== textos.length) {
      throw new Error(`Voyage devolvió ${datos.data.length} vectores para ${textos.length} textos.`)
    }
    const ordenados = [...datos.data].sort((a, b) => a.index - b.index)
    if (ordenados.some((d, i) => d.index !== i)) {
      throw new Error("Voyage devolvió índices repetidos o fuera de rango: no sé qué vector va con qué texto.")
    }
    const vectores = ordenados.map((d) => d.embedding)
    return { vectores, tokens: datos.usage.total_tokens }
  }
}

export function lotes(textos: string[]): string[][] {
  const resultado: string[][] = []
  let actual: string[] = []
  let caracteres = 0
  for (const texto of textos) {
    if (actual.length > 0 && (actual.length === TEXTOS_POR_LOTE || caracteres + texto.length > CARACTERES_POR_LOTE)) {
      resultado.push(actual)
      actual = []
      caracteres = 0
    }
    actual.push(texto)
    caracteres += texto.length
  }
  if (actual.length > 0) resultado.push(actual)
  return resultado
}

export interface PuertosDeVoyage {
  libro: LibroDeGastos
  avisar(avisos: AvisoDeTope[]): Promise<void>
  llamar: LlamarVoyage
}

/** Vectors in input order. Spend without a brand: always «General» (block 4 decision). */
export async function embeberPagando(
  puertos: PuertosDeVoyage,
  paso: { clave: string; paso: string },
  textos: string[],
): Promise<number[][]> {
  if (textos.some((t) => t.trim() === "")) throw new Falla("No puedo convertir en vector un texto vacío.")
  const resultado: number[][] = []
  for (const [n, lote] of lotes(textos).entries()) {
    const vectores = await pagar(
      { libro: puertos.libro, avisar: puertos.avisar, esRechazoProbado: esRechazoProbadoDeVoyage },
      {
        clave: `${paso.clave}:${n}`,
        proveedor: "voyage",
        paso: paso.paso,
        estimadoMicro: estimarVoyage(lote.join("").length),
        marcaId: null,
      },
      async () => {
        const { vectores, tokens } = await puertos.llamar(lote)
        return { resultado: vectores, costoMicro: costoDeVoyage(tokens) }
      },
    )
    resultado.push(...vectores)
  }
  return resultado
}

/** `embeberPagando` with its ports bound: what product code receives. */
export type Embeber = (paso: { clave: string; paso: string }, textos: string[]) => Promise<number[][]>
