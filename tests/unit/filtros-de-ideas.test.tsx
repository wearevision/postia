import { render, screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { Filtros } from "@/app/(app)/ideas/filtros"

const CONTEOS = { propuesta: 6, aprobada: 3, descartada: 1 }

describe("Filtros", () => {
  test("each chip shows how many ideas it holds, «Todas» being the sum", () => {
    render(<Filtros serie={undefined} estado="propuesta" conteos={CONTEOS} />)
    expect(screen.getByRole("link", { name: "Todas (10)" })).toHaveAttribute("href", "/ideas?estado=todas")
    expect(screen.getByRole("link", { name: "Por revisar (6)" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Aprobadas (3)" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Descartadas (1)" })).toBeInTheDocument()
  })

  test("the active chip is the current page and takes the accent of the active tab in the bottom bar", () => {
    render(<Filtros serie={undefined} estado="aprobada" conteos={CONTEOS} />)
    const activo = screen.getByRole("link", { name: "Aprobadas (3)" })
    expect(activo).toHaveAttribute("aria-current", "page")
    expect(activo).toHaveClass(
      "aria-[current=page]:text-primario",
      "aria-[current=page]:font-semibold",
      "aria-[current=page]:shadow-hundido",
    )
    expect(screen.getByRole("link", { name: "Por revisar (6)" })).not.toHaveAttribute("aria-current")
  })

  test("keeps the picked series in every link", () => {
    render(<Filtros serie="inv1" estado={null} conteos={CONTEOS} />)
    expect(screen.getByRole("link", { name: "Todas (10)" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "Por revisar (6)" })).toHaveAttribute(
      "href",
      "/ideas?serie=inv1&estado=propuesta",
    )
  })
})
