// @vitest-environment node
import { describe, expect, test, vi } from "vitest"
import { Falla } from "@/lib/dominio/falla"
import type { Pedir, RespuestaDeClaude } from "@/lib/ia/claude"
import type { ContextoDeRedaccion } from "@/lib/redaccion/instrucciones"
import { escribir, reescribir, revisar } from "@/lib/redaccion/redactar"

const CONTEXTO: ContextoDeRedaccion = {
  marca: { id: "m1", nombre: "WAV", voz: "nosotros" },
  cuenta: { nombre: "Página de WAV", tipo: "empresa" },
  linea: {
    version: 2,
    secciones: { deQueHablamos: "", tono: "", formatos: "", temasVetados: "", temasAVigilar: "", ejemplos: "" },
    pilares: [],
  },
  noNombrar: [],
}

function responde(r: RespuestaDeClaude) {
  return vi.fn<Pedir>(async () => r)
}

describe("escribir", () => {
  test("pays under its key and brand, at high effort with a JSON schema, and returns the text", async () => {
    const pedir = responde({
      texto: JSON.stringify({ texto: "Hola  \n", nota: "Supuse la fecha" }),
      detenido: "end_turn",
    })
    const escrito = await escribir(pedir, CONTEXTO, {
      clave: "escribir:p1",
      encargo: "Post",
      material: null,
      pilar: null,
    })
    expect(escrito).toEqual({ texto: "Hola", nota: "Supuse la fecha" })
    const [paso, pedido] = pedir.mock.calls[0] ?? []
    expect(paso).toEqual({ clave: "escribir:p1", paso: "escribir", marcaId: "m1" })
    expect(pedido?.esfuerzo).toBe("high")
    expect(pedido?.maxTokens).toBe(16_000)
    expect(pedido?.formato?.type).toBe("json_schema")
  })

  test("turns a refusal, a cut answer, unreadable JSON and a text over 3000 characters into a Falla", async () => {
    const casos: RespuestaDeClaude[] = [
      { texto: "", detenido: "refusal" },
      { texto: '{"texto":"Ho', detenido: "max_tokens" },
      { texto: "no es json", detenido: "end_turn" },
      { texto: JSON.stringify({ texto: "a".repeat(3001), nota: "" }), detenido: "end_turn" },
      { texto: JSON.stringify({ texto: "   ", nota: "" }), detenido: "end_turn" },
    ]
    for (const r of casos) {
      await expect(
        escribir(responde(r), CONTEXTO, { clave: "k", encargo: "Post", material: null, pilar: null }),
      ).rejects.toBeInstanceOf(Falla)
    }
  })
})

describe("reescribir", () => {
  test("sends the current text and the instruction", async () => {
    const pedir = responde({ texto: JSON.stringify({ texto: "Corto", nota: "" }), detenido: "end_turn" })
    await reescribir(pedir, CONTEXTO, { clave: "reescribir:p2", textoActual: "Largo", instruccion: "Más corto" })
    const [paso, pedido] = pedir.mock.calls[0] ?? []
    expect(paso?.paso).toBe("reescribir")
    expect(JSON.stringify(pedido?.mensajes)).toContain("Más corto")
  })
})

describe("revisar", () => {
  test("reviews at medium effort and returns the verdict", async () => {
    const veredicto = {
      voz: { ok: false, comentario: "Suena a persona" },
      hallazgos: [{ tipo: "voz", fragmento: "yo creo", comentario: "WAV habla en plural" }],
    }
    const pedir = responde({ texto: JSON.stringify(veredicto), detenido: "end_turn" })
    expect(await revisar(pedir, CONTEXTO, { clave: "revisar:v1:auto", texto: "yo creo", material: null })).toEqual(
      veredicto,
    )
    expect(pedir.mock.calls[0]?.[1].esfuerzo).toBe("medium")
  })

  test("refuses a verdict with an unknown finding type", async () => {
    const pedir = responde({
      texto: JSON.stringify({
        voz: { ok: true, comentario: "" },
        hallazgos: [{ tipo: "raro", fragmento: "", comentario: "" }],
      }),
      detenido: "end_turn",
    })
    await expect(revisar(pedir, CONTEXTO, { clave: "k", texto: "x", material: null })).rejects.toBeInstanceOf(Falla)
  })
})
