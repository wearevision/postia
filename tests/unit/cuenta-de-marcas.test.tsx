import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { ConectarLinkedin } from "@/app/(app)/marcas/conectar-linkedin"
import { EstadoDeConexionChip } from "@/app/(app)/marcas/estado-de-conexion"
import { estadoDeCuenta } from "@/app/(app)/marcas/estado-de-cuenta"
import { mensajeDeLinkedin } from "@/app/(app)/marcas/mensajes"
import { RutaDeCuenta } from "@/app/(app)/marcas/ruta-de-cuenta"
import type { Resultado } from "@/lib/marcas/acciones"

const CUENTA = "11111111-1111-4111-8111-111111111111"

type Cambiar = (cuentaId: string, ruta: "api" | "a_mano") => Promise<Resultado>

describe("ConectarLinkedin", () => {
  test("a page goes through the page app, with its own words", () => {
    const { rerender } = render(<ConectarLinkedin cuentaId={CUENTA} tipo="empresa" conectada={false} />)
    expect(screen.getByRole("link", { name: "Conectar página de LinkedIn" })).toHaveAttribute(
      "href",
      `/api/linkedin/pagina/conectar?cuenta=${CUENTA}`,
    )
    rerender(<ConectarLinkedin cuentaId={CUENTA} tipo="empresa" conectada />)
    expect(screen.getByRole("link", { name: "Renovar página" })).toHaveAttribute(
      "href",
      `/api/linkedin/pagina/conectar?cuenta=${CUENTA}`,
    )
  })

  test("a profile keeps the profile app", () => {
    const { rerender } = render(<ConectarLinkedin cuentaId={CUENTA} tipo="persona" conectada={false} />)
    expect(screen.getByRole("link", { name: "Conectar LinkedIn" })).toHaveAttribute(
      "href",
      `/api/linkedin/conectar?cuenta=${CUENTA}`,
    )
    rerender(<ConectarLinkedin cuentaId={CUENTA} tipo="persona" conectada />)
    expect(screen.getByRole("link", { name: "Renovar LinkedIn" })).toBeVisible()
  })
})

describe("RutaDeCuenta", () => {
  function montar(ruta: string, conectada = false, resultado: Resultado = { ok: true }, programadas = 0) {
    const cambiar = vi.fn<Cambiar>(async () => resultado)
    render(
      <RutaDeCuenta
        cuentaId={CUENTA}
        nombre="Página de WAV"
        ruta={ruta}
        conectada={conectada}
        programadas={programadas}
        cambiar={cambiar}
      />,
    )
    return cambiar
  }

  test("going out by itself with scheduled pieces warns once before switching", async () => {
    const cambiar = montar("a_mano", true, { ok: true }, 2)
    fireEvent.click(screen.getByRole("button", { name: "Sale sola" }))
    expect(
      screen.getByText(
        "Esta cuenta tiene 2 piezas programadas. Si ya publicaste alguna a mano, márcala como publicada antes, para que no salga dos veces.",
      ),
    ).toBeVisible()
    expect(cambiar).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Sí, que salga sola" }))
    await waitFor(() => expect(cambiar).toHaveBeenCalledTimes(1))
    expect(cambiar).toHaveBeenCalledWith(CUENTA, "api")
  })

  test("the warning can be dismissed, and one scheduled piece is said in the singular", () => {
    const cambiar = montar("a_mano", false, { ok: true }, 1)
    fireEvent.click(screen.getByRole("button", { name: "Sale sola" }))
    expect(screen.getByText(/^Esta cuenta tiene 1 pieza programada\./)).toBeVisible()
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(screen.queryByText(/piezas? programadas?/)).toBeNull()
    expect(cambiar).not.toHaveBeenCalled()
  })

  test("going by hand never asks, even with scheduled pieces", async () => {
    const cambiar = montar("api", true, { ok: true }, 3)
    fireEvent.click(screen.getByRole("button", { name: "A mano" }))
    await waitFor(() => expect(cambiar).toHaveBeenCalledWith(CUENTA, "a_mano"))
  })

  test("marks the current route and switches to the other one", async () => {
    const cambiar = montar("a_mano")
    expect(screen.getByRole("button", { name: "A mano" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Sale sola" })).toHaveAttribute("aria-pressed", "false")
    fireEvent.click(screen.getByRole("button", { name: "Sale sola" }))
    await waitFor(() => expect(cambiar).toHaveBeenCalledWith(CUENTA, "api"))
  })

  test("tapping the current route does nothing", () => {
    const cambiar = montar("api")
    fireEvent.click(screen.getByRole("button", { name: "Sale sola" }))
    expect(cambiar).not.toHaveBeenCalled()
  })

  test("going by hand no longer warns about unlinking: it only pauses", () => {
    montar("api", true)
    expect(screen.queryByText(/desconecta/)).toBeNull()
    expect(screen.queryByText(/En pausa/)).toBeNull()
  })

  test("a connected account by hand says it is paused", () => {
    montar("a_mano", true)
    expect(screen.getByText("En pausa: las piezas se publican a mano.")).toBeVisible()
  })

  test("an account by hand without a connection is not paused, just by hand", () => {
    montar("a_mano", false)
    expect(screen.queryByText(/En pausa/)).toBeNull()
  })

  test("shows the action's error", async () => {
    montar("a_mano", false, { ok: false, error: "Solo el dueño de la marca puede cambiar cómo sale una cuenta." })
    fireEvent.click(screen.getByRole("button", { name: "Sale sola" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Solo el dueño de la marca puede cambiar cómo sale una cuenta.",
    )
  })
})

describe("mensajeDeLinkedin", () => {
  test("explains the page outcomes", () => {
    expect(mensajeDeLinkedin("sin_pagina")).toBe(
      "Tu cuenta de LinkedIn no administra ninguna página. Pide el rol de administrador en la página de WAV y vuelve a conectar.",
    )
    expect(mensajeDeLinkedin("sin_app_pagina")).toBe("Falta configurar la app de la página de LinkedIn en el servidor.")
    expect(mensajeDeLinkedin("permisos")).toBe(
      "LinkedIn no dio permiso para publicar. Vuelve a conectar y acepta todos los permisos.",
    )
  })

  test("tells the owner which button fits the account", () => {
    expect(mensajeDeLinkedin("cuenta_es_pagina")).toBe("Esta cuenta es una página: usa «Conectar página de LinkedIn».")
    expect(mensajeDeLinkedin("cuenta_es_perfil")).toBe("Esta cuenta es un perfil: usa «Conectar LinkedIn».")
  })

  test("keeps the profile's messages and ignores unknown words", () => {
    expect(mensajeDeLinkedin("sin_app")).toBe("Falta configurar la app de LinkedIn en el servidor.")
    expect(mensajeDeLinkedin("conectada")).toBe("LinkedIn quedó conectado.")
    expect(mensajeDeLinkedin("constructor")).toBeNull()
    expect(mensajeDeLinkedin(undefined)).toBeNull()
  })
})

describe("estadoDeCuenta", () => {
  const AHORA = Date.parse("2026-11-01T12:00:00Z")

  test("a page whose refresh token outlives its access token renews itself", () => {
    const conexion = { expira_en: "2026-11-20T12:00:00Z", renovacion_expira_en: "2027-10-01T12:00:00Z" }
    render(<EstadoDeConexionChip estado={estadoDeCuenta(conexion, AHORA)} />)
    expect(screen.getByText("Se renueva sola")).toBeVisible()
  })

  test("without a refresh token it counts down the access token; without a connection it says so", () => {
    expect(estadoDeCuenta({ expira_en: "2026-12-31T12:00:00Z", renovacion_expira_en: null }, AHORA)).toEqual({
      estado: "conectada",
      dias: 60,
    })
    expect(estadoDeCuenta(null, AHORA)).toEqual({ estado: "sin_conexion" })
  })
})
