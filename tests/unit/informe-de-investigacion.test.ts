import type Anthropic from "@anthropic-ai/sdk"
import { describe, expect, test } from "vitest"
import { esDeLinkedin, Informe, urlsDeLaBusqueda, validarInforme } from "@/lib/investigacion/informe"

const resultado = (urls: string[]): Anthropic.ContentBlock =>
  ({
    type: "web_search_tool_result",
    tool_use_id: "t1",
    caller: { type: "direct" },
    content: urls.map((url) => ({
      type: "web_search_result",
      url,
      title: "t",
      page_age: null,
      encrypted_content: "x",
    })),
  }) as unknown as Anthropic.ContentBlock

const hallazgo = (enlace: string) => ({
  resumen: "Las marcas chilenas destinan más a eventos presenciales.",
  cita: null,
  enlace,
  medio: "Diario",
  publicado_en: "2026-10-20",
})

describe("urlsDeLaBusqueda", () => {
  test("collects every URL the searches returned, and skips error results", () => {
    const error = {
      type: "web_search_tool_result",
      tool_use_id: "t2",
      caller: { type: "direct" },
      content: { type: "web_search_tool_result_error", error_code: "unavailable" },
    } as unknown as Anthropic.ContentBlock
    expect(urlsDeLaBusqueda([resultado(["https://a.cl/x", "https://b.com/y"]), error])).toEqual(
      new Set(["https://a.cl/x", "https://b.com/y"]),
    )
  })
})

describe("esDeLinkedin", () => {
  test("refuses LinkedIn hosts and their subdomains, accepts look-alikes outside them", () => {
    expect(esDeLinkedin("https://www.linkedin.com/posts/x")).toBe(true)
    expect(esDeLinkedin("https://cl.linkedin.com/pulse/x")).toBe(true)
    expect(esDeLinkedin("https://lnkd.in/abc")).toBe(true)
    expect(esDeLinkedin("https://media.licdn.com/dms/image/x")).toBe(true)
    expect(esDeLinkedin("https://notlinkedin.com/x")).toBe(false)
    expect(esDeLinkedin("no es una url")).toBe(true)
  })
})

describe("validarInforme", () => {
  const vistas = new Set(["https://a.cl/x", "https://b.com/y"])
  test("keeps findings whose link the search returned, matched after normalising, and drops invented or LinkedIn ones", () => {
    const informe = Informe.parse({
      angulos: [
        {
          nombre: "Presupuesto",
          por_que: "Dónde va la plata",
          hallazgos: [
            hallazgo("https://a.cl/x?utm_source=z"),
            hallazgo("https://inventado.cl/z"),
            hallazgo("https://www.linkedin.com/x"),
          ],
        },
      ],
    })
    const r = validarInforme(informe, vistas)
    expect(r.angulos[0]?.hallazgos.map((h) => h.enlace)).toEqual(["https://a.cl/x?utm_source=z"])
    expect(r.descartados).toEqual({ inventados: 1, linkedin: 1 })
  })

  test("drops angles left empty and trims texts", () => {
    const informe = Informe.parse({
      angulos: [{ nombre: " Vacío ", por_que: "x", hallazgos: [hallazgo("https://z.cl")] }],
    })
    expect(informe.angulos[0]?.nombre).toBe("Vacío")
    expect(validarInforme(informe, vistas).angulos).toEqual([])
  })

  test("drops findings older than a cutoff when one is given (the Saturday watch)", () => {
    const viejo = { ...hallazgo("https://b.com/y"), publicado_en: "2026-09-01" }
    const informe = Informe.parse({
      angulos: [{ nombre: "A", por_que: "x", hallazgos: [viejo, hallazgo("https://a.cl/x")] }],
    })
    expect(validarInforme(informe, vistas, { desde: "2026-10-17" }).angulos[0]?.hallazgos).toHaveLength(1)
  })

  test("counts a link that is not a web address as invented instead of throwing, and ignores such returned URLs", () => {
    const informe = Informe.parse({ angulos: [{ nombre: "A", por_que: "x", hallazgos: [hallazgo("ftp://a.cl/x")] }] })
    const r = validarInforme(informe, new Set(["ftp://a.cl/x", "https://a.cl/x"]))
    expect(r.angulos).toEqual([])
    expect(r.descartados).toEqual({ inventados: 1, linkedin: 0 })
  })
})
