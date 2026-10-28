import { describe, expect, test, vi } from "vitest"
import { type EstadoDeDocumento, RechazoDeLinkedin, RespuestaDudosa, TokenDeLinkedinVencido } from "@/lib/linkedin/api"
import { sha256 } from "@/lib/piezas/huella"
import {
  type PiezaParaPublicar,
  type PuertosDePublicacion,
  publicarPendientes,
  publicarPieza,
} from "@/lib/publicacion/publicar"

const AHORA = Date.parse("2026-11-03T14:05:00Z")
const HUELLA = "a".repeat(64)
const PDF = new Uint8Array([1, 2, 3, 4])

function pieza(cambios: Partial<PiezaParaPublicar> = {}): PiezaParaPublicar {
  return {
    id: "pieza-1",
    marcaId: "marca-1",
    cuentaId: "cuenta-1",
    cuentaNombre: "Federico",
    ruta: "api",
    formato: "texto",
    programadaPara: "2026-11-03T14:00:00Z",
    ventanaMinutos: 30,
    version: { id: "v1", texto: "Hola (mundo)", titulo: null, archivoRuta: null, archivoSha256: null, huella: HUELLA },
    firma: { id: "f1", huella: HUELLA },
    ...cambios,
  }
}

function carrusel(cambios: Partial<PiezaParaPublicar["version"]> = {}): PiezaParaPublicar {
  return pieza({
    formato: "carrusel_pdf",
    version: {
      id: "v1",
      texto: "Mira",
      titulo: "WR3 en 10 laminas",
      archivoRuta: "marca-1/a.pdf",
      archivoSha256: sha256(PDF),
      huella: HUELLA,
      ...cambios,
    },
  })
}

function puertos(cambios: Partial<PuertosDePublicacion> = {}) {
  const orden: string[] = []
  const m = {
    tomarPendientes: vi.fn(async () => []),
    sinRespuesta: vi.fn(async () => []),
    credencial: vi.fn(async () => ({ token: "tok", titular: "urn:li:person:abc", expiraEn: "2026-12-27T00:00:00Z" })),
    descargar: vi.fn(async () => PDF),
    reservarEnvio: vi.fn(async () => {
      orden.push("reservar")
      return "reservado" as const
    }),
    cerrarEnvio: vi.fn(async () => {}),
    mover: vi.fn(async () => {}),
    avisar: vi.fn(async () => {}),
    linkedin: {
      crearPost: vi.fn(async () => {
        orden.push("crearPost")
        return "urn:li:share:123"
      }),
      subirDocumento: vi.fn(async () => {
        orden.push("subir")
        return "urn:li:document:D1"
      }),
      estadoDelDocumento: vi.fn(async (): Promise<EstadoDeDocumento> => "listo"),
    },
    esperar: vi.fn(async () => {}),
    ahora: () => AHORA,
  } satisfies PuertosDePublicacion
  // `m` keeps the mock types for arranging; `p` carries the overrides a test passes in.
  const p: PuertosDePublicacion = { ...m, ...cambios }
  return { p, m, orden }
}

describe("publicarPieza", () => {
  test("posts a due text piece once with the little-text commentary and closes it with the link", async () => {
    const { p } = puertos()
    expect(await publicarPieza(p, pieza())).toBe("publicada")
    expect(p.linkedin.crearPost).toHaveBeenCalledTimes(1)
    expect(p.linkedin.crearPost).toHaveBeenCalledWith({
      token: "tok",
      autor: "urn:li:person:abc",
      commentary: "Hola \\(mundo\\)",
      visibilidad: "PUBLIC",
    })
    expect(p.cerrarEnvio).toHaveBeenCalledWith(
      "pieza-1",
      "urn:li:share:123",
      expect.stringContaining("urn:li:share:123"),
    )
    expect(p.avisar).not.toHaveBeenCalled()
    expect(p.mover).not.toHaveBeenCalled()
  })

  test("uploads a carousel, waits until ready, reserves after the upload and posts with document and title", async () => {
    const { p, orden } = puertos()
    expect(await publicarPieza(p, carrusel())).toBe("publicada")
    expect(orden).toEqual(["subir", "reservar", "crearPost"])
    expect(p.descargar).toHaveBeenCalledWith("marca-1/a.pdf")
    expect(p.linkedin.crearPost).toHaveBeenCalledWith(
      expect.objectContaining({ documento: "urn:li:document:D1", titulo: "WR3 en 10 laminas" }),
    )
  })

  test("sends a carousel back to the gate when its file no longer matches the signed hash", async () => {
    const { p } = puertos({ descargar: vi.fn(async () => new Uint8Array([9, 9])) })
    expect(await publicarPieza(p, carrusel())).toBe("por_aprobar")
    expect(p.mover).toHaveBeenCalledWith("pieza-1", "por_aprobar", "El archivo cambió después de la firma.")
    expect(p.linkedin.subirDocumento).not.toHaveBeenCalled()
    expect(p.reservarEnvio).not.toHaveBeenCalled()
    expect(p.avisar).toHaveBeenCalledWith("marca-1", expect.objectContaining({ url: "/piezas/pieza-1" }))
  })

  test("parks as doubtful, without posting, when the send was already reserved", async () => {
    const { p } = puertos({ reservarEnvio: vi.fn(async () => "ya_enviado" as const) })
    expect(await publicarPieza(p, pieza())).toBe("envio_dudoso")
    expect(p.linkedin.crearPost).not.toHaveBeenCalled()
    expect(p.mover).toHaveBeenCalledWith("pieza-1", "envio_dudoso", expect.any(String))
    expect(p.avisar).toHaveBeenCalledTimes(1)
  })

  test.each([
    ["a doubtful answer", () => new RespuestaDudosa("sin id")],
    ["a network error", () => new Error("red caída")],
  ])("parks as doubtful after the reservation on %s, never posting twice", async (_nombre, error) => {
    const { p, m } = puertos()
    m.linkedin.crearPost.mockRejectedValueOnce(error())
    expect(await publicarPieza(p, pieza())).toBe("envio_dudoso")
    expect(p.linkedin.crearPost).toHaveBeenCalledTimes(1)
    expect(p.cerrarEnvio).not.toHaveBeenCalled()
    expect(p.mover).toHaveBeenCalledWith("pieza-1", "envio_dudoso", expect.any(String))
    expect(p.avisar).toHaveBeenCalledTimes(1)
  })

  test.each([
    ["a 4xx rejection", () => new RechazoDeLinkedin(422, "no")],
    ["an expired token", () => new TokenDeLinkedinVencido("401")],
  ])("hands the piece to a person by hand on %s", async (_nombre, error) => {
    const { p, m } = puertos()
    m.linkedin.crearPost.mockRejectedValueOnce(error())
    expect(await publicarPieza(p, pieza())).toBe("a_mano")
    expect(p.mover).toHaveBeenCalledWith("pieza-1", "a_mano", expect.any(String))
    expect(p.avisar).toHaveBeenCalledTimes(1)
  })

  test("leaves the piece scheduled, with nothing reserved, when the upload fails temporarily", async () => {
    const { p, m } = puertos()
    m.linkedin.subirDocumento.mockRejectedValueOnce(new Error("timeout"))
    const consola = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await publicarPieza(p, carrusel())).toBe("reintentar")
    consola.mockRestore()
    expect(p.reservarEnvio).not.toHaveBeenCalled()
    expect(p.mover).not.toHaveBeenCalled()
  })

  test("leaves the piece scheduled when the document is still processing after the polls", async () => {
    const { p, m } = puertos()
    m.linkedin.estadoDelDocumento.mockResolvedValue("procesando")
    expect(await publicarPieza(p, carrusel())).toBe("reintentar")
    expect(p.reservarEnvio).not.toHaveBeenCalled()
  })

  test("hands the piece to a person when LinkedIn fails to process the PDF", async () => {
    const { p, m } = puertos()
    m.linkedin.estadoDelDocumento.mockResolvedValue("fallido")
    expect(await publicarPieza(p, carrusel())).toBe("a_mano")
    expect(p.reservarEnvio).not.toHaveBeenCalled()
  })

  test("hands a hand-account piece to a person with a notice that opens the piece", async () => {
    const { p } = puertos()
    expect(await publicarPieza(p, pieza({ ruta: "a_mano" }))).toBe("a_mano")
    expect(p.mover).toHaveBeenCalledWith("pieza-1", "a_mano", "Esta cuenta se publica a mano.")
    expect(p.avisar).toHaveBeenCalledWith("marca-1", expect.objectContaining({ url: "/piezas/pieza-1" }))
    expect(p.linkedin.crearPost).not.toHaveBeenCalled()
  })

  test("sends a piece past its window back to the gate instead of posting late", async () => {
    const { p } = puertos({ ahora: () => Date.parse("2026-11-03T14:40:00Z") })
    expect(await publicarPieza(p, pieza())).toBe("por_aprobar")
    expect(p.linkedin.crearPost).not.toHaveBeenCalled()
  })
})

describe("publicarPendientes", () => {
  test("processes each due piece and counts the outcomes", async () => {
    const { p } = puertos({ tomarPendientes: vi.fn(async () => [pieza(), pieza({ id: "p2", ruta: "a_mano" })]) })
    const cuenta = await publicarPendientes(p)
    expect(cuenta).toMatchObject({ publicada: 1, a_mano: 1 })
  })

  test("turns a send left without an answer for over 15 minutes into a doubtful one", async () => {
    const sinRespuesta = vi.fn(async () => [{ id: "p9", marcaId: "marca-1", cuentaNombre: "WAV" }])
    const { p } = puertos({ sinRespuesta })
    const cuenta = await publicarPendientes(p)
    expect(sinRespuesta).toHaveBeenCalledWith(new Date(AHORA - 15 * 60_000).toISOString())
    expect(p.mover).toHaveBeenCalledWith("p9", "envio_dudoso", expect.any(String))
    expect(p.avisar).toHaveBeenCalledWith("marca-1", expect.objectContaining({ url: "/piezas/p9" }))
    expect(cuenta.envio_dudoso).toBe(1)
  })

  test("keeps going with the next piece when one fails before anything was sent", async () => {
    const { p, m } = puertos({ tomarPendientes: vi.fn(async () => [pieza({ id: "p1" }), pieza({ id: "p2" })]) })
    m.credencial.mockRejectedValueOnce(new Error("db caída"))
    const consola = vi.spyOn(console, "error").mockImplementation(() => {})
    const cuenta = await publicarPendientes(p)
    consola.mockRestore()
    expect(cuenta).toMatchObject({ reintentar: 1, publicada: 1 })
  })
})
