import { beforeAll, describe, expect, test } from "vitest"
import { cuentasConRendimiento, rendimientoDeCuenta } from "@/lib/rendimiento/lectura"
import type { Db } from "@/lib/supabase/database"
import { admin, cuentaDe, marcaConDueno, personaConSesion, publicadaConUrn } from "./entorno"

type Persona = { db: Db; userId: string }
let dueno: Persona
let ajeno: Persona
const unico = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`

function datos(extra: Record<string, unknown> = {}) {
  return {
    desde: "2025-11-10",
    hasta: "2026-11-09",
    seguidores_total: 3448,
    publicaciones: [],
    dias: [],
    publico: [],
    ...extra,
  }
}

async function importar(db: Db, cuenta: string, d: ReturnType<typeof datos>) {
  const { error } = await db.rpc("importar_metricas", { p_cuenta: cuenta, p_datos: d })
  if (error) throw error
}

async function cuentaNueva(): Promise<string> {
  return cuentaDe(await marcaConDueno(dueno.userId))
}

beforeAll(async () => {
  dueno = await personaConSesion("lectura-rend")
  ajeno = await personaConSesion("lectura-rend-ajeno")
})

describe("cuentasConRendimiento", () => {
  test("lists the accounts the person sees, by name, flagging which have figures", async () => {
    const marca = await marcaConDueno(dueno.userId)
    const con = await cuentaDe(marca)
    const sin = await cuentaDe(marca)
    await importar(dueno.db, con, datos())
    const cuentas = await cuentasConRendimiento(dueno.db)
    expect(cuentas.find((c) => c.id === con)).toMatchObject({ tieneDatos: true })
    expect(cuentas.find((c) => c.id === sin)).toMatchObject({ tieneDatos: false })
    const nombres = cuentas.map((c) => c.nombre)
    expect(nombres).toEqual([...nombres].sort((a, b) => a.localeCompare(b)))
  })

  test("another owner does not see the account", async () => {
    const cuenta = await cuentaNueva()
    const cuentas = await cuentasConRendimiento(ajeno.db)
    expect(cuentas.find((c) => c.id === cuenta)).toBeUndefined()
  })
})

describe("rendimientoDeCuenta: posts", () => {
  test("a PostIA post shows the first 140 characters of its piece's latest text instead of the URN", async () => {
    const cuenta = await cuentaNueva()
    const urn = `urn:li:share:${unico()}`
    const pieza = await publicadaConUrn(dueno.db, cuenta, urn)
    const nueva = await admin()
      .from("versiones")
      .insert({ pieza_id: pieza, numero: 2, texto: "x".repeat(200), huella: "" })
    expect(nueva.error).toBeNull()
    await importar(
      dueno.db,
      cuenta,
      datos({ publicaciones: [{ post_urn: urn, publicada_el: "2026-03-10", interacciones: 10, impresiones: 500 }] }),
    )
    const { publicaciones } = await rendimientoDeCuenta(dueno.db, cuenta)
    expect(publicaciones).toHaveLength(1)
    expect(publicaciones[0]).toMatchObject({
      texto: "x".repeat(140),
      piezaId: pieza,
      publicadaEl: "2026-03-10",
      impresiones: 500,
      interacciones: 10,
      tasa: 0.02,
      clics: null,
      seguidoresNuevos: null,
      marca: null,
    })
  })

  test("an earlier post shows its extract, or the fallback when it has none; newest first", async () => {
    const cuenta = await cuentaNueva()
    await importar(
      dueno.db,
      cuenta,
      datos({
        publicaciones: [
          {
            post_urn: `urn:li:activity:${unico()}1`,
            publicada_el: "2026-01-05",
            interacciones: 1,
            impresiones: 10,
            extracto: "Un extracto",
          },
          { post_urn: `urn:li:ugcPost:${unico()}2`, publicada_el: "2026-02-05", interacciones: null, impresiones: 20 },
        ],
      }),
    )
    const { publicaciones } = await rendimientoDeCuenta(dueno.db, cuenta)
    expect(publicaciones.map((p) => [p.publicadaEl, p.texto, p.piezaId, p.tasa])).toEqual([
      ["2026-02-05", "Publicación anterior a PostIA", null, null],
      ["2026-01-05", "Un extracto", null, 0.1],
    ])
  })

  test("the api figures win over the imported ones for the same URN", async () => {
    const cuenta = await cuentaNueva()
    const urn = `urn:li:share:${unico()}`
    await importar(
      dueno.db,
      cuenta,
      datos({ publicaciones: [{ post_urn: urn, publicada_el: "2026-03-10", interacciones: 1, impresiones: 100 }] }),
    )
    const { error } = await admin().from("metricas_de_publicacion").insert({
      cuenta_id: cuenta,
      post_urn: urn,
      publicada_el: "2026-03-10",
      interacciones: 9,
      impresiones: 300,
      origen: "api",
    })
    expect(error).toBeNull()
    const { publicaciones } = await rendimientoDeCuenta(dueno.db, cuenta)
    expect(publicaciones).toHaveLength(1)
    expect(publicaciones[0]).toMatchObject({ interacciones: 9, impresiones: 300 })
  })

  test("marks the best and worst against the account's median once there are enough posts", async () => {
    const cuenta = await cuentaNueva()
    const publicaciones = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
      post_urn: `urn:li:ugcPost:${unico()}${n}`,
      publicada_el: `2026-02-0${n}`,
      interacciones: n,
      impresiones: 100,
    }))
    await importar(dueno.db, cuenta, datos({ publicaciones }))
    const r = await rendimientoDeCuenta(dueno.db, cuenta)
    expect(r.publicaciones.filter((p) => p.marca === "mejor")).toHaveLength(3)
    expect(r.publicaciones.filter((p) => p.marca === "peor")).toHaveLength(3)
    expect(r.medianaDeTasa).toBeCloseTo(0.045)
    expect(r.muestraChica).toBe(false)
  })
})

describe("rendimientoDeCuenta: months and audience", () => {
  test("sums days per month and reads the latest import's audience with changes against the one before", async () => {
    const cuenta = await cuentaNueva()
    await importar(
      dueno.db,
      cuenta,
      datos({
        desde: "2025-01-01",
        hasta: "2025-06-30",
        seguidores_total: 100,
        publico: [{ tipo: "publico", categoria: "Cargo", valor: "Gerente", porcentaje: 3, menor_a_uno: false }],
      }),
    )
    await importar(
      dueno.db,
      cuenta,
      datos({
        desde: "2025-07-01",
        hasta: "2025-12-31",
        seguidores_total: 120,
        dias: [
          { dia: "2025-07-01", impresiones: 10, interacciones: 1, seguidores_nuevos: 2 },
          { dia: "2025-07-02", impresiones: 5, interacciones: 1, seguidores_nuevos: 1 },
          { dia: "2025-08-01", impresiones: 7, interacciones: 2, seguidores_nuevos: 0 },
        ],
        publico: [
          { tipo: "publico", categoria: "Cargo", valor: "Gerente", porcentaje: 5, menor_a_uno: false },
          { tipo: "publico", categoria: "Cargo", valor: "Director", porcentaje: 2, menor_a_uno: false },
        ],
      }),
    )
    const r = await rendimientoDeCuenta(dueno.db, cuenta)
    expect(r.meses.map((m) => [m.mes, m.impresiones, m.interacciones, m.seguidoresNuevos])).toEqual([
      ["2025-07", 15, 2, 3],
      ["2025-08", 7, 2, 0],
    ])
    expect(r.seguidoresTotal).toBe(120)
    expect(r.ultimaImportacion).toMatchObject({ desde: "2025-07-01", hasta: "2025-12-31" })
    expect(r.publico.map((f) => [f.valor, f.cambio])).toEqual([
      ["Gerente", "sube"],
      ["Director", "nuevo"],
    ])
  })

  test("an account without figures comes back empty, not as an error", async () => {
    const cuenta = await cuentaNueva()
    const r = await rendimientoDeCuenta(dueno.db, cuenta)
    expect(r).toMatchObject({
      publicaciones: [],
      meses: [],
      publico: [],
      ultimaImportacion: null,
      seguidoresTotal: null,
    })
  })
})

describe("rendimientoDeCuenta: RLS", () => {
  test("another owner reads nothing from the account", async () => {
    const cuenta = await cuentaNueva()
    await importar(
      dueno.db,
      cuenta,
      datos({
        publicaciones: [
          { post_urn: `urn:li:share:${unico()}`, publicada_el: "2026-03-10", interacciones: 1, impresiones: 10 },
        ],
        dias: [{ dia: "2026-03-10", impresiones: 10, interacciones: 1, seguidores_nuevos: 0 }],
        publico: [{ tipo: "publico", categoria: "Cargo", valor: "Gerente", porcentaje: 3, menor_a_uno: false }],
      }),
    )
    const r = await rendimientoDeCuenta(ajeno.db, cuenta)
    expect(r).toMatchObject({
      publicaciones: [],
      meses: [],
      publico: [],
      ultimaImportacion: null,
      seguidoresTotal: null,
    })
  })
})
