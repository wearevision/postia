import { notFound } from "next/navigation"
import type { EstadoDePieza } from "@/lib/piezas/estados"
import { fechaLarga } from "@/lib/piezas/fechas"
import { detalle } from "@/lib/piezas/lectura"
import { createClient } from "@/lib/supabase/server"
import { PublicarAMano } from "./a-mano"
import { cerrarAManoAccion, descartarAccion, desprogramarAccion, dudosoAManoAccion, firmarAccion } from "./acciones"
import { Descartar, Desprogramar, EnvioDudoso } from "./controles"
import { FirmaDePieza } from "./firma"

const ESTADOS: Record<EstadoDePieza, string> = {
  por_aprobar: "Por firmar",
  programada: "Programada",
  publicando: "Publicándose",
  publicada: "Publicada",
  envio_dudoso: "Envío en duda",
  a_mano: "Para publicar a mano",
  error: "Con error",
  descartada: "Descartada",
}

const SE_PUEDE_DESCARTAR: readonly EstadoDePieza[] = ["por_aprobar", "programada", "a_mano", "envio_dudoso", "error"]

export default async function Pieza({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const pieza = await detalle(await createClient(), id)
  if (!pieza) notFound()
  const { estado, version, cuenta } = pieza

  return (
    <section className="mx-auto max-w-md space-y-5">
      <header className="space-y-2">
        <p className="inline-block rounded-full border border-borde px-3 py-1 text-sm">{cuenta.nombre}</p>
        <h1 className="text-2xl font-semibold">{version.titulo ?? "Post de texto"}</h1>
        <p className="text-apagado">{ESTADOS[estado]}</p>
        {pieza.motivo && <p className="text-sm">{pieza.motivo}</p>}
      </header>

      {estado !== "por_aprobar" && (
        <p className="whitespace-pre-wrap rounded-lg border border-borde p-3">{version.texto}</p>
      )}
      {version.archivoUrl && estado !== "a_mano" && (
        <a href={version.archivoUrl} className="block min-h-11 rounded-lg border border-borde px-4 py-3 text-center">
          Ver el PDF
        </a>
      )}

      {estado === "por_aprobar" && (
        <FirmaDePieza
          piezaId={pieza.id}
          huella={version.huella}
          texto={version.texto}
          fechaPropuesta={pieza.fechaPropuesta}
          ruta={cuenta.ruta}
          firmar={firmarAccion}
        />
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
