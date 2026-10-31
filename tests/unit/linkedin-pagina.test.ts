import { HttpResponse, http } from "msw"
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  destinoDeLaPagina,
  elegirPagina,
  leerAppDePagina,
  terminarConexionDePagina,
  urlDeAutorizacionDePagina,
} from "@/lib/linkedin/pagina"
import type { Db } from "@/lib/supabase/database"
import { servidor } from "../msw"

const APP = { clientId: "c", clientSecret: "s", redirectUri: "http://localhost:3000/api/linkedin/pagina/callback" }
const CUENTA = "8c0a2f6e-1b2c-4d3e-9f40-123456789abc"
const ELECCION = "1f2e3d4c-5b6a-4789-8abc-def012345678"
const AHORA = Date.parse("2026-11-01T12:00:00Z")
const API = "https://api.linkedin.com"
const SCOPES = "r_basicprofile,rw_organization_admin,w_organization_social"

interface Token {
  scope?: string
  refresh_token?: string
  refresh_token_expires_in?: number
}

function linkedin(paginas: string[], token: Token = { scope: SCOPES }) {
  const consultas: string[] = []
  servidor.use(
    http.post("https://www.linkedin.com/oauth/v2/accessToken", () =>
      HttpResponse.json({ access_token: "tok", expires_in: 5_184_000, ...token }),
    ),
    http.get(`${API}/v2/me`, () => HttpResponse.json({ id: "abc" })),
    http.get(`${API}/rest/organizationAcls`, () =>
      HttpResponse.json({
        elements: paginas.map((organization) => ({ organization, role: "ADMINISTRATOR", state: "APPROVED" })),
      }),
    ),
    http.get(`${API}/rest/organizations/:id`, ({ params }) => {
      consultas.push(String(params.id))
      return params.id === "999"
        ? HttpResponse.text("forbidden", { status: 403 })
        : HttpResponse.json({ localizedName: `Página ${params.id}` })
    }),
  )
  return consultas
}

function deps() {
  return {
    app: APP,
    ahora: () => AHORA,
    guardarEleccion: vi.fn(async () => ({
      data: ELECCION as string | null,
      error: null as { message: string } | null,
    })),
  }
}

const llegadaValida = { codigo: "c1", estado: "e1", guardado: { estado: "e1", cuenta: CUENTA }, errorDeLinkedin: null }
const SESENTA_DIAS = new Date(AHORA + 5_184_000_000).toISOString()

afterEach(() => vi.restoreAllMocks())

describe("leerAppDePagina", () => {
  test("reads the Community Management app's three variables", () => {
    expect(
      leerAppDePagina({
        LINKEDIN_PAGINA_CLIENT_ID: "c",
        LINKEDIN_PAGINA_CLIENT_SECRET: "s",
        LINKEDIN_PAGINA_REDIRECT_URI: "https://postia.wearevision.cl/api/linkedin/pagina/callback",
      }),
    ).toEqual({
      clientId: "c",
      clientSecret: "s",
      redirectUri: "https://postia.wearevision.cl/api/linkedin/pagina/callback",
    })
  })

  test("is null when any of the three is missing, and never falls back to the profile app", () => {
    expect(leerAppDePagina({ LINKEDIN_PAGINA_CLIENT_ID: "c", LINKEDIN_PAGINA_CLIENT_SECRET: "s" })).toBeNull()
    expect(
      leerAppDePagina({ LINKEDIN_CLIENT_ID: "c", LINKEDIN_CLIENT_SECRET: "s", LINKEDIN_REDIRECT_URI: "https://x" }),
    ).toBeNull()
  })
})

describe("urlDeAutorizacionDePagina", () => {
  test("asks for the page scopes only", () => {
    const url = new URL(urlDeAutorizacionDePagina({ clientId: "c", redirectUri: APP.redirectUri, estado: "e1" }))
    expect(url.origin + url.pathname).toBe("https://www.linkedin.com/oauth/v2/authorization")
    expect(url.searchParams.get("scope")).toBe("r_basicprofile rw_organization_admin w_organization_social")
    expect(url.searchParams.get("state")).toBe("e1")
    expect(url.searchParams.get("redirect_uri")).toBe(APP.redirectUri)
  })
})

describe("terminarConexionDePagina", () => {
  test("without the app configured nothing happens", async () => {
    expect(await terminarConexionDePagina({ ...deps(), app: null }, llegadaValida)).toEqual({
      ok: false,
      motivo: "sin_app_pagina",
    })
  })

  test("a state that does not match stops before calling LinkedIn", async () => {
    const d = deps()
    expect(await terminarConexionDePagina(d, { ...llegadaValida, estado: "otro" })).toEqual({
      ok: false,
      motivo: "estado",
    })
    expect(d.guardarEleccion).not.toHaveBeenCalled()
  })

  test("a cancelled consent is reported as cancelled", async () => {
    expect(
      await terminarConexionDePagina(deps(), { ...llegadaValida, errorDeLinkedin: "user_cancelled_authorize" }),
    ).toEqual({ ok: false, motivo: "cancelada" })
  })

  test("a token without the page scopes is not saved", async () => {
    linkedin(["urn:li:organization:123"], { scope: "r_basicprofile,w_organization_social" })
    const d = deps()
    expect(await terminarConexionDePagina(d, llegadaValida)).toEqual({ ok: false, motivo: "permisos" })
    expect(d.guardarEleccion).not.toHaveBeenCalled()
  })

  test("a member who administers no page saves nothing", async () => {
    linkedin([])
    const d = deps()
    expect(await terminarConexionDePagina(d, llegadaValida)).toEqual({ ok: false, motivo: "sin_pagina" })
    expect(d.guardarEleccion).not.toHaveBeenCalled()
  })

  test("even a single page becomes a choice with its name, so the owner confirms the page that publishes", async () => {
    const consultas = linkedin(["urn:li:organization:123"])
    const d = deps()
    expect(await terminarConexionDePagina(d, llegadaValida)).toEqual({ ok: true, eleccion: ELECCION })
    expect(d.guardarEleccion).toHaveBeenCalledWith({
      p_cuenta: CUENTA,
      p_titular: "urn:li:person:abc",
      p_nombre: "",
      p_paginas: [{ urn: "urn:li:organization:123", nombre: "Página 123" }],
      p_token: "tok",
      p_scopes: ["r_basicprofile", "rw_organization_admin", "w_organization_social"],
      p_expira_en: SESENTA_DIAS,
    })
    expect(consultas).toEqual(["123"])
  })

  test("a single page whose name cannot be read is offered by its number", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    linkedin(["urn:li:organization:999"])
    const d = deps()
    await terminarConexionDePagina(d, llegadaValida)
    expect(d.guardarEleccion).toHaveBeenCalledWith(
      expect.objectContaining({ p_paginas: [{ urn: "urn:li:organization:999", nombre: "Página n.º 999" }] }),
    )
  })

  test("a refresh token, when LinkedIn sends one, is saved with its own expiry", async () => {
    linkedin(["urn:li:organization:123"], {
      scope: SCOPES,
      refresh_token: "ren",
      refresh_token_expires_in: 31_536_000,
    })
    const d = deps()
    await terminarConexionDePagina(d, llegadaValida)
    expect(d.guardarEleccion).toHaveBeenCalledWith(
      expect.objectContaining({
        p_renovacion: "ren",
        p_renovacion_expira_en: new Date(AHORA + 31_536_000_000).toISOString(),
      }),
    )
  })

  test("several pages become a choice with each page's name, for this flow only", async () => {
    linkedin(["urn:li:organization:123", "urn:li:organization:999"])
    const d = deps()
    expect(await terminarConexionDePagina(d, llegadaValida)).toEqual({ ok: true, eleccion: ELECCION })
    expect(d.guardarEleccion).toHaveBeenCalledWith({
      p_cuenta: CUENTA,
      p_titular: "urn:li:person:abc",
      p_nombre: "",
      p_paginas: [
        { urn: "urn:li:organization:123", nombre: "Página 123" },
        // A page whose lookup fails is still offered, by its number.
        { urn: "urn:li:organization:999", nombre: "Página n.º 999" },
      ],
      p_token: "tok",
      p_scopes: ["r_basicprofile", "rw_organization_admin", "w_organization_social"],
      p_expira_en: SESENTA_DIAS,
    })
  })

  test("a token answer without scopes is checked against the page list: a 403 means missing permissions", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    linkedin([], {})
    servidor.use(http.get(`${API}/rest/organizationAcls`, () => HttpResponse.text("forbidden", { status: 403 })))
    const d = deps()
    expect(await terminarConexionDePagina(d, llegadaValida)).toEqual({ ok: false, motivo: "permisos" })
    expect(d.guardarEleccion).not.toHaveBeenCalled()
  })

  test("a token answer without scopes whose page list answers goes on to the choice", async () => {
    linkedin(["urn:li:organization:123"], {})
    const d = deps()
    expect(await terminarConexionDePagina(d, llegadaValida)).toEqual({ ok: true, eleccion: ELECCION })
  })

  test("a person account connected through the page app is told to use the profile button", async () => {
    linkedin(["urn:li:organization:123"])
    const d = {
      ...deps(),
      guardarEleccion: vi.fn(async () => ({ data: null, error: { message: "cuenta_y_app_no_calzan" } })),
    }
    expect(await terminarConexionDePagina(d, llegadaValida)).toEqual({ ok: false, motivo: "cuenta_es_perfil" })
  })

  test("logs carry only an error's name or code, never the error object", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => undefined)
    linkedin(["urn:li:organization:999"])
    const d = {
      ...deps(),
      guardarEleccion: vi.fn(async () => ({ data: null, error: { message: "valor tok rechazado", code: "23514" } })),
    }
    expect(await terminarConexionDePagina(d, llegadaValida)).toEqual({ ok: false, motivo: "fallo" })
    const argumentos = registro.mock.calls.flat()
    expect(argumentos.length).toBeGreaterThan(0)
    expect(argumentos.every((a) => typeof a === "string")).toBe(true)
    expect(JSON.stringify(argumentos)).not.toMatch(/\btok\b|rechazado|forbidden/)
  })

  test("a refused exchange is reported as refused", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    servidor.use(
      http.post("https://www.linkedin.com/oauth/v2/accessToken", () => HttpResponse.text("bad", { status: 400 })),
    )
    expect(await terminarConexionDePagina(deps(), llegadaValida)).toEqual({ ok: false, motivo: "rechazada" })
  })

  test("a refused page listing is reported as refused, and the token never reaches the log", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    linkedin([])
    servidor.use(http.get(`${API}/rest/organizationAcls`, () => HttpResponse.text("no tok", { status: 403 })))
    expect(await terminarConexionDePagina(deps(), llegadaValida)).toEqual({ ok: false, motivo: "rechazada" })
    expect(JSON.stringify(error.mock.calls)).not.toMatch(/\btok\b/)
  })

  test("a database refusal is a failure, logged", async () => {
    linkedin(["urn:li:organization:123"])
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    const d = {
      ...deps(),
      guardarEleccion: vi.fn(async () => ({ data: null, error: { message: "solo_el_dueno_conecta" } })),
    }
    expect(await terminarConexionDePagina(d, llegadaValida)).toEqual({ ok: false, motivo: "fallo" })
  })
})

describe("destinoDeLaPagina", () => {
  test("every outcome goes back inside the app", () => {
    expect(destinoDeLaPagina({ ok: true, eleccion: ELECCION })).toBe(`/marcas/pagina?eleccion=${ELECCION}`)
    expect(destinoDeLaPagina({ ok: false, motivo: "sin_pagina" })).toBe("/marcas?linkedin=sin_pagina")
  })

  test("a choice id that is not a uuid never reaches the address", () => {
    expect(destinoDeLaPagina({ ok: true, eleccion: "//evil.example" })).toBe("/marcas?linkedin=fallo")
  })
})

describe("elegirPagina", () => {
  function db(error: { code: string; message: string } | null) {
    const rpc = vi.fn(async () => ({ data: error ? null : "conexion", error }))
    return { rpc, db: { rpc } as unknown as Db }
  }

  test("connects the picked page through elegir_pagina with the person's session", async () => {
    const { rpc, db: base } = db(null)
    expect(await elegirPagina(base, { eleccion: ELECCION, organizacion: "urn:li:organization:123" })).toBe("conectada")
    expect(rpc).toHaveBeenCalledWith("elegir_pagina", {
      p_eleccion: ELECCION,
      p_organizacion: "urn:li:organization:123",
    })
  })

  test("anything malformed never reaches the database", async () => {
    const { rpc, db: base } = db(null)
    expect(await elegirPagina(base, { eleccion: "x", organizacion: "urn:li:organization:123" })).toBe("fallo")
    expect(await elegirPagina(base, { eleccion: ELECCION, organizacion: "urn:li:person:1" })).toBe("fallo")
    expect(rpc).not.toHaveBeenCalled()
  })

  test("an expired or foreign choice sends the owner to connect again", async () => {
    expect(
      await elegirPagina(db({ code: "22023", message: "eleccion_vencida" }).db, {
        eleccion: ELECCION,
        organizacion: "urn:li:organization:123",
      }),
    ).toBe("estado")
    expect(
      await elegirPagina(db({ code: "42501", message: "eleccion_ajena" }).db, {
        eleccion: ELECCION,
        organizacion: "urn:li:organization:123",
      }),
    ).toBe("estado")
  })

  test("any other refusal is a failure, logged by its code only", async () => {
    const registro = vi.spyOn(console, "error").mockImplementation(() => undefined)
    expect(
      await elegirPagina(db({ code: "22023", message: "pagina_fuera_de_la_lista" }).db, {
        eleccion: ELECCION,
        organizacion: "urn:li:organization:123",
      }),
    ).toBe("fallo")
    expect(registro.mock.calls.flat().every((a) => typeof a === "string")).toBe(true)
    expect(JSON.stringify(registro.mock.calls)).toContain("22023")
  })
})
