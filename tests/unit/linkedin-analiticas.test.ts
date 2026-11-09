import { HttpResponse, http } from "msw"
import { describe, expect, test } from "vitest"
import {
  cifrasDeLaPagina,
  cifrasDeUnPostDelPerfil,
  LecturaDeLinkedinFallida,
  seguidoresDeLaPagina,
} from "@/lib/linkedin/analiticas"
import { servidor } from "../msw"

const API = "https://api.linkedin.com"
const PAGINA = "urn:li:organization:2414183"

// Shapes copied from learn.microsoft.com/linkedin/marketing/community-management (li-lms-2026-10): share statistics for
// specific shares, time-bound follower statistics and member post analytics (metricType a plain string since 202605).
function elementoDePost(share: string, estadisticas: Record<string, number>) {
  return {
    organizationalEntity: PAGINA,
    share,
    totalShareStatistics: { engagement: 0.02, ...estadisticas },
  }
}

describe("cifrasDeLaPagina", () => {
  test("asks for the shares in one Rest.li 2.0 list with the version headers", async () => {
    let url = new URL(API)
    let cabeceras = new Headers()
    servidor.use(
      http.get(`${API}/rest/organizationalEntityShareStatistics`, ({ request }) => {
        url = new URL(request.url)
        cabeceras = request.headers
        return HttpResponse.json({ elements: [], paging: { count: 10, start: 0, links: [] } })
      }),
    )
    await cifrasDeLaPagina({ token: "tok", organizacion: PAGINA, posts: ["urn:li:share:1", "urn:li:share:2"] })
    expect(url.searchParams.get("q")).toBe("organizationalEntity")
    expect(url.searchParams.get("organizationalEntity")).toBe(PAGINA)
    expect(url.searchParams.get("shares")).toBe("List(urn:li:share:1,urn:li:share:2)")
    expect(url.search).toContain("shares=List(urn%3Ali%3Ashare%3A1,urn%3Ali%3Ashare%3A2)")
    expect(url.searchParams.has("timeIntervals")).toBe(false)
    expect(cabeceras.get("linkedin-version")).toBe("202610")
    expect(cabeceras.get("x-restli-protocol-version")).toBe("2.0.0")
    expect(cabeceras.get("authorization")).toBe("Bearer tok")
  })

  test("adds likes, comments and reposts as interactions, keeps clicks and impressions", async () => {
    servidor.use(
      http.get(`${API}/rest/organizationalEntityShareStatistics`, () =>
        HttpResponse.json({
          elements: [
            elementoDePost("urn:li:share:1000000", {
              clickCount: 78,
              commentCount: 24,
              impressionCount: 5287,
              likeCount: 14,
              shareCount: 5,
            }),
          ],
          paging: { count: 10, start: 0, links: [] },
        }),
      ),
    )
    expect(await cifrasDeLaPagina({ token: "t", organizacion: PAGINA, posts: ["urn:li:share:1000000"] })).toEqual([
      { urn: "urn:li:share:1000000", impresiones: 5287, interacciones: 43, clics: 78 },
    ])
  })

  test("a share the answer leaves out has no activity: zeros, as the docs say", async () => {
    servidor.use(
      http.get(`${API}/rest/organizationalEntityShareStatistics`, () =>
        HttpResponse.json({
          elements: [elementoDePost("urn:li:share:1", { impressionCount: 9, clickCount: 1 })],
          paging: { count: 10, start: 0, links: [] },
        }),
      ),
    )
    expect(
      await cifrasDeLaPagina({ token: "t", organizacion: PAGINA, posts: ["urn:li:share:1", "urn:li:share:2"] }),
    ).toEqual([
      { urn: "urn:li:share:1", impresiones: 9, interacciones: 0, clics: 1 },
      { urn: "urn:li:share:2", impresiones: 0, interacciones: 0, clics: 0 },
    ])
  })

  test("a like count turned negative by a sponsored unlike never makes a negative figure", async () => {
    servidor.use(
      http.get(`${API}/rest/organizationalEntityShareStatistics`, () =>
        HttpResponse.json({
          elements: [elementoDePost("urn:li:share:1", { likeCount: -2, commentCount: 1, impressionCount: 4 })],
        }),
      ),
    )
    const [cifras] = await cifrasDeLaPagina({ token: "t", organizacion: PAGINA, posts: ["urn:li:share:1"] })
    expect(cifras?.interacciones).toBe(0)
  })

  test("sends the shares in batches of 20", async () => {
    const lotes: string[] = []
    servidor.use(
      http.get(`${API}/rest/organizationalEntityShareStatistics`, ({ request }) => {
        lotes.push(new URL(request.url).searchParams.get("shares") ?? "")
        return HttpResponse.json({ elements: [] })
      }),
    )
    const shares = Array.from({ length: 45 }, (_, i) => `urn:li:share:${i + 1}`)
    const cifras = await cifrasDeLaPagina({ token: "t", organizacion: PAGINA, posts: shares })
    expect(lotes).toHaveLength(3)
    expect(lotes[0]?.split(",")).toHaveLength(20)
    expect(cifras).toHaveLength(45)
  })

  test("asks for ugcPost URNs in their own ugcPosts list and reads them by the ugcPost key of the answer", async () => {
    const consultas: URLSearchParams[] = []
    servidor.use(
      http.get(`${API}/rest/organizationalEntityShareStatistics`, ({ request }) => {
        const consulta = new URL(request.url).searchParams
        consultas.push(consulta)
        if (!consulta.has("ugcPosts")) return HttpResponse.json({ elements: [] })
        // Shape of «Retrieve Statistics for Specific UGC Posts» (li-lms-2026-10).
        return HttpResponse.json({
          elements: [
            {
              organizationalEntity: PAGINA,
              ugcPost: "urn:li:ugcPost:1000000",
              totalShareStatistics: {
                clickCount: 78,
                commentCount: 24,
                engagement: 0.022886324947985624,
                impressionCount: 5287,
                likeCount: 14,
                shareCount: 5,
              },
            },
          ],
          paging: { count: 10, links: [], start: 0 },
        })
      }),
    )
    const cifras = await cifrasDeLaPagina({
      token: "t",
      organizacion: PAGINA,
      posts: ["urn:li:share:1", "urn:li:ugcPost:1000000", "urn:li:ugcPost:1000001"],
    })
    expect(consultas).toHaveLength(2)
    expect(consultas[0]?.get("shares")).toBe("List(urn:li:share:1)")
    expect(consultas[0]?.has("ugcPosts")).toBe(false)
    expect(consultas[1]?.get("ugcPosts")).toBe("List(urn:li:ugcPost:1000000,urn:li:ugcPost:1000001)")
    expect(consultas[1]?.has("shares")).toBe(false)
    expect(cifras).toEqual([
      { urn: "urn:li:share:1", impresiones: 0, interacciones: 0, clics: 0 },
      { urn: "urn:li:ugcPost:1000000", impresiones: 5287, interacciones: 43, clics: 78 },
      { urn: "urn:li:ugcPost:1000001", impresiones: 0, interacciones: 0, clics: 0 },
    ])
  })

  test("does not call LinkedIn without shares", async () => {
    expect(await cifrasDeLaPagina({ token: "t", organizacion: PAGINA, posts: [] })).toEqual([])
  })

  test("refuses a URN that is not a post", async () => {
    await expect(cifrasDeLaPagina({ token: "t", organizacion: PAGINA, posts: ["urn:li:person:1"] })).rejects.toThrow(
      /post/,
    )
  })

  test("refuses an organization that is not a urn:li:organization", async () => {
    await expect(
      cifrasDeLaPagina({ token: "t", organizacion: "urn:li:person:1", posts: ["urn:li:share:1"] }),
    ).rejects.toThrow(/organization/)
  })
})

describe("seguidoresDeLaPagina", () => {
  test("asks for DAY follower gains in a Rest.li 2.0 timeIntervals", async () => {
    let url = new URL(API)
    servidor.use(
      http.get(`${API}/rest/organizationalEntityFollowerStatistics`, ({ request }) => {
        url = new URL(request.url)
        return HttpResponse.json({ elements: [] })
      }),
    )
    await seguidoresDeLaPagina({ token: "t", organizacion: PAGINA, desde: 1536364800000, hasta: 1536796800000 })
    expect(url.searchParams.get("q")).toBe("organizationalEntity")
    expect(url.searchParams.get("organizationalEntity")).toBe(PAGINA)
    expect(url.searchParams.get("timeIntervals")).toBe(
      "(timeRange:(start:1536364800000,end:1536796800000),timeGranularityType:DAY)",
    )
  })

  test("sums organic and paid gains per UTC day", async () => {
    servidor.use(
      http.get(`${API}/rest/organizationalEntityFollowerStatistics`, () =>
        HttpResponse.json({
          paging: { count: 10, start: 0 },
          elements: [
            {
              timeRange: { start: 1536364800000, end: 1536451200000 },
              followerGains: { organicFollowerGain: 223, paidFollowerGain: 12 },
              organizationalEntity: PAGINA,
            },
            {
              timeRange: { start: 1536451200000, end: 1536537600000 },
              followerGains: { organicFollowerGain: 1, paidFollowerGain: 2 },
              organizationalEntity: PAGINA,
            },
          ],
        }),
      ),
    )
    expect(
      await seguidoresDeLaPagina({ token: "t", organizacion: PAGINA, desde: 1536364800000, hasta: 1536537600000 }),
    ).toEqual([
      { dia: "2018-09-08", seguidoresNuevos: 235 },
      { dia: "2018-09-09", seguidoresNuevos: 3 },
    ])
  })

  test("a negative net gain is stored as zero", async () => {
    servidor.use(
      http.get(`${API}/rest/organizationalEntityFollowerStatistics`, () =>
        HttpResponse.json({
          elements: [
            {
              timeRange: { start: 1536364800000, end: 1536451200000 },
              followerGains: { organicFollowerGain: -3, paidFollowerGain: 0 },
              organizationalEntity: PAGINA,
            },
          ],
        }),
      ),
    )
    expect(
      await seguidoresDeLaPagina({ token: "t", organizacion: PAGINA, desde: 1536364800000, hasta: 1536451200000 }),
    ).toEqual([{ dia: "2018-09-08", seguidoresNuevos: 0 }])
  })
})

describe("cifrasDeUnPostDelPerfil", () => {
  function respuestaDe(porMetrica: Record<string, number | null>) {
    return ({ request }: { request: Request }) => {
      const consulta = new URL(request.url).searchParams.get("queryType") ?? ""
      const cuenta = porMetrica[consulta]
      return HttpResponse.json({
        elements: cuenta === null || cuenta === undefined ? [] : [{ count: cuenta, metricType: consulta }],
        paging: { count: 10, start: 0, links: [] },
      })
    }
  }

  test("asks for the four metrics with TOTAL aggregation and the share encoding of the docs", async () => {
    const urls: URL[] = []
    servidor.use(
      http.get(`${API}/rest/memberCreatorPostAnalytics`, ({ request }) => {
        urls.push(new URL(request.url))
        return HttpResponse.json({ elements: [] })
      }),
    )
    await cifrasDeUnPostDelPerfil({ token: "tok", urn: "urn:li:share:7325786486870552578" })
    expect(urls.map((u) => u.searchParams.get("queryType"))).toEqual(["IMPRESSION", "REACTION", "COMMENT", "RESHARE"])
    for (const url of urls) {
      expect(url.searchParams.get("q")).toBe("entity")
      expect(url.searchParams.get("aggregation")).toBe("TOTAL")
      expect(url.searchParams.get("entity")).toBe("(share:urn:li:share:7325786486870552578)")
      expect(url.search).toContain("entity=(share:urn%3Ali%3Ashare%3A7325786486870552578)")
    }
  })

  test("a ugcPost is encoded as (ugc:...)", async () => {
    let entidad = ""
    servidor.use(
      http.get(`${API}/rest/memberCreatorPostAnalytics`, ({ request }) => {
        entidad = new URL(request.url).search
        return HttpResponse.json({ elements: [] })
      }),
    )
    await cifrasDeUnPostDelPerfil({ token: "t", urn: "urn:li:ugcPost:7325786486870552578" })
    expect(entidad).toContain("entity=(ugc:urn%3Ali%3AugcPost%3A7325786486870552578)")
  })

  test("reads the string metricType (202605+) and adds reactions, comments and reposts", async () => {
    servidor.use(
      http.get(
        `${API}/rest/memberCreatorPostAnalytics`,
        respuestaDe({ IMPRESSION: 1200, REACTION: 30, COMMENT: 4, RESHARE: 2 }),
      ),
    )
    expect(await cifrasDeUnPostDelPerfil({ token: "t", urn: "urn:li:share:1" })).toEqual({
      impresiones: 1200,
      interacciones: 36,
    })
  })

  test("also reads the wrapped metricType of earlier versions", async () => {
    servidor.use(
      http.get(`${API}/rest/memberCreatorPostAnalytics`, ({ request }) => {
        const consulta = new URL(request.url).searchParams.get("queryType") ?? ""
        return HttpResponse.json({
          elements: [
            {
              count: 5,
              metricType: {
                "com.linkedin.adsexternalapi.memberanalytics.v1.CreatorPostAnalyticsMetricTypeV1": consulta,
              },
              targetEntity: { share: "urn:li:share:1" },
            },
          ],
        })
      }),
    )
    expect(await cifrasDeUnPostDelPerfil({ token: "t", urn: "urn:li:share:1" })).toEqual({
      impresiones: 5,
      interacciones: 15,
    })
  })

  test("a metric LinkedIn leaves out counts as zero", async () => {
    servidor.use(http.get(`${API}/rest/memberCreatorPostAnalytics`, respuestaDe({ IMPRESSION: 10, REACTION: null })))
    expect(await cifrasDeUnPostDelPerfil({ token: "t", urn: "urn:li:share:1" })).toEqual({
      impresiones: 10,
      interacciones: 0,
    })
  })
})

describe("errors", () => {
  test("401 and 403 ask to reconnect LinkedIn, in Spanish and without the token", async () => {
    for (const estado of [401, 403]) {
      servidor.use(
        http.get(`${API}/rest/organizationalEntityShareStatistics`, () =>
          HttpResponse.json({ message: "Not enough permissions tok-secreto" }, { status: estado }),
        ),
      )
      const error = await cifrasDeLaPagina({
        token: "tok-secreto",
        organizacion: PAGINA,
        posts: ["urn:li:share:1"],
      }).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(LecturaDeLinkedinFallida)
      expect((error as LecturaDeLinkedinFallida).motivo).toBe("reconectar")
      expect((error as Error).message).toMatch(/^Reconecta LinkedIn/)
      expect((error as Error).message).not.toContain("tok-secreto")
    }
  })

  test("429 says LinkedIn limited the calls for today", async () => {
    servidor.use(http.get(`${API}/rest/memberCreatorPostAnalytics`, () => new HttpResponse("rate", { status: 429 })))
    const error = await cifrasDeUnPostDelPerfil({ token: "t", urn: "urn:li:share:1" }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(LecturaDeLinkedinFallida)
    expect((error as LecturaDeLinkedinFallida).motivo).toBe("limite")
    expect((error as Error).message).toBe("LinkedIn limitó las llamadas por hoy. Inténtalo mañana.")
  })

  test("a 500 is not an authorization problem: it stays a plain error", async () => {
    servidor.use(http.get(`${API}/rest/memberCreatorPostAnalytics`, () => new HttpResponse("boom", { status: 500 })))
    const error = await cifrasDeUnPostDelPerfil({ token: "t", urn: "urn:li:share:1" }).catch((e: unknown) => e)
    expect(error).not.toBeInstanceOf(LecturaDeLinkedinFallida)
    expect(error).toBeInstanceOf(Error)
  })

  test("an answer without the documented shape is an error, not zeros", async () => {
    servidor.use(http.get(`${API}/rest/memberCreatorPostAnalytics`, () => HttpResponse.json({ nada: true })))
    await expect(cifrasDeUnPostDelPerfil({ token: "t", urn: "urn:li:share:1" })).rejects.toThrow(/inesperada/)
  })
})
