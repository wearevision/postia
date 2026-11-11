import { HttpResponse, http } from "msw"
import { describe, expect, test } from "vitest"
import { leerPaginas, ordenarPorTexto, WEBS } from "@/lib/destino/paginas"
import { servidor } from "../msw"

const PAGINAS = [
  { url: "https://wr3.wearevision.cl/", titulo: "WR3", tema: "Investigación de mercado" },
  {
    url: "https://wr3.wearevision.cl/guias/focus-group/",
    titulo: "Focus group presencial u online",
    tema: "Cómo elegir",
  },
]

describe("site pages", () => {
  test("reads paginas.json of the chosen site", async () => {
    servidor.use(http.get("https://wr3.wearevision.cl/paginas.json", () => HttpResponse.json(PAGINAS)))
    expect(await leerPaginas("wr3")).toEqual(PAGINAS)
    expect(WEBS.wav.base).toBe("https://wearevision.cl/")
  })

  test("refuses a list with a page from another site or a malformed entry", async () => {
    servidor.use(
      http.get("https://wearevision.cl/paginas.json", () =>
        HttpResponse.json([{ url: "https://evil.example/", titulo: "x", tema: "y" }]),
      ),
    )
    await expect(leerPaginas("wav")).rejects.toThrow("paginas.json de wearevision.cl no es válido")
  })

  test("a failed answer throws", async () => {
    servidor.use(http.get("https://wr3.wearevision.cl/paginas.json", () => new HttpResponse(null, { status: 503 })))
    await expect(leerPaginas("wr3")).rejects.toThrow("503")
  })

  test("ranks first the pages sharing more words with the text, ignoring case, accents and short words", () => {
    const orden = ordenarPorTexto(PAGINAS, "¿Focus group ONLINE o presencial? Lo que aprendimos")
    expect(orden.map((p) => p.url)).toEqual([PAGINAS[1].url, PAGINAS[0].url])
  })
})
