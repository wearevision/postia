import Link from "next/link"
import { PorRevisar } from "@/app/(app)/por-revisar"
import { SeccionDePiezas } from "@/app/(app)/seccion-de-piezas"
import { leerConteos } from "@/lib/inicio/conteos"
import { informesPorAprobar } from "@/lib/investigacion/lectura"
import { bandeja } from "@/lib/piezas/lectura"
import { ideasPorRevisar } from "@/lib/series/lectura"
import { RUTA_DE_CALENDARIO } from "@/lib/sesion/rutas"
import { createClient } from "@/lib/supabase/server"

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
      <SeccionDePiezas titulo="Por firmar" tarjetas={porFirmar} />
      <PorRevisar informes={informes} ideas={ideas} piezas={revisar} />
      <SeccionDePiezas titulo="Publicar a mano" tarjetas={aMano} />
      {vacia && <p className="text-apagado">No hay nada pendiente.</p>}
      <Link href={RUTA_DE_CALENDARIO} className="inline-block min-h-11 py-3 text-sm underline">
        Ver la semana
      </Link>
    </div>
  )
}
