import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { FormularioDeInvestigacion } from "@/app/(app)/investigar/formulario"
import { NuevaInvestigacion } from "@/app/(app)/investigar/nueva"

const SUGERENCIAS = [
  { id: "11111111-1111-4111-8111-111111111111", tema: "Neuromarketing", enriquece: "Cruza con focus groups." },
]

const tema = () => screen.getByLabelText("¿Qué quieres investigar?")
const enviar = () => fireEvent.click(screen.getByRole("button", { name: "Investigar" }))

describe("FormularioDeInvestigacion", () => {
  test("starts with 5 pieces, carrusel and no focus, and says what it costs", () => {
    render(<FormularioDeInvestigacion sugerencias={[]} pedir={vi.fn()} />)
    expect(tema()).toHaveValue("")
    for (const n of ["3", "10"])
      expect(screen.getByRole("button", { name: n })).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByRole("button", { name: "5" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("radio", { name: "Carrusel PDF" })).toBeChecked()
    expect(screen.getByRole("radio", { name: "Post de texto" })).not.toBeChecked()
    for (const e of ["Tendencias", "Desafíos", "Mitos", "Guía"])
      expect(screen.getByRole("button", { name: e })).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByText("Cada investigación busca en la web y cuesta cerca de US$1.")).toBeVisible()
    expect(screen.queryByRole("heading", { name: "Sugerencias" })).toBeNull()
  })

  test("tapping a suggestion fills the theme", () => {
    render(<FormularioDeInvestigacion sugerencias={SUGERENCIAS} pedir={vi.fn()} />)
    expect(screen.getByRole("heading", { name: "Sugerencias" })).toBeVisible()
    expect(screen.getByText("Cruza con focus groups.")).toBeVisible()
    fireEvent.click(screen.getByRole("button", { name: /Neuromarketing/ }))
    expect(tema()).toHaveValue("Neuromarketing")
  })

  test("submits what was chosen and clears the theme on success", async () => {
    const pedir = vi.fn().mockResolvedValue({ ok: true, investigacionId: "x" })
    render(<FormularioDeInvestigacion sugerencias={[]} pedir={pedir} />)
    fireEvent.change(tema(), { target: { value: "WR3 y focus groups" } })
    fireEvent.click(screen.getByRole("button", { name: "10" }))
    fireEvent.click(screen.getByRole("radio", { name: "Post de texto" }))
    fireEvent.click(screen.getByRole("button", { name: "Mitos" }))
    expect(screen.getByRole("button", { name: "Mitos" })).toHaveAttribute("aria-pressed", "true")
    enviar()
    await waitFor(() =>
      expect(pedir).toHaveBeenCalledWith({
        tema: "WR3 y focus groups",
        cantidad: 10,
        formato: "texto",
        enfoque: "mitos",
      }),
    )
    await waitFor(() => expect(tema()).toHaveValue(""))
    expect(screen.queryByRole("alert")).toBeNull()
  })

  test("tapping the chosen focus again clears it", async () => {
    const pedir = vi.fn().mockResolvedValue({ ok: true, investigacionId: "x" })
    render(<FormularioDeInvestigacion sugerencias={[]} pedir={pedir} />)
    fireEvent.change(tema(), { target: { value: "Algo" } })
    fireEvent.click(screen.getByRole("button", { name: "Guía" }))
    fireEvent.click(screen.getByRole("button", { name: "Guía" }))
    enviar()
    await waitFor(() =>
      expect(pedir).toHaveBeenCalledWith({ tema: "Algo", cantidad: 5, formato: "carrusel_pdf", enfoque: null }),
    )
  })

  test("an error shows in an alert and keeps the theme", async () => {
    const pedir = vi
      .fn()
      .mockResolvedValue({ ok: false, error: "Ya hay 3 investigaciones en curso. Espera a que terminen." })
    render(<FormularioDeInvestigacion sugerencias={[]} pedir={pedir} />)
    fireEvent.change(tema(), { target: { value: "Algo" } })
    enviar()
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ya hay 3 investigaciones en curso. Espera a que terminen.",
    )
    expect(tema()).toHaveValue("Algo")
  })
})

describe("NuevaInvestigacion", () => {
  test("shows only the button until it is tapped, then the form", () => {
    render(
      <NuevaInvestigacion abierta={false}>
        <FormularioDeInvestigacion sugerencias={[]} pedir={vi.fn()} />
      </NuevaInvestigacion>,
    )
    expect(screen.queryByLabelText("¿Qué quieres investigar?")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Nueva investigación" }))
    expect(screen.getByLabelText("¿Qué quieres investigar?")).toBeVisible()
    expect(screen.queryByRole("button", { name: "Nueva investigación" })).toBeNull()
  })

  test("starts open when there is nothing to approve and nothing in the list", () => {
    render(
      <NuevaInvestigacion abierta>
        <FormularioDeInvestigacion sugerencias={[]} pedir={vi.fn()} />
      </NuevaInvestigacion>,
    )
    expect(screen.getByLabelText("¿Qué quieres investigar?")).toBeVisible()
    expect(screen.queryByRole("button", { name: "Nueva investigación" })).toBeNull()
  })
})
