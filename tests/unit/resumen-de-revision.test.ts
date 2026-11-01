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
const CON_UNA: VeredictoGuardado = { voz: { ok: false, comentario: "Suena a folleto." }, hallazgos: [] }

describe("resumenDeRevision", () => {
  test("client alerts come first, in the danger color, and open the review", () => {
    expect(resumenDeRevision({ hallazgos: [PRECIO, MENCION] })).toEqual({
      texto: "Revisión: 2 alertas de clientes",
      abierta: true,
      peligro: true,
    })
  })

  test("one client alert is singular", () => {
    expect(resumenDeRevision({ hallazgos: [PRECIO] }).texto).toBe("Revisión: 1 alerta de clientes")
  })

  test("nothing found reads as all in order, folded and calm", () => {
    expect(resumenDeRevision({ hallazgos: [] })).toEqual({
      texto: "Revisión: todo en orden",
      abierta: false,
      peligro: false,
    })
    expect(resumenDeRevision({ hallazgos: [], claude: { estado: "lista", revision: LIMPIA } })).toEqual({
      texto: "Revisión: todo en orden",
      abierta: false,
      peligro: false,
    })
  })

  test("counts the same verdict line once, as the screen shows it", () => {
    expect(resumenDeRevision({ hallazgos: [PRECIO, { ...PRECIO }] }).texto).toBe("Revisión: 1 alerta de clientes")
  })

  test("Claude's suggestions follow the client alerts in one sentence", () => {
    expect(resumenDeRevision({ hallazgos: [PRECIO], claude: { estado: "lista", revision: CON_DOS } })).toEqual({
      texto: "Revisión: 1 alerta de clientes y 2 sugerencias de Claude",
      abierta: true,
      peligro: true,
    })
  })

  test("only Claude's suggestion opens the review without the danger color", () => {
    expect(resumenDeRevision({ hallazgos: [], claude: { estado: "lista", revision: CON_UNA } })).toEqual({
      texto: "Revisión: 1 sugerencia de Claude",
      abierta: true,
      peligro: false,
    })
  })

  test("says plainly that Claude is still reviewing", () => {
    expect(resumenDeRevision({ hallazgos: [], claude: { estado: "revisando" } })).toEqual({
      texto: "Revisión: Claude todavía revisa",
      abierta: false,
      peligro: false,
    })
    expect(resumenDeRevision({ hallazgos: [PRECIO], claude: { estado: "revisando" } }).texto).toBe(
      "Revisión: 1 alerta de clientes y Claude todavía revisa",
    )
  })

  test("says plainly that Claude could not be read, and opens the review", () => {
    expect(resumenDeRevision({ hallazgos: [], claude: { estado: "ilegible" } })).toEqual({
      texto: "Revisión: no pude leer a Claude",
      abierta: true,
      peligro: false,
    })
  })

  test("says when the clients could not be checked and when Claude did not review", () => {
    expect(resumenDeRevision({ hallazgos: null, claude: { estado: "lista", revision: null } })).toEqual({
      texto: "Revisión: no pude revisar los clientes y Claude no la revisó",
      abierta: true,
      peligro: false,
    })
  })
})
