import { describe, expect, test } from "vitest"
import { ESTADOS, TRANSICIONES } from "@/lib/piezas/estados"
import { huellaDe } from "@/lib/piezas/huella"
import { admin, cuentaDe, marcaConDueno, personaConSesion } from "./entorno"

const EN_UNA_HORA = () => new Date(Date.now() + 3_600_000).toISOString()

async function piezaPorAprobar(texto = "Hola desde PostIA") {
  const dueno = await personaConSesion("pieza")
  const marca = await marcaConDueno(dueno.userId)
  const cuenta = await cuentaDe(marca)
  const { data: piezaId, error } = await dueno.db.rpc("crear_pieza", {
    p_cuenta: cuenta,
    p_formato: "texto",
    p_texto: texto,
  })
  if (error) throw error
  return { ...dueno, marca, cuenta, pieza: piezaId as string }
}

async function huellaVigente(pieza: string) {
  const { data } = await admin()
    .from("versiones")
    .select("huella")
    .eq("pieza_id", pieza)
    .order("numero", { ascending: false })
    .limit(1)
    .single()
  return data?.huella as string
}

describe("pieces", () => {
  test("the database computes the huella exactly as the app does", async () => {
    const { pieza } = await piezaPorAprobar("Texto con\r\nsalto y espacio final   ")
    expect(await huellaVigente(pieza)).toBe(
      huellaDe({ formato: "texto", titulo: null, archivoSha256: null, texto: "Texto con\nsalto y espacio final" }),
    )
  })

  test("the huella treats unicode blanks the same in SQL and in the app", async () => {
    const texto = "Texto\u0085\ufeff\u00a0"
    const { pieza } = await piezaPorAprobar(texto)
    expect(await huellaVigente(pieza)).toBe(huellaDe({ formato: "texto", titulo: null, archivoSha256: null, texto }))
  })

  test("only a member sees a piece, and only an owner creates one", async () => {
    const { pieza, cuenta } = await piezaPorAprobar()
    const extrano = await personaConSesion("extrano")
    expect((await extrano.db.from("piezas").select("id").eq("id", pieza)).data).toEqual([])
    const { error } = await extrano.db.rpc("crear_pieza", {
      p_cuenta: cuenta,
      p_formato: "texto",
      p_texto: "x",
    })
    expect(error?.code).toBe("42501")
  })

  test("signing needs the current huella and a future date, and binds both", async () => {
    const { db, pieza } = await piezaPorAprobar()
    const vieja = "0".repeat(64)
    expect(
      (await db.rpc("firmar_pieza", { p_pieza: pieza, p_huella: vieja, p_programada_para: EN_UNA_HORA() })).error?.code,
    ).toBe("22023")
    const pasado = new Date(Date.now() - 60_000).toISOString()
    expect(
      (
        await db.rpc("firmar_pieza", {
          p_pieza: pieza,
          p_huella: await huellaVigente(pieza),
          p_programada_para: pasado,
        })
      ).error?.code,
    ).toBe("22023")
    const cuando = EN_UNA_HORA()
    expect(
      (
        await db.rpc("firmar_pieza", {
          p_pieza: pieza,
          p_huella: await huellaVigente(pieza),
          p_programada_para: cuando,
        })
      ).error,
    ).toBeNull()
    const { data } = await db.from("piezas").select("estado, programada_para").eq("id", pieza).single()
    expect(data?.estado).toBe("programada")
    expect(Date.parse(data?.programada_para ?? "")).toBe(Date.parse(cuando))
  })

  test("a new version drops the signature and sends the piece back to the gate", async () => {
    const { db, pieza } = await piezaPorAprobar()
    await db.rpc("firmar_pieza", {
      p_pieza: pieza,
      p_huella: await huellaVigente(pieza),
      p_programada_para: EN_UNA_HORA(),
    })
    expect(
      (
        await db.rpc("nueva_version", {
          p_pieza: pieza,
          p_texto: "Otro texto",
        })
      ).error,
    ).toBeNull()
    const { data } = await admin().from("piezas").select("estado").eq("id", pieza).single()
    expect(data?.estado).toBe("por_aprobar")
    const { count } = await admin()
      .from("firmas")
      .select("*", { count: "exact", head: true })
      .eq("pieza_id", pieza)
      .eq("vigente", true)
    expect(count).toBe(0)
  })

  test("two pieces of one account cannot share a slot", async () => {
    const primera = await piezaPorAprobar()
    const cuando = EN_UNA_HORA()
    await primera.db.rpc("firmar_pieza", {
      p_pieza: primera.pieza,
      p_huella: await huellaVigente(primera.pieza),
      p_programada_para: cuando,
    })
    const { data: otra } = await primera.db.rpc("crear_pieza", {
      p_cuenta: primera.cuenta,
      p_formato: "texto",
      p_texto: "Otra",
    })
    const { error } = await primera.db.rpc("firmar_pieza", {
      p_pieza: otra as string,
      p_huella: await huellaVigente(otra as string),
      p_programada_para: cuando,
    })
    expect(error?.code).toBe("23505")
  })

  test("the guard refuses any transition the machine does not allow, even for the service role", async () => {
    const { pieza } = await piezaPorAprobar()
    const { error } = await admin().from("piezas").update({ estado: "publicada" }).eq("id", pieza)
    expect(error?.code).toBe("23514")
  })

  test("the guard table in SQL matches the app's", async () => {
    const { data } = await admin().rpc("transiciones_de_pieza")
    const enSql = Object.fromEntries((data ?? []).map((f: { de: string; a: string[] }) => [f.de, [...f.a].sort()]))
    const enApp = Object.fromEntries(ESTADOS.map((e) => [e, [...TRANSICIONES[e]].sort()]))
    expect(enSql).toEqual(enApp)
  })

  test("a send is written once: the second reservation for a piece fails", async () => {
    const { pieza } = await piezaPorAprobar()
    const fila = { pieza_id: pieza, enviado_en: new Date().toISOString() }
    expect((await admin().from("publicaciones").insert(fila)).error).toBeNull()
    expect((await admin().from("publicaciones").insert(fila)).error?.code).toBe("23505")
  })

  test("every state change leaves an event with who did it", async () => {
    const { db, pieza, userId } = await piezaPorAprobar()
    await db.rpc("firmar_pieza", {
      p_pieza: pieza,
      p_huella: await huellaVigente(pieza),
      p_programada_para: EN_UNA_HORA(),
    })
    const { data } = await admin().from("eventos").select("de, a, por").eq("pieza_id", pieza).order("id")
    expect(data?.at(-1)).toEqual({ de: "por_aprobar", a: "programada", por: userId })
  })
})
