// @vitest-environment node
import { describe, expect, test, vi } from "vitest"
import { Falla } from "@/lib/dominio/falla"
import { PasoYaPagado } from "@/lib/gasto/pagar"
import type { Pedir, RespuestaDeClaude } from "@/lib/ia/claude"
import type { Trabajo } from "@/lib/investigacion/investigar"
import { atenderInvestigaciones, type PuertosDeAtencionDeInvestigacion } from "@/lib/investigacion/vigilancia"
import { UMBRALES } from "@/lib/mapa/umbrales"
import { armarSerie, otraIdea, type PuertosDeSerie, type TrabajoDeSerie } from "@/lib/series/armar"
import type { CuentaDeSerie, IdeaPropuesta } from "@/lib/series/propuestas"

const CUENTAS: CuentaDeSerie[] = [
  {
    id: "cuenta-wav",
    nombre: "WAV",
    tipo: "empresa",
    marca: { id: "marca-wav", nombre: "WAV", voz: "nosotros" },
    pilares: [{ id: "pilar-wav", nombre: "Oficio", deQueHabla: "Cómo trabajamos" }],
    temasVetados: "",
  },
  {
    id: "cuenta-fede",
    nombre: "Federico",
    tipo: "persona",
    marca: { id: "marca-fede", nombre: "Federico", voz: "yo" },
    pilares: [],
    temasVetados: "Política",
  },
]

const INFORME = {
  tema: "WR3 y focus groups",
  cantidad: 5,
  angulos: [{ nombre: "Mitos", por_que: "Lo que se cree y no es." }],
  hallazgos: ["h1", "h2", "h3"].map((id) => ({
    id,
    angulo: "Mitos",
    resumen: `Hallazgo ${id}`,
    medio: "Medio",
    publicado_en: "2026-10-20",
    enlace: `https://medio.cl/${id}`,
  })),
}

const SERIE: TrabajoDeSerie = { id: "j1", tipo: "serie", investigacionId: "i1", ideaId: null }
const OTRA: TrabajoDeSerie = { id: "j2", tipo: "otra_idea", investigacionId: "i1", ideaId: "vieja" }

function propuesta(gancho: string, extra: Partial<IdeaPropuesta> = {}): IdeaPropuesta {
  return {
    gancho,
    resumen: `Resumen de ${gancho}`,
    formato: "texto",
    esqueleto: [
      { tipo: null, idea: "El mito" },
      { tipo: null, idea: "Lo que dicen los datos" },
    ],
    fuentes: [1, 2],
    cuenta: 1,
    razon: "Habla de investigación.",
    pilar: 1,
    ...extra,
  }
}

const respuesta = (ideas: IdeaPropuesta[]): RespuestaDeClaude => ({
  texto: JSON.stringify({ ideas }),
  detenido: "end_turn",
  bloques: [],
})

/** One axis per hook: distinct hooks are orthogonal; a hook listed in `iguales` points where its twin points. */
function embeberPorGancho(iguales: Record<string, string> = {}) {
  const ejes = new Map<string, number>()
  return vi.fn(async (_clave: string, textos: string[]) =>
    textos.map((t) => {
      const gancho = t.split("\n")[0] ?? ""
      const base = iguales[gancho] ?? gancho
      if (!ejes.has(base)) ejes.set(base, ejes.size)
      const v = new Array(16).fill(0)
      v[ejes.get(base) ?? 0] = 1
      return v
    }),
  )
}

function puertos(ideas: IdeaPropuesta[], over: Partial<PuertosDeSerie> = {}): PuertosDeSerie {
  return {
    pedir: vi.fn<Pedir>(async () => respuesta(ideas)),
    embeberIdeas: embeberPorGancho(),
    informeDeSerie: vi.fn(async () => INFORME),
    cuentasDeSerie: vi.fn(async () => CUENTAS),
    noNombrar: vi.fn(async () => ["Cliente Secreto"]),
    ideasPrevias: vi.fn(async () => ["Una idea de antes"]),
    ideasParecidas: vi.fn(async () => []),
    ideaAReemplazar: vi.fn(async () => ({
      gancho: "La vieja",
      resumen: "Lo que decía",
      formato: "texto" as const,
      hermanas: ["Hermana uno"],
    })),
    guardarSerie: vi.fn(async (_i: string, guardar: unknown[]) => guardar.map((_, n) => `idea-${n}`)),
    ...over,
  }
}

describe("armarSerie", () => {
  test("asks Opus once for the series under the job's key, charged to «General»", async () => {
    const p = puertos([propuesta("Uno")])
    await armarSerie(p, SERIE)
    expect(p.pedir).toHaveBeenCalledTimes(1)
    const [paso, pedido] = vi.mocked(p.pedir).mock.calls[0]
    expect(paso).toEqual({ clave: "serie:j1", paso: "serie", marcaId: null })
    expect(pedido).toMatchObject({ modelo: "claude-opus-5-5", esfuerzo: "high", maxTokens: 16000 })
    expect(pedido.formato).toBeDefined()
    expect(pedido.sistema).toContain("«WAV»")
    expect(pedido.sistema).toContain("Cliente Secreto")
    const mensaje = JSON.stringify(pedido.mensajes)
    expect(mensaje).toContain("hasta 5 ideas")
    expect(mensaje).toContain("Una idea de antes")
    expect(mensaje).toContain("Hallazgo h3")
  })

  test("embeds hook and summary in one call and saves the valid ideas with ids and vectors", async () => {
    const p = puertos([propuesta("Uno"), propuesta("Dos", { cuenta: 2, pilar: null, fuentes: [3] })])
    const resultado = await armarSerie(p, SERIE)
    expect(p.embeberIdeas).toHaveBeenCalledTimes(1)
    expect(p.embeberIdeas).toHaveBeenCalledWith("serie:j1:vectores", ["Uno\nResumen de Uno", "Dos\nResumen de Dos"])
    expect(p.guardarSerie).toHaveBeenCalledWith("i1", [
      expect.objectContaining({
        gancho: "Uno",
        cuenta: "cuenta-wav",
        pilar: "pilar-wav",
        fuentes: ["h1", "h2"],
        vector: expect.any(Array),
      }),
      expect.objectContaining({ gancho: "Dos", cuenta: "cuenta-fede", pilar: null, fuentes: ["h3"] }),
    ])
    expect(vi.mocked(p.guardarSerie).mock.calls[0][1][0]).not.toHaveProperty("reemplazaA")
    expect(resultado).toEqual({ guardadas: 2, parecidas: 0, invalidas: 0 })
  })

  test("drops the later of two near-identical ideas and those close to earlier ones in the database", async () => {
    const p = puertos([propuesta("Uno"), propuesta("Otra vez uno"), propuesta("Ya existe"), propuesta("Nueva")], {
      embeberIdeas: embeberPorGancho({ "Otra vez uno": "Uno" }),
    })
    vi.mocked(p.ideasParecidas).mockImplementation(async (vector) => (vector[1] === 1 ? ["vieja"] : []))
    const resultado = await armarSerie(p, SERIE)
    expect(vi.mocked(p.ideasParecidas).mock.calls.every(([, umbral]) => umbral === UMBRALES.idea)).toBe(true)
    expect(vi.mocked(p.guardarSerie).mock.calls[0][1].map((i) => i.gancho)).toEqual(["Uno", "Nueva"])
    expect(resultado).toEqual({ guardadas: 2, parecidas: 2, invalidas: 0 })
  })

  test("counts the ideas the validation refuses and never embeds them", async () => {
    const p = puertos([
      propuesta("Uno"),
      propuesta("Sin cuenta", { cuenta: 9 }),
      propuesta("Sin fuentes", { fuentes: [] }),
    ])
    const resultado = await armarSerie(p, SERIE)
    expect(vi.mocked(p.embeberIdeas).mock.calls[0][1]).toEqual(["Uno\nResumen de Uno"])
    expect(resultado).toEqual({ guardadas: 1, parecidas: 0, invalidas: 2 })
  })

  test("keeps at most the report's number of ideas", async () => {
    const p = puertos(["A", "B", "C"].map((g) => propuesta(g)))
    vi.mocked(p.informeDeSerie).mockResolvedValue({ ...INFORME, cantidad: 2 })
    expect(await armarSerie(p, SERIE)).toMatchObject({ guardadas: 2 })
  })

  test("with every idea too close to earlier ones it fails with a reason and saves nothing", async () => {
    const p = puertos([propuesta("Uno")], { ideasParecidas: vi.fn(async () => ["vieja"]) })
    await expect(armarSerie(p, SERIE)).rejects.toThrow(
      new Falla("No salieron ideas nuevas de este informe: se parecían a ideas anteriores."),
    )
    expect(p.guardarSerie).not.toHaveBeenCalled()
  })

  test("with no valid idea it fails before paying for vectors", async () => {
    const p = puertos([propuesta("Sin cuenta", { cuenta: 9 })])
    await expect(armarSerie(p, SERIE)).rejects.toBeInstanceOf(Falla)
    expect(p.embeberIdeas).not.toHaveBeenCalled()
  })

  test("a refusal, a cut answer or unreadable JSON fail with a reason", async () => {
    for (const r of [
      { texto: "", detenido: "refusal" as const, bloques: [] },
      { texto: "{", detenido: "max_tokens" as const, bloques: [] },
      { texto: "no es json", detenido: "end_turn" as const, bloques: [] },
    ]) {
      const p = puertos([], { pedir: vi.fn<Pedir>(async () => r) })
      await expect(armarSerie(p, SERIE)).rejects.toBeInstanceOf(Falla)
    }
  })

  test("without accounts that publish it fails before paying", async () => {
    const p = puertos([propuesta("Uno")], { cuentasDeSerie: vi.fn(async () => []) })
    await expect(armarSerie(p, SERIE)).rejects.toBeInstanceOf(Falla)
    expect(p.pedir).not.toHaveBeenCalled()
  })
})

describe("otraIdea", () => {
  test("asks for one replacement under its own key and saves it in place of the old one", async () => {
    const p = puertos([propuesta("Reemplazo")])
    const resultado = await otraIdea(p, OTRA)
    const [paso, pedido] = vi.mocked(p.pedir).mock.calls[0]
    expect(paso).toEqual({ clave: "otra:j2", paso: "otra_idea", marcaId: null })
    expect(pedido).toMatchObject({ modelo: "claude-opus-5-5", esfuerzo: "medium" })
    const mensaje = JSON.stringify(pedido.mensajes)
    expect(mensaje).toContain("La vieja")
    expect(mensaje).toContain("Hermana uno")
    expect(p.ideaAReemplazar).toHaveBeenCalledWith("vieja")
    expect(p.embeberIdeas).toHaveBeenCalledWith("otra:j2:vectores", ["Reemplazo\nResumen de Reemplazo"])
    expect(p.guardarSerie).toHaveBeenCalledWith("i1", [
      expect.objectContaining({ gancho: "Reemplazo", reemplazaA: "vieja" }),
    ])
    expect(resultado).toEqual({ guardadas: 1, parecidas: 0, invalidas: 0 })
  })

  test("keeps only the first valid idea when Claude sends more", async () => {
    const p = puertos([propuesta("Mala", { cuenta: 9 }), propuesta("Buena"), propuesta("Sobra")])
    await otraIdea(p, OTRA)
    expect(vi.mocked(p.guardarSerie).mock.calls[0][1].map((i) => i.gancho)).toEqual(["Buena"])
  })

  test("a replacement too close to an earlier idea fails with a reason", async () => {
    const p = puertos([propuesta("Reemplazo")], { ideasParecidas: vi.fn(async () => ["otra"]) })
    await expect(otraIdea(p, OTRA)).rejects.toBeInstanceOf(Falla)
    expect(p.guardarSerie).not.toHaveBeenCalled()
  })
})

describe("atenderInvestigaciones with series jobs", () => {
  function atencion(trabajo: Trabajo | TrabajoDeSerie, over: Partial<PuertosDeSerie> = {}) {
    const p: PuertosDeAtencionDeInvestigacion = {
      ...puertos([propuesta("Uno")], over),
      embeber: vi.fn(async () => []),
      guardarHallazgo: vi.fn(async () => ({ estado: "guardado" as const, id: "h", tema: null })),
      cerrar: vi.fn(async () => {}),
      tomar: vi.fn(async () => trabajo),
      terminar: vi.fn(async () => {}),
    }
    return p
  }

  test("a series job proposes the series and closes the job as done", async () => {
    const p = atencion(SERIE)
    expect(await atenderInvestigaciones(p)).toEqual({ guardadas: 1, parecidas: 0, invalidas: 0 })
    expect(p.guardarSerie).toHaveBeenCalledTimes(1)
    expect(p.cerrar).not.toHaveBeenCalled()
    expect(p.terminar).toHaveBeenCalledWith("j1", "hecho")
  })

  test("another-idea job saves the replacement", async () => {
    const p = atencion(OTRA)
    await atenderInvestigaciones(p)
    expect(vi.mocked(p.guardarSerie).mock.calls[0][1][0]).toMatchObject({ reemplazaA: "vieja" })
    expect(p.terminar).toHaveBeenCalledWith("j2", "hecho")
  })

  test("a Falla closes the series job as failed with its message", async () => {
    const p = atencion(SERIE, { ideasParecidas: vi.fn(async () => ["vieja"]) })
    await atenderInvestigaciones(p)
    expect(p.terminar).toHaveBeenCalledWith(
      "j1",
      "fallo",
      "No salieron ideas nuevas de este informe: se parecían a ideas anteriores.",
    )
  })

  test("a series step already paid closes the job with a reason about the series, never paying again", async () => {
    const p = atencion(SERIE)
    vi.mocked(p.pedir).mockRejectedValue(new PasoYaPagado("serie:j1"))
    await atenderInvestigaciones(p)
    expect(vi.mocked(p.terminar).mock.calls[0][2]).toMatch(/serie ya se había empezado a pagar/)
  })
})
