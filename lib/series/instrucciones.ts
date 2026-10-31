import type { Familia } from "@/lib/plantillas/estilos"
import { LIMITES, type Limite, type TipoDeLamina } from "@/lib/plantillas/laminas"
import { type IdDeTema, TEMAS } from "@/lib/plantillas/temas"
import {
  AVISO_DE_DATOS,
  type ContextoDeRedaccion,
  comoDatos,
  lineaEditorial,
  reglasDeLaCasa,
  vozDeLaMarca,
} from "@/lib/redaccion/instrucciones"
import {
  type CuentaDeSerie,
  type FormatoDeIdea,
  type HallazgoDeSerie,
  LARGO_DE_GANCHO,
  LARGO_DE_RAZON,
  LARGO_DE_RESUMEN,
  MAXIMO_DE_FUENTES,
  PASOS_DE_TEXTO,
  type PasoDeEsqueleto,
} from "@/lib/series/propuestas"

// Worker-safe: the prompts of 4f. Accounts, pillars and findings are numbered from 1; validarSerie maps the numbers
// back. Every slide limit in the carousel prompt is read from LIMITES, the table the schema enforces.

/** The approved report as Claude sees it. `hallazgos` is the flat list whose order gives each finding its number. */
export interface InformeDeSerie {
  tema: string
  angulos: { nombre: string; por_que: string }[]
  hallazgos: HallazgoDeSerie[]
}

export const PREVIAS_EN_EL_MENSAJE = 30
export const LARGO_DEL_TITULO_DEL_DOCUMENTO = 100

const QUE_ES_CADA_LAMINA: Record<TipoDeLamina, string> = {
  portada: "abre el carrusel con el gancho",
  punto: "una idea numerada",
  lista: "varios puntos breves",
  comparacion: "dos opciones lado a lado",
  cifra: "un número destacado",
  barras: "porcentajes comparados",
  frase: "una frase destacada",
  cierre: "cierra con una invitación y un enlace",
}

const FAMILIA: Record<Familia, string> = { wr3: "WR3", wav: "WAV", personal: "Personal" }

function cuantos({ minimo, maximo }: Limite): string {
  return minimo === maximo ? `${maximo}` : `de ${minimo} a ${maximo}`
}

function largo({ palabras, caracteres }: Limite): string {
  return palabras === undefined
    ? `hasta ${caracteres} caracteres`
    : `hasta ${palabras} palabras y ${caracteres} caracteres`
}

const campo = (nombre: string, limite: Limite) => `${nombre} (${largo(limite)})`

/** Fields and limits per slide type, as the JSON the schema in lib/plantillas/laminas.ts reads. */
function camposDeLaminas(): string {
  const { portada, punto, lista, comparacion, cifra, barras, frase, cierre, fuente } = LIMITES
  const c = comparacion
  const conFuente = `fuente (opcional; medio y año, como «Social Science & Medicine, 2022»; sin enlaces; ${largo(fuente)})`
  const lineas: Record<TipoDeLamina, string> = {
    portada: [campo("titulo", portada.titulo), campo("bajada", portada.bajada)].join("; "),
    punto: [
      `numero (${largo(punto.numero)}, como «01», o vacío)`,
      campo("titulo", punto.titulo),
      campo("cuerpo", punto.cuerpo),
      conFuente,
    ].join("; "),
    lista: [
      campo("titulo", lista.titulo),
      `items: ${cuantos(lista.items)} textos, cada uno ${largo(lista.items)}`,
      conFuente,
    ].join("; "),
    comparacion: [
      campo("titulo", c.titulo),
      `columnas: ${cuantos(c.columnas)} encabezados, cada uno ${largo(c.columnas)}`,
      `filas: ${cuantos(c.filas)}, cada una con ${cuantos(c.celdas)} celdas (el criterio y un valor por columna), cada celda ${largo(c.celdas)}`,
      conFuente,
    ].join("; "),
    cifra: [
      campo("cifra", cifra.cifra),
      campo("etiqueta", cifra.etiqueta),
      campo("cuerpo", cifra.cuerpo),
      conFuente,
    ].join("; "),
    barras: [
      campo("titulo", barras.titulo),
      `barras: ${cuantos(barras.barras)}, cada una con ${campo("etiqueta", barras.etiqueta)} y valor (un porcentaje entre 0 y 100, como «40,0 %»)`,
      conFuente,
    ].join("; "),
    frase: [campo("titulo", frase.titulo), campo("nota", frase.nota), conFuente].join("; "),
    cierre: [
      campo("titulo", cierre.titulo),
      campo("cuerpo", cierre.cuerpo),
      `enlace (sin espacios, ${largo(cierre.enlace)}, como «wearevision.cl»)`,
    ].join("; "),
  }
  return (Object.keys(lineas) as TipoDeLamina[])
    .map((tipo) => `- ${tipo}: ${QUE_ES_CADA_LAMINA[tipo]}. Campos: ${lineas[tipo]}.`)
    .join("\n")
}

const TIPOS_EN_UNA_LINEA = (Object.keys(QUE_ES_CADA_LAMINA) as TipoDeLamina[])
  .map((t) => `${t} (${QUE_ES_CADA_LAMINA[t]})`)
  .join(", ")

function cuentaDeSerie(c: CuentaDeSerie, i: number): string {
  const voz =
    c.marca.voz === "nosotros"
      ? `habla como ${c.marca.nombre}, en primera persona plural («nosotros»)`
      : `habla como ${c.marca.nombre}, en primera persona singular («yo»), y no habla en nombre de WAV sin citarla`
  const pilares = c.pilares.map((p, j) => `    [${j + 1}] ${p.nombre}: ${p.deQueHabla || "(sin descripción)"}`)
  return [
    `[${i + 1}] «${c.nombre}» (${c.tipo === "empresa" ? "página de empresa" : "perfil personal"}): ${voz}.`,
    `  Pilares:\n${pilares.length > 0 ? pilares.join("\n") : "    (ninguno)"}`,
    `  Temas vetados: ${c.temasVetados.trim() || "(ninguno)"}`,
  ].join("\n")
}

/** The accounts as every idea prompt lists them: numbered, with voice, pillars and vetoed topics. */
export function cuentasDelPrompt(cuentas: readonly CuentaDeSerie[]): string {
  return `# Cuentas\n${cuentas.map(cuentaDeSerie).join("\n")}`
}

/** 4f's rules for proposing ideas; only the rule about sources changes between series, crosses and Sunday. */
export function reglasDeIdeas(reglaDeFuentes: string, noNombrar: readonly string[]): string {
  const reglas = [
    "Cada idea es distinta de las demás: otro ángulo y otro gancho, no la misma idea dicha de otra forma.",
    reglaDeFuentes,
    `formato «texto» es un post de texto: su esqueleto lleva de ${PASOS_DE_TEXTO.minimo} a ${PASOS_DE_TEXTO.maximo} pasos, cada uno con tipo null y la idea del paso.`,
    `formato «carrusel_pdf» es un carrusel: su esqueleto lleva de ${LIMITES.carrusel.minimo} a ${LIMITES.carrusel.maximo} láminas, una por paso, cada una con su tipo; la primera es portada y la última cierre. Tipos: ${TIPOS_EN_UNA_LINEA}.`,
    "cuenta es el número de la cuenta que mejor le calza a la idea, y razon dice por qué en una sola oración. Una persona lo confirma.",
    "pilar es el número de uno de los pilares de esa cuenta, o null si ninguno calza.",
    `El gancho tiene hasta ${LARGO_DE_GANCHO} caracteres, el resumen hasta ${LARGO_DE_RESUMEN} y la razón hasta ${LARGO_DE_RAZON}.`,
    "No propongas ideas sobre los temas vetados de la cuenta.",
    "WAV habla como «nosotros» y Federico como «yo».",
    "«+20 años» y «+200 proyectos» son la trayectoria de Federico, no de WAV. Un caso anterior a agosto de 2025 es trayectoria de Federico, nunca algo que «WAV hizo».",
    "Nunca precios ni presupuestos.",
  ]
  if (noNombrar.length > 0) reglas.push(`Nunca nombres ni aludas a estos clientes: ${noNombrar.join(", ")}.`)
  return `# Reglas\n${reglas.map((r) => `- ${r}`).join("\n")}`
}

export const QUIENES_SOMOS =
  "Las cuentas son de WAV, una agencia chilena de experiencias, eventos y BTL que nació en agosto de 2025, y de Federico, su fundador. Escribes en español de Chile."

/** Stable per set of accounts and exception list, so the cache hits across series. */
export function sistemaDeSerie(cuentas: readonly CuentaDeSerie[], noNombrar: readonly string[]): string {
  return [
    `Propones una serie de ideas para LinkedIn a partir de un informe de investigación que Federico aprobó. ${QUIENES_SOMOS}`,
    cuentasDelPrompt(cuentas),
    reglasDeIdeas(
      `Cada idea usa de 1 a ${MAXIMO_DE_FUENTES} hallazgos del informe, por su número. Nunca inventes una fuente, una cifra, un cliente ni un caso.`,
      noNombrar,
    ),
    "Si los hallazgos no alcanzan para todas las ideas pedidas, propón menos. Mejor pocas ideas sólidas que muchas repetidas.",
  ].join("\n\n")
}

function cuerpoDelInforme(informe: InformeDeSerie): string {
  const numero = new Map(informe.hallazgos.map((h, i) => [h, i + 1]))
  const bloques = informe.angulos.map((a) => {
    const hallazgos = informe.hallazgos
      .filter((h) => h.angulo === a.nombre)
      .map((h) => `[${numero.get(h)}] ${h.resumen} (${h.medio}, ${h.publicado_en ?? "sin fecha"})`)
    return [`## ${a.nombre}`, a.por_que ? `Por qué: ${a.por_que}` : null, ...hallazgos].filter(Boolean).join("\n")
  })
  const angulos = new Set(informe.angulos.map((a) => a.nombre))
  const sueltos = informe.hallazgos
    .filter((h) => !angulos.has(h.angulo))
    .map((h) => `[${numero.get(h)}] ${h.resumen} (${h.medio}, ${h.publicado_en ?? "sin fecha"})`)
  if (sueltos.length > 0) bloques.push(["## Otros", ...sueltos].join("\n"))
  return [
    `<tema>\n${comoDatos(informe.tema)}\n</tema>`,
    `<informe>\n${comoDatos(bloques.join("\n\n"))}\n</informe>`,
  ].join("\n\n")
}

/** Previous hooks or titles as a data list, or «(ninguna)». */
export function lista(ganchos: readonly string[]): string {
  return ganchos.length > 0 ? comoDatos(ganchos.map((g) => `- ${g}`).join("\n")) : "(ninguna)"
}

export function mensajeDeSerie(informe: InformeDeSerie, cantidad: number, previas: readonly string[]): string {
  return [
    "Informe aprobado (tema, ángulos y hallazgos numerados):",
    cuerpoDelInforme(informe),
    "Ideas propuestas antes, que no se repiten:",
    `<ideas_previas>\n${lista(previas.slice(0, PREVIAS_EN_EL_MENSAJE))}\n</ideas_previas>`,
    `Propón hasta ${cantidad} ideas para una serie, distintas entre sí y de las anteriores.`,
    AVISO_DE_DATOS,
  ].join("\n\n")
}

export function mensajeDeOtraIdea(
  idea: { gancho: string; resumen: string; formato: FormatoDeIdea },
  informe: InformeDeSerie,
  hermanas: readonly string[],
): string {
  return [
    "Federico pidió otra idea en lugar de esta:",
    `<idea>\n${comoDatos(`${idea.gancho}\n${idea.resumen}\nFormato: ${idea.formato}`)}\n</idea>`,
    "El informe de la serie:",
    cuerpoDelInforme(informe),
    "Las otras ideas de la serie:",
    `<hermanas>\n${lista(hermanas)}\n</hermanas>`,
    "Propón una sola idea que la reemplace, distinta de ella y de sus hermanas.",
    AVISO_DE_DATOS,
  ].join("\n\n")
}

/** Stable per brand, account, line version, exception list and theme set: the cache hits across carousels. */
export function sistemaDeCarrusel(c: ContextoDeRedaccion, temas: readonly IdDeTema[]): string {
  const listaDeTemas = temas.map((t) => `- ${t} (${TEMAS[t].nombre}, familia ${FAMILIA[TEMAS[t].familia]})`)
  return [
    `Escribes carruseles PDF para LinkedIn en la cuenta «${c.cuenta.nombre}», en español de Chile. Federico no escribe láminas: lo que escribas es lo que él firma.`,
    vozDeLaMarca(c),
    `# Línea editorial (versión ${c.linea.version})\n\n${lineaEditorial(c)}`,
    `# Reglas que no se rompen\n${reglasDeLaCasa(c)}`,
    [
      "# Lo que respondes",
      "- texto: el texto del post que acompaña al carrusel. Tiene su propio papel: invita a abrir el carrusel, no lo repite. Los enlaces van dentro del texto.",
      "- Cada dato va atribuido: la lámina que lo muestra lleva su fuente en el campo fuente (medio y año), y el texto del post atribuye los datos clave dentro de la oración, en breve, sin lista de fuentes, sin «lámina N» y sin enlaces a estudios.",
      `- titulo: el título del documento, hasta ${LARGO_DEL_TITULO_DEL_DOCUMENTO} caracteres.`,
      "- tema: uno de los temas permitidos, por su id.",
      `- antetitulo: la línea sobre el título de cada lámina, ${largo(LIMITES.antetitulo)}.`,
      `- laminas: de ${LIMITES.carrusel.minimo} a ${LIMITES.carrusel.maximo} láminas, una por paso del esqueleto de la idea, en el mismo orden y con el mismo tipo. La primera es portada y la última cierre.`,
    ].join("\n"),
    `# Tipos de lámina y sus límites\nLos límites son estrictos: una lámina que los pasa no cabe en la plantilla. Solo letras latinas, sin emojis.\n${camposDeLaminas()}`,
    `# Temas permitidos\nElige el que calce: los de WR3 para temas de investigación (estudios, focus groups, consumidores), los de WAV para temas de agencia (experiencias, eventos, BTL).\n${listaDeTemas.join("\n")}`,
  ].join("\n\n")
}

function paso(p: PasoDeEsqueleto, i: number): string {
  return "tipo" in p ? `${i + 1}. ${p.tipo}: ${p.idea}` : `${i + 1}. ${p.idea}`
}

export function mensajeDeCarrusel(
  idea: { gancho: string; resumen: string; esqueleto: readonly PasoDeEsqueleto[] },
  hallazgos: readonly HallazgoDeSerie[],
): string {
  const fuentes = hallazgos.map(
    (h, i) => `[${i + 1}] ${h.resumen} (${h.medio}, ${h.publicado_en ?? "sin fecha"}) ${h.enlace}`,
  )
  return [
    "La idea aprobada, con su esqueleto:",
    `<idea>\n${comoDatos([`Gancho: ${idea.gancho}`, `Resumen: ${idea.resumen}`, "Esqueleto:", ...idea.esqueleto.map(paso)].join("\n"))}\n</idea>`,
    "Sus hallazgos (el material, con medio, fecha y enlace; atribuye el medio y el año cuando uses un dato; los enlaces a estudios no van en el post):",
    `<hallazgos>\n${comoDatos(fuentes.join("\n"))}\n</hallazgos>`,
    "Escribe el carrusel.",
    AVISO_DE_DATOS,
  ].join("\n\n")
}

export function mensajeDeReparacion(error: string, anterior: unknown): string {
  return [
    `Tu respuesta anterior no pasó la revisión de las plantillas: «${error}»`,
    "Corrígela y responde de nuevo con el carrusel completo. Cambia solo lo necesario para que quepa.",
    `<respuesta_anterior>\n${comoDatos(JSON.stringify(anterior, null, 2))}\n</respuesta_anterior>`,
    AVISO_DE_DATOS,
  ].join("\n\n")
}
