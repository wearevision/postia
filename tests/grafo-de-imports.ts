import path from "node:path"
import ts from "typescript"

/** Paths are POSIX and relative to the repo root, the same root `@/` points to (tsconfig paths). */
export interface Fuente {
  esArchivo(ruta: string): boolean
  leer(ruta: string): string
}

export interface Grafo {
  archivos: Set<string>
  paquetes: Set<string>
  /** "from → specifier" for project imports that matched no file: the walk would be blind past them. */
  sinResolver: string[]
}

const CODIGO = /\.(ts|tsx|mts|js|jsx|mjs)$/

/** The compiler's own scanner: comments and strings cannot hide or cut an import the way a regex can. */
export function especificadores(codigo: string): string[] {
  return ts.preProcessFile(codigo, true, true).importedFiles.map((f) => f.fileName)
}

function resolver(desde: string, especificador: string, fuente: Fuente): string | null {
  const base = especificador.startsWith("@/")
    ? especificador.slice(2)
    : path.posix.join(path.posix.dirname(desde), especificador)
  const candidatos = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]
  return candidatos.find((c) => fuente.esArchivo(c)) ?? null
}

const esDelProyecto = (especificador: string) => especificador.startsWith("@/") || especificador.startsWith(".")

/** Static walk of every import reachable from the entries; package specifiers are collected, not followed. */
export function recorrerImports(entradas: readonly string[], fuente: Fuente): Grafo {
  const grafo: Grafo = { archivos: new Set(), paquetes: new Set(), sinResolver: [] }
  const pendientes = [...entradas]
  for (let ruta = pendientes.pop(); ruta !== undefined; ruta = pendientes.pop()) {
    if (grafo.archivos.has(ruta)) continue
    grafo.archivos.add(ruta)
    if (!CODIGO.test(ruta)) continue
    for (const especificador of especificadores(fuente.leer(ruta))) {
      if (!esDelProyecto(especificador)) {
        grafo.paquetes.add(especificador)
        continue
      }
      const destino = resolver(ruta, especificador, fuente)
      if (destino === null) grafo.sinResolver.push(`${ruta} → ${especificador}`)
      else pendientes.push(destino)
    }
  }
  return grafo
}
