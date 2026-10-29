export type TipoDeExcepcion = "no_nombrar" | "sin_fotos" | "sin_logo" | "confidencial"

export interface Excepcion {
  cliente: string
  alias: readonly string[]
  tipo: TipoDeExcepcion
  /** Inclusive, YYYY-MM-DD in Chile; null until someone removes it. */
  hasta: string | null
}

export type Hallazgo =
  | { tipo: "cliente"; cliente: string; excepcion: "no_nombrar" | "confidencial"; fragmento: string }
  | { tipo: "mencion"; fragmento: string }
  | { tipo: "precio"; fragmento: string }
  | { tipo: "trayectoria"; fragmento: string }

export interface Revisor {
  /** Only client exceptions: what the publisher re-checks right before sending. */
  clientes(texto: string): Hallazgo[]
  /** Everything the gate 1 verdict shows. */
  revisar(texto: string, voz: "yo" | "nosotros"): Hallazgo[]
}

// D22: only WAV and Federico mention each other. Compared without «_», «-» and «.», so @Federico_Elgueta and @wav.cl count.
const MENCIONES_PERMITIDAS = new Set(["wav", "wavcl", "wearevision", "wearevisioncl", "federico", "federicoelgueta"])
// The handle ends on a letter, digit or underscore, so «@FedericoElgueta.» does not keep the period.
const MENCION = /(?<![\p{L}\p{N}_.])@([\p{L}\p{N}_](?:[\p{L}\p{N}_.-]*[\p{L}\p{N}_])?)/gu
const PRECIOS = [
  // Amounts end on a digit, so «$1.200.000,» does not keep the comma. Longer marks first: CLP$ before CLP, M$ before $.
  /(?<![\p{L}])(?:clp\$|mm\$|m\$|us\$|\$|€|usd|clp|eur|uf)\s?\d(?:[\d.,]*\d)?/gu,
  // Starts only where a number starts: trying every digit of a long run would be quadratic (10 ms CPU per request).
  /(?<![\d.,])\d(?:[\d.,]*\d)?\s?(?:millones de pesos|millones de dolares|dolares|pesos|euros?|eur|€|lucas|usd|clp|uf)(?![\p{L}])/gu,
  /(?<![\p{L}])presupuestos?(?![\p{L}])/gu,
]
// «+20 años», «más de 25 años», «20 años de experiencia», «+200 proyectos», «200+ proyectos»: from twenty years and
// two hundred projects up. The lookbehind keeps «120 años» out and stops each try at one start.
const ANOS = String.raw`(?:[2-9]\d|veinte|treinta)`
const PROYECTOS = String.raw`[2-9]\d\d`
const MAS = String.raw`(?:\+\s*|mas\s+de\s+)`
const TRAYECTORIA = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${MAS}${ANOS}\\s+anos|${ANOS}\\+?\\s+anos\\s+de\\s+(?:experiencia|trayectoria)|${ANOS}\\+\\s+anos|${MAS}${PROYECTOS}\\s+proyectos|${PROYECTOS}\\+\\s+proyectos)(?![\\p{L}])`,
  "gu",
)

/**
 * Lower case without accents, one code point for one code point, so an index in the result is the same index in the
 * (NFC) original and the fragment shown is the person's own words. Spacing is left as is: patterns allow any run of it.
 */
export function normalizar(texto: string): string {
  return [...texto]
    .map((letra) => {
      const base = letra.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
      return base.length === letra.length ? base : letra
    })
    .join("")
}

/** A client name as a map key: no marks in any form, lower case, one apostrophe, single spaces. */
function clave(nombre: string): string {
  return nombre.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/’/g, "'").replace(/\s+/g, " ").trim()
}

function patronDeNombre(nombre: string): string {
  return nombre
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/ /g, "\\s+")
    .replace(/'/g, "['’]")
}

interface Encontrado {
  indice: number
  fin: number
  fragmento: string
  normal: string
}

function buscar(texto: string, normal: string, patron: RegExp): Encontrado[] {
  return [...normal.matchAll(patron)].map((m) => ({
    indice: m.index,
    fin: m.index + m[0].length,
    fragmento: texto.slice(m.index, m.index + m[0].length),
    normal: m[0],
  }))
}

/** In text order; a match inside or across an earlier one is the same amount seen twice («$500 USD»). */
function sinTraslapes<T extends { indice: number; fin: number }>(encontrados: T[]): T[] {
  const ordenados = [...encontrados].sort((a, b) => a.indice - b.indice || b.fin - a.fin)
  const quedan: T[] = []
  for (const e of ordenados) {
    const anterior = quedan[quedan.length - 1]
    if (!anterior || e.indice >= anterior.fin) quedan.push(e)
  }
  return quedan
}

type ConIndice = { indice: number; hallazgo: Hallazgo }

/** Compiled once per request: the Worker has 10 ms of CPU, and a piece's page reviews one text. */
export function prepararRevision(excepciones: readonly Excepcion[], hoy: string): Revisor {
  const porNombre = new Map<string, Excepcion & { tipo: "no_nombrar" | "confidencial" }>()
  for (const e of excepciones) {
    if (e.tipo !== "no_nombrar" && e.tipo !== "confidencial") continue
    if (e.hasta !== null && e.hasta < hoy) continue
    for (const nombre of [e.cliente, ...e.alias]) {
      const c = clave(nombre)
      if (c) porNombre.set(c, { ...e, tipo: e.tipo })
    }
  }
  // Longest first, so «Anglo American» wins over its alias «Anglo».
  const nombres = [...porNombre.keys()].sort((a, b) => b.length - a.length).map(patronDeNombre)
  const patron = nombres.length
    ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${nombres.join("|")})(?![\\p{L}\\p{N}])`, "gu")
    : null

  function clientesEn(texto: string, normal: string): ConIndice[] {
    if (!patron) return []
    return buscar(texto, normal, patron).flatMap(({ indice, fragmento, normal: nombre }) => {
      const e = porNombre.get(clave(nombre))
      return e
        ? [{ indice, hallazgo: { tipo: "cliente" as const, cliente: e.cliente, excepcion: e.tipo, fragmento } }]
        : []
    })
  }

  function clientes(texto: string): Hallazgo[] {
    const nfc = texto.normalize("NFC")
    return clientesEn(nfc, normalizar(nfc)).map((c) => c.hallazgo)
  }

  function revisar(texto: string, voz: "yo" | "nosotros"): Hallazgo[] {
    const nfc = texto.normalize("NFC")
    const normal = normalizar(nfc)
    const menciones = buscar(nfc, normal, MENCION)
      .filter((m) => !MENCIONES_PERMITIDAS.has(m.normal.slice(1).replace(/[_.-]/g, "")))
      .map(({ indice, fragmento }) => ({ indice, hallazgo: { tipo: "mencion" as const, fragmento } }))
    const precios = sinTraslapes(PRECIOS.flatMap((p) => buscar(nfc, normal, p))).map(({ indice, fragmento }) => ({
      indice,
      hallazgo: { tipo: "precio" as const, fragmento },
    }))
    // «+20 años» and «+200 proyectos» are Federico's: WAV may say them only while naming him.
    const trayectoria =
      voz === "nosotros" && !normal.includes("federico")
        ? buscar(nfc, normal, TRAYECTORIA).map(({ indice, fragmento }) => ({
            indice,
            hallazgo: { tipo: "trayectoria" as const, fragmento },
          }))
        : []
    return [...clientesEn(nfc, normal), ...menciones, ...precios, ...trayectoria]
      .sort((a, b) => a.indice - b.indice)
      .map((c) => c.hallazgo)
  }

  return { clientes, revisar }
}

export function mensajeDe(h: Hallazgo): string {
  switch (h.tipo) {
    case "cliente":
      return `Nombra a ${h.cliente}, que ${h.excepcion === "confidencial" ? "es confidencial" : "no se nombra"}.`
    case "mencion":
      return `${h.fragmento}: solo WAV y Federico se mencionan con @.`
    case "precio":
      return `«${h.fragmento}»: nunca se publican precios ni presupuestos.`
    case "trayectoria":
      return `«${h.fragmento}» es la trayectoria de Federico: atribúyela a él, no a WAV.`
  }
}
