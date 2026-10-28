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
  leer(): Promise<DatosDelDispositivo>
  activar(claveVapid: string): Promise<ResultadoDeActivar>
  desactivar(): Promise<null>
}

function bytesDeBase64Url(texto: string): Uint8Array<ArrayBuffer> {
  const base64 = (texto + "=".repeat((4 - (texto.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
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
    async leer() {
      const soportado = soportaPush()
      let suscrito = false
      if (soportado) {
        const registro = await navigator.serviceWorker.getRegistration("/")
        suscrito = Boolean(await registro?.pushManager.getSubscription())
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
      const suscripcion =
        (await registro.pushManager.getSubscription()) ??
        (await registro.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: bytesDeBase64Url(claveVapid),
        }))
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
