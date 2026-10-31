import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"

const router = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => router }))

import { Volver } from "@/app/(app)/piezas/[id]/volver"

afterEach(() => {
  vi.restoreAllMocks()
  router.back.mockClear()
  router.push.mockClear()
})

describe("Volver", () => {
  test("goes back when the app has history", () => {
    vi.spyOn(window.history, "length", "get").mockReturnValue(3)
    render(<Volver />)
    fireEvent.click(screen.getByRole("button", { name: "Volver" }))
    expect(router.back).toHaveBeenCalledOnce()
  })

  test("goes home when the piece was opened from a notification", () => {
    vi.spyOn(window.history, "length", "get").mockReturnValue(1)
    render(<Volver />)
    fireEvent.click(screen.getByRole("button", { name: "Volver" }))
    expect(router.push).toHaveBeenCalledWith("/")
  })
})
