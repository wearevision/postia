/** Error whose message is written to be shown to the person as-is. */
export class Falla extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "Falla"
  }
}

/** Configuration error meant for WAV: callers log it and show the person a generic notice. */
export class FallaDeConfiguracion extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "FallaDeConfiguracion"
  }
}
