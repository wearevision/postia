import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { EditorDeCarrusel } from "@/app/(app)/piezas/carrusel/editor"
import { aBorrador, deBorrador } from "@/lib/plantillas/campos"
import { carruselInicial, PERFIL_DE_FEDERICO } from "@/lib/plantillas/iniciales"
import type { IdDeTema } from "@/lib/plantillas/temas"

const router = { push: vi.fn(), refresh: vi.fn() }
vi.mock("next/navigation", () => ({ useRouter: () => router }))

const WAV = { id: "11111111-1111-4111-8111-111111111111", nombre: "Página de WAV", voz: "nosotros" as const }
const FEDE = { id: "22222222-2222-4222-8222-222222222222", nombre: "Perfil de Federico", voz: "yo" as const }
const PIEZA = "33333333-3333-4333-8333-333333333333"

const laminas = () => screen.getAllByRole("group", { name: /^Lámina \d+/ })
const leyendas = () => laminas().map((l) => l.querySelector("legend")?.textContent)

type Pedir = (entrada: unknown) => Promise<{ ok: true; pedidoId: string } | { ok: false; error: string }>

function montar(opciones: { cuenta?: typeof WAV | typeof FEDE; tema?: IdDeTema; pedir?: Pedir } = {}) {
  const cuenta = opciones.cuenta ?? WAV
  const familia = cuenta.voz === "nosotros" ? "wav" : "personal"
  const diseno = carruselInicial(familia)
  const pedir = opciones.pedir ?? vi.fn<Pedir>(async () => ({ ok: true, pedidoId: "p1" }))
  render(
    <EditorDeCarrusel
      cuentas={[WAV, FEDE]}
      pedir={pedir}
      inicial={{
        piezaId: PIEZA,
        cuentaId: cuenta.id,
        tema: opciones.tema ?? (cuenta.voz === "nosotros" ? "wav-noche" : "personal-claro"),
        titulo: "Doc",
        texto: "Post",
        diseno,
      }}
    />,
  )
  return { pedir, diseno }
}

describe("EditorDeCarrusel", () => {
  beforeEach(() => {
    router.push.mockReset()
    router.refresh.mockReset()
  })

  test("the account is fixed to the piece's, and it offers all 9 themes with the account's own first", () => {
    montar({ cuenta: FEDE, tema: "personal-arena" })
    expect(screen.getByText("Perfil de Federico")).toBeVisible()
    expect(screen.queryByRole("combobox", { name: "Cuenta" })).toBeNull()
    const diseno = within(screen.getByRole("group", { name: "Diseño" }))
    expect(diseno.getAllByRole("radio").map((r) => r.closest("label")?.textContent)).toEqual([
      "Personal claro",
      "Personal grafito",
      "Personal arena",
      "WR3 oscura",
      "WR3 papel",
      "WR3 magenta",
      "WAV noche",
      "WAV papel",
      "WAV degradado",
    ])
    expect(screen.getByRole("radio", { name: "Personal arena" })).toBeChecked()
  })

  test("WAV's page also offers all 9 themes, its own first", () => {
    montar()
    const diseno = within(screen.getByRole("group", { name: "Diseño" }))
    const nombres = diseno.getAllByRole("radio").map((r) => r.closest("label")?.textContent)
    expect(nombres).toHaveLength(9)
    expect(nombres.slice(0, 6)).toEqual([
      "WR3 oscura",
      "WR3 papel",
      "WR3 magenta",
      "WAV noche",
      "WAV papel",
      "WAV degradado",
    ])
  })

  test("prefills the slides, and the closing link follows the family when the theme changes", () => {
    montar()
    expect(laminas()).toHaveLength(carruselInicial("wav").laminas.length)
    const cierre = () => laminas().at(-1) as HTMLElement
    expect(within(cierre()).getByLabelText("Enlace")).toHaveValue("wearevision.cl")
    fireEvent.click(screen.getByRole("radio", { name: "WR3 oscura" }))
    expect(within(cierre()).getByLabelText("Enlace")).toHaveValue("wr3.wearevision.cl")
    expect(within(cierre()).getByLabelText("Título")).toHaveValue("Lee la guía completa")
  })

  test("a personal piece closes with the profile link", () => {
    montar({ cuenta: FEDE })
    expect(within(laminas().at(-1) as HTMLElement).getByLabelText("Enlace")).toHaveValue(PERFIL_DE_FEDERICO)
    expect(screen.getByLabelText("Antetítulo")).toHaveValue("Plantilla · Carrusel personal")
  })

  test("a link Federico edited stays when the family changes", () => {
    montar()
    const cierre = laminas().at(-1) as HTMLElement
    fireEvent.change(within(cierre).getByLabelText("Enlace"), { target: { value: "wearevision.cl/guia" } })
    fireEvent.click(screen.getByRole("radio", { name: "WR3 oscura" }))
    expect(within(laminas().at(-1) as HTMLElement).getByLabelText("Enlace")).toHaveValue("wearevision.cl/guia")
  })

  test("adds a slide before the closing one, reorders, and never removes the cover or the closing", () => {
    montar()
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
    // Some twenty role queries over the whole form: under the parallel suite they pass the default 5 s.
  }, 15_000)

  test("sends the piece, the account, the theme, the texts and the slides, and shows a refusal", async () => {
    const pedir = vi.fn<Pedir>(async () => ({ ok: false, error: "Lámina 2: El título pasa las 12 palabras." }))
    const { diseno } = montar({ pedir })
    fireEvent.change(screen.getByLabelText("Título del documento"), { target: { value: "Guía de montaje" } })
    fireEvent.change(screen.getByLabelText("Texto del post"), { target: { value: "El post" } })
    fireEvent.click(screen.getByRole("button", { name: "Armar carrusel" }))
    await waitFor(() =>
      expect(pedir).toHaveBeenCalledWith({
        cuentaId: WAV.id,
        piezaId: PIEZA,
        tema: "wav-noche",
        titulo: "Guía de montaje",
        texto: "El post",
        diseno: {
          antetitulo: diseno.antetitulo,
          laminas: diseno.laminas.map((l) => deBorrador(l.tipo, aBorrador(l))),
        },
      }),
    )
    expect(await screen.findByRole("alert")).toHaveTextContent("Lámina 2: El título pasa las 12 palabras.")
    expect(router.push).not.toHaveBeenCalled()
  })

  test("a data slide offers an optional source, which travels with the slide; the cover has none", async () => {
    const pedir = vi.fn<Pedir>(async () => ({ ok: false, error: "x" }))
    montar({ pedir })
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

  test("prefills everything and returns to the piece once queued", async () => {
    const { pedir } = montar({ cuenta: FEDE, tema: "personal-arena" })
    expect(screen.getByRole("radio", { name: "Personal arena" })).toBeChecked()
    expect(screen.getByLabelText("Título del documento")).toHaveValue("Doc")
    expect(screen.getByLabelText("Texto del post")).toHaveValue("Post")
    expect(screen.getByText(/la firma se cae/)).toBeVisible()
    fireEvent.click(screen.getByRole("button", { name: "Armar carrusel" }))
    await waitFor(() => expect(pedir).toHaveBeenCalledWith(expect.objectContaining({ piezaId: PIEZA })))
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/piezas/${PIEZA}`))
  })
})
