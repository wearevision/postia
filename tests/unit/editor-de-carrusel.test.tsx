import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { EditorDeCarrusel } from "@/app/(app)/piezas/carrusel/editor"
import { aBorrador, deBorrador } from "@/lib/plantillas/campos"
import { carruselInicial, PERFIL_DE_FEDERICO } from "@/lib/plantillas/iniciales"

const router = { push: vi.fn(), refresh: vi.fn() }
vi.mock("next/navigation", () => ({ useRouter: () => router }))

const WAV = { id: "11111111-1111-4111-8111-111111111111", nombre: "Página de WAV", voz: "nosotros" as const }
const FEDE = { id: "22222222-2222-4222-8222-222222222222", nombre: "Perfil de Federico", voz: "yo" as const }
const PIEZA = "33333333-3333-4333-8333-333333333333"

const laminas = () => screen.getAllByRole("group", { name: /^Lámina \d+/ })
const leyendas = () => laminas().map((l) => l.querySelector("legend")?.textContent)

describe("EditorDeCarrusel", () => {
  beforeEach(() => {
    router.push.mockReset()
    router.refresh.mockReset()
  })

  test("a personal account shows only the personal themes and resets the theme to personal-claro", () => {
    render(<EditorDeCarrusel cuentas={[WAV, FEDE]} pedir={vi.fn()} />)
    expect(screen.getByRole("radio", { name: "WAV noche" })).toBeChecked()
    expect(screen.getByRole("radio", { name: "WR3 papel" })).toBeVisible()
    fireEvent.change(screen.getByLabelText("Cuenta"), { target: { value: FEDE.id } })
    const diseno = within(screen.getByRole("group", { name: "Diseño" }))
    expect(diseno.getAllByRole("radio")).toHaveLength(3)
    for (const nombre of ["Personal claro", "Personal grafito", "Personal arena"])
      expect(diseno.getByRole("radio", { name: nombre })).toBeVisible()
    expect(screen.getByRole("radio", { name: "Personal claro" })).toBeChecked()
  })

  test("starts from the family's default slides, and the closing link follows the family", () => {
    render(<EditorDeCarrusel cuentas={[WAV, FEDE]} pedir={vi.fn()} />)
    expect(laminas()).toHaveLength(carruselInicial("wav").laminas.length)
    const cierre = () => laminas().at(-1) as HTMLElement
    expect(within(cierre()).getByLabelText("Enlace")).toHaveValue("wearevision.cl")
    fireEvent.click(screen.getByRole("radio", { name: "WR3 oscura" }))
    expect(within(cierre()).getByLabelText("Enlace")).toHaveValue("wr3.wearevision.cl")
    expect(within(cierre()).getByLabelText("Título")).toHaveValue("Lee la guía completa")
    fireEvent.change(screen.getByLabelText("Cuenta"), { target: { value: FEDE.id } })
    expect(within(cierre()).getByLabelText("Enlace")).toHaveValue(PERFIL_DE_FEDERICO)
    expect(screen.getByLabelText("Antetítulo")).toHaveValue("Plantilla · Carrusel personal")
  })

  test("a link Federico edited stays when the family changes", () => {
    render(<EditorDeCarrusel cuentas={[WAV, FEDE]} pedir={vi.fn()} />)
    const cierre = laminas().at(-1) as HTMLElement
    fireEvent.change(within(cierre).getByLabelText("Enlace"), { target: { value: "wearevision.cl/guia" } })
    fireEvent.click(screen.getByRole("radio", { name: "WR3 oscura" }))
    expect(within(laminas().at(-1) as HTMLElement).getByLabelText("Enlace")).toHaveValue("wearevision.cl/guia")
  })

  test("adds a slide before the closing one, reorders, and never removes the cover or the closing", () => {
    render(<EditorDeCarrusel cuentas={[WAV]} pedir={vi.fn()} />)
    const antes = laminas().length
    fireEvent.change(screen.getByLabelText("Tipo de lámina"), { target: { value: "cifra" } })
    fireEvent.click(screen.getByRole("button", { name: "Agregar lámina" }))
    expect(laminas()).toHaveLength(antes + 1)
    expect(leyendas().at(-2)).toBe(`Lámina ${antes} · Cifra`)
    expect(leyendas().at(-1)).toBe(`Lámina ${antes + 1} · Cierre`)

    fireEvent.click(screen.getByRole("button", { name: `Subir la lámina ${antes}` }))
    expect(leyendas()[antes - 2]).toBe(`Lámina ${antes - 1} · Cifra`)
    fireEvent.click(screen.getByRole("button", { name: `Bajar la lámina ${antes - 1}` }))
    expect(leyendas()[antes - 1]).toBe(`Lámina ${antes} · Cifra`)

    const ultima = laminas().length
    expect(screen.getByRole("button", { name: "Quitar la lámina 1" })).toBeDisabled()
    expect(screen.getByRole("button", { name: `Quitar la lámina ${ultima}` })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Bajar la lámina 1" })).toBeDisabled()
    expect(screen.getByRole("button", { name: `Subir la lámina ${ultima}` })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Quitar la lámina 2" }))
    expect(laminas()).toHaveLength(antes)
  })

  test("sends the account, the theme, the texts and the slides, and shows a refusal", async () => {
    const pedir = vi.fn(async () => ({ ok: false as const, error: "Lámina 2: El título pasa las 12 palabras." }))
    render(<EditorDeCarrusel cuentas={[WAV]} pedir={pedir} />)
    const inicial = carruselInicial("wav")
    expect(screen.getByLabelText("Título del documento")).toHaveValue(
      inicial.laminas[0]?.tipo === "portada" ? inicial.laminas[0].titulo : "",
    )
    fireEvent.change(screen.getByLabelText("Título del documento"), { target: { value: "Guía de montaje" } })
    fireEvent.change(screen.getByLabelText("Texto del post"), { target: { value: "El post" } })
    fireEvent.click(screen.getByRole("button", { name: "Armar carrusel" }))
    await waitFor(() =>
      expect(pedir).toHaveBeenCalledWith({
        cuentaId: WAV.id,
        piezaId: null,
        tema: "wav-noche",
        titulo: "Guía de montaje",
        texto: "El post",
        diseno: {
          antetitulo: inicial.antetitulo,
          laminas: inicial.laminas.map((l) => deBorrador(l.tipo, aBorrador(l))),
        },
      }),
    )
    expect(await screen.findByRole("alert")).toHaveTextContent("Lámina 2: El título pasa las 12 palabras.")
  })

  test("a data slide offers an optional source, which travels with the slide; the cover has none", async () => {
    const pedir = vi.fn(async () => ({ ok: false as const, error: "x" }))
    render(<EditorDeCarrusel cuentas={[WAV]} pedir={pedir} />)
    expect(within(laminas()[0] as HTMLElement).queryByLabelText("Fuente (opcional)")).toBeNull()
    const segunda = laminas()[1] as HTMLElement
    const campo = within(segunda).getByLabelText("Fuente (opcional)")
    expect(campo).toHaveAccessibleDescription("Medio y año, como «Field Methods, 2006».")
    fireEvent.change(campo, { target: { value: "Field Methods, 2006" } })
    fireEvent.change(screen.getByLabelText("Texto del post"), { target: { value: "El post" } })
    fireEvent.click(screen.getByRole("button", { name: "Armar carrusel" }))
    await waitFor(() => expect(pedir).toHaveBeenCalled())
    const [pedido] = pedir.mock.calls[0] as unknown as [{ diseno: { laminas: Record<string, unknown>[] } }]
    expect(pedido.diseno.laminas[1]).toMatchObject({ fuente: "Field Methods, 2006" })
    expect(pedido.diseno.laminas[2]).not.toHaveProperty("fuente")
  })

  test("a queued new carousel goes back to the list of recent carousels", async () => {
    const pedir = vi.fn(async () => ({ ok: true as const, pedidoId: "p1" }))
    render(<EditorDeCarrusel cuentas={[WAV]} pedir={pedir} />)
    fireEvent.change(screen.getByLabelText("Texto del post"), { target: { value: "El post" } })
    fireEvent.click(screen.getByRole("button", { name: "Armar carrusel" }))
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/piezas/carrusel"))
    expect(router.refresh).toHaveBeenCalled()
  })

  test("after queuing a new carousel the whole form starts over from the chosen family's defaults", async () => {
    const pedir = vi.fn(async () => ({ ok: true as const, pedidoId: "p1" }))
    render(<EditorDeCarrusel cuentas={[WAV]} pedir={pedir} />)
    fireEvent.click(screen.getByRole("radio", { name: "WR3 oscura" }))
    const wr3 = carruselInicial("wr3")
    fireEvent.change(screen.getByLabelText("Antetítulo"), { target: { value: "Otro antetítulo" } })
    fireEvent.change(screen.getByLabelText("Título del documento"), { target: { value: "Guía propia" } })
    fireEvent.change(within(laminas()[1] as HTMLElement).getByLabelText("Título"), { target: { value: "Cambiado" } })
    fireEvent.click(screen.getByRole("button", { name: "Quitar la lámina 3" }))
    fireEvent.change(screen.getByLabelText("Texto del post"), { target: { value: "El post" } })
    fireEvent.click(screen.getByRole("button", { name: "Armar carrusel" }))
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/piezas/carrusel"))

    expect(screen.getByRole("radio", { name: "WR3 oscura" })).toBeChecked()
    expect(laminas()).toHaveLength(wr3.laminas.length)
    expect(within(laminas()[1] as HTMLElement).getByLabelText("Título")).toHaveValue(
      wr3.laminas[1] && "titulo" in wr3.laminas[1] ? wr3.laminas[1].titulo : "",
    )
    expect(screen.getByLabelText("Antetítulo")).toHaveValue(wr3.antetitulo)
    expect(screen.getByLabelText("Título del documento")).toHaveValue(
      wr3.laminas[0]?.tipo === "portada" ? wr3.laminas[0].titulo : "",
    )
    expect(screen.getByLabelText("Texto del post")).toHaveValue("")
  })

  test("edit mode fixes the account, prefills everything and returns to the piece", async () => {
    const pedir = vi.fn(async () => ({ ok: true as const, pedidoId: "p1" }))
    const diseno = carruselInicial("personal")
    diseno.antetitulo = "Mi antetítulo"
    render(
      <EditorDeCarrusel
        cuentas={[WAV, FEDE]}
        pedir={pedir}
        inicial={{ piezaId: PIEZA, cuentaId: FEDE.id, tema: "personal-arena", titulo: "Doc", texto: "Post", diseno }}
      />,
    )
    expect(screen.getByLabelText("Cuenta")).toBeDisabled()
    expect(screen.getByLabelText("Cuenta")).toHaveValue(FEDE.id)
    expect(screen.getByRole("radio", { name: "Personal arena" })).toBeChecked()
    expect(screen.getByLabelText("Título del documento")).toHaveValue("Doc")
    expect(screen.getByLabelText("Texto del post")).toHaveValue("Post")
    expect(screen.getByLabelText("Antetítulo")).toHaveValue("Mi antetítulo")
    expect(screen.getByText(/la firma se cae/)).toBeVisible()
    fireEvent.click(screen.getByRole("button", { name: "Armar carrusel" }))
    await waitFor(() => expect(pedir).toHaveBeenCalledWith(expect.objectContaining({ piezaId: PIEZA })))
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/piezas/${PIEZA}`))
  })
})
