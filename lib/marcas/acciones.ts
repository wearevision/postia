import { z } from "zod"
import type { Db } from "@/lib/supabase/database"

export type Resultado = { ok: true } | { ok: false; error: string }

const NuevaMarca = z.object({ nombre: z.string().trim().min(1).max(80), voz: z.enum(["yo", "nosotros"]) })

const NuevaCuenta = z.object({
  marcaId: z.uuid(),
  tipo: z.enum(["persona", "empresa"]),
  ruta: z.enum(["api", "metricool", "a_mano"]),
  nombre: z.string().trim().min(1).max(80),
  ritmoSemanal: z.coerce.number().int().min(0).max(21),
})

function falla(error: { code?: string; message: string }, porCodigo: Record<string, string>): Resultado {
  const mensaje = error.code ? porCodigo[error.code] : undefined
  if (mensaje) return { ok: false, error: mensaje }
  console.error("Falla inesperada de la base", error)
  return { ok: false, error: "No pude guardar. Inténtalo de nuevo en un rato." }
}

export async function crearMarca(db: Db, entrada: unknown): Promise<Resultado> {
  const leida = NuevaMarca.safeParse(entrada)
  if (!leida.success) return { ok: false, error: "Revisa el nombre y la voz de la marca." }
  const { error } = await db.rpc("crear_marca", { p_nombre: leida.data.nombre, p_voz: leida.data.voz })
  if (!error) return { ok: true }
  return falla(error, { "23505": "Ya existe una marca con ese nombre.", "42501": "Solo un dueño puede crear marcas." })
}

export async function agregarCuenta(db: Db, entrada: unknown): Promise<Resultado> {
  const leida = NuevaCuenta.safeParse(entrada)
  if (!leida.success) return { ok: false, error: "Revisa los datos de la cuenta." }
  const { marcaId, tipo, ruta, nombre, ritmoSemanal } = leida.data
  const { error } = await db
    .from("cuentas")
    .insert({ marca_id: marcaId, red: "linkedin", tipo, ruta, nombre, ritmo_semanal: ritmoSemanal })
  if (!error) return { ok: true }
  return falla(error, {
    "23514": "Por API solo publica el perfil personal hasta que LinkedIn apruebe Community Management. Elige «a mano».",
    "23505": "Esa marca ya tiene una cuenta con ese nombre.",
    "42501": "Solo el dueño de la marca puede agregar cuentas.",
  })
}

export async function desconectarCuenta(db: Db, cuentaId: string): Promise<Resultado> {
  const { error } = await db.rpc("desconectar_cuenta", { p_cuenta: cuentaId })
  if (!error) return { ok: true }
  return falla(error, { "42501": "Solo el dueño de la marca puede desconectar." })
}
