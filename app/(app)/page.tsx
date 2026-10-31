import Link from "next/link"
import { PorRevisar } from "@/app/(app)/por-revisar"
import { leerConteos } from "@/lib/inicio/conteos"
import { informesPorAprobar } from "@/lib/investigacion/lectura"
import { fechaLarga } from "@/lib/piezas/fechas"
import { bandeja, type TarjetaDePieza } from "@/lib/piezas/lectura"
import { ideasPorRevisar } from "@/lib/series/lectura"
import { RUTA_DE_CALENDARIO, rutaDePieza } from "@/lib/sesion/rutas"
import { createClient } from "@/lib/supabase/server"

function Seccion({ titulo, tarjetas }: { titulo: string; tarjetas: TarjetaDePieza[] }) {
  if (tarjetas.length === 0) return null
  return (
    <section className="space-y-2">
      <h2 className="font-medium">{titulo}</h2>
      <ul className="space-y-2">
        {tarjetas.map((t) => (
          <li key={t.id}>
            <Link href={rutaDePieza(t.id)} className="block min-h-11 space-y-1 tarjeta p-3">
              <span className="block text-sm text-apagado">
                {t.cuenta}
                {t.estado === "por_aprobar"
                  ? t.planeadaPara && ` · planeada para el ${fechaLarga(t.planeadaPara)}`
                  : t.programadaPara && ` · ${fechaLarga(t.programadaPara)}`}
              </span>
              <span className="block">{t.extracto}</span>
              {t.motivo && <span className="block text-sm text-peligro">{t.motivo}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default async function Inicio() {
  const db = await createClient()
  const [{ porFirmar, aMano, revisar }, conteos] = await Promise.all([
    bandeja(db),
    leerConteos({ informes: () => informesPorAprobar(db), ideas: () => ideasPorRevisar(db) }),
  ])
  const informes = conteos.informes ?? 0
  const ideas = conteos.ideas ?? 0
  const vacia = porFirmar.length + aMano.length + revisar.length + informes + ideas === 0
  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">Inicio</h1>
      <Seccion titulo="Por firmar" tarjetas={porFirmar} />
      <PorRevisar informes={informes} ideas={ideas} piezas={revisar} />
      <Seccion titulo="Publicar a mano" tarjetas={aMano} />
      {vacia && <p className="text-apagado">No hay nada pendiente.</p>}
      <Link href={RUTA_DE_CALENDARIO} className="inline-block min-h-11 py-3 text-sm underline">
        Ver la semana
      </Link>
    </div>
  )
}
