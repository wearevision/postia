import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { AvisosDelCelular } from "@/app/(app)/ajustes/avisos-del-celular"
import type { DatosDelDispositivo, PuertoDeAvisos } from "@/lib/avisos/navegador"

function puerto(datos: Partial<DatosDelDispositivo> = {}) {
  return {
    leer: vi.fn(async (_claveVapid: string | null) => ({
      ios: false,
      instalada: false,
      soportado: true,
      permiso: "default" as const,
      suscrito: false,
      ...datos,
    })),
    activar: vi.fn(async () => ({
      estado: "activada" as const,
      suscripcion: { endpoint: "https://p.test/1", p256dh: "k", auth: "a", userAgent: "x" },
    })),
    desactivar: vi.fn(async () => null),
  } satisfies PuertoDeAvisos
}

describe("AvisosDelCelular", () => {
  test("on an iPhone outside the installed app, explains how to install it", async () => {
    render(
      <AvisosDelCelular
        claveVapid="k"
        puerto={puerto({ ios: true, soportado: false })}
        guardar={vi.fn()}
        probar={vi.fn()}
      />,
    )
    expect(await screen.findByText(/Compartir.*Agregar a inicio/)).toBeInTheDocument()
  })

  test("activating subscribes this device and saves it", async () => {
    const p = puerto()
    const guardar = vi.fn(async () => ({ ok: true as const }))
    render(<AvisosDelCelular claveVapid="k" puerto={p} guardar={guardar} probar={vi.fn()} />)
    fireEvent.click(await screen.findByRole("button", { name: "Activar avisos" }))
    expect(await screen.findByRole("button", { name: "Mandar aviso de prueba" })).toBeInTheDocument()
    expect(p.activar).toHaveBeenCalledWith("k")
    expect(guardar).toHaveBeenCalledWith({ endpoint: "https://p.test/1", p256dh: "k", auth: "a", userAgent: "x" })
  })

  test("offers to activate again when the device subscription does not match the server key", async () => {
    const p = puerto({ suscrito: false, permiso: "granted" })
    render(<AvisosDelCelular claveVapid="k" puerto={p} guardar={vi.fn()} probar={vi.fn()} />)
    expect(await screen.findByRole("button", { name: "Activar avisos" })).toBeInTheDocument()
    expect(p.leer).toHaveBeenCalledWith("k")
  })
})
