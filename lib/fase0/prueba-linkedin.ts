import { Falla } from "@/lib/dominio/falla"
import type { crearPost, EstadoDeDocumento, Visibilidad } from "@/lib/linkedin/api"
import {
  aLittleText,
  BYTES_MAXIMOS_DEL_DOCUMENTO,
  enlaceDePost,
  LARGO_MAXIMO_DEL_TEXTO,
  tituloDelDocumento,
} from "@/lib/linkedin/dominio"

const SONDEOS_MAXIMOS = 20
const ESPERA_ENTRE_SONDEOS_MS = 3_000

export interface DepsDePrueba {
  api: {
    crearPost: typeof crearPost
    subirDocumento: (entrada: { token: string; autor: string; datos: Uint8Array }) => Promise<string>
    estadoDelDocumento: (entrada: { token: string; documento: string }) => Promise<EstadoDeDocumento>
  }
  /** Shows what will go out, exactly, and answers true only if the person signs. */
  confirmar: (resumen: string) => Promise<boolean>
  esperar: (ms: number) => Promise<void>
  ahora: () => number
}

export interface Credencial {
  token: string
  titular: string
  expiraEn: string
}

export type PedidoDePrueba =
  | { paso: "texto"; texto: string; visibilidad: Visibilidad }
  | { paso: "carrusel"; texto: string; pdf: Uint8Array; titulo: string; visibilidad: Visibilidad }

export type ResultadoDePrueba =
  | { estado: "cancelada" }
  | { estado: "publicada"; urn: string; enlace: string }
  | { estado: "documento_fallido" | "documento_tarde"; documento: string }

function resumenDe(pedido: PedidoDePrueba): string {
  const lineas = [
    `Paso: ${pedido.paso}`,
    `Visibilidad: ${pedido.visibilidad}`,
    "Texto exacto:",
    "-----",
    pedido.texto,
    "-----",
  ]
  if (pedido.paso === "carrusel") {
    lineas.push(`Título del documento: ${tituloDelDocumento(pedido.titulo)}`, `PDF: ${pedido.pdf.byteLength} bytes`)
  }
  return lineas.join("\n")
}

async function esperarDocumento(deps: DepsDePrueba, token: string, documento: string): Promise<EstadoDeDocumento> {
  for (let sondeo = 0; sondeo < SONDEOS_MAXIMOS; sondeo++) {
    const estado = await deps.api.estadoDelDocumento({ token, documento })
    if (estado !== "procesando") return estado
    await deps.esperar(ESPERA_ENTRE_SONDEOS_MS)
  }
  return "procesando"
}

/** Phase 0: one signed post on Federico's profile. No retries: a doubtful answer is checked by a person. */
export async function publicarPrueba(
  deps: DepsDePrueba,
  credencial: Credencial,
  pedido: PedidoDePrueba,
): Promise<ResultadoDePrueba> {
  if (Date.parse(credencial.expiraEn) <= deps.ahora()) {
    throw new Falla("La conexión de LinkedIn venció. Renuévala en Marcas.")
  }
  const texto = pedido.texto.trim()
  if (!texto || texto.length > LARGO_MAXIMO_DEL_TEXTO) {
    throw new Falla(`El texto debe tener entre 1 y ${LARGO_MAXIMO_DEL_TEXTO} caracteres.`)
  }
  if (pedido.paso === "carrusel" && pedido.pdf.byteLength > BYTES_MAXIMOS_DEL_DOCUMENTO) {
    throw new Falla("El PDF pasa los 100 MB que acepta LinkedIn.")
  }

  if (!(await deps.confirmar(resumenDe(pedido)))) return { estado: "cancelada" }

  const base = {
    token: credencial.token,
    autor: credencial.titular,
    commentary: aLittleText(texto),
    visibilidad: pedido.visibilidad,
  }
  if (pedido.paso === "texto") {
    const urn = await deps.api.crearPost(base)
    return { estado: "publicada", urn, enlace: enlaceDePost(urn) }
  }

  const documento = await deps.api.subirDocumento({
    token: credencial.token,
    autor: credencial.titular,
    datos: pedido.pdf,
  })
  const estado = await esperarDocumento(deps, credencial.token, documento)
  if (estado === "fallido") return { estado: "documento_fallido", documento }
  if (estado === "procesando") return { estado: "documento_tarde", documento }
  const urn = await deps.api.crearPost({ ...base, documento, titulo: tituloDelDocumento(pedido.titulo) })
  return { estado: "publicada", urn, enlace: enlaceDePost(urn) }
}
