import { afterEach, describe, expect, test, vi } from "vitest"
import { RechazoDeLinkedin } from "@/lib/linkedin/api"
import { appDeRenovacion, type PuertosDeRenovacion, renovarConexiones } from "@/lib/linkedin/renovar"

const AHORA = Date.parse("2026-11-03T10:30:00Z")
const DIA = 86_400_000
const en = (ms: number) => new Date(AHORA + ms).toISOString()

const pendiente = (conexion: string) => ({
  conexion,
  renovacion: `ren-secreto-${conexion}`,
  expiraEn: en(5 * DIA),
  renovacionExpiraEn: en(300 * DIA),
})

function puertos(cambios: Partial<PuertosDeRenovacion> = {}) {
  const m = {
    pendientes: vi.fn(async () => [pendiente("c1"), pendiente("c2")]),
    renovar: vi.fn(async (refreshToken: string) => ({
      token: `nuevo-secreto-${refreshToken}`,
      expiraEnSegundos: 60 * 86_400,
      refreshToken,
      refreshTokenExpiraEnSegundos: null as number | null,
    })),
    guardar: vi.fn(async () => {}),
    olvidar: vi.fn(async () => {}),
  } satisfies PuertosDeRenovacion
  return { m, p: { ...m, ...cambios } as PuertosDeRenovacion }
}

afterEach(() => vi.restoreAllMocks())

describe("renovarConexiones", () => {
  test("asks for the connections whose token runs out within 10 days", async () => {
    const { m, p } = puertos()
    await renovarConexiones(p, AHORA)
    expect(m.pendientes).toHaveBeenCalledWith(en(10 * DIA))
  })

  test("saves each new token with its expiry, keeping the refresh token's fixed expiry", async () => {
    const { m, p } = puertos()
    expect(await renovarConexiones(p, AHORA)).toEqual({ renovadas: 2, rechazadas: 0 })
    expect(m.renovar).toHaveBeenCalledWith("ren-secreto-c1")
    expect(m.guardar).toHaveBeenCalledWith({
      conexion: "c1",
      token: "nuevo-secreto-ren-secreto-c1",
      expiraEn: en(60 * DIA),
      renovacion: "ren-secreto-c1",
      renovacionExpiraEn: en(300 * DIA),
    })
  })

  test("a refresh token LinkedIn sends back with its own expiry is saved with it", async () => {
    const { m, p } = puertos({
      pendientes: vi.fn(async () => [pendiente("c1")]),
      renovar: vi.fn(async () => ({
        token: "t",
        expiraEnSegundos: 60 * 86_400,
        refreshToken: "otro",
        refreshTokenExpiraEnSegundos: 200 * 86_400,
      })),
    })
    await renovarConexiones(p, AHORA)
    expect(m.guardar).toHaveBeenCalledWith(
      expect.objectContaining({ renovacion: "otro", renovacionExpiraEn: en(200 * DIA) }),
    )
  })

  test("a refusal is logged for that connection and the others still renew", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => {})
    const { m, p } = puertos()
    m.renovar.mockRejectedValueOnce(new RechazoDeLinkedin(400, "LinkedIn respondió HTTP 400: ren-secreto-c1"))
    expect(await renovarConexiones(p, AHORA)).toEqual({ renovadas: 1, rechazadas: 1 })
    expect(m.guardar).toHaveBeenCalledTimes(1)
    expect(registro).toHaveBeenCalledWith("LinkedIn no renovó la conexión c1 (HTTP 400): queda para la vigilancia.")
  })

  test("a refusal forgets that connection's refresh token, so the watch warns about its access token again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { m, p } = puertos()
    m.renovar.mockRejectedValueOnce(new RechazoDeLinkedin(400, "invalid_grant"))
    await renovarConexiones(p, AHORA)
    expect(m.olvidar).toHaveBeenCalledTimes(1)
    expect(m.olvidar).toHaveBeenCalledWith("c1")
  })

  test("failing to forget a refused refresh token surfaces at the end", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { m, p } = puertos()
    m.renovar.mockRejectedValueOnce(new RechazoDeLinkedin(400, "invalid_grant"))
    m.olvidar.mockRejectedValueOnce(new Error("sin base"))
    const error = await renovarConexiones(p, AHORA).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AggregateError)
    expect(m.guardar).toHaveBeenCalledTimes(1)
  })

  test("an unexpected error does not stop the others and surfaces at the end", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { m, p } = puertos()
    m.guardar.mockRejectedValueOnce(new Error("sin base"))
    const error = await renovarConexiones(p, AHORA).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AggregateError)
    expect(error instanceof AggregateError ? error.message : "").toBe("No pude renovar las conexiones c1.")
    expect(error instanceof AggregateError ? error.errors.map((e: Error) => e.message) : []).toEqual(["sin base"])
    expect(m.guardar).toHaveBeenCalledTimes(2)
  })

  test("never writes a token to the log", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    const { m, p } = puertos()
    m.renovar.mockRejectedValueOnce(new RechazoDeLinkedin(400, "eco: ren-secreto-c1"))
    m.guardar.mockRejectedValueOnce(new Error("eco: nuevo-secreto-ren-secreto-c2"))
    await renovarConexiones(p, AHORA).catch(() => undefined)
    const escrito = JSON.stringify([...error.mock.calls, ...log.mock.calls])
    expect(escrito).not.toContain("secreto")
  })
})

describe("appDeRenovacion", () => {
  test("reads the page app's id and secret from the Trigger environment", () => {
    expect(appDeRenovacion({ LINKEDIN_PAGINA_CLIENT_ID: "c", LINKEDIN_PAGINA_CLIENT_SECRET: "s" })).toEqual({
      clientId: "c",
      clientSecret: "s",
    })
  })

  test("is null when either is missing", () => {
    expect(appDeRenovacion({ LINKEDIN_PAGINA_CLIENT_ID: "c" })).toBeNull()
    expect(appDeRenovacion({ LINKEDIN_CLIENT_ID: "c", LINKEDIN_CLIENT_SECRET: "s" })).toBeNull()
  })
})
