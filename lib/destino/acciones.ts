import { z } from "zod"
import { codigoNuevo, conEnlace, enlaceDe, llevaElEnlace, quitarEnlace } from "@/lib/destino/enlace"
import { leerPaginas, ordenarPorTexto, type Pagina, WEBS, type Web } from "@/lib/destino/paginas"
import type { Resultado } from "@/lib/marcas/acciones"
import type { Db } from "@/lib/supabase/database"

type LectorDePaginas = (web: Web) => Promise<Pagina[]>

const MENSAJES: Record<string, string> = {
  solo_el_dueno_cambia_piezas: "Solo quien maneja la marca puede cambiar la pieza.",
  pieza_no_editable: "Esta pieza ya no se puede cambiar.",
  codigo_cambiado: "La pieza cambió mientras elegías. Recarga y vuelve a elegir.",
  falta_el_enlace: "No pude poner el enlace en el texto. Inténtalo de nuevo.",
  version_cambiada: "El texto cambió mientras elegías. Recarga y vuelve a elegir.",
}

function falla(error: { code?: string; message: string }): { ok: false; error: string } {
  if (Object.hasOwn(MENSAJES, error.message)) return { ok: false, error: MENSAJES[error.message] }
  console.error("Falla inesperada al poner el destino", error.code, error.message)
  return { ok: false, error: "No pude guardar. Inténtalo de nuevo en un rato." }
}

const WebSchema = z.enum(["wr3", "wav"])

async function leerPieza(db: Db, piezaId: string) {
  const { data, error } = await db
    .from("piezas")
    .select("destino, destino_url, codigo_ref, cuentas(tipo), versiones(numero, texto)")
    .eq("id", piezaId)
    .maybeSingle()
  if (error) {
    console.error("No pude leer la pieza", piezaId, error.message)
    return { ok: false as const, error: "No pude leer la pieza. Inténtalo de nuevo." }
  }
  if (!data?.cuentas) return { ok: false as const, error: "No encontré la pieza." }
  const ultima = [...data.versiones].sort((a, b) => b.numero - a.numero)[0]
  const cuentaTipo = data.cuentas.tipo === "persona" ? ("persona" as const) : ("empresa" as const)
  return { ok: true as const, pieza: { ...data, texto: ultima?.texto ?? "", numero: ultima?.numero ?? 0, cuentaTipo } }
}

export async function paginasParaPieza(
  db: Db,
  entrada: unknown,
  leer: LectorDePaginas = leerPaginas,
): Promise<Resultado<{ paginas: Pagina[] }>> {
  const e = z.object({ piezaId: z.uuid(), web: WebSchema }).safeParse(entrada)
  if (!e.success) return { ok: false, error: "Revisa el destino." }
  const leida = await leerPieza(db, e.data.piezaId)
  if (!leida.ok) return leida
  const { pieza } = leida
  try {
    return { ok: true, paginas: ordenarPorTexto(await leer(e.data.web), pieza.texto) }
  } catch (error) {
    console.error("paginas.json no respondió", error instanceof Error ? error.message : error)
    return { ok: false, error: `No pude leer las páginas de ${WEBS[e.data.web].nombre}.` }
  }
}

const Destino = z.union([
  z.object({ piezaId: z.uuid(), web: z.null(), url: z.null() }),
  z.object({ piezaId: z.uuid(), web: WebSchema, url: z.url() }),
])

/** The link is part of the signed text: choosing, changing or removing it writes a new version (spec D8). */
export async function ponerDestino(db: Db, entrada: unknown, leer: LectorDePaginas = leerPaginas): Promise<Resultado> {
  const e = Destino.safeParse(entrada)
  if (!e.success) return { ok: false, error: "Revisa el destino." }
  const { piezaId, web, url } = e.data
  const leida = await leerPieza(db, piezaId)
  if (!leida.ok) return leida
  const { pieza } = leida
  const base = pieza.codigo_ref ? quitarEnlace(pieza.texto, pieza.codigo_ref) : pieza.texto

  if (web === null) {
    if (!pieza.destino) return { ok: false, error: "La pieza no tiene enlace." }
    const { error } = await db.rpc("poner_destino", {
      p_pieza: piezaId,
      p_texto: base,
      p_numero_esperado: pieza.numero,
    })
    return error ? falla(error) : { ok: true }
  }

  // The same page again is how a person puts back a link that a correction dropped from the text.
  const yaLoLleva = pieza.codigo_ref !== null && llevaElEnlace(pieza.texto, url, pieza.codigo_ref)
  if (pieza.destino === web && pieza.destino_url === url && yaLoLleva)
    return { ok: false, error: "Ya tiene ese destino." }
  let paginas: Pagina[]
  try {
    paginas = await leer(web)
  } catch (error) {
    console.error("paginas.json no respondió", error instanceof Error ? error.message : error)
    return { ok: false, error: `No pude leer las páginas de ${WEBS[web].nombre}.` }
  }
  if (!paginas.some((p) => p.url === url)) {
    return { ok: false, error: `Esa página no está en la lista de ${WEBS[web].nombre}.` }
  }
  // A new code can collide with another piece's (31³ ≈ 30 000 codes): retry a few times with a fresh one.
  for (let intento = 0; intento < 5; intento++) {
    const codigo = pieza.codigo_ref ?? codigoNuevo()
    const texto = conEnlace(base, enlaceDe({ url, cuentaTipo: pieza.cuentaTipo, codigo }))
    if ([...texto].length > 3000) {
      return { ok: false, error: "Con el enlace, el texto pasa los 3000 caracteres de LinkedIn. Acórtalo primero." }
    }
    const { error } = await db.rpc("poner_destino", {
      p_pieza: piezaId,
      p_texto: texto,
      p_numero_esperado: pieza.numero,
      p_destino: web,
      p_destino_url: url,
      p_codigo: codigo,
    })
    if (!error) return { ok: true }
    if (error.code !== "23505" || pieza.codigo_ref) return falla(error)
  }
  return { ok: false, error: "No pude reservar un código para el enlace. Inténtalo de nuevo." }
}
