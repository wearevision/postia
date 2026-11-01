import { z } from "zod"
import type { Resultado } from "@/lib/marcas/acciones"
import { repartirFechas } from "@/lib/piezas/horarios"
import { horariosOcupados, leerTipo } from "@/lib/piezas/lectura"
import type { Db } from "@/lib/supabase/database"
import { leerEsqueleto } from "./esqueleto"
import { LARGO_DE_GANCHO } from "./propuestas"

// Worker-safe: people review the series here; Claude proposes and writes in Trigger.dev (lib/series/armar, escribir).

const MENSAJES: Record<string, string> = {
  solo_duenos_investigan: "Solo el dueño de una marca puede revisar ideas.",
  solo_el_dueno_aprueba: "Solo el dueño de la marca de esa cuenta puede aprobar esta idea.",
  solo_el_dueno_planea: "Solo el dueño de la marca de esa cuenta puede moverla.",
  asignaciones_invalidas: "Revisa las cuentas elegidas.",
  idea_no_esta_propuesta: "Esta idea ya no espera tu revisión.",
  idea_no_descartable: "Esta idea ya no se puede descartar.",
  idea_no_editable: "Esta idea ya no se puede editar.",
  esqueleto_no_valido: "Revisa el esqueleto.",
  fecha_no_valida: "Elige un día hábil que no haya pasado.",
  cuenta_repetida: "Esa cuenta ya tiene esta idea.",
  horario_ocupado: "Esa cuenta ya tiene algo en ese horario. Elige otro.",
  trabajo_en_curso: "Ya se está buscando otra idea.",
  asignacion_no_movible: "Esta pieza ya se está escribiendo. Muévela desde la pieza cuando llegue.",
  serie_no_disponible: "Este informe ya tiene su serie o se está armando.",
}

function falla(error: { code?: string; message: string }): { ok: false; error: string } {
  if (Object.hasOwn(MENSAJES, error.message)) return { ok: false, error: MENSAJES[error.message] }
  console.error("Falla inesperada en una idea", error.code, error.message)
  return { ok: false, error: "No pude guardar. Inténtalo de nuevo en un rato." }
}

const Id = z.uuid()

const Aprobacion = z.object({
  ideaId: z.uuid("Revisa la idea."),
  cuentas: z
    .array(z.uuid("Revisa las cuentas elegidas."))
    .min(1, "Elige al menos una cuenta.")
    .max(10, "Son 10 cuentas como máximo."),
})

async function fechasPropuestas(
  db: Db,
  cuentas: readonly string[],
  ahora: number,
): Promise<{ cuenta: string; planeada_para: string }[]> {
  const { data, error } = await db
    .from("cuentas")
    .select("id, tipo")
    .in("id", [...cuentas])
  if (error) throw new Error(`No pude leer las cuentas: ${error.message}`, { cause: error })
  const tipos = new Map(data.map((c) => [c.id, leerTipo(c.tipo)]))
  return Promise.all(
    cuentas.map(async (cuenta) => {
      const tipo = tipos.get(cuenta)
      if (!tipo) throw new CuentaInvisible()
      const [fecha] = repartirFechas(tipo, await horariosOcupados(db, cuenta, ahora), 1, ahora)
      return { cuenta, planeada_para: fecha.toISOString() }
    }),
  )
}

class CuentaInvisible extends Error {}

/** Where the approval left one account: the slot its piece was planned on. */
export interface AsignacionAprobada {
  cuentaId: string
  planeadaPara: string
}

/** aprobar_idea's trabajo_en_curso: the open job is a replacement of this idea («Pedir otra»). */
const OTRA_EN_CURSO = "Se está escribiendo otra versión de esta idea. Espera a que termine."

/**
 * Plans the idea on each account's next free slot (D19) and approves it. Two approvals can race for one slot: the
 * database refuses the second (horario_ocupado) and this retries once with fresh slots, as 4c does.
 */
export async function aprobarIdea(
  db: Db,
  entrada: unknown,
  ahora = Date.now(),
): Promise<Resultado<{ asignaciones: AsignacionAprobada[] }>> {
  const leida = Aprobacion.safeParse(entrada)
  if (!leida.success) return { ok: false, error: leida.error.issues[0]?.message ?? "Revisa la idea." }
  const cuentas = [...new Set(leida.data.cuentas)]
  try {
    for (let intento = 0; ; intento++) {
      const asignaciones = await fechasPropuestas(db, cuentas, ahora)
      const { error } = await db.rpc("aprobar_idea", { p_idea: leida.data.ideaId, p_asignaciones: asignaciones })
      if (!error) {
        return {
          ok: true,
          asignaciones: asignaciones.map((a) => ({ cuentaId: a.cuenta, planeadaPara: a.planeada_para })),
        }
      }
      if (error.message === "trabajo_en_curso") return { ok: false, error: OTRA_EN_CURSO }
      if (error.message !== "horario_ocupado" || intento >= 1) return falla(error)
    }
  } catch (causa) {
    if (causa instanceof CuentaInvisible) return { ok: false, error: MENSAJES.solo_el_dueno_aprueba }
    console.error("No pude proponer las fechas de una idea", causa instanceof Error ? causa.message : String(causa))
    const sinHorario = causa instanceof Error && causa.message.startsWith("No encontré un horario libre")
    return {
      ok: false,
      error: sinHorario ? causa.message : "No pude proponer las fechas. Inténtalo de nuevo en un rato.",
    }
  }
}

/** Every proposal of the series, in its order, with its suggested account: each takes the next free slot. */
export async function aprobarSerie(
  db: Db,
  investigacionId: string,
  ahora = Date.now(),
): Promise<Resultado<{ aprobadas: number }>> {
  if (!Id.safeParse(investigacionId).success) return { ok: false, error: "Revisa la serie." }
  const { data, error } = await db
    .from("ideas")
    .select("id, cuenta_sugerida")
    .eq("investigacion_id", investigacionId)
    .eq("estado", "propuesta")
    .order("orden")
  if (error) return falla(error)
  if (data.length === 0) return { ok: false, error: "Esta serie no tiene propuestas por aprobar." }
  let aprobadas = 0
  for (const idea of data) {
    const r = await aprobarIdea(db, { ideaId: idea.id, cuentas: [idea.cuenta_sugerida] }, ahora)
    if (r.ok) {
      aprobadas++
      continue
    }
    // Someone may have approved this idea on its own since the list was read: that is not a failure of the series.
    const { data: actual } = await db.from("ideas").select("estado").eq("id", idea.id).maybeSingle()
    if (actual && actual.estado !== "propuesta") continue
    return { ok: false, error: aprobadas > 0 ? `Aprobé ${aprobadas} de ${data.length}. ${r.error}` : r.error }
  }
  return { ok: true, aprobadas }
}

export async function descartarIdea(db: Db, ideaId: string): Promise<Resultado> {
  if (!Id.safeParse(ideaId).success) return { ok: false, error: "Revisa la idea." }
  const { error } = await db.rpc("descartar_idea", { p_idea: ideaId })
  return error ? falla(error) : { ok: true }
}

const Edicion = z.object({
  ideaId: z.uuid("Revisa la idea."),
  gancho: z
    .string()
    .trim()
    .min(1, "Escribe el gancho.")
    .max(LARGO_DE_GANCHO, `El gancho pasa los ${LARGO_DE_GANCHO} caracteres.`),
  esqueleto: z.string().max(5000, "El esqueleto es muy largo."),
})

/** The skeleton arrives as one line per beat («Portada: …»), the way the card shows it. */
export async function editarIdea(db: Db, entrada: unknown): Promise<Resultado> {
  const leida = Edicion.safeParse(entrada)
  if (!leida.success) return { ok: false, error: leida.error.issues[0]?.message ?? "Revisa la idea." }
  const { data: idea, error } = await db.from("ideas").select("formato").eq("id", leida.data.ideaId).maybeSingle()
  if (error) return falla(error)
  if (!idea) return { ok: false, error: "Revisa la idea." }
  const esqueleto = leerEsqueleto(idea.formato === "carrusel_pdf" ? "carrusel_pdf" : "texto", leida.data.esqueleto)
  if (!esqueleto.ok) return esqueleto
  const { error: errorDeEdicion } = await db.rpc("editar_idea", {
    p_idea: leida.data.ideaId,
    p_gancho: leida.data.gancho,
    p_esqueleto: esqueleto.esqueleto,
  })
  return errorDeEdicion ? falla(errorDeEdicion) : { ok: true }
}

export async function pedirOtraIdea(db: Db, ideaId: string): Promise<Resultado> {
  if (!Id.safeParse(ideaId).success) return { ok: false, error: "Revisa la idea." }
  const { error } = await db.rpc("pedir_otra_idea", { p_idea: ideaId })
  return error ? falla(error) : { ok: true }
}

const Movida = z.object({
  asignacionId: z.uuid("Revisa la pieza."),
  planeadaPara: z.iso.datetime({ offset: true, message: "Elige la fecha y la hora." }),
})

export async function moverAsignacion(db: Db, entrada: unknown): Promise<Resultado> {
  const leida = Movida.safeParse(entrada)
  if (!leida.success) return { ok: false, error: leida.error.issues[0]?.message ?? "Revisa la fecha." }
  const { error } = await db.rpc("mover_asignacion", {
    p_asignacion: leida.data.asignacionId,
    p_fecha: leida.data.planeadaPara,
  })
  return error ? falla(error) : { ok: true }
}

/** For a report approved before 4f, or whose series did not come out. */
export async function pedirSerie(db: Db, investigacionId: string): Promise<Resultado> {
  if (!Id.safeParse(investigacionId).success) return { ok: false, error: "Revisa el informe." }
  const { error } = await db.rpc("pedir_serie", { p_investigacion: investigacionId })
  return error ? falla(error) : { ok: true }
}
