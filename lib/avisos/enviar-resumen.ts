import { huecosDeLaSemana, semanaDe, semanaDelLunes, sumarDias } from "@/lib/piezas/calendario"
import { proponerFecha } from "@/lib/piezas/horarios"
import { calendario } from "@/lib/piezas/lectura"
import type { Db } from "@/lib/supabase/database"
import { balancePorCuenta } from "@/lib/voz/lectura"
import { avisarPersona } from "./a-miembros"
import type { ServicioPush } from "./push"
import { avisosSinEnviar, type LineaPendiente, marcarEnviados } from "./repositorio-de-avisos"
import { armarResumen, type EstadoDelResumen } from "./resumen"

type PorMarca = Omit<EstadoDelResumen, "lineas" | "informes">

function vacio(): PorMarca {
  return { porFirmar: 0, aMano: 0, revisar: 0, reservas: [], huecos: [], pilares: [] }
}

/** Read once: research is not per brand (D17). */
async function informesPorAprobar(db: Db): Promise<number> {
  const { count, error } = await db
    .from("investigaciones")
    .select("id", { count: "exact", head: true })
    .eq("estado", "informe_por_aprobar")
  if (error) throw new Error(`No pude contar los informes por aprobar: ${error.message}`, { cause: error })
  return count ?? 0
}

async function estadoPorMarca(db: Db, ahora: number): Promise<Map<string, PorMarca>> {
  const porMarca = new Map<string, PorMarca>()
  const de = (marcaId: string) => {
    const actual = porMarca.get(marcaId) ?? vacio()
    porMarca.set(marcaId, actual)
    return actual
  }
  const { data: pendientes, error } = await db
    .from("piezas")
    .select("estado, cuentas!inner(marca_id)")
    .in("estado", ["por_aprobar", "a_mano", "envio_dudoso", "error"])
  if (error) throw new Error(`No pude contar las piezas pendientes: ${error.message}`, { cause: error })
  for (const p of pendientes) {
    const e = de(p.cuentas.marca_id)
    if (p.estado === "por_aprobar") e.porFirmar++
    else if (p.estado === "a_mano") e.aMano++
    else e.revisar++
  }

  const esta = semanaDe(ahora)
  const proxima = semanaDelLunes(sumarDias(esta.lunes, 7))
  const { cuentas, piezas } = await calendario(db, esta.desde, proxima.hasta)
  for (const c of cuentas.filter((c) => c.ritmoSemanal > 0)) {
    const e = de(c.marcaId)
    if (c.enReserva < c.ritmoSemanal) e.reservas.push({ cuenta: c.nombre, tiene: c.enReserva, meta: c.ritmoSemanal })
    // This week only counts while it still has a D19 slot ahead: on Thursday evening its gap cannot be filled.
    const semanas = [
      ...(proponerFecha(c.tipo, [], ahora).getTime() < Date.parse(esta.hasta) ? [["esta", esta] as const] : []),
      ["proxima", proxima] as const,
    ]
    for (const [nombre, semana] of semanas) {
      // Instants are compared as numbers: PostgREST returns «+00:00», not the «.000Z» of toISOString.
      const enLaSemana = piezas.filter((p) => {
        const instante = Date.parse(p.instante)
        return p.cuentaId === c.id && instante >= Date.parse(semana.desde) && instante < Date.parse(semana.hasta)
      })
      const faltan = huecosDeLaSemana([c], enLaSemana)[c.id] ?? 0
      if (faltan > 0) e.huecos.push({ cuenta: c.nombre, faltan, semana: nombre })
    }
  }

  // D20: only the alerts; the whole balance lives in the calendar.
  // A failure here must not drop the rest of the digest: it just goes without pillar lines.
  try {
    for (const { marcaId, cuenta, balance } of await balancePorCuenta(db, ahora)) {
      for (const f of balance.filas.filter((f) => f.alerta)) {
        de(marcaId).pilares.push({ cuenta, pilar: f.nombre, dias: f.diasSinSalir })
      }
    }
  } catch (error) {
    console.error(
      "No pude calcular el balance de pilares para el resumen",
      error instanceof Error ? error.message : error,
    )
  }
  return porMarca
}

/** D26: one push per person with every brand they belong to, then the queued lines are marked sent. */
export async function enviarResumenes(
  db: Db,
  servicio: ServicioPush,
  ahora: number,
): Promise<{ avisos: number; lineas: number }> {
  const { data: miembros, error } = await db.from("miembros").select("user_id, marca_id, rol")
  if (error) throw new Error(`No pude leer los miembros: ${error.message}`, { cause: error })
  const porMarca = await estadoPorMarca(db, ahora)
  const lineas = await avisosSinEnviar(db, ahora)
  const informes = await informesPorAprobar(db)
  const marcasDe = new Map<string, string[]>()
  const duenos = new Set<string>()
  for (const m of miembros) {
    marcasDe.set(m.user_id, [...(marcasDe.get(m.user_id) ?? []), m.marca_id])
    if (m.rol === "dueno") duenos.add(m.user_id)
  }

  let avisos = 0
  // Only lines that reached at least one device are marked: a failed or absent device keeps them for the next window.
  const recibidas = new Set<string>()
  for (const [userId, marcas] of marcasDe) {
    // Only an owner can approve a report (aprobar_informe checks es_dueno_de_alguna).
    const estado: EstadoDelResumen = { ...vacio(), informes: duenos.has(userId) ? informes : 0, lineas: [] }
    const suyas: LineaPendiente[] = []
    for (const marcaId of marcas) {
      const e = porMarca.get(marcaId)
      if (e) {
        estado.porFirmar += e.porFirmar
        estado.aMano += e.aMano
        estado.revisar += e.revisar
        estado.reservas.push(...e.reservas)
        estado.huecos.push(...e.huecos)
        estado.pilares.push(...e.pilares)
      }
      suyas.push(...lineas.filter((l) => l.marcaId === marcaId))
    }
    estado.lineas.push(...suyas)
    const aviso = armarResumen(estado)
    if (!aviso) continue
    if ((await avisarPersona(db, servicio, userId, aviso, false)) === 0) continue
    avisos++
    for (const l of suyas) recibidas.add(l.id)
  }
  await marcarEnviados(db, [...recibidas], ahora)
  return { avisos, lineas: lineas.length }
}
