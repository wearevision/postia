export const RUTA_DE_INICIO = "/"
export const RUTA_DE_INGRESO = "/ingreso"
export const RUTA_DE_SALIR = "/salir"
export const RUTA_DE_MARCAS = "/marcas"
export const RUTA_DE_AJUSTES = "/ajustes"
export const RUTA_DE_NUEVA_PIEZA = "/piezas/nueva"
export const RUTA_DE_PEDIR_TEXTO = "/piezas/pedir"
export const RUTA_DE_CARRUSEL = "/piezas/carrusel"
export const RUTA_DE_CALENDARIO = "/calendario"
export const RUTA_DE_VOZ = "/voz"
export const RUTA_DE_CLIENTES = "/clientes"

export function rutaDeCalendario(destino: { semana: string } | { mes: string }): string {
  return "semana" in destino
    ? `${RUTA_DE_CALENDARIO}?semana=${destino.semana}`
    : `${RUTA_DE_CALENDARIO}?vista=mes&mes=${destino.mes}`
}

export function rutaDeVoz(marcaId: string, version?: number): string {
  return `${RUTA_DE_VOZ}/${encodeURIComponent(marcaId)}${version ? `?version=${version}` : ""}`
}

/** `aviso` names what a new piece could not get (lib/piezas/acciones.ts AvisoDePiezaNueva); its page asks for it. */
export function rutaDePieza(id: string, aviso: readonly string[] = []): string {
  return `/piezas/${id}${aviso.length > 0 ? `?aviso=${aviso.join(",")}` : ""}`
}

export function rutaDeEditarCarrusel(piezaId: string): string {
  return `${RUTA_DE_CARRUSEL}?pieza=${encodeURIComponent(piezaId)}`
}

const PUBLICAS = new Set([RUTA_DE_INGRESO])

/** Where the proxy redirects a request, or null to let it through. Brand access is checked by the app layout. */
export function destinoDe(ruta: string, conSesion: boolean): string | null {
  if (!conSesion) return PUBLICAS.has(ruta) ? null : RUTA_DE_INGRESO
  return ruta === RUTA_DE_INGRESO ? RUTA_DE_INICIO : null
}
