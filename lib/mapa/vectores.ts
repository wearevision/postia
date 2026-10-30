import { z } from "zod"
import { Falla } from "@/lib/dominio/falla"

/** pgvector's text form, which Postgres casts with `::extensions.vector`. */
export function aLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`
}

const Numeros = z.array(z.number())

export function deLiteral(texto: string): number[] {
  return Numeros.parse(JSON.parse(texto))
}

export function similitud(a: number[], b: number[]): number {
  let punto = 0
  let largoA = 0
  let largoB = 0
  for (let i = 0; i < a.length; i++) {
    punto += a[i] * b[i]
    largoA += a[i] * a[i]
    largoB += b[i] * b[i]
  }
  return punto / Math.sqrt(largoA * largoB)
}

const RASTREO = /^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/

/** The same story shared with different tracking or protocol counts as one link (plano: «descarta repetidos por enlace»). */
export function enlaceNormalizado(enlace: string): string {
  const url = new URL(enlace)
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Falla(`«${enlace}» no es un enlace web.`)
  const host = url.hostname.toLowerCase().replace(/^www\./, "")
  const ruta = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname
  const parametros = [...url.searchParams.entries()]
    .filter(([clave]) => !RASTREO.test(clave))
    .sort(([a], [b]) => a.localeCompare(b))
  const busqueda = parametros.length > 0 ? `?${new URLSearchParams(parametros).toString()}` : ""
  return `${host}${ruta}${busqueda}`
}
