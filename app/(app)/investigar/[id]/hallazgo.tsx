import { limpiarCita } from "@/lib/investigacion/cita"
import type { HallazgoDeInforme } from "@/lib/investigacion/lectura"
import type { Resultado } from "@/lib/marcas/acciones"
import { DescartarHallazgo } from "./controles"

const FECHA = new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })

/** A finding's date is a calendar day (YYYY-MM-DD), not an instant: read in UTC so it never shifts a day. */
function fechaDePublicacion(dia: string): string {
  return FECHA.format(new Date(`${dia}T00:00:00Z`))
}

export function Hallazgo({
  hallazgo,
  investigacionId,
  descartable,
  descartar,
}: {
  hallazgo: HallazgoDeInforme
  investigacionId: string
  descartable: boolean
  descartar: (investigacionId: string, hallazgoId: string) => Promise<Resultado>
}) {
  const descartado = hallazgo.estado === "descartado"
  const cita = hallazgo.cita ? limpiarCita(hallazgo.cita) : ""
  return (
    <li
      aria-label={descartado ? "Hallazgo descartado" : "Hallazgo"}
      className={`space-y-2 tarjeta p-3 text-sm ${descartado ? "opacity-50" : ""}`}
    >
      <p>{hallazgo.resumen}</p>
      {cita && <p className="text-apagado">«{cita}»</p>}
      <a
        href={hallazgo.enlace}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-11 items-center underline"
      >
        {hallazgo.medio}
        {hallazgo.publicadoEn && ` · ${fechaDePublicacion(hallazgo.publicadoEn)}`}
      </a>
      {descartado ? (
        <p className="text-apagado">Descartado</p>
      ) : (
        descartable && (
          <DescartarHallazgo investigacionId={investigacionId} hallazgoId={hallazgo.id} descartar={descartar} />
        )
      )}
    </li>
  )
}
