import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, test } from "vitest"

const css = readFileSync(path.resolve(__dirname, "../../app/globals.css"), "utf8")

function bloque(desde: number): string {
  const inicio = css.indexOf("{", desde)
  const fin = css.indexOf("}", inicio)
  return css.slice(inicio + 1, fin)
}

function variables(texto: string): Record<string, string> {
  const encontradas: Record<string, string> = {}
  for (const [, nombre, valor] of texto.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    encontradas[nombre] = valor.toLowerCase()
  }
  return encontradas
}

const TEMAS: Record<"claro" | "oscuro", Record<string, string>> = {
  claro: variables(bloque(css.indexOf(":root"))),
  oscuro: variables(bloque(css.indexOf(":root", css.indexOf("prefers-color-scheme: dark")))),
}

function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const canal = Number.parseInt(hex.slice(i, i + 2), 16) / 255
    return canal <= 0.03928 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (claro + 0.05) / (oscuro + 0.05)
}

const TOKENS_DEL_SISTEMA = [
  "background",
  "foreground",
  "apagado",
  "borde",
  "control",
  "primario",
  "primario-texto",
  "exito",
  "peligro",
  "logo-globo",
]

describe.each(Object.entries(TEMAS))("design tokens in the %s theme", (_tema, tokens) => {
  test("defines every token the design system names", () => {
    for (const nombre of TOKENS_DEL_SISTEMA) {
      expect(tokens[nombre], `missing --${nombre}`).toBeDefined()
    }
  })

  test("keeps text colours at 4.5:1 or more over the background", () => {
    for (const nombre of ["foreground", "apagado", "primario", "exito", "peligro"]) {
      expect(contraste(tokens[nombre], tokens.background), `--${nombre} over --background`).toBeGreaterThanOrEqual(4.5)
    }
  })

  test("keeps the button label readable over the primary fill", () => {
    expect(contraste(tokens["primario-texto"], tokens.primario)).toBeGreaterThanOrEqual(4.5)
  })

  test("keeps control borders at 3:1 or more over the background", () => {
    expect(contraste(tokens.control, tokens.background)).toBeGreaterThanOrEqual(3)
  })
})

describe("global font", () => {
  test("uses the loaded Geist variable instead of an Arial fallback", () => {
    expect(css).not.toMatch(/Arial/i)
    expect(css).toMatch(/font-family:\s*var\(--font-sans\)/)
  })
})
