import { beforeEach, describe, expect, test } from "vitest"
import type { PedidoDeTexto } from "@/lib/redaccion/atender"
import { repositorioDeRedaccion } from "@/lib/redaccion/repositorio"
import { admin, cerrarPedidosAbiertos, cuentaDe, marcaConDueno, personaConSesion, piezaDe } from "./entorno"

const SECCIONES = {
  deQueHablamos: "Eventos",
  tono: "",
  formatos: "",
  temasVetados: "",
  temasAVigilar: "",
  ejemplos: "",
}

// tomar_pedidos leases the oldest open requests of every brand: start each test with none open.
beforeEach(cerrarPedidosAbiertos)

async function conLinea() {
  const persona = await personaConSesion("repo-redaccion")
  const marca = await marcaConDueno(persona.userId, "nosotros")
  const { error } = await persona.db.rpc("guardar_linea_editorial", {
    p_marca: marca,
    p_base: 0,
    p_secciones: SECCIONES,
    p_pilares: [{ nombre: "Oficio", deQueHabla: "Montaje", material: "", porSemana: 1 }],
  })
  if (error) throw error
  const { data: pilares } = await admin().from("pilares").select("id").eq("marca_id", marca)
  return { ...persona, marca, cuenta: await cuentaDe(marca, "empresa", "a_mano"), pilar: pilares?.[0]?.id }
}

async function tomado(repo: ReturnType<typeof repositorioDeRedaccion>, pedido: string | null): Promise<PedidoDeTexto> {
  const encontrado = (await repo.tomar()).find((p) => p.id === pedido)
  if (!encontrado) throw new Error(`No se tomó el pedido ${pedido}`)
  return encontrado
}

describe("repositorioDeRedaccion", () => {
  test("takes a request with its brand and pillar name and builds the brand context from the current line", async () => {
    const e = await conLinea()
    const { data: pedido } = await e.db.rpc("pedir_texto", {
      p_cuenta: e.cuenta,
      p_encargo: "Montaje",
      p_pilar: e.pilar,
    })
    const repo = repositorioDeRedaccion(admin())
    const p = await tomado(repo, pedido)
    expect(p).toMatchObject({ tipo: "escribir", marcaId: e.marca, encargo: "Montaje", pilar: "Oficio" })
    const c = await repo.contexto(p)
    expect(c.marca).toMatchObject({ id: e.marca, voz: "nosotros" })
    expect(c.cuenta.tipo).toBe("empresa")
    expect(c.linea.version).toBe(1)
    expect(c.linea.secciones.deQueHablamos).toBe("Eventos")
  })

  test("creates the piece in the account's first free slot", async () => {
    const e = await conLinea()
    const { data: pedido } = await e.db.rpc("pedir_texto", { p_cuenta: e.cuenta, p_encargo: "Montaje" })
    const repo = repositorioDeRedaccion(admin())
    const { piezaId } = await repo.crearPieza(await tomado(repo, pedido), "Texto", 1)
    const { data } = await admin().from("piezas").select("planeada_para").eq("id", piezaId).single()
    expect(data?.planeada_para).not.toBeNull()
  })

  test("says whether the version a rewrite starts from is still the current unsigned one", async () => {
    const e = await conLinea()
    const pieza = await piezaDe(e.db, e.cuenta, "Uno")
    const { data: pedido } = await e.db.rpc("pedir_reescritura", { p_pieza: pieza, p_instruccion: "Corto" })
    const repo = repositorioDeRedaccion(admin())
    const p = await tomado(repo, pedido)
    expect(await repo.base(p)).toEqual({ texto: "Uno", vigente: true })
    await e.db.rpc("nueva_version", { p_pieza: pieza, p_texto: "Dos" })
    expect((await repo.base(p)).vigente).toBe(false)
  })
})
