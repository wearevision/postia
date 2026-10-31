// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, test } from "vitest"
import { type Fuente, recorrerImports } from "../grafo-de-imports"

const RAIZ = path.resolve(__dirname, "../..")

function archivos(carpeta: string): string[] {
  const absoluta = path.join(RAIZ, carpeta)
  if (!existsSync(absoluta)) return []
  return readdirSync(absoluta).flatMap((nombre) => {
    const ruta = path.posix.join(carpeta, nombre)
    return statSync(path.join(RAIZ, ruta)).isDirectory() ? archivos(ruta) : /\.(ts|tsx)$/.test(nombre) ? [ruta] : []
  })
}

const disco: Fuente = {
  esArchivo: (ruta) => existsSync(path.join(RAIZ, ruta)) && statSync(path.join(RAIZ, ruta)).isFile(),
  leer: (ruta) => readFileSync(path.join(RAIZ, ruta), "utf8"),
}

function enMemoria(archivos: Record<string, string>): Fuente {
  return {
    esArchivo: (ruta) => ruta in archivos,
    leer: (ruta) => archivos[ruta] ?? "",
  }
}

const esDelClienteDeClaude = (ruta: string) => ruta.startsWith("lib/ia/")
const esElSdk = (paquete: string) => paquete === "@anthropic-ai/sdk" || paquete.startsWith("@anthropic-ai/sdk/")

describe("recorrerImports", () => {
  test("follows alias, relative, re-export, side-effect, multi-line and dynamic imports down to the SDK", () => {
    const grafo = recorrerImports(
      ["app/page.tsx"],
      enMemoria({
        "app/page.tsx": 'import { a } from "@/lib/a"\nimport "./estilos"\n',
        "app/estilos.ts": "export {}\n",
        "lib/a.ts": 'export * from "./b"\n',
        "lib/b/index.ts": 'import {\n  type C,\n  c,\n} from "../c"\n',
        "lib/c.tsx": 'export const c = () => import("@/lib/ia/claude")\n',
        "lib/ia/claude.ts": 'import Anthropic from "@anthropic-ai/sdk"\nimport x from "@anthropic-ai/sdk/resources"\n',
      }),
    )
    expect([...grafo.archivos].sort()).toEqual([
      "app/estilos.ts",
      "app/page.tsx",
      "lib/a.ts",
      "lib/b/index.ts",
      "lib/c.tsx",
      "lib/ia/claude.ts",
    ])
    expect([...grafo.paquetes].sort()).toEqual(["@anthropic-ai/sdk", "@anthropic-ai/sdk/resources"])
    expect(grafo.sinResolver).toEqual([])
  })

  test("follows a multi-line import whose comment has an apostrophe, and ignores imports inside comments", () => {
    const grafo = recorrerImports(
      ["app/page.tsx"],
      enMemoria({
        "app/page.tsx":
          'import {\n  // don\'t inline this one\n  a,\n} from "@/lib/ia/claude"\n// import "@/lib/comentado"\n/* import x from "@/lib/tampoco" */\n',
        "lib/ia/claude.ts": 'import Anthropic from "@anthropic-ai/sdk"\n',
      }),
    )
    expect([...grafo.archivos].sort()).toEqual(["app/page.tsx", "lib/ia/claude.ts"])
    expect([...grafo.paquetes]).toEqual(["@anthropic-ai/sdk"])
    expect(grafo.sinResolver).toEqual([])
  })

  test("reports a project import it cannot resolve instead of silently stopping there", () => {
    const grafo = recorrerImports(["app/page.tsx"], enMemoria({ "app/page.tsx": 'import { a } from "@/lib/falta"\n' }))
    expect(grafo.sinResolver).toEqual(["app/page.tsx → @/lib/falta"])
  })
})

describe("Worker boundary", () => {
  test("nothing reachable from a route, a component or the proxy imports the Claude client or the Anthropic SDK", () => {
    const entradas = [
      ...archivos("app"),
      ...archivos("components"),
      ...(disco.esArchivo("proxy.ts") ? ["proxy.ts"] : []),
    ]
    expect(entradas.length).toBeGreaterThan(0)
    const grafo = recorrerImports(entradas, disco)
    expect(grafo.sinResolver).toEqual([])
    expect([...grafo.archivos].filter(esDelClienteDeClaude)).toEqual([])
    expect([...grafo.paquetes].filter(esElSdk)).toEqual([])
  })

  test("nothing reachable from a route, a component or the proxy imports the carousel renderer or Playwright", () => {
    const entradas = [
      ...archivos("app"),
      ...archivos("components"),
      ...(disco.esArchivo("proxy.ts") ? ["proxy.ts"] : []),
    ]
    const grafo = recorrerImports(entradas, disco)
    expect(grafo.sinResolver).toEqual([])
    expect([...grafo.archivos].filter((a) => a.startsWith("lib/carrusel/"))).toEqual([])
    expect([...grafo.paquetes].filter((p) => p === "playwright" || p.startsWith("playwright/"))).toEqual([])
  })

  test("nothing reachable from a route, a component or the proxy imports the research run, its repository or the watch", () => {
    const entradas = [
      ...archivos("app"),
      ...archivos("components"),
      ...(disco.esArchivo("proxy.ts") ? ["proxy.ts"] : []),
    ]
    const grafo = recorrerImports(entradas, disco)
    expect(grafo.sinResolver).toEqual([])
    const soloTrigger = [
      "lib/investigacion/investigar.ts",
      "lib/investigacion/repositorio.ts",
      "lib/investigacion/vigilancia.ts",
    ]
    expect([...grafo.archivos].filter((a) => soloTrigger.includes(a))).toEqual([])
  })

  test("the research run and the watch stay Trigger-only because they reach the Claude client", () => {
    const grafo = recorrerImports(["trigger/investigaciones.ts"], disco)
    expect(grafo.sinResolver).toEqual([])
    expect([...grafo.archivos]).toEqual(
      expect.arrayContaining([
        "lib/investigacion/investigar.ts",
        "lib/investigacion/vigilancia.ts",
        "lib/ia/claude.ts",
      ]),
    )
  })

  test("nothing reachable from a route, a component or the proxy imports the series writers or their repository", () => {
    const entradas = [
      ...archivos("app"),
      ...archivos("components"),
      ...(disco.esArchivo("proxy.ts") ? ["proxy.ts"] : []),
    ]
    const grafo = recorrerImports(entradas, disco)
    expect(grafo.sinResolver).toEqual([])
    const soloTrigger = [
      "lib/series/armar.ts",
      "lib/series/carrusel.ts",
      "lib/series/escribir.ts",
      "lib/series/repositorio.ts",
    ]
    expect([...grafo.archivos].filter((a) => soloTrigger.includes(a))).toEqual([])
  })

  test("the series writers stay Trigger-only because they reach the Claude client", () => {
    const grafo = recorrerImports(["trigger/series.ts", "trigger/investigaciones.ts"], disco)
    expect(grafo.sinResolver).toEqual([])
    expect([...grafo.archivos]).toEqual(
      expect.arrayContaining([
        "lib/series/armar.ts",
        "lib/series/carrusel.ts",
        "lib/series/escribir.ts",
        "lib/series/repositorio.ts",
        "lib/ia/claude.ts",
      ]),
    )
  })

  test("the cheap carousel poller does not reach Playwright or the renderer's task", () => {
    const grafo = recorrerImports(["trigger/vigilar-carruseles.ts"], disco)
    expect(grafo.sinResolver).toEqual([])
    expect([...grafo.archivos].filter((a) => a === "trigger/carruseles.ts" || a === "lib/carrusel/render.ts")).toEqual(
      [],
    )
    expect([...grafo.paquetes].filter((p) => p === "playwright" || p.startsWith("playwright/"))).toEqual([])
  })

  test("the token refresh stays Trigger-only: no route, component or the proxy reaches it", () => {
    const entradas = [
      ...archivos("app"),
      ...archivos("components"),
      ...(disco.esArchivo("proxy.ts") ? ["proxy.ts"] : []),
    ]
    const grafo = recorrerImports(entradas, disco)
    expect(grafo.sinResolver).toEqual([])
    expect([...grafo.archivos].filter((a) => a === "lib/linkedin/renovar.ts")).toEqual([])
    expect([...recorrerImports(["trigger/conexiones.ts"], disco).archivos]).toContain("lib/linkedin/renovar.ts")
  })
})
