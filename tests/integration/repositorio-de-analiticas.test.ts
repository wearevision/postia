import { beforeEach, describe, expect, test, vi } from "vitest"
import { LecturaDeLinkedinFallida, MENSAJE_LIMITE } from "@/lib/linkedin/analiticas"
import { barrerAnaliticas } from "@/lib/mantenimiento/limpieza"
import { programarLecturasDeAnaliticas, repositorioDeAnaliticas } from "@/lib/rendimiento/repositorio-de-analiticas"
import { ARRIENDO_S, leerAnaliticas, type PuertosDeAnaliticas } from "@/lib/rendimiento/sincronizar"
import {
  admin,
  cerrarLecturasDeAnaliticasAbiertas,
  conectarAnaliticasDelPerfil,
  cuentaDe,
  enDias,
  marcaConDueno,
  personaConSesion,
  publicadaConUrn,
  vencerConexion,
} from "./entorno"

const urnNueva = () => `urn:li:share:${Date.now()}${Math.floor(Math.random() * 1e6)}`
const ORGANIZACION = "urn:li:organization:2414183"

async function duenoCon(tipo: "persona" | "empresa") {
  const dueno = await personaConSesion(`repo-analiticas-${tipo}`)
  const marca = await marcaConDueno(dueno.userId, tipo === "empresa" ? "nosotros" : "yo")
  return { ...dueno, marca, cuenta: await cuentaDe(marca, tipo, "api") }
}

/** The owner's «Estudio WAV» connection, with r_member_postAnalytics, reads the profile. */
async function conPerfilConectado() {
  const dueno = await duenoCon("persona")
  const conexion = await conectarAnaliticasDelPerfil(dueno.db, dueno.cuenta, { token: "token-del-perfil" })
  return { ...dueno, conexion }
}

async function conPaginaConectada() {
  const dueno = await duenoCon("empresa")
  const conexion = await dueno.db.rpc("conectar_linkedin", {
    p_cuenta: dueno.cuenta,
    p_token: "token-de-la-pagina",
    p_titular: `urn:li:person:adm${crypto.randomUUID().slice(0, 8)}`,
    p_nombre: "",
    p_scopes: ["r_basicprofile", "rw_organization_admin", "w_organization_social"],
    p_expira_en: enDias(60),
    p_app: "estudio_wav",
    p_organizacion: ORGANIZACION,
  })
  expect(conexion.error).toBeNull()
  return dueno
}

const sinLinkedin: PuertosDeAnaliticas["linkedin"] = {
  cifrasDeLaPagina: async () => {
    throw new Error("no debería llamarse")
  },
  seguidoresDeLaPagina: async () => {
    throw new Error("no debería llamarse")
  },
  cifrasDeUnPostDelPerfil: async () => {
    throw new Error("no debería llamarse")
  },
}

beforeEach(cerrarLecturasDeAnaliticasAbiertas)

describe("repositorioDeAnaliticas", () => {
  test("reads a profile's credential and a page's credential with its organization", async () => {
    const repo = repositorioDeAnaliticas(admin())
    const perfil = await conPerfilConectado()
    expect(await repo.credencial(perfil.cuenta, "persona")).toMatchObject({
      token: "token-del-perfil",
      organizacion: null,
    })
    const pagina = await conPaginaConectada()
    expect(await repo.credencial(pagina.cuenta, "empresa")).toMatchObject({
      token: "token-de-la-pagina",
      organizacion: ORGANIZACION,
    })
    expect(await repo.credencial((await duenoCon("persona")).cuenta, "persona")).toBeNull()
  })

  test("lists the posts PostIA sent in the last 12 months, newest first, and nothing else", async () => {
    const { db, cuenta } = await duenoCon("persona")
    const viejo = urnNueva()
    const nuevo = urnNueva()
    const muyViejo = urnNueva()
    await publicadaConUrn(db, cuenta, viejo)
    await publicadaConUrn(db, cuenta, nuevo)
    await publicadaConUrn(db, cuenta, muyViejo)
    const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString()
    for (const [urn, dias] of [
      [viejo, 30],
      [muyViejo, 400],
    ] as const) {
      expect(
        (
          await admin()
            .from("publicaciones")
            .update({ enviado_en: hace(dias) })
            .eq("post_urn", urn)
        ).error,
      ).toBeNull()
    }
    const otra = await duenoCon("persona")
    await publicadaConUrn(otra.db, otra.cuenta, urnNueva())

    expect(await repositorioDeAnaliticas(admin()).postsDePostia(cuenta)).toEqual([nuevo, viejo])
  })

  test("a queued profile reading is read, stored as origin api and closed with a summary", async () => {
    const { db, cuenta } = await conPerfilConectado()
    const urn = urnNueva()
    const pieza = await publicadaConUrn(db, cuenta, urn)
    expect((await db.rpc("pedir_lectura_de_analiticas", { p_cuenta: cuenta })).error).toBeNull()

    const resultado = await leerAnaliticas({
      ...repositorioDeAnaliticas(admin()),
      linkedin: { ...sinLinkedin, cifrasDeUnPostDelPerfil: async () => ({ impresiones: 800, interacciones: 21 }) },
      ahora: Date.now,
    })
    expect(resultado).toEqual({ leidas: 1, fallidas: 0 })

    const metricas = await admin().from("metricas_de_publicacion").select("*").eq("cuenta_id", cuenta)
    expect(metricas.data).toHaveLength(1)
    expect(metricas.data?.[0]).toMatchObject({
      post_urn: urn,
      pieza_id: pieza,
      impresiones: 800,
      interacciones: 21,
      clics: null,
      origen: "api",
    })
    const lectura = (await db.from("lecturas_de_analiticas").select("estado, motivo").eq("cuenta_id", cuenta)).data
    expect(lectura).toEqual([{ estado: "lista", motivo: "Leí 1 publicación." }])
  })

  test("a queued page reading stores its shares and followers with the page's token", async () => {
    const { db, cuenta } = await conPaginaConectada()
    const urn = urnNueva()
    await publicadaConUrn(db, cuenta, urn)
    expect((await db.rpc("pedir_lectura_de_analiticas", { p_cuenta: cuenta })).error).toBeNull()
    const token = vi.fn()
    await leerAnaliticas({
      ...repositorioDeAnaliticas(admin()),
      linkedin: {
        ...sinLinkedin,
        cifrasDeLaPagina: async (e) => {
          token(e.token, e.organizacion)
          return e.posts.map((u) => ({ urn: u, impresiones: 300, interacciones: 12, clics: 5 }))
        },
        seguidoresDeLaPagina: async () => [{ dia: "2026-11-05", seguidoresNuevos: 3 }],
      },
      ahora: Date.now,
    })
    expect(token).toHaveBeenCalledWith("token-de-la-pagina", ORGANIZACION)
    const metricas = await admin()
      .from("metricas_de_publicacion")
      .select("post_urn, impresiones, interacciones, clics, origen")
      .eq("cuenta_id", cuenta)
    expect(metricas.data).toEqual([{ post_urn: urn, impresiones: 300, interacciones: 12, clics: 5, origen: "api" }])
    const dias = await admin().from("metricas_diarias").select("dia, seguidores_nuevos, origen").eq("cuenta_id", cuenta)
    expect(dias.data).toEqual([{ dia: "2026-11-05", seguidores_nuevos: 3, origen: "api" }])
  })

  test("the daily limit closes the reading with the notice and leaves nothing half-stored", async () => {
    const { db, cuenta } = await conPerfilConectado()
    await publicadaConUrn(db, cuenta, urnNueva())
    await db.rpc("pedir_lectura_de_analiticas", { p_cuenta: cuenta })
    const resultado = await leerAnaliticas({
      ...repositorioDeAnaliticas(admin()),
      linkedin: {
        ...sinLinkedin,
        cifrasDeUnPostDelPerfil: async () => {
          throw new LecturaDeLinkedinFallida("limite", MENSAJE_LIMITE)
        },
      },
      ahora: Date.now,
    })
    expect(resultado).toEqual({ leidas: 0, fallidas: 1 })
    expect((await admin().from("metricas_de_publicacion").select("id").eq("cuenta_id", cuenta)).data).toEqual([])
    expect((await db.from("lecturas_de_analiticas").select("estado, motivo").eq("cuenta_id", cuenta)).data).toEqual([
      { estado: "fallo", motivo: MENSAJE_LIMITE },
    ])
  })

  test("an expired connection closes the reading asking to reconnect, without calling LinkedIn", async () => {
    const { db, cuenta, conexion } = await conPerfilConectado()
    expect((await db.rpc("pedir_lectura_de_analiticas", { p_cuenta: cuenta })).error).toBeNull()
    await vencerConexion(conexion)
    // The request is already queued; the connection expires before the task takes it.
    const llamada = vi.fn()
    await leerAnaliticas({
      ...repositorioDeAnaliticas(admin()),
      linkedin: { ...sinLinkedin, cifrasDeUnPostDelPerfil: llamada },
      ahora: Date.now,
    })
    expect(llamada).not.toHaveBeenCalled()
    const [fila] = (await db.from("lecturas_de_analiticas").select("estado, motivo").eq("cuenta_id", cuenta)).data ?? []
    expect(fila?.estado).toBe("fallo")
    expect(fila?.motivo).toMatch(/^Reconecta LinkedIn/)
  })
})

describe("programarLecturasDeAnaliticas and barrerAnaliticas", () => {
  test("tomar leases the reading for the task's lease, long enough for its slowest run", async () => {
    const { db, cuenta } = await conPerfilConectado()
    const { data: id } = await db.rpc("pedir_lectura_de_analiticas", { p_cuenta: cuenta })
    const antes = Date.now()
    expect((await repositorioDeAnaliticas(admin()).tomar()).map((l) => l.id)).toEqual([id])
    const { data } = await admin()
      .from("lecturas_de_analiticas")
      .select("arrendado_hasta")
      .eq("id", id as string)
      .single()
    const arriendo = Date.parse(data?.arrendado_hasta ?? "") - antes
    expect(arriendo).toBeGreaterThan((ARRIENDO_S - 10) * 1000)
    expect(arriendo).toBeLessThan((ARRIENDO_S + 10) * 1000)
  })

  test("the daily schedule queues the connected profile once", async () => {
    const { cuenta } = await conPerfilConectado()
    expect(await programarLecturasDeAnaliticas(admin())).toBeGreaterThanOrEqual(1)
    expect((await admin().from("lecturas_de_analiticas").select("id").eq("cuenta_id", cuenta)).data).toHaveLength(1)
    await programarLecturasDeAnaliticas(admin())
    expect((await admin().from("lecturas_de_analiticas").select("id").eq("cuenta_id", cuenta)).data).toHaveLength(1)
  })

  test("the nightly sweep removes a profile's API figures read three days ago", async () => {
    const { db, cuenta } = await conPerfilConectado()
    const urn = urnNueva()
    await publicadaConUrn(db, cuenta, urn)
    await admin().rpc("guardar_metricas_api", {
      p_cuenta: cuenta,
      p_datos: { publicaciones: [{ post_urn: urn, impresiones: 1, interacciones: 1, clics: null }], dias: [] },
    })
    await admin()
      .from("metricas_de_publicacion")
      .update({ leida_en: new Date(Date.now() - 3 * 86_400_000).toISOString() })
      .eq("cuenta_id", cuenta)
    expect(await barrerAnaliticas(admin())).toBeGreaterThanOrEqual(1)
    expect((await admin().from("metricas_de_publicacion").select("id").eq("cuenta_id", cuenta)).data).toEqual([])
  })
})
