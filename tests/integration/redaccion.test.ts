import { beforeEach, describe, expect, test } from "vitest"
import { admin, cuentaDe, marcaConDueno, personaConSesion, piezaDe, versionVigente } from "./entorno"

const SECCIONES = {
  deQueHablamos: "Eventos",
  tono: "Cercano",
  formatos: "",
  temasVetados: "",
  temasAVigilar: "",
  ejemplos: "",
}

// tomar_pedidos leases the oldest open requests of every brand, so requests an earlier test left open would be leased
// instead of the one under test. Only accounts this file created are touched: the local database is shared with dev.
const cuentasDeEsteArchivo: string[] = []

beforeEach(async () => {
  if (cuentasDeEsteArchivo.length === 0) return
  const { error } = await admin()
    .from("pedidos_de_texto")
    .update({ estado: "fallo", motivo: "Cerrado entre pruebas." })
    .in("cuenta_id", cuentasDeEsteArchivo)
    .in("estado", ["pendiente", "trabajando"])
  if (error) throw error
})

async function conLinea(prefijo = "redaccion") {
  const persona = await personaConSesion(prefijo)
  const marca = await marcaConDueno(persona.userId)
  const { error } = await persona.db.rpc("guardar_linea_editorial", {
    p_marca: marca,
    p_base: 0,
    p_secciones: SECCIONES,
    p_pilares: [{ nombre: "Oficio", deQueHabla: "", material: "", porSemana: 1 }],
  })
  if (error) throw error
  const { data: pilares } = await admin().from("pilares").select("id").eq("marca_id", marca)
  const cuenta = await cuentaDe(marca)
  cuentasDeEsteArchivo.push(cuenta)
  return { ...persona, marca, cuenta, pilar: pilares?.[0]?.id ?? null }
}

async function pedir(
  db: Awaited<ReturnType<typeof conLinea>>["db"],
  cuenta: string,
  encargo = "Un post sobre montaje",
) {
  const { data, error } = await db.rpc("pedir_texto", { p_cuenta: cuenta, p_encargo: encargo })
  if (error) throw error
  return data
}

async function tomar() {
  const { data, error } = await admin().rpc("tomar_pedidos")
  if (error) throw error
  return data
}

const estadoDe = async (pedido: string) =>
  (await admin().from("pedidos_de_texto").select("estado, motivo, resultado_pieza_id").eq("id", pedido).single()).data

describe("pedir_texto", () => {
  test("an owner queues a request for an account of a brand with an editorial line", async () => {
    const e = await conLinea()
    const pedido = await pedir(e.db, e.cuenta)
    expect(await estadoDe(pedido)).toMatchObject({ estado: "pendiente" })
    const { data } = await e.db.from("pedidos_de_texto").select("id").eq("id", pedido)
    expect(data).toHaveLength(1)
  })

  test("refuses a brand with no editorial line, a stranger and a sixth open request", async () => {
    const sinLinea = await personaConSesion("sin-linea")
    const marca = await marcaConDueno(sinLinea.userId)
    const cuenta = await cuentaDe(marca)
    expect((await sinLinea.db.rpc("pedir_texto", { p_cuenta: cuenta, p_encargo: "Algo" })).error?.message).toBe(
      "marca_sin_linea",
    )
    const e = await conLinea()
    const extrano = await personaConSesion("extrano")
    expect((await extrano.db.rpc("pedir_texto", { p_cuenta: e.cuenta, p_encargo: "Algo" })).error?.message).toBe(
      "solo_el_dueno_pide_textos",
    )
    for (let i = 0; i < 5; i++) await pedir(e.db, e.cuenta)
    expect((await e.db.rpc("pedir_texto", { p_cuenta: e.cuenta, p_encargo: "Uno más" })).error?.message).toBe(
      "demasiados_pedidos",
    )
  })

  test("refuses a pillar of another brand", async () => {
    const e = await conLinea()
    const otra = await conLinea("otra")
    const { error } = await e.db.rpc("pedir_texto", {
      p_cuenta: e.cuenta,
      p_encargo: "Algo",
      p_pilar: otra.pilar ?? undefined,
    })
    expect(error?.message).toBe("pilar_no_valido")
  })

  test("people cannot write requests or reviews directly", async () => {
    const e = await conLinea()
    const { error } = await e.db.from("pedidos_de_texto").insert({
      tipo: "escribir",
      cuenta_id: e.cuenta,
      encargo: "x",
      pedido_por: e.userId,
    })
    expect(error).not.toBeNull()
    expect((await e.db.rpc("tomar_pedidos")).error).not.toBeNull()
  })
})

describe("tomar_pedidos and crear_pieza_de_claude", () => {
  test("leases a request once and turns it into a piece waiting for a signature, marked as Claude's", async () => {
    const e = await conLinea()
    const { data: pedido } = await e.db.rpc("pedir_texto", {
      p_cuenta: e.cuenta,
      p_encargo: "Montaje",
      p_pilar: e.pilar ?? undefined,
    })
    const tomados = await tomar()
    expect(tomados.map((p) => p.id)).toContain(pedido)
    expect((await tomar()).map((p) => p.id)).not.toContain(pedido)
    const { data, error } = await admin().rpc("crear_pieza_de_claude", {
      p_pedido: pedido ?? "",
      p_texto: "Texto de Claude",
      p_linea_version: 1,
    })
    expect(error).toBeNull()
    const { pieza } = data as { pieza: string; version: string }
    const { data: fila } = await admin()
      .from("piezas")
      .select("estado, formato, pilar_id, creada_por")
      .eq("id", pieza)
      .single()
    expect(fila).toMatchObject({ estado: "por_aprobar", formato: "texto", pilar_id: e.pilar, creada_por: e.userId })
    const { data: version } = await admin()
      .from("versiones")
      .select("origen, linea_version, creada_por")
      .eq("pieza_id", pieza)
      .single()
    expect(version).toEqual({ origen: "claude", linea_version: 1, creada_por: null })
    expect(await estadoDe(pedido ?? "")).toMatchObject({ estado: "hecho", resultado_pieza_id: pieza })
  })

  test("drops a pillar retired while Claude wrote instead of losing the paid text", async () => {
    const e = await conLinea()
    const { data: pedido } = await e.db.rpc("pedir_texto", {
      p_cuenta: e.cuenta,
      p_encargo: "Montaje",
      p_pilar: e.pilar ?? undefined,
    })
    await admin()
      .from("pilares")
      .update({ activo: false })
      .eq("id", e.pilar ?? "")
    await tomar()
    const { data, error } = await admin().rpc("crear_pieza_de_claude", {
      p_pedido: pedido ?? "",
      p_texto: "Texto",
      p_linea_version: 1,
    })
    expect(error).toBeNull()
    const { pieza } = data as { pieza: string }
    expect((await admin().from("piezas").select("pilar_id").eq("id", pieza).single()).data?.pilar_id).toBeNull()
  })

  test("re-leases a request whose lease expired", async () => {
    const e = await conLinea()
    const pedido = await pedir(e.db, e.cuenta)
    await tomar()
    await admin()
      .from("pedidos_de_texto")
      .update({ arrendado_hasta: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", pedido)
    expect((await tomar()).map((p) => p.id)).toContain(pedido)
  })

  test("refuses to create a piece for a request that is not being worked on", async () => {
    const e = await conLinea()
    const pedido = await pedir(e.db, e.cuenta)
    const { error } = await admin().rpc("crear_pieza_de_claude", {
      p_pedido: pedido,
      p_texto: "Texto",
      p_linea_version: 1,
    })
    expect(error?.message).toBe("pedido_no_esta_trabajando")
  })
})

describe("pedir_reescritura and version_de_claude", () => {
  async function piezaPorFirmar() {
    const e = await conLinea()
    const pieza = await piezaDe(e.db, e.cuenta, "Versión uno")
    return { ...e, pieza }
  }

  test("a rewrite of the current version becomes version 2 by Claude", async () => {
    const e = await piezaPorFirmar()
    const { data: pedido, error } = await e.db.rpc("pedir_reescritura", {
      p_pieza: e.pieza,
      p_instruccion: "Más corto",
    })
    expect(error).toBeNull()
    await tomar()
    const { data: version } = await admin().rpc("version_de_claude", {
      p_pedido: pedido ?? "",
      p_texto: "Corto",
      p_linea_version: 1,
    })
    expect(version).not.toBeNull()
    expect((await versionVigente(e.pieza)).id).toBe(version)
    expect(await estadoDe(pedido ?? "")).toMatchObject({ estado: "hecho" })
  })

  test("a rewrite overtaken by a hand edit is dropped as obsolete", async () => {
    const e = await piezaPorFirmar()
    const { data: pedido } = await e.db.rpc("pedir_reescritura", { p_pieza: e.pieza, p_instruccion: "Más corto" })
    await tomar()
    await e.db.rpc("nueva_version", { p_pieza: e.pieza, p_texto: "Lo corregí yo" })
    const { data: version, error } = await admin().rpc("version_de_claude", {
      p_pedido: pedido ?? "",
      p_texto: "Corto",
      p_linea_version: 1,
    })
    expect(error).toBeNull()
    expect(version).toBeNull()
    expect(await estadoDe(pedido ?? "")).toMatchObject({ estado: "obsoleto" })
  })

  test("refuses a second open request, a fourth rewrite and a piece that is not waiting for a signature", async () => {
    const e = await piezaPorFirmar()
    await e.db.rpc("pedir_reescritura", { p_pieza: e.pieza, p_instruccion: "Uno" })
    expect((await e.db.rpc("pedir_reescritura", { p_pieza: e.pieza, p_instruccion: "Dos" })).error?.message).toBe(
      "pedido_en_curso",
    )
    await admin().from("pedidos_de_texto").update({ estado: "hecho" }).eq("pieza_id", e.pieza)
    for (const instruccion of ["Dos", "Tres"]) {
      const { data } = await e.db.rpc("pedir_reescritura", { p_pieza: e.pieza, p_instruccion: instruccion })
      await admin()
        .from("pedidos_de_texto")
        .update({ estado: "hecho" })
        .eq("id", data ?? "")
    }
    expect((await e.db.rpc("pedir_reescritura", { p_pieza: e.pieza, p_instruccion: "Cuatro" })).error?.message).toBe(
      "sin_reescrituras",
    )
    await e.db.rpc("descartar_pieza", { p_pieza: e.pieza, p_motivo: "" })
    expect((await e.db.rpc("pedir_revision", { p_pieza: e.pieza })).error?.message).toBe("pieza_no_esta_por_aprobar")
  })
})

describe("revisiones_ia", () => {
  test("a requested review is stored once per version and members read it", async () => {
    const e = await conLinea()
    const pieza = await piezaDe(e.db, e.cuenta, "Texto a mano")
    const { data: pedido } = await e.db.rpc("pedir_revision", { p_pieza: pieza })
    await tomar()
    const version = (await versionVigente(pieza)).id
    const veredicto = { voz: { ok: true, comentario: "" }, hallazgos: [] }
    expect(
      (
        await admin().rpc("guardar_revision_ia", {
          p_version: version,
          p_veredicto: veredicto,
          p_pedido: pedido ?? undefined,
        })
      ).error,
    ).toBeNull()
    expect(await estadoDe(pedido ?? "")).toMatchObject({ estado: "hecho" })
    const { data } = await e.db.from("revisiones_ia").select("veredicto").eq("version_id", version).single()
    expect(data?.veredicto).toEqual(veredicto)
    expect((await e.db.rpc("pedir_revision", { p_pieza: pieza })).error?.message).toBe("ya_revisada")
    const extrano = await personaConSesion("extrano-rev")
    expect((await extrano.db.from("revisiones_ia").select("version_id").eq("version_id", version)).data).toEqual([])
  })
})

describe("terminar_pedido", () => {
  test("closes a request being worked on with its reason", async () => {
    const e = await conLinea()
    const pedido = await pedir(e.db, e.cuenta)
    await tomar()
    await admin().rpc("terminar_pedido", { p_pedido: pedido, p_estado: "fallo", p_motivo: "Se alcanzó el tope." })
    expect(await estadoDe(pedido)).toMatchObject({ estado: "fallo", motivo: "Se alcanzó el tope." })
  })
})
