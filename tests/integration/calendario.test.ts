import { describe, expect, test } from "vitest"
import { calendario, horariosOcupados } from "@/lib/piezas/lectura"
import { cuentaDe, enDias, marcaConDueno, personaConSesion, piezaDe, versionVigente } from "./entorno"

async function escenario() {
  const dueno = await personaConSesion("calendario")
  const marca = await marcaConDueno(dueno.userId)
  const cuenta = await cuentaDe(marca)
  const [planeada, firmada, reserva] = [
    await piezaDe(dueno.db, cuenta, "Planeada"),
    await piezaDe(dueno.db, cuenta, "Firmada"),
    await piezaDe(dueno.db, cuenta, "Reserva"),
  ]
  const plan = enDias(2)
  const firma = enDias(3)
  const pasos = [
    await dueno.db.rpc("planear_pieza", { p_pieza: planeada, p_fecha: plan }),
    await dueno.db.rpc("firmar_pieza", {
      p_pieza: firmada,
      p_huella: (await versionVigente(firmada)).huella,
      p_programada_para: firma,
    }),
    await dueno.db.rpc("firmar_para_reserva", { p_pieza: reserva, p_huella: (await versionVigente(reserva)).huella }),
  ]
  for (const paso of pasos) if (paso.error) throw paso.error
  return { ...dueno, marca, cuenta, planeada, firmada, reserva, plan, firma }
}

describe("horariosOcupados", () => {
  test("planned and signed slots of the account, from now on, optionally without one piece", async () => {
    const e = await escenario()
    const todos = await horariosOcupados(e.db, e.cuenta, Date.now())
    expect(todos.sort()).toEqual([Date.parse(e.plan), Date.parse(e.firma)].sort())
    expect(await horariosOcupados(e.db, e.cuenta, Date.now(), e.planeada)).toEqual([Date.parse(e.firma)])
  })
})

describe("calendario", () => {
  test("returns the member's accounts with rhythm and reserve, and the pieces whose slot falls in the range", async () => {
    const e = await escenario()
    const { cuentas, piezas } = await calendario(e.db, new Date().toISOString(), enDias(30))
    expect(cuentas).toEqual([
      expect.objectContaining({ id: e.cuenta, marcaId: e.marca, tipo: "persona", ritmoSemanal: 3, enReserva: 1 }),
    ])
    expect(piezas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: e.planeada, estado: "por_aprobar", firmada: false, extracto: "Planeada" }),
        expect.objectContaining({ id: e.firmada, estado: "programada", firmada: true }),
      ]),
    )
    expect(piezas.find((p) => p.id === e.reserva)).toBeUndefined()
  })

  test("refuses ranges that are not instants or span more than six weeks", async () => {
    const e = await escenario()
    await expect(calendario(e.db, "ayer", enDias(3))).rejects.toThrow("Rango de fechas inválido.")
    await expect(calendario(e.db, new Date().toISOString(), enDias(43))).rejects.toThrow(
      "El calendario no muestra más de seis semanas a la vez.",
    )
    await expect(calendario(e.db, enDias(5), enDias(2))).rejects.toThrow("Rango de fechas inválido.")
    await expect(calendario(e.db, new Date().toISOString(), enDias(41))).resolves.toBeDefined()
  })

  test("a stranger sees nothing", async () => {
    await escenario()
    const extrano = await personaConSesion("calendario-extrano")
    expect(await calendario(extrano.db, new Date().toISOString(), enDias(30))).toEqual({ cuentas: [], piezas: [] })
  })
})
