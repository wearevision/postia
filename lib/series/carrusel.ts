import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { z } from "zod"
import { Falla } from "@/lib/dominio/falla"
import type { Pedir } from "@/lib/ia/claude"
import { type Carrusel, Lamina, revisarCarrusel } from "@/lib/plantillas/laminas"
import type { IdDeTema } from "@/lib/plantillas/temas"
import type { ContextoDeRedaccion } from "@/lib/redaccion/instrucciones"
import { leer, textoValido } from "@/lib/redaccion/redactar"
import {
  LARGO_DEL_TITULO_DEL_DOCUMENTO,
  mensajeDeCarrusel,
  mensajeDeReparacion,
  sistemaDeCarrusel,
} from "./instrucciones"
import type { HallazgoDeSerie, PasoDeEsqueleto } from "./propuestas"

// Trigger.dev only: imports the SDK helper (tests/unit/limites-del-worker.test.ts keeps it out of the Worker).

// The answer is read loose so revisarCarrusel can name the problem in Federico's words for the repair. The schema
// sent to Claude spells out every slide type (the SDK turns the limits into descriptions); an unknown[] has no JSON
// type and the SDK refuses it.
const Escrito = z.object({
  texto: z.string(),
  titulo: z.string(),
  tema: z.string(),
  antetitulo: z.string(),
  laminas: z.array(z.unknown()),
})
type Escrito = z.infer<typeof Escrito>

// The SDK (1.3) moves every keyword it does not whitelist into the description, `const` included, so each slide's
// «tipo» reached the API as a free string. The API does support `const` (structured outputs docs): put it back, so
// the slide type is constrained by the API and not only checked by revisarCarrusel after a paid answer.
const SOLO_CONST = /^\{const: ("(?:[^"\\]|\\.)*")\}$/

function conConst(nodo: unknown): unknown {
  if (Array.isArray(nodo)) return nodo.map(conConst)
  if (nodo === null || typeof nodo !== "object") return nodo
  const copia: Record<string, unknown> = {}
  for (const [clave, valor] of Object.entries(nodo)) copia[clave] = conConst(valor)
  const constante = typeof copia.description === "string" ? SOLO_CONST.exec(copia.description)?.[1] : undefined
  if (constante === undefined) return copia
  const { description: _, ...resto } = copia
  return { ...resto, const: JSON.parse(constante) }
}

const formatoDelSdk = zodOutputFormat(Escrito.extend({ laminas: z.array(Lamina) }))
export const FORMATO_DE_CARRUSEL: typeof formatoDelSdk = {
  ...formatoDelSdk,
  schema: conConst(formatoDelSdk.schema) as typeof formatoDelSdk.schema,
}

export interface CarruselEscrito {
  texto: string
  titulo: string
  tema: IdDeTema
  diseno: Carrusel
}

const PEDIDO = { modelo: "claude-opus-5-5", esfuerzo: "high", maxTokens: 16_000 } as const

type Revisado = { ok: true; titulo: string; tema: IdDeTema; diseno: Carrusel } | { ok: false; error: string }

function revisar(escrito: Escrito, temas: readonly IdDeTema[]): Revisado {
  const tema = temas.find((t) => t === escrito.tema)
  if (!tema) return { ok: false, error: `El tema «${escrito.tema}» no es de esta cuenta.` }
  const titulo = escrito.titulo.trim()
  if (!titulo) return { ok: false, error: "Falta el título del documento." }
  if ([...titulo].length > LARGO_DEL_TITULO_DEL_DOCUMENTO)
    return { ok: false, error: `El título del documento pasa los ${LARGO_DEL_TITULO_DEL_DOCUMENTO} caracteres.` }
  const r = revisarCarrusel({ antetitulo: escrito.antetitulo, laminas: escrito.laminas })
  return r.ok ? { ok: true, titulo, tema, diseno: r.carrusel } : r
}

/**
 * Plano «Escribir texto» for a carousel: the post copy, the document title, a theme of the account's voice and every
 * slide within the template limits. One paid repair gets the exact error; a second refusal fails the piece.
 */
export async function escribirCarrusel(
  pedir: Pedir,
  c: ContextoDeRedaccion,
  e: {
    clave: string
    idea: { gancho: string; resumen: string; esqueleto: readonly PasoDeEsqueleto[] }
    hallazgos: readonly HallazgoDeSerie[]
    temas: readonly IdDeTema[]
  },
): Promise<CarruselEscrito> {
  const sistema = sistemaDeCarrusel(c, e.temas)
  const encargo = mensajeDeCarrusel(e.idea, e.hallazgos)
  const primera = leer(
    await pedir(
      { clave: e.clave, paso: "carrusel", marcaId: c.marca.id },
      { ...PEDIDO, sistema, mensajes: [{ role: "user", content: encargo }], formato: FORMATO_DE_CARRUSEL },
    ),
    Escrito,
  )
  let escrito = primera
  let revisado = revisar(primera, e.temas)
  if (!revisado.ok) {
    escrito = leer(
      await pedir(
        { clave: `${e.clave}:reparar`, paso: "carrusel", marcaId: c.marca.id },
        {
          ...PEDIDO,
          sistema,
          mensajes: [
            {
              role: "user",
              content: [
                { type: "text", text: encargo },
                { type: "text", text: mensajeDeReparacion(revisado.error, primera) },
              ],
            },
          ],
          formato: FORMATO_DE_CARRUSEL,
        },
      ),
      Escrito,
    )
    revisado = revisar(escrito, e.temas)
    if (!revisado.ok) throw new Falla(`No pude ajustar las láminas a la plantilla: ${revisado.error}`)
  }
  const { texto } = textoValido({ texto: escrito.texto, nota: "" })
  return { texto, titulo: revisado.titulo, tema: revisado.tema, diseno: revisado.diseno }
}
