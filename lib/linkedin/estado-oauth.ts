import { randomBytes, timingSafeEqual } from "node:crypto"

export const COOKIE_DE_ESTADO_LINKEDIN = "postia_linkedin_estado"
export const RUTA_DE_LA_COOKIE_LINKEDIN = "/api/linkedin"
const DIEZ_MINUTOS = 10 * 60
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A one-use value that goes out with the redirect and must come back: it proves this browser started the connection. */
export function nuevoEstado(): string {
  return randomBytes(32).toString("hex")
}

export function estadoCoincide(guardado: string | null | undefined, recibido: string | null | undefined): boolean {
  if (!guardado || !recibido) return false
  const a = Buffer.from(guardado)
  const b = Buffer.from(recibido)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function esUuid(valor: string | null | undefined): valor is string {
  return !!valor && UUID.test(valor)
}

/** The cookie also carries which account is being connected, so the callback needs nothing from the URL but LinkedIn's. */
export function empacarEstado(estado: string, cuenta: string): string {
  return `${estado}:${cuenta}`
}

export function desempacarEstado(valor: string | undefined): { estado: string; cuenta: string } | null {
  const [estado, cuenta] = valor?.split(":") ?? []
  return estado && esUuid(cuenta) ? { estado, cuenta } : null
}

export function opcionesDeLaCookieLinkedin(https: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: https,
    path: RUTA_DE_LA_COOKIE_LINKEDIN,
    maxAge: DIEZ_MINUTOS,
  }
}
