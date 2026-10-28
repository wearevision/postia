import { HttpResponse, http } from "msw"
import { describe, expect, test, vi } from "vitest"
import { terminarConexionLinkedin } from "@/lib/linkedin/conexion"
import { servidor } from "../msw"

const APP = { clientId: "c", clientSecret: "s", redirectUri: "http://localhost:3000/api/linkedin/callback" }
const CUENTA = "8c0a2f6e-1b2c-4d3e-9f40-123456789abc"
const AHORA = Date.parse("2026-10-28T12:00:00Z")

function linkedin(scope = "openid,profile,w_member_social") {
  servidor.use(
    http.post("https://www.linkedin.com/oauth/v2/accessToken", () =>
      HttpResponse.json({ access_token: "tok", expires_in: 5_184_000, scope }),
    ),
    http.get("https://api.linkedin.com/v2/userinfo", () => HttpResponse.json({ sub: "abc", name: "Federico" })),
  )
}

function deps(guardar = vi.fn(async () => ({ error: null as { message: string } | null }))) {
  return { app: APP, ahora: () => AHORA, guardar }
}

const llegadaValida = { codigo: "c1", estado: "e1", guardado: { estado: "e1", cuenta: CUENTA }, errorDeLinkedin: null }

describe("terminarConexionLinkedin", () => {
  test("saves the connection for the account with a 60-day expiry", async () => {
    linkedin()
    const d = deps()
    expect(await terminarConexionLinkedin(d, llegadaValida)).toEqual({ ok: true, nombre: "Federico" })
    expect(d.guardar).toHaveBeenCalledWith({
      p_cuenta: CUENTA,
      p_token: "tok",
      p_titular: "urn:li:person:abc",
      p_nombre: "Federico",
      p_scopes: ["openid", "profile", "w_member_social"],
      p_expira_en: new Date(AHORA + 5_184_000_000).toISOString(),
    })
  })

  test("a state that does not match stops before calling LinkedIn", async () => {
    const d = deps()
    expect(await terminarConexionLinkedin(d, { ...llegadaValida, estado: "otro" })).toEqual({
      ok: false,
      motivo: "estado",
    })
    expect(d.guardar).not.toHaveBeenCalled()
  })

  test("a cancelled consent is reported as cancelled", async () => {
    expect(
      await terminarConexionLinkedin(deps(), { ...llegadaValida, errorDeLinkedin: "user_cancelled_authorize" }),
    ).toEqual({ ok: false, motivo: "cancelada" })
  })

  test("a token without w_member_social is not saved", async () => {
    linkedin("openid,profile")
    const d = deps()
    expect(await terminarConexionLinkedin(d, llegadaValida)).toEqual({ ok: false, motivo: "permisos" })
    expect(d.guardar).not.toHaveBeenCalled()
  })

  test("a database refusal is a failure, logged", async () => {
    linkedin()
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const d = deps(vi.fn(async () => ({ error: { message: "solo_el_dueno_conecta" } })))
    expect(await terminarConexionLinkedin(d, llegadaValida)).toEqual({ ok: false, motivo: "fallo" })
  })

  test("without the app configured nothing happens", async () => {
    expect(await terminarConexionLinkedin({ ...deps(), app: null }, llegadaValida)).toEqual({
      ok: false,
      motivo: "sin_app",
    })
  })
})
