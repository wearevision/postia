import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { AprobarSerie, SerieEnCurso, TarjetaDeIdea } from "@/app/(app)/ideas/idea"
import type { IdeaDeSerie, IdeaSuelta } from "@/lib/series/lectura"

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

const CRUCE: IdeaSuelta = {
  ...PROPUESTA,
  id: "c1",
  gancho: "Lo que el retail le enseña a la minería",
  formato: "texto",
  esqueleto: [{ idea: "Lo que dice uno" }, { idea: "Lo que dice el otro" }],
  origen: "cruce",
  creadaEn: "2026-11-01T20:00:00.000Z",
  fuentes: [
    {
      id: "h1",
      medio: "La Tercera",
      enlace: "https://latercera.com/x",
      publicadoEn: "2026-10-20",
      resumen: "El retail mide la experiencia en cada visita.",
    },
    {
      id: "h2",
      medio: "Diario Financiero",
      enlace: "https://df.cl/y",
      publicadoEn: null,
      resumen: "La minería empieza a medir a sus comunidades.",
    },
  ],
}

const DEL_DOMINGO: IdeaSuelta = { ...CRUCE, id: "d1", gancho: "Una idea suelta", origen: "domingo", fuentes: [] }

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

function verDetalle() {
  fireEvent.click(screen.getByRole("button", { name: "Ver detalle" }))
}

afterEach(() => {
  vi.useRealTimers()
})

describe("TarjetaDeIdea", () => {
  test("shows the hook, summary, format, numbered skeleton, sources and why that account", () => {
    tarjeta(PROPUESTA)
    verDetalle()
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
    vi.useFakeTimers()
    const a = tarjeta(PROPUESTA)
    verDetalle()
    expect(screen.getByRole("checkbox", { name: "Página de WAV" })).toBeChecked()
    expect(screen.getByRole("checkbox", { name: "Federico" })).not.toBeChecked()
    fireEvent.click(screen.getByRole("checkbox", { name: "Federico" }))
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }))
    await act(() => vi.advanceTimersByTimeAsync(10_000))
    expect(a.aprobar).toHaveBeenCalledWith("i1", [PERFIL.id, PAGINA.id])
  })

  test("with no account checked it asks for one instead of calling", () => {
    const a = tarjeta(PROPUESTA)
    verDetalle()
    fireEvent.click(screen.getByRole("checkbox", { name: "Página de WAV" }))
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Elige al menos una cuenta.")
    expect(a.aprobar).not.toHaveBeenCalled()
  })

  test("discards and asks for another", async () => {
    const a = tarjeta(PROPUESTA)
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }))
    await waitFor(() => expect(a.descartar).toHaveBeenCalledWith("i1"))
    verDetalle()
    // The buttons stay disabled until the discard settles; a click before that is ignored.
    await waitFor(() => expect(screen.getByRole("button", { name: "Pedir otra" })).toBeEnabled())
    fireEvent.click(screen.getByRole("button", { name: "Pedir otra" }))
    await waitFor(() => expect(a.pedirOtra).toHaveBeenCalledWith("i1"))
  })

  test("while another is being looked for, it says so and does not ask twice", () => {
    tarjeta({ ...PROPUESTA, pidiendoOtra: true })
    verDetalle()
    expect(screen.getByText("Buscando otra idea…")).toBeVisible()
    expect(screen.getByRole("button", { name: "Pedir otra" })).toBeDisabled()
  })

  test("edits the hook and the skeleton as one line per slide", async () => {
    const a = tarjeta(PROPUESTA)
    verDetalle()
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

  test("while editing, only the form shows: the detail is not repeated above it", () => {
    tarjeta(PROPUESTA)
    verDetalle()
    fireEvent.click(screen.getByRole("button", { name: "Editar" }))
    expect(screen.getByLabelText("Gancho")).toBeVisible()
    expect(screen.queryByText("Tres mitos sobre los focus groups.")).toBeNull()
    expect(screen.queryByRole("list", { name: "Esqueleto" })).toBeNull()
  })

  test("an error shows in an alert and the buttons are disabled while pending", async () => {
    // The test holds the action's promise and settles it itself: nothing depends on how fast the suite runs.
    const descarte = Promise.withResolvers<{ ok: false; error: string }>()
    const a = acciones()
    a.descartar.mockReturnValue(descarte.promise)
    tarjeta(PROPUESTA, a)
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Descartar" }))
    })
    expect(a.descartar).toHaveBeenCalledWith("i1")
    expect(screen.getByRole("button", { name: "Aprobar" })).toBeDisabled()
    expect(screen.queryByRole("alert")).toBeNull()
    await act(async () => {
      descarte.resolve({ ok: false, error: "Esta idea ya no se puede descartar." })
      await descarte.promise
    })
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Esta idea ya no se puede descartar.")
      expect(screen.getByRole("button", { name: "Aprobar" })).toBeEnabled()
    })
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
    verDetalle()
    const pasos = within(screen.getByRole("list", { name: "Esqueleto" })).getAllByRole("listitem")
    expect(pasos.map((p) => p.textContent)).toEqual(["El dato", "La pregunta"])
  })

  test("a discarded idea says so and only offers to read its detail, with no actions", () => {
    tarjeta({ ...PROPUESTA, estado: "descartada" })
    expect(screen.getByText("Descartada")).toBeVisible()
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Ver detalle"])
    verDetalle()
    expect(screen.getByText("Tres mitos sobre los focus groups.")).toBeVisible()
    expect(within(screen.getByRole("list", { name: "Esqueleto" })).getAllByRole("listitem")).toHaveLength(3)
    expect(screen.getByRole("link", { name: "La Tercera · 20 de octubre de 2026" })).toBeVisible()
    expect(screen.getByText("Por qué: Habla de investigación, que es lo de WAV.")).toBeVisible()
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Ocultar detalle"])
  })

  test("a cross shows «Nace de:» with both sources, each with its outlet, date, link and excerpt", () => {
    tarjeta(CRUCE)
    verDetalle()
    const card = screen.getByRole("article", { name: "Lo que el retail le enseña a la minería" })
    const origen = within(card).getByRole("list", { name: "Nace de:" })
    const fuentes = within(origen).getAllByRole("listitem")
    expect(fuentes).toHaveLength(2)
    const tercera = within(fuentes[0] as HTMLElement).getByRole("link", { name: "La Tercera · 20 de octubre de 2026" })
    expect(tercera).toHaveAttribute("href", "https://latercera.com/x")
    expect(tercera).toHaveAttribute("target", "_blank")
    expect(tercera).toHaveAttribute("rel", "noopener noreferrer")
    expect(within(fuentes[0] as HTMLElement).getByText("El retail mide la experiencia en cada visita.")).toBeVisible()
    expect(within(fuentes[1] as HTMLElement).getByRole("link", { name: "Diario Financiero" })).toHaveAttribute(
      "href",
      "https://df.cl/y",
    )
    expect(within(fuentes[1] as HTMLElement).getByText("La minería empieza a medir a sus comunidades.")).toBeVisible()
    expect(within(card).queryByRole("list", { name: "Fuentes" })).toBeNull()
    expect(within(card).queryByText("Idea del domingo")).toBeNull()
  })

  test("a Sunday idea says so", () => {
    tarjeta(DEL_DOMINGO)
    const card = screen.getByRole("article", { name: "Una idea suelta" })
    expect(within(card).getByText("Idea del domingo")).toBeVisible()
    verDetalle()
    expect(within(card).queryByRole("list", { name: "Nace de:" })).toBeNull()
  })

  test("a cross is approved, discarded, edited and replaced like a series idea", async () => {
    vi.useFakeTimers()
    const a = tarjeta(CRUCE)
    verDetalle()
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }))
    await act(() => vi.advanceTimersByTimeAsync(10_000))
    expect(a.aprobar).toHaveBeenCalledWith("c1", [PAGINA.id])
    vi.useRealTimers()
    const habilitado = (nombre: string) =>
      waitFor(() => expect(screen.getByRole("button", { name: nombre })).toBeEnabled())
    await habilitado("Pedir otra")
    fireEvent.click(screen.getByRole("button", { name: "Pedir otra" }))
    await waitFor(() => expect(a.pedirOtra).toHaveBeenCalledWith("c1"))
    await habilitado("Descartar")
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }))
    await waitFor(() => expect(a.descartar).toHaveBeenCalledWith("c1"))
    await habilitado("Editar")
    fireEvent.click(screen.getByRole("button", { name: "Editar" }))
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }))
    await waitFor(() =>
      expect(a.editar).toHaveBeenCalledWith(
        "c1",
        "Lo que el retail le enseña a la minería",
        "Lo que dice uno\nLo que dice el otro",
      ),
    )
  })
})

describe("compact card", () => {
  test("shows the hook, format, account and the two decisions; the rest stays folded", () => {
    tarjeta(PROPUESTA)
    expect(screen.getByRole("heading", { name: "Los focus groups no mueren" })).toBeInTheDocument()
    expect(screen.getByText("Carrusel PDF")).toBeVisible()
    expect(screen.getByRole("button", { name: "Página de WAV" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Aprobar" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Descartar" })).toBeInTheDocument()
    expect(screen.queryByRole("list", { name: "Esqueleto" })).not.toBeInTheDocument()
    expect(screen.queryByText("Tres mitos sobre los focus groups.")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument()
    expect(screen.queryByRole("group", { name: "Cuentas" })).not.toBeInTheDocument()
  })

  test("Ver detalle opens the beats, sources and the rest of the actions, and Ocultar detalle folds them", () => {
    tarjeta(PROPUESTA)
    verDetalle()
    expect(screen.getByRole("list", { name: "Esqueleto" })).toBeInTheDocument()
    expect(screen.getByRole("list", { name: "Fuentes" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Pedir otra" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Ocultar detalle" }))
    expect(screen.queryByRole("list", { name: "Esqueleto" })).not.toBeInTheDocument()
  })

  test("the account chip names the chosen accounts and opens the account choice", () => {
    tarjeta(PROPUESTA)
    fireEvent.click(screen.getByRole("button", { name: "Página de WAV" }))
    expect(screen.getByRole("group", { name: "Cuentas" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("checkbox", { name: "Federico" }))
    expect(screen.getByRole("button", { name: "Federico, Página de WAV" })).toBeInTheDocument()
  })

  test("an approved idea stays compact but keeps its slots visible", () => {
    tarjeta(APROBADA)
    expect(screen.queryByRole("list", { name: "Esqueleto" })).not.toBeInTheDocument()
    expect(screen.getByRole("listitem", { name: "Página de WAV" })).toBeVisible()
    verDetalle()
    expect(screen.getByRole("list", { name: "Esqueleto" })).toBeInTheDocument()
  })

  test("during the countdown the folded card cannot discard or change accounts either", () => {
    vi.useFakeTimers()
    tarjeta(PROPUESTA)
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }))
    expect(screen.getByRole("button", { name: "Descartar" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Página de WAV" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))
    expect(screen.getByRole("button", { name: "Descartar" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Página de WAV" })).toBeEnabled()
  })
})

describe("during the approval countdown", () => {
  test("the other actions wait, so a discard can never follow an approval already on its way", async () => {
    vi.useFakeTimers()
    tarjeta(PROPUESTA)
    verDetalle()
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }))
    for (const nombre of ["Editar", "Pedir otra", "Descartar"]) {
      expect(screen.getByRole("button", { name: nombre })).toBeDisabled()
    }
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))
    for (const nombre of ["Editar", "Pedir otra", "Descartar"]) {
      expect(screen.getByRole("button", { name: nombre })).toBeEnabled()
    }
  })
})

describe("the accounts during the countdown", () => {
  test("cannot change once the approval was captured, and can again after Deshacer", () => {
    vi.useFakeTimers()
    tarjeta(PROPUESTA)
    verDetalle()
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }))
    expect(screen.getByRole("group", { name: "Cuentas" })).toBeDisabled()
    expect(screen.getByRole("checkbox", { name: "Federico" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))
    expect(screen.getByRole("group", { name: "Cuentas" })).toBeEnabled()
  })
})

describe("AprobarSerie", () => {
  test("asks to confirm with the number of pieces and the cost before approving", async () => {
    const aprobar = vi.fn(async () => ({ ok: true as const }))
    render(<AprobarSerie investigacionId="inv1" formatos={["texto", "carrusel_pdf"]} aprobar={aprobar} />)
    fireEvent.click(screen.getByRole("button", { name: "Aprobar la serie" }))
    expect(aprobar).not.toHaveBeenCalled()
    expect(screen.getByText("Claude escribe 2 piezas en unos minutos. Cuesta cerca de US$0,40.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }))
    await waitFor(() => expect(aprobar).toHaveBeenCalledWith("inv1"))
  })

  test("cancel goes back without approving", () => {
    const aprobar = vi.fn(async () => ({ ok: true as const }))
    render(<AprobarSerie investigacionId="inv1" formatos={["texto"]} aprobar={aprobar} />)
    fireEvent.click(screen.getByRole("button", { name: "Aprobar la serie" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(screen.getByRole("button", { name: "Aprobar la serie" })).toBeInTheDocument()
    expect(aprobar).not.toHaveBeenCalled()
  })
})

describe("a series while one of its cards counts down", () => {
  test("blocks approving the whole series until the countdown ends or is undone", () => {
    vi.useFakeTimers()
    const a = acciones()
    render(
      <SerieEnCurso>
        <AprobarSerie
          investigacionId="inv1"
          formatos={["texto"]}
          aprobar={vi.fn(async () => ({ ok: true as const }))}
        />
        <TarjetaDeIdea idea={PROPUESTA} cuentas={[PERFIL, PAGINA]} {...a} />
      </SerieEnCurso>,
    )
    expect(screen.getByRole("button", { name: "Aprobar la serie" })).toBeEnabled()
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }))
    expect(screen.getByRole("button", { name: "Aprobar la serie" })).toBeDisabled()
    expect(screen.getByText("Espera a que termine la aprobación en curso.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))
    expect(screen.getByRole("button", { name: "Aprobar la serie" })).toBeEnabled()
    expect(screen.queryByText("Espera a que termine la aprobación en curso.")).not.toBeInTheDocument()
  })

  test("also disables Confirmar when the countdown starts after opening the confirmation", () => {
    vi.useFakeTimers()
    render(
      <SerieEnCurso>
        <AprobarSerie
          investigacionId="inv1"
          formatos={["texto"]}
          aprobar={vi.fn(async () => ({ ok: true as const }))}
        />
        <TarjetaDeIdea idea={PROPUESTA} cuentas={[PERFIL, PAGINA]} {...acciones()} />
      </SerieEnCurso>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Aprobar la serie" }))
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }))
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled()
    expect(screen.getByText("Espera a que termine la aprobación en curso.")).toBeInTheDocument()
  })

  test("a card outside any series works as before", () => {
    vi.useFakeTimers()
    tarjeta(PROPUESTA)
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }))
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeInTheDocument()
  })
})

describe("approving one idea", () => {
  test("waits 10 seconds before approving, with a way to undo", async () => {
    vi.useFakeTimers()
    const a = tarjeta(PROPUESTA)
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }))
    expect(screen.getByText("Se aprueba en 10 s. Si sales antes, no se aprueba.")).toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(9_900))
    expect(a.aprobar).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(100))
    expect(a.aprobar).toHaveBeenCalledWith("i1", ["c-pagina"])
  })

  test("Deshacer cancels it for good", async () => {
    vi.useFakeTimers()
    const a = tarjeta(PROPUESTA)
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }))
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }))
    await act(() => vi.advanceTimersByTimeAsync(20_000))
    expect(a.aprobar).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Aprobar" })).toBeInTheDocument()
  })

  test("sending the app to the background cancels it, so coming back never approves without the 10 s on screen", async () => {
    vi.useFakeTimers()
    const a = tarjeta(PROPUESTA)
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }))
    const original = Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState")
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" })
    try {
      fireEvent(document, new Event("visibilitychange"))
      await act(() => vi.advanceTimersByTimeAsync(20_000))
    } finally {
      Reflect.deleteProperty(document, "visibilityState")
      if (original) Object.defineProperty(Document.prototype, "visibilityState", original)
    }
    expect(a.aprobar).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Aprobar" })).toBeInTheDocument()
  })

  test("becoming visible again does not cancel a countdown", async () => {
    vi.useFakeTimers()
    const a = tarjeta(PROPUESTA)
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }))
    fireEvent(document, new Event("visibilitychange"))
    await act(() => vi.advanceTimersByTimeAsync(10_000))
    expect(a.aprobar).toHaveBeenCalledOnce()
  })

  test("pagehide cancels it too", async () => {
    vi.useFakeTimers()
    const a = tarjeta(PROPUESTA)
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }))
    fireEvent(window, new Event("pagehide"))
    await act(() => vi.advanceTimersByTimeAsync(20_000))
    expect(a.aprobar).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Aprobar" })).toBeInTheDocument()
  })

  test("removes its page listeners on unmount", () => {
    const quitarDocumento = vi.spyOn(document, "removeEventListener")
    const quitarVentana = vi.spyOn(window, "removeEventListener")
    const { unmount } = render(<TarjetaDeIdea idea={PROPUESTA} cuentas={[PERFIL, PAGINA]} {...acciones()} />)
    unmount()
    expect(quitarDocumento).toHaveBeenCalledWith("visibilitychange", expect.any(Function))
    expect(quitarVentana).toHaveBeenCalledWith("pagehide", expect.any(Function))
    vi.restoreAllMocks()
  })

  test("leaving the page before the countdown ends approves nothing", async () => {
    vi.useFakeTimers()
    const a = acciones()
    const { unmount } = render(<TarjetaDeIdea idea={PROPUESTA} cuentas={[PERFIL, PAGINA]} {...a} />)
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }))
    unmount()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(a.aprobar).not.toHaveBeenCalled()
  })
})
