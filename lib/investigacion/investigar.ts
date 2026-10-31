import type Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { Falla } from "@/lib/dominio/falla"
import type { ModeloClaude } from "@/lib/gasto/precios"
import type { Pedir, RespuestaDeClaude } from "@/lib/ia/claude"
import type { HallazgoNuevo, ResultadoDeGuardar } from "@/lib/mapa/repositorio"
import { Informe, urlsDeLaBusqueda, validarInforme } from "./informe"
import {
  type EnfoqueDeInvestigacion,
  type FormatoDeInvestigacion,
  herramientaDeBusqueda,
  mensajeDeAmpliacion,
  mensajeDeEncargo,
  mensajeDeOrden,
  mensajeDeVigilancia,
  sistemaDeBusqueda,
  sistemaDeOrden,
} from "./instrucciones"

// Trigger.dev only: imports the SDK helper (tests/unit/limites-del-worker.test.ts keeps it out of the Worker).

export interface Trabajo {
  id: string
  tipo: "investigar" | "ampliar"
  investigacionId: string
  /** Only for an extension: the angle searched again. */
  angulo: string | null
  tema: string
  /** Null for a watch. */
  cantidad: number | null
  formato: FormatoDeInvestigacion | null
  enfoque: EnfoqueDeInvestigacion | null
  origen: "encargo" | "vigilancia"
  /** For an extension, the links the report already has. */
  ya: string[]
}

export interface Angulo {
  nombre: string
  por_que: string
}

export interface PuertosDeInvestigacion {
  pedir: Pedir
  /** One paid Voyage call for the whole batch, vectors in input order. */
  embeber(clave: string, textos: string[]): Promise<number[][]>
  guardarHallazgo(h: HallazgoNuevo & { investigacionId: string; angulo: string }): Promise<ResultadoDeGuardar>
  cerrar(investigacionId: string, angulos: Angulo[]): Promise<void>
}

export interface ResultadoDeInvestigacion {
  guardados: number
  repetidos: number
  inventados: number
  linkedin: number
  /** Angles with at least one finding saved now (the watch closes once with all of them). */
  angulos: Angulo[]
}

const CONTINUACIONES = 2
const MAX_TOKENS = 8000
const SIN_FUENTES = "La búsqueda no encontró fuentes que pueda citar. Prueba con otro enfoque."
const ILEGIBLE = "Claude devolvió un informe que no pude leer. Pide la investigación de nuevo."

function busquedasPermitidas(t: Trabajo): number {
  if (t.origen === "vigilancia") return 3
  if (t.tipo === "ampliar") return 4
  return Math.min(4 + (t.cantidad ?? 0), 8)
}

function modeloDe(t: Trabajo): { modelo: ModeloClaude; esfuerzo: "low" | "medium" } {
  return t.origen === "vigilancia"
    ? { modelo: "claude-sonnet-5-5", esfuerzo: "low" }
    : { modelo: "claude-opus-5-5", esfuerzo: "medium" }
}

function mensajeDe(t: Trabajo, desde: string | undefined): Anthropic.MessageParam {
  if (t.tipo === "ampliar") return mensajeDeAmpliacion({ tema: t.tema, angulo: t.angulo ?? "", ya: t.ya })
  if (t.origen === "vigilancia") return mensajeDeVigilancia(t.tema, desde ?? "")
  return mensajeDeEncargo({
    tema: t.tema,
    cantidad: t.cantidad ?? 1,
    formato: t.formato ?? "texto",
    enfoque: t.enfoque,
  })
}

const busquedasHechas = (bloques: readonly Anthropic.ContentBlock[]) =>
  bloques.filter((b) => b.type === "server_tool_use" && b.name === "web_search").length

/**
 * The server loop pauses (`pause_turn`) when it runs long: the assistant turn goes back as is, under its own ledger
 * key, with only the searches still allowed. A last pause, a pause with no searches left or a cut keeps what was
 * gathered: notes can be partial, and the run never searches more than the estimate reserved.
 */
async function buscar(
  p: PuertosDeInvestigacion,
  t: Trabajo,
  base: string,
  desde: string | undefined,
): Promise<{ notas: string; bloques: Anthropic.ContentBlock[] }> {
  const permitidas = busquedasPermitidas(t)
  const pregunta = mensajeDe(t, desde)
  const bloques: Anthropic.ContentBlock[] = []
  const textos: string[] = []
  for (let n = 0; n <= CONTINUACIONES; n++) {
    const quedan = permitidas - busquedasHechas(bloques)
    if (quedan < 1) break
    const mensajes: Anthropic.MessageParam[] =
      n === 0 ? [pregunta] : [pregunta, { role: "assistant", content: [...bloques] }]
    const respuesta: RespuestaDeClaude = await p.pedir(
      { clave: `${base}:buscar:${n}`, paso: "buscar", marcaId: null },
      {
        ...modeloDe(t),
        sistema: sistemaDeBusqueda(),
        mensajes,
        maxTokens: MAX_TOKENS,
        herramientas: [herramientaDeBusqueda(quedan)],
      },
    )
    if (respuesta.detenido === "refusal") throw new Falla("Claude no quiso investigar este tema.")
    bloques.push(...respuesta.bloques)
    textos.push(respuesta.texto)
    if (respuesta.detenido !== "pause_turn") break
  }
  return { notas: textos.join(""), bloques }
}

function leerInforme(respuesta: RespuestaDeClaude): Informe {
  if (respuesta.detenido === "refusal") throw new Falla("Claude no quiso ordenar esta investigación.")
  if (respuesta.detenido === "max_tokens")
    throw new Falla("El informe de Claude quedó cortado. Pide la investigación de nuevo.")
  let datos: unknown
  try {
    datos = JSON.parse(respuesta.texto)
  } catch (error) {
    console.error("Claude devolvió JSON inválido", error instanceof Error ? error.message : String(error))
    throw new Falla(ILEGIBLE)
  }
  const leido = Informe.safeParse(datos)
  if (!leido.success) throw new Falla(ILEGIBLE)
  return leido.data
}

/**
 * One research run in two paid steps: search the web (never LinkedIn), then sort the notes into angles with a cheaper
 * model and no tools. Only findings whose link the search returned survive; they are embedded once and saved through
 * guardar_hallazgo, which refuses repeats. `clave` replaces the job's ledger base (the watch's per-topic key).
 */
export async function investigarUno(
  p: PuertosDeInvestigacion,
  t: Trabajo,
  opciones: { desde?: string; clave?: string; cerrar?: boolean } = {},
): Promise<ResultadoDeInvestigacion> {
  const base = opciones.clave ?? `investigar:${t.id}`
  const { notas, bloques } = await buscar(p, t, base, opciones.desde)
  const urls = urlsDeLaBusqueda(bloques)
  if (urls.size === 0) throw new Falla(SIN_FUENTES)

  const respuesta = await p.pedir(
    { clave: `${base}:ordenar`, paso: "ordenar", marcaId: null },
    {
      modelo: "claude-sonnet-5-5",
      sistema: sistemaDeOrden(),
      mensajes: [mensajeDeOrden(notas, urls)],
      maxTokens: MAX_TOKENS,
      esfuerzo: "low",
      formato: zodOutputFormat(Informe),
    },
  )
  const validado = validarInforme(leerInforme(respuesta), urls, { desde: opciones.desde })
  const hallazgos = validado.angulos.flatMap((a) =>
    a.hallazgos.map((h) => ({ ...h, angulo: t.tipo === "ampliar" && t.angulo ? t.angulo : a.nombre })),
  )
  if (hallazgos.length === 0) throw new Falla(SIN_FUENTES)

  const vectores = await p.embeber(
    `${base}:vectores`,
    hallazgos.map((h) => h.resumen),
  )
  let guardados = 0
  let repetidos = 0
  const conHallazgos = new Set<string>()
  for (const [i, h] of hallazgos.entries()) {
    const r = await p.guardarHallazgo({
      resumen: h.resumen,
      cita: h.cita,
      enlace: h.enlace,
      medio: h.medio,
      publicadoEn: h.publicado_en,
      vector: vectores[i],
      investigacionId: t.investigacionId,
      angulo: h.angulo,
    })
    if (r.estado === "guardado") {
      guardados++
      conHallazgos.add(h.angulo)
    } else repetidos++
  }

  // An extension adds to an angle the report already lists; cerrar_investigacion keeps existing names anyway.
  const angulos =
    t.tipo === "ampliar"
      ? []
      : validado.angulos
          .filter((a) => conHallazgos.has(a.nombre))
          .map((a) => ({ nombre: a.nombre, por_que: a.por_que }))
  if (opciones.cerrar !== false) await p.cerrar(t.investigacionId, angulos)
  return { guardados, repetidos, ...validado.descartados, angulos }
}
