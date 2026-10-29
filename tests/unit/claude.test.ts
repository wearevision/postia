// @vitest-environment node
// The SDK refuses to build a client under jsdom (it looks like a browser).
import Anthropic from "@anthropic-ai/sdk"
import { HttpResponse, http } from "msw"
import { describe, expect, expectTypeOf, test, vi } from "vitest"
import { Falla } from "@/lib/dominio/falla"
import type { LibroDeGastos } from "@/lib/gasto/pagar"
import { crearReal, esRechazoProbado, pedirPagando, type RespuestaDeClaude, solicitudDe, usoDe } from "@/lib/ia/claude"
import { servidor } from "../msw"

const SISTEMA_LARGO = "Contexto. ".repeat(600)

describe("solicitudDe", () => {
  test("uses Claude Opus 5.5, an explicit effort and no thinking parameter", () => {
    const s = solicitudDe({
      sistema: "Breve.",
      mensajes: [{ role: "user", content: "Hola" }],
      maxTokens: 512,
      esfuerzo: "low",
    })
    expect(s.model).toBe("claude-opus-5-5")
    expect(s.output_config).toEqual({ effort: "low" })
    expect(s).not.toHaveProperty("thinking")
    expect(s.system).toEqual([{ type: "text", text: "Breve." }])
  })

  test("caches a system prompt over about 1,024 tokens", () => {
    const s = solicitudDe({
      sistema: SISTEMA_LARGO,
      mensajes: [{ role: "user", content: "Hola" }],
      maxTokens: 512,
      esfuerzo: "low",
    })
    expect(s.system).toEqual([{ type: "text", text: SISTEMA_LARGO, cache_control: { type: "ephemeral" } }])
  })

  test("never asks for the 1-hour cache, which the price table does not cover", () => {
    const s = solicitudDe({
      sistema: SISTEMA_LARGO,
      mensajes: [{ role: "user", content: "Hola" }],
      maxTokens: 512,
      esfuerzo: "low",
    })
    const bloques = Array.isArray(s.system) ? s.system : []
    expect(bloques).toHaveLength(1)
    for (const bloque of bloques) expect(bloque.cache_control).not.toHaveProperty("ttl")
  })
})

describe("usoDe", () => {
  test("reads every billed kind of token from the response usage", () => {
    expect(
      usoDe({
        input_tokens: 10,
        output_tokens: 20,
        cache_creation_input_tokens: 30,
        cache_read_input_tokens: 40,
        server_tool_use: { web_search_requests: 2 },
      }),
    ).toEqual({ entrada: 10, salida: 20, escrituraDeCache: 30, lecturaDeCache: 40, busquedas: 2 })
    expect(
      usoDe({ input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: null, cache_read_input_tokens: null }),
    ).toEqual({
      entrada: 1,
      salida: 1,
      escrituraDeCache: 0,
      lecturaDeCache: 0,
      busquedas: 0,
    })
  })
})

describe("esRechazoProbado", () => {
  test("a 4xx other than 408 proves nothing was charged; network failures and 5xx do not", () => {
    const de = (status: number) => Anthropic.APIError.generate(status, { error: { message: "x" } }, "x", new Headers())
    expect(esRechazoProbado(de(400))).toBe(true)
    expect(esRechazoProbado(de(429))).toBe(true)
    expect(esRechazoProbado(de(408))).toBe(false)
    expect(esRechazoProbado(de(529))).toBe(false)
    expect(esRechazoProbado(new Anthropic.APIConnectionError({ message: "caído" }))).toBe(false)
    expect(esRechazoProbado(new Error("x"))).toBe(false)
  })
})

describe("pedirPagando", () => {
  test("reserves the worst case, calls Claude once and confirms the real cost", async () => {
    const libro: LibroDeGastos = {
      reservar: vi.fn(async () => ({ estado: "reservado" as const, avisos: [] })),
      confirmar: vi.fn(async () => []),
      liberar: vi.fn(async () => {}),
    }
    const crear = vi.fn(async () => ({
      content: [{ type: "text", text: "listo" }],
      stop_reason: "end_turn" as const,
      usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    }))
    const respuesta = await pedirPagando(
      { libro, avisar: async () => {}, crear },
      { clave: "probar:1", paso: "probar", marcaId: null },
      { sistema: "Breve.", mensajes: [{ role: "user", content: "Hola" }], maxTokens: 1024, esfuerzo: "low" },
    )
    expect(respuesta).toEqual({ texto: "listo", detenido: "end_turn" })
    expect(crear).toHaveBeenCalledTimes(1)
    expect(libro.reservar).toHaveBeenCalledWith(expect.objectContaining({ clave: "probar:1", proveedor: "anthropic" }))
    // 100 in × $4 + 50 out × $20 per million, rounded up.
    expect(libro.confirmar).toHaveBeenCalledWith("probar:1", 1400)
  })
})

function libroQueReserva(): LibroDeGastos {
  return {
    reservar: vi.fn(async () => ({ estado: "reservado" as const, avisos: [] })),
    confirmar: vi.fn(async () => []),
    liberar: vi.fn(async () => {}),
  }
}

const RESPUESTA_CORTA = {
  content: [{ type: "text", text: "listo" }],
  stop_reason: "end_turn" as const,
  usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
}

describe("pedirPagando with content blocks", () => {
  test("refuses an image block before reserving or calling: images are not priced yet", async () => {
    const libro = libroQueReserva()
    const crear = vi.fn(async () => RESPUESTA_CORTA)
    await expect(
      pedirPagando(
        { libro, avisar: async () => {}, crear },
        { clave: "imagen:1", paso: "probar", marcaId: null },
        {
          sistema: "Breve.",
          mensajes: [
            {
              role: "user",
              content: [
                { type: "text", text: "Mira" },
                {
                  type: "image",
                  source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo".repeat(50_000) },
                },
              ],
            },
          ],
          maxTokens: 1024,
          esfuerzo: "low",
        },
      ),
    ).rejects.toBeInstanceOf(Falla)
    expect(libro.reservar).not.toHaveBeenCalled()
    expect(crear).not.toHaveBeenCalled()
  })

  test("sizes text blocks by their text, the same as a plain string", async () => {
    const texto = "Una idea sobre focus groups. ".repeat(40)
    const estimadoDe = async (content: Anthropic.MessageParam["content"]) => {
      const libro = libroQueReserva()
      await pedirPagando(
        { libro, avisar: async () => {}, crear: async () => RESPUESTA_CORTA },
        { clave: "texto:1", paso: "probar", marcaId: null },
        { sistema: "Breve.", mensajes: [{ role: "user", content }], maxTokens: 1024, esfuerzo: "low" },
      )
      return vi.mocked(libro.reservar).mock.calls[0]?.[0].estimadoMicro
    }
    expect(await estimadoDe([{ type: "text", text: texto }])).toBe(await estimadoDe(texto))
  })
})

describe("RespuestaDeClaude", () => {
  test("types the stop reason as the SDK's own union", () => {
    expectTypeOf<RespuestaDeClaude["detenido"]>().toEqualTypeOf<Anthropic.StopReason | null>()
  })
})

function eventos(lista: { event: string; data: unknown }[]): string {
  return lista.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join("")
}

describe("crearReal", () => {
  test("streams the call, so a large max_tokens neither trips the SDK's 10-minute guard nor a fixed timeout", async () => {
    let cuerpo: Record<string, unknown> | undefined
    servidor.use(
      http.post("https://api.anthropic.com/v1/messages", async ({ request }) => {
        cuerpo = (await request.json()) as Record<string, unknown>
        const sse = eventos([
          {
            event: "message_start",
            data: {
              type: "message_start",
              message: {
                id: "msg_1",
                type: "message",
                role: "assistant",
                model: "claude-opus-5-5",
                content: [],
                stop_reason: null,
                stop_sequence: null,
                usage: {
                  input_tokens: 10,
                  output_tokens: 1,
                  cache_creation_input_tokens: 0,
                  cache_read_input_tokens: 0,
                },
              },
            },
          },
          {
            event: "content_block_start",
            data: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
          },
          {
            event: "content_block_delta",
            data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "listo" } },
          },
          { event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
          {
            event: "message_delta",
            data: {
              type: "message_delta",
              delta: { stop_reason: "end_turn", stop_sequence: null },
              usage: { output_tokens: 5 },
            },
          },
          { event: "message_stop", data: { type: "message_stop" } },
        ])
        return new HttpResponse(sse, { headers: { "content-type": "text/event-stream" } })
      }),
    )
    const crear = crearReal({ ANTHROPIC_API_KEY: "clave-de-prueba" })
    const respuesta = await crear(
      solicitudDe({
        sistema: "Breve.",
        mensajes: [{ role: "user", content: "Hola" }],
        maxTokens: 64_000,
        esfuerzo: "high",
      }),
    )
    expect(cuerpo?.stream).toBe(true)
    expect(cuerpo?.max_tokens).toBe(64_000)
    expect(respuesta.content).toEqual([expect.objectContaining({ type: "text", text: "listo" })])
    expect(respuesta.stop_reason).toBe("end_turn")
    expect(respuesta.usage.output_tokens).toBe(5)
  })
})
