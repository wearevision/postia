import readExcelFile from "read-excel-file/browser"
import type { Resultado } from "@/lib/marcas/acciones"
import { type Celda, type Exportacion, type Hojas, leerExportacion } from "./exportacion"

// Browser only: the Worker never unzips an upload. read-excel-file 9 returns every sheet as { sheet, data }.
export async function leerArchivoDeLinkedin(archivo: File): Promise<Resultado<Exportacion>> {
  try {
    const hojas: Hojas = {}
    for (const { sheet, data } of await readExcelFile(archivo)) hojas[sheet] = data as Celda[][]
    return leerExportacion(hojas)
  } catch (causa) {
    console.error("No pude abrir el XLSX de LinkedIn", causa instanceof Error ? causa.message : String(causa))
    return { ok: false, error: "No pude abrir el archivo. Debe ser el .xlsx que descargas desde LinkedIn." }
  }
}
