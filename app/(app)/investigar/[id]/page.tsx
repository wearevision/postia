import Link from "next/link"
import { notFound } from "next/navigation"
import {
  estaAbierta,
  type HallazgoDeInforme,
  informe,
  NOMBRE_DEL_ESTADO_DE_INVESTIGACION,
} from "@/lib/investigacion/lectura"
import { serieDelInforme } from "@/lib/series/lectura"
import { RUTA_DE_INVESTIGAR, rutaDeSerie } from "@/lib/sesion/rutas"
import { createClient } from "@/lib/supabase/server"
import { pedirSerieAccion } from "../../ideas/acciones"
import { Refrescar } from "../../piezas/refrescar"
import {
  aprobarInformeAccion,
  descartarHallazgoAccion,
  descartarInformeAccion,
  pedirAmpliacionAccion,
} from "../acciones"
import { AmpliarAngulo, AprobarInforme, ArmarSerie, DescartarHallazgo, DescartarInforme } from "./controles"

const FECHA = new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })

/** A finding's date is a calendar day (YYYY-MM-DD), not an instant: read in UTC so it never shifts a day. */
function fechaDePublicacion(dia: string): string {
  return FECHA.format(new Date(`${dia}T00:00:00Z`))
}

function Hallazgo({
  hallazgo,
  investigacionId,
  descartable,
}: {
  hallazgo: HallazgoDeInforme
  investigacionId: string
  descartable: boolean
}) {
  const descartado = hallazgo.estado === "descartado"
  return (
    <li
      aria-label={descartado ? "Hallazgo descartado" : "Hallazgo"}
      className={`space-y-2 rounded-lg border border-borde p-3 text-sm ${descartado ? "opacity-50" : ""}`}
    >
      <p>{hallazgo.resumen}</p>
      {hallazgo.cita && <p className="text-apagado">«{hallazgo.cita}»</p>}
      <a href={hallazgo.enlace} target="_blank" rel="noopener noreferrer" className="block underline">
        {hallazgo.medio}
        {hallazgo.publicadoEn && ` · ${fechaDePublicacion(hallazgo.publicadoEn)}`}
      </a>
      {descartado ? (
        <p className="text-apagado">Descartado</p>
      ) : (
        descartable && (
          <DescartarHallazgo
            investigacionId={investigacionId}
            hallazgoId={hallazgo.id}
            descartar={descartarHallazgoAccion}
          />
        )
      )}
    </li>
  )
}

export default async function Informe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = await createClient()
  const leido = await informe(db, id)
  if (!leido) notFound()
  const serie = leido.estado === "aprobada" ? await serieDelInforme(db, leido.id) : null
  const porAprobar = leido.estado === "informe_por_aprobar"
  const total = leido.angulos.reduce((n, a) => n + a.hallazgos.length, 0)

  return (
    <article className="mx-auto max-w-md space-y-6">
      <Link href={RUTA_DE_INVESTIGAR} className="inline-block min-h-11 py-3 text-sm underline">
        Volver a Investigar
      </Link>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{leido.tema}</h1>
        <p className="text-sm text-apagado">
          {leido.origen === "vigilancia" ? "Vigilancia · " : ""}
          {NOMBRE_DEL_ESTADO_DE_INVESTIGACION[leido.estado]}
        </p>
        {leido.motivo && <p className="text-sm text-peligro">{leido.motivo}</p>}
      </header>
      {(leido.repetidos > 0 || leido.descartados > 0) && (
        <ul className="space-y-1 text-sm text-apagado">
          {leido.repetidos > 0 && (
            <li>{leido.repetidos === 1 ? "1 ya estaba en el mapa" : `${leido.repetidos} ya estaban en el mapa`}</li>
          )}
          {leido.descartados > 0 && (
            <li>
              {leido.descartados === 1
                ? "1 fuente descartada (inventada o de LinkedIn)"
                : `${leido.descartados} fuentes descartadas (inventadas o de LinkedIn)`}
            </li>
          )}
        </ul>
      )}
      {estaAbierta(leido.estado) && <Refrescar mensaje="Se está investigando. Esta página se actualiza sola." />}
      {total === 0 && !estaAbierta(leido.estado) && (
        <p className="text-apagado">Esta investigación no dejó hallazgos.</p>
      )}
      {leido.angulos.map((a) => (
        <section key={a.nombre} aria-label={a.nombre} className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-lg font-medium">{a.nombre}</h2>
            {a.porQue && <p className="text-sm text-apagado">{a.porQue}</p>}
          </div>
          {a.hallazgos.length > 0 && (
            <ul className="space-y-2">
              {a.hallazgos.map((h) => (
                <Hallazgo key={h.id} hallazgo={h} investigacionId={leido.id} descartable={porAprobar} />
              ))}
            </ul>
          )}
          {porAprobar && <AmpliarAngulo investigacionId={leido.id} angulo={a.nombre} ampliar={pedirAmpliacionAccion} />}
        </section>
      ))}
      {serie && (
        <section className="space-y-3 border-t border-borde pt-4">
          {serie.ideas > 0 || serie.trabajando ? (
            <Link
              href={rutaDeSerie(leido.id)}
              className="block min-h-11 rounded-lg border border-borde px-4 py-3 text-center"
            >
              Ver la serie
            </Link>
          ) : (
            <ArmarSerie investigacionId={leido.id} pedir={pedirSerieAccion} />
          )}
        </section>
      )}
      {porAprobar && (
        <section className="space-y-3 border-t border-borde pt-4">
          <AprobarInforme investigacionId={leido.id} aprobar={aprobarInformeAccion} />
          <DescartarInforme investigacionId={leido.id} descartar={descartarInformeAccion} />
        </section>
      )}
    </article>
  )
}
