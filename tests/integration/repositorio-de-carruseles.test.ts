import { beforeAll, beforeEach, describe, expect, test } from "vitest"
import type { PedidoDeDiseno } from "@/lib/carrusel/armar"
import { repositorioDeCarruseles } from "@/lib/carrusel/repositorio"
import { contarPedidosAbiertos } from "@/lib/carrusel/vigilar"
import { carruselInicial } from "@/lib/plantillas/iniciales"
import { admin, cuentaDe, marcaConDueno, personaConSesion } from "./entorno"

const diseno = carruselInicial("wav")
const PDF = new TextEncoder().encode("%PDF-1.4 carrusel")

// tomar_pedidos_de_diseno leases the oldest open request of every brand: start each test with none open.
beforeEach(async () => {
  const { error } = await admin()
    .from("pedidos_de_diseno")
    .update({ estado: "obsoleto" })
    .in("estado", ["pendiente", "trabajando"])
  if (error) throw error
})

describe("repositorioDeCarruseles", () => {
  let dueno: Awaited<ReturnType<typeof personaConSesion>>
  let marca: string
  let cuenta: string
  const repo = () => repositorioDeCarruseles(admin())

  beforeAll(async () => {
    dueno = await personaConSesion("repo-carruseles")
    marca = await marcaConDueno(dueno.userId, "nosotros")
    cuenta = await cuentaDe(marca, "empresa", "a_mano")
  })

  async function tomado(): Promise<PedidoDeDiseno> {
    const { data: id, error } = await dueno.db.rpc("pedir_diseno", {
      p_cuenta: cuenta,
      p_tema: "wav-noche",
      p_titulo: "Documento",
      p_texto: "Texto del post",
      p_diseno: diseno,
    })
    if (error) throw error
    const [pedido, ...otros] = await repo().tomar()
    expect(otros).toEqual([])
    expect(pedido?.id).toBe(id)
    if (!pedido) throw new Error("No se tomó el pedido")
    return pedido
  }

  test("takes a queued request with its brand and its slides", async () => {
    expect(await tomado()).toMatchObject({
      marcaId: marca,
      cuentaId: cuenta,
      tema: "wav-noche",
      titulo: "Documento",
      texto: "Texto del post",
      diseno,
    })
  })

  test("takes nothing when no request is open", async () => {
    expect(await repo().tomar()).toEqual([])
  })

  test("uploads a preview into the brand's folder of the bucket", async () => {
    const ruta = `${repo().nuevaRuta(marca)}/01.jpg`
    expect(ruta.startsWith(`${marca}/`)).toBe(true)
    await repo().subir(ruta, new Uint8Array([255, 216, 255]), "image/jpeg")
    const { data, error } = await admin().storage.from("piezas").download(ruta)
    expect(error).toBeNull()
    expect(new Uint8Array(await (data as Blob).arrayBuffer())).toEqual(new Uint8Array([255, 216, 255]))
  })

  test("saves a new carousel as a piece planned on a free slot of the account, with its slides on the version", async () => {
    const pedido = await tomado()
    const ruta = `${repo().nuevaRuta(marca)}.pdf`
    await repo().subir(ruta, PDF, "application/pdf")
    const guardado = await repo().guardar(pedido, ruta, "b".repeat(64))
    if (!guardado) throw new Error("No se guardó el carrusel")
    const { data: pieza } = await admin()
      .from("piezas")
      .select("planeada_para, formato")
      .eq("id", guardado.piezaId)
      .single()
    expect(pieza?.formato).toBe("carrusel_pdf")
    expect(pieza?.planeada_para).not.toBeNull()
    const { data: version } = await admin()
      .from("versiones")
      .select("archivo_ruta, tema, diseno")
      .eq("id", guardado.versionId)
      .single()
    expect(version).toEqual({ archivo_ruta: ruta, tema: "wav-noche", diseno })
    const { data: cerrado } = await admin().from("pedidos_de_diseno").select("estado").eq("id", pedido.id).single()
    expect(cerrado?.estado).toBe("hecho")
  })

  test("closes a request as failed with its reason", async () => {
    const pedido = await tomado()
    await repo().terminar(pedido.id, "fallo", "La lámina 3 no cabe. Acórtala o divídela en dos.")
    const { data } = await admin().from("pedidos_de_diseno").select("estado, motivo").eq("id", pedido.id).single()
    expect(data).toEqual({ estado: "fallo", motivo: "La lámina 3 no cabe. Acórtala o divídela en dos." })
  })

  test("counts requests the renderer could lease: queued, or working with an expired lease", async () => {
    expect(await contarPedidosAbiertos(admin())).toBe(0)
    const pedido = await tomado()
    expect(await contarPedidosAbiertos(admin())).toBe(0)
    const { error } = await admin()
      .from("pedidos_de_diseno")
      .update({ arrendado_hasta: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", pedido.id)
    if (error) throw error
    expect(await contarPedidosAbiertos(admin())).toBe(1)
    const { error: errorAlPedir } = await dueno.db.rpc("pedir_diseno", {
      p_cuenta: cuenta,
      p_tema: "wav-noche",
      p_titulo: "Otro",
      p_texto: "Texto",
      p_diseno: diseno,
    })
    if (errorAlPedir) throw errorAlPedir
    expect(await contarPedidosAbiertos(admin())).toBe(2)
  })
})
