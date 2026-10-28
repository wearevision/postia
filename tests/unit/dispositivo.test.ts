import { describe, expect, test } from "vitest"
import { estadoDeAvisos } from "@/lib/avisos/dispositivo"

const BASE = {
  configurado: true,
  ios: false,
  instalada: false,
  soportado: true,
  permiso: "default" as const,
  suscrito: false,
}

describe("estadoDeAvisos", () => {
  test("an iPhone in Safari is told to install the app, not that it cannot", () => {
    expect(estadoDeAvisos({ ...BASE, ios: true, soportado: false })).toBe("instalar")
  })
  test("is ready to activate, active once subscribed, and blocked when denied", () => {
    expect(estadoDeAvisos(BASE)).toBe("listo")
    expect(estadoDeAvisos({ ...BASE, permiso: "granted", suscrito: true })).toBe("activo")
    expect(estadoDeAvisos({ ...BASE, permiso: "denied" })).toBe("denegado")
  })
  test("is unavailable without server keys", () => {
    expect(estadoDeAvisos({ ...BASE, configurado: false })).toBe("no_disponible")
  })
})
