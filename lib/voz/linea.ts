import { z } from "zod"

export const SECCIONES = ["deQueHablamos", "tono", "formatos", "temasVetados", "temasAVigilar", "ejemplos"] as const
export type Seccion = (typeof SECCIONES)[number]
export type SeccionesDeLinea = Record<Seccion, string>

export const NOMBRE_DE_SECCION: Record<Seccion, string> = {
  deQueHablamos: "De qué hablamos",
  tono: "Tono y voz",
  formatos: "Formatos",
  temasVetados: "Temas vetados",
  temasAVigilar: "Temas a vigilar",
  ejemplos: "Ejemplos aprobados",
}

// Same limits as the checks in 20261031120000_voz_y_clientes.sql.
export const LARGO_DE_SECCION: Record<Seccion, number> = {
  deQueHablamos: 6000,
  tono: 6000,
  formatos: 6000,
  temasVetados: 6000,
  temasAVigilar: 6000,
  ejemplos: 20000,
}

export const MAXIMO_DE_PILARES = 8
export const POR_SEMANA = [0.5, 1, 1.5, 2, 3] as const

export interface PilarDeLinea {
  id?: string
  nombre: string
  deQueHabla: string
  material: string
  porSemana: number
}

const Pilar = z.object({
  id: z.uuid().optional(),
  nombre: z.string().trim().min(1).max(60),
  deQueHabla: z.string().max(400),
  material: z.string().max(400),
  porSemana: z.number().positive().max(7).multipleOf(0.5),
})

export const Secciones = z.object(
  Object.fromEntries(SECCIONES.map((s) => [s, z.string().max(LARGO_DE_SECCION[s])])) as Record<Seccion, z.ZodString>,
)

export const Pilares = z
  .array(Pilar)
  .min(1)
  .max(MAXIMO_DE_PILARES)
  .refine((ps) => new Set(ps.map((p) => p.nombre.trim().toLowerCase())).size === ps.length, {
    message: "pilares_repetidos",
  })

export const LineaParaGuardar = z.object({
  marcaId: z.uuid(),
  base: z.number().int().min(0),
  secciones: Secciones,
  pilares: Pilares,
})
export type LineaParaGuardar = z.infer<typeof LineaParaGuardar>
