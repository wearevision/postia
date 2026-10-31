import { Check, Circle, Clock, MinusCircle, TriangleAlert } from "lucide-react"
import { type EstadoDePieza, NOMBRE_DEL_ESTADO } from "@/lib/piezas/estados"

type Forma = "punto" | "reloj" | "check" | "triangulo" | "triangulo-lleno" | "menos"

/** Shape and ink per state: magenta only where the person has to act, blue for what is settled. */
const MARCA: Record<EstadoDePieza, { forma: Forma; color: string }> = {
  por_aprobar: { forma: "punto", color: "text-primario" },
  a_mano: { forma: "punto", color: "text-primario" },
  en_reserva: { forma: "reloj", color: "" },
  publicando: { forma: "reloj", color: "" },
  programada: { forma: "check", color: "text-exito" },
  publicada: { forma: "check", color: "text-exito" },
  envio_dudoso: { forma: "triangulo", color: "" },
  error: { forma: "triangulo-lleno", color: "" },
  descartada: { forma: "menos", color: "text-apagado" },
}

const COMUN = { "aria-hidden": true, strokeWidth: 1.75 } as const

function Icono({ forma, color }: { forma: Forma; color: string }) {
  const clase = `size-4 flex-none ${color}`
  switch (forma) {
    case "punto":
      return <Circle {...COMUN} data-forma={forma} fill="currentColor" className={clase} />
    case "reloj":
      return <Clock {...COMUN} data-forma={forma} className={clase} />
    case "check":
      return <Check {...COMUN} data-forma={forma} strokeWidth={2.5} className={clase} />
    case "triangulo":
      return <TriangleAlert {...COMUN} data-forma={forma} className={clase} />
    case "triangulo-lleno":
      return <TriangleAlert {...COMUN} data-forma={forma} fill="currentColor" className={clase} />
    case "menos":
      return <MinusCircle {...COMUN} data-forma={forma} className={clase} />
  }
}

/** A piece state as a shape plus its word, so it never depends on color alone. */
export function MarcaDeEstado({ estado }: { estado: EstadoDePieza }) {
  const { forma, color } = MARCA[estado]
  return (
    <span className="inline-flex items-center gap-2">
      <Icono forma={forma} color={color} />
      {NOMBRE_DEL_ESTADO[estado]}
    </span>
  )
}
