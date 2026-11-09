import { beforeAll, describe, expect, test } from "vitest"
import { contextoDeRedaccion } from "@/lib/redaccion/repositorio"
import { admin, cuentaDe, marcaConDueno, personaConSesion } from "./entorno"

const SECCIONES = { deQueHablamos: "", tono: "", formatos: "", temasVetados: "", temasAVigilar: "", ejemplos: "" }

let marca: string
let cuenta: string
let otraCuenta: string

type Estado = "propuesto" | "aprobado" | "descartado" | "pista"

async function aprendizaje(cuentaId: string, texto: string, estado: Estado, decididoEn?: string): Promise<void> {
  const { error } = await admin()
    .from("aprendizajes")
    .insert({
      cuenta_id: cuentaId,
      texto,
      porque: "Porque rindió más.",
      respaldo: 9,
      estado,
      decidido_en: decididoEn ?? (estado === "aprobado" ? new Date().toISOString() : null),
    })
  if (error) throw error
}

const contexto = async (cuentaId: string) => {
  const c = await contextoDeRedaccion(admin(), marca, { id: cuentaId, nombre: "Cuenta", tipo: "persona" })
  if (!c) throw new Error("la marca debería tener línea")
  return c
}

beforeAll(async () => {
  const persona = await personaConSesion("aprendizajes-en-el-contexto")
  marca = await marcaConDueno(persona.userId)
  const { error } = await persona.db.rpc("guardar_linea_editorial", {
    p_marca: marca,
    p_base: 0,
    p_secciones: SECCIONES,
    p_pilares: [{ nombre: "Uno", deQueHabla: "", material: "", porSemana: 1 }],
  })
  expect(error).toBeNull()
  cuenta = await cuentaDe(marca)
  otraCuenta = await cuentaDe(await marcaConDueno(persona.userId))
})

describe("contextoDeRedaccion: aprendizajes", () => {
  test("has none when the account has no approved learning", async () => {
    await aprendizaje(cuenta, "Solo propuesto", "propuesto")
    expect((await contexto(cuenta)).aprendizajes).toEqual([])
  })

  test("loads only the approved ones of that account, newest decision first", async () => {
    await aprendizaje(cuenta, "Aprobado antiguo", "aprobado", "2026-10-01T10:00:00Z")
    await aprendizaje(cuenta, "Aprobado reciente", "aprobado", "2026-11-01T10:00:00Z")
    await aprendizaje(cuenta, "Una pista", "pista")
    await aprendizaje(cuenta, "Descartado", "descartado")
    await aprendizaje(otraCuenta, "De otra cuenta", "aprobado")
    expect((await contexto(cuenta)).aprendizajes).toEqual(["Aprobado reciente", "Aprobado antiguo"])
    expect((await contexto(otraCuenta)).aprendizajes).toEqual(["De otra cuenta"])
  })

  test("takes at most 10, the newest ones", async () => {
    for (let n = 1; n <= 12; n++)
      await aprendizaje(otraCuenta, `Tanda ${n}`, "aprobado", `2026-12-${String(n).padStart(2, "0")}T10:00:00Z`)
    const { aprendizajes } = await contexto(otraCuenta)
    expect(aprendizajes).toHaveLength(10)
    expect(aprendizajes[0]).toBe("Tanda 12")
    expect(aprendizajes).not.toContain("De otra cuenta")
  })
})
