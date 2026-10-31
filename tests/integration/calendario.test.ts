import { randomUUID } from "node:crypto"
import { describe, expect, test } from "vitest"
import { proponerFecha } from "@/lib/piezas/horarios"
import { calendario, horariosOcupados } from "@/lib/piezas/lectura"
import {
  admin,
  cuentaDe,
  enDias,
  literal,
  marcaConDueno,
  personaConSesion,
  piezaDe,
  vectorDe,
  versionVigente,
} from "./entorno"

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

/** An approved idea with one assignment of the account on `cuando`, inserted as the worker and the RPCs would. */
async function asignacion(
  cuenta: string,
  cuando: string,
  estado: "por_escribir" | "escribiendo" | "escrita" = "por_escribir",
) {
  const { data: idea, error } = await admin()
    .from("ideas")
    .insert({
      gancho: `Gancho ${randomUUID().slice(0, 8)}`,
      resumen: "Un resumen",
      formato: "texto",
      esqueleto: [{ idea: "Una idea" }],
      fuentes: [randomUUID()],
      cuenta_sugerida: cuenta,
      razon: "Porque sí.",
      vector: literal(vectorDe(7)),
      // A loose idea: it needs no research of its own.
      origen: "domingo",
      estado: "aprobada",
    })
    .select("id, gancho")
    .single()
  if (error) throw error
  const { data, error: errorDeAsignacion } = await admin()
    .from("asignaciones")
    .insert({ idea_id: idea.id, cuenta_id: cuenta, formato: "texto", planeada_para: cuando, estado })
    .select("id")
    .single()
  if (errorDeAsignacion) throw errorDeAsignacion
  return { id: data.id, ideaId: idea.id, gancho: idea.gancho }
}

describe("horariosOcupados", () => {
  test("planned and signed slots of the account, from now on, optionally without one piece", async () => {
    const e = await escenario()
    const todos = await horariosOcupados(e.db, e.cuenta, Date.now())
    expect(todos.sort()).toEqual([Date.parse(e.plan), Date.parse(e.firma)].sort())
    expect(await horariosOcupados(e.db, e.cuenta, Date.now(), e.planeada)).toEqual([Date.parse(e.firma)])
  })

  test("an open assignment holds its slot; a written or past one does not", async () => {
    const e = await escenario()
    const abierta = enDias(4)
    const escribiendo = enDias(5)
    await asignacion(e.cuenta, abierta)
    await asignacion(e.cuenta, escribiendo, "escribiendo")
    await asignacion(e.cuenta, enDias(6), "escrita")
    await asignacion(e.cuenta, enDias(-1))
    const todos = await horariosOcupados(e.db, e.cuenta, Date.now())
    expect(todos.sort()).toEqual(
      [Date.parse(e.plan), Date.parse(e.firma), Date.parse(abierta), Date.parse(escribiendo)].sort(),
    )
  })

  test("so the next proposed date skips an assignment's slot", async () => {
    const dueno = await personaConSesion("calendario-propone")
    const cuenta = await cuentaDe(await marcaConDueno(dueno.userId))
    const ahora = Date.now()
    const primera = proponerFecha("persona", [], ahora)
    await asignacion(cuenta, primera.toISOString())
    const siguiente = proponerFecha("persona", await horariosOcupados(dueno.db, cuenta, ahora), ahora)
    expect(siguiente.getTime()).toBeGreaterThan(primera.getTime())
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

  test("returns the open assignments in the range as «por escribir», with the idea's hook", async () => {
    const e = await escenario()
    const abierta = await asignacion(e.cuenta, enDias(4))
    const escribiendo = await asignacion(e.cuenta, enDias(5), "escribiendo")
    const escrita = await asignacion(e.cuenta, enDias(6), "escrita")
    await asignacion(e.cuenta, enDias(40))
    const { asignaciones } = await calendario(e.db, new Date().toISOString(), enDias(30))
    expect(asignaciones).toEqual([
      {
        tipo: "asignacion",
        id: abierta.id,
        ideaId: abierta.ideaId,
        investigacionId: null,
        cuentaId: e.cuenta,
        estado: "por_escribir",
        instante: expect.any(String),
        gancho: abierta.gancho,
      },
      expect.objectContaining({ id: escribiendo.id, estado: "escribiendo" }),
    ])
    expect(asignaciones.find((a) => a.id === escrita.id)).toBeUndefined()
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
    expect(await calendario(extrano.db, new Date().toISOString(), enDias(30))).toEqual({
      cuentas: [],
      piezas: [],
      asignaciones: [],
    })
  })
})
