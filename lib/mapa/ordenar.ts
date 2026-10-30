import { TopeAlcanzado } from "@/lib/gasto/pagar"
import { agrupar } from "./agrupar"
import type { ParDeTemas } from "./repositorio"
import { NUEVOS_TEMAS_POR_NOCHE, UMBRALES } from "./umbrales"

export interface PuertosDelMapa {
  reubicar(umbral: number): Promise<number>
  pendientes(): Promise<{ id: string; resumen: string; vector: number[] }[]>
  crearTema(tema: { nombre: string; descripcion: string }, hallazgos: string[]): Promise<string>
  casiIguales(umbral: number): Promise<ParDeTemas[]>
  fusionar(de: string, en: string): Promise<boolean>
  nombrar(clave: string, resumenes: string[]): Promise<{ nombre: string; descripcion: string }>
}

export interface Orden {
  reubicados: number
  temasNuevos: number
  sinNombre: number
  sinCrear: number
  fusionados: number
}

/** Plano «Mantenimiento» for the map: re-place loose findings, form topics from what is left, merge near-identical topics. */
export async function ordenarMapa(
  puertos: PuertosDelMapa,
  runId: string,
  umbrales: { tema: number; fusion: number; minimoParaTema: number } = UMBRALES,
): Promise<Orden> {
  const reubicados = await puertos.reubicar(umbrales.tema)

  const sueltos = await puertos.pendientes()
  const grupos = agrupar(sueltos, {
    umbral: umbrales.tema,
    minimo: umbrales.minimoParaTema,
    maximo: NUEVOS_TEMAS_POR_NOCHE,
  })
  const resumenDe = new Map(sueltos.map((s) => [s.id, s.resumen]))
  let temasNuevos = 0
  let sinNombre = 0
  let sinCrear = 0
  for (const [n, grupo] of grupos.entries()) {
    let tema: { nombre: string; descripcion: string }
    try {
      tema = await puertos.nombrar(
        `nombrar-tema:${runId}:${n}`,
        grupo.map((id) => resumenDe.get(id) ?? ""),
      )
    } catch (error) {
      if (error instanceof TopeAlcanzado) {
        sinNombre += grupos.length - n
        break
      }
      console.error(`No pude nombrar el grupo ${n}: ${error instanceof Error ? error.message : String(error)}`)
      sinNombre += 1
      continue
    }
    try {
      await puertos.crearTema(tema, grupo)
      temasNuevos += 1
    } catch (error) {
      console.error(`No pude crear el tema del grupo ${n}: ${error instanceof Error ? error.message : String(error)}`)
      sinCrear += 1
    }
  }

  // Pairs were computed before any merge: follow each end to its current survivor, so a topic merged earlier
  // in the night is never merged again, and sizes are the sums so far.
  const destino = new Map<string, string>()
  const tamano = new Map<string, number>()
  const sobreviviente = (id: string): string => {
    let actual = id
    for (let siguiente = destino.get(actual); siguiente !== undefined; siguiente = destino.get(actual)) {
      actual = siguiente
    }
    return actual
  }
  let fusionados = 0
  for (const par of await puertos.casiIguales(umbrales.fusion)) {
    if (!tamano.has(par.a)) tamano.set(par.a, par.hallazgos.a)
    if (!tamano.has(par.b)) tamano.set(par.b, par.hallazgos.b)
    const a = sobreviviente(par.a)
    const b = sobreviviente(par.b)
    if (a === b) continue
    const tamanoA = tamano.get(a) ?? 0
    const tamanoB = tamano.get(b) ?? 0
    const [de, en] = tamanoA >= tamanoB ? [b, a] : [a, b]
    if (await puertos.fusionar(de, en)) {
      destino.set(de, en)
      tamano.set(en, (tamano.get(en) ?? 0) + (tamano.get(de) ?? 0))
      fusionados += 1
    }
  }

  return { reubicados, temasNuevos, sinNombre, sinCrear, fusionados }
}
