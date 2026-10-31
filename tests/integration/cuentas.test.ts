import { describe, expect, test } from "vitest"
import { admin, marcaConDueno, personaConSesion } from "./entorno"

const EN_60_DIAS = () => new Date(Date.now() + 60 * 86_400_000).toISOString()

async function duenoConCuenta(ruta: "api" | "a_mano" = "api") {
  const dueno = await personaConSesion("dueno")
  const marca = await marcaConDueno(dueno.userId)
  const { data, error } = await dueno.db
    .from("cuentas")
    .insert({ marca_id: marca, red: "linkedin", tipo: "persona", ruta, nombre: "LinkedIn de Federico" })
    .select("id")
    .single()
  if (error) throw error
  return { ...dueno, marca, cuenta: data.id }
}

function conectar(
  db: Awaited<ReturnType<typeof duenoConCuenta>>["db"],
  cuenta: string,
  titular = "urn:li:person:abc123",
) {
  return db.rpc("conectar_linkedin", {
    p_cuenta: cuenta,
    p_token: "token-secreto",
    p_titular: titular,
    p_nombre: "Federico Elgueta",
    p_scopes: ["openid", "profile", "w_member_social"],
    p_expira_en: EN_60_DIAS(),
  })
}

describe("accounts and connections", () => {
  test("an owner adds an account that only members of the brand can see", async () => {
    const { cuenta } = await duenoConCuenta()
    const extrano = await personaConSesion("extrano")
    const { data } = await extrano.db.from("cuentas").select("id").eq("id", cuenta)
    expect(data).toEqual([])
  })

  test("a company page can publish by API since Community Management was approved", async () => {
    const dueno = await personaConSesion("pagina")
    const marca = await marcaConDueno(dueno.userId, "nosotros")
    const { error } = await dueno.db
      .from("cuentas")
      .insert({ marca_id: marca, red: "linkedin", tipo: "empresa", ruta: "api", nombre: "Página de WAV" })
    expect(error).toBeNull()
  })

  test("connecting stores the token in Vault, readable by the service role and never by the person", async () => {
    const { db, cuenta } = await duenoConCuenta()
    const { error } = await conectar(db, cuenta)
    expect(error).toBeNull()

    const { data: visible } = await db
      .from("cuentas")
      .select("conexiones(titular, expira_en)")
      .eq("id", cuenta)
      .single()
    expect(visible?.conexiones?.titular).toBe("urn:li:person:abc123")
    expect(JSON.stringify(visible)).not.toContain("token-secreto")

    const { error: denegado } = await db.rpc("credencial_de_cuenta", { p_cuenta: cuenta })
    expect(denegado).not.toBeNull()
    const { data: credencial } = await admin().rpc("credencial_de_cuenta", { p_cuenta: cuenta }).single()
    expect(credencial?.token).toBe("token-secreto")
  })

  test("only an owner of the brand can connect, and only an API account", async () => {
    const { cuenta } = await duenoConCuenta()
    const extrano = await personaConSesion("extrano")
    expect((await conectar(extrano.db, cuenta)).error?.code).toBe("42501")
    const aMano = await duenoConCuenta("a_mano")
    expect((await conectar(aMano.db, aMano.cuenta)).error?.code).toBe("22023")
  })

  test("reconnecting the same member keeps one connection with the new expiry", async () => {
    const { db, cuenta } = await duenoConCuenta()
    const titular = `urn:li:person:re${Date.now()}`
    await conectar(db, cuenta, titular)
    await conectar(db, cuenta, titular)
    const { count } = await admin()
      .from("conexiones")
      .select("*", { count: "exact", head: true })
      .eq("titular", titular)
    expect(count).toBe(1)
  })

  test("disconnecting the last account of a connection deletes the token", async () => {
    const { db, cuenta } = await duenoConCuenta()
    await conectar(db, cuenta, `urn:li:person:fin${Date.now()}`)
    expect((await db.rpc("desconectar_cuenta", { p_cuenta: cuenta })).error).toBeNull()
    const { data } = await admin().rpc("credencial_de_cuenta", { p_cuenta: cuenta })
    expect(data).toEqual([])
  })
})
