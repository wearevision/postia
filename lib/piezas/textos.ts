type Ruta = "api" | "metricool" | "a_mano"

// A by-hand account never publishes by itself: the app only dates the piece and notifies a person.
export function lineaEnReserva(ruta: Ruta, cuenta: string): string {
  const accion = ruta === "a_mano" ? "te avisa para publicarla a mano" : "la publica"
  return `En reserva: la app le pone fecha y ${accion} cuando a ${cuenta} le falte una pieza firmada.`
}

export function explicacionDeReserva(ruta: Ruta, cuenta: string): string {
  const resto =
    ruta === "a_mano"
      ? "te avisa para publicarla a mano, sin volver a preguntarte"
      : "la publica sin volver a preguntarte"
  return `Sin fecha. Cuando a ${cuenta} le falte una pieza firmada, la app le pone fecha y ${resto}.`
}
