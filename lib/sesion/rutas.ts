export const RUTA_DE_INICIO = "/"
export const RUTA_DE_INGRESO = "/ingreso"
export const RUTA_DE_SALIR = "/salir"
export const RUTA_DE_MARCAS = "/marcas"
export const RUTA_DE_AJUSTES = "/ajustes"
export const RUTA_DE_CARRUSEL = "/piezas/carrusel"
export const RUTA_DE_CALENDARIO = "/calendario"
export const RUTA_DE_VOZ = "/voz"
export const RUTA_DE_CLIENTES = "/clientes"
export const RUTA_DE_INVESTIGAR = "/investigar"
export const RUTA_DE_IDEAS = "/ideas"

export function rutaDeCalendario(destino: { semana: string } | { mes: string }): string {
  return "semana" in destino
    ? `${RUTA_DE_CALENDARIO}?semana=${destino.semana}`
    : `${RUTA_DE_CALENDARIO}?vista=mes&mes=${destino.mes}`
}

export function rutaDeVoz(marcaId: string, version?: number): string {
  return `${RUTA_DE_VOZ}/${encodeURIComponent(marcaId)}${version ? `?version=${version}` : ""}`
}

export function rutaDePieza(id: string): string {
  return `/piezas/${id}`
}

export function rutaDeEditarCarrusel(piezaId: string): string {
  return `${RUTA_DE_CARRUSEL}?pieza=${encodeURIComponent(piezaId)}`
}

export function rutaDeInvestigacion(id: string): string {
  return `${RUTA_DE_INVESTIGAR}/${encodeURIComponent(id)}`
}

export function rutaDeSerie(investigacionId: string): string {
  return `${RUTA_DE_IDEAS}?serie=${encodeURIComponent(investigacionId)}`
}

/** An idea inside its series' page; an idea whose research is gone is still on the full list. */
export function rutaDeIdea(ideaId: string, investigacionId: string | null): string {
  return `${investigacionId ? rutaDeSerie(investigacionId) : RUTA_DE_IDEAS}#idea-${encodeURIComponent(ideaId)}`
}

const PUBLICAS = new Set([RUTA_DE_INGRESO])

/** Where the proxy redirects a request, or null to let it through. Brand access is checked by the app layout. */
export function destinoDe(ruta: string, conSesion: boolean): string | null {
  if (!conSesion) return PUBLICAS.has(ruta) ? null : RUTA_DE_INGRESO
  return ruta === RUTA_DE_INGRESO ? RUTA_DE_INICIO : null
}
