import { readFileSync } from "node:fs"
import path from "node:path"
import { render, screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { FirmaCaida } from "@/app/(app)/piezas/[id]/caida"
import { cambioEntreVersiones, describirCambio, MOTIVO_DE_FIRMA_CAIDA, versionAnterior } from "@/lib/piezas/cambio"

const BASE = { texto: "Primera línea\nSegunda línea", titulo: "Título", archivoRuta: null }

describe("what changed between two versions", () => {
  test("is nothing when the content is the same, ignoring trailing whitespace and line endings", () => {
    const cambio = cambioEntreVersiones(BASE, { ...BASE, texto: "Primera línea\r\nSegunda línea  \n" })
    expect(describirCambio(cambio)).toBeNull()
  })

  test("counts new and removed lines of the text", () => {
    const cambio = cambioEntreVersiones(BASE, { ...BASE, texto: "Primera línea\nOtra línea\nUna más" })
    expect(describirCambio(cambio)).toBe("Cambió el texto (2 líneas nuevas y 1 quitada).")
  })

  test("uses the singular and says only what happened", () => {
    expect(
      describirCambio(cambioEntreVersiones(BASE, { ...BASE, texto: "Primera línea\nSegunda línea\nTercera" })),
    ).toBe("Cambió el texto (1 línea nueva).")
    expect(describirCambio(cambioEntreVersiones(BASE, { ...BASE, texto: "Primera línea" }))).toBe(
      "Cambió el texto (1 línea quitada).",
    )
  })

  test("says the order changed when the lines are the same but moved, because the version still differs", () => {
    const cambio = cambioEntreVersiones(BASE, { ...BASE, texto: "Segunda línea\nPrimera línea" })
    expect(describirCambio(cambio)).toBe("Cambió el orden del texto.")
  })

  test("names the title and the file when they change", () => {
    const cambio = cambioEntreVersiones(BASE, { ...BASE, titulo: "Otro título", archivoRuta: "marca/archivo.pdf" })
    expect(describirCambio(cambio)).toBe("Cambió el título y el archivo.")
  })

  test("lists the text, the title and the file together", () => {
    const cambio = cambioEntreVersiones(BASE, { texto: "Nuevo", titulo: null, archivoRuta: "marca/archivo.pdf" })
    expect(describirCambio(cambio)).toBe("Cambió el texto (1 línea nueva y 2 quitadas), el título y el archivo.")
  })

  test("picks the version right before the latest one", () => {
    const versiones = [{ numero: 2 }, { numero: 3 }, { numero: 1 }]
    expect(versionAnterior(versiones)).toEqual({ numero: 2 })
    expect(versionAnterior([{ numero: 1 }])).toBeUndefined()
  })
})

describe("the reason the database leaves when a signature drops", () => {
  test.each(["20261029120000_piezas.sql", "20261030120000_calendario_y_reserva.sql"])(
    "is the exact text the app recognizes (%s)",
    (migracion) => {
      const sql = readFileSync(path.resolve(__dirname, "../../supabase/migrations", migracion), "utf8")
      expect(sql).toContain(MOTIVO_DE_FIRMA_CAIDA)
    },
  )
})

describe("FirmaCaida", () => {
  test("says the signature dropped, what changed, and that the new version needs signing", () => {
    render(<FirmaCaida cambio="Cambió el texto (1 línea nueva)." />)
    const aviso = screen.getByRole("region", { name: "La firma se cayó" })
    expect(aviso).toHaveTextContent("Tu firma anterior se cayó.")
    expect(aviso).toHaveTextContent("Cambió el texto (1 línea nueva). Hay que firmar esta versión de nuevo.")
  })

  test("still explains it when it cannot tell what changed", () => {
    render(<FirmaCaida cambio={null} />)
    const aviso = screen.getByRole("region", { name: "La firma se cayó" })
    expect(aviso).toHaveTextContent("Tu firma anterior se cayó.")
    expect(aviso).toHaveTextContent("Hay que firmar esta versión de nuevo.")
    expect(aviso).not.toHaveTextContent("Cambió")
  })

  test("marks the warning icon as decorative", () => {
    render(<FirmaCaida cambio={null} />)
    const icono = screen.getByRole("region", { name: "La firma se cayó" }).querySelector("svg")
    expect(icono).toHaveAttribute("aria-hidden", "true")
  })
})
