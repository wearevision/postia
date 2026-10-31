import Link from "next/link"
import { notFound } from "next/navigation"
import { leerExcepciones } from "@/lib/clientes/lectura"
import { type Excepcion, type Hallazgo, prepararRevision, textoARevisar } from "@/lib/clientes/revision"
import { type DisenoDePieza, disenoDePieza } from "@/lib/disenos/lectura"
import { diaEnSantiago } from "@/lib/piezas/calendario"
import { MOTIVO_DE_FIRMA_CAIDA } from "@/lib/piezas/cambio"
import type { EstadoDePieza } from "@/lib/piezas/estados"
import { fechaLarga } from "@/lib/piezas/fechas"
import { bandeja, detalle } from "@/lib/piezas/lectura"
import { siguientePorFirmar } from "@/lib/piezas/siguiente"
import { lineaEnReserva } from "@/lib/piezas/textos"
import { textosDelDiseno } from "@/lib/plantillas/texto"
import { type EstadoDeRedaccion, estadoDeRedaccion } from "@/lib/redaccion/lectura"
import { resumenDeRevision } from "@/lib/redaccion/resumen"
import { rutaDeEditarCarrusel, rutaDePieza } from "@/lib/sesion/rutas"
import { createClient } from "@/lib/supabase/server"
import { pilaresActivos } from "@/lib/voz/lectura"
import { MarcaDeEstado } from "../../marca-de-estado"
import { Refrescar } from "../refrescar"
import { PublicarAMano } from "./a-mano"
import {
  cerrarAManoAccion,
  corregirTextoAccion,
  descartarAccion,
  desprogramarAccion,
  dudosoAManoAccion,
  firmarAccion,
  firmarParaReservaAccion,
  pedirReescrituraAccion,
  pedirRevisionAccion,
  planearAccion,
  ponerPilarAccion,
  sacarDeReservaAccion,
} from "./acciones"
import { FirmaCaida } from "./caida"
import { Descartar, Desprogramar, EnvioDudoso, SacarDeReserva } from "./controles"
import { FirmaDePieza } from "./firma"
import { FirmaConfirmada } from "./firmada"
import { FinDelTexto, LecturaDePieza } from "./lectura"
import { PilarDePieza } from "./pilar"
import { CorregirTexto, PedirOtraVersion } from "./redaccion"
import { RevisionDeClaude } from "./revision-ia"
import { Veredicto } from "./veredicto"
import { VistasDelCarrusel } from "./vistas"
import { Volver } from "./volver"

const SE_PUEDE_CAMBIAR_EL_PILAR: readonly EstadoDePieza[] = ["por_aprobar", "en_reserva", "programada"]
const SE_PUEDE_DESCARTAR: readonly EstadoDePieza[] = ["por_aprobar", "en_reserva", "programada", "a_mano", "error"]
// The states pedir_diseno accepts an edit in.
const SE_PUEDE_REARMAR: readonly EstadoDePieza[] = ["por_aprobar", "en_reserva", "programada", "a_mano"]

export default async function Pieza({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = await createClient()
  const pieza = await detalle(db, id)
  if (!pieza) notFound()
  const { estado, version, cuenta } = pieza

  // Taken before the exceptions are read: signing refuses any exception marked after it (revisarApertura).
  const abiertaEn = new Date().toISOString()

  /** Gate 1 verdict without AI; null when the exceptions could not be read. Compiles once: the Worker has 10 ms of CPU. */
  async function revisarAntesDeFirmar(): Promise<Hallazgo[] | null> {
    let excepciones: Excepcion[]
    try {
      excepciones = await leerExcepciones(db)
    } catch (error) {
      // The verdict only informs; the page must still open, and it says the clients were not reviewed.
      console.error(
        "No pude leer las excepciones para la puerta 1",
        error instanceof Error ? error.message : String(error),
      )
      return null
    }
    const revisor = prepararRevision(excepciones, diaEnSantiago(Date.now()))
    // The raw stored design, not the parsed one: a design that no longer parses still has every word reviewed.
    return revisor.revisar(
      textoARevisar(version.titulo, version.texto, ...textosDelDiseno(version.disenoCrudo)),
      cuenta.voz,
    )
  }

  const conClaude = estado === "por_aprobar" && pieza.formato === "texto"
  const piezaId = pieza.id

  /** Claude's requests and review on the piece; null when they could not be read. */
  async function leerRedaccion(): Promise<EstadoDeRedaccion | null> {
    try {
      return await estadoDeRedaccion(db, piezaId, version.id)
    } catch (error) {
      // The Claude tools only help; the page must still open, and it says it could not read them.
      console.error(
        "No pude leer lo que hizo Claude en la pieza",
        error instanceof Error ? error.message : String(error),
      )
      return null
    }
  }

  const rearmable = version.diseno !== null && SE_PUEDE_REARMAR.includes(estado)

  /** The carousel's render requests; null when they could not be read. */
  async function leerDiseno(): Promise<DisenoDePieza | null> {
    try {
      return await disenoDePieza(db, piezaId)
    } catch (error) {
      // Like Claude's tools: the page must still open, and it says it could not read them.
      console.error(
        "No pude leer los carruseles pedidos para la pieza",
        error instanceof Error ? error.message : String(error),
      )
      return null
    }
  }

  /** The next piece waiting for a signature; null when none is left or the inbox could not be read. */
  async function leerSiguiente(): Promise<string | null> {
    try {
      return siguientePorFirmar((await bandeja(db)).porFirmar, piezaId)
    } catch (error) {
      // Only a shortcut: the signed piece must still open without it.
      console.error(
        "No pude leer la bandeja para la siguiente pieza",
        error instanceof Error ? error.message : String(error),
      )
      return null
    }
  }

  const recienFirmada = estado === "programada" || estado === "en_reserva"
  const [pilares, hallazgos, redaccion, diseno, siguiente] = await Promise.all([
    SE_PUEDE_CAMBIAR_EL_PILAR.includes(estado)
      ? pilaresActivos(db).then((todos) => todos.filter((p) => p.marcaId === cuenta.marcaId))
      : [],
    estado === "por_aprobar" ? revisarAntesDeFirmar() : [],
    conClaude ? leerRedaccion() : null,
    rearmable ? leerDiseno() : null,
    recienFirmada ? leerSiguiente() : null,
  ])
  const armando = diseno?.abierto ?? false
  const firmaCaida = estado === "por_aprobar" && pieza.motivo === MOTIVO_DE_FIRMA_CAIDA
  const porFirmar = estado === "por_aprobar"
  const { pilarId, pilarNombre } = pieza
  const conPilar = SE_PUEDE_CAMBIAR_EL_PILAR.includes(estado) && (pilares.length > 0 || pilarId !== null)
  // Claude's tools need its requests read and none in flight.
  const redaccionLista = conClaude && redaccion !== null && !redaccion.pedidoAbierto && !redaccion.revisandoAuto

  function estadoDelCarrusel() {
    if (!diseno) return <p className="text-sm">No pude leer si se está armando el carrusel. Recarga en un rato.</p>
    if (diseno.abierto)
      return <Refrescar mensaje="Se está armando la nueva versión del carrusel. Esta página se actualiza sola." />
    return (
      <>
        {diseno.ultimoFallo && <p className="text-sm">{diseno.ultimoFallo}</p>}
        <Link href={rutaDeEditarCarrusel(piezaId)} className="boton w-full py-3">
          Editar el carrusel
        </Link>
      </>
    )
  }

  function pilarDePieza() {
    return (
      <PilarDePieza
        piezaId={piezaId}
        pilarId={pilarId}
        pilarNombre={pilarNombre}
        pilares={pilares}
        poner={ponerPilarAccion}
      />
    )
  }

  return (
    <LecturaDePieza key={version.huella} laminas={version.vistas.length} className="mx-auto max-w-md space-y-5">
      <Volver />
      <header className="space-y-2">
        <p className="inline-block rounded-full border border-borde px-3 py-1 text-sm">{cuenta.nombre}</p>
        <h1 className="text-2xl font-semibold">{version.titulo ?? "Post de texto"}</h1>
        <p>
          <MarcaDeEstado estado={estado} />
        </p>
        {pieza.motivo && !firmaCaida && <p className="text-sm">{pieza.motivo}</p>}
        {!SE_PUEDE_CAMBIAR_EL_PILAR.includes(estado) && pieza.pilarNombre && (
          <p className="text-sm text-apagado">Pilar: {pieza.pilarNombre}</p>
        )}
      </header>

      {firmaCaida && <FirmaCaida cambio={pieza.cambio} />}

      {!porFirmar && conPilar && pilarDePieza()}

      {/* The piece as it goes out comes first. FinDelTexto must follow the text: reaching it unlocks signing. */}
      {version.vistas.length > 0 && <VistasDelCarrusel vistas={version.vistas} />}
      <p className="whitespace-pre-wrap tarjeta p-3">{version.texto}</p>
      {porFirmar && !armando && <FinDelTexto />}
      {rearmable && (!porFirmar || armando) && estadoDelCarrusel()}

      {porFirmar && (
        <details className="tarjeta p-3">
          <summary className="min-h-11 cursor-pointer py-2 font-medium">
            Revisión ·{" "}
            {resumenDeRevision({
              hallazgos,
              revision: redaccion?.revision ?? null,
              claudeIlegible: conClaude && !redaccion,
            })}
          </summary>
          <div className="space-y-3 pt-2">
            <Veredicto hallazgos={hallazgos} />
            {redaccionLista && redaccion && (
              <RevisionDeClaude
                piezaId={pieza.id}
                revision={redaccion.revision}
                pedirRevision={pedirRevisionAccion}
                puedePedir={!redaccion.pedidoAbierto}
              />
            )}
          </div>
        </details>
      )}

      {conClaude && !redaccion && <p className="text-sm">No pude leer lo que hizo Claude. Recarga en un rato.</p>}
      {conClaude && redaccion && (
        <>
          {version.origen === "claude" && (
            <p className="text-sm text-apagado">
              Texto escrito con IA: puede tener errores. Léelo entero antes de firmar.
            </p>
          )}
          {redaccion.ultimoFallo && <p className="text-sm">{redaccion.ultimoFallo}</p>}
          {(redaccion.pedidoAbierto || redaccion.revisandoAuto) && <Refrescar />}
        </>
      )}
      {porFirmar && !armando && version.diseno === null && version.disenoCrudo != null && (
        <div className="space-y-2">
          <p className="text-sm">No pude leer las láminas de esta versión. Revisa el PDF antes de firmar.</p>
          {/* The only place left with the PDF before signing: without readable slides it is the piece to review. */}
          {version.archivoUrl && (
            <a href={version.archivoUrl} className="boton w-full py-3">
              Ver el PDF
            </a>
          )}
        </div>
      )}
      {porFirmar && !armando && (
        <FirmaDePieza
          key={pieza.fechaPropuesta}
          piezaId={pieza.id}
          huella={version.huella}
          fechaPropuesta={pieza.fechaPropuesta}
          abiertaEn={abiertaEn}
          ruta={cuenta.ruta}
          cuenta={cuenta.nombre}
          firmar={firmarAccion}
          firmarParaReserva={firmarParaReservaAccion}
          planear={planearAccion}
          reescribiendo={redaccion?.reescribiendo ?? false}
        />
      )}

      {porFirmar && (conPilar || redaccionLista || (rearmable && !armando)) && (
        <details className="tarjeta p-3">
          <summary className="min-h-11 cursor-pointer py-2 font-medium">Cambiar</summary>
          <div className="space-y-3 pt-2">
            {conPilar && pilarDePieza()}
            {redaccionLista && redaccion && (
              <>
                <CorregirTexto
                  key={version.huella}
                  piezaId={pieza.id}
                  texto={version.texto}
                  corregir={corregirTextoAccion}
                />
                <PedirOtraVersion
                  piezaId={pieza.id}
                  quedan={redaccion.reescriturasQuedan}
                  pedir={pedirReescrituraAccion}
                />
              </>
            )}
            {rearmable && !armando && estadoDelCarrusel()}
          </div>
        </details>
      )}
      {recienFirmada && <FirmaConfirmada huella={version.huella} />}
      {recienFirmada && siguiente && (
        <Link href={rutaDePieza(siguiente)} className="boton-primario w-full">
          Siguiente por firmar
        </Link>
      )}
      {estado === "en_reserva" && (
        <div className="space-y-3">
          <p>{lineaEnReserva(cuenta.ruta, cuenta.nombre)}</p>
          <SacarDeReserva piezaId={pieza.id} sacar={sacarDeReservaAccion} />
        </div>
      )}
      {estado === "programada" && pieza.programadaPara && (
        <div className="space-y-3">
          <p>
            Sale el <strong>{fechaLarga(pieza.programadaPara)}</strong>
            {cuenta.ruta === "a_mano" && ". Te aviso a esa hora para que la publiques a mano."}
          </p>
          <Desprogramar piezaId={pieza.id} desprogramar={desprogramarAccion} />
        </div>
      )}
      {estado === "a_mano" && (
        <PublicarAMano
          piezaId={pieza.id}
          texto={version.texto}
          archivoUrl={version.archivoDescarga}
          cerrar={cerrarAManoAccion}
        />
      )}
      {estado === "envio_dudoso" && (
        <EnvioDudoso piezaId={pieza.id} cerrar={cerrarAManoAccion} noSalio={dudosoAManoAccion} />
      )}
      {estado === "publicada" && pieza.enlace && (
        <a href={pieza.enlace} className="boton w-full py-3">
          Ver la publicación
        </a>
      )}
      {SE_PUEDE_DESCARTAR.includes(estado) && <Descartar piezaId={pieza.id} descartar={descartarAccion} />}
    </LecturaDePieza>
  )
}
