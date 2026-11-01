export interface ResumenDeInforme {
  angulos: number
  hallazgos: number
}

/** What approving would carry on: the findings not discarded, and the angles that still have one. */
export function resumenDelInforme(angulos: readonly { hallazgos: readonly { estado: string }[] }[]): ResumenDeInforme {
  let hallazgos = 0
  let conHallazgos = 0
  for (const a of angulos) {
    const quedan = a.hallazgos.filter((h) => h.estado !== "descartado").length
    hallazgos += quedan
    if (quedan > 0) conHallazgos += 1
  }
  return { angulos: conHallazgos, hallazgos }
}

export function textoDelResumen({ angulos, hallazgos }: ResumenDeInforme): string {
  return `${angulos} ${angulos === 1 ? "ángulo" : "ángulos"} · ${hallazgos} ${hallazgos === 1 ? "hallazgo" : "hallazgos"} para usar`
}
