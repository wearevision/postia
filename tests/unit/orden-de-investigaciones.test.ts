import { describe, expect, test } from "vitest"
import type { InvestigacionReciente } from "@/lib/investigacion/lectura"
import { notaDeUltimaVigilancia, ordenarInvestigaciones } from "@/lib/investigacion/orden"

const i = (sobre: Partial<InvestigacionReciente>): InvestigacionReciente => ({
  id: "x",
  tema: "Tema",
  origen: "encargo",
  estado: "aprobada",
  motivo: null,
  creadaEn: "2026-10-31T20:00:00.000Z",
  hallazgos: 3,
  ...sobre,
})

describe("ordenarInvestigaciones", () => {
  test("pulls reports waiting for approval to the top", () => {
    const r = ordenarInvestigaciones([i({ id: "a" }), i({ id: "b", estado: "informe_por_aprobar" })])
    expect(r.porAprobar.map((x) => x.id)).toEqual(["b"])
    expect(r.resto.map((x) => x.id)).toEqual(["a"])
  })

  test("hides finished watches that found nothing and remembers the latest one", () => {
    const vacia = i({ id: "v", origen: "vigilancia", hallazgos: 0, creadaEn: "2026-10-31T18:00:00.000Z" })
    const vieja = i({ id: "w", origen: "vigilancia", hallazgos: 0, creadaEn: "2026-10-24T18:00:00.000Z" })
    const r = ordenarInvestigaciones([vacia, vieja, i({ id: "a" })])
    expect(r.resto.map((x) => x.id)).toEqual(["a"])
    expect(r.ultimaVigilanciaVacia).toBe("2026-10-31T18:00:00.000Z")
  })

  test("keeps a watch that is still running or failed, even with no findings", () => {
    const corriendo = i({ id: "c", origen: "vigilancia", hallazgos: 0, estado: "investigando" })
    const fallida = i({ id: "f", origen: "vigilancia", hallazgos: 0, estado: "fallo", motivo: "Sin red" })
    const r = ordenarInvestigaciones([corriendo, fallida])
    expect(r.enCurso.map((x) => x.id)).toEqual(["c"])
    expect(r.resto.map((x) => x.id)).toEqual(["f"])
  })

  test("lists what is queued or running apart from the rest, so a new research shows first", () => {
    const r = ordenarInvestigaciones([
      i({ id: "nueva", estado: "en_cola", hallazgos: 0 }),
      i({ id: "a" }),
      i({ id: "b", estado: "investigando", hallazgos: 0 }),
    ])
    expect(r.enCurso.map((x) => x.id)).toEqual(["nueva", "b"])
    expect(r.resto.map((x) => x.id)).toEqual(["a"])
  })
})

describe("notaDeUltimaVigilancia", () => {
  test("says the last watch had no findings, not that nothing was new", () => {
    expect(notaDeUltimaVigilancia("2026-10-31T20:00:00.000Z")).toBe(
      "Última vigilancia: sábado 31 de octubre, 17:00, sin hallazgos.",
    )
  })
})
