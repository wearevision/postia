import { similitud } from "./vectores"

/**
 * Greedy and deterministic: in the given order, each finding not yet used seeds a group with every unused finding at
 * `umbral` or more from it. A group under `minimo` is dropped and its findings stay free for later seeds.
 */
export function agrupar(
  sueltos: { id: string; vector: number[] }[],
  opciones: { umbral: number; minimo: number; maximo: number },
): string[][] {
  const usados = new Set<string>()
  const grupos: string[][] = []
  for (const semilla of sueltos) {
    if (grupos.length >= opciones.maximo) break
    if (usados.has(semilla.id)) continue
    const grupo = sueltos.filter(
      (otro) =>
        !usados.has(otro.id) && (otro.id === semilla.id || similitud(semilla.vector, otro.vector) >= opciones.umbral),
    )
    if (grupo.length < opciones.minimo) continue
    for (const miembro of grupo) usados.add(miembro.id)
    grupos.push(grupo.map((m) => m.id))
  }
  return grupos
}
