import { HttpResponse, http } from "msw"
import { describe, expect, test } from "vitest"
import {
  crearPost,
  estadoDelDocumento,
  RechazoDeLinkedin,
  RespuestaDudosa,
  subirDocumento,
  TokenDeLinkedinVencido,
} from "@/lib/linkedin/api"
import { servidor } from "../msw"

const API = "https://api.linkedin.com"
const AUTOR = "urn:li:person:abc"

describe("crearPost", () => {
  test("a text post has no content, carries the version headers and returns the URN", async () => {
    let cuerpo: Record<string, unknown> = {}
    let version: string | null = null
    servidor.use(
      http.post(`${API}/rest/posts`, async ({ request }) => {
        cuerpo = (await request.json()) as Record<string, unknown>
        version = request.headers.get("linkedin-version")
        return new HttpResponse(null, { status: 201, headers: { "x-restli-id": "urn:li:share:7001" } })
      }),
    )
    const urn = await crearPost({ token: "t", autor: AUTOR, commentary: "Hola", visibilidad: "CONNECTIONS" })
    expect(urn).toBe("urn:li:share:7001")
    expect(version).toBe("202610")
    expect(cuerpo).toMatchObject({
      author: AUTOR,
      commentary: "Hola",
      visibility: "CONNECTIONS",
      lifecycleState: "PUBLISHED",
    })
    expect(cuerpo).not.toHaveProperty("content")
  })

  test("a carousel post points at the document with its title", async () => {
    let cuerpo: Record<string, unknown> = {}
    servidor.use(
      http.post(`${API}/rest/posts`, async ({ request }) => {
        cuerpo = (await request.json()) as Record<string, unknown>
        return new HttpResponse(null, { status: 201, headers: { "x-restli-id": "urn:li:share:7002" } })
      }),
    )
    await crearPost({
      token: "t",
      autor: AUTOR,
      commentary: "x",
      visibilidad: "PUBLIC",
      documento: "urn:li:document:D1",
      titulo: "Tres lecciones",
    })
    expect(cuerpo.content).toEqual({ media: { id: "urn:li:document:D1", title: "Tres lecciones" } })
  })

  test("a 201 without a post id is doubtful: never send it again", async () => {
    servidor.use(http.post(`${API}/rest/posts`, () => new HttpResponse(null, { status: 201 })))
    await expect(
      crearPost({ token: "t", autor: AUTOR, commentary: "x", visibilidad: "PUBLIC" }),
    ).rejects.toBeInstanceOf(RespuestaDudosa)
  })

  test("401 means the connection expired; another 4xx is a definitive refusal without the token in the message", async () => {
    servidor.use(http.post(`${API}/rest/posts`, () => HttpResponse.text("expired", { status: 401 })))
    await expect(
      crearPost({ token: "t", autor: AUTOR, commentary: "x", visibilidad: "PUBLIC" }),
    ).rejects.toBeInstanceOf(TokenDeLinkedinVencido)
    servidor.use(http.post(`${API}/rest/posts`, () => HttpResponse.text("nope token-largo", { status: 422 })))
    const error = await crearPost({ token: "token-largo", autor: AUTOR, commentary: "x", visibilidad: "PUBLIC" }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(RechazoDeLinkedin)
    expect(String(error)).not.toContain("token-largo")
  })
})

describe("documents", () => {
  test("initializes the upload for the member and PUTs the whole file with the token", async () => {
    let autorizacion: string | null = null
    let bytes = 0
    servidor.use(
      http.post(`${API}/rest/documents`, () =>
        HttpResponse.json({
          value: { uploadUrl: "https://www.linkedin.com/dms-uploads/D1/0", document: "urn:li:document:D1" },
        }),
      ),
      http.put("https://www.linkedin.com/dms-uploads/D1/0", async ({ request }) => {
        autorizacion = request.headers.get("authorization")
        bytes = (await request.arrayBuffer()).byteLength
        return new HttpResponse(null, { status: 201 })
      }),
    )
    expect(await subirDocumento({ token: "t", autor: AUTOR, datos: new Uint8Array(10) })).toBe("urn:li:document:D1")
    expect(autorizacion).toBe("Bearer t")
    expect(bytes).toBe(10)
  })

  test("refuses an upload address that is not LinkedIn's", async () => {
    servidor.use(
      http.post(`${API}/rest/documents`, () =>
        HttpResponse.json({ value: { uploadUrl: "https://evil.example/u", document: "urn:li:document:D1" } }),
      ),
    )
    await expect(subirDocumento({ token: "t", autor: AUTOR, datos: new Uint8Array(1) })).rejects.toBeInstanceOf(
      RechazoDeLinkedin,
    )
  })

  test("reads AVAILABLE as ready and PROCESSING_FAILED as failed", async () => {
    servidor.use(http.get(`${API}/rest/documents/:urn`, () => HttpResponse.json({ status: "AVAILABLE" })))
    expect(await estadoDelDocumento({ token: "t", documento: "urn:li:document:D1" })).toBe("listo")
    servidor.use(http.get(`${API}/rest/documents/:urn`, () => HttpResponse.json({ status: "PROCESSING_FAILED" })))
    expect(await estadoDelDocumento({ token: "t", documento: "urn:li:document:D1" })).toBe("fallido")
  })
})
