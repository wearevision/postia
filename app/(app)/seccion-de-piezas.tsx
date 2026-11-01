import Link from "next/link"
import { fechaCorta } from "@/lib/piezas/fechas"
import type { TarjetaDePieza } from "@/lib/piezas/lectura"
import { rutaDePieza } from "@/lib/sesion/rutas"

function lineaDeCuenta(t: TarjetaDePieza): string {
  const instante = t.estado === "por_aprobar" ? t.planeadaPara : t.programadaPara
  return `${t.cuenta} · ${instante ? fechaCorta(instante) : "Sin fecha"}`
}

export function SeccionDePiezas({ titulo, tarjetas }: { titulo: string; tarjetas: TarjetaDePieza[] }) {
  if (tarjetas.length === 0) return null
  return (
    <section className="space-y-2">
      <h2 className="font-medium">{titulo}</h2>
      <ul className="space-y-2">
        {tarjetas.map((t) => (
          <li key={t.id}>
            <Link href={rutaDePieza(t.id)} className="block min-h-11 space-y-1 tarjeta p-3">
              <span className="block text-sm text-apagado">{lineaDeCuenta(t)}</span>
              <span className="block">{t.extracto}</span>
              {t.motivo && <span className="block text-sm text-peligro">{t.motivo}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
