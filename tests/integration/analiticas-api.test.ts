import { describe, expect, test } from "vitest"
import {
  admin,
  cuentaDe,
  enDias,
  escalarLocal,
  marcaConDueno,
  paginaDelDueno,
  personaConSesion,
  SCOPES_DE_ESTUDIO_WAV,
} from "./entorno"

// LinkedIn keeps one valid token per member and app: the profile's analytics are read with the token of the owner's
// «Estudio WAV» (page) connection when it carries r_member_postAnalytics. No connection of their own.

async function perfilDe(prefijo: string) {
  const dueno = await personaConSesion(prefijo)
  const perfil = await cuentaDe(await marcaConDueno(dueno.userId, "yo"), "persona")
  return { ...dueno, perfil }
}

const credencial = async (cuenta: string) => {
  const { data, error } = await admin().rpc("credencial_de_analiticas", { p_cuenta: cuenta })
  if (error) throw error
  return data
}

const conectadas = async (db: ReturnType<typeof admin>, cuenta: string) => {
  const { data, error } = await db.rpc("analiticas_del_perfil", { p_cuenta: cuenta })
  if (error) throw error
  return data
}

describe("the profile's analytics credential", () => {
  test("comes from the owner's Estudio WAV connection when it carries the analytics scope", async () => {
    const dueno = await perfilDe("una-conexion")
    const expira = enDias(55)
    await paginaDelDueno(dueno, { token: "token-unico", expiraEn: expira })
    const [fila] = await credencial(dueno.perfil)
    expect(fila?.token).toBe("token-unico")
    expect(Date.parse(fila?.expira_en ?? "")).toBe(Date.parse(expira))
  })

  test("is none when the owner's connection lacks the scope", async () => {
    const dueno = await perfilDe("una-conexion-sin-scope")
    await paginaDelDueno(dueno, { scopes: SCOPES_DE_ESTUDIO_WAV.filter((s) => s !== "r_member_postAnalytics") })
    expect(await credencial(dueno.perfil)).toEqual([])
  })

  test("never comes from another person's connection, even one with the scope", async () => {
    const dueno = await perfilDe("una-conexion-propia")
    const otro = await personaConSesion("una-conexion-otro")
    await paginaDelDueno(otro, { token: "token-ajeno" })
    expect(await credencial(dueno.perfil)).toEqual([])
  })

  test("takes the most recently connected one when the owner has two", async () => {
    const dueno = await perfilDe("una-conexion-dos")
    await paginaDelDueno(dueno, { token: "token-viejo" })
    await paginaDelDueno(dueno, { token: "token-nuevo" })
    expect((await credencial(dueno.perfil)).map((f) => f.token)).toEqual(["token-nuevo"])
  })

  test("a page account has no profile analytics credential", async () => {
    const dueno = await perfilDe("una-conexion-pagina")
    const { cuenta } = await paginaDelDueno(dueno)
    expect(await credencial(cuenta)).toEqual([])
  })

  test("is for the service role only", async () => {
    const dueno = await perfilDe("una-conexion-servicio")
    await paginaDelDueno(dueno)
    const { error } = await dueno.db.rpc("credencial_de_analiticas", { p_cuenta: dueno.perfil })
    expect(error).not.toBeNull()
  })
})

describe("analiticas_del_perfil (Ajustes and Rendimiento)", () => {
  test("tells a member when the connection that reads the profile runs out, with no token", async () => {
    const dueno = await perfilDe("una-conexion-ajustes")
    expect(await conectadas(dueno.db, dueno.perfil)).toBeNull()
    const expira = enDias(40)
    await paginaDelDueno(dueno, { expiraEn: expira })
    expect(Date.parse((await conectadas(dueno.db, dueno.perfil)) ?? "")).toBe(Date.parse(expira))
  })

  test("says nothing to someone outside the brand", async () => {
    const dueno = await perfilDe("una-conexion-ajena")
    await paginaDelDueno(dueno)
    const ajena = await personaConSesion("una-conexion-curiosa")
    expect(await conectadas(ajena.db, dueno.perfil)).toBeNull()
  })
})

describe("the separate analytics connection is gone", () => {
  test("neither its table, its functions nor its Vault secrets are left", () => {
    expect(escalarLocal("select to_regclass('public.conexiones_de_analiticas') is null")).toBe("t")
    expect(
      escalarLocal(
        "select count(*) from pg_proc where proname in ('conectar_analiticas', 'soltar_secreto_de_analiticas')",
      ),
    ).toBe("0")
    expect(escalarLocal("select count(*) from vault.secrets where name like 'analiticas:%'")).toBe("0")
  })
})
