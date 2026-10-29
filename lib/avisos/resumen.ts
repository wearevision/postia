import type { MensajePush } from "./tipos"

export interface EstadoDelResumen {
  porFirmar: number
  aMano: number
  revisar: number
  reservas: { cuenta: string; tiene: number; meta: number }[]
  huecos: { cuenta: string; faltan: number; semana: "esta" | "proxima" }[]
  lineas: MensajePush[]
}

const TITULO = "Pendientes en PostIA"
// An iPhone shows about four lines of a notice; six plus «Y N más» keeps the rest one tap away in Inicio.
const MAXIMO_DE_LINEAS = 6
// Six lines of 160 characters stay far below the 3000-byte payload limit of lib/avisos/push.ts, even with accents.
const LARGO_DE_LINEA = 160

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`
}

function recortar(linea: string): string {
  const letras = [...linea]
  return letras.length > LARGO_DE_LINEA ? `${letras.slice(0, LARGO_DE_LINEA - 1).join("")}…` : linea
}

/** D26: everything pending in one push, or null when there is nothing to say. */
export function armarResumen(e: EstadoDelResumen): MensajePush | null {
  const filas = [
    ...(e.porFirmar > 0 ? [`${plural(e.porFirmar, "pieza espera", "piezas esperan")} tu firma.`] : []),
    ...(e.aMano > 0 ? [`${e.aMano} para publicar a mano.`] : []),
    ...(e.revisar > 0 ? [`${plural(e.revisar, "envío", "envíos")} por revisar.`] : []),
    ...e.lineas.map((l) => l.cuerpo),
    ...e.reservas.map((r) => `Reserva de ${r.cuenta}: ${r.tiene} de ${r.meta}.`),
    ...e.huecos.map(
      (h) => `Faltan ${h.faltan} en ${h.cuenta} ${h.semana === "esta" ? "esta semana" : "la próxima semana"}.`,
    ),
  ].map(recortar)
  if (filas.length === 0) return null
  const visibles = filas.length > MAXIMO_DE_LINEAS ? filas.slice(0, MAXIMO_DE_LINEAS) : filas
  const resto = filas.length - visibles.length
  const cuerpo = [...visibles, ...(resto > 0 ? [`Y ${plural(resto, "aviso", "avisos")} más en Inicio.`] : [])].join(
    "\n",
  )
  const unicaLinea = filas.length === 1 && e.lineas.length === 1 ? e.lineas[0] : null
  return { titulo: TITULO, cuerpo, url: unicaLinea?.url ?? "/" }
}
