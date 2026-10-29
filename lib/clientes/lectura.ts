import type { Db } from "@/lib/supabase/database"
import type { Excepcion, TipoDeExcepcion } from "./revision"

export const TIPOS_DE_EXCEPCION: Record<TipoDeExcepcion, string> = {
  no_nombrar: "No se nombra",
  confidencial: "Confidencial",
  sin_fotos: "Sin fotos",
  sin_logo: "Sin logo",
}

function esTipoDeExcepcion(valor: string): valor is TipoDeExcepcion {
  return Object.hasOwn(TIPOS_DE_EXCEPCION, valor)
}

function leerTipoDeExcepcion(valor: string): TipoDeExcepcion {
  if (esTipoDeExcepcion(valor)) return valor
  throw new Error(`Tipo de excepción desconocido: ${valor}`)
}

function fallo(accion: string, error: { message: string }): never {
  throw new Error(`${accion}: ${error.message}`, { cause: error })
}

/** Active exceptions (not removed). The end date is applied by prepararRevision with today's Chile date. */
export async function leerExcepciones(db: Db): Promise<Excepcion[]> {
  const { data, error } = await db.from("excepciones").select("cliente, alias, tipo, hasta").is("quitada_en", null)
  if (error) fallo("No pude leer las excepciones de clientes", error)
  return data.map((e) => ({ cliente: e.cliente, alias: e.alias, tipo: leerTipoDeExcepcion(e.tipo), hasta: e.hasta }))
}

export interface ExcepcionVigente {
  id: string
  tipo: TipoDeExcepcion
  casoSlug: string | null
  alias: string[]
  hasta: string | null
}

export interface ClienteConCasos {
  cliente: string
  casos: { slug: string; titulo: string; anio: number | null; era: "trayectoria" | "wav" }[]
  excepciones: ExcepcionVigente[]
}

export async function clientes(db: Db): Promise<ClienteConCasos[]> {
  const [casos, excepciones] = await Promise.all([
    db
      .from("casos")
      .select("slug, cliente, titulo, anio, era")
      .order("cliente")
      .order("anio", { ascending: false, nullsFirst: false }),
    db.from("excepciones").select("id, cliente, caso_slug, tipo, alias, hasta").is("quitada_en", null),
  ])
  if (casos.error) fallo("No pude leer los casos", casos.error)
  if (excepciones.error) fallo("No pude leer las excepciones", excepciones.error)
  const porCliente = new Map<string, ClienteConCasos>()
  const de = (nombre: string) => {
    const clave = nombre.trim().toLowerCase()
    const fila = porCliente.get(clave) ?? { cliente: nombre, casos: [], excepciones: [] }
    porCliente.set(clave, fila)
    return fila
  }
  for (const c of casos.data) {
    de(c.cliente).casos.push({
      slug: c.slug,
      titulo: c.titulo,
      anio: c.anio,
      era: c.era === "wav" ? "wav" : "trayectoria",
    })
  }
  // An exception may name a client that has no case in the file (a WR3 study): it still gets its row.
  for (const e of excepciones.data) {
    de(e.cliente).excepciones.push({
      id: e.id,
      tipo: leerTipoDeExcepcion(e.tipo),
      casoSlug: e.caso_slug,
      alias: e.alias,
      hasta: e.hasta,
    })
  }
  return [...porCliente.values()].sort((a, b) => a.cliente.localeCompare(b.cliente, "es"))
}
