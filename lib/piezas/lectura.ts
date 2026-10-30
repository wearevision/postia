import { z } from "zod"
import { type EstadoDePieza, esEstado } from "@/lib/piezas/estados"
import { proponerFecha } from "@/lib/piezas/horarios"
import type { Db } from "@/lib/supabase/database"

export interface TarjetaDePieza {
  id: string
  estado: EstadoDePieza
  cuenta: string
  marca: string
  programadaPara: string | null
  planeadaPara: string | null
  extracto: string
  motivo: string | null
}

export interface Bandeja {
  porFirmar: TarjetaDePieza[]
  enReserva: TarjetaDePieza[]
  aMano: TarjetaDePieza[]
  revisar: TarjetaDePieza[]
  proximas: TarjetaDePieza[]
  masAdelante: TarjetaDePieza[]
}

const CATORCE_DIAS_MS = 14 * 86_400_000
const LARGO_DEL_EXTRACTO = 90

export function leerEstado(valor: string): EstadoDePieza {
  if (!esEstado(valor)) throw new Error(`Estado de pieza desconocido: ${valor}`)
  return valor
}

function leerFormato(valor: string): "texto" | "carrusel_pdf" {
  if (valor !== "texto" && valor !== "carrusel_pdf") throw new Error(`Formato de pieza desconocido: ${valor}`)
  return valor
}

export function leerTipo(valor: string): "persona" | "empresa" {
  if (valor !== "persona" && valor !== "empresa") throw new Error(`Tipo de cuenta desconocido: ${valor}`)
  return valor
}

function leerRuta(valor: string): "api" | "metricool" | "a_mano" {
  if (valor !== "api" && valor !== "metricool" && valor !== "a_mano")
    throw new Error(`Ruta de cuenta desconocida: ${valor}`)
  return valor
}

function ultimaVersion<V extends { numero: number }>(versiones: V[]): V | undefined {
  return [...versiones].sort((a, b) => b.numero - a.numero)[0]
}

// The states that hold a slot: the plan of an unsigned piece, or the signed date (planeada_para follows it while signed).
const CON_HORARIO = ["por_aprobar", "programada", "publicando", "publicada"] as const
// What the calendar shows (a_mano, envio_dudoso and error show here by their old slot but hold none): anything with a slot that is out, may still go out, or needs a person.
const EN_EL_CALENDARIO = [
  "por_aprobar",
  "programada",
  "publicando",
  "publicada",
  "a_mano",
  "envio_dudoso",
  "error",
] as const

function extractoDe(versiones: { numero: number; texto: string; titulo: string | null }[], largo = LARGO_DEL_EXTRACTO) {
  const ultima = ultimaVersion(versiones)
  const base = [...(ultima?.titulo ?? ultima?.texto ?? "")]
  return base.length > largo ? `${base.slice(0, largo).join("")}…` : base.join("")
}

/** The slots an account holds from `desde` on, signed and planned alike (plano: huecosLibres reads this). */
export async function horariosOcupados(db: Db, cuentaId: string, desde: number, excepto?: string): Promise<number[]> {
  let consulta = db
    .from("piezas")
    .select("planeada_para")
    .eq("cuenta_id", cuentaId)
    .in("estado", [...CON_HORARIO])
    .gte("planeada_para", new Date(desde).toISOString())
  if (excepto) consulta = consulta.neq("id", excepto)
  const { data, error } = await consulta
  if (error) throw new Error(`No pude leer los horarios: ${error.message}`, { cause: error })
  return data.flatMap((f) => (f.planeada_para === null ? [] : [Date.parse(f.planeada_para)]))
}

export interface CuentaDelCalendario {
  id: string
  nombre: string
  marcaId: string
  tipo: "persona" | "empresa"
  ritmoSemanal: number
  enReserva: number
}

export interface PiezaDelCalendario {
  id: string
  cuentaId: string
  estado: EstadoDePieza
  instante: string
  firmada: boolean
  extracto: string
}

const RangoDelCalendario = z.object({
  desde: z.iso.datetime({ offset: true }),
  hasta: z.iso.datetime({ offset: true }),
})
const SEIS_SEMANAS_MS = 42 * 86_400_000

export async function calendario(
  db: Db,
  desde: string,
  hasta: string,
): Promise<{ cuentas: CuentaDelCalendario[]; piezas: PiezaDelCalendario[] }> {
  const rango = RangoDelCalendario.safeParse({ desde, hasta })
  if (!rango.success || Date.parse(hasta) <= Date.parse(desde)) throw new Error("Rango de fechas inválido.")
  if (Date.parse(hasta) - Date.parse(desde) > SEIS_SEMANAS_MS) {
    throw new Error("El calendario no muestra más de seis semanas a la vez.")
  }
  const [cuentas, reservas, piezas] = await Promise.all([
    db.from("cuentas").select("id, nombre, marca_id, tipo, ritmo_semanal").order("nombre"),
    db.from("piezas").select("cuenta_id").eq("estado", "en_reserva"),
    db
      .from("piezas")
      .select("id, cuenta_id, estado, planeada_para, versiones(numero, texto, titulo)")
      .in("estado", [...EN_EL_CALENDARIO])
      .gte("planeada_para", desde)
      .lt("planeada_para", hasta)
      .order("planeada_para"),
  ])
  if (cuentas.error) throw new Error(`No pude leer el calendario: ${cuentas.error.message}`, { cause: cuentas.error })
  if (reservas.error)
    throw new Error(`No pude leer el calendario: ${reservas.error.message}`, { cause: reservas.error })
  if (piezas.error) throw new Error(`No pude leer el calendario: ${piezas.error.message}`, { cause: piezas.error })
  const enReserva = new Map<string, number>()
  for (const r of reservas.data) enReserva.set(r.cuenta_id, (enReserva.get(r.cuenta_id) ?? 0) + 1)
  return {
    cuentas: cuentas.data.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      marcaId: c.marca_id,
      tipo: leerTipo(c.tipo),
      ritmoSemanal: c.ritmo_semanal,
      enReserva: enReserva.get(c.id) ?? 0,
    })),
    piezas: piezas.data.flatMap((p) =>
      p.planeada_para === null
        ? []
        : [
            {
              id: p.id,
              cuentaId: p.cuenta_id,
              estado: leerEstado(p.estado),
              instante: p.planeada_para,
              firmada: p.estado !== "por_aprobar",
              extracto: extractoDe(p.versiones, 60),
            },
          ],
    ),
  }
}

export async function bandeja(db: Db, ahora = Date.now()): Promise<Bandeja> {
  const { data, error } = await db
    .from("piezas")
    .select(
      "id, estado, programada_para, planeada_para, motivo, cuentas(nombre, marcas(nombre)), versiones(numero, texto, titulo)",
    )
    .in("estado", ["por_aprobar", "en_reserva", "a_mano", "envio_dudoso", "error", "programada"])
    // The plan equals the signed date for signed pieces, so one column orders both.
    .order("planeada_para", { ascending: true, nullsFirst: false })
    .order("creada_en", { ascending: true })
  if (error) throw new Error(`No pude leer la bandeja: ${error.message}`, { cause: error })
  const tarjetas = data.map(
    (p): TarjetaDePieza => ({
      id: p.id,
      estado: leerEstado(p.estado),
      cuenta: p.cuentas?.nombre ?? "",
      marca: p.cuentas?.marcas?.nombre ?? "",
      programadaPara: p.programada_para,
      planeadaPara: p.planeada_para,
      extracto: extractoDe(p.versiones),
      motivo: p.motivo,
    }),
  )
  return {
    porFirmar: tarjetas.filter((t) => t.estado === "por_aprobar"),
    enReserva: tarjetas.filter((t) => t.estado === "en_reserva"),
    aMano: tarjetas.filter((t) => t.estado === "a_mano"),
    revisar: tarjetas.filter((t) => t.estado === "envio_dudoso" || t.estado === "error"),
    proximas: tarjetas.filter(
      (t) =>
        t.estado === "programada" &&
        t.programadaPara !== null &&
        Date.parse(t.programadaPara) < ahora + CATORCE_DIAS_MS,
    ),
    masAdelante: tarjetas.filter(
      (t) =>
        t.estado === "programada" &&
        t.programadaPara !== null &&
        Date.parse(t.programadaPara) >= ahora + CATORCE_DIAS_MS,
    ),
  }
}

export interface DetalleDePieza {
  id: string
  estado: EstadoDePieza
  formato: "texto" | "carrusel_pdf"
  motivo: string | null
  enlace: string | null
  programadaPara: string | null
  planeadaPara: string | null
  cuenta: {
    id: string
    nombre: string
    tipo: "persona" | "empresa"
    ruta: "api" | "metricool" | "a_mano"
    marcaId: string
    voz: "yo" | "nosotros"
  }
  pilarId: string | null
  /** Shown even when the pillar left the editorial line. */
  pilarNombre: string | null
  version: {
    id: string
    origen: "persona" | "claude"
    texto: string
    titulo: string | null
    huella: string
    archivoUrl: string | null
    archivoDescarga: string | null
  }
  fechaPropuesta: string
}

export async function detalle(db: Db, id: string, ahora = Date.now()): Promise<DetalleDePieza | null> {
  if (!z.uuid().safeParse(id).success) return null
  const { data: p, error } = await db
    .from("piezas")
    .select(
      "id, estado, formato, motivo, enlace, programada_para, planeada_para, pilar_id, pilares(nombre), cuentas(id, nombre, tipo, ruta, marca_id, marcas(voz)), versiones(id, origen, numero, texto, titulo, huella, archivo_ruta)",
    )
    .eq("id", id)
    .maybeSingle()
  if (error) throw new Error(`No pude leer la pieza: ${error.message}`, { cause: error })
  if (!p?.cuentas) return null
  const v = ultimaVersion(p.versiones)
  if (!v) return null
  let archivoUrl: string | null = null
  let archivoDescarga: string | null = null
  if (v.archivo_ruta) {
    const bucket = db.storage.from("piezas")
    const [vista, descarga] = await Promise.all([
      bucket.createSignedUrl(v.archivo_ruta, 600),
      bucket.createSignedUrl(v.archivo_ruta, 600, { download: true }),
    ])
    if (vista.error) throw new Error(`No pude preparar el PDF: ${vista.error.message}`, { cause: vista.error })
    if (descarga.error) throw new Error(`No pude preparar el PDF: ${descarga.error.message}`, { cause: descarga.error })
    archivoUrl = vista.data.signedUrl
    archivoDescarga = descarga.data.signedUrl
  }
  const tipo = leerTipo(p.cuentas.tipo)
  const horarios = await horariosOcupados(db, p.cuentas.id, ahora, p.id)
  const planSigueVigente = p.planeada_para !== null && Date.parse(p.planeada_para) > ahora + 60_000
  return {
    id: p.id,
    estado: leerEstado(p.estado),
    formato: leerFormato(p.formato),
    motivo: p.motivo,
    enlace: p.enlace,
    programadaPara: p.programada_para,
    planeadaPara: p.planeada_para,
    cuenta: {
      id: p.cuentas.id,
      nombre: p.cuentas.nombre,
      tipo,
      ruta: leerRuta(p.cuentas.ruta),
      marcaId: p.cuentas.marca_id,
      voz: p.cuentas.marcas?.voz === "nosotros" ? "nosotros" : "yo",
    },
    pilarId: p.pilar_id,
    pilarNombre: p.pilares?.nombre ?? null,
    version: {
      id: v.id,
      origen: v.origen === "claude" ? "claude" : "persona",
      texto: v.texto,
      titulo: v.titulo,
      huella: v.huella,
      archivoUrl,
      archivoDescarga,
    },
    fechaPropuesta:
      planSigueVigente && p.planeada_para
        ? new Date(p.planeada_para).toISOString()
        : proponerFecha(tipo, horarios, ahora).toISOString(),
  }
}
