import type { Browser } from "playwright"
import { Falla } from "@/lib/dominio/falla"

// Trigger.dev only.

const PAGINAS = (imagenes: string[]) => `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: 1080px 1350px; margin: 0; }
* { margin: 0; }
img { display: block; width: 1080px; height: 1350px; break-after: page; }
</style></head><body>${imagenes.map((src) => `<img src="${src}" alt="">`).join("")}</body></html>`

/** Per step (load, screenshot, PDF): a hang fails the request instead of eating the 540 s run. */
const LIMITE_POR_PASO_MS = 60_000

/** page.pdf() and page.evaluate() take no timeout option. */
async function conLimite<T>(paso: Promise<T>, ms: number, nombre: string): Promise<T> {
  let reloj: ReturnType<typeof setTimeout> | undefined
  const vencido = new Promise<never>((_, rechazar) => {
    reloj = setTimeout(() => rechazar(new Error(`Timeout ${ms}ms: ${nombre}`)), ms)
  })
  try {
    return await Promise.race([paso, vencido])
  } finally {
    clearTimeout(reloj)
  }
}

export interface Render {
  pdf: Uint8Array
  /** One 2160x2700 JPEG per slide: the same images the PDF carries, shown at gate 1. */
  vistas: Uint8Array[]
}

/**
 * Image-only PDF, as in wr3-web: Chromium exports blurred box-shadow as flat boxes plus a blur some readers drop, so
 * each slide ships as a 2x JPEG. Refuses (Falla) a slide whose content overflows; nothing is clipped silently.
 */
export async function renderizarCarrusel(
  navegador: Browser,
  html: string,
  limiteMs = LIMITE_POR_PASO_MS,
): Promise<Render> {
  const contexto = await navegador.newContext({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 })
  contexto.setDefaultTimeout(limiteMs)
  try {
    const pagina = await contexto.newPage()
    await pagina.setContent(html, { waitUntil: "load" })
    const fuentes = await conLimite(
      pagina.evaluate(async () => {
        await document.fonts.ready
        return [...document.fonts].map((f) => ({ familia: f.family, estado: f.status }))
      }),
      limiteMs,
      "fuentes",
    )
    // A face no glyph uses stays «unloaded» and is harmless; a used face that cannot decode is «error».
    const rota = fuentes.find((f) => f.estado === "error")
    if (rota) throw new Error(`La fuente ${rota.familia} no cargó`)

    // .content is a flex item that grows with its text and pushes .foot out, so it never scrolls itself; the slide
    // (overflow: hidden) is what overflows then. .content still catches a child wider than its column.
    // No named function inside the callback: esbuild's keepNames (tsx, Trigger.dev's bundle) wraps it in a __name()
    // helper that does not exist in the page.
    const desbordadas = await pagina.$$eval(".slide", (laminas) =>
      laminas.flatMap((l, i) =>
        [l, l.querySelector(".content")].some(
          (e) => e !== null && (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1),
        )
          ? [i + 1]
          : [],
      ),
    )
    if (desbordadas.length > 0) throw new Falla(`La lámina ${desbordadas[0]} no cabe. Acórtala o divídela en dos.`)

    const vistas: Uint8Array[] = []
    for (const lamina of await pagina.$$(".slide")) vistas.push(await lamina.screenshot({ type: "jpeg", quality: 92 }))

    const impresora = await contexto.newPage()
    await impresora.setContent(
      PAGINAS(vistas.map((v) => `data:image/jpeg;base64,${Buffer.from(v).toString("base64")}`)),
      {
        waitUntil: "load",
      },
    )
    const pdf = await conLimite(
      impresora.pdf({
        preferCSSPageSize: true,
        printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      }),
      limiteMs,
      "pdf",
    )
    return { pdf: new Uint8Array(pdf), vistas }
  } finally {
    await contexto.close()
  }
}
