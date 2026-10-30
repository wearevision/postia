import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import type { Db } from "@/lib/supabase/database"
import type { Database } from "@/lib/supabase/database.types"

interface Entorno {
  url: string
  anon: string
  servicio: string
}

let cache: Entorno | null = null

export function entornoLocal(): Entorno {
  if (cache) return cache
  const salida = execFileSync("supabase", ["status", "-o", "env"], { encoding: "utf8" })
  const valores = new Map(
    salida
      .split("\n")
      .map((linea) => /^([A-Z_]+)="?(.*?)"?$/.exec(linea.trim()))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => [m[1], m[2]] as const),
  )
  const url = valores.get("API_URL")
  const anon = valores.get("ANON_KEY")
  const servicio = valores.get("SERVICE_ROLE_KEY")
  if (!url || !anon || !servicio) throw new Error("Supabase local no está corriendo: pnpm db:start")
  cache = { url, anon, servicio }
  return cache
}

export function admin(): Db {
  const { url, servicio } = entornoLocal()
  return createClient<Database>(url, servicio, { auth: { persistSession: false, autoRefreshToken: false } })
}

export function correoUnico(prefijo: string): string {
  return `${prefijo}-${randomUUID().slice(0, 8)}@prueba.postia.test`
}

/** A real user with a session. Tests sign in with a password the app never offers: only the RLS is under test. */
export async function personaConSesion(prefijo: string): Promise<{ db: Db; userId: string }> {
  const correo = correoUnico(prefijo)
  const clave = `clave-${randomUUID()}`
  const { data, error } = await admin().auth.admin.createUser({ email: correo, password: clave, email_confirm: true })
  if (error) throw error
  const { url, anon } = entornoLocal()
  const db = createClient<Database>(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: errorDeIngreso } = await db.auth.signInWithPassword({ email: correo, password: clave })
  if (errorDeIngreso) throw errorDeIngreso
  return { db, userId: data.user.id }
}

export async function marcaConDueno(userId: string, voz: "yo" | "nosotros" = "yo"): Promise<string> {
  const { data, error } = await admin()
    .from("marcas")
    .insert({ nombre: `Marca ${randomUUID().slice(0, 8)}`, voz })
    .select("id")
    .single()
  if (error) throw error
  const { error: errorDeMiembro } = await admin().from("miembros").insert({ marca_id: data.id, user_id: userId })
  if (errorDeMiembro) throw errorDeMiembro
  return data.id
}

export async function cuentaDe(
  marcaId: string,
  tipo: "persona" | "empresa" = "persona",
  ruta: "api" | "a_mano" = "api",
): Promise<string> {
  const { data, error } = await admin()
    .from("cuentas")
    .insert({ marca_id: marcaId, red: "linkedin", tipo, ruta, nombre: `Cuenta ${randomUUID().slice(0, 8)}` })
    .select("id")
    .single()
  if (error) throw error
  return data.id
}

export async function piezaDe(db: Db, cuentaId: string, texto = "Hola desde PostIA"): Promise<string> {
  const { data, error } = await db.rpc("crear_pieza", { p_cuenta: cuentaId, p_formato: "texto", p_texto: texto })
  if (error) throw error
  return data
}

export async function versionVigente(piezaId: string): Promise<{ id: string; huella: string }> {
  const { data, error } = await admin()
    .from("versiones")
    .select("id, huella")
    .eq("pieza_id", piezaId)
    .order("numero", { ascending: false })
    .limit(1)
    .single()
  if (error) throw error
  return data
}

/**
 * tomar_pedidos leases the oldest open text requests of every brand, so a test that leases starts with none open:
 * requests left by earlier files or earlier runs would otherwise be taken first. Local test database only.
 */
export async function cerrarPedidosAbiertos(): Promise<void> {
  const { error } = await admin()
    .from("pedidos_de_texto")
    .update({ estado: "fallo", motivo: "Cerrado entre pruebas." })
    .in("estado", ["pendiente", "trabajando"])
  if (error) throw error
}

export const enDias = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString()
export const haceMinutos = (minutos: number) => new Date(Date.now() - minutos * 60_000).toISOString()
