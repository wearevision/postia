import { HttpResponse, http } from "msw"
import { describe, expect, test, vi } from "vitest"
import { Falla } from "@/lib/dominio/falla"
import { intercambiarCodigoLinkedin, leerMiembro, urlDeAutorizacionLinkedin } from "@/lib/linkedin/oauth"
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
    })
    expect(cuerpo.get("grant_type")).toBe("authorization_code")
    expect(cuerpo.get("code")).toBe("c1")
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
