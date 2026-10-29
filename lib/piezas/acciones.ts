import { z } from "zod"
import { excepcionesPuestasDespues } from "@/lib/clientes/lectura"
import { type Excepcion, prepararRevision, textoARevisar } from "@/lib/clientes/revision"
import type { Resultado } from "@/lib/marcas/acciones"
import { diaEnSantiago } from "@/lib/piezas/calendario"
import { proponerFecha } from "@/lib/piezas/horarios"
import { normalizarTexto } from "@/lib/piezas/huella"
import { horariosOcupados, leerTipo } from "@/lib/piezas/lectura"
import { BYTES_MAXIMOS_DEL_CARRUSEL } from "@/lib/piezas/limites"
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
  solo_el_dueno_planea: "Solo el dueño de la marca puede mover la fecha planeada.",
  solo_el_dueno_saca_de_la_reserva: "Solo el dueño de la marca puede sacar piezas de la reserva.",
  pieza_no_esta_en_reserva: "Esta pieza ya no está en la reserva.",
  pieza_no_espera_reserva: "Esta pieza ya no espera una pieza de la reserva.",
  // pilar_de_otra_marca arrives with code 23514 but is not a guard message, so falla finds it here.
  pilar_de_otra_marca: "Ese pilar es de otra marca.",
  pilar_inactivo: "Ese pilar ya no está en la línea editorial.",
}

const MENSAJES_DE_LA_GUARDIA = [
  "transicion_no_permitida",
  "programar_sin_firma_vigente",
  "reservar_sin_firma_vigente",
  "publicar_sin_firma_vigente",
]

function falla(error: { code?: string; message: string }): { ok: false; error: string } {
  if (error.code === "23505") return { ok: false, error: "Esa cuenta ya tiene una pieza a esa hora. Elige otra." }
  if (error.code === "23514" && MENSAJES_DE_LA_GUARDIA.some((m) => error.message.startsWith(m))) {
    return { ok: false, error: "La pieza no puede pasar a ese estado desde donde está." }
  }
  if (Object.hasOwn(MENSAJES, error.message)) return { ok: false, error: MENSAJES[error.message] }
  console.error("Falla inesperada al guardar una pieza", error.code, error.message)
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
    archivoSha256: z.string().regex(/^[0-9a-f]{64}$/),
  }),
])

function errorDeTexto(texto: string): string | null {
  if (!texto.trim()) return "Falta el texto."
  if ([...normalizarTexto(texto)].length > 3000) return "El texto pasa los 3000 caracteres de LinkedIn."
  return null
}

const PDF_INVALIDO = "Ese archivo no es un PDF o no se pudo leer."
const PDF_GRANDE = `El PDF pesa más de ${BYTES_MAXIMOS_DEL_CARRUSEL / (1024 * 1024)} MB. Achícalo antes de subirlo.`

/**
 * The browser computes the sha-256 and sends it: hashing a multi-MB PDF here would exceed the Worker's CPU budget.
 * Trusting it is safe because the publisher re-downloads the file and compares its sha-256 before anything goes out
 * (lib/publicacion/publicar.ts), so a wrong hash can only block the owner's own piece. Here we only check size and the %PDF- header.
 */
async function revisarArchivo(db: Db, ruta: string): Promise<Resultado> {
  const { data: info, error: errorDeInfo } = await db.storage.from("piezas").info(ruta)
  if (errorDeInfo || !info) return { ok: false, error: PDF_INVALIDO }
  if ((info.size ?? 0) > BYTES_MAXIMOS_DEL_CARRUSEL) return { ok: false, error: PDF_GRANDE }
  const { data: firmada, error: errorDeUrl } = await db.storage.from("piezas").createSignedUrl(ruta, 60)
  if (errorDeUrl || !firmada) return { ok: false, error: PDF_INVALIDO }
  const respuesta = await fetch(firmada.signedUrl, { headers: { Range: "bytes=0-4" }, cache: "no-store" })
  if (!respuesta.ok || !respuesta.body) return { ok: false, error: PDF_INVALIDO }
  // If a server ignored Range, the first chunk is still all we read.
  const lector = respuesta.body.getReader()
  const { value } = await lector.read()
  // Not awaited: under Next's patched fetch, awaiting cancel() never resolves and hangs the Server Action.
  lector
    .cancel()
    .catch((error: unknown) =>
      console.error("No pude cerrar la lectura del PDF", error instanceof Error ? error.message : String(error)),
    )
  const cabecera = new TextDecoder().decode(value?.slice(0, 5))
  return cabecera === "%PDF-" ? { ok: true } : { ok: false, error: PDF_INVALIDO }
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
  const archivo = await revisarArchivo(db, pieza.archivoRuta)
  if (!archivo.ok) return archivo
  const { data, error } = await db.rpc("crear_pieza", {
    ...base,
    p_titulo: pieza.titulo,
    p_archivo_ruta: pieza.archivoRuta,
    p_archivo_sha256: pieza.archivoSha256,
  })
  return error ? falla(error) : { ok: true, piezaId: data }
}

export const EXCEPCIONES_NUEVAS = "Hay excepciones nuevas desde que abriste la pieza. Recarga para revisarlas."

// Errs toward blocking: covers the ms between this check and the signing RPC and any Worker/DB clock skew.
const MARGEN_DE_APERTURA_MS = 5_000

interface PuertosDeApertura {
  /** Active exceptions marked after `desde`. */
  nuevasDesde(desde: string): Promise<Excepcion[]>
  /** Title and text of the version being signed; null when it is not the piece's version (the signature refuses it). */
  texto(): Promise<string | null>
}

/**
 * Gate 1 race: the verdict the person saw covered the exceptions marked up to the page's render time (`abiertaEn`).
 * One marked after it that names a client of this piece was never shown, and the publisher only re-checks exceptions
 * marked after the signature, so the signature is refused until the page is reloaded. An exception for a client the
 * piece does not name leaves the verdict as it was and does not hold anyone's signature. `abiertaEn` comes from the
 * browser: never in the future.
 */
export async function revisarApertura(p: PuertosDeApertura, abiertaEn: unknown, ahora: number): Promise<Resultado> {
  const leida = z.iso
    .datetime({ offset: true })
    .refine((valor) => Date.parse(valor) <= ahora)
    .safeParse(abiertaEn)
  if (!leida.success) return { ok: false, error: "Recarga la pieza antes de firmar." }
  let nombrados: number
  try {
    const nuevas = await p.nuevasDesde(new Date(Date.parse(leida.data) - MARGEN_DE_APERTURA_MS).toISOString())
    if (nuevas.length === 0) return { ok: true }
    const texto = await p.texto()
    if (texto === null) return { ok: true }
    nombrados = prepararRevision(nuevas, diaEnSantiago(ahora)).clientes(texto).length
  } catch (error) {
    console.error(
      "No pude revisar las excepciones nuevas antes de firmar",
      error instanceof Error ? error.message : String(error),
    )
    return { ok: false, error: "No pude revisar los clientes. Inténtalo de nuevo en un rato." }
  }
  return nombrados > 0 ? { ok: false, error: EXCEPCIONES_NUEVAS } : { ok: true }
}

function aperturaDe(entrada: unknown): unknown {
  return typeof entrada === "object" && entrada !== null && "abiertaEn" in entrada ? entrada.abiertaEn : undefined
}

function puertosDeApertura(db: Db, piezaId: string, huella: string): PuertosDeApertura {
  return {
    nuevasDesde: (desde) => excepcionesPuestasDespues(db, desde),
    async texto() {
      const { data, error } = await db
        .from("versiones")
        .select("titulo, texto")
        .eq("pieza_id", piezaId)
        .eq("huella", huella)
        .order("numero", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw new Error(`No pude leer la versión: ${error.message}`, { cause: error })
      // The same text the gate 1 verdict reviewed (app/(app)/piezas/[id]/page.tsx).
      return data ? textoARevisar(data.titulo, data.texto) : null
    },
  }
}

const Firma = z.object({
  piezaId: z.uuid(),
  huella: z.string().regex(/^[0-9a-f]{64}$/),
  programadaPara: z.iso.datetime({ offset: true }),
})

export async function firmarPieza(db: Db, entrada: unknown): Promise<Resultado> {
  const leida = Firma.safeParse(entrada)
  if (!leida.success) return { ok: false, error: "Revisa la fecha y la hora." }
  const apertura = await revisarApertura(
    puertosDeApertura(db, leida.data.piezaId, leida.data.huella),
    aperturaDe(entrada),
    Date.now(),
  )
  if (!apertura.ok) return apertura
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

const Plan = z.object({ piezaId: z.uuid(), planeadaPara: z.iso.datetime({ offset: true }) })

export async function planearPieza(db: Db, entrada: unknown): Promise<Resultado> {
  const leida = Plan.safeParse(entrada)
  if (!leida.success) return { ok: false, error: "Revisa la fecha y la hora." }
  const { error } = await db.rpc("planear_pieza", { p_pieza: leida.data.piezaId, p_fecha: leida.data.planeadaPara })
  return error ? falla(error) : { ok: true }
}

// Two pieces created at once can race for the same proposed slot; the slot index refuses the second (23505).
const INTENTOS_DE_PLAN = 3

/** Plans an unsigned piece in the first free slot of its account (D19). Never throws: a failure comes back in the result. */
export async function planearConFechaPropuesta(
  db: Db,
  piezaId: string,
  ahora = Date.now(),
): Promise<Resultado<{ planeadaPara: string }>> {
  if (!Id.safeParse(piezaId).success) return { ok: false, error: DATOS_DE_PIEZA }
  const { data: pieza, error } = await db
    .from("piezas")
    .select("cuenta_id, cuentas(tipo)")
    .eq("id", piezaId)
    .maybeSingle()
  if (error) return falla(error)
  if (!pieza?.cuentas) return { ok: false, error: DATOS_DE_PIEZA }
  try {
    const tipo = leerTipo(pieza.cuentas.tipo)
    const ocupados = await horariosOcupados(db, pieza.cuenta_id, ahora, piezaId)
    for (let intento = 0; intento < INTENTOS_DE_PLAN; intento++) {
      const fecha = proponerFecha(tipo, ocupados, ahora)
      const { error: errorDePlan } = await db.rpc("planear_pieza", { p_pieza: piezaId, p_fecha: fecha.toISOString() })
      if (!errorDePlan) return { ok: true, planeadaPara: fecha.toISOString() }
      if (errorDePlan.code !== "23505") return falla(errorDePlan)
      ocupados.push(fecha.getTime())
    }
    return { ok: false, error: "No encontré un horario libre. Elige la fecha a mano." }
  } catch (causa) {
    console.error("No pude proponer un horario", causa instanceof Error ? causa.message : String(causa))
    const sinHorario = causa instanceof Error && causa.message.startsWith("No encontré un horario libre")
    return { ok: false, error: sinHorario ? causa.message : "No pude proponer un horario. Elige la fecha a mano." }
  }
}

/** Plans a piece waiting for a signature that holds no slot yet; anything else is left as it is. */
export async function asegurarPlan(db: Db, piezaId: string): Promise<Resultado> {
  if (!Id.safeParse(piezaId).success) return { ok: false, error: DATOS_DE_PIEZA }
  const { data, error } = await db.from("piezas").select("estado, planeada_para").eq("id", piezaId).maybeSingle()
  if (error) return falla(error)
  if (!data || data.estado !== "por_aprobar" || data.planeada_para !== null) return { ok: true }
  const plan = await planearConFechaPropuesta(db, piezaId)
  return plan.ok ? { ok: true } : plan
}

const FirmaDeReserva = z.object({ piezaId: z.uuid(), huella: z.string().regex(/^[0-9a-f]{64}$/) })

export async function firmarParaReserva(db: Db, entrada: unknown): Promise<Resultado> {
  const leida = FirmaDeReserva.safeParse(entrada)
  if (!leida.success) return { ok: false, error: DATOS_DE_PIEZA }
  const apertura = await revisarApertura(
    puertosDeApertura(db, leida.data.piezaId, leida.data.huella),
    aperturaDe(entrada),
    Date.now(),
  )
  if (!apertura.ok) return apertura
  const { error } = await db.rpc("firmar_para_reserva", { p_pieza: leida.data.piezaId, p_huella: leida.data.huella })
  return error ? falla(error) : { ok: true }
}

interface PuertosDeSacar {
  sacar(piezaId: string): PromiseLike<{ error: { code?: string; message: string } | null }>
  planear(piezaId: string): Promise<Resultado>
}

export async function sacarDeReservaCon(puertos: PuertosDeSacar, piezaId: string): Promise<Resultado> {
  if (!Id.safeParse(piezaId).success) return { ok: false, error: DATOS_DE_PIEZA }
  const { error } = await puertos.sacar(piezaId)
  if (error) return falla(error)
  // Out of the reserve it is a piece to sign again, and a piece to sign holds a slot. The take-out already happened,
  // so a failed plan is not a failure of this action: the piece shows «Sin fecha planeada» and offers «Mover fecha».
  const plan = await puertos.planear(piezaId)
  if (!plan.ok) console.error("No pude planear la pieza al sacarla de la reserva", piezaId, plan.error)
  return { ok: true }
}

export function sacarDeReserva(db: Db, piezaId: string): Promise<Resultado> {
  return sacarDeReservaCon(
    { sacar: (id) => db.rpc("sacar_de_reserva", { p_pieza: id }), planear: (id) => asegurarPlan(db, id) },
    piezaId,
  )
}

const PilarDePieza = z.object({ piezaId: z.uuid(), pilarId: z.uuid().nullable() })

export async function ponerPilar(db: Db, entrada: unknown): Promise<Resultado> {
  const leida = PilarDePieza.safeParse(entrada)
  if (!leida.success) return { ok: false, error: DATOS_DE_PIEZA }
  // No pillar is sent as a missing argument, never null: the RPC's default clears it.
  const { error } = await db.rpc("poner_pilar", {
    p_pieza: leida.data.piezaId,
    p_pilar: leida.data.pilarId ?? undefined,
  })
  return error ? falla(error) : { ok: true }
}

/** What a new piece could not get right after it was created; its page asks for it. */
export type AvisoDePiezaNueva = "plan" | "pilar"

interface PuertosDeCreacion {
  crear(entrada: unknown): Promise<Resultado<{ piezaId: string }>>
  planear(piezaId: string): Promise<Resultado>
  ponerPilar(entrada: { piezaId: string; pilarId: string }): Promise<Resultado>
}

const PilarElegido = z.object({ pilarId: z.uuid() })

/** Creates a piece, plans it and sets its pillar. A failed plan or pillar never loses the piece: it comes back as a notice. */
export async function crearPiezaCon(
  p: PuertosDeCreacion,
  entrada: unknown,
): Promise<Resultado<{ piezaId: string; aviso: AvisoDePiezaNueva[] }>> {
  const creada = await p.crear(entrada)
  if (!creada.ok) return creada
  const aviso: AvisoDePiezaNueva[] = []
  const plan = await p.planear(creada.piezaId)
  if (!plan.ok) {
    console.error("No pude planear la pieza nueva", creada.piezaId, plan.error)
    aviso.push("plan")
  }
  const pilar = PilarElegido.safeParse(entrada)
  if (pilar.success) {
    const puesto = await p.ponerPilar({ piezaId: creada.piezaId, pilarId: pilar.data.pilarId })
    if (!puesto.ok) {
      console.error("No pude poner el pilar de la pieza nueva", creada.piezaId, puesto.error)
      aviso.push("pilar")
    }
  }
  return { ok: true, piezaId: creada.piezaId, aviso }
}
