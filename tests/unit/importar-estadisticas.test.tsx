import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { ImportarEstadisticas } from "@/app/(app)/ajustes/importar-estadisticas"
import type { Exportacion } from "@/lib/rendimiento/exportacion"

const CUENTAS = [{ id: "c-perfil", nombre: "Federico" }]
const EXPORTACION: Exportacion = {
  desde: "2025-11-10",
  hasta: "2026-11-09",
  seguidoresTotal: 3448,
  publicaciones: [],
  sinIdentificar: 0,
  dias: [],
  publico: [],
}

function elegirArchivo() {
  const archivo = new File(["x"], "estadisticas.xlsx")
  fireEvent.change(screen.getByLabelText("Archivo de LinkedIn"), { target: { files: [archivo] } })
  return archivo
}

describe("ImportarEstadisticas", () => {
  test("reads the file, imports it for the chosen account and says what it found", async () => {
    const leer = vi.fn(async () => ({ ok: true as const, ...EXPORTACION }))
    const importar = vi.fn(async () => ({
      ok: true as const,
      publicaciones: 12,
      dePostia: 3,
      anteriores: 9,
      sinIdentificar: 0,
    }))
    render(<ImportarEstadisticas cuentas={CUENTAS} leer={leer} importar={importar} />)
    const archivo = elegirArchivo()
    fireEvent.click(screen.getByRole("button", { name: "Importar" }))
    await waitFor(() => expect(importar).toHaveBeenCalledWith({ cuentaId: "c-perfil", exportacion: EXPORTACION }))
    expect(leer).toHaveBeenCalledWith(archivo)
    expect(screen.getByRole("status")).toHaveTextContent("Listo: 12 publicaciones, 3 de PostIA y 9 anteriores.")
  })

  test("a file that is not LinkedIn's shows the reader's error and imports nothing", async () => {
    const importar = vi.fn()
    render(
      <ImportarEstadisticas
        cuentas={CUENTAS}
        leer={async () => ({ ok: false, error: "Ese archivo no es la exportación de estadísticas de LinkedIn." })}
        importar={importar}
      />,
    )
    elegirArchivo()
    fireEvent.click(screen.getByRole("button", { name: "Importar" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Ese archivo no es la exportación")
    expect(importar).not.toHaveBeenCalled()
  })

  test("when the file has no PostIA post it asks, and «Importar igual» confirms", async () => {
    const importar = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        error: "Ninguna publicación del archivo es de esta cuenta en PostIA.",
        confirmar: true,
      })
      .mockResolvedValueOnce({ ok: true, publicaciones: 1, dePostia: 0, anteriores: 1, sinIdentificar: 0 })
    render(
      <ImportarEstadisticas cuentas={CUENTAS} leer={async () => ({ ok: true, ...EXPORTACION })} importar={importar} />,
    )
    elegirArchivo()
    fireEvent.click(screen.getByRole("button", { name: "Importar" }))
    fireEvent.click(await screen.findByRole("button", { name: "Importar igual" }))
    await waitFor(() =>
      expect(importar).toHaveBeenLastCalledWith({ cuentaId: "c-perfil", exportacion: EXPORTACION, confirmado: true }),
    )
  })

  test("without a file it asks for one", () => {
    render(<ImportarEstadisticas cuentas={CUENTAS} leer={vi.fn()} importar={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Importar" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Elige el archivo que descargaste de LinkedIn.")
  })
})
