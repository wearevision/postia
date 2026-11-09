import { configure, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { FuenteDeLasCifras } from "@/app/(app)/rendimiento/fuente"
import type { Resultado } from "@/lib/marcas/acciones"
import type { AnaliticasDeCuenta } from "@/lib/rendimiento/lectura"

configure({ asyncUtilTimeout: 5_000 })

const CONECTADA: AnaliticasDeCuenta = {
  tipo: "persona",
  conectada: true,
  esDueno: true,
  leyendo: false,
  actualizadaEn: "2026-11-09T10:00:00Z",
  ultimoFallo: null,
}

const FUENTE = {
  api: "Cifras de LinkedIn (API), actualizadas hace 2 h",
  importacion: "Archivo importado (del 10 nov 2025 al 9 nov 2026)",
  nota: "LinkedIn permite guardar estas cifras 48 horas: se actualizan cada día",
}

function montar(
  analiticas: Partial<AnaliticasDeCuenta> = {},
  actualizar = vi.fn(async (): Promise<Resultado> => ({ ok: true })),
) {
  render(
    <FuenteDeLasCifras
      cuentaId="cuenta-1"
      analiticas={{ ...CONECTADA, ...analiticas }}
      fuente={FUENTE}
      actualizar={actualizar}
    />,
  )
  return actualizar
}

const boton = () => screen.queryByRole("button", { name: "Actualizar desde LinkedIn" })

describe("FuenteDeLasCifras", () => {
  test("shows both sources and the profile's note", () => {
    montar()
    expect(screen.getByText(FUENTE.api)).toBeInTheDocument()
    expect(screen.getByText(FUENTE.importacion)).toBeInTheDocument()
    expect(screen.getByText(FUENTE.nota)).toBeInTheDocument()
  })

  test("queues an update for the account and says it is on its way", async () => {
    const actualizar = montar()
    fireEvent.click(boton() as HTMLElement)
    expect(actualizar).toHaveBeenCalledWith("cuenta-1")
    expect(await screen.findByText("Listo. Las cifras llegan en unos minutos.")).toBeInTheDocument()
  })

  test("shows the action's error when the update is refused", async () => {
    montar(
      {},
      vi.fn(async (): Promise<Resultado> => ({ ok: false, error: "LinkedIn ya se está leyendo." })),
    )
    fireEvent.click(boton() as HTMLElement)
    expect(await screen.findByRole("alert")).toHaveTextContent("LinkedIn ya se está leyendo.")
  })

  test("says the profile was already read twice today when the daily cap refuses the tap", async () => {
    montar(
      {},
      vi.fn(
        async (): Promise<Resultado> => ({ ok: false, error: "Ya se leyó LinkedIn dos veces hoy. Vuelve mañana." }),
      ),
    )
    fireEvent.click(boton() as HTMLElement)
    expect(await screen.findByRole("alert")).toHaveTextContent("Ya se leyó LinkedIn dos veces hoy. Vuelve mañana.")
    expect(boton()).toBeEnabled()
  })

  test("while a reading is open the button is disabled and says LinkedIn is being read", () => {
    montar({ leyendo: true })
    expect(boton()).toBeDisabled()
    expect(screen.getByText("Leyendo LinkedIn…")).toBeInTheDocument()
  })

  test("says why the last reading failed", () => {
    montar({ ultimoFallo: "LinkedIn no respondió." })
    expect(screen.getByText("La última lectura de LinkedIn no salió: LinkedIn no respondió.")).toBeInTheDocument()
  })

  test("only the owner gets the button", () => {
    montar({ esDueno: false })
    expect(boton()).toBeNull()
  })

  test("an unconnected profile gets no button and a pointer to Ajustes", () => {
    render(
      <FuenteDeLasCifras
        cuentaId="cuenta-1"
        analiticas={{ ...CONECTADA, conectada: false, actualizadaEn: null }}
        fuente={{ api: null, importacion: null, nota: null }}
        actualizar={vi.fn()}
      />,
    )
    expect(boton()).toBeNull()
    expect(screen.getByRole("link", { name: "Conecta las analíticas de LinkedIn en Ajustes" })).toHaveAttribute(
      "href",
      "/ajustes",
    )
  })

  test("an unconnected page gets neither the button nor the pointer", () => {
    render(
      <FuenteDeLasCifras
        cuentaId="cuenta-1"
        analiticas={{ ...CONECTADA, tipo: "empresa", conectada: false, actualizadaEn: null }}
        fuente={{ api: null, importacion: null, nota: null }}
        actualizar={vi.fn()}
      />,
    )
    expect(boton()).toBeNull()
    expect(screen.queryByRole("link")).toBeNull()
  })
})
