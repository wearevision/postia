import { beforeAll, describe, expect, test } from "vitest"
import { aprendizajesDeCuenta } from "@/lib/rendimiento/lectura"
import type { Db } from "@/lib/supabase/database"
import { admin, cuentaDe, marcaConDueno, personaConSesion } from "./entorno"

let dueno: { db: Db; userId: string }
let ajeno: { db: Db; userId: string }

type Estado = "propuesto" | "aprobado" | "descartado" | "pista"

async function aprendizaje(cuentaId: string, texto: string, estado: Estado, respaldo = 9): Promise<void> {
  const { error } = await admin()
    .from("aprendizajes")
    .insert({
      cuenta_id: cuentaId,
      texto,
      porque: `Porque ${texto}`,
      respaldo,
      estado,
      decidido_en: estado === "aprobado" ? new Date().toISOString() : null,
    })
  if (error) throw error
}

async function lectura(cuentaId: string, estado: "pendiente" | "lista" | "fallo", motivo?: string): Promise<void> {
  const { error } = await admin()
    .from("lecturas_de_rendimiento")
    .insert({ cuenta_id: cuentaId, estado, motivo, pedida_por: dueno.userId })
  if (error) throw error
}

beforeAll(async () => {
  dueno = await personaConSesion("lectura-de-aprendizajes")
  ajeno = await personaConSesion("lectura-de-aprendizajes-ajeno")
})

describe("aprendizajesDeCuenta", () => {
  test("splits the undecided, the hints and the approved, and leaves the discarded out", async () => {
    const cuenta = await cuentaDe(await marcaConDueno(dueno.userId))
    await aprendizaje(cuenta, "Propuesto", "propuesto")
    await aprendizaje(cuenta, "Pista", "pista", 3)
    await aprendizaje(cuenta, "Aprobado", "aprobado")
    await aprendizaje(cuenta, "Descartado", "descartado")
    const r = await aprendizajesDeCuenta(dueno.db, cuenta)
    expect(r.porDecidir.map((a) => a.texto)).toEqual(["Propuesto"])
    expect(r.pistas).toEqual([expect.objectContaining({ texto: "Pista", respaldo: 3, porque: "Porque Pista" })])
    expect(r.aprobados.map((a) => a.texto)).toEqual(["Aprobado"])
    expect(r.leyendo).toBe(false)
    expect(r.ultimoFallo).toBeNull()
  })

  test("another owner sees nothing of the account", async () => {
    const cuenta = await cuentaDe(await marcaConDueno(dueno.userId))
    await aprendizaje(cuenta, "Privado", "propuesto")
    expect(await aprendizajesDeCuenta(ajeno.db, cuenta)).toEqual({
      porDecidir: [],
      pistas: [],
      aprobados: [],
      leyendo: false,
      ultimoFallo: null,
    })
  })

  test("says it is reading while a reading is open", async () => {
    const cuenta = await cuentaDe(await marcaConDueno(dueno.userId))
    await lectura(cuenta, "pendiente")
    expect((await aprendizajesDeCuenta(dueno.db, cuenta)).leyendo).toBe(true)
  })

  test("gives the reason when the latest reading failed, and not once a later one worked", async () => {
    const cuenta = await cuentaDe(await marcaConDueno(dueno.userId))
    await lectura(cuenta, "fallo", "Se alcanzó el tope de gasto.")
    expect((await aprendizajesDeCuenta(dueno.db, cuenta)).ultimoFallo).toBe("Se alcanzó el tope de gasto.")
    await lectura(cuenta, "lista")
    expect((await aprendizajesDeCuenta(dueno.db, cuenta)).ultimoFallo).toBeNull()
  })
})
