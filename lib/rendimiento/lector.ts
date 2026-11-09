import type { Resultado } from "@/lib/marcas/acciones"
import type { Celda, Exportacion, Hojas } from "./exportacion"
import { leerArchivosDeLinkedin as combinar } from "./exportacion-pagina"

// Browser only: the Worker never unzips an upload. SheetJS reads both the profile .xlsx and the page's legacy .xls,
// and it is imported on demand so it is not part of the page's first load.
export async function leerHojas(archivo: File): Promise<Hojas> {
  const XLSX = await import("xlsx")
  const libro = XLSX.read(await archivo.arrayBuffer(), { type: "array", cellDates: false })
  const hojas: Hojas = {}
  for (const nombre of libro.SheetNames)
    hojas[nombre] = XLSX.utils.sheet_to_json<Celda[]>(libro.Sheets[nombre], { header: 1, raw: false, defval: null })
  return hojas
}

export async function leerArchivosDeLinkedin(archivos: File[]): Promise<Resultado<Exportacion>> {
  try {
    const leidos = await Promise.all(archivos.map(async (a) => ({ nombre: a.name, hojas: await leerHojas(a) })))
    return combinar(leidos)
  } catch (causa) {
    console.error("No pude abrir el archivo de LinkedIn", causa instanceof Error ? causa.message : String(causa))
    return { ok: false, error: "No pude abrir el archivo. Debe ser un .xlsx o .xls descargado desde LinkedIn." }
  }
}
