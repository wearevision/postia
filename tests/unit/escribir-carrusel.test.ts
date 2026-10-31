// @vitest-environment node
import { describe, expect, test, vi } from "vitest"
import { Falla } from "@/lib/dominio/falla"
import type { Pedir, RespuestaDeClaude } from "@/lib/ia/claude"
import { LIMITES, TIPOS_DE_LAMINA } from "@/lib/plantillas/laminas"
import type { IdDeTema } from "@/lib/plantillas/temas"
import type { ContextoDeRedaccion } from "@/lib/redaccion/instrucciones"
import { escribirCarrusel, FORMATO_DE_CARRUSEL } from "@/lib/series/carrusel"

const CONTEXTO: ContextoDeRedaccion = {
  marca: { id: "marca-wav", nombre: "WAV", voz: "nosotros" },
  cuenta: { nombre: "WAV", tipo: "empresa" },
  linea: {
    version: 2,
    secciones: { deQueHablamos: "", tono: "", formatos: "", temasVetados: "", temasAVigilar: "", ejemplos: "" },
    pilares: [],
  },
  noNombrar: [],
}

const TEMAS: IdDeTema[] = ["oscura", "papel"]

const IDEA = {
  gancho: "Los focus groups no son lo que crees",
  resumen: "Tres mitos y lo que dicen los datos.",
  esqueleto: [
    { tipo: "portada" as const, idea: "El mito" },
    { tipo: "punto" as const, idea: "El dato" },
    { tipo: "cierre" as const, idea: "La invitación" },
  ],
}

const HALLAZGOS = [
  {
    id: "h1",
    angulo: "Mitos",
    resumen: "El 40 % de los estudios usa grupos chicos.",
    medio: "Medio",
    publicado_en: "2026-10-20",
    enlace: "https://medio.cl/1",
  },
]

const LAMINAS = [
  { tipo: "portada", titulo: "Los focus groups no mienten", bajada: "Tres mitos y lo que dicen los datos." },
  { tipo: "punto", numero: "01", titulo: "Un grupo chico también sirve", cuerpo: "Lo dice el estudio de Medio." },
  { tipo: "cierre", titulo: "Conversemos", cuerpo: "Te contamos cómo lo hacemos.", enlace: "wearevision.cl" },
]

function escrito(extra: Record<string, unknown> = {}) {
  return {
    texto: "Abre el carrusel: tres mitos sobre los focus groups. Fuente: Medio, https://medio.cl/1",
    titulo: "Tres mitos de los focus groups",
    tema: "papel",
    antetitulo: "WR3 Research",
    laminas: LAMINAS,
    ...extra,
  }
}

const respuesta = (datos: unknown, detenido: RespuestaDeClaude["detenido"] = "end_turn"): RespuestaDeClaude => ({
  texto: JSON.stringify(datos),
  detenido,
  bloques: [],
})

const LARGO = {
  ...LAMINAS[1],
  titulo: "Un título que tiene muchas más de doce palabras para que no quepa en la lámina",
}

function pedirQueResponde(...respuestas: RespuestaDeClaude[]) {
  const cola = [...respuestas]
  return vi.fn<Pedir>(async () => {
    const r = cola.shift()
    if (!r) throw new Error("sin más respuestas")
    return r
  })
}

const escribirCon = (pedir: Pedir) =>
  escribirCarrusel(pedir, CONTEXTO, { clave: "carrusel:asignacion:a1", idea: IDEA, hallazgos: HALLAZGOS, temas: TEMAS })

describe("escribirCarrusel", () => {
  test("asks Opus once under the key, charged to the brand, and returns the copy, title, theme and slides", async () => {
    const pedir = pedirQueResponde(respuesta(escrito()))
    const r = await escribirCon(pedir)
    expect(pedir).toHaveBeenCalledTimes(1)
    const [paso, pedido] = vi.mocked(pedir).mock.calls[0]
    expect(paso).toEqual({ clave: "carrusel:asignacion:a1", paso: "carrusel", marcaId: "marca-wav" })
    expect(pedido).toMatchObject({ modelo: "claude-opus-5-5", esfuerzo: "high" })
    expect(JSON.stringify(pedido.formato)).toContain("comparacion")
    expect(pedido.sistema).toContain("papel")
    expect(JSON.stringify(pedido.mensajes)).toContain("El 40 % de los estudios")
    expect(r).toEqual({
      texto: escrito().texto,
      titulo: "Tres mitos de los focus groups",
      tema: "papel",
      diseno: { antetitulo: "WR3 Research", laminas: LAMINAS },
    })
  })

  test("a slide outside the limits is repaired once with the exact error and the previous answer", async () => {
    const malo = escrito({ laminas: [LAMINAS[0], LARGO, LAMINAS[2]] })
    const pedir = pedirQueResponde(respuesta(malo), respuesta(escrito()))
    const r = await escribirCon(pedir)
    expect(pedir).toHaveBeenCalledTimes(2)
    const [paso, pedido] = vi.mocked(pedir).mock.calls[1]
    expect(paso).toEqual({ clave: "carrusel:asignacion:a1:reparar", paso: "carrusel", marcaId: "marca-wav" })
    const mensaje = JSON.stringify(pedido.mensajes)
    expect(mensaje).toContain("Lámina 2: El título pasa las 12 palabras.")
    expect(mensaje).toContain("muchas más de doce palabras")
    expect(r.diseno.laminas).toEqual(LAMINAS)
  })

  test("a second refusal fails with the template's error", async () => {
    const malo = escrito({ laminas: [LAMINAS[0], LARGO, LAMINAS[2]] })
    const pedir = pedirQueResponde(respuesta(malo), respuesta(malo))
    await expect(escribirCon(pedir)).rejects.toThrow(
      new Falla("No pude ajustar las láminas a la plantilla: Lámina 2: El título pasa las 12 palabras."),
    )
    expect(pedir).toHaveBeenCalledTimes(2)
  })

  test("a theme outside the account's themes is repaired like a slide error", async () => {
    const pedir = pedirQueResponde(respuesta(escrito({ tema: "magenta" })), respuesta(escrito()))
    expect((await escribirCon(pedir)).tema).toBe("papel")
    expect(JSON.stringify(vi.mocked(pedir).mock.calls[1][1].mensajes)).toContain("magenta")
  })

  test("a document title over 100 characters or empty is repaired too", async () => {
    for (const titulo of ["x".repeat(101), "  "]) {
      const pedir = pedirQueResponde(respuesta(escrito({ titulo })), respuesta(escrito()))
      expect((await escribirCon(pedir)).titulo).toBe("Tres mitos de los focus groups")
      expect(pedir).toHaveBeenCalledTimes(2)
    }
  })

  test("the post copy follows 4c's text rules: empty or over 3000 characters fails", async () => {
    for (const texto of ["   ", "a".repeat(3001)]) {
      const pedir = pedirQueResponde(respuesta(escrito({ texto })))
      await expect(escribirCon(pedir)).rejects.toBeInstanceOf(Falla)
    }
  })

  test("a refusal or a cut answer fails with 4c's reasons, without a repair", async () => {
    const rechazo = pedirQueResponde(respuesta({}, "refusal"))
    await expect(escribirCon(rechazo)).rejects.toThrow(
      new Falla("Claude no quiso escribir esto. Cambia el encargo o escríbelo a mano."),
    )
    const cortada = pedirQueResponde(respuesta({}, "max_tokens"))
    await expect(escribirCon(cortada)).rejects.toThrow(
      new Falla("La respuesta de Claude quedó cortada. Pídelo de nuevo."),
    )
    expect(rechazo).toHaveBeenCalledTimes(1)
    expect(cortada).toHaveBeenCalledTimes(1)
  })
})

describe("FORMATO_DE_CARRUSEL", () => {
  type Nodo = { [clave: string]: unknown }
  const esquema = FORMATO_DE_CARRUSEL.schema as Nodo

  function refs(nodo: unknown): string[] {
    if (Array.isArray(nodo)) return nodo.flatMap(refs)
    if (nodo === null || typeof nodo !== "object") return []
    return Object.entries(nodo).flatMap(([clave, valor]) =>
      clave === "$ref" && typeof valor === "string" ? [valor] : refs(valor),
    )
  }

  test("each slide is one of 8 variants whose «tipo» the API itself constrains to a single slide type", () => {
    const laminas = (esquema.properties as Record<string, Nodo>).laminas
    const variantes = (laminas.items as Nodo).anyOf as Nodo[]
    expect(variantes).toHaveLength(8)
    const tipos = variantes.map((v) => (v.properties as Record<string, Nodo>).tipo)
    expect(tipos.map((t) => ({ type: t.type, const: t.const }))).toEqual(
      TIPOS_DE_LAMINA.map((tipo) => ({ type: "string", const: tipo })),
    )
    for (const v of variantes) {
      expect(v.additionalProperties).toBe(false)
      expect(v.required).toContain("tipo")
    }
  })

  test("data slides accept an optional «fuente» string of up to LIMITES.fuente characters; cover and closing do not", () => {
    const laminas = (esquema.properties as Record<string, Nodo>).laminas
    const variantes = (laminas.items as Nodo).anyOf as Nodo[]
    const defs = (esquema.$defs as Record<string, Nodo> | undefined) ?? {}
    const resolver = (n: Nodo): Nodo =>
      typeof n.$ref === "string" ? (defs[n.$ref.replace("#/$defs/", "")] as Nodo) : n
    variantes.forEach((v, i) => {
      const tipo = TIPOS_DE_LAMINA[i]
      const fuente = (v.properties as Record<string, Nodo>).fuente
      if (tipo === "portada" || tipo === "cierre") {
        expect(fuente, tipo).toBeUndefined()
        return
      }
      expect(fuente, tipo).toBeDefined()
      expect(v.required, tipo).not.toContain("fuente")
      const nodo = resolver(fuente as Nodo)
      expect(nodo.type, tipo).toBe("string")
      expect(JSON.stringify(nodo), tipo).toContain(`maxLength: ${LIMITES.fuente.caracteres}`)
    })
  })

  test("every $ref points at a definition the schema carries", () => {
    const defs = Object.keys((esquema.$defs as Nodo | undefined) ?? {})
    const usados = refs(esquema)
    expect(usados.length).toBeGreaterThan(0)
    for (const ref of usados) expect(defs.map((d) => `#/$defs/${d}`)).toContain(ref)
  })
})
