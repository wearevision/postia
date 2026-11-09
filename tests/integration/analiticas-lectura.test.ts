import { beforeEach, describe, expect, test } from "vitest"
import {
  admin,
  cerrarLecturasDeAnaliticasAbiertas,
  cuentaDe,
  enDias,
  marcaConDueno,
  personaConSesion,
  publicadaConUrn,
} from "./entorno"

type Persona = Awaited<ReturnType<typeof personaConSesion>>

const urnNueva = () => `urn:li:share:${Date.now()}${Math.floor(Math.random() * 1e6)}`

async function duenoCon(tipo: "persona" | "empresa") {
  const dueno = await personaConSesion(`lectura-${tipo}`)
  const marca = await marcaConDueno(dueno.userId, tipo === "empresa" ? "nosotros" : "yo")
  return { ...dueno, marca, cuenta: await cuentaDe(marca, tipo, "api") }
}

function conectarPerfil(db: Persona["db"], cuenta: string, expira = enDias(60)) {
  return db.rpc("conectar_analiticas", {
    p_cuenta: cuenta,
    p_token: "token-de-analiticas",
    p_scopes: ["r_member_postAnalytics"],
    p_expira_en: expira,
  })
}

/** A page account links to its publishing connection (the one that carries rw_organization_admin). */
async function conectarPagina(userId: string, cuenta: string, expira = enDias(60)) {
  const { data, error } = await admin()
    .from("conexiones")
    .insert({
      red: "linkedin",
      app: "estudio_wav",
      titular: `urn:li:person:${crypto.randomUUID().replaceAll("-", "")}`,
      organizacion: `urn:li:organization:${Math.floor(Math.random() * 1e9)}`,
      scopes: ["w_organization_social", "rw_organization_admin"],
      expira_en: expira,
      conectada_por: userId,
    })
    .select("id")
    .single()
  if (error) throw error
  const enlazada = await admin().from("cuentas").update({ conexion_id: data.id }).eq("id", cuenta)
  if (enlazada.error) throw enlazada.error
}

const lecturasDe = async (cuenta: string) =>
  (await admin().from("lecturas_de_analiticas").select("*").eq("cuenta_id", cuenta).order("creada_en")).data ?? []

beforeEach(cerrarLecturasDeAnaliticasAbiertas)

describe("pedir_lectura_de_analiticas", () => {
  test("an owner queues a reading for a connected profile and a second tap is refused while it is open", async () => {
    const { db, userId, cuenta } = await duenoCon("persona")
    await conectarPerfil(db, cuenta)
    const primera = await db.rpc("pedir_lectura_de_analiticas", { p_cuenta: cuenta })
    expect(primera.error).toBeNull()
    const [fila] = await lecturasDe(cuenta)
    expect(fila).toMatchObject({ id: primera.data, estado: "pendiente", pedida_por: userId })
    const segunda = await db.rpc("pedir_lectura_de_analiticas", { p_cuenta: cuenta })
    expect(segunda.error?.message).toBe("lectura_en_curso")
  })

  test("a connected page can be read through its publishing connection", async () => {
    const { db, userId, cuenta } = await duenoCon("empresa")
    await conectarPagina(userId, cuenta)
    expect((await db.rpc("pedir_lectura_de_analiticas", { p_cuenta: cuenta })).error).toBeNull()
  })

  test("a profile without analytics, an expired one, and a page without connection are refused", async () => {
    const perfil = await duenoCon("persona")
    expect((await perfil.db.rpc("pedir_lectura_de_analiticas", { p_cuenta: perfil.cuenta })).error?.message).toBe(
      "analiticas_sin_conexion",
    )
    await conectarPerfil(perfil.db, perfil.cuenta)
    const vencida = await admin()
      .from("conexiones_de_analiticas")
      .update({ expira_en: new Date(Date.now() - 1000).toISOString() })
      .eq("cuenta_id", perfil.cuenta)
    expect(vencida.error).toBeNull()
    expect((await perfil.db.rpc("pedir_lectura_de_analiticas", { p_cuenta: perfil.cuenta })).error?.message).toBe(
      "analiticas_sin_conexion",
    )
    const pagina = await duenoCon("empresa")
    expect((await pagina.db.rpc("pedir_lectura_de_analiticas", { p_cuenta: pagina.cuenta })).error?.message).toBe(
      "analiticas_sin_conexion",
    )
  })

  test("only the owner of the brand can ask, and only the owner reads the readings", async () => {
    const { db, cuenta } = await duenoCon("persona")
    await conectarPerfil(db, cuenta)
    const ajena = await personaConSesion("lectura-ajena")
    expect((await ajena.db.rpc("pedir_lectura_de_analiticas", { p_cuenta: cuenta })).error?.message).toBe(
      "solo_el_dueno_pide_lecturas",
    )
    await db.rpc("pedir_lectura_de_analiticas", { p_cuenta: cuenta })
    expect((await db.from("lecturas_de_analiticas").select("id")).data).toHaveLength(1)
    expect((await ajena.db.from("lecturas_de_analiticas").select("id")).data).toEqual([])
    expect((await db.from("lecturas_de_analiticas").insert({ cuenta_id: cuenta })).error).not.toBeNull()
  })

  test("a profile gets two readings a UTC day: the third tap is refused, a page is not capped", async () => {
    const perfil = await duenoCon("persona")
    await conectarPerfil(perfil.db, perfil.cuenta)
    for (let i = 0; i < 2; i++) {
      expect((await perfil.db.rpc("pedir_lectura_de_analiticas", { p_cuenta: perfil.cuenta })).error).toBeNull()
      await cerrarLecturasDeAnaliticasAbiertas()
    }
    const tercera = await perfil.db.rpc("pedir_lectura_de_analiticas", { p_cuenta: perfil.cuenta })
    expect(tercera.error?.message).toBe("lecturas_del_dia_agotadas")
    expect(tercera.error?.code).toBe("55000")

    const pagina = await duenoCon("empresa")
    await conectarPagina(pagina.userId, pagina.cuenta)
    for (let i = 0; i < 3; i++) {
      expect((await pagina.db.rpc("pedir_lectura_de_analiticas", { p_cuenta: pagina.cuenta })).error).toBeNull()
      await cerrarLecturasDeAnaliticasAbiertas()
    }
  })

  test("readings from before today's UTC midnight do not count against the profile's two", async () => {
    const { db, cuenta } = await duenoCon("persona")
    await conectarPerfil(db, cuenta)
    const medianoche = new Date()
    medianoche.setUTCHours(0, 0, 0, 0)
    const ayer = new Date(medianoche.getTime() - 1000).toISOString()
    const viejas = await admin()
      .from("lecturas_de_analiticas")
      .insert([
        { cuenta_id: cuenta, estado: "lista", creada_en: ayer },
        { cuenta_id: cuenta, estado: "fallo", creada_en: ayer },
      ])
    expect(viejas.error).toBeNull()
    expect((await db.rpc("pedir_lectura_de_analiticas", { p_cuenta: cuenta })).error).toBeNull()
  })
})

describe("the queue", () => {
  test("the daily schedule queues connected accounts only, once", async () => {
    const perfil = await duenoCon("persona")
    await conectarPerfil(perfil.db, perfil.cuenta)
    const sinConexion = await duenoCon("persona")
    const pagina = await duenoCon("empresa")
    await conectarPagina(pagina.userId, pagina.cuenta)

    expect((await admin().rpc("programar_lecturas_de_analiticas")).error).toBeNull()
    expect(await lecturasDe(perfil.cuenta)).toHaveLength(1)
    expect(await lecturasDe(pagina.cuenta)).toHaveLength(1)
    expect(await lecturasDe(sinConexion.cuenta)).toHaveLength(0)
    expect((await lecturasDe(perfil.cuenta))[0]?.pedida_por).toBeNull()

    await admin().rpc("programar_lecturas_de_analiticas")
    expect(await lecturasDe(perfil.cuenta)).toHaveLength(1)
  })

  test("the daily schedule skips a profile that already had its two readings today, never a page", async () => {
    const perfil = await duenoCon("persona")
    await conectarPerfil(perfil.db, perfil.cuenta)
    const pagina = await duenoCon("empresa")
    await conectarPagina(pagina.userId, pagina.cuenta)
    const hechas = (cuenta: string) => [
      { cuenta_id: cuenta, estado: "lista" },
      { cuenta_id: cuenta, estado: "lista" },
    ]
    expect(
      (
        await admin()
          .from("lecturas_de_analiticas")
          .insert([...hechas(perfil.cuenta), ...hechas(pagina.cuenta)])
      ).error,
    ).toBeNull()

    await admin().rpc("programar_lecturas_de_analiticas")

    expect((await lecturasDe(perfil.cuenta)).filter((l) => l.estado === "pendiente")).toHaveLength(0)
    expect((await lecturasDe(pagina.cuenta)).filter((l) => l.estado === "pendiente")).toHaveLength(1)
  })

  test("tomar leases the oldest reading, terminar closes it, and a closed one is not taken again", async () => {
    const { db, cuenta } = await duenoCon("persona")
    await conectarPerfil(db, cuenta)
    const { data: id } = await db.rpc("pedir_lectura_de_analiticas", { p_cuenta: cuenta })

    const antes = Date.now()
    const tomadas = await admin().rpc("tomar_lecturas_de_analiticas", { p_arriendo_segundos: 1500 })
    expect(tomadas.data?.map((l) => l.id)).toEqual([id])
    expect(tomadas.data?.[0]?.estado).toBe("trabajando")
    const arriendo = Date.parse(tomadas.data?.[0]?.arrendado_hasta ?? "") - antes
    expect(arriendo).toBeGreaterThan(1490_000)
    expect(arriendo).toBeLessThan(1510_000)
    expect((await admin().rpc("tomar_lecturas_de_analiticas", { p_arriendo_segundos: 1500 })).data).toEqual([])

    const motivo = "Leí 2 publicaciones."
    expect(
      (await admin().rpc("terminar_lectura_de_analiticas", { p_id: id as string, p_estado: "lista", p_motivo: motivo }))
        .error,
    ).toBeNull()
    const [fila] = await lecturasDe(cuenta)
    expect(fila).toMatchObject({ estado: "lista", motivo, arrendado_hasta: null })
    expect(fila?.terminada_en).not.toBeNull()
    expect((await admin().rpc("tomar_lecturas_de_analiticas", { p_arriendo_segundos: 1500 })).data).toEqual([])
    // A new tap is possible again once the reading is closed.
    expect((await db.rpc("pedir_lectura_de_analiticas", { p_cuenta: cuenta })).error).toBeNull()
  })

  test("a lease nobody closed is taken again after it expires, and a wrong state is refused", async () => {
    const { db, cuenta } = await duenoCon("persona")
    await conectarPerfil(db, cuenta)
    const { data: id } = await db.rpc("pedir_lectura_de_analiticas", { p_cuenta: cuenta })
    await admin().rpc("tomar_lecturas_de_analiticas", { p_arriendo_segundos: 1500 })
    await admin()
      .from("lecturas_de_analiticas")
      .update({ arrendado_hasta: new Date(Date.now() - 1000).toISOString() })
      .eq("id", id as string)
    expect(
      (await admin().rpc("tomar_lecturas_de_analiticas", { p_arriendo_segundos: 1500 })).data?.map((l) => l.id),
    ).toEqual([id])
    const corto = await admin().rpc("tomar_lecturas_de_analiticas", { p_arriendo_segundos: 10 })
    expect(corto.error?.message).toBe("arriendo_invalido")
    const mala = await admin().rpc("terminar_lectura_de_analiticas", { p_id: id as string, p_estado: "pendiente" })
    expect(mala.error?.message).toBe("estado_de_lectura_invalido")
  })

  test("the service-only functions are closed to a signed-in person", async () => {
    const { db, cuenta } = await duenoCon("persona")
    await conectarPerfil(db, cuenta)
    expect((await db.rpc("programar_lecturas_de_analiticas")).error).not.toBeNull()
    expect((await db.rpc("tomar_lecturas_de_analiticas", { p_arriendo_segundos: 1500 })).error).not.toBeNull()
    expect((await db.rpc("credencial_de_analiticas", { p_cuenta: cuenta })).error).not.toBeNull()
    expect(
      (await db.rpc("guardar_metricas_api", { p_cuenta: cuenta, p_datos: { publicaciones: [], dias: [] } })).error,
    ).not.toBeNull()
    expect((await db.rpc("barrer_analiticas")).error).not.toBeNull()
  })
})

describe("credencial_de_analiticas", () => {
  test("gives the service role the token and expiry of the profile connection", async () => {
    const { db, cuenta } = await duenoCon("persona")
    const expira = enDias(30)
    await conectarPerfil(db, cuenta, expira)
    const { data, error } = await admin().rpc("credencial_de_analiticas", { p_cuenta: cuenta })
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0]?.token).toBe("token-de-analiticas")
    expect(Date.parse(data?.[0]?.expira_en ?? "")).toBe(Date.parse(expira))
  })

  test("an account without analytics has no credential", async () => {
    const { cuenta } = await duenoCon("persona")
    expect((await admin().rpc("credencial_de_analiticas", { p_cuenta: cuenta })).data).toEqual([])
  })
})

describe("guardar_metricas_api", () => {
  const cifras = (urn: string, extra: Record<string, unknown> = {}) => ({
    post_urn: urn,
    impresiones: 1200,
    interacciones: 36,
    clics: 9,
    ...extra,
  })

  async function filasApi(cuenta: string) {
    const { data, error } = await admin()
      .from("metricas_de_publicacion")
      .select("*")
      .eq("cuenta_id", cuenta)
      .eq("origen", "api")
    if (error) throw error
    return data
  }

  test("stores the figures of a PostIA post with its piece and its Chile day, origin api", async () => {
    const { db, cuenta } = await duenoCon("empresa")
    const urn = urnNueva()
    const pieza = await publicadaConUrn(db, cuenta, urn)
    const { data, error } = await admin().rpc("guardar_metricas_api", {
      p_cuenta: cuenta,
      p_datos: { publicaciones: [cifras(urn)], dias: [{ dia: "2026-11-05", seguidores_nuevos: 4 }] },
    })
    expect(error).toBeNull()
    expect(data).toEqual({ publicaciones: 1, dias: 1 })
    const [fila] = await filasApi(cuenta)
    expect(fila).toMatchObject({
      post_urn: urn,
      pieza_id: pieza,
      impresiones: 1200,
      interacciones: 36,
      clics: 9,
      origen: "api",
    })
    const hoyEnChile = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Santiago" }).format(new Date())
    expect(fila?.publicada_el).toBe(hoyEnChile)
    const dias = await admin().from("metricas_diarias").select("dia, seguidores_nuevos, origen").eq("cuenta_id", cuenta)
    expect(dias.data).toEqual([{ dia: "2026-11-05", seguidores_nuevos: 4, origen: "api" }])
  })

  test("reading again replaces the figures instead of piling them up", async () => {
    const { db, cuenta } = await duenoCon("empresa")
    const urn = urnNueva()
    await publicadaConUrn(db, cuenta, urn)
    await admin().rpc("guardar_metricas_api", {
      p_cuenta: cuenta,
      p_datos: { publicaciones: [cifras(urn)], dias: [{ dia: "2026-11-05", seguidores_nuevos: 4 }] },
    })
    await admin().rpc("guardar_metricas_api", {
      p_cuenta: cuenta,
      p_datos: {
        publicaciones: [cifras(urn, { impresiones: 2000, clics: null })],
        dias: [{ dia: "2026-11-05", seguidores_nuevos: 6 }],
      },
    })
    const filas = await filasApi(cuenta)
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({ impresiones: 2000, clics: null })
    const dias = await admin().from("metricas_diarias").select("seguidores_nuevos").eq("cuenta_id", cuenta)
    expect(dias.data).toEqual([{ seguidores_nuevos: 6 }])
  })

  test("an imported figure of the same post is left alone: both origins live side by side", async () => {
    const { db, cuenta } = await duenoCon("empresa")
    const urn = urnNueva()
    await publicadaConUrn(db, cuenta, urn)
    await admin()
      .from("metricas_de_publicacion")
      .insert({ cuenta_id: cuenta, post_urn: urn, publicada_el: "2026-10-01", impresiones: 5, origen: "importacion" })
    await admin().rpc("guardar_metricas_api", { p_cuenta: cuenta, p_datos: { publicaciones: [cifras(urn)], dias: [] } })
    const todas = await admin()
      .from("metricas_de_publicacion")
      .select("origen, impresiones")
      .eq("cuenta_id", cuenta)
      .order("origen")
    expect(todas.data).toEqual([
      { origen: "api", impresiones: 1200 },
      { origen: "importacion", impresiones: 5 },
    ])
  })

  test("a post PostIA did not send for that account is dropped, also another account's post", async () => {
    const mia = await duenoCon("empresa")
    const otra = await duenoCon("empresa")
    const ajena = urnNueva()
    await publicadaConUrn(otra.db, otra.cuenta, ajena)
    const { data } = await admin().rpc("guardar_metricas_api", {
      p_cuenta: mia.cuenta,
      p_datos: { publicaciones: [cifras(ajena), cifras(urnNueva())], dias: [] },
    })
    expect(data).toEqual({ publicaciones: 0, dias: 0 })
    expect(await filasApi(mia.cuenta)).toEqual([])
  })

  test("malformed data is refused as datos_invalidos and stores nothing", async () => {
    const { db, cuenta } = await duenoCon("empresa")
    const urn = urnNueva()
    await publicadaConUrn(db, cuenta, urn)
    const malos = [
      { publicaciones: [cifras("urn:li:person:1")], dias: [] },
      { publicaciones: [cifras(urn, { impresiones: -1 })], dias: [] },
      { publicaciones: [cifras(urn, { interacciones: "7" })], dias: [] },
      { publicaciones: [cifras(urn, { impresiones: 1.5 })], dias: [] },
      { publicaciones: [], dias: [{ dia: "ayer", seguidores_nuevos: 1 }] },
      { publicaciones: [], dias: [{ dia: "2026-11-05", seguidores_nuevos: -1 }] },
      { publicaciones: "no", dias: [] },
    ]
    for (const p_datos of malos) {
      const { error } = await admin().rpc("guardar_metricas_api", { p_cuenta: cuenta, p_datos })
      expect(error?.message, JSON.stringify(p_datos)).toBe("datos_invalidos")
    }
    expect(await filasApi(cuenta)).toEqual([])
  })

  test("an unknown account is refused", async () => {
    const { error } = await admin().rpc("guardar_metricas_api", {
      p_cuenta: crypto.randomUUID(),
      p_datos: { publicaciones: [], dias: [] },
    })
    expect(error?.message).toBe("cuenta_no_encontrada")
  })
})

describe("barrer_analiticas", () => {
  async function conFila(tipo: "persona" | "empresa", origen: "api" | "importacion", leidaHaceHoras: number) {
    const { cuenta } = await duenoCon(tipo)
    const { error } = await admin()
      .from("metricas_de_publicacion")
      .insert({
        cuenta_id: cuenta,
        post_urn: urnNueva(),
        publicada_el: "2026-10-01",
        origen,
        impresiones: 1,
        leida_en: new Date(Date.now() - leidaHaceHoras * 3_600_000).toISOString(),
      })
    if (error) throw error
    return async () =>
      (await admin().from("metricas_de_publicacion").select("id").eq("cuenta_id", cuenta)).data?.length ?? 0
  }

  test("a profile's API figures go after 24 hours so a nightly sweep keeps them under 48, a page's after a year, imports never", async () => {
    // Read daily at 06:00 and swept at 03:00: a refreshed row is 21 hours old and stays.
    const perfilDeHoy = await conFila("persona", "api", 21)
    const perfilViejo = await conFila("persona", "api", 25)
    const paginaDelAno = await conFila("empresa", "api", 24 * 364)
    const paginaVieja = await conFila("empresa", "api", 24 * 366)
    const perfilImportado = await conFila("persona", "importacion", 24 * 400)
    const paginaImportada = await conFila("empresa", "importacion", 24 * 400)

    expect((await admin().rpc("barrer_analiticas")).error).toBeNull()

    expect([await perfilDeHoy(), await perfilViejo(), await paginaDelAno(), await paginaVieja()]).toEqual([1, 0, 1, 0])
    expect([await perfilImportado(), await paginaImportada()]).toEqual([1, 1])
  })

  test("daily API figures go by their day and readings older than a month are forgotten", async () => {
    const pagina = await duenoCon("empresa")
    const perfil = await duenoCon("persona")
    const dia = (atras: number) =>
      new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Santiago" }).format(
        new Date(Date.now() - atras * 86_400_000),
      )
    const filas = [
      { cuenta_id: pagina.cuenta, dia: dia(100), origen: "api" },
      { cuenta_id: pagina.cuenta, dia: dia(400), origen: "api" },
      { cuenta_id: pagina.cuenta, dia: dia(400), origen: "importacion" },
      { cuenta_id: perfil.cuenta, dia: dia(1), origen: "api" },
      { cuenta_id: perfil.cuenta, dia: dia(2), origen: "api" },
    ]
    expect((await admin().from("metricas_diarias").insert(filas)).error).toBeNull()
    const vieja = await admin()
      .from("lecturas_de_analiticas")
      .insert({
        cuenta_id: pagina.cuenta,
        estado: "lista",
        creada_en: new Date(Date.now() - 40 * 86_400_000).toISOString(),
      })
      .select("id")
      .single()
    expect(vieja.error).toBeNull()

    expect((await admin().rpc("barrer_analiticas")).error).toBeNull()

    const quedan = async (cuenta: string) =>
      (
        (await admin().from("metricas_diarias").select("dia, origen").eq("cuenta_id", cuenta).order("dia")).data ?? []
      ).map((f) => `${f.origen}:${f.dia}`)
    expect(await quedan(pagina.cuenta)).toEqual([`importacion:${dia(400)}`, `api:${dia(100)}`])
    expect(await quedan(perfil.cuenta)).toEqual([`api:${dia(1)}`])
    expect(await lecturasDe(pagina.cuenta)).toEqual([])
  })
})
