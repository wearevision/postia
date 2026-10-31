import Link from "next/link"
import type { TarjetaDePieza } from "@/lib/piezas/lectura"
import { RUTA_DE_IDEAS, RUTA_DE_INVESTIGAR, rutaDePieza } from "@/lib/sesion/rutas"

const contar = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

export function PorRevisar({
  informes,
  ideas,
  piezas,
}: {
  informes: number
  ideas: number
  piezas: readonly TarjetaDePieza[]
}) {
  if (informes + ideas + piezas.length === 0) return null
  return (
    <section className="space-y-2">
      <h2 className="font-medium">Por revisar</h2>
      <ul className="space-y-2">
        {informes > 0 && (
          <li>
            <Link href={RUTA_DE_INVESTIGAR} className="block min-h-11 tarjeta p-3">
              {contar(informes, "informe por aprobar", "informes por aprobar")}
            </Link>
          </li>
        )}
        {ideas > 0 && (
          <li>
            <Link href={`${RUTA_DE_IDEAS}?estado=propuesta`} className="block min-h-11 tarjeta p-3">
              {contar(ideas, "idea por revisar", "ideas por revisar")}
            </Link>
          </li>
        )}
        {piezas.map((t) => (
          <li key={t.id}>
            <Link href={rutaDePieza(t.id)} className="block min-h-11 space-y-1 tarjeta p-3">
              <span className="block text-sm text-apagado">{t.cuenta}</span>
              <span className="block">{t.extracto}</span>
              {t.motivo && <span className="block text-sm text-peligro">{t.motivo}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
