import type { SuscripcionDelNavegador } from "./tipos"

export interface DatosDelDispositivo {
  ios: boolean
  instalada: boolean
  soportado: boolean
  permiso: NotificationPermission
  suscrito: boolean
}

export type ResultadoDeActivar = { estado: "activada"; suscripcion: SuscripcionDelNavegador } | { estado: "denegada" }

/** The only door to browser push APIs, so components can be tested with a fake. */
export interface PuertoDeAvisos {
  leer(claveVapid: string | null): Promise<DatosDelDispositivo>
  activar(claveVapid: string): Promise<ResultadoDeActivar>
  desactivar(): Promise<null>
}

function bytesDeBase64Url(texto: string): Uint8Array<ArrayBuffer> {
  const base64 = (texto + "=".repeat((4 - (texto.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

/** A push subscription is only valid for the key it was created with; compare bytes, not strings. */
export function mismaClave(clave: ArrayBuffer | null, claveVapid: string): boolean {
  if (!clave) return false
  const actual = new Uint8Array(clave)
  const esperada = bytesDeBase64Url(claveVapid)
  return actual.length === esperada.length && actual.every((byte, i) => byte === esperada[i])
}

function esIos(): boolean {
  // iPadOS asks for the desktop site and says it is a Mac, but a Mac has no touch screen.
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  )
}

function estaInstalada(): boolean {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone
  return window.matchMedia("(display-mode: standalone)").matches || standalone === true
}

function soportaPush(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
}

export function puertoDelNavegador(): PuertoDeAvisos {
  return {
    async leer(claveVapid) {
      const soportado = soportaPush()
      let suscrito = false
      if (soportado) {
        const registro = await navigator.serviceWorker.getRegistration("/")
        const existente = await registro?.pushManager.getSubscription()
        suscrito =
          Boolean(existente) &&
          (claveVapid === null || mismaClave(existente?.options.applicationServerKey ?? null, claveVapid))
      }
      const permiso: NotificationPermission = soportado ? Notification.permission : "default"
      return { ios: esIos(), instalada: estaInstalada(), soportado, permiso, suscrito }
    },
    async activar(claveVapid) {
      // Called straight from the tap: iOS only shows the permission prompt inside a user gesture.
      const permiso = await Notification.requestPermission()
      if (permiso !== "granted") return { estado: "denegada" }
      await navigator.serviceWorker.register("/sw.js", { scope: "/" })
      const registro = await navigator.serviceWorker.ready
      let suscripcion = await registro.pushManager.getSubscription()
      // A subscription made with a rotated-out key can never receive pushes: replace it.
      if (suscripcion && !mismaClave(suscripcion.options.applicationServerKey, claveVapid)) {
        await suscripcion.unsubscribe()
        suscripcion = null
      }
      suscripcion ??= await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: bytesDeBase64Url(claveVapid),
      })
      const { keys } = suscripcion.toJSON()
      return {
        estado: "activada",
        suscripcion: {
          endpoint: suscripcion.endpoint,
          p256dh: keys?.p256dh ?? "",
          auth: keys?.auth ?? "",
          userAgent: navigator.userAgent.slice(0, 300),
        },
      }
    },
    async desactivar() {
      const registro = await navigator.serviceWorker.getRegistration("/")
      await (await registro?.pushManager.getSubscription())?.unsubscribe()
      return null
    },
  }
}
