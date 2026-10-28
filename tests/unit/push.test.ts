import { createECDH, randomBytes } from "node:crypto"
import { HttpResponse, http } from "msw"
import { describe, expect, test } from "vitest"
import { generateVAPIDKeys } from "web-push"
import { servicioPushVapid } from "@/lib/avisos/push"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { servidor } from "../msw"

function suscripcion() {
  const ecdh = createECDH("prime256v1")
  ecdh.generateKeys()
  return {
    endpoint: "https://push.prueba.test/aparato",
    p256dh: ecdh.getPublicKey().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
  }
}

function servicio() {
  const { publicKey, privateKey } = generateVAPIDKeys()
  return servicioPushVapid({ clavePublica: publicKey, clavePrivada: privateKey, asunto: "mailto:avisos@prueba.test" })
}

const MENSAJE = { titulo: "PostIA", cuerpo: "Así se ven tus avisos.", url: "/" }

describe("servicioPushVapid", () => {
  test("sends an encrypted push to the endpoint", async () => {
    let cifrado: string | null = null
    servidor.use(
      http.post("https://push.prueba.test/aparato", ({ request }) => {
        cifrado = request.headers.get("content-encoding")
        return new HttpResponse(null, { status: 201 })
      }),
    )
    expect(await servicio().enviar(suscripcion(), MENSAJE, { urgente: false })).toEqual({ estado: "enviado" })
    expect(cifrado).toBe("aes128gcm")
  })

  test("a 410 means the device forgot the subscription", async () => {
    servidor.use(http.post("https://push.prueba.test/aparato", () => new HttpResponse(null, { status: 410 })))
    expect(await servicio().enviar(suscripcion(), MENSAJE, { urgente: false })).toEqual({ estado: "caducada" })
  })

  test("refuses malformed VAPID keys", () => {
    expect(() => servicioPushVapid({ clavePublica: "x", clavePrivada: "y", asunto: "mailto:a@b.cl" })).toThrow(
      FallaDeConfiguracion,
    )
  })
})
