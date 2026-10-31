import { describe, expect, test } from "vitest"
import type { InvestigacionReciente } from "@/lib/investigacion/lectura"
import { ordenarInvestigaciones } from "@/lib/investigacion/orden"

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
    expect(ordenarInvestigaciones([corriendo, fallida]).resto.map((x) => x.id)).toEqual(["c", "f"])
  })
})
