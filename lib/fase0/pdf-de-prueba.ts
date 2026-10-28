import { PDFDocument, rgb, StandardFonts } from "pdf-lib"
import { Falla } from "@/lib/dominio/falla"
import { PAGINAS_MAXIMAS_DEL_DOCUMENTO } from "@/lib/linkedin/dominio"

// Phase 0 only proves that LinkedIn accepts a PDF from this app. The real carousel render (brand templates) arrives
// with a later plan; this is plain black text on white, 4:5.
const ANCHO = 1080
const ALTO = 1350
const MARGEN = 96
const TAMANO = 64
const INTERLINEA = 84

export function repartir(texto: string, cabe: (linea: string) => boolean): string[] {
  const lineas: string[] = []
  for (const parrafo of texto.split("\n")) {
    let actual = ""
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const candidata = actual ? `${actual} ${palabra}` : palabra
      if (actual && !cabe(candidata)) {
        lineas.push(actual)
        actual = palabra
      } else {
        actual = candidata
      }
    }
    lineas.push(actual)
  }
  return lineas
}

/** Standard Helvetica covers Spanish (WinAnsi) but not emoji: pdf-lib throws on a character it cannot encode. */
export async function pdfDePrueba(laminas: readonly string[]): Promise<Uint8Array> {
  if (laminas.length === 0 || laminas.length > PAGINAS_MAXIMAS_DEL_DOCUMENTO) {
    throw new Falla(`Un carrusel de LinkedIn lleva entre 1 y ${PAGINAS_MAXIMAS_DEL_DOCUMENTO} láminas.`)
  }
  const pdf = await PDFDocument.create()
  const fuente = await pdf.embedFont(StandardFonts.HelveticaBold)
  const cabe = (linea: string) => fuente.widthOfTextAtSize(linea, TAMANO) <= ANCHO - 2 * MARGEN
  for (const lamina of laminas) {
    const pagina = pdf.addPage([ANCHO, ALTO])
    for (const [indice, linea] of repartir(lamina, cabe).entries()) {
      pagina.drawText(linea, {
        x: MARGEN,
        y: ALTO - MARGEN - TAMANO - indice * INTERLINEA,
        size: TAMANO,
        font: fuente,
        color: rgb(0, 0, 0),
      })
    }
  }
  return pdf.save()
}
