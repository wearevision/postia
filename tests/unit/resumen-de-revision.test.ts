import { describe, expect, test } from "vitest"
import type { Hallazgo } from "@/lib/clientes/revision"
import type { VeredictoGuardado } from "@/lib/redaccion/lectura"
import { resumenDeRevision } from "@/lib/redaccion/resumen"

const PRECIO: Hallazgo = { tipo: "precio", fragmento: "$100" }
const MENCION: Hallazgo = { tipo: "mencion", fragmento: "@Acme" }
const LIMPIA: VeredictoGuardado = { voz: { ok: true, comentario: "" }, hallazgos: [] }
const CON_DOS: VeredictoGuardado = {
  voz: { ok: false, comentario: "Suena a folleto." },
  hallazgos: [{ tipo: "cita", fragmento: "dicen que", comentario: "Cita sin fuente." }],
}

describe("resumenDeRevision", () => {
  test("a piece without Claude shows only the verdict's count", () => {
    expect(resumenDeRevision({ hallazgos: [PRECIO, MENCION] })).toEqual({ texto: "2 comentarios", abierta: true })
  })

  test("a clean verdict on a piece without Claude stays folded", () => {
    expect(resumenDeRevision({ hallazgos: [] })).toEqual({ texto: "sin comentarios", abierta: false })
  })

  test("counts the same verdict line once, as the screen shows it", () => {
    expect(resumenDeRevision({ hallazgos: [PRECIO, { ...PRECIO }] }).texto).toBe("1 comentario")
  })

  test("says Claude is still reviewing while its automatic review is pending", () => {
    expect(resumenDeRevision({ hallazgos: [PRECIO], claude: { estado: "revisando" } })).toEqual({
      texto: "1 comentario · Claude todavía revisa",
      abierta: true,
    })
  })

  test("says there is no Claude review when there is none, and the verdict could not run", () => {
    expect(resumenDeRevision({ hallazgos: null, claude: { estado: "lista", revision: null } })).toEqual({
      texto: "no pude revisar los clientes · sin revisión de Claude",
      abierta: true,
    })
  })

  test("says Claude could not be read on a read failure, without hiding the verdict", () => {
    expect(resumenDeRevision({ hallazgos: [], claude: { estado: "ilegible" } })).toEqual({
      texto: "sin comentarios · Claude no se pudo leer",
      abierta: true,
    })
  })

  test("reports Claude's findings and voice remark apart from the verdict", () => {
    expect(resumenDeRevision({ hallazgos: [], claude: { estado: "lista", revision: CON_DOS } })).toEqual({
      texto: "sin comentarios · Claude: 2 comentarios",
      abierta: true,
    })
  })

  test("both clean stays folded", () => {
    expect(resumenDeRevision({ hallazgos: [], claude: { estado: "lista", revision: LIMPIA } })).toEqual({
      texto: "sin comentarios · Claude: sin comentarios",
      abierta: false,
    })
  })
})
