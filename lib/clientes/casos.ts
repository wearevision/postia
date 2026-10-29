import { z } from "zod"
import { Falla } from "@/lib/dominio/falla"
import type { TablesInsert } from "@/lib/supabase/database.types"

const Caso = z.object({
  slug: z.string().regex(/^[a-z0-9-]{3,140}$/),
  client: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(200),
  year: z.number().int().min(1990).max(2100).nullable(),
  country: z.string().max(80).nullable(),
  city: z.string().max(80).nullable(),
  industry: z.string().max(120).nullable(),
  workTypes: z.array(z.string()),
  capabilities: z.array(z.string()),
  summary: z.string().max(4000),
  role: z.string().max(2000),
  citableClaim: z.string().max(600).nullable(),
  era: z.enum(["trayectoria", "wav"]),
  exception: z.string().nullable(),
})
type CasoDelArchivo = z.infer<typeof Caso>

const Archivo = z.object({ cases: z.array(z.unknown()) })

export type CasoParaCargar = Omit<TablesInsert<"casos">, "cargado_en">

/** data/casos/casos.json → rows of public.casos. The file is PostIA's corrected copy; wav-repository is not touched. */
export function leerCasos(json: unknown): CasoParaCargar[] {
  const archivo = Archivo.safeParse(json)
  if (!archivo.success) throw new Falla("El archivo de casos no tiene la lista «cases».")
  const vistos = new Set<string>()
  return archivo.data.cases.map((crudo, i) => {
    const leido = Caso.safeParse(crudo)
    const nombre = (crudo as { slug?: unknown })?.slug ?? `#${i + 1}`
    if (!leido.success) throw new Falla(`El caso ${String(nombre)} no es válido: ${leido.error.issues[0]?.message}`)
    const c = leido.data
    if (vistos.has(c.slug)) throw new Falla(`El caso ${c.slug} está repetido.`)
    vistos.add(c.slug)
    return {
      slug: c.slug,
      cliente: c.client,
      titulo: c.title,
      anio: c.year,
      pais: c.country,
      ciudad: c.city,
      industria: c.industry,
      tipos_de_trabajo: c.workTypes,
      capacidades: c.capabilities,
      resumen: c.summary,
      rol: c.role,
      frase_citable: c.citableClaim,
      era: c.era,
    }
  })
}

/** D13 defaults: private events are not named. Confidential WR3 studies are not in the file; Federico marks them. */
export function excepcionesIniciales(
  casos: readonly Pick<CasoDelArchivo, "slug" | "client" | "exception">[],
): { cliente: string; caso_slug: string; tipo: "no_nombrar" }[] {
  return casos
    .filter((c) => c.exception === "evento privado")
    .map((c) => ({ cliente: c.client, caso_slug: c.slug, tipo: "no_nombrar" as const }))
}
