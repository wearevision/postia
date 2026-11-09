import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { Publicaciones } from "@/app/(app)/rendimiento/publicaciones"
import { VistaDeRendimiento } from "@/app/(app)/rendimiento/vista"
import {
  cifra,
  mesLegible,
  ordenarPublicaciones,
  periodoLegible,
  porcentajeDeAudiencia,
  porcentajeDeTasa,
} from "@/lib/rendimiento/formato"
import type { PublicacionConRendimiento, RendimientoDeCuenta } from "@/lib/rendimiento/lectura"

function publicacion(cambios: Partial<PublicacionConRendimiento> & { id: string }): PublicacionConRendimiento {
  return {
    publicadaEl: "2026-10-27",
    texto: "Un texto",
    piezaId: null,
    impresiones: 1000,
    interacciones: 42,
    tasa: 0.042,
    clics: null,
    seguidoresNuevos: null,
    marca: null,
    masAlcance: false,
    ...cambios,
  }
}

const PUBLICACIONES = [
  publicacion({
    id: "a",
    texto: "Primera",
    publicadaEl: "2026-10-01",
    impresiones: 500,
    interacciones: 50,
    tasa: 0.1,
    marca: "mejor",
  }),
  publicacion({
    id: "b",
    texto: "Segunda",
    publicadaEl: "2026-10-20",
    impresiones: 3000,
    interacciones: 30,
    tasa: 0.01,
    marca: "peor",
    piezaId: "pz1",
  }),
  publicacion({
    id: "c",
    texto: "Tercera",
    publicadaEl: "2026-10-10",
    impresiones: null,
    interacciones: null,
    tasa: null,
  }),
]

describe("formato", () => {
  test("shows a rate as a percent with a decimal comma", () => {
    expect(porcentajeDeTasa(0.042)).toBe("4,2 %")
    expect(porcentajeDeTasa(0.1)).toBe("10 %")
  })

  test("shows a dash for a missing rate", () => {
    expect(porcentajeDeTasa(null)).toBe("—")
  })

  test("shows audience percentages as whole numbers or less than one", () => {
    expect(porcentajeDeAudiencia({ porcentaje: 4, menorAUno: false })).toBe("4 %")
    expect(porcentajeDeAudiencia({ porcentaje: null, menorAUno: true })).toBe("< 1 %")
    expect(porcentajeDeAudiencia({ porcentaje: null, menorAUno: false })).toBeNull()
  })

  test("shows figures with thousands separators and a dash for missing ones, never zero for null", () => {
    expect(cifra(12345)).toBe("12.345")
    expect(cifra(0)).toBe("0")
    expect(cifra(null)).toBe("—")
  })

  test("writes a month and a period in Spanish", () => {
    expect(mesLegible("2025-11")).toBe("nov 2025")
    expect(periodoLegible("2025-11-10", "2026-11-09")).toBe("10 nov 2025 al 9 nov 2026")
  })

  test("sorts descending by the chosen field and leaves missing values last", () => {
    const ids = (c: Parameters<typeof ordenarPublicaciones>[1]) =>
      ordenarPublicaciones(PUBLICACIONES, c).map((p) => p.id)
    expect(ids("fecha")).toEqual(["b", "c", "a"])
    expect(ids("tasa")).toEqual(["a", "b", "c"])
    expect(ids("impresiones")).toEqual(["b", "a", "c"])
    expect(ids("interacciones")).toEqual(["a", "b", "c"])
  })
})

describe("Publicaciones", () => {
  test("lists posts newest first with their figures and a dash where a figure is missing", () => {
    render(<Publicaciones publicaciones={PUBLICACIONES} />)
    const filas = within(screen.getByRole("list", { name: "Publicaciones" })).getAllByRole("listitem")
    expect(filas.map((f) => f.textContent)).toEqual([
      expect.stringContaining("Segunda"),
      expect.stringContaining("Tercera"),
      expect.stringContaining("Primera"),
    ])
    expect(filas[1]?.textContent).toContain("—")
    expect(filas[0]?.textContent).toContain("1 %")
  })

  test("names its marks by what they measure and explains engagement", () => {
    render(
      <Publicaciones publicaciones={[...PUBLICACIONES, publicacion({ id: "d", texto: "Cuarta", masAlcance: true })]} />,
    )
    expect(screen.getAllByText("Mejor enganche")).toHaveLength(1)
    expect(screen.getAllByText("Menor enganche")).toHaveLength(1)
    expect(screen.getAllByText("Más alcance")).toHaveLength(1)
    expect(screen.getByText("Enganche = interacciones ÷ impresiones. Alcance = impresiones.")).toBeInTheDocument()
    expect(screen.queryByText("Peor")).toBeNull()
  })

  test("shows the day LinkedIn gives, with its year and no made-up hour", () => {
    render(<Publicaciones publicaciones={[publicacion({ id: "e", publicadaEl: "2026-11-01" })]} />)
    expect(screen.getByText("dom 1 nov 2026")).toBeInTheDocument()
    expect(screen.queryByText(/21:00/)).toBeNull()
  })

  test("links the text to the piece when there is one", () => {
    render(<Publicaciones publicaciones={PUBLICACIONES} />)
    expect(screen.getByRole("link", { name: /Segunda/ })).toHaveAttribute("href", "/piezas/pz1")
    expect(screen.queryByRole("link", { name: /Primera/ })).toBeNull()
  })

  test("reorders when another field is chosen", () => {
    render(<Publicaciones publicaciones={PUBLICACIONES} />)
    fireEvent.change(screen.getByLabelText("Ordenar por"), { target: { value: "tasa" } })
    const filas = within(screen.getByRole("list", { name: "Publicaciones" })).getAllByRole("listitem")
    expect(filas[0]?.textContent).toContain("Primera")
  })

  test("shows clicks and new followers only when present", () => {
    render(
      <Publicaciones
        publicaciones={[
          publicacion({ id: "x", texto: "De página", clics: 12, seguidoresNuevos: 3 }),
          publicacion({ id: "y", texto: "De perfil" }),
        ]}
      />,
    )
    const [conClics, sinClics] = within(screen.getByRole("list", { name: "Publicaciones" })).getAllByRole("listitem")
    expect(conClics?.textContent).toMatch(/Clics\s*12/)
    expect(conClics?.textContent).toMatch(/Nuevos seguidores\s*3/)
    expect(sinClics?.textContent).not.toContain("Clics")
  })
})

const DATOS: RendimientoDeCuenta = {
  publicaciones: PUBLICACIONES,
  meses: [
    {
      mes: "2025-11",
      impresiones: 1200,
      interacciones: 80,
      seguidoresNuevos: 9,
      visitas: null,
      visitantesUnicos: null,
    },
    { mes: "2025-12", impresiones: 900, interacciones: 40, seguidoresNuevos: 4, visitas: 30, visitantesUnicos: 20 },
  ],
  publico: [
    {
      tipo: "seguidores",
      categoria: "Cargo",
      valor: "Gerente",
      porcentaje: 12,
      menorAUno: false,
      cantidad: null,
      cambio: "sube",
    },
    {
      tipo: "seguidores",
      categoria: "Cargo",
      valor: "Pasante",
      porcentaje: null,
      menorAUno: true,
      cantidad: null,
      cambio: "nuevo",
    },
    {
      tipo: "contenido",
      categoria: "Sector",
      valor: "Software",
      porcentaje: 30,
      menorAUno: false,
      cantidad: null,
      cambio: null,
    },
    {
      tipo: "visitantes",
      categoria: "Ubicación",
      valor: "Chile",
      porcentaje: null,
      menorAUno: false,
      cantidad: 77,
      cambio: "baja",
    },
  ],
  ultimaImportacion: { id: "i1", desde: "2025-11-10", hasta: "2026-11-09", creadaEn: "2026-11-09T12:00:00.000Z" },
  seguidoresTotal: 3448,
  medianaDeTasa: 0.04,
  muestraChica: true,
}

const CUENTAS = [
  { id: "perfil", nombre: "Federico", tipo: "persona", tieneDatos: true },
  { id: "pagina", nombre: "Página de WAV", tipo: "empresa", tieneDatos: false },
]

const EXTRAS = {
  aprendizajes: {
    porDecidir: [{ id: "a1", texto: "Los casos con cifras rinden más.", porque: "Más enganche.", respaldo: 9 }],
    pistas: [],
    aprobados: [],
    leyendo: false,
    ultimoFallo: null,
  },
  acciones: { decidir: async () => ({ ok: true as const }), pedirLectura: async () => ({ ok: true as const }) },
}

describe("VistaDeRendimiento", () => {
  test("puts «Aprendizajes» before «Publicaciones» for the account being shown", () => {
    render(<VistaDeRendimiento cuentas={CUENTAS} cuentaId="perfil" datos={DATOS} {...EXTRAS} />)
    const aprendizajes = screen.getByRole("heading", { name: "Aprendizajes" })
    const publicaciones = screen.getByRole("heading", { name: "Publicaciones" })
    expect(aprendizajes.compareDocumentPosition(publicaciones) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText("Los casos con cifras rinden más.")).toBeInTheDocument()
  })

  test("shows the period, the followers total and the small-sample notice", () => {
    render(<VistaDeRendimiento cuentas={CUENTAS} cuentaId="perfil" datos={DATOS} {...EXTRAS} />)
    expect(screen.getByText("Datos del 10 nov 2025 al 9 nov 2026")).toBeInTheDocument()
    expect(screen.getByText(/3\.448 seguidores/)).toBeInTheDocument()
    expect(
      screen.getByText("Todavía son pocas publicaciones con interacciones para sacar conclusiones."),
    ).toBeInTheDocument()
  })

  test("hides the small-sample notice when there is enough data", () => {
    render(
      <VistaDeRendimiento cuentas={CUENTAS} cuentaId="perfil" datos={{ ...DATOS, muestraChica: false }} {...EXTRAS} />,
    )
    expect(screen.queryByText(/pocas publicaciones/)).toBeNull()
  })

  test("offers one link per account and marks the current one", () => {
    render(<VistaDeRendimiento cuentas={CUENTAS} cuentaId="perfil" datos={DATOS} {...EXTRAS} />)
    const nav = screen.getByRole("navigation", { name: "Cuenta" })
    expect(within(nav).getByRole("link", { name: "Federico" })).toHaveAttribute("aria-current", "page")
    expect(within(nav).getByRole("link", { name: "Página de WAV" })).toHaveAttribute(
      "href",
      "/rendimiento?cuenta=pagina",
    )
  })

  test("lists the monthly trend in a table with dashes for missing figures", () => {
    render(<VistaDeRendimiento cuentas={CUENTAS} cuentaId="perfil" datos={DATOS} {...EXTRAS} />)
    const tabla = screen.getByRole("table", { name: "Tendencia por mes" })
    const filas = within(tabla).getAllByRole("row")
    expect(filas[1]?.textContent).toContain("nov 2025")
    expect(filas[1]?.textContent).toContain("1.200")
    expect(filas[1]?.textContent).toContain("—")
  })

  test("groups the audience with percentages, counts and change words", () => {
    render(<VistaDeRendimiento cuentas={CUENTAS} cuentaId="perfil" datos={DATOS} {...EXTRAS} />)
    const seguidores = screen.getByRole("region", { name: "Quienes te siguen" })
    expect(within(seguidores).getByText("Cargo")).toBeInTheDocument()
    expect(
      within(seguidores)
        .getByText(/Gerente/)
        .closest("li")?.textContent,
    ).toMatch(/12 %.*sube/)
    expect(
      within(seguidores)
        .getByText(/Pasante/)
        .closest("li")?.textContent,
    ).toMatch(/< 1 %.*nuevo/)
    const visitantes = screen.getByRole("region", { name: "Quienes visitaron la página" })
    expect(within(visitantes).getByText(/Chile/).closest("li")?.textContent).toMatch(/77.*baja/)
    const contenido = screen.getByRole("region", { name: "Quienes vieron tus publicaciones" })
    expect(
      within(contenido)
        .getByText(/Software/)
        .closest("li")?.textContent,
    ).not.toMatch(/sube|baja|nuevo/)
  })

  test("shows the no-data state with a link to import when the account has nothing", () => {
    render(
      <VistaDeRendimiento
        cuentas={CUENTAS}
        cuentaId="pagina"
        {...EXTRAS}
        datos={{
          ...DATOS,
          publicaciones: [],
          meses: [],
          publico: [],
          ultimaImportacion: null,
          seguidoresTotal: null,
          medianaDeTasa: null,
        }}
      />,
    )
    expect(screen.getByText("Todavía no hay estadísticas de esta cuenta.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Importar estadísticas" })).toHaveAttribute("href", "/ajustes")
    expect(screen.queryByRole("list", { name: "Publicaciones" })).toBeNull()
    expect(screen.queryByRole("heading", { name: "Aprendizajes" })).toBeNull()
  })
})
