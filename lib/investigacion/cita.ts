const COMILLAS_DE_LOS_BORDES = /^[\s«»"“”'‘’]+|[\s«»"“”'‘’]+$/g

/** Citations often arrive already quoted; the page adds its own «», so the edges are stripped first. */
export function limpiarCita(cita: string): string {
  return cita.replace(COMILLAS_DE_LOS_BORDES, "")
}
