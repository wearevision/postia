import { z } from "zod"

export type Web = "wr3" | "wav"
export const WEBS: Record<Web, { nombre: string; base: string }> = {
  wr3: { nombre: "WR3", base: "https://wr3.wearevision.cl/" },
  wav: { nombre: "wearevision.cl", base: "https://wearevision.cl/" },
}

export interface Pagina {
  url: string
  titulo: string
  tema: string
}

const ESPERA_MS = 8_000

export async function leerPaginas(web: Web): Promise<Pagina[]> {
  const { nombre, base } = WEBS[web]
  const respuesta = await fetch(`${base}paginas.json`, { signal: AbortSignal.timeout(ESPERA_MS), cache: "no-store" })
  if (!respuesta.ok) throw new Error(`paginas.json de ${nombre} respondió ${respuesta.status}`)
  const lista = z
    .array(z.object({ url: z.string().startsWith(base), titulo: z.string(), tema: z.string() }))
    .safeParse(await respuesta.json())
  if (!lista.success) throw new Error(`paginas.json de ${nombre} no es válido`)
  return lista.data
}

/** Words of 4 or more letters, lowercase and without accents: cheap enough to rank without AI or cost (spec). */
function palabras(texto: string): Set<string> {
  const limpio = texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
  return new Set(limpio.match(/\p{L}{4,}/gu) ?? [])
}

export function ordenarPorTexto(paginas: Pagina[], texto: string): Pagina[] {
  const delTexto = palabras(texto)
  const puntaje = (p: Pagina) => [...palabras(`${p.titulo} ${p.tema}`)].filter((w) => delTexto.has(w)).length
  return paginas
    .map((p, i) => ({ p, i, n: puntaje(p) }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map(({ p }) => p)
}
