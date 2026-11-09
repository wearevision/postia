import { describe, expect, test, vi } from "vitest"
import { LecturaDeLinkedinFallida, MENSAJE_LIMITE, MENSAJE_RECONECTAR } from "@/lib/linkedin/analiticas"
import { leerAnaliticas, type PuertosDeAnaliticas } from "@/lib/rendimiento/sincronizar"

const AHORA = Date.parse("2026-11-09T12:00:00Z")
const CUENTA = "11111111-1111-4111-8111-111111111111"
const PAGINA = "urn:li:organization:2414183"

function puertos(sobre: Partial<PuertosDeAnaliticas> & { tipo?: "persona" | "empresa" } = {}) {
  const { tipo = "empresa", ...resto } = sobre
  const terminar = vi.fn<PuertosDeAnaliticas["terminar"]>(async () => {})
  const guardar = vi.fn<PuertosDeAnaliticas["guardar"]>(async (_c, d) => ({
    publicaciones: d.publicaciones.length,
    dias: d.dias.length,
  }))
  const p: PuertosDeAnaliticas = {
    tomar: async () => [{ id: "lectura-1", cuentaId: CUENTA }],
    terminar,
    tipoDeCuenta: async () => tipo,
    credencial: async () => ({
      token: "tok",
      expiraEn: new Date(AHORA + 86_400_000).toISOString(),
      organizacion: tipo === "empresa" ? PAGINA : null,
    }),
    postsDePostia: async () => [],
    guardar,
    linkedin: {
      cifrasDeLaPagina: async ({ shares }) =>
        shares.map((urn) => ({ urn, impresiones: 100, interacciones: 7, clics: 3 })),
      seguidoresDeLaPagina: async () => [{ dia: "2026-11-05", seguidoresNuevos: 4 }],
      cifrasDeUnPostDelPerfil: async () => ({ impresiones: 50, interacciones: 5 }),
    },
    ahora: () => AHORA,
    ...resto,
  }
  return { p, terminar, guardar }
}

const comparten = (n: number) => Array.from({ length: n }, (_, i) => `urn:li:share:${i + 1}`)

describe("the page", () => {
  test("reads its shares and the last 30 days of followers, and stores both", async () => {
    const seguidores = vi.fn<PuertosDeAnaliticas["linkedin"]["seguidoresDeLaPagina"]>(async () => [
      { dia: "2026-11-05", seguidoresNuevos: 4 },
    ])
    const { p, guardar, terminar } = puertos({
      postsDePostia: async () => ["urn:li:share:1", "urn:li:share:2"],
      linkedin: {
        cifrasDeLaPagina: async ({ shares }) =>
          shares.map((urn) => ({ urn, impresiones: 100, interacciones: 7, clics: 3 })),
        seguidoresDeLaPagina: seguidores,
        cifrasDeUnPostDelPerfil: async () => ({ impresiones: 0, interacciones: 0 }),
      },
    })
    expect(await leerAnaliticas(p)).toEqual({ leidas: 1, fallidas: 0 })
    expect(guardar).toHaveBeenCalledWith(CUENTA, {
      publicaciones: [
        { post_urn: "urn:li:share:1", impresiones: 100, interacciones: 7, clics: 3 },
        { post_urn: "urn:li:share:2", impresiones: 100, interacciones: 7, clics: 3 },
      ],
      dias: [{ dia: "2026-11-05", seguidores_nuevos: 4 }],
    })
    // Followers: 30 days ending yesterday (UTC), since the last data point is two days before the request.
    expect(seguidores).toHaveBeenCalledWith({
      token: "tok",
      organizacion: PAGINA,
      desde: Date.parse("2026-10-09T00:00:00Z"),
      hasta: Date.parse("2026-11-08T00:00:00Z"),
    })
    expect(terminar).toHaveBeenCalledWith("lectura-1", "lista", "Leí 2 publicaciones y 1 día de seguidores.")
  })

  test("skips ugcPost URNs and says how many", async () => {
    const pedidas: string[][] = []
    const { p, terminar, guardar } = puertos({
      postsDePostia: async () => ["urn:li:share:1", "urn:li:ugcPost:9", "urn:li:ugcPost:10"],
      linkedin: {
        cifrasDeLaPagina: async ({ shares }) => {
          pedidas.push([...shares])
          return shares.map((urn) => ({ urn, impresiones: 1, interacciones: 1, clics: 1 }))
        },
        seguidoresDeLaPagina: async () => [],
        cifrasDeUnPostDelPerfil: async () => ({ impresiones: 0, interacciones: 0 }),
      },
    })
    await leerAnaliticas(p)
    expect(pedidas).toEqual([["urn:li:share:1"]])
    expect(guardar.mock.calls[0]?.[1].publicaciones).toHaveLength(1)
    expect(terminar.mock.calls[0]?.[2]).toContain("2 publicaciones de tipo ugcPost no se leen")
  })

  test("reads at most the 100 newest posts", async () => {
    const pedidas: string[][] = []
    const { p } = puertos({
      postsDePostia: async () => comparten(150),
      linkedin: {
        cifrasDeLaPagina: async ({ shares }) => {
          pedidas.push([...shares])
          return []
        },
        seguidoresDeLaPagina: async () => [],
        cifrasDeUnPostDelPerfil: async () => ({ impresiones: 0, interacciones: 0 }),
      },
    })
    await leerAnaliticas(p)
    expect(pedidas.flat()).toHaveLength(100)
  })

  test("without PostIA posts it still reads the followers", async () => {
    const cifras = vi.fn(async () => [])
    const { p, guardar } = puertos({
      linkedin: {
        cifrasDeLaPagina: cifras,
        seguidoresDeLaPagina: async () => [{ dia: "2026-11-05", seguidoresNuevos: 4 }],
        cifrasDeUnPostDelPerfil: async () => ({ impresiones: 0, interacciones: 0 }),
      },
    })
    await leerAnaliticas(p)
    expect(cifras).not.toHaveBeenCalled()
    expect(guardar.mock.calls[0]?.[1]).toEqual({
      publicaciones: [],
      dias: [{ dia: "2026-11-05", seguidores_nuevos: 4 }],
    })
  })
})

describe("the profile", () => {
  test("reads the 10 newest PostIA posts, four calls each at most", async () => {
    const leidos: string[] = []
    const { p, guardar } = puertos({
      tipo: "persona",
      postsDePostia: async () => comparten(14),
      linkedin: {
        cifrasDeLaPagina: async () => {
          throw new Error("el perfil no lee la página")
        },
        seguidoresDeLaPagina: async () => {
          throw new Error("el perfil no lee seguidores")
        },
        cifrasDeUnPostDelPerfil: async ({ urn }) => {
          leidos.push(urn)
          return { impresiones: 50, interacciones: 5 }
        },
      },
    })
    await leerAnaliticas(p)
    expect(leidos).toEqual(comparten(10))
    const datos = guardar.mock.calls[0]?.[1]
    expect(datos?.publicaciones).toHaveLength(10)
    expect(datos?.publicaciones[0]).toEqual({
      post_urn: "urn:li:share:1",
      impresiones: 50,
      interacciones: 5,
      clics: null,
    })
    expect(datos?.dias).toEqual([])
  })

  test("a post that fails with a plain error is skipped and counted, the others are kept", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})
    const { p, guardar, terminar } = puertos({
      tipo: "persona",
      postsDePostia: async () => comparten(3),
      linkedin: {
        cifrasDeLaPagina: async () => [],
        seguidoresDeLaPagina: async () => [],
        cifrasDeUnPostDelPerfil: async ({ urn }) => {
          if (urn === "urn:li:share:2") throw new Error("LinkedIn respondió HTTP 500")
          return { impresiones: 1, interacciones: 1 }
        },
      },
    })
    await leerAnaliticas(p)
    expect(guardar.mock.calls[0]?.[1].publicaciones.map((x) => x.post_urn)).toEqual([
      "urn:li:share:1",
      "urn:li:share:3",
    ])
    expect(terminar.mock.calls[0]?.[2]).toContain("1 no se pudo leer")
    registro.mockRestore()
  })

  test("the daily limit stops the run but keeps what was already read", async () => {
    let llamadas = 0
    const { p, guardar, terminar } = puertos({
      tipo: "persona",
      postsDePostia: async () => comparten(5),
      linkedin: {
        cifrasDeLaPagina: async () => [],
        seguidoresDeLaPagina: async () => [],
        cifrasDeUnPostDelPerfil: async () => {
          llamadas++
          if (llamadas === 3) throw new LecturaDeLinkedinFallida("limite", MENSAJE_LIMITE)
          return { impresiones: 1, interacciones: 1 }
        },
      },
    })
    expect(await leerAnaliticas(p)).toEqual({ leidas: 0, fallidas: 1 })
    expect(llamadas).toBe(3)
    expect(guardar.mock.calls[0]?.[1].publicaciones).toHaveLength(2)
    expect(terminar).toHaveBeenCalledWith("lectura-1", "fallo", MENSAJE_LIMITE)
  })
})

describe("connection problems", () => {
  test("an account without a connection closes the reading asking to reconnect", async () => {
    const { p, terminar, guardar } = puertos({ credencial: async () => null })
    expect(await leerAnaliticas(p)).toEqual({ leidas: 0, fallidas: 1 })
    expect(terminar).toHaveBeenCalledWith("lectura-1", "fallo", MENSAJE_RECONECTAR)
    expect(guardar).not.toHaveBeenCalled()
  })

  test("an expired token is not sent to LinkedIn", async () => {
    const cifras = vi.fn(async () => [])
    const { p, terminar } = puertos({
      credencial: async () => ({ token: "tok", expiraEn: new Date(AHORA - 1000).toISOString(), organizacion: PAGINA }),
      postsDePostia: async () => ["urn:li:share:1"],
      linkedin: {
        cifrasDeLaPagina: cifras,
        seguidoresDeLaPagina: async () => [],
        cifrasDeUnPostDelPerfil: async () => ({ impresiones: 0, interacciones: 0 }),
      },
    })
    await leerAnaliticas(p)
    expect(cifras).not.toHaveBeenCalled()
    expect(terminar).toHaveBeenCalledWith("lectura-1", "fallo", MENSAJE_RECONECTAR)
  })

  test("LinkedIn's 403 closes the reading with the reconnect notice", async () => {
    const { p, terminar } = puertos({
      postsDePostia: async () => ["urn:li:share:1"],
      linkedin: {
        cifrasDeLaPagina: async () => {
          throw new LecturaDeLinkedinFallida("reconectar", MENSAJE_RECONECTAR)
        },
        seguidoresDeLaPagina: async () => [],
        cifrasDeUnPostDelPerfil: async () => ({ impresiones: 0, interacciones: 0 }),
      },
    })
    await leerAnaliticas(p)
    expect(terminar).toHaveBeenCalledWith("lectura-1", "fallo", MENSAJE_RECONECTAR)
  })
})

describe("unexpected errors", () => {
  test("close the reading with a generic notice, never with LinkedIn's words, and surface after the loop", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})
    const { p, terminar } = puertos({
      guardar: async () => {
        throw new Error("duplicate key tok-secreto")
      },
      postsDePostia: async () => ["urn:li:share:1"],
    })
    await expect(leerAnaliticas(p)).rejects.toThrow("duplicate key")
    expect(terminar).toHaveBeenCalledWith(
      "lectura-1",
      "fallo",
      "No pude leer las cifras de LinkedIn. Inténtalo de nuevo en un rato.",
    )
    expect(registro.mock.calls.flat().join(" ")).not.toContain("tok-secreto")
    registro.mockRestore()
  })
})

describe("the queue", () => {
  test("does nothing when no reading is waiting", async () => {
    const { p, guardar } = puertos({ tomar: async () => [] })
    expect(await leerAnaliticas(p)).toEqual({ leidas: 0, fallidas: 0 })
    expect(guardar).not.toHaveBeenCalled()
  })
})
