import Link from "next/link"
import { fechaLarga } from "@/lib/piezas/fechas"
import { bandeja, type TarjetaDePieza } from "@/lib/piezas/lectura"
import {
  RUTA_DE_CARRUSEL,
  RUTA_DE_IDEAS,
  RUTA_DE_INVESTIGAR,
  RUTA_DE_NUEVA_PIEZA,
  RUTA_DE_PEDIR_TEXTO,
  rutaDePieza,
} from "@/lib/sesion/rutas"
import { createClient } from "@/lib/supabase/server"

function Seccion({ titulo, tarjetas }: { titulo: string; tarjetas: TarjetaDePieza[] }) {
  if (tarjetas.length === 0) return null
  return (
    <section className="space-y-2">
      <h2 className="font-medium">{titulo}</h2>
      <ul className="space-y-2">
        {tarjetas.map((t) => (
          <li key={t.id}>
            <Link href={rutaDePieza(t.id)} className="block min-h-11 space-y-1 rounded-lg border border-borde p-3">
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
  const { porFirmar, enReserva, aMano, revisar, proximas, masAdelante } = await bandeja(await createClient())
  const vacia =
    porFirmar.length + enReserva.length + aMano.length + revisar.length + proximas.length + masAdelante.length === 0
  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">Inicio</h1>
      <Link href={RUTA_DE_PEDIR_TEXTO} className="block min-h-11 rounded-lg border border-borde px-4 py-3 text-center">
        Pedir texto a Claude
      </Link>
      <Link href={RUTA_DE_CARRUSEL} className="block min-h-11 rounded-lg border border-borde px-4 py-3 text-center">
        Nuevo carrusel
      </Link>
      <Link href={RUTA_DE_INVESTIGAR} className="block min-h-11 rounded-lg border border-borde px-4 py-3 text-center">
        Investigar
      </Link>
      <Link href={RUTA_DE_IDEAS} className="block min-h-11 rounded-lg border border-borde px-4 py-3 text-center">
        Ideas y series
      </Link>
      <Seccion titulo="Por firmar" tarjetas={porFirmar} />
      <Seccion titulo="Publicar a mano" tarjetas={aMano} />
      <Seccion titulo="Revisar" tarjetas={revisar} />
      <Seccion titulo="Próximas" tarjetas={proximas} />
      <Seccion titulo="Más adelante" tarjetas={masAdelante} />
      <Seccion titulo="En reserva" tarjetas={enReserva} />
      {vacia && (
        <div className="space-y-3">
          <p className="text-apagado">No hay nada pendiente.</p>
          <Link
            href={RUTA_DE_NUEVA_PIEZA}
            className="block min-h-11 rounded-lg border border-borde px-4 py-3 text-center"
          >
            Nueva pieza
          </Link>
        </div>
      )}
    </div>
  )
}
