import type { Familia } from "./estilos"
import type { Carrusel, Lamina } from "./laminas"

/** Federico's public profile, without https:// (given on 2026-10-30). */
export const PERFIL_DE_FEDERICO = "linkedin.com/in/federico-elgueta-edwards"

// Port of wr3-web social/linkedin/plantilla.json: every slide type with its limits written in place.
const CUERPO: Lamina[] = [
  {
    tipo: "portada",
    titulo: "Portada: la pregunta que responde la guía",
    bajada: "Bajada de una línea: qué se lleva quien llega hasta el final.",
  },
  {
    tipo: "punto",
    numero: "01",
    titulo: "Idea con número: título de hasta 12 palabras",
    cuerpo:
      "Texto de apoyo de hasta 32 palabras. Una sola idea por lámina. Si no cabe, divide la idea en dos láminas en vez de achicar la letra.",
  },
  {
    tipo: "punto",
    numero: "",
    titulo: "Idea sin número",
    cuerpo:
      "El número de arriba es opcional: úsalo solo cuando las láminas siguen pasos en orden, como en una guía de cómo hacer algo.",
  },
  {
    tipo: "lista",
    titulo: "Lista: de 2 a 4 puntos",
    items: [
      "Cada punto con hasta 10 palabras",
      "Sin punto final ni conectores",
      "La numeración se pone sola",
      "Cuatro puntos como máximo",
    ],
  },
  {
    tipo: "comparacion",
    titulo: "Comparación: hasta 4 filas",
    columnas: ["Opción A", "Opción B"],
    filas: [
      ["Criterio uno", "Celda breve", "Celda breve"],
      ["Criterio dos", "Hasta seis palabras por celda", "Sí"],
      ["Criterio tres", "No", "Depende"],
      ["Criterio cuatro", "Texto breve", "Texto breve"],
    ],
  },
  {
    tipo: "cifra",
    cifra: "00,0 %",
    etiqueta: "unidad de la cifra",
    cuerpo:
      "Solo cifras que la guía publica y la página de método respalda. Esta línea dice de dónde sale la cifra y qué significa.",
  },
  {
    tipo: "barras",
    titulo: "Barras: cifras de una misma escala",
    barras: [
      { etiqueta: "Primera etapa, etiqueta breve", valor: "40,0 %" },
      { etiqueta: "Segunda etapa", valor: "65,0 %" },
      { etiqueta: "Tercera etapa", valor: "90,0 %" },
    ],
  },
  {
    tipo: "frase",
    titulo: "Frase de cierre: una sola oración que alguien querría citar.",
    nota: "Nota al pie con el contexto o la fuente de la frase, en una o dos líneas.",
  },
]

// Each family's call to action (wr3-web build-carousels.mjs `retarget`).
const CIERRES: Record<Familia, { antetitulo: string; titulo: string; enlace: string }> = {
  wr3: { antetitulo: "Plantilla · Carrusel WR3", titulo: "Lee la guía completa", enlace: "wr3.wearevision.cl" },
  wav: { antetitulo: "Plantilla · Carrusel WAV", titulo: "Conversemos", enlace: "wearevision.cl" },
  personal: { antetitulo: "Plantilla · Carrusel personal", titulo: "Sígueme para más", enlace: PERFIL_DE_FEDERICO },
}

/** The editor's starting carousel for a family. */
export function carruselInicial(familia: Familia): Carrusel {
  const c = CIERRES[familia]
  return {
    antetitulo: c.antetitulo,
    laminas: [
      ...CUERPO,
      {
        tipo: "cierre",
        titulo: c.titulo,
        cuerpo: "Cierre de una línea con la invitación a conversar 30 minutos.",
        enlace: c.enlace,
      },
    ],
  }
}
