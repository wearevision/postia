import { describe, expect, test } from "vitest"
import { armarResumen, type EstadoDelResumen } from "@/lib/avisos/resumen"

const VACIO: EstadoDelResumen = { porFirmar: 0, aMano: 0, revisar: 0, reservas: [], huecos: [], lineas: [] }

describe("armarResumen", () => {
  test("nothing pending, no push", () => {
    expect(armarResumen(VACIO)).toBeNull()
  })

  test("counts first, in words, singular and plural", () => {
    const aviso = armarResumen({ ...VACIO, porFirmar: 3, aMano: 1, revisar: 1 })
    expect(aviso).toEqual({
      titulo: "Pendientes en PostIA",
      cuerpo: "3 piezas esperan tu firma.\n1 para publicar a mano.\n1 envío por revisar.",
      url: "/",
    })
    expect(armarResumen({ ...VACIO, porFirmar: 1 })?.cuerpo).toBe("1 pieza espera tu firma.")
  })

  test("queued lines, the reserve below its target and the gaps of the week follow", () => {
    const aviso = armarResumen({
      ...VACIO,
      lineas: [
        {
          titulo: "Federico",
          cuerpo: "No firmaste «Hola» a tiempo; la corrí al jueves 5 de noviembre, 11:00.",
          url: "/piezas/p1",
        },
      ],
      reservas: [{ cuenta: "Página de WAV", tiene: 1, meta: 3 }],
      huecos: [
        { cuenta: "Federico", faltan: 2, semana: "esta" },
        { cuenta: "Página de WAV", faltan: 1, semana: "proxima" },
      ],
    })
    expect(aviso?.cuerpo.split("\n")).toEqual([
      "No firmaste «Hola» a tiempo; la corrí al jueves 5 de noviembre, 11:00.",
      "Reserva de Página de WAV: 1 de 3.",
      "Faltan 2 en Federico esta semana.",
      "Faltan 1 en Página de WAV la próxima semana.",
    ])
    expect(aviso?.url).toBe("/")
  })

  test("a single queued line opens its own piece", () => {
    const linea = { titulo: "Federico", cuerpo: "No firmaste «Hola» a tiempo.", url: "/piezas/p1" }
    expect(armarResumen({ ...VACIO, lineas: [linea] })).toEqual({
      titulo: "Pendientes en PostIA",
      cuerpo: linea.cuerpo,
      url: "/piezas/p1",
    })
  })

  test("long digests keep six lines, say how many more, and fit the push payload", () => {
    const lineas = Array.from({ length: 20 }, (_, i) => ({ titulo: "X", cuerpo: `${"á".repeat(290)} ${i}`, url: "/" }))
    const aviso = armarResumen({ ...VACIO, porFirmar: 2, lineas })
    const filas = aviso?.cuerpo.split("\n") ?? []
    expect(filas).toHaveLength(7)
    expect(filas.at(-1)).toBe("Y 15 avisos más en Inicio.")
    expect(Buffer.byteLength(JSON.stringify(aviso))).toBeLessThan(3000)
  })
})
