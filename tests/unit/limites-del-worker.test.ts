import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, test } from "vitest"

function archivos(carpeta: string): string[] {
  if (!existsSync(carpeta)) return []
  return readdirSync(carpeta).flatMap((nombre) => {
    const ruta = path.join(carpeta, nombre)
    return statSync(ruta).isDirectory() ? archivos(ruta) : /\.(ts|tsx)$/.test(nombre) ? [ruta] : []
  })
}

describe("Worker boundary", () => {
  test("no route, component or module the Worker serves imports the Claude client or the Anthropic SDK", () => {
    // lib/gasto/lectura.ts and acciones.ts arrive in Task 8; Ajustes imports them.
    const servidas = [
      ...archivos("app"),
      ...archivos("components"),
      "lib/gasto/lectura.ts",
      "lib/gasto/acciones.ts",
    ].filter((f) => existsSync(f))
    const culpables = servidas.filter((f) => /from "(@\/lib\/ia\/|@anthropic-ai\/sdk)/.test(readFileSync(f, "utf8")))
    expect(culpables).toEqual([])
  })
})
