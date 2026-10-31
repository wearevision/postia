// @vitest-environment node
import { describe, expect, test, vi } from "vitest"
import { Falla } from "@/lib/dominio/falla"
import { PasoYaPagado } from "@/lib/gasto/pagar"
import type { Pedir, RespuestaDeClaude } from "@/lib/ia/claude"
import {
  CRUCES_POR_CORRIDA,
  cruzar,
  fallaDeGuardarIdeasSueltas,
  otraIdeaSuelta,
  type PuertosDeCruce,
  type PuertosDeOtraSuelta,
  type TrabajoDeCruces,
  type TrabajoDeIdeaSuelta,
} from "@/lib/ideas/cruzar"
import type { HallazgoDeCruce, ParDeHallazgos } from "@/lib/ideas/instrucciones"
import type { Cruces } from "@/lib/ideas/propuestas"
import { atenderInvestigaciones, type PuertosDeAtencionDeInvestigacion } from "@/lib/investigacion/vigilancia"
import { UMBRALES } from "@/lib/mapa/umbrales"
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
]

const hallazgo = (id: string, tema: string | null = null): HallazgoDeCruce => ({
  id,
  resumen: `Hallazgo ${id}`,
  medio: "Medio",
  publicado_en: "2026-10-20",
  enlace: `https://medio.cl/${id}`,
  tema,
})

const PARES: ParDeHallazgos[] = [
  { a: hallazgo("h1", "Retail"), b: hallazgo("h2", "Eventos") },
  { a: hallazgo("h3"), b: hallazgo("h4", "Datos") },
]

type IdeaCruzada = Cruces["ideas"][number]

function cruce(gancho: string, par: number, extra: Partial<IdeaCruzada> = {}): IdeaCruzada {
  return {
    par,
    gancho,
    resumen: `Resumen de ${gancho}`,
    formato: "texto",
    esqueleto: [
      { tipo: null, idea: "Lo que dice uno" },
      { tipo: null, idea: "Lo que dice el otro" },
    ],
    cuenta: 1,
    razon: "Cruza dos mundos.",
    pilar: 1,
    ...extra,
  }
}

const respuesta = (ideas: unknown[]): RespuestaDeClaude => ({
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

function puertos(ideas: unknown[], over: Partial<PuertosDeCruce & PuertosDeOtraSuelta> = {}) {
  const p: PuertosDeCruce & PuertosDeOtraSuelta = {
    pedir: vi.fn<Pedir>(async () => respuesta(ideas)),
    embeberIdeas: embeberPorGancho(),
    cuentasDeSerie: vi.fn(async () => CUENTAS),
    noNombrar: vi.fn(async () => ["Cliente Secreto"]),
    ideasParecidas: vi.fn(async () => []),
    paresParaCruzar: vi.fn(async () => PARES),
    guardarIdeasSueltas: vi.fn(async (_o: string, guardar: unknown[]) => guardar.map((_, n) => `idea-${n}`)),
    ideaSueltaAReemplazar: vi.fn(async () => ({
      origen: "cruce" as const,
      gancho: "La vieja",
      resumen: "Lo que decía",
      formato: "texto" as const,
      fuentes: [hallazgo("h1", "Retail"), hallazgo("h2", "Eventos")],
    })),
    ...over,
  }
  return p
}

const DESDE = Date.parse("2026-10-25T20:00:00Z")

describe("cruzar", () => {
  test("reads at most three pairs since `desde` and asks Opus once under the run's key, charged to «General»", async () => {
    const p = puertos([cruce("Uno", 1)])
    await cruzar(p, { clave: "cruces:2026-11-01", desde: DESDE })
    expect(CRUCES_POR_CORRIDA).toBe(3)
    expect(p.paresParaCruzar).toHaveBeenCalledWith({ desde: DESDE, limite: 3, investigacionId: undefined })
    expect(p.pedir).toHaveBeenCalledTimes(1)
    const [paso, pedido] = vi.mocked(p.pedir).mock.calls[0]
    expect(paso).toEqual({ clave: "cruces:2026-11-01", paso: "cruces", marcaId: null })
    expect(pedido).toMatchObject({ modelo: "claude-opus-5-5", esfuerzo: "medium", maxTokens: 8000 })
    expect(pedido.formato).toBeDefined()
    expect(pedido.sistema).toContain("Cliente Secreto")
    const mensaje = JSON.stringify(pedido.mensajes)
    expect(mensaje).toContain("Hallazgo h1")
    expect(mensaje).toContain("Hallazgo h4")
  })

  test("a report's crosses read the pairs of that research", async () => {
    const p = puertos([cruce("Uno", 1)])
    await cruzar(p, { clave: "cruces:j1", desde: 0, investigacionId: "i1" })
    expect(p.paresParaCruzar).toHaveBeenCalledWith({ desde: 0, limite: 3, investigacionId: "i1" })
  })

  test("with no pairs it pays nothing and saves nothing", async () => {
    const p = puertos([], { paresParaCruzar: vi.fn(async () => []) })
    expect(await cruzar(p, { clave: "cruces:2026-11-01", desde: DESDE })).toEqual({
      guardadas: 0,
      parecidas: 0,
      invalidas: 0,
    })
    expect(p.pedir).not.toHaveBeenCalled()
    expect(p.embeberIdeas).not.toHaveBeenCalled()
    expect(p.guardarIdeasSueltas).not.toHaveBeenCalled()
  })

  test("each idea keeps its pair's two findings; vectors are paid under <clave>:vectores; saved as crosses", async () => {
    const p = puertos([cruce("Uno", 1), cruce("Dos", 2, { pilar: null })])
    const resultado = await cruzar(p, { clave: "cruces:2026-11-01", desde: DESDE })
    expect(p.embeberIdeas).toHaveBeenCalledTimes(1)
    expect(p.embeberIdeas).toHaveBeenCalledWith("cruces:2026-11-01:vectores", [
      "Uno\nResumen de Uno",
      "Dos\nResumen de Dos",
    ])
    expect(p.guardarIdeasSueltas).toHaveBeenCalledWith("cruce", [
      expect.objectContaining({
        gancho: "Uno",
        fuentes: ["h1", "h2"],
        cuenta: "cuenta-wav",
        pilar: "pilar-wav",
        vector: expect.any(Array),
      }),
      expect.objectContaining({ gancho: "Dos", fuentes: ["h3", "h4"], pilar: null }),
    ])
    expect(resultado).toEqual({ guardadas: 2, parecidas: 0, invalidas: 0 })
  })

  test("keeps one idea per pair, and counts an idea pointing to a missing pair as invalid", async () => {
    const p = puertos([cruce("Uno", 1), cruce("Uno bis", 1), cruce("Fantasma", 7)])
    const resultado = await cruzar(p, { clave: "cruces:2026-11-01", desde: DESDE })
    expect(vi.mocked(p.guardarIdeasSueltas).mock.calls[0][1].map((i) => i.gancho)).toEqual(["Uno"])
    expect(resultado).toEqual({ guardadas: 1, parecidas: 1, invalidas: 1 })
  })

  test("drops near-duplicates within the batch and against the database at UMBRALES.idea", async () => {
    const p = puertos([cruce("Uno", 1), cruce("Otra vez uno", 2)], {
      embeberIdeas: embeberPorGancho({ "Otra vez uno": "Uno" }),
    })
    expect(await cruzar(p, { clave: "c", desde: DESDE })).toEqual({ guardadas: 1, parecidas: 1, invalidas: 0 })
    const q = puertos([cruce("Uno", 1)], { ideasParecidas: vi.fn(async () => ["vieja"]) })
    expect(await cruzar(q, { clave: "c", desde: DESDE })).toEqual({ guardadas: 0, parecidas: 1, invalidas: 0 })
    expect(vi.mocked(q.ideasParecidas).mock.calls[0][1]).toBe(UMBRALES.idea)
    expect(q.guardarIdeasSueltas).not.toHaveBeenCalled()
  })

  test("with no valid idea it never pays for vectors", async () => {
    const p = puertos([cruce("Sin cuenta", 1, { cuenta: 9 })])
    expect(await cruzar(p, { clave: "c", desde: DESDE })).toEqual({ guardadas: 0, parecidas: 0, invalidas: 1 })
    expect(p.embeberIdeas).not.toHaveBeenCalled()
  })

  test("a refusal, a cut answer or unreadable JSON raise a Falla", async () => {
    for (const r of [
      { texto: "", detenido: "refusal" as const, bloques: [] },
      { texto: "{", detenido: "max_tokens" as const, bloques: [] },
      { texto: "no es json", detenido: "end_turn" as const, bloques: [] },
      { texto: '{"ideas":[{"par":"uno"}]}', detenido: "end_turn" as const, bloques: [] },
    ]) {
      const p = puertos([], { pedir: vi.fn<Pedir>(async () => r) })
      await expect(cruzar(p, { clave: "c", desde: DESDE })).rejects.toBeInstanceOf(Falla)
    }
  })

  test("without accounts that publish it fails before paying", async () => {
    const p = puertos([cruce("Uno", 1)], { cuentasDeSerie: vi.fn(async () => []) })
    await expect(cruzar(p, { clave: "c", desde: DESDE })).rejects.toBeInstanceOf(Falla)
    expect(p.pedir).not.toHaveBeenCalled()
  })
})

const OTRA: TrabajoDeIdeaSuelta = { id: "j9", tipo: "otra_idea", investigacionId: null, ideaId: "vieja" }

describe("otraIdeaSuelta", () => {
  test("a cross is replaced from the same pair, under its own key, keeping the cross origin", async () => {
    const p = puertos([cruce("Reemplazo", 1)])
    expect(await otraIdeaSuelta(p, OTRA)).toEqual({ guardadas: 1, parecidas: 0, invalidas: 0 })
    expect(p.paresParaCruzar).not.toHaveBeenCalled()
    const [paso, pedido] = vi.mocked(p.pedir).mock.calls[0]
    expect(paso).toEqual({ clave: "otra:j9", paso: "otra_idea", marcaId: null })
    expect(pedido).toMatchObject({ modelo: "claude-opus-5-5", esfuerzo: "medium" })
    const mensaje = JSON.stringify(pedido.mensajes)
    expect(mensaje).toContain("La vieja")
    expect(mensaje).toContain("Hallazgo h2")
    expect(p.embeberIdeas).toHaveBeenCalledWith("otra:j9:vectores", ["Reemplazo\nResumen de Reemplazo"])
    expect(p.guardarIdeasSueltas).toHaveBeenCalledWith("cruce", [
      expect.objectContaining({ gancho: "Reemplazo", fuentes: ["h1", "h2"], reemplazaA: "vieja" }),
    ])
  })

  test("a Sunday idea is replaced from its own findings and stays a Sunday idea", async () => {
    const domingo: IdeaPropuesta = {
      gancho: "Otra del domingo",
      resumen: "Algo nuevo",
      formato: "texto",
      esqueleto: [{ tipo: null, idea: "Uno" }],
      fuentes: [2],
      cuenta: 1,
      razon: "Porque sí.",
      pilar: null,
    }
    const p = puertos([domingo], {
      ideaSueltaAReemplazar: vi.fn(async () => ({
        origen: "domingo" as const,
        gancho: "La vieja",
        resumen: "Lo que decía",
        formato: "texto" as const,
        fuentes: [hallazgo("s1"), hallazgo("s2")],
      })),
    })
    await otraIdeaSuelta(p, OTRA)
    expect(JSON.stringify(vi.mocked(p.pedir).mock.calls[0][1].mensajes)).toContain("Hallazgo s2")
    expect(p.guardarIdeasSueltas).toHaveBeenCalledWith("domingo", [
      expect.objectContaining({ gancho: "Otra del domingo", fuentes: ["s2"], reemplazaA: "vieja" }),
    ])
  })

  test("a cross whose pair lost a finding fails before paying", async () => {
    const p = puertos([cruce("Reemplazo", 1)], {
      ideaSueltaAReemplazar: vi.fn(async () => ({
        origen: "cruce" as const,
        gancho: "La vieja",
        resumen: "Lo que decía",
        formato: "texto" as const,
        fuentes: [hallazgo("h1")],
      })),
    })
    await expect(otraIdeaSuelta(p, OTRA)).rejects.toBeInstanceOf(Falla)
    expect(p.pedir).not.toHaveBeenCalled()
  })

  test("no usable replacement, or one too close to an earlier idea, fails with a reason", async () => {
    await expect(otraIdeaSuelta(puertos([cruce("Mala", 1, { cuenta: 9 })]), OTRA)).rejects.toBeInstanceOf(Falla)
    const p = puertos([cruce("Reemplazo", 1)], { ideasParecidas: vi.fn(async () => ["otra"]) })
    await expect(otraIdeaSuelta(p, OTRA)).rejects.toBeInstanceOf(Falla)
    expect(p.guardarIdeasSueltas).not.toHaveBeenCalled()
  })
})

describe("atenderInvestigaciones with crosses and loose replacements", () => {
  const CRUCES: TrabajoDeCruces = { id: "j7", tipo: "cruces", investigacionId: "i1" }

  function atencion(trabajo: TrabajoDeCruces | TrabajoDeIdeaSuelta, over: Partial<PuertosDeCruce> = {}) {
    const p: PuertosDeAtencionDeInvestigacion = {
      ...puertos([cruce("Uno", 1)], over),
      embeber: vi.fn(async () => []),
      guardarHallazgo: vi.fn(async () => ({ estado: "guardado" as const, id: "h", tema: null })),
      cerrar: vi.fn(async () => {}),
      informeDeSerie: vi.fn(async () => ({ tema: "t", cantidad: 1, angulos: [], hallazgos: [] })),
      ideasPrevias: vi.fn(async () => []),
      ideaAReemplazar: vi.fn(async () => ({ gancho: "g", resumen: "r", formato: "texto" as const, hermanas: [] })),
      guardarSerie: vi.fn(async () => []),
      tomar: vi.fn(async () => trabajo),
      terminar: vi.fn(async () => {}),
    }
    return p
  }

  test("a crosses job crosses the report's findings under the job's key and closes as done", async () => {
    const p = atencion(CRUCES)
    expect(await atenderInvestigaciones(p)).toEqual({ guardadas: 1, parecidas: 0, invalidas: 0 })
    expect(p.paresParaCruzar).toHaveBeenCalledWith(expect.objectContaining({ investigacionId: "i1" }))
    expect(vi.mocked(p.pedir).mock.calls[0][0]).toMatchObject({ clave: "cruces:j7", paso: "cruces" })
    expect(p.embeberIdeas).toHaveBeenCalledWith("cruces:j7:vectores", expect.any(Array))
    expect(p.guardarSerie).not.toHaveBeenCalled()
    expect(p.terminar).toHaveBeenCalledWith("j7", "hecho")
  })

  test("a crosses job with no pairs closes as done without paying", async () => {
    const p = atencion(CRUCES, { paresParaCruzar: vi.fn(async () => []) })
    expect(await atenderInvestigaciones(p)).toEqual({ guardadas: 0, parecidas: 0, invalidas: 0 })
    expect(p.pedir).not.toHaveBeenCalled()
    expect(p.terminar).toHaveBeenCalledWith("j7", "hecho")
  })

  test("a crosses step already paid closes the job with a reason about the crosses", async () => {
    const p = atencion(CRUCES)
    vi.mocked(p.pedir).mockRejectedValue(new PasoYaPagado("cruces:j7"))
    await atenderInvestigaciones(p)
    expect(vi.mocked(p.terminar).mock.calls[0]).toEqual(["j7", "fallo", expect.stringMatching(/cruces/)])
  })

  test("a replacement for an idea with no research goes through guardar_ideas_sueltas", async () => {
    const p = atencion(OTRA)
    await atenderInvestigaciones(p)
    expect(p.guardarIdeasSueltas).toHaveBeenCalledWith("cruce", [expect.objectContaining({ reemplazaA: "vieja" })])
    expect(p.guardarSerie).not.toHaveBeenCalled()
    expect(p.terminar).toHaveBeenCalledWith("j9", "hecho")
  })
})

describe("fallaDeGuardarIdeasSueltas", () => {
  test("turns each refusal of guardar_ideas_sueltas into a Falla Federico can read", () => {
    for (const motivo of [
      "origen_no_valido",
      "ideas_invalidas",
      "cuenta_desconocida",
      "pilar_no_valido",
      "fuente_no_valida",
      "cruce_sin_dos_fuentes",
      "esqueleto_no_valido",
      "idea_no_reemplazable",
    ]) {
      const falla = fallaDeGuardarIdeasSueltas({ code: "22023", message: motivo })
      expect(falla).toBeInstanceOf(Falla)
      expect(falla?.message).not.toContain("_")
      expect(falla?.message).toMatch(/\.$/)
    }
  })

  test("leaves any other database error as unexpected", () => {
    expect(fallaDeGuardarIdeasSueltas({ code: "08006", message: "conexión perdida" })).toBeNull()
    expect(fallaDeGuardarIdeasSueltas({ code: "22023", message: "otra_cosa" })).toBeNull()
  })
})
