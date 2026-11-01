import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { RevisionDeClaude } from "@/app/(app)/piezas/[id]/revision-ia"

describe("RevisionDeClaude", () => {
  test("shows the voice verdict and each finding with its fragment, without blocking", () => {
    render(
      <RevisionDeClaude
        piezaId="p"
        revision={{
          voz: { ok: false, comentario: "Suena a persona" },
          hallazgos: [{ tipo: "cliente", fragmento: "la minera", comentario: "Alude a un cliente confidencial" }],
        }}
        pedirRevision={vi.fn()}
        puedePedir
      />,
    )
    expect(screen.getByRole("heading", { name: "Revisión de Claude" })).toBeVisible()
    expect(screen.getByText("Voz: Suena a persona")).toBeVisible()
    expect(screen.getByText("«la minera»: Alude a un cliente confidencial")).toBeVisible()
    // It shows, it never blocks; the redundant reassurance was cut.
    expect(screen.queryByText("Puedes firmar igual: tú decides.")).toBeNull()
  })

  test("offers a review when the version has none", async () => {
    const pedirRevision = vi.fn(async () => ({ ok: true as const }))
    render(<RevisionDeClaude piezaId="p" revision={null} pedirRevision={pedirRevision} puedePedir />)
    expect(screen.getByText("Esta versión no tiene revisión de Claude.")).toBeVisible()
    fireEvent.click(screen.getByRole("button", { name: "Revisar con Claude" }))
    await waitFor(() => expect(pedirRevision).toHaveBeenCalledWith("p"))
  })
})
