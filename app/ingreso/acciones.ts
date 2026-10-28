"use server"

import { redirect } from "next/navigation"
import { pedirCodigo, type ResultadoIngreso, verificarCodigo } from "@/lib/ingreso/ingreso"
import { RUTA_DE_INICIO } from "@/lib/sesion/rutas"
import { createActionClient } from "@/lib/supabase/action"

export async function pedirCodigoAccion(correo: string): Promise<ResultadoIngreso> {
  const db = await createActionClient()
  return pedirCodigo({ auth: db.auth }, correo)
}

export async function verificarCodigoAccion(correo: string, codigo: string): Promise<ResultadoIngreso> {
  const db = await createActionClient()
  const resultado = await verificarCodigo({ auth: db.auth }, correo, codigo)
  if (resultado.ok) redirect(RUTA_DE_INICIO)
  return resultado
}
