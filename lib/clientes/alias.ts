// Matching already ignores case, accents and extra spaces, so only spellings that change letters or word edges help.
const SUFIJO_LEGAL = /[\s,]+(?:s\.?\s?a\.?|s\.?p\.?a\.?|ltda\.?|limitada|inc\.?|llc|corp\.?)$/iu

/** Other ways a client's name is usually written, to offer as aliases when marking an exception. */
export function variantesDelNombre(cliente: string): string[] {
  const nombre = cliente.trim().replace(/\s+/g, " ")
  const sinSufijo = nombre.replace(SUFIJO_LEGAL, "")
  const candidatas = [
    sinSufijo,
    nombre.replace(/\s*&\s*/g, " Y "),
    nombre.replace(/ y /giu, " & "),
    nombre.replace(/-/g, " "),
    nombre.replace(/['’]/g, ""),
    // LarrainVial → Larrain Vial; on the name without its suffix, so «SpA» is not split.
    sinSufijo.replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2"),
  ]
  const vistas = new Set([clave(nombre)])
  return candidatas.filter((c) => {
    const k = clave(c)
    if (!k || vistas.has(k)) return false
    vistas.add(k)
    return true
  })
}

function clave(nombre: string): string {
  return nombre.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim()
}

// Ordinary Spanish and English words that are also one-word names in the cases file, plus a few likely ones.
const PALABRAS_COMUNES = new Set([
  "always",
  "control",
  "corona",
  "cristal",
  "fraccion",
  "lee",
  "mistral",
  "omega",
  "paris",
  "proof",
  "vivo",
  "royal",
  "ocean",
  "sunset",
  "india",
  "match",
  "fusion",
  "nova",
  "solar",
  "nexo",
  "puente",
])

/** A one-word client that also reads as an ordinary word: «No se nombra» would flag every use of that word. */
export function esPalabraComun(cliente: string): boolean {
  const k = clave(cliente)
  return !k.includes(" ") && PALABRAS_COMUNES.has(k)
}
