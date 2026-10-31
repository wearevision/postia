import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import ErrorDeLaApp from "@/app/(app)/error"
import Cargando from "@/app/(app)/loading"
import NoEncontrada from "@/app/(app)/not-found"

describe("system screens", () => {
  test("not found speaks Spanish and leads home", () => {
    render(<NoEncontrada />)
    expect(screen.getByRole("heading", { name: "No encontré esta página" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Ir a Inicio" })).toHaveAttribute("href", "/")
  })

  test("an error offers to retry and to go home, without the technical message", () => {
    const reintentar = vi.fn()
    render(
      <ErrorDeLaApp
        error={Object.assign(new Error("relation does not exist"), { digest: "x" })}
        unstable_retry={reintentar}
      />,
    )
    expect(screen.getByRole("heading", { name: "Algo falló" })).toBeInTheDocument()
    expect(screen.queryByText(/relation/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }))
    expect(reintentar).toHaveBeenCalledOnce()
    expect(screen.getByRole("link", { name: "Ir a Inicio" })).toHaveAttribute("href", "/")
  })

  test("loading announces itself to screen readers", () => {
    render(<Cargando />)
    expect(screen.getByRole("status")).toHaveTextContent("Cargando…")
  })
})
