import { createHash } from "node:crypto"
import { describe, expect, test } from "vitest"
import { limpiarArchivos } from "@/lib/mantenimiento/limpieza"
import { admin, cuentaDe, marcaConDueno, personaConSesion } from "./entorno"

const COMO_PDF = { contentType: "application/pdf" }
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")

describe("limpiarArchivos", () => {
  test("removes only the orphan file once it is a day old and keeps the one a piece references", async () => {
    const dueno = await personaConSesion("limpieza")
    const marca = await marcaConDueno(dueno.userId)
    const cuenta = await cuentaDe(marca)
    const usado = new TextEncoder().encode("%PDF-1.4\n%usado\n")
    const huerfano = new TextEncoder().encode("%PDF-1.4\n%huerfano\n")
    const rutaUsada = `${marca}/${crypto.randomUUID()}.pdf`
    const rutaHuerfana = `${marca}/${crypto.randomUUID()}.pdf`
    for (const [ruta, bytes] of [
      [rutaUsada, usado],
      [rutaHuerfana, huerfano],
    ] as const) {
      expect((await admin().storage.from("piezas").upload(ruta, bytes, COMO_PDF)).error).toBeNull()
    }
    const creada = await dueno.db.rpc("crear_pieza", {
      p_cuenta: cuenta,
      p_formato: "carrusel_pdf",
      p_texto: "Carrusel",
      p_titulo: "Titulo",
      p_archivo_ruta: rutaUsada,
      p_archivo_sha256: sha(usado),
    })
    expect(creada.error).toBeNull()

    expect(await limpiarArchivos(admin(), { ahora: Date.now(), carpetas: [marca] })).toBe(0)
    expect((await admin().storage.from("piezas").download(rutaHuerfana)).error).toBeNull()

    const manana = Date.now() + 25 * 3_600_000
    expect(await limpiarArchivos(admin(), { ahora: manana, carpetas: [marca] })).toBe(1)
    expect((await admin().storage.from("piezas").download(rutaHuerfana)).error).not.toBeNull()
    expect((await admin().storage.from("piezas").download(rutaUsada)).error).toBeNull()
  })

  test("Storage lists a brand folder as an entry without id and its files with a creation date", async () => {
    const dueno = await personaConSesion("limpieza-forma")
    const marca = await marcaConDueno(dueno.userId)
    const ruta = `${marca}/${crypto.randomUUID()}.pdf`
    await admin().storage.from("piezas").upload(ruta, new TextEncoder().encode("%PDF-1.4\n%x\n"), COMO_PDF)
    const bucket = admin().storage.from("piezas")
    const carpeta = (await bucket.list("", { limit: 1000 })).data?.find((o) => o.name === marca)
    expect(carpeta?.id).toBeNull()
    const archivo = (await bucket.list(marca)).data?.find((o) => ruta.endsWith(o.name))
    expect(archivo?.id).not.toBeNull()
    expect(archivo?.created_at).not.toBeNull()
  })
})
