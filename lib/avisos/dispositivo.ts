/** What the device reports, plus whether the server has VAPID keys. */
export interface EntornoDeAvisos {
  configurado: boolean
  ios: boolean
  instalada: boolean
  soportado: boolean
  permiso: NotificationPermission
  suscrito: boolean
}

export type EstadoDeAvisos = "no_disponible" | "instalar" | "denegado" | "listo" | "activo"

/** Order matters: an iPhone in Safari reports no push support, but the fix there is installing the app. */
export function estadoDeAvisos(e: EntornoDeAvisos): EstadoDeAvisos {
  if (!e.configurado) return "no_disponible"
  if (e.ios && !e.instalada) return "instalar"
  if (!e.soportado) return "no_disponible"
  if (e.permiso === "denied") return "denegado"
  if (e.suscrito && e.permiso === "granted") return "activo"
  return "listo"
}
