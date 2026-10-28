import { z } from "zod"
import type { Resultado } from "@/lib/marcas/acciones"
import { BYTES_MAXIMOS_DEL_CARRUSEL, hashDeFlujo } from "@/lib/piezas/archivo"
import { normalizarTexto } from "@/lib/piezas/huella"
import type { Db } from "@/lib/supabase/database"

const MENSAJES: Record<string, string> = {
  solo_el_dueno_crea_piezas: "Solo el dueño de la marca puede crear piezas.",
  solo_el_dueno_cambia_piezas: "Solo el dueño de la marca puede cambiar piezas.",
  solo_el_dueno_firma: "Solo el dueño de la marca puede firmar.",
  solo_el_dueno_desprograma: "Solo el dueño de la marca puede desprogramar.",
  solo_el_dueno_descarta: "Solo el dueño de la marca puede descartar.",
  solo_el_dueno_cierra: "Solo el dueño de la marca puede cerrar una pieza a mano.",
  solo_el_dueno_decide: "Solo el dueño de la marca puede decidir sobre un envío dudoso.",
  carrusel_sin_archivo_o_titulo: "Un carrusel necesita su PDF y un título.",
  texto_con_archivo: "Una pieza de texto no lleva archivo.",
  archivo_de_otra_marca: "Ese archivo pertenece a otra marca.",
  ruta_de_archivo_invalida: "La ruta del archivo no es válida.",
  pieza_no_editable: "Esta pieza ya no se puede editar.",
  firma_de_otra_version: "La pieza cambió desde que la abriste. Revísala de nuevo antes de firmar.",
  fecha_en_el_pasado: "Elige una fecha y hora futuras.",
  pieza_no_esta_por_aprobar: "Esta pieza ya no espera tu firma.",
  pieza_no_programada: "Esta pieza no está programada.",
  pieza_ya_cerrada: "Esta pieza ya está cerrada.",
  pieza_enviandose: "Esta pieza se está enviando ahora. Espera a que termine.",
  pieza_no_espera_enlace: "Esta pieza no está esperando un enlace.",
  falta_el_enlace: "Pega el enlace de la publicación en LinkedIn.",
  pieza_no_esta_dudosa: "Esta pieza no está en duda.",
}

const MENSAJES_DE_LA_GUARDIA = ["transicion_no_permitida", "programar_sin_firma_vigente", "publicar_sin_firma_vigente"]

function falla(error: { code?: string; message: string }): { ok: false; error: string } {
  if (error.code === "23505") return { ok: false, error: "Esa cuenta ya tiene una pieza a esa hora. Elige otra." }
  if (error.code === "23514" && MENSAJES_DE_LA_GUARDIA.some((m) => error.message.startsWith(m))) {
    return { ok: false, error: "La pieza no puede pasar a ese estado desde donde está." }
  }
  const mensaje = MENSAJES[error.message]
  if (mensaje) return { ok: false, error: mensaje }
  console.error("Falla inesperada al guardar una pieza", error)
  return { ok: false, error: "No pude guardar. Inténtalo de nuevo en un rato." }
}

const RUTA_DE_ARCHIVO =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/
const DATOS_DE_PIEZA = "Revisa los datos de la pieza."

const NuevaPieza = z.discriminatedUnion("formato", [
  z.object({ cuentaId: z.uuid(), formato: z.literal("texto"), texto: z.string() }),
  z.object({
    cuentaId: z.uuid(),
    formato: z.literal("carrusel_pdf"),
    texto: z.string(),
    titulo: z.string().trim().min(1).max(100),
    archivoRuta: z.string().regex(RUTA_DE_ARCHIVO),
  }),
])

function errorDeTexto(texto: string): string | null {
  if (!texto.trim()) return "Falta el texto."
  if ([...normalizarTexto(texto)].length > 3000) return "El texto pasa los 3000 caracteres de LinkedIn."
  return null
}

const PDF_INVALIDO = "Ese archivo no es un PDF o no se pudo leer."
const PDF_GRANDE = `El PDF pesa más de ${BYTES_MAXIMOS_DEL_CARRUSEL / (1024 * 1024)} MB. Achícalo antes de subirlo.`

/** The browser uploaded the file with the person's session; the server streams it back to hash it without buffering it (Worker memory). */
async function hashDelArchivo(db: Db, ruta: string): Promise<Resultado<{ sha256: string }>> {
  const { data: info, error: errorDeInfo } = await db.storage.from("piezas").info(ruta)
  if (errorDeInfo || !info) return { ok: false, error: PDF_INVALIDO }
  if ((info.size ?? 0) > BYTES_MAXIMOS_DEL_CARRUSEL) return { ok: false, error: PDF_GRANDE }
  const { data: firmada, error: errorDeUrl } = await db.storage.from("piezas").createSignedUrl(ruta, 60)
  if (errorDeUrl || !firmada) return { ok: false, error: PDF_INVALIDO }
  const respuesta = await fetch(firmada.signedUrl)
  if (!respuesta.ok || !respuesta.body) return { ok: false, error: PDF_INVALIDO }
  const hash = await hashDeFlujo(respuesta.body, BYTES_MAXIMOS_DEL_CARRUSEL)
  if (hash.ok) return { ok: true, sha256: hash.sha256 }
  return { ok: false, error: hash.motivo === "demasiado_grande" ? PDF_GRANDE : PDF_INVALIDO }
}

export async function crearPieza(db: Db, entrada: unknown): Promise<Resultado<{ piezaId: string }>> {
  const leida = NuevaPieza.safeParse(entrada)
  if (!leida.success) return { ok: false, error: DATOS_DE_PIEZA }
  const pieza = leida.data
  const textoMalo = errorDeTexto(pieza.texto)
  if (textoMalo) return { ok: false, error: textoMalo }
  const base = { p_cuenta: pieza.cuentaId, p_formato: pieza.formato, p_texto: pieza.texto }
  if (pieza.formato === "texto") {
    const { data, error } = await db.rpc("crear_pieza", base)
    return error ? falla(error) : { ok: true, piezaId: data }
  }
  const { data: cuenta, error: errorDeCuenta } = await db
    .from("cuentas")
    .select("marca_id")
    .eq("id", pieza.cuentaId)
    .maybeSingle()
  if (errorDeCuenta) return falla(errorDeCuenta)
  if (!cuenta) return { ok: false, error: MENSAJES.solo_el_dueno_crea_piezas }
  if (RUTA_DE_ARCHIVO.exec(pieza.archivoRuta)?.[1] !== cuenta.marca_id) {
    return { ok: false, error: MENSAJES.archivo_de_otra_marca }
  }
  const archivo = await hashDelArchivo(db, pieza.archivoRuta)
  if (!archivo.ok) return archivo
  const { data, error } = await db.rpc("crear_pieza", {
    ...base,
    p_titulo: pieza.titulo,
    p_archivo_ruta: pieza.archivoRuta,
    p_archivo_sha256: archivo.sha256,
  })
  return error ? falla(error) : { ok: true, piezaId: data }
}

const Firma = z.object({
  piezaId: z.uuid(),
  huella: z.string().regex(/^[0-9a-f]{64}$/),
  programadaPara: z.iso.datetime({ offset: true }),
})

export async function firmarPieza(db: Db, entrada: unknown): Promise<Resultado> {
  const leida = Firma.safeParse(entrada)
  if (!leida.success) return { ok: false, error: "Revisa la fecha y la hora." }
  const { error } = await db.rpc("firmar_pieza", {
    p_pieza: leida.data.piezaId,
    p_huella: leida.data.huella,
    p_programada_para: leida.data.programadaPara,
  })
  return error ? falla(error) : { ok: true }
}

const Id = z.uuid()

export async function desprogramar(db: Db, piezaId: string): Promise<Resultado> {
  if (!Id.safeParse(piezaId).success) return { ok: false, error: DATOS_DE_PIEZA }
  const { error } = await db.rpc("desprogramar_pieza", { p_pieza: piezaId })
  return error ? falla(error) : { ok: true }
}

const Motivo = z.string().trim().max(500)

export async function descartar(db: Db, piezaId: string, motivo: string): Promise<Resultado> {
  if (!Id.safeParse(piezaId).success) return { ok: false, error: DATOS_DE_PIEZA }
  const motivoLeido = Motivo.safeParse(motivo)
  if (!motivoLeido.success) return { ok: false, error: "Revisa el motivo: máximo 500 caracteres." }
  const { error } = await db.rpc("descartar_pieza", { p_pieza: piezaId, p_motivo: motivoLeido.data })
  return error ? falla(error) : { ok: true }
}

const Enlace = z.object({ piezaId: z.uuid(), enlace: z.url().regex(/^https:\/\/(www\.)?linkedin\.com\//) })

export async function cerrarAMano(db: Db, entrada: unknown): Promise<Resultado> {
  const leida = Enlace.safeParse(entrada)
  if (!leida.success) return { ok: false, error: "Pega el enlace de la publicación en LinkedIn." }
  const { error } = await db.rpc("cerrar_a_mano", { p_pieza: leida.data.piezaId, p_enlace: leida.data.enlace })
  return error ? falla(error) : { ok: true }
}

export async function dudosoAMano(db: Db, piezaId: string): Promise<Resultado> {
  if (!Id.safeParse(piezaId).success) return { ok: false, error: DATOS_DE_PIEZA }
  const { error } = await db.rpc("dudoso_a_mano", { p_pieza: piezaId })
  return error ? falla(error) : { ok: true }
}
