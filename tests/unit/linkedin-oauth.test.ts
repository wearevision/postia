import { HttpResponse, http } from "msw"
import { describe, expect, test, vi } from "vitest"
import { Falla } from "@/lib/dominio/falla"
import { RechazoDeLinkedin, TokenDeLinkedinVencido } from "@/lib/linkedin/api"
import {
  intercambiarCodigoLinkedin,
  leerMiembro,
  leerMiembroPorMe,
  renovarToken,
  urlDeAutorizacionLinkedin,
} from "@/lib/linkedin/oauth"
import { servidor } from "../msw"

const APP = {
  clientId: "cliente",
  clientSecret: "secreto-de-la-app",
  redirectUri: "http://localhost:3000/api/linkedin/callback",
}

describe("urlDeAutorizacionLinkedin", () => {
  test("asks for OpenID Connect and w_member_social, space-encoded, with the state", () => {
    const url = new URL(
      urlDeAutorizacionLinkedin({ clientId: APP.clientId, redirectUri: APP.redirectUri, estado: "e1" }),
    )
    expect(url.origin + url.pathname).toBe("https://www.linkedin.com/oauth/v2/authorization")
    expect(url.searchParams.get("scope")).toBe("openid profile w_member_social")
    expect(url.toString()).toContain("scope=openid%20profile%20w_member_social")
    expect(url.searchParams.get("state")).toBe("e1")
    expect(url.searchParams.get("redirect_uri")).toBe(APP.redirectUri)
  })
})

describe("intercambiarCodigoLinkedin", () => {
  test("exchanges the code and reads comma-separated scopes", async () => {
    let cuerpo = new URLSearchParams()
    servidor.use(
      http.post("https://www.linkedin.com/oauth/v2/accessToken", async ({ request }) => {
        cuerpo = new URLSearchParams(await request.text())
        return HttpResponse.json({
          access_token: "tok",
          expires_in: 5_184_000,
          scope: "openid,profile,w_member_social",
        })
      }),
    )
    const acceso = await intercambiarCodigoLinkedin({ ...APP, codigo: "c1" })
    expect(acceso).toEqual({
      token: "tok",
      expiraEnSegundos: 5_184_000,
      scopes: ["openid", "profile", "w_member_social"],
      refreshToken: null,
      refreshTokenExpiraEnSegundos: null,
    })
    expect(cuerpo.get("grant_type")).toBe("authorization_code")
    expect(cuerpo.get("code")).toBe("c1")
  })

  test("returns the refresh token and its lifetime when LinkedIn grants one", async () => {
    servidor.use(
      http.post("https://www.linkedin.com/oauth/v2/accessToken", () =>
        HttpResponse.json({
          access_token: "tok",
          expires_in: 5_184_000,
          refresh_token: "ref",
          refresh_token_expires_in: 31_536_000,
          scope: "r_basicprofile rw_organization_admin w_organization_social",
        }),
      ),
    )
    const acceso = await intercambiarCodigoLinkedin({ ...APP, codigo: "c1" })
    expect(acceso.refreshToken).toBe("ref")
    expect(acceso.refreshTokenExpiraEnSegundos).toBe(31_536_000)
  })

  test("a definitive refusal is a Falla, and the logged detail never carries the secret", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined)
    servidor.use(
      http.post("https://www.linkedin.com/oauth/v2/accessToken", () =>
        HttpResponse.text("bad secreto-de-la-app", { status: 401 }),
      ),
    )
    await expect(intercambiarCodigoLinkedin({ ...APP, codigo: "c1" })).rejects.toBeInstanceOf(Falla)
    expect(JSON.stringify(log.mock.calls)).not.toContain("secreto-de-la-app")
    log.mockRestore()
  })

  test("a server error is not a Falla (it may work on retry)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    servidor.use(
      http.post("https://www.linkedin.com/oauth/v2/accessToken", () => HttpResponse.text("down", { status: 503 })),
    )
    const error = await intercambiarCodigoLinkedin({ ...APP, codigo: "c1" }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(Falla)
  })
})

describe("leerMiembro", () => {
  test("reads the member URN and name from /v2/userinfo", async () => {
    servidor.use(
      http.get("https://api.linkedin.com/v2/userinfo", () =>
        HttpResponse.json({ sub: "abc-123", name: " Federico Elgueta " }),
      ),
    )
    expect(await leerMiembro({ token: "tok" })).toEqual({
      miembro: "urn:li:person:abc-123",
      nombre: "Federico Elgueta",
    })
  })
})

describe("leerMiembroPorMe", () => {
  test("reads the member URN from /v2/me", async () => {
    let autorizacion: string | null = null
    servidor.use(
      http.get("https://api.linkedin.com/v2/me", ({ request }) => {
        autorizacion = request.headers.get("authorization")
        return HttpResponse.json({ id: "Xy_9-z", localizedFirstName: "Federico" })
      }),
    )
    expect(await leerMiembroPorMe({ token: "tok" })).toBe("urn:li:person:Xy_9-z")
    expect(autorizacion).toBe("Bearer tok")
  })

  test("a 401 means the token expired", async () => {
    servidor.use(http.get("https://api.linkedin.com/v2/me", () => HttpResponse.text("expired", { status: 401 })))
    await expect(leerMiembroPorMe({ token: "tok" })).rejects.toBeInstanceOf(TokenDeLinkedinVencido)
  })

  test("an id that cannot be a URN is refused", async () => {
    servidor.use(http.get("https://api.linkedin.com/v2/me", () => HttpResponse.json({ id: "a b:c" })))
    await expect(leerMiembroPorMe({ token: "tok" })).rejects.toThrow("/v2/me")
  })
})

describe("renovarToken", () => {
  const APP_PAGINA = { clientId: "cliente-pagina", clientSecret: "secreto-pagina" }

  test("posts the refresh grant form-encoded and returns the new token and expiries", async () => {
    let cuerpo = new URLSearchParams()
    let tipo: string | null = null
    servidor.use(
      http.post("https://www.linkedin.com/oauth/v2/accessToken", async ({ request }) => {
        tipo = request.headers.get("content-type")
        cuerpo = new URLSearchParams(await request.text())
        return HttpResponse.json({
          access_token: "nuevo",
          expires_in: 5_184_000,
          refresh_token: "ref",
          refresh_token_expires_in: 26_438_400,
        })
      }),
    )
    expect(await renovarToken({ ...APP_PAGINA, refreshToken: "ref" })).toEqual({
      token: "nuevo",
      expiraEnSegundos: 5_184_000,
      refreshToken: "ref",
      refreshTokenExpiraEnSegundos: 26_438_400,
    })
    expect(tipo).toBe("application/x-www-form-urlencoded")
    expect(Object.fromEntries(cuerpo)).toEqual({
      grant_type: "refresh_token",
      refresh_token: "ref",
      client_id: "cliente-pagina",
      client_secret: "secreto-pagina",
    })
  })

  test("keeps the refresh token it sent when the answer omits it", async () => {
    servidor.use(
      http.post("https://www.linkedin.com/oauth/v2/accessToken", () =>
        HttpResponse.json({ access_token: "nuevo", expires_in: 5_184_000 }),
      ),
    )
    const renovado = await renovarToken({ ...APP_PAGINA, refreshToken: "ref" })
    expect(renovado.refreshToken).toBe("ref")
    expect(renovado.refreshTokenExpiraEnSegundos).toBeNull()
  })

  test("a 4xx is a definitive refusal whose message carries neither the secret nor the refresh token", async () => {
    servidor.use(
      http.post("https://www.linkedin.com/oauth/v2/accessToken", () =>
        HttpResponse.text("invalid_request ref secreto-pagina", { status: 400 }),
      ),
    )
    const error = await renovarToken({ ...APP_PAGINA, refreshToken: "ref" }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RechazoDeLinkedin)
    expect((error as Error).message).not.toContain("secreto-pagina")
    expect((error as Error).message).not.toContain(" ref ")
  })

  test("a server error is not a refusal (it may work on retry)", async () => {
    servidor.use(
      http.post("https://www.linkedin.com/oauth/v2/accessToken", () => HttpResponse.text("down", { status: 503 })),
    )
    const error = await renovarToken({ ...APP_PAGINA, refreshToken: "ref" }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(RechazoDeLinkedin)
  })
})
