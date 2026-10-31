import { render, screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { ChipDeGasto } from "@/app/(app)/chip-de-gasto"

const TOPE = 40_000_000
const dolares = (n: number) => n * 1_000_000

function montar(gastado: number) {
  render(<ChipDeGasto gastadoMicro={dolares(gastado)} topeMicro={TOPE} />)
  return screen.getByRole("link")
}

describe("the spend chip", () => {
  test("links to the breakdown by account and reads as a link, not a button", () => {
    const chip = montar(12.4)
    expect(chip).toHaveAttribute("href", "/ajustes")
    expect(chip).toHaveAccessibleName("Gasto del mes: US$12,40 de US$40,00. Ver el desglose por cuenta.")
    expect(chip).toHaveTextContent("US$12,40 de US$40,00")
  })

  test("says nothing extra while spend is under 80 %", () => {
    const chip = montar(31.99)
    expect(chip).not.toHaveTextContent("80 %")
    expect(chip.querySelector("svg[data-marca]")).toBeNull()
  })

  test("marks 80 % with a shape and words, not color alone", () => {
    const chip = montar(32)
    expect(chip).toHaveTextContent("Va en el 80 %")
    expect(chip.querySelector("svg[data-marca]")).toHaveAttribute("aria-hidden", "true")
  })

  test("says the cap is reached at 100 %", () => {
    const chip = montar(40)
    expect(chip).toHaveTextContent("Tope alcanzado")
    expect(chip).not.toHaveTextContent("Va en el 80 %")
  })

  test("is at least 44 px tall to tap", () => {
    expect(montar(1).className).toContain("min-h-11")
  })
})
