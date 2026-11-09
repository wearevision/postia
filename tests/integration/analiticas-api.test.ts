import { createClient } from "@supabase/supabase-js"
import { describe, expect, test } from "vitest"
import { admin, cuentaDe, enDias, entornoLocal, marcaConDueno, personaConSesion, secretosLlamados } from "./entorno"

type Persona = Awaited<ReturnType<typeof personaConSesion>>

async function duenoCon(tipo: "persona" | "empresa", ruta: "api" | "a_mano" = "api") {
  const dueno = await personaConSesion(`analiticas-${tipo}`)
  const marca = await marcaConDueno(dueno.userId, tipo === "empresa" ? "nosotros" : "yo")
  return { ...dueno, marca, cuenta: await cuentaDe(marca, tipo, ruta) }
}

function conectar(db: Persona["db"], cuenta: string, extra: Record<string, unknown> = {}) {
  return db.rpc("conectar_analiticas", {
    p_cuenta: cuenta,
    p_token: "token-de-analiticas",
    p_scopes: ["r_member_postAnalytics"],
    p_expira_en: enDias(60),
    ...extra,
  })
}

async function filasDe(cuenta: string) {
  const { data, error } = await admin()
    .from("conexiones_de_analiticas")
    .select("cuenta_id, scopes, expira_en")
    .eq("cuenta_id", cuenta)
  if (error) throw error
  return data
}

describe("connecting a profile's analytics", () => {
  test("an owner connects a profile account: the row keeps scopes and expiry, the token goes to Vault", async () => {
    const { db, cuenta } = await duenoCon("persona")
    const expira = enDias(60)
    const { error } = await conectar(db, cuenta, { p_expira_en: expira })
    expect(error).toBeNull()
    const [fila] = await filasDe(cuenta)
    expect(fila.scopes).toEqual(["r_member_postAnalytics"])
    expect(Date.parse(fila.expira_en)).toBe(Date.parse(expira))
    expect(secretosLlamados(`analiticas:${cuenta}`)).toBe(1)
  })

  test("a profile paused «a mano» can still connect its analytics: reading figures is not publishing", async () => {
    const { db, cuenta } = await duenoCon("persona", "a_mano")
    expect((await conectar(db, cuenta)).error).toBeNull()
  })

  test("connecting again renews the same row and the same secret", async () => {
    const { db, cuenta } = await duenoCon("persona")
    await conectar(db, cuenta, { p_expira_en: enDias(10) })
    const nueva = enDias(60)
    expect((await conectar(db, cuenta, { p_expira_en: nueva, p_token: "otro-token" })).error).toBeNull()
    const filas = await filasDe(cuenta)
    expect(filas).toHaveLength(1)
    expect(Date.parse(filas[0].expira_en)).toBe(Date.parse(nueva))
    expect(secretosLlamados(`analiticas:${cuenta}`)).toBe(1)
  })

  test("a company account is refused: analytics belong to the profile", async () => {
    const { db, cuenta } = await duenoCon("empresa")
    expect((await conectar(db, cuenta)).error?.message).toBe("cuenta_no_es_perfil")
    expect(await filasDe(cuenta)).toHaveLength(0)
    expect(secretosLlamados(`analiticas:${cuenta}`)).toBe(0)
  })

  test("someone who does not own the brand cannot connect it", async () => {
    const { cuenta } = await duenoCon("persona")
    const ajena = await personaConSesion("analiticas-ajena")
    expect((await conectar(ajena.db, cuenta)).error?.message).toBe("solo_el_dueno_conecta")
    expect(secretosLlamados(`analiticas:${cuenta}`)).toBe(0)
  })

  test("a token without the analytics scope, an expired one or an empty one is refused and leaves nothing", async () => {
    const { db, cuenta } = await duenoCon("persona")
    expect((await conectar(db, cuenta, { p_scopes: ["r_basicprofile"] })).error?.message).toBe("permisos_analiticas")
    expect((await conectar(db, cuenta, { p_expira_en: enDias(-1) })).error?.message).toBe("conexion_incompleta")
    expect((await conectar(db, cuenta, { p_token: "  " })).error?.message).toBe("conexion_incompleta")
    expect(await filasDe(cuenta)).toHaveLength(0)
    expect(secretosLlamados(`analiticas:${cuenta}`)).toBe(0)
  })

  test("an anonymous caller cannot connect", async () => {
    const { cuenta } = await duenoCon("persona")
    const { url, anon } = entornoLocal()
    const sinSesion = createClient(url, anon, { auth: { persistSession: false } })
    const { error } = await sinSesion.rpc("conectar_analiticas", {
      p_cuenta: cuenta,
      p_token: "t",
      p_scopes: ["r_member_postAnalytics"],
      p_expira_en: enDias(60),
    })
    expect(error).not.toBeNull()
    expect(await filasDe(cuenta)).toHaveLength(0)
  })

  test("deleting the account takes its secret with it", async () => {
    const { db, cuenta } = await duenoCon("persona")
    await conectar(db, cuenta)
    expect(secretosLlamados(`analiticas:${cuenta}`)).toBe(1)
    const { error } = await admin().from("cuentas").delete().eq("id", cuenta)
    expect(error).toBeNull()
    expect(secretosLlamados(`analiticas:${cuenta}`)).toBe(0)
  })
})

describe("who sees the analytics connection", () => {
  test("the owner reads the status of their own profile, with no token column to read", async () => {
    const { db, cuenta } = await duenoCon("persona")
    await conectar(db, cuenta)
    const { data, error } = await db.from("conexiones_de_analiticas").select("*").eq("cuenta_id", cuenta)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(Object.keys(data?.[0] ?? {}).sort()).toEqual([
      "conectada_en",
      "conectada_por",
      "cuenta_id",
      "expira_en",
      "scopes",
    ])
  })

  test("another person sees nothing of it", async () => {
    const { db, cuenta } = await duenoCon("persona")
    await conectar(db, cuenta)
    const ajena = await personaConSesion("analiticas-curiosa")
    const { data } = await ajena.db.from("conexiones_de_analiticas").select("cuenta_id").eq("cuenta_id", cuenta)
    expect(data).toEqual([])
  })

  test("nobody writes the table directly, the owner included", async () => {
    const { db, cuenta } = await duenoCon("persona")
    const { error } = await db.from("conexiones_de_analiticas").insert({
      cuenta_id: cuenta,
      scopes: ["r_member_postAnalytics"],
      expira_en: enDias(60),
      conectada_por: crypto.randomUUID(),
    })
    expect(error).not.toBeNull()
    expect(await filasDe(cuenta)).toHaveLength(0)
  })
})
