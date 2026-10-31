import { render, screen } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"

const enlaces = vi.hoisted(() => ({ montados: 0 }))
vi.mock("next/link", () => ({
  default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
    enlaces.montados++
    return <a {...props} />
  },
}))

import { ConectarLinkedin } from "@/app/(app)/marcas/conectar-linkedin"

describe("ConectarLinkedin", () => {
  test("is a plain link, so the browser never prefetches the OAuth redirect", () => {
    render(<ConectarLinkedin cuentaId="c1" tipo="persona" conectada={false} />)
    expect(screen.getByRole("link", { name: "Conectar LinkedIn" })).toHaveAttribute(
      "href",
      "/api/linkedin/conectar?cuenta=c1",
    )
    expect(enlaces.montados).toBe(0)
  })

  test("sends a page through the Community Management app", () => {
    render(<ConectarLinkedin cuentaId="c2" tipo="empresa" conectada />)
    expect(screen.getByRole("link", { name: "Renovar página" })).toHaveAttribute(
      "href",
      "/api/linkedin/pagina/conectar?cuenta=c2",
    )
  })
})
