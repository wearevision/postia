// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest"
import { PasoYaPagado, TopeAlcanzado } from "@/lib/gasto/pagar"
import type { Pedir, RespuestaDeClaude } from "@/lib/ia/claude"
import { calibrarCruces } from "@/lib/ideas/calibrar"
import {
  IDEAS_DEL_DOMINGO,
  martesAJueves,
  motorDelDomingo,
  type PuertosDelDomingo,
  semanaCubierta,
} from "@/lib/ideas/domingo"
import type { HallazgoDeCruce, ParDeHallazgos } from "@/lib/ideas/instrucciones"
import { UMBRALES } from "@/lib/mapa/umbrales"
import type { CuentaDeSerie, HallazgoDeSerie } from "@/lib/series/propuestas"

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

const PARES: ParDeHallazgos[] = [{ a: hallazgo("h1", "Retail"), b: hallazgo("h2", "Eventos") }]

const SEMANA: HallazgoDeSerie[] = ["s1", "s2", "s3"].map((id) => ({
  id,
  angulo: "",
  resumen: `De la semana ${id}`,
  medio: "Diario",
  publicado_en: "2026-10-28",
  enlace: `https://diario.cl/${id}`,
}))

const esqueleto = [
  { tipo: null, idea: "Uno" },
  { tipo: null, idea: "Dos" },
]
const base = { resumen: "Algo", formato: "texto", esqueleto, cuenta: 1, razon: "Porque sí.", pilar: 1 }
const cruce = (gancho: string) => ({ ...base, gancho, par: 1 })
const suelta = (gancho: string, fuentes = [1]) => ({ ...base, gancho, fuentes })

const json = (ideas: unknown[]): RespuestaDeClaude => ({
  texto: JSON.stringify({ ideas }),
  detenido: "end_turn",
  bloques: [],
})

function embeberDistinto() {
  let n = 0
  return vi.fn(async (_clave: string, textos: string[]) =>
    textos.map(() => {
      const v = new Array(64).fill(0)
      v[n++] = 1
      return v
    }),
  )
}

// Sunday 1 November 2026, 17:00 in Chile (UTC−3).
const AHORA = Date.parse("2026-11-01T20:00:00Z")

function puertos(over: Partial<PuertosDelDomingo> = {}): PuertosDelDomingo {
  // The database's count: the crosses this run saved (no earlier run today unless a test says so).
  let crucesGuardados = 0
  return {
    crucesGuardadosDesde: vi.fn(async () => crucesGuardados),
    pedir: vi.fn<Pedir>(async (paso) =>
      paso.paso === "cruces" ? json([cruce("Un cruce")]) : json([suelta("Suelta uno"), suelta("Suelta dos", [2, 3])]),
    ),
    embeberIdeas: embeberDistinto(),
    cuentasDeSerie: vi.fn(async () => CUENTAS),
    noNombrar: vi.fn(async () => []),
    ideasParecidas: vi.fn(async () => []),
    paresParaCruzar: vi.fn(async () => PARES),
    descartarPares: vi.fn(async () => {}),
    guardarIdeasSueltas: vi.fn(async (origen: string, ideas: unknown[]) => {
      if (origen === "cruce") crucesGuardados += ideas.length
      return ideas.map((_, i) => `id-${i}`)
    }),
    hallazgosDeLaSemana: vi.fn(async () => SEMANA),
    pilaresPendientes: vi.fn(async () => [{ cuenta: "WAV", pilar: "Oficio" }]),
    ganchosRecientes: vi.fn(async () => ["Una idea de antes"]),
    ocupacionDeLaSemana: vi.fn(async () => [{ cuentaId: "cuenta-wav", ritmo: 3, ocupadas: 1 }]),
    ...over,
  }
}

afterEach(() => vi.restoreAllMocks())

describe("martesAJueves", () => {
  test("on Sunday it is the coming Tuesday 00:00 to Friday 00:00 in Chile", () => {
    expect(martesAJueves(AHORA)).toEqual({ desde: "2026-11-03T03:00:00.000Z", hasta: "2026-11-06T03:00:00.000Z" })
  })

  test("any day of a week points to the next week's Tuesday", () => {
    expect(martesAJueves(Date.parse("2026-11-03T15:00:00Z")).desde).toBe("2026-11-10T03:00:00.000Z")
  })
})

describe("semanaCubierta", () => {
  test("is covered only when every account already holds its weekly rhythm", () => {
    expect(semanaCubierta([{ cuentaId: "a", ritmo: 3, ocupadas: 3 }])).toBe(true)
    expect(
      semanaCubierta([
        { cuentaId: "a", ritmo: 3, ocupadas: 4 },
        { cuentaId: "b", ritmo: 3, ocupadas: 2 },
      ]),
    ).toBe(false)
    expect(semanaCubierta([])).toBe(true)
  })
})

describe("motorDelDomingo", () => {
  test("crosses the week's findings under cruces:<day> since seven days ago", async () => {
    const p = puertos()
    await motorDelDomingo(p, AHORA)
    expect(p.paresParaCruzar).toHaveBeenCalledWith({
      desde: AHORA - 7 * 86_400_000,
      limite: 3,
      investigacionId: undefined,
    })
    const pasos = vi.mocked(p.pedir).mock.calls.map(([paso]) => paso)
    expect(pasos[0]).toEqual({ clave: "cruces:2026-11-01", paso: "cruces", marcaId: null })
    expect(p.embeberIdeas).toHaveBeenCalledWith("cruces:2026-11-01:vectores", expect.any(Array))
  })

  test("then asks for the loose ideas left for the week, with the week's findings, pillars and previous titles", async () => {
    const p = puertos()
    const r = await motorDelDomingo(p, AHORA)
    expect(p.ocupacionDeLaSemana).toHaveBeenCalledWith("2026-11-03T03:00:00.000Z", "2026-11-06T03:00:00.000Z")
    expect(p.hallazgosDeLaSemana).toHaveBeenCalledWith(AHORA - 7 * 86_400_000)
    expect(p.ganchosRecientes).toHaveBeenCalledWith(40)
    const [paso, pedido] = vi.mocked(p.pedir).mock.calls[1]
    expect(paso).toEqual({ clave: "domingo:2026-11-01", paso: "domingo", marcaId: null })
    expect(pedido).toMatchObject({ modelo: "claude-opus-5-5", esfuerzo: "medium", maxTokens: 8000 })
    const mensaje = JSON.stringify(pedido.mensajes)
    expect(mensaje).toContain(`hasta ${IDEAS_DEL_DOMINGO - 1} ideas`)
    expect(mensaje).toContain("De la semana s3")
    expect(mensaje).toContain("«Oficio» en «WAV»")
    expect(mensaje).toContain("Una idea de antes")
    expect(mensaje).not.toContain("<funcionaron>")
    expect(p.embeberIdeas).toHaveBeenCalledWith("domingo:2026-11-01:vectores", expect.any(Array))
    expect(p.guardarIdeasSueltas).toHaveBeenLastCalledWith("domingo", [
      expect.objectContaining({ gancho: "Suelta uno", fuentes: ["s1"] }),
      expect.objectContaining({ gancho: "Suelta dos", fuentes: ["s2", "s3"] }),
    ])
    expect(r.cruces).toEqual({ guardadas: 1, parecidas: 0, invalidas: 0 })
    expect(r.sueltas).toEqual({ guardadas: 2, parecidas: 0, invalidas: 0 })
  })

  test("keeps at most the loose ideas it asked for", async () => {
    const muchas = Array.from({ length: 8 }, (_, i) => suelta(`Suelta ${i}`))
    const p = puertos({
      pedir: vi.fn<Pedir>(async (paso) => (paso.paso === "cruces" ? json([cruce("Un cruce")]) : json(muchas))),
    })
    const r = await motorDelDomingo(p, AHORA)
    expect(r.sueltas.guardadas).toBe(IDEAS_DEL_DOMINGO - 1)
  })

  test("a covered week stops after the crosses", async () => {
    const p = puertos({ ocupacionDeLaSemana: vi.fn(async () => [{ cuentaId: "cuenta-wav", ritmo: 3, ocupadas: 3 }]) })
    const r = await motorDelDomingo(p, AHORA)
    expect(vi.mocked(p.pedir).mock.calls.map(([paso]) => paso.paso)).toEqual(["cruces"])
    expect(p.hallazgosDeLaSemana).not.toHaveBeenCalled()
    expect(r.sueltas.guardadas).toBe(0)
  })

  test("with no findings this week and no pairs it pays nothing", async () => {
    const p = puertos({ paresParaCruzar: vi.fn(async () => []), hallazgosDeLaSemana: vi.fn(async () => []) })
    const r = await motorDelDomingo(p, AHORA)
    expect(p.pedir).not.toHaveBeenCalled()
    expect(p.embeberIdeas).not.toHaveBeenCalled()
    expect(p.guardarIdeasSueltas).not.toHaveBeenCalled()
    expect(r).toMatchObject({ cruces: { guardadas: 0 }, sueltas: { guardadas: 0 } })
  })

  test("the spend cap stops the run cleanly with its log line, at the crosses or at the loose ideas", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {})
    const p = puertos({ pedir: vi.fn<Pedir>(async () => Promise.reject(new TopeAlcanzado("global"))) })
    const r = await motorDelDomingo(p, AHORA)
    expect(vi.mocked(p.pedir)).toHaveBeenCalledTimes(1)
    expect(p.hallazgosDeLaSemana).not.toHaveBeenCalled()
    expect(r.cruces.guardadas).toBe(0)
    expect(aviso).toHaveBeenCalledWith("Se alcanzó el tope de gasto; el motor del domingo no propuso más ideas.")

    const q = puertos()
    vi.mocked(q.embeberIdeas).mockImplementation(async (clave) => {
      if (clave.startsWith("domingo:")) throw new TopeAlcanzado("global")
      return [new Array(64).fill(0).map((_, i) => (i === 0 ? 1 : 0))]
    })
    const s = await motorDelDomingo(q, AHORA)
    expect(s).toMatchObject({ cruces: { guardadas: 1 }, sueltas: { guardadas: 0 } })
    expect(aviso).toHaveBeenCalledTimes(2)
  })

  test("a step already paid today is skipped and the run goes on", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const p = puertos({
      pedir: vi.fn<Pedir>(async (paso) => {
        if (paso.paso === "cruces") throw new PasoYaPagado(paso.clave)
        return json([suelta("Suelta uno")])
      }),
      crucesGuardadosDesde: vi.fn(async () => 0),
    })
    const r = await motorDelDomingo(p, AHORA)
    expect(r.cruces).toEqual({ guardadas: 0, parecidas: 0, invalidas: 0 })
    expect(r.sueltas.guardadas).toBe(1)
    expect(JSON.stringify(vi.mocked(p.pedir).mock.calls[1][1].mensajes)).toContain(`hasta ${IDEAS_DEL_DOMINGO} ideas`)
  })

  test("a re-run the same day counts the crosses an earlier run saved today, read from the database", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const p = puertos({
      pedir: vi.fn<Pedir>(async (paso) => {
        if (paso.paso === "cruces") throw new PasoYaPagado(paso.clave)
        return json([suelta("Suelta uno")])
      }),
      // Run 1 saved three crosses this morning.
      crucesGuardadosDesde: vi.fn(async () => 3),
    })
    await motorDelDomingo(p, AHORA)
    // Start of Sunday 1 November in Santiago (UTC−3).
    expect(p.crucesGuardadosDesde).toHaveBeenCalledWith("2026-11-01T03:00:00.000Z")
    expect(JSON.stringify(vi.mocked(p.pedir).mock.calls[1][1].mensajes)).toContain(
      `hasta ${IDEAS_DEL_DOMINGO - 3} ideas`,
    )
  })

  test("a re-run after a day that already saved a full Sunday's crosses asks for no loose ideas", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const p = puertos({
      pedir: vi.fn<Pedir>(async (paso) => {
        if (paso.paso === "cruces") throw new PasoYaPagado(paso.clave)
        return json([suelta("Suelta uno")])
      }),
      crucesGuardadosDesde: vi.fn(async () => IDEAS_DEL_DOMINGO),
    })
    const r = await motorDelDomingo(p, AHORA)
    expect(vi.mocked(p.pedir).mock.calls.map(([paso]) => paso.paso)).toEqual(["cruces"])
    expect(r.sueltas.guardadas).toBe(0)
  })

  test("a Falla in the crosses is logged and the loose ideas still run", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const p = puertos({
      pedir: vi.fn<Pedir>(async (paso) =>
        paso.paso === "cruces" ? { texto: "", detenido: "refusal", bloques: [] } : json([suelta("Suelta uno")]),
      ),
    })
    expect((await motorDelDomingo(p, AHORA)).sueltas.guardadas).toBe(1)
  })

  test("an unexpected error does not stop the other step but fails the run at the end", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const p = puertos({ paresParaCruzar: vi.fn(async () => Promise.reject(new Error("red caída"))) })
    await expect(motorDelDomingo(p, AHORA)).rejects.toThrow("red caída")
    expect(p.guardarIdeasSueltas).toHaveBeenCalledWith("domingo", expect.any(Array))
  })
})

describe("calibrarCruces", () => {
  test("turns the SQL histogram of every pair into 0.05 buckets split by topic, with the band's counts", async () => {
    const histogramaDeSimilitudes = vi.fn(async () => [
      { cubeta: 9, pares: 4, mismoTema: 1, enLaBanda: 0, enLaBandaMismoTema: 0 },
      { cubeta: 12, pares: 10, mismoTema: 3, enLaBanda: 6, enLaBandaMismoTema: 2 },
      { cubeta: 13, pares: 7, mismoTema: 2, enLaBanda: 7, enLaBandaMismoTema: 2 },
    ])
    const r = await calibrarCruces({ histogramaDeSimilitudes })
    expect(histogramaDeSimilitudes).toHaveBeenCalledWith(0, UMBRALES.cruce)
    expect(r.pares).toBe(21)
    expect(r.banda).toEqual({ minimo: UMBRALES.cruce.minimo, maximo: UMBRALES.cruce.maximo })
    expect(r.cubetas).toEqual([
      { desde: 0.4, hasta: 0.45, mismoTema: 1, otroTema: 3 },
      { desde: 0.55, hasta: 0.6, mismoTema: 3, otroTema: 7 },
      { desde: 0.6, hasta: 0.65, mismoTema: 2, otroTema: 5 },
    ])
    expect(r.enLaBanda).toEqual({ mismoTema: 4, otroTema: 9 })
  })
})
