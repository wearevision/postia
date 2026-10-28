/** What a push carries. The service worker shows `titulo`/`cuerpo` and opens `url` (own paths only). */
export interface MensajePush {
  titulo: string
  cuerpo: string
  url: string
}

export interface SuscripcionDelNavegador {
  endpoint: string
  p256dh: string
  auth: string
  userAgent: string
}
