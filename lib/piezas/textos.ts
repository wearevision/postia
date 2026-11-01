type Ruta = "api" | "metricool" | "a_mano"

// A by-hand account never publishes by itself: the app only dates the piece and notifies a person.
export function lineaEnReserva(ruta: Ruta, cuenta: string): string {
  const accion = ruta === "a_mano" ? "te avisa para publicarla a mano" : "la publica"
  return `En reserva: la app le pone fecha y ${accion} cuando a ${cuenta} le falte una pieza firmada.`
}

export function explicacionDeReserva(ruta: Ruta, cuenta: string): string {
  const quien = ruta === "a_mano" ? "Te aviso para publicarla a mano" : "La app la publica"
  return `${quien} cuando a ${cuenta} le falte una pieza.`
}

/** The title of the fold with what can still change before signing, naming only what applies. */
export function tituloDeCambios({
  redaccion,
  carrusel,
  pilar,
}: {
  /** Claude's correction and rewrite are offered. */
  redaccion: boolean
  /** The carousel can be edited. */
  carrusel: boolean
  /** The pillar can change. */
  pilar: boolean
}): string {
  if (redaccion) return "Corregir o pedir otra versión"
  if (carrusel) return pilar ? "Editar el carrusel o el pilar" : "Editar el carrusel"
  return "Cambiar el pilar"
}

/** The first twelve hex digits of a fingerprint in three groups of four: enough to tell versions apart on screen. */
export function huellaCorta(huella: string): string {
  return (huella.slice(0, 12).match(/.{1,4}/g) ?? []).join("·")
}
