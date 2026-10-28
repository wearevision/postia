import { describe, expect, test, vi } from "vitest"
import { Falla } from "@/lib/dominio/falla"
import { type DepsDePrueba, publicarPrueba } from "@/lib/fase0/prueba-linkedin"

const AHORA = Date.parse("2026-10-28T12:00:00Z")
const CREDENCIAL = { token: "t", titular: "urn:li:person:abc", expiraEn: "2026-12-27T12:00:00Z" }
type Estado = "listo" | "procesando" | "fallido"

function deps(opciones: { firma?: boolean; estados?: Estado[] } = {}) {
  const estados = [...(opciones.estados ?? ["listo"])]
  return {
    api: {
      crearPost: vi.fn(async () => "urn:li:share:9001"),
      subirDocumento: vi.fn(async () => "urn:li:document:D1"),
      estadoDelDocumento: vi.fn(
        async (): Promise<Estado> => (estados.length > 1 ? estados.shift() : estados[0]) ?? "listo",
      ),
    },
    confirmar: vi.fn(async () => opciones.firma ?? true),
    esperar: vi.fn(async () => undefined),
    ahora: () => AHORA,
  } satisfies DepsDePrueba
}

describe("publicarPrueba", () => {
  test("publishes nothing and uploads nothing when the person does not sign", async () => {
    const d = deps({ firma: false })
    const pdf = new Uint8Array(5)
    expect(
      await publicarPrueba(d, CREDENCIAL, { paso: "carrusel", texto: "Hola", pdf, titulo: "T", visibilidad: "PUBLIC" }),
    ).toEqual({ estado: "cancelada" })
    expect(d.api.subirDocumento).not.toHaveBeenCalled()
    expect(d.api.crearPost).not.toHaveBeenCalled()
  })

  test("a signed text post goes out escaped and returns its link", async () => {
    const d = deps()
    const r = await publicarPrueba(d, CREDENCIAL, {
      paso: "texto",
      texto: "Prueba (1) #IA",
      visibilidad: "CONNECTIONS",
    })
    expect(r).toEqual({
      estado: "publicada",
      urn: "urn:li:share:9001",
      enlace: "https://www.linkedin.com/feed/update/urn:li:share:9001/",
    })
    expect(d.api.crearPost).toHaveBeenCalledWith({
      token: "t",
      autor: "urn:li:person:abc",
      commentary: "Prueba \\(1\\) {hashtag|\\#|IA}",
      visibilidad: "CONNECTIONS",
    })
  })

  test("a signed carousel waits for the document to be ready before posting", async () => {
    const d = deps({ estados: ["procesando", "procesando", "listo"] })
    const r = await publicarPrueba(d, CREDENCIAL, {
      paso: "carrusel",
      texto: "x",
      pdf: new Uint8Array(5),
      titulo: "Tres lecciones",
      visibilidad: "PUBLIC",
    })
    expect(r.estado).toBe("publicada")
    expect(d.api.estadoDelDocumento).toHaveBeenCalledTimes(3)
    expect(d.api.crearPost).toHaveBeenCalledWith(
      expect.objectContaining({ documento: "urn:li:document:D1", titulo: "Tres lecciones" }),
    )
  })

  test("a failed or slow document never becomes a post", async () => {
    const carrusel = {
      paso: "carrusel" as const,
      texto: "x",
      pdf: new Uint8Array(5),
      titulo: "T",
      visibilidad: "PUBLIC" as const,
    }
    const fallida = deps({ estados: ["fallido"] })
    expect((await publicarPrueba(fallida, CREDENCIAL, carrusel)).estado).toBe("documento_fallido")
    const lenta = deps({ estados: ["procesando"] })
    expect((await publicarPrueba(lenta, CREDENCIAL, carrusel)).estado).toBe("documento_tarde")
    expect(fallida.api.crearPost).not.toHaveBeenCalled()
    expect(lenta.api.crearPost).not.toHaveBeenCalled()
  })

  test("an expired connection or a text over 3000 characters stops before asking for the signature", async () => {
    const d = deps()
    await expect(
      publicarPrueba(
        d,
        { ...CREDENCIAL, expiraEn: "2026-10-01T00:00:00Z" },
        { paso: "texto", texto: "x", visibilidad: "PUBLIC" },
      ),
    ).rejects.toBeInstanceOf(Falla)
    await expect(
      publicarPrueba(d, CREDENCIAL, { paso: "texto", texto: "a".repeat(3001), visibilidad: "PUBLIC" }),
    ).rejects.toBeInstanceOf(Falla)
    expect(d.confirmar).not.toHaveBeenCalled()
  })
})
