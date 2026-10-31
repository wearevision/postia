import { z } from "zod"
import { proponerFecha } from "@/lib/piezas/horarios"
import { horariosOcupados, leerTipo } from "@/lib/piezas/lectura"
import type { Carrusel } from "@/lib/plantillas/laminas"
import { esTema } from "@/lib/plantillas/temas"
import type { Db } from "@/lib/supabase/database"
import type { PedidoDeDiseno, PuertosDeArmado } from "./armar"

// Service role only (Trigger.dev): it reads and writes across brands.

function fallo(accion: string, error: { message: string }): never {
  throw new Error(`${accion}: ${error.message}`, { cause: error })
}

const Guardado = z.object({ pieza: z.uuid(), version: z.uuid() }).nullable()
// Two saves can race for the same proposed slot; the slot index refuses the second (23505). Same rule as 4c.
const INTENTOS_DE_PLAN = 3

/** proponerFecha throws when the account has no free slot in its horizon: the piece then goes without a plan. */
function fechaLibre(tipo: "persona" | "empresa", ocupados: readonly number[], ahora: number): Date | null {
  try {
    return proponerFecha(tipo, ocupados, ahora)
  } catch (error) {
    console.error("No encontré horario para el carrusel", error instanceof Error ? error.message : String(error))
    return null
  }
}

export function repositorioDeCarruseles(db: Db): Omit<PuertosDeArmado, "renderizar"> {
  return {
    async tomar() {
      const { data, error } = await db.rpc("tomar_pedidos_de_diseno")
      if (error) fallo("No pude tomar los pedidos de diseño", error)
      if (data.length === 0) return []
      const { data: cuentas, error: errorDeCuentas } = await db
        .from("cuentas")
        .select("id, marca_id")
        .in("id", [...new Set(data.map((p) => p.cuenta_id))])
      if (errorDeCuentas) fallo("No pude leer las cuentas de los pedidos de diseño", errorDeCuentas)
      return data.map((p): PedidoDeDiseno => {
        // pedir_diseno only queues themes of tema_de_la_voz, which an integration test keeps equal to TEMAS.
        if (!esTema(p.tema)) throw new Error(`Tema desconocido en el pedido ${p.id}: ${p.tema}`)
        const marcaId = cuentas.find((c) => c.id === p.cuenta_id)?.marca_id
        if (!marcaId) throw new Error(`El pedido de diseño ${p.id} no tiene cuenta`)
        return {
          id: p.id,
          marcaId,
          cuentaId: p.cuenta_id,
          tema: p.tema,
          titulo: p.titulo,
          texto: p.texto,
          // armarCarruseles parses it again through revisarCarrusel before rendering; here it only carries the shape.
          diseno: p.diseno as unknown as Carrusel,
        }
      })
    },

    async subir(ruta, datos, tipo) {
      const { error } = await db.storage.from("piezas").upload(ruta, datos, { contentType: tipo, upsert: false })
      if (error) fallo(`No pude subir ${ruta}`, error)
    },

    async guardar(pedido, ruta, sha256) {
      const { data: cuenta, error } = await db.from("cuentas").select("tipo").eq("id", pedido.cuentaId).single()
      if (error) fallo("No pude leer la cuenta del carrusel", error)
      const ahora = Date.now()
      const ocupados = await horariosOcupados(db, pedido.cuentaId, ahora)
      const tipo = leerTipo(cuenta.tipo)
      for (let intento = 0; intento <= INTENTOS_DE_PLAN; intento++) {
        // After the last try the piece is saved without a plan: a finished render is never lost for a slot.
        // An edit ignores the date; its piece keeps its own plan.
        const fecha = intento < INTENTOS_DE_PLAN ? fechaLibre(tipo, ocupados, ahora) : null
        const { data, error: errorAlGuardar } = await db.rpc("guardar_diseno", {
          p_pedido: pedido.id,
          p_archivo_ruta: ruta,
          p_archivo_sha256: sha256,
          p_planeada_para: fecha?.toISOString(),
        })
        if (!errorAlGuardar) {
          const guardado = Guardado.parse(data)
          return guardado ? { piezaId: guardado.pieza, versionId: guardado.version } : null
        }
        if (errorAlGuardar.code !== "23505" || !fecha) fallo("No pude guardar el carrusel", errorAlGuardar)
        ocupados.push(fecha.getTime())
      }
      throw new Error("No pude guardar el carrusel")
    },

    async terminar(pedidoId, estado, motivo) {
      const { error } = await db.rpc("terminar_pedido_de_diseno", {
        p_pedido: pedidoId,
        p_estado: estado,
        p_motivo: motivo,
      })
      if (error) fallo("No pude cerrar el pedido de diseño", error)
    },

    nuevaRuta: (marcaId) => `${marcaId}/${crypto.randomUUID()}`,
  }
}
