import { configure, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { ImportarEstadisticas } from "@/app/(app)/ajustes/importar-estadisticas"
import type { Exportacion } from "@/lib/rendimiento/exportacion"

// The form awaits several promises in a row; under the full parallel suite the default 1 s wait was not enough.
configure({ asyncUtilTimeout: 5_000 })

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
      leyendo: true,
    }))
    render(<ImportarEstadisticas cuentas={CUENTAS} leer={leer} importar={importar} />)
    const archivo = elegirArchivo()
    fireEvent.click(screen.getByRole("button", { name: "Importar" }))
    await waitFor(() => expect(importar).toHaveBeenCalledWith({ cuentaId: "c-perfil", exportacion: EXPORTACION }))
    expect(leer).toHaveBeenCalledWith([archivo])
    expect(screen.getByRole("status")).toHaveTextContent(
      "Listo: 12 publicaciones, 3 de PostIA y 9 anteriores. PostIA está leyendo tus publicaciones para proponer aprendizajes.",
    )
  })

  test("does not promise a reading when none could be queued", async () => {
    const importar = vi.fn(async () => ({
      ok: true as const,
      publicaciones: 2,
      dePostia: 1,
      anteriores: 1,
      sinIdentificar: 0,
      leyendo: false,
    }))
    render(
      <ImportarEstadisticas cuentas={CUENTAS} leer={async () => ({ ok: true, ...EXPORTACION })} importar={importar} />,
    )
    elegirArchivo()
    fireEvent.click(screen.getByRole("button", { name: "Importar" }))
    expect(await screen.findByRole("status")).toHaveTextContent("Listo: 2 publicaciones, 1 de PostIA y 1 anteriores.")
    expect(screen.getByRole("status")).not.toHaveTextContent("leyendo")
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
      .mockResolvedValueOnce({
        ok: true,
        publicaciones: 1,
        dePostia: 0,
        anteriores: 1,
        sinIdentificar: 0,
        leyendo: false,
      })
    render(
      <ImportarEstadisticas cuentas={CUENTAS} leer={async () => ({ ok: true, ...EXPORTACION })} importar={importar} />,
    )
    elegirArchivo()
    fireEvent.click(screen.getByRole("button", { name: "Importar" }))
    fireEvent.click(await screen.findByRole("button", { name: "Importar igual" }))
    await waitFor(() =>
      expect(importar).toHaveBeenLastCalledWith({ cuentaId: "c-perfil", exportacion: EXPORTACION, confirmado: true }),
    )
  }, 15_000)

  test("«Elegir archivos» is a real button that opens the file picker", () => {
    const abrir = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {})
    render(<ImportarEstadisticas cuentas={CUENTAS} leer={vi.fn()} importar={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Elegir archivos" }))
    expect(abrir).toHaveBeenCalledOnce()
    abrir.mockRestore()
  })

  test("«Importar» with no file opens the picker instead of an error", () => {
    const abrir = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {})
    render(<ImportarEstadisticas cuentas={CUENTAS} leer={vi.fn()} importar={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Importar" }))
    expect(abrir).toHaveBeenCalledOnce()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    abrir.mockRestore()
  })

  test("shows the chosen files by name, in Spanish, instead of the browser's own text", () => {
    render(<ImportarEstadisticas cuentas={CUENTAS} leer={vi.fn()} importar={vi.fn()} />)
    expect(screen.getByText("Ningún archivo elegido")).toBeInTheDocument()
    elegirArchivo()
    expect(screen.getByText("estadisticas.xlsx")).toBeInTheDocument()
    expect(screen.queryByText("Ningún archivo elegido")).not.toBeInTheDocument()
  })

  test("lists the profile and the page, takes several files and explains which to upload", async () => {
    const leer = vi.fn(async () => ({ ok: true as const, ...EXPORTACION }))
    const importar = vi.fn(async () => ({
      ok: true as const,
      publicaciones: 2,
      dePostia: 1,
      anteriores: 1,
      sinIdentificar: 0,
      leyendo: false,
    }))
    render(
      <ImportarEstadisticas
        cuentas={[
          { id: "c-perfil", nombre: "Federico", tipo: "persona" },
          { id: "c-pagina", nombre: "WAV", tipo: "empresa" },
        ]}
        leer={leer}
        importar={importar}
      />,
    )
    expect(
      screen.getByText(/Perfil: el \.xlsx de Analytics\. Página: los \.xls de contenido, seguidores y visitantes/),
    ).toBeVisible()
    expect(screen.getByLabelText("Archivo de LinkedIn")).toHaveAttribute("multiple")
    expect(screen.getByLabelText("Archivo de LinkedIn").getAttribute("accept")).toContain(".xls")
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Federico", "WAV"])
    fireEvent.change(screen.getByLabelText("Cuenta"), { target: { value: "c-pagina" } })
    const archivos = [new File(["a"], "contenido.xls"), new File(["b"], "seguidores.xls")]
    fireEvent.change(screen.getByLabelText("Archivo de LinkedIn"), { target: { files: archivos } })
    fireEvent.click(screen.getByRole("button", { name: "Importar" }))
    await waitFor(() => expect(importar).toHaveBeenCalledWith({ cuentaId: "c-pagina", exportacion: EXPORTACION }))
    expect(leer).toHaveBeenCalledWith(archivos)
  })
})
