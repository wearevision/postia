import { enSantiago } from "@/lib/piezas/horarios"

const ZONA = "America/Santiago"

const FORMATO_LARGO = new Intl.DateTimeFormat("es-CL", {
  timeZone: ZONA,
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

/** «martes 3 de noviembre, 11:00», always in Chile time whatever the device says. */
export function fechaLarga(instante: string): string {
  return FORMATO_LARGO.format(new Date(instante)).replace(/^(\p{L}+),/u, "$1")
}

const PARTES = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
})

/** The value a `datetime-local` field expects, showing the instant as Chile wall time. */
export function valorLocal(instante: string): string {
  const p = Object.fromEntries(PARTES.formatToParts(new Date(instante)).map((parte) => [parte.type, parte.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

const VALOR_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

/** The ISO instant of a `datetime-local` value read as Chile wall time, or null when it is incomplete. */
export function instanteDesdeValorLocal(valor: string): string | null {
  const partes = VALOR_LOCAL.exec(valor)
  if (!partes) return null
  const [anio, mes, dia, hora, minuto] = partes.slice(1).map(Number)
  return enSantiago(anio, mes, dia, hora, minuto).toISOString()
}
