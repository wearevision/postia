import { render, screen } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { TarjetaEnCurso } from "@/app/(app)/investigar/en-curso"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const base = { id: "11111111-1111-4111-8111-111111111111", tema: "WR3 y focus groups" }

describe("TarjetaEnCurso", () => {
  test("says a running research is being investigated and that the page updates itself", () => {
    render(<TarjetaEnCurso i={{ ...base, estado: "investigando" }} />)
    expect(screen.getByRole("link", { name: "Investigando: WR3 y focus groups · se actualiza sola" })).toHaveAttribute(
      "href",
      `/investigar/${base.id}`,
    )
  })

  test("a queued research reads the same, since from outside it is just waiting for its report", () => {
    render(<TarjetaEnCurso i={{ ...base, estado: "en_cola" }} />)
    expect(screen.getByRole("link", { name: /^Investigando: WR3 y focus groups/ })).toBeVisible()
  })
})
