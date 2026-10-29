export const RUTA_DE_INICIO = "/"
export const RUTA_DE_INGRESO = "/ingreso"
export const RUTA_DE_SALIR = "/salir"
export const RUTA_DE_MARCAS = "/marcas"
export const RUTA_DE_AJUSTES = "/ajustes"
export const RUTA_DE_NUEVA_PIEZA = "/piezas/nueva"
export const RUTA_DE_CALENDARIO = "/calendario"

export function rutaDeCalendario(destino: { semana: string } | { mes: string }): string {
  return "semana" in destino
    ? `${RUTA_DE_CALENDARIO}?semana=${destino.semana}`
    : `${RUTA_DE_CALENDARIO}?vista=mes&mes=${destino.mes}`
}

export function rutaDePieza(id: string): string {
  return `/piezas/${id}`
}

const PUBLICAS = new Set([RUTA_DE_INGRESO])

/** Where the proxy redirects a request, or null to let it through. Brand access is checked by the app layout. */
export function destinoDe(ruta: string, conSesion: boolean): string | null {
  if (!conSesion) return PUBLICAS.has(ruta) ? null : RUTA_DE_INGRESO
  return ruta === RUTA_DE_INGRESO ? RUTA_DE_INICIO : null
}
