import { describe, expect, test } from "vitest"
import type { Hallazgo } from "@/lib/clientes/revision"
import type { VeredictoGuardado } from "@/lib/redaccion/lectura"
import { resumenDeRevision } from "@/lib/redaccion/resumen"

const PRECIO: Hallazgo = { tipo: "precio", fragmento: "$100" }
const MENCION: Hallazgo = { tipo: "mencion", fragmento: "@Acme" }
const LIMPIA: VeredictoGuardado = { voz: { ok: true, comentario: "" }, hallazgos: [] }

describe("resumenDeRevision", () => {
  test("says there is nothing when neither review found anything", () => {
    expect(resumenDeRevision({ hallazgos: [], revision: LIMPIA })).toBe("sin comentarios")
  })

  test("says there is nothing when there is no Claude review at all", () => {
    expect(resumenDeRevision({ hallazgos: [], revision: null })).toBe("sin comentarios")
  })

  test("counts one comment in the singular", () => {
    expect(resumenDeRevision({ hallazgos: [PRECIO], revision: null })).toBe("1 comentario")
  })

  test("adds the verdict's findings, Claude's findings and a voice remark", () => {
    const revision: VeredictoGuardado = {
      voz: { ok: false, comentario: "Suena a folleto." },
      hallazgos: [{ tipo: "cita", fragmento: "dicen que", comentario: "Cita sin fuente." }],
    }
    expect(resumenDeRevision({ hallazgos: [PRECIO, MENCION], revision })).toBe("4 comentarios")
  })

  test("counts the same verdict line once, as the screen shows it", () => {
    expect(resumenDeRevision({ hallazgos: [PRECIO, { ...PRECIO }], revision: null })).toBe("1 comentario")
  })

  test("says it could not read it when the verdict did not run", () => {
    expect(resumenDeRevision({ hallazgos: null, revision: LIMPIA })).toBe("no pude leerla")
  })

  test("says it could not read it when Claude's work could not be read", () => {
    expect(resumenDeRevision({ hallazgos: [], revision: null, claudeIlegible: true })).toBe("no pude leerla")
  })
})
