"use server"

import { revalidatePath } from "next/cache"
import {
  agregarCuenta,
  cambiarRitmo,
  cambiarRuta,
  crearMarca,
  desconectarCuenta,
  type Resultado,
} from "@/lib/marcas/acciones"
import { RUTA_DE_AJUSTES, RUTA_DE_MARCAS } from "@/lib/sesion/rutas"
import { createActionClient } from "@/lib/supabase/action"

function despues(resultado: Resultado): Resultado {
  if (resultado.ok) {
    revalidatePath(RUTA_DE_MARCAS)
    revalidatePath(RUTA_DE_AJUSTES)
  }
  return resultado
}

export async function crearMarcaAccion(_previo: Resultado | null, datos: FormData): Promise<Resultado> {
  return despues(await crearMarca(await createActionClient(), { nombre: datos.get("nombre"), voz: datos.get("voz") }))
}

export async function agregarCuentaAccion(_previo: Resultado | null, datos: FormData): Promise<Resultado> {
  return despues(
    await agregarCuenta(await createActionClient(), {
      marcaId: datos.get("marcaId"),
      tipo: datos.get("tipo"),
      ruta: datos.get("ruta"),
      nombre: datos.get("nombre"),
      ritmoSemanal: datos.get("ritmoSemanal"),
    }),
  )
}

export async function desconectarCuentaAccion(_previo: Resultado | null, datos: FormData): Promise<Resultado> {
  const cuentaId = datos.get("cuentaId")
  if (typeof cuentaId !== "string") return { ok: false, error: "Falta la cuenta." }
  return despues(await desconectarCuenta(await createActionClient(), cuentaId))
}

export async function cambiarRutaAccion(cuentaId: string, ruta: "api" | "a_mano"): Promise<Resultado> {
  return despues(await cambiarRuta(await createActionClient(), { cuentaId, ruta }))
}

export async function cambiarRitmoAccion(cuentaId: string, ritmoSemanal: number): Promise<Resultado> {
  return despues(await cambiarRitmo(await createActionClient(), { cuentaId, ritmoSemanal }))
}
