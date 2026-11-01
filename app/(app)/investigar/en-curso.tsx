import Link from "next/link"
import type { InvestigacionReciente } from "@/lib/investigacion/lectura"
import { rutaDeInvestigacion } from "@/lib/sesion/rutas"

/** A research that is queued or running: from outside both are just «waiting for the report». */
export function TarjetaEnCurso({ i }: { i: Pick<InvestigacionReciente, "id" | "tema" | "estado"> }) {
  return (
    <li>
      <Link href={rutaDeInvestigacion(i.id)} className="block min-h-11 space-y-1 tarjeta p-3 text-sm">
        <span className="line-clamp-2 block text-base">{`Investigando: ${i.tema} · se actualiza sola`}</span>
      </Link>
    </li>
  )
}
