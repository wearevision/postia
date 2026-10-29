import { describe, expect, test } from "vitest"
import { balanceDePilares, lineaDeAlerta, type PiezaDeBalance } from "@/lib/voz/balance"

const DIA = 86_400_000
const AHORA = Date.parse("2026-11-20T15:00:00Z")
const hace = (dias: number) => new Date(AHORA - dias * DIA).toISOString()
const en = (dias: number) => new Date(AHORA + dias * DIA).toISOString()

const UNO = { id: "p1", nombre: "Detrás del trabajo", porSemana: 1, creadoEn: hace(60) }
const OFICIO = { id: "p2", nombre: "Oficio", porSemana: 0.5, creadoEn: hace(60) }

function pieza(
  pilarId: string | null,
  instante: string,
  estado: PiezaDeBalance["estado"] = "publicada",
): PiezaDeBalance {
  return { pilarId, instante, estado }
}

describe("balanceDePilares", () => {
  test("counts what came out in four weeks against the target and what is planned ahead", () => {
    const { filas } = balanceDePilares(
      [UNO],
      [
        pieza("p1", hace(3)),
        pieza("p1", hace(10)),
        pieza("p1", hace(40)),
        pieza("p1", en(2), "programada"),
        pieza("p1", en(9), "por_aprobar"),
      ],
      AHORA,
    )
    expect(filas[0]).toMatchObject({ salieron: 2, meta: 4, planeadas: 2, diasSinSalir: 3, alerta: false })
  })

  test("raises an alert after two weeks without coming out and nothing planned in the next seven days", () => {
    const { filas } = balanceDePilares([UNO], [pieza("p1", hace(15)), pieza("p1", en(9), "programada")], AHORA)
    expect(filas[0]).toMatchObject({ diasSinSalir: 15, alerta: true })
  })

  test("a piece planned in the next seven days quiets the alert", () => {
    const { filas } = balanceDePilares([OFICIO], [pieza("p2", hace(15)), pieza("p2", en(3), "por_aprobar")], AHORA)
    expect(filas[0]?.alerta).toBe(false)
  })

  test("a pillar that never came out alerts only once it is two weeks old", () => {
    const nuevo = { ...UNO, creadoEn: hace(5) }
    expect(balanceDePilares([nuevo], [], AHORA).filas[0]).toMatchObject({ diasSinSalir: null, alerta: false })
    expect(balanceDePilares([UNO], [], AHORA).filas[0]).toMatchObject({ diasSinSalir: null, alerta: true })
  })

  test("published means published: a signed piece in the past that is not published does not count", () => {
    const { filas } = balanceDePilares([UNO], [pieza("p1", hace(2), "programada")], AHORA)
    expect(filas[0]).toMatchObject({ salieron: 0, diasSinSalir: null })
  })

  test("counts days without coming out as Chile calendar days, across the September clock change", () => {
    // 2026-09-05 00:30 (UTC-4) to 2026-09-19 00:30 (UTC-3): 14 calendar days but 13 days and 23 hours.
    const ahora = Date.parse("2026-09-19T03:30:00Z")
    const pilar = { ...UNO, creadoEn: "2026-06-01T00:00:00Z" }
    const { filas } = balanceDePilares([pilar], [pieza("p1", "2026-09-05T04:30:00Z")], ahora)
    expect(filas[0]).toMatchObject({ diasSinSalir: 14, alerta: true })
  })

  test("a piece published late last night is one day ago, not zero", () => {
    // 23:30 and 00:30 in Chile are different days though one hour apart.
    const ahora = Date.parse("2026-11-20T03:30:00Z")
    const { filas } = balanceDePilares([UNO], [pieza("p1", "2026-11-20T02:30:00Z")], ahora)
    expect(filas[0]?.diasSinSalir).toBe(1)
  })

  test("ignores pieces with a date it cannot read", () => {
    const { filas, sinPilar } = balanceDePilares(
      [UNO],
      [pieza("p1", "no es fecha"), pieza("p1", "tampoco", "programada"), pieza(null, "nada", "por_aprobar")],
      AHORA,
    )
    expect(filas[0]).toMatchObject({ salieron: 0, planeadas: 0, diasSinSalir: null })
    expect(sinPilar).toBe(0)
  })

  test("counts pieces without a pillar in the same window", () => {
    expect(
      balanceDePilares([UNO], [pieza(null, hace(3)), pieza(null, en(4), "por_aprobar"), pieza(null, hace(40))], AHORA)
        .sinPilar,
    ).toBe(2)
  })
})

describe("lineaDeAlerta", () => {
  test("says how long and where", () => {
    expect(lineaDeAlerta("Oficio", 16, "Página de WAV")).toBe("«Oficio» lleva 16 días sin salir en Página de WAV.")
    expect(lineaDeAlerta("Oficio", null, "Página de WAV")).toBe(
      "«Oficio» no ha salido en Página de WAV en más de dos semanas.",
    )
  })
})
