import { generateRequestDetails } from "web-push"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { exigirEnv } from "@/lib/env"
import type { MensajePush } from "./tipos"

export interface SuscripcionPush {
  endpoint: string
  p256dh: string
  auth: string
}

export type ResultadoPush = { estado: "enviado" } | { estado: "caducada" } | { estado: "fallo"; detalle: string }

export interface ServicioPush {
  enviar(suscripcion: SuscripcionPush, mensaje: MensajePush, opciones: { urgente: boolean }): Promise<ResultadoPush>
}

// RFC 8030: a notice not delivered within a day is useless.
const VIDA_DEL_MENSAJE_S = 86_400
const MAXIMO_DE_CARGA_BYTES = 3000
const ESPERA_MS = 15_000
const ASUNTO_VALIDO = /^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/

function exigirClave(nombre: string, valor: string, bytes: number) {
  if (Buffer.from(valor, "base64url").length !== bytes) {
    throw new FallaDeConfiguracion(`${nombre} no es una llave VAPID válida (${bytes} bytes en base64 url-safe).`)
  }
}

/**
 * Web Push with VAPID: `web-push` builds the request (RFC 8291 encryption, RFC 8292 signature) and `fetch` sends it,
 * with a timeout and visible to MSW. The endpoint is a capability: it never appears in an error or a log.
 */
export function servicioPushVapid(opciones: {
  clavePublica: string
  clavePrivada: string
  asunto: string
}): ServicioPush {
  exigirClave("VAPID_PUBLIC_KEY", opciones.clavePublica, 65)
  exigirClave("VAPID_PRIVATE_KEY", opciones.clavePrivada, 32)
  if (!ASUNTO_VALIDO.test(opciones.asunto)) {
    throw new FallaDeConfiguracion("VAPID_SUBJECT debe ser una dirección mailto: o https:.")
  }
  return {
    async enviar(suscripcion, mensaje, { urgente }) {
      const carga = JSON.stringify(mensaje)
      if (Buffer.byteLength(carga) > MAXIMO_DE_CARGA_BYTES) throw new Error("El mensaje de push es demasiado grande.")
      const detalles = generateRequestDetails(
        { endpoint: suscripcion.endpoint, keys: { p256dh: suscripcion.p256dh, auth: suscripcion.auth } },
        carga,
        {
          TTL: VIDA_DEL_MENSAJE_S,
          urgency: urgente ? "high" : "normal",
          vapidDetails: {
            subject: opciones.asunto,
            publicKey: opciones.clavePublica,
            privateKey: opciones.clavePrivada,
          },
        },
      )
      let respuesta: Response
      try {
        respuesta = await fetch(detalles.endpoint, {
          method: "POST",
          headers: detalles.headers,
          body: new Uint8Array(detalles.body),
          signal: AbortSignal.timeout(ESPERA_MS),
        })
      } catch (error) {
        const causa = error instanceof Error ? error.name : "error desconocido"
        return { estado: "fallo", detalle: `No pude conectar con el servicio de push (${causa}).` }
      }
      if (respuesta.ok) return { estado: "enviado" }
      if (respuesta.status === 404 || respuesta.status === 410) return { estado: "caducada" }
      return { estado: "fallo", detalle: `El servicio de push respondió HTTP ${respuesta.status}.` }
    },
  }
}

export function servicioPushReal(entorno: Record<string, string | undefined> = process.env): ServicioPush {
  return servicioPushVapid({
    clavePublica: exigirEnv("VAPID_PUBLIC_KEY", entorno.VAPID_PUBLIC_KEY),
    clavePrivada: exigirEnv("VAPID_PRIVATE_KEY", entorno.VAPID_PRIVATE_KEY),
    asunto: exigirEnv("VAPID_SUBJECT", entorno.VAPID_SUBJECT),
  })
}
