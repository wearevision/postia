import { z } from "zod"

/** The template fonts are Latin subsets: any other glyph would render in a fallback font. */
// biome-ignore lint/complexity/useRegexLiterals: as a literal, Biome's fix turns the \u escapes into invisible characters
const GLIFOS = new RegExp("^[\\u0020-\\u00FF\\u2000-\\u206F]*$")
const palabras = (s: string) => s.split(/\s+/).filter(Boolean).length
const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export interface Limite {
  palabras?: number
  caracteres?: number
  minimo?: number
  maximo?: number
}
type Texto = { palabras: number; caracteres: number }

const TITULO = { palabras: 12, caracteres: 90 } as const
const CUERPO = { palabras: 32, caracteres: 240 } as const
const CELDA = { palabras: 6, caracteres: 40 } as const

/**
 * Every numeric limit of the templates, per slide type and field. The schema below and the carousel writer's prompt
 * (lib/series/instrucciones.ts) both read it, so what Claude is told is what the schema enforces.
 */
export const LIMITES = {
  carrusel: { minimo: 3, maximo: 10 },
  antetitulo: { palabras: 6, caracteres: 50 },
  portada: { titulo: TITULO, bajada: { palabras: 30, caracteres: 200 } },
  punto: { numero: { caracteres: 4 }, titulo: TITULO, cuerpo: CUERPO },
  lista: { titulo: TITULO, items: { minimo: 2, maximo: 4, palabras: 10, caracteres: 80 } },
  comparacion: {
    titulo: TITULO,
    columnas: { minimo: 2, maximo: 2, ...CELDA },
    filas: { minimo: 1, maximo: 4 },
    celdas: { minimo: 3, maximo: 3, ...CELDA },
  },
  cifra: { cifra: { palabras: 3, caracteres: 12 }, etiqueta: { palabras: 6, caracteres: 50 }, cuerpo: CUERPO },
  barras: { titulo: TITULO, barras: { minimo: 2, maximo: 5 }, etiqueta: { palabras: 6, caracteres: 40 } },
  frase: { titulo: { palabras: 16, caracteres: 120 }, nota: CUERPO },
  cierre: { titulo: { palabras: 6, caracteres: 50 }, cuerpo: CUERPO, enlace: { caracteres: 80 } },
} as const satisfies Record<string, Limite | Record<string, Limite>>

const L = LIMITES

/** A trimmed, non-empty text within a word and a character limit. `nombre` carries its article: «el título». */
function texto(nombre: string, { palabras: maxPalabras, caracteres: maxCaracteres }: Texto) {
  const N = mayuscula(nombre)
  return z
    .string()
    .trim()
    .min(1, `Falta ${nombre}.`)
    .max(maxCaracteres, `${N} pasa los ${maxCaracteres} caracteres.`)
    .refine((s) => GLIFOS.test(s), `${N} tiene un carácter que las fuentes no tienen.`)
    .refine((s) => palabras(s) <= maxPalabras, `${N} pasa las ${maxPalabras} palabras.`)
}

const titulo = texto("el título", TITULO)
const cuerpo = texto("el cuerpo", CUERPO)
const celda = texto("cada celda", CELDA)

export const Portada = z.object({ tipo: z.literal("portada"), titulo, bajada: texto("la bajada", L.portada.bajada) })
export const Punto = z.object({
  tipo: z.literal("punto"),
  numero: z
    .string()
    .trim()
    .max(L.punto.numero.caracteres, `El número lleva hasta ${L.punto.numero.caracteres} caracteres, como «01».`),
  titulo,
  cuerpo,
})
const PUNTOS_DE_LISTA = `Una lista lleva de ${L.lista.items.minimo} a ${L.lista.items.maximo} puntos.`
export const Lista = z.object({
  tipo: z.literal("lista"),
  titulo,
  items: z
    .array(texto("cada punto", L.lista.items))
    .min(L.lista.items.minimo, PUNTOS_DE_LISTA)
    .max(L.lista.items.maximo, PUNTOS_DE_LISTA),
})
const FILAS = `Una comparación lleva de ${L.comparacion.filas.minimo} a ${L.comparacion.filas.maximo} filas.`
export const Comparacion = z.object({
  tipo: z.literal("comparacion"),
  titulo,
  columnas: z
    .array(celda)
    .length(L.comparacion.columnas.maximo, `Una comparación lleva ${L.comparacion.columnas.maximo} columnas.`),
  filas: z
    .array(
      z
        .array(celda)
        .length(
          L.comparacion.celdas.maximo,
          `Cada fila lleva ${L.comparacion.celdas.maximo} celdas separadas por «|».`,
        ),
    )
    .min(L.comparacion.filas.minimo, FILAS)
    .max(L.comparacion.filas.maximo, FILAS),
})
export const Cifra = z.object({
  tipo: z.literal("cifra"),
  cifra: texto("la cifra", L.cifra.cifra),
  etiqueta: texto("la etiqueta", L.cifra.etiqueta),
  cuerpo,
})
const PORCENTAJE = /^(100|\d{1,2})(,\d)? ?%$/
const MAL_PORCENTAJE = "Cada barra lleva un porcentaje entre 0 y 100, como «40,0 %»."
const CIFRAS_DE_BARRAS = `Unas barras llevan de ${L.barras.barras.minimo} a ${L.barras.barras.maximo} cifras.`
export const Barras = z.object({
  tipo: z.literal("barras"),
  titulo,
  barras: z
    .array(
      z.object({
        etiqueta: texto("cada etiqueta", L.barras.etiqueta),
        valor: z
          .string()
          .trim()
          .regex(PORCENTAJE, MAL_PORCENTAJE)
          .refine((v) => Number.parseFloat(v.replace(",", ".")) <= 100, MAL_PORCENTAJE),
      }),
    )
    .min(L.barras.barras.minimo, CIFRAS_DE_BARRAS)
    .max(L.barras.barras.maximo, CIFRAS_DE_BARRAS),
})
export const Frase = z.object({
  tipo: z.literal("frase"),
  titulo: texto("la frase", L.frase.titulo),
  nota: texto("la nota", L.frase.nota),
})
export const Cierre = z.object({
  tipo: z.literal("cierre"),
  titulo: texto("el título", L.cierre.titulo),
  cuerpo,
  enlace: z
    .string()
    .trim()
    .min(1, "Falta el enlace.")
    .max(L.cierre.enlace.caracteres, `El enlace pasa los ${L.cierre.enlace.caracteres} caracteres.`)
    .regex(/^\S+$/, "El enlace va sin espacios, como «wearevision.cl».")
    .refine((s) => GLIFOS.test(s), "El enlace tiene un carácter que las fuentes no tienen."),
})

export const Lamina = z.discriminatedUnion("tipo", [Portada, Punto, Lista, Comparacion, Cifra, Barras, Frase, Cierre])
export type Lamina = z.infer<typeof Lamina>
export type TipoDeLamina = Lamina["tipo"]
export const TIPOS_DE_LAMINA: readonly TipoDeLamina[] = [
  "portada",
  "punto",
  "lista",
  "comparacion",
  "cifra",
  "barras",
  "frase",
  "cierre",
]

const CANTIDAD = `Un carrusel lleva de ${L.carrusel.minimo} a ${L.carrusel.maximo} láminas.`
export const Carrusel = z.object({
  antetitulo: texto("el antetítulo", L.antetitulo),
  laminas: z
    .array(Lamina)
    .min(L.carrusel.minimo, CANTIDAD)
    .max(L.carrusel.maximo, CANTIDAD)
    .refine((ls) => ls[0]?.tipo === "portada", "La primera lámina es la portada.")
    .refine((ls) => ls.at(-1)?.tipo === "cierre", "La última lámina es el cierre."),
})
export type Carrusel = z.infer<typeof Carrusel>

export type Revision = { ok: true; carrusel: Carrusel } | { ok: false; error: string }

/** The first problem, in words Federico can act on; a slide's problem names the slide (1-based). */
export function revisarCarrusel(entrada: unknown): Revision {
  const leido = Carrusel.safeParse(entrada)
  if (leido.success) return { ok: true, carrusel: leido.data }
  const issue = leido.error.issues[0]
  if (!issue) return { ok: false, error: "Revisa el carrusel." }
  const [campo, indice] = issue.path
  if (campo === "laminas" && typeof indice === "number")
    return { ok: false, error: `Lámina ${indice + 1}: ${issue.message}` }
  return { ok: false, error: issue.message }
}
