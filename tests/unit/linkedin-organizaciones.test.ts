import { HttpResponse, http } from "msw"
import { describe, expect, test } from "vitest"
import { RechazoDeLinkedin, TokenDeLinkedinVencido } from "@/lib/linkedin/api"
import { nombreDePagina, paginasQueAdministra } from "@/lib/linkedin/organizaciones"
import { servidor } from "../msw"

const API = "https://api.linkedin.com"

describe("paginasQueAdministra", () => {
  test("asks for approved ADMINISTRATOR roles with the version headers", async () => {
    let url = new URL(API)
    let cabeceras = new Headers()
    servidor.use(
      http.get(`${API}/rest/organizationAcls`, ({ request }) => {
        url = new URL(request.url)
        cabeceras = request.headers
        return HttpResponse.json({ elements: [], paging: { count: 50, start: 0, links: [] } })
      }),
    )
    expect(await paginasQueAdministra({ token: "tok" })).toEqual([])
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: "roleAssignee",
      role: "ADMINISTRATOR",
      state: "APPROVED",
      count: "50",
    })
    expect(cabeceras.get("linkedin-version")).toBe("202610")
    expect(cabeceras.get("x-restli-protocol-version")).toBe("2.0.0")
    expect(cabeceras.get("authorization")).toBe("Bearer tok")
  })

  test("reads organization or organizationTarget, deduplicates and skips rows that are not approved admins", async () => {
    servidor.use(
      http.get(`${API}/rest/organizationAcls`, () =>
        HttpResponse.json({
          elements: [
            { role: "ADMINISTRATOR", state: "APPROVED", organization: "urn:li:organization:1" },
            { role: "ADMINISTRATOR", state: "APPROVED", organizationTarget: "urn:li:organization:2" },
            { role: "ADMINISTRATOR", state: "APPROVED", organization: "urn:li:organization:1" },
            { role: "ANALYST", state: "APPROVED", organization: "urn:li:organization:3" },
            { role: "ADMINISTRATOR", state: "REQUESTED", organization: "urn:li:organization:4" },
            { role: "ADMINISTRATOR", state: "APPROVED", organization: "urn:li:organizationBrand:5" },
            { role: "ADMINISTRATOR", state: "APPROVED" },
          ],
        }),
      ),
    )
    expect(await paginasQueAdministra({ token: "tok" })).toEqual(["urn:li:organization:1", "urn:li:organization:2"])
  })

  test("a 401 means the token expired", async () => {
    servidor.use(http.get(`${API}/rest/organizationAcls`, () => HttpResponse.text("expired", { status: 401 })))
    await expect(paginasQueAdministra({ token: "tok" })).rejects.toBeInstanceOf(TokenDeLinkedinVencido)
  })

  test("an answer without elements is unexpected", async () => {
    servidor.use(http.get(`${API}/rest/organizationAcls`, () => HttpResponse.json({ nada: true })))
    await expect(paginasQueAdministra({ token: "tok" })).rejects.toThrow("organizationAcls")
  })
})

describe("nombreDePagina", () => {
  test("looks the organization up by id and returns its localized name", async () => {
    let version: string | null = null
    servidor.use(
      http.get(`${API}/rest/organizations/123`, ({ request }) => {
        version = request.headers.get("linkedin-version")
        return HttpResponse.json({ id: 123, localizedName: "WAV", vanityName: "wav" })
      }),
    )
    expect(await nombreDePagina({ token: "tok", organizacion: "urn:li:organization:123" })).toBe("WAV")
    expect(version).toBe("202610")
  })

  test("a URN that is not an organization never reaches LinkedIn", async () => {
    await expect(nombreDePagina({ token: "tok", organizacion: "urn:li:person:abc" })).rejects.toThrow(
      "urn:li:organization",
    )
  })

  test("a 403 (not an admin of that page) is a definitive refusal", async () => {
    servidor.use(http.get(`${API}/rest/organizations/123`, () => HttpResponse.text("no", { status: 403 })))
    await expect(nombreDePagina({ token: "tok", organizacion: "urn:li:organization:123" })).rejects.toBeInstanceOf(
      RechazoDeLinkedin,
    )
  })
})
