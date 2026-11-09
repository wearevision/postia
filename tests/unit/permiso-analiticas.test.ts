import { HttpResponse, http } from "msw"
import { afterEach, describe, expect, test, vi } from "vitest"
import { resolverCallbackDeEstudioWav } from "@/lib/linkedin/callback-estudio-wav"
import {
  destinoDeAnaliticas,
  SCOPES_DE_ANALITICAS,
  terminarConexionDeAnaliticas,
  urlDeAutorizacionDeAnaliticas,
} from "@/lib/linkedin/permiso-analiticas"
import { servidor } from "../msw"

const APP = { clientId: "c", clientSecret: "s", redirectUri: "http://localhost:3000/api/linkedin/pagina/callback" }
const CUENTA = "8c0a2f6e-1b2c-4d3e-9f40-123456789abc"
const AHORA = Date.parse("2026-11-09T12:00:00Z")
const SESENTA_DIAS = new Date(AHORA + 5_184_000_000).toISOString()

function linkedin(token: Record<string, unknown> = { scope: "r_member_postAnalytics" }) {
  servidor.use(
    http.post("https://www.linkedin.com/oauth/v2/accessToken", () =>
      HttpResponse.json({ access_token: "tok", expires_in: 5_184_000, ...token }),
    ),
  )
}

function deps() {
  return {
    app: APP,
    ahora: () => AHORA,
    guardar: vi.fn(async () => ({ error: null as { message: string; code?: string } | null })),
  }
}

const llegada = { codigo: "c1", estado: "e1", guardado: { estado: "e1", cuenta: CUENTA }, errorDeLinkedin: null }

afterEach(() => vi.restoreAllMocks())

describe("urlDeAutorizacionDeAnaliticas", () => {
  test("asks for r_member_postAnalytics only, through the page app's registered callback", () => {
    const url = new URL(urlDeAutorizacionDeAnaliticas({ clientId: "c", redirectUri: APP.redirectUri, estado: "e1" }))
    expect(url.origin + url.pathname).toBe("https://www.linkedin.com/oauth/v2/authorization")
    expect(url.searchParams.get("scope")).toBe("r_member_postAnalytics")
    expect(url.searchParams.get("state")).toBe("e1")
    expect(url.searchParams.get("redirect_uri")).toBe(APP.redirectUri)
    expect(SCOPES_DE_ANALITICAS).toEqual(["r_member_postAnalytics"])
  })
})

describe("terminarConexionDeAnaliticas", () => {
  test("stores the token with its granted scopes and expiry", async () => {
    linkedin()
    const d = deps()
    expect(await terminarConexionDeAnaliticas(d, llegada)).toEqual({ ok: true })
    expect(d.guardar).toHaveBeenCalledWith({
      p_cuenta: CUENTA,
      p_token: "tok",
      p_scopes: ["r_member_postAnalytics"],
      p_expira_en: SESENTA_DIAS,
    })
  })

  test("without the app configured nothing happens", async () => {
    expect(await terminarConexionDeAnaliticas({ ...deps(), app: null }, llegada)).toEqual({
      ok: false,
      motivo: "sin_app_pagina",
    })
  })

  test("a state that does not match stops before calling LinkedIn", async () => {
    const d = deps()
    expect(await terminarConexionDeAnaliticas(d, { ...llegada, estado: "otro" })).toEqual({
      ok: false,
      motivo: "estado",
    })
    expect(d.guardar).not.toHaveBeenCalled()
  })

  test("a cancelled consent is reported as cancelled", async () => {
    expect(
      await terminarConexionDeAnaliticas(deps(), { ...llegada, errorDeLinkedin: "user_cancelled_authorize" }),
    ).toEqual({ ok: false, motivo: "cancelada" })
  })

  test("a token that LinkedIn granted without the analytics scope is not saved", async () => {
    linkedin({ scope: "r_basicprofile" })
    const d = deps()
    expect(await terminarConexionDeAnaliticas(d, llegada)).toEqual({ ok: false, motivo: "permisos_analiticas" })
    expect(d.guardar).not.toHaveBeenCalled()
  })

  test("scopes separated by commas are read too", async () => {
    linkedin({ scope: "r_basicprofile,r_member_postAnalytics" })
    const d = deps()
    expect(await terminarConexionDeAnaliticas(d, llegada)).toEqual({ ok: true })
    expect(d.guardar).toHaveBeenCalledWith(
      expect.objectContaining({ p_scopes: ["r_basicprofile", "r_member_postAnalytics"] }),
    )
  })

  test("an answer without scopes stores the scope that was asked for", async () => {
    linkedin({})
    const d = deps()
    expect(await terminarConexionDeAnaliticas(d, llegada)).toEqual({ ok: true })
    expect(d.guardar).toHaveBeenCalledWith(expect.objectContaining({ p_scopes: ["r_member_postAnalytics"] }))
  })

  test("a company account is told that analytics belong to the profile", async () => {
    linkedin()
    const d = { ...deps(), guardar: vi.fn(async () => ({ error: { message: "cuenta_no_es_perfil" } })) }
    expect(await terminarConexionDeAnaliticas(d, llegada)).toEqual({ ok: false, motivo: "analiticas_solo_perfil" })
  })

  test("a refused code is reported as refused", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    servidor.use(
      http.post("https://www.linkedin.com/oauth/v2/accessToken", () => HttpResponse.text("bad", { status: 400 })),
    )
    expect(await terminarConexionDeAnaliticas(deps(), llegada)).toEqual({ ok: false, motivo: "rechazada" })
  })

  test("logs never carry the token or the database's words", async () => {
    linkedin()
    const registro = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const d = { ...deps(), guardar: vi.fn(async () => ({ error: { message: "tok escapó", code: "XX000" } })) }
    expect(await terminarConexionDeAnaliticas(d, llegada)).toEqual({ ok: false, motivo: "fallo" })
    expect(JSON.stringify(registro.mock.calls)).not.toContain("tok")
  })
})

describe("destinoDeAnaliticas", () => {
  test("goes back to Ajustes with a fixed word", () => {
    expect(destinoDeAnaliticas({ ok: true })).toBe("/ajustes?linkedin=analiticas_conectada")
    expect(destinoDeAnaliticas({ ok: false, motivo: "permisos_analiticas" })).toBe(
      "/ajustes?linkedin=permisos_analiticas",
    )
  })
})

describe("resolverCallbackDeEstudioWav", () => {
  test("a callback started for analytics saves analytics and never a page choice", async () => {
    linkedin()
    const analiticas = deps()
    const pagina = { app: APP, ahora: () => AHORA, guardarEleccion: vi.fn() }
    const destino = await resolverCallbackDeEstudioWav(
      { pagina, analiticas },
      { ...llegada, guardado: { ...llegada.guardado, proposito: "analiticas" } },
    )
    expect(destino).toBe("/ajustes?linkedin=analiticas_conectada")
    expect(analiticas.guardar).toHaveBeenCalledOnce()
    expect(pagina.guardarEleccion).not.toHaveBeenCalled()
  })

  test("a callback started for the page never saves analytics", async () => {
    linkedin({ scope: "r_basicprofile" })
    const analiticas = deps()
    const pagina = { app: APP, ahora: () => AHORA, guardarEleccion: vi.fn() }
    const destino = await resolverCallbackDeEstudioWav(
      { pagina, analiticas },
      { ...llegada, guardado: { ...llegada.guardado, proposito: "pagina" } },
    )
    expect(destino).toBe("/ajustes?linkedin=permisos")
    expect(analiticas.guardar).not.toHaveBeenCalled()
  })

  test("a callback without its cookie fails as a state mismatch, whichever flow it was", async () => {
    const analiticas = deps()
    const pagina = { app: APP, ahora: () => AHORA, guardarEleccion: vi.fn() }
    expect(await resolverCallbackDeEstudioWav({ pagina, analiticas }, { ...llegada, guardado: null })).toBe(
      "/ajustes?linkedin=estado",
    )
    expect(analiticas.guardar).not.toHaveBeenCalled()
  })
})
