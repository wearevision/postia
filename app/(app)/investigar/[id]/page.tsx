import Link from "next/link"
import { notFound } from "next/navigation"
import { enDolares } from "@/lib/gasto/precios"
import { estaAbierta, informe, NOMBRE_DEL_ESTADO_DE_INVESTIGACION } from "@/lib/investigacion/lectura"
import { resumenDelInforme, textoDelResumen } from "@/lib/investigacion/resumen"
import { CANTIDAD_POR_DEFECTO, estimarSerie } from "@/lib/series/costo"
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
import { AmpliarAngulo, AprobarInforme, ArmarSerie, DescartarInforme } from "./controles"
import { Hallazgo } from "./hallazgo"

export default async function Informe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = await createClient()
  const leido = await informe(db, id)
  if (!leido) notFound()
  const serie = leido.estado === "aprobada" ? await serieDelInforme(db, leido.id) : null
  const porAprobar = leido.estado === "informe_por_aprobar"
  const total = leido.angulos.reduce((n, a) => n + a.hallazgos.length, 0)
  const propuestas = leido.cantidad ?? CANTIDAD_POR_DEFECTO
  const costo = enDolares(
    estimarSerie({
      caracteresDelInforme: leido.angulos.reduce(
        (n, a) => n + a.hallazgos.reduce((m, h) => m + h.resumen.length + h.medio.length + h.enlace.length, 0),
        0,
      ),
      cantidad: propuestas,
    }),
  )

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
      {porAprobar && (
        <section aria-label="Decisión" className="space-y-3 tarjeta p-3">
          <p className="text-sm font-medium">{textoDelResumen(resumenDelInforme(leido.angulos))}</p>
          <AprobarInforme
            investigacionId={leido.id}
            aprobar={aprobarInformeAccion}
            propuestas={propuestas}
            costo={costo}
          />
        </section>
      )}
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
                <Hallazgo
                  key={h.id}
                  hallazgo={h}
                  investigacionId={leido.id}
                  descartable={porAprobar}
                  descartar={descartarHallazgoAccion}
                />
              ))}
            </ul>
          )}
          {porAprobar && <AmpliarAngulo investigacionId={leido.id} angulo={a.nombre} ampliar={pedirAmpliacionAccion} />}
        </section>
      ))}
      {serie && (
        <section className="space-y-3 border-t border-borde pt-4">
          {serie.ideas > 0 || serie.trabajando ? (
            <Link href={rutaDeSerie(leido.id)} className="boton w-full py-3">
              Ver la serie
            </Link>
          ) : (
            <ArmarSerie investigacionId={leido.id} pedir={pedirSerieAccion} />
          )}
        </section>
      )}
      {porAprobar && (
        <section className="mt-10 border-t border-borde pt-6">
          <DescartarInforme investigacionId={leido.id} descartar={descartarInformeAccion} />
        </section>
      )}
    </article>
  )
}
