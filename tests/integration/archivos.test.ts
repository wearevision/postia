import { describe, expect, test } from "vitest"
import { marcaConDueno, personaConSesion } from "./entorno"

const PDF = new TextEncoder().encode("%PDF-1.4\n%prueba\n")
const COMO_PDF = { contentType: "application/pdf" }

describe("piece files", () => {
  test("an owner uploads under their brand's folder; a stranger can neither read nor write it", async () => {
    const dueno = await personaConSesion("archivo")
    const marca = await marcaConDueno(dueno.userId)
    const ruta = `${marca}/${crypto.randomUUID()}.pdf`
    expect((await dueno.db.storage.from("piezas").upload(ruta, PDF, COMO_PDF)).error).toBeNull()
    expect((await dueno.db.storage.from("piezas").download(ruta)).error).toBeNull()
    const extrano = await personaConSesion("archivo-extrano")
    expect((await extrano.db.storage.from("piezas").download(ruta)).error).not.toBeNull()
    expect(
      (await extrano.db.storage.from("piezas").upload(`${marca}/${crypto.randomUUID()}.pdf`, PDF, COMO_PDF)).error,
    ).not.toBeNull()
  })

  test("only PDFs are accepted", async () => {
    const dueno = await personaConSesion("archivo-tipo")
    const marca = await marcaConDueno(dueno.userId)
    const { error } = await dueno.db.storage.from("piezas").upload(`${marca}/x.png`, PDF, { contentType: "image/png" })
    expect(error).not.toBeNull()
  })

  test("a folder that is not a brand id is denied cleanly instead of failing the cast", async () => {
    const dueno = await personaConSesion("archivo-carpeta")
    const { error } = await dueno.db.storage.from("piezas").upload("no-es-uuid/x.pdf", PDF, COMO_PDF)
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/row-level security|unauthorized|not allowed/i)
  })
})
