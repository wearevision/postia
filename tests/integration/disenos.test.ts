import { beforeAll, describe, expect, test } from "vitest"
import { carruselInicial } from "@/lib/plantillas/iniciales"
import { IDS_DE_TEMA, temasDeLaVoz } from "@/lib/plantillas/temas"
import { admin, carruselDe, cuentaDe, enDias, marcaConDueno, personaConSesion, versionVigente } from "./entorno"

const diseno = carruselInicial("wav")
const pedido = (cuenta: string, extra: { p_tema?: string; p_pieza?: string } = {}) => ({
  p_cuenta: cuenta,
  p_tema: "wav-noche",
  p_titulo: "Documento",
  p_texto: "Texto del post",
  p_diseno: diseno,
  ...extra,
})
const RUTA = (marca: string) => `${marca}/${crypto.randomUUID()}.pdf`
const SHA = "a".repeat(64)

/** tomar_pedidos_de_diseno is global and takes the oldest: close every other open request first. */
async function tomarSolo(id: string): Promise<void> {
  const { error } = await admin()
    .from("pedidos_de_diseno")
    .update({ estado: "obsoleto" })
    .in("estado", ["pendiente", "trabajando"])
    .neq("id", id)
  if (error) throw error
  const { data } = await admin().rpc("tomar_pedidos_de_diseno")
  expect(data?.map((p) => p.id)).toEqual([id])
}

describe("design requests", () => {
  let dueno: Awaited<ReturnType<typeof personaConSesion>>
  let marca: string
  let cuenta: string
  beforeAll(async () => {
    dueno = await personaConSesion("e2e-disenos")
    marca = await marcaConDueno(dueno.userId, "nosotros")
    cuenta = await cuentaDe(marca, "empresa", "a_mano")
  })

  test("SQL and TypeScript agree on which themes each voice may use", async () => {
    for (const voz of ["yo", "nosotros"] as const)
      for (const tema of IDS_DE_TEMA) {
        const { data, error } = await admin().rpc("tema_de_la_voz", { p_tema: tema, p_voz: voz })
        expect(error).toBeNull()
        expect(data, `${voz} ${tema}`).toBe(temasDeLaVoz(voz).includes(tema))
      }
  })

  test("an owner queues a design in any of the 9 themes; an unknown theme is refused", async () => {
    const { data, error } = await dueno.db.rpc("pedir_diseno", pedido(cuenta))
    expect(error).toBeNull()
    expect(data).toMatch(/^[0-9a-f-]{36}$/)
    await admin()
      .from("pedidos_de_diseno")
      .update({ estado: "obsoleto" })
      .eq("id", data as string)
    const otra = await dueno.db.rpc("pedir_diseno", pedido(cuenta, { p_tema: "personal-claro" }))
    expect(otra.error).toBeNull()
    await admin()
      .from("pedidos_de_diseno")
      .update({ estado: "obsoleto" })
      .eq("id", otra.data as string)
    const rara = await dueno.db.rpc("pedir_diseno", pedido(cuenta, { p_tema: "neon" }))
    expect(rara.error?.message).toBe("tema_desconocido")
  })

  test("SQL knows exactly the 9 TypeScript themes", async () => {
    for (const tema of [...IDS_DE_TEMA, "neon"]) {
      const { data, error } = await admin().rpc("tema_conocido", { p_tema: tema })
      expect(error).toBeNull()
      expect(data, tema).toBe(IDS_DE_TEMA.includes(tema as (typeof IDS_DE_TEMA)[number]))
    }
  })

  test("a design far larger than any 10 slides is refused by the table itself", async () => {
    const enorme = { ...diseno, relleno: "x".repeat(70_000) }
    const { error } = await dueno.db.rpc("pedir_diseno", { ...pedido(cuenta), p_diseno: enorme })
    expect(error?.code).toBe("23514")
  })

  test("the worker takes it, saves a carousel piece with its slides and a proposed date", async () => {
    const { data: id } = await dueno.db.rpc("pedir_diseno", pedido(cuenta))
    await tomarSolo(id as string)
    const ruta = RUTA(marca)
    const planeada = enDias(3)
    const { data: guardado, error } = await admin().rpc("guardar_diseno", {
      p_pedido: id as string,
      p_archivo_ruta: ruta,
      p_archivo_sha256: SHA,
      p_planeada_para: planeada,
    })
    expect(error).toBeNull()
    const { pieza } = guardado as { pieza: string; version: string }
    const { data: v } = await admin()
      .from("versiones")
      .select("tema, diseno, archivo_ruta, titulo")
      .eq("pieza_id", pieza)
      .single()
    expect(v).toMatchObject({ tema: "wav-noche", archivo_ruta: ruta, titulo: "Documento" })
    expect(v?.diseno).toEqual(diseno)
    const { data: pz } = await admin().from("piezas").select("formato, estado, planeada_para").eq("id", pieza).single()
    expect(pz?.formato).toBe("carrusel_pdf")
    expect(pz?.estado).toBe("por_aprobar")
    expect(new Date(pz?.planeada_para ?? 0).getTime()).toBe(new Date(planeada).getTime())
    const { data: p } = await admin()
      .from("pedidos_de_diseno")
      .select("estado, resultado_pieza_id")
      .eq("id", id as string)
      .single()
    expect(p).toEqual({ estado: "hecho", resultado_pieza_id: pieza })
  })

  test("a new render of a signed piece is a new version that drops the signature", async () => {
    const pieza = await carruselDe(dueno.db, cuenta, marca)
    const v1 = await versionVigente(pieza)
    const firma = await dueno.db.rpc("firmar_pieza", {
      p_pieza: pieza,
      p_huella: v1.huella,
      p_programada_para: enDias(4),
    })
    expect(firma.error).toBeNull()
    const { data: id, error } = await dueno.db.rpc("pedir_diseno", pedido(cuenta, { p_pieza: pieza }))
    expect(error).toBeNull()
    await tomarSolo(id as string)
    const { data: guardado } = await admin().rpc("guardar_diseno", {
      p_pedido: id as string,
      p_archivo_ruta: RUTA(marca),
      p_archivo_sha256: SHA,
    })
    expect(guardado).not.toBeNull()
    const { data: p } = await admin().from("piezas").select("estado").eq("id", pieza).single()
    expect(p?.estado).toBe("por_aprobar")
    const { data: vigentes } = await admin().from("firmas").select("id").eq("pieza_id", pieza).eq("vigente", true)
    expect(vigentes).toEqual([])
  })

  test("an edit asked on an old version is obsolete when the piece moved on", async () => {
    const pieza = await carruselDe(dueno.db, cuenta, marca)
    const { data: id } = await dueno.db.rpc("pedir_diseno", pedido(cuenta, { p_pieza: pieza }))
    const otra = await dueno.db.rpc("nueva_version", {
      p_pieza: pieza,
      p_texto: "Cambio a mano",
      p_titulo: "Documento",
      p_archivo_ruta: RUTA(marca),
      p_archivo_sha256: SHA,
    })
    expect(otra.error).toBeNull()
    await tomarSolo(id as string)
    const { data, error } = await admin().rpc("guardar_diseno", {
      p_pedido: id as string,
      p_archivo_ruta: RUTA(marca),
      p_archivo_sha256: SHA,
    })
    expect(error).toBeNull()
    expect(data).toBeNull()
    const { data: p } = await admin()
      .from("pedidos_de_diseno")
      .select("estado")
      .eq("id", id as string)
      .single()
    expect(p?.estado).toBe("obsoleto")
  })

  test("a request whose lease expired twice is closed as failed instead of leased a third time", async () => {
    const { data: id } = await dueno.db.rpc("pedir_diseno", pedido(cuenta))
    await tomarSolo(id as string)
    const vencer = async () => {
      const { error } = await admin()
        .from("pedidos_de_diseno")
        .update({ arrendado_hasta: new Date(Date.now() - 60_000).toISOString() })
        .eq("id", id as string)
      if (error) throw error
    }
    await vencer()
    const segunda = await admin().rpc("tomar_pedidos_de_diseno")
    expect(segunda.data?.map((p) => [p.id, p.intentos])).toEqual([[id, 2]])
    await vencer()
    const tercera = await admin().rpc("tomar_pedidos_de_diseno")
    expect(tercera.error).toBeNull()
    expect(tercera.data).toEqual([])
    const { data: p } = await admin()
      .from("pedidos_de_diseno")
      .select("estado, motivo, arrendado_hasta")
      .eq("id", id as string)
      .single()
    expect(p).toEqual({
      estado: "fallo",
      motivo: "No pude armar el carrusel después de dos intentos. Revisa las láminas o pídelo de nuevo.",
      arrendado_hasta: null,
    })
  })

  test("people cannot call the worker's RPCs", async () => {
    const { data: id } = await dueno.db.rpc("pedir_diseno", pedido(cuenta))
    await tomarSolo(id as string)
    const guardar = await dueno.db.rpc("guardar_diseno", {
      p_pedido: id as string,
      p_archivo_ruta: RUTA(marca),
      p_archivo_sha256: SHA,
    })
    expect(guardar.error?.code).toBe("42501")
    expect((await dueno.db.rpc("tomar_pedidos_de_diseno")).error?.code).toBe("42501")
    const terminar = await dueno.db.rpc("terminar_pedido_de_diseno", {
      p_pedido: id as string,
      p_estado: "fallo",
      p_motivo: "x",
    })
    expect(terminar.error?.code).toBe("42501")
    const { data: p } = await admin()
      .from("pedidos_de_diseno")
      .select("estado")
      .eq("id", id as string)
      .single()
    expect(p?.estado).toBe("trabajando")
  })

  test("at most 5 open requests per brand, one per piece, only owners ask, and only members see them", async () => {
    const otro = await personaConSesion("e2e-disenos-limite")
    const marcaB = await marcaConDueno(otro.userId, "nosotros")
    const cuentaB = await cuentaDe(marcaB, "empresa", "a_mano")
    const pieza = await carruselDe(otro.db, cuentaB, marcaB)
    expect((await otro.db.rpc("pedir_diseno", pedido(cuentaB, { p_pieza: pieza }))).error).toBeNull()
    const repetido = await otro.db.rpc("pedir_diseno", pedido(cuentaB, { p_pieza: pieza }))
    expect(repetido.error?.message).toBe("pedido_en_curso")
    for (let i = 0; i < 4; i++) expect((await otro.db.rpc("pedir_diseno", pedido(cuentaB))).error).toBeNull()
    const sexto = await otro.db.rpc("pedir_diseno", pedido(cuentaB))
    expect(sexto.error?.message).toBe("demasiados_pedidos")
    const ajeno = await dueno.db.rpc("pedir_diseno", pedido(cuentaB))
    expect(ajeno.error?.message).toBe("solo_el_dueno_pide_disenos")
    const { data: vistos } = await dueno.db.from("pedidos_de_diseno").select("id").eq("cuenta_id", cuentaB)
    expect(vistos).toEqual([])
    const { data: propios } = await otro.db.from("pedidos_de_diseno").select("id").eq("cuenta_id", cuentaB)
    expect(propios).toHaveLength(5)
  })

  test("the bucket takes JPEG previews", async () => {
    const { error } = await admin()
      .storage.from("piezas")
      .upload(`${marca}/${crypto.randomUUID()}/01.jpg`, new Uint8Array([0xff, 0xd8, 0xff]), {
        contentType: "image/jpeg",
      })
    expect(error).toBeNull()
  })
})
