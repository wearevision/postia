import { z } from "zod"
import { avisarPersona } from "@/lib/avisos/a-miembros"
import type { ServicioPush } from "@/lib/avisos/push"
import type { MensajePush } from "@/lib/avisos/tipos"
import type { Db } from "@/lib/supabase/database"
import type { AvisoDeTope, LibroDeGastos, Reserva } from "./pagar"
import { enDolares } from "./precios"

const RUTA_DEL_GASTO = "/ajustes"

const Aviso = z
  .object({
    alcance: z.string(),
    umbral: z.union([z.literal(80), z.literal(100)]),
    gastado_micro: z.number(),
    tope_micro: z.number(),
  })
  .transform(
    (a): AvisoDeTope => ({
      alcance: a.alcance,
      umbral: a.umbral,
      gastadoMicro: a.gastado_micro,
      topeMicro: a.tope_micro,
    }),
  )

const RespuestaDeReserva = z.discriminatedUnion("estado", [
  z.object({ estado: z.literal("reservado"), avisos: z.array(Aviso) }),
  z.object({ estado: z.literal("ya_existe"), avisos: z.array(Aviso) }),
  z.object({ estado: z.literal("tope_alcanzado"), alcance: z.string(), avisos: z.array(Aviso) }),
])

const RespuestaDeConfirmacion = z.object({ avisos: z.array(Aviso) })

function fallo(accion: string, error: { message: string }): never {
  throw new Error(`${accion}: ${error.message}`, { cause: error })
}

/** The ledger RPCs. `ahora` exists for tests; production uses the database clock. */
export function libroDeGastos(db: Db, opciones: { ahora?: () => string } = {}): LibroDeGastos {
  return {
    async reservar(pedido): Promise<Reserva> {
      const { data, error } = await db.rpc("reservar_gasto", {
        p_clave: pedido.clave,
        p_proveedor: pedido.proveedor,
        p_paso: pedido.paso,
        p_estimado_micro: pedido.estimadoMicro,
        p_marca: pedido.marcaId ?? undefined,
        p_ahora: opciones.ahora?.(),
      })
      if (error) fallo("No pude reservar el gasto", error)
      return RespuestaDeReserva.parse(data)
    },
    async confirmar(clave, realMicro) {
      const { data, error } = await db.rpc("confirmar_gasto", {
        p_clave: clave,
        p_real_micro: realMicro,
        p_ahora: opciones.ahora?.(),
      })
      if (error) fallo("No pude confirmar el gasto", error)
      return RespuestaDeConfirmacion.parse(data).avisos
    },
    async liberar(clave) {
      const { error } = await db.rpc("liberar_gasto", { p_clave: clave, p_ahora: opciones.ahora?.() })
      if (error) fallo("No pude liberar el gasto", error)
    },
  }
}

export function mensajeDeTope(aviso: AvisoDeTope, nombreDeMarca: string | null): MensajePush {
  const cuenta = `Van ${enDolares(aviso.gastadoMicro)} de ${enDolares(aviso.topeMicro)}`
  if (nombreDeMarca === null) {
    return aviso.umbral === 80
      ? { titulo: "Gasto al 80 %", cuerpo: `${cuenta} este mes.`, url: RUTA_DEL_GASTO }
      : {
          titulo: "Llegaste al tope de gasto",
          cuerpo: `${cuenta}. Lo que gasta queda en pausa hasta el próximo mes o hasta que subas el tope en Ajustes.`,
          url: RUTA_DEL_GASTO,
        }
  }
  return aviso.umbral === 80
    ? { titulo: `${nombreDeMarca} va en el 80 % de su tope`, cuerpo: `${cuenta} este mes.`, url: RUTA_DEL_GASTO }
    : {
        titulo: `${nombreDeMarca} llegó a su tope`,
        cuerpo: `${cuenta}. Lo que esa marca gasta queda en pausa hasta el próximo mes o hasta que subas su tope.`,
        url: RUTA_DEL_GASTO,
      }
}

/**
 * Federico's decision: the 80 % mark and the cap are immediate pushes to every owner, not digest lines. A push that
 * fails for one owner is logged and the rest still go out.
 */
export async function avisarTope(db: Db, servicio: ServicioPush, avisos: readonly AvisoDeTope[]): Promise<void> {
  if (avisos.length === 0) return
  const { data: duenos, error } = await db
    .from("miembros")
    .select("user_id, marca_id, marcas(nombre)")
    .eq("rol", "dueno")
  if (error) fallo("No pude leer los dueños", error)
  const nombres = new Map(duenos.map((d) => [d.marca_id, d.marcas?.nombre ?? null]))
  const personas = [...new Set(duenos.map((d) => d.user_id))]
  for (const aviso of avisos) {
    const nombre = aviso.alcance === "global" ? null : (nombres.get(aviso.alcance) ?? "Una marca")
    for (const persona of personas) {
      try {
        await avisarPersona(db, servicio, persona, mensajeDeTope(aviso, nombre), true)
      } catch (error) {
        // One owner's failing push must not cost the others theirs: the notice row is already written, so no retry.
        console.error(
          `No pude avisar el tope (${aviso.alcance}, ${aviso.umbral} %) a ${persona}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
  }
}

export async function barrerGastos(db: Db): Promise<number> {
  const { data, error } = await db.rpc("barrer_gastos")
  if (error) fallo("No pude barrer los gastos vencidos", error)
  return data
}
