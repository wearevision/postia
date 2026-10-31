import { z } from "zod"
import { leerExcepciones } from "@/lib/clientes/lectura"
import { diaEnSantiago } from "@/lib/piezas/calendario"
import { proponerFecha } from "@/lib/piezas/horarios"
import { horariosOcupados, leerTipo } from "@/lib/piezas/lectura"
import type { Db } from "@/lib/supabase/database"
import { lineaDeMarca } from "@/lib/voz/lectura"
import type { PedidoDeTexto, PuertosDeAtencion } from "./atender"
import { type ContextoDeRedaccion, nombresVetados } from "./instrucciones"

// Service role only (Trigger.dev): it reads and writes across brands.

function fallo(accion: string, error: { message: string }): never {
  throw new Error(`${accion}: ${error.message}`, { cause: error })
}

const Creada = z.object({ pieza: z.uuid(), version: z.uuid() })
// Two requests finishing at once can race for the same proposed slot; the slot index refuses the second (23505).
const INTENTOS_DE_PLAN = 3

/** proponerFecha throws when the account has no free slot in its horizon: the piece then goes without a plan. */
function fechaLibre(tipo: "persona" | "empresa", ocupados: readonly number[], ahora: number): Date | null {
  try {
    return proponerFecha(tipo, ocupados, ahora)
  } catch (error) {
    console.error("No encontré horario para la pieza de Claude", error instanceof Error ? error.message : String(error))
    return null
  }
}

/** What Claude gets about a brand and one of its accounts; null when the brand has no editorial line yet. */
export async function contextoDeRedaccion(
  db: Db,
  marcaId: string,
  cuenta: { nombre: string; tipo: string },
): Promise<ContextoDeRedaccion | null> {
  const linea = await lineaDeMarca(db, marcaId)
  if (!linea?.actual) return null
  return {
    marca: { id: linea.marca.id, nombre: linea.marca.nombre, voz: linea.marca.voz },
    cuenta: { nombre: cuenta.nombre, tipo: leerTipo(cuenta.tipo) },
    linea: { version: linea.actual.version, secciones: linea.actual.secciones, pilares: linea.actual.pilares },
    noNombrar: nombresVetados(await leerExcepciones(db), diaEnSantiago(Date.now())),
  }
}

export function repositorioDeRedaccion(db: Db): Omit<PuertosDeAtencion, "pedir"> {
  return {
    async tomar() {
      const { data, error } = await db.rpc("tomar_pedidos")
      if (error) fallo("No pude tomar los pedidos de texto", error)
      if (data.length === 0) return []
      const piezas = data.flatMap((p) => (p.tipo !== "escribir" && p.pieza_id ? [p.pieza_id] : []))
      const [cuentas, pilares, escritos] = await Promise.all([
        db
          .from("cuentas")
          .select("id, marca_id")
          .in("id", [...new Set(data.map((p) => p.cuenta_id))]),
        db
          .from("pilares")
          .select("id, nombre")
          .in(
            "id",
            data.flatMap((p) => (p.pilar_id ? [p.pilar_id] : [])),
          ),
        // A rewrite or a review keeps the material pasted when the piece was asked for.
        db
          .from("pedidos_de_texto")
          .select("resultado_pieza_id, material")
          .eq("tipo", "escribir")
          .in("resultado_pieza_id", piezas),
      ])
      if (cuentas.error) fallo("No pude leer las cuentas de los pedidos", cuentas.error)
      if (pilares.error) fallo("No pude leer los pilares de los pedidos", pilares.error)
      if (escritos.error) fallo("No pude leer el material de los pedidos", escritos.error)
      return data.map(
        (p): PedidoDeTexto => ({
          id: p.id,
          tipo: z.enum(["escribir", "reescribir", "revisar"]).parse(p.tipo),
          marcaId: cuentas.data.find((c) => c.id === p.cuenta_id)?.marca_id ?? "",
          encargo: p.encargo,
          material:
            p.tipo === "escribir"
              ? p.material
              : (escritos.data.find((x) => x.resultado_pieza_id === p.pieza_id)?.material ?? null),
          pilar: pilares.data.find((x) => x.id === p.pilar_id)?.nombre ?? null,
          instruccion: p.instruccion,
          piezaId: p.pieza_id,
          versionId: p.version_id,
        }),
      )
    },

    async contexto(pedido) {
      const { data: pieza, error } = await db
        .from("pedidos_de_texto")
        .select("cuentas(nombre, tipo)")
        .eq("id", pedido.id)
        .single()
      if (error) fallo("No pude leer la cuenta del pedido", error)
      const c = pieza.cuentas ? await contextoDeRedaccion(db, pedido.marcaId, pieza.cuentas) : null
      if (!c) throw new Error(`El pedido ${pedido.id} no tiene marca con línea editorial`)
      return c
    },

    async base(pedido) {
      const [pieza, version, revision] = await Promise.all([
        db
          .from("piezas")
          .select("estado")
          .eq("id", pedido.piezaId ?? "")
          .single(),
        db
          .from("versiones")
          .select("id, texto")
          .eq("pieza_id", pedido.piezaId ?? "")
          .order("numero", { ascending: false })
          .limit(1)
          .single(),
        db
          .from("revisiones_ia")
          .select("version_id")
          .eq("version_id", pedido.versionId ?? "")
          .maybeSingle(),
      ])
      if (pieza.error) fallo("No pude leer la pieza del pedido", pieza.error)
      if (version.error) fallo("No pude leer la versión del pedido", version.error)
      if (revision.error) fallo("No pude leer la revisión de la versión del pedido", revision.error)
      return {
        texto: version.data.texto,
        vigente: pieza.data.estado === "por_aprobar" && version.data.id === pedido.versionId,
        revisada: revision.data !== null,
      }
    },

    async crearPieza(pedido, texto, lineaVersion) {
      const { data: cuenta, error } = await db
        .from("pedidos_de_texto")
        .select("cuenta_id, cuentas(tipo)")
        .eq("id", pedido.id)
        .single()
      if (error) fallo("No pude leer la cuenta del pedido", error)
      const ahora = Date.now()
      const ocupados = await horariosOcupados(db, cuenta.cuenta_id, ahora)
      const tipo = leerTipo(cuenta.cuentas?.tipo ?? "persona")
      for (let intento = 0; intento <= INTENTOS_DE_PLAN; intento++) {
        // After the last try the piece is created without a plan: the paid text is never lost for a slot.
        const fecha = intento < INTENTOS_DE_PLAN ? fechaLibre(tipo, ocupados, ahora) : null
        const { data, error: errorAlCrear } = await db.rpc("crear_pieza_de_claude", {
          p_pedido: pedido.id,
          p_texto: texto,
          p_linea_version: lineaVersion,
          p_planeada_para: fecha?.toISOString(),
        })
        if (!errorAlCrear) {
          const creada = Creada.parse(data)
          return { piezaId: creada.pieza, versionId: creada.version }
        }
        if (errorAlCrear.code !== "23505" || !fecha) fallo("No pude crear la pieza escrita por Claude", errorAlCrear)
        ocupados.push(fecha.getTime())
      }
      throw new Error("No pude crear la pieza escrita por Claude")
    },

    async nuevaVersion(pedido, texto, lineaVersion) {
      const { data, error } = await db.rpc("version_de_claude", {
        p_pedido: pedido.id,
        p_texto: texto,
        p_linea_version: lineaVersion,
      })
      if (error) fallo("No pude guardar la versión de Claude", error)
      return data
    },

    async guardarRevision(versionId, veredicto, pedidoId) {
      const { error } = await db.rpc("guardar_revision_ia", {
        p_version: versionId,
        p_veredicto: veredicto,
        p_pedido: pedidoId ?? undefined,
      })
      if (error) fallo("No pude guardar la revisión de Claude", error)
    },

    async terminar(pedidoId, estado, motivo) {
      const { error } = await db.rpc("terminar_pedido", { p_pedido: pedidoId, p_estado: estado, p_motivo: motivo })
      if (error) fallo("No pude cerrar el pedido de texto", error)
    },
  }
}
