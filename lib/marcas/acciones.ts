import { z } from "zod"
import type { Db } from "@/lib/supabase/database"

export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const NuevaMarca = z.object({ nombre: z.string().trim().min(1).max(80), voz: z.enum(["yo", "nosotros"]) })

const NuevaCuenta = z.object({
  marcaId: z.uuid(),
  tipo: z.enum(["persona", "empresa"]),
  ruta: z.enum(["api", "metricool", "a_mano"]),
  nombre: z.string().trim().min(1).max(80),
  ritmoSemanal: z.coerce.number().int().min(0).max(21),
})

const CambioDeRuta = z.object({ cuentaId: z.uuid(), ruta: z.enum(["api", "a_mano"]) })

const RUTA_INVALIDA = "Elige «sale sola» o «a mano»."

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
    "23505": "Esa marca ya tiene una cuenta con ese nombre.",
    "42501": "Solo el dueño de la marca puede agregar cuentas.",
  })
}

export async function desconectarCuenta(db: Db, cuentaId: string): Promise<Resultado> {
  const { error } = await db.rpc("desconectar_cuenta", { p_cuenta: cuentaId })
  if (!error) return { ok: true }
  return falla(error, { "42501": "Solo el dueño de la marca puede desconectar." })
}

/** «Sale sola» ↔ «a mano». Going by hand unlinks the LinkedIn connection (the RPC does it). */
export async function cambiarRuta(db: Db, entrada: unknown): Promise<Resultado> {
  const leida = CambioDeRuta.safeParse(entrada)
  if (!leida.success) return { ok: false, error: RUTA_INVALIDA }
  const { error } = await db.rpc("cambiar_ruta", { p_cuenta: leida.data.cuentaId, p_ruta: leida.data.ruta })
  if (!error) return { ok: true }
  return falla(error, {
    "42501": "Solo el dueño de la marca puede cambiar cómo sale una cuenta.",
    "22023": RUTA_INVALIDA,
  })
}
