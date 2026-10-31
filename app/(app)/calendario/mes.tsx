import Link from "next/link"
import { cuadriculaDelMes, diaEnSantiago, type Mes, mesVecino } from "@/lib/piezas/calendario"
import { type EstadoDePieza, NOMBRE_DEL_ESTADO } from "@/lib/piezas/estados"
import type { AsignacionDelCalendario, PiezaDelCalendario } from "@/lib/piezas/lectura"
import { rutaDeCalendario } from "@/lib/sesion/rutas"

const FORMATO_DEL_MES = new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric", timeZone: "UTC" })
const FORMATO_DEL_DIA = new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", timeZone: "UTC" })
const INICIALES = ["L", "M", "M", "J", "V", "S", "D"]
const ENLACE = "block min-h-11 rounded-lg border border-borde px-3 py-3 text-center text-sm"
const PELIGRO: readonly EstadoDePieza[] = ["a_mano", "envio_dudoso", "error"]

function fechaUtc(dia: string): Date {
  const [anio, mes, d] = dia.split("-").map(Number)
  return new Date(Date.UTC(anio, mes - 1, d))
}

type Entrada = PiezaDelCalendario | AsignacionDelCalendario

function colorDelPunto(p: Entrada): string {
  if ("tipo" in p) return "border border-dashed border-apagado"
  if (!p.firmada) return "border border-primario"
  if (p.estado === "publicada") return "bg-apagado"
  return PELIGRO.includes(p.estado) ? "bg-peligro" : "bg-primario"
}

function palabra(p: Entrada): string {
  if ("tipo" in p) return "por escribir"
  return p.firmada ? NOMBRE_DEL_ESTADO[p.estado].toLowerCase() : "sin firma"
}

function nombreDelDia(dia: string, deEseDia: readonly Entrada[]): string {
  const base = FORMATO_DEL_DIA.format(fechaUtc(dia))
  if (deEseDia.length === 0) return base
  const cuentas = new Map<string, number>()
  for (const p of deEseDia) cuentas.set(palabra(p), (cuentas.get(palabra(p)) ?? 0) + 1)
  return `${base}: ${[...cuentas].map(([nombre, n]) => `${n} ${nombre}`).join(", ")}`
}

export function VistaDelMes({
  mes,
  piezas,
  asignaciones = [],
}: {
  mes: Mes
  piezas: readonly PiezaDelCalendario[]
  asignaciones?: readonly AsignacionDelCalendario[]
}) {
  const porDia = new Map<string, Entrada[]>()
  for (const p of [...piezas, ...asignaciones].sort((a, b) => Date.parse(a.instante) - Date.parse(b.instante))) {
    const dia = diaEnSantiago(Date.parse(p.instante))
    porDia.set(dia, [...(porDia.get(dia) ?? []), p])
  }
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-medium">{FORMATO_DEL_MES.format(fechaUtc(`${mes}-01`))}</h2>
      <div className="flex gap-2">
        <Link href={rutaDeCalendario({ mes: mesVecino(mes, -1) })} className={`${ENLACE} flex-1`}>
          Mes anterior
        </Link>
        <Link href={rutaDeCalendario({ mes: mesVecino(mes, 1) })} className={`${ENLACE} flex-1`}>
          Mes siguiente
        </Link>
      </div>
      <div aria-hidden="true" className="grid grid-cols-7 gap-1 text-center text-sm text-apagado">
        {INICIALES.map((inicial, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the weekday initials repeat (M, M) and never reorder.
          <span key={i}>{inicial}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cuadriculaDelMes(mes)
          .flat()
          .map((dia, i) => {
            if (!dia) return <span key={`vacio-${i.toString()}`} aria-hidden="true" />
            const deEseDia = porDia.get(dia) ?? []
            return (
              <Link
                key={dia}
                href={rutaDeCalendario({ semana: dia })}
                aria-label={nombreDelDia(dia, deEseDia)}
                className="flex min-h-11 flex-col items-center gap-1 rounded-lg border border-borde py-1 text-sm"
              >
                <span aria-hidden="true">{Number(dia.slice(8))}</span>
                <span aria-hidden="true" className="flex flex-wrap justify-center gap-0.5">
                  {deEseDia.map((p) => (
                    <span key={p.id} className={`size-2 rounded-full ${colorDelPunto(p)}`} />
                  ))}
                </span>
              </Link>
            )
          })}
      </div>
    </div>
  )
}
