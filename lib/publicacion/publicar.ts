import type { MensajePush } from "@/lib/avisos/tipos"
import {
  type crearPost,
  type estadoDelDocumento,
  RechazoDeLinkedin,
  RespuestaDudosa,
  type subirDocumento,
  TokenDeLinkedinVencido,
} from "@/lib/linkedin/api"
import { esperarDocumento } from "@/lib/linkedin/documento"
import { aLittleText, enlaceDePost } from "@/lib/linkedin/dominio"
import { sha256 } from "@/lib/piezas/huella"
import { type Ruta, revisarAntesDeEnviar } from "./revision"

export interface PiezaParaPublicar {
  id: string
  marcaId: string
  cuentaId: string
  cuentaNombre: string
  ruta: Ruta
  formato: "texto" | "carrusel_pdf"
  programadaPara: string
  ventanaMinutos: number
  version: {
    id: string
    texto: string
    titulo: string | null
    archivoRuta: string | null
    archivoSha256: string | null
    huella: string
  }
  firma: { id: string; huella: string } | null
}

export interface Credencial {
  token: string
  titular: string
  expiraEn: string
}

export type Aviso = MensajePush

export interface PuertosDePublicacion {
  tomarPendientes(): Promise<PiezaParaPublicar[]>
  sinRespuesta(desde: string): Promise<{ id: string; marcaId: string; cuentaNombre: string }[]>
  credencial(cuentaId: string): Promise<Credencial | null>
  descargar(ruta: string): Promise<Uint8Array>
  reservarEnvio(pieza: PiezaParaPublicar): Promise<"reservado" | "ya_enviado">
  cerrarEnvio(piezaId: string, urn: string, enlace: string): Promise<void>
  mover(piezaId: string, a: "por_aprobar" | "a_mano" | "envio_dudoso", motivo: string): Promise<void>
  avisar(marcaId: string, aviso: Aviso): Promise<void>
  linkedin: {
    crearPost: typeof crearPost
    subirDocumento: typeof subirDocumento
    estadoDelDocumento: typeof estadoDelDocumento
  }
  esperar(ms: number): Promise<void>
  ahora(): number
}

export type ResultadoDePublicacion = "publicada" | "por_aprobar" | "a_mano" | "envio_dudoso" | "reintentar"

const QUINCE_MINUTOS_MS = 15 * 60_000

/** Message plus the network cause code, as text: whole errors can carry URLs, so they are never logged. */
function describir(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const causa = error.cause
  const codigo = causa instanceof Error && "code" in causa ? ` (${String(causa.code)})` : ""
  return `${error.message}${codigo}`
}

function aviso(pieza: { id: string; cuentaNombre: string }, titulo: string, cuerpo: string): Aviso {
  return { titulo: `${titulo} · ${pieza.cuentaNombre}`, cuerpo, url: `/piezas/${pieza.id}` }
}

async function devolver(
  p: PuertosDePublicacion,
  pieza: PiezaParaPublicar,
  a: "por_aprobar" | "a_mano" | "envio_dudoso",
  motivo: string,
): Promise<ResultadoDePublicacion> {
  await p.mover(pieza.id, a, motivo)
  const titulos = { por_aprobar: "No salió", a_mano: "Publica a mano", envio_dudoso: "Revisa LinkedIn" } as const
  await avisarSiPuede(p, pieza.marcaId, aviso(pieza, titulos[a], motivo))
  return a
}

/** The notice is best-effort: the move already protects the piece, and a failed push must not undo or hide it. */
async function avisarSiPuede(p: PuertosDePublicacion, marcaId: string, a: Aviso): Promise<void> {
  try {
    await p.avisar(marcaId, a)
  } catch (error) {
    console.error(`No pude avisar «${a.titulo}»: ${describir(error)}`)
  }
}

function revisar(p: PuertosDePublicacion, pieza: PiezaParaPublicar, credencial: Credencial | null) {
  return revisarAntesDeEnviar(
    {
      firmaHuella: pieza.firma?.huella ?? null,
      versionHuella: pieza.version.huella,
      programadaPara: pieza.programadaPara,
      ventanaMinutos: pieza.ventanaMinutos,
      ruta: pieza.ruta,
      conexionExpira: credencial?.expiraEn ?? null,
    },
    p.ahora(),
  )
}

/** One due piece. The reservation is written right before the only irreversible call (POST /rest/posts). */
export async function publicarPieza(
  p: PuertosDePublicacion,
  pieza: PiezaParaPublicar,
): Promise<ResultadoDePublicacion> {
  const credencial = pieza.ruta === "api" ? await p.credencial(pieza.cuentaId) : null
  const revision = revisar(p, pieza, credencial)
  if (!revision.ok) return devolver(p, pieza, revision.destino, revision.motivo)
  // revisarAntesDeEnviar already refuses a missing connection; this only narrows the type for what follows.
  if (!credencial) return devolver(p, pieza, "a_mano", "No encontré la conexión de LinkedIn de esta cuenta.")

  let documento: { id: string; titulo: string } | null = null
  if (pieza.formato === "carrusel_pdf") {
    const { archivoRuta, archivoSha256, titulo } = pieza.version
    if (!archivoRuta || !archivoSha256 || !titulo) {
      return devolver(p, pieza, "por_aprobar", "Al carrusel le falta su PDF o su título.")
    }
    // The stored hash is only trusted after re-reading the bytes that will actually be uploaded.
    const datos = await p.descargar(archivoRuta)
    if (sha256(datos) !== archivoSha256)
      return devolver(p, pieza, "por_aprobar", "El archivo cambió después de la firma.")
    try {
      const id = await p.linkedin.subirDocumento({ token: credencial.token, autor: credencial.titular, datos })
      const estado = await esperarDocumento(
        { estadoDelDocumento: p.linkedin.estadoDelDocumento, esperar: p.esperar },
        credencial.token,
        id,
      )
      if (estado === "fallido") return devolver(p, pieza, "a_mano", "LinkedIn no pudo procesar el PDF.")
      if (estado === "procesando") return "reintentar"
      documento = { id, titulo }
    } catch (error) {
      if (error instanceof TokenDeLinkedinVencido)
        return devolver(p, pieza, "a_mano", "La conexión de LinkedIn venció.")
      if (error instanceof RechazoDeLinkedin) {
        return devolver(p, pieza, "a_mano", `LinkedIn rechazó el PDF (HTTP ${error.http}).`)
      }
      // Nothing was posted: the lease expires and the next run tries again inside the window.
      console.error(`Falla pasajera al subir el PDF de la pieza ${pieza.id}: ${describir(error)}`)
      return "reintentar"
    }
  }

  // The document wait can take minutes: the window is checked again at the last moment before reserving.
  const ultima = revisar(p, pieza, credencial)
  if (!ultima.ok) return devolver(p, pieza, ultima.destino, ultima.motivo)

  let reserva: "reservado" | "ya_enviado"
  try {
    reserva = await p.reservarEnvio(pieza)
  } catch (error) {
    // The database refused (window, version, signature) or failed: nothing was sent and the piece is still
    // scheduled, so the next run's review decides.
    console.error(`No pude reservar el envío de la pieza ${pieza.id}: ${describir(error)}`)
    return "reintentar"
  }
  if (reserva === "ya_enviado") {
    return devolver(
      p,
      pieza,
      "a_mano",
      "Ya hubo un envío anotado con esta firma: revisa LinkedIn y publícala a mano si no salió.",
    )
  }

  let urn: string
  try {
    const base = {
      token: credencial.token,
      autor: credencial.titular,
      commentary: aLittleText(pieza.version.texto),
      visibilidad: "PUBLIC",
    } as const
    urn = await p.linkedin.crearPost(documento ? { ...base, documento: documento.id, titulo: documento.titulo } : base)
  } catch (error) {
    if (error instanceof TokenDeLinkedinVencido) return devolver(p, pieza, "a_mano", "La conexión de LinkedIn venció.")
    if (error instanceof RechazoDeLinkedin) {
      return devolver(p, pieza, "a_mano", `LinkedIn rechazó la publicación (HTTP ${error.http}).`)
    }
    console.error(`Envío dudoso de la pieza ${pieza.id}: ${describir(error)}`)
    const detalle = error instanceof RespuestaDudosa ? error.message : "LinkedIn no respondió."
    return devolver(p, pieza, "envio_dudoso", `${detalle} Puede que haya salido: revisa el perfil antes de hacer algo.`)
  }

  const enlace = enlaceDePost(urn)
  try {
    await p.cerrarEnvio(pieza.id, urn, enlace)
  } catch (error) {
    console.error(`Salió ${urn} pero no pude cerrar la pieza ${pieza.id}: ${describir(error)}`)
    return devolver(
      p,
      pieza,
      "envio_dudoso",
      `Salió en LinkedIn (${enlace}), pero no pude anotarlo. Ciérrala con «Ya lo publiqué» y ese enlace.`,
    )
  }
  return "publicada"
}

/** One run of the scheduled task: due pieces one by one, then sends left without an answer. */
export async function publicarPendientes(p: PuertosDePublicacion): Promise<Record<ResultadoDePublicacion, number>> {
  const cuenta = { publicada: 0, por_aprobar: 0, a_mano: 0, envio_dudoso: 0, reintentar: 0 }
  for (const pieza of await p.tomarPendientes()) {
    try {
      cuenta[await publicarPieza(p, pieza)]++
    } catch (error) {
      // One piece must not starve the others. A throw before the reservation sent nothing; after it, the
      // "sin respuesta" sweep below parks the piece as doubtful.
      console.error(`No pude procesar la pieza ${pieza.id}: ${describir(error)}`)
      cuenta.reintentar++
    }
  }
  const desde = new Date(p.ahora() - QUINCE_MINUTOS_MS).toISOString()
  for (const colgada of await p.sinRespuesta(desde)) {
    const motivo = "El envío quedó sin respuesta: revisa si salió."
    try {
      await p.mover(colgada.id, "envio_dudoso", motivo)
    } catch (error) {
      console.error(`No pude marcar como dudosa la pieza ${colgada.id}: ${describir(error)}`)
      continue
    }
    await avisarSiPuede(p, colgada.marcaId, aviso(colgada, "Revisa LinkedIn", motivo))
    cuenta.envio_dudoso++
  }
  return cuenta
}
