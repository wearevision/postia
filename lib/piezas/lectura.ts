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
  extracto: string
  motivo: string | null
}

export interface Bandeja {
  porFirmar: TarjetaDePieza[]
  aMano: TarjetaDePieza[]
  revisar: TarjetaDePieza[]
  proximas: TarjetaDePieza[]
  masAdelante: TarjetaDePieza[]
}

const CATORCE_DIAS_MS = 14 * 86_400_000
const LARGO_DEL_EXTRACTO = 90

function leerEstado(valor: string): EstadoDePieza {
  if (!esEstado(valor)) throw new Error(`Estado de pieza desconocido: ${valor}`)
  return valor
}

function leerFormato(valor: string): "texto" | "carrusel_pdf" {
  if (valor !== "texto" && valor !== "carrusel_pdf") throw new Error(`Formato de pieza desconocido: ${valor}`)
  return valor
}

function leerTipo(valor: string): "persona" | "empresa" {
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

export async function bandeja(db: Db, ahora = Date.now()): Promise<Bandeja> {
  const { data, error } = await db
    .from("piezas")
    .select("id, estado, programada_para, motivo, cuentas(nombre, marcas(nombre)), versiones(numero, texto, titulo)")
    .in("estado", ["por_aprobar", "a_mano", "envio_dudoso", "error", "programada"])
    .order("programada_para", { ascending: true, nullsFirst: false })
    .order("creada_en", { ascending: true })
  if (error) throw new Error(`No pude leer la bandeja: ${error.message}`, { cause: error })
  const tarjetas = data.map((p): TarjetaDePieza => {
    const ultima = ultimaVersion(p.versiones)
    const base = [...(ultima?.titulo ?? ultima?.texto ?? "")]
    return {
      id: p.id,
      estado: leerEstado(p.estado),
      cuenta: p.cuentas?.nombre ?? "",
      marca: p.cuentas?.marcas?.nombre ?? "",
      programadaPara: p.programada_para,
      extracto: base.length > LARGO_DEL_EXTRACTO ? `${base.slice(0, LARGO_DEL_EXTRACTO).join("")}…` : base.join(""),
      motivo: p.motivo,
    }
  })
  return {
    porFirmar: tarjetas.filter((t) => t.estado === "por_aprobar"),
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
  cuenta: { id: string; nombre: string; tipo: "persona" | "empresa"; ruta: "api" | "metricool" | "a_mano" }
  version: {
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
      "id, estado, formato, motivo, enlace, programada_para, cuentas(id, nombre, tipo, ruta), versiones(numero, texto, titulo, huella, archivo_ruta)",
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
  const { data: ocupadas, error: errorDeOcupadas } = await db
    .from("piezas")
    .select("programada_para")
    .eq("cuenta_id", p.cuentas.id)
    .in("estado", ["programada", "publicando", "publicada"])
    .gte("programada_para", new Date(ahora).toISOString())
  if (errorDeOcupadas)
    throw new Error(`No pude leer los horarios: ${errorDeOcupadas.message}`, { cause: errorDeOcupadas })
  const tipo = leerTipo(p.cuentas.tipo)
  const horarios = ocupadas.flatMap((o) => (o.programada_para === null ? [] : [Date.parse(o.programada_para)]))
  return {
    id: p.id,
    estado: leerEstado(p.estado),
    formato: leerFormato(p.formato),
    motivo: p.motivo,
    enlace: p.enlace,
    programadaPara: p.programada_para,
    cuenta: { id: p.cuentas.id, nombre: p.cuentas.nombre, tipo, ruta: leerRuta(p.cuentas.ruta) },
    version: { texto: v.texto, titulo: v.titulo, huella: v.huella, archivoUrl, archivoDescarga },
    fechaPropuesta: proponerFecha(tipo, horarios, ahora).toISOString(),
  }
}
