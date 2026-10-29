import { describe, expect, test } from "vitest"
import { admin, cuentaDe, enDias, marcaConDueno, personaConSesion, piezaDe, versionVigente } from "./entorno"

async function cuentaConDueno(prefijo = "plan") {
  const dueno = await personaConSesion(prefijo)
  const marca = await marcaConDueno(dueno.userId)
  return { ...dueno, marca, cuenta: await cuentaDe(marca) }
}

async function planeada(pieza: string) {
  const { data } = await admin()
    .from("piezas")
    .select("estado, planeada_para, programada_para")
    .eq("id", pieza)
    .single()
  return data
}

describe("planear_pieza", () => {
  test("an owner plans an unsigned piece for a future slot", async () => {
    const { db, cuenta } = await cuentaConDueno()
    const pieza = await piezaDe(db, cuenta)
    const cuando = enDias(2)
    expect((await db.rpc("planear_pieza", { p_pieza: pieza, p_fecha: cuando })).error).toBeNull()
    expect(Date.parse((await planeada(pieza))?.planeada_para ?? "")).toBe(Date.parse(cuando))
  })

  test("a stranger cannot plan someone else's piece", async () => {
    const { db, cuenta } = await cuentaConDueno()
    const pieza = await piezaDe(db, cuenta)
    const extrano = await personaConSesion("plan-extrano")
    const { error } = await extrano.db.rpc("planear_pieza", { p_pieza: pieza, p_fecha: enDias(2) })
    expect(error?.code).toBe("42501")
  })

  test("refuses the past and a piece that is not waiting for its signature", async () => {
    const { db, cuenta } = await cuentaConDueno()
    const pieza = await piezaDe(db, cuenta)
    const pasado = new Date(Date.now() - 60_000).toISOString()
    expect((await db.rpc("planear_pieza", { p_pieza: pieza, p_fecha: pasado })).error?.message).toBe(
      "fecha_en_el_pasado",
    )
    const { huella } = await versionVigente(pieza)
    await db.rpc("firmar_pieza", { p_pieza: pieza, p_huella: huella, p_programada_para: enDias(3) })
    expect((await db.rpc("planear_pieza", { p_pieza: pieza, p_fecha: enDias(4) })).error?.message).toBe(
      "pieza_no_esta_por_aprobar",
    )
  })

  test("a slot taken by a planned or a signed piece of the same account is refused", async () => {
    const { db, cuenta } = await cuentaConDueno()
    const [a, b, c] = [await piezaDe(db, cuenta), await piezaDe(db, cuenta), await piezaDe(db, cuenta)]
    const lunes = enDias(5)
    await db.rpc("planear_pieza", { p_pieza: a, p_fecha: lunes })
    expect((await db.rpc("planear_pieza", { p_pieza: b, p_fecha: lunes })).error?.code).toBe("23505")
    const martes = enDias(6)
    const { huella } = await versionVigente(c)
    await db.rpc("firmar_pieza", { p_pieza: c, p_huella: huella, p_programada_para: martes })
    expect((await db.rpc("planear_pieza", { p_pieza: b, p_fecha: martes })).error?.code).toBe("23505")
  })

  test("another account may use the same slot", async () => {
    const uno = await cuentaConDueno()
    const otra = await cuentaDe(uno.marca, "empresa", "a_mano")
    const cuando = enDias(7)
    await uno.db.rpc("planear_pieza", { p_pieza: await piezaDe(uno.db, uno.cuenta), p_fecha: cuando })
    const { error } = await uno.db.rpc("planear_pieza", { p_pieza: await piezaDe(uno.db, otra), p_fecha: cuando })
    expect(error).toBeNull()
  })

  test("signing moves the plan to the signed date and frees the old slot", async () => {
    const { db, cuenta } = await cuentaConDueno()
    const [a, b] = [await piezaDe(db, cuenta), await piezaDe(db, cuenta)]
    const plan = enDias(8)
    const firmada = enDias(9)
    await db.rpc("planear_pieza", { p_pieza: a, p_fecha: plan })
    const { huella } = await versionVigente(a)
    expect(
      (await db.rpc("firmar_pieza", { p_pieza: a, p_huella: huella, p_programada_para: firmada })).error,
    ).toBeNull()
    expect(Date.parse((await planeada(a))?.planeada_para ?? "")).toBe(Date.parse(firmada))
    expect((await db.rpc("planear_pieza", { p_pieza: b, p_fecha: plan })).error).toBeNull()
  })

  test("a piece sent back to the gate keeps its slot as plan", async () => {
    const { db, cuenta } = await cuentaConDueno()
    const pieza = await piezaDe(db, cuenta)
    const cuando = enDias(10)
    const { huella } = await versionVigente(pieza)
    await db.rpc("firmar_pieza", { p_pieza: pieza, p_huella: huella, p_programada_para: cuando })
    await db.rpc("desprogramar_pieza", { p_pieza: pieza })
    const fila = await planeada(pieza)
    expect(fila?.estado).toBe("por_aprobar")
    expect(Date.parse(fila?.planeada_para ?? "")).toBe(Date.parse(cuando))
  })
})

describe("the reserve (D21)", () => {
  test("signing for the reserve binds the current huella without a date and frees the planned slot", async () => {
    const { db, cuenta } = await cuentaConDueno("reserva")
    const pieza = await piezaDe(db, cuenta)
    const cuando = enDias(2)
    await db.rpc("planear_pieza", { p_pieza: pieza, p_fecha: cuando })
    const { huella } = await versionVigente(pieza)
    const { data: firma, error } = await db.rpc("firmar_para_reserva", { p_pieza: pieza, p_huella: huella })
    expect(error).toBeNull()
    expect(await planeada(pieza)).toMatchObject({ estado: "en_reserva", planeada_para: null, programada_para: null })
    const { data: fila } = await admin()
      .from("firmas")
      .select("para_reserva, programada_para, vigente, huella")
      .eq("id", firma as string)
      .single()
    expect(fila).toEqual({ para_reserva: true, programada_para: null, vigente: true, huella })
    const otra = await piezaDe(db, cuenta)
    expect((await db.rpc("planear_pieza", { p_pieza: otra, p_fecha: cuando })).error).toBeNull()
  })

  test("refuses a stale huella, a stranger and a piece that is not waiting for its signature", async () => {
    const { db, cuenta } = await cuentaConDueno("reserva-no")
    const pieza = await piezaDe(db, cuenta)
    expect((await db.rpc("firmar_para_reserva", { p_pieza: pieza, p_huella: "0".repeat(64) })).error?.message).toBe(
      "firma_de_otra_version",
    )
    const { huella } = await versionVigente(pieza)
    const extrano = await personaConSesion("reserva-extrano")
    expect((await extrano.db.rpc("firmar_para_reserva", { p_pieza: pieza, p_huella: huella })).error?.code).toBe(
      "42501",
    )
    await db.rpc("firmar_para_reserva", { p_pieza: pieza, p_huella: huella })
    expect((await db.rpc("firmar_para_reserva", { p_pieza: pieza, p_huella: huella })).error?.message).toBe(
      "pieza_no_esta_por_aprobar",
    )
  })

  test("the guard refuses entering the reserve without a reserve signature, even for the service role", async () => {
    const { db, cuenta } = await cuentaConDueno("reserva-guardia")
    const pieza = await piezaDe(db, cuenta)
    const { error } = await admin().from("piezas").update({ estado: "en_reserva" }).eq("id", pieza)
    expect(error?.code).toBe("23514")
    expect(error?.message).toBe("reservar_sin_firma_vigente")
  })

  test("the guard refuses scheduling a reserve piece whose signature has no date for that slot", async () => {
    const { db, cuenta } = await cuentaConDueno("reserva-sin-fecha")
    const pieza = await piezaDe(db, cuenta)
    const { huella } = await versionVigente(pieza)
    await db.rpc("firmar_para_reserva", { p_pieza: pieza, p_huella: huella })
    const { error } = await admin()
      .from("piezas")
      .update({ estado: "programada", programada_para: enDias(2) })
      .eq("id", pieza)
    expect(error?.message).toBe("programar_sin_firma_vigente")
  })

  test("a signature has a date unless it is for the reserve", async () => {
    const { db, cuenta, userId } = await cuentaConDueno("reserva-check")
    const pieza = await piezaDe(db, cuenta)
    const version = await versionVigente(pieza)
    const { error } = await admin().from("firmas").insert({
      pieza_id: pieza,
      version_id: version.id,
      huella: version.huella,
      programada_para: null,
      firmada_por: userId,
    })
    expect(error?.code).toBe("23514")
  })

  test("a new version sends a reserve piece back to the gate and drops its signature", async () => {
    const { db, cuenta } = await cuentaConDueno("reserva-version")
    const pieza = await piezaDe(db, cuenta)
    await db.rpc("firmar_para_reserva", { p_pieza: pieza, p_huella: (await versionVigente(pieza)).huella })
    expect((await db.rpc("nueva_version", { p_pieza: pieza, p_texto: "Otro texto" })).error).toBeNull()
    expect((await planeada(pieza))?.estado).toBe("por_aprobar")
    const { count } = await admin()
      .from("firmas")
      .select("*", { count: "exact", head: true })
      .eq("pieza_id", pieza)
      .eq("vigente", true)
    expect(count).toBe(0)
  })

  test("taking a piece out of the reserve drops its signature; only a reserve piece can be taken out", async () => {
    const { db, cuenta } = await cuentaConDueno("reserva-sacar")
    const pieza = await piezaDe(db, cuenta)
    expect((await db.rpc("sacar_de_reserva", { p_pieza: pieza })).error?.message).toBe("pieza_no_esta_en_reserva")
    await db.rpc("firmar_para_reserva", { p_pieza: pieza, p_huella: (await versionVigente(pieza)).huella })
    const extrano = await personaConSesion("sacar-extrano")
    expect((await extrano.db.rpc("sacar_de_reserva", { p_pieza: pieza })).error?.code).toBe("42501")
    expect((await db.rpc("sacar_de_reserva", { p_pieza: pieza })).error).toBeNull()
    expect((await planeada(pieza))?.estado).toBe("por_aprobar")
    const { count } = await admin()
      .from("firmas")
      .select("*", { count: "exact", head: true })
      .eq("pieza_id", pieza)
      .eq("vigente", true)
    expect(count).toBe(0)
  })

  test("a reserve piece can be discarded", async () => {
    const { db, cuenta } = await cuentaConDueno("reserva-descartar")
    const pieza = await piezaDe(db, cuenta)
    await db.rpc("firmar_para_reserva", { p_pieza: pieza, p_huella: (await versionVigente(pieza)).huella })
    expect((await db.rpc("descartar_pieza", { p_pieza: pieza, p_motivo: "" })).error).toBeNull()
    expect((await planeada(pieza))?.estado).toBe("descartada")
  })
})
