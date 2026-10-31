import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { TarjetaDeIdea } from "@/app/(app)/ideas/idea"
import type { IdeaDeSerie } from "@/lib/series/lectura"

const PERFIL = { id: "c-perfil", nombre: "Federico" }
const PAGINA = { id: "c-pagina", nombre: "Página de WAV" }

const PROPUESTA: IdeaDeSerie = {
  id: "i1",
  orden: 1,
  estado: "propuesta",
  gancho: "Los focus groups no mueren",
  resumen: "Tres mitos sobre los focus groups.",
  formato: "carrusel_pdf",
  esqueleto: [
    { tipo: "portada", idea: "El mito" },
    { tipo: "punto", idea: "Lo que dicen los datos" },
    { tipo: "cierre", idea: "Qué hacer" },
  ],
  fuentes: [{ id: "h1", medio: "La Tercera", enlace: "https://latercera.com/x", publicadoEn: "2026-10-20" }],
  cuentaSugerida: PAGINA,
  razon: "Habla de investigación, que es lo de WAV.",
  asignaciones: [],
  pidiendoOtra: false,
}

const APROBADA: IdeaDeSerie = {
  ...PROPUESTA,
  estado: "aprobada",
  asignaciones: [
    {
      id: "a1",
      cuentaId: PAGINA.id,
      cuenta: PAGINA.nombre,
      planeadaPara: "2026-11-04T18:00:00.000Z",
      estado: "por_escribir",
      motivo: null,
      piezaId: null,
    },
    {
      id: "a2",
      cuentaId: PERFIL.id,
      cuenta: PERFIL.nombre,
      planeadaPara: "2026-11-05T14:00:00.000Z",
      estado: "fallo",
      motivo: "Lámina 4: El título pasa las 12 palabras.",
      piezaId: null,
    },
  ],
}

function acciones() {
  return {
    aprobar: vi.fn().mockResolvedValue({ ok: true }),
    descartar: vi.fn().mockResolvedValue({ ok: true }),
    pedirOtra: vi.fn().mockResolvedValue({ ok: true }),
    editar: vi.fn().mockResolvedValue({ ok: true }),
    mover: vi.fn().mockResolvedValue({ ok: true }),
  }
}

function tarjeta(idea: IdeaDeSerie, a = acciones()) {
  render(<TarjetaDeIdea idea={idea} cuentas={[PERFIL, PAGINA]} {...a} />)
  return a
}

describe("TarjetaDeIdea", () => {
  test("shows the hook, summary, format, numbered skeleton, sources and why that account", () => {
    tarjeta(PROPUESTA)
    const card = screen.getByRole("article", { name: "Los focus groups no mueren" })
    expect(card).toHaveAttribute("id", "idea-i1")
    expect(within(card).getByRole("heading", { name: "Los focus groups no mueren" })).toBeVisible()
    expect(within(card).getByText("Tres mitos sobre los focus groups.")).toBeVisible()
    expect(within(card).getByText("Carrusel PDF")).toBeVisible()
    const pasos = within(within(card).getByRole("list", { name: "Esqueleto" })).getAllByRole("listitem")
    expect(pasos.map((p) => p.textContent)).toEqual([
      "Portada: El mito",
      "Idea: Lo que dicen los datos",
      "Cierre: Qué hacer",
    ])
    const fuente = within(card).getByRole("link", { name: "La Tercera · 20 de octubre de 2026" })
    expect(fuente).toHaveAttribute("href", "https://latercera.com/x")
    expect(fuente).toHaveAttribute("target", "_blank")
    expect(fuente).toHaveAttribute("rel", "noopener noreferrer")
    expect(within(card).getByText("Sugerida para Página de WAV")).toBeVisible()
    expect(within(card).getByText("Por qué: Habla de investigación, que es lo de WAV.")).toBeVisible()
  })

  test("a proposal offers the accounts with the suggested one checked, and approves the chosen ones", async () => {
    const a = tarjeta(PROPUESTA)
    expect(screen.getByRole("checkbox", { name: "Página de WAV" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "Federico" })).not.toBeChecked()
    fireEvent.click(screen.getByRole("checkbox", { name: "Federico" }))
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }))
    await waitFor(() => expect(a.aprobar).toHaveBeenCalledWith("i1", [PERFIL.id, PAGINA.id]))
  })

  test("with no account checked it asks for one instead of calling", () => {
    const a = tarjeta(PROPUESTA)
    fireEvent.click(screen.getByRole("checkbox", { name: "Página de WAV" }))
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Elige al menos una cuenta.")
    expect(a.aprobar).not.toHaveBeenCalled()
  })

  test("discards and asks for another", async () => {
    const a = tarjeta(PROPUESTA)
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }))
    await waitFor(() => expect(a.descartar).toHaveBeenCalledWith("i1"))
    fireEvent.click(screen.getByRole("button", { name: "Pedir otra" }))
    await waitFor(() => expect(a.pedirOtra).toHaveBeenCalledWith("i1"))
  })

  test("while another is being looked for, it says so and does not ask twice", () => {
    tarjeta({ ...PROPUESTA, pidiendoOtra: true })
    expect(screen.getByText("Buscando otra idea…")).toBeVisible()
    expect(screen.getByRole("button", { name: "Pedir otra" })).toBeDisabled()
  })

  test("edits the hook and the skeleton as one line per slide", async () => {
    const a = tarjeta(PROPUESTA)
    fireEvent.click(screen.getByRole("button", { name: "Editar" }))
    expect(screen.getByLabelText("Gancho")).toHaveValue("Los focus groups no mueren")
    const esqueleto = screen.getByLabelText("Esqueleto, una línea por lámina")
    expect(esqueleto).toHaveValue("Portada: El mito\nIdea: Lo que dicen los datos\nCierre: Qué hacer")
    fireEvent.change(screen.getByLabelText("Gancho"), { target: { value: "Nuevo gancho" } })
    fireEvent.change(esqueleto, { target: { value: "Portada: A\nCifra: B\nCierre: C" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }))
    await waitFor(() => expect(a.editar).toHaveBeenCalledWith("i1", "Nuevo gancho", "Portada: A\nCifra: B\nCierre: C"))
    await waitFor(() => expect(screen.queryByLabelText("Gancho")).toBeNull())
  })

  test("an error shows in an alert and the buttons are disabled while pending", async () => {
    let terminar: (r: { ok: false; error: string }) => void = () => {}
    const a = acciones()
    a.descartar.mockReturnValue(
      new Promise((listo) => {
        terminar = listo
      }),
    )
    tarjeta(PROPUESTA, a)
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Aprobar" })).toBeDisabled())
    terminar({ ok: false, error: "Esta idea ya no se puede descartar." })
    expect(await screen.findByRole("alert")).toHaveTextContent("Esta idea ya no se puede descartar.")
    expect(screen.getByRole("button", { name: "Aprobar" })).toBeEnabled()
  })

  test("an approved idea shows each slot with its account, date and state; no review buttons", () => {
    tarjeta(APROBADA)
    expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull()
    expect(screen.queryByRole("checkbox")).toBeNull()
    const pagina = screen.getByRole("listitem", { name: "Página de WAV" })
    expect(within(pagina).getByText("miércoles 4 de noviembre, 15:00")).toBeVisible()
    expect(within(pagina).getByText("Por escribir")).toBeVisible()
    const perfil = screen.getByRole("listitem", { name: "Federico" })
    expect(within(perfil).getByText("No salió")).toBeVisible()
    expect(within(perfil).getByText("Lámina 4: El título pasa las 12 palabras.")).toBeVisible()
    expect(within(perfil).queryByRole("button", { name: "Mover fecha" })).toBeNull()
  })

  test("an unwritten slot can be moved to a new date and hour", async () => {
    const a = tarjeta(APROBADA)
    const pagina = screen.getByRole("listitem", { name: "Página de WAV" })
    fireEvent.click(within(pagina).getByRole("button", { name: "Mover fecha" }))
    const fecha = within(pagina).getByLabelText("Nueva fecha")
    expect(fecha).toHaveValue("2026-11-04T15:00")
    fireEvent.change(fecha, { target: { value: "2026-11-10T15:00" } })
    fireEvent.click(within(pagina).getByRole("button", { name: "Guardar fecha" }))
    await waitFor(() => expect(a.mover).toHaveBeenCalledWith("a1", "2026-11-10T18:00:00.000Z"))
  })

  test("a written slot links to its piece", () => {
    tarjeta({
      ...APROBADA,
      asignaciones: [{ ...APROBADA.asignaciones[0], estado: "escrita", piezaId: "p9" }],
    })
    const pagina = screen.getByRole("listitem", { name: "Página de WAV" })
    expect(within(pagina).getByText("Escrita")).toBeVisible()
    expect(within(pagina).getByRole("link", { name: "Ver la pieza" })).toHaveAttribute("href", "/piezas/p9")
  })

  test("a text post's skeleton reads as bare beats", () => {
    tarjeta({ ...PROPUESTA, formato: "texto", esqueleto: [{ idea: "El dato" }, { idea: "La pregunta" }] })
    expect(screen.getByText("Post de texto")).toBeVisible()
    const pasos = within(screen.getByRole("list", { name: "Esqueleto" })).getAllByRole("listitem")
    expect(pasos.map((p) => p.textContent)).toEqual(["El dato", "La pregunta"])
  })

  test("a discarded idea says so and offers nothing", () => {
    tarjeta({ ...PROPUESTA, estado: "descartada" })
    expect(screen.getByText("Descartada")).toBeVisible()
    expect(screen.queryByRole("button")).toBeNull()
  })
})
