import { TriangleAlert } from "lucide-react"
import Link from "next/link"
import { enDolares } from "@/lib/gasto/precios"
import { RUTA_DE_AJUSTES } from "@/lib/sesion/rutas"

/** Month spend against the cap, in the header of Inicio and Ajustes (elsewhere from 80 %); it opens the breakdown by account in Ajustes. */
export function ChipDeGasto({ gastadoMicro, topeMicro }: { gastadoMicro: number; topeMicro: number }) {
  const porcentaje = (gastadoMicro * 100) / topeMicro
  const aviso = porcentaje >= 100 ? "Tope alcanzado" : porcentaje >= 80 ? "Va en el 80 %" : null
  const monto = `${enDolares(gastadoMicro)} de ${enDolares(topeMicro)}`
  return (
    <Link
      href={RUTA_DE_AJUSTES}
      aria-label={`Gasto del mes: ${monto}.${aviso ? ` ${aviso}.` : ""} Ver el desglose por cuenta.`}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm shadow-relieve-sm"
    >
      <span>{monto}</span>
      {aviso && (
        <span className="inline-flex items-center gap-1 font-semibold">
          <TriangleAlert aria-hidden="true" data-marca="" fill="currentColor" strokeWidth={1.75} className="size-4" />
          {aviso}
        </span>
      )}
    </Link>
  )
}
