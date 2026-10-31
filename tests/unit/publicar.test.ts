import { describe, expect, test, vi } from "vitest"
import type { Excepcion } from "@/lib/clientes/revision"
import { type EstadoDeDocumento, RechazoDeLinkedin, RespuestaDudosa, TokenDeLinkedinVencido } from "@/lib/linkedin/api"
import { enlaceDePost } from "@/lib/linkedin/dominio"
import { type EstadoDePieza, transicionPermitida } from "@/lib/piezas/estados"
import { sha256 } from "@/lib/piezas/huella"
import {
  cubrirSinFirma,
  type PendienteSinFirma,
  type PiezaParaPublicar,
  type PuertosDePublicacion,
  publicarPendientes,
  publicarPieza,
} from "@/lib/publicacion/publicar"

const AHORA = Date.parse("2026-11-03T14:05:00Z")
const HUELLA = "a".repeat(64)
const PDF = new Uint8Array([1, 2, 3, 4])
const URN = "urn:li:share:123"
const FIRMADA_EN = "2026-11-02T20:00:00.123456+00:00"

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
    firma: { id: "f1", huella: HUELLA, firmadaEn: FIRMADA_EN },
    ...cambios,
  }
}

function carrusel(): PiezaParaPublicar {
  return pieza({
    formato: "carrusel_pdf",
    version: {
      id: "v1",
      texto: "Mira",
      titulo: "WR3 en 10 laminas",
      archivoRuta: "marca-1/a.pdf",
      archivoSha256: sha256(PDF),
      huella: HUELLA,
    },
  })
}

/** In-memory ports. Every piece starts `programada`; moves are checked against the real state machine. */
function puertos(cambios: Partial<PuertosDePublicacion> = {}, enCurso: Record<string, EstadoDePieza> = {}) {
  const orden: string[] = []
  const estados = new Map<string, EstadoDePieza>(Object.entries(enCurso))
  const estadoDe = (id: string) => estados.get(id) ?? "programada"
  const pasar = (id: string, a: EstadoDePieza) => {
    const de = estadoDe(id)
    if (!transicionPermitida(de, a)) throw new Error(`transicion_no_permitida ${de} -> ${a}`)
    estados.set(id, a)
  }
  const m = {
    tomarPendientes: vi.fn(async (): Promise<PiezaParaPublicar[]> => []),
    sinRespuesta: vi.fn(async (): Promise<{ id: string; marcaId: string; cuentaNombre: string }[]> => []),
    credencial: vi.fn(async () => ({
      token: "tok",
      titular: "urn:li:person:abc",
      autor: "urn:li:person:abc",
      expiraEn: "2026-12-27T00:00:00Z",
    })),
    descargar: vi.fn(async () => PDF),
    reservarEnvio: vi.fn(async (p: PiezaParaPublicar): Promise<"reservado" | "ya_enviado"> => {
      orden.push("reservar")
      pasar(p.id, "publicando")
      return "reservado"
    }),
    cerrarEnvio: vi.fn(async (id: string) => pasar(id, "publicada")),
    mover: vi.fn(async (id: string, a: "por_aprobar" | "a_mano" | "envio_dudoso"): Promise<"movida" | "sin_cambio"> => {
      pasar(id, a)
      return "movida"
    }),
    devolverALaReserva: vi.fn(async (id: string): Promise<"por_aprobar" | "en_reserva" | "sin_cambio"> => {
      pasar(id, "por_aprobar")
      return "por_aprobar"
    }),
    avisar: vi.fn(async () => {}),
    vencidasSinFirma: vi.fn(async (): Promise<PendienteSinFirma[]> => []),
    horariosOcupados: vi.fn(async (): Promise<number[]> => []),
    cubrirConReserva: vi.fn(async (): Promise<string | null> => null),
    anotarAviso: vi.fn(async () => {}),
    registrarFallaDeEspacio: vi.fn(async (): Promise<boolean> => true),
    excepcionesPuestasDespues: vi.fn(async (): Promise<Excepcion[]> => []),
    linkedin: {
      crearPost: vi.fn(async () => {
        orden.push("crearPost")
        return URN
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
  return { p, m, orden, estadoDe }
}

function silenciar() {
  return vi.spyOn(console, "error").mockImplementation(() => {})
}

describe("publicarPieza", () => {
  test("posts a due text piece once with the little-text commentary and closes it with the link", async () => {
    const { p, m, estadoDe } = puertos()
    expect(await publicarPieza(p, pieza())).toBe("publicada")
    expect(m.linkedin.crearPost).toHaveBeenCalledTimes(1)
    expect(m.linkedin.crearPost).toHaveBeenCalledWith({
      token: "tok",
      autor: "urn:li:person:abc",
      commentary: "Hola \\(mundo\\)",
      visibilidad: "PUBLIC",
    })
    expect(m.cerrarEnvio).toHaveBeenCalledWith("pieza-1", URN, enlaceDePost(URN))
    expect(m.avisar).not.toHaveBeenCalled()
    expect(m.mover).not.toHaveBeenCalled()
    expect(estadoDe("pieza-1")).toBe("publicada")
  })

  test("uploads a carousel, waits until ready, reserves after the upload and posts with document and title", async () => {
    const { p, m, orden } = puertos()
    expect(await publicarPieza(p, carrusel())).toBe("publicada")
    expect(orden).toEqual(["subir", "reservar", "crearPost"])
    expect(m.descargar).toHaveBeenCalledWith("marca-1/a.pdf")
    expect(m.linkedin.crearPost).toHaveBeenCalledWith(
      expect.objectContaining({ documento: "urn:li:document:D1", titulo: "WR3 en 10 laminas" }),
    )
  })

  test.each([
    ["a text piece", () => pieza()],
    ["a carousel", () => carrusel()],
  ])("posts %s as the page when the connection is a page's, never as its administrator", async (_nombre, cual) => {
    const pagina = {
      token: "tok",
      titular: "urn:li:person:admin",
      autor: "urn:li:organization:123",
      expiraEn: "2026-12-27T00:00:00Z",
    }
    const { p, m } = puertos({ credencial: vi.fn(async () => pagina) })
    const unaPieza = cual()
    expect(await publicarPieza(p, unaPieza)).toBe("publicada")
    expect(m.linkedin.crearPost).toHaveBeenCalledWith(expect.objectContaining({ autor: "urn:li:organization:123" }))
    if (unaPieza.formato === "carrusel_pdf") {
      expect(m.linkedin.subirDocumento).toHaveBeenCalledWith(
        expect.objectContaining({ autor: "urn:li:organization:123" }),
      )
    }
  })

  test("sends a carousel back to the gate when its file no longer matches the signed hash", async () => {
    const { p, m, estadoDe } = puertos({ descargar: vi.fn(async () => new Uint8Array([9, 9])) })
    expect(await publicarPieza(p, carrusel())).toBe("por_aprobar")
    expect(m.mover).toHaveBeenCalledWith("pieza-1", "por_aprobar", "El archivo cambió después de la firma.")
    expect(m.linkedin.subirDocumento).not.toHaveBeenCalled()
    expect(m.reservarEnvio).not.toHaveBeenCalled()
    expect(m.linkedin.crearPost).not.toHaveBeenCalled()
    expect(m.avisar).toHaveBeenCalledWith("marca-1", expect.objectContaining({ url: "/piezas/pieza-1" }))
    expect(estadoDe("pieza-1")).toBe("por_aprobar")
  })

  test("hands the piece to a person, without posting, when a send was already noted for this signature", async () => {
    const { p, m, estadoDe } = puertos({ reservarEnvio: vi.fn(async () => "ya_enviado" as const) })
    expect(await publicarPieza(p, pieza())).toBe("a_mano")
    expect(m.linkedin.crearPost).not.toHaveBeenCalled()
    expect(m.mover).toHaveBeenCalledWith(
      "pieza-1",
      "a_mano",
      "Ya hubo un envío anotado con esta firma: revisa LinkedIn y publícala a mano si no salió.",
    )
    expect(m.avisar).toHaveBeenCalledTimes(1)
    expect(estadoDe("pieza-1")).toBe("a_mano")
  })

  test.each([
    ["a doubtful answer", () => new RespuestaDudosa("sin id")],
    ["a network error", () => new Error("red caída")],
  ])("parks as doubtful after the reservation on %s, never posting twice", async (_nombre, error) => {
    const { p, m, estadoDe } = puertos()
    m.linkedin.crearPost.mockRejectedValueOnce(error())
    silenciar()
    expect(await publicarPieza(p, pieza())).toBe("envio_dudoso")
    expect(m.linkedin.crearPost).toHaveBeenCalledTimes(1)
    expect(m.cerrarEnvio).not.toHaveBeenCalled()
    expect(m.mover).toHaveBeenCalledWith("pieza-1", "envio_dudoso", expect.stringContaining("Puede que haya salido"))
    // The same words fit a profile and a page.
    expect(m.mover).not.toHaveBeenCalledWith("pieza-1", "envio_dudoso", expect.stringContaining("perfil"))
    expect(m.avisar).toHaveBeenCalledTimes(1)
    expect(estadoDe("pieza-1")).toBe("envio_dudoso")
  })

  test.each([
    ["a 4xx rejection", () => new RechazoDeLinkedin(422, "no"), "LinkedIn rechazó la publicación (HTTP 422)."],
    ["an expired token", () => new TokenDeLinkedinVencido("401"), "La conexión de LinkedIn venció."],
  ])("hands the piece to a person by hand on %s", async (_nombre, error, motivo) => {
    const { p, m, estadoDe } = puertos()
    m.linkedin.crearPost.mockRejectedValueOnce(error())
    expect(await publicarPieza(p, pieza())).toBe("a_mano")
    expect(m.mover).toHaveBeenCalledWith("pieza-1", "a_mano", motivo)
    expect(m.avisar).toHaveBeenCalledTimes(1)
    expect(estadoDe("pieza-1")).toBe("a_mano")
  })

  test("leaves the piece scheduled, with nothing reserved or posted, when the upload fails temporarily", async () => {
    const { p, m, estadoDe } = puertos()
    m.linkedin.subirDocumento.mockRejectedValueOnce(new Error("timeout"))
    silenciar()
    expect(await publicarPieza(p, carrusel())).toBe("reintentar")
    expect(m.reservarEnvio).not.toHaveBeenCalled()
    expect(m.linkedin.crearPost).not.toHaveBeenCalled()
    expect(m.mover).not.toHaveBeenCalled()
    expect(estadoDe("pieza-1")).toBe("programada")
  })

  test.each([
    ["a 4xx rejection", () => new RechazoDeLinkedin(413, "grande"), "LinkedIn rechazó el PDF (HTTP 413)."],
    ["an expired token", () => new TokenDeLinkedinVencido("401"), "La conexión de LinkedIn venció."],
  ])("hands the piece to a person on %s during the PDF upload", async (_nombre, error, motivo) => {
    const { p, m } = puertos()
    m.linkedin.subirDocumento.mockRejectedValueOnce(error())
    expect(await publicarPieza(p, carrusel())).toBe("a_mano")
    expect(m.mover).toHaveBeenCalledWith("pieza-1", "a_mano", motivo)
    expect(m.reservarEnvio).not.toHaveBeenCalled()
    expect(m.linkedin.crearPost).not.toHaveBeenCalled()
  })

  test("leaves the piece scheduled when the document is still processing after the polls", async () => {
    const { p, m } = puertos()
    m.linkedin.estadoDelDocumento.mockResolvedValue("procesando")
    expect(await publicarPieza(p, carrusel())).toBe("reintentar")
    expect(m.reservarEnvio).not.toHaveBeenCalled()
  })

  test("hands the piece to a person when LinkedIn fails to process the PDF", async () => {
    const { p, m } = puertos()
    m.linkedin.estadoDelDocumento.mockResolvedValue("fallido")
    expect(await publicarPieza(p, carrusel())).toBe("a_mano")
    expect(m.reservarEnvio).not.toHaveBeenCalled()
  })

  test("hands a hand-account piece to a person with a notice that opens the piece", async () => {
    const { p, m } = puertos()
    expect(await publicarPieza(p, pieza({ ruta: "a_mano" }))).toBe("a_mano")
    expect(m.mover).toHaveBeenCalledWith("pieza-1", "a_mano", "Esta cuenta se publica a mano.")
    expect(m.avisar).toHaveBeenCalledWith("marca-1", expect.objectContaining({ url: "/piezas/pieza-1" }))
    expect(m.linkedin.crearPost).not.toHaveBeenCalled()
  })

  test("sends a piece past its window back to the gate instead of posting late", async () => {
    const { p, m } = puertos({ ahora: () => Date.parse("2026-11-03T14:40:00Z") })
    expect(await publicarPieza(p, pieza())).toBe("por_aprobar")
    expect(m.linkedin.crearPost).not.toHaveBeenCalled()
  })

  test("a missed window is a timing cause: the database may send the piece back to the reserve, and the notice says so", async () => {
    const { p, m } = puertos({
      ahora: () => Date.parse("2026-11-03T14:40:00Z"),
      devolverALaReserva: vi.fn(async () => "en_reserva" as const),
    })
    expect(await publicarPieza(p, pieza())).toBe("por_aprobar")
    expect(p.devolverALaReserva).toHaveBeenCalledWith("pieza-1", expect.stringContaining("30 minutos"))
    expect(m.mover).not.toHaveBeenCalled()
    expect(m.avisar).toHaveBeenCalledWith("marca-1", {
      titulo: "Volvió a la reserva · Federico",
      cuerpo: "No alcanzó a salir a su hora; la app la usará en el próximo espacio sin firma.",
      url: "/piezas/pieza-1",
    })
  })

  test("a piece that is no longer scheduled is left alone: no notice and nothing counted as moved", async () => {
    const { p, m } = puertos({
      ahora: () => Date.parse("2026-11-03T14:40:00Z"),
      devolverALaReserva: vi.fn(async () => "sin_cambio" as const),
    })
    silenciar()
    expect(await publicarPieza(p, pieza())).toBe("reintentar")
    expect(m.avisar).not.toHaveBeenCalled()
  })

  test("a piece someone already changed is left alone when a cause in the piece sends it back: no stale notice", async () => {
    const { p, m } = puertos({ descargar: vi.fn(async () => new Uint8Array([9, 9])) })
    m.mover.mockResolvedValue("sin_cambio")
    expect(await publicarPieza(p, carrusel())).toBe("reintentar")
    expect(m.mover).toHaveBeenCalledWith("pieza-1", "por_aprobar", "El archivo cambió después de la firma.")
    expect(m.avisar).not.toHaveBeenCalled()
  })

  test("a missed window on a piece that was not in the reserve keeps the plain notice", async () => {
    const { p, m } = puertos({ ahora: () => Date.parse("2026-11-03T14:40:00Z") })
    await publicarPieza(p, pieza())
    expect(m.avisar).toHaveBeenCalledWith("marca-1", expect.objectContaining({ titulo: "No salió · Federico" }))
  })

  test("a cause in the piece itself never goes back to the reserve", async () => {
    const { p, m } = puertos({ descargar: vi.fn(async () => new Uint8Array([9, 9])) })
    await publicarPieza(p, carrusel())
    expect(m.devolverALaReserva).not.toHaveBeenCalled()
    expect(m.mover).toHaveBeenCalledWith("pieza-1", "por_aprobar", "El archivo cambió después de la firma.")
  })

  test("a signature of another version is a cause in the piece, not timing", async () => {
    const { p, m } = puertos()
    await publicarPieza(p, pieza({ firma: { id: "f1", huella: "b".repeat(64), firmadaEn: FIRMADA_EN } }))
    expect(m.devolverALaReserva).not.toHaveBeenCalled()
    expect(m.mover).toHaveBeenCalledWith("pieza-1", "por_aprobar", expect.any(String))
  })

  test("re-checks the window right before reserving: a slow document wait can push it past the window", async () => {
    let ahora = AHORA
    const { p, m, estadoDe } = puertos({
      ahora: () => ahora,
      esperar: async () => {
        ahora += 31 * 60_000
      },
    })
    m.linkedin.estadoDelDocumento.mockResolvedValueOnce("procesando")
    expect(await publicarPieza(p, carrusel())).toBe("por_aprobar")
    expect(m.reservarEnvio).not.toHaveBeenCalled()
    expect(m.linkedin.crearPost).not.toHaveBeenCalled()
    expect(estadoDe("pieza-1")).toBe("por_aprobar")
  })

  test("leaves the piece scheduled, posting nothing, when the database refuses the reservation", async () => {
    const reservarEnvio = vi.fn(async (): Promise<"reservado" | "ya_enviado"> => {
      throw new Error("reserva_fuera_de_ventana")
    })
    const { p, m, estadoDe } = puertos({ reservarEnvio })
    silenciar()
    expect(await publicarPieza(p, pieza())).toBe("reintentar")
    expect(m.linkedin.crearPost).not.toHaveBeenCalled()
    expect(m.mover).not.toHaveBeenCalled()
    expect(estadoDe("pieza-1")).toBe("programada")
  })

  test("parks as doubtful, with the link in the reason, when the post went out but could not be noted", async () => {
    const { p, m, estadoDe } = puertos()
    m.cerrarEnvio.mockRejectedValueOnce(new Error("db caída"))
    silenciar()
    expect(await publicarPieza(p, pieza())).toBe("envio_dudoso")
    expect(m.linkedin.crearPost).toHaveBeenCalledTimes(1)
    expect(m.mover).toHaveBeenCalledWith("pieza-1", "envio_dudoso", expect.stringContaining(enlaceDePost(URN)))
    expect(m.mover).toHaveBeenCalledWith("pieza-1", "envio_dudoso", expect.stringContaining("Ya lo publiqué"))
    expect(estadoDe("pieza-1")).toBe("envio_dudoso")
  })

  test("still moves the piece when the notice cannot be sent", async () => {
    const { p, m, estadoDe } = puertos()
    m.avisar.mockRejectedValue(new Error("push caído"))
    silenciar()
    expect(await publicarPieza(p, pieza({ ruta: "a_mano" }))).toBe("a_mano")
    expect(estadoDe("pieza-1")).toBe("a_mano")
  })

  test("logs messages and codes as text, never the whole error", async () => {
    const { p, m } = puertos()
    const falla = new Error("No pude conectar", { cause: Object.assign(new Error("x"), { code: "ECONNRESET" }) })
    m.linkedin.subirDocumento.mockRejectedValueOnce(falla)
    const consola = silenciar()
    await publicarPieza(p, carrusel())
    expect(consola).toHaveBeenCalled()
    const argumentos = consola.mock.calls.flat()
    expect(argumentos.every((a) => typeof a === "string")).toBe(true)
    expect(argumentos.join(" ")).toContain("ECONNRESET")
  })
})

describe("publicarPendientes", () => {
  test("processes each due piece and counts the outcomes", async () => {
    const { p, m } = puertos()
    m.tomarPendientes.mockResolvedValue([pieza(), pieza({ id: "p2", ruta: "a_mano" })])
    const cuenta = await publicarPendientes(p)
    expect(cuenta).toMatchObject({ publicada: 1, a_mano: 1 })
  })

  test("turns a send left without an answer for over 15 minutes into a doubtful one", async () => {
    const { p, m, estadoDe } = puertos({}, { p9: "publicando" })
    m.sinRespuesta.mockResolvedValue([{ id: "p9", marcaId: "marca-1", cuentaNombre: "WAV" }])
    const cuenta = await publicarPendientes(p)
    expect(m.sinRespuesta).toHaveBeenCalledWith(new Date(AHORA - 15 * 60_000).toISOString())
    expect(m.mover).toHaveBeenCalledWith("p9", "envio_dudoso", expect.any(String))
    expect(m.avisar).toHaveBeenCalledWith("marca-1", expect.objectContaining({ url: "/piezas/p9" }))
    expect(cuenta.envio_dudoso).toBe(1)
    expect(estadoDe("p9")).toBe("envio_dudoso")
  })

  test("keeps going with the next piece when one fails before anything was sent", async () => {
    const { p, m } = puertos()
    m.tomarPendientes.mockResolvedValue([pieza({ id: "p1" }), pieza({ id: "p2" })])
    m.credencial.mockRejectedValueOnce(new Error("db caída"))
    silenciar()
    const cuenta = await publicarPendientes(p)
    expect(cuenta).toMatchObject({ reintentar: 1, publicada: 1 })
  })

  test("still sweeps sends left without an answer when taking the due pieces fails", async () => {
    const { p, m, estadoDe } = puertos({}, { p9: "publicando" })
    m.tomarPendientes.mockRejectedValue(new Error("db caída"))
    m.sinRespuesta.mockResolvedValue([{ id: "p9", marcaId: "marca-1", cuentaNombre: "WAV" }])
    silenciar()
    await expect(publicarPendientes(p)).rejects.toThrow("db caída")
    expect(estadoDe("p9")).toBe("envio_dudoso")
  })

  test("one hung piece that cannot be moved does not stop the others", async () => {
    const { p, m, estadoDe } = puertos({}, { h1: "publicando", h2: "publicando" })
    m.sinRespuesta.mockResolvedValue([
      { id: "h1", marcaId: "marca-1", cuentaNombre: "WAV" },
      { id: "h2", marcaId: "marca-1", cuentaNombre: "WAV" },
    ])
    m.mover.mockRejectedValueOnce(new Error("db caída"))
    silenciar()
    const cuenta = await publicarPendientes(p)
    expect(m.mover).toHaveBeenCalledTimes(2)
    expect(estadoDe("h2")).toBe("envio_dudoso")
    expect(cuenta.envio_dudoso).toBe(1)
  })

  test("a failing notice does not stop the sweep nor undo the move", async () => {
    const { p, m, estadoDe } = puertos({}, { h1: "publicando" })
    m.sinRespuesta.mockResolvedValue([{ id: "h1", marcaId: "marca-1", cuentaNombre: "WAV" }])
    m.avisar.mockRejectedValue(new Error("push caído"))
    silenciar()
    const cuenta = await publicarPendientes(p)
    expect(estadoDe("h1")).toBe("envio_dudoso")
    expect(cuenta.envio_dudoso).toBe(1)
  })
})

const PENDIENTE: PendienteSinFirma = {
  id: "pendiente-1",
  marcaId: "marca-1",
  cuentaId: "cuenta-1",
  cuentaNombre: "Federico",
  tipo: "persona",
  planeadaPara: "2026-11-03T14:00:00.000Z",
  extracto: "Hola",
}

describe("cubrirSinFirma (D21)", () => {
  test("uses the reserve, moves the unsigned piece to the next free slot and queues a digest line", async () => {
    const { p, m } = puertos({
      vencidasSinFirma: vi.fn(async () => [PENDIENTE]),
      horariosOcupados: vi.fn(async () => [Date.parse("2026-11-04T14:00:00Z")]),
      cubrirConReserva: vi.fn(async () => "reserva-1"),
    })
    expect(await cubrirSinFirma(p)).toBe(1)
    expect(p.cubrirConReserva).toHaveBeenCalledWith("pendiente-1", "2026-11-05T14:00:00.000Z")
    expect(p.anotarAviso).toHaveBeenCalledWith("marca-1", {
      titulo: "Federico",
      cuerpo:
        "Una pieza salió de la reserva de Federico para el martes 3 de noviembre, 11:00; «Hola» pasó al jueves 5 de noviembre, 11:00.",
      url: "/piezas/reserva-1",
    })
    expect(m.avisar).not.toHaveBeenCalled()
  })

  test("without a reserve the line says the piece was moved", async () => {
    const { p } = puertos({ vencidasSinFirma: vi.fn(async () => [PENDIENTE]) })
    expect(await cubrirSinFirma(p)).toBe(0)
    expect(p.anotarAviso).toHaveBeenCalledWith("marca-1", {
      titulo: "Federico",
      cuerpo: "«Hola» no salió en su espacio; la corrí al miércoles 4 de noviembre, 11:00.",
      url: "/piezas/pendiente-1",
    })
  })

  test("a piece that cannot be moved is recorded once and its digest line asks for a date by hand", async () => {
    const { p } = puertos({
      vencidasSinFirma: vi.fn(async () => [PENDIENTE]),
      cubrirConReserva: vi.fn(async () => {
        throw new Error("23505")
      }),
    })
    silenciar()
    await cubrirSinFirma(p)
    expect(p.registrarFallaDeEspacio).toHaveBeenCalledWith(
      "pendiente-1",
      "No encontré un espacio para correr esta pieza: elige su fecha a mano.",
    )
    expect(p.anotarAviso).toHaveBeenCalledWith("marca-1", {
      titulo: "Federico",
      cuerpo: "«Hola» no salió en su espacio y no encontré otro: elige su fecha a mano.",
      url: "/piezas/pendiente-1",
    })
  })

  test("a repeated failure is recorded but does not queue the line again", async () => {
    const { p } = puertos({
      vencidasSinFirma: vi.fn(async () => [PENDIENTE]),
      cubrirConReserva: vi.fn(async () => {
        throw new Error("23505")
      }),
      registrarFallaDeEspacio: vi.fn(async () => false),
    })
    silenciar()
    await cubrirSinFirma(p)
    expect(p.anotarAviso).not.toHaveBeenCalled()
  })

  test("failing to record the failure is logged and the next piece is still covered", async () => {
    const otra = { ...PENDIENTE, id: "pendiente-2" }
    const cubrir = vi.fn(async (): Promise<string | null> => {
      throw new Error("sin base")
    })
    const { p } = puertos({
      vencidasSinFirma: vi.fn(async () => [PENDIENTE, otra]),
      cubrirConReserva: cubrir,
      registrarFallaDeEspacio: vi.fn(async () => {
        throw new Error("sin base")
      }),
    })
    silenciar()
    await cubrirSinFirma(p)
    expect(cubrir).toHaveBeenCalledTimes(2)
  })

  test("one failing piece is logged and the next is still covered", async () => {
    const otra = { ...PENDIENTE, id: "pendiente-2" }
    const cubrir = vi.fn(async (id: string) => {
      if (id === "pendiente-1") throw new Error("23505")
      return null
    })
    const { p } = puertos({ vencidasSinFirma: vi.fn(async () => [PENDIENTE, otra]), cubrirConReserva: cubrir })
    const error = silenciar()
    await cubrirSinFirma(p)
    expect(cubrir).toHaveBeenCalledTimes(2)
    expect(error).toHaveBeenCalled()
  })

  test("a lost digest line is logged and does not undo the cover", async () => {
    const { p } = puertos({
      vencidasSinFirma: vi.fn(async () => [PENDIENTE]),
      cubrirConReserva: vi.fn(async () => "reserva-1"),
      anotarAviso: vi.fn(async () => {
        throw new Error("sin base")
      }),
    })
    const error = silenciar()
    expect(await cubrirSinFirma(p)).toBe(1)
    expect(error).toHaveBeenCalled()
  })

  test("publicarPendientes covers first, so the reserve piece goes out in the same run, and a failed cover never blocks publishing", async () => {
    const orden: string[] = []
    const { p } = puertos({
      vencidasSinFirma: vi.fn(async () => {
        orden.push("cubrir")
        throw new Error("sin base")
      }),
      tomarPendientes: vi.fn(async () => {
        orden.push("tomar")
        return []
      }),
    })
    silenciar()
    await publicarPendientes(p)
    expect(orden).toEqual(["cubrir", "tomar"])
  })
})

describe("client exceptions marked after the signature", () => {
  const COPEC: Excepcion = { cliente: "Copec", alias: [], tipo: "no_nombrar", hasta: null }
  const conTexto = (texto: string) => pieza({ version: { ...pieza().version, texto } })

  test("only reads the exceptions marked after the piece was signed", async () => {
    const { p, m } = puertos()
    expect(await publicarPieza(p, conTexto("Con Copec en 2019"))).toBe("publicada")
    expect(m.excepcionesPuestasDespues).toHaveBeenCalledWith(FIRMADA_EN)
  })

  test("a client named in the piece that got an exception after the signature sends it back and nothing goes out", async () => {
    const { p, m, estadoDe } = puertos()
    m.excepcionesPuestasDespues.mockResolvedValue([COPEC])
    expect(await publicarPieza(p, conTexto("Con Copec en 2019"))).toBe("por_aprobar")
    expect(m.linkedin.crearPost).not.toHaveBeenCalled()
    expect(m.reservarEnvio).not.toHaveBeenCalled()
    expect(m.mover).toHaveBeenCalledWith(
      "pieza-1",
      "por_aprobar",
      "Nombra a Copec, que ahora tiene una excepción. Revisa el texto y fírmala de nuevo.",
    )
    expect(m.avisar).toHaveBeenCalledTimes(1)
    expect(m.avisar).toHaveBeenCalledWith("marca-1", expect.objectContaining({ url: "/piezas/pieza-1" }))
    expect(estadoDe("pieza-1")).toBe("por_aprobar")
  })

  test("a newer exception for a client the piece does not name lets it go out", async () => {
    const { p, m } = puertos()
    m.excepcionesPuestasDespues.mockResolvedValue([COPEC])
    expect(await publicarPieza(p, conTexto("Con Enel en 2019"))).toBe("publicada")
  })

  test("the carousel title is checked too", async () => {
    const { p, m } = puertos()
    m.excepcionesPuestasDespues.mockResolvedValue([COPEC])
    const base = carrusel()
    expect(await publicarPieza(p, { ...base, version: { ...base.version, titulo: "Copec 85 años" } })).toBe(
      "por_aprobar",
    )
    expect(m.linkedin.subirDocumento).not.toHaveBeenCalled()
  })

  test("an exception that ended yesterday in Chile does not stop the piece", async () => {
    const { p, m } = puertos()
    // AHORA is 2026-11-03 in Chile.
    m.excepcionesPuestasDespues.mockResolvedValue([{ ...COPEC, hasta: "2026-11-02" }])
    expect(await publicarPieza(p, conTexto("Con Copec"))).toBe("publicada")
  })

  test("a piece past its window goes back to the gate with its notice even when the exceptions cannot be read", async () => {
    const { p, m } = puertos({ ahora: () => Date.parse("2026-11-03T14:40:00Z") })
    m.excepcionesPuestasDespues.mockRejectedValue(new Error("base caída"))
    expect(await publicarPieza(p, pieza())).toBe("por_aprobar")
    expect(m.devolverALaReserva).toHaveBeenCalledWith("pieza-1", expect.stringContaining("30 minutos"))
    expect(m.avisar).toHaveBeenCalledWith("marca-1", expect.objectContaining({ titulo: "No salió · Federico" }))
    expect(m.linkedin.crearPost).not.toHaveBeenCalled()
  })

  test("the new exceptions are checked before the file is downloaded or anything is reserved", async () => {
    const { p, m } = puertos()
    m.excepcionesPuestasDespues.mockRejectedValue(new Error("base caída"))
    await expect(publicarPieza(p, carrusel())).rejects.toThrow("base caída")
    expect(m.descargar).not.toHaveBeenCalled()
    expect(m.linkedin.subirDocumento).not.toHaveBeenCalled()
    expect(m.reservarEnvio).not.toHaveBeenCalled()
  })

  test("when the exceptions cannot be read nothing is sent and the run retries", async () => {
    const registro = silenciar()
    const { p, m } = puertos()
    m.excepcionesPuestasDespues.mockRejectedValue(new Error("base caída"))
    m.tomarPendientes.mockResolvedValue([pieza()])
    expect(await publicarPendientes(p)).toMatchObject({ reintentar: 1, publicada: 0 })
    expect(m.reservarEnvio).not.toHaveBeenCalled()
    expect(m.linkedin.crearPost).not.toHaveBeenCalled()
    expect(m.mover).not.toHaveBeenCalled()
    registro.mockRestore()
  })
})
