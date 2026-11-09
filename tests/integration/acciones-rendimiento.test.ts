import { beforeAll, describe, expect, test } from "vitest"
import { importarEstadisticas } from "@/lib/rendimiento/acciones"
import type { Exportacion } from "@/lib/rendimiento/exportacion"
import type { Db } from "@/lib/supabase/database"
import { cuentaDe, marcaConDueno, personaConSesion, publicadaConUrn, publicadaEl } from "./entorno"

let dueno: { db: Db; userId: string }
let cuenta: string
const URN = `urn:li:share:${Date.now()}3`

function exportacion(cambios: Partial<Exportacion> = {}): Exportacion {
  return {
    desde: "2025-11-10",
    hasta: "2026-11-09",
    seguidoresTotal: 3448,
    publicaciones: [{ postUrn: URN, publicadaEl: "2025-11-16", interacciones: 18, impresiones: 962 }],
    sinIdentificar: 0,
    dias: [{ dia: "2025-11-16", impresiones: 962, interacciones: 18, seguidoresNuevos: 4 }],
    publico: [{ tipo: "contenido", categoria: "Empresa", valor: "CCU", porcentaje: 4, menorAUno: false }],
    ...cambios,
  }
}

beforeAll(async () => {
  dueno = await personaConSesion("acciones-rendimiento")
  cuenta = await cuentaDe(await marcaConDueno(dueno.userId))
  await publicadaConUrn(dueno.db, cuenta, URN)
})

describe("importarEstadisticas", () => {
  test("imports and sums up what it found", async () => {
    expect(await importarEstadisticas(dueno.db, { cuentaId: cuenta, exportacion: exportacion() })).toEqual({
      ok: true,
      publicaciones: 1,
      dePostia: 1,
      anteriores: 0,
      sinIdentificar: 0,
    })
  })

  test("a file with no post of PostIA in it asks to confirm before saving, since it may be another account's", async () => {
    const ajena = exportacion({
      publicaciones: [{ postUrn: "urn:li:share:42", publicadaEl: "2025-11-16", interacciones: 1, impresiones: 9 }],
    })
    expect(await importarEstadisticas(dueno.db, { cuentaId: cuenta, exportacion: ajena })).toEqual({
      ok: false,
      error: "Ninguna publicación del archivo es de esta cuenta en PostIA. ¿Elegiste la cuenta correcta?",
      confirmar: true,
    })
    expect(
      await importarEstadisticas(dueno.db, { cuentaId: cuenta, exportacion: ajena, confirmado: true }),
    ).toMatchObject({ ok: true, anteriores: 1 })
  })

  test("refuses another owner's account in Spanish", async () => {
    const ajeno = await personaConSesion("acciones-rendimiento-ajeno")
    // Under RLS another owner sees none of these posts, so it confirms; the RPC's ownership check is what refuses.
    expect(
      await importarEstadisticas(ajeno.db, { cuentaId: cuenta, exportacion: exportacion(), confirmado: true }),
    ).toEqual({
      ok: false,
      error: "Solo el dueño de la marca de esa cuenta puede importar sus estadísticas.",
    })
  })

  test("refuses a malformed export before calling the database", async () => {
    expect(
      await importarEstadisticas(dueno.db, { cuentaId: cuenta, exportacion: { ...exportacion(), desde: "ayer" } }),
    ).toEqual({ ok: false, error: "No pude leer el archivo. Descárgalo de nuevo desde LinkedIn." })
  })

  test("a page export is matched by day and text, and never asks to confirm an account it cannot check by URN", async () => {
    const pagina = await cuentaDe(await marcaConDueno(dueno.userId))
    await publicadaEl(dueno.db, pagina, "Cerramos el año con WR3", "2026-03-10T15:00:00Z")
    const deLaPagina = exportacion({
      seguidoresTotal: null,
      publicaciones: [
        {
          postUrn: `urn:li:activity:${Date.now()}`,
          publicadaEl: "2026-03-10",
          interacciones: 7,
          impresiones: 100,
          extracto: "Cerramos el año…",
          clics: 5,
          seguidoresNuevos: 2,
        },
      ],
      dias: [
        {
          dia: "2026-03-10",
          impresiones: null,
          interacciones: null,
          seguidoresNuevos: 3,
          visitas: 10,
          visitantesUnicos: 4,
        },
      ],
      publico: [
        { tipo: "seguidores", categoria: "Área", valor: "Ventas", porcentaje: null, menorAUno: false, cantidad: 12 },
      ],
    })
    expect(await importarEstadisticas(dueno.db, { cuentaId: pagina, exportacion: deLaPagina })).toEqual({
      ok: true,
      publicaciones: 1,
      dePostia: 1,
      anteriores: 0,
      sinIdentificar: 0,
    })
  })
})
