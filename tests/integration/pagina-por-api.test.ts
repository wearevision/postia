import { execFileSync } from "node:child_process"
import { describe, expect, test } from "vitest"
import { admin, cuentaDe, marcaConDueno, personaConSesion } from "./entorno"

const DIA = 86_400_000
const EN_DIAS = (dias: number) => new Date(Date.now() + dias * DIA).toISOString()
const PAGINA = "urn:li:organization:123"
const OTRA_PAGINA = "urn:li:organization:456"

type Persona = Awaited<ReturnType<typeof personaConSesion>>

/** Vault is out of PostgREST's reach: the test reads secret names straight from the local database. */
function secretosLlamados(nombre: string): number {
  const url = execFileSync("supabase", ["status", "-o", "env"], { encoding: "utf8" })
    .split("\n")
    .map((linea) => /^DB_URL="?(.*?)"?$/.exec(linea.trim()))
    .find((m) => m !== null)?.[1]
  if (!url) throw new Error("Supabase local no está corriendo: pnpm db:start")
  // psql interpolates :'nombre' only in scripts read from a file or stdin, never in -c.
  const salida = execFileSync("psql", [url, "-tA", "-v", `nombre=${nombre}`, "-f", "-"], {
    encoding: "utf8",
    input: "select count(*) from vault.secrets where name = :'nombre';",
  })
  return Number(salida.trim())
}

async function duenoCon(tipo: "persona" | "empresa", ruta: "api" | "a_mano" = "api") {
  const dueno = await personaConSesion(`pagina-${tipo}`)
  const marca = await marcaConDueno(dueno.userId, tipo === "empresa" ? "nosotros" : "yo")
  return { ...dueno, marca, cuenta: await cuentaDe(marca, tipo, ruta) }
}

function conectarPagina(db: Persona["db"], cuenta: string, extra: Record<string, unknown> = {}) {
  return db.rpc("conectar_linkedin", {
    p_cuenta: cuenta,
    p_token: "token-de-pagina",
    p_titular: `urn:li:person:adm${crypto.randomUUID().slice(0, 8)}`,
    p_nombre: "Federico Elgueta",
    p_scopes: ["r_basicprofile", "rw_organization_admin", "w_organization_social"],
    p_expira_en: EN_DIAS(60),
    p_app: "estudio_wav",
    p_organizacion: PAGINA,
    ...extra,
  })
}

function conectarPerfil(db: Persona["db"], cuenta: string) {
  return db.rpc("conectar_linkedin", {
    p_cuenta: cuenta,
    p_token: "token-de-perfil",
    p_titular: `urn:li:person:per${crypto.randomUUID().slice(0, 8)}`,
    p_nombre: "Federico Elgueta",
    p_scopes: ["openid", "profile", "w_member_social"],
    p_expira_en: EN_DIAS(60),
  })
}

async function conexionDe(cuenta: string) {
  const { data, error } = await admin().from("cuentas").select("ruta, conexion_id").eq("id", cuenta).single()
  if (error) throw error
  return data
}

describe("connecting the WAV page", () => {
  test("an owner connects a company account to the page app, and the token goes to Vault", async () => {
    const { db, cuenta } = await duenoCon("empresa")
    const { data: conexion, error } = await conectarPagina(db, cuenta)
    expect(error).toBeNull()
    const { data: fila } = await admin()
      .from("conexiones")
      .select("app, organizacion")
      .eq("id", conexion ?? "")
      .single()
    expect(fila).toEqual({ app: "estudio_wav", organizacion: PAGINA })
    expect(secretosLlamados(`conexion:${conexion}`)).toBe(1)
  })

  test("a page app on a person account, or the profile app on a company account, is refused", async () => {
    const persona = await duenoCon("persona")
    expect((await conectarPagina(persona.db, persona.cuenta)).error?.message).toBe("cuenta_y_app_no_calzan")
    const empresa = await duenoCon("empresa")
    expect((await conectarPerfil(empresa.db, empresa.cuenta)).error?.message).toBe("cuenta_y_app_no_calzan")
  })

  test("a page connection without an organization breaks the check", async () => {
    const { db, cuenta } = await duenoCon("empresa")
    expect((await conectarPagina(db, cuenta, { p_organizacion: null })).error?.code).toBe("23514")
  })

  test("the credential's author is the organization for the page and the person for the profile", async () => {
    const empresa = await duenoCon("empresa")
    await conectarPagina(empresa.db, empresa.cuenta)
    const { data: pagina } = await admin().rpc("credencial_de_cuenta", { p_cuenta: empresa.cuenta }).single()
    expect(pagina?.autor).toBe(PAGINA)

    const persona = await duenoCon("persona")
    await conectarPerfil(persona.db, persona.cuenta)
    const { data: perfil } = await admin().rpc("credencial_de_cuenta", { p_cuenta: persona.cuenta }).single()
    expect(perfil?.autor).toBe(perfil?.titular)
    expect(perfil?.autor).toMatch(/^urn:li:person:/)
  })

  test("one administrator can connect two pages", async () => {
    const titular = `urn:li:person:dos${crypto.randomUUID().slice(0, 8)}`
    const a = await duenoCon("empresa")
    const b = await duenoCon("empresa")
    expect((await conectarPagina(a.db, a.cuenta, { p_titular: titular })).error).toBeNull()
    expect((await conectarPagina(b.db, b.cuenta, { p_titular: titular, p_organizacion: OTRA_PAGINA })).error).toBeNull()
    const { count } = await admin()
      .from("conexiones")
      .select("*", { count: "exact", head: true })
      .eq("titular", titular)
    expect(count).toBe(2)
  })
})

async function existeConexion(conexion: string | null): Promise<boolean> {
  const { count } = await admin()
    .from("conexiones")
    .select("*", { count: "exact", head: true })
    .eq("id", conexion ?? "")
  return count === 1
}

describe("reconnecting an account", () => {
  test("repointing an account deletes its previous connection and both secrets when no other account uses it", async () => {
    const { db, cuenta } = await duenoCon("empresa")
    const { data: vieja } = await conectarPagina(db, cuenta, {
      p_renovacion: "renovacion-vieja",
      p_renovacion_expira_en: EN_DIAS(365),
    })
    const { data: nueva, error } = await conectarPagina(db, cuenta, { p_organizacion: OTRA_PAGINA })
    expect(error).toBeNull()
    expect(nueva).not.toBe(vieja)
    expect((await conexionDe(cuenta)).conexion_id).toBe(nueva)
    expect(await existeConexion(vieja)).toBe(false)
    expect(secretosLlamados(`conexion:${vieja}`)).toBe(0)
    expect(secretosLlamados(`conexion:${vieja}:renovacion`)).toBe(0)
  })

  test("the previous connection stays while another account still uses it", async () => {
    const dueno = await personaConSesion("pagina-compartida")
    const a = await cuentaDe(await marcaConDueno(dueno.userId, "nosotros"), "empresa")
    const b = await cuentaDe(await marcaConDueno(dueno.userId, "nosotros"), "empresa")
    const titular = `urn:li:person:com${crypto.randomUUID().slice(0, 8)}`
    const { data: compartida } = await conectarPagina(dueno.db, a, { p_titular: titular })
    expect((await conectarPagina(dueno.db, b, { p_titular: titular })).data).toBe(compartida)

    await conectarPagina(dueno.db, a, { p_organizacion: OTRA_PAGINA })
    expect(await existeConexion(compartida)).toBe(true)
    expect(secretosLlamados(`conexion:${compartida}`)).toBe(1)
    expect((await conexionDe(b)).conexion_id).toBe(compartida)
  })

  test("picking a page for an already connected account deletes the connection it replaces", async () => {
    const { db, cuenta } = await duenoCon("empresa")
    const { data: vieja } = await conectarPagina(db, cuenta)
    const { data: eleccion } = await db.rpc("guardar_eleccion", {
      p_cuenta: cuenta,
      p_titular: `urn:li:person:rec${crypto.randomUUID().slice(0, 8)}`,
      p_nombre: "",
      p_paginas: [{ urn: OTRA_PAGINA, nombre: "Otra" }],
      p_token: "token-nuevo",
      p_scopes: ["r_basicprofile", "rw_organization_admin", "w_organization_social"],
      p_expira_en: EN_DIAS(60),
    })
    const { data: nueva, error } = await db.rpc("elegir_pagina", {
      p_eleccion: eleccion ?? "",
      p_organizacion: OTRA_PAGINA,
    })
    expect(error).toBeNull()
    expect((await conexionDe(cuenta)).conexion_id).toBe(nueva)
    expect(await existeConexion(vieja)).toBe(false)
    expect(secretosLlamados(`conexion:${vieja}`)).toBe(0)
  })

  test("a connection no account uses is not renewed", async () => {
    const { db, cuenta } = await duenoCon("empresa")
    const { data: conexion } = await conectarPagina(db, cuenta, {
      p_expira_en: EN_DIAS(5),
      p_renovacion: "renovacion-huerfana",
      p_renovacion_expira_en: EN_DIAS(365),
    })
    await admin().from("cuentas").update({ conexion_id: null }).eq("id", cuenta)
    const { data } = await admin().rpc("renovaciones_pendientes", { p_hasta: EN_DIAS(10) })
    expect(data?.some((p) => p.conexion === conexion)).toBe(false)
  })
})

describe("the account's route", () => {
  test("a company account can now be added with the API route", async () => {
    const dueno = await personaConSesion("pagina-ruta")
    const marca = await marcaConDueno(dueno.userId, "nosotros")
    const { error } = await dueno.db
      .from("cuentas")
      .insert({ marca_id: marca, red: "linkedin", tipo: "empresa", ruta: "api", nombre: "Página de WAV" })
    expect(error).toBeNull()
  })

  test("an owner switches «a mano» to API and back, and going back unlinks and forgets the connection", async () => {
    const { db, cuenta } = await duenoCon("empresa", "a_mano")
    expect((await db.rpc("cambiar_ruta", { p_cuenta: cuenta, p_ruta: "api" })).error).toBeNull()
    expect((await conexionDe(cuenta)).ruta).toBe("api")
    const { data: conexion } = await conectarPagina(db, cuenta)

    expect((await db.rpc("cambiar_ruta", { p_cuenta: cuenta, p_ruta: "a_mano" })).error).toBeNull()
    expect(await conexionDe(cuenta)).toEqual({ ruta: "a_mano", conexion_id: null })
    const { count } = await admin()
      .from("conexiones")
      .select("*", { count: "exact", head: true })
      .eq("id", conexion ?? "")
    expect(count).toBe(0)
    expect(secretosLlamados(`conexion:${conexion}`)).toBe(0)
  })

  test("a non-owner cannot switch the route, and Metricool is not a route", async () => {
    const { db, cuenta } = await duenoCon("empresa", "a_mano")
    const extrano = await personaConSesion("pagina-extrano")
    const ajeno = await extrano.db.rpc("cambiar_ruta", { p_cuenta: cuenta, p_ruta: "api" })
    expect(ajeno.error?.message).toBe("solo_el_dueno_cambia_cuentas")
    expect((await db.rpc("cambiar_ruta", { p_cuenta: cuenta, p_ruta: "metricool" })).error?.code).toBe("22023")
    expect((await conexionDe(cuenta)).ruta).toBe("a_mano")
  })
})

describe("refresh tokens", () => {
  test("connecting with a refresh token keeps it apart, and the pending renewals return it decrypted", async () => {
    const { db, cuenta } = await duenoCon("empresa")
    const { data: conexion } = await conectarPagina(db, cuenta, {
      p_expira_en: EN_DIAS(5),
      p_renovacion: "renovacion-1",
      p_renovacion_expira_en: EN_DIAS(365),
    })
    expect(secretosLlamados(`conexion:${conexion}:renovacion`)).toBe(1)

    const { data: pendientes, error } = await admin().rpc("renovaciones_pendientes", { p_hasta: EN_DIAS(10) })
    expect(error).toBeNull()
    expect(pendientes?.find((p) => p.conexion === conexion)?.renovacion).toBe("renovacion-1")
    const { data: lejos } = await admin().rpc("renovaciones_pendientes", { p_hasta: EN_DIAS(2) })
    expect(lejos?.some((p) => p.conexion === conexion)).toBe(false)
  })

  test("a connection whose refresh token expired is not pending", async () => {
    const { db, cuenta } = await duenoCon("empresa")
    const { data: conexion } = await conectarPagina(db, cuenta, {
      p_expira_en: EN_DIAS(5),
      p_renovacion: "renovacion-vieja",
      p_renovacion_expira_en: EN_DIAS(365),
    })
    await admin()
      .from("conexiones")
      .update({ renovacion_expira_en: EN_DIAS(-1) })
      .eq("id", conexion ?? "")
    const { data } = await admin().rpc("renovaciones_pendientes", { p_hasta: EN_DIAS(10) })
    expect(data?.some((p) => p.conexion === conexion)).toBe(false)
  })

  test("saving a renewal replaces both tokens and both expiries", async () => {
    const { db, cuenta } = await duenoCon("empresa")
    const { data: conexion } = await conectarPagina(db, cuenta, {
      p_expira_en: EN_DIAS(5),
      p_renovacion: "renovacion-1",
      p_renovacion_expira_en: EN_DIAS(365),
    })
    const expira = EN_DIAS(60)
    const renovacionExpira = EN_DIAS(300)
    const { error } = await admin().rpc("guardar_renovacion", {
      p_conexion: conexion ?? "",
      p_token: "token-nuevo",
      p_expira_en: expira,
      p_renovacion: "renovacion-2",
      p_renovacion_expira_en: renovacionExpira,
    })
    expect(error).toBeNull()
    const { data: credencial } = await admin().rpc("credencial_de_cuenta", { p_cuenta: cuenta }).single()
    expect(credencial?.token).toBe("token-nuevo")
    expect(new Date(credencial?.expira_en ?? "").toISOString()).toBe(expira)
    const { data: pendientes } = await admin().rpc("renovaciones_pendientes", { p_hasta: EN_DIAS(400) })
    const fila = pendientes?.find((p) => p.conexion === conexion)
    expect(fila?.renovacion).toBe("renovacion-2")
    expect(new Date(fila?.renovacion_expira_en ?? "").toISOString()).toBe(renovacionExpira)
  })

  test("forgetting a refused refresh token clears its expiry and its secret, and leaves the access token", async () => {
    const { db, cuenta } = await duenoCon("empresa")
    const { data: conexion } = await conectarPagina(db, cuenta, {
      p_renovacion: "renovacion-rechazada",
      p_renovacion_expira_en: EN_DIAS(365),
    })
    expect((await admin().rpc("olvidar_renovacion", { p_conexion: conexion ?? "" })).error).toBeNull()
    const { data: fila } = await admin()
      .from("conexiones")
      .select("renovacion_expira_en")
      .eq("id", conexion ?? "")
      .single()
    expect(fila?.renovacion_expira_en).toBeNull()
    expect(secretosLlamados(`conexion:${conexion}:renovacion`)).toBe(0)
    expect(secretosLlamados(`conexion:${conexion}`)).toBe(1)
    expect((await db.rpc("olvidar_renovacion", { p_conexion: conexion ?? "" })).error?.code).toBe("42501")
  })

  test("a person can call neither renewal function", async () => {
    const { db } = await duenoCon("empresa")
    expect((await db.rpc("renovaciones_pendientes", { p_hasta: EN_DIAS(10) })).error?.code).toBe("42501")
    const guardar = await db.rpc("guardar_renovacion", {
      p_conexion: crypto.randomUUID(),
      p_token: "t",
      p_expira_en: EN_DIAS(60),
      p_renovacion: "r",
      p_renovacion_expira_en: EN_DIAS(365),
    })
    expect(guardar.error?.code).toBe("42501")
  })

  test("disconnecting deletes the refresh token too", async () => {
    const { db, cuenta } = await duenoCon("empresa")
    const { data: conexion } = await conectarPagina(db, cuenta, {
      p_renovacion: "renovacion-fin",
      p_renovacion_expira_en: EN_DIAS(365),
    })
    expect((await db.rpc("desconectar_cuenta", { p_cuenta: cuenta })).error).toBeNull()
    expect(secretosLlamados(`conexion:${conexion}`)).toBe(0)
    expect(secretosLlamados(`conexion:${conexion}:renovacion`)).toBe(0)
  })
})

describe("choosing one of several pages", () => {
  const PAGINAS = [
    { urn: PAGINA, nombre: "WAV" },
    { urn: OTRA_PAGINA, nombre: "Otra" },
  ]

  function guardarEleccion(db: Persona["db"], cuenta: string) {
    return db.rpc("guardar_eleccion", {
      p_cuenta: cuenta,
      p_titular: `urn:li:person:ele${crypto.randomUUID().slice(0, 8)}`,
      p_nombre: "Federico Elgueta",
      p_paginas: PAGINAS,
      p_token: "token-de-eleccion",
      p_scopes: ["r_basicprofile", "rw_organization_admin", "w_organization_social"],
      p_expira_en: EN_DIAS(60),
      p_renovacion: "renovacion-de-eleccion",
      p_renovacion_expira_en: EN_DIAS(365),
    })
  }

  test("an owner saves a choice that only they can read, with its token in Vault", async () => {
    const { db, cuenta } = await duenoCon("empresa")
    const { data: eleccion, error } = await guardarEleccion(db, cuenta)
    expect(error).toBeNull()
    expect(secretosLlamados(`eleccion:${eleccion}`)).toBe(1)
    const { data: propia } = await db
      .from("elecciones_de_pagina")
      .select("cuenta_id, paginas")
      .eq("id", eleccion ?? "")
    expect(propia).toEqual([{ cuenta_id: cuenta, paginas: PAGINAS }])
    const extrano = await personaConSesion("pagina-miron")
    const { data: ajena } = await extrano.db
      .from("elecciones_de_pagina")
      .select("id")
      .eq("id", eleccion ?? "")
    expect(ajena).toEqual([])
  })

  test("picking a listed page connects it and deletes the choice and its secrets", async () => {
    const { db, cuenta } = await duenoCon("empresa")
    const { data: eleccion } = await guardarEleccion(db, cuenta)
    const { data: conexion, error } = await db.rpc("elegir_pagina", {
      p_eleccion: eleccion ?? "",
      p_organizacion: OTRA_PAGINA,
    })
    expect(error).toBeNull()
    const { data: credencial } = await admin().rpc("credencial_de_cuenta", { p_cuenta: cuenta }).single()
    expect(credencial).toMatchObject({ token: "token-de-eleccion", autor: OTRA_PAGINA })
    expect(secretosLlamados(`conexion:${conexion}:renovacion`)).toBe(1)
    expect(secretosLlamados(`eleccion:${eleccion}`)).toBe(0)
    expect(secretosLlamados(`eleccion:${eleccion}:renovacion`)).toBe(0)
    const { count } = await admin()
      .from("elecciones_de_pagina")
      .select("*", { count: "exact", head: true })
      .eq("id", eleccion ?? "")
    expect(count).toBe(0)
  })

  test("a page outside the list, another person's choice and a stale choice are refused", async () => {
    const { db, cuenta } = await duenoCon("empresa")
    const { data: eleccion } = await guardarEleccion(db, cuenta)
    const fuera = await db.rpc("elegir_pagina", { p_eleccion: eleccion ?? "", p_organizacion: "urn:li:organization:9" })
    expect(fuera.error?.message).toBe("pagina_fuera_de_la_lista")

    const extrano = await personaConSesion("pagina-ajeno")
    const ajena = await extrano.db.rpc("elegir_pagina", { p_eleccion: eleccion ?? "", p_organizacion: PAGINA })
    expect(ajena.error?.code).toBe("42501")

    await admin()
      .from("elecciones_de_pagina")
      .update({ creada_en: new Date(Date.now() - 11 * 60_000).toISOString() })
      .eq("id", eleccion ?? "")
    const vieja = await db.rpc("elegir_pagina", { p_eleccion: eleccion ?? "", p_organizacion: PAGINA })
    expect(vieja.error?.message).toBe("eleccion_vencida")
    expect((await conexionDe(cuenta)).conexion_id).toBeNull()
  })

  test("the nightly sweep deletes stale choices and their secrets, and keeps fresh ones", async () => {
    const { db, cuenta } = await duenoCon("empresa")
    const { data: vieja } = await guardarEleccion(db, cuenta)
    const { data: fresca } = await guardarEleccion(db, cuenta)
    await admin()
      .from("elecciones_de_pagina")
      .update({ creada_en: new Date(Date.now() - 11 * 60_000).toISOString() })
      .eq("id", vieja ?? "")
    const { error: denegado } = await db.rpc("barrer_elecciones")
    expect(denegado?.code).toBe("42501")
    const { data: borradas, error } = await admin().rpc("barrer_elecciones")
    expect(error).toBeNull()
    expect(borradas).toBeGreaterThanOrEqual(1)
    expect(secretosLlamados(`eleccion:${vieja}`)).toBe(0)
    expect(secretosLlamados(`eleccion:${vieja}:renovacion`)).toBe(0)
    expect(secretosLlamados(`eleccion:${fresca}`)).toBe(1)
    const { data } = await admin()
      .from("elecciones_de_pagina")
      .select("id")
      .in("id", [vieja ?? "", fresca ?? ""])
    expect(data?.map((e) => e.id)).toEqual([fresca])
  })
})
