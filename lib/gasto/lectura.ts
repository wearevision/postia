import { z } from "zod"
import type { Db } from "@/lib/supabase/database"

const Fila = z
  .object({
    marca_id: z.string().nullable(),
    nombre: z.string(),
    tope_micro: z.number().nullable(),
    gastado_micro: z.number(),
  })
  .transform((f) => ({ marcaId: f.marca_id, nombre: f.nombre, topeMicro: f.tope_micro, gastadoMicro: f.gastado_micro }))

const Resumen = z
  .object({ mes: z.string(), tope_micro: z.number(), gastado_micro: z.number(), filas: z.array(Fila) })
  .transform((r) => ({ mes: r.mes, topeMicro: r.tope_micro, gastadoMicro: r.gastado_micro, filas: r.filas }))

export type ResumenDeGasto = z.output<typeof Resumen>

export async function resumenDeGasto(db: Db): Promise<ResumenDeGasto> {
  const { data, error } = await db.rpc("resumen_de_gasto")
  if (error) throw new Error(`No pude leer el gasto del mes: ${error.message}`, { cause: error })
  return Resumen.parse(data)
}
