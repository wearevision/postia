import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { Desconectar } from "@/app/(app)/marcas/desconectar"

describe("Desconectar", () => {
  test("shows the refusal and keeps the account connected on screen", async () => {
    const desconectar = vi.fn(async () => ({ ok: false as const, error: "LinkedIn no respondió." }))
    render(<Desconectar cuentaId="c1" desconectar={desconectar} />)
    fireEvent.click(screen.getByRole("button", { name: "Desconectar" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pude desconectar: LinkedIn no respondió. La conexión sigue activa.",
    )
    expect(desconectar).toHaveBeenCalledOnce()
  })

  test("sends the account id", async () => {
    const desconectar = vi.fn(async (_previo: unknown, datos: FormData) => {
      expect(datos.get("cuentaId")).toBe("c1")
      return { ok: true as const }
    })
    render(<Desconectar cuentaId="c1" desconectar={desconectar} />)
    fireEvent.click(screen.getByRole("button", { name: "Desconectar" }))
    await vi.waitFor(() => expect(desconectar).toHaveBeenCalledOnce())
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })
})
