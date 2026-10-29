// D19: Tuesday, Wednesday and Thursday; the profile at 11:00 and the page at 15:00, Chile time; never weekends.
const ZONA = "America/Santiago"
const DIAS_VALIDOS = new Set([2, 3, 4])
const HORA_POR_TIPO = { persona: 11, empresa: 15 } as const
const MARGEN_MS = 30 * 60_000
const DIA_MS = 86_400_000

function desfaseMs(instante: Date): number {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: ZONA,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(instante)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  )
  const comoUtc = Date.UTC(partes.year, partes.month - 1, partes.day, partes.hour, partes.minute, partes.second)
  return comoUtc - instante.getTime()
}

/** Chile wall time to an instant, daylight saving included (two passes settle the offset). */
export function enSantiago(anio: number, mes: number, dia: number, hora: number, minuto: number): Date {
  const local = Date.UTC(anio, mes - 1, dia, hora, minuto)
  let instante = new Date(local - desfaseMs(new Date(local)))
  instante = new Date(local - desfaseMs(instante))
  return instante
}

function fechaEnSantiago(instante: number): { anio: number; mes: number; dia: number; diaSemana: number } {
  const corrido = new Date(instante + desfaseMs(new Date(instante)))
  return {
    anio: corrido.getUTCFullYear(),
    mes: corrido.getUTCMonth() + 1,
    dia: corrido.getUTCDate(),
    diaSemana: corrido.getUTCDay(),
  }
}

/** The first free slot of an account at least 30 minutes ahead. `ocupados` are that account's taken instants. */
export function proponerFecha(tipo: "persona" | "empresa", ocupados: readonly number[], ahora: number): Date {
  const tomados = new Set(ocupados)
  for (let i = 0; i < 60; i++) {
    const { anio, mes, dia, diaSemana } = fechaEnSantiago(ahora + i * DIA_MS)
    if (!DIAS_VALIDOS.has(diaSemana)) continue
    const candidato = enSantiago(anio, mes, dia, HORA_POR_TIPO[tipo], 0)
    if (candidato.getTime() < ahora + MARGEN_MS || tomados.has(candidato.getTime())) continue
    return candidato
  }
  throw new Error("No encontré un horario libre en los próximos 60 días.")
}
