import type Anthropic from "@anthropic-ai/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { libroDeGastos } from "@/lib/gasto/repositorio"
import { type Pedir, pedirPagando } from "@/lib/ia/claude"
import { atenderPedidos } from "@/lib/redaccion/atender"
import { repositorioDeRedaccion } from "@/lib/redaccion/repositorio"
import { admin, cerrarPedidosAbiertos, cuentaDe, marcaConDueno, personaConSesion } from "./entorno"

const SECCIONES = { deQueHablamos: "", tono: "", formatos: "", temasVetados: "", temasAVigilar: "", ejemplos: "" }

beforeEach(cerrarPedidosAbiertos)

describe("atenderPedidos with the database", () => {
  test("a request becomes a reviewed piece waiting for a signature, and the ledger holds both calls", async () => {
    const persona = await personaConSesion("cola")
    const marca = await marcaConDueno(persona.userId)
    await persona.db.rpc("guardar_linea_editorial", {
      p_marca: marca,
      p_base: 0,
      p_secciones: SECCIONES,
      p_pilares: [{ nombre: "Uno", deQueHabla: "", material: "", porSemana: 1 }],
    })
    const cuenta = await cuentaDe(marca)
    const { data: pedido } = await persona.db.rpc("pedir_texto", { p_cuenta: cuenta, p_encargo: "Post" })
    const crear = vi.fn(async (solicitud: Anthropic.MessageCreateParamsNonStreaming) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            JSON.stringify(solicitud.output_config?.format).includes("hallazgos")
              ? { voz: { ok: true, comentario: "" }, hallazgos: [] }
              : { texto: "Texto de prueba", nota: "" },
          ),
        },
      ],
      stop_reason: "end_turn" as const,
      usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    }))
    const db = admin()
    const pedir: Pedir = (paso, p) => pedirPagando({ libro: libroDeGastos(db), avisar: async () => {}, crear }, paso, p)
    await atenderPedidos({ ...repositorioDeRedaccion(db), pedir })

    const { data: fila } = await db
      .from("pedidos_de_texto")
      .select("estado, resultado_pieza_id")
      .eq("id", pedido ?? "")
      .single()
    expect(fila?.estado).toBe("hecho")
    const { data: version } = await db
      .from("versiones")
      .select("id, texto, origen")
      .eq("pieza_id", fila?.resultado_pieza_id ?? "")
      .single()
    expect(version).toMatchObject({ texto: "Texto de prueba", origen: "claude" })
    expect(
      (
        await db
          .from("revisiones_ia")
          .select("version_id")
          .eq("version_id", version?.id ?? "")
      ).data,
    ).toHaveLength(1)
    const { data: gastos } = await db
      .from("gastos")
      .select("clave, estado, marca_id")
      .in("clave", [`escribir:${pedido}`, `revisar:${version?.id}:auto`])
    expect(gastos?.map((g) => g.estado)).toEqual(["confirmado", "confirmado"])
    expect(gastos?.every((g) => g.marca_id === marca)).toBe(true)
  })
})
