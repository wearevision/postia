import { randomUUID } from "node:crypto"
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
  test("a new version cannot point at another brand's file, and a carousel version needs its file", async () => {
    const { db, cuenta, marca } = await piezaPorAprobar()
    const otraMarca = await marcaConDueno((await personaConSesion("otra")).userId)
    const ruta = (de: string) => `${de}/${randomUUID()}.pdf`
    const sha = "a".repeat(64)
    const { data: carrusel, error } = await db.rpc("crear_pieza", {
      p_cuenta: cuenta,
      p_formato: "carrusel_pdf",
      p_texto: "c",
      p_titulo: "T",
      p_archivo_ruta: ruta(marca),
      p_archivo_sha256: sha,
    })
    expect(error).toBeNull()
    const ajena = await db.rpc("nueva_version", {
      p_pieza: carrusel as string,
      p_texto: "c",
      p_titulo: "T",
      p_archivo_ruta: ruta(otraMarca),
      p_archivo_sha256: sha,
    })
    expect(ajena.error?.code).toBe("42501")
    const sinArchivo = await db.rpc("nueva_version", { p_pieza: carrusel as string, p_texto: "c" })
    expect(sinArchivo.error?.message).toBe("carrusel_sin_archivo_o_titulo")
  })

  test("a text piece refuses a file", async () => {
    const { db, pieza, marca } = await piezaPorAprobar()
    const { error } = await db.rpc("nueva_version", {
      p_pieza: pieza,
      p_texto: "x",
      p_archivo_ruta: `${marca}/${randomUUID()}.pdf`,
      p_archivo_sha256: "a".repeat(64),
    })
    expect(error?.message).toBe("texto_con_archivo")
  })

  test("marking a doubtful send as by-hand fails when the piece is not doubtful", async () => {
    const { db, pieza } = await piezaPorAprobar()
    const { error } = await db.rpc("dudoso_a_mano", { p_pieza: pieza })
    expect(error?.code).toBe("22023")
    expect(error?.message).toBe("pieza_no_esta_dudosa")
  })

  test("a closed piece cannot be discarded again, nor can one being sent", async () => {
    const { db, pieza } = await piezaPorAprobar()
    expect((await db.rpc("descartar_pieza", { p_pieza: pieza, p_motivo: "no" })).error).toBeNull()
    expect((await db.rpc("descartar_pieza", { p_pieza: pieza, p_motivo: "no" })).error?.message).toBe(
      "pieza_ya_cerrada",
    )

    const publicada = await piezaPorAprobar()
    await publicada.db.rpc("firmar_pieza", {
      p_pieza: publicada.pieza,
      p_huella: await huellaVigente(publicada.pieza),
      p_programada_para: EN_UNA_HORA(),
    })
    await admin().from("piezas").update({ estado: "a_mano" }).eq("id", publicada.pieza)
    await admin().from("piezas").update({ estado: "publicada" }).eq("id", publicada.pieza)
    expect(
      (await publicada.db.rpc("descartar_pieza", { p_pieza: publicada.pieza, p_motivo: "x" })).error?.message,
    ).toBe("pieza_ya_cerrada")

    const enviandose = await piezaPorAprobar()
    await enviandose.db.rpc("firmar_pieza", {
      p_pieza: enviandose.pieza,
      p_huella: await huellaVigente(enviandose.pieza),
      p_programada_para: EN_UNA_HORA(),
    })
    expect((await admin().from("piezas").update({ estado: "publicando" }).eq("id", enviandose.pieza)).error).toBeNull()
    const { error } = await enviandose.db.rpc("descartar_pieza", { p_pieza: enviandose.pieza, p_motivo: "x" })
    expect(error?.message).toBe("pieza_enviandose")
    const { count } = await admin()
      .from("firmas")
      .select("*", { count: "exact", head: true })
      .eq("pieza_id", enviandose.pieza)
      .eq("vigente", true)
    expect(count).toBe(1)
  })

  test("the guard refuses to start sending without a valid signature", async () => {
    const { db, pieza } = await piezaPorAprobar()
    await db.rpc("firmar_pieza", {
      p_pieza: pieza,
      p_huella: await huellaVigente(pieza),
      p_programada_para: EN_UNA_HORA(),
    })
    await admin().from("firmas").update({ vigente: false }).eq("pieza_id", pieza)
    const { error } = await admin().from("piezas").update({ estado: "publicando" }).eq("id", pieza)
    expect(error?.code).toBe("23514")
    expect(error?.message).toBe("publicar_sin_firma_vigente")
  })

  test("the publisher leases a due piece only once, and people cannot lease", async () => {
    const { db, pieza } = await piezaPorAprobar()
    await db.rpc("firmar_pieza", {
      p_pieza: pieza,
      p_huella: await huellaVigente(pieza),
      p_programada_para: EN_UNA_HORA(),
    })
    const pasado = "2000-01-01T00:00:00Z"
    await admin().from("piezas").update({ programada_para: pasado }).eq("id", pieza)
    await admin().from("firmas").update({ programada_para: pasado }).eq("pieza_id", pieza)
    try {
      expect((await db.rpc("tomar_para_publicar")).error).not.toBeNull()
      const primera = await admin().rpc("tomar_para_publicar")
      expect(primera.data?.map((p) => p.id)).toContain(pieza)
      const segunda = await admin().rpc("tomar_para_publicar")
      expect(segunda.data?.map((p) => p.id) ?? []).not.toContain(pieza)
    } finally {
      await admin().from("piezas").update({ estado: "descartada" }).eq("id", pieza)
    }
  })

  test("closing by hand needs the link and works from by-hand", async () => {
    const { db, pieza } = await piezaPorAprobar()
    await db.rpc("firmar_pieza", {
      p_pieza: pieza,
      p_huella: await huellaVigente(pieza),
      p_programada_para: EN_UNA_HORA(),
    })
    await admin().from("piezas").update({ estado: "a_mano" }).eq("id", pieza)
    // The generated types demand a string; a null link is exactly what the function must refuse.
    const sinEnlace = JSON.parse(`{"p_pieza": "${pieza}", "p_enlace": null}`)
    expect((await db.rpc("cerrar_a_mano", sinEnlace)).error?.message).toBe("falta_el_enlace")
    const enlace = "https://www.linkedin.com/feed/update/urn:li:share:1"
    expect((await db.rpc("cerrar_a_mano", { p_pieza: pieza, p_enlace: enlace })).error).toBeNull()
    const { data } = await admin().from("piezas").select("estado, enlace").eq("id", pieza).single()
    expect(data).toEqual({ estado: "publicada", enlace })
  })
})
