import Link from "next/link"
import { huecosDeLaSemana, sumarDias } from "@/lib/piezas/calendario"
import { fechaDeFila } from "@/lib/piezas/fechas"
import type { AsignacionDelCalendario, CuentaDelCalendario, PiezaDelCalendario } from "@/lib/piezas/lectura"
import { rutaDeCalendario, rutaDeIdea, rutaDePieza } from "@/lib/sesion/rutas"
import { MarcaDeEstado } from "../marca-de-estado"

const FORMATO_DEL_LUNES = new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", day: "numeric", month: "long" })
const ENLACE = "boton w-full justify-start px-3 py-3 text-sm"
const FILA = `${ENLACE} flex-col items-stretch gap-1 py-3`

function nombreDelLunes(lunes: string): string {
  const [anio, mes, dia] = lunes.split("-").map(Number)
  return FORMATO_DEL_LUNES.format(new Date(Date.UTC(anio, mes - 1, dia)))
}

interface Props {
  lunes: string
  cuentas: readonly CuentaDelCalendario[]
  piezas: readonly PiezaDelCalendario[]
  /** Ideas planned for an account and not written yet (4f). */
  asignaciones?: readonly AsignacionDelCalendario[]
  /** A week that is over has nothing left to fill, so it counts no gaps. */
  terminada?: boolean
}

function Pieza({ p }: { p: PiezaDelCalendario }) {
  return (
    <Link href={rutaDePieza(p.id)} className={`${FILA} ${p.firmada ? "" : "border-dashed text-apagado"}`}>
      <span className="flex items-baseline justify-between gap-2">
        <span className="whitespace-nowrap">{fechaDeFila(p.instante)}</span>
        <span className="text-apagado">{p.firmada ? <MarcaDeEstado estado={p.estado} /> : "Planeada, sin firma"}</span>
      </span>
      <span className="block text-left">{p.extracto}</span>
    </Link>
  )
}

function Asignacion({ a }: { a: AsignacionDelCalendario }) {
  return (
    <Link href={rutaDeIdea(a.ideaId, a.investigacionId)} className={`${FILA} border-dashed text-apagado`}>
      <span className="flex items-baseline justify-between gap-2">
        <span className="whitespace-nowrap">{fechaDeFila(a.instante)}</span>
      </span>
      <span className="block text-left">{`${a.estado === "escribiendo" ? "Escribiendo" : "Por escribir"} · ${a.gancho}`}</span>
    </Link>
  )
}

export function VistaDeSemana({ lunes, cuentas, piezas, asignaciones = [], terminada = false }: Props) {
  const faltan = huecosDeLaSemana(cuentas, piezas, asignaciones)
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h2 className="text-lg font-medium">Semana del {nombreDelLunes(lunes)}</h2>
        <div className="flex gap-2">
          <Link href={rutaDeCalendario({ semana: sumarDias(lunes, -7) })} className={`${ENLACE} flex-1 text-center`}>
            Semana anterior
          </Link>
          <Link href={rutaDeCalendario({ semana: sumarDias(lunes, 7) })} className={`${ENLACE} flex-1 text-center`}>
            Semana siguiente
          </Link>
        </div>
      </div>
      {cuentas.map((cuenta) => {
        const deLaCuenta = [...piezas, ...asignaciones]
          .filter((e) => e.cuentaId === cuenta.id)
          .sort((a, b) => Date.parse(a.instante) - Date.parse(b.instante))
        return (
          <section key={cuenta.id} aria-label={cuenta.nombre} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium">{cuenta.nombre}</h3>
              {!terminada && faltan[cuenta.id] > 0 && (
                <span className="rounded-full border border-peligro px-2 py-0.5 text-sm text-peligro">
                  Faltan {faltan[cuenta.id]}
                </span>
              )}
            </div>
            {cuenta.ritmoSemanal > 0 && (
              <p className="text-sm text-apagado">
                Reserva: {cuenta.enReserva} de {cuenta.ritmoSemanal}
              </p>
            )}
            {deLaCuenta.length === 0 ? (
              <p className="text-sm text-apagado">Nada esta semana.</p>
            ) : (
              <ul className="space-y-2">
                {deLaCuenta.map((e) =>
                  "tipo" in e ? (
                    <li key={e.id}>
                      <Asignacion a={e} />
                    </li>
                  ) : (
                    <li key={e.id}>
                      <Pieza p={e} />
                    </li>
                  ),
                )}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
