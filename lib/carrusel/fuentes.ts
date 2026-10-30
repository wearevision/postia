import { readFile } from "node:fs/promises"
import path from "node:path"
import { ARCHIVOS_DE_FUENTES, type UrlDeFuente } from "@/lib/plantillas/estilos"

// Trigger.dev only. additionalFiles ships assets/fuentes and legacyDevProcessCwdBehaviour: false makes process.cwd()
// the build directory, in dev and deploy alike (trigger.config.ts). Tests run from the repo root, where it also is.
const CARPETA = path.join(process.cwd(), "assets", "fuentes")

/** Every template font as a data: URL, so the page needs no file:// access. */
export async function fuentesEmbebidas(): Promise<UrlDeFuente> {
  const urls = new Map<string, string>()
  for (const archivo of ARCHIVOS_DE_FUENTES) {
    const datos = await readFile(path.join(CARPETA, archivo))
    urls.set(archivo, `data:font/woff2;base64,${datos.toString("base64")}`)
  }
  return (archivo) => {
    const url = urls.get(archivo)
    if (!url) throw new Error(`Fuente desconocida: ${archivo}`)
    return url
  }
}
