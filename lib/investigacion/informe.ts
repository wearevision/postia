import type Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { enlaceNormalizado } from "@/lib/mapa/vectores"

// Worker-safe (type-only SDK import): pure validation of what Claude sorted.

const Hallazgo = z.object({
  resumen: z.string().trim().min(1).max(1200),
  cita: z.string().trim().max(300).nullable(),
  enlace: z.string().trim().min(1).max(2000),
  medio: z.string().trim().min(1).max(200),
  publicado_en: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
})
export const Informe = z.object({
  angulos: z
    .array(
      z.object({
        nombre: z.string().trim().min(1).max(80),
        por_que: z.string().trim().max(400),
        hallazgos: z.array(Hallazgo).max(20),
      }),
    )
    .max(8),
})
export type Informe = z.infer<typeof Informe>
export type HallazgoDelInforme = z.infer<typeof Hallazgo>

const LINKEDIN = ["linkedin.com", "lnkd.in"]

/** Data from LinkedIn never reaches Claude or the map (CLAUDE.md); an unparseable link is treated the same way. */
export function esDeLinkedin(enlace: string): boolean {
  let host: string
  try {
    host = new URL(enlace).hostname.toLowerCase()
  } catch {
    return true
  }
  return LINKEDIN.some((d) => host === d || host.endsWith(`.${d}`))
}

/** `enlaceNormalizado` throws on anything that is not an http(s) URL; here such a link simply matches nothing. */
function normalizadoONulo(enlace: string): string | null {
  try {
    return enlaceNormalizado(enlace)
  } catch {
    return null
  }
}

/** Every URL the server-side searches actually returned in this answer. */
export function urlsDeLaBusqueda(bloques: readonly Anthropic.ContentBlock[]): Set<string> {
  const urls = new Set<string>()
  for (const b of bloques) {
    if (b.type !== "web_search_tool_result" || !Array.isArray(b.content)) continue
    for (const r of b.content) if (r.type === "web_search_result") urls.add(r.url)
  }
  return urls
}

export interface InformeValidado {
  angulos: { nombre: string; por_que: string; hallazgos: HallazgoDelInforme[] }[]
  descartados: { inventados: number; linkedin: number }
}

/**
 * «Se cita, no se copia»: a finding keeps its link only if the search returned it (compared normalised, so tracking
 * parameters do not matter); LinkedIn and invented links are dropped and counted. `desde` drops dated findings older
 * than that day (the Saturday watch wants the week).
 */
export function validarInforme(
  informe: Informe,
  vistas: ReadonlySet<string>,
  opciones: { desde?: string } = {},
): InformeValidado {
  const conocidas = new Set([...vistas].flatMap((v) => normalizadoONulo(v) ?? []))
  const descartados = { inventados: 0, linkedin: 0 }
  const angulos = informe.angulos
    .map((a) => ({
      nombre: a.nombre,
      por_que: a.por_que,
      hallazgos: a.hallazgos.filter((h) => {
        if (esDeLinkedin(h.enlace)) {
          descartados.linkedin++
          return false
        }
        const normalizado = normalizadoONulo(h.enlace)
        if (normalizado === null || !conocidas.has(normalizado)) {
          descartados.inventados++
          return false
        }
        return !(opciones.desde && h.publicado_en && h.publicado_en < opciones.desde)
      }),
    }))
    .filter((a) => a.hallazgos.length > 0)
  return { angulos, descartados }
}
