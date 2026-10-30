import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { z } from "zod"
import { Falla } from "@/lib/dominio/falla"
import type { Pedir, RespuestaDeClaude } from "@/lib/ia/claude"
import { normalizarTexto } from "@/lib/piezas/huella"
import {
  type ContextoDeRedaccion,
  instruccionesDeEscritura,
  instruccionesDeRevision,
  mensajeDeEncargo,
  mensajeDeReescritura,
  mensajeDeRevision,
} from "./instrucciones"

// Trigger.dev only: imports the SDK (tests/unit/limites-del-worker.test.ts keeps it out of the Worker).

const Escrito = z.object({ texto: z.string(), nota: z.string() })
export type Escrito = z.infer<typeof Escrito>

export const TIPOS_DE_HALLAZGO = ["cliente", "cita", "dato_sin_fuente", "atribucion", "voz", "otro"] as const

export const VeredictoDeClaude = z.object({
  voz: z.object({ ok: z.boolean(), comentario: z.string() }),
  hallazgos: z.array(z.object({ tipo: z.enum(TIPOS_DE_HALLAZGO), fragmento: z.string(), comentario: z.string() })),
})
export type VeredictoDeClaude = z.infer<typeof VeredictoDeClaude>

const LARGO_MAXIMO = 3000
const ESCRITURA = { esfuerzo: "high", maxTokens: 16_000 } as const
const REVISION = { esfuerzo: "medium", maxTokens: 8_000 } as const
const ILEGIBLE = "Claude devolvió algo que no pude leer. Pídelo de nuevo."

function leer<T>(respuesta: RespuestaDeClaude, esquema: z.ZodType<T>): T {
  if (respuesta.detenido === "refusal")
    throw new Falla("Claude no quiso escribir esto. Cambia el encargo o escríbelo a mano.")
  if (respuesta.detenido === "max_tokens") throw new Falla("La respuesta de Claude quedó cortada. Pídelo de nuevo.")
  let datos: unknown
  try {
    datos = JSON.parse(respuesta.texto)
  } catch (error) {
    console.error("Claude devolvió JSON inválido", error instanceof Error ? error.message : String(error))
    throw new Falla(ILEGIBLE)
  }
  const leido = esquema.safeParse(datos)
  if (!leido.success) throw new Falla(ILEGIBLE)
  return leido.data
}

function textoValido(escrito: Escrito): Escrito {
  const texto = normalizarTexto(escrito.texto)
  if (!texto.trim()) throw new Falla("Claude devolvió un texto vacío. Pídelo de nuevo.")
  if ([...texto].length > LARGO_MAXIMO) {
    throw new Falla("Claude escribió más de 3000 caracteres. Pide una versión más corta.")
  }
  return { texto, nota: escrito.nota.trim() }
}

export async function escribir(
  pedir: Pedir,
  c: ContextoDeRedaccion,
  e: { clave: string; encargo: string; material: string | null; pilar: string | null },
): Promise<Escrito> {
  const respuesta = await pedir(
    { clave: e.clave, paso: "escribir", marcaId: c.marca.id },
    {
      sistema: instruccionesDeEscritura(c),
      mensajes: [{ role: "user", content: mensajeDeEncargo(e) }],
      ...ESCRITURA,
      formato: zodOutputFormat(Escrito),
    },
  )
  return textoValido(leer(respuesta, Escrito))
}

export async function reescribir(
  pedir: Pedir,
  c: ContextoDeRedaccion,
  r: { clave: string; textoActual: string; instruccion: string },
): Promise<Escrito> {
  const respuesta = await pedir(
    { clave: r.clave, paso: "reescribir", marcaId: c.marca.id },
    {
      sistema: instruccionesDeEscritura(c),
      mensajes: [{ role: "user", content: mensajeDeReescritura(r.textoActual, r.instruccion) }],
      ...ESCRITURA,
      formato: zodOutputFormat(Escrito),
    },
  )
  return textoValido(leer(respuesta, Escrito))
}

export async function revisar(
  pedir: Pedir,
  c: ContextoDeRedaccion,
  r: { clave: string; texto: string; material: string | null },
): Promise<VeredictoDeClaude> {
  const respuesta = await pedir(
    { clave: r.clave, paso: "revisar", marcaId: c.marca.id },
    {
      sistema: instruccionesDeRevision(c),
      mensajes: [{ role: "user", content: mensajeDeRevision(r.texto, r.material) }],
      ...REVISION,
      formato: zodOutputFormat(VeredictoDeClaude),
    },
  )
  return leer(respuesta, VeredictoDeClaude)
}
