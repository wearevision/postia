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

// D22: only WAV and Federico mention each other.
const MENCIONES_PERMITIDAS = new Set(["wav", "wearevision", "federico", "federicoelgueta"])
// The handle ends on a letter, digit or underscore, so «@FedericoElgueta.» does not keep the period.
const MENCION = /(?<![\p{L}\p{N}_.])@([\p{L}\p{N}_](?:[\p{L}\p{N}_.-]*[\p{L}\p{N}_])?)/gu
const PRECIOS = [
  // Amounts end on a digit, so «$1.200.000,» does not keep the comma.
  /(?<![\p{L}])(?:us\$|\$|usd|clp|uf)\s?\d(?:[\d.,]*\d)?/gu,
  // Starts only where a number starts: trying every digit of a long run would be quadratic (10 ms CPU per request).
  /(?<![\d.,])\d(?:[\d.,]*\d)?\s?(?:millones de pesos|millones de dolares|dolares|pesos|lucas|usd|clp|uf)(?![\p{L}])/gu,
  /(?<![\p{L}])presupuestos?(?![\p{L}])/gu,
]
const TRAYECTORIA = /(?:\+|mas de)\s?(?:20|veinte) anos|(?:\+|mas de)\s?200 proyectos/gu

/**
 * Lower case without accents, one code point for one code point, so an index in the result is the same index in the
 * original and the fragment shown is the person's own words.
 */
export function normalizar(texto: string): string {
  return [...texto]
    .map((letra) => {
      const base = letra.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
      return base.length === letra.length ? base : letra
    })
    .join("")
}

function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function buscar(texto: string, normal: string, patron: RegExp): { fragmento: string; normal: string }[] {
  return [...normal.matchAll(patron)].map((m) => ({
    fragmento: texto.slice(m.index, m.index + m[0].length),
    normal: m[0],
  }))
}

/** Compiled once per request: the Worker has 10 ms of CPU, and a piece's page reviews one text. */
export function prepararRevision(excepciones: readonly Excepcion[], hoy: string): Revisor {
  const porNombre = new Map<string, Excepcion & { tipo: "no_nombrar" | "confidencial" }>()
  for (const e of excepciones) {
    if (e.tipo !== "no_nombrar" && e.tipo !== "confidencial") continue
    if (e.hasta !== null && e.hasta < hoy) continue
    for (const nombre of [e.cliente, ...e.alias]) {
      const clave = normalizar(nombre.trim())
      if (clave) porNombre.set(clave, { ...e, tipo: e.tipo })
    }
  }
  // Longest first, so «Anglo American» wins over its alias «Anglo».
  const nombres = [...porNombre.keys()].sort((a, b) => b.length - a.length).map(escapar)
  const patron = nombres.length
    ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${nombres.join("|")})(?![\\p{L}\\p{N}])`, "gu")
    : null

  function clientes(texto: string): Hallazgo[] {
    if (!patron) return []
    return buscar(texto, normalizar(texto), patron).flatMap(({ fragmento, normal }) => {
      const e = porNombre.get(normal)
      return e ? [{ tipo: "cliente" as const, cliente: e.cliente, excepcion: e.tipo, fragmento }] : []
    })
  }

  function revisar(texto: string, voz: "yo" | "nosotros"): Hallazgo[] {
    const normal = normalizar(texto)
    const menciones = [...normal.matchAll(MENCION)]
      .filter((m) => !MENCIONES_PERMITIDAS.has(m[1] ?? ""))
      .map((m) => ({ tipo: "mencion" as const, fragmento: texto.slice(m.index, m.index + m[0].length) }))
    const precios = PRECIOS.flatMap((p) => buscar(texto, normal, p))
      .sort((a, b) => texto.indexOf(a.fragmento) - texto.indexOf(b.fragmento))
      .map(({ fragmento }) => ({ tipo: "precio" as const, fragmento }))
    // «+20 años» and «+200 proyectos» are Federico's: WAV may say them only while naming him.
    const trayectoria =
      voz === "nosotros" && !normal.includes("federico")
        ? buscar(texto, normal, TRAYECTORIA).map(({ fragmento }) => ({ tipo: "trayectoria" as const, fragmento }))
        : []
    return [...clientes(texto), ...menciones, ...precios, ...trayectoria]
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
