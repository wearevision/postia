import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { FormularioIngreso } from "@/app/ingreso/formulario-ingreso"

describe("FormularioIngreso", () => {
  test("asks for the code after sending the address, with the same answer for everyone", async () => {
    const pedirCodigo = vi.fn(async () => ({ ok: true as const }))
    render(<FormularioIngreso pedirCodigo={pedirCodigo} verificarCodigo={vi.fn()} />)
    fireEvent.change(screen.getByLabelText("Tu correo"), { target: { value: "federico@wav.cl" } })
    fireEvent.click(screen.getByRole("button", { name: "Mandar código" }))
    expect(await screen.findByText(/Si tu correo está invitado, te llegó un código de 6 números/)).toBeInTheDocument()
    expect(pedirCodigo).toHaveBeenCalledWith("federico@wav.cl")
    expect(screen.getByLabelText("Código de 6 números")).toHaveAttribute("inputmode", "numeric")
  })

  test("shows the error as an alert and stays on the address step", async () => {
    const pedirCodigo = vi.fn(async () => ({ ok: false as const, error: "Revisa tu correo: le falta algo." }))
    render(<FormularioIngreso pedirCodigo={pedirCodigo} verificarCodigo={vi.fn()} />)
    fireEvent.change(screen.getByLabelText("Tu correo"), { target: { value: "federico@wav" } })
    fireEvent.click(screen.getByRole("button", { name: "Mandar código" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("Revisa tu correo: le falta algo.")
    expect(screen.getByLabelText("Tu correo")).toBeInTheDocument()
  })
})
