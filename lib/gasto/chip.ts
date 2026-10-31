import { RUTA_DE_AJUSTES, RUTA_DE_INICIO } from "@/lib/sesion/rutas"

const SIEMPRE = new Set([RUTA_DE_INICIO, RUTA_DE_AJUSTES])

/** The chip shows where spend is reviewed, and everywhere once the month reaches the 80 % warning (D11). */
export function mostrarChip(ruta: string, gastadoMicro: number, topeMicro: number): boolean {
  return SIEMPRE.has(ruta) || gastadoMicro * 5 >= topeMicro * 4
}
