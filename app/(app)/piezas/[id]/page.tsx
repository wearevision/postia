import { notFound } from "next/navigation"
import { leerExcepciones } from "@/lib/clientes/lectura"
import { type Excepcion, type Hallazgo, prepararRevision } from "@/lib/clientes/revision"
import { diaEnSantiago } from "@/lib/piezas/calendario"
import { type EstadoDePieza, NOMBRE_DEL_ESTADO } from "@/lib/piezas/estados"
import { fechaLarga } from "@/lib/piezas/fechas"
import { detalle } from "@/lib/piezas/lectura"
import { lineaEnReserva } from "@/lib/piezas/textos"
import { createClient } from "@/lib/supabase/server"
import { pilaresActivos } from "@/lib/voz/lectura"
import { PublicarAMano } from "./a-mano"
import {
  cerrarAManoAccion,
  descartarAccion,
  desprogramarAccion,
  dudosoAManoAccion,
  firmarAccion,
  firmarParaReservaAccion,
  planearAccion,
  ponerPilarAccion,
  sacarDeReservaAccion,
} from "./acciones"
import { Descartar, Desprogramar, EnvioDudoso, SacarDeReserva } from "./controles"
import { FirmaDePieza } from "./firma"
import { PilarDePieza } from "./pilar"
import { PlanDePieza } from "./plan"
import { Veredicto } from "./veredicto"

const SE_PUEDE_CAMBIAR_EL_PILAR: readonly EstadoDePieza[] = ["por_aprobar", "en_reserva", "programada"]
const SE_PUEDE_DESCARTAR: readonly EstadoDePieza[] = ["por_aprobar", "en_reserva", "programada", "a_mano", "error"]

/** Set by the new-piece form when the plan or the pillar could not be set right after creating (rutaDePieza). */
function avisosAlCrear(aviso: string | string[] | undefined): Set<string> {
  return new Set(typeof aviso === "string" ? aviso.split(",") : [])
}

export default async function Pieza({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ aviso?: string | string[] }>
}) {
  const { id } = await params
  const avisos = avisosAlCrear((await searchParams).aviso)
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
    return revisor.revisar([version.titulo, version.texto].filter(Boolean).join("\n"), cuenta.voz)
  }

  const [pilares, hallazgos] = await Promise.all([
    SE_PUEDE_CAMBIAR_EL_PILAR.includes(estado)
      ? pilaresActivos(db).then((todos) => todos.filter((p) => p.marcaId === cuenta.marcaId))
      : [],
    estado === "por_aprobar" ? revisarAntesDeFirmar() : [],
  ])

  return (
    <section className="mx-auto max-w-md space-y-5">
      <header className="space-y-2">
        <p className="inline-block rounded-full border border-borde px-3 py-1 text-sm">{cuenta.nombre}</p>
        <h1 className="text-2xl font-semibold">{version.titulo ?? "Post de texto"}</h1>
        <p className="text-apagado">{NOMBRE_DEL_ESTADO[estado]}</p>
        {pieza.motivo && <p className="text-sm">{pieza.motivo}</p>}
        {!SE_PUEDE_CAMBIAR_EL_PILAR.includes(estado) && pieza.pilarNombre && (
          <p className="text-sm text-apagado">Pilar: {pieza.pilarNombre}</p>
        )}
      </header>

      {SE_PUEDE_CAMBIAR_EL_PILAR.includes(estado) && (pilares.length > 0 || pieza.pilarId) && (
        <PilarDePieza
          piezaId={pieza.id}
          pilarId={pieza.pilarId}
          pilarNombre={pieza.pilarNombre}
          pilares={pilares}
          poner={ponerPilarAccion}
          sinPilarAlCrear={avisos.has("pilar") && pieza.pilarId === null}
        />
      )}

      {estado !== "por_aprobar" && (
        <p className="whitespace-pre-wrap rounded-lg border border-borde p-3">{version.texto}</p>
      )}
      {version.archivoUrl && estado !== "a_mano" && (
        <a href={version.archivoUrl} className="block min-h-11 rounded-lg border border-borde px-4 py-3 text-center">
          Ver el PDF
        </a>
      )}

      {estado === "por_aprobar" && (
        <PlanDePieza
          piezaId={pieza.id}
          planeadaPara={pieza.planeadaPara}
          planear={planearAccion}
          sinPlanAlCrear={avisos.has("plan")}
        />
      )}
      {estado === "por_aprobar" && <Veredicto hallazgos={hallazgos} />}
      {estado === "por_aprobar" && (
        <FirmaDePieza
          key={pieza.fechaPropuesta}
          piezaId={pieza.id}
          huella={version.huella}
          texto={version.texto}
          fechaPropuesta={pieza.fechaPropuesta}
          abiertaEn={abiertaEn}
          ruta={cuenta.ruta}
          cuenta={cuenta.nombre}
          firmar={firmarAccion}
          firmarParaReserva={firmarParaReservaAccion}
        />
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
        <a href={pieza.enlace} className="block min-h-11 rounded-lg border border-borde px-4 py-3 text-center">
          Ver la publicación
        </a>
      )}
      {SE_PUEDE_DESCARTAR.includes(estado) && <Descartar piezaId={pieza.id} descartar={descartarAccion} />}
    </section>
  )
}
