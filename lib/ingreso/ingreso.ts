// The fields of Supabase's AuthError this module reads; AuthError itself fits this shape.
type ErrorDeAuth = { message: string; status?: number; code?: string }
type Respuesta = { error: ErrorDeAuth | null }

/** The two Supabase Auth calls sign-in needs; a test passes a fake. */
export interface AuthDeIngreso {
  signInWithOtp(args: { email: string; options: { shouldCreateUser: false } }): PromiseLike<Respuesta>
  verifyOtp(args: { email: string; token: string; type: "email" }): PromiseLike<Respuesta>
}

export interface DepsIngreso {
  auth: AuthDeIngreso
}

export type ResultadoIngreso = { ok: true } | { ok: false; error: string }

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// What Supabase answers for an address without a user. The screen answers as if there was one: who is invited is not
// something a stranger can find out by trying addresses.
const SIN_USUARIO = new Set(["otp_disabled", "signup_disabled", "user_not_found"])

const estaLimitado = (error: ErrorDeAuth) =>
  error.status === 429 || error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit"

function esperaDelError(mensaje: string): string | null {
  const segundos = /(\d+)\s*seconds?/i.exec(mensaje)?.[1]
  return segundos ? `${segundos} segundos` : null
}

export function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase()
}

export async function pedirCodigo(deps: DepsIngreso, correo: string): Promise<ResultadoIngreso> {
  const email = normalizarCorreo(correo)
  if (!CORREO.test(email)) return { ok: false, error: "Revisa tu correo: le falta algo." }
  const { error } = await deps.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
  if (!error || (error.code !== undefined && SIN_USUARIO.has(error.code))) return { ok: true }
  if (estaLimitado(error)) {
    const espera = esperaDelError(error.message)
    return {
      ok: false,
      error: espera ? `Espera ${espera} para pedir otro código.` : "Espera un momento para pedir otro código.",
    }
  }
  console.error("No pude mandar el código de ingreso", error)
  return { ok: false, error: "No pude mandar el código. Inténtalo de nuevo en un rato." }
}

export async function verificarCodigo(deps: DepsIngreso, correo: string, codigo: string): Promise<ResultadoIngreso> {
  const token = codigo.trim()
  if (!/^\d{6}$/.test(token)) return { ok: false, error: "El código tiene seis números." }
  const { error } = await deps.auth.verifyOtp({ email: normalizarCorreo(correo), token, type: "email" })
  if (!error) return { ok: true }
  if (estaLimitado(error)) return { ok: false, error: "Demasiados intentos. Espera un momento y pide otro código." }
  if (error.code === "otp_expired" || error.status === 403 || error.status === 400) {
    return { ok: false, error: "Ese código no sirve o ya venció. Pide otro." }
  }
  console.error("No pude verificar el código de ingreso", error)
  return { ok: false, error: "No pude revisar el código. Inténtalo de nuevo en un rato." }
}
