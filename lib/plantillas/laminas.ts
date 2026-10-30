import { z } from "zod"

/** The template fonts are Latin subsets: any other glyph would render in a fallback font. */
const GLIFOS = /^[ -ÿ -⁯]*$/
const palabras = (s: string) => s.split(/\s+/).filter(Boolean).length
const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** A trimmed, non-empty text within a word and a character limit. `nombre` carries its article: «el título». */
function texto(nombre: string, maxPalabras: number, maxCaracteres: number) {
  const N = mayuscula(nombre)
  return z
    .string()
    .trim()
    .min(1, `Falta ${nombre}.`)
    .max(maxCaracteres, `${N} pasa los ${maxCaracteres} caracteres.`)
    .refine((s) => GLIFOS.test(s), `${N} tiene un carácter que las fuentes no tienen.`)
    .refine((s) => palabras(s) <= maxPalabras, `${N} pasa las ${maxPalabras} palabras.`)
}

const titulo = texto("el título", 12, 90)
const cuerpo = texto("el cuerpo", 32, 240)
const celda = texto("cada celda", 6, 40)

export const Portada = z.object({ tipo: z.literal("portada"), titulo, bajada: texto("la bajada", 30, 200) })
export const Punto = z.object({
  tipo: z.literal("punto"),
  numero: z.string().trim().max(4, "El número lleva hasta 4 caracteres, como «01»."),
  titulo,
  cuerpo,
})
const PUNTOS_DE_LISTA = "Una lista lleva de 2 a 4 puntos."
export const Lista = z.object({
  tipo: z.literal("lista"),
  titulo,
  items: z
    .array(texto("cada punto", 10, 80))
    .min(2, PUNTOS_DE_LISTA)
    .max(4, PUNTOS_DE_LISTA),
})
const FILAS = "Una comparación lleva de 1 a 4 filas."
export const Comparacion = z.object({
  tipo: z.literal("comparacion"),
  titulo,
  columnas: z.array(celda).length(2, "Una comparación lleva 2 columnas."),
  filas: z.array(z.array(celda).length(3, "Cada fila lleva 3 celdas separadas por «|».")).min(1, FILAS).max(4, FILAS),
})
export const Cifra = z.object({
  tipo: z.literal("cifra"),
  cifra: texto("la cifra", 3, 12),
  etiqueta: texto("la etiqueta", 6, 50),
  cuerpo,
})
const PORCENTAJE = /^(100|\d{1,2})(,\d)? ?%$/
const MAL_PORCENTAJE = "Cada barra lleva un porcentaje entre 0 y 100, como «40,0 %»."
const CIFRAS_DE_BARRAS = "Unas barras llevan de 2 a 5 cifras."
export const Barras = z.object({
  tipo: z.literal("barras"),
  titulo,
  barras: z
    .array(
      z.object({
        etiqueta: texto("cada etiqueta", 6, 40),
        valor: z
          .string()
          .trim()
          .regex(PORCENTAJE, MAL_PORCENTAJE)
          .refine((v) => Number.parseFloat(v.replace(",", ".")) <= 100, MAL_PORCENTAJE),
      }),
    )
    .min(2, CIFRAS_DE_BARRAS)
    .max(5, CIFRAS_DE_BARRAS),
})
export const Frase = z.object({
  tipo: z.literal("frase"),
  titulo: texto("la frase", 16, 120),
  nota: texto("la nota", 32, 240),
})
export const Cierre = z.object({
  tipo: z.literal("cierre"),
  titulo: texto("el título", 6, 50),
  cuerpo,
  enlace: z
    .string()
    .trim()
    .min(1, "Falta el enlace.")
    .max(80, "El enlace pasa los 80 caracteres.")
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

const CANTIDAD = "Un carrusel lleva de 3 a 10 láminas."
export const Carrusel = z.object({
  antetitulo: texto("el antetítulo", 6, 50),
  laminas: z
    .array(Lamina)
    .min(3, CANTIDAD)
    .max(10, CANTIDAD)
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
