import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { z } from "zod"
import { Falla } from "@/lib/dominio/falla"
import { PasoYaPagado, TopeAlcanzado } from "@/lib/gasto/pagar"
import type { Pedir, RespuestaDeClaude } from "@/lib/ia/claude"
import { AVISO_DE_DATOS, comoDatos } from "@/lib/redaccion/instrucciones"
import { mediana, tasa } from "./resumen"

// Trigger.dev only: imports the SDK helper (tests/unit/limites-del-worker.test.ts keeps it out of the Worker).
// Only figures imported from Federico's own export reach Claude: the repository filters origin «importacion».

export interface LecturaTomada {
  id: string
  cuentaId: string
}

export interface PublicacionLeida {
  /** metricas_de_publicacion id: what Claude cites. */
  id: string
  /** `YYYY-MM-DD`. */
  publicadaEl: string
  /** The piece's latest text, else the export's extract; null when the post has neither. */
  texto: string | null
  formato: "texto" | "carrusel_pdf" | null
  pilar: string | null
  impresiones: number | null
  interacciones: number | null
  clics: number | null
}

export interface ContextoDeLectura {
  marcaId: string
  voz: "yo" | "nosotros"
  cuenta: { nombre: string; tipo: "persona" | "empresa" }
  pilares: string[]
}

export interface AprendizajeParaGuardar {
  texto: string
  porque: string
  respaldo: number
  publicaciones: string[]
}

export interface PuertosDeLectura {
  /** Leases one reading (the database hands out one at a time). */
  tomar(): Promise<LecturaTomada[]>
  publicacionesParaLeer(cuentaId: string): Promise<PublicacionLeida[]>
  contexto(cuentaId: string): Promise<ContextoDeLectura>
  guardar(lecturaId: string, items: AprendizajeParaGuardar[]): Promise<number>
  terminar(lecturaId: string, estado: "lista" | "fallo", motivo: string | null): Promise<void>
  pedir: Pedir
}

const MINIMO_DE_PUBLICACIONES = 3
const MAXIMO_DE_PUBLICACIONES = 60
const LARGO_DEL_TEXTO = 1500
const MAXIMO_DE_APRENDIZAJES = 6
// Same limit as aprendizajes.texto: the database refuses the whole batch if one learning passes it.
const LARGO_DEL_APRENDIZAJE = 400
const LARGO_DEL_PORQUE = 600
const PEDIDO = { modelo: "claude-opus-5-5", esfuerzo: "high", maxTokens: 4000 } as const

const POCAS = "Muy pocas publicaciones con texto para aprender todavía."
const NADA_CLARO = "Claude no encontró aprendizajes claros en estas publicaciones."

const Respuesta = z.object({
  aprendizajes: z.array(z.object({ texto: z.string(), porque: z.string(), publicaciones: z.array(z.string()) })),
})
const FORMATO = zodOutputFormat(Respuesta)

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const

interface PublicacionConRasgos extends PublicacionLeida {
  texto: string
  tasa: number
  largo: number
  abreConCifra: boolean
  tieneEnlace: boolean
  diaDeLaSemana: string
}

function conRasgos(p: PublicacionLeida): PublicacionConRasgos | null {
  const t = tasa(p)
  const texto = p.texto?.trim()
  if (!texto || t === null) return null
  const primera = texto.split("\n")[0] ?? ""
  return {
    ...p,
    texto: [...texto].slice(0, LARGO_DEL_TEXTO).join(""),
    tasa: t,
    largo: [...texto].length,
    abreConCifra: /\d/.test(primera),
    tieneEnlace: /https?:\/\/|www\./i.test(texto),
    diaDeLaSemana: DIAS[new Date(`${p.publicadaEl}T12:00:00Z`).getUTCDay()] ?? "",
  }
}

const porcentaje = (razon: number) => `${(razon * 100).toFixed(1).replace(".", ",")} %`
const sino = (v: boolean) => (v ? "sí" : "no")
const cifra = (v: number | null) => (v === null ? "sin dato" : String(v))

function sistemaDeLectura(c: ContextoDeLectura): string {
  const voz =
    c.voz === "nosotros"
      ? "La cuenta habla como «nosotros»: los aprendizajes se escriben pensando en esa voz."
      : "La cuenta habla como «yo»: los aprendizajes se escriben pensando en esa voz."
  return [
    `Lees el rendimiento de las publicaciones de LinkedIn de la cuenta «${c.cuenta.nombre}» y propones qué aprender de ellas para escribir mejor, en español de Chile.`,
    voz,
    c.pilares.length > 0 ? `Los pilares de contenido de la marca son: ${c.pilares.join(", ")}.` : null,
    [
      "# Qué entregas",
      `De 3 a ${MAXIMO_DE_APRENDIZAJES} aprendizajes (menos si los datos no dan para más). Cada uno:`,
      `- texto: una sola frase accionable que Federico pueda aplicar al escribir (hasta ${LARGO_DEL_APRENDIZAJE} caracteres), sin necesitar cifras.`,
      `- porque: una o dos frases que citan lo que muestran las publicaciones (hasta ${LARGO_DEL_PORQUE} caracteres).`,
      "- publicaciones: los ids exactos de las publicaciones que lo respaldan, tal como aparecen entre corchetes.",
    ].join("\n"),
    [
      "# Reglas",
      "- Solo lo que las cifras muestran. Una correlación no es una causa y una muestra chica es una pista: dilo en el porque cuando pase.",
      "- Un aprendizaje por patrón; no repitas el mismo con otras palabras.",
      "- No inventes cifras ni publicaciones. No nombres clientes ni personas.",
      "- La tasa es interacciones ÷ impresiones. Compárala con la mediana de la cuenta, no con otras cuentas.",
    ].join("\n"),
    AVISO_DE_DATOS,
  ]
    .filter(Boolean)
    .join("\n\n")
}

function lineaDe(p: PublicacionConRasgos): string {
  return [
    `[${p.id}] ${p.publicadaEl} (${p.diaDeLaSemana}) · ${p.formato ?? "formato desconocido"} · pilar: ${p.pilar ?? "sin pilar"}`,
    `impresiones ${cifra(p.impresiones)} · interacciones ${cifra(p.interacciones)} · tasa ${porcentaje(p.tasa)} · clics ${cifra(p.clics)}`,
    `rasgos: largo ${p.largo} caracteres; abre con cifra: ${sino(p.abreConCifra)}; enlace: ${sino(p.tieneEnlace)}`,
    `<texto>\n${comoDatos(p.texto)}\n</texto>`,
  ].join("\n")
}

function mensajeDeLectura(posts: readonly PublicacionConRasgos[], sinTexto: number): string {
  const mediana_ = mediana(posts.map((p) => p.tasa)) ?? 0
  return [
    `Mediana de la tasa de interacción de la cuenta: ${porcentaje(mediana_)}. Publicaciones leídas: ${posts.length}.`,
    sinTexto > 0 ? `${sinTexto} publicaciones sin texto no van en la lista.` : null,
    "Las publicaciones, de mayor a menor tasa:",
    `<publicaciones>\n${posts.map(lineaDe).join("\n\n")}\n</publicaciones>`,
    AVISO_DE_DATOS,
  ]
    .filter(Boolean)
    .join("\n\n")
}

function leerRespuesta(respuesta: RespuestaDeClaude): z.infer<typeof Respuesta> {
  if (respuesta.detenido === "refusal") throw new Falla("Claude no quiso leer estas publicaciones. Vuelve a pedirlo.")
  if (respuesta.detenido === "max_tokens") throw new Falla("La respuesta de Claude quedó cortada. Vuelve a pedirla.")
  let datos: unknown
  try {
    datos = JSON.parse(respuesta.texto)
  } catch (error) {
    console.error("Claude devolvió JSON inválido", error instanceof Error ? error.message : String(error))
    throw new Falla("Claude devolvió algo que no pude leer. Vuelve a pedirlo.")
  }
  const leido = Respuesta.safeParse(datos)
  if (!leido.success) throw new Falla("Claude devolvió algo que no pude leer. Vuelve a pedirlo.")
  return leido.data
}

/** Cited ids that were not sent are dropped; the backing is the count of the valid ones. Empty or oversize text is dropped. */
function validar(respuesta: z.infer<typeof Respuesta>, enviadas: ReadonlySet<string>): AprendizajeParaGuardar[] {
  const items: AprendizajeParaGuardar[] = []
  for (const a of respuesta.aprendizajes) {
    const texto = a.texto.trim()
    if (!texto || [...texto].length > LARGO_DEL_APRENDIZAJE) continue
    const publicaciones = [...new Set(a.publicaciones.filter((id) => enviadas.has(id)))]
    items.push({
      texto,
      porque: [...a.porque.trim()].slice(0, LARGO_DEL_PORQUE).join(""),
      respaldo: publicaciones.length,
      publicaciones,
    })
    if (items.length === MAXIMO_DE_APRENDIZAJES) break
  }
  return items
}

async function leerUna(p: PuertosDeLectura, lectura: LecturaTomada): Promise<void> {
  const todas = await p.publicacionesParaLeer(lectura.cuentaId)
  const recientes = [...todas]
    .sort((a, b) => b.publicadaEl.localeCompare(a.publicadaEl))
    .slice(0, MAXIMO_DE_PUBLICACIONES)
  const sinTexto = recientes.filter((x) => !x.texto?.trim()).length
  const posts = recientes.flatMap((x) => conRasgos(x) ?? []).sort((a, b) => b.tasa - a.tasa)
  if (posts.length < MINIMO_DE_PUBLICACIONES) {
    await p.terminar(lectura.id, "lista", POCAS)
    return
  }
  const c = await p.contexto(lectura.cuentaId)
  const respuesta = await p.pedir(
    { clave: `aprender:${lectura.id}`, paso: "aprender", marcaId: c.marcaId },
    {
      ...PEDIDO,
      sistema: sistemaDeLectura(c),
      mensajes: [{ role: "user", content: mensajeDeLectura(posts, sinTexto) }],
      formato: FORMATO,
    },
  )
  const items = validar(leerRespuesta(respuesta), new Set(posts.map((x) => x.id)))
  if (items.length === 0) {
    await p.terminar(lectura.id, "lista", NADA_CLARO)
    return
  }
  await p.guardar(lectura.id, items)
  await p.terminar(lectura.id, "lista", null)
}

function motivoDe(error: TopeAlcanzado | PasoYaPagado | Falla): string {
  if (error instanceof TopeAlcanzado)
    return "Se alcanzó el tope de gasto del mes. Súbelo en Ajustes y vuelve a pedir la lectura."
  if (error instanceof PasoYaPagado)
    return "Esta lectura ya se había empezado a pagar y no sé si terminó, así que no la vuelvo a pagar. Pídela de nuevo."
  return error.message
}

const esperado = (error: unknown): error is TopeAlcanzado | PasoYaPagado | Falla =>
  error instanceof TopeAlcanzado || error instanceof PasoYaPagado || error instanceof Falla

/**
 * One attempt per reading. A failure Federico can act on closes it «fallo» with a reason; an error nobody expected
 * leaves the lease to expire (the ledger key then stops a second payment) and is rethrown so the run shows as failed.
 */
export async function leerRendimiento(p: PuertosDeLectura): Promise<{ leidas: number; fallidas: number }> {
  const lecturas = await p.tomar()
  const inesperados: unknown[] = []
  let fallidas = 0
  for (const lectura of lecturas) {
    try {
      await leerUna(p, lectura)
    } catch (error) {
      if (!esperado(error)) {
        console.error(`La lectura ${lectura.id} falló`, error instanceof Error ? error.message : String(error))
        inesperados.push(error)
        continue
      }
      fallidas++
      try {
        await p.terminar(lectura.id, "fallo", motivoDe(error))
      } catch (errorAlTerminar) {
        inesperados.push(errorAlTerminar)
      }
    }
  }
  if (inesperados.length === 1) throw inesperados[0]
  if (inesperados.length > 1) throw new AggregateError(inesperados, "Hubo lecturas con errores inesperados")
  return { leidas: lecturas.length - fallidas, fallidas }
}
